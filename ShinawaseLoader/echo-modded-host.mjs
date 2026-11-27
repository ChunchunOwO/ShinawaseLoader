#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DARWIN_APP_NAMES, planModdedLaunchArgs, rankEchoInstall } from './platform.mjs';
import { detectEchoRuntime, executableIn } from './echo-runtime.mjs';
import { filterSteamCommandArgs } from './platform.mjs';

const loaderDir = dirname(fileURLToPath(import.meta.url));
// ECHO's Steam AppId; 5105150 is ECHO Playtest.
const steamAppId = '5105090';

const readConfig = (loaderRoot) => {
  try { return JSON.parse(readFileSync(join(loaderRoot, 'loader.config.json'), 'utf8').replace(/^﻿/u, '')); } catch { return {}; }
};
const readRuntimePath = (loaderRoot) => {
  const runtimePath = String(readConfig(loaderRoot).runtimePath || '').trim();
  return runtimePath && existsSync(runtimePath) ? runtimePath : null;
};

// Electron reads these at startup: they must reach the helper scripts when the
// host runs on ECHO's own executable, and never the ECHO it launches.
const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE';
const NO_ASAR = 'ELECTRON_NO_ASAR';

export const resolveHostNode = (loaderRoot, env = process.env, platform = process.platform) => {
  const override = String(env.ECHO_NODE_PATH || '').trim();
  if (override && existsSync(override)) return override;
  // nodeRuntime "echo": the host itself was started as ECHO-in-Node mode.
  if (String(readConfig(loaderRoot).nodeRuntime || '').toLowerCase() === 'echo' && env[RUN_AS_NODE] === '1') return process.execPath;
  const configured = readRuntimePath(loaderRoot);
  if (configured) return configured;
  const bundled = join(loaderRoot, platform === 'win32' ? 'node.exe' : 'node');
  if (existsSync(bundled)) return bundled;
  return process.execPath || 'node';
};

export const findIsolatedDarwinBinary = (runtimeRoot) => DARWIN_APP_NAMES
  .map((name) => join(runtimeRoot, name, 'Contents', 'MacOS', 'ECHO'))
  .filter((file) => existsSync(file))
  .sort((left, right) => rankEchoInstall(left, 'darwin') - rankEchoInstall(right, 'darwin') || left.localeCompare(right))[0] || null;

// Windows and Linux use a flat runtime copy with its own ECHO executable.
export const findIsolatedBinary = (runtimeRoot, platform = process.platform) => {
  if (platform === 'darwin') return findIsolatedDarwinBinary(runtimeRoot);
  const executable = join(runtimeRoot, platform === 'win32' ? 'ECHO.exe' : 'ECHO');
  return existsSync(executable) ? executable : null;
};

const processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
};

// --wait-pid <pid>: start only after that process (a running stock ECHO that
// holds the single-instance lock) has exited. Gives up after timeoutMs.
export const waitForExit = async (pid, { timeoutMs = 10 * 60 * 1000, pollMs = 400, alive = processAlive } = {}) => {
  if (!(Number(pid) > 0)) return true;
  const deadline = Date.now() + timeoutMs;
  while (alive(Number(pid))) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollMs));
  }
  return true;
};

export const splitHostArgs = (argv) => {
  const args = [];
  let waitPid = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index]);
    if (value === '--wait-pid') { waitPid = Number(argv[index + 1]) || 0; index += 1; continue; }
    if (value.startsWith('--wait-pid=')) { waitPid = Number(value.slice('--wait-pid='.length)) || 0; continue; }
    args.push(value);
  }
  return { args, waitPid };
};

const runNodeScript = (node, loaderRoot, scriptName, args, env) => {
  const script = join(loaderRoot, scriptName);
  if (!existsSync(script)) return;
  const logs = join(loaderRoot, 'Logs');
  try { mkdirSync(logs, { recursive: true }); } catch {}
  const result = spawnSync(node, [script, ...args], {
    cwd: dirname(loaderRoot),
    env,
    timeout: 180000,
    encoding: 'utf8',
  });
  try {
    writeFileSync(join(logs, `${scriptName.replace(/\.mjs$/u, '')}.log`), [
      `[${new Date().toISOString()}] exit=${result.status}`,
      result.stdout || '',
      result.stderr || '',
      '',
    ].join('\n'), { flag: 'a' });
  } catch {}
};

const acquireLock = (loaderRoot) => {
  const logs = join(loaderRoot, 'Logs');
  mkdirSync(logs, { recursive: true });
  const lockPath = join(logs, 'modded-host.pid');
  if (existsSync(lockPath)) {
    const pid = Number(readFileSync(lockPath, 'utf8'));
    if (pid > 0) {
      try {
        process.kill(pid, 0);
        return null;
      } catch {}
    }
  }
  writeFileSync(lockPath, `${process.pid}\n`, 'utf8');
  return lockPath;
};

export const launchIsolated = ({
  echoRoot,
  loaderRoot = join(echoRoot, 'ShinawaseLoader'),
  args = [],
  env = process.env,
  spawnChild = spawn,
} = {}) => {
  const root = resolve(echoRoot);
  const loader = resolve(loaderRoot);
  const node = resolveHostNode(loader, env);
  const stock = executableIn(root);
  if (stock && detectEchoRuntime(stock).runtime === 'gpui') {
    return spawnChild(node, [join(loader, 'ShinawaseLoader.mjs'), 'run', '--echo', stock,
      ...filterSteamCommandArgs(args).filter((arg) => !/^--(?:remote-debugging-port|inspect)(?:=|$)/u.test(arg))], {
      cwd: root, stdio: 'inherit', windowsHide: true,
      env: { ...env, ECHO_GAME_ROOT: root, ECHO_MOD_HOME: loader,
        ECHO_SHINAWASE_ARGS: JSON.stringify(filterSteamCommandArgs(args)),
        ECHO_MOD_HOST_OWNS_LIFETIME: '1', ELECTRON_RUN_AS_NODE: '', ELECTRON_NO_ASAR: '' },
    });
  }
  const childEnv = {
    ...env,
    ECHO_MOD_ROOT: root,
    ECHO_MOD_HOME: loader,
    ECHO_GAME_ROOT: root,
    ECHO_MODDED_HOST: '1',
    SteamAppId: steamAppId,
    SteamGameId: steamAppId,
    ECHO_MODS_HOME: join(root, 'Mods'),
    ECHO_PLUGINS_HOME: join(root, 'Plugins'),
    ECHO_LOGS_HOME: join(loader, 'Logs'),
  };
  if (env.ECHO_SKIP_SELF_UPDATE !== '1') {
    runNodeScript(node, loader, 'ShinawaseLoader.mjs', ['self-update', '--auto', '--quiet'], childEnv);
  }
  runNodeScript(node, loader, 'runtime-sync.mjs', ['--echo', root, '--loader', loader, '--skip-update'], childEnv);
  const executable = findIsolatedBinary(join(loader, 'modded-runtime'));
  if (!executable) {
    const error = new Error('isolated_runtime_missing');
    error.code = 'isolated_runtime_missing';
    throw error;
  }
  const echoEnv = { ...childEnv };
  delete echoEnv[RUN_AS_NODE];
  delete echoEnv[NO_ASAR];
  // The ports the Loader attaches to come from its config (defaults 9229/9230).
  const config = readConfig(loader);
  const port = (value, fallback) => (Number(value) > 0 && Number(value) < 65536 ? Number(value) : fallback);
  return spawnChild(executable, planModdedLaunchArgs(args, { debugPort: port(config.debugPort, 9229), inspectPort: port(config.inspectPort, 9230) }), {
    cwd: root,
    env: echoEnv,
    stdio: 'inherit',
  });
};

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const echoRoot = resolve(process.env.ECHO_GAME_ROOT || join(loaderDir, '..'));
  const loaderRoot = resolve(process.env.ECHO_MOD_HOME || loaderDir);
  const { args, waitPid } = splitHostArgs(process.argv.slice(2));
  if (!(await waitForExit(waitPid))) {
    console.error('echo_still_running');
    process.exit(4);
  }
  const lock = acquireLock(loaderRoot);
  if (!lock) process.exit(0);
  const release = () => { try { writeFileSync(lock, ''); } catch {} };
  process.on('exit', release);
  try {
    const child = launchIsolated({
      echoRoot,
      loaderRoot,
      args,
    });
    child.on('exit', (code) => {
      release();
      process.exit(code ?? 0);
    });
    child.on('error', () => {
      release();
      process.exit(3);
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    release();
    process.exit(error?.code === 'isolated_runtime_missing' ? 2 : 3);
  }
}
