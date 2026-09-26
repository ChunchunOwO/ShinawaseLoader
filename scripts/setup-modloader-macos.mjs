#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DARWIN_APP_NAMES, installRootFromTarget, isPlaytestPath, rankEchoInstall } from '../ShinawaseLoader/platform.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const copySkip = new Set([
  'node.exe',
  'loader-state.json',
  'loader-debug.log',
  'loader.config.json',
  'Logs',
  'backups',
  'modded-runtime',
  'native-host.json',
]);

const option = (args, name) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
};

const STEAM_LIBRARY_FOLDERS = ['ECHO', 'ECHO NEXT', 'ECHO Steam', 'ECHO Playtest'];

const spotlightEchoApps = () => {
  const result = spawnSync('/usr/bin/mdfind', ['kMDItemCFBundleIdentifier == "app.echo.steam"'], {
    encoding: 'utf8',
    timeout: 8000,
  });
  if (result.status !== 0) return [];
  return String(result.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
};

// Steam libraryfolders.vdf, the default Steam library, /Applications, a saved
// selection, and Spotlight. Playtest stays in the list so callers can see it,
// but resolveMacInstallRoot does not auto-select it.
export const discoverDarwinEchoExecutables = ({
  home = homedir(),
  env = process.env,
  includeSystemRoots = true,
  bundleApps = null,
  fsExists = existsSync,
  readFile = (file) => readFileSync(file, 'utf8'),
} = {}) => {
  const found = new Set();
  const consider = (candidate) => {
    if (!candidate) return;
    const path = resolve(String(candidate));
    const direct = /\/Contents\/MacOS\/ECHO$/u.test(path) ? [path] : [];
    const content = direct.length ? [] : [installRootFromTarget(path, 'darwin') || path];
    for (const root of content) {
      for (const name of DARWIN_APP_NAMES) direct.push(join(root, name, 'Contents', 'MacOS', 'ECHO'));
    }
    for (const executable of direct) {
      const normalized = resolve(executable);
      if (/\/modded-runtime\//u.test(normalized)) continue;
      if (!/\/Contents\/MacOS\/ECHO$/u.test(normalized) || !fsExists(normalized)) continue;
      found.add(normalized);
    }
  };
  const addLibrary = (libraryRoot) => {
    if (!libraryRoot) return;
    const common = join(libraryRoot, 'steamapps', 'common');
    consider(libraryRoot);
    for (const folder of STEAM_LIBRARY_FOLDERS) consider(join(common, folder));
  };
  if (env.ECHO_ROOT) consider(env.ECHO_ROOT);
  const vdf = join(home, 'Library', 'Application Support', 'Steam', 'steamapps', 'libraryfolders.vdf');
  if (fsExists(vdf)) {
    try {
      const text = readFile(vdf);
      for (const match of text.matchAll(/"path"\s+"([^"]+)"/giu)) addLibrary(match[1].replaceAll('\\\\', '\\'));
    } catch {}
  }
  addLibrary(join(home, 'Library', 'Application Support', 'Steam'));
  const selectionPath = join(home, 'Library', 'Application Support', 'ShinawaseLoader', 'selection.json');
  if (fsExists(selectionPath)) {
    try {
      const selection = JSON.parse(readFile(selectionPath));
      consider(selection.echoExe || selection.echoRoot);
    } catch {}
  }
  if (includeSystemRoots) {
    consider('/Applications');
    consider(join(home, 'Applications'));
  }
  for (const app of bundleApps ?? spotlightEchoApps()) consider(app);
  return [...found].sort((left, right) => rankEchoInstall(left, 'darwin') - rankEchoInstall(right, 'darwin') || left.localeCompare(right));
};

export const resolveMacInstallRoot = (options = {}) => {
  const executable = discoverDarwinEchoExecutables(options).find((file) => !isPlaytestPath(file, 'darwin'));
  return executable ? installRootFromTarget(executable, 'darwin') : null;
};

export const findDarwinExecutable = (hint) => {
  if (!hint) return null;
  const path = resolve(String(hint));
  if (!existsSync(path)) return null;
  const info = statSync(path);
  if (info.isFile() && /\/Contents\/MacOS\/ECHO$/u.test(path)) return path;
  const roots = info.isDirectory() ? [installRootFromTarget(path, 'darwin') || path] : [];
  const found = [];
  for (const root of roots) {
    for (const name of DARWIN_APP_NAMES) {
      const executable = join(root, name, 'Contents', 'MacOS', 'ECHO');
      if (existsSync(executable)) found.push(executable);
    }
  }
  found.sort((left, right) => rankEchoInstall(left, 'darwin') - rankEchoInstall(right, 'darwin') || left.localeCompare(right));
  return found[0] || null;
};

const writeCommand = (file, lines) => {
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  chmodSync(file, 0o755);
};

export const installMacLoader = ({
  source = join(repoRoot, 'ShinawaseLoader'),
  echoRoot,
  nodePath = process.execPath,
  packages = false,
  locale = 'zh',
  stateDirectory = join(homedir(), 'Library', 'Application Support', 'ShinawaseLoader'),
} = {}) => {
  if (!echoRoot) throw new Error('echo_root_missing');
  const root = resolve(echoRoot);
  const executable = findDarwinExecutable(root);
  if (!executable) throw new Error(`echo_app_not_found:${root}`);
  const contentRoot = installRootFromTarget(executable, 'darwin');
  if (!contentRoot) throw new Error(`echo_content_root_missing:${executable}`);
  const loaderRoot = join(contentRoot, 'ShinawaseLoader');
  const modsRoot = join(contentRoot, 'Mods');
  const pluginsRoot = join(contentRoot, 'Plugins');
  mkdirSync(join(loaderRoot, 'Logs'), { recursive: true });
  mkdirSync(modsRoot, { recursive: true });
  mkdirSync(pluginsRoot, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (copySkip.has(entry.name)) continue;
    cpSync(join(source, entry.name), join(loaderRoot, entry.name), { recursive: true, force: true });
  }
  const configPath = join(loaderRoot, 'loader.config.json');
  let config = {};
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { config = {}; }
  } else {
    try { config = JSON.parse(readFileSync(join(source, 'loader.config.json'), 'utf8')); } catch { config = {}; }
  }
  config.runtimePath = nodePath;
  config.autoStart = true;
  config.autoStartMode = 'app-asar-bridge';
  config.loadMode = 'external-cdp';
  config.locale = config.locale || locale;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  const stateDir = stateDirectory;
  mkdirSync(stateDir, { recursive: true });
  const selectionPath = join(stateDir, 'selection.json');
  let selection = {};
  if (existsSync(selectionPath)) {
    try { selection = JSON.parse(readFileSync(selectionPath, 'utf8')); } catch { selection = {}; }
  }
  writeFileSync(selectionPath, `${JSON.stringify({
    ...selection,
    echoExe: executable,
    echoRoot: contentRoot,
    locale: selection.locale || locale,
  }, null, 2)}\n`, 'utf8');
  const init = spawnSync(nodePath, [join(loaderRoot, 'ShinawaseLoader.mjs'), 'init', '--locale', locale], {
    cwd: contentRoot,
    env: {
      ...process.env,
      ECHO_MOD_HOME: loaderRoot,
      ECHO_GAME_ROOT: contentRoot,
      ECHO_LOADER_LOCALE: locale,
    },
    encoding: 'utf8',
  });
  if (init.status !== 0) {
    throw new Error(`loader_init_failed:${init.stderr || init.stdout || init.status}`);
  }
  const sync = spawnSync(nodePath, [join(loaderRoot, 'runtime-sync.mjs'), '--echo', contentRoot, '--loader', loaderRoot, '--skip-update'], {
    cwd: contentRoot,
    env: { ...process.env, ECHO_MOD_HOME: loaderRoot, ECHO_GAME_ROOT: contentRoot },
    encoding: 'utf8',
  });
  copyFileSync(join(repoRoot, 'scripts', 'ECHO.modded.command'), join(contentRoot, 'ECHO.modded.command'));
  chmodSync(join(contentRoot, 'ECHO.modded.command'), 0o755);
  writeCommand(join(loaderRoot, 'start-echo-with-mods.command'), [
    '#!/bin/bash',
    'set -u',
    'ROOT="$(cd "$(dirname "$0")/.." && pwd)"',
    'exec "$ROOT/ECHO.modded.command" "$@"',
  ]);
  writeCommand(join(loaderRoot, 'start-echo-debug.command'), [
    '#!/bin/bash',
    'set -u',
    'ROOT="$(cd "$(dirname "$0")/.." && pwd)"',
    'exec node "$ROOT/ShinawaseLoader/ShinawaseLoader.mjs" run --debug --log-level debug --echo "$ROOT" "$@"',
  ]);
  writeCommand(join(loaderRoot, 'start-echo-safe.command'), [
    '#!/bin/bash',
    'set -u',
    'ROOT="$(cd "$(dirname "$0")/.." && pwd)"',
    'exec node "$ROOT/ShinawaseLoader/ShinawaseLoader.mjs" run --safe-mode --echo "$ROOT" "$@"',
  ]);
  writeCommand(join(loaderRoot, 'attach-to-echo.command'), [
    '#!/bin/bash',
    'set -u',
    'ROOT="$(cd "$(dirname "$0")/.." && pwd)"',
    'exec node "$ROOT/ShinawaseLoader/ShinawaseLoader.mjs" attach --echo "$ROOT" "$@"',
  ]);
  if (packages) importBundledPackages(nodePath, contentRoot, loaderRoot, locale);
  return {
    echoRoot: contentRoot,
    executable,
    loaderRoot,
    launcher: join(contentRoot, 'ECHO.modded.command'),
    syncStatus: sync.status,
    syncOutput: `${sync.stdout || ''}${sync.stderr || ''}`.trim(),
  };
};

const loaderEnv = (echoRoot, loaderRoot, locale) => ({
  ...process.env,
  ECHO_MOD_HOME: loaderRoot,
  ECHO_GAME_ROOT: echoRoot,
  ECHO_LOADER_LOCALE: locale,
});

const readModState = (loaderRoot) => {
  try {
    return JSON.parse(readFileSync(join(loaderRoot, 'loader-state.json'), 'utf8')).mods || {};
  } catch {
    return {};
  }
};

// Bundled packages are enabled on first import. A later install keeps a mod
// the user already turned off. Windows setup does not call this helper.
const importBundledPackages = (nodePath, echoRoot, loaderRoot, locale) => {
  const packages = join(repoRoot, 'examples', 'packages');
  if (!existsSync(packages)) return [];
  const enabled = [];
  const script = join(loaderRoot, 'ShinawaseLoader.mjs');
  for (const name of ['ECHO-Streaming.echomod', 'ECHO-MV.echomod']) {
    const file = join(packages, name);
    if (!existsSync(file)) continue;
    const before = readModState(loaderRoot);
    const imported = spawnSync(nodePath, [script, 'import', file, '--locale', locale], {
      cwd: echoRoot,
      env: loaderEnv(echoRoot, loaderRoot, locale),
      encoding: 'utf8',
    });
    if (imported.status !== 0) continue;
    const after = readModState(loaderRoot);
    for (const [id, record] of Object.entries(after)) {
      if (before[id] || record?.enabled === true) continue;
      const result = spawnSync(nodePath, [script, 'enable', id, '--locale', locale], {
        cwd: echoRoot,
        env: loaderEnv(echoRoot, loaderRoot, locale),
        encoding: 'utf8',
      });
      if (result.status === 0) enabled.push(id);
    }
  }
  return enabled;
};

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  if (process.platform !== 'darwin') {
    console.error('setup-modloader.sh is the macOS installer. On Windows run setup-modloader.bat.');
    process.exit(2);
  }
  const args = process.argv.slice(2);
  const hint = option(args, '--echo') || process.env.ECHO_ROOT || null;
  try {
    let echoRoot = hint;
    if (!hint) {
      echoRoot = resolveMacInstallRoot();
      if (!echoRoot) {
        console.error('没有找到 ECHO.app。');
        console.error('已查找 Steam 资料库、/Applications、~/Applications，以及 Spotlight 里的 app.echo.steam。');
        console.error('也可以指定：./setup-modloader.sh --echo "<含有 ECHO.app 的目录>"');
        process.exit(1);
      }
      console.log(`找到 ECHO：${echoRoot}`);
    }
    const installed = installMacLoader({
      echoRoot,
      packages: !args.includes('--no-packages'),
      locale: option(args, '--locale') || process.env.ECHO_LOADER_LOCALE || 'zh',
    });
    const launch = `"${installed.launcher}" %command%`;
    console.log(`Installed beside ${installed.echoRoot}`);
    console.log('Steam launch option:');
    console.log(launch);
    if (installed.syncStatus !== 0) console.log(installed.syncOutput);
    if (args.includes('--launch')) {
      console.log('正在启动…');
      const child = spawnSync(installed.launcher, [], { stdio: 'inherit' });
      process.exit(child.status ?? 1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
