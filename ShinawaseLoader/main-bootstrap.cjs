'use strict';

// Inspector bootstrap for echo-steam 26.8.28 / Electron 43.3.
// Registers auxiliary remap, streaming preload, playback shim, and the
// in-process native host. session.setPreloads is deprecated; prefer
// registerPreloadScript so extra preloads still run in the isolated world
// alongside official out/preload/index.mjs (contextIsolation true, sandbox false).

const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { installAuxiliaryRemap } = require('./auxiliary-remap.cjs');

const STREAMING_PRELOAD_ID = 'shinawase-streaming-preload';
const AUX_PARTITIONS = ['echo-mini-player', 'echo-pet', 'echo-desktop-lyrics'];

const loadElectron = () => {
  try { return require('electron'); } catch {}
  try {
    const builtin = process.getBuiltinModule?.('electron');
    if (builtin) return builtin;
  } catch {}
  return null;
};

const sessionAlreadyHasPreload = (ses, preload) => {
  if (!ses || !preload) return false;
  try {
    if (typeof ses.getPreloadScripts === 'function') {
      const scripts = ses.getPreloadScripts() || [];
      if (scripts.some((item) => item?.id === STREAMING_PRELOAD_ID || item?.filePath === preload)) return true;
    }
  } catch {}
  try {
    if (typeof ses.getPreloads === 'function' && ses.getPreloads().includes(preload)) return true;
  } catch {}
  return false;
};

const installStreamingPreloadOnSession = (ses, preload) => {
  if (!ses || !preload || !existsSync(preload)) return { ok: false, mode: 'missing' };
  if (ses.__shinawaseStreamingPreload) return { ok: true, mode: ses.__shinawaseStreamingPreload, already: true };
  if (sessionAlreadyHasPreload(ses, preload)) {
    ses.__shinawaseStreamingPreload = 'already';
    return { ok: true, mode: 'already', already: true };
  }
  if (typeof ses.registerPreloadScript === 'function') {
    try {
      ses.registerPreloadScript({ id: STREAMING_PRELOAD_ID, type: 'frame', filePath: preload });
      ses.__shinawaseStreamingPreload = 'registerPreloadScript';
      return { ok: true, mode: 'registerPreloadScript' };
    } catch (error) {
      try {
        ses.registerPreloadScript({ type: 'frame', filePath: preload });
        ses.__shinawaseStreamingPreload = 'registerPreloadScript';
        return { ok: true, mode: 'registerPreloadScript' };
      } catch {
        if (!sessionAlreadyHasPreload(ses, preload) && typeof ses.setPreloads !== 'function') {
          return { ok: false, mode: 'registerPreloadScript-failed', error: error instanceof Error ? error.message : String(error) };
        }
      }
    }
  }
  if (typeof ses.setPreloads === 'function') {
    const current = typeof ses.getPreloads === 'function' ? ses.getPreloads() : [];
    if (!current.includes(preload)) ses.setPreloads([...current, preload]);
    ses.__shinawaseStreamingPreload = 'setPreloads';
    return { ok: true, mode: 'setPreloads' };
  }
  return { ok: false, mode: 'unavailable' };
};

const collectSessions = (electron) => {
  const sessions = [];
  const seen = new Set();
  const add = (ses) => {
    if (!ses || seen.has(ses)) return;
    seen.add(ses);
    sessions.push(ses);
  };
  add(electron?.session?.defaultSession);
  for (const name of AUX_PARTITIONS) {
    try { add(electron?.session?.fromPartition?.(name)); } catch {}
  }
  try {
    for (const window of electron?.BrowserWindow?.getAllWindows?.() || []) {
      add(window?.webContents?.session);
    }
  } catch {}
  return sessions;
};

const startShinawaseMainBootstrap = async () => {
  if (globalThis.__shinawaseMainBootstrap) return { ok: true, already: true };
  globalThis.__shinawaseMainBootstrap = true;
  const loaderRoot = process.env.ECHO_MOD_HOME || join(__dirname);
  const result = { ok: true, streaming: false, native: false, preload: false, auxiliary: false, preloadMode: null };

  const electron = loadElectron();
  if (electron?.app && typeof electron.app.whenReady === 'function' && !electron.app.isReady()) {
    try { await electron.app.whenReady(); } catch {}
  }

  try {
    const { app, session, BrowserWindow } = electron || {};
    result.auxiliary = installAuxiliaryRemap({ app, session, BrowserWindow });
    const preload = join(loaderRoot, 'streaming-preload.cjs');
    const installed = [];
    for (const ses of collectSessions(electron)) {
      const item = installStreamingPreloadOnSession(ses, preload);
      installed.push(item);
      if (item.ok) {
        result.preload = true;
        result.preloadMode = result.preloadMode || item.mode;
      } else if (item.error && !result.preloadError) {
        result.preloadError = item.error;
      }
    }
    if (app?.on && session) {
      const watch = (_event, window) => {
        try { installStreamingPreloadOnSession(window?.webContents?.session, preload); } catch {}
      };
      app.on('browser-window-created', watch);
      app.on('session-created', (ses) => {
        try { installStreamingPreloadOnSession(ses, preload); } catch {}
      });
    }
    result.preloadSessions = installed.filter((item) => item.ok).length;
    // Do not reload existing windows here. Reloading during ECHO's startup
    // overlay traps the renderer on the splash screen. Extra preloads apply
    // to documents loaded after this point; the CDP echo proxy covers the
    // current session.
  } catch (error) {
    result.preloadError = error instanceof Error ? error.message : String(error);
  }

  const bridge = join(loaderRoot, 'streaming-bridge.cjs');
  if (existsSync(bridge) && !globalThis.__shinawaseStreamingBridge) {
    try {
      const loaded = require(bridge);
      loaded.registerShinawaseStreamingBridge?.();
      globalThis.__shinawaseStreamingBridge = true;
      result.streaming = true;
    } catch (error) {
      result.streamingError = error instanceof Error ? error.message : String(error);
    }
  }

  try {
    const { installStreamingPlaybackShim } = require(join(loaderRoot, 'playback-shim.cjs'));
    result.playbackShim = installStreamingPlaybackShim({ electron });
  } catch (error) {
    result.playbackShimError = error instanceof Error ? error.message : String(error);
  }

  const native = join(loaderRoot, 'native-host.cjs');
  if (existsSync(native) && !globalThis.__shinawaseNativeHost) {
    try {
      const module = await import(pathToFileURL(native).href);
      globalThis.__shinawaseNativeHost = module.startShinawaseNativeHost?.() || module.default?.startShinawaseNativeHost?.();
      result.native = true;
    } catch (error) {
      result.nativeError = error instanceof Error ? error.message : String(error);
    }
  }

  return result;
};

module.exports = { startShinawaseMainBootstrap };
exports.startShinawaseMainBootstrap = startShinawaseMainBootstrap;
