#!/usr/bin/env node
// Linux installer. A Linux Electron install is flat like Windows (ECHO beside
// resources/app.asar), so the Loader sits next to it and the isolated runtime is a
// flat copy. Shared helpers come from the macOS installer; nothing here runs on
// Windows or macOS.
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LINUX_EXE_NAMES,
  isEchoExecutablePath,
  isPlaytestPath,
  linuxSteamRoots,
  loaderStateDirectory,
  rankEchoInstall,
} from '../ShinawaseLoader/platform.mjs';
import { copySkip, importBundledPackages, option, writeCommand } from './setup-modloader-macos.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STEAM_LIBRARY_FOLDERS = ['ECHO', 'ECHO NEXT', 'ECHO Steam', 'ECHO Playtest'];
const inRuntimeCopy = (file) => file.split(sep).includes('modded-runtime');
const byRank = (left, right) => rankEchoInstall(left, 'linux') - rankEchoInstall(right, 'linux') || left.localeCompare(right);

// ECHO executables directly inside a directory (never the isolated runtime copy).
const executablesIn = (directory) => LINUX_EXE_NAMES
  .map((name) => join(directory, name))
  .filter((file) => !inRuntimeCopy(file) && existsSync(file) && statSync(file).isFile() && isEchoExecutablePath(file, 'linux'));

// ECHO_ROOT, every Steam library (native, ~/.steam, Flatpak, Snap), and a saved selection.
export const discoverLinuxEchoExecutables = ({
  home = homedir(),
  env = process.env,
  steamRoots = linuxSteamRoots({ home, env }),
} = {}) => {
  const found = new Set();
  const consider = (candidate) => {
    if (!candidate) return;
    const path = resolve(String(candidate));
    try {
      if (statSync(path).isFile()) {
        if (isEchoExecutablePath(path, 'linux') && !inRuntimeCopy(path)) found.add(path);
      } else {
        for (const file of executablesIn(path)) found.add(file);
      }
    } catch {}
  };
  const addLibrary = (library) => {
    for (const folder of STEAM_LIBRARY_FOLDERS) consider(join(library, 'steamapps', 'common', folder));
  };
  consider(env.ECHO_ROOT);
  for (const steam of steamRoots) {
    addLibrary(steam);
    try {
      const text = readFileSync(join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const match of text.matchAll(/"path"[ \t]+"([^"]+)"/giu)) addLibrary(match[1]);
    } catch {}
  }
  try {
    const selection = JSON.parse(readFileSync(join(loaderStateDirectory({ platform: 'linux', env, home }), 'selection.json'), 'utf8'));
    consider(selection.echoExe || selection.echoRoot);
  } catch {}
  return [...found].sort(byRank);
};

// Playtest stays discoverable but is never auto-selected.
export const resolveLinuxInstallRoot = (options = {}) => {
  const executable = discoverLinuxEchoExecutables(options).find((file) => !isPlaytestPath(file, 'linux'));
  return executable ? dirname(executable) : null;
};

export const findLinuxExecutable = (hint) => {
  if (!hint) return null;
  const path = resolve(String(hint));
  try {
    if (statSync(path).isFile()) return isEchoExecutablePath(path, 'linux') ? path : null;
    return executablesIn(path).sort(byRank)[0] || null;
  } catch {
    return null;
  }
};

export const installLinuxLoader = ({
  source = join(repoRoot, 'ShinawaseLoader'),
  echoRoot,
  nodePath = process.execPath,
  packages = false,
  locale = 'zh',
  stateDirectory = loaderStateDirectory({ platform: 'linux' }),
} = {}) => {
  if (!echoRoot) throw new Error('echo_root_missing');
  const executable = findLinuxExecutable(resolve(echoRoot));
  if (!executable) throw new Error(`echo_executable_not_found:${resolve(echoRoot)}`);
  const contentRoot = dirname(executable);
  const loaderRoot = join(contentRoot, 'ShinawaseLoader');
  mkdirSync(join(loaderRoot, 'Logs'), { recursive: true });
  mkdirSync(join(contentRoot, 'Mods'), { recursive: true });
  mkdirSync(join(contentRoot, 'Plugins'), { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (copySkip.has(entry.name)) continue;
    cpSync(join(source, entry.name), join(loaderRoot, entry.name), { recursive: true, force: true });
  }
  const configPath = join(loaderRoot, 'loader.config.json');
  let config = {};
  try { config = JSON.parse(readFileSync(existsSync(configPath) ? configPath : join(source, 'loader.config.json'), 'utf8')); } catch {}
  // Flatpak and Snap Steam cannot see the host's Node, so give the game its own copy
  // beside the loader (the launcher script looks there too).
  let runtimePath = nodePath;
  let nodeWarning = null;
  if (contentRoot.includes('/.var/app/') || contentRoot.includes('/snap/')) {
    const own = join(loaderRoot, 'node');
    try {
      copyFileSync(nodePath, own);
      chmodSync(own, 0o755);
      if (spawnSync(own, ['--version'], { encoding: 'utf8' }).status !== 0) throw new Error('node_copy_unusable');
      runtimePath = own;
    } catch {
      rmSync(own, { force: true });
      nodeWarning = '检测到沙盒版 Steam，但当前 Node 无法复制到游戏目录（常见于发行版自带、依赖共享库的 Node）。请改用官方 Node 22 二进制后重新安装，否则从 Steam 启动时可能找不到 Node。';
    }
  }
  config.runtimePath = runtimePath;
  config.autoStart = true;
  config.autoStartMode = 'app-asar-bridge';
  config.loadMode = 'external-cdp';
  config.locale = config.locale || locale;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  mkdirSync(stateDirectory, { recursive: true });
  const selectionPath = join(stateDirectory, 'selection.json');
  let selection = {};
  try { selection = JSON.parse(readFileSync(selectionPath, 'utf8')); } catch {}
  writeFileSync(selectionPath, `${JSON.stringify({
    ...selection,
    echoExe: executable,
    echoRoot: contentRoot,
    locale: selection.locale || locale,
  }, null, 2)}\n`, 'utf8');
  const env = { ...process.env, ECHO_MOD_HOME: loaderRoot, ECHO_GAME_ROOT: contentRoot, ECHO_LOADER_LOCALE: locale };
  const init = spawnSync(nodePath, [join(loaderRoot, 'ShinawaseLoader.mjs'), 'init', '--locale', locale], {
    cwd: contentRoot,
    env,
    encoding: 'utf8',
  });
  if (init.status !== 0) throw new Error(`loader_init_failed:${init.stderr || init.stdout || init.status}`);
  const sync = spawnSync(nodePath, [join(loaderRoot, 'runtime-sync.mjs'), '--echo', contentRoot, '--loader', loaderRoot, '--skip-update'], {
    cwd: contentRoot,
    env,
    encoding: 'utf8',
  });
  // ECHO.modded.command is the shared macOS/Linux launcher script.
  const launcher = join(contentRoot, 'ECHO.modded.sh');
  copyFileSync(join(repoRoot, 'scripts', 'ECHO.modded.command'), launcher);
  chmodSync(launcher, 0o755);
  const helper = (name, command) => writeCommand(join(loaderRoot, name), [
    '#!/bin/bash',
    'set -u',
    'ROOT="$(cd "$(dirname "$0")/.." && pwd)"',
    'NODE="${ECHO_NODE_PATH:-node}"',
    command,
  ]);
  helper('start-echo-with-mods.sh', 'exec "$ROOT/ECHO.modded.sh" "$@"');
  helper('start-echo-debug.sh', 'exec "$NODE" "$ROOT/ShinawaseLoader/ShinawaseLoader.mjs" run --debug --log-level debug --echo "$ROOT" "$@"');
  helper('start-echo-safe.sh', 'exec "$NODE" "$ROOT/ShinawaseLoader/ShinawaseLoader.mjs" run --safe-mode --echo "$ROOT" "$@"');
  helper('attach-to-echo.sh', 'exec "$NODE" "$ROOT/ShinawaseLoader/ShinawaseLoader.mjs" attach --echo "$ROOT" "$@"');
  if (packages) importBundledPackages(nodePath, contentRoot, loaderRoot, locale);
  return {
    echoRoot: contentRoot,
    executable,
    loaderRoot,
    launcher,
    nodeWarning,
    runtimePath,
    syncStatus: sync.status,
    syncOutput: `${sync.stdout || ''}${sync.stderr || ''}`.trim(),
  };
};

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  if (process.platform !== 'linux') {
    console.error('setup-modloader-linux.mjs 只用于 Linux。Windows 请运行 setup-modloader.bat，macOS 请运行 setup-modloader.sh。');
    process.exit(2);
  }
  const args = process.argv.slice(2);
  const hint = option(args, '--echo') || process.env.ECHO_ROOT || null;
  try {
    let echoRoot = hint;
    if (!hint) {
      echoRoot = resolveLinuxInstallRoot();
      if (!echoRoot) {
        console.error('没有找到 ECHO 可执行文件。');
        console.error('已查找 Steam 资料库（~/.local/share/Steam、~/.steam、Flatpak、Snap）。');
        console.error('也可以指定：./setup-modloader.sh --echo "<含有 ECHO 的目录>"');
        process.exit(1);
      }
      console.log(`找到 ECHO：${echoRoot}`);
    }
    const installed = installLinuxLoader({
      echoRoot,
      packages: !args.includes('--no-packages'),
      locale: option(args, '--locale') || process.env.ECHO_LOADER_LOCALE || 'zh',
    });
    console.log(`Installed beside ${installed.echoRoot}`);
    console.log('Steam launch option:');
    console.log(`"${installed.launcher}" %command%`);
    if (installed.nodeWarning) console.warn(installed.nodeWarning);
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
