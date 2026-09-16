// Shinawase Testing SDK - live attach-only clients.
//
// LoaderClient speaks the loader's public HTTP API on loopback (the same
// surface the injected UI uses); RendererClient speaks CDP to the ECHO Main
// window (the same channel the loader injects through, and the same trusted
// input technique examples/ECHO-MV/dev/real-input-test.mjs already uses).
// Neither client launches or terminates processes; unreachable endpoints
// raise TestingClientError with a stable `code` so callers can report a
// skipped live check instead of a false failure.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_CDP_PORT, DEFAULT_INSPECT_PORT, DEFAULT_LOADER_PORT, MAX_REQUEST_BYTES,
  classifyEchoWindow, rendererProbeExpression,
} from './contract.mjs';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const CDP_TIMEOUT_MS = 15000;

export class TestingClientError extends Error {
  constructor(message, code, extra = {}) {
    super(message);
    this.name = 'TestingClientError';
    this.code = code;
    Object.assign(this, extra);
  }
}

const assertLoopback = (host) => {
  if (!LOOPBACK_HOSTS.has(String(host))) {
    throw new TestingClientError(`refusing non-loopback host "${host}": the testing SDK only talks to local loader/CDP endpoints`, 'host_not_loopback');
  }
};

// CDP/inspector endpoints hand back webSocketDebuggerUrl values; validate
// them before opening privileged sockets so a stale or hostile local endpoint
// cannot point the SDK at a remote host.
export const assertLoopbackWsUrl = (value) => {
  let url;
  try { url = new URL(String(value)); }
  catch { throw new TestingClientError(`invalid WebSocket URL from local endpoint: ${JSON.stringify(String(value))}`, 'ws_url_invalid'); }
  if (url.protocol !== 'ws:') {
    throw new TestingClientError(`refusing non-ws WebSocket URL "${url.protocol}//...": local CDP/inspector endpoints use ws:// on loopback`, 'ws_not_loopback');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new TestingClientError(`refusing non-loopback WebSocket host "${url.hostname}": the testing SDK only talks to local loader/CDP endpoints`, 'ws_not_loopback');
  }
  return url.href;
};

// redirect: 'error' on every request: Node fetch follows redirects by
// default, which would let a local endpoint bounce the SDK off loopback.
const fetchJson = async (url, { method = 'GET', body, timeoutMs = 10000 } = {}) => {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch { value = { raw: text }; }
  if (!response.ok) {
    throw new TestingClientError(`HTTP ${response.status} ${method} ${url}: ${value?.error || text.slice(0, 200)}`, 'api_error', { status: response.status, value });
  }
  return value;
};

// --- Loader HTTP client ---

export class LoaderClient {
  constructor({ port = DEFAULT_LOADER_PORT, host = '127.0.0.1', timeoutMs = 10000 } = {}) {
    assertLoopback(host);
    this.port = Number(port);
    this.host = String(host);
    this.timeoutMs = timeoutMs;
    this.baseUrl = `http://${this.host}:${this.port}`;
    this.lastStatus = null;
  }
  request(path, options = {}) {
    return fetchJson(this.baseUrl + path, { timeoutMs: this.timeoutMs, ...options });
  }
  async status() {
    this.lastStatus = await this.request('/api/status');
    return this.lastStatus;
  }
  mods() { return this.request('/api/mods'); }
  sdkInfo() { return this.request('/api/sdk'); }
  logs({ kind, tail } = {}) {
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    if (tail) params.set('tail', String(tail));
    return this.request(`/api/logs${params.size ? `?${params}` : ''}`);
  }
  reinject() { return this.request('/api/reinject', { method: 'POST', body: {} }); }
  enable(id) { return this.request(`/api/mod/${encodeURIComponent(id)}/enable`, { method: 'POST', body: {} }); }
  disable(id) { return this.request(`/api/mod/${encodeURIComponent(id)}/disable`, { method: 'POST', body: {} }); }
  remove(id) { return this.request(`/api/mod/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  getConfig(id) { return this.request(`/api/mod/${encodeURIComponent(id)}/config`); }
  setConfig(id, config) { return this.request(`/api/mod/${encodeURIComponent(id)}/config`, { method: 'PUT', body: { config } }); }
  playerStatus() { return this.request('/api/player'); }
  player(payload) { return this.request('/api/player', { method: 'POST', body: payload }); }
  uiSettings() { return this.request('/api/ui-settings'); }
  // POST /api/launch reuses the loader's own selection, runtime sync, and
  // debug-port arguments; the testing SDK adds no launch logic of its own.
  launch() { return this.request('/api/launch', { method: 'POST', body: {}, timeoutMs: 60000 }); }

  // Packs a directory with the repo/release packer (scripts/pack-echomod.mjs)
  // and imports through POST /api/import. The base64 body must stay inside the
  // loader's readRequest cap (ShinawaseLoader.mjs: 64 MB).
  async importPackage(fileOrDir, options = {}) {
    let archivePath = resolve(String(fileOrDir));
    let cleanup = null;
    if (statSync(archivePath).isDirectory()) {
      const packer = options.packerScript || findPackerScript();
      if (!packer) {
        throw new TestingClientError('scripts/pack-echomod.mjs not found next to the loader; pack the directory first and import the archive', 'packer_missing');
      }
      const output = join(tmpdir(), `shinawase-testing-${randomUUID()}.echomod`);
      const packed = spawnSync(process.execPath, [packer, archivePath, output, '--zip'], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
      if (packed.status !== 0) {
        throw new TestingClientError(`pack-echomod failed: ${(packed.stderr || packed.stdout || '').trim().slice(0, 400)}`, 'pack_failed');
      }
      archivePath = output;
      cleanup = output;
    }
    try {
      const bytes = readFileSync(archivePath);
      const base64 = bytes.toString('base64');
      if (base64.length > MAX_REQUEST_BYTES * 0.95) {
        throw new TestingClientError(`archive is too large for POST /api/import (${bytes.length} bytes vs the loader 64 MB body cap); drop it into the Mods folder instead`, 'archive_too_large_for_import');
      }
      const result = await this.request('/api/import', { method: 'POST', body: { data: base64 }, timeoutMs: 120000 });
      return result.manifest;
    } finally {
      if (cleanup) { try { rmSync(cleanup, { force: true }); } catch {} }
    }
  }

  async renderer(options = {}) {
    const debugPort = options.debugPort ?? (this.lastStatus || await this.status()).debugPort ?? DEFAULT_CDP_PORT;
    return RendererClient.connect({ debugPort, timeoutMs: options.timeoutMs });
  }
}

const findPackerScript = () => {
  // testing/ lives inside ShinawaseLoader/, so the repo and release layouts
  // both place the packer at ../../scripts/pack-echomod.mjs.
  const candidate = join(moduleDir, '..', '..', 'scripts', 'pack-echomod.mjs');
  try { readFileSync(candidate, 'utf8'); return candidate; } catch { return null; }
};

export const connectLoader = async (options = {}) => {
  const client = new LoaderClient(options);
  try {
    const status = await client.status();
    if (status?.ok !== true) throw new Error('status not ok');
    return client;
  } catch (error) {
    if (error instanceof TestingClientError && error.code === 'host_not_loopback') throw error;
    throw new TestingClientError(
      `no ShinawaseLoader on ${client.baseUrl} (${error instanceof Error ? error.message : error})`,
      'loader_unreachable', { skipped: true, port: client.port },
    );
  }
};

// --- Renderer CDP client ---

export class RendererClient {
  constructor(socket, target, { debugPort, timeoutMs = CDP_TIMEOUT_MS }) {
    this.socket = socket;
    this.target = target;
    this.debugPort = debugPort;
    this.timeoutMs = timeoutMs;
    this.consoleLog = [];
    this.capturingConsole = false;
    this.__pending = new Map();
    this.__seq = 0;
    this.__eventHandlers = new Map();
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id !== undefined) {
        const entry = this.__pending.get(message.id);
        if (!entry) return;
        this.__pending.delete(message.id);
        message.error ? entry.reject(new TestingClientError(message.error.message || entry.method, 'cdp_error')) : entry.resolve(message.result);
        return;
      }
      for (const handler of this.__eventHandlers.get(message.method) || []) {
        try { handler(message.params); } catch {}
      }
    });
    const failAll = (reason) => {
      for (const entry of this.__pending.values()) entry.reject(new TestingClientError(reason, 'cdp_socket_closed'));
      this.__pending.clear();
    };
    socket.addEventListener('close', () => failAll('cdp_socket_closed'), { once: true });
    socket.addEventListener('error', () => failAll('cdp_socket_error'));
  }

  static async targets({ debugPort = DEFAULT_CDP_PORT, host = '127.0.0.1', timeoutMs = 5000 } = {}) {
    assertLoopback(host);
    let list;
    try {
      const response = await fetch(`http://${host}:${debugPort}/json/list`, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      list = await response.json();
    } catch (error) {
      throw new TestingClientError(`no CDP endpoint on ${host}:${debugPort} (${error instanceof Error ? error.message : error})`, 'cdp_unreachable', { skipped: true, debugPort });
    }
    return (Array.isArray(list) ? list : []).filter((target) => target.type === 'page' && target.webSocketDebuggerUrl
      && !/^devtools:/iu.test(target.url || '') && !/chrome-error/iu.test(target.url || ''));
  }

  static async connect({ debugPort = DEFAULT_CDP_PORT, host = '127.0.0.1', timeoutMs = CDP_TIMEOUT_MS } = {}) {
    const targets = await RendererClient.targets({ debugPort, host });
    const main = targets.find((target) => classifyEchoWindow(target.url, target.title) === 'Main');
    if (!main) {
      throw new TestingClientError(`CDP on ${host}:${debugPort} has ${targets.length} page target(s) but no ECHO Main window`, 'main_window_missing', { skipped: true, debugPort });
    }
    const socket = new WebSocket(assertLoopbackWsUrl(main.webSocketDebuggerUrl));
    await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new TestingClientError('cdp_connect_timeout', 'cdp_connect_timeout')), timeoutMs);
      socket.addEventListener('open', () => { clearTimeout(timer); resolvePromise(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new TestingClientError('cdp_socket_error', 'cdp_unreachable')); }, { once: true });
    });
    return new RendererClient(socket, main, { debugPort, timeoutMs });
  }

  call(method, params = {}) {
    return new Promise((resolvePromise, reject) => {
      const id = ++this.__seq;
      const timer = setTimeout(() => {
        this.__pending.delete(id);
        reject(new TestingClientError(`cdp_${method}_timeout`, 'cdp_timeout'));
      }, this.timeoutMs);
      this.__pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timer); resolvePromise(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch (error) { clearTimeout(timer); this.__pending.delete(id); reject(error); }
    });
  }

  on(method, handler) {
    if (!this.__eventHandlers.has(method)) this.__eventHandlers.set(method, new Set());
    this.__eventHandlers.get(method).add(handler);
    return () => this.__eventHandlers.get(method)?.delete(handler);
  }

  // Mirrors the loader's session.evaluate: awaitPromise + returnByValue +
  // userGesture, throwing on renderer exceptions.
  async eval(expression, { awaitPromise = true } = {}) {
    const result = await this.call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
    if (result?.exceptionDetails) {
      throw new TestingClientError(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'renderer evaluation failed', 'renderer_exception');
    }
    return result;
  }
  async evalValue(expression, options) { return (await this.eval(expression, options))?.result?.value; }

  probe() { return this.evalValue(rendererProbeExpression, { awaitPromise: false }); }
  async injectedMods() { return (await this.probe())?.mods || {}; }

  async waitForTrue(expression, { timeoutMs = 15000, pollMs = 250, label } = {}) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      last = await this.evalValue(`Boolean(${expression})`, { awaitPromise: false }).catch(() => false);
      if (last === true) return true;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, pollMs));
    }
    throw new TestingClientError(`timed out waiting for ${label || expression}`, 'wait_timeout');
  }
  waitForSelector(selector, options = {}) {
    return this.waitForTrue(`document.querySelector(${JSON.stringify(selector)})`, { label: `selector ${selector}`, ...options });
  }
  waitForInjected(id, options = {}) {
    return this.waitForTrue(`window.__echoExternalMods && window.__echoExternalMods[${JSON.stringify(id)}]`, { label: `mod ${id} injected`, ...options });
  }
  waitForReady(options = {}) {
    return this.waitForTrue('(!document.querySelector(".echo-startup-shell") || document.documentElement.dataset.echoStartup === "ready") && document.querySelector(".app-shell")', { label: 'renderer ready', ...options });
  }
  async expectAbsent(selector) {
    const present = await this.evalValue(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, { awaitPromise: false });
    if (present) throw new TestingClientError(`selector still present: ${selector}`, 'selector_present');
    return true;
  }

  async elementCenter(selector) {
    const rect = await this.evalValue(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })()`, { awaitPromise: false });
    if (!rect) throw new TestingClientError(`selector not found: ${selector}`, 'selector_missing');
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), rect };
  }

  // Trusted synthetic input via the Input domain (the technique
  // examples/ECHO-MV/dev/real-input-test.mjs uses); no OS-global input.
  async click(selector, { button = 'left', clickCount = 1, delayMs = 60 } = {}) {
    const { x, y } = await this.elementCenter(selector);
    await this.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
    await this.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount });
    return { x, y };
  }
  dblclick(selector) { return this.click(selector, { clickCount: 2 }); }
  async hover(selector) {
    const { x, y } = await this.elementCenter(selector);
    await this.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    return { x, y };
  }
  async scroll(selector, { deltaY = 240, deltaX = 0, steps = 1, delayMs = 100 } = {}) {
    const { x, y } = await this.elementCenter(selector);
    for (let step = 0; step < steps; step += 1) {
      await this.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
    }
    return { x, y };
  }
  async type(text, { selector } = {}) {
    if (selector) await this.click(selector);
    await this.call('Input.insertText', { text: String(text) });
  }
  async press(key) {
    const known = {
      Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
      Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
      Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
      Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
      ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
      ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
      ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
      ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
      Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
    }[key] || { key: String(key), code: String(key) };
    await this.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...known });
    if (known.text) await this.call('Input.dispatchKeyEvent', { type: 'char', ...known });
    await this.call('Input.dispatchKeyEvent', { type: 'keyUp', ...known });
  }

  navigate(routeId) {
    return this.evalValue(`(() => {
      if (!window.__echoExternalExtend) throw new Error('extend runtime not mounted; POST /api/reinject first');
      window.__echoExternalExtend.navigate(${JSON.stringify(String(routeId))});
      return true;
    })()`, { awaitPromise: false });
  }

  // Renderer-compositor capture: only ECHO's own page contents are ever in
  // the image (never the desktop or other applications).
  async screenshot({ path, format = 'png', quality, clip, fullPage = false } = {}) {
    const params = { format, captureBeyondViewport: fullPage === true };
    if (quality !== undefined && format === 'jpeg') params.quality = Number(quality);
    if (clip) params.clip = { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: clip.scale ?? 1 };
    const result = await this.call('Page.captureScreenshot', params);
    const bytes = Buffer.from(result.data, 'base64');
    if (path) {
      mkdirSync(dirname(resolve(path)), { recursive: true });
      writeFileSync(resolve(path), bytes);
    }
    return { path: path ? resolve(path) : null, bytes: bytes.length };
  }
  async screenshotElement(selector, options = {}) {
    const { rect } = await this.elementCenter(selector);
    if (!rect.width || !rect.height) throw new TestingClientError(`element has no box: ${selector}`, 'element_no_box');
    return this.screenshot({ ...options, clip: rect });
  }

  async setViewportOverride({ width, height, deviceScaleFactor = 1 }) {
    await this.call('Emulation.setDeviceMetricsOverride', { width: Number(width), height: Number(height), deviceScaleFactor, mobile: false });
    return () => this.clearViewportOverride();
  }
  clearViewportOverride() { return this.call('Emulation.clearDeviceMetricsOverride', {}).catch(() => undefined); }

  async startConsoleCapture() {
    if (this.capturingConsole) return () => this.stopConsoleCapture();
    this.capturingConsole = true;
    this.__consoleDisposers = [
      this.on('Runtime.consoleAPICalled', (params) => {
        this.consoleLog.push({
          kind: 'console', level: params.type,
          text: (params.args || []).map((arg) => arg.value !== undefined ? String(arg.value) : arg.description || arg.type).join(' ').slice(0, 2000),
          at: params.timestamp,
        });
      }),
      this.on('Runtime.exceptionThrown', (params) => {
        this.consoleLog.push({
          kind: 'exception', level: 'error',
          text: String(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'uncaught exception').slice(0, 2000),
          at: params.timestamp,
        });
      }),
    ];
    await this.call('Runtime.enable');
    return () => this.stopConsoleCapture();
  }
  stopConsoleCapture() {
    this.capturingConsole = false;
    for (const dispose of this.__consoleDisposers || []) dispose();
    this.__consoleDisposers = [];
  }
  consoleRecords({ level } = {}) {
    return level ? this.consoleLog.filter((entry) => entry.level === level) : [...this.consoleLog];
  }

  // Disruptive but recoverable: the loader watch cycle (or an explicit
  // POST /api/reinject) restores injected packages after a reload.
  async reload({ waitReadyMs = 60000 } = {}) {
    await this.call('Page.enable').catch(() => undefined);
    await this.call('Page.reload', { ignoreCache: false });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
    await this.waitForReady({ timeoutMs: waitReadyMs });
  }

  close() { try { this.socket.close(); } catch {} }
}

// --- Main-process inspector: fixed whitelist only ---
//
// The 9230 inspector evaluates in the Electron main process with full
// privileges, so the testing SDK deliberately does not expose generic
// evaluation there. The two operations below (occlusion-proof capture, window
// geometry) mirror examples/ECHO-MV/dev/capture-main.mjs; packages that need
// main-process behavior use the SDK `main.invoke` surface instead.

const mainInspectorEval = async ({ inspectPort = DEFAULT_INSPECT_PORT, host = '127.0.0.1', expression, timeoutMs = 20000 }) => {
  assertLoopback(host);
  let targets;
  try {
    targets = await (await fetch(`http://${host}:${inspectPort}/json`, { redirect: 'error', signal: AbortSignal.timeout(5000) })).json();
  } catch (error) {
    throw new TestingClientError(`no main-process inspector on ${host}:${inspectPort}`, 'inspector_unreachable', { skipped: true });
  }
  const target = (Array.isArray(targets) ? targets : []).find((entry) => entry.webSocketDebuggerUrl);
  if (!target) throw new TestingClientError('main-process inspector has no target', 'inspector_unreachable', { skipped: true });
  const socket = new WebSocket(assertLoopbackWsUrl(target.webSocketDebuggerUrl));
  await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new TestingClientError('inspector_connect_timeout', 'inspector_unreachable')), 5000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolvePromise(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new TestingClientError('inspector_socket_error', 'inspector_unreachable')); }, { once: true });
  });
  try {
    const result = await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new TestingClientError('inspector_eval_timeout', 'inspector_timeout')), timeoutMs);
      const onMessage = (event) => {
        let message;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (message.id !== 1) return;
        clearTimeout(timer);
        socket.removeEventListener('message', onMessage);
        message.error ? reject(new TestingClientError(message.error.message, 'inspector_error')) : resolvePromise(message.result);
      };
      socket.addEventListener('message', onMessage);
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true } }));
    });
    if (result?.exceptionDetails) throw new TestingClientError(result.exceptionDetails.text || 'inspector evaluation failed', 'inspector_error');
    return result?.result?.value;
  } finally {
    try { socket.close(); } catch {}
  }
};

// Whitelisted operation 1: capture the main window via
// webContents.capturePage (works while occluded/minimized, unlike
// Page.captureScreenshot on some hosts).
export const captureViaMainProcess = async ({ inspectPort, host, path } = {}) => {
  const value = await mainInspectorEval({
    inspectPort, host,
    expression: `(async () => {
      const { BrowserWindow } = require('electron');
      const win = BrowserWindow.getAllWindows().find((w) => /renderer\\/index\\.html/.test(w.webContents.getURL())) || BrowserWindow.getAllWindows()[0];
      if (!win) return { err: 'no window' };
      const image = await win.webContents.capturePage();
      return { png: image.toPNG().toString('base64') };
    })()`,
  });
  if (!value?.png) throw new TestingClientError(value?.err || 'capturePage failed', 'capture_failed');
  const bytes = Buffer.from(value.png, 'base64');
  if (path) {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(resolve(path), bytes);
  }
  return { path: path ? resolve(path) : null, bytes: bytes.length };
};

// Whitelisted operation 2: window enumeration/geometry for doctor reports.
export const mainWindowInfo = ({ inspectPort, host } = {}) => mainInspectorEval({
  inspectPort, host,
  expression: `(() => {
    const { BrowserWindow } = require('electron');
    return BrowserWindow.getAllWindows().map((win) => ({
      title: win.getTitle(), url: win.webContents.getURL(), bounds: win.getBounds(),
      focused: win.isFocused(), visible: win.isVisible(), minimized: win.isMinimized(),
    }));
  })()`,
});
