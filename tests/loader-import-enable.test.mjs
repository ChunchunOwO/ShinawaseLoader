// CLI regression for `import --enable`: the Windows installer imported optional
// packages without enabling them, so ECHO came up with zero enabled packages.
// Enabling must apply to a freshly installed package only — re-importing a Mod
// the user switched off keeps it off, which is what the macOS setup does too.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createZip } from '../ShinawaseLoader/echomod-archive.mjs';

const loaderCli = fileURLToPath(new URL('../ShinawaseLoader/ShinawaseLoader.mjs', import.meta.url));
const modId = 'test.enable-flag';

const workspace = (t) => {
  const base = mkdtempSync(join(tmpdir(), 'shinawase-import-enable-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, 'ShinawaseLoader');
  const game = join(base, 'game');
  mkdirSync(home, { recursive: true });
  mkdirSync(join(game, 'Mods'), { recursive: true });
  const file = join(base, 'enable-flag.echomod');
  writeFileSync(file, createZip([
    { path: 'echo.mod.json', data: Buffer.from(JSON.stringify({ id: modId, name: 'Enable flag', version: '1.0.0', type: 'echo-external-mod', entry: 'mod.js' })) },
    { path: 'mod.js', data: Buffer.from('return () => {};') },
  ]));
  return { home, game, file };
};

const runLoader = ({ home, game }, args) => spawnSync(process.execPath, [loaderCli, ...args, '--locale', 'en'], {
  encoding: 'utf8',
  windowsHide: true,
  timeout: 60000,
  env: {
    ...process.env,
    ECHO_MOD_HOME: home,
    ECHO_GAME_ROOT: game,
    ECHO_MODS_HOME: join(game, 'Mods'),
    ECHO_PLUGINS_HOME: join(game, 'Plugins'),
    ECHO_LOGS_HOME: join(home, 'Logs'),
    ECHO_SKIP_SELF_UPDATE: '1',
  },
});

const stateOf = ({ home }) => {
  const path = join(home, 'loader-state.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')).mods?.[modId] || null;
};

test('import without --enable installs but stays disabled', (t) => {
  const ws = workspace(t);
  const result = runLoader(ws, ['import', ws.file]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(stateOf(ws)?.kind, 'mod');
  assert.equal(stateOf(ws)?.enabled, false);
});

test('import --enable installs an enabled package', (t) => {
  const ws = workspace(t);
  const result = runLoader(ws, ['import', ws.file, '--enable']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(stateOf(ws)?.enabled, true, result.stdout);
});

test('--enable before the package path still finds the package', (t) => {
  const ws = workspace(t);
  const result = runLoader(ws, ['import', '--enable', ws.file]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(stateOf(ws)?.enabled, true, result.stdout);
});

test('import --enable does not re-enable a package the user disabled', (t) => {
  const ws = workspace(t);
  assert.equal(runLoader(ws, ['import', ws.file, '--enable']).status, 0);
  const disabled = runLoader(ws, ['disable', modId]);
  assert.equal(disabled.status, 0, `${disabled.stdout}\n${disabled.stderr}`);
  assert.equal(stateOf(ws)?.enabled, false);
  assert.equal(runLoader(ws, ['import', ws.file, '--enable']).status, 0);
  assert.equal(stateOf(ws)?.enabled, false, 're-import kept the user choice');
});
