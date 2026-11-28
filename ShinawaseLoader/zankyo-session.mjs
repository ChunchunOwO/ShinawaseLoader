import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

export const MAX_FRAME = 4 * 1024 * 1024;
const aad = Buffer.from('shinawase/1');

export class Cipher {
  constructor(secret, direction) {
    this.key = createHash('sha256').update(secret).update(direction).digest();
    this.sequence = 0n;
  }
  nonce() {
    if (this.sequence >= 0xffffffffffffffffn) throw new Error('session_sequence_exhausted');
    const nonce = Buffer.alloc(12);
    nonce.writeBigUInt64BE(this.sequence++, 4);
    return nonce;
  }
  seal(value) {
    const cipher = createCipheriv('aes-256-gcm', this.key, this.nonce());
    cipher.setAAD(aad);
    const bytes = Buffer.concat([cipher.update(value), cipher.final(), cipher.getAuthTag()]);
    if (bytes.length > MAX_FRAME) throw new Error('gpui_frame_too_large');
    return bytes;
  }
  open(bytes) {
    const cipher = createDecipheriv('aes-256-gcm', this.key, this.nonce());
    cipher.setAAD(aad);
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(0, -16)), cipher.final()]);
  }
}

export function encryptedChannel(socket, secret, { host = false, onMessage, onError }) {
  const send = new Cipher(secret, host ? 'host' : 'loader');
  const receive = new Cipher(secret, host ? 'loader' : 'host');
  let buffered = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    try {
      buffered = Buffer.concat([buffered, chunk]);
      while (buffered.length >= 4) {
        const size = buffered.readUInt32BE();
        if (size < 16 || size > MAX_FRAME) throw new Error('gpui_invalid_frame_size');
        if (buffered.length < size + 4) break;
        const value = JSON.parse(receive.open(buffered.subarray(4, size + 4)).toString('utf8'));
        buffered = buffered.subarray(size + 4);
        onMessage(value);
      }
    } catch (error) { onError(error); socket.destroy(); }
  });
  return (value) => {
    const plain = Buffer.from(JSON.stringify(value));
    if (plain.length > MAX_FRAME - 16) throw new Error('gpui_frame_too_large');
    if (socket.destroyed || socket.writableLength > MAX_FRAME * 2) throw new Error('gpui_channel_unavailable');
    const bytes = send.seal(plain);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(bytes.length);
    socket.write(Buffer.concat([header, bytes]));
  };
}

/** Only this launcher owns the session key; it is never persisted or exposed
 * through the Loader HTTP API. Normal ECHO starts have no endpoint at all. */
export async function launchZankyo(executable, args = [], { env = process.env, cwd, log = () => {}, spawnChild = spawn } = {}) {
  const secret = randomBytes(32);
  const pending = new Map();
  let nextId = 1;
  let child, socket, send, keepalive, connected = false, closed = false;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Readiness is also consumed by callers after spawn returns.
  ready.catch(() => {});
  const server = createServer((candidate) => {
    if (socket || closed) { candidate.destroy(); return; }
    candidate.setNoDelay(true);
    candidate.setTimeout(5000, () => candidate.destroy());
    let authenticated = false;
    const transmit = encryptedChannel(candidate, secret, {
      onMessage(value) {
        if (!authenticated) {
          if (value?.runtime !== 'gpui' || value.protocol !== 1 || value.pid !== child?.pid) {
            candidate.destroy(); return;
          }
          authenticated = true;
          socket = candidate;
          send = transmit;
          connected = true;
          candidate.setTimeout(0);
          clearTimeout(startup);
          server.close();
          send({ protocol: 1, accepted: true });
          resolveReady(value);
          keepalive = setInterval(() => session.call('session.ping').catch(() => {}), 5000);
          keepalive.unref();
          return;
        }
        const request = pending.get(value.id);
        if (!request) return;
        clearTimeout(request.timer);
        pending.delete(value.id);
        if (typeof value.error === 'string') request.reject(new Error(value.error));
        else request.resolve(value.result);
      },
      onError(error) { if (authenticated) close(error); },
    });
    candidate.on('error', (error) => { if (authenticated) close(error); });
    candidate.on('close', () => { if (authenticated) close(new Error('gpui_disconnected')); });
  });
  const close = (error = new Error('gpui_session_closed')) => {
    if (closed) return;
    closed = true;
    connected = false;
    clearTimeout(startup);
    clearInterval(keepalive);
    server.close();
    socket?.destroy();
    rejectReady(error);
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
    secret.fill(0);
  };
  const startup = setTimeout(() => close(new Error('gpui_startup_timeout')), 90000);
  startup.unref();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const childEnv = { ...env,
      SHINAWASE_ENDPOINT: `127.0.0.1:${server.address().port}`, SHINAWASE_KEY: secret.toString('hex') };
    delete childEnv.ELECTRON_RUN_AS_NODE;
    delete childEnv.ELECTRON_NO_ASAR;
    child = spawnChild(executable, args.filter((arg) => !/^--(?:remote-debugging-port|inspect)(?:=|$)/u.test(arg)), {
      cwd, env: childEnv, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (bytes) => log(bytes.toString('utf8')));
    child.stderr?.on('data', (bytes) => log(bytes.toString('utf8')));
    child.once('error', close);
    child.once('exit', () => close(new Error('gpui_process_exited')));
  } catch (error) { close(error); throw error; }
  const session = {
    child, ready,
    get connected() { return connected; },
    close,
    async call(method, params = {}) {
      await ready;
      if (closed || !send) throw new Error('gpui_disconnected');
      if (pending.size >= 32) throw new Error('gpui_request_queue_full');
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`gpui_request_timeout: ${method}`));
        }, 20000);
        pending.set(id, { resolve, reject, timer });
        try { send({ id, method, params }); }
        catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
      });
    },
  };
  return session;
}
