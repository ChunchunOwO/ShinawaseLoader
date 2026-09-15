// Shinawase Testing SDK - session lifecycle with ownership tracking.
//
// Probe-first policy: an already-running loader or ECHO is always attached
// to, never duplicated, and never closed by the session. The session only
// reclaims what it started itself: the loader child process it spawned, and
// (only with closeEcho) an ECHO instance it launched, closed gracefully via
// CDP Browser.close on the one instance we are connected to. The SDK never
// terminates processes by name (the AGENTS.md-flagged relaunch behavior of
// dev-with-latest-mods.ps1 is exactly what this avoids).

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CDP_PORT, DEFAULT_LOADER_PORT } from './contract.mjs';
import { RendererClient, TestingClientError, captureViaMainProcess, connectLoader } from './client.mjs';
import { startAutomationNotice } from './automation-notice.mjs';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

// Pure topology decision, unit-testable without sockets. Ownership semantics:
// anything alive before the session starts is 'external' and untouchable.
export const decideTopology = ({ loaderAlive, cdpAlive, launchLoader = false, launchEcho = false }) => {
  const plan = {
    attachLoader: Boolean(loaderAlive),
    spawnLoader: false,
    launchEcho: false,
    loaderOwnership: loaderAlive ? 'external' : null,
    echoOwnership: cdpAlive ? 'external' : null,
    blocked: null,
  };
  if (!loaderAlive) {
    if (!launchLoader) { plan.blocked = 'loader_unreachable'; return plan; }
    plan.spawnLoader = true;
    plan.loaderOwnership = 'session';
  }
  if (!cdpAlive && launchEcho) {
    plan.launchEcho = true;
    plan.echoOwnership = 'session';
  }
  return plan;
};

// Artifact runs live under the OS temp directory by default so screenshots
// and reports never land inside the repository or a package directory.
export const createArtifacts = ({ dir, runId } = {}) => {
  const id = runId || `${new Date().toISOString().replaceAll(/[:.]/gu, '-')}-${Math.random().toString(36).slice(2, 8)}`;
  const root = resolve(dir || join(tmpdir(), 'shinawase-testing', id));
  mkdirSync(root, { recursive: true });
  let seq = 0;
  const items = [];
  return {
    dir: root,
    runId: id,
    items,
    nextPath(label, extension = 'png') {
      seq += 1;
      const safe = String(label || 'artifact').toLowerCase().replaceAll(/[^a-z0-9-]+/gu, '-').replaceAll(/^-+|-+$/gu, '').slice(0, 60) || 'artifact';
      return join(root, `${String(seq).padStart(3, '0')}-${safe}.${extension}`);
    },
    record(entry) { items.push(entry); return entry; },
  };
};

const tailBuffer = () => {
  let text = '';
  return {
    push(chunk) { text = (text + String(chunk)).slice(-8000); },
    read: () => text,
  };
};

const probeCdp = async (debugPort) => {
  try { await RendererClient.targets({ debugPort }); return true; }
  catch { return false; }
};

export const openSession = async (options = {}) => {
  const port = Number(options.port ?? DEFAULT_LOADER_PORT);
  const report = {
    loaderOwnership: null,
    echoOwnership: null,
    userDataIsolated: false,
    storeIsolated: false,
    rendererSkipped: null,
    automationNoticeShown: false,
    warnings: [],
  };
  const tempDirs = [];
  let loader = null;
  let loaderChild = null;
  let loaderOutput = null;

  let loaderAlive = true;
  try { loader = await connectLoader({ port }); }
  catch (error) {
    if (error.code !== 'loader_unreachable') throw error;
    loaderAlive = false;
  }
  const debugPort = Number(options.debugPort ?? (loaderAlive ? loader.lastStatus?.debugPort : null) ?? DEFAULT_CDP_PORT);
  const cdpAlive = await probeCdp(debugPort);

  const plan = decideTopology({
    loaderAlive, cdpAlive,
    launchLoader: options.launchLoader === true,
    launchEcho: options.launchEcho === true,
  });
  if (plan.blocked) {
    throw new TestingClientError(`no ShinawaseLoader on 127.0.0.1:${port}; start one (or pass launchLoader: true / --launch-loader)`, 'loader_unreachable', { skipped: true });
  }
  report.loaderOwnership = plan.loaderOwnership;
  report.echoOwnership = plan.echoOwnership;

  if (plan.spawnLoader) {
    const env = { ...process.env };
    if (options.isolatedUserData) {
      const dir = typeof options.isolatedUserData === 'string'
        ? resolve(options.isolatedUserData)
        : mkdtempSync(join(tmpdir(), 'shinawase-userdata-'));
      env.ECHO_USER_DATA_PATH_OVERRIDE = dir;
      report.userDataIsolated = true;
      if (typeof options.isolatedUserData !== 'string') tempDirs.push({ dir, kind: 'userData' });
    }
    if (options.isolatedStore) {
      const dir = mkdtempSync(join(tmpdir(), 'shinawase-store-'));
      env.ECHO_MODS_HOME = join(dir, 'Mods');
      env.ECHO_PLUGINS_HOME = join(dir, 'Plugins');
      mkdirSync(env.ECHO_MODS_HOME, { recursive: true });
      mkdirSync(env.ECHO_PLUGINS_HOME, { recursive: true });
      report.storeIsolated = true;
      tempDirs.push({ dir, kind: 'store' });
    }
    // testing/ sits inside ShinawaseLoader/, so ../ShinawaseLoader.mjs is the
    // loader CLI in both the repo checkout and installed/release layouts.
    const loaderScript = resolve(options.loaderScript || join(moduleDir, '..', 'ShinawaseLoader.mjs'));
    const args = [loaderScript, 'serve', '--port', String(port)];
    if (options.echoRoot) args.push('--echo', String(options.echoRoot));
    loaderOutput = tailBuffer();
    loaderChild = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    loaderChild.stdout.on('data', loaderOutput.push);
    loaderChild.stderr.on('data', loaderOutput.push);
    const deadline = Date.now() + (Number(options.loaderReadyTimeoutMs) || 30000);
    while (!loader && Date.now() < deadline) {
      if (loaderChild.exitCode !== null) break;
      try { loader = await connectLoader({ port }); } catch { await sleep(500); }
    }
    if (!loader) {
      try { loaderChild.kill(); } catch {}
      throw new TestingClientError(`session loader did not become ready on port ${port}: ${loaderOutput.read().slice(-600)}`, 'loader_spawn_failed');
    }
  } else if (options.isolatedUserData || options.isolatedStore) {
    report.warnings.push('isolation flags need a session-spawned loader; the attached loader keeps its own folders and user data');
  }
  if (!plan.spawnLoader && options.echoRoot) {
    report.warnings.push('echoRoot is only used when the session spawns the loader; the attached loader keeps its own selection');
  }

  if (plan.launchEcho) {
    await loader.launch();
  }

  let renderer = null;
  if (cdpAlive || plan.launchEcho) {
    const deadline = Date.now() + (Number(options.echoReadyTimeoutMs) || 90000);
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        renderer = await RendererClient.connect({ debugPort });
        await renderer.waitForReady({ timeoutMs: Math.max(2000, deadline - Date.now()) });
        break;
      } catch (error) {
        lastError = error;
        try { renderer?.close(); } catch {}
        renderer = null;
        await sleep(1000);
      }
    }
    if (!renderer) {
      report.rendererSkipped = `renderer not ready on CDP ${debugPort}: ${lastError?.message || 'timeout'}`;
      if (options.requireRenderer === true) {
        throw new TestingClientError(report.rendererSkipped, 'renderer_not_ready', { skipped: true });
      }
    }
  } else {
    report.rendererSkipped = `no ECHO on CDP ${debugPort} (attach-only session; pass launchEcho: true / --launch-echo to start one)`;
    if (options.requireRenderer === true) {
      throw new TestingClientError(report.rendererSkipped, 'echo_unreachable', { skipped: true });
    }
  }

  const artifacts = createArtifacts({ dir: options.artifactsDir, runId: options.runId });
  let stopAutomationNotice = null;

  const session = {
    loader,
    renderer,
    report,
    artifacts,
    debugPort,

    // Screenshot with run-directory placement, probe metadata for vision
    // models, and the occlusion fallback via the whitelisted main-process
    // capture when the renderer capture fails or looks unavailable.
    async screenshot(label, shotOptions = {}) {
      if (!renderer) throw new TestingClientError('no renderer in this session', 'renderer_missing');
      const path = shotOptions.path || artifacts.nextPath(label || 'screenshot');
      const probe = await renderer.probe().catch(() => null);
      let via = 'renderer';
      try {
        if (shotOptions.element) await renderer.screenshotElement(shotOptions.element, { ...shotOptions, path });
        else await renderer.screenshot({ ...shotOptions, path });
      } catch (error) {
        if (shotOptions.allowMainFallback === false) throw error;
        via = 'main-process';
        await captureViaMainProcess({ inspectPort: loader.lastStatus?.inspectPort, path });
      }
      return artifacts.record({
        path, label: label || 'screenshot', via,
        route: probe?.route ?? null,
        viewport: probe?.viewport ?? null,
        at: new Date().toISOString(),
        privacy: 'may contain account/library data from the ECHO window; keep local, do not commit',
      });
    },

    async close(closeOptions = {}) {
      const closeEcho = closeOptions.closeEcho ?? options.closeEcho === true;
      const outcome = { echoClosed: false, loaderStopped: false, tempDirsRemoved: [], notes: [] };
      try { await stopAutomationNotice?.(); }
      catch { outcome.notes.push('automation notice removal was not confirmed; it expires after its last heartbeat'); }
      try { renderer?.close(); } catch {}
      if (closeEcho && report.echoOwnership === 'session') {
        outcome.echoClosed = await gracefulBrowserClose(debugPort);
        if (!outcome.echoClosed) outcome.notes.push('Browser.close did not confirm exit; ECHO left running (the SDK never force-kills)');
      } else if (closeEcho && report.echoOwnership !== 'session') {
        outcome.notes.push('closeEcho ignored: ECHO was already running before this session (external ownership)');
      }
      if (loaderChild) {
        try { loaderChild.kill(); } catch {}
        await sleep(400);
        outcome.loaderStopped = true;
      }
      for (const entry of tempDirs) {
        const safe = entry.kind === 'store'
          ? outcome.loaderStopped
          : report.echoOwnership !== 'session' || outcome.echoClosed;
        if (safe) {
          try { rmSync(entry.dir, { recursive: true, force: true }); outcome.tempDirsRemoved.push(entry.dir); }
          catch { outcome.notes.push(`could not remove ${entry.dir}`); }
        } else {
          outcome.notes.push(`kept ${entry.dir} (may still be in use by ECHO)`);
        }
      }
      return outcome;
    },
  };
  if (renderer) {
    try {
      stopAutomationNotice = await startAutomationNotice(renderer);
      report.automationNoticeShown = true;
      await loader.reinject().catch(() => undefined);
    } catch (error) {
      await session.close();
      throw error;
    }
  }
  return session;
};

// Graceful, instance-scoped shutdown: Browser.close over the CDP browser
// target of the one instance this session launched. Equivalent to the user
// closing the app; never a process kill, never selected by process name.
const gracefulBrowserClose = async (debugPort) => {
  try {
    const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(4000) })).json();
    const wsUrl = version?.webSocketDebuggerUrl;
    if (wsUrl) {
      const socket = new WebSocket(wsUrl);
      await new Promise((resolvePromise, reject) => {
        const timer = setTimeout(() => reject(new Error('browser_ws_timeout')), 4000);
        socket.addEventListener('open', () => { clearTimeout(timer); resolvePromise(); }, { once: true });
        socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('browser_ws_error')); }, { once: true });
      });
      socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      await sleep(500);
      try { socket.close(); } catch {}
    }
  } catch {}
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(1000) });
      await sleep(500);
    } catch { return true; }
  }
  return false;
};
