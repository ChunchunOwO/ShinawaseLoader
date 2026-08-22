'use strict';

const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

const AUX_KEYS = ['desktopLyrics', 'pet', 'miniPlayer'];
const TITLE_KIND = {
  'ECHO Desktop Lyrics': 'desktopLyrics',
  'ECHO Pet': 'pet',
  'ECHO Mini Player': 'miniPlayer',
};

const filePathFromUrl = (value) => {
  const text = String(value || '').split('#')[0].split('?')[0];
  if (!text) return '';
  if (text.startsWith('file:')) {
    try { return fileURLToPath(text); } catch { return ''; }
  }
  return text;
};

const isAuxQuery = (query) => AUX_KEYS.some((key) => String(query?.[key] || '') === '1');

const kindFromHref = (href) => {
  try {
    const params = new URL(String(href || ''), 'file://dummy/').searchParams;
    return AUX_KEYS.find((key) => params.get(key) === '1') || (/auxiliary\.html/i.test(href) ? 'auxiliary' : null);
  } catch {
    return /[?&](desktopLyrics|pet|miniPlayer)=1/i.test(String(href || '')) ? 'query' : null;
  }
};

const kindFromWindow = (window) => {
  try {
    const titled = TITLE_KIND[window.getTitle?.() || ''];
    if (titled) return titled;
    return kindFromHref(window.webContents?.getURL?.() || '');
  } catch {
    return null;
  }
};

const queryForKind = (kind, query = {}) => {
  const next = { ...query };
  if (AUX_KEYS.includes(kind) && String(next[kind] || '') !== '1') next[kind] = '1';
  return next;
};

const siblingAuxiliary = (file) => {
  const path = filePathFromUrl(file) || String(file || '');
  if (!path || !/index\.html$/i.test(path)) return '';
  const aux = path.replace(/index\.html$/i, 'auxiliary.html');
  return existsSync(aux) ? aux : '';
};

const remapFile = (file, options, window) => {
  const next = { ...(options || {}), query: { ...((options && options.query) || {}) } };
  const kind = isAuxQuery(next.query) ? true : kindFromWindow(window);
  if (!kind) return { file, options };
  if (kind !== true) next.query = queryForKind(kind, next.query);
  if (!isAuxQuery(next.query)) return { file, options };
  if (/auxiliary\.html$/i.test(String(file))) return { file, options: next };
  const aux = siblingAuxiliary(file);
  return { file: aux || file, options: next };
};

const remapHref = (href, window) => {
  const text = String(href || '');
  if (!text) return '';
  const kind = kindFromHref(text) || kindFromWindow(window);
  if (!kind || kind === 'auxiliary') return '';
  let next = text;
  if (!/[?&](desktopLyrics|pet|miniPlayer)=1/i.test(next) && AUX_KEYS.includes(kind)) {
    next += (next.includes('?') ? '&' : '?') + `${kind}=1`;
  }
  if (/index\.html/i.test(next)) {
    const aux = siblingAuxiliary(next);
    if (aux) {
      try {
        const url = new URL(next);
        url.pathname = url.pathname.replace(/index\.html$/i, 'auxiliary.html');
        return url.href;
      } catch {
        return pathToFileURL(aux).href + (next.includes('?') ? next.slice(next.indexOf('?')) : '');
      }
    }
  }
  return next === text ? '' : next;
};

const installSessionBoot = (ses) => {
  if (!ses || ses.__shinawaseAuxBoot) return false;
  ses.__shinawaseAuxBoot = true;
  const boot = join(__dirname, 'auxiliary-page-boot.js');
  const guard = join(__dirname, 'auxiliary-guard-preload.cjs');
  if (typeof ses.registerPreloadScript === 'function' && existsSync(boot)) {
    try {
      ses.registerPreloadScript({ id: 'shinawase-aux-boot', type: 'frame', filePath: boot, world: 'main' });
      return true;
    } catch {}
    try {
      ses.registerPreloadScript({ id: 'shinawase-aux-boot', type: 'frame', filePath: boot });
      return true;
    } catch {}
  }
  if (typeof ses.setPreloads === 'function' && existsSync(guard)) {
    const current = ses.getPreloads();
    if (!current.includes(guard)) ses.setPreloads([...current, guard]);
    return true;
  }
  return false;
};

const watchWindow = (window) => {
  if (!window || window.isDestroyed?.() || window.__shinawaseAuxWatched) return;
  window.__shinawaseAuxWatched = true;
  wrapWindowLoad(window);
  try { installSessionBoot(window.webContents?.session); } catch {}
  const tryRemap = () => {
    if (window.isDestroyed?.()) return;
    try {
      const href = window.webContents.getURL();
      const mapped = remapHref(href, window);
      if (mapped && mapped !== href) void window.loadURL(mapped);
    } catch {}
  };
  window.webContents.on('did-finish-load', tryRemap);
  window.webContents.on('did-navigate', tryRemap);
  window.webContents.on('render-process-gone', () => {
    if (window.__shinawaseAuxCrash) return;
    window.__shinawaseAuxCrash = true;
    tryRemap();
  });
  tryRemap();
};

const wrapWindowLoad = (window) => {
  if (!window || window.__shinawaseAuxInstance) return;
  window.__shinawaseAuxInstance = true;
  if (typeof window.loadFile === 'function') {
    const original = window.loadFile.bind(window);
    window.loadFile = (file, options) => {
      const mapped = remapFile(file, options, window);
      return original(mapped.file, mapped.options);
    };
  }
  if (typeof window.loadURL === 'function') {
    const original = window.loadURL.bind(window);
    window.loadURL = (url, options) => original(remapHref(url, window) || url, options);
  }
};

const patchPrototype = (BrowserWindow) => {
  if (!BrowserWindow?.prototype || BrowserWindow.prototype.__shinawaseAuxPatched) return false;
  const originalLoadFile = BrowserWindow.prototype.loadFile;
  const originalLoadURL = BrowserWindow.prototype.loadURL;
  try {
    if (typeof originalLoadFile === 'function') {
      BrowserWindow.prototype.loadFile = function loadFile(file, options) {
        const mapped = remapFile(file, options, this);
        return originalLoadFile.call(this, mapped.file, mapped.options);
      };
    }
    if (typeof originalLoadURL === 'function') {
      BrowserWindow.prototype.loadURL = function loadURL(url, options) {
        return originalLoadURL.call(this, remapHref(url, this) || url, options);
      };
    }
    BrowserWindow.prototype.__shinawaseAuxPatched = true;
    return true;
  } catch {
    return false;
  }
};

const installAuxiliaryRemap = (host = {}) => {
  const previous = globalThis.__shinawaseAuxiliaryRemap;
  if (previous?.prototype) return previous;
  const app = host.app;
  const BrowserWindow = host.BrowserWindow;
  const session = host.session;
  const result = { ok: true, prototype: false, session: false, windows: 0 };
  try {
    result.prototype = patchPrototype(BrowserWindow);
    result.session = installSessionBoot(session?.defaultSession);
    if (app?.on && BrowserWindow) {
      app.on('browser-window-created', (_event, window) => watchWindow(window));
      for (const window of BrowserWindow.getAllWindows?.() || []) {
        watchWindow(window);
        result.windows += 1;
      }
    }
    host.log?.(`auxiliary remap prototype=${result.prototype} session=${result.session} windows=${result.windows}`);
  } catch (error) {
    result.ok = false;
    result.error = error instanceof Error ? error.message : String(error);
  }
  globalThis.__shinawaseAuxiliaryRemap = result;
  return result;
};

module.exports = { installAuxiliaryRemap };
exports.installAuxiliaryRemap = installAuxiliaryRemap;
