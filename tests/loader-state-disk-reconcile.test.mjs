// Regression: a package folder on disk with no loader-state record was invisible
// on the Mods page while the Market still reported it as installed, because the
// two views read different sources. Startup now registers those packages as
// disabled so they are visible and togglable, without ever injecting them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const loaderCli = fileURLToPath(new URL('../ShinawaseLoader/ShinawaseLoader.mjs', import.meta.url));
const orphanMod = 'test.orphan-mod';
const orphanPlugin = 'test.orphan-plugin';
const bareFolder = 'test.no-manifest';

const workspace = (t) => {
  const base = mkdtempSync(join(tmpdir(), 'shinawase-state-reconcile-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, 'ShinawaseLoader');
  const game = join(base, 'game');
  const mods = join(game, 'Mods');
  const plugins = join(game, 'Plugins');
  mkdirSync(join(mods, 'installed', orphanMod), { recursive: true });
  mkdirSync(join(plugins, 'installed', orphanPlugin), { recursive: true });
  mkdirSync(join(mods, 'installed', bareFolder), { recursive: true });
  writeFileSync(join(mods, 'installed', orphanMod, 'echo.mod.json'), JSON.stringify({
    id: orphanMod, name: 'Orphan mod', version: '1.0.0', type: 'echo-external-mod', entry: 'mod.js',
  }));
  writeFileSync(join(mods, 'installed', orphanMod, 'mod.js'), 'return () => {};');
  writeFileSync(join(plugins, 'installed', orphanPlugin, 'echo.plugin.json'), JSON.stringify({
    id: orphanPlugin, name: 'Orphan plugin', version: '1.0.0', type: 'echo-plugin-package', main: 'plugin.js',
  }));
  writeFileSync(join(plugins, 'installed', orphanPlugin, 'plugin.js'), '');
  return { base, home, game, mods, plugins };
};

const runLoader = ({ home, game, mods, plugins }, args) => spawnSync(process.execPath, [loaderCli, ...args, '--locale', 'en'], {
  encoding: 'utf8',
  windowsHide: true,
  timeout: 60000,
  env: {
    ...process.env,
    ECHO_MOD_HOME: home,
    ECHO_GAME_ROOT: game,
    ECHO_MODS_HOME: mods,
    ECHO_PLUGINS_HOME: plugins,
    ECHO_LOGS_HOME: join(home, 'Logs'),
    ECHO_SKIP_SELF_UPDATE: '1',
    // A real ECHO on this machine owns 9229; point CDP at a closed port so
    // 'enable' cannot inject into it.
    ECHO_MOD_DEBUG_PORT: '1',
  },
});

const stateOf = ({ home }) => {
  const path = join(home, 'loader-state.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).mods || {} : null;
};

test('init registers a mod folder that has no state record', (t) => {
  const ws = workspace(t);
  const result = runLoader(ws, ['init']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(stateOf(ws)[orphanMod]?.kind, 'mod');
  assert.equal(stateOf(ws)[orphanMod]?.enabled, false);
});

test('init registers a plugin folder as a plugin', (t) => {
  const ws = workspace(t);
  assert.equal(runLoader(ws, ['init']).status, 0);
  assert.equal(stateOf(ws)[orphanPlugin]?.kind, 'plugin');
  assert.equal(stateOf(ws)[orphanPlugin]?.enabled, false);
});

test('a package folder without a manifest is not registered', (t) => {
  const ws = workspace(t);
  assert.equal(runLoader(ws, ['init']).status, 0);
  assert.equal(bareFolder in stateOf(ws), false);
});

test('registering never enables a package', (t) => {
  const ws = workspace(t);
  assert.equal(runLoader(ws, ['init']).status, 0);
  assert.equal(runLoader(ws, ['list']).stdout.includes(orphanMod), true);
  assert.equal(stateOf(ws)[orphanMod]?.enabled, false, 'still disabled after being listed');
  assert.equal(stateOf(ws)[orphanPlugin]?.enabled, false);
});

test('a second init leaves an unchanged state behind', (t) => {
  const ws = workspace(t);
  assert.equal(runLoader(ws, ['init']).status, 0);
  const first = JSON.stringify(stateOf(ws));
  assert.equal(runLoader(ws, ['init']).status, 0);
  assert.equal(JSON.stringify(stateOf(ws)), first);
});

test('a package the user disabled stays disabled across restarts', (t) => {
  const ws = workspace(t);
  assert.equal(runLoader(ws, ['init']).status, 0);
  assert.equal(runLoader(ws, ['enable', orphanMod]).status, 0);
  assert.equal(stateOf(ws)[orphanMod]?.enabled, true);
  assert.equal(runLoader(ws, ['disable', orphanMod]).status, 0);
  assert.equal(runLoader(ws, ['init']).status, 0);
  assert.equal(stateOf(ws)[orphanMod]?.enabled, false);
});
