#!/usr/bin/env node
// Shinawase Testing SDK - command-line entry point.
//
//   node ShinawaseLoader/testing/cli.mjs <command> [arguments] [--flags]
//
// Commands:
//   check <packageDir>   offline gate: manifest + wrapper syntax + harness smoke
//   test [dir]           run *.test.mjs files through `node --test`
//   accept <packageDir>  live acceptance against a running loader (attach-only
//                        by default; launching is opt-in and ownership-tracked)
//   doctor               report loader/CDP/inspector availability for agents
//   shot                 one-off screenshot of the ECHO Main window
//
// Exit codes: 0 pass, 1 failures, 2 usage error, 3 live environment
// unavailable (accept/shot without --allow-skip, doctor without a loader).
// `--json` prints a single reportVersion:1 document to stdout (progress goes
// to stderr) so agents can parse results without scraping logs.

import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { testingSdkVersion, isSafeId } from './contract.mjs';
import { checkEntrySyntax, validateManifest, validatePackageArchive } from './validate.mjs';
import { smokeRun } from './harness.mjs';
import { RendererClient, TestingClientError, connectLoader, mainWindowInfo } from './client.mjs';
import { openSession } from './session.mjs';

const moduleDir = dirname(fileURLToPath(import.meta.url));

// Flags that never take a value, so `check --no-smoke <dir>` keeps <dir> as a
// positional instead of swallowing it as the flag's value.
const BOOLEAN_FLAGS = new Set([
  'json', 'no-smoke', 'pack', 'strict-timers', 'allow-skip', 'allow-overwrite',
  'keep', 'keep-enabled', 'launch-loader', 'launch-echo', 'close-echo',
  'isolated-store', 'allow-console-errors', 'no-failure-screenshot',
]);

const parseArgs = (argv) => {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') { positionals.push(...argv.slice(index + 1)); break; }
    if (token.startsWith('--')) {
      const name = token.slice(2);
      const next = argv[index + 1];
      if (!BOOLEAN_FLAGS.has(name) && next !== undefined && !next.startsWith('--')) { flags[name] = next; index += 1; }
      else flags[name] = true;
    } else positionals.push(token);
  }
  return { positionals, flags };
};

const stageRunner = (report, json) => {
  const logLine = (text) => { (json ? process.stderr : process.stdout).write(`${text}\n`); };
  return {
    logLine,
    async run(id, work, { optional = false } = {}) {
      const startedAt = Date.now();
      const stage = { id, ok: false, durationMs: 0 };
      report.stages.push(stage);
      try {
        const detail = await work(stage);
        stage.ok = true;
        if (detail !== undefined) stage.detail = detail;
        logLine(`[ ok ] ${id}${stage.detail ? ` - ${typeof stage.detail === 'string' ? stage.detail : JSON.stringify(stage.detail)}` : ''}`);
      } catch (error) {
        if (error instanceof TestingClientError && error.skipped) {
          stage.ok = optional;
          stage.skipped = true;
          stage.detail = error.message;
          stage.code = error.code;
          logLine(`[skip] ${id} - ${error.message}`);
          if (!optional) throw error;
          return undefined;
        }
        stage.detail = error instanceof Error ? error.message : String(error);
        logLine(`[FAIL] ${id} - ${stage.detail}`);
        if (!optional) throw error;
      } finally {
        stage.durationMs = Date.now() - startedAt;
      }
      return stage;
    },
  };
};

const newReport = (command) => ({
  reportVersion: 1,
  tool: 'shinawase-testing',
  sdkVersion: testingSdkVersion,
  command,
  generatedAt: new Date().toISOString(),
  node: process.version,
  ok: false,
  exitCode: 1,
  stages: [],
});

const finishReport = (report, json, exitCode) => {
  report.exitCode = exitCode;
  report.ok = exitCode === 0;
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = exitCode;
  return exitCode;
};

const issueLines = (result) => [
  ...result.errors.map((entry) => `error(${entry.code}): ${entry.message}`),
  ...result.warnings.map((entry) => `warning(${entry.code}): ${entry.message}`),
  ...result.notices.map((entry) => `notice(${entry.code}): ${entry.message}`),
];

// --- check ---

const runOfflineChecks = async (packageDir, flags, report, stages) => {
  let validation = null;
  await stages.run('manifest', async (stage) => {
    validation = validateManifest(packageDir);
    stage.issues = issueLines(validation);
    if (!validation.ok) throw new Error(validation.errors.map((entry) => entry.message).join('; '));
    return `${validation.manifest.id} ${validation.manifest.version || ''}`.trim();
  });
  report.package = {
    id: validation.manifest?.id || null,
    version: validation.manifest?.version || null,
    kind: validation.kind,
    directory: validation.directory,
  };
  const nativeOnly = validation.notices.some((entry) => entry.code === 'native_only_entry');
  const sandboxedPlugin = validation.notices.some((entry) => entry.code === 'official_sandboxed_plugin');
  await stages.run('entry-syntax', async () => {
    if (nativeOnly) return 'skipped: native-only package';
    const result = checkEntrySyntax(readFileSync(validation.entryPath, 'utf8'), { entryType: validation.entryType, file: validation.entryPath });
    if (!result.ok) throw new Error(result.error.message);
    return result.skipped || validation.entryType;
  });
  if (typeof validation.manifest?.configUi === 'string' && validation.directory) {
    await stages.run('configui-syntax', async () => {
      const file = join(validation.directory, validation.manifest.configUi);
      if (!existsSync(file)) return 'declared but absent (loader falls back to the schema form)';
      const result = checkEntrySyntax(readFileSync(file, 'utf8'), { wrapper: 'configUi', file });
      if (!result.ok) throw new Error(result.error.message);
      return 'ok';
    });
  }
  if (flags['no-smoke'] !== true && !nativeOnly && !sandboxedPlugin) {
    await stages.run('harness-smoke', async (stage) => {
      const outcome = await smokeRun({ packageDir, settleMs: Number(flags['settle-ms']) || 250, strictTimers: flags['strict-timers'] === true });
      stage.smoke = outcome.stages;
      if (outcome.timerWarnings?.length) {
        stage.timerWarnings = outcome.timerWarnings;
        stages.logLine(`[warn] harness-smoke - ${outcome.timerWarnings.length} un-cleared one-shot timeout(s) after dispose (pass --strict-timers to fail on these)`);
      }
      if (!outcome.ok) {
        const leakText = (outcome.leaks || []).map((leak) => `[${leak.kind}] ${leak.detail}`).join('; ');
        throw new Error(outcome.error || `entry leaked resources after dispose: ${leakText}`);
      }
      return 'inject/dispose clean';
    });
  }
  if (flags.pack === true) {
    await stages.run('pack-dry-run', async () => {
      const packer = join(moduleDir, '..', '..', 'scripts', 'pack-echomod.mjs');
      if (!existsSync(packer)) throw new Error('scripts/pack-echomod.mjs not found');
      const output = join(tmpdir(), `shinawase-check-${randomUUID()}.echomod`);
      try {
        const packed = spawnSync(process.execPath, [packer, resolve(packageDir), output, '--zip'], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
        if (packed.status !== 0) throw new Error((packed.stderr || packed.stdout || 'packer failed').trim().slice(0, 400));
        const archive = validatePackageArchive(output);
        if (!archive.ok) throw new Error(archive.errors.map((entry) => entry.message).join('; '));
        return `${archive.fileCount} files, ${archive.totalBytes} bytes`;
      } finally { rmSync(output, { force: true }); }
    });
  }
  return validation;
};

const commandCheck = async ({ positionals, flags }) => {
  const packageDir = positionals[0];
  const json = flags.json === true;
  if (!packageDir) { process.stderr.write('usage: cli.mjs check <packageDir> [--json] [--no-smoke] [--pack] [--strict-timers] [--settle-ms <ms>]\n'); return 2; }
  const report = newReport('check');
  const stages = stageRunner(report, json);
  try {
    await runOfflineChecks(resolve(packageDir), flags, report, stages);
    return finishReport(report, json, 0);
  } catch {
    return finishReport(report, json, 1);
  }
};

// --- test ---

const commandTest = async ({ positionals, flags }) => {
  const explicit = positionals[0];
  const candidates = explicit ? [explicit] : ['test', 'tests', join('dev', 'tests')];
  const dir = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isDirectory());
  if (!dir) {
    process.stderr.write(`no test directory found (looked for: ${candidates.join(', ')})\n`);
    return 2;
  }
  const extra = [];
  if (flags.reporter) extra.push(`--test-reporter=${flags.reporter}`);
  const child = spawn(process.execPath, ['--test', ...extra, dir], { stdio: 'inherit', windowsHide: true });
  return new Promise((resolvePromise) => child.on('exit', (code) => resolvePromise(code ?? 1)));
};

// --- accept ---

const findStepsModule = (packageDir, flags) => {
  if (typeof flags.steps === 'string') return resolve(flags.steps);
  const sibling = join(dirname(resolve(packageDir)), 'accept.steps.mjs');
  return existsSync(sibling) ? sibling : null;
};

const commandAccept = async ({ positionals, flags }) => {
  const packageDir = positionals[0];
  const json = flags.json === true;
  if (!packageDir) {
    process.stderr.write('usage: cli.mjs accept <packageDir> [--json] [--allow-skip] [--allow-overwrite] [--keep] [--keep-enabled]\n'
      + '  [--launch-loader] [--launch-echo] [--close-echo] [--echo <root>] [--isolated-user-data [dir]] [--isolated-store]\n'
      + '  [--steps <file>] [--timeout <ms>] [--artifacts-dir <dir>] [--viewport WxH] [--allow-console-errors] [--port <n>]\n'
      + '  [--id <modId>] [--no-smoke] [--strict-timers] [--settle-ms <ms>] [--no-failure-screenshot]\n');
    return 2;
  }
  const report = newReport('accept');
  const stages = stageRunner(report, json);
  const timeoutMs = Number(flags.timeout) || 30000;
  let session = null;
  let modId = null;
  let prior = null;
  let imported = false;
  let restoreViewport = null;
  let stopConsole = null;
  let exitCode = 0;

  try {
    await runOfflineChecks(resolve(packageDir), { 'no-smoke': flags['no-smoke'], 'strict-timers': flags['strict-timers'], 'settle-ms': flags['settle-ms'], json }, report, stages);
    modId = report.package.id;
    if (flags.id) modId = String(flags.id);
    if (!isSafeId(modId)) throw new Error(`invalid package id: ${modId}`);

    await stages.run('session', async (stage) => {
      session = await openSession({
        port: flags.port ? Number(flags.port) : undefined,
        launchLoader: flags['launch-loader'] === true,
        launchEcho: flags['launch-echo'] === true,
        closeEcho: flags['close-echo'] === true,
        echoRoot: typeof flags.echo === 'string' ? flags.echo : undefined,
        isolatedUserData: flags['isolated-user-data'] === true ? true : (typeof flags['isolated-user-data'] === 'string' ? flags['isolated-user-data'] : undefined),
        isolatedStore: flags['isolated-store'] === true,
        artifactsDir: typeof flags['artifacts-dir'] === 'string' ? flags['artifacts-dir'] : undefined,
        requireRenderer: true,
      });
      const status = session.loader.lastStatus || await session.loader.status();
      report.environment = {
        loaderVersion: status.loaderVersion,
        loadMode: status.loadMode,
        safeMode: status.safeMode,
        debugPort: status.debugPort,
        echoTarget: status.echoTarget ? {
          product: status.echoTarget.product, version: status.echoTarget.version,
          electron: status.echoTarget.electron, edition: status.echoTarget.edition,
          runtimeStatus: status.echoTarget.runtime?.status ?? null,
        } : null,
        session: session.report,
      };
      if (status.safeMode || status.loadMode === 'disabled') throw new Error(`loader will not inject (safeMode=${status.safeMode}, loadMode=${status.loadMode})`);
      return `loader ${status.loaderVersion} / ${session.report.loaderOwnership} loader, ${session.report.echoOwnership} echo`;
    });

    if (typeof flags.viewport === 'string') {
      await stages.run('viewport-override', async () => {
        const [width, height] = String(flags.viewport).split(/[x,]/iu).map(Number);
        if (!width || !height) throw new Error(`--viewport expects WxH, got ${flags.viewport}`);
        restoreViewport = await session.renderer.setViewportOverride({ width, height });
        return `${width}x${height} (restored on exit)`;
      });
    }

    await stages.run('state-snapshot', async () => {
      const mods = await session.loader.mods();
      prior = (mods.mods || []).find((entry) => entry.id === modId) || null;
      if (prior && flags['allow-overwrite'] !== true) {
        throw new Error(`${modId} v${prior.version} is already installed in this loader; re-run with --allow-overwrite (imports replace the installed copy; only the enabled state is restored afterwards)`);
      }
      return prior ? `will overwrite installed v${prior.version} (enabled=${prior.enabled})` : 'id not installed yet';
    });

    await stages.run('import', async () => {
      const manifest = await session.loader.importPackage(resolve(packageDir));
      imported = true;
      return `${manifest.id} v${manifest.version || '1.0.0'}`;
    });

    await stages.run('enable-and-inject', async () => {
      await session.loader.enable(modId);
      await session.loader.reinject();
      await session.renderer.waitForInjected(modId, { timeoutMs });
      return 'injected';
    });

    stopConsole = await session.renderer.startConsoleCapture();

    const stepsFile = findStepsModule(packageDir, flags);
    let stepsModule = null;
    if (stepsFile) {
      await stages.run('steps', async (stage) => {
        stepsModule = await import(pathToFileURL(stepsFile).href);
        const steps = stepsModule.steps || stepsModule.default;
        if (typeof steps !== 'function') throw new Error(`${stepsFile} exports no steps() function`);
        await steps({
          loader: session.loader,
          renderer: session.renderer,
          session,
          screenshot: (label, shotOptions) => session.screenshot(label, shotOptions),
          report,
        });
        stage.file = stepsFile;
        return `ran ${stepsFile}`;
      });
    }

    await stages.run('screenshot', async () => {
      const entry = await session.screenshot('final-state');
      return entry.path;
    }, { optional: true });

    await stages.run('console-errors', async (stage) => {
      const errors = session.renderer.consoleRecords({ level: 'error' });
      stage.console = errors.slice(0, 20);
      if (errors.length && flags['allow-console-errors'] !== true) {
        throw new Error(`${errors.length} renderer console error(s)/exception(s) during acceptance (first: ${errors[0].text.slice(0, 160)})`);
      }
      return `${errors.length} error(s)`;
    });

    await stages.run('disable-and-clean', async () => {
      await session.loader.disable(modId);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const mods = await session.renderer.injectedMods();
        if (!mods[modId]) break;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
      }
      const mods = await session.renderer.injectedMods();
      if (mods[modId]) throw new Error('mod still present in window.__echoExternalMods after disable');
      for (const selector of stepsModule?.cleanupSelectors || []) {
        await session.renderer.expectAbsent(selector);
      }
      return 'disposed in renderer';
    });

    await stages.run('restore', async () => {
      if (flags.keep === true) {
        if (prior?.enabled || flags['keep-enabled'] === true) await session.loader.enable(modId);
        return 'kept installed (--keep)';
      }
      if (prior) {
        if (prior.enabled) await session.loader.enable(modId);
        return `previous install of ${modId} was overwritten by this import; enabled state restored (enabled=${prior.enabled})`;
      }
      if (imported) await session.loader.remove(modId);
      return 'fixture removed';
    });
  } catch (error) {
    if (error instanceof TestingClientError && error.skipped) {
      exitCode = flags['allow-skip'] === true ? 0 : 3;
    } else {
      exitCode = 1;
      if (session?.renderer && flags['no-failure-screenshot'] !== true) {
        try {
          const entry = await session.screenshot('failure');
          stages.logLine(`[info] failure screenshot: ${entry.path}`);
        } catch {}
      }
      // Best-effort cleanup so a failed run does not leave the fixture active.
      if (session?.loader && modId && imported) {
        try {
          await session.loader.disable(modId);
          if (!prior && flags.keep !== true) await session.loader.remove(modId);
          if (prior?.enabled) await session.loader.enable(modId);
        } catch {}
      }
    }
  } finally {
    try { stopConsole?.(); } catch {}
    try { await restoreViewport?.(); } catch {}
    if (session) {
      report.artifacts = session.artifacts.items;
      if (session.renderer) report.console = { errors: session.renderer.consoleRecords({ level: 'error' }).length, total: session.renderer.consoleRecords().length };
      await stages.run('close-session', async () => {
        const outcome = await session.close();
        return outcome;
      }, { optional: true });
    }
  }
  return finishReport(report, json, exitCode);
};

// --- doctor ---

const commandDoctor = async ({ flags }) => {
  const json = flags.json === true;
  const report = newReport('doctor');
  const stages = stageRunner(report, json);
  let exitCode = 0;
  let loader = null;
  await stages.run('loader', async (stage) => {
    loader = await connectLoader({ port: flags.port ? Number(flags.port) : undefined });
    const status = loader.lastStatus;
    stage.status = {
      loaderVersion: status.loaderVersion, port: status.port, debugPort: status.debugPort,
      inspectPort: status.inspectPort, loadMode: status.loadMode, safeMode: status.safeMode,
      echoTarget: { product: status.echoTarget?.product, version: status.echoTarget?.version, runtime: status.echoTarget?.runtime?.status },
    };
    return `ShinawaseLoader ${status.loaderVersion} on ${status.port} (loadMode=${status.loadMode}, safeMode=${status.safeMode})`;
  }, { optional: true });
  if (!loader) exitCode = 3;

  await stages.run('renderer-cdp', async (stage) => {
    const debugPort = loader?.lastStatus?.debugPort;
    const targets = await RendererClient.targets(debugPort ? { debugPort } : {});
    const renderer = await RendererClient.connect(debugPort ? { debugPort } : {});
    try {
      const probe = await renderer.probe();
      stage.probe = { ready: probe?.ready, route: probe?.route, uiVersion: probe?.uiVersion, playerVersion: probe?.playerVersion, extendVersion: probe?.extendVersion, mods: Object.keys(probe?.mods || {}) };
      return `${targets.length} page target(s); Main ready=${probe?.ready} route=${probe?.route} injected=[${Object.keys(probe?.mods || {}).join(', ')}]`;
    } finally { renderer.close(); }
  }, { optional: true });

  await stages.run('main-inspector', async (stage) => {
    const windows = await mainWindowInfo(loader?.lastStatus?.inspectPort ? { inspectPort: loader.lastStatus.inspectPort } : {});
    stage.windows = windows?.length ?? 0;
    return `${windows?.length ?? 0} window(s); occlusion-proof capture available`;
  }, { optional: true });

  report.suggestions = [];
  if (!loader) report.suggestions.push('start a loader (ECHO.modded.exe / start-echo-with-mods.cmd) or run accept with --launch-loader --launch-echo');
  else if (report.stages.find((stage) => stage.id === 'renderer-cdp' && !stage.ok)) report.suggestions.push('start ECHO through the loader so the CDP port is open (attach-to-echo.cmd or POST /api/launch)');
  return finishReport(report, json, exitCode);
};

// --- shot ---

const commandShot = async ({ flags }) => {
  const json = flags.json === true;
  const report = newReport('shot');
  const stages = stageRunner(report, json);
  let exitCode = 0;
  let session = null;
  try {
    session = await openSession({
      port: flags.port ? Number(flags.port) : undefined,
      requireRenderer: true,
      artifactsDir: typeof flags['artifacts-dir'] === 'string' ? flags['artifacts-dir'] : undefined,
    });
    await stages.run('screenshot', async (stage) => {
      const entry = await session.screenshot(typeof flags.label === 'string' ? flags.label : 'shot', {
        element: typeof flags.element === 'string' ? flags.element : undefined,
        path: typeof flags.out === 'string' ? resolve(flags.out) : undefined,
      });
      stage.artifact = entry;
      stages.logLine(`[info] ${entry.path}`);
      return entry.path;
    });
  } catch (error) {
    exitCode = error instanceof TestingClientError && error.skipped ? 3 : 1;
    report.stages.push({ id: 'error', ok: false, detail: error instanceof Error ? error.message : String(error) });
    stages.logLine(`[FAIL] ${error instanceof Error ? error.message : error}`);
  } finally {
    if (session) {
      report.artifacts = session.artifacts.items;
      await stages.run('close-session', async () => session.close(), { optional: true });
    }
  }
  return finishReport(report, json, exitCode);
};

// --- dispatch ---

const main = async () => {
  const [command, ...rest] = process.argv.slice(2);
  const parsed = parseArgs(rest);
  if (!command || command === 'help' || command === '--help') {
    process.stdout.write('Shinawase Testing SDK\n'
      + '  check <packageDir> [--json] [--no-smoke] [--pack] [--strict-timers] [--settle-ms <ms>]\n'
      + '  test [dir] [--reporter <name>]\n'
      + '  accept <packageDir> [--json] [--allow-skip] [--allow-overwrite] [--keep] [--keep-enabled] [--launch-loader]\n'
      + '         [--launch-echo] [--close-echo] [--echo <root>] [--isolated-user-data [dir]] [--isolated-store]\n'
      + '         [--steps <file>] [--timeout <ms>] [--artifacts-dir <dir>] [--viewport WxH] [--allow-console-errors]\n'
      + '         [--port <n>] [--id <modId>] [--no-smoke] [--strict-timers] [--settle-ms <ms>] [--no-failure-screenshot]\n'
      + '  doctor [--json] [--port <n>]\n'
      + '  shot [--json] [--element <selector>] [--label <name>] [--out <file>] [--port <n>]\n'
      + 'Note: check and accept execute the package entry in the offline mock-DOM harness smoke\n'
      + '(pass --no-smoke for static-only validation).\n'
      + 'Exit codes: 0 pass, 1 fail, 2 usage, 3 live environment unavailable.\n'
      + 'See ShinawaseLoader/TESTING.md for the full contract.\n');
    return command ? 0 : 2;
  }
  if (command === 'check') return commandCheck(parsed);
  if (command === 'test') return commandTest(parsed);
  if (command === 'accept') return commandAccept(parsed);
  if (command === 'doctor') return commandDoctor(parsed);
  if (command === 'shot') return commandShot(parsed);
  process.stderr.write(`unknown command: ${command} (try: check, test, accept, doctor, shot)\n`);
  return 2;
};

main().then((code) => { if (typeof code === 'number') process.exitCode = code; }).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exitCode = 1;
});
