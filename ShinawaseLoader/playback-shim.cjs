'use strict';

const http = require('node:http');
const https = require('node:https');
const { randomBytes } = require('node:crypto');

// Stock asar still registers these exact IpcChannels strings.
const CHANNELS = {
  play: 'playback:play-media-item',
  resolve: 'playback:resolve-media-item',
  prepare: 'playback:prepare-media-item',
};
const SKIP = new Set(['m3u8', 'spotify']);
const BILI_HEADERS = {
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};
const hasHeader = (headers, name) => Object.keys(headers || {}).some((key) => key.toLowerCase() === name.toLowerCase());
const withProviderHeaders = (source, item) => {
  const headers = source?.headers && typeof source.headers === 'object' ? { ...source.headers } : {};
  if (String(item?.provider) === 'bilibili') {
    if (!hasHeader(headers, 'Referer')) headers.Referer = BILI_HEADERS.Referer;
    if (!hasHeader(headers, 'Origin')) headers.Origin = BILI_HEADERS.Origin;
    if (!hasHeader(headers, 'User-Agent')) headers['User-Agent'] = BILI_HEADERS['User-Agent'];
  }
  return { ...source, headers };
};
const qualityChain = (item) => {
  const requested = item.quality || item.streamingQuality || 'lossless';
  if (String(item.provider) !== 'bilibili') return [requested];
  return [requested, 'high', 'standard', 'lossless'].filter((item, index, all) => item && all.indexOf(item) === index);
};

const invokeMap = (ipcMain) => {
  if (ipcMain?._invokeHandlers instanceof Map) return ipcMain._invokeHandlers;
  for (const key of Object.getOwnPropertyNames(ipcMain || {})) {
    try {
      const value = ipcMain[key];
      if (value instanceof Map) return value;
    } catch {}
  }
  return null;
};

const streamingItem = (raw) => {
  const item = raw && typeof raw === 'object' ? raw.item : null;
  if (!item || item.mediaType !== 'streaming' || !item.provider || SKIP.has(String(item.provider))) return null;
  return item;
};

const resolvePlayback = async (item, forceRefresh, quality) => {
  const resolve = globalThis.__shinawaseResolveStreamingPlayback;
  if (typeof resolve !== 'function') throw new Error('streaming_bridge_not_ready');
  const source = await resolve({
    provider: item.provider,
    providerTrackId: item.providerTrackId,
    quality: quality || item.quality || item.streamingQuality,
    forceRefresh: forceRefresh === true,
  });
  if (!source?.url) throw new Error('streaming_source_unavailable');
  return withProviderHeaders(source, item);
};

const resolveBilibiliFallback = async (item) => {
  const fallback = process.__echoStreamingResolveBilibili || globalThis.__echoStreamingResolveBilibili;
  if (typeof fallback !== 'function') return null;
  const source = await fallback(item);
  return source?.url ? withProviderHeaders(source, item) : null;
};

const resolvePlaybackRetry = async (item, forceRefresh) => {
  let lastError = null;
  for (const quality of qualityChain(item)) {
    try {
      return await resolvePlayback(item, forceRefresh, quality);
    } catch (error) {
      lastError = error;
    }
  }
  if (forceRefresh !== true) {
    for (const quality of qualityChain(item)) {
      try {
        return await resolvePlayback(item, true, quality);
      } catch (error) {
        lastError = error;
      }
    }
  }
  try {
    const fallback = await resolveBilibiliFallback(item);
    if (fallback) return fallback;
  } catch (error) {
    lastError = error;
  }
  throw lastError || new Error('streaming_source_unavailable');
};

const staleStatus = (code) => code === 404 || code === 403 || code === 410;

const installProxy = () => {
  if (globalThis.__shinawaseMediaProxy) return globalThis.__shinawaseMediaProxy;
  const tokens = new Map();
  const pipeUpstream = (req, res, entry, retried) => {
    let target;
    try { target = new URL(entry.url); } catch {
      res.statusCode = 502;
      res.end();
      return;
    }
    const headers = { ...(entry.headers || {}) };
    if (req.headers.range) headers.Range = req.headers.range;
    const lib = target.protocol === 'https:' ? https : http;
    const upstream = lib.request(entry.url, { method: 'GET', headers }, (up) => {
      if (staleStatus(up.statusCode) && entry.item && retried !== true) {
        up.resume();
        resolvePlayback(entry.item, true).then((source) => {
          entry.url = source.url;
          entry.headers = source.headers && typeof source.headers === 'object' ? source.headers : {};
          pipeUpstream(req, res, entry, true);
        }).catch(() => {
          if (!res.headersSent) res.statusCode = 404;
          res.end();
        });
        return;
      }
      const pass = {};
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition']) {
        if (up.headers[name]) pass[name] = up.headers[name];
      }
      res.writeHead(up.statusCode || 502, pass);
      up.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.statusCode = 502;
      res.end();
    });
    req.on('close', () => upstream.destroy());
    upstream.end();
  };
  const server = http.createServer((req, res) => {
    // Accept /<token> and /<token>.flac so exclusive/ASIO daemon remote
    // format detection can use a file extension on opaque proxy URLs.
    const leaf = String(req.url || '/').split('?')[0].replace(/^\//, '').split('/')[0];
    const token = leaf.replace(/\.[a-z0-9]+$/iu, '');
    const entry = tokens.get(token) || tokens.get(leaf);
    if (!entry || entry.expires < Date.now()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    pipeUpstream(req, res, entry, false);
  });
  server.listen(0, '127.0.0.1');
  const api = {
    urlFor(source, item) {
      const token = randomBytes(12).toString('hex');
      tokens.set(token, {
        url: source.url,
        headers: source.headers && typeof source.headers === 'object' ? source.headers : {},
        item: item || null,
        expires: Date.now() + 12 * 60 * 1000,
      });
      const addr = server.address();
      return `http://127.0.0.1:${addr.port}/${token}${extensionForSource(source, item)}`;
    },
  };
  globalThis.__shinawaseMediaProxy = api;
  return api;
};

const positiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const extensionForSource = (source, item) => {
  const codec = String(source?.codec || item?.codec || '').toLowerCase();
  const mime = String(source?.mimeType || item?.mimeType || '').toLowerCase();
  if (codec.includes('flac') || mime.includes('flac')) return '.flac';
  if (codec.includes('wav') || mime.includes('wav')) return '.wav';
  if (codec.includes('ogg') || codec.includes('opus') || mime.includes('ogg') || mime.includes('opus')) return '.ogg';
  if (codec.includes('aac') || codec.includes('mp4a') || codec === 'm4a' || codec === 'mp4' || mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) return '.m4a';
  if (codec.includes('mp3') || mime.includes('mpeg')) return '.mp3';
  try {
    const pathname = new URL(String(source?.url || '')).pathname.toLowerCase();
    const match = pathname.match(/\.(flac|mp3|m4a|aac|ogg|opus|wav|m4s)(?:$|\?)/u);
    if (match) return match[1] === 'm4s' || match[1] === 'aac' ? '.m4a' : `.${match[1]}`;
  } catch {}
  // Opaque URLs still need an extension so native daemon remote playback
  // (exclusive / ASIO / DSP) can admit the source without a probed codec.
  return '.mp3';
};

const buildStreamingProbe = (item, source) => {
  const durationSeconds = positiveNumber(item?.duration) || positiveNumber(source?.durationSeconds);
  // Default 44.1 kHz when the provider omits rate so SRC / SDM / dither can
  // still build a sample-rate plan; the daemon may correct the real rate later.
  const fileSampleRate = positiveNumber(source?.sampleRate) || positiveNumber(item?.sampleRate) || 44100;
  const bitDepth = positiveNumber(source?.bitDepth) || positiveNumber(item?.bitDepth);
  const bitrate = positiveNumber(source?.bitrate) || positiveNumber(item?.bitrate);
  const channels = positiveNumber(source?.channels) || positiveNumber(item?.channels) || 2;
  const extension = extensionForSource(source, item);
  const codec = (typeof source?.codec === 'string' && source.codec.trim())
    || (typeof item?.codec === 'string' && item.codec.trim())
    || (extension === '.flac' ? 'flac' : extension === '.m4a' ? 'aac' : 'mp3');
  return {
    durationSeconds,
    fileSampleRate,
    channels,
    codec,
    bitDepth,
    bitrate,
  };
};

const stripStreamingChain = (options) => {
  if (!options || typeof options !== 'object') return options;
  const next = { ...options };
  if (next.nextItem?.mediaType === 'streaming') next.nextItem = null;
  if (Array.isArray(next.upcomingItems)) {
    next.upcomingItems = next.upcomingItems.filter((row) => row?.mediaType !== 'streaming');
  }
  return next;
};

// Never strip DSP / output fields when falling back to the local proxy path.
const preserveOutputSettings = (raw) => {
  const output = raw?.output;
  if (!output || typeof output !== 'object') return output;
  return { ...output };
};

const asLocalRequest = (raw, item, source) => {
  const proxy = installProxy();
  const probe = buildStreamingProbe(item, source);
  // Fallback path when Steam still rejects non-m3u8 streaming: local HTTP
  // proxy + full probe/output so exclusive, ASIO, EQ, SRC, SDM, and dither
  // can enter the native daemon processing path.
  return {
    ...(raw && typeof raw === 'object' ? raw : {}),
    output: preserveOutputSettings(raw),
    item: {
      mediaType: 'local',
      path: proxy.urlFor(source, item),
      trackId: String(item.trackId || item.stableKey || item.id || `${item.provider}:${item.providerTrackId}`),
      title: item.title || '',
      artist: item.artist || '',
      album: item.album || '',
      albumArtist: item.albumArtist || null,
      duration: probe.durationSeconds || null,
      coverThumb: item.coverThumb || null,
      sampleRate: probe.fileSampleRate || null,
      codec: probe.codec || null,
      bitDepth: probe.bitDepth || null,
      bitrate: probe.bitrate || null,
      channels: probe.channels || null,
      mimeType: source.mimeType || item.mimeType || null,
    },
    probe,
    automix: stripStreamingChain(raw?.automix),
    gapless: stripStreamingChain(raw?.gapless),
  };
};

const asResolvedSource = (item, source) => {
  const proxy = installProxy();
  const probe = buildStreamingProbe(item, source);
  return {
    filePath: proxy.urlFor(source, item),
    inputHeaders: undefined,
    mimeType: source.mimeType || item.mimeType || null,
    durationSeconds: probe.durationSeconds || null,
    probe,
  };
};

const steamStreamingBlocked = (error) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /not available in the Steam distribution|Streaming playback bridge is unavailable|must be an object|m3u8/iu.test(message)
    || /Streaming provider did not return a playable URL/iu.test(message);
};

const playStreamingViaShim = async (original, event, raw, item) => {
  // Prefer the asar-patched native streaming path (HTTPS URL + inputHeaders +
  // remembered output). That is what carries EQ / SRC / SDM / dither the same
  // way local files do. Only fall back to the localhost proxy when Steam still
  // rejects non-m3u8 streaming.
  try {
    return await original(event, raw);
  } catch (error) {
    if (!steamStreamingBlocked(error)) throw error;
    const source = await resolvePlaybackRetry(item, raw?.forceRefresh);
    return original(event, asLocalRequest(raw, item, source));
  }
};

const wrappedChannels = new Set();

const wrapChannel = (ipcMain, channel, wrapper) => {
  if (wrappedChannels.has(channel)) return true;
  const map = invokeMap(ipcMain);
  const current = map?.get(channel);
  if (typeof current !== 'function') return false;
  ipcMain.removeHandler(channel);
  wrappedChannels.add(channel);
  ipcMain.handle(channel, (event, ...args) => wrapper(current, event, ...args));
  return true;
};

// Electron 43 may hide ipcMain._invokeHandlers. Hook handle() so a later
// official registerPlaybackIpc still gets wrapped, and so inspector bootstrap
// that races whenReady still catches the Steam m3u8-only reject.
const installHandleHook = (ipcMain, wrappers) => {
  if (!ipcMain || ipcMain.__shinawaseHandleHook) return Boolean(ipcMain?.__shinawaseHandleHook);
  const original = typeof ipcMain.handle === 'function' ? ipcMain.handle.bind(ipcMain) : null;
  if (!original) return false;
  try {
    ipcMain.handle = (channel, listener) => {
      const wrap = wrappers.get(channel);
      if (wrap && typeof listener === 'function' && !wrappedChannels.has(channel)) {
        wrappedChannels.add(channel);
        return original(channel, (event, ...args) => wrap(listener, event, ...args));
      }
      return original(channel, listener);
    };
    ipcMain.__shinawaseHandleHook = true;
    return true;
  } catch {
    return false;
  }
};

const installStreamingPlaybackShim = (host = {}) => {
  if (globalThis.__shinawasePlaybackShim?.ok) return globalThis.__shinawasePlaybackShim;
  const electron = host.electron || (() => { try { return require('electron'); } catch { return null; } })();
  const ipcMain = host.ipcMain || electron?.ipcMain;
  const result = { ok: false, play: false, resolve: false, prepare: false, handleHook: false };
  if (!ipcMain) {
    globalThis.__shinawasePlaybackShim = result;
    return result;
  }

  const wrappers = new Map([
    [CHANNELS.play, async (original, event, raw) => {
      const item = streamingItem(raw);
      if (!item) return original(event, raw);
      return playStreamingViaShim(original, event, raw, item);
    }],
    [CHANNELS.resolve, async (original, event, raw) => {
      const item = streamingItem(raw);
      if (!item) return original(event, raw);
      try {
        return await original(event, raw);
      } catch (error) {
        if (!steamStreamingBlocked(error)) throw error;
        const source = await resolvePlaybackRetry(item, raw?.forceRefresh);
        return asResolvedSource(item, source);
      }
    }],
    [CHANNELS.prepare, async (original, event, raw) => {
      const item = streamingItem(raw);
      if (!item) return original(event, raw);
      try {
        return await playStreamingViaShim(original, event, raw, item);
      } catch {
        return undefined;
      }
    }],
  ]);
  result.handleHook = installHandleHook(ipcMain, wrappers);

  result.play = wrapChannel(ipcMain, CHANNELS.play, wrappers.get(CHANNELS.play));
  result.resolve = wrapChannel(ipcMain, CHANNELS.resolve, wrappers.get(CHANNELS.resolve));
  result.prepare = wrapChannel(ipcMain, CHANNELS.prepare, wrappers.get(CHANNELS.prepare));
  result.ok = (result.play && result.resolve) || result.handleHook;
  host.log?.(`playback shim play=${result.play} resolve=${result.resolve} prepare=${result.prepare}`);
  globalThis.__shinawasePlaybackShim = result;

  if (!result.ok && !globalThis.__shinawasePlaybackShimRetry) {
    globalThis.__shinawasePlaybackShimRetry = true;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 15000) {
        clearInterval(timer);
        globalThis.__shinawasePlaybackShimRetry = false;
        return;
      }
      const again = installStreamingPlaybackShim(host);
      if (again?.ok) {
        clearInterval(timer);
        globalThis.__shinawasePlaybackShimRetry = false;
      }
    }, 400);
  }
  return result;
};

module.exports = { installStreamingPlaybackShim };
exports.installStreamingPlaybackShim = installStreamingPlaybackShim;
