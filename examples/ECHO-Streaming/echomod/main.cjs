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

const activate = (host) => {
  const app = host.electron?.app || host.app;
  if (host.electron) electronRuntime = host.electron;
  logHost = host;

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

  return () => {};
};

module.exports = activate;
exports.activate = activate;
