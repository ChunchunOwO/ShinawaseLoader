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
import { patch } from './echo-asar.mjs';

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
const samePath = (left, right) => resolve(String(left || '')).replaceAll('/', '\\').toLowerCase()
  === resolve(String(right || '')).replaceAll('/', '\\').toLowerCase();

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

export const fingerprintStock = (echoRoot) => {
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
  if (!existsSync(join(runtimeRoot, 'ECHO.exe'))) return 'missing-runtime-exe';
  if (!existsSync(join(runtimeRoot, 'resources', 'app.asar'))) return 'missing-runtime-asar';
  if (!previous) return 'no-fingerprint';
  if (previous.asarSha256 !== stock.asarSha256) return 'asar-changed';
  if (previous.exeSize !== stock.exeSize || previous.exeMtimeMs !== stock.exeMtimeMs) return 'exe-changed';
  if (previous.echoVersion && stock.echoVersion && previous.echoVersion !== stock.echoVersion) return 'version-changed';
  if (previous.patchStatus !== 'patched' && previous.patchStatus !== 'already-patched') return 'patch-incomplete';
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

export const syncModdedRuntime = (options = {}) => {
  const loaderRoot = resolve(options.loaderRoot || loaderDir);
  const echoRoot = resolve(options.echoRoot || join(loaderRoot, '..'));
  const runtimeRoot = resolve(options.runtimeRoot || join(loaderRoot, 'modded-runtime'));
  const force = options.force === true;
  const stock = fingerprintStock(echoRoot);
  const previous = readRuntimeFingerprint(loaderRoot);
  const reason = runtimeNeedsSync(stock, previous, runtimeRoot, force);
  if (!reason) {
    return { ok: true, status: 'current', reason: null, stock, previous, runtimeRoot };
  }

  const runtimeExe = join(runtimeRoot, 'ECHO.exe');
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

  rebuildRuntimeFiles(echoRoot, stock.exe, runtimeRoot);

  const gameBackup = join(loaderRoot, 'backups', 'app.asar.original');
  mkdirSync(dirname(gameBackup), { recursive: true });
  copyFileSync(join(echoRoot, 'resources', 'app.asar'), gameBackup);

  let patchResult = null;
  let patchError = null;
  try {
    patchResult = patch(runtimeRoot);
  } catch (error) {
    patchError = error instanceof Error ? error.message : String(error);
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
  const echoRoot = existsSync(echoHint) && statSync(echoHint).isFile() ? dirname(echoHint) : echoHint;
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
