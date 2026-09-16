// Live-client degradation: when no loader/CDP endpoint exists the clients
// must fail fast with structured, skippable errors instead of hanging or
// pretending success. Uses a port that was just bound and released on
// loopback, so the connection is refused deterministically without any
// network traffic beyond localhost.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { RendererClient, TestingClientError, assertLoopbackWsUrl, connectLoader } from '../ShinawaseLoader/testing/client.mjs';
import { openSession } from '../ShinawaseLoader/testing/session.mjs';

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
  server.on('error', reject);
});

test('connectLoader reports loader_unreachable with skipped flag', async () => {
  const port = await freePort();
  await assert.rejects(connectLoader({ port }), (error) => {
    assert.ok(error instanceof TestingClientError);
    assert.equal(error.code, 'loader_unreachable');
    assert.equal(error.skipped, true);
    return true;
  });
});

test('RendererClient reports cdp_unreachable with skipped flag', async () => {
  const port = await freePort();
  await assert.rejects(RendererClient.targets({ debugPort: port }), (error) => {
    assert.equal(error.code, 'cdp_unreachable');
    assert.equal(error.skipped, true);
    return true;
  });
});

test('non-loopback hosts are refused before any connection', async () => {
  await assert.rejects(connectLoader({ host: '192.168.1.10' }), (error) => {
    assert.equal(error.code, 'host_not_loopback');
    return true;
  });
  await assert.rejects(RendererClient.targets({ host: 'example.com' }), (error) => {
    assert.equal(error.code, 'host_not_loopback');
    return true;
  });
});

// Regression: fetch follows redirects by default, so a local endpoint could
// bounce the SDK's loopback-validated request to another host. The redirect
// target is a second local server that records hits; it must never be reached.
test('HTTP redirects from a local endpoint are refused, not followed', async (t) => {
  let redirectTargetHits = 0;
  const target = createHttpServer((request, response) => { redirectTargetHits += 1; response.end('{}'); });
  await new Promise((resolvePromise) => target.listen(0, '127.0.0.1', resolvePromise));
  t.after(() => target.close());
  const redirecting = createHttpServer((request, response) => {
    response.statusCode = 302;
    response.setHeader('location', `http://127.0.0.1:${target.address().port}/api/status`);
    response.end();
  });
  await new Promise((resolvePromise) => redirecting.listen(0, '127.0.0.1', resolvePromise));
  t.after(() => redirecting.close());

  await assert.rejects(connectLoader({ port: redirecting.address().port }));
  assert.equal(redirectTargetHits, 0, 'the redirect target was never contacted');
});

// Regression: webSocketDebuggerUrl values from local CDP/inspector endpoints
// were opened without checking that they still point at loopback.
test('WebSocket debugger URLs must be loopback ws:// URLs', () => {
  assert.equal(assertLoopbackWsUrl('ws://127.0.0.1:9229/devtools/page/A'), 'ws://127.0.0.1:9229/devtools/page/A');
  assert.equal(assertLoopbackWsUrl('ws://[::1]:9229/devtools/page/A'), 'ws://[::1]:9229/devtools/page/A');
  for (const bad of ['ws://example.com/devtools/page/A', 'wss://127.0.0.1:9229/x', 'http://127.0.0.1:9229/x', 'not a url']) {
    assert.throws(() => assertLoopbackWsUrl(bad), (error) => {
      assert.ok(error instanceof TestingClientError);
      assert.ok(['ws_not_loopback', 'ws_url_invalid'].includes(error.code), `${bad}: ${error.code}`);
      return true;
    }, bad);
  }
});

test('openSession without a loader and without launchLoader blocks with loader_unreachable', async () => {
  const port = await freePort();
  await assert.rejects(openSession({ port }), (error) => {
    assert.equal(error.code, 'loader_unreachable');
    assert.equal(error.skipped, true);
    return true;
  });
});
