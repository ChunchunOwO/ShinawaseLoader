#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const marker = '/* shinawase-loader-bridge-v1 */';
const preloadMarker = '/* shinawase-loader-preload-bridge-v1 */';
const playbackMarker = '/* shinawase-loader-streaming-playback-v1 */';
const align4 = (value) => (value + 3) & ~3;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const archiveFor = (root) => join(root, 'resources', 'app.asar');
const loaderFor = (root) => join(root, 'ShinawaseLoader');
const backupFor = (root) => join(loaderFor(root), 'backups', 'app.asar.original');
const stateFor = (root) => join(loaderFor(root), 'backups', 'app.asar.json');

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

const patchPlayback = (text) => {
  if (text.includes(playbackMarker)) return text;
  const validation = 'if (provider2 !== "m3u8" || !/^https?:\\/\\/\\S+$/iu.test(radioUrl)) {\n      throw new Error("Music streaming playback is not available in the Steam distribution.");\n    }';
  const validationAlt = 'if (provider !== "m3u8" || !/^https?:\\/\\/\\S+$/iu.test(radioUrl)) {\n      throw new Error("Music streaming playback is not available in the Steam distribution.");\n    }';
  let next = text;
  const oldValidation = next.includes(validation) ? validation : validationAlt;
  if (!next.includes(oldValidation)) throw new Error('asar_streaming_validation_missing');
  next = next.replace(oldValidation, 'if (provider2 === "m3u8" && !/^https?:\\/\\/\\S+$/iu.test(radioUrl)) {\n      throw new Error("Streaming playback URL must be valid.");\n    }');
  const oldResolve = '  let filePath;\n  let probe = createProbeHintForMediaItem(';
  if (!next.includes(oldResolve)) throw new Error('asar_streaming_resolver_missing');
  next = next.replace(oldResolve, '  let filePath;\n  let inputHeaders;\n  let probe = createProbeHintForMediaItem(');
  const oldPath = '  } else if (item.mediaType === "streaming") {\n    filePath = decodeM3u8ProviderTrackId(item.providerTrackId).trim();\n  } else {';
  if (!next.includes(oldPath)) throw new Error('asar_streaming_path_missing');
  next = next.replace(oldPath, '  } else if (item.mediaType === "streaming") {\n    if (item.provider === "m3u8") {\n      filePath = decodeM3u8ProviderTrackId(item.providerTrackId).trim();\n    } else {\n      const resolver = globalThis.__shinawaseResolveStreamingPlayback;\n      if (typeof resolver !== "function") throw new Error("Streaming playback bridge is unavailable.");\n      const source = await resolver({ provider: item.provider, providerTrackId: item.providerTrackId, quality: item.quality });\n      filePath = source?.url;\n      inputHeaders = source?.headers;\n      if (typeof filePath !== "string" || !/^https?:\\/\\/\\S+$/iu.test(filePath)) throw new Error("Streaming provider did not return a playable URL.");\n    }\n  } else {');
  const oldReturn = '  return { filePath, mimeType: null, probe, durationSeconds };';
  if (!next.includes(oldReturn)) throw new Error('asar_streaming_return_missing');
  next = next.replace(oldReturn, '  return { filePath, inputHeaders, mimeType: null, probe, durationSeconds };');
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
    if (entry.relativePath === 'out/main/index.js') found = true;
    info.offset = String(offset);
    info.size = content.length;
    if (replacement !== undefined) delete info.integrity;
    chunks.push(content);
    offset += content.length;
  }
  if (!found) throw new Error('asar_main_entry_missing');
  const temporary = `${archive}.${process.pid}.tmp`;
  writeFileSync(temporary, Buffer.concat([makeHeader(parsed.value), ...chunks]));
  rmSync(archive, { force: true });
  renameSync(temporary, archive);
};

const patch = (root) => {
  const archive = archiveFor(root);
  if (!existsSync(archive)) throw new Error(`app.asar_not_found:${archive}`);
  const current = readArchive(archive);
  const main = filesIn(current.value).find((entry) => entry.relativePath === 'out/main/index.js');
  if (!main) throw new Error('asar_main_entry_missing');
  const currentText = current.bytes.subarray(current.dataStart + Number(main.info.offset), current.dataStart + Number(main.info.offset) + Number(main.info.size)).toString('utf8');
  const preload = filesIn(current.value).find((entry) => entry.relativePath === 'out/preload/index.mjs');
  if (!preload) throw new Error('asar_preload_entry_missing');
  const currentPreloadText = current.bytes.subarray(current.dataStart + Number(preload.info.offset), current.dataStart + Number(preload.info.offset) + Number(preload.info.size)).toString('utf8');
  const mainWithBridge = currentText.includes(marker) || currentText.includes('external-mod-loader:start:requested') ? currentText : `${bridge}\n${currentText}`;
  const mainText = patchPlayback(mainWithBridge);
  const preloadText = patchPreload(currentPreloadText);
  if (mainText === currentText && preloadText === currentPreloadText) return { status: 'already-patched' };
  const backup = backupFor(root);
  if (!existsSync(backup)) {
    const backupDir = dirname(backup);
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(archive, backup);
  }
  writeArchive(archive, new Map([
    ['out/main/index.js', mainText],
    ['out/preload/index.mjs', preloadText],
  ]));
  writeFileSync(stateFor(root), `${JSON.stringify({ originalSha256: sha256(readFileSync(backup)), patchedSha256: sha256(readFileSync(archive)), patchedAt: new Date().toISOString() }, null, 2)}\n`);
  return { status: 'patched' };
};

const restore = (root, force = false) => {
  const archive = archiveFor(root);
  const backup = backupFor(root);
  if (!existsSync(backup)) return { status: 'no-backup' };
  const state = existsSync(stateFor(root)) ? JSON.parse(readFileSync(stateFor(root), 'utf8').replace(/^\uFEFF/u, '')) : {};
  if (!force && state.patchedSha256 && sha256(readFileSync(archive)) !== state.patchedSha256) throw new Error('app.asar_changed_since_patch');
  copyFileSync(backup, archive);
  return { status: 'restored' };
};

const [action = 'status', root = join(dirname(new URL(import.meta.url).pathname), '..'), flag] = process.argv.slice(2);
try {
  const result = action === 'patch' ? patch(root) : action === 'restore' ? restore(root, flag === '--force') : { status: existsSync(backupFor(root)) ? 'patched-or-backed-up' : 'not-patched' };
  console.log(`ShinawaseLoader app.asar ${result.status}`);
} catch (error) {
  console.error(`ShinawaseLoader app.asar failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
