// Regression: main.cjs activates inside app.whenReady(), before ECHO creates its
// main window. activate() used to start the listen-together poll inline, and
// with a signed-in NetEase account that poll required the NCM client
// synchronously (~1500 modules), delaying the main window by seconds on every
// launch. Listen-together and comments are gone since 1.7.0; activate() must
// still leave the NCM client unloaded and register only the remaining methods.
//
// node --test examples/ECHO-Streaming/dev/startup-gate.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ncmLoaded = () => Object.keys(require.cache).some((file) => file.includes('@neteasecloudmusicapienhanced'));

test('activate() is cheap: no NCM client, no listen-together or comment methods', (t) => {
  // A signed-in account is what made the old startup poll reach the NCM client.
  globalThis.__shinawaseStreamingAccountCookie = () => 'MUSIC_U=startup-gate-test';
  t.after(() => { delete globalThis.__shinawaseStreamingAccountCookie; });
  const activate = require('../echomod/main.cjs');
  const app = new EventEmitter();
  const methods = [];
  const host = {
    id: 'echo.community-streaming',
    electron: { app, BrowserWindow: { getAllWindows: () => [] } },
    app,
    config: {},
    ipcMain: null,
    log() {},
    broadcast() {},
    handle(name) { methods.push(name); return () => {}; },
  };

  const dispose = activate(host);
  try {
    assert.equal(ncmLoaded(), false, 'activate() loaded the NCM client during startup');
    assert.deepEqual(methods.filter((name) => /together|comment/iu.test(name)), []);
    for (const name of ['target', 'neteaseDailyPlaylists', 'neteaseSimilar', 'neteaseUnblock', 'neteasePhoneLogin']) {
      assert.ok(methods.includes(name), `missing main method ${name}`);
    }
    assert.equal(app.listenerCount('browser-window-created'), 0);
  } finally {
    dispose();
  }
  assert.equal(ncmLoaded(), false);
});
