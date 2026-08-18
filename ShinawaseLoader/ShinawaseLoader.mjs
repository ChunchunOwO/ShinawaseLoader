#!/usr/bin/env node
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync, copyFileSync, renameSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

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
const printLogo = () => console.log(`${c.bCyan}███████╗██╗  ██╗██╗███╗   ██╗ █████╗ ██╗    ██╗ █████╗ ███████╗███████╗
██╔════╝██║  ██║██║████╗  ██║██╔══██╗██║    ██║██╔══██╗██╔════╝██╔════╝
███████╗███████║██║██╔██╗ ██║███████║██║ █╗ ██║███████║███████╗█████╗
╚════██║██╔══██║██║██║╚██╗██║██╔══██║██║███╗██║██╔══██║╚════██║██╔══╝
███████║██║  ██║██║██║ ╚████║██║  ██║╚███╔███╔╝██║  ██║███████║███████╗
╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚══════╝${c.reset}
${c.bold}${c.white}ShinawaseLoader v0.0.1Beta${c.reset}\n`);

const loaderDir = dirname(fileURLToPath(import.meta.url));
const loaderVersion = '1.1.0';
const root = resolve(process.env.ECHO_MOD_HOME || loaderDir);
const workspaceRoot = resolve(process.env.ECHO_WORKSPACE_ROOT || join(root, '..'));
const modsRoot = resolve(process.env.ECHO_MODS_HOME || join(root, '..', 'Mods'));
const statePath = join(root, 'loader-state.json');
const loaderConfigPath = join(root, 'loader.config.json');
const installedRoot = join(modsRoot, 'installed');
const dropRoot = modsRoot;
const processedRoot = join(modsRoot, '.processed');
const defaultPort = Number(process.env.ECHO_MOD_PORT || 17862);
const defaultDebugPort = Number(process.env.ECHO_MOD_DEBUG_PORT || 9229);
const togetherRelayPort = Number(process.env.ECHO_TOGETHER_RELAY_PORT || 47891);
const packageTypes = new Set(['echo-external-mod', 'echo-plugin-package', 'echo-next-plugin-package']);
const logFilePath = join(root, 'loader-debug.log');

const readJson = (file, fallback) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
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
  const line = `[${new Date().toISOString()}] [${level}] ${message}${values.length ? ` ${values.map(formatLogValue).join(' ')}` : ''}`;
  try { appendFileSync(logFilePath, `${line}\n`, 'utf8'); } catch {}
  const method = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  method(line);
};

const loaderConfig = readJson(loaderConfigPath, {
  autoStart: true,
  enableWebConsole: false,
  showConsole: false,
  port: 17862,
  debugPort: 9229,
});

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'serve';
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const enableWebConsole = args.includes('--web-console') || String(process.env.ECHO_ENABLE_WEB_CONSOLE || '').toLowerCase() === 'true' || loaderConfig.enableWebConsole === true;
const port = Number(option('--port', process.env.ECHO_MOD_PORT || loaderConfig.port || defaultPort));
const debugPort = Number(option('--debug-port', process.env.ECHO_MOD_DEBUG_PORT || loaderConfig.debugPort || defaultDebugPort));
const echoExe = option('--echo', null);

mkdirSync(installedRoot, { recursive: true });
mkdirSync(dropRoot, { recursive: true });
mkdirSync(processedRoot, { recursive: true });

const readState = () => readJson(statePath, { version: 1, mods: {} });
const saveState = (state) => writeJson(statePath, state);
const safeId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{1,63}$/iu.test(id);
const safeRelative = (value) => {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('invalid_mod_file');
  const clean = normalize(value).replaceAll('\\', '/');
  if (clean.startsWith('../') || clean === '..' || clean.startsWith('/') || /^[a-z]:/iu.test(clean)) throw new Error('invalid_mod_file');
  return clean;
};
const installedDirectory = (id) => join(installedRoot, id);
const readManifest = (id) => readJson(join(installedDirectory(id), 'echo.mod.json'), null);
const configPath = (id, manifest = readManifest(id)) => join(installedDirectory(id), safeRelative(manifest?.config || 'config.json'));
const readModConfig = (id) => {
  const manifest = readManifest(id);
  if (!manifest) throw new Error('mod_not_installed');
  return readJson(configPath(id, manifest), {});
};
const writeModConfig = (id, config) => {
  const manifest = readManifest(id);
  if (!manifest) throw new Error('mod_not_installed');
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('mod_config_object_required');
  writeJson(configPath(id, manifest), config);
};
const readFiles = (id) => {
  const dir = installedDirectory(id);
  const files = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'echo.mod.json') continue;
    files[entry.name] = readFileSync(join(dir, entry.name), 'utf8');
  }
  return files;
};
const iconDataUrl = (id, manifest) => {
  if (!manifest?.icon) return null;
  const iconPath = join(installedDirectory(id), safeRelative(manifest.icon));
  if (!existsSync(iconPath) || extname(iconPath).toLowerCase() !== '.svg') return null;
  return `data:image/svg+xml;base64,${readFileSync(iconPath).toString('base64')}`;
};
const modSummaries = () => {
  const state = readState();
  return Object.keys(state.mods).sort().flatMap((id) => {
    const manifest = readManifest(id);
    if (!manifest) return [];
    return [{
      id,
      name: manifest.name || id,
      version: manifest.version || '1.0.0',
      description: manifest.description || '',
      iconDataUrl: iconDataUrl(id, manifest),
      configFile: manifest.config || 'config.json',
      enabled: state.mods[id].enabled === true,
      directory: installedDirectory(id),
    }];
  });
};

const importPackage = (source) => {
  const payload = readJson(resolve(source), null);
  if (!payload || !packageTypes.has(payload.type) || !payload.manifest || !safeId(payload.manifest.id)) throw new Error('invalid_echomod_package');
  const manifest = { ...payload.manifest, entry: payload.manifest.entry || 'mod.js' };
  const files = Array.isArray(payload.files) ? payload.files : [];
  const target = installedDirectory(manifest.id);
  const validatedFiles = files.map((file) => {
    const path = safeRelative(file?.path);
    if (typeof file.content !== 'string') throw new Error('invalid_mod_file_content');
    const targetFile = join(target, path);
    if (relative(target, targetFile).startsWith('..')) throw new Error('invalid_mod_file');
    return { path, content: file.content };
  });
  const entryPath = safeRelative(manifest.entry);
  if (!validatedFiles.some((file) => file.path === entryPath)) throw new Error('mod_entry_missing');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  writeJson(join(target, 'echo.mod.json'), manifest);
  for (const file of validatedFiles) {
    const path = file.path;
    const targetFile = join(target, path);
    mkdirSync(dirname(targetFile), { recursive: true });
    writeFileSync(targetFile, file.content, 'utf8');
  }
  const state = readState();
  state.mods[manifest.id] = { enabled: state.mods[manifest.id]?.enabled === true, importedAt: new Date().toISOString() };
  saveState(state);
  log('INFO', `installed mod ${manifest.id} v${manifest.version || '1.0.0'}`);
  return manifest;
};

const removeMod = (id) => {
  if (!safeId(id)) throw new Error('invalid_mod_id');
  const state = readState();
  rmSync(installedDirectory(id), { recursive: true, force: true });
  delete state.mods[id];
  saveState(state);
  log('INFO', `uninstalled mod ${id}`);
};
const setEnabled = (id, enabled) => {
  if (!safeId(id) || !readManifest(id)) throw new Error('mod_not_installed');
  const state = readState();
  state.mods[id] = { ...(state.mods[id] || {}), enabled };
  saveState(state);
  log('INFO', `${enabled ? 'enabled' : 'disabled'} mod ${id}`);
};

let dropWatcher = null;
let dropTimer = null;
const processDropFile = (fileName) => {
  if (!fileName || extname(fileName).toLowerCase() !== '.echomod') return;
  const source = join(dropRoot, fileName);
  if (!existsSync(source) || !statSync(source).isFile()) return;
  try {
    const manifest = importPackage(source);
    const archived = join(processedRoot, `${Date.now()}-${basename(fileName)}`);
    renameSync(source, archived);
    log('INFO', `auto-imported ${manifest.id} from ${basename(fileName)}`);
    void injectEnabled().catch((error) => log('WARN', `reinject after auto-import failed: ${error.message}`));
  } catch (error) {
    log('WARN', `auto-import skipped ${basename(fileName)}: ${error instanceof Error ? error.message : String(error)}`);
  }
};
const scanDropRoot = () => {
  for (const entry of readdirSync(dropRoot, { withFileTypes: true })) {
    if (entry.isFile() && extname(entry.name).toLowerCase() === '.echomod') processDropFile(entry.name);
  }
};
const startDropWatcher = () => {
  if (dropWatcher) return;
  try { dropWatcher = watch(dropRoot, (_event, fileName) => processDropFile(String(fileName || ''))); } catch (error) { log('WARN', `drop watcher unavailable: ${error.message}`); }
  dropTimer = setInterval(scanDropRoot, 2000);
  scanDropRoot();
  log('INFO', `watching ${dropRoot} for .echomod files`);
};

let echoProcess = null;
let watchTimer = null;
let lastTargets = new Set();
let lastInjectedTargetCount = -1;
const cdpEvaluate = async (webSocketUrl, expression) => {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', resolvePromise, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const call = (method, params) => new Promise((resolvePromise, reject) => {
    const id = ++sequence;
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message || method)); else resolvePromise(message.result);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
  try {
    await call('Runtime.enable', {});
    return await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  } finally { socket.close(); }
};
const cdpTargets = async () => {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
  if (!response.ok) throw new Error(`cdp_http_${response.status}`);
  const targets = await response.json();
  return targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
};
const externalContext = (id, manifest) => ({
  id,
  manifest,
  config: readModConfig(id),
  baseUrl: `http://127.0.0.1:${port}`,
});

const injectLoaderUi = async (target) => {
  const expression = `(() => {
    if (window.__echoExternalLoaderUi?.version === 2) return 'already';
    window.__echoExternalLoaderUi?.dispose?.();
    const base = 'http://127.0.0.1:${port}';
    let panel = null;
    let configModal = null;
    let activeNav = null;

    const css = document.createElement('style');
    css.id = 'echo-loader-ui-style';
    css.textContent = \`
      @keyframes echo-fade-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes echo-toast-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes echo-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

      .echo-external-mod-panel {
        grid-row: 2; grid-column: 2; min-width: 0; min-height: 0; z-index: 1;
        background: var(--theme-page-bg, var(--color-bg, #0f0f23));
        color: var(--theme-text-primary, var(--color-text, #f8fafc));
        border: 0; padding: clamp(20px, 3vw, 36px); overflow-y: auto; overflow-x: hidden;
        box-shadow: none;
        font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
        box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; position: relative;
        animation: echo-fade-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
      }
      .echo-external-mod-panel[hidden] { display: none !important; }
      .echo-external-mod-panel::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .32; background-image: radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--theme-accent, #22c55e) 18%, transparent), transparent 34%), radial-gradient(circle at 85% 70%, color-mix(in srgb, #4338ca 14%, transparent), transparent 38%); }
      .echo-external-mod-panel > * { position: relative; z-index: 1; }
      .echo-external-mod-panel .echo-mod-card { background: color-mix(in srgb, var(--theme-panel-bg, #171e2a) 88%, transparent); border-color: var(--color-border, rgba(255,255,255,.12)); }
      .echo-external-mod-panel .echo-modal-card { background: var(--theme-panel-bg, #111827); color: var(--theme-text-primary, #fff); }
      .echo-external-mod-panel .echo-mod-title, .echo-external-mod-panel .echo-modal-title { color: var(--theme-text-primary, #fff); }
      .echo-external-mod-panel .echo-mod-desc, .echo-external-mod-panel .echo-modal-body > div { color: var(--theme-text-secondary, #94a3b8) !important; }
      .echo-external-mod-panel * { box-sizing: border-box; }
      .echo-external-mod-panel::-webkit-scrollbar { width: 5px; }
      .echo-external-mod-panel::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.18); border-radius: 4px; }

      .echo-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
      .echo-brand { display: flex; align-items: center; gap: 10px; }
      .echo-brand-icon { width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, #38bdf8, #818cf8); display: grid; place-items: center; color: #0f172a; font-weight: 900; font-size: 15px; box-shadow: 0 0 16px rgba(56, 189, 248, 0.35); }
      .echo-brand-title { font-size: 17px; font-weight: 700; background: linear-gradient(135deg, #ffffff, #93c5fd); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
      .echo-brand-badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; background: rgba(56, 189, 248, 0.14); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
      .echo-status-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #34d399; font-weight: 600; }
      .echo-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399; animation: echo-pulse 2s infinite ease-in-out; }

      .echo-panel-actions { display: flex; align-items: center; gap: 8px; }
      .echo-search-box { position: relative; width: 180px; }
      .echo-search-box input { width: 100%; padding: 6px 10px 6px 26px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(0, 0, 0, 0.3); color: #fff; font-size: 12px; outline: none; transition: all 0.18s; }
      .echo-search-box input:focus { border-color: #38bdf8; width: 220px; }
      .echo-search-icon { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); font-size: 11px; opacity: 0.5; }

      .echo-btn {
        padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(30, 41, 59, 0.7); color: #f1f5f9; font: 600 12px inherit;
        cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1); outline: none; user-select: none;
      }
      .echo-btn:hover { background: rgba(51, 65, 85, 0.85); border-color: rgba(255, 255, 255, 0.25); transform: translateY(-1px); }
      .echo-btn:active { transform: scale(0.97); }
      .echo-btn.primary { background: linear-gradient(135deg, #4f46e5, #3b82f6); border-color: rgba(129, 140, 248, 0.4); color: #fff; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35); }
      .echo-btn.primary:hover { box-shadow: 0 6px 20px rgba(79, 70, 229, 0.55); }
      .echo-btn.danger { background: rgba(225, 29, 72, 0.14); border-color: rgba(244, 63, 94, 0.3); color: #fb7185; }
      .echo-btn.danger:hover { background: rgba(225, 29, 72, 0.25); border-color: rgba(244, 63, 94, 0.5); }
      .echo-btn.icon-only { width: 28px; height: 28px; padding: 0; border-radius: 50%; }

      .echo-dropzone {
        border: 1px dashed rgba(56, 189, 248, 0.35); background: rgba(56, 189, 248, 0.04);
        border-radius: 12px; padding: 14px; text-align: center; color: #94a3b8; font-size: 12px;
        transition: all 0.2s; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .echo-dropzone:hover, .echo-dropzone.dragover { background: rgba(56, 189, 248, 0.12); border-color: #38bdf8; color: #e2e8f0; transform: scale(1.005); }

      .echo-filter-row { display: flex; gap: 6px; align-items: center; margin: 2px 0 6px; }
      .echo-filter-chip { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; background: rgba(255, 255, 255, 0.05); color: #94a3b8; border: 1px solid transparent; transition: all 0.15s; }
      .echo-filter-chip:hover { color: #fff; background: rgba(255, 255, 255, 0.09); }
      .echo-filter-chip.active { background: rgba(56, 189, 248, 0.18); color: #38bdf8; border-color: rgba(56, 189, 248, 0.35); }

      .echo-mod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
      .echo-mod-card {
        background: rgba(23, 30, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px;
        transition: all 0.2s ease; position: relative; overflow: hidden;
      }
      .echo-mod-card:hover { background: rgba(30, 41, 59, 0.85); border-color: rgba(255, 255, 255, 0.18); transform: translateY(-2px); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35); }
      .echo-mod-card.disabled { opacity: 0.72; filter: grayscale(0.2); }

      .echo-card-top { display: flex; gap: 12px; align-items: flex-start; }
      .echo-mod-icon { width: 44px; height: 44px; border-radius: 10px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); flex-shrink: 0; display: grid; place-items: center; overflow: hidden; }
      .echo-mod-icon img { width: 100%; height: 100%; object-fit: contain; }
      .echo-mod-fallback-icon { font-size: 20px; color: #38bdf8; }

      .echo-mod-info { flex: 1; min-width: 0; }
      .echo-mod-title { font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .echo-mod-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 11px; }
      .echo-mod-version { padding: 1px 5px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); color: #cbd5e1; font-family: ui-monospace, monospace; }
      .echo-mod-id { color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .echo-mod-desc { font-size: 12px; color: #94a3b8; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 34px; margin: 0; }

      .echo-card-bottom { display: flex; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.06); }
      .echo-switch-row { display: flex; align-items: center; gap: 7px; cursor: pointer; }
      .echo-switch { position: relative; width: 34px; height: 18px; background: rgba(255, 255, 255, 0.15); border-radius: 18px; transition: all 0.2s; }
      .echo-switch.active { background: #34d399; box-shadow: 0 0 10px rgba(52, 211, 153, 0.4); }
      .echo-switch-knob { position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: all 0.2s; }
      .echo-switch.active .echo-switch-knob { left: 18px; }
      .echo-switch-label { font-size: 11px; font-weight: 600; color: #cbd5e1; }

      .echo-card-btns { display: flex; gap: 5px; }

      .echo-empty-box { text-align: center; padding: 48px 24px; color: #64748b; }
      .echo-empty-icon { font-size: 42px; opacity: 0.5; margin-bottom: 8px; }

      .echo-modal-overlay {
        position: fixed; inset: 0; z-index: 2147483645; background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(8px); display: grid; place-items: center; padding: 20px;
        animation: echo-fade-in 0.18s ease;
      }
      .echo-modal-card {
        background: #111827; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 14px;
        width: min(560px, 94vw); max-height: 85vh; display: flex; flex-direction: column; gap: 14px;
        padding: 20px; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8);
      }
      .echo-modal-header { display: flex; align-items: center; justify-content: space-between; }
      .echo-modal-title { font-size: 15px; font-weight: 700; color: #fff; }
      .echo-modal-body { flex: 1; display: flex; flex-direction: column; gap: 10px; min-height: 220px; }
      .echo-modal-body textarea {
        width: 100%; height: 260px; background: #0b0f17; border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px; color: #e2e8f0; font: 12px ui-monospace, SFMono-Regular, Consolas, monospace;
        padding: 12px; box-sizing: border-box; resize: vertical; outline: none;
      }
      .echo-modal-body textarea:focus { border-color: #38bdf8; }
      .echo-modal-footer { display: flex; justify-content: flex-end; gap: 8px; }

      .echo-toast {
        position: fixed; right: 28px; bottom: 28px; z-index: 2147483647;
        background: rgba(15, 23, 42, 0.95); color: #fff; padding: 10px 16px; border-radius: 10px;
        font: 600 12px -apple-system, system-ui, sans-serif; border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5); display: flex; align-items: center; gap: 8px;
        animation: echo-toast-in 0.22s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: none;
      }
      .echo-toast.success { border-color: rgba(52, 211, 153, 0.4); color: #34d399; }
      .echo-toast.error { border-color: rgba(244, 63, 94, 0.4); color: #fb7185; }
      @media (prefers-reduced-motion: reduce) { .echo-external-mod-panel, .echo-toast, .echo-status-dot { animation: none !important; transition: none !important; } }
    \`;
    document.head.append(css);

    const toast = (text, type = 'info') => {
      const existing = document.querySelector('.echo-toast');
      if (existing) existing.remove();
      const el = document.createElement('div');
      el.className = 'echo-toast ' + type;
      el.textContent = String(text);
      document.body.append(el);
      setTimeout(() => el.remove(), 3200);
    };
    window.__echoModToast = toast;

    const esc = (val) => String(val ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const api = async (path, options) => {
      const res = await fetch(base + path, options);
      const val = await res.json();
      if (!res.ok) throw new Error(val.error || '请求失败 (' + res.status + ')');
      return val;
    };

    const setPanelVisible = (visible) => {
      if (!panel) return;
      panel.hidden = !visible;
      document.querySelectorAll('.page-surface').forEach((surface) => {
        if (surface === panel) return;
        if (visible) {
          surface.dataset.echoExternalHidden = 'true';
          surface.style.setProperty('display', 'none', 'important');
        } else if (surface.dataset.echoExternalHidden === 'true') {
          delete surface.dataset.echoExternalHidden;
          surface.style.removeProperty('display');
        }
      });
      if (activeNav) {
        activeNav.dataset.active = String(visible);
        activeNav.setAttribute('aria-current', visible ? 'page' : 'false');
      }
    };
    const hidePanel = () => setPanelVisible(false);

    let allMods = [];
    let currentFilter = 'all';
    let searchQuery = '';

    const renderModList = () => {
      if (!panel) return;
      const listEl = panel.querySelector('[data-mod-list]');
      const filtered = allMods.filter((m) => {
        if (currentFilter === 'active' && !m.enabled) return false;
        if (currentFilter === 'inactive' && m.enabled) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (m.name || '').toLowerCase().includes(q) || (m.id || '').toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q);
        }
        return true;
      });

      panel.querySelector('[data-count-all]').textContent = allMods.length;
      panel.querySelector('[data-count-active]').textContent = allMods.filter((m) => m.enabled).length;
      panel.querySelector('[data-count-inactive]').textContent = allMods.filter((m) => !m.enabled).length;

      if (!filtered.length) {
        listEl.innerHTML = \`
          <div class="echo-empty-box">
            <div class="echo-empty-icon">📦</div>
            <div>\${searchQuery ? '没有找到匹配的模组' : '尚未安装任何模组'}</div>
            <div style="font-size:11px;margin-top:4px;color:#475569">可直接拖拽 .echomod 文件至窗口进行安装</div>
          </div>\`;
        return;
      }

      listEl.innerHTML = '<div class="echo-mod-grid">' + filtered.map((m) => \`
        <article class="echo-mod-card \${m.enabled ? '' : 'disabled'}">
          <div class="echo-card-top">
            <div class="echo-mod-icon">
              \${m.iconDataUrl ? '<img src="' + m.iconDataUrl + '">' : '<span class="echo-mod-fallback-icon">✦</span>'}
            </div>
            <div class="echo-mod-info">
              <div class="echo-mod-title" title="\${esc(m.name)}">\${esc(m.name)}</div>
              <div class="echo-mod-meta">
                <span class="echo-mod-version">v\${esc(m.version)}</span>
                <span class="echo-mod-id" title="\${esc(m.id)}">\${esc(m.id)}</span>
              </div>
            </div>
          </div>
          <p class="echo-mod-desc">\${esc(m.description || '暂无模组简介。')}</p>
          <div class="echo-card-bottom">
            <div class="echo-switch-row" data-action="toggle" data-id="\${esc(m.id)}" data-enabled="\${m.enabled}">
              <div class="echo-switch \${m.enabled ? 'active' : ''}">
                <div class="echo-switch-knob"></div>
              </div>
              <span class="echo-switch-label">\${m.enabled ? '已启用' : '已停用'}</span>
            </div>
            <div class="echo-card-btns">
              <button class="echo-btn" data-action="config" data-id="\${esc(m.id)}" data-name="\${esc(m.name)}" title="修改模组配置">配置</button>
              <button class="echo-btn danger" data-action="remove" data-id="\${esc(m.id)}" title="卸载模组">卸载</button>
            </div>
          </div>
        </article>
      \`).join('') + '</div>';
    };

    const refresh = async () => {
      if (!panel) return;
      try {
        const data = await api('/api/mods');
        allMods = data.mods || [];
        renderModList();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const openConfigModal = async (modId, modName) => {
      if (configModal) configModal.remove();
      try {
        const res = await api('/api/mod/' + encodeURIComponent(modId) + '/config');
        const rawJson = JSON.stringify(res.config || {}, null, 2);
        configModal = document.createElement('div');
        configModal.className = 'echo-modal-overlay';
        configModal.innerHTML = \`
          <div class="echo-modal-card">
            <div class="echo-modal-header">
              <div class="echo-modal-title">模组配置 · \${esc(modName)} <span style="font-size:11px;color:#64748b">(\${esc(modId)})</span></div>
              <button class="echo-btn icon-only" data-modal-close aria-label="关闭">×</button>
            </div>
            <div class="echo-modal-body">
              <textarea data-config-json>\${esc(rawJson)}</textarea>
              <div style="font-size:11px;color:#64748b">支持标准的 JSON 格式配置项，保存后自动对运行中模组生效。</div>
            </div>
            <div class="echo-modal-footer">
              <button class="echo-btn" data-modal-format>格式化</button>
              <button class="echo-btn" data-modal-close>取消</button>
              <button class="echo-btn primary" data-modal-save>保存配置</button>
            </div>
          </div>
        \`;
        document.body.append(configModal);

        configModal.querySelector('[data-modal-close]').onclick = () => { configModal.remove(); configModal = null; };
        configModal.querySelector('[data-modal-format]').onclick = () => {
          try {
            const parsed = JSON.parse(configModal.querySelector('[data-config-json]').value);
            configModal.querySelector('[data-config-json]').value = JSON.stringify(parsed, null, 2);
          } catch (e) {
            toast('JSON 格式错误: ' + e.message, 'error');
          }
        };
        configModal.querySelector('[data-modal-save]').onclick = async () => {
          try {
            const parsed = JSON.parse(configModal.querySelector('[data-config-json]').value);
            await api('/api/mod/' + encodeURIComponent(modId) + '/config', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ config: parsed }),
            });
            toast('配置已成功保存！', 'success');
            configModal.remove();
            configModal = null;
            refresh();
          } catch (e) {
            toast('保存失败: ' + e.message, 'error');
          }
        };
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const processFileImport = async (file) => {
      if (!file) return;
      toast('正在导入模组 ' + file.name + '...', 'info');
      try {
        const buffer = await file.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const res = await api('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: btoa(binary) }),
        });
            toast('成功导入模组 [' + (res.manifest?.name || res.manifest?.id) + ']', 'success');
        refresh();
      } catch (err) {
        toast('导入失败: ' + err.message, 'error');
      }
    };

    const open = async () => {
      if (panel) { setPanelVisible(panel.hidden); return; }
      panel = document.createElement('section');
      panel.className = 'echo-external-mod-panel';
      panel.innerHTML = \`
        <div class="echo-panel-header">
          <div class="echo-brand">
            <div class="echo-brand-icon">✦</div>
            <div>
              <div style="display:flex;align-items:center;gap:6px">
                <span class="echo-brand-title">ShinawaseLoader</span>
                <span class="echo-brand-badge">ECHO Mods</span>
              </div>
              <div class="echo-status-pill"><span class="echo-status-dot"></span>已连接 Loader 核心</div>
            </div>
          </div>
          <div class="echo-panel-actions">
            <div class="echo-search-box">
              <span class="echo-search-icon">⌕</span>
              <input type="text" placeholder="搜索模组..." data-search>
            </div>
            <input type="file" accept=".echomod,application/json" data-file style="display:none">
            <button class="echo-btn primary" data-action="import-btn">＋ 导入模组</button>
            <button class="echo-btn" data-action="reinject-btn" title="重新注入已启用的模组">↻</button>
            <button class="echo-btn icon-only" data-action="close" title="关闭面板">×</button>
          </div>
        </div>

        <div class="echo-dropzone" data-dropzone>
          <span>拖放 <b>.echomod</b> 文件到此直接安装，或点击选择文件</span>
        </div>

        <div class="echo-filter-row">
          <div class="echo-filter-chip active" data-filter="all">全部 (<span data-count-all>0</span>)</div>
          <div class="echo-filter-chip" data-filter="active">已启用 (<span data-count-active>0</span>)</div>
          <div class="echo-filter-chip" data-filter="inactive">已停用 (<span data-count-inactive>0</span>)</div>
        </div>

        <div data-mod-list style="flex:1"></div>
      \`;

      const host = document.querySelector('.app-shell');
      (host || document.body).append(panel);
      setPanelVisible(true);

      const fileInput = panel.querySelector('[data-file]');
      panel.querySelector('[data-action="import-btn"]').onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) processFileImport(file);
        fileInput.value = '';
      };

      const dropzone = panel.querySelector('[data-dropzone]');
      dropzone.onclick = () => fileInput.click();
      dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('dragover'); };
      dropzone.ondragleave = () => dropzone.classList.remove('dragover');
      dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const file = e.dataTransfer?.files?.[0];
        if (file) processFileImport(file);
      };

      panel.querySelector('[data-search]').oninput = (e) => {
        searchQuery = e.target.value;
        renderModList();
      };

      panel.querySelectorAll('[data-filter]').forEach((chip) => {
        chip.onclick = () => {
          panel.querySelectorAll('[data-filter]').forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
          currentFilter = chip.dataset.filter;
          renderModList();
        };
      });

      panel.querySelector('[data-action="reinject-btn"]').onclick = async () => {
        try {
          const r = await api('/api/reinject', { method: 'POST' });
          toast('已向 ' + r.targets + ' 个窗口重新注入模组', 'success');
          refresh();
        } catch (e) { toast(e.message, 'error'); }
      };

      panel.querySelector('[data-action="close"]').onclick = hidePanel;

      panel.addEventListener('click', async (e) => {
        const toggleRow = e.target.closest('[data-action="toggle"]');
        if (toggleRow) {
          const id = toggleRow.dataset.id;
          const nextState = toggleRow.dataset.enabled !== 'true';
          try {
            await api('/api/mod/' + encodeURIComponent(id) + '/' + (nextState ? 'enable' : 'disable'), { method: 'POST' });
            toast((nextState ? '已启用 ' : '已停用 ') + id, 'success');
            refresh();
          } catch (err) { toast(err.message, 'error'); }
          return;
        }

        const configBtn = e.target.closest('[data-action="config"]');
        if (configBtn) {
          openConfigModal(configBtn.dataset.id, configBtn.dataset.name);
          return;
        }

        const removeBtn = e.target.closest('[data-action="remove"]');
        if (removeBtn) {
          const id = removeBtn.dataset.id;
          if (confirm('确定要卸载模组 ' + id + ' 吗？此操作将删除其本地文件。')) {
            try {
              await api('/api/mod/' + encodeURIComponent(id), { method: 'DELETE' });
              toast('已卸载模组 ' + id, 'success');
              refresh();
            } catch (err) { toast(err.message, 'error'); }
          }
          return;
        }
      });

      await refresh();
    };

    const ensure = () => {
      const nav = document.querySelector('.sidebar-group[data-group="preferences"] .utility-nav') || document.querySelector('.utility-nav');
      if (!nav) return false;
      let button = nav.querySelector('[data-echo-external-mods]');
      if (!button) {
        button = Array.from(nav.querySelectorAll('button.nav-item')).find((item) => /^(mods|sh[in]?awase\s*mods)$/iu.test((item.getAttribute('aria-label') || item.textContent || '').trim())) || null;
      }
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'nav-item';
        button.setAttribute('aria-label', 'Mods');
        button.title = 'ShinawaseLoader Mods';
        button.dataset.echoExternalMods = 'true';
        button.dataset.echoExternalOwned = 'true';
        button.innerHTML = '<span class="nav-icon-shell" aria-hidden="true" style="color:#38bdf8;font-weight:bold">✦</span><span class="nav-item-label">Mods</span>';
        const settings = Array.from(nav.querySelectorAll('button.nav-item')).find((item) => /设置|settings/i.test(item.getAttribute('aria-label') || item.textContent || ''));
        settings?.after(button) || nav.append(button);
      }
      button.dataset.echoExternalMods = 'true';
      if (button.dataset.echoExternalBound !== 'true') {
        button.dataset.echoExternalBound = 'true';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          activeNav = button;
          void open();
        }, true);
      }
      if (!activeNav) activeNav = button;
      return true;
    };

    const observer = new MutationObserver(ensure);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', (event) => {
      if (!panel || panel.hidden) return;
      const navItem = event.target?.closest?.('.nav-item');
      if (navItem && navItem !== activeNav) hidePanel();
    }, true);
    ensure();

    window.__echoExternalLoaderUi = {
      version: 2,
      dispose: () => {
        observer.disconnect();
        panel?.remove();
        configModal?.remove();
        css.remove();
        const ownNav = document.querySelector('[data-echo-external-mods][data-echo-external-owned]');
        ownNav?.remove();
        document.querySelectorAll('[data-echo-external-hidden="true"]').forEach((surface) => { surface.style.removeProperty('display'); delete surface.dataset.echoExternalHidden; });
        delete window.__echoExternalLoaderUi;
        delete window.__echoModToast;
      },
    };
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
    const bridge = {
      ...ctx,
      settings,
      fetchJson: (url, options = {}) => request('/api/proxy', { body: { url, ...options } }),
      uploadFile: (input) => request('/api/upload', { body: input }),
      toast: (message) => {
        if (typeof window.__echoModToast === 'function') window.__echoModToast(message, 'info');
        else {
          const el = document.createElement('div');
          el.textContent = String(message);
          el.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647;background:rgba(15,23,42,0.95);color:#fff;padding:10px 16px;border-radius:10px;font:600 12px sans-serif;box-shadow:0 12px 36px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);';
          document.body.append(el);
          setTimeout(() => el.remove(), 2800);
        }
      },
      echo: window.echo,
    };
    const modConsole = Object.fromEntries(['debug', 'info', 'log', 'warn', 'error'].map((level) => [level, (...values) => {
      const message = values.map((value) => { try { return typeof value === 'string' ? value : JSON.stringify(value); } catch { return String(value); } }).join(' ');
      void fetch(ctx.baseUrl + '/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, level, message }) }).catch(() => undefined);
      const native = window.console?.[level] || window.console?.log;
      native?.call(window.console, '[Mod ' + id + ']', ...values);
    }]));
    bridge.console = modConsole;
    bridge.log = modConsole.log;
    let dispose;
    try {
      dispose = await (async function(echoExternalMod, console) { ${source}\n })(bridge, modConsole);
    } catch (error) {
      console.error('[ECHO external mod]', id, error);
      throw error;
    }
    window.__echoExternalMods[id] = { source, signature, dispose: typeof dispose === 'function' ? dispose : undefined };
    return { status: 'injected', id };
  })()`;
  return cdpEvaluate(target.webSocketDebuggerUrl, expression);
};

const injectEnabled = async () => {
  const targets = await cdpTargets();
  const state = readState();
  const active = Object.entries(state.mods).filter(([, value]) => value.enabled === true);
  if (targets.length !== lastInjectedTargetCount) {
    lastInjectedTargetCount = targets.length;
    log('INFO', `ECHO targets=${targets.length}, enabledMods=${active.length}`);
  }
  for (const target of targets) {
    await injectLoaderUi(target).catch(() => undefined);
    for (const [id] of active) {
      const manifest = readManifest(id);
      if (!manifest) continue;
      const entry = join(installedDirectory(id), safeRelative(manifest.entry || 'mod.js'));
      if (!existsSync(entry)) continue;
       await injectIntoTarget(target, id, manifest, readFileSync(entry, 'utf8')).catch((error) => log('WARN', `inject ${id}: ${error.message}`));
    }
  }
  lastTargets = new Set(targets.map((target) => target.id));
  return targets.length;
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
  const input = JSON.stringify(payload || {});
  await rendererValue(`(async()=>{const payload=${input};const playback=window.echo?.playback;if(!playback)throw new Error('echo_playback_api_unavailable');if(payload.action==='play')await playback.play();else if(payload.action==='pause')await playback.pause();else if(payload.action==='stop')await playback.stop?.();else if(payload.action==='seek')await playback.seek(Number(payload.positionSeconds)||0);else if(payload.action==='load'){await playback.playLocalFile({filePath:String(payload.filePath||''),trackId:String(payload.trackId||payload.filePath||''),mimeType:String(payload.mimeType||''),startSeconds:Number(payload.positionSeconds)||0,metadata:{title:String(payload.title||''),artist:String(payload.artist||''),album:String(payload.album||''),albumArtist:String(payload.albumArtist||''),coverUrl:String(payload.coverUrl||''),fileName:String(payload.fileName||''),durationSeconds:Number(payload.durationSeconds)||0}});if(payload.state!=='playing')await playback.pause();}else throw new Error('control_action_invalid');return true;})()`);
  return { ok: true, ...(await playbackStatus()) };
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
const startTogetherRelay = () => {
  if (togetherRelayServer) return;
  togetherRelayServer = createServer(async (request, response) => {
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
  togetherRelayServer.on('error', (error) => console.warn(`Together relay: ${error.message}`));
  togetherRelayServer.listen(togetherRelayPort, '127.0.0.1');
};
const startWatch = () => {
  if (watchTimer) return;
  watchTimer = setInterval(() => void injectEnabled().catch(() => undefined), 2500);
  void injectEnabled().catch(() => undefined);
  log('INFO', `watching ECHO CDP on ${debugPort}`);
};
const findEcho = () => echoExe || process.env.ECHO_EXE || [
  join(process.cwd(), 'dist', 'installed', 'ECHO', 'ECHO.exe'),
  join(process.cwd(), 'dist', 'win-unpacked', 'ECHO.exe'),
  join(process.cwd(), '..', 'ECHOSteam-main', 'dist', 'win-unpacked', 'ECHO.exe'),
].find(existsSync);

const launchEcho = () => {
  const executable = findEcho();
  if (!executable) throw new Error('ECHO.exe_not_found_use_--echo');
  if (echoProcess && !echoProcess.killed) return executable;
  echoProcess = spawn(executable, [`--remote-debugging-port=${debugPort}`], { detached: false, stdio: 'ignore' });
  echoProcess.once('exit', () => { echoProcess = null; });
  log('INFO', `launched ECHO ${executable}`);
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

    <input type="file" id="file" accept=".echomod,application/json" style="display:none" onchange="uploadMod(this.files[0])">
    <div class="dropzone" id="dropzone" onclick="document.getElementById('file').click()">
      <div class="dropzone-title">📥 点击选择或拖放 .echomod 文件到此处</div>
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
      return jsonResponse(response, 200, { ok: true, loaderVersion, root, enableWebConsole, port, debugPort, dropRoot });
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
      return jsonResponse(response, 200, { mods: modSummaries(), root });
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
      return jsonResponse(response, 200, { id, config: readModConfig(id) });
    }
    if (configMatch && request.method === 'PUT') {
      const id = decodeURIComponent(configMatch[1]);
      const body = await readRequest(request);
      writeModConfig(id, body.config);
      void injectEnabled().catch(() => undefined);
      return jsonResponse(response, 200, { ok: true, config: readModConfig(id) });
    }
    const match = url.pathname.match(/^\/api\/mod\/([^/]+)\/(enable|disable)$/u);
    if (request.method === 'POST' && match) {
      const id = decodeURIComponent(match[1]);
      setEnabled(id, match[2] === 'enable');
      if (match[2] === 'enable') void injectEnabled().catch(() => undefined);
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
      return jsonResponse(response, 200, { targets: await injectEnabled() });
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
  console.log(`\n${c.bCyan}╭─────────────────────────────────────────────────────────────╮${c.reset}`);
  console.log(`${c.bCyan}│${c.reset}  ${c.bold}${c.white}✦ ShinawaseLoader 已安装模组列表${c.reset}                           ${c.bCyan}│${c.reset}`);
  console.log(`${c.bCyan}╰─────────────────────────────────────────────────────────────╯${c.reset}\n`);
  if (!mods.length) {
    console.log(`  ${c.gray}暂无已安装的模组。${c.reset}\n`);
    return;
  }
  for (const m of mods) {
    const statusPill = m.enabled ? `${c.bGreen}● 已启用${c.reset}` : `${c.gray}○ 已停用${c.reset}`;
    console.log(`  ${statusPill}  ${c.bold}${c.white}${m.name}${c.reset} ${c.dim}(v${m.version})${c.reset}`);
    console.log(`      ${c.gray}ID:${c.reset} ${c.cyan}${m.id}${c.reset}  ${c.gray}路径:${c.reset} ${c.dim}${m.directory}${c.reset}`);
    if (m.description) console.log(`      ${c.gray}简介:${c.reset} ${m.description}`);
    console.log('');
  }
};

const run = async () => {
  printLogo();
  if (command === 'init' || command === 'install-loader') {
    writeJson(statePath, readState());
    console.log(`  ${c.bGreen}✔${c.reset} ShinawaseLoader 运行时已初始化: ${c.white}${root}${c.reset}`);
    return;
  }
  if (command === 'list') return printList();
  if (command === 'import' || command === 'install') {
    const source = args[0];
    if (!source) throw new Error('用法: ShinawaseLoader.mjs import <file.echomod>');
    const manifest = importPackage(source);
    console.log(`  ${c.bGreen}✔${c.reset} 成功导入模组: ${c.bold}${c.white}${manifest.name || manifest.id}${c.reset} ${c.dim}(v${manifest.version || '1.0.0'})${c.reset}`);
    return;
  }
  if (command === 'uninstall') {
    removeMod(args[0]);
    console.log(`  ${c.bGreen}✔${c.reset} 已卸载模组: ${args[0]}`);
    return;
  }
  if (command === 'enable' || command === 'disable') {
    setEnabled(args[0], command === 'enable');
    if (command === 'enable') await injectEnabled().catch(() => undefined);
    console.log(`  ${c.bGreen}✔${c.reset} 模组 [${args[0]}] ${command === 'enable' ? '已启用' : '已停用'}`);
    return;
  }
  if (command === 'launch') {
    console.log(`  ${c.bGreen}✔${c.reset} ECHO 已启动: ${launchEcho()}`);
    return;
  }

  const isAttach = command === 'attach';
  startDropWatcher();
  startTogetherRelay();
  server.listen(port, '127.0.0.1', () => {
    console.log(`\n${c.bCyan}╭─────────────────────────────────────────────────────────────╮${c.reset}`);
    console.log(`${c.bCyan}│${c.reset}  ${c.bold}${c.white}✦ ShinawaseLoader 模组服务已启动${c.reset}                           ${c.bCyan}│${c.reset}`);
    console.log(`${c.bCyan}╰─────────────────────────────────────────────────────────────╯${c.reset}`);
    console.log(`  ${c.bold}服务端口   :${c.reset} ${c.cyan}http://127.0.0.1:${port}${c.reset}`);
    console.log(`  ${c.bold}Web 控制台 :${c.reset} ${enableWebConsole ? `${c.bGreen}已开启 (http://127.0.0.1:${port})${c.reset}` : `${c.gray}已关闭 (可在 loader.config.json 中开启)${c.reset}`}`);
    console.log(`  ${c.bold}Together中继:${c.reset} ${c.white}http://127.0.0.1:${togetherRelayPort}${c.reset}`);
    console.log(`  ${c.bold}CDP调试端口 :${c.reset} ${c.white}${debugPort}${c.reset}\n`);
  });

  if (isAttach) startWatch();
  if (command === 'run') launchEcho();
};

run().catch((error) => {
  console.error(`\n  ${c.bRed}✖ Loader 异常:${c.reset}`, error instanceof Error ? error.message : error, '\n');
  process.exitCode = 1;
});
