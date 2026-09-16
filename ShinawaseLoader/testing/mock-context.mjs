// Shinawase Testing SDK - recorded mock of the echoExternalMod / echoConfigUi
// runtime contexts.
//
// Shapes mirror the bridge assembled by ShinawaseLoader.mjs injectIntoTarget()
// and the echoConfigUi contract in SDK.md. Every SDK call a package makes is
// appended to `records` so tests can assert behavior without a live ECHO.
// window.echo method shapes are intentionally loose (SDK.md: discover at
// runtime); the mock guarantees the documented namespaces plus the two calls
// the loader itself relies on (app.getSettings/setSettings,
// playback.getStatus), everything else is supplied through options.echo.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_UI_SETTINGS, ECHO_NAMESPACES, EXTEND_BLOCKED_SEGMENTS, SDK_BLOCKED_SEGMENTS,
  SDK_PATH_SEGMENT, safeRelative, settingsStorageKey,
} from './contract.mjs';

const clone = (value) => {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value ?? null)); }
};

const deepMerge = (base, patch) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch === undefined ? base : patch;
  const target = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) target[key] = deepMerge(target[key], value);
  return target;
};

const textResponse = (status, body, binary = false) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => (typeof body === 'string' ? JSON.parse(body) : clone(body)),
  arrayBuffer: async () => {
    if (binary && body instanceof Uint8Array) return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    const encoded = new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body));
    return encoded.buffer;
  },
});

export const createMockContext = (options = {}) => {
  const realm = options.realm;
  if (!realm) throw new Error('createMockContext requires a mock realm');
  const { window, document } = realm;
  const id = String(options.id || options.manifest?.id || 'shinawase.testing.mod');
  const manifest = options.manifest || { id, name: 'Harness Mod', version: '0.0.0' };
  const config = clone(options.config ?? {});
  const packageDir = options.packageDir || null;
  const records = [];
  let recordSeq = 0;
  const record = (api, method, args, result) => {
    const entry = { seq: ++recordSeq, api, method, args: [...args], result };
    records.push(entry);
    return entry;
  };

  // --- window.echo (raw target + recording proxy) ---
  const appSettings = deepMerge({ sidebarHiddenRouteIds: [] }, options.appSettings || {});
  const playerModel = {
    state: 'stopped', positionSeconds: 0, durationSeconds: 0, repeat: 'off',
    currentTrack: null, queue: [],
    ...clone(options.playerStatus || {}),
  };
  const rawEcho = deepMerge(
    Object.fromEntries(ECHO_NAMESPACES.map((name) => [name, {}])),
    {
      app: {
        getSettings: async () => clone(appSettings),
        setSettings: async (patch) => Object.assign(appSettings, clone(patch)),
      },
      playback: {
        getStatus: async () => ({
          state: playerModel.state,
          positionSeconds: playerModel.positionSeconds,
          durationSeconds: playerModel.durationSeconds,
          currentTrackId: playerModel.currentTrack?.id || '',
          currentTrackTitle: playerModel.currentTrack?.title || '',
          currentTrackArtist: playerModel.currentTrack?.artist || '',
        }),
      },
    },
  );
  Object.assign(rawEcho, deepMerge(rawEcho, options.echo || {}));
  const echoWrapCache = new WeakMap();
  const wrapEcho = (value, path) => {
    if (typeof value === 'function') {
      return (...args) => {
        record('echo', path, args);
        return value(...args);
      };
    }
    if (!value || typeof value !== 'object') return value;
    if (!echoWrapCache.has(value)) {
      echoWrapCache.set(value, new Proxy(value, {
        get: (target, prop) => {
          const child = Reflect.get(target, prop);
          if (typeof prop === 'symbol') return child;
          return wrapEcho(child, path ? `${path}.${prop}` : String(prop));
        },
      }));
    }
    return echoWrapCache.get(value);
  };
  const echo = wrapEcho(rawEcho, '');
  window.echo = echo;

  // --- disposer tracking (mirrors bridge trackExtend / sidebarDisposers) ---
  const extendDisposers = [];
  const sidebarDisposers = [];
  const trackExtend = (dispose) => {
    if (typeof dispose === 'function') extendDisposers.push(dispose);
    return dispose;
  };

  // --- extend runtime (functional against the mock DOM) ---
  const styles = new Map();
  const hooks = new Map();
  const routeReplacements = new Map();
  const hiddenNav = new Set();
  const appShell = () => document.querySelector('.app-shell') || document.body;
  const ensureSurface = (routeId) => {
    let surface = document.querySelector(`.page-surface[data-route-id="${routeId}"]`);
    if (!surface) {
      surface = document.createElement('section');
      surface.className = 'page-surface';
      surface.setAttribute('data-route-id', routeId);
      surface.hidden = true;
      appShell().append(surface);
      // Simulated native route surface: belongs to the fake app, not the mod.
      realm.audit.exempt?.(surface);
    }
    return surface;
  };
  const syncReplacements = () => {
    const route = extend.currentRoute();
    for (const [routeId, entry] of routeReplacements) {
      const native = document.querySelector(`.page-surface[data-route-id="${routeId}"]`);
      if (route === routeId) {
        if (native) { native.setAttribute('data-echo-external-replaced', 'true'); native.style.display = 'none'; }
        entry.page.hidden = false;
        if (!entry.mounted) {
          entry.mounted = true;
          if (typeof entry.options.render === 'function') entry.cleanup = entry.options.render(entry.page) || null;
          else if (typeof entry.options.html === 'string') entry.page.innerHTML = entry.options.html;
        }
      } else {
        entry.page.hidden = true;
      }
    }
  };
  const resolveEchoPath = (path, blocked) => {
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length || parts.some((part) => blocked.has(part))) throw new Error('extend_path_invalid');
    let owner = rawEcho;
    for (let index = 0; index < parts.length - 1; index += 1) {
      owner = owner?.[parts[index]];
      if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) throw new Error('extend_path_missing');
    }
    return { owner, key: parts[parts.length - 1], path: parts.join('.') };
  };
  const extend = {
    version: 1,
    mode: 'harness',
    css: (styleId, cssText) => {
      const fullId = `${id}:${String(styleId || 'style')}`;
      record('extend', 'css', [fullId]);
      let node = styles.get(fullId);
      if (!node) {
        node = document.createElement('style');
        node.dataset.echoExternalExtend = fullId;
        document.head.append(node);
        styles.set(fullId, node);
      }
      node.textContent = String(cssText || '');
      return trackExtend(() => { node.remove(); styles.delete(fullId); });
    },
    removeCss: (styleId) => {
      const fullId = `${id}:${String(styleId || 'style')}`;
      record('extend', 'removeCss', [fullId]);
      styles.get(fullId)?.remove();
      styles.delete(fullId);
    },
    hook: (path, wrapper) => {
      record('extend', 'hook', [path]);
      const target = resolveEchoPath(path, EXTEND_BLOCKED_SEGMENTS);
      const original = target.owner[target.key];
      if (typeof original !== 'function') throw new Error('extend_path_missing');
      const bound = original.bind(target.owner);
      target.owner[target.key] = (...args) => wrapper(bound, ...args);
      hooks.set(target.path, { owner: target.owner, key: target.key, original });
      return trackExtend(() => extend.unhook(target.path));
    },
    unhook: (path) => {
      record('extend', 'unhook', [path]);
      const entry = hooks.get(String(path));
      if (!entry) return;
      entry.owner[entry.key] = entry.original;
      hooks.delete(String(path));
    },
    on: (type, handler, listenerOptions) => {
      record('extend', 'on', [type]);
      window.addEventListener(type, handler, listenerOptions);
      return trackExtend(() => window.removeEventListener(type, handler));
    },
    navigate: (routeId) => {
      const target = String(routeId || '');
      record('extend', 'navigate', [target]);
      ensureSurface(target);
      for (const surface of document.querySelectorAll('.page-surface[data-route-id]')) {
        surface.hidden = surface.getAttribute('data-route-id') !== target;
      }
      window.dispatchEvent(new window.CustomEvent(`app:navigate:${target}`, { detail: target }));
      syncReplacements();
    },
    currentRoute: () => document.querySelector('.page-surface[data-route-id]:not([hidden])')?.getAttribute('data-route-id') || null,
    replaceRoute: (routeId, replaceOptions = {}) => {
      const target = String(routeId || '');
      record('extend', 'replaceRoute', [target]);
      const page = document.createElement('section');
      page.className = 'echo-external-mod-page';
      page.hidden = true;
      page.setAttribute('data-echo-external-replace', target);
      appShell().append(page);
      routeReplacements.set(target, { page, options: replaceOptions, mounted: false, cleanup: null });
      syncReplacements();
      return trackExtend(() => extend.restoreRoute(target));
    },
    restoreRoute: (routeId) => {
      record('extend', 'restoreRoute', [routeId]);
      const entry = routeReplacements.get(String(routeId));
      if (!entry) return;
      try { entry.cleanup?.(); } catch {}
      entry.page.remove();
      routeReplacements.delete(String(routeId));
      const native = document.querySelector(`.page-surface[data-route-id="${routeId}"]`);
      if (native) { native.removeAttribute('data-echo-external-replaced'); native.style.display = ''; }
    },
    // Mirrors the loader behavior of patching the sidebarHiddenRouteIds app
    // setting; only routes hidden by this runtime are ever restored.
    hideNav: (routeId) => {
      const target = String(routeId || '');
      record('extend', 'hideNav', [target]);
      hiddenNav.add(target);
      const list = new Set(appSettings.sidebarHiddenRouteIds || []);
      list.add(target);
      appSettings.sidebarHiddenRouteIds = [...list];
      return trackExtend(() => extend.showNav(target));
    },
    showNav: (routeId) => {
      const target = String(routeId || '');
      record('extend', 'showNav', [target]);
      if (!hiddenNav.delete(target)) return;
      appSettings.sidebarHiddenRouteIds = (appSettings.sidebarHiddenRouteIds || []).filter((entry) => entry !== target);
    },
    hide: (selector) => {
      record('extend', 'hide', [selector]);
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) { node.setAttribute('data-echo-external-hidden', 'true'); node.style.display = 'none'; }
      return trackExtend(() => extend.show(selector));
    },
    show: (selector) => {
      record('extend', 'show', [selector]);
      for (const node of document.querySelectorAll(selector)) {
        if (!node.hasAttribute('data-echo-external-hidden')) continue;
        node.removeAttribute('data-echo-external-hidden');
        node.style.display = '';
      }
    },
    observe: (selector, callback) => {
      record('extend', 'observe', [selector]);
      const seen = new Set();
      const emit = (node) => { if (!seen.has(node)) { seen.add(node); callback(node); } };
      for (const node of document.querySelectorAll(selector)) emit(node);
      const observer = new window.MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const added of mutation.addedNodes || []) {
            if (added.nodeType !== 1) continue;
            if (added.matches?.(selector)) emit(added);
            for (const nested of added.querySelectorAll?.(selector) || []) emit(nested);
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      return trackExtend(() => observer.disconnect());
    },
  };
  window.__echoExternalExtend = extend;

  // --- player (scripted model mirroring EchoExternalPlayer) ---
  const playerStatus = () => ({ ok: true, ...clone(playerModel) });
  const playerAction = (method, mutate) => (...args) => {
    record('player', method, args);
    mutate?.(...args);
    return Promise.resolve(playerStatus());
  };
  const player = {
    version: 1,
    mode: 'harness',
    queue: () => ({ tracks: clone(playerModel.queue) }),
    playback: () => undefined,
    status: playerAction('status'),
    play: playerAction('play', () => { playerModel.state = 'playing'; }),
    pause: playerAction('pause', () => { playerModel.state = 'paused'; }),
    stop: playerAction('stop', () => { playerModel.state = 'stopped'; playerModel.positionSeconds = 0; }),
    seek: playerAction('seek', (seconds) => { playerModel.positionSeconds = Number(seconds) || 0; }),
    next: playerAction('next'),
    previous: playerAction('previous'),
    playTrack: playerAction('playTrack', (track) => { playerModel.currentTrack = clone(track) || null; playerModel.state = 'playing'; }),
    playMedia: playerAction('playMedia', (item) => { playerModel.currentTrack = clone(item) || null; playerModel.state = 'playing'; }),
    playLocal: playerAction('playLocal'),
    prepare: playerAction('prepare'),
    append: (track) => { record('player', 'append', [track]); playerModel.queue.push(clone(track)); return playerStatus(); },
    replaceQueue: (tracks) => { record('player', 'replaceQueue', [tracks]); playerModel.queue = clone(tracks) || []; return playerStatus(); },
    clearQueue: () => { record('player', 'clearQueue', []); playerModel.queue = []; return playerStatus(); },
    setRepeat: playerAction('setRepeat', (mode) => { playerModel.repeat = String(mode); }),
    command: (payload) => { record('player', 'command', [payload]); return Promise.resolve(playerStatus()); },
  };
  window.__echoExternalPlayer = player;

  // --- sidebar registry (harness mounts pages on demand) ---
  const sidebarEntries = [];
  const sidebar = {
    register: (pageOptions = {}) => {
      const pageId = String(pageOptions.id || `page-${sidebarEntries.length + 1}`);
      record('sidebar', 'register', [pageId, pageOptions.label]);
      const entry = { pageId, options: pageOptions, open: null };
      sidebarEntries.push(entry);
      const dispose = () => {
        const index = sidebarEntries.indexOf(entry);
        if (index >= 0) sidebarEntries.splice(index, 1);
        entry.open?.close();
      };
      sidebarDisposers.push(dispose);
      return () => {
        const index = sidebarDisposers.indexOf(dispose);
        if (index >= 0) sidebarDisposers.splice(index, 1);
        dispose();
      };
    },
  };

  // --- sdk (publicEchoPath mirror over the recorded echo proxy) ---
  const publicEchoPath = (path) => {
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length || parts.some((part) => !SDK_PATH_SEGMENT.test(part) || SDK_BLOCKED_SEGMENTS.has(part))) throw new Error('echo_sdk_path_invalid');
    let owner = echo;
    let value = echo;
    for (const part of parts) { owner = value; value = value?.[part]; }
    return { owner, value };
  };
  const sdk = {
    version: 1,
    mode: 'harness',
    getEcho: () => echo,
    list: (path = '') => {
      record('sdk', 'list', [path]);
      const value = path ? publicEchoPath(path).value : rawEcho;
      return value && (typeof value === 'object' || typeof value === 'function') ? Object.keys(value).sort() : [];
    },
    get: (path) => { record('sdk', 'get', [path]); return publicEchoPath(path).value; },
    call: (path, ...args) => {
      record('sdk', 'call', [path, ...args]);
      const target = publicEchoPath(path);
      if (typeof target.value !== 'function') throw new Error('echo_sdk_method_not_found');
      return target.value.apply(target.owner, args);
    },
    status: async () => ({ ok: true, harness: true, loaderVersion: 'testing-harness', mode: 'harness' }),
  };

  // --- settings / loaderSettings ---
  const storageKey = settingsStorageKey(id);
  const settings = {
    get: () => { try { return JSON.parse(window.localStorage.getItem(storageKey) || '{}'); } catch { return {}; } },
    set: (patch) => {
      const next = { ...settings.get(), ...patch };
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    },
  };
  const uiSettings = { ...DEFAULT_UI_SETTINGS, ...(options.uiSettings || {}) };
  const loaderSettings = {
    get: async () => { record('loaderSettings', 'get', []); return { ...uiSettings }; },
    set: async (patch) => {
      record('loaderSettings', 'set', [patch]);
      Object.assign(uiSettings, patch || {});
      window.dispatchEvent(new window.CustomEvent('shinawase:ui-settings', { detail: { ...uiSettings } }));
      return { ...uiSettings };
    },
    onChange: (handler) => {
      record('loaderSettings', 'onChange', []);
      if (typeof handler !== 'function') return () => {};
      const listener = (event) => { try { handler(event.detail); } catch {} };
      window.addEventListener('shinawase:ui-settings', listener);
      return trackExtend(() => window.removeEventListener('shinawase:ui-settings', listener));
    },
  };

  // --- assets / HTTP-ish helpers ---
  const readPackageFile = (filePath) => {
    if (!packageDir) throw new Error('mod_asset_missing: harness has no packageDir');
    return readFileSync(join(packageDir, safeRelative(filePath)));
  };
  const assetUrl = (filePath) => `harness-asset://${encodeURIComponent(id)}/${String(filePath || '').replaceAll('\\', '/')}`;
  const loadAsset = async (filePath, assetOptions = {}) => {
    record('assets', 'loadAsset', [filePath]);
    const data = readPackageFile(filePath);
    return assetOptions.binary === true ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data.toString('utf8');
  };
  window.fetch = async (url, fetchOptions = {}) => {
    const target = String(url);
    if (target.startsWith('harness-asset://')) {
      try {
        const path = decodeURIComponent(target.slice(`harness-asset://${encodeURIComponent(id)}/`.length));
        return textResponse(200, new Uint8Array(readPackageFile(path)), true);
      } catch { return textResponse(404, 'mod_asset_missing'); }
    }
    if (options.fetchHandler) return options.fetchHandler(target, fetchOptions);
    throw new Error(`harness_offline: fetch(${target}) is not routed; pass options.fetchHandler to script network responses`);
  };

  const toastMessages = [];
  const consoleRecords = [];
  const modConsole = Object.fromEntries(['debug', 'info', 'log', 'warn', 'error'].map((level) => [level, (...values) => {
    consoleRecords.push({ level, values });
    record('console', level, values);
    if (options.debug) console[level === 'log' ? 'info' : level]('[harness mod]', id, ...values);
  }]));

  const nativeCall = (method) => async (...args) => {
    record('native', method, args);
    const handler = options.nativeHandlers?.[method];
    if (typeof handler === 'function') return handler(...args);
    if (method === 'status') return { ok: false, enabled: false, error: 'native_host_unavailable' };
    throw new Error('native_host_unavailable');
  };

  const context = {
    id,
    manifest: clone(manifest),
    config,
    baseUrl: 'harness://loader',
    echo,
    player,
    extend,
    sdk,
    settings,
    loaderSettings,
    sidebar,
    assetUrl,
    loadAsset,
    fetchJson: async (url, fetchOptions = {}) => {
      record('http', 'fetchJson', [url]);
      if (options.fetchHandler) {
        const response = await options.fetchHandler(String(url), fetchOptions);
        return typeof response?.json === 'function' ? response.json() : response;
      }
      throw new Error(`harness_offline: fetchJson(${url}) is not routed; pass options.fetchHandler`);
    },
    uploadFile: async (input) => {
      record('http', 'uploadFile', [input]);
      if (options.uploadHandler) return options.uploadHandler(input);
      throw new Error('harness_offline: uploadFile is not routed; pass options.uploadHandler');
    },
    toast: (message) => { toastMessages.push(String(message)); record('ui', 'toast', [message]); },
    log: modConsole.log,
    console: modConsole,
    main: {
      version: 1,
      mode: 'harness',
      invoke: async (method, payload) => {
        record('main', 'invoke', [method, payload]);
        const handler = options.mainHandlers?.[method];
        if (typeof handler === 'function') return handler(payload);
        throw new Error('native_host_unavailable');
      },
    },
    native: {
      version: 1,
      mode: 'harness',
      status: nativeCall('status'),
      modules: nativeCall('modules'),
      moduleInfo: nativeCall('moduleInfo'),
      invoke: nativeCall('invoke'),
      scan: nativeCall('scan'),
      read: nativeCall('read'),
      write: nativeCall('write'),
      protect: nativeCall('protect'),
      readBytes: nativeCall('readBytes'),
      writeBytes: nativeCall('writeBytes'),
      readInt32: nativeCall('readInt32'),
      readUInt32: nativeCall('readUInt32'),
      readFloat: nativeCall('readFloat'),
      readDouble: nativeCall('readDouble'),
      readBigInt64: nativeCall('readBigInt64'),
      readBigUint64: nativeCall('readBigUint64'),
      readPointer: nativeCall('readPointer'),
      readString: nativeCall('readString'),
      writeInt32: nativeCall('writeInt32'),
      writeUInt32: nativeCall('writeUInt32'),
      writeFloat: nativeCall('writeFloat'),
      writeDouble: nativeCall('writeDouble'),
      writeBigInt64: nativeCall('writeBigInt64'),
    },
  };

  return {
    context,
    modConsole,
    records,
    toasts: toastMessages,
    consoleRecords,
    sidebarEntries,
    sidebarDisposers,
    extendDisposers,
    controls: {
      rawEcho,
      appSettings,
      playerModel,
      uiSettings,
      setPlayerState: (patch) => Object.assign(playerModel, patch),
      emitUiSettings: (patch) => loaderSettings.set(patch),
    },
  };
};

// echoConfigUi mock (SDK.md "Custom config UI"). `save` records instead of
// PUTting; ui.form/ui.field build loader-shaped field handles against the
// mock DOM so config-ui.js scripts can be exercised offline.
export const createMockConfigUi = ({ realm, id, manifest, schema, config, packageDir, records = [] }) => {
  const { document } = realm;
  const root = document.createElement('div');
  root.className = 'echo-config-ui-root';
  document.body.append(root);
  const state = { saved: [], closed: false, onSaveHandler: null, toasts: [] };
  const field = (key, spec = {}, value) => {
    const wrapper = document.createElement('label');
    wrapper.setAttribute('data-config-key', String(key));
    const input = document.createElement('input');
    const type = spec.type === 'boolean' ? 'checkbox' : 'text';
    input.setAttribute('type', type);
    input.type = type;
    if (type === 'checkbox') input.checked = value === true || (value === undefined && spec.default === true);
    else input.value = value === undefined || value === null ? String(spec.default ?? '') : String(value);
    wrapper.append(input);
    const read = () => {
      if (type === 'checkbox') return input.checked;
      if (spec.type === 'number' || spec.type === 'integer') return Number(input.value);
      return input.value;
    };
    return { element: wrapper, read };
  };
  const form = (formSchema = schema, formConfig = config) => {
    const element = document.createElement('div');
    element.className = 'echo-config-ui-form';
    const fields = new Map();
    for (const [key, spec] of Object.entries(formSchema?.properties || {})) {
      const handle = field(key, spec, formConfig?.[key]);
      fields.set(key, handle);
      element.append(handle.element);
    }
    return { element, read: () => Object.fromEntries([...fields.entries()].map(([key, handle]) => [key, handle.read()])) };
  };
  const configUi = {
    root,
    modId: id,
    manifest,
    schema: schema ?? null,
    config: structuredClone(config ?? {}),
    save: async (next) => {
      state.saved.push(structuredClone(next));
      records.push({ api: 'configUi', method: 'save', args: [next] });
      return structuredClone(next);
    },
    close: () => { state.closed = true; records.push({ api: 'configUi', method: 'close', args: [] }); },
    toast: (message, type) => { state.toasts.push({ message: String(message), type: type || 'info' }); },
    onSave: (handler) => { state.onSaveHandler = handler; },
    assetUrl: (path) => `harness-asset://${encodeURIComponent(id)}/${String(path || '').replaceAll('\\', '/')}`,
    loadAsset: async (path, assetOptions = {}) => {
      if (!packageDir) throw new Error('mod_asset_missing: harness has no packageDir');
      const data = readFileSync(join(packageDir, safeRelative(path)));
      return assetOptions.binary === true ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data.toString('utf8');
    },
    defaults: () => Object.fromEntries(Object.entries(schema?.properties || {})
      .filter(([, spec]) => spec && Object.hasOwn(spec, 'default'))
      .map(([key, spec]) => [key, spec.default])),
    loaderSettings: () => ({ ...DEFAULT_UI_SETTINGS }),
    ui: { form, field },
  };
  return { configUi, state, root };
};
