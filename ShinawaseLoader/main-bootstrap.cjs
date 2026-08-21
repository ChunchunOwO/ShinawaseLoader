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
    const { session, BrowserWindow } = require('electron');
    const preload = join(loaderRoot, 'streaming-preload.cjs');
    if (existsSync(preload)) {
      const current = session.defaultSession.getPreloads();
      if (!current.includes(preload)) session.defaultSession.setPreloads([...current, preload]);
      result.preload = true;
      for (const window of BrowserWindow.getAllWindows()) {
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
