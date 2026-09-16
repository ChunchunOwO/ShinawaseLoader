// Session topology decisions and artifact-run bookkeeping (pure parts of
// session.mjs; socket behavior is covered by client-offline.test.mjs and the
// live accept flow).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createArtifacts, decideTopology, openSession } from '../ShinawaseLoader/testing/session.mjs';

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

test('probe-first: everything alive means attach, own nothing', () => {
  const plan = decideTopology({ loaderAlive: true, cdpAlive: true, launchLoader: true, launchEcho: true });
  assert.deepEqual(plan, {
    attachLoader: true, spawnLoader: false, launchEcho: false,
    loaderOwnership: 'external', echoOwnership: 'external', blocked: null,
  });
});

test('no loader and no launch permission blocks instead of spawning', () => {
  const plan = decideTopology({ loaderAlive: false, cdpAlive: false });
  assert.equal(plan.blocked, 'loader_unreachable');
  assert.equal(plan.spawnLoader, false);
});

test('session takes ownership only of what it starts itself', () => {
  const spawned = decideTopology({ loaderAlive: false, cdpAlive: true, launchLoader: true, launchEcho: true });
  assert.equal(spawned.spawnLoader, true);
  assert.equal(spawned.loaderOwnership, 'session');
  assert.equal(spawned.launchEcho, false, 'ECHO already running: never re-launch');
  assert.equal(spawned.echoOwnership, 'external');

  const launched = decideTopology({ loaderAlive: true, cdpAlive: false, launchEcho: true });
  assert.equal(launched.launchEcho, true);
  assert.equal(launched.echoOwnership, 'session');
  assert.equal(launched.loaderOwnership, 'external');
});

test('artifacts: run directory under tmp, ordered sanitized names, records', (t) => {
  const artifacts = createArtifacts({ runId: `test-${Date.now()}` });
  t.after(() => rmSync(artifacts.dir, { recursive: true, force: true }));
  assert.ok(artifacts.dir.startsWith(join(tmpdir(), 'shinawase-testing')), 'defaults under the OS temp dir');
  assert.ok(existsSync(artifacts.dir));
  const first = artifacts.nextPath('Final State: 100%');
  const second = artifacts.nextPath('final');
  assert.ok(first.endsWith('001-final-state-100.png'), first);
  assert.ok(second.endsWith('002-final.png'), second);
  artifacts.record({ path: first, label: 'x' });
  assert.equal(artifacts.items.length, 1);
});

// Regression: a failed open must reclaim what it spawned. The fake loader
// records its pid and stays alive without ever opening the port, so openSession
// times out; afterwards the child must be dead and the isolated store dir gone.
test('openSession failure reclaims the spawned loader child and temp store dir', async (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'shinawase-fake-loader-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const pidFile = join(fixture, 'pid.txt');
  const script = join(fixture, 'fake-loader.mjs');
  writeFileSync(script, [
    "import { writeFileSync } from 'node:fs';",
    `writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
    'setInterval(() => {}, 1000);',
    '',
  ].join('\n'));
  const storeDirsBefore = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('shinawase-store-')));

  await assert.rejects(
    openSession({
      port: 26417,
      debugPort: 26418,
      launchLoader: true,
      isolatedStore: true,
      loaderScript: script,
      loaderReadyTimeoutMs: 1500,
    }),
    (error) => error.code === 'loader_spawn_failed',
  );

  assert.ok(existsSync(pidFile), 'fake loader recorded its pid');
  const pid = Number(readFileSync(pidFile, 'utf8'));
  assert.ok(Number.isInteger(pid) && pid > 0, `pid file content: ${readFileSync(pidFile, 'utf8')}`);
  let alive = true;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); await sleep(100); }
    catch { alive = false; break; }
  }
  assert.equal(alive, false, 'spawned loader child was killed on failure');

  const leftover = readdirSync(tmpdir()).filter((name) => name.startsWith('shinawase-store-') && !storeDirsBefore.has(name));
  assert.deepEqual(leftover, [], 'isolated store temp dir was removed on failure');
});
