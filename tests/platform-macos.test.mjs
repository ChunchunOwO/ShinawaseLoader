import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { join } from 'node:path';
import test from 'node:test';
import { discoverDarwinEchoExecutables, installMacLoader, resolveMacInstallRoot } from '../scripts/setup-modloader-macos.mjs';
import {
  echoUserDataDirectory,
  filterSteamCommandArgs,
  installRootFromTarget,
  isEchoExecutablePath,
  isPlaytestPath,
  loaderStateDirectory,
  planModdedLaunchArgs,
  rankEchoInstall,
  resourcesDirForExecutable,
} from '../ShinawaseLoader/platform.mjs';
import { syncIntegrity } from '../ShinawaseLoader/echo-asar.mjs';
import { fingerprintStock, resignIsolatedDarwinApp, syncModdedRuntime } from '../ShinawaseLoader/runtime-sync.mjs';

const makeAsar = (files) => {
  let data = Buffer.alloc(0);
  const tree = { files: {} };
  for (const [name, content] of Object.entries(files)) {
    const buf = Buffer.from(content);
    const parts = name.split('/');
    let node = tree;
    for (let index = 0; index < parts.length - 1; index += 1) {
      node.files[parts[index]] = node.files[parts[index]] || { files: {} };
      node = node.files[parts[index]];
    }
    node.files[parts[parts.length - 1]] = { size: buf.length, offset: String(data.length) };
    data = Buffer.concat([data, buf]);
  }
  const json = Buffer.from(JSON.stringify(tree));
  const pad = (4 - ((4 + json.length) % 4)) % 4;
  const headerPayload = Buffer.alloc(4 + json.length + pad);
  headerPayload.writeUInt32LE(json.length, 0);
  json.copy(headerPayload, 4);
  const headerPickle = Buffer.alloc(4 + headerPayload.length);
  headerPickle.writeUInt32LE(headerPayload.length, 0);
  headerPayload.copy(headerPickle, 4);
  const sizePickle = Buffer.alloc(8);
  sizePickle.writeUInt32LE(4, 0);
  sizePickle.writeUInt32LE(headerPickle.length, 4);
  return Buffer.concat([sizePickle, headerPickle, data]);
};

test('windows path formulas stay on the historical AppData locations', () => {
  const env = {
    LOCALAPPDATA: 'C:\\Users\\player\\AppData\\Local',
    APPDATA: 'C:\\Users\\player\\AppData\\Roaming',
    USERPROFILE: 'C:\\Users\\player',
  };
  assert.equal(
    loaderStateDirectory({ platform: 'win32', env, home: 'C:\\Users\\player' }),
    join(env.LOCALAPPDATA, 'ShinawaseLoader'),
  );
  assert.equal(
    echoUserDataDirectory({ platform: 'win32', env, home: 'C:\\Users\\player', folderName: 'ECHO Steam' }),
    join(env.APPDATA, 'ECHO Steam'),
  );
  assert.equal(
    loaderStateDirectory({ platform: 'win32', env: {}, home: 'C:\\Users\\player' }),
    join('C:\\Users\\player', 'ShinawaseLoader'),
  );
  assert.equal(rankEchoInstall('D:\\SteamLibrary\\steamapps\\common\\ECHO\\ECHO.exe', 'win32'), 0);
  assert.equal(rankEchoInstall('D:\\SteamLibrary\\steamapps\\common\\ECHO Playtest\\ECHO.exe', 'win32'), 80);
  assert.equal(rankEchoInstall('D:\\Games\\ECHO NEXT\\ECHO NEXT.exe', 'win32'), 70);
  assert.equal(isEchoExecutablePath('D:\\SteamLibrary\\steamapps\\common\\ECHO\\ECHO.exe', 'win32'), true);
  assert.equal(isEchoExecutablePath('/Applications/ECHO.app/Contents/MacOS/ECHO', 'win32'), false);
  assert.equal(isPlaytestPath('D:\\SteamLibrary\\steamapps\\common\\ECHO Playtest\\ECHO.exe', 'win32'), true);
  assert.equal(installRootFromTarget('D:\\SteamLibrary\\steamapps\\common\\ECHO\\ECHO.exe', 'win32'), null);
  assert.equal(
    resourcesDirForExecutable('D:\\SteamLibrary\\steamapps\\common\\ECHO\\ECHO.exe', 'win32'),
    path.win32.join('D:\\SteamLibrary\\steamapps\\common\\ECHO', 'resources'),
  );
});

test('darwin uses Application Support and the ECHO.app bundle', () => {
  const home = '/Users/player';
  assert.equal(
    loaderStateDirectory({ platform: 'darwin', env: { APPDATA: 'ignored' }, home }),
    join(home, 'Library', 'Application Support', 'ShinawaseLoader'),
  );
  assert.equal(
    echoUserDataDirectory({ platform: 'darwin', env: {}, home, folderName: 'ECHO Steam' }),
    join(home, 'Library', 'Application Support', 'ECHO Steam'),
  );
  const executable = '/Users/player/Library/Application Support/Steam/steamapps/common/ECHO/ECHO.app/Contents/MacOS/ECHO';
  assert.equal(isEchoExecutablePath(executable, 'darwin'), true);
  assert.equal(rankEchoInstall(executable, 'darwin'), 0);
  assert.equal(installRootFromTarget(executable, 'darwin'), '/Users/player/Library/Application Support/Steam/steamapps/common/ECHO');
  assert.equal(installRootFromTarget('/Applications/ECHO.app', 'darwin'), '/Applications');
  assert.equal(isPlaytestPath('/Games/ECHO Playtest.app/Contents/MacOS/ECHO', 'darwin'), true);
  assert.equal(rankEchoInstall('/Games/ECHO Playtest.app/Contents/MacOS/ECHO', 'darwin'), 80);
  assert.equal(
    resourcesDirForExecutable(executable, 'darwin'),
    '/Users/player/Library/Application Support/Steam/steamapps/common/ECHO/ECHO.app/Contents/Resources',
  );
});

test('steam command arguments that point at the stock executable are dropped', () => {
  assert.deepEqual(filterSteamCommandArgs([
    '%command%',
    '/Games/ECHO/ECHO.app/Contents/MacOS/ECHO',
    'ECHO.exe',
    '--foo',
    'playlist',
  ]), ['--foo', 'playlist']);
  assert.deepEqual(planModdedLaunchArgs(['--foo']), [
    '--foo',
    '--remote-debugging-port=9229',
    '--inspect=9230',
  ]);
  assert.deepEqual(planModdedLaunchArgs(['--inspect=1', '--remote-debugging-port=2']), [
    '--inspect=1',
    '--remote-debugging-port=2',
  ]);
});

const touchEchoApp = (contentRoot, appName) => {
  const executable = join(contentRoot, appName, 'Contents', 'MacOS', 'ECHO');
  mkdirSync(join(contentRoot, appName, 'Contents', 'MacOS'), { recursive: true });
  writeFileSync(executable, '');
  return executable;
};

test('darwin discovery prefers the Steam install and skips Playtest and modded copies', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-find-'));
  try {
    const home = join(root, 'home');
    const steam = join(home, 'Library', 'Application Support', 'Steam');
    const library = join(root, 'SteamLibrary');
    const dist = join(root, 'echo', 'dist', 'mac-arm64');
    touchEchoApp(join(steam, 'steamapps', 'common', 'ECHO Playtest'), 'ECHO Playtest.app');
    const stable = touchEchoApp(join(library, 'steamapps', 'common', 'ECHO'), 'ECHO.app');
    touchEchoApp(dist, 'ECHO.app');
    touchEchoApp(join(dist, 'ShinawaseLoader', 'modded-runtime'), 'ECHO.app');
    const vdf = join(steam, 'steamapps', 'libraryfolders.vdf');
    mkdirSync(join(steam, 'steamapps'), { recursive: true });
    writeFileSync(vdf, `"libraryfolders"\n{\n"0"\n{\n"path" "${steam}"\n}\n"1"\n{\n"path" "${library}"\n}\n}\n`);
    const found = discoverDarwinEchoExecutables({
      home,
      env: {},
      includeSystemRoots: false,
      bundleApps: [join(dist, 'ECHO.app')],
    });
    assert.equal(found[0], stable);
    assert.equal(found.some((file) => file.includes('modded-runtime')), false);
    assert.equal(found.some((file) => file.includes('Playtest')), true);
    assert.equal(resolveMacInstallRoot({
      home,
      env: {},
      includeSystemRoots: false,
      bundleApps: [join(dist, 'ECHO.app')],
    }), join(library, 'steamapps', 'common', 'ECHO'));
    assert.equal(resolveMacInstallRoot({
      home,
      env: {},
      includeSystemRoots: false,
      bundleApps: [],
      fsExists: (file) => existsForPlaytestOnly(file, home),
      readFile: () => '{"echoRoot":""}',
    }), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const existsForPlaytestOnly = (file, home) => String(file).startsWith(join(home, 'Library', 'Application Support', 'Steam', 'steamapps', 'common', 'ECHO Playtest'));

test('darwin resign refuses anything outside the isolated runtime', () => {
  assert.equal(resignIsolatedDarwinApp('/Applications/ECHO.app', '/Applications/ECHO.app').status, 'refused');
  assert.equal(resignIsolatedDarwinApp('/tmp/ECHO.app', '/tmp/ECHO.app').status, 'refused');
});

test('darwin runtime sync copies the app bundle and leaves the stock archive untouched', { skip: process.platform !== 'darwin' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-mac-'));
  try {
    const asar = makeAsar({ 'package.json': '{"name":"echo-steam","version":"26.9.16"}\n' });
    const app = join(root, 'ECHO.app', 'Contents');
    mkdirSync(join(app, 'MacOS'), { recursive: true });
    mkdirSync(join(app, 'Resources'), { recursive: true });
    mkdirSync(join(app, 'Frameworks'), { recursive: true });
    writeFileSync(join(app, 'Frameworks', 'keep.txt'), 'framework');
    const stockAsar = join(app, 'Resources', 'app.asar');
    const stockExe = join(app, 'MacOS', 'ECHO');
    writeFileSync(stockExe, '#!/bin/sh\nexit 0\n');
    writeFileSync(stockAsar, asar);
    const before = readFileSync(stockAsar);
    const stock = fingerprintStock(root);
    assert.equal(stock.echoVersion, '26.9.16');
    assert.equal(stock.appName, 'ECHO.app');
    const loader = join(root, 'ShinawaseLoader');
    const synced = syncModdedRuntime({ echoRoot: root, loaderRoot: loader, runtimeRoot: join(loader, 'modded-runtime') });
    assert.equal(readFileSync(stockAsar).equals(before), true);
    const runtimeAsar = join(loader, 'modded-runtime', 'ECHO.app', 'Contents', 'Resources', 'app.asar');
    assert.equal(readFileSync(runtimeAsar).equals(before), true);
    const frameworks = join(loader, 'modded-runtime', 'ECHO.app', 'Contents', 'Frameworks');
    assert.equal(lstatSync(frameworks).isSymbolicLink(), false);
    assert.equal(readFileSync(join(frameworks, 'keep.txt'), 'utf8'), 'framework');
    assert.equal(statSync(join(loader, 'modded-runtime', 'ECHO.app', 'Contents', 'MacOS', 'ECHO')).isFile(), true);
    assert.equal(synced.status === 'updated' || synced.status === 'copied-unpatched', true);
    const again = syncModdedRuntime({ echoRoot: root, loaderRoot: loader, runtimeRoot: join(loader, 'modded-runtime') });
    assert.equal(again.status, 'current');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const integrityPlist = (hash) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>ElectronAsarIntegrity</key>
  <dict>
    <key>Resources/app.asar</key>
    <dict>
      <key>algorithm</key><string>SHA256</string>
      <key>hash</key><string>${hash}</string>
    </dict>
  </dict>
</dict></plist>
`;

test('darwin refreshes ElectronAsarIntegrity without editing a Steam original', { skip: process.platform !== 'darwin' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-plist-'));
  try {
    const contents = join(root, 'ECHO.app', 'Contents');
    mkdirSync(join(contents, 'MacOS'), { recursive: true });
    mkdirSync(join(contents, 'Resources'), { recursive: true });
    writeFileSync(join(contents, 'MacOS', 'ECHO'), '#!/bin/sh\nexit 0\n');
    writeFileSync(join(contents, 'Resources', 'app.asar'), makeAsar({ 'package.json': '{"name":"echo-steam"}\n' }));
    const plistPath = join(contents, 'Info.plist');
    writeFileSync(plistPath, integrityPlist('0'.repeat(64)));
    const updated = syncIntegrity(root);
    assert.equal(updated.status, 'updated');
    assert.match(readFileSync(plistPath, 'utf8'), new RegExp(updated.hash));
    const again = syncIntegrity(root);
    assert.equal(again.status, 'already-synced');
    assert.equal(readFileSync(plistPath, 'utf8').includes(updated.hash), true);

    const steam = join(root, 'steamapps', 'common', 'ECHO');
    const steamContents = join(steam, 'ECHO.app', 'Contents');
    mkdirSync(join(steamContents, 'Resources'), { recursive: true });
    writeFileSync(join(steamContents, 'Resources', 'app.asar'), makeAsar({ 'package.json': '{"name":"echo-steam"}\n' }));
    const steamPlist = join(steamContents, 'Info.plist');
    const original = integrityPlist('a'.repeat(64));
    writeFileSync(steamPlist, original);
    const refused = syncIntegrity(steam);
    assert.equal(refused.status, 'refused-steam-original');
    assert.equal(readFileSync(steamPlist, 'utf8'), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mac installer enables bundled mods the first time and leaves a disabled mod off', { skip: process.platform !== 'darwin' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-mods-'));
  const state = join(root, 'state');
  try {
    const contents = join(root, 'ECHO.app', 'Contents');
    mkdirSync(join(contents, 'MacOS'), { recursive: true });
    mkdirSync(join(contents, 'Resources'), { recursive: true });
    writeFileSync(join(contents, 'MacOS', 'ECHO'), '#!/bin/sh\nexit 0\n');
    writeFileSync(join(contents, 'Resources', 'app.asar'), makeAsar({ 'package.json': '{"name":"echo-steam","version":"26.9.16"}\n' }));
    const installed = installMacLoader({
      echoRoot: root,
      packages: true,
      locale: 'zh',
      stateDirectory: state,
    });
    const mods = JSON.parse(readFileSync(join(installed.loaderRoot, 'loader-state.json'), 'utf8')).mods;
    const ids = Object.keys(mods);
    assert.equal(ids.length >= 2, true);
    assert.equal(ids.every((id) => mods[id].enabled === true), true);
    const node = process.execPath;
    const script = join(installed.loaderRoot, 'ShinawaseLoader.mjs');
    const disabled = spawnSync(node, [script, 'disable', ids[0], '--locale', 'zh'], {
      cwd: root,
      env: { ...process.env, ECHO_MOD_HOME: installed.loaderRoot, ECHO_GAME_ROOT: root, ECHO_LOADER_LOCALE: 'zh' },
      encoding: 'utf8',
    });
    assert.equal(disabled.status, 0);
    installMacLoader({
      echoRoot: root,
      packages: true,
      locale: 'zh',
      stateDirectory: state,
    });
    const again = JSON.parse(readFileSync(join(installed.loaderRoot, 'loader-state.json'), 'utf8')).mods;
    assert.equal(again[ids[0]].enabled, false);
    assert.equal(ids.slice(1).every((id) => again[id].enabled === true), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mac installer writes the command launcher without touching the stock app', { skip: process.platform !== 'darwin' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-install-'));
  const state = join(root, 'state');
  try {
    const asar = makeAsar({ 'package.json': '{"name":"echo-steam","version":"26.9.16"}\n' });
    const contents = join(root, 'ECHO.app', 'Contents');
    mkdirSync(join(contents, 'MacOS'), { recursive: true });
    mkdirSync(join(contents, 'Resources'), { recursive: true });
    writeFileSync(join(contents, 'MacOS', 'ECHO'), '#!/bin/sh\nexit 0\n');
    writeFileSync(join(contents, 'Resources', 'app.asar'), asar);
    const stock = readFileSync(join(contents, 'Resources', 'app.asar'));
    const installed = installMacLoader({
      echoRoot: root,
      packages: false,
      locale: 'zh',
      stateDirectory: state,
    });
    assert.equal(installed.echoRoot, root);
    assert.equal(statSync(installed.launcher).mode & 0o111, 0o111);
    assert.equal(readFileSync(join(contents, 'Resources', 'app.asar')).equals(stock), true);
    assert.equal(statSync(join(root, 'ShinawaseLoader', 'echo-modded-host.mjs')).isFile(), true);
    assert.equal(statSync(join(root, 'Mods')).isDirectory(), true);
    const selection = JSON.parse(readFileSync(join(state, 'selection.json'), 'utf8'));
    assert.equal(selection.echoRoot, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
