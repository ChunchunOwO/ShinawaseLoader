'use strict';

const { basename, dirname, join } = require('node:path');
const { existsSync, readFileSync } = require('node:fs');
const { createRequire } = require('node:module');

const ECHO_APP_ID = 5105150;
const ECHO_IMAGE_RE = /^ECHO(?:\.modded|\s+.+)?\.exe$/iu;
const STEAM_MODULE_RE = /steam_api64\.dll|echo-steam-leaderboards|steamworksjs/iu;
const ECHO_AUMID_RE = /^app\.echo\.steam(?:\.dev)?$/iu;
const RELATED_NATIVE_RE = /ECHO(?:\.modded|\s+.+)?\.exe$|electron\.exe$|steam_api64\.dll|echo-steam-leaderboards|steamworksjs/iu;
const MAX_INT32 = 2147483647;

const BOARDS = [
  { id: 'listening-time', apiName: 'ECHO_LISTENING_SECONDS_V1', scoreUnit: 'seconds', scoreField: 'totalPlayedSeconds' },
  { id: 'completed-tracks', apiName: 'ECHO_COMPLETED_TRACKS_V1', scoreUnit: 'count', scoreField: 'completedUniqueTracks' },
  { id: 'listening-streak', apiName: 'ECHO_LONGEST_STREAK_DAYS_V1', scoreUnit: 'count', scoreField: 'longestCompletionStreakDays' },
  { id: 'deep-session', apiName: 'ECHO_LONGEST_SESSION_SECONDS_V1', scoreUnit: 'seconds', scoreField: 'longestListeningSessionSeconds' },
  { id: 'rediscovered-tracks', apiName: 'ECHO_REDISCOVERED_TRACKS_V1', scoreUnit: 'count', scoreField: 'rediscoveredTrackCount' },
];

const USER_STATS = [
  { id: 'listening-minutes', apiName: 'ECHO_STAT_LISTEN_MINUTES', unit: 'minutes', syncPolicy: 'achievement', fromStats: (stats) => stats.totalPlayedSeconds / 60 },
  { id: 'completed-plays', apiName: 'ECHO_STAT_COMPLETED_PLAYS', unit: 'count', syncPolicy: 'achievement', fromStats: (stats) => stats.qualifiedCompletedPlayCount },
  { id: 'unique-tracks', apiName: 'ECHO_STAT_UNIQUE_TRACKS', unit: 'count', syncPolicy: 'achievement', fromStats: (stats) => stats.completedUniqueTracks },
  { id: 'longest-streak-days', apiName: 'ECHO_STAT_LONGEST_STREAK_DAYS', unit: 'days', syncPolicy: 'achievement', fromStats: (stats) => stats.longestCompletionStreakDays },
  { id: 'night-minutes', apiName: 'ECHO_STAT_NIGHT_MINUTES', unit: 'minutes', syncPolicy: 'achievement', fromStats: (stats) => stats.nightPlayedSeconds / 60 },
  { id: 'longest-session-minutes', apiName: 'ECHO_STAT_LONGEST_SESSION_MINUTES', unit: 'minutes', syncPolicy: 'optional', fromStats: (stats) => stats.longestListeningSessionSeconds / 60 },
  { id: 'rediscovered-tracks', apiName: 'ECHO_STAT_REDISCOVERED_TRACKS', unit: 'count', syncPolicy: 'optional', fromStats: (stats) => stats.rediscoveredTrackCount },
  { id: 'completed-albums', apiName: 'ECHO_STAT_COMPLETED_ALBUMS', unit: 'count', syncPolicy: 'achievement', fromStats: (stats) => stats.completedUniqueAlbums },
];

const DETAIL_FIELDS = [
  'completedUniqueTracks',
  'listeningSessionCount',
  'longestListeningSessionSeconds',
  'longestCompletionStreakDays',
  'nightPlayedSeconds',
  'rediscoveredTrackCount',
  'completedShortUniqueTracks',
];

const STAT_FIELDS = [
  'totalPlayedSeconds',
  'completedUniqueTracks',
  'listeningSessionCount',
  'longestListeningSessionSeconds',
  'longestCompletionStreakDays',
  'nightPlayedSeconds',
  'rediscoveredTrackCount',
  'completedShortUniqueTracks',
  'qualifiedCompletedPlayCount',
  'completedUniqueAlbums',
];

const SCOPE_REQUEST = {
  global: { request: 0, start: 1, end: 50 },
  friends: { request: 2, start: 0, end: 0 },
  'around-user': { request: 1, start: -4, end: 5 },
};

const STEAM_MODULE_CANDIDATES = [
  './out/main/integrations/steam/SteamworksService.js',
  './out/main/integrations/steam/SteamCapabilityServices.js',
  './out/main/integrations/steam/SteamLeaderboardService.js',
  './out/main/integrations/steam/SteamListeningStatsService.js',
  './out/main/library/LibraryService.js',
  './electron-app/out/main/integrations/steam/SteamworksService.js',
  './electron-app/out/main/integrations/steam/SteamCapabilityServices.js',
];

const IPC = {
  steamStatus: 'steam:get-status',
  leaderboardStatus: 'steam:leaderboard:get-status',
  leaderboardSetEnabled: 'steam:leaderboard:set-enabled',
  leaderboardSync: 'steam:leaderboard:sync',
  leaderboardEntries: 'steam:leaderboard:get-entries',
  statsStatus: 'steam:listening-stats:get-status',
  statsSetEnabled: 'steam:listening-stats:set-enabled',
  statsSync: 'steam:listening-stats:sync',
  appGetSettings: 'app:get-settings',
  appSetSettings: 'app:set-settings',
  libraryDashboard: 'library:get-playback-stats-dashboard',
};

const RETRY_DELAYS_MS = [250, 750];

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
const errorText = (error) => (error instanceof Error ? error.message : String(error));
const clampInt = (value) => Math.max(0, Math.min(MAX_INT32, Math.floor(Number.isFinite(Number(value)) ? Number(value) : 0)));
const safeGet = (value, key) => {
  try { return value[key]; } catch { return undefined; }
};
const parseAppId = (value) => {
  if (value == null || value === false) return null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value === 'bigint') {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
  }
  const text = String(value).trim();
  if (!text || text === '0') return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const emptyStats = () => {
  const stats = {};
  for (const field of STAT_FIELDS) stats[field] = 0;
  return stats;
};

const normalizeStats = (input) => {
  const stats = emptyStats();
  const raw = asObject(input) || {};
  for (const field of STAT_FIELDS) stats[field] = clampInt(raw[field]);
  return stats;
};

const aggregateDetails = (stats) => DETAIL_FIELDS.map((field) => clampInt(stats[field]));

const decodeDetails = (details) => {
  const list = Array.isArray(details) ? details : [];
  return {
    completedUniqueTracks: clampInt(list[0]),
    listeningSessionCount: clampInt(list[1]),
    longestListeningSessionSeconds: clampInt(list[2]),
    longestListeningStreakDays: clampInt(list[3]),
    longestCompletionStreakDays: clampInt(list[3]),
    nightListeningSeconds: clampInt(list[4]),
    nightPlayedSeconds: clampInt(list[4]),
    rediscoveredTrackCount: clampInt(list[5]),
    completedShortUniqueTracks: clampInt(list[6]),
  };
};

const resolveBoard = (value) => {
  const key = String(value || '').trim();
  if (!key) return null;
  return BOARDS.find((board) => board.id === key || board.apiName === key) || null;
};

const resolveScope = (value) => {
  const key = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(SCOPE_REQUEST, key) ? key : null;
};

const retryTransient = async (operation) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
};

const isEchoImage = (execPath) => ECHO_IMAGE_RE.test(basename(String(execPath || '')));

const truthyEnv = (value) => {
  const text = String(value == null ? '' : value).trim();
  return Boolean(text) && !/^(0|false|no|off)$/iu.test(text);
};

const moduleNameOf = (item) => String(item?.name || item?.path || item || '');

const looksLikeSteamModule = (item) => STEAM_MODULE_RE.test(moduleNameOf(item));

const readSteamId = (localplayer) => {
  if (!localplayer || typeof localplayer.getSteamId !== 'function') return null;
  try {
    const id = localplayer.getSteamId();
    if (id == null) return null;
    if (typeof id === 'string' || typeof id === 'number' || typeof id === 'bigint') return String(id);
    if (id.steamId64 != null) return String(id.steamId64);
    if (typeof id.toString === 'function') {
      const text = id.toString();
      if (text && text !== '[object Object]') return text;
    }
    return null;
  } catch {
    return null;
  }
};

const readPersonaName = (localplayer) => {
  if (!localplayer || typeof localplayer.getName !== 'function') return null;
  try {
    const name = localplayer.getName();
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
};

const activate = (host) => {
  const app = host && host.app;
  const BrowserWindow = host && host.BrowserWindow;
  const ipcMain = host && host.ipcMain;
  const log = (level, message) => {
    try { host.log(level, message); } catch { /* logging is best-effort */ }
  };

  const handles = [];
  const runtime = {
    appRequire: null,
    leaderboardService: null,
    listeningStatsService: null,
    libraryService: null,
    steamStatusGetter: null,
    localplayer: null,
    steamClient: null,
    leaderboardBinding: null,
    cacheHits: [],
  };

  const readLiveConfig = () => {
    const base = asObject(host.config) || {};
    try {
      const file = JSON.parse(readFileSync(join(host.directory, 'config.json'), 'utf8'));
      return { ...base, ...(asObject(file) || {}) };
    } catch {
      return base;
    }
  };

  const firstExisting = (paths) => {
    for (const file of paths) {
      if (file && existsSync(file)) return file;
    }
    return null;
  };

  const leaderboardAddonPath = () => {
    const resources = process.resourcesPath || '';
    const appPath = (() => { try { return app?.getAppPath?.() || ''; } catch { return ''; } })();
    return firstExisting([
      resources ? join(resources, 'echo-steam-leaderboards.node') : '',
      appPath ? join(appPath, 'echo-steam-leaderboards.node') : '',
      appPath ? join(appPath, 'electron-app', 'build', 'echo-steam-leaderboards.node') : '',
      appPath ? join(appPath, '..', 'echo-steam-leaderboards.node') : '',
    ]);
  };

  const steamApiDllPath = () => {
    const resources = process.resourcesPath || '';
    const appPath = (() => { try { return app?.getAppPath?.() || ''; } catch { return ''; } })();
    return firstExisting([
      resources ? join(resources, 'app.asar.unpacked', 'node_modules', 'steamworks.js', 'dist', 'win64', 'steam_api64.dll') : '',
      resources ? join(resources, 'steam_api64.dll') : '',
      appPath ? join(appPath, 'node_modules', 'steamworks.js', 'dist', 'win64', 'steam_api64.dll') : '',
      appPath ? join(appPath, '..', 'node_modules', 'steamworks.js', 'dist', 'win64', 'steam_api64.dll') : '',
    ]);
  };

  const cacheKeys = () => Object.keys(require.cache || {});

  const cacheEntry = (pattern) => {
    const key = cacheKeys().find((item) => pattern.test(item));
    if (!key) return null;
    try {
      return { key, exports: require.cache[key]?.exports || null };
    } catch {
      return { key, exports: null };
    }
  };

  const visitExports = (root, visit, depth = 0, seen = new WeakSet(), budget = { left: 800 }) => {
    if (!root || depth > 4 || budget.left <= 0) return;
    const kind = typeof root;
    if (kind !== 'object' && kind !== 'function') return;
    if (seen.has(root)) return;
    seen.add(root);
    budget.left -= 1;
    try { visit(root); } catch { /* steamworks getters may throw before init */ }
    const names = [];
    try { names.push(...Object.getOwnPropertyNames(root).slice(0, 40)); } catch { return; }
    for (const name of names) {
      if (name === 'compilerOptions' || name === 'parent' || name === 'children' || name === 'require' || name === 'prototype' || name === 'constructor') continue;
      const next = safeGet(root, name);
      visitExports(next, visit, depth + 1, seen, budget);
    }
  };

  const rememberCacheHit = (kind, key) => {
    if (!key) return;
    if (!runtime.cacheHits.some((item) => item.kind === kind && item.key === key)) {
      runtime.cacheHits.push({ kind, key });
    }
  };

  const adoptSteamObjects = (value, sourceKey) => {
    if (!value) return;
    try {
      const kind = typeof value;
      if (kind !== 'object' && kind !== 'function') return;
    } catch {
      return;
    }
    if (typeof safeGet(value, 'getSteamLeaderboardService') === 'function' && !runtime.leaderboardService) {
      try {
        const service = value.getSteamLeaderboardService();
        if (service && typeof service.sync === 'function') {
          runtime.leaderboardService = service;
          rememberCacheHit('getSteamLeaderboardService', sourceKey);
        }
      } catch { /* bundled builds may throw until Steam is up */ }
    }
    if (typeof safeGet(value, 'getSteamListeningStatsService') === 'function' && !runtime.listeningStatsService) {
      try {
        const service = value.getSteamListeningStatsService();
        if (service && typeof service.sync === 'function') {
          runtime.listeningStatsService = service;
          rememberCacheHit('getSteamListeningStatsService', sourceKey);
        }
      } catch { /* ignore */ }
    }
    if (typeof safeGet(value, 'getLibraryService') === 'function' && !runtime.libraryService) {
      try {
        const service = value.getLibraryService();
        if (service && typeof service.getSteamLeaderboardHistoryStats === 'function') {
          runtime.libraryService = service;
          rememberCacheHit('getLibraryService', sourceKey);
        }
      } catch { /* ignore */ }
    }
    if (typeof safeGet(value, 'getSteamStatus') === 'function' && !runtime.steamStatusGetter) {
      runtime.steamStatusGetter = () => value.getSteamStatus();
      rememberCacheHit('getSteamStatus', sourceKey);
    }
    const sync = safeGet(value, 'sync');
    const getSnapshot = safeGet(value, 'getSnapshot');
    const getStatus = safeGet(value, 'getStatus');
    const handles = safeGet(value, 'handles');
    if (typeof sync === 'function' && typeof getSnapshot === 'function' && typeof getStatus === 'function' && handles instanceof Map && !runtime.leaderboardService) {
      runtime.leaderboardService = value;
      rememberCacheHit('SteamLeaderboardService', sourceKey);
    }
    if (typeof sync === 'function' && typeof safeGet(value, 'preview') === 'function' && typeof safeGet(value, 'setRetryState') === 'function' && !runtime.listeningStatsService) {
      runtime.listeningStatsService = value;
      rememberCacheHit('SteamListeningStatsService', sourceKey);
    }
    if (typeof safeGet(value, 'getSteamLeaderboardHistoryStats') === 'function' && !runtime.libraryService) {
      runtime.libraryService = value;
      rememberCacheHit('LibraryService', sourceKey);
    }
    const localplayer = safeGet(value, 'localplayer');
    if (localplayer && typeof safeGet(localplayer, 'getSteamId') === 'function' && !runtime.localplayer) {
      runtime.localplayer = localplayer;
      rememberCacheHit('localplayer', sourceKey);
    }
    const utils = safeGet(value, 'utils');
    const stats = safeGet(value, 'stats');
    const looksLikeClient = Boolean(
      (localplayer && typeof safeGet(localplayer, 'getSteamId') === 'function')
      || (utils && typeof safeGet(utils, 'getAppId') === 'function')
      || (stats && typeof safeGet(stats, 'setInt') === 'function' && typeof safeGet(stats, 'store') === 'function'),
    );
    if (looksLikeClient && (localplayer || utils || stats) && !runtime.steamClient) {
      runtime.steamClient = value;
      rememberCacheHit('steamClient', sourceKey);
    }
  };

  const scanRequireCache = () => {
    runtime.cacheHits = [];
    const adoptCached = (entry, kind) => {
      if (!entry) return;
      rememberCacheHit(kind, entry.key);
      try { adoptSteamObjects(entry.exports, entry.key); } catch { /* native getters may throw before init */ }
      try { adoptSteamObjects(entry.exports && entry.exports.default, entry.key); } catch { /* ignore */ }
      try { visitExports(entry.exports, (value) => adoptSteamObjects(value, entry.key)); } catch { /* ignore */ }
    };
    adoptCached(cacheEntry(/steamworksjs[^/\\]*\.node$/iu), 'steamworksjs.node');
    const leaderboardNative = cacheEntry(/echo-steam-leaderboards[^/\\]*\.node$/iu);
    if (leaderboardNative) {
      rememberCacheHit('echo-steam-leaderboards.node', leaderboardNative.key);
      if (leaderboardNative.exports && typeof leaderboardNative.exports.findLeaderboard === 'function') {
        runtime.leaderboardBinding = leaderboardNative.exports;
      }
    }
    adoptCached(cacheEntry(/steamworks\.js/iu), 'steamworks.js');
    for (const key of cacheKeys()) {
      if (!/echo-steam-leaderboards|steamworksjs|steamworks\.js|SteamCapability|SteamLeaderboard|SteamListening|SteamworksService|LibraryService/iu.test(key)) continue;
      try { adoptSteamObjects(require.cache[key]?.exports, key); } catch { /* ignore */ }
      try { visitExports(require.cache[key]?.exports, (value) => adoptSteamObjects(value, key)); } catch { /* ignore */ }
    }
  };

  const resolveAppRequire = () => {
    if (runtime.appRequire || !app || typeof app.getAppPath !== 'function') return runtime.appRequire;
    try {
      runtime.appRequire = createRequire(join(app.getAppPath(), 'package.json'));
    } catch {
      runtime.appRequire = null;
    }
    return runtime.appRequire;
  };

  const tryEchoModules = () => {
    const appRequire = resolveAppRequire();
    if (!appRequire) return;
    for (const candidate of STEAM_MODULE_CANDIDATES) {
      try {
        const exported = appRequire(candidate);
        adoptSteamObjects(exported, candidate);
        visitExports(exported, (value) => adoptSteamObjects(value, candidate));
      } catch { /* packaged builds do not expose these paths */ }
    }
  };

  const refreshRuntime = () => {
    try { tryEchoModules(); } catch { /* packaged builds hide internal modules */ }
    try { scanRequireCache(); } catch { /* steamworks getters may throw before init */ }
  };

  const invokeMap = () => {
    if (!ipcMain) return null;
    const seen = new Set();
    const consider = (owner) => {
      if (!owner || seen.has(owner)) return null;
      seen.add(owner);
      try {
        if (owner._invokeHandlers instanceof Map) return owner._invokeHandlers;
      } catch { /* ignore */ }
      try {
        if (owner.invokeHandlers instanceof Map) return owner.invokeHandlers;
      } catch { /* ignore */ }
      let names = [];
      try { names = Object.getOwnPropertyNames(owner); } catch { names = []; }
      let fallback = null;
      for (const key of names) {
        try {
          const value = owner[key];
          if (!(value instanceof Map) || typeof value.get !== 'function') continue;
          if (value.has(IPC.steamStatus) || value.has(IPC.appGetSettings) || value.has(IPC.leaderboardStatus)) return value;
          if (!fallback && value.size > 0) fallback = value;
        } catch { /* Electron internals differ by version */ }
      }
      if (fallback) return fallback;
      try { return consider(Object.getPrototypeOf(owner)); } catch { return null; }
    };
    return consider(ipcMain);
  };

  const callInvokeListener = async (listener, args) => {
    let replied = null;
    const event = {
      sender: { id: 0, send() {}, isDestroyed: () => false },
      processId: process.pid,
      frameId: 0,
      _reply: (value) => { replied = { ok: true, value }; },
      _throw: (error) => { replied = { ok: false, error }; },
    };
    const direct = await listener(event, ...args);
    if (replied) {
      if (replied.ok) return replied.value;
      throw replied.error;
    }
    return direct;
  };

  const invokeIpc = async (channel, ...args) => {
    try {
      const map = invokeMap();
      const listener = map && typeof map.get === 'function' ? map.get(channel) : null;
      if (typeof listener !== 'function') return { found: false };
      const result = await callInvokeListener(listener, args);
      return { found: true, result };
    } catch (error) {
      return { found: false, error: errorText(error) };
    }
  };

  const rendererEval = async (script) => {
    const windows = BrowserWindow?.getAllWindows?.() || [];
    for (const window of windows) {
      try {
        if (!window || window.isDestroyed() || !window.webContents || window.webContents.isDestroyed()) continue;
        const result = await window.webContents.executeJavaScript(script, true);
        if (result != null) return result;
      } catch { /* try the next window */ }
    }
    return null;
  };

  const echoAppSettings = async () => rendererEval(`(() => {
    const appApi = window.echo && window.echo.app;
    if (!appApi) return null;
    if (typeof appApi.getSettings === 'function') return appApi.getSettings();
    if (typeof appApi.settings === 'function') return appApi.settings();
    return null;
  })()`);

  const echoAppSetSettings = async (patch) => rendererEval(`(async () => {
    const appApi = window.echo && window.echo.app;
    if (!appApi || typeof appApi.setSettings !== 'function') return { ok: false, error: 'echo_app_setSettings_missing' };
    const next = await appApi.setSettings(${JSON.stringify(patch)});
    return { ok: true, settings: next };
  })()`);

  const echoSteamStatus = async () => rendererEval(`(async () => {
    const steam = window.echo && window.echo.steam;
    if (steam && typeof steam.getStatus === 'function') return steam.getStatus();
    if (steam && typeof steam.status === 'function') return steam.status();
    const ipc = window.echo && window.echo.ipc;
    if (ipc && typeof ipc.invoke === 'function') return ipc.invoke(${JSON.stringify(IPC.steamStatus)});
    return null;
  })()`);

  const echoLeaderboardStatus = async () => rendererEval(`(async () => {
    const steam = window.echo && window.echo.steam;
    if (steam && typeof steam.getLeaderboardStatus === 'function') return steam.getLeaderboardStatus();
    const ipc = window.echo && window.echo.ipc;
    if (ipc && typeof ipc.invoke === 'function') return ipc.invoke(${JSON.stringify(IPC.leaderboardStatus)});
    return null;
  })()`);

  const echoLibraryDashboard = async () => rendererEval(`(async () => {
    const lib = window.echo && window.echo.library;
    if (lib && typeof lib.getPlaybackStatsDashboard === 'function') return lib.getPlaybackStatsDashboard({ mediaType: 'local' });
    return null;
  })()`);

  const readSettings = async () => {
    const ipc = await invokeIpc(IPC.appGetSettings);
    if (ipc.found && asObject(ipc.result)) return ipc.result;
    const fromRenderer = await echoAppSettings();
    if (asObject(fromRenderer)) return fromRenderer;
    return {};
  };

  const processImages = () => {
    const paths = [];
    const add = (value) => {
      const text = String(value || '').trim();
      if (text && !paths.includes(text)) paths.push(text);
    };
    add(process.execPath);
    add(process.argv0);
    try { add(app?.getPath?.('exe')); } catch { /* Electron path helpers are optional */ }
    return paths;
  };

  const processImageNames = () => processImages().map((item) => basename(item)).filter(Boolean);

  const readAumid = () => {
    try {
      if (typeof app?.getAppUserModelId === 'function') return app.getAppUserModelId() || null;
    } catch { /* ignore */ }
    return null;
  };

  const envAppIdCandidates = () => {
    const ids = [];
    for (const raw of [process.env.SteamAppId, process.env.SteamGameId, process.env.ECHO_STEAM_APP_ID]) {
      const id = parseAppId(raw);
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  };

  const envAppId = () => {
    const ids = envAppIdCandidates();
    return ids.find((id) => id === ECHO_APP_ID) || ids[0] || null;
  };

  const steamAppIdFile = () => firstExisting([
    join(process.cwd(), 'steam_appid.txt'),
    process.resourcesPath ? join(process.resourcesPath, 'steam_appid.txt') : '',
    process.execPath ? join(dirname(process.execPath), 'steam_appid.txt') : '',
    process.env.ECHO_GAME_ROOT ? join(process.env.ECHO_GAME_ROOT, 'steam_appid.txt') : '',
    process.env.ECHO_MOD_ROOT ? join(process.env.ECHO_MOD_ROOT, 'steam_appid.txt') : '',
  ]);

  const fileAppId = () => {
    const file = steamAppIdFile();
    if (!file) return null;
    try {
      return parseAppId(String(readFileSync(file, 'utf8')).trim());
    } catch {
      return null;
    }
  };

  const readClientAppId = (client) => {
    if (!client) return null;
    const utils = safeGet(client, 'utils');
    if (utils && typeof safeGet(utils, 'getAppId') === 'function') {
      try { return parseAppId(utils.getAppId()); } catch { /* ignore */ }
    }
    if (typeof safeGet(client, 'getAppId') === 'function') {
      try { return parseAppId(client.getAppId()); } catch { /* ignore */ }
    }
    return parseAppId(safeGet(client, 'appId')) || parseAppId(safeGet(client, 'appid'));
  };

  const clientAppId = () => readClientAppId(runtime.steamClient);

  const steamModulesPresent = (modules) => {
    const list = Array.isArray(modules) ? modules : [];
    if (list.some(looksLikeSteamModule)) return true;
    try {
      if (cacheKeys().some((key) => STEAM_MODULE_RE.test(key))) return true;
    } catch { /* ignore */ }
    try {
      const loaded = process.moduleLoadList;
      if (Array.isArray(loaded) && loaded.some((item) => STEAM_MODULE_RE.test(String(item)))) return true;
    } catch { /* ignore */ }
    return Boolean(runtime.leaderboardBinding || runtime.steamClient || runtime.localplayer);
  };

  const processGuard = async () => {
    const images = processImages();
    const imageNames = processImageNames();
    const imageOk = imageNames.some((name) => isEchoImage(name));
    const aumid = readAumid();
    const aumidOk = ECHO_AUMID_RE.test(String(aumid || ''));
    const envIds = envAppIdCandidates();
    const fromEnv = envAppId();
    const envEchoApp = envIds.includes(ECHO_APP_ID);
    const hasModdedHost = truthyEnv(process.env.ECHO_MODDED_HOST);
    const hasGameRoot = Boolean(String(process.env.ECHO_GAME_ROOT || '').trim());
    const appIdFile = steamAppIdFile();
    const fromFile = fileAppId();
    const fromClient = clientAppId();
    let nativeModules = [];
    try { nativeModules = listNativeModules(); } catch { nativeModules = []; }
    const steamLoaded = steamModulesPresent(nativeModules);

    let steamStatus = null;
    if (typeof runtime.steamStatusGetter === 'function') {
      try { steamStatus = runtime.steamStatusGetter(); } catch { steamStatus = null; }
    }
    if (!asObject(steamStatus)) {
      const ipc = await invokeIpc(IPC.steamStatus);
      if (ipc.found) steamStatus = ipc.result;
    }
    if (!asObject(steamStatus)) steamStatus = await echoSteamStatus();
    const fromStatus = parseAppId(asObject(steamStatus)?.appId);

    const appIdSources = [];
    if (fromClient) appIdSources.push({ source: 'steamworks_client', appId: fromClient });
    if (fromEnv) appIdSources.push({ source: 'env', appId: fromEnv, candidates: envIds });
    if (fromFile) appIdSources.push({ source: 'steam_appid.txt', appId: fromFile, path: appIdFile });
    if (fromStatus) {
      appIdSources.push({
        source: 'steam_status',
        appId: fromStatus,
        appIdSource: asObject(steamStatus)?.appIdSource || null,
      });
    }

    const appId = appIdSources.length ? appIdSources[0].appId : null;
    const signals = [];
    if (imageOk) signals.push('echo_image');
    if (aumidOk) signals.push('app_user_model_id');
    if (envEchoApp) signals.push('steam_app_id_env');
    if (appIdFile) signals.push('steam_appid_txt');
    if (steamLoaded) signals.push('steam_modules');
    if (hasModdedHost) signals.push('echo_modded_host');
    if (hasGameRoot) signals.push('echo_game_root');

    const processOk = signals.length > 0;
    const steamOk = steamLoaded || Boolean(runtime.localplayer || runtime.steamClient || asObject(steamStatus)?.state === 'ready');
    const appIdUnknown = !appId;
    const appIdOk = appId === ECHO_APP_ID;
    const appIdMismatch = Boolean(appId) && appId !== ECHO_APP_ID;
    const writeAllowed = processOk && !appIdMismatch;
    const reasons = [];
    if (!processOk) reasons.push('not_echo_process');
    if (appIdUnknown) reasons.push('steam_app_id_unknown');
    else if (appIdMismatch) reasons.push(`steam_app_id_mismatch:${appId}`);
    if (processOk && !steamOk) reasons.push('steam_modules_not_loaded');

    let verdict = 'echo';
    if (!processOk) verdict = 'not_echo';
    else if (appIdMismatch) verdict = 'app_id_mismatch';
    else if (appIdUnknown) verdict = 'app_id_unknown';
    else if (!steamOk) verdict = 'steam_modules_not_loaded';

    const appIdWarning = processOk && (appIdUnknown || appIdMismatch)
      ? (appIdMismatch
        ? `Steam App ID is ${appId}, not ${ECHO_APP_ID}. Local reads stay available; uploads/sync are blocked.`
        : `App ID was not read from the environment; continuing as the ECHO process. Uploads use the current Steam session.`)
      : null;

    return {
      allowed: writeAllowed,
      writeAllowed,
      processOk,
      echoProcess: processOk,
      steamOk,
      imageOk,
      appIdOk,
      appIdKnown: Boolean(appId),
      appIdUnknown,
      appIdMismatch,
      steamModulesLoaded: steamLoaded,
      appId: appId || null,
      appIdSources,
      appIdWarning,
      image: imageNames[0] || basename(process.execPath || ''),
      images: imageNames,
      execPaths: images,
      appUserModelId: aumid,
      signals,
      verdict,
      reason: reasons.join(',') || null,
    };
  };

  const refuseWrites = async () => {
    const guard = await processGuard();
    if (!guard.processOk) {
      return {
        ok: false,
        error: 'not_echo_process',
        message: 'Current process is not ECHO. This test inspects the in-process Echo runtime only; it does not search for another PID.',
        guard,
      };
    }
    if (guard.appIdMismatch) {
      return {
        ok: false,
        error: 'steam_app_id_mismatch',
        message: `Steam App ID is ${guard.appId}, not ${ECHO_APP_ID}.`,
        guard,
      };
    }
    return null;
  };

  const listNativeModules = () => {
    const names = [];
    const cachedHost = cacheEntry(/echo-native-host[^/\\]*\.node$/iu);
    if (cachedHost?.exports && typeof cachedHost.exports.modules === 'function') {
      try {
        const listed = cachedHost.exports.modules();
        if (Array.isArray(listed)) return listed;
      } catch { /* current-process listing is best-effort */ }
    }
    // native-host loads echo-native-host.node via process.dlopen, so it is not
    // in require.cache. Do not require() a second copy of the addon.
    try {
      const loaded = process.moduleLoadList;
      if (Array.isArray(loaded)) {
        for (const item of loaded) names.push({ name: String(item), base: '', size: 0, source: 'moduleLoadList' });
      }
    } catch { /* ignore */ }
    for (const key of cacheKeys()) {
      if (/\.(node|dll)$/iu.test(key)) names.push({ name: basename(key), path: key, base: '', size: 0, source: 'require.cache' });
    }
    return names;
  };

  const filterNativeModules = (modules) => {
    const list = Array.isArray(modules) ? modules : [];
    return list.filter((item) => RELATED_NATIVE_RE.test(moduleNameOf(item)));
  };

  const leaderboardBinding = () => {
    if (runtime.leaderboardBinding && typeof runtime.leaderboardBinding.findLeaderboard === 'function') {
      return runtime.leaderboardBinding;
    }
    scanRequireCache();
    if (runtime.leaderboardBinding && typeof runtime.leaderboardBinding.findLeaderboard === 'function') {
      return runtime.leaderboardBinding;
    }
    // Reuse the copy ECHO already required. Never require a second path and
    // never call binding.initialize — that is not proven idempotent.
    return null;
  };

  const applyListeningLocalValues = (stats, status) => {
    const list = Array.isArray(status?.stats) ? status.stats : [];
    if (!list.length) return false;
    let used = false;
    for (const definition of USER_STATS) {
      const row = list.find((item) => item?.apiName === definition.apiName || item?.id === definition.id);
      if (!row || row.localValue == null) continue;
      const local = Number(row.localValue);
      if (!Number.isFinite(local)) continue;
      used = true;
      if (definition.apiName === 'ECHO_STAT_LISTEN_MINUTES') stats.totalPlayedSeconds = clampInt(local * 60);
      else if (definition.apiName === 'ECHO_STAT_COMPLETED_PLAYS') stats.qualifiedCompletedPlayCount = clampInt(local);
      else if (definition.apiName === 'ECHO_STAT_UNIQUE_TRACKS') stats.completedUniqueTracks = clampInt(local);
      else if (definition.apiName === 'ECHO_STAT_LONGEST_STREAK_DAYS') stats.longestCompletionStreakDays = clampInt(local);
      else if (definition.apiName === 'ECHO_STAT_NIGHT_MINUTES') stats.nightPlayedSeconds = clampInt(local * 60);
      else if (definition.apiName === 'ECHO_STAT_LONGEST_SESSION_MINUTES') stats.longestListeningSessionSeconds = clampInt(local * 60);
      else if (definition.apiName === 'ECHO_STAT_REDISCOVERED_TRACKS') stats.rediscoveredTrackCount = clampInt(local);
      else if (definition.apiName === 'ECHO_STAT_COMPLETED_ALBUMS') stats.completedUniqueAlbums = clampInt(local);
    }
    return used;
  };

  const applyDashboardStats = (stats, dashboard) => {
    const raw = asObject(dashboard) || {};
    const totals = asObject(raw.totals) || {};
    const insights = asObject(raw.insights) || {};
    const sessions = asObject(insights.sessions) || {};
    const discovery = asObject(insights.discovery) || {};
    let used = false;
    if (totals.playedSeconds != null) { stats.totalPlayedSeconds = clampInt(totals.playedSeconds); used = true; }
    if (totals.uniqueTracks != null) { stats.completedUniqueTracks = clampInt(totals.uniqueTracks); used = true; }
    if (totals.completedCount != null) { stats.qualifiedCompletedPlayCount = clampInt(totals.completedCount); used = true; }
    if (sessions.sessionCount != null) { stats.listeningSessionCount = clampInt(sessions.sessionCount); used = true; }
    if (sessions.longestPlayedSeconds != null) { stats.longestListeningSessionSeconds = clampInt(sessions.longestPlayedSeconds); used = true; }
    if (discovery.rediscoveredTrackCount != null) { stats.rediscoveredTrackCount = clampInt(discovery.rediscoveredTrackCount); used = true; }
    return used;
  };

  const localStatsPayload = async () => {
    refreshRuntime();
    if (runtime.libraryService && typeof runtime.libraryService.getSteamLeaderboardHistoryStats === 'function') {
      try {
        const stats = normalizeStats(runtime.libraryService.getSteamLeaderboardHistoryStats());
        return { ok: true, source: 'LibraryService.getSteamLeaderboardHistoryStats', stats };
      } catch (error) {
        log('WARN', `getSteamLeaderboardHistoryStats failed: ${errorText(error)}`);
      }
    }
    const fromRenderer = await rendererEval(`(async () => {
      const lib = window.echo && window.echo.library;
      if (!lib || typeof lib.getSteamLeaderboardHistoryStats !== 'function') return null;
      return lib.getSteamLeaderboardHistoryStats();
    })()`);
    if (asObject(fromRenderer)) {
      return { ok: true, source: 'window.echo.library.getSteamLeaderboardHistoryStats', stats: normalizeStats(fromRenderer) };
    }

    let statsStatus = null;
    if (runtime.listeningStatsService && typeof runtime.listeningStatsService.preview === 'function' && runtime.libraryService) {
      try {
        statsStatus = runtime.listeningStatsService.preview(runtime.libraryService.getSteamLeaderboardHistoryStats(), true);
      } catch { statsStatus = null; }
    }
    if (!asObject(statsStatus)) {
      const ipc = await invokeIpc(IPC.statsStatus);
      if (ipc.found) statsStatus = ipc.result;
    }
    if (asObject(statsStatus)) {
      const stats = emptyStats();
      if (applyListeningLocalValues(stats, statsStatus)) {
        return { ok: true, source: 'steam:listening-stats:get-status', stats, statsStatus };
      }
    }

    const dashboardIpc = await invokeIpc(IPC.libraryDashboard, { mediaType: 'local' });
    let dashboard = dashboardIpc.found ? dashboardIpc.result : null;
    if (!asObject(dashboard)) dashboard = await echoLibraryDashboard();
    if (asObject(dashboard)) {
      const stats = emptyStats();
      if (applyDashboardStats(stats, dashboard)) {
        return { ok: true, source: 'library:get-playback-stats-dashboard', stats };
      }
    }

    return {
      ok: true,
      source: 'unavailable',
      stats: emptyStats(),
      note: 'LibraryService.getSteamLeaderboardHistoryStats was not resolvable; fields are editable zeros.',
    };
  };

  const inspect = async () => {
    refreshRuntime();
    const guard = await processGuard();
    const addonPath = leaderboardAddonPath();
    const dllPath = steamApiDllPath();
    const appIdFile = steamAppIdFile();
    let nativeModules = [];
    let nativeModulesError = null;
    try {
      nativeModules = listNativeModules();
    } catch (error) {
      nativeModulesError = errorText(error);
    }
    const relatedModules = filterNativeModules(nativeModules);
    let steamStatus = typeof runtime.steamStatusGetter === 'function'
      ? (() => { try { return runtime.steamStatusGetter(); } catch (error) { return { error: errorText(error) }; } })()
      : null;
    if (!asObject(steamStatus) || steamStatus.error) {
      const ipc = await invokeIpc(IPC.steamStatus);
      if (ipc.found && asObject(ipc.result)) steamStatus = ipc.result;
    }
    if (!asObject(steamStatus) || steamStatus.error) {
      const fromRenderer = await echoSteamStatus();
      if (asObject(fromRenderer)) steamStatus = fromRenderer;
    }
    let exePath = null;
    try { exePath = app?.getPath?.('exe') || null; } catch { exePath = null; }
    return {
      ok: true,
      officialTest: true,
      currentProcess: true,
      processFound: true,
      pid: process.pid,
      ppid: process.ppid,
      execPath: process.execPath,
      argv0: process.argv0 || null,
      exePath,
      appPath: (() => { try { return app?.getAppPath?.() || null; } catch { return null; } })(),
      appUserModelId: guard.appUserModelId || null,
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath || null,
      platform: process.platform,
      env: {
        SteamAppId: process.env.SteamAppId || null,
        SteamGameId: process.env.SteamGameId || null,
        ECHO_STEAM_APP_ID: process.env.ECHO_STEAM_APP_ID || null,
        ECHO_MODDED_HOST: process.env.ECHO_MODDED_HOST || null,
        ECHO_GAME_ROOT: process.env.ECHO_GAME_ROOT || null,
      },
      files: {
        leaderboardAddon: { path: addonPath, exists: Boolean(addonPath) },
        steamApiDll: { path: dllPath, exists: Boolean(dllPath) },
        steamAppIdTxt: { path: appIdFile, exists: Boolean(appIdFile) },
      },
      requireCacheHits: runtime.cacheHits,
      nativeModules: relatedModules,
      nativeModuleCount: Array.isArray(nativeModules) ? nativeModules.length : 0,
      nativeModulesError,
      steamRuntimePresent: Boolean(runtime.localplayer || runtime.steamClient || steamStatus?.state === 'ready'),
      steamStatus,
      resolved: {
        leaderboardService: Boolean(runtime.leaderboardService),
        listeningStatsService: Boolean(runtime.listeningStatsService),
        libraryService: Boolean(runtime.libraryService),
        leaderboardBinding: Boolean(runtime.leaderboardBinding && typeof runtime.leaderboardBinding.findLeaderboard === 'function'),
        localplayer: Boolean(runtime.localplayer),
        steamClient: Boolean(runtime.steamClient),
      },
      guard,
      processOk: guard.processOk,
      steamOk: guard.steamOk,
      appIdKnown: guard.appIdKnown,
      appIdMismatch: guard.appIdMismatch,
      writeAllowed: guard.writeAllowed,
      verdict: guard.verdict,
      refused: !guard.processOk,
      appIdWarning: guard.appIdWarning,
    };
  };

  const status = async () => {
    refreshRuntime();
    const guard = await processGuard();
    const settings = await readSettings();
    let steamStatus = null;
    if (typeof runtime.steamStatusGetter === 'function') {
      try { steamStatus = runtime.steamStatusGetter(); } catch (error) { steamStatus = { error: errorText(error) }; }
    }
    if (!asObject(steamStatus)) {
      const ipc = await invokeIpc(IPC.steamStatus);
      if (ipc.found) steamStatus = ipc.result;
    }
    if (!asObject(steamStatus)) steamStatus = await echoSteamStatus();
    let leaderboardStatus = null;
    if (runtime.leaderboardService && typeof runtime.leaderboardService.getStatus === 'function') {
      try { leaderboardStatus = runtime.leaderboardService.getStatus(settings.steamLeaderboardsEnabled === true); } catch { leaderboardStatus = null; }
    }
    if (!asObject(leaderboardStatus)) {
      const ipc = await invokeIpc(IPC.leaderboardStatus);
      if (ipc.found) leaderboardStatus = ipc.result;
    }
    if (!asObject(leaderboardStatus)) leaderboardStatus = await echoLeaderboardStatus();
    let statsStatus = null;
    if (runtime.listeningStatsService && typeof runtime.listeningStatsService.getStatus === 'function') {
      try { statsStatus = runtime.listeningStatsService.getStatus(settings.steamListeningStatsEnabled !== false); } catch { statsStatus = null; }
    }
    if (!asObject(statsStatus)) {
      const ipc = await invokeIpc(IPC.statsStatus);
      if (ipc.found) statsStatus = ipc.result;
    }
    const steamId = readSteamId(runtime.localplayer) || readSteamId(safeGet(runtime.steamClient, 'localplayer'));
    const personaName = readPersonaName(runtime.localplayer)
      || readPersonaName(safeGet(runtime.steamClient, 'localplayer'))
      || asObject(steamStatus)?.playerName
      || null;
    return {
      ok: true,
      steamRuntimePresent: Boolean(runtime.localplayer || runtime.steamClient || asObject(steamStatus)?.state === 'ready'),
      leaderboardsEnabled: settings.steamLeaderboardsEnabled === true || asObject(leaderboardStatus)?.enabled === true,
      statsEnabled: settings.steamListeningStatsEnabled !== false,
      steamId,
      personaName,
      appId: guard.appId,
      appIdWarning: guard.appIdWarning,
      processOk: guard.processOk,
      steamOk: guard.steamOk,
      appIdKnown: guard.appIdKnown,
      appIdMismatch: guard.appIdMismatch,
      writeAllowed: guard.writeAllowed,
      steamStatus,
      leaderboardStatus,
      statsStatus,
      guard,
    };
  };

  const enable = async (payload) => {
    const guard = await processGuard();
    if (!guard.processOk) {
      return {
        ok: false,
        error: 'not_echo_process',
        message: 'Current process is not ECHO. This test inspects the in-process Echo runtime only; it does not search for another PID.',
        guard,
      };
    }
    refreshRuntime();
    const patch = {};
    if (typeof payload.leaderboards === 'boolean') patch.steamLeaderboardsEnabled = payload.leaderboards;
    if (typeof payload.stats === 'boolean') patch.steamListeningStatsEnabled = payload.stats;
    if (!Object.keys(patch).length) return { ok: false, error: 'empty_enable_payload' };

    const logLines = [];
    const results = {};

    if (typeof patch.steamLeaderboardsEnabled === 'boolean') {
      const ipc = await invokeIpc(IPC.leaderboardSetEnabled, patch.steamLeaderboardsEnabled);
      if (ipc.found) {
        results.leaderboards = ipc.result;
        logLines.push(`steam:leaderboard:set-enabled ${patch.steamLeaderboardsEnabled}`);
        log('INFO', `enable leaderboards via IPC steam:leaderboard:set-enabled = ${patch.steamLeaderboardsEnabled}`);
      }
    }
    if (typeof patch.steamListeningStatsEnabled === 'boolean') {
      const ipc = await invokeIpc(IPC.statsSetEnabled, patch.steamListeningStatsEnabled);
      if (ipc.found) {
        results.stats = ipc.result;
        logLines.push(`steam:listening-stats:set-enabled ${patch.steamListeningStatsEnabled}`);
        log('INFO', `enable listening stats via IPC steam:listening-stats:set-enabled = ${patch.steamListeningStatsEnabled}`);
      }
    }

    if (Object.keys(results).length < Object.keys(patch).length) {
      const ipc = await invokeIpc(IPC.appSetSettings, patch);
      if (ipc.found) {
        results.appSetSettings = ipc.result;
        logLines.push('app:set-settings');
        log('INFO', `enable via IPC app:set-settings ${JSON.stringify(patch)}`);
      }
    }

    if (Object.keys(results).length < Object.keys(patch).length) {
      const viaRenderer = await echoAppSetSettings(patch);
      results.renderer = viaRenderer;
      if (viaRenderer && viaRenderer.ok) {
        logLines.push('window.echo.app.setSettings');
        log('INFO', `enable via renderer echo.app.setSettings ${JSON.stringify(patch)}`);
      } else {
        log('WARN', `renderer echo.app.setSettings unavailable or failed: ${JSON.stringify(viaRenderer)}`);
      }
    }

    if (!logLines.length) {
      return {
        ok: false,
        error: 'enable_path_unavailable',
        message: 'Could not reach steam:leaderboard:set-enabled / app:set-settings. Enable Steam leaderboards in ECHO settings.',
        patch,
      };
    }
    return { ok: true, patch, path: logLines, results, status: await status() };
  };

  const uploadBoards = async (stats, boards = BOARDS) => {
    const binding = leaderboardBinding();
    if (!binding || typeof binding.findLeaderboard !== 'function' || typeof binding.uploadScore !== 'function') {
      throw new Error('echo-steam-leaderboards binding unavailable. Enable Steam leaderboards first so ECHO loads the official addon (this mod does not initialize it).');
    }
    const details = aggregateDetails(stats);
    const uploaded = [];
    for (const board of boards) {
      const handle = await retryTransient(() => binding.findLeaderboard(board.apiName));
      const score = clampInt(stats[board.scoreField]);
      const result = await retryTransient(() => binding.uploadScore(handle, score, details));
      uploaded.push({
        boardId: board.id,
        apiName: board.apiName,
        score,
        details,
        globalRank: result?.globalRank > 0 ? result.globalRank : null,
        result,
      });
    }
    return uploaded;
  };

  const sync = async (payload) => {
    const refused = await refuseWrites();
    if (refused) return refused;
    refreshRuntime();
    const override = asObject(payload.stats);
    const local = override ? normalizeStats(override) : (await localStatsPayload()).stats;
    const current = await status();
    if (!current.leaderboardsEnabled) {
      if (payload.force === true) {
        log('INFO', 'sync: steamLeaderboardsEnabled is false; enabling first because force=true');
        const enabled = await enable({ leaderboards: true });
        if (enabled.ok !== true) {
          return {
            ok: false,
            error: 'leaderboards_enable_failed',
            message: 'Steam leaderboards are disabled. Enable them in ECHO settings or retry with force=true.',
            enable: enabled,
          };
        }
      } else {
        return {
          ok: false,
          error: 'steam_leaderboards_disabled',
          message: 'steamLeaderboardsEnabled is false. Enable leaderboards in this panel (or ECHO settings) before syncing.',
        };
      }
    }
    refreshRuntime();

    const alsoStats = readLiveConfig().alsoSyncUserStats === true || payload.alsoSyncUserStats === true;
    const runStats = async () => (alsoStats ? syncStats({ stats: local }) : null);

    if (runtime.leaderboardService && typeof runtime.leaderboardService.sync === 'function') {
      log('INFO', 'sync via SteamLeaderboardService.sync(stats, true)');
      const result = await runtime.leaderboardService.sync(local, true);
      return { ok: true, path: 'SteamLeaderboardService.sync', stats: local, result, statsResult: await runStats() };
    }

    if (!override || !leaderboardBinding()) {
      const ipc = await invokeIpc(IPC.leaderboardSync);
      if (ipc.found) {
        log('INFO', 'sync via IPC steam:leaderboard:sync (ECHO loads the official binding; library history stats)');
        refreshRuntime();
        if (!override) {
          return { ok: true, path: 'steam:leaderboard:sync', result: ipc.result, statsResult: await runStats() };
        }
      }
    }

    log('INFO', 'sync fallback: findLeaderboard + uploadScore for each official board');
    const uploaded = await uploadBoards(local);
    return { ok: true, path: 'findLeaderboard+uploadScore', stats: local, uploaded, statsResult: await runStats() };
  };

  const upload = async (payload) => {
    const refused = await refuseWrites();
    if (refused) return refused;
    const config = readLiveConfig();
    if (config.allowCustomScores === false) {
      return { ok: false, error: 'custom_scores_disabled', message: 'allowCustomScores is false.' };
    }
    const board = resolveBoard(payload.boardId || payload.apiName);
    if (!board) {
      return {
        ok: false,
        error: 'unknown_board',
        message: 'Board is not in the official allowlist (listening-time / completed-tracks / listening-streak / deep-session / rediscovered-tracks).',
      };
    }
    refreshRuntime();
    const local = (await localStatsPayload()).stats;
    const score = payload.score == null || payload.score === ''
      ? clampInt(local[board.scoreField])
      : clampInt(payload.score);
    let details;
    if (Array.isArray(payload.details) && payload.details.length) {
      const padded = payload.details.slice(0, 7);
      while (padded.length < 7) padded.push(local[DETAIL_FIELDS[padded.length]] || 0);
      details = padded.map(clampInt);
    } else if (asObject(payload.details)) {
      const merged = { ...local, ...payload.details };
      details = aggregateDetails(merged);
    } else {
      details = aggregateDetails(local);
    }
    const planned = {
      boardId: board.id,
      apiName: board.apiName,
      score,
      details,
      scoreField: board.scoreField,
    };
    if (payload.dryRun === true) {
      log('INFO', `upload dryRun ${board.apiName} score=${score}`);
      return { ok: true, dryRun: true, payload: planned };
    }
    const binding = leaderboardBinding();
    if (!binding || typeof binding.findLeaderboard !== 'function' || typeof binding.uploadScore !== 'function') {
      return { ok: false, error: 'binding_unavailable', message: 'echo-steam-leaderboards.node is not loaded. Enable Steam leaderboards first so ECHO initializes the official binding (this mod does not re-init).' };
    }
    log('INFO', `upload ${board.apiName} score=${score} details=${details.join(',')}`);
    const handle = await retryTransient(() => binding.findLeaderboard(board.apiName));
    const result = await retryTransient(() => binding.uploadScore(handle, score, details));
    return {
      ok: true,
      dryRun: false,
      payload: planned,
      globalRank: result?.globalRank > 0 ? result.globalRank : null,
      result,
    };
  };

  const entries = async (payload) => {
    const board = resolveBoard(payload.boardId || payload.apiName);
    const scope = resolveScope(payload.scope || 'global');
    if (!board || !scope) {
      return { ok: false, error: 'invalid_board_or_scope', message: 'Use an official boardId and scope global | around-user | friends.' };
    }
    refreshRuntime();
    const current = await status();
    const enabled = current.leaderboardsEnabled === true;

    if (runtime.leaderboardService && typeof runtime.leaderboardService.getSnapshot === 'function') {
      log('INFO', `entries via SteamLeaderboardService.getSnapshot(${board.id}, ${scope})`);
      const snapshot = await runtime.leaderboardService.getSnapshot(board.id, scope, enabled);
      return { ok: true, path: 'getSnapshot', enabled, ...snapshot };
    }

    const ipc = await invokeIpc(IPC.leaderboardEntries, board.id, scope);
    if (ipc.found) {
      log('INFO', `entries via IPC steam:leaderboard:get-entries ${board.id} ${scope}`);
      return {
        ok: true,
        path: 'steam:leaderboard:get-entries',
        enabled,
        result: ipc.result,
        ...(asObject(ipc.result) || {}),
        note: enabled ? null : 'steamLeaderboardsEnabled is false; enable leaderboards first to download entries.',
      };
    }

    const binding = leaderboardBinding();
    if (!binding || typeof binding.findLeaderboard !== 'function' || typeof binding.downloadEntries !== 'function') {
      if (!enabled) {
        return {
          ok: false,
          error: 'steam_leaderboards_disabled',
          message: 'Enable Steam leaderboards first so ECHO loads echo-steam-leaderboards (this mod does not re-init).',
        };
      }
      return { ok: false, error: 'binding_unavailable', message: 'Cannot download entries: enable Steam leaderboards first so ECHO loads echo-steam-leaderboards (this mod does not re-init).' };
    }
    const range = SCOPE_REQUEST[scope];
    const handle = await retryTransient(() => binding.findLeaderboard(board.apiName));
    const raw = await retryTransient(() => binding.downloadEntries(handle, range.request, range.start, range.end));
    const currentSteamId = readSteamId(runtime.localplayer);
    const currentPlayerName = readPersonaName(runtime.localplayer);
    const list = (Array.isArray(raw) ? raw : []).map((entry) => {
      const steamId = entry?.steamId != null ? String(entry.steamId) : null;
      const isCurrentUser = Boolean(currentSteamId && steamId && steamId === currentSteamId);
      return {
        playerName: entry?.playerName || (isCurrentUser ? currentPlayerName : null),
        rank: entry?.rank,
        score: entry?.score,
        steamId,
        isCurrentUser,
        details: decodeDetails(entry?.details ?? []),
      };
    });
    log('INFO', `entries via downloadEntries ${board.apiName} ${scope} count=${list.length}`);
    return { ok: true, path: 'downloadEntries', boardId: board.id, scope, entries: list };
  };

  const syncStats = async (payload) => {
    const refused = await refuseWrites();
    if (refused) return refused;
    refreshRuntime();
    const stats = asObject(payload.stats) ? normalizeStats(payload.stats) : (await localStatsPayload()).stats;
    const optionalEnabled = (await status()).statsEnabled === true;

    if (runtime.listeningStatsService && typeof runtime.listeningStatsService.sync === 'function') {
      log('INFO', `syncStats via SteamListeningStatsService.sync(stats, ${optionalEnabled})`);
      const result = await runtime.listeningStatsService.sync(stats, optionalEnabled);
      return { ok: true, path: 'SteamListeningStatsService.sync', stats, result };
    }

    const ipc = await invokeIpc(IPC.statsSync);
    if (ipc.found && !asObject(payload.stats)) {
      log('INFO', 'syncStats via IPC steam:listening-stats:sync');
      return { ok: true, path: 'steam:listening-stats:sync', result: ipc.result };
    }

    const client = runtime.steamClient;
    if (!client?.stats || typeof client.stats.getInt !== 'function' || typeof client.stats.setInt !== 'function' || typeof client.stats.store !== 'function') {
      return { ok: false, error: 'stats_client_unavailable', message: 'SteamListeningStatsService and steamworks stats client are unavailable.' };
    }
    const submitted = [];
    let changed = 0;
    const definitions = USER_STATS.filter((definition) => definition.syncPolicy === 'achievement' || optionalEnabled);
    for (const definition of definitions) {
      const localValue = clampInt(definition.fromStats(stats));
      let remoteValue = 0;
      try {
        const remote = client.stats.getInt(definition.apiName);
        if (remote == null) {
          return { ok: false, error: 'stats_not_published', message: `Steam user stat ${definition.apiName} is not published.`, apiName: definition.apiName };
        }
        remoteValue = clampInt(remote);
      } catch (error) {
        return { ok: false, error: 'stats_not_published', message: errorText(error), apiName: definition.apiName };
      }
      const nextValue = Math.max(remoteValue, localValue);
      if (nextValue > remoteValue) {
        if (!client.stats.setInt(definition.apiName, nextValue)) {
          return { ok: false, error: 'write_failed', apiName: definition.apiName };
        }
        changed += 1;
      }
      submitted.push({ apiName: definition.apiName, remoteValue, localValue, nextValue });
    }
    if (changed > 0 && !client.stats.store()) {
      return { ok: false, error: 'store_failed', submitted };
    }
    log('INFO', `syncStats via client.stats.setInt + store changed=${changed}`);
    return { ok: true, path: 'client.stats.setInt', changed, submitted };
  };

  const wrap = (name, fn) => async (payload) => {
    try {
      const result = await fn(asObject(payload) || {});
      return result;
    } catch (error) {
      const message = errorText(error);
      log('ERROR', `${name} failed: ${message}`);
      return { ok: false, error: message };
    }
  };

  if (typeof host.handle === 'function') {
    handles.push(host.handle('inspect', wrap('inspect', inspect)));
    handles.push(host.handle('status', wrap('status', status)));
    handles.push(host.handle('localStats', wrap('localStats', localStatsPayload)));
    handles.push(host.handle('enable', wrap('enable', enable)));
    handles.push(host.handle('sync', wrap('sync', sync)));
    handles.push(host.handle('upload', wrap('upload', upload)));
    handles.push(host.handle('entries', wrap('entries', entries)));
    handles.push(host.handle('syncStats', wrap('syncStats', syncStats)));
  } else {
    log('WARN', 'host.handle unavailable; Steam listen-board methods were not registered');
  }

  refreshRuntime();
  log('INFO', 'official Steam listen-board test mod active (in-process only, App ID 5105150, no steamworks.init, no FindOrCreateLeaderboard)');

  return () => {
    while (handles.length) {
      try { handles.pop()?.(); } catch { /* ignore */ }
    }
    log('INFO', 'official Steam listen-board test mod disposed');
  };
};

module.exports = activate;
module.exports.activate = activate;
