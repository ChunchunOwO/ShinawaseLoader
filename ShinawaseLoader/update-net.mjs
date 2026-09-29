// Network primitives for the loader self-update: bounded fetches, resumable
// downloads, source fallback with a per-run health list, signed mirror
// manifests, and an update lock. Pure module (no loader state) so tests/ can
// exercise it against a local HTTP server.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const UPDATE_REPO = 'ChunchunOwO/ShinawaseLoader';
export const UPDATE_PACKAGES = [
  { id: 'echo.community-streaming', manifest: 'examples/ECHO-Streaming/echomod/echo.mod.json', file: 'examples/packages/ECHO-Streaming.echomod' },
  { id: 'echo.mv', manifest: 'examples/ECHO-MV/echomod/echo.mod.json', file: 'examples/packages/ECHO-MV.echomod' },
  { id: 'echo.lyrics-match-whitebox', manifest: 'examples/ECHO-LyricsMatchWhitebox/echomod/echo.mod.json', file: 'examples/packages/ECHO-LyricsMatchWhitebox.echomod' },
];

// Tried first; GitHub (through the ghproxy mirror, then directly) is the fallback.
// Override with `updateMirrors` in loader.config.json or SHINAWASE_UPDATE_MIRRORS
// (comma separated); an empty list disables the mirror.
export const DEFAULT_UPDATE_MIRRORS = ['http://43.248.10.82/shinawase'];

// Mirror manifests are signed with the maintainer's Ed25519 key, so a mirror
// (or anyone on the path to it, since it may be plain HTTP) cannot substitute
// code. The private key never ships; scripts/build-update-mirror.mjs signs.
export const UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAeg3fsjG/nPYC19UhGjQrVoNQj4aYrNJecqB+TJPCxg4=
-----END PUBLIC KEY-----
`;

export class UpdateNetError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'UpdateNetError';
    this.code = code;
  }
}

export const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');

export const normalizeMirrorBases = (list) => {
  const seen = new Set();
  const out = [];
  for (const entry of Array.isArray(list) ? list : []) {
    let text = String(entry || '').trim();
    if (!text) continue;
    text = text.replace(/\/+$/u, '');
    let url;
    try { url = new URL(text); } catch { continue; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    if (url.username || url.password || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= 4) break;
  }
  return out;
};

export const createDeadline = (ms) => {
  const at = Date.now() + Math.max(0, Number(ms) || 0);
  return { at, remaining: () => Math.max(0, at - Date.now()), expired: () => Date.now() >= at };
};

// A source that fails at the network level (timeout, reset, 5xx) is skipped for
// the rest of this run so one dead host costs one timeout, not one per file.
export const createSourceHealth = () => {
  const down = new Set();
  return { down: (id) => down.add(id), isDown: (id) => down.has(id), list: () => [...down] };
};

export const isNetworkFailure = (error) => {
  const code = error?.code || '';
  return code === 'update_timeout' || code === 'update_stalled' || code === 'update_slow' || code === 'update_network'
    || /^http_(5\d\d|429)$/u.test(code);
};

const asNetError = (error, controller) => {
  const reason = controller?.signal?.reason;
  if (controller?.signal?.aborted && reason instanceof UpdateNetError) return reason;
  if (error instanceof UpdateNetError) return error;
  const cause = error?.cause?.code || error?.code || error?.message || 'error';
  return new UpdateNetError('update_network', String(cause));
};

// Resolves once response headers arrive. `headersMs` bounds connect + headers;
// `deadline` bounds the whole operation.
const openStream = async (url, { headersMs = 8000, headers = {}, deadline } = {}) => {
  const left = deadline ? deadline.remaining() : Number.POSITIVE_INFINITY;
  if (left <= 0) throw new UpdateNetError('update_deadline');
  const controller = new AbortController();
  const abortWith = (code) => controller.abort(new UpdateNetError(code));
  const headersTimer = setTimeout(() => abortWith('update_timeout'), Math.min(headersMs, left));
  const deadlineTimer = Number.isFinite(left) ? setTimeout(() => abortWith('update_deadline'), left) : null;
  const dispose = () => { clearTimeout(headersTimer); if (deadlineTimer) clearTimeout(deadlineTimer); };
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'ShinawaseLoader-updater', ...headers } });
    clearTimeout(headersTimer);
    return { response, controller, dispose };
  } catch (error) {
    dispose();
    throw asNetError(error, controller);
  }
};

// Reads the body, aborting when no bytes arrive for `stallMs`. A slow but
// steady link keeps going; a dead one is cut after stallMs, not after a fixed cap.
// A source that keeps trickling bytes never "stalls" but can still eat the whole
// time budget, so `minBps` (after a grace period) abandons it for the next source.
const readBody = async ({ response, controller, dispose }, { stallMs = 15000, minBps = 0, slowGraceMs = 6000, deadline, onChunk }) => {
  const startedAt = Date.now();
  const bodyBytes = Number(response.headers.get('content-length')) || 0;
  let received = 0;
  let stallTimer = 0;
  const arm = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(new UpdateNetError('update_stalled')), stallMs);
  };
  arm();
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      received += value.length;
      const elapsed = Date.now() - startedAt;
      if (elapsed > slowGraceMs) {
        const rate = received / (elapsed / 1000);
        // Too slow to matter, or projected to overrun the time budget: give up on
        // this source now so the next one still gets a chance to finish.
        if (minBps > 0 && rate < minBps) controller.abort(new UpdateNetError('update_slow', `${Math.round(rate)} B/s`));
        else if (deadline && bodyBytes > received && ((bodyBytes - received) / rate) * 1000 > deadline.remaining() * 1.15) {
          controller.abort(new UpdateNetError('update_slow', `${Math.round(rate)} B/s, cannot finish in budget`));
        }
      }
      onChunk(value);
    }
  } catch (error) {
    throw asNetError(error, controller);
  } finally {
    clearTimeout(stallTimer);
    dispose();
  }
};

export const fetchBuffer = async (url, { headersMs, stallMs, deadline, maxBytes = 64 * 1024 * 1024 } = {}) => {
  const handle = await openStream(url, { headersMs, deadline });
  if (!handle.response.ok) {
    handle.dispose();
    handle.controller.abort();
    throw new UpdateNetError(`http_${handle.response.status}`);
  }
  const chunks = [];
  let size = 0;
  await readBody(handle, {
    stallMs,
    onChunk: (chunk) => {
      size += chunk.length;
      if (size > maxBytes) handle.controller.abort(new UpdateNetError('update_too_large'));
      chunks.push(chunk);
    },
  });
  return Buffer.concat(chunks);
};

const readJsonSafe = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

export const discardPartial = (dest) => {
  rmSync(`${dest}.part`, { force: true });
  rmSync(`${dest}.part.json`, { force: true });
};

// Downloads to `${dest}.part`, resuming with a Range request when a partial file
// for the same URL exists (If-Range guards against the remote having changed).
// Progress survives stalls, timeouts and process exits, so a slow link makes
// forward progress across launches instead of restarting every time.
export const downloadResumable = async (url, dest, { headersMs, stallMs, minBps = 0, slowGraceMs, deadline, expectedSha256 = '', expectedSize = 0, maxBytes = 256 * 1024 * 1024, retried = false } = {}) => {
  mkdirSync(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const metaPath = `${dest}.part.json`;
  const meta = readJsonSafe(metaPath);
  let offset = 0;
  if (existsSync(part) && meta?.url === url) offset = statSync(part).size;
  else discardPartial(dest);
  const headers = {};
  if (offset > 0) {
    headers.range = `bytes=${offset}-`;
    if (meta?.etag) headers['if-range'] = meta.etag;
  }
  const handle = await openStream(url, { headersMs, headers, deadline });
  const { response } = handle;
  if (response.status === 416 && !retried) {
    handle.dispose();
    handle.controller.abort();
    discardPartial(dest);
    return downloadResumable(url, dest, { headersMs, stallMs, minBps, slowGraceMs, deadline, expectedSha256, expectedSize, maxBytes, retried: true });
  }
  if (response.status !== 200 && response.status !== 206) {
    handle.dispose();
    handle.controller.abort();
    throw new UpdateNetError(`http_${response.status}`);
  }
  if (response.status === 200) offset = 0; // server ignored (or invalidated) the range: start over
  writeFileSync(metaPath, JSON.stringify({ url, etag: response.headers.get('etag') || '' }));
  const fd = openSync(part, offset > 0 ? 'a' : 'w');
  let written = offset;
  try {
    await readBody(handle, {
      stallMs,
      minBps,
      slowGraceMs,
      deadline,
      onChunk: (chunk) => {
        written += chunk.length;
        if (written > maxBytes) handle.controller.abort(new UpdateNetError('update_too_large'));
        writeSync(fd, chunk);
      },
    });
  } finally {
    closeSync(fd);
  }
  const data = readFileSync(part);
  if ((expectedSize && data.length !== expectedSize) || (expectedSha256 && sha256Hex(data) !== String(expectedSha256).toLowerCase())) {
    discardPartial(dest);
    throw new UpdateNetError('update_hash_mismatch', url);
  }
  discardPartial(dest);
  return data;
};

// Tries each candidate in order ({ id, url, sha256?, size? }); `validate(data, candidate)`
// may throw to reject content (e.g. a stale archive) and move on to the next one.
export const fetchFirstValid = async (candidates, { cacheDir, cacheName, headersMs, stallMs, minBps, slowGraceMs, deadline, health, validate, maxBytes, onAttempt } = {}) => {
  const errors = [];
  for (const candidate of candidates) {
    if (health?.isDown(candidate.id)) { errors.push(`${candidate.id}: skipped (down)`); continue; }
    const dest = join(cacheDir, `${cacheName}.${sha256Hex(candidate.url).slice(0, 10)}`);
    try {
      const data = await downloadResumable(candidate.url, dest, { headersMs, stallMs, minBps, slowGraceMs, deadline, expectedSha256: candidate.sha256, expectedSize: candidate.size, maxBytes });
      if (validate) validate(data, candidate);
      onAttempt?.(candidate, null);
      return { data, source: candidate };
    } catch (error) {
      const code = error?.code || error?.message || String(error);
      errors.push(`${candidate.id}: ${code}`);
      onAttempt?.(candidate, code);
      if (code === 'update_deadline') throw error;
      if (isNetworkFailure(error)) health?.down(candidate.id);
      else if (code !== 'update_hash_mismatch') discardPartial(dest);
    }
  }
  throw new UpdateNetError('update_unreachable', errors.join('; '));
};

// Small files (JSON): first source that answers wins.
export const fetchSmallFromSources = async (candidates, { headersMs, stallMs, deadline, health, maxBytes = 512 * 1024 } = {}) => {
  const errors = [];
  for (const candidate of candidates) {
    if (health?.isDown(candidate.id)) { errors.push(`${candidate.id}: skipped (down)`); continue; }
    try {
      return { data: await fetchBuffer(candidate.url, { headersMs, stallMs, deadline, maxBytes }), source: candidate };
    } catch (error) {
      const code = error?.code || error?.message || String(error);
      errors.push(`${candidate.id}: ${code}`);
      if (code === 'update_deadline') throw error;
      if (isNetworkFailure(error)) health?.down(candidate.id);
    }
  }
  throw new UpdateNetError('update_unreachable', errors.join('; '));
};

export const dropStaleCache = (cacheDir, maxAgeMs = 7 * 24 * 3600 * 1000) => {
  try {
    for (const name of readdirSync(cacheDir)) {
      const file = join(cacheDir, name);
      if (Date.now() - statSync(file).mtimeMs > maxAgeMs) rmSync(file, { force: true });
    }
  } catch { /* cache dir may not exist yet */ }
};

// ---- signed mirror manifest ----------------------------------------------
export const verifyDetached = (data, signatureText, publicKeyPem = UPDATE_PUBLIC_KEY) => {
  try {
    return verify(null, data, createPublicKey(publicKeyPem), Buffer.from(String(signatureText).trim(), 'base64'));
  } catch { return false; }
};

const SAFE_REL = /^[A-Za-z0-9._\-][A-Za-z0-9._\-/]*$/u;
const isSafeRel = (value) => typeof value === 'string' && value.length <= 200 && SAFE_REL.test(value) && !value.split('/').includes('..');
const isHash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);

export const parseMirrorManifest = (bytes, signatureText, publicKeyPem = UPDATE_PUBLIC_KEY) => {
  if (!verifyDetached(bytes, signatureText, publicKeyPem)) throw new UpdateNetError('update_bad_signature');
  const manifest = JSON.parse(bytes.toString('utf8'));
  const loader = manifest?.loader;
  if (manifest?.schema !== 1 || typeof loader?.version !== 'string' || !isSafeRel(loader?.archive) || !isHash(loader?.sha256)) {
    throw new UpdateNetError('update_bad_manifest');
  }
  const packages = (Array.isArray(manifest.packages) ? manifest.packages : []).filter((item) =>
    UPDATE_PACKAGES.some((known) => known.id === item?.id) && typeof item?.version === 'string' && isSafeRel(item?.file) && isHash(item?.sha256));
  return { schema: 1, generatedAt: manifest.generatedAt || null, loader: { version: loader.version, archive: loader.archive, sha256: loader.sha256, size: Number(loader.size) || 0 }, packages: packages.map((item) => ({ id: item.id, version: item.version, file: item.file, sha256: item.sha256, size: Number(item.size) || 0 })) };
};

// ---- update lock -----------------------------------------------------------
export const acquireLock = (file, staleMs = 15 * 60 * 1000) => {
  mkdirSync(dirname(file), { recursive: true });
  const take = () => { writeFileSync(file, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' }); };
  try {
    take();
  } catch (error) {
    if (error?.code !== 'EEXIST') return null;
    const held = readJsonSafe(file);
    if (held && Date.now() - Number(held.at) < staleMs) return null;
    rmSync(file, { force: true });
    try { take(); } catch { return null; }
  }
  return () => rmSync(file, { force: true });
};
