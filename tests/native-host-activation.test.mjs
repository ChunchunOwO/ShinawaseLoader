// Regression: package main scripts activate inside app.whenReady(), before ECHO
// creates its main window. The Streaming Mod's first together poll required the
// NCM client synchronously there and delayed the window by seconds. The native
// host now reports how long each activation blocked the main process, and an
// activate() that never settles no longer holds back the packages after it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const nativeHost = fileURLToPath(new URL('../ShinawaseLoader/native-host.cjs', import.meta.url));
const timeoutMs = 200;

const packages = {
  'test.blocking': `module.exports = () => {
    const until = Date.now() + 300;
    while (Date.now() < until) {}
    return () => {};
  };`,
  'test.hung': 'module.exports = () => new Promise(() => {});',
  'test.fast': 'module.exports = () => () => {};',
  // Settles 400ms after activation, past the 200ms budget. Each instance numbers
  // itself through a counter file because the host re-requires the script.
  'test.late': `const { readFileSync, writeFileSync, appendFileSync } = require('node:fs');
  const { join } = require('node:path');
  module.exports = (host) => {
    const counter = join(host.directory, 'count.txt');
    let n = 1;
    try { n = Number(readFileSync(counter, 'utf8')) + 1; } catch {}
    writeFileSync(counter, String(n));
    return new Promise((resolve) => setTimeout(() => resolve(() => {
      appendFileSync(join(host.directory, 'disposed.txt'), 'dispose:' + n + '\\n');
    }), 400));
  };`,
};

const workspace = (t) => {
  const base = mkdtempSync(join(tmpdir(), 'shinawase-native-activation-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, 'ShinawaseLoader');
  const game = join(base, 'game');
  mkdirSync(home, { recursive: true });
  const mods = {};
  for (const [id, source] of Object.entries(packages)) {
    const directory = join(game, 'Mods', 'installed', id);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'echo.mod.json'), JSON.stringify({ id, name: id, version: '1.0.0', main: 'main.cjs' }));
    writeFileSync(join(directory, 'main.cjs'), source);
    mods[id] = { enabled: true, kind: 'mod' };
  }
  writeFileSync(join(home, 'loader-state.json'), JSON.stringify({ mods }));
  return { home, game };
};

// Start the host, reload while test.late's first activation is still pending,
// then reload again once its second activation settled late.
const driver = `
const host = require(${JSON.stringify(nativeHost)});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  const started = await host.startShinawaseNativeHost();
  const replaced = await host.callNative({ method: 'reload' });
  await sleep(900);
  const final = await host.callNative({ method: 'reload' });
  await sleep(50);
  process.stdout.write(JSON.stringify({ started, replaced, final }));
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
`;

test('native host reports blocking activations and survives hung or late ones', (t) => {
  const { home, game } = workspace(t);
  const run = spawnSync(process.execPath, ['-e', driver], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60000,
    env: {
      ...process.env,
      ECHO_MOD_HOME: home,
      ECHO_GAME_ROOT: game,
      ECHO_LOGS_HOME: join(home, 'Logs'),
      ECHO_NATIVE_PORT: '0',
      ECHO_NATIVE_ACTIVATE_TIMEOUT_MS: String(timeoutMs),
    },
  });
  assert.equal(run.status, 0, run.stderr);
  const lastLine = run.stdout.trim().split('\n').pop();
  const { started, replaced, final } = JSON.parse(lastLine);
  for (const status of [started, replaced, final]) {
    assert.deepEqual([...status.packages].sort(), Object.keys(packages).sort(), 'a hung activate() must not drop later packages');
    assert.deepEqual(status.errors, []);
  }

  const log = readFileSync(join(home, 'Logs', 'loader.log'), 'utf8');
  assert.match(log, /\[NATIVE:WARN\] test\.blocking blocked the ECHO main process for \d+ms/);
  assert.doesNotMatch(log, /test\.fast blocked the ECHO main process/);
  assert.match(log, /activated native package test\.fast main=true modules=0 blocked=\d+ms total=\d+ms\n/);
  assert.match(log, new RegExp(`\\[NATIVE:ERROR\\] activate test\\.hung did not settle within ${timeoutMs}ms`));
  assert.match(log, /activated native package test\.hung .* timedOut=true/);
  assert.match(log, new RegExp(`\\[NATIVE:WARN\\] activate test\\.late settled after the ${timeoutMs}ms budget`));

  // Instance 1 settled after the first reload replaced it, so its dispose ran at
  // once; instance 2 settled while current and was disposed by the next reload.
  const disposedFile = join(game, 'Mods', 'installed', 'test.late', 'disposed.txt');
  assert.ok(existsSync(disposedFile), 'late dispose never ran');
  const disposed = readFileSync(disposedFile, 'utf8').trim().split('\n').sort();
  assert.deepEqual(disposed, ['dispose:1', 'dispose:2']);
});
