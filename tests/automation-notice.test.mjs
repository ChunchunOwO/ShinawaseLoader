// Run the actual CDP expressions in a mock renderer, with independent clocks
// for the Node heartbeat and the renderer's expiry timer. No ECHO is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createServer } from 'node:http';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startAutomationNotice } from '../ShinawaseLoader/testing/automation-notice.mjs';
import { createMockRealm } from '../ShinawaseLoader/testing/mock-dom.mjs';
import { RendererClient } from '../ShinawaseLoader/testing/client.mjs';
import { openSession } from '../ShinawaseLoader/testing/session.mjs';

const selector = '#shinawase-testing-automation-notice';
const flush = () => new Promise((resolve) => setImmediate(resolve));
const mockRenderer = () => {
  let realm;
  let context;
  const renderer = {
    get realm() { return realm; },
    reload() {
      realm = createMockRealm();
      context = vm.createContext({ ...realm.window, window: realm.window, Date: { now: () => realm.clock.now } });
    },
    async evalValue(expression) { return vm.runInContext(expression, context); },
    async waitForReady() {},
    closed: false,
    close() { this.closed = true; },
    notice() { return realm.document.querySelector(selector); },
  };
  renderer.reload();
  return renderer;
};

test('notice is visible, localized, and fully removed on close', async () => {
  const renderer = mockRenderer();
  const stop = await startAutomationNotice(renderer);
  try {
    assert.equal(renderer.notice().textContent, '本实例正在用于自动化测试');
    assert.equal(renderer.notice().getAttribute('role'), 'status');
    renderer.realm.document.documentElement.lang = 'en-US';
    await renderer.realm.clock.flush({ maxMs: 1000 });
    assert.match(renderer.notice().textContent, /being used for automated testing/);
  } finally { await stop(); }
  await stop();
  assert.equal(renderer.notice(), null);
  assert.equal(renderer.realm.clock.pending().length, 0, 'renderer timer cleared');
  assert.equal(renderer.realm.window.__shinawaseTestingAutomationNotice, undefined);
});

test('overlapping sessions share one notice until the last session closes', async () => {
  const renderer = mockRenderer();
  const first = await startAutomationNotice(renderer);
  const second = await startAutomationNotice(renderer);
  try {
    assert.equal(renderer.realm.document.querySelectorAll(selector).length, 1);
    await first();
    assert.ok(renderer.notice(), 'closing one session does not hide the other');
  } finally { await first(); await second(); }
  assert.equal(renderer.notice(), null);
});

test('a lost runner expires without leaving DOM, timers, or global state', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const renderer = mockRenderer();
  const stop = await startAutomationNotice(renderer);
  // Advance only renderer time: the runner no longer sends heartbeats.
  await renderer.realm.clock.flush({ maxMs: 11000 });
  assert.equal(renderer.notice(), null);
  assert.equal(renderer.realm.clock.pending().length, 0);
  assert.equal(renderer.realm.window.__shinawaseTestingAutomationNotice, undefined);
  await stop();
});

test('heartbeat maintains one notice, recovers after reload, and stops on disposal', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const renderer = mockRenderer();
  const stop = await startAutomationNotice(renderer);
  try {
    for (let i = 0; i < 8; i += 1) {
      await renderer.realm.clock.flush({ maxMs: 2000 });
      t.mock.timers.tick(2000);
      await flush();
    }
    assert.equal(renderer.realm.document.querySelectorAll(selector).length, 1);
    renderer.notice().remove();
    await renderer.realm.clock.flush({ maxMs: 1000 });
    assert.ok(renderer.notice(), 'notice recovers from DOM replacement');
    renderer.reload();
    assert.equal(renderer.notice(), null);
    t.mock.timers.tick(2000);
    await flush();
    assert.ok(renderer.notice(), 'heartbeat restores the notice in the new document');
  } finally { await stop(); }
  t.mock.timers.tick(4000);
  await flush();
  assert.equal(renderer.notice(), null, 'disposed heartbeat cannot remount it');
});

test('closing during an in-flight heartbeat cannot recreate the notice', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const renderer = mockRenderer();
  const stop = await startAutomationNotice(renderer);
  const evaluate = renderer.evalValue.bind(renderer);
  let release;
  renderer.evalValue = async (expression) => {
    await new Promise((resolve) => { release = resolve; });
    return evaluate(expression);
  };
  t.mock.timers.tick(2000);
  const closing = stop();
  renderer.evalValue = evaluate;
  release();
  await closing;
  assert.equal(renderer.notice(), null);
  assert.equal(renderer.realm.clock.pending().length, 0);
});

test('an initial CDP response failure cleans up a notice that was already mounted', async () => {
  const renderer = mockRenderer();
  const evaluate = renderer.evalValue.bind(renderer);
  let first = true;
  renderer.evalValue = async (expression) => {
    const result = await evaluate(expression);
    if (first) { first = false; throw new Error('response lost'); }
    return result;
  };
  await assert.rejects(startAutomationNotice(renderer), /response lost/);
  assert.equal(renderer.notice(), null);
  assert.equal(renderer.realm.clock.pending().length, 0);
});

const attachFixture = async (t, renderer) => {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.mock.method(RendererClient, 'targets', async () => [{ type: 'page' }]);
  t.mock.method(RendererClient, 'connect', async () => renderer);
  return { port: server.address().port, requireRenderer: true, runId: `notice-test-${server.address().port}` };
};

test('openSession mounts the notice on attached instances and removes it after a failed step', async (t) => {
  const renderer = mockRenderer();
  const options = await attachFixture(t, renderer);
  const session = await openSession(options);
  t.after(() => rmSync(session.artifacts.dir, { recursive: true, force: true }));
  assert.equal(session.report.automationNoticeShown, true);
  assert.equal(session.report.echoOwnership, 'external');
  assert.ok(renderer.notice());
  await assert.rejects(async () => {
    try { throw new Error('step failed'); }
    finally { await session.close(); }
  }, /step failed/);
  assert.equal(renderer.notice(), null);
  assert.equal(renderer.closed, true);
});

test('failed notice setup closes the renderer before openSession rejects', async (t) => {
  const renderer = mockRenderer();
  const options = await attachFixture(t, renderer);
  t.after(() => rmSync(join(tmpdir(), 'shinawase-testing', options.runId), { recursive: true, force: true }));
  renderer.evalValue = async () => { throw new Error('renderer unavailable'); };
  await assert.rejects(openSession(options), /renderer unavailable/);
  assert.equal(renderer.closed, true);
});
