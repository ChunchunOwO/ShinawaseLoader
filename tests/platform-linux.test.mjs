import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { discoverLinuxEchoExecutables, findLinuxExecutable, installLinuxLoader, resolveLinuxInstallRoot } from '../scripts/setup-modloader-linux.mjs';
import { installStreamingBridgeDeps, npmRegistrySources, resolveNpmRunner, streamingDepsWarning } from '../scripts/setup-modloader-macos.mjs';
import {
  echoUserDataDirectory,
  filterSteamCommandArgs,
  isEchoExecutablePath,
  isPlaytestPath,
  linuxSteamRoots,
  loaderStateDirectory,
  rankEchoInstall,
  resourcesDirForExecutable,
} from '../ShinawaseLoader/platform.mjs';
import { fingerprintStock, syncModdedRuntime } from '../ShinawaseLoader/runtime-sync.mjs';

const makeAsar = (files) => {
  let data = Buffer.alloc(0);
  const tree = { files: {} };
  for (const [name, content] of Object.entries(files)) {
    const buf = Buffer.from(content);
    tree.files[name] = { size: buf.length, offset: String(data.length) };
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

// Flat Electron layout: <dir>/<name> beside <dir>/resources/app.asar.
const touchEcho = (dir, name = 'ECHO', { asar = true } = {}) => {
  mkdirSync(join(dir, 'resources'), { recursive: true });
  if (asar) writeFileSync(join(dir, 'resources', 'app.asar'), makeAsar({ 'package.json': '{"name":"echo-steam","version":"26.9.16"}\n' }));
  writeFileSync(join(dir, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return join(dir, name);
};

test('linux uses XDG config for loader state and ECHO user data', () => {
  assert.equal(
    loaderStateDirectory({ platform: 'linux', env: {}, home: '/home/player' }),
    join('/home/player', '.config', 'ShinawaseLoader'),
  );
  assert.equal(
    loaderStateDirectory({ platform: 'linux', env: { XDG_CONFIG_HOME: '/cfg' }, home: '/home/player' }),
    join('/cfg', 'ShinawaseLoader'),
  );
  assert.equal(
    echoUserDataDirectory({ platform: 'linux', env: {}, home: '/home/player', folderName: 'ECHO Steam' }),
    join('/home/player', '.config', 'ECHO Steam'),
  );
});

test('linux executable detection needs the Electron layout, so coreutils echo never matches', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-linux-exe-'));
  try {
    const real = touchEcho(join(root, 'ECHO'));
    const bare = touchEcho(join(root, 'bin'), 'echo', { asar: false });
    const lower = touchEcho(join(root, 'lower'), 'echo');
    const noAsar = touchEcho(join(root, 'bare'), 'ECHO', { asar: false });
    assert.equal(isEchoExecutablePath(real, 'linux'), true);
    assert.equal(isEchoExecutablePath(bare, 'linux'), false);
    assert.equal(isEchoExecutablePath(lower, 'linux'), false);
    assert.equal(isEchoExecutablePath(noAsar, 'linux'), false);
    assert.equal(isEchoExecutablePath('/Applications/ECHO.app/Contents/MacOS/ECHO', 'linux'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('linux ranks the Steam install first and never auto-selects Playtest', () => {
  assert.equal(rankEchoInstall('/lib/steamapps/common/ECHO/ECHO', 'linux'), 0);
  assert.equal(rankEchoInstall('/lib/steamapps/common/ECHO Playtest/ECHO', 'linux'), 80);
  assert.equal(rankEchoInstall('/games/ECHO NEXT/ECHO NEXT', 'linux'), 70);
  assert.equal(rankEchoInstall('/games/ECHO/ECHO', 'linux'), 20);
  assert.equal(isPlaytestPath('/lib/steamapps/common/ECHO Playtest/ECHO', 'linux'), true);
  assert.equal(isPlaytestPath('/lib/steamapps/common/ECHO/ECHO', 'linux'), false);
  assert.equal(resourcesDirForExecutable('/lib/ECHO/ECHO', 'linux'), join('/lib/ECHO', 'resources'));
});

test('steam launch arguments for the Linux binary and launcher are dropped', () => {
  assert.deepEqual(filterSteamCommandArgs([
    '%command%',
    '/lib/steamapps/common/ECHO/ECHO',
    '/lib/steamapps/common/ECHO/ECHO.modded.sh',
    '--no-sandbox',
  ]), ['--no-sandbox']);
});

test('linux discovery walks Steam libraries and dedupes the ~/.steam symlink', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-linux-find-'));
  try {
    const home = join(root, 'home');
    const steam = join(home, '.local', 'share', 'Steam');
    const other = join(root, 'SteamLibrary');
    const stable = touchEcho(join(steam, 'steamapps', 'common', 'ECHO'));
    touchEcho(join(steam, 'steamapps', 'common', 'ECHO Playtest'));
    const second = touchEcho(join(other, 'steamapps', 'common', 'ECHO NEXT'), 'ECHO NEXT');
    touchEcho(join(steam, 'ShinawaseLoader', 'modded-runtime'));
    mkdirSync(join(steam, 'steamapps'), { recursive: true });
    writeFileSync(join(steam, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders" { "1" { "path" "${other.replaceAll('\\', '\\\\')}" } }`);
    mkdirSync(join(home, '.steam'), { recursive: true });
    try { symlinkSync(steam, join(home, '.steam', 'steam'), 'junction'); } catch {}
    assert.deepEqual(linuxSteamRoots({ home, env: {} }).length, 1);
    const found = discoverLinuxEchoExecutables({ home, env: {} });
    assert.equal(found[0], stable);
    assert.equal(found.includes(second), true);
    assert.equal(found.some((file) => file.split(/[\\/]/u).includes('modded-runtime')), false);
    assert.equal(resolveLinuxInstallRoot({ home, env: {} }), join(steam, 'steamapps', 'common', 'ECHO'));
    assert.equal(findLinuxExecutable(join(steam, 'steamapps', 'common', 'ECHO')), stable);
    assert.equal(findLinuxExecutable(join(root, 'nowhere')), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('linux runtime sync copies a flat runtime and leaves the stock archive untouched', { skip: process.platform !== 'linux' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-linux-sync-'));
  try {
    const exe = touchEcho(root);
    writeFileSync(join(root, 'libffmpeg.so'), 'lib');
    // The stock ECHO is a wrapper script around the real Electron binary, ECHO.bin.
    writeFileSync(join(root, 'ECHO.bin'), 'elf', { mode: 0o755 });
    writeFileSync(join(root, 'ECHO.modded.sh'), '#!/bin/sh\n');
    mkdirSync(join(root, 'locales'));
    writeFileSync(join(root, 'locales', 'en-US.pak'), 'pak');
    const loaderRoot = join(root, 'ShinawaseLoader');
    mkdirSync(loaderRoot, { recursive: true });
    const stockAsar = readFileSync(join(root, 'resources', 'app.asar'));
    assert.equal(fingerprintStock(root).exe, exe);
    const result = syncModdedRuntime({ echoRoot: root, loaderRoot });
    const runtime = join(loaderRoot, 'modded-runtime');
    assert.equal(statSync(join(runtime, 'ECHO')).mode & 0o111, 0o111);
    assert.equal(statSync(join(runtime, 'libffmpeg.so')).isFile(), true);
    assert.equal(lstatSync(join(runtime, 'locales')).isSymbolicLink(), true);
    assert.throws(() => statSync(join(runtime, 'ECHO.modded.sh')));
    assert.equal(readFileSync(join(root, 'resources', 'app.asar')).equals(stockAsar), true);
    assert.equal(['updated', 'copied-unpatched'].includes(result.status), true);
    assert.equal(readFileSync(join(runtime, 'ECHO.bin'), 'utf8'), 'elf');
    // A runtime synced before ECHO.bin was linked must heal on the next sync.
    rmSync(join(runtime, 'ECHO.bin'));
    const healed = syncModdedRuntime({ echoRoot: root, loaderRoot });
    assert.notEqual(healed.status, 'current');
    assert.equal(readFileSync(join(runtime, 'ECHO.bin'), 'utf8'), 'elf');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('linux installer writes the shell launcher without touching the stock install', { skip: process.platform !== 'linux' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-linux-install-'));
  const state = join(root, 'state');
  try {
    const install = join(root, 'ECHO');
    touchEcho(install);
    const stock = readFileSync(join(install, 'resources', 'app.asar'));
    const installed = installLinuxLoader({
      echoRoot: install, packages: false, streamingDeps: false, locale: 'zh', stateDirectory: state,
    });
    assert.equal(installed.echoRoot, install);
    assert.equal(installed.launcher, join(install, 'ECHO.modded.sh'));
    assert.equal(statSync(installed.launcher).mode & 0o111, 0o111);
    assert.equal(readFileSync(join(install, 'resources', 'app.asar')).equals(stock), true);
    assert.equal(statSync(join(install, 'ShinawaseLoader', 'echo-modded-host.mjs')).isFile(), true);
    assert.equal(statSync(join(install, 'ShinawaseLoader', 'start-echo-safe.sh')).mode & 0o111, 0o111);
    assert.equal(statSync(join(install, 'Mods')).isDirectory(), true);
    assert.equal(JSON.parse(readFileSync(join(state, 'selection.json'), 'utf8')).echoRoot, install);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('linux installer skips the streaming deps when the lock stamp matches', { skip: process.platform !== 'linux' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-linux-deps-'));
  const state = join(root, 'state');
  try {
    const install = join(root, 'ECHO');
    touchEcho(install);
    installLinuxLoader({ echoRoot: install, packages: false, streamingDeps: false, locale: 'zh', stateDirectory: state });
    const loaderRoot = join(install, 'ShinawaseLoader');
    const marker = join(loaderRoot, 'node_modules', '@neteasecloudmusicapienhanced', 'api', 'package.json');
    mkdirSync(join(marker, '..'), { recursive: true });
    writeFileSync(marker, '{}', 'utf8');
    writeFileSync(
      join(loaderRoot, 'node_modules', '.shinawase-deps-lock.sha256'),
      createHash('sha256').update(readFileSync(join(loaderRoot, 'package-lock.json'), 'utf8')).digest('hex'),
      'utf8',
    );
    const again = installLinuxLoader({ echoRoot: install, packages: false, locale: 'zh', stateDirectory: state });
    assert.equal(again.depsStatus.status, 'up-to-date');
    assert.equal(again.depsWarning, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const depsLoaderRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-deps-'));
  writeFileSync(join(root, 'package.json'), '{"name":"shinawase-loader-runtime"}', 'utf8');
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}', 'utf8');
  return root;
};

test('streaming deps fall through registries and stamp the lock on success', () => {
  const loaderRoot = depsLoaderRoot();
  try {
    const calls = [];
    const marker = join(loaderRoot, 'node_modules', '@neteasecloudmusicapienhanced', 'api', 'package.json');
    const result = installStreamingBridgeDeps({
      loaderRoot,
      nodePath: process.execPath,
      env: {},
      registries: [
        { id: 'mirror', url: 'https://mirror.invalid/npm/', timeoutMs: 1000 },
        { id: 'registry', url: 'https://registry.npmmirror.com', timeoutMs: 1000 },
      ],
      spawn: (file, args, options) => {
        calls.push({ file, args, options });
        if (options.env.npm_config_registry !== 'https://registry.npmmirror.com') return { status: 1, stderr: 'mirror down' };
        mkdirSync(join(marker, '..'), { recursive: true });
        writeFileSync(marker, '{}', 'utf8');
        return { status: 0, stdout: '' };
      },
    });
    assert.equal(result.status, 'installed');
    assert.equal(result.registry, 'registry');
    assert.equal(calls.length, 2);
    const runner = resolveNpmRunner({ loaderRoot, nodePath: process.execPath, env: {} });
    assert.equal(calls[0].file, runner.file);
    assert.deepEqual(calls[0].args.slice(0, runner.prefixArgs.length), runner.prefixArgs);
    assert.equal(calls[1].options.cwd, loaderRoot);
    assert.ok(calls[1].args.includes('install'));
    assert.ok(calls[1].args.includes('--registry=https://registry.npmmirror.com'));
    assert.equal(
      readFileSync(join(loaderRoot, 'node_modules', '.shinawase-deps-lock.sha256'), 'utf8').trim(),
      createHash('sha256').update(readFileSync(join(loaderRoot, 'package-lock.json'), 'utf8')).digest('hex'),
    );
  } finally {
    rmSync(loaderRoot, { recursive: true, force: true });
  }
});

test('streaming deps report failure without breaking the install', () => {
  const loaderRoot = depsLoaderRoot();
  try {
    let attempts = 0;
    const result = installStreamingBridgeDeps({
      loaderRoot,
      env: {},
      registries: [{ id: 'registry', url: 'https://registry.npmmirror.com', timeoutMs: 1000 }],
      spawn: () => {
        attempts += 1;
        return { status: 124, stderr: 'ETIMEDOUT reading /@neteasecloudmusicapienhanced' };
      },
    });
    assert.equal(attempts, 1);
    assert.equal(result.status, 'failed');
    assert.match(result.hint, /ETIMEDOUT/);
    assert.match(streamingDepsWarning(result), /npm install/);
    assert.equal(streamingDepsWarning({ status: 'installed', registry: 'registry' }), null);
    assert.equal(existsSync(join(loaderRoot, 'node_modules', '.shinawase-deps-lock.sha256')), false);
    assert.equal(
      installStreamingBridgeDeps({ loaderRoot: join(loaderRoot, 'nowhere'), env: {}, spawn: () => ({ status: 0 }) }).status,
      'skipped',
    );
  } finally {
    rmSync(loaderRoot, { recursive: true, force: true });
  }
});

test('npm registry sources honor the mirror overrides', () => {
  assert.deepEqual(
    npmRegistrySources({ env: { SHINAWASE_MIRRORS: 'none' } }).map((item) => item.url),
    ['https://registry.npmmirror.com'],
  );
  assert.deepEqual(
    npmRegistrySources({
      env: { SHINAWASE_MIRRORS: 'https://a.example/mirror/,', SHINAWASE_NPM_REGISTRY: 'https://registry.npmjs.org/' },
    }).map((item) => item.url),
    ['https://a.example/mirror/npm/', 'https://registry.npmjs.org'],
  );
});

test('setup-modloader.sh pins the same Node version as loader-version.json', () => {
  const pinned = JSON.parse(readFileSync(new URL('../ShinawaseLoader/loader-version.json', import.meta.url), 'utf8')).nodeVersion;
  const script = readFileSync(new URL('../setup-modloader.sh', import.meta.url), 'utf8');
  assert.equal(script.match(/^NODE_VERSION="([^"]+)"/mu)?.[1], pinned);
  assert.equal(/^NODE_SHA256_X64="[0-9a-f]{64}"/mu.test(script), true);
  assert.equal(/^NODE_SHA256_ARM64="[0-9a-f]{64}"/mu.test(script), true);
});
