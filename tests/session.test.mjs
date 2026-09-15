// Session topology decisions and artifact-run bookkeeping (pure parts of
// session.mjs; socket behavior is covered by client-offline.test.mjs and the
// live accept flow).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createArtifacts, decideTopology } from '../ShinawaseLoader/testing/session.mjs';

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
