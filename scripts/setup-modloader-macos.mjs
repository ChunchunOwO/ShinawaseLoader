#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DARWIN_APP_NAMES, installRootFromTarget, isPlaytestPath, rankEchoInstall } from '../ShinawaseLoader/platform.mjs';
import { DEFAULT_UPDATE_MIRRORS, normalizeMirrorBases, sha256Hex } from '../ShinawaseLoader/update-net.mjs';
import { detectEchoRuntime } from '../ShinawaseLoader/echo-runtime.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const copySkip = new Set([
  'node.exe',
  'node_modules',
  'loader-state.json',
  'loader-debug.log',
  'loader.config.json',
  'Logs',
  'backups',
  'modded-runtime',
  'native-host.json',
]);

export const option = (args, name) => {
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
  steamOnly = false,
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
    if (!steamOnly) consider(libraryRoot);
    const folders = steamOnly ? ['ECHO', 'ECHO Steam'] : STEAM_LIBRARY_FOLDERS;
    for (const folder of folders) consider(join(common, folder));
  };
  if (!steamOnly && env.ECHO_ROOT) consider(env.ECHO_ROOT);
  const vdf = join(home, 'Library', 'Application Support', 'Steam', 'steamapps', 'libraryfolders.vdf');
  if (fsExists(vdf)) {
    try {
      const text = readFile(vdf);
      for (const match of text.matchAll(/"path"\s+"([^"]+)"/giu)) addLibrary(match[1].replaceAll('\\\\', '\\'));
    } catch {}
  }
  addLibrary(join(home, 'Library', 'Application Support', 'Steam'));
  const selectionPath = join(home, 'Library', 'Application Support', 'ShinawaseLoader', 'selection.json');
  if (!steamOnly && fsExists(selectionPath)) {
    try {
      const selection = JSON.parse(readFile(selectionPath));
      consider(selection.echoExe || selection.echoRoot);
    } catch {}
  }
  if (!steamOnly && includeSystemRoots) {
    consider('/Applications');
    consider(join(home, 'Applications'));
  }
  if (!steamOnly) {
    for (const app of bundleApps ?? spotlightEchoApps()) consider(app);
  }
  return [...found].sort((left, right) => rankEchoInstall(left, 'darwin') - rankEchoInstall(right, 'darwin') || left.localeCompare(right));
};

// Normal setup only searches actual Steam libraries; development builds and
// Spotlight results remain available to other discovery callers.
export const discoverSteamEchoExecutables = (options = {}) => (
  discoverDarwinEchoExecutables({ ...options, steamOnly: true })
    .filter((file) => !isPlaytestPath(file, 'darwin'))
);

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

export const writeCommand = (file, lines) => {
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  chmodSync(file, 0o755);
};

// The streaming bridge hot-loads @neteasecloudmusicapienhanced/api from beside
// streaming-bridge.cjs (ShinawaseLoader/package.json). Without it the netease
// provider falls back to raw HTTP endpoints that now return 404, so the Windows
// installer runs Install-StreamingBridgeDeps; this is the POSIX equivalent.
// Contents stay pinned by package-lock.json integrity hashes, so a mirror cannot
// alter what gets installed.
const NPM_INSTALL_ARGS = [
  'install',
  '--omit=dev',
  '--no-audit',
  '--no-fund',
  '--engine-strict=false',
  '--replace-registry-host=always',
  '--fetch-timeout=30000',
  '--fetch-retries=1',
];

const DEPS_MARKER = ['node_modules', '@neteasecloudmusicapienhanced', 'api', 'package.json'];
const LOCK_STAMP = ['node_modules', '.shinawase-deps-lock.sha256'];

// SHINAWASE_MIRRORS overrides the built-in download mirrors ("none" disables them);
// SHINAWASE_NPM_REGISTRY switches the public registry (e.g. https://registry.npmjs.org).
export const npmRegistrySources = ({ env = process.env } = {}) => {
  const bases = env.SHINAWASE_MIRRORS === undefined
    ? normalizeMirrorBases(DEFAULT_UPDATE_MIRRORS)
    : normalizeMirrorBases(String(env.SHINAWASE_MIRRORS).split(','));
  const publicUrl = String(env.SHINAWASE_NPM_REGISTRY || 'https://registry.npmmirror.com').replace(/\/+$/u, '');
  return [
    ...bases.map((base) => ({ id: `mirror ${base}`, url: `${base}/npm/`, timeoutMs: 240_000 })),
    { id: 'registry', url: publicUrl, timeoutMs: 900_000 },
  ];
};

// Official Node ships npm inside <prefix>/lib, a distro Node only puts `npm` on PATH.
export const resolveNpmRunner = ({
  loaderRoot,
  nodePath = process.execPath,
  env = process.env,
  exists = existsSync,
} = {}) => {
  const binDir = dirname(resolve(nodePath));
  for (const cli of [
    join(loaderRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(binDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(binDir), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]) {
    if (exists(cli)) return { file: nodePath, prefixArgs: [cli] };
  }
  return { file: env.SHINAWASE_NPM_BIN || 'npm', prefixArgs: [] };
};

export const installStreamingBridgeDeps = ({
  loaderRoot,
  nodePath = process.execPath,
  env = process.env,
  spawn = spawnSync,
  registries = npmRegistrySources({ env }),
  exists = existsSync,
  readFile = (file) => readFileSync(file, 'utf8'),
  writeFile = (file, data) => writeFileSync(file, data, 'utf8'),
} = {}) => {
  if (!exists(join(loaderRoot, 'package.json'))) return { status: 'skipped', reason: 'no_package_json' };
  const marker = join(loaderRoot, ...DEPS_MARKER);
  const stampFile = join(loaderRoot, ...LOCK_STAMP);
  let lockHash = '';
  try { lockHash = sha256Hex(readFile(join(loaderRoot, 'package-lock.json'))); } catch { lockHash = ''; }
  if (lockHash && exists(marker)) {
    try { if (readFile(stampFile).trim() === lockHash) return { status: 'up-to-date' }; } catch {}
  }
  const runner = resolveNpmRunner({ loaderRoot, nodePath, env, exists });
  const attempts = [];
  for (const source of registries) {
    const result = spawn(runner.file, [...runner.prefixArgs, ...NPM_INSTALL_ARGS, `--registry=${source.url}`], {
      cwd: loaderRoot,
      encoding: 'utf8',
      timeout: source.timeoutMs,
      env: { ...env, npm_config_registry: source.url, npm_config_engine_strict: 'false' },
    });
    const detail = `${String(result.stderr || result.stdout || result.error?.message || '').trim().slice(-400)}`;
    const ok = result.status === 0 && exists(marker);
    attempts.push({ id: source.id, ok, detail });
    if (!ok) continue;
    if (lockHash) {
      try { mkdirSync(dirname(stampFile), { recursive: true }); writeFile(stampFile, lockHash); } catch {}
    }
    return { status: 'installed', registry: source.id, attempts };
  }
  return { status: 'failed', hint: attempts.find((item) => item.detail)?.detail || 'npm install failed' };
};

export const streamingDepsWarning = (result) => (
  result && result.status === 'failed'
    ? `streaming 依赖安装失败（${result.hint}）。网易云音源会保持降级，可在 Loader 目录手动执行 npm install 后重试。`
    : null
);

export const installMacLoader = ({
  source = join(repoRoot, 'ShinawaseLoader'),
  echoRoot,
  nodePath = process.execPath,
  packages = false,
  deps = false,
  onProgress = () => {},
  locale = 'zh',
  stateDirectory = join(homedir(), 'Library', 'Application Support', 'ShinawaseLoader'),
} = {}) => {
  if (!echoRoot) throw new Error('echo_root_missing');
  const root = resolve(echoRoot);
  const executable = findDarwinExecutable(root);
  if (!executable) throw new Error(`echo_app_not_found:${root}`);
  const runtime = detectEchoRuntime(executable, { platform: 'darwin' });
  const contentRoot = installRootFromTarget(executable, 'darwin');
  if (!contentRoot) throw new Error(`echo_content_root_missing:${executable}`);
  const loaderRoot = join(contentRoot, 'ShinawaseLoader');
  const modsRoot = join(contentRoot, 'Mods');
  const pluginsRoot = join(contentRoot, 'Plugins');
  mkdirSync(join(loaderRoot, 'Logs'), { recursive: true });
  mkdirSync(modsRoot, { recursive: true });
  mkdirSync(pluginsRoot, { recursive: true });
  onProgress('复制 Loader 文件…');
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
  config.autoStart = runtime.runtime !== 'gpui';
  config.autoStartMode = runtime.runtime === 'gpui' ? 'manual' : 'app-asar-bridge';
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
  onProgress('初始化 Loader…');
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
  onProgress('准备隔离运行时（首次复制可能需要一些时间）…');
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
  if (packages) {
    onProgress('导入预装 Mod…');
    importBundledPackages(nodePath, contentRoot, loaderRoot, locale);
  }
  if (deps) onProgress('安装 streaming 依赖（可能需要下载，请稍候）…');
  const depsResult = deps ? installStreamingBridgeDeps({ loaderRoot, nodePath }) : { status: 'skipped' };
  return {
    echoRoot: contentRoot,
    executable,
    loaderRoot,
    launcher: join(contentRoot, 'ECHO.modded.command'),
    depsResult,
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
export const importBundledPackages = (nodePath, echoRoot, loaderRoot, locale) => {
  const packages = join(repoRoot, 'examples', 'packages');
  if (!existsSync(packages)) return [];
  const enabled = [];
  const script = join(loaderRoot, 'ShinawaseLoader.mjs');
  for (const name of ['ECHO-Streaming.echomod', 'ECHO-MV.echomod', 'ECHO-LyricsMatchWhitebox.echomod']) {
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

// Finder may quote paths or backslash-escape spaces when dragging a bundle
// into Terminal. Decode those forms as text; never evaluate shell input.
export const normalizeMacInputPath = (input, home = homedir()) => {
  let value = String(input || '').trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\\([\s()'"&\[\]#$;])/gu, '$1');
  }
  if (value === '~') return home;
  return value.startsWith('~/') ? join(home, value.slice(2)) : value;
};

export const MAC_SETUP_HELP = `ShinawaseLoader macOS 安装助手
默认打开交互菜单，不自动安装或启动。
  --echo <路径>     预选 ECHO.app 或所在目录
  --no-packages     不导入预装 Mod
  --no-deps         不安装 streaming 依赖
  --locale <语言>   Loader 语言（默认 zh）
  --yes             无交互安装，必须同时指定 --echo
  --launch          安装成功后启动（仅搭配 --yes）
  --help            显示帮助
例：./setup-modloader.sh --yes --echo "<ECHO_ROOT>" --no-packages`;

export const runMacSetup = async ({
  args = [],
  env = process.env,
  ask = async () => null,
  write = console.log,
  interactive = true,
  discover = discoverSteamEchoExecutables,
  install = installMacLoader,
  launch = (file) => spawnSync(file, [], { stdio: 'inherit' }),
} = {}) => {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (['--echo', '--locale'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少参数。`);
      values[arg] = value;
    } else if (['--yes', '--no-packages', '--no-deps', '--launch', '--help', '-h'].includes(arg)) {
      flags.add(arg);
    } else {
      throw new Error(`未知参数：${arg}。使用 --help 查看帮助。`);
    }
  }
  if (flags.has('--help') || flags.has('-h')) { write(MAC_SETUP_HELP); return 0; }
  if (flags.has('--launch') && !flags.has('--yes')) throw new Error('--launch 需搭配 --yes；交互模式请在菜单中选择启动。');
  if (!flags.has('--yes') && !interactive) throw new Error('请在终端打开菜单，或使用 --yes --echo "<ECHO_ROOT>" 无交互安装。');
  if (flags.has('--yes') && !values['--echo']) throw new Error('--yes 必须指定 --echo，避免安装到错误目录。');
  let packages = !flags.has('--no-packages');
  let deps = !flags.has('--no-deps');
  let target = null;
  const select = (input) => {
    const path = normalizeMacInputPath(input);
    const executable = path && findDarwinExecutable(path);
    if (!executable || (!existsSync(join(dirname(dirname(executable)), 'Resources', 'app.asar'))
      && detectEchoRuntime(executable, { platform: 'darwin' }).runtime !== 'gpui')) {
      throw new Error('该路径没有完整的 ECHO.app（需要 Contents/MacOS/ECHO 和 Resources/app.asar）。');
    }
    target = installRootFromTarget(executable, 'darwin');
  };
  const scanSteam = () => discover().filter((file) => !isPlaytestPath(file, 'darwin'));
  const hint = values['--echo'] || env.ECHO_ROOT;
  if (hint) {
    try { select(hint); } catch (error) {
      if (flags.has('--yes')) throw error;
      write(error.message);
    }
  } else {
    const candidates = scanSteam();
    if (candidates.length === 1) {
      try { select(candidates[0]); write('已自动选择 Steam 正式版 ECHO。'); } catch (error) { write(error.message); }
    } else {
      write(candidates.length ? '发现多个 Steam 正式版，请选 1 确认安装位置。' : '未找到 Steam 正式版 ECHO，请先在 Steam 安装游戏，或选 6 手动指定路径。');
    }
  }
  const status = () => {
    write(`\n目标目录：${target || '尚未选择'}`);
    if (target) {
      const loaderRoot = join(target, 'ShinawaseLoader');
      let version = '未安装';
      if (existsSync(join(loaderRoot, 'ShinawaseLoader.mjs'))) {
        version = '已安装（版本未知）';
        try { version = JSON.parse(readFileSync(join(loaderRoot, 'loader-version.json'), 'utf8')).version || version; } catch {}
      }
      write(`Loader：${version}`);
      write(`启动入口：${existsSync(join(target, 'ECHO.modded.command')) ? '已生成' : '尚未生成'}`);
    }
    write(`预装 Mod：${packages ? '开启' : '关闭'}；streaming 依赖：${deps ? '开启（可能联网下载）' : '关闭'}`);
  };
  const performInstall = () => {
    const result = install({ echoRoot: target, packages, deps, locale: values['--locale'] || env.ECHO_LOADER_LOCALE || 'zh', onProgress: write });
    if (result.syncStatus !== 0) throw new Error(`隔离运行时准备失败，请修复后重试。\n${result.syncOutput}`);
    write(`安装完成：${result.echoRoot}`);
    const warning = streamingDepsWarning(result.depsResult);
    if (warning) write(warning);
    write(`Steam 启动项：\n"${result.launcher}" %command%`);
    return result;
  };
  if (flags.has('--yes')) {
    status();
    const installed = performInstall();
    return flags.has('--launch') ? launch(installed.launcher).status ?? 1 : 0;
  }
  write('\nShinawaseLoader · macOS 安装助手');
  while (true) {
    status();
    write('\n1. 重新扫描 Steam 正式版 ECHO\n2. 开关预装 Mod（Streaming / MV / Lyrics Match Whitebox）\n3. 开关 streaming 依赖安装\n4. 安装 / 更新 Loader\n5. 启动已安装的 Mod 版 ECHO\n6. 手动指定 ECHO 路径（高级）\n0. 退出');
    const answer = await ask('请选择 [0-6]：');
    if (answer === null || answer.trim() === '0') return 0;
    try {
      switch (answer.trim()) {
        case '1': {
          const candidates = scanSteam();
          if (!candidates.length) {
            write('未找到 Steam 正式版 ECHO，请先在 Steam 安装游戏，或选 6 手动指定路径。');
            break;
          }
          if (candidates.length === 1) {
            select(candidates[0]);
            write('已自动选择 Steam 正式版 ECHO，无需选择编号。');
            break;
          }
          write('发现多个 Steam 安装位置：');
          candidates.forEach((file, index) => write(`${index + 1}. ${installRootFromTarget(file, 'darwin')}`));
          const input = await ask('选择 Steam 安装位置编号（回车取消）：');
          if (input === null || !input.trim()) break;
          const number = /^\d+$/u.test(input.trim()) ? Number(input.trim()) : null;
          if (number === null || !candidates[number - 1]) throw new Error('列表编号无效。');
          select(candidates[number - 1]);
          break;
        }
        case '6': {
          const input = await ask('输入 ECHO 路径（可拖入 ECHO.app，回车取消）：');
          if (input !== null && input.trim()) select(input);
          break;
        }
        case '2': packages = !packages; break;
        case '3': deps = !deps; break;
        case '4': {
          if (!target) throw new Error('请先选择 ECHO 目录。');
          status();
          write('将写入上述目录的 ShinawaseLoader、Mods、Plugins 和启动脚本。请先退出 ECHO。');
          const confirmation = await ask('确认安装 / 更新？[y/N]：');
          if (!/^(y|yes)$/iu.test(confirmation?.trim() || '')) { write('已取消安装。'); break; }
          performInstall();
          break;
        }
        case '5': {
          if (!target) throw new Error('请先选择 ECHO 目录。');
          const file = join(target, 'ECHO.modded.command');
          if (!existsSync(file)) throw new Error('没有启动入口，请先安装 Loader。');
          write('正在启动 Mod 版 ECHO…（关闭 ECHO 后返回菜单）');
          if (launch(file).status !== 0) throw new Error('启动失败，请检查上方输出。');
          break;
        }
        default: write('请输入 0 到 6。');
      }
    } catch (error) {
      write(`操作失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  let terminal;
  try {
    if (process.platform !== 'darwin') throw new Error('此脚本仅用于 macOS。Windows 请运行 setup-modloader.bat；Linux 请运行 setup-modloader.sh。');
    const args = process.argv.slice(2);
    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    let ask;
    if (interactive && !args.includes('--yes')) {
      terminal = createInterface({ input: process.stdin, output: process.stdout });
      const lines = terminal[Symbol.asyncIterator]();
      terminal.on('SIGINT', () => terminal.close());
      ask = async (prompt) => {
        process.stdout.write(prompt);
        const answer = await lines.next();
        return answer.done ? null : answer.value;
      };
    }
    process.exitCode = await runMacSetup({ args, interactive, ask });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    terminal?.close();
  }
}
