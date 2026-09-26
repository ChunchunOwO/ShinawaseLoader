#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DARWIN_APP_NAMES, planModdedLaunchArgs, rankEchoInstall } from './platform.mjs';

const loaderDir = dirname(fileURLToPath(import.meta.url));
const steamAppId = '5105150';

const readRuntimePath = (loaderRoot) => {
  try {
    const config = JSON.parse(readFileSync(join(loaderRoot, 'loader.config.json'), 'utf8'));
    const runtimePath = String(config.runtimePath || '').trim();
    if (runtimePath && existsSync(runtimePath)) return runtimePath;
  } catch {}
  return null;
};

export const resolveHostNode = (loaderRoot, env = process.env) => {
  const override = String(env.ECHO_NODE_PATH || '').trim();
  if (override && existsSync(override)) return override;
  const configured = readRuntimePath(loaderRoot);
  if (configured) return configured;
  const bundled = join(loaderRoot, 'node');
  if (existsSync(bundled)) return bundled;
  return process.execPath || 'node';
};

export const findIsolatedDarwinBinary = (runtimeRoot) => DARWIN_APP_NAMES
  .map((name) => join(runtimeRoot, name, 'Contents', 'MacOS', 'ECHO'))
  .filter((file) => existsSync(file))
  .sort((left, right) => rankEchoInstall(left, 'darwin') - rankEchoInstall(right, 'darwin') || left.localeCompare(right))[0] || null;

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

export const launchIsolatedDarwin = ({
  echoRoot,
  loaderRoot = join(echoRoot, 'ShinawaseLoader'),
  args = [],
  env = process.env,
  spawnChild = spawn,
} = {}) => {
  const root = resolve(echoRoot);
  const loader = resolve(loaderRoot);
  const node = resolveHostNode(loader, env);
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
  const executable = findIsolatedDarwinBinary(join(loader, 'modded-runtime'));
  if (!executable) {
    const error = new Error('isolated_runtime_missing');
    error.code = 'isolated_runtime_missing';
    throw error;
  }
  return spawnChild(executable, planModdedLaunchArgs(args), {
    cwd: root,
    env: childEnv,
    stdio: 'inherit',
  });
};

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const echoRoot = resolve(process.env.ECHO_GAME_ROOT || join(loaderDir, '..'));
  const loaderRoot = resolve(process.env.ECHO_MOD_HOME || loaderDir);
  const lock = acquireLock(loaderRoot);
  if (!lock) process.exit(0);
  const release = () => { try { writeFileSync(lock, ''); } catch {} };
  process.on('exit', release);
  try {
    const child = launchIsolatedDarwin({
      echoRoot,
      loaderRoot,
      args: process.argv.slice(2),
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
