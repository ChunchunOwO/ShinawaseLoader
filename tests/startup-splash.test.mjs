// Startup windows stay removed even with older settings and patched runtimes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeSplashBridge, PATCH_REVISION } from '../ShinawaseLoader/echo-asar.mjs';
import { fingerprintStock, syncModdedRuntime } from '../ShinawaseLoader/runtime-sync.mjs';
const require = createRequire(import.meta.url);

test('legacy startup entry is inert with both old opt-ins and default settings', () => {
  const { installShinawaseStartupSplash } = require('../ShinawaseLoader/startup-splash.cjs');
  for (const options of [{}, { config: { ui: { startupSplash: true } }, env: { SHINAWASE_STARTUP_SPLASH: '1' } }]) {
    assert.deepEqual(installShinawaseStartupSplash(options), { enabled: false, reason: 'removed' });
  }
});

test('old injected startup blocks are stripped without changing the application', () => {
  const main = 'import { app } from "electron";\nconsole.log("echo main");\n';
  for (const app of ['app', 'typeof app !== "undefined" ? app : undefined']) {
    const legacy = `/* shinawase-loader-startup-splash-v1 */\n((app) => {\n  require("startup-splash.cjs");\n})(${app});\n`;
    assert.equal(removeSplashBridge(legacy + main), main);
    assert.equal(removeSplashBridge(main), main);
  }
  assert.ok(PATCH_REVISION > 10);
});

test('runtimes with the removed startup window rebuild once, then stay current', { skip: process.platform === 'darwin' && 'macOS runtimes are app bundles' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-splash-revision-'));
  try {
    const exeName = process.platform === 'win32' ? 'ECHO.exe' : 'ECHO';
    mkdirSync(join(root, 'resources'));
    writeFileSync(join(root, exeName), 'stock exe');
    writeFileSync(join(root, 'resources', 'app.asar'), 'not a real archive');
    const loaderRoot = join(root, 'ShinawaseLoader');
    const runtime = join(loaderRoot, 'modded-runtime');
    mkdirSync(join(runtime, 'resources'), { recursive: true });
    mkdirSync(join(loaderRoot, 'backups'), { recursive: true });
    writeFileSync(join(runtime, exeName), 'runtime exe');
    writeFileSync(join(runtime, 'resources', 'app.asar'), 'runtime archive');
    const fingerprint = join(loaderRoot, 'backups', 'runtime-sync.json');
    const stock = fingerprintStock(root);
    // A runtime from the final version that still injected the startup window.
    writeFileSync(fingerprint, JSON.stringify({ ...stock, patchStatus: 'patched', patchRevision: 10 }));
    const outdated = syncModdedRuntime({ echoRoot: root, loaderRoot });
    assert.equal(outdated.reason, 'patch-outdated');
    assert.equal(JSON.parse(readFileSync(fingerprint, 'utf8')).patchRevision, PATCH_REVISION);
    writeFileSync(fingerprint, JSON.stringify({ ...stock, patchStatus: 'patched', patchRevision: PATCH_REVISION }));
    assert.equal(syncModdedRuntime({ echoRoot: root, loaderRoot }).status, 'current');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
