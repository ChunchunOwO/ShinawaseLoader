'use strict';

const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const startShinawaseMainBootstrap = async () => {
  if (globalThis.__shinawaseMainBootstrap) return { ok: true, already: true };
  globalThis.__shinawaseMainBootstrap = true;
  const loaderRoot = process.env.ECHO_MOD_HOME || join(__dirname);
  const result = { ok: true, streaming: false, native: false, preload: false };

  try {
    const { app, session, BrowserWindow } = require('electron');
    const isAuxiliary = (window) => {
      try {
        const href = window.webContents.getURL();
        return /[?&](desktopLyrics|pet|miniPlayer)=1/i.test(href) || /auxiliary\.html/i.test(href);
      } catch { return false; }
    };
    const remapAuxiliaryLoad = (window) => {
      if (window.__shinawaseAuxLoadPatched) return;
      window.__shinawaseAuxLoadPatched = true;
      const original = window.loadFile.bind(window);
      window.loadFile = (file, options = {}) => {
        const query = options.query || {};
        if ((query.desktopLyrics === '1' || query.pet === '1') && /index\.html$/i.test(String(file))) {
          file = String(file).replace(/index\.html$/i, 'auxiliary.html');
        }
        return original(file, options);
      };
      window.webContents.on('did-finish-load', () => {
        try {
          const href = window.webContents.getURL();
          if ((/[?&](desktopLyrics|pet)=1/i.test(href)) && /index\.html/i.test(href)) {
            void window.loadURL(href.replace(/index\.html/i, 'auxiliary.html'));
          }
        } catch {}
      });
      window.webContents.on('render-process-gone', () => {
        try {
          const href = window.webContents.getURL();
          if (/desktopLyrics=1/i.test(href) || window.getTitle() === 'ECHO Desktop Lyrics') window.destroy();
          if (/pet=1/i.test(href) || window.getTitle() === 'ECHO Pet') window.destroy();
        } catch {}
      });
    };
    for (const window of BrowserWindow.getAllWindows()) remapAuxiliaryLoad(window);
    app.on('browser-window-created', (_event, window) => remapAuxiliaryLoad(window));
    result.auxiliary = true;
    const preload = join(loaderRoot, 'streaming-preload.cjs');
    if (existsSync(preload)) {
      const current = session.defaultSession.getPreloads();
      if (!current.includes(preload)) session.defaultSession.setPreloads([...current, preload]);
      result.preload = true;
      for (const window of BrowserWindow.getAllWindows()) {
        if (isAuxiliary(window)) continue;
        try { window.webContents.reload(); } catch {}
      }
    }
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
