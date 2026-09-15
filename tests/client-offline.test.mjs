// Live-client degradation: when no loader/CDP endpoint exists the clients
// must fail fast with structured, skippable errors instead of hanging or
// pretending success. Uses a port that was just bound and released on
// loopback, so the connection is refused deterministically without any
// network traffic beyond localhost.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { RendererClient, TestingClientError, connectLoader } from '../ShinawaseLoader/testing/client.mjs';
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

test('openSession without a loader and without launchLoader blocks with loader_unreachable', async () => {
  const port = await freePort();
  await assert.rejects(openSession({ port }), (error) => {
    assert.equal(error.code, 'loader_unreachable');
    assert.equal(error.skipped, true);
    return true;
  });
});
