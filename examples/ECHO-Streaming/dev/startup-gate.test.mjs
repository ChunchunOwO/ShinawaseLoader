// Regression: main.cjs activates inside app.whenReady(), before ECHO creates its
// main window. activate() used to start the together poll inline, and with a
// signed-in NetEase account that poll required the NCM client synchronously
// (~1500 modules), delaying the main window by seconds on every launch.
//
// node --test examples/ECHO-Streaming/dev/startup-gate.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ncmLoaded = () => Object.keys(require.cache).some((file) => file.includes('@neteasecloudmusicapienhanced'));

const fakeHost = () => {
  const app = new EventEmitter();
  const broadcasts = [];
  return {
    app,
    broadcasts,
    host: {
      id: 'echo.community-streaming',
      electron: { app, BrowserWindow: { getAllWindows: () => [] } },
      app,
      config: {},
      ipcMain: null,
      log() {},
      broadcast(name) { broadcasts.push(name); },
      handle() { return () => {}; },
    },
  };
};

const loadingWindow = () => {
  const contents = new EventEmitter();
  contents.isLoading = () => true;
  contents.isDestroyed = () => false;
  return { webContents: contents };
};

test('activate() leaves the NCM client unloaded until the main window settles', (t) => {
  // A signed-in account is what made the first poll reach the NCM client.
  globalThis.__shinawaseStreamingAccountCookie = () => 'MUSIC_U=startup-gate-test';
  t.after(() => { delete globalThis.__shinawaseStreamingAccountCookie; });
  const activate = require('../echomod/main.cjs');
  const { app, host } = fakeHost();

  const dispose = activate(host);
  try {
    assert.equal(ncmLoaded(), false, 'activate() loaded the NCM client during startup');
    assert.equal(app.listenerCount('browser-window-created'), 1);

    // A window finishing its load only arms the settle delay; nothing runs inline.
    const window = loadingWindow();
    app.emit('browser-window-created', {}, window);
    assert.equal(window.webContents.listenerCount('did-finish-load'), 1);
    window.webContents.emit('did-finish-load');
    assert.equal(ncmLoaded(), false);
  } finally {
    dispose();
  }
  assert.equal(app.listenerCount('browser-window-created'), 0, 'dispose() left the window listener behind');
  assert.equal(ncmLoaded(), false);
});

test('the together poll starts once the main window has loaded and settled', async () => {
  // No account: the poll reports a signed-out state without touching the network.
  const activate = require('../echomod/main.cjs');
  const { app, broadcasts, host } = fakeHost();
  const dispose = activate(host);
  try {
    const window = loadingWindow();
    app.emit('browser-window-created', {}, window);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.deepEqual(broadcasts, [], 'polled before the main window loaded');
    window.webContents.emit('did-finish-load');
    await new Promise((resolve) => setTimeout(resolve, 4500));
    assert.ok(broadcasts.includes('together-state'), 'the startup poll never ran');
    assert.equal(app.listenerCount('browser-window-created'), 0, 'the startup gate kept its listener after firing');
  } finally {
    dispose();
  }
});
