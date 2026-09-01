'use strict';

// In-process native host for echo-steam (Electron 43.3.0 / Chromium 150,
// Node >=22.23.2 <23). Build echo-native-host.node with
// scripts/build-native-host.ps1 so the addon matches that Electron ABI.
// ECHO.exe FileVersion is the app stamp, not an Electron target.

const { createServer } = require('node:http');
const { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, lstatSync } = require('node:fs');
const { dirname, extname, join, normalize, relative, resolve } = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const hostRequire = createRequire(__filename);
const loaderRoot = resolve(process.env.ECHO_MOD_HOME || dirname(__filename));
const gameRoot = resolve(process.env.ECHO_GAME_ROOT || process.env.ECHO_MOD_ROOT || join(loaderRoot, '..'));
const modsRoot = resolve(process.env.ECHO_MODS_HOME || join(gameRoot, 'Mods'));
const pluginsRoot = resolve(process.env.ECHO_PLUGINS_HOME || join(gameRoot, 'Plugins'));
const logsRoot = resolve(process.env.ECHO_LOGS_HOME || join(loaderRoot, 'Logs'));
const statePath = join(loaderRoot, 'loader-state.json');
const configPath = join(loaderRoot, 'loader.config.json');
const statusPath = join(loaderRoot, 'native-host.json');
const logFile = join(logsRoot, 'loader.log');
const errorFile = join(logsRoot, 'errors.log');

const readJson = (file, fallback) => {
  try { return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/u, '')); } catch { return fallback; }
};
const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
let logsDirReady = false;
const log = (level, message, extra) => {
  const line = `[${new Date().toISOString()}] [NATIVE:${level}] ${message}${extra ? ` ${extra}` : ''}`;
  try {
    if (!logsDirReady) {
      mkdirSync(logsRoot, { recursive: true });
      logsDirReady = true;
    }
    appendFileSync(logFile, `${line}\n`, 'utf8');
    if (level === 'ERROR') appendFileSync(errorFile, `${line}\n`, 'utf8');
  } catch { logsDirReady = false; }
  try { console.log(line); } catch {}
};
const safeId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{1,63}$/iu.test(id);
const safeRelative = (value) => {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('invalid_native_file');
  const clean = normalize(value).replaceAll('\\', '/');
  if (clean === '.' || clean.startsWith('../') || clean === '..' || clean.startsWith('/') || /^[a-z]:/iu.test(clean)) throw new Error('invalid_native_file');
  return clean;
};
const inside = (root, target) => {
  const base = resolve(root);
  const full = resolve(target);
  const rel = relative(base, full);
  return rel && !rel.startsWith('..') && !rel.startsWith('/') && !/^[a-z]:/iu.test(rel);
};

const config = readJson(configPath, {});
const nativeEnabled = config.nativeHost !== false && !process.argv.includes('--no-native-host') && !process.argv.includes('--safe-mode');
const memoryApiEnabled = config.nativeMemoryApi !== false;
const nativePort = Number(process.env.ECHO_NATIVE_PORT || config.nativePort || 17863);

const packages = new Map();
const overlays = new Map();
let electron = null;
let ipcMain = null;
let BrowserWindow = null;
let session = null;
let server = null;
let addon = null;
let koffi = null;
let started = false;
const originalFs = {};

const loadElectron = () => {
  try { electron = hostRequire('electron'); } catch { electron = null; }
  ipcMain = electron?.ipcMain || null;
  BrowserWindow = electron?.BrowserWindow || null;
  session = electron?.session || null;
};

const tryLoadAddon = () => {
  const candidates = [
    join(loaderRoot, 'echo-native-host.node'),
    join(loaderRoot, 'native', 'build', 'Release', 'echo-native-host.node'),
    join(loaderRoot, 'native', 'build', 'Debug', 'echo-native-host.node'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const loaded = { exports: {} };
      process.dlopen(loaded, file);
      addon = loaded.exports;
      log('INFO', `loaded native host addon ${file}`);
      return addon;
    } catch (error) {
      log('WARN', `native host addon failed ${file}`, error instanceof Error ? error.message : String(error));
    }
  }
  try {
    koffi = hostRequire('koffi');
    log('INFO', 'using koffi for host-dll loading');
  } catch {
    koffi = null;
  }
  return null;
};

const listInstalled = () => {
  const state = readJson(statePath, { mods: {} });
  const result = [];
  for (const [id, entry] of Object.entries(state.mods || {})) {
    if (!safeId(id) || entry?.enabled !== true) continue;
    const kind = entry.kind === 'plugin' ? 'plugin' : 'mod';
    const directory = kind === 'plugin' ? join(pluginsRoot, 'installed', id) : join(modsRoot, 'installed', id);
    const manifestName = ['echo.plugin.json', 'echo.mod.json', 'echo.workshop.json', 'manifest.json'].find((name) => existsSync(join(directory, name)));
    if (!manifestName) continue;
    let manifest = readJson(join(directory, manifestName), null);
    if (manifestName === 'echo.workshop.json' && manifest?.content?.kind === 'native-shell') {
      const entry = readJson(join(directory, String(manifest.content.entry || 'native-shell.json')), {});
      manifest = {
        id: manifest.id,
        name: manifest.title || manifest.id,
        version: manifest.version,
        description: entry.description || '',
        entry: entry.renderer || 'mod.js',
        nativeShell: manifest.content.entry || 'native-shell.json',
        config: entry.config || 'config.json',
        configSchema: entry.configSchema,
        configUi: entry.configUi,
        icon: entry.icon,
        content: manifest.content,
      };
    }
    if (!manifest) continue;
    result.push({ id, kind, directory, manifest, config: readJson(join(directory, safeRelative(manifest.config || 'config.json')), {}) });
  }
  return result;
};

const packageFile = (record, relativePath) => {
  const target = resolve(record.directory, safeRelative(relativePath));
  if (!inside(record.directory, target) || !existsSync(target) || lstatSync(target).isSymbolicLink()) throw new Error('native_file_missing');
  return target;
};

// resolveOverlay sits on the hooked fs.* fast path for the whole main process,
// so the match variants are precomputed per overlay and the incoming path is
// normalized exactly once per call.
const applyOverlay = (virtualPath, realPath) => {
  const clean = normalize(virtualPath).replaceAll('\\', '/');
  overlays.set(clean, { realPath, suffix: clean, asarPath: `/app.asar/${clean}` });
};

const resolveOverlay = (input) => {
  if (!input || overlays.size === 0) return null;
  const text = String(input).replaceAll('\\', '/');
  for (const entry of overlays.values()) {
    if (text.endsWith(entry.suffix) || text.includes(entry.asarPath)) return entry.realPath;
  }
  return null;
};

const installFsOverlay = () => {
  const fs = hostRequire('node:fs');
  if (originalFs.readFileSync) return;
  for (const name of ['readFileSync', 'readFile', 'existsSync', 'statSync', 'lstatSync', 'createReadStream']) {
    originalFs[name] = fs[name].bind(fs);
  }
  fs.readFileSync = (file, ...args) => {
    const overlay = resolveOverlay(file);
    return originalFs.readFileSync(overlay || file, ...args);
  };
  fs.readFile = (file, ...args) => {
    const overlay = resolveOverlay(file);
    return originalFs.readFile(overlay || file, ...args);
  };
  fs.existsSync = (file) => originalFs.existsSync(resolveOverlay(file) || file);
  fs.statSync = (file, ...args) => originalFs.statSync(resolveOverlay(file) || file, ...args);
  fs.lstatSync = (file, ...args) => originalFs.lstatSync(resolveOverlay(file) || file, ...args);
  fs.createReadStream = (file, ...args) => originalFs.createReadStream(resolveOverlay(file) || file, ...args);
};

const hookIpc = (channel, wrapper) => {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new Error('electron_ipc_unavailable');
  if (typeof wrapper !== 'function') throw new Error('native_ipc_hook_invalid');
  const name = String(channel || '');
  if (!name) throw new Error('native_ipc_channel_invalid');
  let original = null;
  try { ipcMain.removeHandler(name); } catch {}
  ipcMain.handle(name, async (event, ...args) => {
    if (typeof original === 'function') return wrapper(original.bind(null, event), event, ...args);
    return wrapper(async () => { throw new Error(`ipc_original_missing:${name}`); }, event, ...args);
  });
  return () => {
    try { ipcMain.removeHandler(name); } catch {}
  };
};

const createPackageHost = (record) => {
  const invokeHandlers = new Map();
  const disposers = [];
  const host = {
    version: 1,
    mode: 'in-process-asar-bridge',
    id: record.id,
    kind: record.kind,
    manifest: record.manifest,
    config: record.config,
    directory: record.directory,
    echoRoot: gameRoot,
    loaderRoot,
    electron,
    app: electron?.app || globalThis.app,
    ipcMain,
    BrowserWindow,
    session,
    log: (level, message) => log(String(level || 'INFO').toUpperCase(), `[${record.id}] ${message}`),
    ipc: {
      handle(channel, listener) {
        if (!ipcMain) throw new Error('electron_ipc_unavailable');
        ipcMain.handle(channel, listener);
        disposers.push(() => { try { ipcMain.removeHandler(channel); } catch {} });
      },
      on(channel, listener) {
        if (!ipcMain) throw new Error('electron_ipc_unavailable');
        ipcMain.on(channel, listener);
        disposers.push(() => ipcMain.off(channel, listener));
      },
      removeHandler(channel) { ipcMain?.removeHandler?.(channel); },
    },
    hookIpc,
    overlay: {
      file(virtualPath, sourcePath) {
        applyOverlay(virtualPath, packageFile(record, sourcePath));
        installFsOverlay();
      },
    },
    handle(method, listener) {
      invokeHandlers.set(String(method || ''), listener);
      return () => invokeHandlers.delete(String(method || ''));
    },
    async invoke(method, payload) {
      const listener = invokeHandlers.get(String(method || ''));
      if (!listener) throw new Error(`native_main_method_missing:${method}`);
      return listener(payload);
    },
    broadcast(name, payload) {
      const windows = BrowserWindow?.getAllWindows?.() || [];
      if (!windows.length) return;
      const detail = { id: record.id, name, payload };
      const script = `window.dispatchEvent(new CustomEvent('echo-native', { detail: ${JSON.stringify(detail)} }))`;
      for (const window of windows) {
        window.webContents?.send?.('shinawase:native-event', detail);
        window.webContents?.executeJavaScript?.(script).catch(() => undefined);
      }
    },
    dispose() {
      while (disposers.length) {
        try { disposers.pop()?.(); } catch {}
      }
      invokeHandlers.clear();
    },
  };
  return host;
};

const loadNodeAddon = (record, entry) => {
  const file = packageFile(record, entry);
  if (extname(file).toLowerCase() !== '.node') throw new Error('native_addon_not_node');
  const loaded = { exports: {} };
  process.dlopen(loaded, file);
  return loaded.exports;
};

const loadHostDll = (record, spec) => {
  const file = packageFile(record, spec.entry);
  const info = {
    package_id: record.id,
    package_dir: record.directory,
    config_json: JSON.stringify(record.config || {}),
    echo_root: gameRoot,
    memory_api: memoryApiEnabled && record.manifest?.native?.memory === true ? 1 : 0,
  };
  if (addon?.load) return addon.load(file, info);
  if (koffi) {
    const lib = koffi.load(file);
    const init = lib.func(spec.export || 'EchoNative_Init', 'int', ['void *', 'void *']);
    const result = init(null, null);
    if (result !== 0) throw new Error(`EchoNative_Init failed: ${result}`);
    return { lib, invoke: spec.invoke ? lib.func(spec.invoke, 'int', ['str', 'str', 'void *']) : null };
  }
  throw new Error('native_host_addon_missing');
};

const readNativeShellSpec = (record) => {
  const declared = record.manifest.nativeShell
    || (record.manifest.content?.kind === 'native-shell' ? (record.manifest.content.entry || 'native-shell.json') : '');
  if (!declared) return null;
  try { return readJson(packageFile(record, declared), null); }
  catch { return { exe: '', protocolVersion: 1 }; }
};

const activatePackage = async (record) => {
  await deactivatePackage(record.id);
  const native = record.manifest.native && typeof record.manifest.native === 'object' ? record.manifest.native : {};
  const shellSpec = readNativeShellSpec(record);
  const mainEntry = shellSpec ? '' : (record.manifest.main || native.main);
  const modules = Array.isArray(native.modules) ? native.modules : (native.entry ? [{ kind: native.kind || 'host-dll', entry: native.entry, export: native.export, invoke: native.invoke }] : []);
  if (!shellSpec && !mainEntry && !modules.length) return null;
  const host = createPackageHost(record);
  const loaded = { host, dlls: [], addons: [], dispose: null };
  if (shellSpec) {
    const shellHost = join(loaderRoot, 'native-shell-host.cjs');
    delete hostRequire.cache[shellHost];
    const activate = hostRequire(shellHost);
    loaded.dispose = await activate(host, shellSpec);
  } else if (mainEntry) {
    const file = packageFile(record, mainEntry);
    const imported = extname(file).toLowerCase() === '.mjs'
      ? await import(`${pathToFileURL(file).href}?t=${Date.now()}`)
      : (delete hostRequire.cache[file], hostRequire(file));
    const activate = imported.activate || imported.default || imported;
    if (typeof activate === 'function') loaded.dispose = await activate(host);
  }
  for (const spec of modules) {
    const kind = String(spec.kind || 'host-dll').toLowerCase();
    if (kind === 'node-addon') loaded.addons.push({ spec, exports: loadNodeAddon(record, spec.entry) });
    else if (kind === 'host-dll') loaded.dlls.push({ spec, handle: loadHostDll(record, spec) });
    else throw new Error(`native_kind_unsupported:${kind}`);
  }
  packages.set(record.id, { record, ...loaded });
  log('INFO', `activated native package ${record.id} main=${Boolean(mainEntry)} modules=${modules.length}`);
  return packages.get(record.id);
};

const deactivatePackage = async (id) => {
  const entry = packages.get(id);
  if (!entry) return;
  try { if (typeof entry.dispose === 'function') await entry.dispose(); } catch (error) { log('WARN', `dispose ${id} failed`, error instanceof Error ? error.message : String(error)); }
  try { entry.host.dispose(); } catch {}
  for (const item of entry.dlls) {
    try { addon?.unload?.(item.handle); } catch {}
    try { item.handle?.lib?.unload?.(); } catch {}
  }
  packages.delete(id);
};

const reloadPackagesUnsafe = async () => {
  for (const id of [...packages.keys()]) await deactivatePackage(id);
  overlays.clear();
  if (!nativeEnabled) return { enabled: false, packages: [] };
  const errors = [];
  for (const record of listInstalled()) {
    try { await activatePackage(record); } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ id: record.id, error: message });
      log('ERROR', `activate ${record.id} failed`, message);
    }
  }
  return {
    enabled: true,
    mode: 'in-process-asar-bridge',
    memoryApi: memoryApiEnabled,
    addon: Boolean(addon),
    koffi: Boolean(koffi),
    packages: [...packages.keys()],
    errors,
  };
};

let reloadChain = Promise.resolve();
const reloadPackages = () => {
  const run = reloadChain.then(reloadPackagesUnsafe, reloadPackagesUnsafe);
  reloadChain = run.then(() => undefined, () => undefined);
  return run;
};

const nativeModules = () => {
  if (addon?.modules) return addon.modules();
  return [];
};

const callNative = async (body) => {
  const method = String(body?.method || '');
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  const packageId = safeId(body?.packageId) ? body.packageId : (safeId(payload.id) ? payload.id : null);
  if (method === 'status') {
    return {
      ok: true,
      enabled: nativeEnabled,
      port: nativePort,
      memoryApi: memoryApiEnabled,
      addon: Boolean(addon),
      koffi: Boolean(koffi),
      packages: [...packages.entries()].map(([id, entry]) => ({
        id,
        kind: entry.record.kind,
        main: Boolean(entry.record.manifest.main || entry.record.manifest.native?.main),
        modules: (entry.record.manifest.native?.modules || []).length,
        memory: entry.record.manifest.native?.memory === true,
      })),
      modules: nativeModules(),
    };
  }
  if (method === 'reload') return { ok: true, ...(await reloadPackages()) };
  if (method === 'modules') return { ok: true, modules: nativeModules() };
  if (method === 'invoke' || method === 'main.invoke') {
    if (!packageId) throw new Error('native_package_required');
    const entry = packages.get(packageId);
    if (!entry) throw new Error('native_package_inactive');
    if (method === 'main.invoke' || !entry.dlls.length) return { ok: true, result: await entry.host.invoke(payload.method, payload.payload) };
    if (addon?.invoke) return { ok: true, result: addon.invoke(entry.dlls[0].handle, String(payload.method || ''), JSON.stringify(payload.payload || {})) };
    throw new Error('native_invoke_unavailable');
  }
  const allowMemory = memoryApiEnabled && (!packageId || packages.get(packageId)?.record.manifest.native?.memory === true);
  if ((method === 'read' || method === 'write' || method === 'protect' || method === 'scan') && !allowMemory) throw new Error('native_memory_disabled');
  if (method === 'read') {
    if (!addon?.read) throw new Error('native_host_addon_missing');
    const buffer = addon.read(String(payload.module || ''), Number(payload.offset || 0), Number(payload.size || 0));
    return { ok: true, data: Buffer.from(buffer).toString('base64'), size: buffer.length };
  }
  if (method === 'write') {
    if (!addon?.write) throw new Error('native_host_addon_missing');
    const bytes = Buffer.from(String(payload.data || ''), 'base64');
    return { ok: true, written: addon.write(String(payload.module || ''), Number(payload.offset || 0), bytes) };
  }
  if (method === 'protect') {
    if (!addon?.protect) throw new Error('native_host_addon_missing');
    return { ok: true, ...addon.protect(String(payload.module || ''), Number(payload.offset || 0), Number(payload.size || 0), Number(payload.prot || 1)) };
  }
  if (method === 'scan') {
    if (!addon?.scan) throw new Error('native_host_addon_missing');
    const matches = addon.scan(String(payload.module || ''), String(payload.pattern || ''), Number(payload.limit || 0));
    return { ok: true, matches };
  }
  throw new Error(`native_method_unknown:${method}`);
};

const jsonResponse = (response, status, value) => {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
  response.end(body);
};

const startServer = () => {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://127.0.0.1:${nativePort}`);
      if (request.method === 'OPTIONS') return jsonResponse(response, 204, {});
      if (request.method === 'GET' && url.pathname === '/status') return jsonResponse(response, 200, await callNative({ method: 'status' }));
      if (request.method === 'POST' && (url.pathname === '/call' || url.pathname === '/reload')) {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') : {};
        if (url.pathname === '/reload') return jsonResponse(response, 200, await callNative({ method: 'reload' }));
        return jsonResponse(response, 200, await callNative(body));
      }
      jsonResponse(response, 404, { error: 'not_found' });
    } catch (error) {
      jsonResponse(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  server.listen(nativePort, '127.0.0.1', () => {
    writeJson(statusPath, { ok: true, port: nativePort, pid: process.pid, startedAt: new Date().toISOString(), mode: 'in-process-asar-bridge' });
    log('INFO', `native host listening on 127.0.0.1:${nativePort}`);
  });
};

const registerIpc = () => {
  if (!ipcMain) return;
  try { ipcMain.removeHandler('shinawase:native'); } catch {}
  ipcMain.handle('shinawase:native', async (_event, body) => callNative(body || {}));
};

const startShinawaseNativeHost = async () => {
  if (started) return { ok: true, already: true };
  started = true;
  mkdirSync(logsRoot, { recursive: true });
  loadElectron();
  try {
    const { installAuxiliaryRemap } = hostRequire(join(__dirname, 'auxiliary-remap.cjs'));
    installAuxiliaryRemap({
      app: electron?.app,
      BrowserWindow,
      session,
      log: (message) => log('INFO', message),
    });
  } catch (error) {
    log('WARN', 'auxiliary remap failed', error instanceof Error ? error.message : String(error));
  }
  try {
    const { installStreamingPlaybackShim } = hostRequire(join(__dirname, 'playback-shim.cjs'));
    installStreamingPlaybackShim({ electron, ipcMain, log: (message) => log('INFO', message) });
  } catch (error) {
    log('WARN', 'playback shim failed', error instanceof Error ? error.message : String(error));
  }
  tryLoadAddon();
  registerIpc();
  startServer();
  const status = await reloadPackages();
  log('INFO', `native host ready packages=${status.packages?.length || 0} addon=${Boolean(addon)}`);
  return { ok: true, ...status, port: nativePort };
};

module.exports = { startShinawaseNativeHost, callNative };
exports.startShinawaseNativeHost = startShinawaseNativeHost;
