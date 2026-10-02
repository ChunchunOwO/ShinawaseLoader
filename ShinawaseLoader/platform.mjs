import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { basename, dirname, join, resolve } from 'node:path';

// Windows path classification uses explicit separators so the same results
// hold when these helpers run on macOS. Filesystem joins stay path.join.

export const DARWIN_APP_NAMES = ['ECHO.app', 'ECHO Steam.app', 'ECHO NEXT.app', 'ECHO Playtest.app'];

// A Linux Electron install is flat like Windows (ECHO beside resources/app.asar), minus the .exe.
export const LINUX_EXE_NAMES = ['ECHO', 'ECHO Steam', 'ECHO NEXT', 'ECHO Playtest', 'echo-steam'];

// Existing Steam roots on Linux, de-duplicated by real path (~/.steam/steam is a symlink).
export const linuxSteamRoots = ({ home = homedir(), env = process.env } = {}) => {
  const roots = new Set();
  for (const candidate of [
    join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'Steam'),
    join(home, '.steam', 'steam'),
    join(home, '.steam', 'root'),
    join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam'),
  ]) {
    try { roots.add(realpathSync(candidate)); } catch {}
  }
  return [...roots];
};

const winSegments = (value) => String(value || '').replaceAll('/', '\\').replace(/\\+$/u, '').split('\\');

const winBase = (value) => {
  const parts = winSegments(value);
  return parts[parts.length - 1] || '';
};

const winParent = (value) => {
  const parts = winSegments(value);
  parts.pop();
  return parts[parts.length - 1] || '';
};

export const loaderStateDirectory = ({
  platform = process.platform,
  env = process.env,
  home = homedir(),
} = {}) => {
  if (platform === 'win32') return join(env.LOCALAPPDATA || env.APPDATA || home, 'ShinawaseLoader');
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'ShinawaseLoader');
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'ShinawaseLoader');
};

export const echoUserDataDirectory = ({
  platform = process.platform,
  env = process.env,
  home = homedir(),
  folderName = 'ECHO Steam',
} = {}) => {
  const override = String(env.ECHO_USER_DATA_PATH_OVERRIDE || '').trim();
  if (override) return resolve(override);
  if (platform === 'win32') {
    const appData = env.APPDATA || (env.USERPROFILE ? join(env.USERPROFILE, 'AppData', 'Roaming') : join(home, 'AppData', 'Roaming'));
    return join(appData, folderName);
  }
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', folderName);
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), folderName);
};

export const isEchoExecutablePath = (filePath, platform = process.platform) => {
  const name = winBase(filePath);
  if (platform === 'win32') return /^ECHO(?:\s+(?:NEXT|Playtest|Steam))?\.exe$/iu.test(name);
  if (platform === 'darwin') return /\/Contents\/MacOS\/ECHO$/u.test(String(filePath || '').replaceAll('\\', '/'));
  if (platform === 'linux') {
    // "echo" is also a coreutils binary, so require the Electron layout beside it.
    const file = String(filePath || '');
    return LINUX_EXE_NAMES.includes(basename(file)) && existsSync(join(dirname(file), 'resources', 'app.asar'));
  }
  return /^ECHO(?:\s+(?:NEXT|Playtest|Steam))?\.exe$/iu.test(name);
};

export const isPlaytestPath = (exePath, platform = process.platform) => {
  const normalized = String(exePath || '').replaceAll('/', '\\');
  const name = winBase(normalized);
  const parent = winParent(normalized);
  const win = /^ECHO Playtest\.exe$/iu.test(name) || /ECHO Playtest/i.test(parent) || /\\ECHO Playtest\\/i.test(normalized);
  if (platform === 'win32') return win;
  return win || /ECHO Playtest\.app/i.test(String(exePath || '').replaceAll('\\', '/'));
};

export const rankEchoInstall = (exePath, platform = process.platform) => {
  if (platform === 'linux') {
    const normalized = String(exePath || '').replaceAll('\\', '/');
    if (isPlaytestPath(normalized, platform)) return 80;
    if (/\/ECHO NEXT\/[^/]+$/u.test(normalized)) return 70;
    if (/\/common\/ECHO\/ECHO$/u.test(normalized)) return 0;
    if (/\/(?:ECHO Steam|echo-steam)$/u.test(normalized)) return 10;
    if (/\/ECHO$/u.test(normalized)) return 20;
    return 40;
  }
  if (platform !== 'win32') {
    const normalized = String(exePath || '').replaceAll('\\', '/');
    if (isPlaytestPath(normalized, platform)) return 80;
    if (/\/ECHO NEXT\.app\/Contents\/MacOS\/ECHO$/i.test(normalized)) return 70;
    if (/\/common\/ECHO\/ECHO\.app\/Contents\/MacOS\/ECHO$/i.test(normalized)) return 0;
    if (/\/ECHO Steam\.app\/Contents\/MacOS\/ECHO$/i.test(normalized)) return 10;
    if (/\/ECHO\.app\/Contents\/MacOS\/ECHO$/i.test(normalized)) return 20;
    return 40;
  }
  const normalized = String(exePath || '').replaceAll('/', '\\');
  const name = winBase(normalized);
  const parent = winParent(normalized);
  if (isPlaytestPath(normalized, 'win32')) return 80;
  if (/\bNEXT\b/i.test(name) || /^ECHO NEXT$/i.test(parent)) return 70;
  if (/\\common\\ECHO\\ECHO\.exe$/i.test(normalized)) return 0;
  if (/^ECHO Steam\.exe$/iu.test(name)) return 10;
  if (/^ECHO\.exe$/iu.test(name)) return 20;
  return 40;
};

// Content root that contains ECHO.app. Null on Windows and for ordinary directories.
export const installRootFromTarget = (target, platform = process.platform) => {
  if (platform === 'win32') return null;
  const posix = String(target || '').replaceAll('\\', '/').replace(/\/+$/u, '');
  const binary = posix.match(/^(.*)\/[^/]+\.app\/Contents\/MacOS\/ECHO$/u);
  if (binary) return binary[1] || '/';
  const bundle = posix.match(/^(.*)\/([^/]+\.app)$/u);
  if (bundle) return bundle[1] || '/';
  return null;
};

export const resourcesDirForExecutable = (exePath, platform = process.platform) => {
  if (platform === 'linux') return join(dirname(exePath), 'resources');
  if (platform !== 'win32') {
    const macOs = dirname(exePath);
    const contents = dirname(macOs);
    if (winBase(macOs) === 'MacOS' && winBase(contents) === 'Contents') return join(contents, 'Resources');
  }
  return path.win32.join(path.win32.dirname(exePath), 'resources');
};

export const filterSteamCommandArgs = (args) => {
  const names = new Set([
    'echo.exe',
    'echo steam.exe',
    'echo next.exe',
    'echo playtest.exe',
    'echo.modded.exe',
    'echo.modded.command',
    'echo.modded.sh',
    'echo steam',
    'echo next',
    'echo playtest',
    'echo-steam',
    'echo',
  ]);
  return (Array.isArray(args) ? args : []).filter((value) => {
    const trimmed = String(value ?? '').trim().replace(/^"|"$/g, '');
    if (!trimmed || trimmed.toLowerCase() === '%command%') return false;
    const base = trimmed.split(/[\\/]/u).pop().toLowerCase();
    if (names.has(base)) return false;
    return !/\/Contents\/MacOS\/ECHO$/u.test(trimmed.replaceAll('\\', '/'));
  });
};

export const planModdedLaunchArgs = (args, { debugPort = 9229, inspectPort = 9230 } = {}) => {
  const launchArgs = filterSteamCommandArgs(args);
  if (!launchArgs.some((value) => String(value).toLowerCase().startsWith('--remote-debugging-port='))) {
    launchArgs.push(`--remote-debugging-port=${debugPort}`);
  }
  if (!launchArgs.some((value) => String(value).toLowerCase().startsWith('--inspect='))) {
    launchArgs.push(`--inspect=${inspectPort}`);
  }
  return launchArgs;
};

export const pathsEqual = (left, right, platform = process.platform) => {
  const finish = (value) => (platform === 'win32'
    ? resolve(String(value || '')).replaceAll('/', '\\').toLowerCase()
    : resolve(String(value || '')));
  return finish(left) === finish(right);
};
