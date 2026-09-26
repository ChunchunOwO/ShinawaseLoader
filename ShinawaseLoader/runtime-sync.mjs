#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patch, syncIntegrity } from './echo-asar.mjs';
import { DARWIN_APP_NAMES, installRootFromTarget, pathsEqual } from './platform.mjs';

const loaderDir = dirname(fileURLToPath(import.meta.url));
const echoExeNames = ['ECHO.exe', 'ECHO Steam.exe', 'ECHO NEXT.exe', 'ECHO Playtest.exe'];
const skipRootDirs = new Set(['resources', 'ShinawaseLoader', 'Mods', 'Plugins', 'modded-runtime']);
const fingerprintName = 'runtime-sync.json';

const readJson = (file, fallback = null) => {
  try { return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/u, '')); } catch { return fallback; }
};
const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const sha256File = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const samePath = (left, right) => pathsEqual(left, right);

const readAsarJson = (archive, relativePath) => {
  let fd;
  try {
    const stat = statSync(archive);
    fd = openSync(archive, 'r');
    const prefix = Buffer.alloc(16);
    if (readSync(fd, prefix, 0, 16, 0) < 16) return null;
    const headerSize = prefix.readUInt32LE(4);
    if (headerSize <= 8 || headerSize > stat.size) return null;
    const header = Buffer.alloc(headerSize);
    if (readSync(fd, header, 0, headerSize, 8) < headerSize) return null;
    const jsonSize = header.readInt32LE(4);
    const tree = JSON.parse(header.subarray(8, 8 + jsonSize).toString('utf8'));
    let node = tree;
    for (const part of String(relativePath || '').replaceAll('\\', '/').split('/').filter(Boolean)) {
      node = node?.files?.[part];
      if (!node) return null;
    }
    if (node.files || node.unpacked || node.link) return null;
    const size = Number(node.size);
    const text = Buffer.alloc(size);
    if (readSync(fd, text, 0, size, 8 + headerSize + Number(node.offset)) < size) return null;
    return JSON.parse(text.toString('utf8').replace(/^\uFEFF/u, ''));
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch {}
  }
};

const findStockExe = (echoRoot) => echoExeNames
  .map((name) => join(echoRoot, name))
  .find((file) => existsSync(file) && statSync(file).isFile()) || null;

const fileBusy = (file) => {
  if (!existsSync(file)) return false;
  try {
    const fd = openSync(file, 'r+');
    closeSync(fd);
    return false;
  } catch (error) {
    return error && ['EBUSY', 'EPERM', 'EACCES', 'EAGAIN'].includes(error.code);
  }
};

const replaceFile = (source, target, { hardlink = false } = {}) => {
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) {
    try { rmSync(target, { force: true }); } catch {}
  }
  if (hardlink) {
    try {
      linkSync(source, target);
      return 'hardlink';
    } catch {}
  }
  copyFileSync(source, target);
  return 'copy';
};

const ensureJunction = (source, target) => {
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) {
    try {
      const current = readlinkSync(target);
      if (samePath(current, source) || samePath(resolve(dirname(target), current), source)) return 'kept';
    } catch {}
    try { rmSync(target, { recursive: true, force: true }); } catch {}
  }
  try {
    symlinkSync(source, target, 'junction');
    return 'junction';
  } catch {
    cpSync(source, target, { recursive: true, force: true });
    return 'copy';
  }
};

const findDarwinApp = (echoRoot) => DARWIN_APP_NAMES
  .map((name) => ({
    name,
    dir: join(echoRoot, name),
    exe: join(echoRoot, name, 'Contents', 'MacOS', 'ECHO'),
    asar: join(echoRoot, name, 'Contents', 'Resources', 'app.asar'),
  }))
  .find((item) => existsSync(item.exe) && existsSync(item.asar)) || null;

const fingerprintStockDarwin = (echoRoot) => {
  const app = findDarwinApp(echoRoot);
  if (!app) throw new Error(`stock_echo_missing:${echoRoot}`);
  const asarStat = statSync(app.asar);
  const exeStat = statSync(app.exe);
  const pkg = readAsarJson(app.asar, 'package.json') || {};
  return {
    echoRoot: resolve(echoRoot),
    exe: app.exe,
    appName: app.name,
    echoVersion: pkg.version || null,
    echoProduct: pkg.name || 'echo-steam',
    electronVersion: null,
    asarSha256: sha256File(app.asar),
    asarSize: asarStat.size,
    asarMtimeMs: asarStat.mtimeMs,
    exeSize: exeStat.size,
    exeMtimeMs: exeStat.mtimeMs,
    asar: app.asar,
  };
};

const runtimeAppPresent = (runtimeRoot, kind) => DARWIN_APP_NAMES.some((name) => existsSync(kind === 'exe'
  ? join(runtimeRoot, name, 'Contents', 'MacOS', 'ECHO')
  : join(runtimeRoot, name, 'Contents', 'Resources', 'app.asar')));

const darwinRuntimeLinksStock = (runtimeRoot, appName) => {
  const contents = join(runtimeRoot, appName, 'Contents');
  for (const name of ['Frameworks', 'Resources', 'MacOS']) {
    try {
      if (lstatSync(join(contents, name)).isSymbolicLink()) return true;
    } catch {}
  }
  try {
    if (lstatSync(join(contents, 'Frameworks', 'Electron Framework.framework')).isSymbolicLink()) return true;
  } catch {}
  return false;
};

// A partial bundle whose Frameworks directory points at the stock app does not
// launch. Clone the whole app (APFS copy-on-write when the volume allows it)
// so the isolated copy has its own inodes and the stock bundle stays untouched.
const rebuildDarwinRuntime = (app, runtimeRoot) => {
  const dest = join(runtimeRoot, app.name);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(runtimeRoot, { recursive: true });
  const cloned = spawnSync('/bin/cp', ['-cR', app.dir, dest], { encoding: 'utf8' });
  if (cloned.status === 0 && existsSync(join(dest, 'Contents', 'MacOS', 'ECHO'))) return;
  rmSync(dest, { recursive: true, force: true });
  cpSync(app.dir, dest, { recursive: true });
};

export const fingerprintStock = (echoRoot) => {
  if (process.platform === 'darwin') return fingerprintStockDarwin(echoRoot);
  const exe = findStockExe(echoRoot);
  const asar = join(echoRoot, 'resources', 'app.asar');
  const versionFile = join(echoRoot, 'version');
  if (!exe || !existsSync(asar)) {
    throw new Error(`stock_echo_missing:${echoRoot}`);
  }
  const asarStat = statSync(asar);
  const exeStat = statSync(exe);
  const pkg = readAsarJson(asar, 'package.json') || {};
  let electronVersion = null;
  try {
    const text = readFileSync(versionFile, 'utf8').trim();
    if (/^\d+\.\d+\.\d+/.test(text)) electronVersion = text.split(/\s/u)[0];
  } catch {}
  return {
    echoRoot: resolve(echoRoot),
    exe,
    echoVersion: pkg.version || null,
    echoProduct: pkg.name || 'echo-steam',
    electronVersion,
    asarSha256: sha256File(asar),
    asarSize: asarStat.size,
    asarMtimeMs: asarStat.mtimeMs,
    exeSize: exeStat.size,
    exeMtimeMs: exeStat.mtimeMs,
  };
};

const fingerprintPathFor = (loaderRoot) => join(loaderRoot, 'backups', fingerprintName);

export const readRuntimeFingerprint = (loaderRoot) => readJson(fingerprintPathFor(loaderRoot), null);

const runtimeNeedsSync = (stock, previous, runtimeRoot, force = false) => {
  if (force) return 'forced';
  if (process.platform === 'darwin') {
    if (!runtimeAppPresent(runtimeRoot, 'exe')) return 'missing-runtime-exe';
    if (!runtimeAppPresent(runtimeRoot, 'asar')) return 'missing-runtime-asar';
    if (stock.appName && darwinRuntimeLinksStock(runtimeRoot, stock.appName)) return 'runtime-layout';
  } else {
    if (!existsSync(join(runtimeRoot, 'ECHO.exe'))) return 'missing-runtime-exe';
    if (!existsSync(join(runtimeRoot, 'resources', 'app.asar'))) return 'missing-runtime-asar';
  }
  if (!previous) return 'no-fingerprint';
  if (previous.asarSha256 !== stock.asarSha256) return 'asar-changed';
  if (previous.exeSize !== stock.exeSize || previous.exeMtimeMs !== stock.exeMtimeMs) return 'exe-changed';
  if (previous.echoVersion && stock.echoVersion && previous.echoVersion !== stock.echoVersion) return 'version-changed';
  if (process.platform !== 'darwin' && previous.patchStatus !== 'patched' && previous.patchStatus !== 'already-patched') return 'patch-incomplete';
  return null;
};

const rebuildRuntimeFiles = (echoRoot, stockExe, runtimeRoot) => {
  mkdirSync(join(runtimeRoot, 'resources'), { recursive: true });
  for (const entry of readdirSync(echoRoot, { withFileTypes: true })) {
    const source = join(echoRoot, entry.name);
    const target = join(runtimeRoot, entry.name);
    if (entry.isFile()) {
      if (/^ECHO/iu.test(entry.name) && /\.exe$/iu.test(entry.name)) continue;
      replaceFile(source, target, { hardlink: true });
      continue;
    }
    if (!entry.isDirectory() || skipRootDirs.has(entry.name)) continue;
    ensureJunction(source, target);
  }
  replaceFile(stockExe, join(runtimeRoot, 'ECHO.exe'), { hardlink: false });
  const stockResources = join(echoRoot, 'resources');
  const runtimeResources = join(runtimeRoot, 'resources');
  mkdirSync(runtimeResources, { recursive: true });
  for (const entry of readdirSync(stockResources, { withFileTypes: true })) {
    const source = join(stockResources, entry.name);
    const target = join(runtimeResources, entry.name);
    if (entry.name === 'app.asar') continue;
    if (entry.isDirectory()) ensureJunction(source, target);
    else replaceFile(source, target, { hardlink: true });
  }
  const stockAsar = join(stockResources, 'app.asar');
  replaceFile(stockAsar, join(runtimeResources, 'app.asar'), { hardlink: false });
  mkdirSync(join(runtimeRoot, 'ShinawaseLoader', 'backups'), { recursive: true });
};

const FALLBACK_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict></plist>
`;

const darwinAppBundle = (asarPath) => dirname(dirname(dirname(asarPath)));

const darwinSignatureOk = (appPath) => spawnSync('/usr/bin/codesign', ['--verify', '--strict', appPath], {
  encoding: 'utf8',
}).status === 0;

// The isolated bundle's Info.plist and app.asar change, which breaks a
// Developer ID signature. Re-sign that copy only. Never the stock app.
export const resignIsolatedDarwinApp = (runtimeApp, stockApp) => {
  const normalized = String(runtimeApp || '');
  if (!/\/modded-runtime\//u.test(normalized) || !existsSync(join(normalized, 'Contents', 'MacOS', 'ECHO'))) {
    return { status: 'refused' };
  }
  if (process.platform !== 'darwin') return { status: 'skipped' };
  const entitlementsPath = join(dirname(dirname(normalized)), 'backups', 'darwin-entitlements.plist');
  mkdirSync(dirname(entitlementsPath), { recursive: true });
  let entitlements = '';
  if (stockApp && existsSync(stockApp)) {
    const extracted = spawnSync('/usr/bin/codesign', ['-d', '--entitlements', ':-', stockApp]);
    entitlements = Buffer.from(extracted.stdout || '').toString('utf8');
  }
  if (!entitlements.includes('<plist')) entitlements = FALLBACK_ENTITLEMENTS;
  writeFileSync(entitlementsPath, entitlements);
  spawnSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', normalized], { encoding: 'utf8' });
  const signed = spawnSync('/usr/bin/codesign', [
    '--force', '--sign', '-', '--options', 'runtime', '--entitlements', entitlementsPath, normalized,
  ], { encoding: 'utf8' });
  if (signed.status !== 0) {
    return { status: 'failed', error: `${signed.stderr || signed.stdout || ''}`.trim() || 'codesign_failed' };
  }
  return { status: 'signed' };
};

export const syncModdedRuntime = (options = {}) => {
  const loaderRoot = resolve(options.loaderRoot || loaderDir);
  const echoRoot = resolve(options.echoRoot || join(loaderRoot, '..'));
  const runtimeRoot = resolve(options.runtimeRoot || join(loaderRoot, 'modded-runtime'));
  const force = options.force === true;
  const stock = fingerprintStock(echoRoot);
  const previous = readRuntimeFingerprint(loaderRoot);
  const reason = runtimeNeedsSync(stock, previous, runtimeRoot, force);
  if (!reason) {
    // A runtime copied before the plist hash was refreshed is still current
    // by archive fingerprint. Bring ElectronAsarIntegrity in line without
    // rebuilding the bundle.
    if (process.platform === 'darwin') {
      try { syncIntegrity(runtimeRoot); } catch {}
      const runtimeApp = stock.appName ? join(runtimeRoot, stock.appName) : '';
      if (runtimeApp && !darwinSignatureOk(runtimeApp)) {
        try { resignIsolatedDarwinApp(runtimeApp, stock.asar ? darwinAppBundle(stock.asar) : null); } catch {}
      }
    }
    return { ok: true, status: 'current', reason: null, stock, previous, runtimeRoot };
  }

  const runtimeExe = process.platform === 'darwin' && stock.appName
    ? join(runtimeRoot, stock.appName, 'Contents', 'MacOS', 'ECHO')
    : join(runtimeRoot, 'ECHO.exe');
  if (fileBusy(runtimeExe)) {
    return {
      ok: false,
      status: 'busy',
      reason,
      error: 'runtime_in_use',
      stock,
      previous,
      runtimeRoot,
    };
  }

  if (process.platform === 'darwin') {
    const app = findDarwinApp(echoRoot);
    if (!app) throw new Error(`stock_echo_missing:${echoRoot}`);
    rebuildDarwinRuntime(app, runtimeRoot);
  } else {
    rebuildRuntimeFiles(echoRoot, stock.exe, runtimeRoot);
  }

  const gameBackup = join(loaderRoot, 'backups', 'app.asar.original');
  mkdirSync(dirname(gameBackup), { recursive: true });
  const stockAsar = process.platform === 'darwin'
    ? stock.asar
    : join(echoRoot, 'resources', 'app.asar');
  copyFileSync(stockAsar, gameBackup);

  let patchResult = null;
  let patchError = null;
  try {
    patchResult = patch(runtimeRoot);
  } catch (error) {
    patchError = error instanceof Error ? error.message : String(error);
  }

  let signature = null;
  if (process.platform === 'darwin' && stock.appName) {
    try {
      signature = resignIsolatedDarwinApp(join(runtimeRoot, stock.appName), stock.asar ? darwinAppBundle(stock.asar) : null);
    } catch (error) {
      signature = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }

  const next = {
    ...stock,
    syncedAt: new Date().toISOString(),
    reason,
    patchStatus: patchResult?.status || 'patch-failed',
    patchError,
    runtimeRoot,
    loaderVersion: readJson(join(loaderRoot, 'loader-version.json'), {})?.version || null,
  };
  writeJson(fingerprintPathFor(loaderRoot), next);
  return {
    ok: !patchError,
    status: patchError ? 'copied-unpatched' : 'updated',
    reason,
    stock,
    previous,
    next,
    patch: patchResult,
    signature,
    error: patchError,
    runtimeRoot,
  };
};

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : null;
  };
  const echoHint = option('--echo') || process.env.ECHO_ROOT || process.env.ECHO_EXE || join(loaderDir, '..');
  const macRoot = process.platform === 'win32' ? null : installRootFromTarget(echoHint);
  const echoRoot = macRoot || (existsSync(echoHint) && statSync(echoHint).isFile() ? dirname(echoHint) : echoHint);
  const loaderRoot = option('--loader') || process.env.ECHO_MOD_HOME || loaderDir;
  if (!args.includes('--skip-update')) {
    const updater = join(loaderRoot, 'ShinawaseLoader.mjs');
    if (existsSync(updater)) {
      try {
        spawnSync(process.execPath, [updater, 'self-update', '--auto', '--quiet'], {
          cwd: loaderRoot,
          env: { ...process.env, ECHO_MOD_HOME: loaderRoot, ECHO_GAME_ROOT: echoRoot },
          timeout: 120000,
          windowsHide: true,
          stdio: 'ignore',
        });
      } catch {}
    }
  }
  try {
    const result = syncModdedRuntime({
      echoRoot,
      loaderRoot,
      force: args.includes('--force'),
    });
    console.log(JSON.stringify({
      ok: result.ok,
      status: result.status,
      reason: result.reason,
      echoVersion: result.stock?.echoVersion || result.next?.echoVersion || null,
      asarSha256: result.stock?.asarSha256 || null,
      patch: result.patch?.status || result.next?.patchStatus || null,
      error: result.error || null,
      runtimeRoot: result.runtimeRoot,
    }, null, 2));
    if (!result.ok && result.status !== 'busy') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
