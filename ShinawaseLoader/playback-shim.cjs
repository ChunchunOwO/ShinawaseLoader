'use strict';

const http = require('node:http');
const https = require('node:https');
const { randomBytes } = require('node:crypto');

const CHANNELS = {
  play: 'playback:play-media-item',
  resolve: 'playback:resolve-media-item',
  prepare: 'playback:prepare-media-item',
};
const SKIP = new Set(['m3u8', 'spotify']);

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

const resolvePlayback = async (item, forceRefresh) => {
  const resolve = globalThis.__shinawaseResolveStreamingPlayback;
  if (typeof resolve !== 'function') throw new Error('streaming_bridge_not_ready');
  const source = await resolve({
    provider: item.provider,
    providerTrackId: item.providerTrackId,
    quality: item.quality || item.streamingQuality,
    forceRefresh: forceRefresh === true,
  });
  if (!source?.url) throw new Error('streaming_source_unavailable');
  return source;
};

const installProxy = () => {
  if (globalThis.__shinawaseMediaProxy) return globalThis.__shinawaseMediaProxy;
  const tokens = new Map();
  const server = http.createServer((req, res) => {
    const token = String(req.url || '/').split('?')[0].replace(/^\//, '').split('/')[0];
    const entry = tokens.get(token);
    if (!entry || entry.expires < Date.now()) {
      res.statusCode = 404;
      res.end();
      return;
    }
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
  });
  server.listen(0, '127.0.0.1');
  const api = {
    urlFor(source) {
      const token = randomBytes(12).toString('hex');
      tokens.set(token, {
        url: source.url,
        headers: source.headers && typeof source.headers === 'object' ? source.headers : {},
        expires: Date.now() + 12 * 60 * 1000,
      });
      const addr = server.address();
      return `http://127.0.0.1:${addr.port}/${token}`;
    },
  };
  globalThis.__shinawaseMediaProxy = api;
  return api;
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

const asLocalRequest = (raw, item, source) => {
  const proxy = installProxy();
  return {
    ...(raw && typeof raw === 'object' ? raw : {}),
    item: {
      mediaType: 'local',
      path: proxy.urlFor(source),
      trackId: String(item.trackId || item.stableKey || item.id || `${item.provider}:${item.providerTrackId}`),
      title: item.title || '',
      artist: item.artist || '',
      album: item.album || '',
      albumArtist: item.albumArtist || null,
      duration: Number(item.duration) || null,
      coverThumb: item.coverThumb || null,
    },
    automix: stripStreamingChain(raw?.automix),
    gapless: stripStreamingChain(raw?.gapless),
  };
};

const asResolvedSource = (item, source) => {
  const proxy = installProxy();
  return {
    filePath: proxy.urlFor(source),
    inputHeaders: undefined,
    mimeType: source.mimeType || null,
    durationSeconds: Number(item.duration) || null,
    probe: {
      durationSeconds: Number(item.duration) || undefined,
      codec: source.codec || undefined,
      bitrate: source.bitrate || undefined,
    },
  };
};

const wrappedChannels = new Set();

const wrapChannel = (ipcMain, channel, wrapper) => {
  if (wrappedChannels.has(channel)) return true;
  const map = invokeMap(ipcMain);
  const current = map?.get(channel);
  if (typeof current !== 'function') return false;
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (event, ...args) => wrapper(current, event, ...args));
  wrappedChannels.add(channel);
  return true;
};

const installStreamingPlaybackShim = (host = {}) => {
  if (globalThis.__shinawasePlaybackShim?.ok) return globalThis.__shinawasePlaybackShim;
  const electron = host.electron || (() => { try { return require('electron'); } catch { return null; } })();
  const ipcMain = host.ipcMain || electron?.ipcMain;
  const result = { ok: false, play: false, resolve: false, prepare: false };
  if (!ipcMain) {
    globalThis.__shinawasePlaybackShim = result;
    return result;
  }

  result.play = wrapChannel(ipcMain, CHANNELS.play, async (original, event, raw) => {
    const item = streamingItem(raw);
    if (!item) return original(event, raw);
    const source = await resolvePlayback(item, raw?.forceRefresh);
    return original(event, asLocalRequest(raw, item, source));
  });
  result.resolve = wrapChannel(ipcMain, CHANNELS.resolve, async (original, event, raw) => {
    const item = streamingItem(raw);
    if (!item) return original(event, raw);
    const source = await resolvePlayback(item, raw?.forceRefresh);
    return asResolvedSource(item, source);
  });
  result.prepare = wrapChannel(ipcMain, CHANNELS.prepare, async (original, event, raw) => {
    const item = streamingItem(raw);
    if (!item) return original(event, raw);
    try {
      const source = await resolvePlayback(item, raw?.forceRefresh);
      return original(event, asLocalRequest(raw, item, source));
    } catch {
      return undefined;
    }
  });
  result.ok = result.play && result.resolve;
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
