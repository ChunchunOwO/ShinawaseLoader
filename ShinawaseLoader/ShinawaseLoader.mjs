#!/usr/bin/env node
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, lstatSync, writeFileSync, rmSync, copyFileSync, renameSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { isZip, readZip } from './echomod-archive.mjs';
import { copy as i18nCopy, normalizeLocale } from './i18n.mjs';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  bCyan: '\x1b[96m',
  green: '\x1b[32m',
  bGreen: '\x1b[92m',
  yellow: '\x1b[33m',
  bYellow: '\x1b[93m',
  red: '\x1b[31m',
  bRed: '\x1b[91m',
  magenta: '\x1b[35m',
  bMagenta: '\x1b[95m',
  white: '\x1b[97m',
  gray: '\x1b[90m',
};
const printLogo = () => {
  console.log(`${c.white}${c.bold}Shinawase${c.reset}  ${c.gray}${loaderVersion}${c.reset}`);
  console.log(`${c.gray}──────────${c.reset}`);
};

const loaderDir = dirname(fileURLToPath(import.meta.url));
const loaderVersion = '1.4.0';
const root = resolve(process.env.ECHO_MOD_HOME || loaderDir);
const workspaceRoot = resolve(process.env.ECHO_WORKSPACE_ROOT || join(root, '..'));
const gameRoot = resolve(process.env.ECHO_GAME_ROOT || join(root, '..'));
const modsRoot = resolve(process.env.ECHO_MODS_HOME || join(gameRoot, 'Mods'));
const pluginsRoot = resolve(process.env.ECHO_PLUGINS_HOME || join(gameRoot, 'Plugins'));
const logsRoot = resolve(process.env.ECHO_LOGS_HOME || join(root, 'Logs'));
const statePath = join(root, 'loader-state.json');
const loaderConfigPath = join(root, 'loader.config.json');
const installedRoot = join(modsRoot, 'installed');
const installedPluginsRoot = join(pluginsRoot, 'installed');
const dropRoot = modsRoot;
const processedRoot = join(modsRoot, '.processed');
const processedPluginsRoot = join(pluginsRoot, '.processed');
const defaultPort = Number(process.env.ECHO_MOD_PORT || 17862);
const defaultDebugPort = Number(process.env.ECHO_MOD_DEBUG_PORT || 9229);
const togetherRelayPort = Number(process.env.ECHO_TOGETHER_RELAY_PORT || 47891);
const togetherModId = 'echo.listen-together';
const packageTypes = new Set(['echo-external-mod', 'echo-plugin-package', 'echo-next-plugin-package']);
const packageExtensions = new Set(['.echomod', '.echo']);
const maxPackageBytes = 128 * 1024 * 1024;
const logFilePath = join(logsRoot, 'loader.log');
const errorLogPath = join(logsRoot, 'errors.log');
const logRanks = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
let configuredLogLevel = 'INFO';

const readJson = (file, fallback) => {
  try { return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/u, '')); } catch { return fallback; }
};
const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const formatLogValue = (value) => {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
};
const log = (level, message, ...values) => {
  const normalizedLevel = String(level || 'INFO').toUpperCase();
  const severity = normalizedLevel.endsWith(':ERROR') ? 'ERROR' : normalizedLevel.endsWith(':WARN') ? 'WARN' : normalizedLevel.endsWith(':DEBUG') ? 'DEBUG' : normalizedLevel.endsWith(':INFO') || normalizedLevel.endsWith(':LOG') ? 'INFO' : normalizedLevel;
  if ((logRanks[severity] || logRanks.INFO) < (logRanks[configuredLogLevel] || logRanks.INFO)) return;
  const line = `[${new Date().toISOString()}] [${normalizedLevel}] ${message}${values.length ? ` ${values.map(formatLogValue).join(' ')}` : ''}`;
  try {
    mkdirSync(logsRoot, { recursive: true });
    appendFileSync(logFilePath, `${line}\n`, 'utf8');
    if (severity === 'ERROR') appendFileSync(errorLogPath, `${line}\n`, 'utf8');
  } catch {}
  const method = severity === 'ERROR' ? console.error : severity === 'WARN' ? console.warn : console.log;
  method(line);
};

const loaderConfig = readJson(loaderConfigPath, {
  autoStart: false,
  autoStartMode: 'manual',
  enableWebConsole: false,
  showConsole: false,
  port: 17862,
  debugPort: 9229,
  loadMode: 'external-cdp',
  safeMode: false,
  debugMode: false,
  injectIntervalMs: 5000,
  startupDelayMs: 500,
  logLevel: 'info',
  nativeHost: true,
  nativePort: 17863,
  nativeMemoryApi: true,
});

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'serve';
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const hasFlag = (...names) => names.some((name) => args.includes(name));
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

const loadModeValue = String(option('--load-mode', option('--mode', process.env.ECHO_MOD_LOAD_MODE || loaderConfig.loadMode || 'external-cdp'))).toLowerCase();
const loadMode = new Set(['external-cdp', 'attach-only', 'disabled']).has(loadModeValue) ? loadModeValue : 'external-cdp';
const autoStartModeValue = String(loaderConfig.autoStartMode || (loaderConfig.autoStart === true ? 'app-asar-bridge' : 'manual')).toLowerCase();
const autoStartMode = new Set(['manual', 'app-asar-bridge']).has(autoStartModeValue) ? autoStartModeValue : 'manual';
const autoStart = loaderConfig.autoStart === true && autoStartMode === 'app-asar-bridge';
const safeMode = hasFlag('--safe-mode', '--no-mods') || String(process.env.ECHO_MOD_SAFE_MODE || '').toLowerCase() === 'true' || loaderConfig.safeMode === true;
const debugMode = hasFlag('--debug', '--debug-mode') || String(process.env.ECHO_MOD_DEBUG || '').toLowerCase() === 'true' || loaderConfig.debugMode === true;
const injectIntervalMs = clamp(option('--inject-interval', process.env.ECHO_MOD_INJECT_INTERVAL || loaderConfig.injectIntervalMs), 1000, 60000, 5000);
const startupDelayMs = clamp(option('--startup-delay', process.env.ECHO_MOD_STARTUP_DELAY || loaderConfig.startupDelayMs), 0, 30000, 500);
const requestedLogLevel = String(option('--log-level', process.env.ECHO_MOD_LOG_LEVEL || loaderConfig.logLevel || (debugMode ? 'debug' : 'info'))).toUpperCase();
configuredLogLevel = Object.hasOwn(logRanks, requestedLogLevel) ? requestedLogLevel : (debugMode ? 'DEBUG' : 'INFO');
const enableWebConsole = hasFlag('--web-console') || debugMode || String(process.env.ECHO_ENABLE_WEB_CONSOLE || '').toLowerCase() === 'true' || loaderConfig.enableWebConsole === true;
const port = Number(option('--port', process.env.ECHO_MOD_PORT || loaderConfig.port || defaultPort));
const debugPort = Number(option('--debug-port', process.env.ECHO_MOD_DEBUG_PORT || loaderConfig.debugPort || defaultDebugPort));
const nativeHostEnabled = !safeMode && loaderConfig.nativeHost !== false && !hasFlag('--no-native-host');
const nativeMemoryApi = nativeHostEnabled && loaderConfig.nativeMemoryApi !== false;
const nativePort = Number(option('--native-port', process.env.ECHO_NATIVE_PORT || loaderConfig.nativePort || 17863));
const inspectPort = Number(option('--inspect-port', process.env.ECHO_INSPECT_PORT || loaderConfig.inspectPort || 9230));
const nativeStatusPath = join(root, 'native-host.json');
const echoExe = option('--echo', null);
const userDataRoot = join(process.env.LOCALAPPDATA || process.env.APPDATA || homedir(), 'ShinawaseLoader');
const selectionPath = join(userDataRoot, 'selection.json');
const persistLocale = (value) => {
  const localeValue = normalizeLocale(value) || 'zh';
  const selection = readJson(selectionPath, {});
  writeJson(selectionPath, { ...selection, locale: localeValue });
  writeJson(loaderConfigPath, { ...readJson(loaderConfigPath, loaderConfig), locale: localeValue });
  return localeValue;
};
const detectLocale = () => normalizeLocale(option('--locale', process.env.ECHO_LOADER_LOCALE || loaderConfig.locale || readJson(selectionPath, {}).locale || process.env.LANG));
let locale = detectLocale();
const t = (key) => (i18nCopy[locale || 'zh'] || i18nCopy.zh)[key] || key;
const promptLocale = () => new Promise((resolve) => {
  if (!process.stdin.isTTY) return resolve(persistLocale(process.env.LANG?.toLowerCase().startsWith('zh') ? 'zh' : 'en'));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`${c.white}${c.bold}Shinawase${c.reset}`);
  console.log(`${c.gray}──────────${c.reset}`);
  console.log('  1  中文');
  console.log('  2  English');
  rl.question('> ', (answer) => {
    rl.close();
    const picked = String(answer).trim() === '2' || /^en/i.test(String(answer)) ? 'en' : 'zh';
    resolve(persistLocale(picked));
  });
});
const loaderStats = { startedAt: Date.now(), injects: 0, lastInjectAt: null, lastError: null };

mkdirSync(installedRoot, { recursive: true });
mkdirSync(installedPluginsRoot, { recursive: true });
mkdirSync(dropRoot, { recursive: true });
mkdirSync(processedRoot, { recursive: true });
mkdirSync(pluginsRoot, { recursive: true });
mkdirSync(processedPluginsRoot, { recursive: true });
mkdirSync(logsRoot, { recursive: true });

const readState = () => {
  const state = readJson(statePath, { version: 2, mods: {} });
  return { version: 2, mods: {}, ...state, mods: state?.mods && typeof state.mods === 'object' ? state.mods : {} };
};
const saveState = (state) => writeJson(statePath, state);
const safeId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{1,63}$/iu.test(id);
const safeRelative = (value) => {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('invalid_mod_file');
  const clean = normalize(value).replaceAll('\\', '/');
  if (clean === '.' || clean.startsWith('../') || clean === '..' || clean.startsWith('/') || /^[a-z]:/iu.test(clean)) throw new Error('invalid_mod_file');
  return clean;
};
const packageKind = (type) => type === 'echo-plugin-package' || type === 'echo-next-plugin-package' ? 'plugin' : 'mod';
const installedDirectory = (id, kind = 'mod') => join(kind === 'plugin' ? installedPluginsRoot : installedRoot, id);
const manifestNames = ['echo.mod.json', 'echo.plugin.json', 'manifest.json'];
const findPackage = (id, preferredKind = null) => {
  if (!safeId(id)) return null;
  const kinds = preferredKind === 'plugin' ? ['plugin', 'mod'] : preferredKind === 'mod' ? ['mod', 'plugin'] : ['mod', 'plugin'];
  for (const kind of kinds) {
    const directory = installedDirectory(id, kind);
    for (const manifestName of manifestNames) {
      const path = join(directory, manifestName);
      const manifest = readJson(path, null);
      if (manifest) return { id, kind, directory, manifest, manifestName };
    }
  }
  return null;
};
const readManifest = (id, kind = null) => findPackage(id, kind)?.manifest || null;
const configPath = (id, manifest = null) => {
  const record = findPackage(id);
  if (!record || !manifest) throw new Error('mod_not_installed');
  return join(record.directory, safeRelative(manifest.config || 'config.json'));
};
const readModConfig = (id) => {
  const record = findPackage(id);
  const manifest = record?.manifest;
  if (!manifest) throw new Error('mod_not_installed');
  return readJson(configPath(id, manifest), {});
};
const readModConfigSchema = (id, manifest = readManifest(id)) => {
  if (!manifest?.configSchema) return null;
  if (typeof manifest.configSchema === 'object') return manifest.configSchema;
  if (typeof manifest.configSchema !== 'string') return null;
  const record = findPackage(id);
  return record ? readJson(join(record.directory, safeRelative(manifest.configSchema)), null) : null;
};
const writeModConfig = (id, config) => {
  const record = findPackage(id);
  const manifest = record?.manifest;
  if (!manifest) throw new Error('mod_not_installed');
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('mod_config_object_required');
  writeJson(configPath(id, manifest), config);
};
const iconDataUrl = (id, manifest) => {
  if (!manifest?.icon) return null;
  const record = findPackage(id);
  if (!record) return null;
  const iconPath = join(record.directory, safeRelative(manifest.icon));
  if (!existsSync(iconPath) || extname(iconPath).toLowerCase() !== '.svg') return null;
  return `data:image/svg+xml;base64,${readFileSync(iconPath).toString('base64')}`;
};
const modSummaries = () => {
  const state = readState();
  return Object.keys(state.mods).sort().flatMap((id) => {
    const entry = state.mods[id] || {};
    const record = findPackage(id, entry.kind);
    if (!record) return [];
    const manifest = record.manifest;
    return [{
      id,
      kind: record.kind,
      folder: record.kind === 'plugin' ? 'Plugins' : 'Mods',
      name: manifest.name || id,
      version: manifest.version || '1.0.0',
      description: manifest.description || '',
      iconDataUrl: iconDataUrl(id, manifest),
      configFile: manifest.config || 'config.json',
      configSchema: readModConfigSchema(id, manifest),
      enabled: state.mods[id].enabled === true,
      directory: record.directory,
      main: Boolean(manifest.main || manifest.native?.main),
      native: Boolean(manifest.native || manifest.main),
      nativeMemory: manifest.native?.memory === true,
    }];
  });
};

const mimeTypes = new Map([
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'], ['.cjs', 'text/javascript; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'], ['.htm', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.txt', 'text/plain; charset=utf-8'], ['.md', 'text/markdown; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'], ['.wasm', 'application/wasm'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.dll', 'application/octet-stream'],
  ['.node', 'application/octet-stream'], ['.so', 'application/octet-stream'], ['.dylib', 'application/octet-stream'],
]);
const modFile = (id, fileName) => {
  if (!safeId(id)) throw new Error('invalid_mod_id');
  const record = findPackage(id);
  if (!record) throw new Error('mod_not_installed');
  const base = resolve(record.directory);
  const target = resolve(base, safeRelative(fileName));
  if (relative(base, target).startsWith('..')) throw new Error('invalid_mod_file');
  const metadata = lstatSync(target, { throwIfNoEntry: false });
  if (!metadata?.isFile() || metadata.isSymbolicLink()) throw new Error('mod_file_missing');
  return { target, contentType: mimeTypes.get(extname(target).toLowerCase()) || 'application/octet-stream' };
};

const packageFile = (path, data) => ({ path: safeRelative(path), data: Buffer.isBuffer(data) ? data : Buffer.from(data) });
const packagePayloadFromDirectory = (directory) => {
  const manifestName = ['echo.mod.json', 'echo.plugin.json', 'manifest.json'].find((name) => existsSync(join(directory, name)));
  if (!manifestName) throw new Error('mod_manifest_missing');
  const manifest = readJson(join(directory, manifestName), null);
  if (!manifest) throw new Error('mod_manifest_invalid');
  const files = [];
  const visit = (current, prefix = '') => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const filePath = join(current, entry.name);
      const packagePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(filePath, packagePath);
      else if (entry.isFile() && packagePath !== manifestName) files.push(packageFile(packagePath, readFileSync(filePath)));
    }
  };
  visit(directory);
  return { type: manifestName === 'echo.plugin.json' ? 'echo-plugin-package' : 'echo-external-mod', manifest, manifestFile: manifestName, files };
};
const packagePayloadFromZip = (source) => {
  const entries = readZip(readFileSync(source), { maxBytes: maxPackageBytes });
  const byPath = new Map(entries.map((entry) => [entry.path.replaceAll('\\', '/').toLowerCase(), entry]));
  const manifestEntry = ['echo.mod.json', 'echo.plugin.json', 'manifest.json', 'echo.workshop.json'].map((name) => byPath.get(name)).find(Boolean);
  if (!manifestEntry) throw new Error('mod_manifest_missing');
  let manifest = JSON.parse(manifestEntry.data.toString('utf8'));
  let type = manifestEntry.path.toLowerCase().endsWith('plugin.json') ? 'echo-plugin-package' : 'echo-external-mod';
  if (manifestEntry.path.toLowerCase().endsWith('workshop.json') && manifest.content?.entry) {
    const nested = byPath.get(String(manifest.content.entry).toLowerCase());
    if (nested) {
      const packageValue = JSON.parse(nested.data.toString('utf8'));
      manifest = packageValue.manifest || manifest;
      type = packageValue.type || type;
    }
  }
  return { type, manifest, manifestFile: manifestEntry.path, files: entries.filter((entry) => entry.path !== manifestEntry.path).map((entry) => packageFile(entry.path, entry.data)) };
};
const readPackagePayload = (source) => {
  const resolved = resolve(source);
  if (statSync(resolved).isDirectory()) return packagePayloadFromDirectory(resolved);
  const bytes = readFileSync(resolved);
  if (bytes.length > maxPackageBytes) throw new Error('echomod_too_large');
  if (isZip(bytes)) return packagePayloadFromZip(resolved);
  const payload = JSON.parse(bytes.toString('utf8'));
  return { ...payload, files: (Array.isArray(payload.files) ? payload.files : []).map((file) => packageFile(file.path, file.encoding === 'base64' ? Buffer.from(String(file.content || ''), 'base64') : String(file.content ?? ''))) };
};
const importPackage = (source) => {
  const payload = readPackagePayload(source);
  if (!payload || !packageTypes.has(payload.type) || !payload.manifest || !safeId(payload.manifest.id)) throw new Error('invalid_echomod_package');
  const kind = packageKind(payload.type);
  const manifest = { ...payload.manifest, entry: payload.manifest.entry || payload.manifest.main || (kind === 'plugin' ? 'plugin.js' : 'mod.js') };
  const files = Array.isArray(payload.files) ? payload.files : [];
  const target = installedDirectory(manifest.id, kind);
  const seenPaths = new Set();
  const validatedFiles = files.map((file) => {
    const path = safeRelative(file?.path);
    const pathKey = process.platform === 'win32' ? path.toLowerCase() : path;
    if (seenPaths.has(pathKey)) throw new Error('duplicate_mod_file');
    seenPaths.add(pathKey);
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.content ?? ''));
    if (data.length > maxPackageBytes) throw new Error('mod_file_too_large');
    const targetFile = join(target, path);
    if (relative(target, targetFile).startsWith('..')) throw new Error('invalid_mod_file');
    return { path, data };
  });
  const entryPath = safeRelative(manifest.entry);
  const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
  if (!validatedFiles.some((file) => samePath(file.path, entryPath))) throw new Error('mod_entry_missing');
  rmSync(installedDirectory(manifest.id, 'mod'), { recursive: true, force: true });
  rmSync(installedDirectory(manifest.id, 'plugin'), { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  writeJson(join(target, kind === 'plugin' ? 'echo.plugin.json' : 'echo.mod.json'), manifest);
  for (const file of validatedFiles) {
    const path = file.path;
    const targetFile = join(target, path);
    mkdirSync(dirname(targetFile), { recursive: true });
    writeFileSync(targetFile, file.data);
  }
  const state = readState();
  const previous = state.mods[manifest.id] || {};
  state.mods[manifest.id] = { ...previous, kind, enabled: previous.enabled === true, importedAt: new Date().toISOString() };
  saveState(state);
  if (manifest.id === togetherModId) void syncTogetherRelay();
  void notifyNativeHost('install');
  log('INFO', `installed ${kind} ${manifest.id} v${manifest.version || '1.0.0'}`);
  return manifest;
};

const removeMod = (id) => {
  if (!safeId(id)) throw new Error('invalid_mod_id');
  const state = readState();
  rmSync(installedDirectory(id, 'mod'), { recursive: true, force: true });
  rmSync(installedDirectory(id, 'plugin'), { recursive: true, force: true });
  delete state.mods[id];
  saveState(state);
  if (id === togetherModId) void syncTogetherRelay();
  void notifyNativeHost('uninstall');
  log('INFO', `uninstalled package ${id}`);
};
const setEnabled = (id, enabled) => {
  if (!safeId(id) || !findPackage(id)) throw new Error('mod_not_installed');
  const state = readState();
  const record = findPackage(id);
  state.mods[id] = { ...(state.mods[id] || {}), kind: record?.kind || 'mod', enabled };
  saveState(state);
  if (id === togetherModId) void syncTogetherRelay();
  void notifyNativeHost(enabled ? 'enable' : 'disable');
  log('INFO', `${enabled ? 'enabled' : 'disabled'} mod ${id}`);
};

const nativeHostUrl = () => {
  const status = readJson(nativeStatusPath, null);
  return `http://127.0.0.1:${Number(status?.port || nativePort)}`;
};
const callNativeHost = async (body) => {
  const remote = await fetch(`${nativeHostUrl()}/call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return remoteJson(remote);
};
const notifyNativeHost = async (reason = 'reload') => {
  if (!nativeHostEnabled) return null;
  try {
    const remote = await fetch(`${nativeHostUrl()}/reload`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    return remoteJson(remote);
  } catch (error) {
    log('DEBUG', `native host reload skipped (${reason})`, error instanceof Error ? error.message : String(error));
    return null;
  }
};

const dropLocations = [
  { kind: 'mod', root: modsRoot, processedRoot },
  { kind: 'plugin', root: pluginsRoot, processedRoot: processedPluginsRoot },
];
const dropWatchers = [];
const dropTimers = [];
const pendingDrops = new Set();
const waitForStableFile = async (source) => {
  let previous = -1;
  for (let attempt = 0; attempt < 12; attempt++) {
    if (!existsSync(source)) throw new Error('drop_file_missing');
    const size = statSync(source).size;
    if (size > 0 && size === previous) return;
    previous = size;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error('drop_file_still_changing');
};
const processDropFile = async (location, fileName) => {
  const pendingKey = `${location.kind}:${fileName}`;
  if (!fileName || !packageExtensions.has(extname(fileName).toLowerCase()) || pendingDrops.has(pendingKey)) return;
  const source = join(location.root, fileName);
  if (!existsSync(source) || !statSync(source).isFile()) return;
  pendingDrops.add(pendingKey);
  try {
    await waitForStableFile(source);
    const manifest = importPackage(source);
    const archived = join(location.processedRoot, `${Date.now()}-${basename(fileName)}`);
    renameSync(source, archived);
    log('INFO', `auto-imported ${manifest.id} from ${location.kind}/${basename(fileName)}`);
    void requestInjection('auto-import').catch((error) => log('WARN', `reinject after auto-import failed: ${error.message}`));
  } catch (error) {
    log('WARN', `auto-import skipped ${location.kind}/${basename(fileName)}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    pendingDrops.delete(pendingKey);
  }
};
const scanDropRoot = (location) => {
  let entries = [];
  try { entries = readdirSync(location.root, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.isFile() && packageExtensions.has(extname(entry.name).toLowerCase())) void processDropFile(location, entry.name);
  }
};
const startDropWatcher = () => {
  if (dropWatchers.length) return;
  for (const location of dropLocations) {
    try { dropWatchers.push(watch(location.root, (_event, fileName) => void processDropFile(location, String(fileName || '')))); } catch (error) { log('WARN', `drop watcher unavailable for ${location.kind}: ${error.message}`); }
    dropTimers.push(setInterval(() => scanDropRoot(location), 2000));
    scanDropRoot(location);
    log('INFO', `watching ${location.root} for .echomod/.echo files`);
  }
};

let echoProcess = null;
let watchTimer = null;
let lastTargets = new Set();
let lastInjectedTargetCount = -1;
const cdpEvaluate = async (webSocketUrl, expression) => {
  const socket = new WebSocket(webSocketUrl);
  const timeoutMs = 15000;
  const withTimeout = (work, label) => new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    Promise.resolve(work).then((value) => { clearTimeout(timer); resolvePromise(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
  await withTimeout(new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', () => resolvePromise(), { once: true });
    socket.addEventListener('error', () => reject(new Error('cdp_socket_error')), { once: true });
  }), 'cdp_connect_timeout');
  let sequence = 0;
  const call = (method, params) => withTimeout(new Promise((resolvePromise, reject) => {
    const id = ++sequence;
    const onMessage = (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch (error) { reject(error); return; }
      if (message.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message || method)); else resolvePromise(message.result);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  }), `cdp_${method}_timeout`);
  try {
    await call('Runtime.enable', {});
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'echo_renderer_evaluation_failed');
    return result;
  } finally { socket.close(); }
};
const cdpTargets = async () => {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
  if (!response.ok) throw new Error(`cdp_http_${response.status}`);
  const targets = await response.json();
  return targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl && !/^devtools:/i.test(target.url || '') && !/chrome-error/i.test(target.url || ''));
};
const externalContext = (id, manifest) => ({
  id,
  manifest,
  config: readModConfig(id),
  baseUrl: `http://127.0.0.1:${port}`,
});

const injectLoaderUi = async (target) => {
  const uiSource = readFileSync(join(loaderDir, 'loader-ui.js'), 'utf8');
  const expression = [
    '(() => {',
    `const LOADER_PORT = ${Number(port)};`,
    `const LOADER_VERSION = ${JSON.stringify(loaderVersion)};`,
    `const LOADER_LOCALE = ${JSON.stringify(locale || 'zh')};`,
    `const T = ${JSON.stringify(i18nCopy[locale || 'zh'] || i18nCopy.zh)};`,
    uiSource,
    '})()',
  ].join('\n');
  return cdpEvaluate(target.webSocketDebuggerUrl, expression);
};

const injectPlayerRuntime = async (target) => {
  const expression = `(() => {
    if (window.__echoExternalPlayer?.version >= 1) return 'already';
    const findQueue = () => {
      const root = window.__echoReactRoot?._internalRoot?.current;
      if (!root) return null;
      const seen = new Set();
      let found = null;
      const visit = (fiber, depth = 0) => {
        if (!fiber || found || seen.has(fiber) || depth > 10000) return;
        seen.add(fiber);
        const value = fiber.memoizedProps?.value;
        if (value && typeof value.playTrack === 'function' && typeof value.appendToQueue === 'function') {
          found = value;
          return;
        }
        visit(fiber.child, depth + 1);
        visit(fiber.sibling, depth + 1);
      };
      visit(root);
      return found;
    };
    const playback = () => window.echo?.playback;
    const asPlayable = (track) => {
      if (!track) return null;
      if (track.mediaType === 'streaming' || track.providerTrackId) {
        const quality = track.streamingQuality || track.quality || 'lossless';
        const id = String(track.stableKey || track.id || track.trackId || '');
        return {
          mediaType: 'streaming',
          trackId: id,
          provider: track.provider,
          providerTrackId: track.providerTrackId,
          quality,
          streamingQuality: quality,
          stableKey: id,
          title: track.title || '',
          artist: track.artist || '',
          album: track.album || '',
          albumArtist: track.albumArtist || track.artist || '',
          duration: Number(track.duration) || 0,
          coverThumb: track.coverThumb || null,
          playable: track.unavailable !== true && track.playable !== false,
        };
      }
      if (track.mediaType === 'remote' || track.remotePath || track.sourceId) {
        return {
          mediaType: 'remote',
          trackId: String(track.id || track.trackId || ''),
          sourceId: track.sourceId || null,
          stableKey: track.stableKey || null,
          remotePath: track.remotePath || null,
          title: track.title || '',
          artist: track.artist || '',
          album: track.album || '',
          duration: Number(track.duration) || 0,
          coverThumb: track.coverThumb || null,
        };
      }
      return {
        mediaType: 'local',
        trackId: String(track.id || track.trackId || track.path || ''),
        path: track.path || track.filePath || '',
        title: track.title || '',
        artist: track.artist || '',
        album: track.album || '',
        duration: Number(track.duration) || 0,
        coverThumb: track.coverThumb || null,
      };
    };
    const snapshot = (status, queue) => {
      const current = queue?.currentTrack || null;
      return {
        connected: Boolean(playback()),
        queueBound: Boolean(queue),
        state: status?.state || 'stopped',
        currentTrackId: status?.currentTrackId || current?.id || '',
        currentFilePath: status?.filePath || status?.currentFilePath || current?.path || '',
        positionSeconds: Number.isFinite(Number(status?.positionSeconds)) ? Number(status.positionSeconds) : Number(status?.positionMs || 0) / 1000,
        durationSeconds: Number.isFinite(Number(status?.durationSeconds))
          ? Number(status.durationSeconds)
          : Number.isFinite(Number(status?.durationMs))
            ? Number(status.durationMs) / 1000
            : Number(current?.duration) || 0,
        title: current?.title || status?.currentTrackTitle || status?.title || '',
        artist: current?.artist || status?.currentTrackArtist || status?.artist || '',
        album: current?.album || status?.currentTrackAlbum || status?.album || '',
        mediaType: current?.mediaType || null,
        provider: current?.provider || null,
        canGoNext: queue?.canGoNext === true,
        canGoPrevious: queue?.canGoPrevious === true,
        queueCount: Array.isArray(queue?.items) ? queue.items.length : 0,
        currentTrack: current,
      };
    };
    const player = {
      version: 1,
      mode: 'external-cdp',
      queue: findQueue,
      playback,
      async status() {
        const queue = findQueue();
        const status = await playback()?.getStatus?.();
        return snapshot(status, queue);
      },
      async play() { return playback()?.play?.(); },
      async pause() { return playback()?.pause?.(); },
      async stop() { return playback()?.stop?.(); },
      async seek(positionSeconds) { return playback()?.seek?.(Number(positionSeconds) || 0); },
      async next() {
        const queue = findQueue();
        if (queue?.playNext) return queue.playNext();
        throw new Error('echo_queue_unavailable');
      },
      async previous() {
        const queue = findQueue();
        if (queue?.playPrevious) return queue.playPrevious();
        throw new Error('echo_queue_unavailable');
      },
      async playTrack(track, options = {}) {
        const queue = findQueue();
        if (queue?.playTrack) return queue.playTrack(track, options);
        const api = playback();
        if (!api?.playMediaItem && !api?.playLocalFile) throw new Error('echo_playback_api_unavailable');
        const item = asPlayable(track);
        if (item?.mediaType === 'local') {
          return api.playLocalFile({
            filePath: item.path,
            trackId: item.trackId,
            startSeconds: options.startSeconds,
            metadata: { title: item.title, artist: item.artist, album: item.album, coverUrl: item.coverThumb },
          });
        }
        return api.playMediaItem({ item, startSeconds: options.startSeconds, forceRefresh: options.forceRefresh === true });
      },
      async playMedia(item, options = {}) {
        const api = playback();
        if (!api?.playMediaItem) throw new Error('echo_playback_api_unavailable');
        return api.playMediaItem({ item: asPlayable(item) || item, startSeconds: options.startSeconds, forceRefresh: options.forceRefresh === true });
      },
      async playLocal(request = {}) {
        const api = playback();
        if (!api?.playLocalFile) throw new Error('echo_playback_api_unavailable');
        return api.playLocalFile(request);
      },
      async prepare(track) {
        const api = playback();
        const item = asPlayable(track);
        if (item?.mediaType === 'local') return api?.prepareLocalFile?.({ filePath: item.path, trackId: item.trackId });
        return api?.prepareMediaItem?.({ item });
      },
      append(track, source) {
        const queue = findQueue();
        if (!queue?.appendToQueue) throw new Error('echo_queue_unavailable');
        return queue.appendToQueue(track, source);
      },
      replaceQueue(tracks, options) {
        const queue = findQueue();
        if (!queue?.replaceQueue) throw new Error('echo_queue_unavailable');
        return queue.replaceQueue(tracks, options);
      },
      clearQueue() {
        const queue = findQueue();
        if (!queue?.clearQueue) throw new Error('echo_queue_unavailable');
        return queue.clearQueue();
      },
      async setRepeat(mode) {
        const api = playback();
        if (!api?.setRepeatMode) throw new Error('echo_playback_api_unavailable');
        return api.setRepeatMode(mode);
      },
      async command(payload = {}) {
        const action = String(payload.action || '');
        if (action === 'status') return player.status();
        if (action === 'play') { await player.play(); return player.status(); }
        if (action === 'pause') { await player.pause(); return player.status(); }
        if (action === 'stop') { await player.stop(); return player.status(); }
        if (action === 'seek') { await player.seek(payload.positionSeconds); return player.status(); }
        if (action === 'next') { await player.next(); return player.status(); }
        if (action === 'previous') { await player.previous(); return player.status(); }
        if (action === 'playTrack') { await player.playTrack(payload.track || payload.item, payload.options || payload); return player.status(); }
        if (action === 'playMedia') { await player.playMedia(payload.item, payload); return player.status(); }
        if (action === 'playLocal' || action === 'load') {
          await player.playLocal({
            filePath: String(payload.filePath || ''),
            trackId: String(payload.trackId || payload.filePath || ''),
            mimeType: String(payload.mimeType || ''),
            startSeconds: Number(payload.positionSeconds || payload.startSeconds) || 0,
            metadata: {
              title: String(payload.title || ''),
              artist: String(payload.artist || ''),
              album: String(payload.album || ''),
              albumArtist: String(payload.albumArtist || ''),
              coverUrl: String(payload.coverUrl || ''),
              fileName: String(payload.fileName || ''),
              durationSeconds: Number(payload.durationSeconds) || 0,
            },
          });
          if (payload.state && payload.state !== 'playing') await player.pause();
          return player.status();
        }
        if (action === 'append') { player.append(payload.track || payload.item, payload.source); return player.status(); }
        if (action === 'replaceQueue') { player.replaceQueue(payload.tracks || [], payload.options); return player.status(); }
        if (action === 'clearQueue') { player.clearQueue(); return player.status(); }
        if (action === 'setRepeat') { await player.setRepeat(payload.mode || 'off'); return player.status(); }
        throw new Error('player_action_invalid');
      },
    };
    window.__echoExternalPlayer = player;
    return 'installed';
  })()`;
  return cdpEvaluate(target.webSocketDebuggerUrl, expression);
};

const injectExtendRuntime = async (target) => {
  const expression = `(() => {
    if (window.__echoExternalExtend?.version >= 1) return 'already';
    const blocked = new Set(['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']);
    const hooks = new Map();
    const styles = new Map();
    const replacements = new Map();
    const hiddenNav = new Set();
    const hiddenSelectors = new Map();
    let navStyle = null;
    const safeId = (value) => String(value || '').replace(/[^a-zA-Z0-9:_-]/g, '');
    const routeSelector = (routeId) => '.page-surface[data-route-id="' + safeId(routeId) + '"]';
    const navSelector = (routeId) => '[data-workshop-icon="nav-' + safeId(routeId) + '"]';
    const resolvePath = (path) => {
      const parts = String(path || '').split('.').filter(Boolean);
      if (!parts.length || parts.some((part) => blocked.has(part))) throw new Error('extend_path_invalid');
      let owner = window.echo;
      for (let i = 0; i < parts.length - 1; i++) {
        owner = owner?.[parts[i]];
        if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) throw new Error('extend_path_missing');
      }
      return { owner, key: parts[parts.length - 1], path: parts.join('.') };
    };
    const ensureStyle = (id, cssText) => {
      let node = styles.get(id);
      if (!node) {
        node = document.createElement('style');
        node.dataset.echoExternalExtend = id;
        document.head.append(node);
        styles.set(id, node);
      }
      node.textContent = String(cssText || '');
      return () => {
        node.remove();
        styles.delete(id);
      };
    };
    const syncNavCss = () => {
      const rules = [];
      hiddenNav.forEach((routeId) => rules.push(navSelector(routeId) + '{display:none!important}'));
      hiddenSelectors.forEach((selector) => rules.push(selector + '{display:none!important}'));
      if (!rules.length) {
        navStyle?.remove();
        navStyle = null;
        return;
      }
      if (!navStyle) {
        navStyle = document.createElement('style');
        navStyle.dataset.echoExternalExtend = 'chrome';
        document.head.append(navStyle);
      }
      navStyle.textContent = rules.join('');
    };
    const ensureReplacePage = (routeId) => {
      let page = document.querySelector('[data-echo-external-replace="' + safeId(routeId) + '"]');
      if (!page) {
        page = document.createElement('section');
        page.className = 'echo-external-mod-page';
        page.hidden = true;
        page.dataset.echoExternalReplace = safeId(routeId);
        (document.querySelector('.app-shell') || document.body).append(page);
      }
      return page;
    };
    const currentRoute = () => document.querySelector('.page-surface[data-route-id]:not([hidden])')?.getAttribute('data-route-id') || null;
    const syncReplacements = () => {
      const routeId = currentRoute();
      replacements.forEach((entry, id) => {
        const native = document.querySelector(routeSelector(id));
        const page = ensureReplacePage(id);
        if (routeId === id) {
          if (native) {
            native.dataset.echoExternalReplaced = 'true';
            native.style.setProperty('display', 'none', 'important');
          }
          page.hidden = false;
          if (!entry.mounted) {
            try {
              if (typeof entry.render === 'function') entry.cleanup = entry.render(page);
              else if (typeof entry.html === 'string') page.innerHTML = entry.html;
              entry.mounted = true;
            } catch (error) {
              page.textContent = 'Route replacement failed: ' + (error?.message || error);
            }
          }
          return;
        }
        page.hidden = true;
      });
      document.querySelectorAll('[data-echo-external-replaced="true"]').forEach((surface) => {
        const id = surface.getAttribute('data-route-id');
        if (replacements.has(id) && id === routeId) return;
        delete surface.dataset.echoExternalReplaced;
        if (!surface.dataset.echoExternalHidden) surface.style.removeProperty('display');
      });
    };
    const extend = {
      version: 1,
      mode: 'external-cdp',
      css(id, cssText) {
        return ensureStyle(safeId(id) || 'style', cssText);
      },
      removeCss(id) {
        const node = styles.get(safeId(id));
        node?.remove();
        styles.delete(safeId(id));
      },
      hook(path, wrapper) {
        if (typeof wrapper !== 'function') throw new Error('extend_hook_invalid');
        const target = resolvePath(path);
        if (hooks.has(target.path)) extend.unhook(target.path);
        const original = target.owner[target.key];
        if (typeof original !== 'function') throw new Error('extend_hook_not_function');
        const wrapped = function (...args) {
          return wrapper.call(this, original.bind(this), ...args);
        };
        target.owner[target.key] = wrapped;
        hooks.set(target.path, { owner: target.owner, key: target.key, original });
        return () => extend.unhook(target.path);
      },
      unhook(path) {
        const target = resolvePath(path);
        const entry = hooks.get(target.path);
        if (!entry) return;
        if (entry.owner === target.owner) entry.owner[entry.key] = entry.original;
        hooks.delete(target.path);
      },
      on(type, handler, options) {
        window.addEventListener(type, handler, options);
        return () => window.removeEventListener(type, handler, options);
      },
      navigate(routeId) {
        window.dispatchEvent(new CustomEvent('app:navigate:route', { detail: String(routeId || '') }));
      },
      currentRoute,
      replaceRoute(routeId, options = {}) {
        const id = safeId(routeId);
        if (!id) throw new Error('extend_route_invalid');
        extend.restoreRoute(id);
        replacements.set(id, {
          render: typeof options.render === 'function' ? options.render : null,
          html: typeof options.html === 'string' ? options.html : null,
          cleanup: null,
          mounted: false,
        });
        syncReplacements();
        return () => extend.restoreRoute(id);
      },
      restoreRoute(routeId) {
        const id = safeId(routeId);
        const entry = replacements.get(id);
        if (!entry) return;
        try { entry.cleanup?.(); } catch {}
        document.querySelector('[data-echo-external-replace="' + id + '"]')?.remove();
        replacements.delete(id);
        syncReplacements();
      },
      hideNav(routeId) {
        const id = safeId(routeId);
        hiddenNav.add(id);
        syncNavCss();
        return () => extend.showNav(id);
      },
      showNav(routeId) {
        hiddenNav.delete(safeId(routeId));
        syncNavCss();
      },
      hide(selector) {
        const key = String(selector || '');
        if (!key) throw new Error('extend_selector_invalid');
        hiddenSelectors.set(key, key);
        syncNavCss();
        return () => extend.show(key);
      },
      show(selector) {
        hiddenSelectors.delete(String(selector || ''));
        syncNavCss();
      },
      observe(selector, callback) {
        if (typeof callback !== 'function') throw new Error('extend_observe_invalid');
        const run = () => document.querySelectorAll(String(selector || '')).forEach((node) => callback(node));
        const observer = new MutationObserver(run);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        run();
        return () => observer.disconnect();
      },
    };
    window.addEventListener('app:navigate:route', () => requestAnimationFrame(syncReplacements));
    window.addEventListener('app:navigate:lyrics', () => requestAnimationFrame(syncReplacements));
    window.addEventListener('app:navigate:lyrics-back', () => requestAnimationFrame(syncReplacements));
    window.addEventListener('app:navigate:queue', () => requestAnimationFrame(syncReplacements));
    window.addEventListener('app:navigate:settings', () => requestAnimationFrame(syncReplacements));
    const observer = new MutationObserver(() => syncReplacements());
    observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    window.__echoExternalExtend = extend;
    return 'installed';
  })()`;
  return cdpEvaluate(target.webSocketDebuggerUrl, expression);
};

const removeInjected = async (id) => {
  let targets = [];
  try { targets = await cdpTargets(); } catch { return; }
  for (const target of targets) {
    await cdpEvaluate(target.webSocketDebuggerUrl, `(() => {
      const mod = window.__echoExternalMods?.[${JSON.stringify(id)}];
      try { mod?.dispose?.(); } catch {}
      if (${JSON.stringify(id)} === 'echo.listen-together') {
        try { window.__echoTogetherExternalDispose?.(); } catch {}
      }
      if (window.__echoExternalMods) delete window.__echoExternalMods[${JSON.stringify(id)}];
      return true;
    })()`).catch(() => undefined);
  }
};

const injectIntoTarget = async (target, id, manifest, source) => {
  const context = JSON.stringify(externalContext(id, manifest));
  const sourceLiteral = JSON.stringify(source);
  const signatureLiteral = JSON.stringify(`${source}\n${context}`);
  const expression = `(async () => {
    const id = ${JSON.stringify(id)}, ctx = ${context}, source = ${sourceLiteral}, signature = ${signatureLiteral};
    window.__echoExternalMods = window.__echoExternalMods || {};
    const old = window.__echoExternalMods[id];
    if (old?.signature === signature) return { status: 'already' };
    try { old?.dispose?.(); } catch {}
    const settingsKey = 'echo.external-mod.' + id;
    const settings = {
      get() { try { return JSON.parse(localStorage.getItem(settingsKey) || '{}'); } catch { return {}; } },
      set(patch) { const next = { ...settings.get(), ...patch }; localStorage.setItem(settingsKey, JSON.stringify(next)); return next; },
    };
    const request = async (path, options = {}) => {
      const r = await fetch(ctx.baseUrl + path, {
        method: options.method || 'POST',
        headers: { 'content-type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const text = await r.text();
      let value;
      try { value = JSON.parse(text); } catch { value = text; }
      if (!r.ok) throw new Error(value?.error || text || 'external_mod_request_failed');
      return value;
    };
    const assetUrl = (filePath) => ctx.baseUrl + '/api/mod/' + encodeURIComponent(id) + '/file/' + encodeURIComponent(String(filePath || '').replaceAll('\\\\', '/'));
    const loadAsset = async (filePath, options = {}) => {
      const response = await fetch(assetUrl(filePath));
      if (!response.ok) throw new Error('mod_asset_http_' + response.status);
      return options.binary === true ? response.arrayBuffer() : response.text();
    };
    const publicEchoPath = (path) => {
      const parts = String(path || '').split('.').filter(Boolean);
      if (!parts.length || parts.some((part) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part) || ['__proto__', 'constructor', 'prototype'].includes(part))) throw new Error('echo_sdk_path_invalid');
      let owner = window.echo;
      let value = window.echo;
      for (const part of parts) { owner = value; value = value?.[part]; }
      return { owner, value };
    };
    const sdk = {
      version: 1,
      mode: 'external-cdp',
      getEcho() { return window.echo; },
      list(path = '') {
        const value = path ? publicEchoPath(path).value : window.echo;
        return value && (typeof value === 'object' || typeof value === 'function') ? Object.keys(value).sort() : [];
      },
      get(path) { return publicEchoPath(path).value; },
      call(path, ...callArgs) {
        const target = publicEchoPath(path);
        if (typeof target.value !== 'function') throw new Error('echo_sdk_method_not_found');
        return target.value.apply(target.owner, callArgs);
      },
      async status() { return request('/api/status', { method: 'GET' }); },
    };
    const sidebarDisposers = [];
    const extendDisposers = [];
    const trackExtend = (dispose) => {
      if (typeof dispose === 'function') extendDisposers.push(dispose);
      return dispose;
    };
    const rawExtend = window.__echoExternalExtend;
    const extend = rawExtend ? {
      version: rawExtend.version,
      mode: rawExtend.mode,
      css: (styleId, cssText) => trackExtend(rawExtend.css(id + ':' + String(styleId || 'style'), cssText)),
      removeCss: (styleId) => rawExtend.removeCss(id + ':' + String(styleId || 'style')),
      hook: (path, wrapper) => trackExtend(rawExtend.hook(path, wrapper)),
      unhook: (path) => rawExtend.unhook(path),
      on: (type, handler, options) => trackExtend(rawExtend.on(type, handler, options)),
      navigate: (routeId) => rawExtend.navigate(routeId),
      currentRoute: () => rawExtend.currentRoute(),
      replaceRoute: (routeId, options) => trackExtend(rawExtend.replaceRoute(routeId, options)),
      restoreRoute: (routeId) => rawExtend.restoreRoute(routeId),
      hideNav: (routeId) => trackExtend(rawExtend.hideNav(routeId)),
      showNav: (routeId) => rawExtend.showNav(routeId),
      hide: (selector) => trackExtend(rawExtend.hide(selector)),
      show: (selector) => rawExtend.show(selector),
      observe: (selector, callback) => trackExtend(rawExtend.observe(selector, callback)),
    } : null;
    const sidebar = {
      register(options = {}) {
        const register = window.__echoExternalLoaderUi?.registerSidebar;
        if (typeof register !== 'function') throw new Error('loader_ui_not_ready');
        const dispose = register(id, options, { id, manifest: ctx.manifest, config: ctx.config, assetUrl, loadAsset, toast: (message) => bridge.toast(message), echo: window.echo });
        if (typeof dispose === 'function') sidebarDisposers.push(dispose);
        return () => {
          const index = sidebarDisposers.indexOf(dispose);
          if (index >= 0) sidebarDisposers.splice(index, 1);
          dispose?.();
        };
      },
    };
    const bridge = {
      ...ctx,
      sdk,
      settings,
      fetchJson: (url, options = {}) => request('/api/proxy', { body: { url, ...options } }),
      uploadFile: (input) => request('/api/upload', { body: input }),
      assetUrl,
      loadAsset,
      sidebar,
      toast: (message) => {
        if (typeof window.__echoModToast === 'function') window.__echoModToast(message, 'info');
        else window.dispatchEvent(new CustomEvent('app:show-chrome-notice', { detail: String(message) }));
      },
      echo: window.echo,
      player: window.__echoExternalPlayer || null,
      extend,
      native: {
        version: 1,
        mode: 'in-process-asar-bridge',
        status: () => request('/api/native/status', { method: 'GET' }),
        modules: () => request('/api/native/call', { body: { method: 'modules', packageId: id } }),
        invoke: (method, payload) => request('/api/native/call', { body: { method: 'invoke', packageId: id, payload: { method, payload } } }),
        read: (input) => request('/api/native/call', { body: { method: 'read', packageId: id, payload: input } }),
        write: (input) => request('/api/native/call', { body: { method: 'write', packageId: id, payload: input } }),
        protect: (input) => request('/api/native/call', { body: { method: 'protect', packageId: id, payload: input } }),
      },
      main: {
        version: 1,
        mode: 'in-process-asar-bridge',
        invoke: (method, payload) => request('/api/native/call', { body: { method: 'main.invoke', packageId: id, payload: { method, payload } } }),
      },
    };
    const modConsole = Object.fromEntries(['debug', 'info', 'log', 'warn', 'error'].map((level) => [level, (...values) => {
      const message = values.map((value) => { try { return typeof value === 'string' ? value : JSON.stringify(value); } catch { return String(value); } }).join(' ');
      void fetch(ctx.baseUrl + '/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, level, message }) }).catch(() => undefined);
      const native = window.console?.[level] || window.console?.log;
      native?.call(window.console, '[Mod ' + id + ']', ...values);
    }]));
    bridge.console = modConsole;
    bridge.log = modConsole.log;
    let returnedDispose;
    try {
      returnedDispose = await (async function(echoExternalMod, console) { ${source}\n })(bridge, modConsole);
    } catch (error) {
      console.error('[ECHO external mod]', id, error);
      throw error;
    }
    const dispose = () => {
      try { if (typeof returnedDispose === 'function') returnedDispose(); } finally {
        while (sidebarDisposers.length) sidebarDisposers.pop()?.();
        while (extendDisposers.length) extendDisposers.pop()?.();
      }
    };
    window.__echoExternalMods[id] = { source, signature, dispose };
    return { status: 'injected', id };
  })()`;
  return cdpEvaluate(target.webSocketDebuggerUrl, expression);
};

const modEntrySource = (id, manifest, entry) => {
  const source = readFileSync(entry, 'utf8');
  const extension = extname(entry).toLowerCase();
  if (manifest.entryType === 'html' || extension === '.html' || extension === '.htm') {
    return `echoExternalMod.sidebar.register({ label: ${JSON.stringify(manifest.name || id)}, order: ${Number(manifest.sidebarOrder) || 50}, html: ${JSON.stringify(source)} });`;
  }
  if (manifest.entryType === 'css' || extension === '.css') {
    return `const style = document.createElement('style'); style.dataset.echoExternalMod = ${JSON.stringify(id)}; style.textContent = ${JSON.stringify(source)}; document.head.append(style); return () => style.remove();`;
  }
  return source;
};
const injectionPlan = (id, stateEntry) => {
  const record = findPackage(id, stateEntry?.kind);
  const manifest = record?.manifest;
  if (!record || !manifest) return null;
  const entry = join(record.directory, safeRelative(manifest.entry || (record.kind === 'plugin' ? 'plugin.js' : 'mod.js')));
  if (!existsSync(entry)) {
    if (!manifest.main && !manifest.native) return null;
    const source = '/* shinawase native-only package */';
    return { id, manifest, source, signature: `${source}\n${JSON.stringify(externalContext(id, manifest))}` };
  }
  const source = modEntrySource(id, manifest, entry);
  return { id, manifest, source, signature: `${source}\n${JSON.stringify(externalContext(id, manifest))}` };
};
const targetInjectionState = async (target) => {
  const result = await cdpEvaluate(target.webSocketDebuggerUrl, `(() => ({
    uiVersion: Number(window.__echoExternalLoaderUi?.version || 0),
    playerVersion: Number(window.__echoExternalPlayer?.version || 0),
    extendVersion: Number(window.__echoExternalExtend?.version || 0),
    mods: Object.fromEntries(Object.entries(window.__echoExternalMods || {}).map(([id, value]) => [id, String(value?.signature || '')]))
  }))()`);
  return result?.result?.value || { uiVersion: 0, playerVersion: 0, extendVersion: 0, mods: {} };
};

const injectEnabled = async () => {
  if (safeMode || loadMode === 'disabled') return 0;
  const targets = await cdpTargets();
  const state = readState();
  const active = Object.entries(state.mods).filter(([, value]) => value?.enabled === true);
  const plans = active.map(([id, value]) => injectionPlan(id, value)).filter(Boolean);
  if (targets.length !== lastInjectedTargetCount) {
    lastInjectedTargetCount = targets.length;
    log('INFO', `ECHO targets=${targets.length}, enabledPackages=${plans.length}`);
  }
  for (const target of targets) {
    const targetState = await targetInjectionState(target).catch(() => ({ uiVersion: 0, playerVersion: 0, extendVersion: 0, mods: {} }));
    const uiReloaded = targetState.uiVersion < 8;
    await cdpEvaluate(target.webSocketDebuggerUrl, `(() => {
      const extra = window.__echoShinawaseStreaming;
      if (!extra || window.__echoShinawaseEchoPatched) return extra ? 'already' : 'missing';
      const base = window.echo || {};
      try {
        window.echo = new Proxy(base, {
          get(target, prop) {
            const value = Reflect.get(target, prop);
            if ((value === null || value === undefined) && extra[prop]) return extra[prop];
            return value;
          }
        });
        window.__echoShinawaseEchoPatched = true;
        return 'proxied';
      } catch { return 'frozen'; }
    })()`).catch(() => undefined);
    if (uiReloaded) await injectLoaderUi(target).catch((error) => log('WARN', `loader UI injection failed: ${error.message}`, error));
    if (targetState.playerVersion < 1) await injectPlayerRuntime(target).catch((error) => log('WARN', `player runtime injection failed: ${error.message}`, error));
    if (targetState.extendVersion < 1) await injectExtendRuntime(target).catch((error) => log('WARN', `extend runtime injection failed: ${error.message}`, error));
    for (const plan of plans) {
      if (!uiReloaded && targetState.mods?.[plan.id] === plan.signature) continue;
      await injectIntoTarget(target, plan.id, plan.manifest, plan.source).catch((error) => log('WARN', `inject ${plan.id}: ${error.message}`, error));
    }
  }
  lastTargets = new Set(targets.map((target) => target.id));
  loaderStats.injects += 1;
  loaderStats.lastInjectAt = Date.now();
  return targets.length;
};
let injectionPromise = null;
let injectionQueued = false;
const requestInjection = (reason = 'manual') => {
  if (safeMode || loadMode === 'disabled') {
    log('DEBUG', `injection skipped (${reason})`);
    return Promise.resolve(0);
  }
  if (injectionPromise) {
    injectionQueued = true;
    return injectionPromise;
  }
  injectionPromise = injectEnabled().finally(() => {
    injectionPromise = null;
    if (injectionQueued) {
      injectionQueued = false;
      void requestInjection('queued').catch((error) => log('WARN', 'queued injection failed', error));
    }
  });
  return injectionPromise;
};

let togetherUploadProgress = { active: false, loaded: 0, total: 0, stage: 'idle', quality: 'opus' };
const rendererValue = async (expression) => {
  const targets = await cdpTargets();
  const target = targets.find((candidate) => !String(candidate.url || '').startsWith('devtools://')) || targets[0];
  if (!target) throw new Error('echo_renderer_not_ready');
  const result = await cdpEvaluate(target.webSocketDebuggerUrl, expression);
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || 'echo_renderer_evaluation_failed');
  return result?.result?.value;
};
const rendererSdkInfo = async () => rendererValue(`(() => {
  const echo = window.echo || {};
  return Object.fromEntries(Object.keys(echo).sort().map((key) => {
    const value = echo[key];
    return [key, typeof value === 'object' && value ? Object.keys(value).sort() : typeof value];
  }));
})()`);
const sdkStatus = async () => {
  try { return { connected: true, namespaces: await rendererSdkInfo() }; }
  catch (error) { return { connected: false, error: error instanceof Error ? error.message : String(error) }; }
};
const playbackStatus = async () => {
  const status = await rendererValue('(async()=>await window.echo?.playback?.getStatus?.())()');
  const positionSeconds = Number.isFinite(Number(status?.positionSeconds)) ? Number(status.positionSeconds) : Number(status?.positionMs || 0) / 1000;
  const durationSeconds = Number.isFinite(Number(status?.durationSeconds)) ? Number(status.durationSeconds) : Number(status?.durationMs || 0) / 1000;
  return {
    state: status?.state || 'stopped',
    currentTrackId: status?.currentTrackId || '',
    currentFilePath: status?.filePath || status?.currentFilePath || '',
    positionSeconds,
    durationSeconds,
    currentTrackTitle: status?.currentTrackTitle || status?.title || '',
    currentTrackArtist: status?.currentTrackArtist || status?.artist || '',
    currentTrackAlbum: status?.currentTrackAlbum || status?.album || '',
    currentTrackAlbumArtist: status?.currentTrackAlbumArtist || status?.albumArtist || '',
    currentTrackCoverUrl: status?.currentTrackCoverUrl || status?.coverUrl || '',
  };
};
const playbackControl = async (payload) => {
  const input = JSON.stringify(payload && typeof payload === 'object' ? payload : {});
  const value = await rendererValue(`(async()=>{
    if (!window.__echoExternalPlayer) throw new Error('echo_player_runtime_unavailable');
    return window.__echoExternalPlayer.command(${input});
  })()`);
  return { ok: true, ...(value || {}) };
};
const remoteJson = async (response) => {
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch { value = { error: text }; }
  if (!response.ok) throw new Error(value?.error || `remote_http_${response.status}`);
  return value;
};
const publishTogetherTrack = async (payload) => {
  const filePath = resolve(String(payload?.filePath || ''));
  if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new Error('audio_file_invalid');
  const info = statSync(filePath);
  const server = String(payload?.serverUrl || '').replace(/\/+$/u, '');
  const roomCode = String(payload?.roomCode || '').toUpperCase().replace(/[^A-Z0-9]/gu, '').slice(0, 6);
  const roomToken = String(payload?.roomToken || '');
  if (!server.startsWith('https://') || roomCode.length !== 6 || !roomToken) throw new Error('room_session_invalid');
  const quality = payload?.quality === 'direct' ? 'direct' : 'opus';
  const metadata = {
    sizeBytes: info.size,
    quality,
    sourceId: String(payload?.sourceId || filePath).slice(0, 180),
    title: String(payload?.title || filePath.split(/[\\/]/u).pop() || 'audio').slice(0, 180),
    artist: String(payload?.artist || '').slice(0, 180),
    album: String(payload?.album || '').slice(0, 180),
    albumArtist: String(payload?.albumArtist || '').slice(0, 180),
    coverUrl: String(payload?.coverUrl || '').slice(0, 4000),
    durationSeconds: Number(payload?.durationSeconds || 0),
    positionSeconds: Number(payload?.positionSeconds || 0),
    state: payload?.state === 'playing' ? 'playing' : 'paused',
    mimeType: 'application/octet-stream',
    fileName: filePath.split(/[\\/]/u).pop() || 'audio',
  };
  togetherUploadProgress = { active: true, loaded: 0, total: info.size, stage: 'preparing', quality };
  try {
    const prepared = await remoteJson(await fetch(`${server}/v1/rooms/${encodeURIComponent(roomCode)}/track?token=${encodeURIComponent(roomToken)}`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(metadata),
    }));
    const stream = createReadStream(filePath);
    let loaded = 0;
    stream.on('data', (chunk) => { loaded += chunk.length; togetherUploadProgress = { active: true, loaded, total: info.size, stage: 'uploading', quality }; });
    const upload = await fetch(prepared.uploadUrl, { method: 'PUT', headers: { 'Content-Length': String(info.size), 'Content-Type': 'application/octet-stream' }, body: stream, duplex: 'half' });
    if (!upload.ok) throw new Error(`media_upload_http_${upload.status}`);
    togetherUploadProgress = { active: false, loaded: info.size, total: info.size, stage: 'complete', quality };
    return { ok: true, mediaId: prepared.mediaId, title: metadata.title, quality };
  } catch (error) {
    togetherUploadProgress = { active: false, loaded: 0, total: info.size, stage: 'error', quality };
    throw error;
  }
};
let togetherRelayServer = null;
let togetherRelaySync = Promise.resolve();
let relayLifecycleActive = false;
const isTogetherEnabled = () => {
  const state = readState();
  return state.mods[togetherModId]?.enabled === true && Boolean(findPackage(togetherModId, state.mods[togetherModId]?.kind));
};
const startTogetherRelay = () => {
  if (togetherRelayServer) return Promise.resolve();
  const relay = createServer(async (request, response) => {
    const relayUrl = new URL(request.url || '/', `http://127.0.0.1:${togetherRelayPort}`);
    if (request.method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }); return response.end(); }
    try {
      if (request.method === 'GET' && relayUrl.pathname === '/v1/together/status') return jsonResponse(response, 200, { ok: true, ...(await playbackStatus()) });
      if (request.method === 'GET' && relayUrl.pathname === '/v1/together/config') return jsonResponse(response, 200, { ok: true, relayPort: togetherRelayPort });
      if (request.method === 'GET' && relayUrl.pathname === '/v1/together/upload-progress') return jsonResponse(response, 200, { ok: true, ...togetherUploadProgress });
      const body = request.method === 'POST' ? await readRequest(request) : {};
      if (request.method === 'POST' && relayUrl.pathname === '/v1/together/control') return jsonResponse(response, 200, await playbackControl(body));
      if (request.method === 'POST' && relayUrl.pathname === '/v1/together/publish') return jsonResponse(response, 200, await publishTogetherTrack(body));
      return jsonResponse(response, 404, { error: 'not_found' });
    } catch (error) { return jsonResponse(response, 400, { error: error instanceof Error ? error.message : String(error) }); }
  });
  togetherRelayServer = relay;
  return new Promise((resolvePromise, reject) => {
    const startupError = (error) => {
      if (togetherRelayServer === relay) togetherRelayServer = null;
      reject(error);
    };
    relay.once('error', startupError);
    relay.listen(togetherRelayPort, '127.0.0.1', () => {
      relay.off('error', startupError);
      relay.on('error', (error) => log('WARN', `Together relay: ${error.message}`));
      resolvePromise();
    });
  });
};
const stopTogetherRelay = () => new Promise((resolvePromise) => {
  const relay = togetherRelayServer;
  togetherRelayServer = null;
  if (!relay) return resolvePromise();
  relay.closeAllConnections?.();
  relay.close((error) => {
    if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') log('WARN', `Together relay stop: ${error.message}`);
    resolvePromise();
  });
});
const syncTogetherRelay = () => {
  if (!relayLifecycleActive) return Promise.resolve();
  togetherRelaySync = togetherRelaySync.catch(() => undefined).then(async () => {
    if (isTogetherEnabled()) await startTogetherRelay();
    else await stopTogetherRelay();
  }).catch((error) => log('WARN', `Together relay: ${error.message}`));
  return togetherRelaySync;
};
const startWatch = () => {
  if (safeMode || loadMode === 'disabled') {
    log('INFO', `Mod injection disabled (${safeMode ? 'safe-mode' : 'load-mode'})`);
    return;
  }
  if (watchTimer) return;
  watchTimer = setInterval(() => void requestInjection('interval').catch((error) => log('WARN', 'interval injection failed', error)), injectIntervalMs);
  const inject = () => void requestInjection('initial').catch((error) => log('WARN', 'initial injection failed', error));
  if (startupDelayMs) setTimeout(inject, startupDelayMs);
  else inject();
  log('INFO', `watching ECHO CDP on ${debugPort} every ${injectIntervalMs}ms`);
};
const echoFileName = (name) => /^ECHO(?:\s+(?:NEXT|Playtest|Steam))?\.exe$/iu.test(name);
const echoCandidateRoots = () => {
  const roots = new Set([
    process.cwd(), workspaceRoot, dirname(root),
    process.env.ECHO_ROOT, process.env.ECHO_INSTALL_ROOT,
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'ECHO') : null,
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Steam', 'steamapps', 'common') : null,
    process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)'], 'Steam', 'steamapps', 'common') : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs') : null,
  ]);
  const vdfRoots = [
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Steam', 'steamapps', 'libraryfolders.vdf'),
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Steam', 'steamapps', 'libraryfolders.vdf'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Steam', 'steamapps', 'libraryfolders.vdf'),
  ];
  for (const vdf of vdfRoots) {
    if (!vdf || !existsSync(vdf)) continue;
    try {
      const text = readFileSync(vdf, 'utf8');
      for (const match of text.matchAll(/"path"\s+"([^"]+)"/giu)) roots.add(match[1].replaceAll('\\\\', '\\'));
    } catch {}
  }
  if (process.platform === 'win32') {
    for (const drive of ['C:', 'D:', 'E:', 'F:']) {
      roots.add(join(drive, 'SteamLibrary'));
      roots.add(join(drive, 'steamapps', 'common'));
    }
  }
  return [...roots].filter(Boolean).map((value) => resolve(String(value)));
};
const discoverEchoes = (hint = null) => {
  const found = new Set();
  const add = (value) => {
    if (!value) return;
    const candidate = resolve(String(value));
    try { if (existsSync(candidate) && statSync(candidate).isFile() && echoFileName(basename(candidate))) found.add(candidate); } catch {}
  };
  const walk = (directory, depth = 0) => {
    if (!directory || depth > 5 || !existsSync(directory)) return;
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isFile() && echoFileName(entry.name)) add(path);
      else if (entry.isDirectory() && !['node_modules', 'app.asar.unpacked', '.git', 'Mods', 'installed'].includes(entry.name)) walk(path, depth + 1);
    }
  };
  const direct = hint || echoExe || process.env.ECHO_EXE || loaderConfig.echoExe || loaderConfig.echoRoot;
  if (direct) {
    const path = resolve(String(direct));
    try { if (existsSync(path) && statSync(path).isFile()) add(path); else walk(path); } catch {}
  }
  for (const candidate of echoCandidateRoots()) walk(candidate);
  return [...found].sort((left, right) => left.localeCompare(right));
};
const findEcho = () => {
  const found = discoverEchoes();
  if (!found.length) throw new Error('ECHO executable not found; pass --echo <directory-or-exe>');
  return found[0];
};

const attachMainInspector = async () => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${inspectPort}/json`);
      if (response.ok) {
        const targets = await response.json();
        const target = (Array.isArray(targets) ? targets : []).find((item) => item.webSocketDebuggerUrl);
        if (target?.webSocketDebuggerUrl) {
          const loaderLiteral = JSON.stringify(root.replaceAll('\\', '/'));
          const result = await cdpEvaluate(target.webSocketDebuggerUrl, `(async () => {
            process.env.ECHO_MOD_HOME = process.env.ECHO_MOD_HOME || ${loaderLiteral};
            const path = require('node:path');
            const bootstrap = require(path.join(process.env.ECHO_MOD_HOME, 'main-bootstrap.cjs'));
            return bootstrap.startShinawaseMainBootstrap();
          })()`);
          log('INFO', 'main inspector bootstrap', result?.result?.value || result);
          return result?.result?.value || { ok: true };
        }
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  log('DEBUG', `main inspector unavailable on ${inspectPort}; renderer CDP and optional asar-bridge remain active`);
  return null;
};
const launchEcho = () => {
  if (loadMode === 'attach-only') throw new Error('load_mode_attach_only');
  const executable = findEcho();
  if (echoProcess && !echoProcess.killed) return executable;
  echoProcess = spawn(executable, [`--remote-debugging-port=${debugPort}`, `--inspect=${inspectPort}`], {
    cwd: dirname(executable),
    env: {
      ...process.env,
      ECHO_MOD_ROOT: gameRoot,
      ECHO_MOD_HOME: root,
      ECHO_GAME_ROOT: gameRoot,
      ECHO_MODS_HOME: modsRoot,
      ECHO_PLUGINS_HOME: pluginsRoot,
      ECHO_LOGS_HOME: logsRoot,
    },
    detached: false,
    stdio: 'ignore',
    windowsHide: true,
  });
  echoProcess.once('exit', () => { echoProcess = null; });
  log('INFO', `launched ECHO ${executable} inspect=${inspectPort}`);
  void attachMainInspector();
  startWatch();
  return executable;
};

const jsonResponse = (response, status, value) => {
  const text = JSON.stringify(value);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' });
  response.end(text);
};
const readRequest = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024 * 1024) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const webUiHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ShinawaseLoader · Web 控制台</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(18, 24, 38, 0.75);
      --border: rgba(255, 255, 255, 0.1);
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.35);
      --success: #34d399;
      --danger: #fb7185;
      --text: #f1f5f9;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      background: radial-gradient(circle at 50% 0%, #172554 0%, var(--bg) 65%);
      color: var(--text); min-height: 100vh; padding: 32px 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
    header {
      display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;
      padding-bottom: 20px; border-bottom: 1px solid var(--border);
    }
    .brand-row { display: flex; align-items: center; gap: 12px; }
    .brand-icon {
      width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, #38bdf8, #818cf8);
      display: grid; place-items: center; font-size: 20px; font-weight: 900; color: #090d16;
      box-shadow: 0 0 20px var(--accent-glow);
    }
    .brand-title { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .brand-subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .header-actions { display: flex; gap: 10px; align-items: center; }

    .btn {
      padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border);
      background: rgba(30, 41, 59, 0.7); color: #fff; font: 600 13px inherit;
      cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); outline: none; text-decoration: none;
    }
    .btn:hover { background: rgba(51, 65, 85, 0.9); border-color: rgba(255, 255, 255, 0.25); transform: translateY(-1px); }
    .btn:active { transform: scale(0.98); }
    .btn.primary {
      background: linear-gradient(135deg, #4f46e5, #3b82f6); border-color: rgba(129, 140, 248, 0.4);
      box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
    }
    .btn.primary:hover { box-shadow: 0 6px 22px rgba(79, 70, 229, 0.6); }
    .btn.danger { background: rgba(225, 29, 72, 0.15); border-color: rgba(244, 63, 94, 0.3); color: var(--danger); }
    .btn.danger:hover { background: rgba(225, 29, 72, 0.28); }

    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
    .stat-card {
      background: var(--card-bg); border: 1px solid var(--border); backdrop-filter: blur(16px);
      border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 14px;
    }
    .stat-icon { font-size: 24px; width: 44px; height: 44px; border-radius: 10px; background: rgba(255,255,255,0.05); display: grid; place-items: center; }
    .stat-num { font-size: 20px; font-weight: 700; color: #fff; }
    .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

    .dropzone {
      border: 2px dashed rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.04);
      border-radius: 14px; padding: 24px; text-align: center; color: var(--muted);
      cursor: pointer; transition: all 0.2s ease;
    }
    .dropzone:hover, .dropzone.dragover {
      background: rgba(56, 189, 248, 0.12); border-color: var(--accent); color: #fff;
      transform: scale(1.005);
    }
    .dropzone-title { font-size: 15px; font-weight: 700; color: #e2e8f0; margin-bottom: 4px; }

    .toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    .filter-group { display: flex; gap: 6px; }
    .filter-chip { padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; background: rgba(255,255,255,0.06); color: var(--muted); border: 1px solid transparent; transition: all 0.15s; }
    .filter-chip.active { background: rgba(56, 189, 248, 0.18); color: var(--accent); border-color: rgba(56, 189, 248, 0.35); }
    .search-input { padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border); background: rgba(0,0,0,0.3); color: #fff; outline: none; font-size: 13px; width: 220px; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
    .card {
      background: var(--card-bg); border: 1px solid var(--border); backdrop-filter: blur(20px);
      border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 12px;
      transition: all 0.2s ease;
    }
    .card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.22); box-shadow: 0 12px 30px rgba(0,0,0,0.4); }
    .card.disabled { opacity: 0.7; }
    .card-top { display: flex; gap: 12px; align-items: flex-start; }
    .card-icon { width: 48px; height: 48px; border-radius: 12px; background: rgba(0,0,0,0.4); border: 1px solid var(--border); flex-shrink: 0; display: grid; place-items: center; overflow: hidden; }
    .card-icon img { width: 100%; height: 100%; object-fit: contain; }
    .card-info { flex: 1; min-width: 0; }
    .card-title { font-size: 15px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card-id { font-size: 11px; color: var(--muted); margin-top: 2px; font-family: ui-monospace, monospace; }
    .card-desc { font-size: 12px; color: #cbd5e1; line-height: 1.45; min-height: 36px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    .card-bottom { display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid var(--border); }
    .switch-wrap { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .switch { width: 36px; height: 20px; border-radius: 20px; background: rgba(255,255,255,0.15); position: relative; transition: all 0.2s; }
    .switch.active { background: var(--success); box-shadow: 0 0 10px rgba(52, 211, 153, 0.4); }
    .switch-knob { width: 14px; height: 14px; border-radius: 50%; background: #fff; position: absolute; left: 3px; top: 3px; transition: all 0.2s; }
    .switch.active .switch-knob { left: 19px; }

    .toast {
      position: fixed; right: 24px; bottom: 24px; z-index: 9999;
      background: rgba(15, 23, 42, 0.95); color: #fff; padding: 12px 20px; border-radius: 10px;
      font-weight: 600; font-size: 13px; border: 1px solid var(--border); box-shadow: 0 12px 36px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand-row">
        <div class="brand-icon">✦</div>
        <div>
          <div class="brand-title">ShinawaseLoader Web 控制台</div>
          <div class="brand-subtitle">ECHO 外部模组加载系统 · 端口 ${port}</div>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn primary" onclick="launchEcho()">🚀 启动 ECHO</button>
        <button class="btn" onclick="reinjectMods()">🔄 重新注入</button>
        <button class="btn" onclick="refresh()">刷新</button>
      </div>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">📦</div>
        <div>
          <div class="stat-num" id="stat-total">0</div>
          <div class="stat-label">已安装模组</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🟢</div>
        <div>
          <div class="stat-num" id="stat-active">0</div>
          <div class="stat-label">已启用模组</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🔌</div>
        <div>
          <div class="stat-num">${port}</div>
          <div class="stat-label">Loader 端口</div>
        </div>
      </div>
    </div>

    <input type="file" id="file" accept=".echomod,.echo,application/json,application/zip" style="display:none" onchange="uploadMod(this.files[0])">
    <div class="dropzone" id="dropzone" onclick="document.getElementById('file').click()">
      <div class="dropzone-title">📥 点击选择或拖放 .echomod / .echo 文件到此处</div>
      <div>快速安装并部署外部模组至 ECHO</div>
    </div>

    <div class="toolbar">
      <div class="filter-group">
        <div class="filter-chip active" onclick="setFilter('all', this)">全部</div>
        <div class="filter-chip" onclick="setFilter('active', this)">已启用</div>
        <div class="filter-chip" onclick="setFilter('inactive', this)">已停用</div>
      </div>
      <input type="text" class="search-input" id="search" placeholder="搜索模组..." oninput="render()">
    </div>

    <div class="grid" id="mods-grid"></div>
  </div>

  <script>
    const $ = s => document.querySelector(s);
    let allMods = [];
    let activeFilter = 'all';

    function toast(text) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = text;
      document.body.append(el);
      setTimeout(() => el.remove(), 3000);
    }

    async function api(path, opt) {
      const res = await fetch(path, opt);
      const val = await res.json();
      if (!res.ok) throw new Error(val.error || '请求失败');
      return val;
    }

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    function setFilter(filter, el) {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      activeFilter = filter;
      render();
    }

    function render() {
      const query = ($('#search').value || '').toLowerCase();
      const filtered = allMods.filter(m => {
        if (activeFilter === 'active' && !m.enabled) return false;
        if (activeFilter === 'inactive' && m.enabled) return false;
        if (query) return (m.name||'').toLowerCase().includes(query) || (m.id||'').toLowerCase().includes(query);
        return true;
      });

      $('#stat-total').textContent = allMods.length;
      $('#stat-active').textContent = allMods.filter(m => m.enabled).length;

      $('#mods-grid').innerHTML = filtered.map(m => \`
        <article class="card \${m.enabled ? '' : 'disabled'}">
          <div class="card-top">
            <div class="card-icon">
              \${m.iconDataUrl ? '<img src="' + m.iconDataUrl + '">' : '✦'}
            </div>
            <div class="card-info">
              <div class="card-title">\${esc(m.name)}</div>
              <div class="card-id">\${esc(m.id)} · v\${esc(m.version)}</div>
            </div>
          </div>
          <div class="card-desc">\${esc(m.description || '暂无简介')}</div>
          <div class="card-bottom">
            <div class="switch-wrap" onclick="toggleMod('\${esc(m.id)}', \${!m.enabled})">
              <div class="switch \${m.enabled ? 'active' : ''}">
                <div class="switch-knob"></div>
              </div>
              <span style="font-size:12px;font-weight:600">\${m.enabled ? '已启用' : '已停用'}</span>
            </div>
            <button class="btn danger" onclick="removeMod('\${esc(m.id)}')">卸载</button>
          </div>
        </article>
      \`).join('') || '<div style="color:var(--muted);grid-column:1/-1;text-align:center;padding:40px">尚未安装符合条件的模组。</div>';
    }

    async function refresh() {
      try {
        const data = await api('/api/mods');
        allMods = data.mods || [];
        render();
      } catch (e) { toast('刷新失败: ' + e.message); }
    }

    async function toggleMod(id, enable) {
      try {
        await api('/api/mod/' + encodeURIComponent(id) + '/' + (enable ? 'enable' : 'disable'), { method: 'POST' });
        toast((enable ? '已启用 ' : '已停用 ') + id);
        refresh();
      } catch (e) { toast('操作失败: ' + e.message); }
    }

    async function removeMod(id) {
      if (confirm('确认卸载模组 ' + id + ' 吗？')) {
        try {
          await api('/api/mod/' + encodeURIComponent(id), { method: 'DELETE' });
          toast('已卸载 ' + id);
          refresh();
        } catch (e) { toast('卸载失败: ' + e.message); }
      }
    }

    async function uploadMod(file) {
      if (!file) return;
      toast('正在上传 ' + file.name + '...');
      try {
        const buf = await file.arrayBuffer();
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        await api('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: btoa(bin) }),
        });
        toast('✔ 模组安装成功！');
        $('#file').value = '';
        refresh();
      } catch (e) { toast('安装失败: ' + e.message); }
    }

    async function launchEcho() {
      try {
        const r = await api('/api/launch', { method: 'POST' });
        toast('已启动 ECHO: ' + r.executable);
      } catch (e) { toast('启动失败: ' + e.message); }
    }

    async function reinjectMods() {
      try {
        const r = await api('/api/reinject', { method: 'POST' });
        toast('✔ 已向 ' + r.targets + ' 个窗口重新注入模组');
      } catch (e) { toast('注入失败: ' + e.message); }
    }

    const dropzone = $('#dropzone');
    dropzone.ondragover = e => { e.preventDefault(); dropzone.classList.add('dragover'); };
    dropzone.ondragleave = () => dropzone.classList.remove('dragover');
    dropzone.ondrop = e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) uploadMod(file);
    };

    refresh();
  </script>
</body>
</html>`;

const webUiDisabledHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>ShinawaseLoader · Web 控制台未开启</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #0b0f17; color: #f1f5f9; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 20px; }
    .box { max-width: 520px; background: rgba(18, 24, 38, 0.85); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 28px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
    .icon { font-size: 40px; margin-bottom: 12px; }
    h1 { font-size: 20px; margin-bottom: 8px; color: #38bdf8; }
    p { font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 10px 0; }
    code { background: rgba(0,0,0,0.4); padding: 3px 6px; border-radius: 4px; color: #e2e8f0; font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">🔒</div>
    <h1>Web 控制台默认处于关闭状态</h1>
    <p>ShinawaseLoader 后端 API 及游戏内注入 Mod 管理器运行正常。</p>
    <p>如需开启独立 Web 管理控制台，请在 <code>loader.config.json</code> 中将 <code>"enableWebConsole": true</code>，或启动时附加 <code>--web-console</code> 参数。</p>
  </div>
</body>
</html>`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
    if (request.method === 'OPTIONS') return jsonResponse(response, 204, {});
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return response.end(enableWebConsole ? webUiHtml : webUiDisabledHtml);
    }
    if (request.method === 'GET' && url.pathname === '/api/status') {
      const togetherRelay = isTogetherEnabled() && togetherRelayServer
        ? { port: togetherRelayPort, url: `http://127.0.0.1:${togetherRelayPort}` }
        : null;
      return jsonResponse(response, 200, {
        ok: true, loaderVersion, root, gameRoot, enableWebConsole, port, debugPort,
        loadMode, autoStart, autoStartMode, safeMode, debugMode, injectIntervalMs, startupDelayMs, logLevel: configuredLogLevel,
        nativeHost: nativeHostEnabled, nativePort, nativeMemoryApi, inspectPort, locale: locale || 'zh',
        debugMode, stats: loaderStats,
        dropRoot, pluginDropRoot: pluginsRoot,
        folders: { logs: logsRoot, mods: modsRoot, plugins: pluginsRoot },
        ...(togetherRelay ? { togetherRelay } : {}),
        echo: discoverEchoes(echoExe || null),
      });
    }
    if (request.method === 'GET' && url.pathname === '/api/echoes') return jsonResponse(response, 200, { echoes: discoverEchoes() });
    if (request.method === 'GET' && url.pathname === '/api/sdk') return jsonResponse(response, 200, { version: 1, mode: 'external-cdp', player: { version: 1, mode: 'external-cdp' }, extend: { version: 1, mode: 'external-cdp' }, native: { version: 1, mode: 'in-process-asar-bridge', enabled: nativeHostEnabled, memoryApi: nativeMemoryApi }, main: { version: 1, mode: 'in-process-asar-bridge' }, ...await sdkStatus() });
    if (request.method === 'GET' && url.pathname === '/api/native/status') {
      try { return jsonResponse(response, 200, await callNativeHost({ method: 'status' })); }
      catch (error) { return jsonResponse(response, 200, { ok: false, enabled: nativeHostEnabled, error: error instanceof Error ? error.message : String(error), hint: 'Enable app-asar-bridge so the in-process native host can start inside ECHO.' }); }
    }
    if (request.method === 'POST' && url.pathname === '/api/native/call') return jsonResponse(response, 200, await callNativeHost(await readRequest(request)));
    if (request.method === 'POST' && url.pathname === '/api/native/reload') return jsonResponse(response, 200, await notifyNativeHost('api') || { ok: false, error: 'native_host_unavailable' });
    if (request.method === 'GET' && url.pathname === '/api/player') return jsonResponse(response, 200, await playbackControl({ action: 'status' }));
    if (request.method === 'POST' && url.pathname === '/api/player') return jsonResponse(response, 200, await playbackControl(await readRequest(request)));
    if (request.method === 'GET' && url.pathname === '/api/logs') {
      const kind = url.searchParams.get('kind') === 'error' ? errorLogPath : logFilePath;
      const tail = Math.min(400, Math.max(20, Number(url.searchParams.get('tail') || 80)));
      let text = '';
      try {
        const raw = existsSync(kind) ? readFileSync(kind, 'utf8') : '';
        text = raw.split(/\r?\n/).filter(Boolean).slice(-tail).join('\n');
      } catch {}
      return jsonResponse(response, 200, { folder: logsRoot, logFile: logFilePath, errorFile: errorLogPath, file: kind, text });
    }
    if (request.method === 'POST' && url.pathname === '/api/locale') {
      const body = await readRequest(request);
      locale = persistLocale(body.locale);
      return jsonResponse(response, 200, { ok: true, locale });
    }
    if (request.method === 'POST' && url.pathname === '/api/debug') {
      const body = await readRequest(request);
      const enabled = body.enabled === true;
      writeJson(loaderConfigPath, { ...readJson(loaderConfigPath, loaderConfig), debugMode: enabled, enableWebConsole: enabled || loaderConfig.enableWebConsole });
      return jsonResponse(response, 200, { ok: true, debugMode: enabled });
    }
    if (request.method === 'POST' && url.pathname === '/api/perf') {
      const report = {
        generatedAt: new Date().toISOString(),
        loaderVersion,
        locale: locale || 'zh',
        uptimeMs: Date.now() - loaderStats.startedAt,
        injects: loaderStats.injects,
        lastInjectAt: loaderStats.lastInjectAt,
        memory: process.memoryUsage(),
        port, debugPort, inspectPort, nativePort,
        packages: modSummaries().map((item) => ({ id: item.id, enabled: item.enabled, version: item.version })),
      };
      const file = join(logsRoot, `perf-${Date.now()}.json`);
      writeJson(file, report);
      return jsonResponse(response, 200, { ok: true, file, report });
    }
    if (request.method === 'GET' && url.pathname === '/api/update') {
      try {
        const remote = await fetch('https://raw.githubusercontent.com/ChunchunOwO/ShinawaseLoader/main/ShinawaseLoader/loader-version.json');
        const info = await remote.json();
        return jsonResponse(response, 200, { ok: true, local: loaderVersion, remote: info.version, updateAvailable: String(info.version || '') !== String(loaderVersion) });
      } catch (error) {
        return jsonResponse(response, 200, { ok: false, local: loaderVersion, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/log') {
      const body = await readRequest(request);
      const id = safeId(body.id) ? body.id : 'unknown-mod';
      const level = ['debug', 'info', 'log', 'warn', 'error'].includes(body.level) ? String(body.level).toUpperCase() : 'INFO';
      const message = String(body.message || '').slice(0, 8192);
      log(`MOD:${level}`, `${id} ${message}`);
      return jsonResponse(response, 204, {});
    }
    if (request.method === 'GET' && url.pathname === '/api/mods') {
      const packages = modSummaries();
      return jsonResponse(response, 200, { mods: packages, plugins: packages.filter((item) => item.kind === 'plugin'), root, modsRoot, pluginsRoot });
    }
    const fileMatch = url.pathname.match(/^\/api\/mod\/([^/]+)\/file\/(.+)$/u);
    if (fileMatch && request.method === 'GET') {
      const id = decodeURIComponent(fileMatch[1]);
      const fileName = decodeURIComponent(fileMatch[2]);
      const file = modFile(id, fileName);
      response.writeHead(200, {
        'content-type': file.contentType,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'access-control-allow-origin': '*',
      });
      return response.end(readFileSync(file.target));
    }
    if (request.method === 'POST' && url.pathname === '/api/import') {
      const body = await readRequest(request);
      const temp = join(root, `.import-${randomUUID()}.echomod`);
      writeFileSync(temp, Buffer.from(String(body.data || ''), 'base64'));
      try {
        const manifest = importPackage(temp);
        return jsonResponse(response, 200, { manifest });
      } finally { rmSync(temp, { force: true }); }
    }
    const configMatch = url.pathname.match(/^\/api\/mod\/([^/]+)\/config$/u);
    if (configMatch && request.method === 'GET') {
      const id = decodeURIComponent(configMatch[1]);
      const manifest = readManifest(id);
      return jsonResponse(response, 200, { id, config: readModConfig(id), schema: readModConfigSchema(id, manifest), manifest });
    }
    if (configMatch && request.method === 'PUT') {
      const id = decodeURIComponent(configMatch[1]);
      const body = await readRequest(request);
      writeModConfig(id, body.config);
      void requestInjection('config').catch((error) => log('WARN', 'config injection failed', error));
      return jsonResponse(response, 200, { ok: true, config: readModConfig(id) });
    }
    const match = url.pathname.match(/^\/api\/mod\/([^/]+)\/(enable|disable)$/u);
    if (request.method === 'POST' && match) {
      const id = decodeURIComponent(match[1]);
      setEnabled(id, match[2] === 'enable');
      if (match[2] === 'enable') void requestInjection('enable').catch((error) => log('WARN', 'enable injection failed', error));
      else void removeInjected(id);
      return jsonResponse(response, 200, { ok: true });
    }
    const deleteMatch = url.pathname.match(/^\/api\/mod\/([^/]+)$/u);
    if (request.method === 'DELETE' && deleteMatch) {
      const id = decodeURIComponent(deleteMatch[1]);
      setEnabled(id, false);
      void removeInjected(id);
      removeMod(id);
      return jsonResponse(response, 200, { ok: true });
    }
    if (request.method === 'POST' && url.pathname === '/api/launch') {
      return jsonResponse(response, 200, { executable: launchEcho() });
    }
    if (request.method === 'POST' && url.pathname === '/api/reinject') {
      return jsonResponse(response, 200, { targets: await requestInjection('api') });
    }
    if (request.method === 'POST' && url.pathname === '/api/proxy') {
      const body = await readRequest(request);
      const target = new URL(String(body.url));
      if (!/^https?:$/u.test(target.protocol)) throw new Error('proxy_url_not_allowed');
      const remote = await fetch(target, {
        method: body.method || 'GET',
        headers: body.headers || {},
        body: body.body === undefined ? undefined : (typeof body.body === 'string' ? body.body : JSON.stringify(body.body)),
      });
      const text = await remote.text();
      let value;
      try { value = JSON.parse(text); } catch { value = text; }
      return jsonResponse(response, remote.status, value);
    }
    if (request.method === 'POST' && url.pathname === '/api/upload') {
      const body = await readRequest(request);
      const filePath = resolve(String(body.filePath || ''));
      if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new Error('upload_file_missing');
      const remote = await fetch(String(body.url), {
        method: 'PUT',
        headers: { 'content-type': body.contentType || 'application/octet-stream', ...(body.headers || {}) },
        body: createReadStream(filePath),
        duplex: 'half',
      });
      return jsonResponse(response, remote.status, { ok: remote.ok, status: remote.status, text: await remote.text() });
    }
    jsonResponse(response, 404, { error: 'not_found' });
  } catch (error) {
    jsonResponse(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
});

const printList = () => {
  const mods = modSummaries();
  console.log(`${c.white}${t('packages')}${c.reset}`);
  if (!mods.length) {
    console.log(`${c.gray}  ${t('noneInstalled')}${c.reset}`);
    return;
  }
  for (const item of mods) {
    const mark = item.enabled ? `${c.green}${t('on')} ${c.reset}` : `${c.gray}${t('off')}${c.reset}`;
    console.log(`  ${mark}  ${item.name}  ${c.gray}${item.id}  ${item.version}${c.reset}`);
  }
};

const run = async () => {
  if (!locale) locale = await promptLocale();
  printLogo();
  if (command === 'init' || command === 'install-loader') {
    writeJson(statePath, readState());
    console.log(`${c.gray}${t('initialized')}${c.reset}  ${root}`);
    return;
  }
  if (command === 'list') return printList();
  if (command === 'import' || command === 'install') {
    const source = args[0];
    if (!source) throw new Error('ShinawaseLoader.mjs import <file.echomod|file.echo>');
    const manifest = importPackage(source);
    console.log(`${c.gray}${t('imported')}${c.reset}  ${manifest.name || manifest.id}  ${manifest.version || '1.0.0'}`);
    return;
  }
  if (command === 'uninstall') {
    removeMod(args[0]);
    console.log(`${c.gray}${t('removed')}${c.reset}  ${args[0]}`);
    return;
  }
  if (command === 'enable' || command === 'disable') {
    setEnabled(args[0], command === 'enable');
    if (command === 'enable') await requestInjection('cli').catch(() => undefined);
    console.log(`${c.gray}${command === 'enable' ? t('enabled') : t('disabled')}${c.reset}  ${args[0]}`);
    return;
  }
  if (command === 'launch') {
    console.log(`${c.gray}${t('launched')}${c.reset}  ${launchEcho()}`);
    return;
  }

  const isAttach = command === 'attach';
  try {
    const existing = await fetch(`http://127.0.0.1:${port}/api/status`);
    if (existing.ok) {
      const status = await existing.json();
      if (status?.ok) {
        console.log(`${c.gray}${t('listen')}${c.reset}  ${t('alreadyRunning')} ${port}`);
        if (isAttach) startWatch();
        if (command === 'run') launchEcho();
        return;
      }
    }
  } catch {}
  relayLifecycleActive = true;
  startDropWatcher();
  await syncTogetherRelay();
  server.listen(port, '127.0.0.1', () => {
    console.log(`${c.gray}${t('listen')}${c.reset}   http://127.0.0.1:${port}`);
    console.log(`${c.gray}${t('cdp')}${c.reset}      ${debugPort}`);
    console.log(`${c.gray}${t('inspect')}${c.reset}  ${inspectPort}`);
    console.log(`${c.gray}${t('native')}${c.reset}   ${nativeHostEnabled ? nativePort : t('off')}`);
    if (togetherRelayServer) console.log(`${c.gray}${t('together')}${c.reset} ${togetherRelayPort}`);
    console.log(`${c.gray}${t('console')}${c.reset}  ${enableWebConsole ? t('on') : t('off')}`);
  });

  if (isAttach) {
    void attachMainInspector();
    startWatch();
  }
  if (command === 'run') launchEcho();
};

run().catch((error) => {
  console.error(`\n${c.gray}${t('failed')}${c.reset}`, error instanceof Error ? error.message : error, '\n');
  process.exitCode = 1;
});
