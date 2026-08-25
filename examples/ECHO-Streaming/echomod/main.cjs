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

const { createWriteStream, existsSync } = require('node:fs');
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

const fetchCoverImage = async (coverUrl) => {
  const url = String(coverUrl || '').trim();
  if (!/^https?:\/\//iu.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { headers: { 'User-Agent': defaultUserAgent }, signal: controller.signal });
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

const activate = (host) => {
  const app = host.electron?.app || host.app;

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
      const cover = await fetchCoverImage(body.coverUrl);
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

    try { host.log('INFO', `saved ${targetPath} (${receivedBytes} bytes, auth=${resolved ? resolved.authenticated : false}, tagged=${tagged})`); } catch {}
    return {
      ok: true,
      path: targetPath,
      directory,
      bytes: receivedBytes,
      tagged,
      viaMainResolve: Boolean(resolved),
      authenticated: resolved ? resolved.authenticated : false,
    };
  });

  return () => {};
};

module.exports = activate;
exports.activate = activate;
