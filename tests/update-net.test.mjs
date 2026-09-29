import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  UPDATE_PACKAGES,
  UPDATE_PUBLIC_KEY,
  acquireLock,
  createDeadline,
  createSourceHealth,
  discardPartial,
  downloadResumable,
  fetchBuffer,
  fetchFirstValid,
  normalizeMirrorBases,
  parseMirrorManifest,
  sha256Hex,
} from '../ShinawaseLoader/update-net.mjs';

const listen = (handler) => new Promise((resolve) => {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});
const close = (server) => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); });
const tmp = () => mkdtempSync(join(tmpdir(), 'shinawase-update-'));
const payload = Buffer.from(Array.from({ length: 60000 }, (_, index) => index % 251));

// Serves `payload`, honouring Range. `stallAfter` bytes then hangs forever (first request only).
const rangeServer = ({ stallAfter = 0, requests = [] } = {}) => listen((req, res) => {
  requests.push({ url: req.url, range: req.headers.range || '' });
  const match = /bytes=(\d+)-/u.exec(req.headers.range || '');
  const start = match ? Number(match[1]) : 0;
  const body = payload.subarray(start);
  res.writeHead(match ? 206 : 200, { 'content-length': body.length, etag: '"v1"', ...(match ? { 'content-range': `bytes ${start}-${payload.length - 1}/${payload.length}` } : {}) });
  if (stallAfter && requests.length === 1) {
    res.write(body.subarray(0, stallAfter));
    return; // never ends: the client must notice the stall
  }
  res.end(body);
});

test('a server that never answers is cut off at the headers timeout', async () => {
  const { server, url } = await listen(() => { /* hang */ });
  const started = Date.now();
  await assert.rejects(fetchBuffer(`${url}/x`, { headersMs: 250, stallMs: 250 }), { code: 'update_timeout' });
  assert.ok(Date.now() - started < 1500);
  await close(server);
});

test('a download that stalls mid-body is aborted after stallMs, not a fixed cap', async () => {
  const dir = tmp();
  const { server, url } = await rangeServer({ stallAfter: 20000 });
  const started = Date.now();
  await assert.rejects(downloadResumable(`${url}/f.bin`, join(dir, 'f'), { headersMs: 500, stallMs: 300 }), { code: 'update_stalled' });
  assert.ok(Date.now() - started < 2000);
  assert.equal(statSync(join(dir, 'f.part')).size, 20000, 'progress is kept for the next attempt');
  await close(server);
  rmSync(dir, { recursive: true, force: true });
});

test('the next attempt resumes with a Range request and yields identical bytes', async () => {
  const dir = tmp();
  const requests = [];
  const { server, url } = await rangeServer({ stallAfter: 20000, requests });
  await assert.rejects(downloadResumable(`${url}/f.bin`, join(dir, 'f'), { headersMs: 500, stallMs: 300 }), { code: 'update_stalled' });
  const data = await downloadResumable(`${url}/f.bin`, join(dir, 'f'), { headersMs: 500, stallMs: 1000, expectedSha256: sha256Hex(payload), expectedSize: payload.length });
  assert.ok(data.equals(payload));
  assert.equal(requests[1].range, 'bytes=20000-');
  assert.equal(existsSync(join(dir, 'f.part')), false);
  await close(server);
  rmSync(dir, { recursive: true, force: true });
});

test('a server that ignores Range restarts the download instead of corrupting it', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'f.part'), Buffer.from('stale-bytes'));
  const seenUrl = [];
  const { server, url } = await listen((req, res) => { seenUrl.push(req.headers.range || ''); res.writeHead(200, { 'content-length': payload.length }); res.end(payload); });
  writeFileSync(join(dir, 'f.part.json'), JSON.stringify({ url: `${url}/f.bin`, etag: '' }));
  const data = await downloadResumable(`${url}/f.bin`, join(dir, 'f'), { headersMs: 500, stallMs: 1000 });
  assert.ok(data.equals(payload));
  assert.ok(seenUrl[0].startsWith('bytes='));
  await close(server);
  rmSync(dir, { recursive: true, force: true });
});

test('content that fails its SHA-256 is rejected and the partial file is discarded', async () => {
  const dir = tmp();
  const { server, url } = await rangeServer();
  await assert.rejects(downloadResumable(`${url}/f.bin`, join(dir, 'f'), { headersMs: 500, stallMs: 500, expectedSha256: 'a'.repeat(64) }), { code: 'update_hash_mismatch' });
  assert.equal(existsSync(join(dir, 'f.part')), false);
  await close(server);
  rmSync(dir, { recursive: true, force: true });
});

test('a source that trickles below the throughput floor is abandoned for the next one', async () => {
  const dir = tmp();
  const health = createSourceHealth();
  const slow = await listen((req, res) => {
    res.writeHead(200, { 'content-length': 5000000 });
    const timer = setInterval(() => res.write(Buffer.alloc(200)), 20); // ~10 KB/s: never stalls, never finishes
    res.on('close', () => clearInterval(timer));
  });
  const fast = await listen((req, res) => { res.writeHead(200); res.end(payload); });
  const started = Date.now();
  const result = await fetchFirstValid(
    [{ id: 'slow', url: `${slow.url}/a` }, { id: 'fast', url: `${fast.url}/a` }],
    { cacheDir: dir, cacheName: 'x', headersMs: 500, stallMs: 1000, minBps: 100 * 1024, slowGraceMs: 300, deadline: createDeadline(10000), health },
  );
  assert.equal(result.source.id, 'fast');
  assert.deepEqual(health.list(), ['slow']);
  assert.ok(Date.now() - started < 3000, 'moved on after the grace period instead of burning the whole budget');
  await Promise.all([close(slow.server), close(fast.server)]);
  rmSync(dir, { recursive: true, force: true });
});

test('a source projected to overrun the time budget is dropped early, not at the deadline', async () => {
  const dir = tmp();
  const slow = await listen((req, res) => {
    res.writeHead(200, { 'content-length': 4000000 });
    const timer = setInterval(() => res.write(Buffer.alloc(4000)), 20); // ~200 KB/s: fast enough to pass a floor, too slow to finish
    res.on('close', () => clearInterval(timer));
  });
  const fast = await listen((req, res) => { res.writeHead(200); res.end(payload); });
  const health = createSourceHealth();
  const started = Date.now();
  const result = await fetchFirstValid(
    [{ id: 'proxy', url: `${slow.url}/a` }, { id: 'direct', url: `${fast.url}/a` }],
    { cacheDir: dir, cacheName: 'x', headersMs: 500, stallMs: 1000, slowGraceMs: 300, deadline: createDeadline(8000), health },
  );
  assert.equal(result.source.id, 'direct');
  assert.ok(Date.now() - started < 2500, 'gave up long before the 8s budget ran out');
  await Promise.all([close(slow.server), close(fast.server)]);
  rmSync(dir, { recursive: true, force: true });
});

test('the overall deadline still wins over a slow-but-steady drip', async () => {
  const { server, url } = await listen((req, res) => {
    res.writeHead(200, { 'content-length': 1000000 });
    const timer = setInterval(() => res.write(Buffer.alloc(10)), 40);
    res.on('close', () => clearInterval(timer));
  });
  const started = Date.now();
  await assert.rejects(fetchBuffer(`${url}/x`, { headersMs: 500, stallMs: 1000, deadline: createDeadline(400) }), { code: 'update_deadline' });
  assert.ok(Date.now() - started < 1500);
  await close(server);
});

test('fetchFirstValid falls through dead, stale and bad sources, and skips a down source next time', async () => {
  const dir = tmp();
  const health = createSourceHealth();
  const dead = await listen(() => { /* hang */ });
  const stale = await listen((req, res) => { res.writeHead(200); res.end('old'); });
  const good = await listen((req, res) => { res.writeHead(200); res.end(payload); });
  const candidates = [
    { id: 'mirror', url: `${dead.url}/a` },
    { id: 'ghproxy', url: `${stale.url}/a` },
    { id: 'github', url: `${good.url}/a` },
  ];
  const validate = (data) => { if (data.length < 100) throw new Error('update_archive_version_mismatch'); };
  const options = { cacheDir: dir, cacheName: 'x', headersMs: 250, stallMs: 250, health, validate };
  const first = await fetchFirstValid(candidates, options);
  assert.equal(first.source.id, 'github');
  assert.ok(first.data.equals(payload));
  assert.deepEqual(health.list(), ['mirror']);
  const started = Date.now();
  const second = await fetchFirstValid(candidates, options);
  assert.equal(second.source.id, 'github');
  assert.ok(Date.now() - started < 200, 'a source already marked down costs no further timeout');
  await assert.rejects(fetchFirstValid([{ id: 'only-dead', url: `${dead.url}/a` }], { ...options, health: createSourceHealth() }), { code: 'update_unreachable' });
  await Promise.all([close(dead.server), close(stale.server), close(good.server)]);
  rmSync(dir, { recursive: true, force: true });
});

const signedManifest = (overrides = {}, keyPair = generateKeyPairSync('ed25519')) => {
  const manifest = {
    schema: 1,
    generatedAt: '2026-01-01T00:00:00Z',
    loader: { version: '9.9.9', archive: 'ShinawaseLoader-main.zip', sha256: 'b'.repeat(64), size: 10 },
    packages: [{ id: UPDATE_PACKAGES[0].id, version: '2.0.0', file: UPDATE_PACKAGES[0].file, sha256: 'c'.repeat(64), size: 5 }],
    ...overrides,
  };
  const bytes = Buffer.from(JSON.stringify(manifest));
  const signature = sign(null, bytes, keyPair.privateKey).toString('base64');
  return { bytes, signature, publicPem: keyPair.publicKey.export({ type: 'spki', format: 'pem' }), keyPair };
};

test('a validly signed mirror manifest is accepted', () => {
  const { bytes, signature, publicPem } = signedManifest();
  const parsed = parseMirrorManifest(bytes, signature, publicPem);
  assert.equal(parsed.loader.version, '9.9.9');
  assert.equal(parsed.packages.length, 1);
});

test('tampered manifests and manifests signed by another key are rejected', () => {
  const { bytes, signature, publicPem } = signedManifest();
  const tampered = Buffer.from(bytes.toString('utf8').replace('9.9.9', '9.9.8'));
  assert.throws(() => parseMirrorManifest(tampered, signature, publicPem), { code: 'update_bad_signature' });
  const other = signedManifest();
  assert.throws(() => parseMirrorManifest(other.bytes, other.signature, publicPem), { code: 'update_bad_signature' });
  assert.throws(() => parseMirrorManifest(bytes, '', publicPem), { code: 'update_bad_signature' });
});

test('signed manifests still cannot smuggle unsafe paths or unknown package ids', () => {
  const unsafe = signedManifest({ loader: { version: '9.9.9', archive: '../evil.zip', sha256: 'b'.repeat(64), size: 1 } });
  assert.throws(() => parseMirrorManifest(unsafe.bytes, unsafe.signature, unsafe.publicPem), { code: 'update_bad_manifest' });
  const packages = signedManifest({ packages: [
    { id: 'evil.package', version: '1.0.0', file: 'examples/packages/x.echomod', sha256: 'c'.repeat(64) },
    { id: UPDATE_PACKAGES[1].id, version: '1.0.0', file: '../../etc/passwd', sha256: 'c'.repeat(64) },
    { id: UPDATE_PACKAGES[2].id, version: '1.0.0', file: UPDATE_PACKAGES[2].file, sha256: 'not-a-hash' },
  ] });
  assert.equal(parseMirrorManifest(packages.bytes, packages.signature, packages.publicPem).packages.length, 0);
});

test('the embedded public key is a valid Ed25519 key', () => {
  assert.equal(createPublicKey(UPDATE_PUBLIC_KEY).asymmetricKeyType, 'ed25519');
});

test('mirror lists are normalised: http(s) only, no credentials, deduped, capped', () => {
  assert.deepEqual(normalizeMirrorBases(['http://a.example/x/', 'http://a.example/x', 'ftp://b.example', 'https://u:p@c.example', 'not a url', '', 'https://d.example']), ['http://a.example/x', 'https://d.example']);
  assert.deepEqual(normalizeMirrorBases([]), []);
  assert.deepEqual(normalizeMirrorBases('http://a.example'), []);
});

test('the update lock is exclusive, releases, and recovers from a stale holder', () => {
  const dir = tmp();
  const lock = join(dir, 'update.lock');
  const release = acquireLock(lock);
  assert.equal(typeof release, 'function');
  assert.equal(acquireLock(lock), null);
  release();
  const again = acquireLock(lock);
  assert.equal(typeof again, 'function');
  again();
  writeFileSync(lock, JSON.stringify({ pid: 1, at: Date.now() - 60 * 60 * 1000 }));
  assert.equal(typeof acquireLock(lock, 15 * 60 * 1000), 'function');
  discardPartial(join(dir, 'nothing'));
  rmSync(dir, { recursive: true, force: true });
});
