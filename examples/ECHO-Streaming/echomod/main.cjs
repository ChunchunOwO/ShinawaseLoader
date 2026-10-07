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

const { createWriteStream, existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { createHash, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { mkdir, rename, rm } = require('node:fs/promises');
const { join, resolve, dirname } = require('node:path');
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
  const { timeoutMs = 12_000, ...fetchInit } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...fetchInit, signal: controller.signal });
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

const unwrapNeteaseSong = (song) => {
  if (!song || typeof song !== 'object') return null;
  const nested = [song.song, song.songInfo, song.track, song.simpleSong]
    .find((item) => item && typeof item === 'object' && !Array.isArray(item));
  return nested ? { ...song, ...nested } : song;
};

const mapNeteasePlaylistSong = (song) => {
  const record = unwrapNeteaseSong(song);
  if (!record) return null;
  const id = record.id != null ? String(record.id) : '';
  if (!id) return null;
  const album = (record.al && typeof record.al === 'object' ? record.al : record.album) || {};
  const artists = Array.isArray(record.ar) ? record.ar : Array.isArray(record.artists) ? record.artists : [];
  const artist = artists.map((item) => String(item?.name || '').trim()).filter(Boolean).join(' / ');
  const durationMs = Number(record.dt ?? record.duration) || 0;
  const cover = album.picUrl ?? album.blurPicUrl ?? null;
  return {
    providerTrackId: id,
    title: String(record.name || '').trim() || `NetEase ${id}`,
    artist,
    album: String(album.name || '').trim(),
    albumArtist: artist,
    duration: durationMs > 0 ? durationMs / 1000 : 0,
    coverUrl: neteaseImageUrl(cover, 800),
    coverThumb: neteaseImageUrl(cover, 300),
    qualities: neteaseQualityTiers(record),
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
  const lists = [data.dailySongs, data.orderSongs, body.recommend, data.recommend, data.songs, body.songs, data.list];
  for (const list of lists) {
    if (!Array.isArray(list) || !list.length) continue;
    return list.map(unwrapNeteaseSong).filter(Boolean);
  }
  return [];
};

const neteaseBodyCode = (value) => {
  const body = neteaseRecord(value);
  const code = Number(body.code ?? neteaseRecord(body.data).code);
  return Number.isFinite(code) ? code : null;
};

const assertNeteaseDailyLogin = (body) => {
  const code = neteaseBodyCode(body);
  if (code === 301 || code === 302) throw new Error('netease_session_expired');
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
  const params = afresh ? { cookie, afresh: true } : { cookie };
  const attempts = [
    ['weapi', { ...params, crypto: 'weapi' }],
    ['eapi', { ...params, crypto: 'eapi' }],
    ['default', params],
  ];
  for (const [via, query] of attempts) {
    const body = await ncmInvoke('recommend_songs', query);
    if (!body) continue;
    assertNeteaseDailyLogin(body);
    const songs = dailySongsFromBody(body);
    if (songs.length) return songs;
    const record = neteaseRecord(body);
    const data = neteaseRecord(record.data);
    logMod('WARN', `daily songs empty via ncm ${via}: code=${record.code ?? 'none'} msg=${record.message || record.msg || data.message || 'none'}`);
  }
  for (const init of [
    {
      method: 'POST',
      headers: { ...neteaseApiHeaders(cookie), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(afresh ? { afresh: 'true' } : {}).toString(),
    },
    { headers: neteaseApiHeaders(cookie) },
  ]) {
    try {
      const body = await probeFetchJson('https://music.163.com/api/v3/discovery/recommend/songs', init);
      assertNeteaseDailyLogin(body);
      const songs = dailySongsFromBody(body);
      if (songs.length) return songs;
    } catch (error) {
      logMod('WARN', `daily songs http fallback: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return [];
};

/*
 * One 日推 fetch serves both surfaces.
 *
 * The 每日推荐 set is only stable while the account keeps the same batch: the
 * panel can request "换一批" (`afresh`), and after that the *server-side*
 * daily set for the session has moved. If the panel and the library write each
 * fetched on their own, the two would drift apart again — the exact class of bug
 * this file now owns. So the last non-empty batch is cached briefly and reused;
 * an explicit `afresh` request refreshes the cache instead of bypassing it.
 */
const neteaseDailySongsTtlMs = 10 * 60 * 1000;
let neteaseDailySongsCache = { at: 0, slot: '', account: '', songs: [] };

// 网易在 6:00（Asia/Shanghai，无夏令时）换当天的日推：UTC 时间往前挪 22 小时
// 之后的日期，就是这一时刻所属的"日推日"。
const neteaseDailySlot = (timestamp) => new Date(timestamp - 22 * 60 * 60 * 1000).toISOString().slice(0, 10);

const getNeteaseDailySongs = async (cookie, afresh = false) => {
  const now = Date.now();
  const slot = neteaseDailySlot(now);
  // 只留指纹，不留 cookie。
  const account = createHash('sha256').update(cookie).digest('hex').slice(0, 16);
  const cached = neteaseDailySongsCache;
  const reusable = cached.songs.length > 0 && cached.account === account && cached.slot === slot
    && now - cached.at < neteaseDailySongsTtlMs;
  if (!afresh && reusable) return cached.songs;
  const songs = await fetchNeteaseDailySongs(cookie, afresh);
  if (songs.length) neteaseDailySongsCache = { at: now, slot, account, songs };
  return songs;
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

const mapNeteaseAccountPlaylist = (playlistValue, userId) => {
  const record = neteaseRecord(playlistValue);
  const providerPlaylistId = neteaseIdText(record.id ?? record.playlistId);
  const title = String(record.name || '').trim();
  if (!providerPlaylistId || !title) return null;
  const creator = neteaseRecord(record.creator);
  const creatorUserId = neteaseIdText(creator.userId ?? creator.userid);
  const cover = record.coverImgUrl ?? record.picUrl ?? record.coverUrl ?? null;
  const ownership = creatorUserId && creatorUserId === userId
    ? 'created'
    : record.subscribed === true || record.ordered === true
      ? 'favorited'
      : 'unknown';
  return {
    id: `streaming:netease:playlist:${providerPlaylistId}`,
    provider: 'netease',
    providerPlaylistId,
    title,
    name: title,
    description: String(record.description || '').trim() || null,
    creator: String(creator.nickname || creator.name || record.creatorName || '').trim() || null,
    coverUrl: neteaseImageUrl(cover, 600),
    coverThumb: neteaseImageUrl(cover, 160),
    trackCount: Number(record.trackCount ?? record.size ?? record.songCount) || 0,
    ownership,
    webUrl: `https://music.163.com/#/playlist?id=${encodeURIComponent(providerPlaylistId)}`,
  };
};

const listNeteaseAccountPlaylists = async () => {
  const session = streamingAccountSession('netease');
  const cookie = session.cookie;
  if (!cookie) throw new Error('netease_login_required');
  const userId = await resolveNeteaseUserId(cookie);
  if (!userId) throw new Error('netease_login_required');

  const bodies = [];
  let body = await ncmInvoke('user_playlist', { cookie, uid: userId, limit: 1000, offset: 0 });
  if (body) bodies.push(body);
  try {
    const params = new URLSearchParams({ uid: userId, limit: '1000', offset: '0', includeVideo: 'true' });
    bodies.push(await probeFetchJson(`https://music.163.com/api/user/playlist?${params.toString()}`, {
      headers: neteaseApiHeaders(cookie),
    }));
  } catch (error) {
    if (!bodies.length) throw error;
  }

  const playlists = [];
  const seen = new Set();
  for (const item of bodies) {
    const record = neteaseRecord(item);
    const lists = Array.isArray(record.playlist) ? record.playlist
      : Array.isArray(neteaseRecord(record.data).playlist) ? neteaseRecord(record.data).playlist
      : [];
    for (const entry of lists) {
      const mapped = mapNeteaseAccountPlaylist(entry, userId);
      if (!mapped || seen.has(mapped.providerPlaylistId)) continue;
      seen.add(mapped.providerPlaylistId);
      playlists.push(mapped);
    }
  }
  if (!playlists.length) {
    logMod('WARN', `netease account playlists empty (${session.detail || 'session ok'})`);
  }
  return { playlists, authenticated: true, userId };
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

  const [dailySongs, radarLists, resources, dates] = await Promise.all([
    getNeteaseDailySongs(cookie, refresh).catch((error) => {
      logMod('WARN', `daily songs: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }),
    fetchNeteaseRadarPlaylists(cookie).catch(() => []),
    fetchNeteaseRecommendResources(cookie).catch(() => []),
    fetchNeteaseHistoryDates(cookie).catch(() => []),
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

  for (const item of radarLists.slice(0, 4)) push(mapDailyPlaylistCard(item, 'radar'));

  for (const item of resources.slice(0, 8)) {
    const id = neteaseIdText(item?.id);
    if (!id) continue;
    push(mapDailyPlaylistCard(item, 'resource'));
  }

  for (const date of dates.slice(0, 4)) {
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
    const songs = await getNeteaseDailySongs(cookie, afresh);
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

/*
 * 每日推荐 → ECHO 曲库，由 mod 自己写。
 *
 * ECHO 的 `streaming.refreshNeteaseDailyRecommend()` 走的是 core 里的
 * `NeteaseStreamingProvider.getDailyRecommendPlaylist`：它依赖
 * `@neteasecloudmusicapienhanced/api` 生成签名请求，那个包不存在时退化为明文 GET
 * `/api/v3/discovery/recommend/songs`。不带 weapi 载荷的 GET 会被网易当成游客
 * 请求，返回游客日推 —— 于是"流媒体音乐"入口（本 mod：带 cookie 的 POST）和落到
 * 歌单里的内容是两套互不相干的歌。这里改成取数复用本文件已经带登录态的路径，写库
 * 按 core `StreamingCacheStore` 的列与语义自己完成，两个入口从此共用同一个集合。
 *
 * 落库形状对齐 core：`streaming_tracks` 按 (provider, provider_track_id) upsert；
 * `playlists` 按 (source_provider, source_playlist_id) 复用同一行；`playlist_items`
 * 整单替换但保留已下载条目（media_type='track' 且 added_from 以 'streaming-download'
 * 打头），kind 直接写 'manual'，省掉 core 写完再靠 fixSyncedPlaylistKinds 改回
 * 可删除状态的那一步。
 */
const neteaseReferer = 'https://music.163.com/';
const neteaseDailyProviderPlaylistId = 'daily-recommend';
const neteaseDailyPlaylistTitle = '每日推荐';
const neteaseDailyPlaylistDescription = '根据网易云音乐账号生成，每天 6:00 更新。';
const neteaseStreamingQualities = ['standard', 'high', 'lossless', 'hires'];
const neteaseStreamingDownloadPrefix = 'streaming-download:';

const echoImageProxyUrl = (url, referer) => (url ? `echo-image://remote/${encodeURIComponent(url)}?referer=${encodeURIComponent(referer)}` : null);

// StreamingTrack 形状（core 的 mapSong + upsertTrack 落库列）：日推的原始 song
// 记录里有 al.id / ar[].id / mvid / fee，这些是 core 写库时会填的列，缺了会把
// 已有行的 album_id 覆盖成 null，所以从原始记录取，而不是只取面板用的精简字段。
const neteaseStreamTrack = (song) => {
  const mapped = mapNeteasePlaylistSong(song);
  if (!mapped) return null;
  const record = unwrapNeteaseSong(song);
  const album = neteaseRecord(record.al && typeof record.al === 'object' ? record.al : record.album);
  const stableKey = `streaming:netease:${mapped.providerTrackId}`;
  const probed = neteaseStreamingQualities.filter((name) => (mapped.qualities || []).some((tier) => tier?.quality === name));
  const track = {
    id: stableKey,
    provider: 'netease',
    providerTrackId: mapped.providerTrackId,
    stableKey,
    title: mapped.title,
    artist: mapped.artist,
    artists: (Array.isArray(record.ar) ? record.ar : Array.isArray(record.artists) ? record.artists : [])
      .map((item) => {
        const providerArtistId = neteaseIdText(item?.id);
        const name = String(item?.name || '').trim();
        return providerArtistId && name ? { id: `streaming:netease:artist:${providerArtistId}`, provider: 'netease', providerArtistId, name } : null;
      })
      .filter(Boolean),
    album: mapped.album,
    albumId: neteaseIdText(album.id),
    albumArtist: mapped.albumArtist,
    duration: mapped.duration > 0 ? mapped.duration : null,
    coverUrl: echoImageProxyUrl(mapped.coverUrl, neteaseReferer),
    coverThumb: echoImageProxyUrl(mapped.coverThumb || mapped.coverUrl, neteaseReferer),
    // 探到真实档位就用探到的（含 hires），否则退回 core 按 fee 推断的三档。
    qualities: probed.length ? probed : (Number(record.fee) === 1 ? ['standard', 'high'] : neteaseStreamingQualities.slice(0, 3)),
    explicit: false,
    playable: true,
    unavailableReason: null,
    lyricsStatus: 'available',
    mvStatus: neteaseIdText(record.mvid ?? record.mv) ? 'available' : 'unknown',
  };
  return { ...track, raw: JSON.stringify(track) };
};

// 同一批里网易偶尔会重复给同一首歌；重复行会让歌单出现两遍同样的条目。
const neteaseStreamTracks = (songs) => {
  const seen = new Set();
  const tracks = [];
  for (const song of songs) {
    const track = neteaseStreamTrack(song);
    if (!track || seen.has(track.providerTrackId)) continue;
    seen.add(track.providerTrackId);
    tracks.push(track);
  }
  return tracks;
};

const lookupPlaylistText = (value) => (typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase() : '');

const playlistMetadataKey = (input) => {
  const title = lookupPlaylistText(input.title);
  const artist = lookupPlaylistText(input.artist);
  if (!title || !artist) return null;
  const duration = Number(input.duration);
  const album = lookupPlaylistText(input.album);
  const rounded = Number.isFinite(duration) && duration > 0 ? String(Math.round(duration)) : '';
  return [title, artist, album, rounded].join('\u001f');
};

// ECHO 的曲库就是一个普通 SQLite 文件，主进程侧没有开放的写库 IPC，所以直接开库。
// 与 fixSyncedPlaylistKinds 共用发现逻辑：appData 下带 playlists 表的
// echo-library.sqlite，取 mtime 最新的那个。
const openEchoLibraryDatabase = (host) => {
  const app = host.app || host.electron?.app;
  if (!app?.getPath) throw new Error('app_unavailable');
  const fs = require('node:fs');
  const Database = require(join(process.resourcesPath, 'app.asar', 'node_modules', 'better-sqlite3'));
  const appData = app.getPath('appData');
  const userData = app.getPath('userData');
  const seen = new Set();
  const candidates = [];
  const addCandidate = (directory) => {
    if (!directory) return;
    const databasePath = join(directory, 'echo-library.sqlite');
    if (seen.has(databasePath)) return;
    seen.add(databasePath);
    if (existsSync(databasePath)) candidates.push(databasePath);
  };
  addCandidate(userData);
  addCandidate(join(userData, 'library'));
  let names = [];
  try { names = fs.readdirSync(appData); } catch {}
  for (const name of names) {
    if (!/echo/i.test(name)) continue;
    addCandidate(join(appData, name));
    addCandidate(join(appData, name, 'library'));
  }
  let databasePath = null;
  for (const candidate of candidates) {
    try {
      const probe = new Database(candidate, { readonly: true });
      const hasPlaylists = probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'playlists'").get();
      probe.close();
      if (!hasPlaylists) continue;
      if (!databasePath || fs.statSync(candidate).mtimeMs > fs.statSync(databasePath).mtimeMs) databasePath = candidate;
    } catch {}
  }
  if (!databasePath) throw new Error('library_database_not_found');
  return { database: new Database(databasePath), databasePath };
};

const upsertNeteaseStreamTracks = (database, tracks, timestamp) => {
  const statement = database.prepare(`
    INSERT INTO streaming_tracks (
      id, provider, provider_track_id, stable_key, title, artist, album, album_id,
      album_artist, duration, cover_url, cover_id, qualities_json, playable,
      unavailable_reason, lyrics_status, mv_status, raw_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_track_id) DO UPDATE SET
      id = excluded.id,
      stable_key = excluded.stable_key,
      title = excluded.title,
      artist = excluded.artist,
      album = excluded.album,
      album_id = COALESCE(excluded.album_id, streaming_tracks.album_id),
      album_artist = excluded.album_artist,
      duration = excluded.duration,
      cover_url = COALESCE(excluded.cover_url, streaming_tracks.cover_url),
      qualities_json = excluded.qualities_json,
      playable = excluded.playable,
      unavailable_reason = excluded.unavailable_reason,
      lyrics_status = excluded.lyrics_status,
      mv_status = excluded.mv_status,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at`);
  for (const track of tracks) {
    statement.run(
      track.id, track.provider, track.providerTrackId, track.stableKey, track.title, track.artist,
      track.album, track.albumId, track.albumArtist, track.duration, track.coverUrl ?? track.coverThumb,
      null, JSON.stringify(track.qualities), track.playable ? 1 : 0, track.unavailableReason,
      track.lyricsStatus, track.mvStatus, track.raw, timestamp, timestamp,
    );
  }
  return tracks.length;
};

const upsertNeteaseDailyPlaylist = (database, tracks, timestamp) => {
  const existing = database
    .prepare('SELECT id, created_at FROM playlists WHERE source_provider = ? AND source_playlist_id = ? LIMIT 1')
    .get('netease', neteaseDailyProviderPlaylistId);
  const playlistId = existing?.id || randomUUID();
  // 与 core 一致：封面取第一条带封面的曲目，而不是死用第一首。
  const coverTrack = tracks.find((item) => item.coverUrl || item.coverThumb);
  database.prepare(`
    INSERT INTO playlists (
      id, name, description, kind, source_provider, source_playlist_id,
      cover_id, cover_url, sort_mode, item_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      kind = excluded.kind,
      source_provider = excluded.source_provider,
      source_playlist_id = excluded.source_playlist_id,
      cover_url = excluded.cover_url,
      sort_mode = excluded.sort_mode,
      updated_at = excluded.updated_at`)
    .run(
      playlistId, neteaseDailyPlaylistTitle, neteaseDailyPlaylistDescription, 'manual', 'netease',
      neteaseDailyProviderPlaylistId, null, coverTrack?.coverUrl || coverTrack?.coverThumb || null,
      'manual', 0, existing?.created_at || timestamp, timestamp,
    );
  return playlistId;
};

/*
 * 整单替换前先把"已经下载到本地"的条目挑出来。
 *
 * 日推里的一首歌被下载到 音乐/Stream 之后，core 会把那条 playlist_items 改写成
 * media_type='track' + added_from='streaming-download:netease:<id>'，指向本地
 * 文件；重建歌单时若按 stream_track 重新插入，本地文件就从歌单里消失了。
 * 键与 core 一致：优先 provider:providerTrackId，再按标题/歌手/专辑/时长兜底。
 */
const collectDownloadedPlaylistItems = (database, playlistId, timestamp) => {
  const rows = database.prepare(`
    SELECT media_id, source_provider, source_item_id, title_snapshot, artist_snapshot,
           album_snapshot, duration_snapshot, cover_id, added_at, added_from
    FROM playlist_items
    WHERE playlist_id = ?
      AND media_type = 'track'
      AND (added_from = 'streaming-download' OR added_from LIKE 'streaming-download:%')`).all(playlistId);
  const bySource = new Map();
  const byMetadata = new Map();
  const add = (map, key, item) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  };
  for (const row of rows) {
    if (!row.media_id) continue;
    const item = {
      mediaId: String(row.media_id),
      sourceProvider: row.source_provider || 'local',
      sourceItemId: row.source_item_id || null,
      titleSnapshot: row.title_snapshot || null,
      artistSnapshot: row.artist_snapshot || null,
      albumSnapshot: row.album_snapshot || null,
      durationSnapshot: Number.isFinite(Number(row.duration_snapshot)) ? Number(row.duration_snapshot) : null,
      coverId: row.cover_id || null,
      addedAt: row.added_at || timestamp,
    };
    const addedFrom = String(row.added_from || '');
    if (addedFrom.startsWith(neteaseStreamingDownloadPrefix)) add(bySource, addedFrom.slice(neteaseStreamingDownloadPrefix.length), item);
    add(byMetadata, playlistMetadataKey(item), item);
  }
  return { bySource, byMetadata };
};

const dropPreservedPlaylistItem = (preservation, item) => {
  for (const map of [preservation.bySource, preservation.byMetadata]) {
    for (const [key, list] of map.entries()) {
      const index = list.indexOf(item);
      if (index >= 0) list.splice(index, 1);
      if (!list.length) map.delete(key);
    }
  }
};

const takePreservedPlaylistItem = (preservation, track) => {
  const metadataKey = playlistMetadataKey(track);
  const item = preservation.bySource.get(`netease:${track.providerTrackId}`)?.shift()
    || (metadataKey ? preservation.byMetadata.get(metadataKey)?.shift() : null)
    || null;
  if (item) dropPreservedPlaylistItem(preservation, item);
  return item;
};

const replaceNeteaseDailyPlaylistItems = (database, playlistId, tracks, timestamp) => {
  const preservation = collectDownloadedPlaylistItems(database, playlistId, timestamp);
  database.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(playlistId);
  const insert = database.prepare(`
    INSERT INTO playlist_items (
      id, playlist_id, media_type, media_id, source_provider, source_item_id,
      title_snapshot, artist_snapshot, album_snapshot, duration_snapshot,
      cover_id, position, added_at, added_from, unavailable
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  tracks.forEach((track, position) => {
    const preserved = takePreservedPlaylistItem(preservation, track);
    insert.run(
      randomUUID(), playlistId, preserved ? 'track' : 'stream_track',
      preserved?.mediaId ?? track.stableKey,
      preserved?.sourceProvider ?? track.provider,
      preserved?.sourceItemId ?? track.providerTrackId,
      track.title, track.artist, track.album, track.duration,
      preserved?.coverId ?? null, position, preserved?.addedAt ?? timestamp,
      preserved ? `${neteaseStreamingDownloadPrefix}${track.provider}:${track.providerTrackId}` : 'netease-daily-recommend',
      0,
    );
  });
  database.prepare(`
    UPDATE playlists SET
      item_count = (SELECT COUNT(*) FROM playlist_items WHERE playlist_id = ?),
      updated_at = ?
     WHERE id = ?`).run(playlistId, timestamp, playlistId);
  return tracks.length;
};

const writeNeteaseDailyRecommend = async (host) => {
  const session = streamingAccountSession('netease');
  if (!session.cookie) throw new Error('netease_login_required');
  const tracks = neteaseStreamTracks(await getNeteaseDailySongs(session.cookie, false));
  if (!tracks.length) throw new Error('netease_daily_empty');
  const { database } = openEchoLibraryDatabase(host);
  try {
    const timestamp = new Date().toISOString();
    const written = database.transaction(() => {
      upsertNeteaseStreamTracks(database, tracks, timestamp);
      const playlistId = upsertNeteaseDailyPlaylist(database, tracks, timestamp);
      return { playlistId, importedCount: replaceNeteaseDailyPlaylistItems(database, playlistId, tracks, timestamp) };
    })();
    logMod('INFO', `netease daily library: ${written.importedCount} tracks (session=${session.source || 'none'})`);
    return {
      ...written,
      playlistName: neteaseDailyPlaylistTitle,
      provider: 'netease',
      providerPlaylistId: neteaseDailyProviderPlaylistId,
    };
  } finally {
    database.close();
  }
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

const qqGtkFromCookie = (cookie) => {
  const skey = qqCookieValue(cookie, 'qqmusic_key', 'qm_keyst', 'music_key', 'p_skey', 'skey') || '';
  let hash = 5381;
  for (const char of skey) hash += (hash << 5) + char.charCodeAt(0);
  return hash & 2147483647;
};

const qqPlaylistTitleOf = (record) => firstQqText(record, [
  'dissname', 'diss_name', 'dirName', 'dirname', 'dir_name', 'name', 'title', 'titleName',
]);

const qqPlaylistIdOf = (record) => firstQqText(record, [
  'dissid', 'disstid', 'diss_id', 'dissId', 'tid', 'dirid', 'dirId', 'dir_id', 'playlistId', 'id',
]);

const collectQqPlaylistRecords = (value, depth = 0) => {
  if (depth > 8 || !value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectQqPlaylistRecords(item, depth + 1));
  const record = value;
  const title = qqPlaylistTitleOf(record);
  const id = qqPlaylistIdOf(record);
  const current = title && id && id !== '0' ? [record] : [];
  return [...current, ...Object.values(record).flatMap((item) => collectQqPlaylistRecords(item, depth + 1))];
};

const mapQqAccountPlaylistRow = (record, ownership) => {
  const providerPlaylistId = qqPlaylistIdOf(record);
  const title = qqPlaylistTitleOf(record);
  if (!providerPlaylistId || providerPlaylistId === '0' || !title) return null;
  const cover = firstQqText(record, ['logo', 'imgurl', 'diss_cover', 'picurl', 'cover_url', 'coverUrl', 'pic']);
  const liked = /我喜欢|我喜歡|^like$/iu.test(title);
  return {
    id: `streaming:qqmusic:playlist:${providerPlaylistId}`,
    provider: 'qqmusic',
    providerPlaylistId,
    title,
    description: firstQqText(record, ['introduction', 'desc', 'description']) || null,
    creator: firstQqText(record, ['nickname', 'username', 'hostname', 'creator']) || null,
    coverUrl: cover || null,
    coverThumb: cover || null,
    trackCount: Number(record.song_count ?? record.songCount ?? record.songnum ?? record.song_cnt ?? record.total_song_num) || null,
    ownership: liked ? 'favorited' : ownership,
    webUrl: `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(providerPlaylistId)}`,
  };
};

const qqMusicu = async (cookie, req) => {
  const uin = qqUinFromCookie(cookie);
  const gtk = qqGtkFromCookie(cookie);
  return probeFetchJson('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: { ...qqApiHeaders(cookie), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comm: {
        cv: 4747474,
        ct: 24,
        format: 'json',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        notice: 0,
        platform: 'yqq.json',
        needNewCode: 1,
        uin,
        g_tk: gtk,
        g_tk_new_20200303: gtk,
      },
      req_0: req,
    }),
  });
};

const fetchQqProfileAsset = async (cookie, uin, reqtype) => {
  const gtk = String(qqGtkFromCookie(cookie));
  const params = new URLSearchParams({
    loginUin: uin,
    hostUin: uin,
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: '0',
    platform: 'yqq.json',
    needNewCode: '0',
    g_tk: gtk,
    g_tk_new_20200303: gtk,
    ct: '20',
    cid: '205360956',
    userid: uin,
    reqtype: String(reqtype),
    sin: '0',
    ein: '999',
  });
  return probeFetchJson(`https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?${params.toString()}`, {
    headers: qqApiHeaders(cookie),
  });
};

const listQqAccountPlaylists = async () => {
  const session = streamingAccountSession('qqmusic');
  const cookie = session.cookie;
  const uin = qqUinFromCookie(cookie);
  if (!cookie || uin === '0') throw new Error('qq_login_required');
  const gtk = String(qqGtkFromCookie(cookie));
  const rows = [];
  const push = (records, ownership) => {
    for (const record of records || []) {
      const mapped = mapQqAccountPlaylistRow(record, ownership);
      if (mapped) rows.push(mapped);
    }
  };

  try {
    const params = new URLSearchParams({
      hostuin: uin,
      uin,
      loginUin: uin,
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: '0',
      platform: 'yqq.json',
      needNewCode: '0',
      g_tk: gtk,
      g_tk_new_20200303: gtk,
      sin: '0',
      size: '100',
    });
    const data = await probeFetchJson(`https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?${params.toString()}`, {
      headers: qqApiHeaders(cookie),
    });
    push(collectQqPlaylistRecords(data), 'created');
  } catch {}

  const createdMusicu = [
    { module: 'music.playlist.PlaylistSquare', method: 'GetPlaylistByUin', param: { uin, offset: 0, size: 100 } },
    { module: 'music.musicasset.PlaylistPrivatelyRead', method: 'PlaylistGetLists', param: { uin: Number(uin) || uin, offset: 0, size: 100 } },
    { module: 'playlist.PlayListManageSvr', method: 'get_playlist_by_userid', param: { uin, offset: 0, limit: 100 } },
  ];
  for (const req of createdMusicu) {
    try { push(collectQqPlaylistRecords(await qqMusicu(cookie, req)), 'created'); } catch {}
  }

  try { push(collectQqPlaylistRecords(await fetchQqProfileAsset(cookie, uin, 3)), 'favorited'); } catch {}
  try {
    const likedData = await fetchQqProfileAsset(cookie, uin, 2);
    const likedRecords = collectQqPlaylistRecords(likedData);
    const liked = likedRecords.find((item) => /我喜欢|我喜歡|like/iu.test(qqPlaylistTitleOf(item) || ''));
    if (liked) push([liked], 'favorited');
    else if (likedRecords[0]) push([likedRecords[0]], 'favorited');
  } catch {}

  const playlists = [];
  const seen = new Set();
  for (const item of rows) {
    if (seen.has(item.providerPlaylistId)) continue;
    seen.add(item.providerPlaylistId);
    playlists.push(item);
  }
  if (!playlists.length) {
    logMod('WARN', `qq account playlists empty (${session.detail || 'session ok'})`);
  }
  return { playlists, authenticated: true, userId: uin };
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
    g_tk: String(qqGtkFromCookie(cookie) || 5381),
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
        comm: {
          ct: 24,
          cv: 0,
          uin: qqUinFromCookie(cookie),
          g_tk: qqGtkFromCookie(cookie),
        },
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

const ncmOkCode = (value) => value === 200 || value === 201;

const ncmCall = async (name, params) => {
  const body = await ncmInvoke(name, params);
  if (body == null) return { ok: false, error: `ncm_${name}_unavailable`, body: null, code: null };
  const record = neteaseRecord(body);
  const nested = neteaseRecord(record.data);
  const code = Number(record.code);
  const nestedCode = Number(nested.code);
  if (Number.isFinite(code) && !ncmOkCode(code)) {
    return { ok: false, error: String(record.message || record.msg || nested.message || nested.msg || `ncm_${name}_${code}`), body: record, code };
  }
  if (!Number.isFinite(code) && Number.isFinite(nestedCode) && !ncmOkCode(nestedCode)) {
    return { ok: false, error: String(nested.message || nested.msg || record.message || record.msg || `ncm_${name}_${nestedCode}`), body: record, code: nestedCode };
  }
  return { ok: true, body: record, code: Number.isFinite(code) ? code : (ncmOkCode(nestedCode) ? nestedCode : 200) };
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

// The loader resolves NetEase playback with Electron's net.fetch, and Chromium
// owns the Cookie header there: a manually set one is dropped in favour of the
// session jar, which holds no music.163.com login. Verified against the live
// endpoint — same URL, same headers: net.fetch answers code -110 / url null for
// a VIP-only track while Node's fetch answers 200 with a playable URL, and the
// bridge therefore reports 这首歌暂时不可播放 for an entitled account. Free tracks
// are unaffected, which is why only 会员歌曲 break. Ask the very endpoint the
// bridge uses, over a transport that carries the session, before delegating.
const neteasePlaybackLadder = [
  { level: 'jymaster', bitrate: 2_000_000, encode: 'flac' },
  { level: 'sky', bitrate: 1_500_000, encode: 'flac' },
  { level: 'jyeffect', bitrate: 1_500_000, encode: 'flac' },
  { level: 'hires', bitrate: 999_000, encode: 'flac' },
  { level: 'lossless', bitrate: 999_000, encode: 'flac' },
  { level: 'exhigh', bitrate: 320_000, encode: 'mp3' },
  { level: 'higher', bitrate: 192_000, encode: 'mp3' },
  { level: 'standard', bitrate: 128_000, encode: 'mp3' },
];
const neteaseQualityFloors = { standard: 'standard', high: 'exhigh', lossless: 'lossless', hires: 'jymaster' };
const neteasePlaybackTimeoutMs = 4_000;
const neteasePlaybackBudgetMs = 8_000;

const neteaseSessionPlayback = async (request) => {
  const id = String(request?.providerTrackId || '').trim();
  if (!/^\d+$/u.test(id)) return null;
  const cookie = streamingAccountCookie('netease');
  if (!cookie) return null;
  const floor = neteaseQualityFloors[String(request?.quality || '')];
  const start = Math.max(0, neteasePlaybackLadder.findIndex((row) => row.level === (floor ?? 'lossless')));
  const csrfToken = /__csrf=([^;]+)/u.exec(cookie)?.[1] ?? '';
  const deadline = Date.now() + neteasePlaybackBudgetMs;
  for (const candidate of neteasePlaybackLadder.slice(start)) {
    if (Date.now() > deadline) break;
    const params = new URLSearchParams({
      ids: JSON.stringify([id]),
      level: candidate.level,
      br: String(candidate.bitrate),
      encodeType: candidate.encode,
      csrf_token: csrfToken,
      os: 'pc',
    });
    let row;
    try {
      const data = await probeFetchJson(
        `https://music.163.com/api/song/enhance/player/url/v1?${params.toString()}`,
        { headers: neteaseApiHeaders(cookie), timeoutMs: neteasePlaybackTimeoutMs },
      );
      row = Array.isArray(data?.data) ? data.data[0] : null;
    } catch (error) {
      logMod('WARN', `netease session playback: ${candidate.level} request failed, ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    const url = typeof row?.url === 'string' ? row.url : '';
    if (!/^https?:/iu.test(url)) continue;
    const type = String(row.type || candidate.encode).toLowerCase();
    return {
      provider: 'netease',
      providerTrackId: id,
      url,
      expiresAt: new Date(Date.now() + 4 * 60_000).toISOString(),
      mimeType: type === 'flac' ? 'audio/flac' : 'audio/mpeg',
      bitrate: Number(row.br) > 0 ? Number(row.br) : candidate.bitrate,
      sampleRate: null,
      bitDepth: null,
      codec: type,
      headers: neteaseApiHeaders(cookie),
      requiresProxy: false,
      supportsRange: true,
    };
  }
  return null;
};

// Wrapping is per module instance: a hot reload disposes this instance (which
// puts the loader's own resolver back) before the next instance wraps it again,
// so the chain stays one layer deep instead of stacking a stale resolver that
// would keep serving playback through whatever code was loaded first.
const ownResolveWrappers = new WeakSet();

const wrapNeteaseUnblockResolve = (enabled, forceIds) => {
  let uninstall = null;
  let timer = 0;
  let tries = 0;
  const install = () => {
    const original = globalThis.__shinawaseResolveStreamingPlayback;
    if (typeof original !== 'function') return false;
    if (ownResolveWrappers.has(original)) return true;
    const wrapped = async (request) => {
      const provider = String(request?.provider || '');
      const id = String(request?.providerTrackId || '').trim();
      const neteaseTrack = provider === 'netease' && /^\d+$/u.test(id);
      const force = neteaseTrack && (forceIds.has(id) || request?.unblock === true);
      if (force) forceIds.delete(id);
      if (force) {
        const unblocked = await unblockNeteaseSong(id);
        if (unblocked?.url) return unblocked;
      }
      if (neteaseTrack) {
        const sessionSource = await neteaseSessionPlayback(request);
        if (sessionSource?.url) return sessionSource;
      }
      try {
        const source = await original(request);
        if (source?.url) return source;
      } catch (error) {
        if (neteaseTrack && enabled) {
          const unblocked = await unblockNeteaseSong(id);
          if (unblocked?.url) return unblocked;
        }
        throw error;
      }
      if (neteaseTrack && enabled) {
        const unblocked = await unblockNeteaseSong(id);
        if (unblocked?.url) return unblocked;
      }
      throw new Error('streaming_source_unavailable');
    };
    wrapped.__echoUnblockWrapped = true;
    ownResolveWrappers.add(wrapped);
    globalThis.__shinawaseResolveStreamingPlayback = wrapped;
    uninstall = () => {
      if (globalThis.__shinawaseResolveStreamingPlayback === wrapped) {
        globalThis.__shinawaseResolveStreamingPlayback = original;
      }
    };
    return true;
  };
  if (!install()) {
    timer = setInterval(() => {
      tries += 1;
      if (install() || tries > 20) clearInterval(timer);
    }, 500);
  }
  return () => {
    clearInterval(timer);
    uninstall?.();
    uninstall = null;
  };
};

// 26.9.26 moved the playlist page's delete button onto library:manage-playlists
// {action:'delete'}, and Echo Core's manage() only accepts local playlists, so every
// imported streaming playlist fails with "Select an editable local playlist." The legacy
// library:delete-playlist channel reaches the same core through mutate(), which has no
// such limit, so fall back to it for that one action and error — everything else is
// passed through untouched.
const PLAYLIST_MANAGE_CHANNEL = 'library:manage-playlists';
const PLAYLIST_DELETE_CHANNEL = 'library:delete-playlist';
const protectedSystemPlaylistIds = new Set(['liked-tracks', 'liked-albums', 'daily-recommend']);

const isProtectedSystemPlaylist = (host, playlistId) => {
  let database;
  try {
    ({ database } = openEchoLibraryDatabase(host));
    const row = database.prepare('SELECT kind, source_playlist_id FROM playlists WHERE id = ?').get(playlistId);
    if (!row) return false;
    return row.kind === 'system' && protectedSystemPlaylistIds.has(String(row.source_playlist_id ?? ''));
  } catch (error) {
    logMod('WARN', `playlist delete fallback: protected check failed, ${error instanceof Error ? error.message : String(error)}`);
    return true;
  } finally {
    try { database?.close(); } catch {}
  }
};

const installPlaylistDeleteFallback = (host) => {
  const ipcMain = host.ipcMain;
  const handlers = ipcMain?._invokeHandlers;
  if (typeof ipcMain?.handle !== 'function' || !(handlers instanceof Map)) return () => {};
  let original = handlers.get(PLAYLIST_MANAGE_CHANNEL);
  while (typeof original?.__echoPlaylistDeleteFallback === 'function') original = original.__echoPlaylistDeleteFallback;
  const legacyDelete = handlers.get(PLAYLIST_DELETE_CHANNEL);
  if (typeof original !== 'function' || typeof legacyDelete !== 'function') return () => {};
  const wrapped = async (event, request, ...rest) => {
    try {
      return await original(event, request, ...rest);
    } catch (error) {
      const playlistId = String(request?.playlistId || '');
      const guarded = /editable local playlist/iu.test(String(error?.message || error));
      if (request?.action !== 'delete' || !playlistId || !guarded || isProtectedSystemPlaylist(host, playlistId)) throw error;
      await legacyDelete(event, playlistId);
      logMod('INFO', `playlist delete fallback: ${playlistId}`);
      // No core historyId: this path writes no recovery journal, so the page must not
      // offer an undo it cannot perform.
      return { playlistId, itemIds: [], state: 'committed' };
    }
  };
  wrapped.__echoPlaylistDeleteFallback = original;
  ipcMain.removeHandler(PLAYLIST_MANAGE_CHANNEL);
  ipcMain.handle(PLAYLIST_MANAGE_CHANNEL, wrapped);
  return () => {
    if (handlers.get(PLAYLIST_MANAGE_CHANNEL) !== wrapped) return;
    try { ipcMain.removeHandler(PLAYLIST_MANAGE_CHANNEL); } catch {}
    try { ipcMain.handle(PLAYLIST_MANAGE_CHANNEL, original); } catch {}
  };
};

const activate = (host) => {
  const app = host.electron?.app || host.app;
  if (host.electron) electronRuntime = host.electron;
  logHost = host;
  process.__echoStreamingResolveBilibili = resolveBilibiliAudio;
  globalThis.__echoStreamingResolveBilibili = resolveBilibiliAudio;
  const autoUnblock = host.config?.autoUnblock !== false;
  const forceUnblockIds = new Set();
  const uninstallNeteaseResolveWrapper = wrapNeteaseUnblockResolve(autoUnblock, forceUnblockIds);
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

  host.handle('qqAccountPlaylists', async () => {
    try {
      const result = await listQqAccountPlaylists();
      try { host.log('INFO', `qq account playlists: ${result.playlists.length} (uin=${result.userId})`); } catch {}
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  host.handle('neteaseAccountPlaylists', async () => {
    try {
      const result = await listNeteaseAccountPlaylists();
      try { host.log('INFO', `netease account playlists: ${result.playlists.length} (uid=${result.userId})`); } catch {}
      return { ok: true, ...result };
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

  host.handle('neteaseDailyRecommendSync', async () => {
    try { return { ok: true, ...(await writeNeteaseDailyRecommend(host)) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  });

  host.handle('fixSyncedPlaylistKinds', async () => {
    try {
      const { database, databasePath } = openEchoLibraryDatabase(host);
      try {
        const result = database.prepare(
          "UPDATE playlists SET kind = 'manual', updated_at = ? WHERE kind IN ('synced', 'system') AND source_provider IN ('netease', 'qqmusic', 'spotify')"
        ).run(new Date().toISOString());
        return { ok: true, fixed: result.changes, databasePath };
      } finally {
        database.close();
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const uninstallPlaylistDeleteFallback = installPlaylistDeleteFallback(host);

  return () => { uninstallNeteaseResolveWrapper(); uninstallPlaylistDeleteFallback(); };
};

module.exports = activate;
exports.activate = activate;
