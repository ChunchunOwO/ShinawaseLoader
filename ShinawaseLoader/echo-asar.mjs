#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const marker = '/* shinawase-loader-bridge-v1 */';
const nativeHostMarker = '/* shinawase-loader-native-host-v1 */';
const preloadMarker = '/* shinawase-loader-preload-bridge-v1 */';
const playbackMarker = '/* shinawase-loader-streaming-playback-v2 */';
const playbackMarkerV1 = '/* shinawase-loader-streaming-playback-v1 */';
const MAIN_ENTRY = 'out/main/index.js';
const PRELOAD_ENTRY = 'out/preload/index.mjs';
const STEAM_STREAMING_REJECT = 'Music streaming playback is not available in the Steam distribution.';
const KNOWN_STOCK_ASAR_SHA256 = {
  '26.8.28': 'c59648731aea7f109317c26a9181bb6626b9c9e7f130998c2577a99e9ccae2c0',
  '26.9.1': 'f245fd7683542bfd9f9e12fc628149bd04029819b6d2611ca274a1d7655545b6',
};
const KNOWN_STOCK_HEADER_SHA256 = {
  '26.8.28': 'b525231cec180d1ab15334ab8c2063400f222606eb43b9dc0c903b0d568cbfdd',
  '26.9.1': '8f685506c8b2ca9165e1ebd0a4c31385438e4bdeb41568cced2ce819a09cba1d',
};
const knownAsarHashes = new Set(Object.values(KNOWN_STOCK_ASAR_SHA256));
const knownHeaderHashes = new Set(Object.values(KNOWN_STOCK_HEADER_SHA256));
const align4 = (value) => (value + 3) & ~3;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const archiveFor = (root) => join(root, 'resources', 'app.asar');
const loaderFor = (root) => join(root, 'ShinawaseLoader');
const backupFor = (root) => join(loaderFor(root), 'backups', 'app.asar.original');
const stateFor = (root) => join(loaderFor(root), 'backups', 'app.asar.json');
const normalizeFsPath = (value) => String(value || '').replace(/\\/g, '/');
const isIsolatedRuntimePath = (value) => /\/modded-runtime(?:\/|$)/iu.test(normalizeFsPath(value));
// Steam ships ECHO.exe. NEXT / Playtest / Steam names are leftover from
// older folder layouts and are only resolved inside an isolated runtime copy.
const echoExeFor = (root) => ['ECHO.exe', 'ECHO Steam.exe', 'ECHO NEXT.exe', 'ECHO Playtest.exe']
  .map((name) => join(root, name))
  .find((file) => existsSync(file));
const isSteamStockArchive = (archive) => {
  const n = normalizeFsPath(archive);
  return /\/steamapps\/common\/ECHO(?: NEXT| Playtest| Steam)?\/resources\/app\.asar$/iu.test(n)
    && !isIsolatedRuntimePath(n);
};
const isSteamStockExe = (exePath) => {
  const n = normalizeFsPath(exePath);
  return /\/steamapps\/common\/ECHO(?: NEXT| Playtest| Steam)?\/ECHO(?: NEXT| Playtest| Steam)?\.exe$/iu.test(n)
    && !isIsolatedRuntimePath(n);
};
const headerJsonBytes = (parsed) => {
  const headerSize = parsed.bytes.readUInt32LE(4);
  const header = parsed.bytes.subarray(8, 8 + headerSize);
  const jsonSize = header.readInt32LE(4);
  return header.subarray(8, 8 + jsonSize);
};
const headerJsonHash = (file) => sha256(headerJsonBytes(readArchive(file)));
const APP_ASAR_INTEGRITY_PREFIX = Buffer.from('"file":"resources\\\\app.asar","alg":"SHA256","value":"', 'utf8');

const replaceAppAsarIntegrity = (exePath, nextHash) => {
  if (!exePath || !existsSync(exePath)) return { status: 'no-exe' };
  if (isSteamStockExe(exePath)) return { status: 'refused-steam-original' };
  if (!/^[0-9a-f]{64}$/u.test(nextHash)) throw new Error('asar_integrity_hash_invalid');
  const bytes = Buffer.from(readFileSync(exePath));
  const index = bytes.indexOf(APP_ASAR_INTEGRITY_PREFIX);
  if (index < 0) return { status: 'no-integrity-resource' };
  const hashAt = index + APP_ASAR_INTEGRITY_PREFIX.length;
  const current = bytes.subarray(hashAt, hashAt + 64).toString('utf8');
  if (!/^[0-9a-f]{64}$/u.test(current)) throw new Error('asar_integrity_value_invalid');
  if (current === nextHash) return { status: 'already-synced', hash: nextHash };
  Buffer.from(nextHash, 'utf8').copy(bytes, hashAt);
  const temporary = `${exePath}.${process.pid}.integrity.tmp`;
  writeFileSync(temporary, bytes);
  rmSync(exePath, { force: true });
  renameSync(temporary, exePath);
  return { status: 'updated', previous: current, hash: nextHash };
};

const syncIntegrity = (root, archive = archiveFor(root)) => replaceAppAsarIntegrity(echoExeFor(root), headerJsonHash(archive));

const bridge = `${marker}
(() => {
  const builtin = (name) => process.getBuiltinModule?.(name);
  const fs = builtin('node:fs');
  const path = builtin('node:path');
  const url = builtin('node:url');
  const childProcess = builtin('node:child_process');
  if (!fs || !path || !url || !childProcess || typeof app === 'undefined') return;
  const installRoot = process.env.ECHO_MOD_ROOT || path.dirname(process.resourcesPath);
  const loaderRoot = process.env.ECHO_MOD_HOME || path.join(installRoot, 'ShinawaseLoader');
  const script = path.join(loaderRoot, 'ShinawaseLoader.mjs');
  const configPath = path.join(loaderRoot, 'loader.config.json');
  if (!fs.existsSync(script)) return;
  let config = {};
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/u, '')); } catch {}
  const autoStartMode = String(config.autoStartMode || (config.autoStart === true ? 'app-asar-bridge' : 'manual')).toLowerCase();
  if (config.autoStart !== true || autoStartMode !== 'app-asar-bridge' || process.argv.includes('--no-mod-loader')) return;
  const port = process.env.ECHO_MOD_PORT || String(config.port || 17862);
  const debugPort = process.env.ECHO_MOD_DEBUG_PORT || String(config.debugPort || 9229);
  const showConsole = process.argv.includes('--mod-loader-console') || config.showConsole === true;
  app.commandLine.appendSwitch('remote-debugging-port', debugPort);
  app.whenReady().then(() => {
    if (globalThis.__shinawaseLoaderProcess) return;
    const node = process.env.ECHO_NODE_PATH || path.join(loaderRoot, process.platform === 'win32' ? 'node.exe' : 'node');
    const loaderArgs = [script, 'attach', '--port', port, '--debug-port', debugPort];
    const command = showConsole && process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : node;
    const args = showConsole && process.platform === 'win32'
      ? ['/d', '/k', [node, ...loaderArgs].map((value) => '"' + value.replaceAll('"', '\\"') + '"').join(' ')]
      : loaderArgs;
    const child = childProcess.spawn(command, args, {
      cwd: installRoot,
      env: {
        ...process.env,
        ECHO_WORKSPACE_ROOT: installRoot,
        ECHO_GAME_ROOT: installRoot,
        ECHO_MOD_HOME: loaderRoot,
        ECHO_MODS_HOME: path.join(installRoot, 'Mods'),
        ECHO_PLUGINS_HOME: path.join(installRoot, 'Plugins'),
        ECHO_LOGS_HOME: path.join(loaderRoot, 'Logs'),
      },
      windowsHide: !showConsole,
      stdio: showConsole ? 'inherit' : 'ignore',
    });
    globalThis.__shinawaseLoaderProcess = child;
    child.once('exit', () => { globalThis.__shinawaseLoaderProcess = null; });
    const bridge = path.join(loaderRoot, 'streaming-bridge.cjs');
    if (fs.existsSync(bridge) && !globalThis.__shinawaseStreamingBridge) {
      globalThis.__shinawaseStreamingBridge = import(url.pathToFileURL(bridge).href)
        .then((module) => module.registerShinawaseStreamingBridge?.())
        .catch((error) => {
          const detail = error instanceof Error ? error.stack || error.message : String(error);
          try {
            fs.mkdirSync(path.join(loaderRoot, 'Logs'), { recursive: true });
            fs.appendFileSync(path.join(loaderRoot, 'Logs', 'errors.log'), '[' + new Date().toISOString() + '] streaming bridge unavailable\\n' + detail + '\\n');
          } catch {}
          console.warn('[ShinawaseLoader] streaming bridge unavailable', error);
        });
    }
  }).catch(() => {});
  app.once('will-quit', () => {
    const child = globalThis.__shinawaseLoaderProcess;
    if (!child) return;
    if (process.platform === 'win32' && child.pid) childProcess.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'taskkill', '/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    else child.kill();
  });
})();
`;

const nativeHostBridge = `${nativeHostMarker}
(() => {
  const builtin = (name) => process.getBuiltinModule?.(name);
  const fs = builtin('node:fs');
  const path = builtin('node:path');
  const url = builtin('node:url');
  if (!fs || !path || !url || typeof app === 'undefined') return;
  const installRoot = process.env.ECHO_MOD_ROOT || path.dirname(process.resourcesPath);
  const loaderRoot = process.env.ECHO_MOD_HOME || path.join(installRoot, 'ShinawaseLoader');
  const script = path.join(loaderRoot, 'native-host.cjs');
  const configPath = path.join(loaderRoot, 'loader.config.json');
  let config = {};
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\\uFEFF/u, '')); } catch {}
  if (config.nativeHost === false || process.argv.includes('--no-native-host') || process.argv.includes('--safe-mode')) return;
  app.whenReady().then(() => {
    if (globalThis.__shinawaseNativeHost || !fs.existsSync(script)) return;
    globalThis.__shinawaseNativeHost = import(url.pathToFileURL(script).href)
      .then((module) => module.startShinawaseNativeHost?.() || module.default?.startShinawaseNativeHost?.())
      .catch((error) => {
        const detail = error instanceof Error ? error.stack || error.message : String(error);
        try {
          fs.mkdirSync(path.join(loaderRoot, 'Logs'), { recursive: true });
          fs.appendFileSync(path.join(loaderRoot, 'Logs', 'errors.log'), '[' + new Date().toISOString() + '] native host unavailable\\n' + detail + '\\n');
        } catch {}
        console.warn('[ShinawaseLoader] native host unavailable', error);
      });
  }).catch(() => {});
})();
`;

// The Steam preload intentionally leaves these namespaces empty. The community
// streaming Mod still needs the existing main-process IPC service, so expose
// only its typed method surface without restoring ECHO's native pages.
const preloadBridge = `${preloadMarker}
const createShinawaseStreamingApi = (ipc, channels) => ({
  search: (request) => ipc.invoke(channels.StreamingSearch, request),
  getTrack: (request) => ipc.invoke(channels.StreamingGetTrack, request),
  getTrackSourceInfo: (request) => ipc.invoke(channels.StreamingGetTrackSourceInfo, request),
  getAlbum: (request) => ipc.invoke(channels.StreamingGetAlbum, request),
  getArtist: (request) => ipc.invoke(channels.StreamingGetArtist, request),
  resolvePlayback: (request) => ipc.invoke(channels.StreamingResolvePlayback, request),
  resolveLive: (request) => ipc.invoke(channels.StreamingResolveLive, request),
  analyzeBpm: (request) => ipc.invoke(channels.StreamingAnalyzeBpm, request),
  getLyrics: (request) => ipc.invoke(channels.StreamingGetLyrics, request),
  getMv: (request) => ipc.invoke(channels.StreamingGetMv, request),
  getProviders: () => ipc.invoke(channels.StreamingGetProviders),
  listAccountPlaylists: (provider) => ipc.invoke(channels.StreamingListAccountPlaylists, provider),
  importPlaylistFromUrl: (url) => ipc.invoke(channels.StreamingImportPlaylistFromUrl, url),
  importFavoritesFromUrl: (url) => ipc.invoke(channels.StreamingImportFavoritesFromUrl, url),
  exportFavorites: () => ipc.invoke(channels.StreamingExportFavorites),
  syncLikedSongs: (provider) => ipc.invoke(channels.StreamingSyncLikedSongs, provider),
  setTrackLiked: (request) => ipc.invoke(channels.StreamingSetTrackLiked, request),
  getFavorites: () => ipc.invoke(channels.StreamingGetFavorites),
  setFavorite: (request) => ipc.invoke(channels.StreamingSetFavorite, request),
  renameFavoriteCollection: (request) => ipc.invoke(channels.StreamingRenameFavoriteCollection, request),
  syncFavoriteCollection: (request) => ipc.invoke(channels.StreamingSyncFavoriteCollection, request),
  deleteFavoriteCollection: (request) => ipc.invoke(channels.StreamingDeleteFavoriteCollection, request),
  refreshNeteaseDailyRecommend: () => ipc.invoke(channels.StreamingRefreshNeteaseDailyRecommend),
});
const createShinawaseAccountsApi = (ipc, channels) => ({
  getStatuses: () => ipc.invoke(channels.AccountGetStatuses),
  getStatus: (provider) => ipc.invoke(channels.AccountGetStatus, provider),
  saveCookie: (provider, cookie) => ipc.invoke(channels.AccountSaveCookie, provider, cookie),
  startLogin: (provider) => ipc.invoke(channels.AccountStartLogin, provider),
  startNeteaseQrLogin: () => ipc.invoke(channels.AccountStartNeteaseQrLogin),
  pollNeteaseQrLogin: (key) => ipc.invoke(channels.AccountPollNeteaseQrLogin, key),
  clear: (provider) => ipc.invoke(channels.AccountClear, provider),
  check: (provider) => ipc.invoke(channels.AccountCheck, provider),
  checkAll: () => ipc.invoke(channels.AccountCheckAll),
  setBrowser: (provider, browser) => ipc.invoke(channels.AccountSetBrowser, provider, browser),
  setYouTubeBrowser: (browser) => ipc.invoke(channels.AccountSetYouTubeBrowser, browser),
  onStatusesChanged: (handler) => {
    const listener = (_event, statuses) => handler(Array.isArray(statuses) ? statuses : []);
    ipc.on(channels.AccountStatusesChanged, listener);
    return () => ipc.off(channels.AccountStatusesChanged, listener);
  },
});
const createShinawaseDownloadsApi = (ipc, channels) => ({
  getJobs: () => ipc.invoke(channels.DownloadsGetJobs),
  createUrlJob: (url, options) => ipc.invoke(channels.DownloadsCreateUrlJob, url, options),
  cancelJob: (jobId) => ipc.invoke(channels.DownloadsCancelJob, jobId),
  clearJobs: (provider) => ipc.invoke(channels.DownloadsClearJobs, provider),
  clearCompleted: (provider) => ipc.invoke(channels.DownloadsClearCompleted, provider),
  getSettings: () => ipc.invoke(channels.DownloadsGetSettings),
  setSettings: (patch) => ipc.invoke(channels.DownloadsSetSettings, patch),
  chooseOutputDirectory: (target) => ipc.invoke(channels.DownloadsChooseOutputDirectory, target),
  search: (request) => ipc.invoke(channels.DownloadsSearch, request),
  getOsuAccountProfile: () => ipc.invoke(channels.DownloadsGetOsuAccountProfile),
  getOsuAccountCollection: (request) => ipc.invoke(channels.DownloadsGetOsuAccountCollection, request),
  checkTools: () => ipc.invoke(channels.DownloadsCheckTools),
  onJobsUpdated: (handler) => {
    const listener = (_event, jobs) => handler(Array.isArray(jobs) ? jobs : []);
    ipc.on(channels.DownloadsJobsUpdated, listener);
    return () => ipc.off(channels.DownloadsJobsUpdated, listener);
  },
});
const createShinawaseQobuzApi = (ipc, channels) => ({
  login: (credentials) => ipc.invoke(channels.QobuzAuthLogin, credentials),
  logout: () => ipc.invoke(channels.QobuzAuthLogout),
  getStatus: () => ipc.invoke(channels.QobuzAuthGetStatus),
  onStatusChanged: (handler) => {
    const listener = (_event, status) => handler(status);
    ipc.on(channels.QobuzAuthStatusChanged, listener);
    return () => ipc.off(channels.QobuzAuthStatusChanged, listener);
  },
  downloadAlbum: (request) => ipc.invoke(channels.QobuzDownloadAlbum, request),
});
`;

const patchPreload = (text) => {
  if (text.includes(preloadMarker)) return text;
  const replacements = [
    ['streaming: null,', 'streaming: createShinawaseStreamingApi(ipcRenderer, IpcChannels),'],
    ['downloads: null,', 'downloads: createShinawaseDownloadsApi(ipcRenderer, IpcChannels),'],
    ['accounts: null,', 'qobuz: createShinawaseQobuzApi(ipcRenderer, IpcChannels),\n  accounts: createShinawaseAccountsApi(ipcRenderer, IpcChannels),'],
  ];
  let next = text;
  for (const [from, to] of replacements) {
    if (!next.includes(from)) throw new Error(`asar_preload_entry_missing:${from}`);
    next = next.replace(from, to);
  }
  return `${next.split('\n').slice(0, 1).join('\n')}\n${preloadBridge}\n${next.split('\n').slice(1).join('\n')}`;
};

const applyStreamingQualityPassthrough = (text) => {
  const qualityPairs = [
    ["quality: 'standard',\n      stableKey:", "quality: input.quality || input.streamingQuality || 'standard',\n      stableKey:"],
    ['quality: "standard",\n      stableKey:', 'quality: input.quality || input.streamingQuality || "standard",\n      stableKey:'],
    ['quality:"standard",stableKey:', 'quality:input.quality||input.streamingQuality||"standard",stableKey:'],
    ['quality: "standard", stableKey:', 'quality: input.quality || input.streamingQuality || "standard", stableKey:'],
  ];
  let next = text;
  for (const [from, to] of qualityPairs) {
    if (next.includes(from)) next = next.replace(from, to);
  }
  return next;
};

// Electron 37 on Windows crashed natively (0xC0000005) when always-on-top was
// applied to a transparent+frameless window in its first moments. Current
// echo-steam (Electron 43.3) still constructs the mini-player with alwaysOnTop: true and
// the apply* helpers still raise immediately; pet / desktop-lyrics now omit
// the ctor flag and branch darwin vs Win32. Keep the 600ms deferral.
const applyAuxiliaryWindowCrashFix = (text) => {
  if (text.includes('__shinawaseBornAt')) return text;
  let next = text;
  const currentCtor = '    skipTaskbar: true,\n    show: false,\n    // Ordinary topmost from the first frame (same floating level the runtime\n    // applyMiniPlayerAlwaysOnTop uses); some Linux window managers only honor\n    // the above-state reliably when it is set before the window is mapped.\n    alwaysOnTop: true,\n    webPreferences: {';
  const currentSafe = currentCtor.replace('alwaysOnTop: true', 'alwaysOnTop: false');
  if (next.includes(currentCtor)) next = next.replaceAll(currentCtor, currentSafe);
  const legacyCtor = '    skipTaskbar: true,\n    show: false,\n    alwaysOnTop: true,\n    webPreferences: {';
  const legacySafe = '    skipTaskbar: true,\n    show: false,\n    alwaysOnTop: false,\n    webPreferences: {';
  while (next.includes(legacyCtor)) next = next.replace(legacyCtor, legacySafe);
  for (const assignment of ['petWindow = window;', 'desktopLyricsWindow = window;', 'miniPlayerWindow = window;']) {
    const anchor = `  ${assignment}\n  window.setMenuBarVisibility(false);`;
    if (next.includes(anchor)) {
      next = next.replace(anchor, `  ${assignment}\n  window.__shinawaseBornAt = Date.now();\n  window.setMenuBarVisibility(false);`);
    }
  }
  const deferRaise = (body) => '{\n'
    + '  const raise = () => {\n'
    + '    if (window.isDestroyed()) return;\n'
    + `${body}`
    + '  };\n'
    + '  const delay = Math.max(0, 600 - (Date.now() - (window.__shinawaseBornAt || 0)));\n'
    + '  if (delay === 0) raise(); else setTimeout(raise, delay);\n'
    + '};';
  const helpers = [
    ['const applyPetAlwaysOnTop = (window, platform = process.platform) => {\n  if (platform === "darwin") {\n    window.setAlwaysOnTop(true, "floating");\n    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n    return;\n  }\n  window.setAlwaysOnTop(true);\n};',
      `const applyPetAlwaysOnTop = (window, platform = process.platform) => ${deferRaise('    if (platform === "darwin") {\n      window.setAlwaysOnTop(true, "floating");\n      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n      return;\n    }\n    window.setAlwaysOnTop(true);\n')}`],
    ['const applyMiniPlayerAlwaysOnTop = (window) => {\n  if (process.platform === "darwin") {\n    window.setAlwaysOnTop(true, "floating");\n    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n    return;\n  }\n  window.setAlwaysOnTop(true);\n};',
      `const applyMiniPlayerAlwaysOnTop = (window) => ${deferRaise('    if (process.platform === "darwin") {\n      window.setAlwaysOnTop(true, "floating");\n      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n      return;\n    }\n    window.setAlwaysOnTop(true);\n')}`],
    ['const applyDesktopLyricsAlwaysOnTop = (window) => {\n  if (process.platform === "darwin") {\n    window.setAlwaysOnTop(true, "floating");\n    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n  } else {\n    window.setAlwaysOnTop(true);\n  }\n  window.moveTop();\n};',
      `const applyDesktopLyricsAlwaysOnTop = (window) => ${deferRaise('    if (process.platform === "darwin") {\n      window.setAlwaysOnTop(true, "floating");\n      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n    } else {\n      window.setAlwaysOnTop(true);\n    }\n    window.moveTop();\n')}`],
    ['const applyPetAlwaysOnTop = (window) => {\n  window.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver");\n  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n};',
      `const applyPetAlwaysOnTop = (window) => ${deferRaise('    window.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver");\n    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n')}`],
    ['const applyMiniPlayerAlwaysOnTop = (window) => {\n  window.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver");\n  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n};',
      `const applyMiniPlayerAlwaysOnTop = (window) => ${deferRaise('    window.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver");\n    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n')}`],
    ['const applyDesktopLyricsAlwaysOnTop = (window) => {\n  window.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver");\n  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n  window.moveTop();\n};',
      `const applyDesktopLyricsAlwaysOnTop = (window) => ${deferRaise('    window.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver");\n    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n    window.moveTop();\n')}`],
  ];
  for (const [from, to] of helpers) {
    if (next.includes(from)) next = next.replace(from, to);
  }
  return next;
};

const steamStreamingValidation = (providerName) => `if (${providerName} !== "m3u8" || !/^https?:\\/\\/\\S+$/iu.test(radioUrl)) {\n      throw new Error("${STEAM_STREAMING_REJECT}");\n    }`;
const streamingProbeEnrichment = 'const sourceSampleRate = Number(source?.sampleRate);';
const upgradePatchedPlayback = (text) => {
  let next = text.replace(playbackMarkerV1, playbackMarker);
  if (next.includes(streamingProbeEnrichment)) return applyStreamingQualityPassthrough(next);
  const oldResolveTail = 'filePath = source?.url;\n      inputHeaders = source?.headers;\n      if (typeof filePath !== "string" || !/^https?:\\/\\/\\S+$/iu.test(filePath)) throw new Error("Streaming provider did not return a playable URL.");';
  const newResolveTail = 'filePath = source?.url;\n      inputHeaders = source?.headers;\n      if (typeof filePath !== "string" || !/^https?:\\/\\/\\S+$/iu.test(filePath)) throw new Error("Streaming provider did not return a playable URL.");\n      const sourceSampleRate = Number(source?.sampleRate);\n      const sourceBitDepth = Number(source?.bitDepth);\n      const sourceBitrate = Number(source?.bitrate);\n      const sourceChannels = Number(source?.channels);\n      probe = {\n        ...(probe || {}),\n        durationSeconds: durationSeconds || probe?.durationSeconds || undefined,\n        fileSampleRate: Number.isFinite(sourceSampleRate) && sourceSampleRate > 0 ? sourceSampleRate : probe?.fileSampleRate,\n        channels: Number.isFinite(sourceChannels) && sourceChannels > 0 ? sourceChannels : (probe?.channels || 2),\n        codec: typeof source?.codec === "string" && source.codec.trim() ? source.codec : probe?.codec,\n        bitDepth: Number.isFinite(sourceBitDepth) && sourceBitDepth > 0 ? sourceBitDepth : probe?.bitDepth,\n        bitrate: Number.isFinite(sourceBitrate) && sourceBitrate > 0 ? sourceBitrate : probe?.bitrate,\n      };\n      if (typeof source?.mimeType === "string" && source.mimeType.trim()) mimeType = source.mimeType;';
  if (!next.includes(oldResolveTail)) return applyStreamingQualityPassthrough(next);
  next = next.replace(oldResolveTail, newResolveTail);
  if (next.includes('let filePath;\n  let inputHeaders;\n  let probe = createProbeHintForMediaItem(')) {
    next = next.replace('let filePath;\n  let inputHeaders;\n  let probe = createProbeHintForMediaItem(', 'let filePath;\n  let inputHeaders;\n  let mimeType = null;\n  let probe = createProbeHintForMediaItem(');
  }
  next = next.replace('return { filePath, inputHeaders, mimeType: null, probe, durationSeconds };', 'return { filePath, inputHeaders, mimeType, probe, durationSeconds };');
  if (!next.includes(playbackMarker)) next = `${playbackMarker}\n${next}`;
  return applyStreamingQualityPassthrough(next);
};

const patchPlayback = (text) => {
  if (text.includes(playbackMarker) && text.includes(streamingProbeEnrichment)) return applyStreamingQualityPassthrough(text);
  if (text.includes(playbackMarker) || text.includes(playbackMarkerV1)) return upgradePatchedPlayback(text);
  const validation = steamStreamingValidation('provider2');
  const validationAlt = steamStreamingValidation('provider');
  let next = text;
  const usedMinifiedProvider = next.includes(validation);
  const oldValidation = usedMinifiedProvider ? validation : validationAlt;
  if (!next.includes(oldValidation)) throw new Error('asar_streaming_validation_missing');
  const providerName = usedMinifiedProvider ? 'provider2' : 'provider';
  next = next.replace(oldValidation, `if (${providerName} === "m3u8" && !/^https?:\\/\\/\\S+$/iu.test(radioUrl)) {\n      throw new Error("Streaming playback URL must be valid.");\n    }`);
  const oldResolve = '  let filePath;\n  let probe = createProbeHintForMediaItem(';
  if (!next.includes(oldResolve)) throw new Error('asar_streaming_resolver_missing');
  next = next.replace(oldResolve, '  let filePath;\n  let inputHeaders;\n  let mimeType = null;\n  let probe = createProbeHintForMediaItem(');
  const oldPath = '  } else if (item.mediaType === "streaming") {\n    filePath = decodeM3u8ProviderTrackId(item.providerTrackId).trim();\n  } else {';
  if (!next.includes(oldPath)) throw new Error('asar_streaming_path_missing');
  // Resolve non-m3u8 streaming through the Loader bridge and keep probe/mime
  // metadata so exclusive, ASIO, and native DSP can admit HTTP sources.
  next = next.replace(oldPath, '  } else if (item.mediaType === "streaming") {\n    if (item.provider === "m3u8") {\n      filePath = decodeM3u8ProviderTrackId(item.providerTrackId).trim();\n    } else {\n      const resolver = globalThis.__shinawaseResolveStreamingPlayback;\n      if (typeof resolver !== "function") throw new Error("Streaming playback bridge is unavailable.");\n      const source = await resolver({ provider: item.provider, providerTrackId: item.providerTrackId, quality: item.quality || item.streamingQuality });\n      filePath = source?.url;\n      inputHeaders = source?.headers;\n      if (typeof filePath !== "string" || !/^https?:\\/\\/\\S+$/iu.test(filePath)) throw new Error("Streaming provider did not return a playable URL.");\n      const sourceSampleRate = Number(source?.sampleRate);\n      const sourceBitDepth = Number(source?.bitDepth);\n      const sourceBitrate = Number(source?.bitrate);\n      const sourceChannels = Number(source?.channels);\n      probe = {\n        ...(probe || {}),\n        durationSeconds: durationSeconds || probe?.durationSeconds || undefined,\n        fileSampleRate: Number.isFinite(sourceSampleRate) && sourceSampleRate > 0 ? sourceSampleRate : probe?.fileSampleRate,\n        channels: Number.isFinite(sourceChannels) && sourceChannels > 0 ? sourceChannels : (probe?.channels || 2),\n        codec: typeof source?.codec === "string" && source.codec.trim() ? source.codec : probe?.codec,\n        bitDepth: Number.isFinite(sourceBitDepth) && sourceBitDepth > 0 ? sourceBitDepth : probe?.bitDepth,\n        bitrate: Number.isFinite(sourceBitrate) && sourceBitrate > 0 ? sourceBitrate : probe?.bitrate,\n      };\n      if (typeof source?.mimeType === "string" && source.mimeType.trim()) mimeType = source.mimeType;\n    }\n  } else {');
  next = applyStreamingQualityPassthrough(next);
  const oldReturn = '  return { filePath, mimeType: null, probe, durationSeconds };';
  if (!next.includes(oldReturn)) throw new Error('asar_streaming_return_missing');
  next = next.replace(oldReturn, '  return { filePath, inputHeaders, mimeType, probe, durationSeconds };');
  return `${playbackMarker}\n${next}`;
};

const readArchive = (file) => {
  const bytes = readFileSync(file);
  if (bytes.length < 12) throw new Error('asar_header_missing');
  const headerSize = bytes.readUInt32LE(4);
  const header = bytes.subarray(8, 8 + headerSize);
  const jsonSize = header.readInt32LE(4);
  const value = JSON.parse(header.subarray(8, 8 + jsonSize).toString('utf8'));
  return { bytes, dataStart: 8 + headerSize, value };
};

const filesIn = (node, prefix = '') => {
  const result = [];
  for (const [name, info] of Object.entries(node.files || {})) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (info.files) result.push(...filesIn(info, relativePath));
    else result.push({ relativePath, info });
  }
  return result;
};

const makeHeader = (value) => {
  const json = Buffer.from(JSON.stringify(value), 'utf8');
  const payloadSize = align4(4 + json.length);
  const header = Buffer.alloc(4 + payloadSize);
  header.writeUInt32LE(payloadSize, 0);
  header.writeInt32LE(json.length, 4);
  json.copy(header, 8);
  const size = Buffer.alloc(8);
  size.writeUInt32LE(4, 0);
  size.writeUInt32LE(header.length, 4);
  return Buffer.concat([size, header]);
};

const fileIntegrity = (content) => {
  const blockSize = 4 * 1024 * 1024;
  const blocks = [];
  for (let offset = 0; offset < content.length; offset += blockSize) {
    blocks.push(sha256(content.subarray(offset, Math.min(content.length, offset + blockSize))));
  }
  return {
    algorithm: 'SHA256',
    hash: sha256(content),
    blockSize,
    blocks: blocks.length ? blocks : [sha256(Buffer.alloc(0))],
  };
};

const writeArchive = (archive, replacements) => {
  const parsed = readArchive(archive);
  const chunks = [];
  let offset = 0;
  let found = false;
  for (const entry of filesIn(parsed.value)) {
    const { info } = entry;
    if (info.unpacked || info.link) continue;
    const replacement = replacements.get(entry.relativePath);
    const content = replacement === undefined
      ? parsed.bytes.subarray(parsed.dataStart + Number(info.offset), parsed.dataStart + Number(info.offset) + Number(info.size))
      : Buffer.from(replacement, 'utf8');
    if (entry.relativePath === MAIN_ENTRY) found = true;
    info.offset = String(offset);
    info.size = content.length;
    if (replacement !== undefined) info.integrity = fileIntegrity(content);
    chunks.push(content);
    offset += content.length;
  }
  if (!found) throw new Error('asar_main_entry_missing');
  const temporary = `${archive}.${process.pid}.tmp`;
  writeFileSync(temporary, Buffer.concat([makeHeader(parsed.value), ...chunks]));
  rmSync(archive, { force: true });
  renameSync(temporary, archive);
};

// Steam still hides imported streaming playlists. SteamPlaylistsPage
// uses `.filter(i=>i.sourceProvider==="local")`; AlbumsPage / context menu /
// appPrompt use `.filter(x=>x.sourceProvider==="local"&&x.kind!=="system")`.
// Keep system playlists hidden, but show netease/qq/etc. imports. After
// rewrite the sourceProvider==="local" filter no longer matches, so the
// patch stays idempotent.
const playlistProviderFilterRe = /\.filter\(([A-Za-z_$][\w$]*)=>\1\.sourceProvider==="local"(?:&&\1\.kind!=="system")?\)/gu;
const patchSteamPlaylistsPage = (text) => {
  playlistProviderFilterRe.lastIndex = 0;
  return text.replace(playlistProviderFilterRe, '.filter($1=>$1.kind!=="system")');
};

const patch = (root) => {
  const archive = archiveFor(root);
  if (!existsSync(archive)) throw new Error(`app.asar_not_found:${archive}`);
  if (isSteamStockArchive(archive)) throw new Error('refused_steam_original_asar');
  const current = readArchive(archive);
  const main = filesIn(current.value).find((entry) => entry.relativePath === MAIN_ENTRY);
  if (!main) throw new Error('asar_main_entry_missing');
  const currentText = current.bytes.subarray(current.dataStart + Number(main.info.offset), current.dataStart + Number(main.info.offset) + Number(main.info.size)).toString('utf8');
  const preload = filesIn(current.value).find((entry) => entry.relativePath === PRELOAD_ENTRY);
  if (!preload) throw new Error('asar_preload_entry_missing');
  const currentPreloadText = current.bytes.subarray(current.dataStart + Number(preload.info.offset), current.dataStart + Number(preload.info.offset) + Number(preload.info.size)).toString('utf8');
  const playlistPages = filesIn(current.value).filter((entry) => /^out\/renderer\/assets\/.+\.js$/u.test(entry.relativePath));
  const playlistPatches = [];
  for (const entry of playlistPages) {
    const currentPlaylistsText = current.bytes.subarray(current.dataStart + Number(entry.info.offset), current.dataStart + Number(entry.info.offset) + Number(entry.info.size)).toString('utf8');
    if (!currentPlaylistsText.includes('sourceProvider==="local"')) continue;
    const playlistsText = patchSteamPlaylistsPage(currentPlaylistsText);
    if (playlistsText !== currentPlaylistsText) playlistPatches.push({ entry, playlistsText });
  }
  const mainWithBridge = currentText.includes(marker) || currentText.includes('external-mod-loader:start:requested') ? currentText : `${bridge}\n${currentText}`;
  const mainWithNative = mainWithBridge.includes(nativeHostMarker) ? mainWithBridge : `${nativeHostBridge}\n${mainWithBridge}`;
  const mainText = applyAuxiliaryWindowCrashFix(patchPlayback(mainWithNative));
  const preloadText = patchPreload(currentPreloadText);
  const missingIntegrity = [main, preload, ...playlistPatches.map((item) => item.entry)].filter(Boolean).some((entry) => !entry.info.integrity);
  if (mainText === currentText && preloadText === currentPreloadText && !playlistPatches.length && !missingIntegrity) {
    return { status: 'already-patched', integrity: syncIntegrity(root, archive) };
  }
  const backup = backupFor(root);
  if (!existsSync(backup)) {
    const backupDir = dirname(backup);
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(archive, backup);
  }
  const replacements = new Map([
    [MAIN_ENTRY, mainText],
    [PRELOAD_ENTRY, preloadText],
  ]);
  for (const item of playlistPatches) replacements.set(item.entry.relativePath, item.playlistsText);
  writeArchive(archive, replacements);
  writeFileSync(stateFor(root), `${JSON.stringify({ originalSha256: sha256(readFileSync(backup)), patchedSha256: sha256(readFileSync(archive)), patchedAt: new Date().toISOString() }, null, 2)}\n`);
  return { status: 'patched', integrity: syncIntegrity(root, archive) };
};

const restore = (root, force = false) => {
  const archive = archiveFor(root);
  if (isSteamStockArchive(archive)) throw new Error('refused_steam_original_asar');
  const backup = backupFor(root);
  if (!existsSync(backup)) return { status: 'no-backup' };
  const state = existsSync(stateFor(root)) ? JSON.parse(readFileSync(stateFor(root), 'utf8').replace(/^\uFEFF/u, '')) : {};
  if (!force && state.patchedSha256 && sha256(readFileSync(archive)) !== state.patchedSha256) throw new Error('app.asar_changed_since_patch');
  copyFileSync(backup, archive);
  return { status: 'restored', integrity: syncIntegrity(root, archive) };
};

const entryBytes = (parsed, entry) => parsed.bytes.subarray(
  parsed.dataStart + Number(entry.info.offset),
  parsed.dataStart + Number(entry.info.offset) + Number(entry.info.size),
);
const openArchive = (root) => {
  const archive = archiveFor(root);
  if (!existsSync(archive)) throw new Error(`app.asar_not_found:${archive}`);
  const parsed = readArchive(archive);
  return { archive, parsed, files: filesIn(parsed.value) };
};
const listArchive = (root) => {
  const { files } = openArchive(root);
  return files.map((entry) => `${entry.relativePath}\t${entry.info.size}`).join('\n');
};
const readArchiveFile = (root, relativePath) => {
  if (!relativePath) throw new Error('asar_read_path_missing');
  const { parsed, files } = openArchive(root);
  const entry = files.find((item) => item.relativePath === relativePath.replace(/\\/g, '/'));
  if (!entry) throw new Error(`asar_entry_missing:${relativePath}`);
  return entryBytes(parsed, entry).toString('utf8');
};
const verifyAnchors = (root) => {
  const { archive, parsed, files } = openArchive(root);
  const main = files.find((entry) => entry.relativePath === MAIN_ENTRY);
  const preload = files.find((entry) => entry.relativePath === PRELOAD_ENTRY);
  if (!main) throw new Error('asar_main_entry_missing');
  if (!preload) throw new Error('asar_preload_entry_missing');
  const mainText = entryBytes(parsed, main).toString('utf8');
  const preloadText = entryBytes(parsed, preload).toString('utf8');
  const playlistHits = [];
  for (const entry of files.filter((item) => /^out\/renderer\/assets\/.+\.js$/u.test(item.relativePath))) {
    const text = entryBytes(parsed, entry).toString('utf8');
    if (!text.includes('sourceProvider==="local"')) continue;
    playlistProviderFilterRe.lastIndex = 0;
    playlistHits.push({
      path: entry.relativePath,
      filterMatches: [...text.matchAll(playlistProviderFilterRe)].map((match) => match[0]),
    });
  }
  const aotCurrentCtor = '    skipTaskbar: true,\n    show: false,\n    // Ordinary topmost from the first frame (same floating level the runtime\n    // applyMiniPlayerAlwaysOnTop uses); some Linux window managers only honor\n    // the above-state reliably when it is set before the window is mapped.\n    alwaysOnTop: true,\n    webPreferences: {';
  const aotCurrentPet = 'const applyPetAlwaysOnTop = (window, platform = process.platform) => {\n  if (platform === "darwin") {\n    window.setAlwaysOnTop(true, "floating");\n    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });\n    return;\n  }\n  window.setAlwaysOnTop(true);\n};';
  const asarSha = sha256(readFileSync(archive));
  const headerSha = headerJsonHash(archive);
  const exePath = echoExeFor(root);
  let exeEmbeddedHash = null;
  if (exePath && existsSync(exePath)) {
    const exeBytes = readFileSync(exePath);
    const index = exeBytes.indexOf(APP_ASAR_INTEGRITY_PREFIX);
    if (index >= 0) exeEmbeddedHash = exeBytes.subarray(index + APP_ASAR_INTEGRITY_PREFIX.length, index + APP_ASAR_INTEGRITY_PREFIX.length + 64).toString('utf8');
  }
  const hits = {
    mainEntry: Boolean(main),
    preloadEntry: Boolean(preload),
    steamStreamingReject: mainText.includes(STEAM_STREAMING_REJECT),
    steamStreamingValidation: mainText.includes(steamStreamingValidation('provider2')) || mainText.includes(steamStreamingValidation('provider')),
    streamingResolver: mainText.includes('  let filePath;\n  let probe = createProbeHintForMediaItem('),
    streamingPath: mainText.includes('  } else if (item.mediaType === "streaming") {\n    filePath = decodeM3u8ProviderTrackId(item.providerTrackId).trim();\n  } else {'),
    streamingReturn: mainText.includes('  return { filePath, mimeType: null, probe, durationSeconds };'),
    qualityPassthrough: mainText.includes('quality: "standard",\n      stableKey:'),
    preloadStreamingNull: preloadText.includes('streaming: null,'),
    preloadDownloadsNull: preloadText.includes('downloads: null,'),
    preloadAccountsNull: preloadText.includes('accounts: null,'),
    playlistFilter: playlistHits.some((item) => item.filterMatches.length),
    aotMiniPlayerCtor: mainText.includes(aotCurrentCtor),
    aotPetHelper: mainText.includes(aotCurrentPet),
    aotBirthStamp: ['petWindow = window;', 'desktopLyricsWindow = window;', 'miniPlayerWindow = window;']
      .every((assignment) => mainText.includes(`  ${assignment}\n  window.setMenuBarVisibility(false);`)),
    playbackChannels: ['playback:play-media-item', 'playback:resolve-media-item', 'playback:prepare-media-item']
      .every((channel) => mainText.includes(channel)),
    mainIntegrity: Boolean(main.info.integrity),
    preloadIntegrity: Boolean(preload.info.integrity),
  };
  return {
    archive,
    stockAsarSha256: asarSha,
    stockAsarSha256Match: knownAsarHashes.has(asarSha),
    headerSha256: headerSha,
    headerSha256Match: knownHeaderHashes.has(headerSha),
    exePath: exePath || null,
    exeEmbeddedHash,
    exeHeaderSync: Boolean(exeEmbeddedHash && exeEmbeddedHash === headerSha),
    steamOriginalWriteBlocked: isSteamStockArchive(archive),
    playlistHits,
    hits,
    ok: Object.values(hits).every(Boolean),
  };
};

export { patch, restore, syncIntegrity, verifyAnchors };

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const [action = 'status', root = defaultRoot, flag] = process.argv.slice(2);
  try {
    if (action === 'list') {
      console.log(listArchive(root));
    } else if (action === 'read') {
      process.stdout.write(readArchiveFile(root, flag));
    } else if (action === 'anchors') {
      console.log(JSON.stringify(verifyAnchors(root), null, 2));
    } else {
      const result = action === 'patch'
        ? patch(root)
        : action === 'restore'
          ? restore(root, flag === '--force')
          : action === 'sync-integrity'
            ? { status: 'synced', integrity: syncIntegrity(root) }
            : { status: existsSync(backupFor(root)) ? 'patched-or-backed-up' : 'not-patched' };
      const integrity = result.integrity?.status ? ` integrity=${result.integrity.status}` : '';
      console.log(`ShinawaseLoader app.asar ${result.status}${integrity}`);
    }
  } catch (error) {
    console.error(`ShinawaseLoader app.asar failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
