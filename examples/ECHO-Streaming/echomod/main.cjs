'use strict';

/*
 * Main-process download bridge for the ECHO Streaming mod.
 *
 * The renderer picks a track + quality and hands them to this handler, which
 * re-resolves the playback source *inside the Electron main process* through
 * ShinawaseLoader's streaming bridge (`__shinawaseResolveStreamingPlayback`).
 * That resolution runs with the logged-in streaming account exactly like
 * playback does, and — unlike the renderer-facing IPC, which strips
 * Cookie/Authorization headers for safety — returns the full header set the
 * provider expects. The file is saved into the system Music folder under
 * `Stream/` (or `Stream/<playlist name>/` for playlist downloads) and then
 * tagged (ID3v2.3 for mp3, Vorbis comments + PICTURE for flac) with the
 * track metadata and cover art supplied by the renderer.
 */

const { createWriteStream, existsSync, readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { mkdir, rename, rm } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { homedir } = require('node:os');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { writeAudioTags } = require('./tags.cjs');

const defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const maxCoverBytes = 12 * 1024 * 1024;

const sanitizePathPart = (value, fallback) => {
  const cleaned = String(value ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/u, '');
  return cleaned || fallback;
};

const sanitizeExtension = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/^\./u, '');
  return /^[a-z0-9]{2,5}$/u.test(normalized) ? normalized : null;
};

const extensionFromMimeType = (mimeType) => {
  switch (String(mimeType || '').split(';')[0].trim().toLowerCase()) {
    case 'audio/flac':
    case 'audio/x-flac': return 'flac';
    case 'audio/mp4':
    case 'audio/x-m4a': return 'm4a';
    case 'audio/aac': return 'aac';
    case 'audio/ogg': return 'ogg';
    case 'audio/opus': return 'opus';
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav': return 'wav';
    case 'audio/mpeg':
    case 'audio/mp3': return 'mp3';
    default: return null;
  }
};

const extensionFromUrl = (url) => {
  try { return sanitizeExtension(new URL(url).pathname.split('/').pop()?.split('.').pop()); } catch { return null; }
};

const uniquePath = (directory, baseName, extension) => {
  let candidate = join(directory, `${baseName}.${extension}`);
  for (let suffix = 2; existsSync(candidate); suffix += 1) candidate = join(directory, `${baseName} (${suffix}).${extension}`);
  return candidate;
};

const hasHeader = (headers, name) => Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());

// Same provider defaults ECHO's own download service applies for direct audio.
const applyProviderHeaders = (headers, sourceUrl, webpageUrl) => {
  if (!hasHeader(headers, 'User-Agent')) headers['User-Agent'] = defaultUserAgent;
  const url = `${webpageUrl || ''} ${sourceUrl}`.toLowerCase();
  const referer = url.includes('music.163.com') || url.includes('music.126.net') ? 'https://music.163.com/'
    : url.includes('y.qq.com') || url.includes('qqmusic.qq.com') || url.includes('gtimg.cn') ? 'https://y.qq.com/'
    : url.includes('kugou.com') || url.includes('kugoucdn.com') || url.includes('kgimg.com') ? 'https://www.kugou.com/'
    : url.includes('soundcloud.com') || url.includes('sndcdn.com') || url.includes('soundcloud.cloud') ? 'https://soundcloud.com/'
    : url.includes('bilibili.com') || url.includes('bilivideo.') || url.includes('hdslb.com') ? 'https://www.bilibili.com/'
    : null;
  if (!referer) return headers;
  if (!hasHeader(headers, 'Referer')) headers.Referer = referer;
  if (!hasHeader(headers, 'Origin') && !referer.includes('soundcloud')) headers.Origin = referer.replace(/\/$/u, '');
  return headers;
};

const cleanHeaders = (value) => {
  const headers = {};
  if (value && typeof value === 'object') {
    for (const [name, headerValue] of Object.entries(value)) {
      if (typeof headerValue === 'string' && headerValue && !/[\r\n]/u.test(name) && !/[\r\n]/u.test(headerValue)) headers[name] = headerValue;
    }
  }
  return headers;
};

const headersCarryCredentials = (headers) => Object.keys(headers).some((name) => /^(cookie|authorization)$/iu.test(name));

/*
 * Account session access.
 *
 * The logged-in streaming session is looked up in order:
 *
 * 1. `globalThis.__shinawaseStreamingAccountCookie` — ShinawaseLoader's
 *    streaming bridge exposes ECHO's AccountService getter for main-process
 *    mods. Only present when the loader injected `streaming-bridge.cjs`
 *    (the CDP / --inspect launch path) on a bridge build that ships the
 *    getter.
 * 2. ECHO's own account store: `userData/accounts.json` (with `.bak`
 *    fallback) — the exact file ECHO's AccountService writes on every login
 *    (cookie paste, login window, and NetEase QR login all end in
 *    `saveCookie`). The per-provider cookie is persisted as
 *    `encryptedCookie`, either `safe:<base64>` (Electron safeStorage,
 *    decryptable from this same main process) or `plain:<base64>` when OS
 *    encryption is unavailable; legacy files stored the raw cookie. Reading
 *    it directly works in every launch mode — including the asar-bridge
 *    mode, where only native-host.cjs runs and no bridge globals exist — so
 *    a user who shows as logged-in in ECHO's account UI is always
 *    recognized here. This was the root cause of the false
 *    "请先登录网易云" prompt: without the bridge globals the mod had no way
 *    to see the session before the first playback resolve.
 * 3. A cookie captured from an earlier `resolveAuthenticatedSource` result
 *    (playback resolutions carry the account cookie in their headers).
 *
 * Every lookup outcome change is logged so the loader log shows whether a
 * failure came from a missing session or from the provider rejecting an
 * existing one.
 */
const capturedProviderCookies = {};
let electronRuntime = null;
let logHost = null;

const logMod = (level, message) => { try { logHost?.log?.(level, message); } catch {} };

const getElectron = () => {
  if (!electronRuntime) {
    try { electronRuntime = require('electron'); } catch {}
  }
  return electronRuntime;
};

// Mirrors AccountService.isCookieHeaderValueSafe: printable latin-1 + tab.
const cookieHeaderSafe = (value) => /^[\t\u0020-\u007e\u0080-\u00ff]+$/u.test(value);

// Opens one stored account secret exactly like ECHO's AccountSecretStore:
// 'safe:' envelopes are Electron safeStorage ciphertext, 'plain:' envelopes
// are tagged base64 (used when OS encryption is unavailable), and legacy
// records stored the raw cookie directly.
const decryptAccountSecret = (stored) => {
  if (typeof stored !== 'string' || !stored) return { value: null, reason: 'empty_record' };
  if (stored.startsWith('safe:')) {
    try {
      const safeStorage = getElectron()?.safeStorage;
      const decrypted = safeStorage?.decryptString?.(Buffer.from(stored.slice(5), 'base64'));
      return decrypted ? { value: decrypted, reason: null } : { value: null, reason: 'safe_storage_unavailable' };
    } catch (error) {
      return { value: null, reason: `safe_storage_decrypt_failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  if (stored.startsWith('plain:')) {
    try { return { value: Buffer.from(stored.slice(6), 'base64').toString('utf8') || null, reason: null }; } catch { return { value: null, reason: 'plain_decode_failed' }; }
  }
  return { value: stored, reason: null };
};

// Reads the provider login cookie straight from ECHO's account store.
const readAccountsFileCookie = (provider) => {
  let directory = null;
  try { directory = getElectron()?.app?.getPath?.('userData') || null; } catch {}
  if (!directory) return { cookie: null, detail: 'userData_unavailable' };
  const reasons = [];
  for (const name of ['accounts.json', 'accounts.json.bak']) {
    const file = join(directory, name);
    let parsed;
    try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch {
      reasons.push(`${name} ${existsSync(file) ? 'unreadable' : 'missing'}`);
      continue;
    }
    const record = parsed && typeof parsed === 'object' ? parsed[provider] : null;
    const stored = record && typeof record === 'object' ? (record.encryptedCookie ?? record.cookie) : null;
    if (!stored) { reasons.push(`${name} has no ${provider} cookie record`); continue; }
    const { value, reason } = decryptAccountSecret(stored);
    const cookie = typeof value === 'string' ? value.trim() : '';
    if (!cookie) { reasons.push(`${name} ${reason || 'decrypt_failed'}`); continue; }
    if (!cookieHeaderSafe(cookie)) { reasons.push(`${name} cookie_not_header_safe`); continue; }
    return { cookie, detail: name };
  }
  return { cookie: null, detail: reasons.join('; ') || 'not_found' };
};

const lastSessionLog = {};
const rememberSession = (provider, cookie, source, detail) => {
  const summary = `${source}:${cookie ? 'ok' : detail || 'none'}`;
  if (lastSessionLog[provider] !== summary) {
    lastSessionLog[provider] = summary;
    logMod(cookie ? 'INFO' : 'WARN', `${provider} account cookie lookup: source=${source}${detail ? ` (${detail})` : ''}${cookie ? '' : ' — no login session found'}`);
  }
  return { cookie, source, detail };
};

const streamingAccountSession = (provider) => {
  const getter = globalThis.__shinawaseStreamingAccountCookie;
  try {
    if (typeof getter === 'function') {
      const cookie = getter(provider);
      if (typeof cookie === 'string' && cookie.trim()) return rememberSession(provider, cookie.trim(), 'bridge-getter', null);
    }
  } catch {}
  const fromFile = readAccountsFileCookie(provider);
  if (fromFile.cookie) return rememberSession(provider, fromFile.cookie, 'accounts-file', fromFile.detail);
  const captured = capturedProviderCookies[provider];
  if (typeof captured === 'string' && captured) return rememberSession(provider, captured, 'captured-playback', null);
  const bridgeState = typeof getter === 'function' ? 'bridge getter returned nothing' : 'bridge getter not installed';
  return rememberSession(provider, null, 'none', `${bridgeState}; ${fromFile.detail}`);
};

const streamingAccountCookie = (provider) => streamingAccountSession(provider).cookie;

const captureProviderCookie = (provider, headers) => {
  if (provider !== 'netease' && provider !== 'qqmusic') return;
  for (const [name, value] of Object.entries(headers)) {
    if (/^cookie$/iu.test(name) && typeof value === 'string' && value.trim()) {
      capturedProviderCookies[provider] = value.trim();
      return;
    }
  }
};

/*
 * Resolve the playback source inside the main process. ECHO's renderer IPC
 * (`streaming:resolvePlayback`) deliberately strips Cookie / Authorization /
 * token headers before results reach page scripts, so a download started from
 * renderer-provided headers runs as an anonymous session. The loader's bridge
 * exposes the unsanitized resolver on globalThis for main-process consumers;
 * resolving here returns the same authenticated source playback itself uses
 * (NetEase account cookie in `headers`, QQ vkey URLs minted for the logged-in
 * uin, and — when the account is connected — the signed
 * `downloadAuthorizationToken` that ECHO's own download service requires).
 */
const resolveAuthenticatedSource = async (body) => {
  const resolvePlayback = globalThis.__shinawaseResolveStreamingPlayback;
  const provider = String(body.provider || '').trim();
  const providerTrackId = String(body.providerTrackId || '').trim();
  if (typeof resolvePlayback !== 'function' || !provider || !providerTrackId) return null;
  try {
    const quality = ['standard', 'high', 'lossless', 'hires'].includes(body.quality) ? body.quality : undefined;
    const source = await resolvePlayback({ provider, providerTrackId, quality });
    const url = String(source?.url || '');
    if (!/^https?:\/\//iu.test(url)) return null;
    const headers = cleanHeaders(source.headers);
    captureProviderCookie(provider, headers);
    return {
      url,
      headers,
      mimeType: typeof source.mimeType === 'string' ? source.mimeType : null,
      codec: typeof source.codec === 'string' ? source.codec : null,
      bitrate: Number(source.bitrate) > 0 ? Number(source.bitrate) : null,
      authenticated: headersCarryCredentials(headers) || typeof source.downloadAuthorizationToken === 'string',
    };
  } catch {
    return null;
  }
};

/*
 * Provider quality probing.
 *
 * ECHO's `StreamingTrack.qualities` arrays are hard-coded guesses: NetEase
 * maps the `fee` flag to 2-3 buckets (never `hires`, and VIP tracks lose
 * `lossless` even for VIP accounts), QQ Music reports a fixed 1-or-3 bucket
 * list, and none of them carry bitrates or file sizes. The real per-file
 * descriptors are public metadata, so this section asks the providers
 * directly:
 *   - NetEase `POST /api/v3/song/detail` (batched, up to 100 ids per call)
 *     returns `l`/`m`/`h`/`sq`/`hr` objects with the true bitrate + size of
 *     each encoded file (128/192/320 MP3, FLAC, Hi-Res FLAC).
 *   - QQ Music `fcg_play_single_song.fcg` (the same endpoint ECHO's own
 *     resolvePlayback uses) returns `file.size_128mp3/size_320mp3/size_flac`.
 *     QQ playback mints F000 (standard FLAC) for both lossless and hires, so
 *     the probe tops out at `lossless` — advertising `hires` would deliver
 *     the identical file.
 *   - KuGou track ids already embed the HQ (320) and SQ (FLAC) file hashes
 *     (`hash.albumId.albumAudioId.hqHash.sqHash`), so those are decoded
 *     locally with no network call. Ids without the hash parts return
 *     nothing so the renderer can re-fetch instead of under-reporting.
 * A tier is only reported when the provider confirms the file exists; the
 * account-tier fallback still happens inside `resolvePlayback` at download
 * time exactly as before.
 */
const probeParseJson = (raw) => {
  const trimmed = String(raw ?? '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Some QQ endpoints wrap JSON in a jsonp callback even with format=json.
    return JSON.parse(trimmed.replace(/^[^(]*\((.*)\);?$/su, '$1'));
  }
};

const probeFetchJson = async (url, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`probe_http_${response.status}`);
    return probeParseJson(await response.text());
  } finally {
    clearTimeout(timer);
  }
};

const chunkList = (list, size) => {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size));
  return chunks;
};

const neteaseTier = (value) => {
  if (!value || typeof value !== 'object') return null;
  const bitrate = Number(value.br) > 0 ? Number(value.br) : null;
  const size = Number(value.size) > 0 ? Number(value.size) : null;
  return bitrate || size ? { bitrate, size } : null;
};

// The standard NetEase web-API header set, with the logged-in account cookie
// attached when one is available (bridge getter or captured from playback).
const neteaseApiHeaders = (cookie = streamingAccountCookie('netease')) => ({
  'User-Agent': defaultUserAgent,
  Referer: 'https://music.163.com/',
  Origin: 'https://music.163.com',
  ...(cookie ? { Cookie: cookie } : {}),
});

// Batched `POST /api/v3/song/detail` (up to 100 ids per call), sent through
// the authenticated session so VIP tracks report their true file maps and
// private-playlist songs resolve at all. Returns a Map keyed by song id;
// failed chunks are skipped so one bad batch cannot sink a whole 歌单.
const fetchNeteaseSongDetails = async (ids) => {
  const songsById = new Map();
  for (const chunk of chunkList(ids, 100)) {
    let data;
    try {
      data = await probeFetchJson('https://music.163.com/api/v3/song/detail', {
        method: 'POST',
        headers: { ...neteaseApiHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          c: JSON.stringify(chunk.map((id) => ({ id: /^\d+$/u.test(id) ? Number(id) : id }))),
        }).toString(),
      });
    } catch {
      continue;
    }
    for (const song of Array.isArray(data?.songs) ? data.songs : []) {
      const id = song && song.id != null ? String(song.id) : '';
      if (id && !songsById.has(id)) songsById.set(id, song);
    }
  }
  return songsById;
};

const neteaseQualityTiers = (song) => {
  const tiers = [];
  const hires = neteaseTier(song.hr);
  const losslessTier = neteaseTier(song.sq);
  // `h` = 320kbps, `m` = 192kbps, `l` = 128kbps; the `high` request tries
  // exhigh(320) then higher(192), so `m` backs the high bucket when the
  // 320 encode is missing.
  const high = neteaseTier(song.h) || neteaseTier(song.m);
  const standard = neteaseTier(song.l) || neteaseTier(song.m);
  if (hires) tiers.push({ quality: 'hires', codec: 'flac', ...hires });
  if (losslessTier) tiers.push({ quality: 'lossless', codec: 'flac', ...losslessTier });
  if (high) tiers.push({ quality: 'high', codec: 'mp3', ...high });
  if (standard) tiers.push({ quality: 'standard', codec: 'mp3', ...standard });
  return tiers;
};

const probeNeteaseQualities = async (ids) => {
  const results = {};
  for (const [id, song] of await fetchNeteaseSongDetails(ids)) {
    const tiers = neteaseQualityTiers(song);
    if (tiers.length) results[id] = { qualities: tiers };
  }
  return results;
};

// Plain https NetEase artwork URL with the CDN resize suffix; unlike ECHO's
// own `echo-image://` proxy wrapper these fetch fine from the main process.
const neteaseImageUrl = (value, size) => {
  const raw = String(value ?? '').trim();
  if (!/^https?:\/\//iu.test(raw)) return null;
  const url = raw.replace(/^http:\/\//iu, 'https://');
  return `${url}${url.includes('?') ? '&' : '?'}param=${size}y${size}`;
};

const mapNeteasePlaylistSong = (song) => {
  if (!song || typeof song !== 'object') return null;
  const id = song.id != null ? String(song.id) : '';
  if (!id) return null;
  const album = (song.al && typeof song.al === 'object' ? song.al : song.album) || {};
  const artists = Array.isArray(song.ar) ? song.ar : Array.isArray(song.artists) ? song.artists : [];
  const artist = artists.map((item) => String(item?.name || '').trim()).filter(Boolean).join(' / ');
  const durationMs = Number(song.dt ?? song.duration) || 0;
  const cover = album.picUrl ?? album.blurPicUrl ?? null;
  return {
    providerTrackId: id,
    title: String(song.name || '').trim() || `NetEase ${id}`,
    artist,
    album: String(album.name || '').trim(),
    albumArtist: artist,
    duration: durationMs > 0 ? durationMs / 1000 : 0,
    coverUrl: neteaseImageUrl(cover, 800),
    coverThumb: neteaseImageUrl(cover, 300),
    qualities: neteaseQualityTiers(song),
  };
};

/*
 * Authenticated NetEase 歌单 enumeration.
 *
 * The renderer used to import a playlist through ECHO's public
 * `importPlaylistFromUrl` and read the items back from the library — an
 * anonymous flow that returns nothing for 私密歌单 (private playlists are
 * invisible without the owner's session, so the import "scans" zero songs).
 * This lists tracks the way ECHO's own NeteaseStreamingProvider.getPlaylist
 * does: `GET /api/v6/playlist/detail` with the account cookie for the full
 * `trackIds` list, then batched `v3/song/detail` (also with the cookie) for
 * titles, artists, durations, artwork and real per-file quality tiers.
 */
const listNeteasePlaylistTracks = async (playlistId) => {
  const session = streamingAccountSession('netease');
  const cookie = session.cookie;
  const params = new URLSearchParams({ id: playlistId, n: '100000' });
  const data = await probeFetchJson(`https://music.163.com/api/v6/playlist/detail?${params.toString()}`, {
    headers: neteaseApiHeaders(cookie),
  });
  const playlist = data && typeof data === 'object' && data.playlist && typeof data.playlist === 'object'
    ? data.playlist
    : data && typeof data === 'object' && data.result && typeof data.result === 'object' ? data.result : null;
  const code = Number(data?.code);
  if (!playlist) {
    const apiDetail = `code=${Number.isFinite(code) ? code : 'none'}, message=${String(data?.message || data?.msg || 'none')}`;
    if (!cookie) {
      // Anonymous sessions cannot see private playlists at all: NetEase
      // answers with a non-200 code and no playlist object. Tell the
      // renderer to ask for a login instead of pretending the 歌单 is empty.
      logMod('WARN', `netease playlist ${playlistId}: no account cookie (${session.detail || 'no session'}); API said ${apiDetail}`);
      throw new Error('netease_login_required');
    }
    if (code === 301) {
      // 301 is NetEase's "需要登录": the stored cookie no longer
      // authenticates (expired or revoked) even though ECHO still shows the
      // account as connected. Distinct error so the renderer can say
      // "re-login" instead of "login".
      logMod('WARN', `netease playlist ${playlistId}: cookie from ${session.source} was rejected by NetEase (${apiDetail}) — session expired`);
      throw new Error('netease_session_expired');
    }
    // Any other rejection (missing playlist, region block, rate limit, …)
    // is NOT a login problem; surface the provider's own answer.
    logMod('WARN', `netease playlist ${playlistId}: no playlist in response (${apiDetail}) despite cookie from ${session.source}`);
    throw new Error(String(data?.message || data?.msg || `netease_playlist_${Number.isFinite(code) ? code : 'unavailable'}`));
  }
  const trackIds = (Array.isArray(playlist.trackIds) ? playlist.trackIds : [])
    .map((item) => (item && typeof item === 'object' ? item.id : item))
    .map((id) => (id == null ? '' : String(id).trim()))
    .filter((id) => /^\d+$/u.test(id));
  const embedded = Array.isArray(playlist.tracks) ? playlist.tracks : [];
  let tracks = [];
  if (trackIds.length) {
    const songs = await fetchNeteaseSongDetails(trackIds);
    tracks = trackIds.map((id) => mapNeteasePlaylistSong(songs.get(id))).filter(Boolean);
  }
  if (!tracks.length && embedded.length) tracks = embedded.map(mapNeteasePlaylistSong).filter(Boolean);
  return {
    id: playlistId,
    name: String(playlist.name || '').trim() || null,
    trackCount: Number(playlist.trackCount) > 0 ? Number(playlist.trackCount) : tracks.length,
    privacy: Number(playlist.privacy) || 0,
    authenticated: Boolean(cookie),
    tracks,
  };
};

let ncmApiCached = undefined;

const loadNcmApi = () => {
  if (ncmApiCached !== undefined) return ncmApiCached;
  const roots = [
    process.env.ECHO_MOD_HOME,
    join(__dirname, '..', '..', '..', 'ShinawaseLoader'),
    join(__dirname, '..', '..'),
  ].filter(Boolean);
  for (const root of roots) {
    const packageJson = join(root, 'package.json');
    try {
      ncmApiCached = createRequire(existsSync(packageJson) ? packageJson : join(root, 'index.js'))('@neteasecloudmusicapienhanced/api');
      return ncmApiCached;
    } catch {}
    try {
      ncmApiCached = require(join(root, 'node_modules', '@neteasecloudmusicapienhanced', 'api'));
      return ncmApiCached;
    } catch {}
  }
  try {
    ncmApiCached = require('@neteasecloudmusicapienhanced/api');
    return ncmApiCached;
  } catch {
    ncmApiCached = null;
    return null;
  }
};

const ncmInvoke = async (name, params) => {
  const ncm = loadNcmApi();
  if (!ncm || typeof ncm[name] !== 'function') return null;
  try {
    const response = await ncm[name](params);
    return response && typeof response === 'object' && 'body' in response ? response.body : response;
  } catch (error) {
    logMod('WARN', `ncm ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const neteaseRecord = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const neteaseIdText = (value) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(Math.trunc(value));
  const text = String(value ?? '').trim();
  return /^\d+$/u.test(text) && text !== '0' ? text : null;
};

const dailySongsFromBody = (value) => {
  const body = neteaseRecord(value);
  const data = neteaseRecord(body.data);
  if (Array.isArray(data.dailySongs)) return data.dailySongs;
  if (Array.isArray(body.recommend)) return body.recommend;
  if (Array.isArray(data.songs)) return data.songs;
  if (Array.isArray(body.songs)) return body.songs;
  return [];
};

const resolveNeteaseUserId = async (cookie) => {
  const fromBody = (value) => {
    const body = neteaseRecord(value);
    const data = neteaseRecord(body.data);
    const account = neteaseRecord(body.account ?? data.account);
    const profile = neteaseRecord(body.profile ?? data.profile);
    return neteaseIdText(profile.userId)
      || neteaseIdText(profile.userid)
      || neteaseIdText(account.id)
      || neteaseIdText(account.userId)
      || neteaseIdText(data.userId)
      || neteaseIdText(body.userId);
  };
  for (const name of ['login_status', 'user_account']) {
    const userId = fromBody(await ncmInvoke(name, { cookie }));
    if (userId) return userId;
  }
  for (const url of ['https://music.163.com/api/w/nuser/account/get', 'https://music.163.com/api/nuser/account/get']) {
    try {
      const userId = fromBody(await probeFetchJson(url, { headers: neteaseApiHeaders(cookie) }));
      if (userId) return userId;
    } catch {}
  }
  return null;
};

const mapDailyPlaylistCard = (item, kind, extras = {}) => {
  const record = neteaseRecord(item);
  const id = String(extras.providerPlaylistId || record.id || record.providerPlaylistId || '').trim();
  if (!id) return null;
  const creator = record.creator && typeof record.creator === 'object' ? record.creator : {};
  const cover = record.picUrl || record.coverImgUrl || record.coverUrl || extras.coverUrl || null;
  const numeric = /^\d+$/u.test(id);
  return {
    key: extras.key || `${kind}:${id}`,
    kind,
    provider: 'netease',
    providerPlaylistId: id,
    title: String(extras.title || record.name || record.title || '').trim() || id,
    description: String(extras.description || record.copywriter || record.description || '').trim() || null,
    creator: String(extras.creator || creator.nickname || record.nickname || '网易云音乐').trim(),
    coverUrl: neteaseImageUrl(cover, 800),
    coverThumb: neteaseImageUrl(cover, 300),
    trackCount: Number(extras.trackCount ?? record.trackCount ?? record.playcount ?? record.playCount) || null,
    webUrl: extras.webUrl !== undefined ? extras.webUrl : (numeric ? `https://music.163.com/#/playlist?id=${id}` : null),
    syncMode: extras.syncMode || (numeric ? 'url' : kind === 'songs' ? 'official-daily' : 'tracks'),
    dailyId: extras.dailyId || null,
  };
};

const isDailySongsCard = (item) => {
  const record = neteaseRecord(item);
  const id = String(record.id ?? '');
  const name = String(record.name || record.title || '');
  const type = Number(record.type);
  return id === '0' || type === 0 || /每日歌曲推荐|每日推荐歌曲/u.test(name);
};

const collectHomepagePlaylists = (node, found) => {
  if (!node) return found;
  if (Array.isArray(node)) {
    for (const item of node) collectHomepagePlaylists(item, found);
    return found;
  }
  if (typeof node !== 'object') return found;
  const record = node;
  const blockCode = String(record.blockCode || record.block_code || '');
  const skipBlock = blockCode && !/PLAYLIST|RCMD|RADAR|OFFICIAL|STYLE/iu.test(blockCode);
  if (skipBlock) {
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') collectHomepagePlaylists(value, found);
    }
    return found;
  }
  const resourceType = String(record.resourceType || record.resource_type || record.actionType || '');
  const action = String(record.action || record.targetUrl || record.url || '');
  const ui = neteaseRecord(record.uiElement || record.ui_element);
  const mainTitle = neteaseRecord(ui.mainTitle || ui.main_title);
  const image = neteaseRecord(ui.image);
  const id = neteaseIdText(record.resourceId || record.resource_id || record.creativeId || record.id);
  const looksPlaylist = /playlist/iu.test(resourceType)
    || /playlist/iu.test(action)
    || /orpheus:\/\/playlist/iu.test(action)
    || record.resourceType === 'list';
  if (looksPlaylist && id && !found.has(id)) {
    found.set(id, {
      id,
      name: String(mainTitle.title || record.title || record.name || '').trim() || id,
      copywriter: String(ui.subTitle?.title || record.copywriter || '').trim() || null,
      picUrl: image.imageUrl || record.picUrl || record.coverUrl || null,
      trackCount: Number(record.playCount || record.trackCount) || null,
    });
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') collectHomepagePlaylists(value, found);
  }
  return found;
};

const fetchNeteaseDailySongs = async (cookie, afresh = false) => {
  let body = await ncmInvoke('recommend_songs', { cookie, afresh: afresh ? true : undefined });
  if (!body) {
    try {
      body = await probeFetchJson('https://music.163.com/api/v3/discovery/recommend/songs', {
        method: 'POST',
        headers: { ...neteaseApiHeaders(cookie), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(afresh ? { afresh: 'true' } : {}).toString(),
      });
    } catch {
      try {
        body = await probeFetchJson('https://music.163.com/api/v3/discovery/recommend/songs', {
          headers: neteaseApiHeaders(cookie),
        });
      } catch {
        body = null;
      }
    }
  }
  return dailySongsFromBody(body);
};

const fetchNeteaseRecommendResources = async (cookie) => {
  let body = await ncmInvoke('recommend_resource', { cookie });
  if (!body) {
    try {
      body = await probeFetchJson('https://music.163.com/api/v1/discovery/recommend/resource', {
        headers: neteaseApiHeaders(cookie),
      });
    } catch {
      body = null;
    }
  }
  const record = neteaseRecord(body);
  const recommend = Array.isArray(record.recommend) ? record.recommend
    : Array.isArray(neteaseRecord(record.data).recommend) ? neteaseRecord(record.data).recommend
    : [];
  return recommend.filter((item) => item && !isDailySongsCard(item));
};

const fetchNeteasePersonalizedPlaylists = async (cookie) => {
  let body = await ncmInvoke('personalized', { cookie, limit: 30 });
  if (!body) {
    try {
      body = await probeFetchJson('https://music.163.com/api/personalized/playlist?limit=30', {
        headers: neteaseApiHeaders(cookie),
      });
    } catch {
      body = null;
    }
  }
  const record = neteaseRecord(body);
  return Array.isArray(record.result) ? record.result
    : Array.isArray(neteaseRecord(record.data).result) ? neteaseRecord(record.data).result
    : [];
};

const fetchNeteaseHomepagePlaylists = async (cookie, refresh = false) => {
  const body = await ncmInvoke('homepage_block_page', { cookie, refresh: refresh ? true : false });
  const found = new Map();
  collectHomepagePlaylists(body, found);
  return [...found.values()];
};

const fetchNeteaseRadarPlaylists = async (cookie) => {
  const userId = await resolveNeteaseUserId(cookie);
  const names = [];
  if (userId) {
    let body = await ncmInvoke('user_playlist', { cookie, uid: userId, limit: 1000, offset: 0 });
    if (!body) {
      try {
        const params = new URLSearchParams({ uid: userId, limit: '1000', offset: '0', includeVideo: 'true' });
        body = await probeFetchJson(`https://music.163.com/api/user/playlist?${params.toString()}`, {
          headers: neteaseApiHeaders(cookie),
        });
      } catch {
        body = null;
      }
    }
    const record = neteaseRecord(body);
    const lists = Array.isArray(record.playlist) ? record.playlist
      : Array.isArray(neteaseRecord(record.data).playlist) ? neteaseRecord(record.data).playlist
      : [];
    for (const item of lists) {
      const name = String(item?.name || '');
      if (/雷达/u.test(name)) names.push(item);
    }
  }
  return names;
};

const fetchNeteaseHistoryDates = async (cookie) => {
  let body = await ncmInvoke('history_recommend_songs', { cookie });
  if (!body) {
    try {
      body = await probeFetchJson('https://music.163.com/api/discovery/recommend/songs/history/recent', {
        headers: neteaseApiHeaders(cookie),
      });
    } catch {
      body = null;
    }
  }
  const data = neteaseRecord(neteaseRecord(body).data);
  const dates = Array.isArray(data.dates) ? data.dates
    : Array.isArray(neteaseRecord(body).dates) ? neteaseRecord(body).dates
    : [];
  return dates.map((item) => String(item || '').trim()).filter((item) => /^\d{4}-\d{2}-\d{2}$/u.test(item)).slice(0, 14);
};

const fetchNeteaseHistorySongs = async (cookie, date) => {
  let body = await ncmInvoke('history_recommend_songs_detail', { cookie, date });
  if (!body) {
    try {
      const params = new URLSearchParams({ date });
      body = await probeFetchJson(`https://music.163.com/api/discovery/recommend/songs/history/detail?${params.toString()}`, {
        headers: neteaseApiHeaders(cookie),
      });
    } catch {
      body = null;
    }
  }
  return dailySongsFromBody(body);
};

const fetchNeteaseNewSongs = async (cookie) => {
  let body = await ncmInvoke('personalized_newsong', { cookie, limit: 20 });
  if (!body) {
    try {
      body = await probeFetchJson('https://music.163.com/api/personalized/newsong?limit=20', {
        headers: neteaseApiHeaders(cookie),
      });
    } catch {
      body = null;
    }
  }
  const record = neteaseRecord(body);
  const result = Array.isArray(record.result) ? record.result
    : Array.isArray(neteaseRecord(record.data).result) ? neteaseRecord(record.data).result
    : [];
  return result.map((item) => item?.song || item).filter(Boolean);
};

const listNeteaseDailyPlaylists = async (options = {}) => {
  const session = streamingAccountSession('netease');
  const cookie = session.cookie;
  if (!cookie) throw new Error('netease_login_required');
  const refresh = options.refresh === true;
  const playlists = [];
  const seen = new Set();
  const push = (item) => {
    if (!item || seen.has(item.key)) return;
    seen.add(item.key);
    playlists.push(item);
  };

  const [dailySongs, radarLists, homepage, resources, dates, newsongs, personalized] = await Promise.all([
    fetchNeteaseDailySongs(cookie, refresh).catch((error) => {
      logMod('WARN', `daily songs: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }),
    fetchNeteaseRadarPlaylists(cookie).catch(() => []),
    fetchNeteaseHomepagePlaylists(cookie, refresh).catch(() => []),
    fetchNeteaseRecommendResources(cookie).catch(() => []),
    fetchNeteaseHistoryDates(cookie).catch(() => []),
    fetchNeteaseNewSongs(cookie).catch(() => []),
    fetchNeteasePersonalizedPlaylists(cookie).catch(() => []),
  ]);
  const dailyMapped = dailySongs.map(mapNeteasePlaylistSong).filter(Boolean);
  push(mapDailyPlaylistCard({
    name: '每日推荐',
    copywriter: '根据网易云音乐账号生成，每天 6:00 更新。',
    picUrl: dailyMapped[0]?.coverUrl,
  }, 'songs', {
    key: 'songs:daily-recommend',
    providerPlaylistId: 'daily-recommend',
    title: '每日推荐',
    description: '根据网易云音乐账号生成，每天 6:00 更新。',
    trackCount: dailyMapped.length,
    webUrl: null,
    syncMode: 'official-daily',
    coverUrl: dailyMapped[0]?.coverUrl,
  }));

  for (const item of radarLists) push(mapDailyPlaylistCard(item, 'radar'));

  for (const item of homepage) {
    const title = String(item.name || '');
    push(mapDailyPlaylistCard(item, /雷达/u.test(title) ? 'radar' : 'resource'));
  }

  for (const item of resources) {
    const id = neteaseIdText(item?.id);
    if (!id) continue;
    push(mapDailyPlaylistCard(item, 'resource'));
  }

  for (const date of dates) {
    push(mapDailyPlaylistCard({
      name: `历史日推 ${date}`,
      copywriter: '网易云历史每日推荐歌曲',
    }, 'history', {
      key: `history:${date}`,
      providerPlaylistId: `daily-history-${date}`,
      title: `历史日推 ${date}`,
      description: '网易云历史每日推荐歌曲',
      webUrl: null,
      syncMode: 'tracks',
      dailyId: date,
    }));
  }

  const newsongMapped = newsongs.map(mapNeteasePlaylistSong).filter(Boolean);
  if (newsongMapped.length) {
    push(mapDailyPlaylistCard({
      name: '新歌推荐',
      copywriter: '网易云个性化新歌',
      picUrl: newsongMapped[0]?.coverUrl,
    }, 'newsong', {
      key: 'newsong:daily',
      providerPlaylistId: 'daily-newsong',
      title: '新歌推荐',
      description: '网易云个性化新歌',
      trackCount: newsongMapped.length,
      webUrl: null,
      syncMode: 'tracks',
      coverUrl: newsongMapped[0]?.coverUrl,
    }));
  }

  for (const item of personalized.slice(0, 16)) {
    const id = neteaseIdText(item?.id);
    if (!id) continue;
    push(mapDailyPlaylistCard(item, 'personalized'));
  }

  logMod('INFO', `netease daily playlists: ${playlists.length} (songs=${dailyMapped.length}, radar=${playlists.filter((item) => item.kind === 'radar').length}, resource=${playlists.filter((item) => item.kind === 'resource').length})`);
  return {
    playlists,
    fetchedAt: new Date().toISOString(),
    authenticated: true,
  };
};

const listNeteaseDailyPlaylistTracks = async (payload) => {
  const session = streamingAccountSession('netease');
  const cookie = session.cookie;
  if (!cookie) throw new Error('netease_login_required');
  const kind = String(payload?.kind || '').trim();
  const id = String(payload?.id || payload?.dailyId || payload?.providerPlaylistId || '').trim();
  const afresh = payload?.refresh === true;
  if (kind === 'songs' || id === 'daily-recommend') {
    const songs = await fetchNeteaseDailySongs(cookie, afresh);
    const tracks = songs.map(mapNeteasePlaylistSong).filter(Boolean);
    if (!tracks.length) throw new Error('netease_daily_empty');
    return { id: 'daily-recommend', name: '每日推荐', kind: 'songs', trackCount: tracks.length, tracks };
  }
  if (kind === 'history' || id.startsWith('daily-history-')) {
    const date = String(payload?.dailyId || id.replace(/^daily-history-/u, '')).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error('invalid_history_date');
    const songs = await fetchNeteaseHistorySongs(cookie, date);
    const tracks = songs.map(mapNeteasePlaylistSong).filter(Boolean);
    if (!tracks.length) throw new Error('netease_daily_empty');
    return { id: `daily-history-${date}`, name: `历史日推 ${date}`, kind: 'history', trackCount: tracks.length, tracks };
  }
  if (kind === 'newsong' || id === 'daily-newsong') {
    const songs = await fetchNeteaseNewSongs(cookie);
    const tracks = songs.map(mapNeteasePlaylistSong).filter(Boolean);
    if (!tracks.length) throw new Error('netease_daily_empty');
    return { id: 'daily-newsong', name: '新歌推荐', kind: 'newsong', trackCount: tracks.length, tracks };
  }
  if (/^\d+$/u.test(id)) return listNeteasePlaylistTracks(id);
  throw new Error('invalid_daily_playlist');
};

const qqSongWrapperKeys = ['songinfo', 'songInfo', 'track_info', 'trackinfo', 'trackInfo', 'data'];
const unwrapQqSong = (value) => {
  let record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  for (let index = 0; index < 5; index += 1) {
    const nested = qqSongWrapperKeys
      .map((key) => record[key])
      .find((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate) && Object.keys(candidate).length > 0);
    if (!nested) break;
    record = { ...record, ...nested };
  }
  return record;
};

const qqCookieValue = (cookie, ...names) => {
  if (!cookie) return null;
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`, 'iu'));
    if (!match) continue;
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }
  return null;
};

const qqUinFromCookie = (cookie) => {
  const value = qqCookieValue(cookie, 'uin', 'qqmusic_uin', 'p_uin', 'pt2gguin', 'loginUin', 'wxuin');
  const match = value?.match(/o?(\d+)/iu);
  return match?.[1] || '0';
};

const qqApiHeaders = (cookie = streamingAccountCookie('qqmusic')) => ({
  'User-Agent': defaultUserAgent,
  Referer: 'https://y.qq.com/',
  Origin: 'https://y.qq.com',
  ...(cookie ? { Cookie: cookie } : {}),
});

const qqAlbumCoverUrl = (albumMid, size) => (
  albumMid ? `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${albumMid}.jpg` : null
);

const qqTiersFromFile = (file) => {
  const record = file && typeof file === 'object' ? file : {};
  const size = (key) => (Number(record[key]) > 0 ? Number(record[key]) : null);
  const tiers = [];
  const losslessSize = size('size_flac') ?? size('size_ape');
  if (losslessSize) tiers.push({ quality: 'lossless', codec: 'flac', bitrate: null, size: losslessSize });
  const highSize = size('size_320mp3');
  if (highSize) tiers.push({ quality: 'high', codec: 'mp3', bitrate: 320000, size: highSize });
  const standardSize = size('size_128mp3');
  if (standardSize) {
    tiers.push({ quality: 'standard', codec: 'mp3', bitrate: 128000, size: standardSize });
  } else {
    const aacSize = size('size_96aac') ?? size('size_48aac');
    if (aacSize) tiers.push({ quality: 'standard', codec: 'aac', bitrate: null, size: aacSize });
  }
  return tiers;
};

const firstQqText = (record, keys) => {
  if (!record || typeof record !== 'object') return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const mapQqPlaylistSong = (songValue) => {
  const song = unwrapQqSong(songValue);
  if (!Object.keys(song).length) return null;
  const album = song.album && typeof song.album === 'object' ? song.album : {};
  const file = song.file && typeof song.file === 'object' ? song.file : {};
  const singers = Array.isArray(song.singer) ? song.singer : Array.isArray(song.singers) ? song.singers : [];
  const artist = singers.map((item) => String(item?.name || item?.singerName || '').trim()).filter(Boolean).join(' / ')
    || firstQqText(song, ['singername', 'singerName', 'artist']);
  const mid = firstQqText(song, ['mid', 'songmid', 'songMid', 'songMID', 'song_mid', 'strMediaMid', 'mediaMid'])
    || firstQqText(file, ['media_mid', 'mediaMid', 'strMediaMid'])
    || firstQqText(song, ['id', 'songid', 'songId']);
  if (!mid) return null;
  const albumMid = firstQqText(album, ['mid', 'pmid', 'albumMID', 'albumMid'])
    || firstQqText(song, ['albummid', 'album_mid', 'albumMID']);
  const durationSec = Number(song.interval ?? song.duration) || 0;
  return {
    providerTrackId: mid,
    title: firstQqText(song, ['name', 'title', 'songname', 'songName']) || `QQ ${mid}`,
    artist,
    album: firstQqText(album, ['name', 'title', 'albumName', 'albumname'])
      || firstQqText(song, ['albumname', 'albumtitle']) || '',
    albumArtist: artist,
    duration: durationSec > 0 ? durationSec : 0,
    coverUrl: qqAlbumCoverUrl(albumMid, 800),
    coverThumb: qqAlbumCoverUrl(albumMid, 300),
    qualities: qqTiersFromFile(file),
  };
};

const qqPlaylistCdFromData = (data, playlistId) => {
  const legacy = Array.isArray(data?.cdlist) ? data.cdlist[0] : null;
  if (legacy && typeof legacy === 'object' && Object.keys(legacy).length) return legacy;
  const payload = data?.req_1 && typeof data.req_1 === 'object' && data.req_1.data && typeof data.req_1.data === 'object'
    ? data.req_1.data : null;
  if (!payload || typeof payload !== 'object') return null;
  const info = (payload.dirinfo && typeof payload.dirinfo === 'object' ? payload.dirinfo : null)
    || (payload.dirInfo && typeof payload.dirInfo === 'object' ? payload.dirInfo : null)
    || (payload.info && typeof payload.info === 'object' ? payload.info : payload);
  const songlist = Array.isArray(payload.songlist) ? payload.songlist
    : Array.isArray(payload.songList) ? payload.songList : [];
  return {
    ...info,
    disstid: info.disstid ?? info.dissid ?? playlistId,
    dissname: info.dissname ?? info.title ?? info.name,
    logo: info.logo ?? info.picurl ?? info.cover ?? info.coverUrl,
    songlist,
    total_song_num: Number(payload.total_song_num ?? payload.songnum ?? info.total_song_num ?? info.songnum) || songlist.length,
  };
};

const fetchQqPlaylistPage = async (playlistId, begin, pageSize) => {
  const cookie = streamingAccountCookie('qqmusic');
  const headers = qqApiHeaders(cookie);
  const params = new URLSearchParams({
    type: '1',
    json: '1',
    utf8: '1',
    onlysong: '0',
    disstid: playlistId,
    format: 'json',
    g_tk: '5381',
    loginUin: qqUinFromCookie(cookie),
    hostUin: '0',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: '0',
    platform: 'yqq',
    needNewCode: '0',
    song_begin: String(begin),
    song_num: String(pageSize),
  });
  const url = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?${params.toString()}`;
  let data;
  try {
    data = await probeFetchJson(url, { headers });
  } catch {
    data = null;
  }
  const invalidReferer = (value) => /invalid referer/iu.test(String(value?.message || value?.msg || ''));
  if (!data || invalidReferer(data)) {
    try {
      data = await probeFetchJson(url, { headers: { ...headers, Referer: 'https://c.y.qq.com/' } });
    } catch {
      data = null;
    }
  }
  if (!data || invalidReferer(data) || !qqPlaylistCdFromData(data, playlistId)) {
    data = await probeFetchJson('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comm: { ct: 24, cv: 0 },
        req_1: {
          module: 'music.srfDissInfo.aiDissInfo',
          method: 'uniform_get_Dissinfo',
          param: {
            disstid: /^\d+$/u.test(playlistId) ? Number(playlistId) : playlistId,
            dirid: 0,
            song_begin: begin,
            song_num: pageSize,
            onlysong: 0,
            enc_host_uin: '',
            tag: 1,
            userinfo: 1,
          },
        },
      }),
    });
  }
  return qqPlaylistCdFromData(data, playlistId);
};

/*
 * Authenticated QQ 歌单 enumeration.
 *
 * Same shape as the NetEase path: ECHO's public importPlaylistFromUrl is
 * anonymous and drops private / account-only lists. This mirrors
 * QQMusicStreamingProvider.getPlaylist — legacy qzone cdinfo first, then the
 * modern musicu Dissinfo call — both carrying the same cookie lookup as
 * playback (bridge getter -> accounts.json -> captured playback).
 */
const listQqPlaylistTracks = async (playlistId) => {
  const session = streamingAccountSession('qqmusic');
  const cookie = session.cookie;
  const pageSize = 100;
  const tracks = [];
  let name = null;
  let total = 0;
  for (let begin = 0, page = 0; page < 50; page += 1, begin += pageSize) {
    let cd;
    try {
      cd = await fetchQqPlaylistPage(playlistId, begin, pageSize);
    } catch {
      cd = null;
    }
    if (!cd) {
      if (!tracks.length && !cookie) {
        logMod('WARN', `qq playlist ${playlistId}: no account cookie (${session.detail || 'no session'})`);
        throw new Error('qq_login_required');
      }
      if (!tracks.length) throw new Error('qq_playlist_unavailable');
      break;
    }
    name = name || String(cd.dissname || '').trim() || null;
    const songlist = Array.isArray(cd.songlist) ? cd.songlist : [];
    total = Number(cd.total_song_num ?? cd.songnum) > 0 ? Number(cd.total_song_num ?? cd.songnum) : Math.max(total, tracks.length + songlist.length);
    for (const song of songlist) {
      const mapped = mapQqPlaylistSong(song);
      if (mapped) tracks.push(mapped);
    }
    if (!songlist.length || tracks.length >= total || songlist.length < pageSize) break;
  }
  if (!tracks.length) {
    if (!cookie) {
      logMod('WARN', `qq playlist ${playlistId}: empty list and no account cookie (${session.detail || 'no session'})`);
      throw new Error('qq_login_required');
    }
    throw new Error('qq_playlist_empty');
  }
  return {
    id: playlistId,
    name,
    trackCount: total || tracks.length,
    authenticated: Boolean(cookie),
    tracks,
  };
};

const probeQqTrack = async (providerTrackId) => {
  const variants = [
    { key: 'songmid', value: providerTrackId },
    ...(/^\d+$/u.test(providerTrackId) ? [{ key: 'songid', value: providerTrackId }] : []),
  ];
  const headers = qqApiHeaders();
  for (const variant of variants) {
    const params = new URLSearchParams({ tpl: 'yqq_song_detail', format: 'json' });
    params.set(variant.key, variant.value);
    let data;
    try {
      data = await probeFetchJson(`https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?${params.toString()}`, {
        headers,
      });
    } catch {
      continue;
    }
    const song = unwrapQqSong(Array.isArray(data?.data) ? data.data[0] : null);
    if (!Object.keys(song).length) continue;
    const tiers = qqTiersFromFile(song.file);
    return tiers.length ? { qualities: tiers } : null;
  }
  return null;
};

const probeQqQualities = async (ids) => {
  const results = {};
  const queue = [...ids];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const entry = await probeQqTrack(id).catch(() => null);
      if (entry) results[id] = entry;
    }
  }));
  return results;
};

const probeKugouQualities = (ids) => {
  const results = {};
  for (const id of ids) {
    const [hash, , , hqHash, sqHash] = String(id).split('.');
    if (!/^[a-f0-9]{16,64}$/iu.test(hash || '')) continue;
    const hq = hqHash && hqHash !== '0' ? hqHash : null;
    const sq = sqHash && sqHash !== '0' ? sqHash : null;
    if (!hq && !sq) continue;
    const tiers = [];
    if (sq) tiers.push({ quality: 'lossless', codec: 'flac', bitrate: null, size: null });
    if (hq) tiers.push({ quality: 'high', codec: 'mp3', bitrate: 320000, size: null });
    tiers.push({ quality: 'standard', codec: 'mp3', bitrate: 128000, size: null });
    results[id] = { qualities: tiers };
  }
  return results;
};

/*
 * Cover download.
 *
 * ECHO's chinese providers wrap every artwork URL in
 * `echo-image://remote/<encoded-url>?referer=<encoded-referer>` — a custom
 * Electron protocol only ECHO's renderer can resolve. That is the reason
 * downloaded NetEase songs had no embedded cover: the old fetch required a
 * plain http(s) URL, so it silently returned null for every proxied cover.
 * The wrapper is unwrapped here, the recorded Referer plus the standard
 * provider headers (and, on NetEase image hosts, the account cookie) are
 * attached, and a failed fetch retries once without the `?param=WxH` resize
 * suffix that some NetEase CDN nodes reject.
 */
const decodeEchoImageUrl = (value) => {
  const match = /^echo-image:\/\/remote\/([^?]+)(?:\?(.*))?$/iu.exec(String(value || '').trim());
  if (!match) return null;
  try {
    const url = decodeURIComponent(match[1]);
    if (!/^https?:\/\//iu.test(url)) return null;
    const referer = new URLSearchParams(match[2] || '').get('referer');
    return { url, referer: referer && /^https?:\/\//iu.test(referer) ? referer : null };
  } catch {
    return null;
  }
};

const urlHost = (url) => {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
};

const fetchImageOnce = async (url, headers) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return null;
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length || data.length > maxCoverBytes) return null;
    const mimeType = data[0] === 0x89 && data[1] === 0x50 ? 'image/png'
      : data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg'
      : String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/[a-z0-9.+-]+$/u.test(mimeType)) return null;
    return { data, mimeType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const fetchCoverImage = async (coverUrl) => {
  const decoded = decodeEchoImageUrl(coverUrl);
  const url = decoded ? decoded.url : String(coverUrl || '').trim();
  if (!/^https?:\/\//iu.test(url)) return null;
  const headers = { 'User-Agent': defaultUserAgent };
  if (decoded?.referer) headers.Referer = decoded.referer;
  applyProviderHeaders(headers, url, '');
  if (/(^|\.)music\.1(26|63)\.(net|com)$|(^|\.)126\.net$/u.test(urlHost(url))) {
    const cookie = streamingAccountCookie('netease');
    if (cookie && !hasHeader(headers, 'Cookie')) headers.Cookie = cookie;
  }
  const first = await fetchImageOnce(url, headers);
  if (first) return first;
  try {
    const stripped = new URL(url);
    if (!stripped.searchParams.has('param')) return null;
    stripped.searchParams.delete('param');
    return await fetchImageOnce(stripped.toString(), headers);
  } catch {
    return null;
  }
};

const biliAudioHeaders = (cookie) => ({
  Accept: 'application/json,text/plain,*/*',
  'User-Agent': defaultUserAgent,
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
  ...(cookie ? { Cookie: cookie } : {}),
});

const readBilibiliCookie = async () => {
  const session = streamingAccountSession('bilibili');
  if (session?.cookie) return session.cookie;
  try {
    const accountSession = getElectron()?.session?.fromPartition?.('persist:echo-account-bilibili');
    const cookies = await accountSession?.cookies?.get?.({ domain: '.bilibili.com' }) || [];
    if (!cookies.length) return '';
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  } catch {
    return '';
  }
};

const resolveBilibiliAudio = async (item) => {
  const raw = String(item?.providerTrackId || '').trim();
  const bvid = (raw.match(/BV[0-9A-Za-z]+/iu) || [])[0] || raw;
  if (!bvid) throw new Error('bilibili_id_unavailable');
  const headers = biliAudioHeaders(await readBilibiliCookie());
  const view = await probeFetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, { headers });
  const cid = view?.data?.cid;
  if (!cid) throw new Error('bilibili_cid_unavailable');
  const playurl = await probeFetchJson(`https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${cid}&fnval=16&fnver=0&fourk=1`, { headers });
  const audio = [...(playurl?.data?.dash?.audio || [])].sort((left, right) => (Number(right.bandwidth) || 0) - (Number(left.bandwidth) || 0));
  const pick = audio[0];
  const url = pick?.baseUrl || pick?.base_url;
  if (!url) throw new Error('bilibili_audio_unavailable');
  return {
    url,
    mimeType: pick.mimeType || pick.mime_type || 'audio/mp4',
    codec: pick.codecs || 'm4a',
    headers,
  };
};

const togetherTrayPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQUlEQVR4nGOI9vn/nxLMgE0QFyDKAEIArwHEAqwGELIJlzwDMZrxGYJhAKFQHwkGkBWIFEcjVRISVZIyVTITqRgA0LMwhgcvo/EAAAAASUVORK5CYII=', 'base64');

const ncmCall = async (name, params) => {
  const body = await ncmInvoke(name, params);
  if (body == null) return { ok: false, error: `ncm_${name}_unavailable`, body: null, code: null };
  const record = neteaseRecord(body);
  const nested = neteaseRecord(record.data);
  const code = Number(record.code ?? nested.code);
  if (Number.isFinite(code) && code !== 200 && code !== 201) {
    return { ok: false, error: String(record.message || record.msg || nested.message || nested.msg || `ncm_${name}_${code}`), body: record, code };
  }
  return { ok: true, body: record, code: Number.isFinite(code) ? code : 200 };
};

const ncmBatchPath = async (cookie, path, payload) => {
  const body = await ncmInvoke('batch', { cookie, [path]: JSON.stringify(payload) });
  if (!body) return { ok: false, error: 'ncm_batch_unavailable', body: null };
  const nested = body[path] != null ? body[path] : body;
  const record = typeof nested === 'string' ? (() => { try { return probeParseJson(nested); } catch { return {}; } })() : neteaseRecord(nested);
  const code = Number(record?.code);
  if (Number.isFinite(code) && code !== 200 && code !== 201) {
    return { ok: false, error: String(record.message || record.msg || `ncm_batch_${code}`), body: record, code };
  }
  return { ok: true, body: record, code: Number.isFinite(code) ? code : 200 };
};

const togetherShareUrl = (roomId, inviterId, songId) => {
  const params = new URLSearchParams();
  if (songId) params.set('songId', String(songId));
  if (roomId) params.set('roomId', String(roomId));
  if (inviterId) params.set('inviterId', String(inviterId));
  return `https://st.music.163.com/listen-together/share/?${params.toString()}`;
};

const parseTogetherShare = (value) => {
  const text = typeof value === 'string' ? value : (() => {
    try { return JSON.stringify(value || ''); } catch { return String(value || ''); }
  })();
  const roomId = (text.match(/[?&]roomId=(\d+)/iu) || [])[1] || null;
  const inviterId = (text.match(/[?&]inviterId=(\d+)/iu) || [])[1] || null;
  const songId = (text.match(/[?&]songId=(\d+)/iu) || [])[1] || null;
  if (!roomId || !inviterId) return null;
  return { roomId, inviterId, songId };
};

const togetherUserFrom = (value) => {
  const row = neteaseRecord(value);
  const nested = neteaseRecord(row.user || row.profile || row.follow || row.member || row.followUser || row.followedUser);
  const userId = neteaseIdText(row.userId || row.userid || row.uid || row.userIdStr || row.id
    || nested.userId || nested.userid || nested.uid || nested.userIdStr || nested.id);
  if (!userId) return null;
  const nickname = String(row.nickname || row.nickName || nested.nickname || nested.nickName || userId).trim();
  const avatarUrl = neteaseImageUrl(row.avatarUrl || row.avatarurl || nested.avatarUrl || nested.avatarurl || null, 120);
  const joinedAt = Number(row.joinTime || row.joinedAt || row.enterTime || nested.joinTime) || null;
  const mutual = row.mutual === true || row.followed === true || nested.mutual === true;
  return { userId, nickname, avatarUrl, joinedAt, mutual };
};

const togetherUsersFrom = (value) => {
  const lists = [];
  if (Array.isArray(value)) lists.push(value);
  const record = neteaseRecord(value);
  for (const key of ['roomUsers', 'users', 'members', 'userList', 'onlineUsers', 'records', 'list', 'follow', 'followeds', 'follows', 'userprofiles', 'userlist', 'userList']) {
    if (Array.isArray(record[key])) lists.push(record[key]);
  }
  const nestedUser = neteaseRecord(record.user);
  if (Array.isArray(nestedUser.userlist) || Array.isArray(nestedUser.users)) lists.push(nestedUser.userlist || nestedUser.users);
  const users = [];
  const seen = new Set();
  for (const list of lists) {
    for (const item of list) {
      const user = togetherUserFrom(item);
      if (!user || seen.has(user.userId)) continue;
      seen.add(user.userId);
      users.push(user);
    }
  }
  return users;
};

const togetherInviteFrom = (value, fallback = {}) => {
  if (typeof value === 'string') {
    const share = parseTogetherShare(value);
    if (!share) return null;
    return {
      roomId: share.roomId,
      inviterId: share.inviterId,
      songId: share.songId,
      nickname: fallback.nickname || null,
      avatarUrl: fallback.avatarUrl || null,
      at: fallback.at || Date.now(),
    };
  }
  const row = neteaseRecord(value);
  const nested = neteaseRecord(row.data || row.invitation || row.content || row.msg);
  const share = parseTogetherShare(row.msg || row.lastMsg || row.url || row.shareUrl || nested.msg || nested.url || nested.content || row);
  const roomId = neteaseIdText(row.roomId || nested.roomId || share?.roomId);
  const inviterId = neteaseIdText(row.inviterId || row.fromUserId || row.userId || nested.inviterId || share?.inviterId);
  if (!roomId || !inviterId) return null;
  const fromUser = togetherUserFrom(row.fromUser || row.user || row.inviter || nested.fromUser) || togetherUserFrom(row);
  return {
    roomId,
    inviterId,
    songId: neteaseIdText(row.songId || nested.songId || share?.songId),
    nickname: fromUser?.nickname || fallback.nickname || null,
    avatarUrl: fromUser?.avatarUrl || fallback.avatarUrl || null,
    at: Number(row.lastMsgTime || row.time || nested.time) || fallback.at || Date.now(),
  };
};

const collectTogetherInvites = (value, found = [], seen = new Set()) => {
  if (!value) return found;
  if (typeof value === 'string') {
    const invite = togetherInviteFrom(value);
    if (invite) {
      const key = `${invite.roomId}:${invite.inviterId}`;
      if (!seen.has(key)) { seen.add(key); found.push(invite); }
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTogetherInvites(item, found, seen);
    return found;
  }
  if (typeof value !== 'object') return found;
  const invite = togetherInviteFrom(value);
  if (invite) {
    const key = `${invite.roomId}:${invite.inviterId}`;
    if (!seen.has(key)) { seen.add(key); found.push(invite); }
  }
  for (const nested of Object.values(value)) {
    if (nested && (typeof nested === 'object' || typeof nested === 'string')) collectTogetherInvites(nested, found, seen);
  }
  return found;
};

const togetherPlayCommandFrom = (value) => {
  const row = neteaseRecord(value);
  const info = neteaseRecord(typeof row.commandInfo === 'string' ? probeParseJson(row.commandInfo) : (row.commandInfo || row.playCommand || row.command || row));
  const commandType = String(info.commandType || info.type || '').trim();
  const targetSongId = neteaseIdText(info.targetSongId || info.songId || info.trackId);
  if (!commandType && !targetSongId) return null;
  return {
    commandType: commandType || 'PLAY',
    playStatus: String(info.playStatus || row.playStatus || 'PLAY').toUpperCase() === 'PAUSE' ? 'PAUSE' : 'PLAY',
    progressMs: Math.max(0, Math.floor(Number(info.progress ?? info.progressMs ?? row.progress) || 0)),
    formerSongId: neteaseIdText(info.formerSongId) || '-1',
    targetSongId: targetSongId || '0',
    clientSeq: Math.max(0, Math.floor(Number(info.clientSeq ?? row.clientSeq) || 0)),
  };
};

const createTogetherService = ({ log, broadcast, electron }) => {
  const state = {
    loggedIn: false,
    loginError: null,
    userId: null,
    nickname: null,
    avatarUrl: null,
    inRoom: false,
    role: null,
    roomId: null,
    inviterId: null,
    users: [],
    startedAt: null,
    songId: null,
    songTitle: null,
    songArtist: null,
    songCover: null,
    songDurationMs: 0,
    playStatus: 'PAUSE',
    progressMs: 0,
    clientSeq: 1,
    playlistIds: [],
    playlistVersion: 1,
    friends: [],
    invites: [],
    shareUrl: null,
    lastCommand: null,
    lastError: null,
    busy: null,
  };
  let sessionActive = false;
  let pendingRestore = null;
  let restorePrompted = false;
  let statusTimer = 0;
  let heartbeatTimer = 0;
  let tray = null;
  let disposed = false;
  let snapshotStamp = '';

  const cookieOrThrow = () => {
    const session = streamingAccountSession('netease');
    if (!session.cookie) {
      const error = new Error('netease_login_required');
      error.code = 'netease_login_required';
      throw error;
    }
    return session.cookie;
  };

  const snapshot = () => ({
    loggedIn: state.loggedIn,
    loginError: state.loginError,
    userId: state.userId,
    nickname: state.nickname,
    avatarUrl: state.avatarUrl,
    inRoom: state.inRoom,
    role: state.role,
    roomId: state.roomId,
    inviterId: state.inviterId,
    users: state.users,
    startedAt: state.startedAt,
    elapsedMs: state.startedAt ? Math.max(0, Date.now() - state.startedAt) : 0,
    songId: state.songId,
    songTitle: state.songTitle,
    songArtist: state.songArtist,
    songCover: state.songCover,
    songDurationMs: state.songDurationMs,
    playStatus: state.playStatus,
    progressMs: state.progressMs,
    clientSeq: state.clientSeq,
    playlistIds: state.playlistIds,
    friends: state.friends,
    invites: state.invites,
    shareUrl: state.shareUrl,
    lastCommand: state.lastCommand,
    lastError: state.lastError,
    busy: state.busy,
    sessionActive,
    pendingRestore,
  });

  const emit = (force = false) => {
    const next = snapshot();
    const stamp = JSON.stringify({
      loggedIn: next.loggedIn,
      inRoom: next.inRoom,
      roomId: next.roomId,
      role: next.role,
      users: next.users.map((user) => user.userId),
      songId: next.songId,
      playStatus: next.playStatus,
      progressMs: Math.floor((next.progressMs || 0) / 1000),
      invites: next.invites.map((item) => `${item.roomId}:${item.inviterId}`),
      lastCommand: next.lastCommand,
      lastError: next.lastError,
      busy: next.busy,
      friends: next.friends.length,
      pendingRestore: next.pendingRestore?.roomId || null,
      sessionActive: next.sessionActive,
    });
    if (!force && stamp === snapshotStamp) return next;
    snapshotStamp = stamp;
    try { broadcast('together-state', next); } catch {}
    rebuildTray();
    return next;
  };

  const fail = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    state.lastError = message;
    log('WARN', `together: ${message}`);
    emit(true);
    return { ok: false, error: message, ...snapshot() };
  };

  const applySongMeta = async (songId) => {
    if (!songId || songId === state.songId && state.songTitle) return;
    const songs = await fetchNeteaseSongDetails([songId]).catch(() => new Map());
    const mapped = mapNeteasePlaylistSong(songs.get(songId));
    if (!mapped) return;
    state.songId = mapped.providerTrackId;
    state.songTitle = mapped.title;
    state.songArtist = mapped.artist;
    state.songCover = mapped.coverThumb || mapped.coverUrl;
    state.songDurationMs = Math.round((Number(mapped.duration) || 0) * 1000);
  };

  const applyRoomBody = async (body, extras = {}) => {
    const record = neteaseRecord(body);
    const data = neteaseRecord(record.data);
    const roomInfo = neteaseRecord(data.roomInfo || data.room || extras.roomInfo || record.roomInfo);
    const roomId = neteaseIdText(roomInfo.roomId || data.roomId || extras.roomId || state.roomId);
    const users = togetherUsersFrom(roomInfo) || togetherUsersFrom(data);
    const moreUsers = togetherUsersFrom(data.roomUsers);
    const mergedUsers = [...users];
    const seen = new Set(users.map((user) => user.userId));
    for (const user of moreUsers) {
      if (seen.has(user.userId)) continue;
      seen.add(user.userId);
      mergedUsers.push(user);
    }
    const inviterId = neteaseIdText(roomInfo.creatorId || roomInfo.inviterId || roomInfo.ownerId || data.inviterId || extras.inviterId || state.inviterId);
    if (data.inRoom === false && extras.forceRoom !== true && extras.inRoom !== true) {
      if (state.inRoom) {
        state.inRoom = false;
        state.role = null;
        state.roomId = null;
        state.inviterId = null;
        state.users = [];
        state.startedAt = null;
        state.shareUrl = null;
      }
      return;
    }
    const inRoom = extras.inRoom === true
      || data.inRoom === true
      || roomInfo.inRoom === true
      || Boolean(roomId && (mergedUsers.length || extras.forceRoom));
    if (extras.activate === false && roomId) {
      const command = togetherPlayCommandFrom(data) || togetherPlayCommandFrom(roomInfo) || togetherPlayCommandFrom(data.playInfo);
      const songId = command?.targetSongId && command.targetSongId !== '0' ? command.targetSongId : (state.songId || pendingRestore?.songId || null);
      let songTitle = pendingRestore?.songTitle || null;
      let songArtist = pendingRestore?.songArtist || null;
      let songCover = pendingRestore?.songCover || null;
      if (songId && !songTitle) {
        const songs = await fetchNeteaseSongDetails([songId]).catch(() => new Map());
        const mapped = mapNeteasePlaylistSong(songs.get(songId));
        if (mapped) {
          songTitle = mapped.title;
          songArtist = mapped.artist;
          songCover = mapped.coverThumb || mapped.coverUrl;
        }
      }
      pendingRestore = {
        roomId,
        inviterId: inviterId || pendingRestore?.inviterId || null,
        users: mergedUsers.length ? mergedUsers : (pendingRestore?.users || []),
        songId,
        songTitle,
        songArtist,
        songCover,
        playStatus: command?.playStatus || pendingRestore?.playStatus || 'PAUSE',
        progressMs: command?.progressMs || pendingRestore?.progressMs || 0,
        startedAt: Number(roomInfo.createTime || roomInfo.startTime || data.createTime) || pendingRestore?.startedAt || null,
      };
      if (!restorePrompted) {
        restorePrompted = true;
        log('INFO', `together leftover room ${roomId}, waiting for restore/leave`);
        try { broadcast('together-restore-prompt', snapshot()); } catch {}
      }
      emit(true);
      return;
    }
    if (roomId) state.roomId = roomId;
    if (inviterId) state.inviterId = inviterId;
    if (mergedUsers.length) state.users = mergedUsers;
    state.inRoom = Boolean(inRoom && state.roomId);
    if (state.inRoom && !state.startedAt) state.startedAt = Date.now();
    if (!state.inRoom) {
      state.startedAt = null;
      state.role = null;
      state.shareUrl = null;
    } else {
      state.role = state.userId && state.inviterId && state.userId === state.inviterId ? 'host' : (state.role || 'guest');
      state.shareUrl = togetherShareUrl(state.roomId, state.inviterId || state.userId, state.songId);
    }
    const command = togetherPlayCommandFrom(data) || togetherPlayCommandFrom(roomInfo) || togetherPlayCommandFrom(data.playInfo);
    if (command && command.clientSeq >= (state.lastCommand?.clientSeq || 0)) {
      state.lastCommand = command;
      if (command.targetSongId && command.targetSongId !== '0') {
        state.songId = command.targetSongId;
        state.playStatus = command.playStatus;
        state.progressMs = command.progressMs;
        await applySongMeta(state.songId);
      }
    }
    const playlist = neteaseRecord(neteaseRecord(data.playlist).displayList || neteaseRecord(data.playlist));
    const ids = Array.isArray(playlist.result) ? playlist.result : Array.isArray(data.displayList) ? data.displayList : [];
    const playlistIds = ids.map((id) => neteaseIdText(id?.id ?? id)).filter(Boolean);
    if (playlistIds.length) state.playlistIds = playlistIds;
  };

  const refreshAccount = async () => {
    const session = streamingAccountSession('netease');
    if (!session.cookie) {
      state.loggedIn = false;
      state.userId = null;
      state.nickname = null;
      state.avatarUrl = null;
      state.loginError = session.detail || 'no session';
      return false;
    }
    const status = await ncmCall('login_status', { cookie: session.cookie });
    const data = neteaseRecord(status.body?.data);
    const profile = neteaseRecord(data.profile || status.body?.profile);
    const account = neteaseRecord(data.account || status.body?.account);
    const userId = neteaseIdText(profile.userId || account.id) || await resolveNeteaseUserId(session.cookie);
    state.loggedIn = Boolean(userId);
    state.userId = userId;
    state.nickname = String(profile.nickname || '').trim() || state.nickname;
    state.avatarUrl = neteaseImageUrl(profile.avatarUrl, 120) || state.avatarUrl;
    state.loginError = state.loggedIn ? null : (status.error || 'login_status_failed');
    return state.loggedIn;
  };

  const mergeInvites = (items) => {
    const seen = new Set(state.invites.map((item) => `${item.roomId}:${item.inviterId}`));
    for (const item of items || []) {
      if (!item?.roomId || !item?.inviterId) continue;
      if (state.userId && item.inviterId === state.userId) continue;
      if (state.inRoom && item.roomId === state.roomId) continue;
      const key = `${item.roomId}:${item.inviterId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      state.invites = [item, ...state.invites].slice(0, 20);
    }
  };

  const refreshFriends = async (cookie) => {
    const friends = [];
    const seen = new Set();
    const push = (user) => {
      if (!user || seen.has(user.userId) || user.userId === state.userId) return;
      seen.add(user.userId);
      friends.push(user);
    };
    for (const scene of [2, 0]) {
      let cursor = 0;
      for (let page = 0; page < 6; page += 1) {
        const result = await ncmCall('user_follow_mixed', { cookie, scene, size: 50, cursor });
        const data = neteaseRecord(result.body?.data);
        const batch = togetherUsersFrom(data).concat(togetherUsersFrom(result.body));
        if (!batch.length) break;
        batch.forEach(push);
        const next = data.cursor ?? data.nextCursor ?? data.nextcursor;
        if (next == null || next === cursor || batch.length < 10) break;
        cursor = next;
      }
      if (friends.length) break;
    }
    if (state.userId) {
      for (let offset = 0; offset < 150; offset += 30) {
        const follows = await ncmCall('user_follows', { cookie, uid: state.userId, limit: 30, offset });
        const batch = togetherUsersFrom(follows.body?.follow)
          .concat(togetherUsersFrom(follows.body?.data))
          .concat(togetherUsersFrom(follows.body));
        if (!batch.length) break;
        batch.forEach(push);
        if (batch.length < 20) break;
      }
      const fans = await ncmCall('user_followeds', { cookie, uid: state.userId, limit: 50, offset: 0 });
      togetherUsersFrom(fans.body?.followeds).concat(togetherUsersFrom(fans.body?.data)).concat(togetherUsersFrom(fans.body)).forEach(push);
    }
    const inbox = await ncmCall('msg_private', { cookie, limit: 30, offset: 0 });
    const msgs = Array.isArray(inbox.body?.msgs) ? inbox.body.msgs : [];
    for (const msg of msgs) {
      const fromUser = togetherUserFrom(neteaseRecord(msg).fromUser || neteaseRecord(msg).user);
      if (fromUser) push(fromUser);
    }
    friends.sort((left, right) => Number(right.mutual) - Number(left.mutual));
    state.friends = friends;
  };

  const searchFriends = async (cookie, query) => {
    const users = [];
    const seen = new Set();
    const push = (user) => {
      if (!user || seen.has(user.userId) || user.userId === state.userId) return;
      seen.add(user.userId);
      users.push(user);
    };
    const needle = String(query || '').trim().toLowerCase();
    for (const friend of state.friends) {
      if (!needle || friend.nickname.toLowerCase().includes(needle) || friend.userId.includes(needle)) push(friend);
    }
    if (needle) {
      for (const name of ['search', 'cloudsearch']) {
        const result = await ncmCall(name, { cookie, keywords: query, type: 1002, limit: 30, offset: 0 });
        const body = result.body || {};
        const found = neteaseRecord(body.result || body.data);
        togetherUsersFrom(found.userprofiles)
          .concat(togetherUsersFrom(found.userlist))
          .concat(togetherUsersFrom(found.users))
          .concat(togetherUsersFrom(found.user))
          .concat(togetherUsersFrom(found))
          .forEach(push);
        if (users.length) break;
      }
    }
    return users;
  };

  const refreshInvites = async (cookie) => {
    const status = await ncmCall('listentogether_status', { cookie });
    if (status.ok) {
      const serverInRoom = neteaseRecord(status.body?.data).inRoom === true;
      if (serverInRoom && !sessionActive && !state.inRoom) {
        await applyRoomBody(status.body, { inRoom: true, forceRoom: true, activate: false });
      } else {
        if (!serverInRoom) {
          pendingRestore = null;
          restorePrompted = false;
        }
        await applyRoomBody(status.body, { inRoom: serverInRoom });
      }
      mergeInvites(collectTogetherInvites(status.body));
    } else if (state.inRoom === false) {
      state.lastError = state.lastError || status.error;
    }
    const inbox = await ncmCall('msg_private', { cookie, limit: 30, offset: 0 });
    const msgs = Array.isArray(inbox.body?.msgs) ? inbox.body.msgs : Array.isArray(inbox.body?.data) ? inbox.body.data : [];
    for (const msg of msgs) {
      const row = neteaseRecord(msg);
      const fromUser = togetherUserFrom(row.fromUser || row.user);
      let payload = row.lastMsg || row.msg || row.lastMsgJson;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch {}
      }
      const invite = togetherInviteFrom(payload, {
        nickname: fromUser?.nickname,
        avatarUrl: fromUser?.avatarUrl,
        at: Number(row.lastMsgTime || row.time) || Date.now(),
      }) || togetherInviteFrom(row, { nickname: fromUser?.nickname, avatarUrl: fromUser?.avatarUrl });
      if (invite) mergeInvites([invite]);
    }
  };

  const refreshRoom = async (cookie = streamingAccountCookie('netease')) => {
    if (!cookie || !state.roomId) return;
    const check = await ncmCall('listentogether_room_check', { cookie, roomId: state.roomId });
    if (check.ok) await applyRoomBody(check.body, { forceRoom: true, roomId: state.roomId });
    const playlist = await ncmCall('listentogether_sync_playlist_get', { cookie, roomId: state.roomId });
    if (playlist.ok) await applyRoomBody(playlist.body, { forceRoom: true, roomId: state.roomId });
  };

  const playCommand = async (commandType, extras = {}) => {
    if (!state.inRoom || !state.roomId) return { ok: false, error: 'together_not_in_room' };
    const cookie = cookieOrThrow();
    const targetSongId = extras.targetSongId || state.songId || '0';
    const formerSongId = extras.formerSongId || state.songId || '-1';
    state.clientSeq += 1;
    const sent = {
      commandType,
      playStatus: extras.playStatus || state.playStatus,
      progressMs: extras.progressMs != null ? extras.progressMs : state.progressMs,
      formerSongId,
      targetSongId,
      clientSeq: state.clientSeq,
    };
    const result = await ncmCall('listentogether_play_command', {
      cookie,
      roomId: state.roomId,
      commandType: sent.commandType,
      progress: sent.progressMs,
      playStatus: sent.playStatus,
      formerSongId: sent.formerSongId,
      targetSongId: sent.targetSongId,
      clientSeq: sent.clientSeq,
    });
    if (!result.ok) return fail(new Error(result.error));
    state.lastCommand = sent;
    if (targetSongId && targetSongId !== '0') state.songId = String(targetSongId);
    state.playStatus = sent.playStatus;
    state.progressMs = sent.progressMs;
    state.shareUrl = togetherShareUrl(state.roomId, state.inviterId || state.userId, state.songId);
    emit();
    return { ok: true, ...snapshot() };
  };

  const heartbeat = async () => {
    if (!sessionActive || pendingRestore || !state.inRoom || !state.roomId) return;
    const cookie = streamingAccountCookie('netease');
    if (!cookie) return;
    const result = await ncmCall('listentogether_heatbeat', {
      cookie,
      roomId: state.roomId,
      songId: state.songId || '0',
      playStatus: state.playStatus,
      progress: state.progressMs,
    });
    if (result.ok) await applyRoomBody(result.body, { forceRoom: true, roomId: state.roomId });
    emit();
  };

  const clearRoom = () => {
    state.inRoom = false;
    state.role = null;
    state.roomId = null;
    state.inviterId = null;
    state.users = [];
    state.startedAt = null;
    state.playlistIds = [];
    state.shareUrl = null;
    state.lastCommand = null;
  };

  const create = async () => {
    try {
      state.busy = 'create';
      emit(true);
      const cookie = cookieOrThrow();
      if (!(await refreshAccount())) throw new Error('netease_login_required');
      if (state.inRoom && state.roomId) return { ok: true, ...emit(true) };
      const result = await ncmCall('listentogether_room_create', { cookie });
      if (!result.ok) throw new Error(result.error);
      sessionActive = true;
      pendingRestore = null;
      restorePrompted = false;
      state.role = 'host';
      state.inviterId = state.userId;
      state.startedAt = Date.now();
      await applyRoomBody(result.body, { inRoom: true, inviterId: state.userId, forceRoom: true });
      if (!state.roomId) throw new Error('together_create_failed');
      await refreshRoom(cookie);
      state.lastError = null;
      log('INFO', `together room created ${state.roomId}`);
      return { ok: true, ...emit(true) };
    } catch (error) {
      return fail(error);
    } finally {
      state.busy = null;
      emit();
    }
  };

  const accept = async (payload) => {
    try {
      state.busy = 'accept';
      emit(true);
      const cookie = cookieOrThrow();
      if (!(await refreshAccount())) throw new Error('netease_login_required');
      const roomId = neteaseIdText(payload?.roomId);
      const inviterId = neteaseIdText(payload?.inviterId);
      if (!roomId || !inviterId) throw new Error('together_invite_invalid');
      const result = await ncmCall('listentogether_accept', { cookie, roomId, inviterId });
      if (!result.ok) throw new Error(result.error);
      sessionActive = true;
      pendingRestore = null;
      restorePrompted = false;
      state.role = 'guest';
      state.inviterId = inviterId;
      state.startedAt = Date.now();
      await applyRoomBody(result.body, { inRoom: true, roomId, inviterId, forceRoom: true });
      await refreshRoom(cookie);
      state.invites = state.invites.filter((item) => item.roomId !== roomId);
      state.lastError = null;
      log('INFO', `together joined room ${state.roomId} from ${inviterId}`);
      return { ok: true, ...emit(true) };
    } catch (error) {
      return fail(error);
    } finally {
      state.busy = null;
      emit();
    }
  };

  const leave = async () => {
    try {
      state.busy = 'leave';
      emit(true);
      const cookie = streamingAccountCookie('netease');
      const roomId = state.roomId || pendingRestore?.roomId;
      if (cookie && roomId) {
        await ncmCall('listentogether_end', { cookie, roomId });
      }
      log('INFO', `together left room ${roomId || ''}`);
      pendingRestore = null;
      restorePrompted = false;
      sessionActive = false;
      clearRoom();
      state.lastError = null;
      return { ok: true, ...emit(true) };
    } catch (error) {
      pendingRestore = null;
      restorePrompted = false;
      sessionActive = false;
      clearRoom();
      return fail(error);
    } finally {
      state.busy = null;
      emit();
    }
  };

  const restore = async () => {
    try {
      state.busy = 'restore';
      emit(true);
      const cookie = cookieOrThrow();
      if (!(await refreshAccount())) throw new Error('netease_login_required');
      const held = pendingRestore;
      sessionActive = true;
      pendingRestore = null;
      restorePrompted = false;
      if (held?.roomId) {
        state.roomId = held.roomId;
        state.inviterId = held.inviterId || state.userId;
        state.users = held.users || [];
        state.songId = held.songId || state.songId;
        state.songTitle = held.songTitle || state.songTitle;
        state.songArtist = held.songArtist || state.songArtist;
        state.songCover = held.songCover || state.songCover;
        state.playStatus = held.playStatus || state.playStatus;
        state.progressMs = held.progressMs || 0;
        state.startedAt = held.startedAt || Date.now();
        state.inRoom = true;
        state.role = state.userId && state.inviterId && state.userId === state.inviterId ? 'host' : 'guest';
        state.shareUrl = togetherShareUrl(state.roomId, state.inviterId || state.userId, state.songId);
      }
      const status = await ncmCall('listentogether_status', { cookie });
      if (status.ok) await applyRoomBody(status.body, { inRoom: true, forceRoom: true });
      await refreshRoom(cookie);
      if (!state.inRoom || !state.roomId) throw new Error('together_restore_failed');
      state.lastError = null;
      log('INFO', `together restored room ${state.roomId}`);
      return { ok: true, restored: true, ...emit(true) };
    } catch (error) {
      return fail(error);
    } finally {
      state.busy = null;
      emit();
    }
  };

  const invite = async (payload) => {
    try {
      state.busy = 'invite';
      emit(true);
      const cookie = cookieOrThrow();
      if (!(await refreshAccount())) throw new Error('netease_login_required');
      if (pendingRestore) throw new Error('together_restore_pending');
      if (!state.inRoom || !state.roomId) {
        const created = await create();
        if (!created.ok) return created;
      }
      const userIds = [...new Set((Array.isArray(payload?.userIds) ? payload.userIds : [payload?.userId])
        .map((id) => neteaseIdText(id))
        .filter(Boolean))];
      if (!userIds.length) throw new Error('together_invite_user_required');
      const payloads = [
        { roomId: state.roomId, userIdList: JSON.stringify(userIds.map((id) => Number(id))), refer: 'inbox_invite' },
        { roomId: state.roomId, userIdList: userIds.join(','), refer: 'songplay_more' },
        { roomId: state.roomId, invitedUserIds: JSON.stringify(userIds), refer: 'inbox_invite' },
        { roomId: String(state.roomId), userIds: JSON.stringify(userIds) },
      ];
      let sent = false;
      let lastError = null;
      for (const path of ['/api/listen/together/play/invitation/send', '/api/listen/together/play/invitation/send/v2']) {
        for (const body of payloads) {
          const result = await ncmBatchPath(cookie, path, body);
          if (result.ok) { sent = true; break; }
          lastError = result.error;
        }
        if (sent) break;
      }
      if (!sent) {
        const share = togetherShareUrl(state.roomId, state.inviterId || state.userId, state.songId);
        const text = await ncmCall('send_text', {
          cookie,
          msg: `邀请你一起听 ${share}`,
          user_ids: userIds.join(','),
        });
        if (!text.ok) throw new Error(lastError || text.error || 'together_invite_failed');
        sent = true;
      }
      state.shareUrl = togetherShareUrl(state.roomId, state.inviterId || state.userId, state.songId);
      if (payload?.copyLink === true) {
        try { electron?.clipboard?.writeText?.(state.shareUrl); } catch {}
      }
      state.lastError = null;
      log('INFO', `together invited ${userIds.join(',')} to ${state.roomId}`);
      return { ok: true, sent, invitedUserIds: userIds, shareUrl: state.shareUrl, ...emit(true) };
    } catch (error) {
      return fail(error);
    } finally {
      state.busy = null;
      emit();
    }
  };

  const friends = async (payload) => {
    try {
      const cookie = cookieOrThrow();
      if (!(await refreshAccount())) throw new Error('netease_login_required');
      const query = String(payload?.query || '').trim();
      if (!state.friends.length || payload?.refresh === true) await refreshFriends(cookie);
      const list = query ? await searchFriends(cookie, query) : state.friends;
      return { ok: true, friends: list, query, ...snapshot() };
    } catch (error) {
      return fail(error);
    }
  };

  const syncList = async (payload) => {
    try {
      if (!state.inRoom || !state.roomId) throw new Error('together_not_in_room');
      const cookie = cookieOrThrow();
      const ids = [...new Set((Array.isArray(payload?.ids) ? payload.ids : [])
        .map((id) => neteaseIdText(id))
        .filter(Boolean))];
      if (!ids.length) return { ok: true, ...snapshot() };
      state.playlistVersion += 1;
      const result = await ncmCall('listentogether_sync_list_command', {
        cookie,
        roomId: state.roomId,
        commandType: 'REPLACE',
        userId: state.userId,
        version: state.playlistVersion,
        randomList: ids.join(','),
        displayList: ids.join(','),
      });
      if (!result.ok) throw new Error(result.error);
      state.playlistIds = ids;
      return { ok: true, ...emit() };
    } catch (error) {
      return fail(error);
    }
  };

  const report = async (payload) => {
    try {
      if (!state.inRoom || !state.roomId) return { ok: true, ...snapshot() };
      const songId = neteaseIdText(payload?.songId) || state.songId;
      const playStatus = String(payload?.playStatus || state.playStatus).toUpperCase() === 'PAUSE' ? 'PAUSE' : 'PLAY';
      const progressMs = Math.max(0, Math.floor(Number(payload?.progressMs) || 0));
      const commandType = String(payload?.commandType || '').trim();
      const former = state.songId || '-1';
      const songChanged = Boolean(songId && songId !== state.songId);
      const statusChanged = playStatus !== state.playStatus;
      const seeked = Math.abs(progressMs - state.progressMs) > 1800;
      state.songId = songId || state.songId;
      state.playStatus = playStatus;
      state.progressMs = progressMs;
      if (payload?.title) state.songTitle = String(payload.title);
      if (payload?.artist) state.songArtist = String(payload.artist);
      if (payload?.coverUrl) state.songCover = String(payload.coverUrl);
      if (Number(payload?.durationMs) > 0) state.songDurationMs = Math.floor(Number(payload.durationMs));
      if (songId && !state.songTitle) await applySongMeta(songId);
      if (commandType || songChanged || statusChanged || (seeked && commandType)) {
        await playCommand(commandType || (songChanged ? 'GOTO' : (statusChanged ? playStatus : 'seek')), {
          targetSongId: songId,
          formerSongId: former,
          playStatus,
          progressMs,
        });
      } else {
        emit();
      }
      return { ok: true, ...snapshot() };
    } catch (error) {
      return fail(error);
    }
  };

  const rebuildTray = () => {
    if (!tray || disposed) return;
    try {
      const { Menu } = electron || {};
      if (!Menu?.buildFromTemplate) return;
      const snap = snapshot();
      const inviteItems = snap.invites.slice(0, 8).map((item) => ({
        label: item.nickname ? `接受 ${item.nickname}` : `接受房间 ${item.roomId}`,
        click: () => { void accept(item); },
      }));
      const template = [
        { label: snap.pendingRestore ? '一起听待恢复' : (snap.inRoom ? `一起听中 · ${snap.users.length || 1} 人` : '网易云一起听'), enabled: false },
        { type: 'separator' },
      ];
      if (snap.pendingRestore) {
        const names = (snap.pendingRestore.users || []).map((user) => user.nickname).filter(Boolean).slice(0, 3).join('、');
        template.push({ label: names ? `房间：${names}` : `房间 ${snap.pendingRestore.roomId}`, enabled: false });
        template.push({ label: '恢复一起听', click: () => { void restore(); } });
        template.push({ label: '退出一起听', click: () => { void leave(); } });
        template.push({ type: 'separator' });
      }
      if (!snap.loggedIn) {
        template.push({ label: '请先登录网易云', enabled: false });
      } else {
        const friendItems = (snap.friends || []).slice(0, 10).map((friend) => ({
          label: friend.nickname || friend.userId,
          click: () => { void invite({ userIds: [friend.userId] }); },
        }));
        if (friendItems.length) {
          friendItems.push({ type: 'separator' });
          friendItems.push({ label: '更多好友…', click: () => { try { broadcast('together-open-invite', snapshot()); } catch {} } });
          template.push({ label: snap.inRoom ? '邀请好友' : '邀请好友一起听', submenu: friendItems });
        } else {
          template.push({
            label: snap.inRoom ? '邀请好友' : '邀请一起听',
            click: () => { try { broadcast('together-open-invite', snapshot()); } catch {} },
          });
        }
        if (inviteItems.length) template.push({ label: `接受邀请 (${inviteItems.length})`, submenu: inviteItems });
        if (snap.inRoom) {
          template.push({
            label: '复制邀请链接',
            click: () => { try { electron.clipboard?.writeText?.(snap.shareUrl || ''); } catch {} },
          });
          template.push({ label: '离开一起听', click: () => { void leave(); } });
        }
      }
      template.push({ type: 'separator' });
      template.push({ label: '展开/收纳侧栏', click: () => { try { broadcast('together-toggle-rail', {}); } catch {} } });
      tray.setContextMenu(Menu.buildFromTemplate(template));
      tray.setToolTip(snap.inRoom
        ? `一起听 · ${snap.users.length || 1} 人${snap.songTitle ? ` · ${snap.songTitle}` : ''}`
        : '网易云一起听');
    } catch (error) {
      log('WARN', `together tray: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const ensureTray = () => {
    if (tray || disposed) return;
    const Tray = electron?.Tray;
    const nativeImage = electron?.nativeImage;
    if (!Tray || !nativeImage) return;
    try {
      let icon = nativeImage.createFromBuffer(togetherTrayPng);
      if (icon?.isEmpty?.()) {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#5B4CFF"/><circle cx="16" cy="16" r="6" fill="#fff"/></svg>';
        icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
      }
      tray = new Tray(icon);
      tray.setToolTip('网易云一起听');
      tray.on('click', () => { try { broadcast('together-toggle-rail', {}); } catch {} });
      rebuildTray();
    } catch (error) {
      log('WARN', `together tray create failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const pollStatus = async () => {
    if (disposed) return;
    try {
      if (!(await refreshAccount())) {
        if (state.inRoom) clearRoom();
        emit();
        return;
      }
      const cookie = streamingAccountCookie('netease');
      await refreshInvites(cookie);
      if (state.inRoom && sessionActive && !pendingRestore) await refreshRoom(cookie);
      if (!state.friends.length) await refreshFriends(cookie).catch(() => undefined);
      emit();
    } catch (error) {
      log('WARN', `together poll: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const start = () => {
    ensureTray();
    void pollStatus();
    statusTimer = setInterval(() => { void pollStatus(); }, 8000);
    heartbeatTimer = setInterval(() => { void heartbeat(); }, 5000);
  };

  const dispose = () => {
    disposed = true;
    clearInterval(statusTimer);
    clearInterval(heartbeatTimer);
    try { tray?.destroy?.(); } catch {}
    tray = null;
  };

  return {
    snapshot,
    emit,
    start,
    dispose,
    create,
    accept,
    leave,
    restore,
    invite,
    friends,
    syncList,
    report,
    playCommand,
    refresh: pollStatus,
  };
};

const mapNeteaseComment = (value, selfId) => {
  const row = neteaseRecord(value);
  const user = neteaseRecord(row.user);
  const id = neteaseIdText(row.commentId || row.commentid || row.id);
  if (!id) return null;
  const replied = Array.isArray(row.beReplied) ? row.beReplied.map((item) => mapNeteaseComment(item, selfId)).filter(Boolean) : [];
  const userId = neteaseIdText(user.userId || row.userId);
  return {
    id,
    content: String(row.content || '').trim(),
    time: Number(row.time) || 0,
    likedCount: Number(row.likedCount || row.likeCount) || 0,
    liked: row.liked === true,
    userId,
    nickname: String(user.nickname || row.nickname || userId || '').trim(),
    avatarUrl: neteaseImageUrl(user.avatarUrl || row.avatarUrl, 80),
    owner: Boolean(selfId && userId && selfId === userId),
    replies: replied,
  };
};

const neteaseSongTrack = (song) => {
  const mapped = mapNeteasePlaylistSong(song);
  if (!mapped) return null;
  return { ...mapped, provider: 'netease', playable: true };
};

const unblockNeteaseSong = async (id) => {
  const cookie = streamingAccountCookie('netease');
  const sources = ['qq', 'kugou', 'pyncmd', 'joox'];
  for (const source of sources) {
    const result = await ncmCall('song_url_match', source ? { id, source, cookie } : { id, cookie });
    const data = result.body?.data;
    const url = typeof data === 'string' ? data : (data && typeof data === 'object' ? (data.url || data.proxyUrl) : null);
    const proxyUrl = result.body?.proxyUrl;
    const playUrl = (proxyUrl && /^https?:/iu.test(String(proxyUrl)) ? String(proxyUrl) : url);
    if (playUrl && /^https?:/iu.test(String(playUrl))) {
      return {
        url: String(playUrl),
        headers: { 'User-Agent': defaultUserAgent, Referer: 'https://music.163.com/' },
        mimeType: 'audio/mpeg',
        codec: 'mp3',
        unblocked: true,
        source: source || 'auto',
      };
    }
  }
  const v1 = await ncmCall('song_url_v1', { id, level: 'exhigh', cookie });
  const row = Array.isArray(v1.body?.data) ? v1.body.data[0] : neteaseRecord(v1.body?.data);
  const url = row?.url || row?.proxyUrl;
  if (url && /^https?:/iu.test(String(url))) {
    return {
      url: String(url),
      headers: { 'User-Agent': defaultUserAgent, Referer: 'https://music.163.com/' },
      mimeType: 'audio/mpeg',
      codec: 'mp3',
      unblocked: true,
      source: 'v1',
    };
  }
  return null;
};

const listNeteaseComments = async (id, payload = {}) => {
  const cookie = streamingAccountCookie('netease');
  const page = Math.max(1, Math.floor(Number(payload.page) || 1));
  const pageSize = Math.max(10, Math.min(50, Math.floor(Number(payload.pageSize) || 20)));
  const sortType = Number(payload.sortType) || 3;
  const selfId = cookie ? await resolveNeteaseUserId(cookie) : null;
  const hot = await ncmCall('comment_hot', { cookie, id, type: 0, limit: 15, offset: 0 });
  const newest = await ncmCall('comment_new', { cookie, id, type: 0, pageNo: page, pageSize, sortType });
  const legacy = await ncmCall('comment_music', { cookie, id, limit: pageSize, offset: (page - 1) * pageSize });
  const hotList = (Array.isArray(hot.body?.hotComments) ? hot.body.hotComments : [])
    .map((item) => mapNeteaseComment(item, selfId)).filter(Boolean);
  const data = neteaseRecord(newest.body?.data);
  const list = (Array.isArray(data.comments) ? data.comments
    : Array.isArray(newest.body?.comments) ? newest.body.comments
      : Array.isArray(legacy.body?.comments) ? legacy.body.comments
        : [])
    .map((item) => mapNeteaseComment(item, selfId)).filter(Boolean);
  const total = Number(data.totalCount ?? newest.body?.total ?? legacy.body?.total) || list.length;
  return {
    id,
    selfId,
    total,
    page,
    pageSize,
    hasMore: data.hasMore === true || list.length >= pageSize,
    hot: hotList,
    comments: list,
  };
};

const listNeteaseSimilar = async (id, limit = 10) => {
  const cookie = streamingAccountCookie('netease');
  const size = Math.max(3, Math.min(50, Math.floor(Number(limit) || 10)));
  const result = await ncmCall('simi_song', { cookie, id, limit: size, offset: 0 });
  const songs = Array.isArray(result.body?.songs) ? result.body.songs
    : Array.isArray(neteaseRecord(result.body?.data).songs) ? result.body.data.songs
      : [];
  const tracks = songs.map(neteaseSongTrack).filter(Boolean).slice(0, size);
  return { id, tracks };
};

const wrapNeteaseUnblockResolve = (enabled, forceIds) => {
  const install = () => {
    const original = globalThis.__shinawaseResolveStreamingPlayback;
    if (typeof original !== 'function' || original.__echoUnblockWrapped) return typeof original === 'function';
    const wrapped = async (request) => {
      const provider = String(request?.provider || '');
      const id = String(request?.providerTrackId || '').trim();
      const force = provider === 'netease' && /^\d+$/u.test(id) && (forceIds.has(id) || request?.unblock === true);
      if (force) forceIds.delete(id);
      if (force) {
        const unblocked = await unblockNeteaseSong(id);
        if (unblocked?.url) return unblocked;
      }
      try {
        const source = await original(request);
        if (source?.url) return source;
      } catch (error) {
        if (provider === 'netease' && /^\d+$/u.test(id) && enabled) {
          const unblocked = await unblockNeteaseSong(id);
          if (unblocked?.url) return unblocked;
        }
        throw error;
      }
      if (provider === 'netease' && /^\d+$/u.test(id) && enabled) {
        const unblocked = await unblockNeteaseSong(id);
        if (unblocked?.url) return unblocked;
      }
      throw new Error('streaming_source_unavailable');
    };
    wrapped.__echoUnblockWrapped = true;
    globalThis.__shinawaseResolveStreamingPlayback = wrapped;
    return true;
  };
  if (!install()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (install() || tries > 20) clearInterval(timer);
    }, 500);
  }
};

const activate = (host) => {
  const app = host.electron?.app || host.app;
  if (host.electron) electronRuntime = host.electron;
  logHost = host;
  process.__echoStreamingResolveBilibili = resolveBilibiliAudio;
  globalThis.__echoStreamingResolveBilibili = resolveBilibiliAudio;
  const autoUnblock = host.config?.autoUnblock !== false;
  const forceUnblockIds = new Set();
  wrapNeteaseUnblockResolve(autoUnblock, forceUnblockIds);
  const together = createTogetherService({
    log: (level, message) => { try { host.log(level, message); } catch {} },
    broadcast: (name, payload) => { try { host.broadcast(name, payload); } catch {} },
    electron: host.electron || electronRuntime,
  });
  together.start();

  const musicRoot = () => {
    const override = String(host.config?.musicFolder || '').trim();
    if (override) return resolve(override);
    try {
      const dir = app?.getPath?.('music');
      if (dir) return dir;
    } catch {}
    return join(homedir(), 'Music');
  };

  const streamDirectory = (subfolder) => {
    const cleaned = subfolder == null || subfolder === '' ? '' : sanitizePathPart(subfolder, 'Playlist');
    return cleaned ? join(musicRoot(), 'Stream', cleaned) : join(musicRoot(), 'Stream');
  };

  host.handle('target', (payload) => ({
    ok: true,
    directory: streamDirectory(payload?.subfolder ?? null),
    mainResolveAvailable: typeof globalThis.__shinawaseResolveStreamingPlayback === 'function',
  }));

  // Authenticated 歌单 scan (see listNeteasePlaylistTracks). Errors come back
  // as `ok: false` so the renderer can map `netease_login_required` to a
  // localized "please sign in to NetEase first" message.
  host.handle('neteasePlaylist', async (payload) => {
    const body = payload && typeof payload === 'object' ? payload : {};
    const playlistId = String(body.playlistId || '').trim();
    if (!/^\d+$/u.test(playlistId)) return { ok: false, error: 'invalid_playlist_id' };
    try {
      const playlist = await listNeteasePlaylistTracks(playlistId);
      try { host.log('INFO', `netease playlist ${playlistId}: ${playlist.tracks.length} tracks (auth=${playlist.authenticated}, privacy=${playlist.privacy})`); } catch {}
      return { ok: true, ...playlist };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  host.handle('neteaseDailyPlaylists', async (payload) => {
    const body = payload && typeof payload === 'object' ? payload : {};
    try {
      const result = await listNeteaseDailyPlaylists({ refresh: body.refresh === true });
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  host.handle('neteaseDailyPlaylistTracks', async (payload) => {
    const body = payload && typeof payload === 'object' ? payload : {};
    try {
      const playlist = await listNeteaseDailyPlaylistTracks(body);
      try { host.log('INFO', `netease daily ${playlist.kind}:${playlist.id}: ${playlist.tracks.length} tracks`); } catch {}
      return { ok: true, ...playlist };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  host.handle('qqPlaylist', async (payload) => {
    const body = payload && typeof payload === 'object' ? payload : {};
    const playlistId = String(body.playlistId || '').trim();
    if (!playlistId) return { ok: false, error: 'invalid_playlist_id' };
    try {
      const playlist = await listQqPlaylistTracks(playlistId);
      try { host.log('INFO', `qq playlist ${playlistId}: ${playlist.tracks.length} tracks (auth=${playlist.authenticated})`); } catch {}
      return { ok: true, ...playlist };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  host.handle('probeQualities', async (payload) => {
    const body = payload && typeof payload === 'object' ? payload : {};
    const provider = String(body.provider || '').trim();
    const ids = [...new Set(
      (Array.isArray(body.providerTrackIds) ? body.providerTrackIds : [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean),
    )].slice(0, 1000);
    if (!ids.length) return { ok: true, provider, results: {} };
    const results = provider === 'netease' ? await probeNeteaseQualities(ids)
      : provider === 'qqmusic' ? await probeQqQualities(ids)
      : provider === 'kugou' ? probeKugouQualities(ids)
      : {};
    return { ok: true, provider, results };
  });

  host.handle('downloadToMusic', async (payload) => {
    const body = payload && typeof payload === 'object' ? payload : {};
    const resolved = await resolveAuthenticatedSource(body);
    const url = resolved?.url || String(body.url || '');
    if (!/^https?:\/\//iu.test(url)) throw new Error('invalid_download_url');
    const directory = streamDirectory(body.subfolder ?? null);
    await mkdir(directory, { recursive: true });

    // Prefer the freshly resolved main-process headers (they include the
    // account session); renderer headers are the sanitized fallback for
    // environments where the loader bridge is not installed.
    const headers = resolved ? { ...resolved.headers } : cleanHeaders(body.headers);
    applyProviderHeaders(headers, url, String(body.webpageUrl || ''));
    // Renderer-resolved sources arrive with credentials stripped (ECHO's IPC
    // sanitizes Cookie/Authorization before results reach page scripts).
    // When the loader bridge could not re-resolve in the main process,
    // attach the account session directly so member-only files still fetch.
    const bodyProvider = String(body.provider || '').trim();
    let sessionAttached = false;
    if (!headersCarryCredentials(headers) && (bodyProvider === 'netease' || bodyProvider === 'qqmusic')) {
      const cookie = streamingAccountCookie(bodyProvider);
      if (cookie) {
        headers.Cookie = cookie;
        sessionAttached = true;
      }
    }

    const response = await fetch(url, { headers });
    if (!response.ok || !response.body) throw new Error(`download_http_${response.status}`);
    const extension = sanitizeExtension(resolved?.codec)
      || sanitizeExtension(body.extension)
      || extensionFromMimeType(resolved?.mimeType)
      || extensionFromMimeType(body.mimeType)
      || extensionFromMimeType(response.headers.get('content-type'))
      || extensionFromUrl(url)
      || 'mp3';
    const baseName = sanitizePathPart([body.artist, body.title].filter(Boolean).join(' - '), 'Streaming audio');
    const targetPath = uniquePath(directory, baseName, extension);
    const partialPath = `${targetPath}.part`;
    const totalBytes = Number(response.headers.get('content-length')) || 0;
    const key = String(body.key || targetPath);
    let receivedBytes = 0;
    let progressStamp = 0;
    const progress = new Transform({
      transform(chunk, _encoding, callback) {
        receivedBytes += chunk.length;
        const now = Date.now();
        if (now - progressStamp >= 600) {
          progressStamp = now;
          try {
            host.broadcast('music-download-progress', {
              key,
              receivedBytes,
              totalBytes,
              percent: totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : null,
            });
          } catch {}
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(partialPath));
      await rename(partialPath, targetPath);
    } catch (error) {
      await rm(partialPath, { force: true }).catch(() => {});
      throw error;
    }

    // Tag the saved file. Failures here never fail the download itself.
    let tagged = false;
    try {
      let cover = await fetchCoverImage(body.coverUrl);
      if (!cover && String(body.provider || '') === 'netease' && /^\d+$/u.test(String(body.providerTrackId || '').trim())) {
        // Playlist rows read back from ECHO's library often carry no cover at
        // all; look the album art up through the authenticated song detail.
        const songs = await fetchNeteaseSongDetails([String(body.providerTrackId).trim()]).catch(() => new Map());
        const mapped = mapNeteasePlaylistSong(songs.values().next().value);
        if (mapped?.coverUrl) cover = await fetchCoverImage(mapped.coverUrl);
      }
      if (!cover && String(body.provider || '') === 'qqmusic' && String(body.providerTrackId || '').trim()) {
        try {
          const params = new URLSearchParams({ tpl: 'yqq_song_detail', format: 'json', songmid: String(body.providerTrackId).trim() });
          const data = await probeFetchJson(`https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?${params.toString()}`, {
            headers: qqApiHeaders(),
          });
          const mapped = mapQqPlaylistSong(Array.isArray(data?.data) ? data.data[0] : data);
          if (mapped?.coverUrl) cover = await fetchCoverImage(mapped.coverUrl);
        } catch {}
      }
      const result = await writeAudioTags(targetPath, extension, {
        title: String(body.title || '').trim() || null,
        artist: String(body.artist || '').trim() || null,
        album: String(body.album || '').trim() || null,
        albumArtist: String(body.albumArtist || '').trim() || null,
        trackNo: Number.isFinite(Number(body.trackNo)) && Number(body.trackNo) > 0 ? Math.floor(Number(body.trackNo)) : null,
        comment: String(body.webpageUrl || '').trim() || null,
        cover,
      });
      tagged = result.tagged === true;
      if (!tagged && result.reason && result.reason !== 'unsupported_format') {
        try { host.log('WARN', `tagging skipped for ${targetPath}: ${result.reason}`); } catch {}
      }
    } catch (error) {
      try { host.log('WARN', `tagging failed for ${targetPath}: ${error instanceof Error ? error.message : String(error)}`); } catch {}
    }

    try { host.log('INFO', `saved ${targetPath} (${receivedBytes} bytes, auth=${resolved ? resolved.authenticated : sessionAttached}, tagged=${tagged})`); } catch {}
    return {
      ok: true,
      path: targetPath,
      directory,
      bytes: receivedBytes,
      tagged,
      viaMainResolve: Boolean(resolved),
      authenticated: resolved ? resolved.authenticated : sessionAttached,
    };
  });

  host.handle('togetherStatus', async () => ({ ok: true, ...together.snapshot() }));
  host.handle('togetherCreate', async () => together.create());
  host.handle('togetherAccept', async (payload) => together.accept(payload));
  host.handle('togetherLeave', async () => together.leave());
  host.handle('togetherRestore', async () => together.restore());
  host.handle('togetherInvite', async (payload) => together.invite(payload));
  host.handle('togetherFriends', async (payload) => together.friends(payload));
  host.handle('togetherSyncList', async (payload) => together.syncList(payload));
  host.handle('togetherReport', async (payload) => together.report(payload));
  host.handle('togetherCommand', async (payload) => {
    const body = payload && typeof payload === 'object' ? payload : {};
    return together.playCommand(String(body.commandType || 'PLAY'), body);
  });
  host.handle('togetherRefresh', async () => {
    await together.refresh();
    return { ok: true, ...together.snapshot() };
  });

  host.handle('neteaseComments', async (payload) => {
    const id = neteaseIdText(payload?.id || payload?.songId);
    if (!id) return { ok: false, error: 'invalid_song_id' };
    try { return { ok: true, ...(await listNeteaseComments(id, payload)) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  host.handle('neteaseCommentAdd', async (payload) => {
    const id = neteaseIdText(payload?.id || payload?.songId);
    const content = String(payload?.content || '').trim();
    const replyId = neteaseIdText(payload?.commentId || payload?.replyId);
    if (!id || !content) return { ok: false, error: 'invalid_comment' };
    const cookie = streamingAccountCookie('netease');
    if (!cookie) return { ok: false, error: 'netease_login_required' };
    const params = replyId
      ? { cookie, id, type: 0, t: 2, commentId: replyId, content }
      : { cookie, id, type: 0, t: 1, content };
    const result = await ncmCall('comment', params);
    if (!result.ok) {
      const added = await ncmCall(replyId ? 'comment_reply' : 'comment_add', {
        cookie, id, type: 0, content, cid: replyId, commentId: replyId,
      });
      if (!added.ok) return { ok: false, error: added.error || result.error };
    }
    return { ok: true, ...(await listNeteaseComments(id, { page: 1 })) };
  });
  host.handle('neteaseCommentDelete', async (payload) => {
    const id = neteaseIdText(payload?.id || payload?.songId);
    const cid = neteaseIdText(payload?.commentId || payload?.cid);
    if (!id || !cid) return { ok: false, error: 'invalid_comment' };
    const cookie = streamingAccountCookie('netease');
    if (!cookie) return { ok: false, error: 'netease_login_required' };
    let result = await ncmCall('comment', { cookie, id, type: 0, t: 0, commentId: cid });
    if (!result.ok) result = await ncmCall('comment_delete', { cookie, id, type: 0, cid });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, ...(await listNeteaseComments(id, { page: Number(payload?.page) || 1 })) };
  });
  host.handle('neteaseCommentLike', async (payload) => {
    const id = neteaseIdText(payload?.id || payload?.songId);
    const cid = neteaseIdText(payload?.commentId || payload?.cid);
    if (!id || !cid) return { ok: false, error: 'invalid_comment' };
    const cookie = streamingAccountCookie('netease');
    if (!cookie) return { ok: false, error: 'netease_login_required' };
    const liked = payload?.liked !== false && payload?.t !== 0;
    const result = await ncmCall('comment_like', { cookie, id, type: 0, cid, t: liked ? 1 : 0 });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true };
  });
  host.handle('neteaseSimilar', async (payload) => {
    const id = neteaseIdText(payload?.id || payload?.songId);
    if (!id) return { ok: false, error: 'invalid_song_id' };
    try { return { ok: true, ...(await listNeteaseSimilar(id, payload?.limit)) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  host.handle('neteaseUnblock', async (payload) => {
    const id = neteaseIdText(payload?.id || payload?.songId);
    if (!id) return { ok: false, error: 'invalid_song_id' };
    if (payload?.force === true) forceUnblockIds.add(id);
    const source = await unblockNeteaseSong(id);
    if (!source?.url) return { ok: false, error: 'unblock_failed' };
    return { ok: true, ...source, id };
  });
  host.handle('neteaseCaptcha', async (payload) => {
    const phone = String(payload?.phone || '').replace(/\D/gu, '');
    if (!/^1\d{10}$/u.test(phone) && !/^\d{6,15}$/u.test(phone)) return { ok: false, error: 'invalid_phone' };
    const ctcode = String(payload?.ctcode || payload?.countrycode || '86').replace(/\D/gu, '') || '86';
    const result = await ncmCall('captcha_sent', { phone, ctcode });
    if (!result.ok) {
      const retry = await ncmCall('captcha_sent_v1', { phone, ctcode });
      if (!retry.ok) return { ok: false, error: result.error || retry.error };
    }
    return { ok: true, phone, ctcode };
  });
  host.handle('neteasePhoneLogin', async (payload) => {
    const phone = String(payload?.phone || '').replace(/\D/gu, '');
    const captcha = String(payload?.captcha || '').trim();
    const password = String(payload?.password || '').trim();
    if (!phone) return { ok: false, error: 'invalid_phone' };
    if (!captcha && !password) return { ok: false, error: 'captcha_or_password_required' };
    const countrycode = String(payload?.countrycode || payload?.ctcode || '86').replace(/\D/gu, '') || '86';
    if (captcha) await ncmCall('captcha_verify', { phone, captcha, ctcode: countrycode });
    const result = await ncmCall('login_cellphone', captcha
      ? { phone, countrycode, captcha }
      : { phone, countrycode, password });
    const cookie = String(result.body?.cookie || '').trim();
    if (!result.ok || !cookie) return { ok: false, error: result.error || 'login_failed' };
    capturedProviderCookies.netease = cookie;
    const profile = neteaseRecord(result.body?.profile);
    return {
      ok: true,
      cookie,
      userId: neteaseIdText(profile.userId || result.body?.account?.id),
      nickname: String(profile.nickname || '').trim() || null,
      avatarUrl: neteaseImageUrl(profile.avatarUrl, 120),
    };
  });

  return () => { together.dispose(); };
};

module.exports = activate;
exports.activate = activate;
