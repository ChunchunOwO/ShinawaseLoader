'use strict';

const { join } = require('node:path');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');

const PET_WINDOW_TITLE = 'ECHO Pet';
const PET_PAGE = 'pet.html';
const PANEL_PAGE = 'panel.html';

// Steam caps rich presence values at 256 UTF-8 bytes; 120 chars keeps CJK
// lines comfortably inside that budget.
const STEAM_VALUE_MAX_CHARS = 120;
const STEAM_ACQUIRE_RETRY_MS = 15000;
const MAX_STEAM_WRITE_FAILURES = 5;

// Renderer <-> main bridge marker: the pet page (pet.js + game/status.js)
// and the panel pages log console messages tagged with this prefix;
// main.cjs picks them up from each window's console-message event and
// routes them (panel open/close/actions and Steam status pushes).
const BRIDGE_TAG = '[echo-classic-pet:bridge]';

// Panel windows (shop / work / stats). Each opens as its own frameless
// glass BrowserWindow next to the pet; the pet window itself never resizes.
const PANEL_DEFS = {
  shop: { width: 300, height: 404 },
  work: { width: 292, height: 356 },
  stats: { width: 288, height: 396 },
};
const PANEL_GAP_PX = 12;      // horizontal gap between pet square and a panel
const PANEL_CASCADE_PX = 28;  // stagger when several panels are open

/**
 * Replaces the native ECHO desktop pet with the classic pixel pet and adds
 * the VPet-style gameplay layer.
 *
 * Responsibilities:
 *  1. Redirect the native "ECHO Pet" BrowserWindow (auxiliary.html?pet=1) to
 *     the mod's pet.html (loadFile/loadURL wrap + browser-window-created
 *     watcher). The pet=1 query keeps native pet IPC routing working even
 *     after the renderer mirrors the status line into document.title.
 *  2. Inject game data (foods/works/phrases + mod config) into the pet and
 *     panel windows as window.__echoClassicPetData after each load, so the
 *     vanilla JS renderers never depend on file:// fetch permissions.
 *  3. Panel windows: shop / work / stats each open in a separate frameless
 *     BrowserWindow (panel.html?panel=<name>) positioned near the pet. The
 *     pet window keeps its original small square — it is never resized or
 *     expanded. The console-message bridge routes:
 *       pet   -> main:  openPanel / closePanel / closeAllPanels / panelState
 *       panel -> main:  closePanel (self) / panelAction (buy, start work, …)
 *       main  -> pet:   open-panel list + relayed panel actions
 *       main  -> panel: game data + engine state snapshots + tab focus
 *     The engine stays authoritative in the pet window; panels are pure
 *     view + action-dispatch layers.
 *  4. Steam Rich Presence augmentation (event-driven): game/status.js pushes
 *     the composed pet status over the console bridge whenever it changes.
 *     The mod hooks into ECHO's *native* Steam presence pipeline — preferring
 *     ECHO's internal SteamPresenceService, falling back to the steamworks.js
 *     client ECHO already initialised (never re-initialising it) — and
 *     augments ECHO's own snapshot (keeping its steam_display tokens) with
 *     the pet gameplay line. No polling, no competing steam_display writes.
 */
const activate = (host) => {
  const app = host && host.app;
  const BrowserWindow = host && host.BrowserWindow;
  const log = (level, message) => {
    try { host.log(level, message); } catch { /* logging is best-effort */ }
  };

  if (!app || !BrowserWindow) {
    log('WARN', 'electron app/BrowserWindow unavailable; classic pet inactive');
    return () => {};
  }

  const modDirectory = host.directory || __dirname;
  const petPagePath = join(modDirectory, PET_PAGE);
  const petPageUrl = pathToFileURL(petPagePath).href;
  const panelPagePath = join(modDirectory, PANEL_PAGE);
  const config = host.config && typeof host.config === 'object' ? host.config : {};

  // --- game data ----------------------------------------------------------

  const readJson = (relativePath, fallback) => {
    try {
      return JSON.parse(readFileSync(join(modDirectory, relativePath), 'utf8'));
    } catch (error) {
      log('WARN', `failed to read ${relativePath}: ${error instanceof Error ? error.message : error}`);
      return fallback;
    }
  };

  const STEAM_STATUS_MODES = ['native-augment', 'pet-only', 'off'];

  const gameData = {
    foods: readJson('data/foods.json', []),
    works: readJson('data/works.json', []),
    phrases: readJson('data/phrases.json', {}),
    config: {
      petName: typeof config.petName === 'string' ? config.petName : 'ECHO',
      autoBuy: config.autoBuy !== false,
      enableSteamStatus: config.enableSteamStatus !== false,
      steamStatusMode: STEAM_STATUS_MODES.includes(config.steamStatusMode)
        ? config.steamStatusMode
        : 'native-augment',
      steamCustomTemplate: typeof config.steamCustomTemplate === 'string'
        ? config.steamCustomTemplate
        : '',
      steamShowTrackInPetLine: config.steamShowTrackInPetLine !== false,
      persistentDock: config.persistentDock === true,
      enableRoaming: config.enableRoaming !== false,
      // Pet UI part visibility (renderer applies body classes; see pet.js).
      showActionDock: config.showActionDock !== false,
      showTransportControls: config.showTransportControls !== false,
      showWindowControls: config.showWindowControls !== false,
      showStatusBar: config.showStatusBar !== false,
      showSpeechBubble: config.showSpeechBubble !== false,
      showWorkTimer: config.showWorkTimer !== false,
      showContextMenu: config.showContextMenu !== false,
    },
  };

  // JSON is not a strict subset of JS: escape U+2028/U+2029 for inline eval.
  const inlineJson = (value) => JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const gameDataScript = `(() => {
    window.__echoClassicPetData = ${inlineJson(gameData)};
    window.dispatchEvent(new Event('echo-classic-pet-data'));
  })();`;

  const petQuery = () => {
    // pet=1 keeps native pet-window detection working; interactMs feeds the
    // renderer its configured interact animation duration.
    const query = { pet: '1' };
    const interactMs = Number(config.interactDurationMs);
    if (Number.isFinite(interactMs) && interactMs >= 500 && interactMs <= 20000) {
      query.interactMs = String(Math.round(interactMs));
    }
    return query;
  };

  const petUrlWithQuery = () => {
    const url = new URL(petPageUrl);
    for (const [key, value] of Object.entries(petQuery())) {
      url.searchParams.set(key, value);
    }
    return url.href;
  };

  const isModPetTarget = (value) => {
    const text = String(value || '');
    if (!text) return false;
    if (text.startsWith('file:')) {
      try { return fileURLToPath(text.split('#')[0].split('?')[0]) === petPagePath; } catch { return false; }
    }
    return text.split('#')[0].split('?')[0] === petPagePath;
  };

  const hasPetQuery = (value) => {
    try {
      return new URL(String(value || ''), 'file:///').searchParams.get('pet') === '1';
    } catch {
      return /[?&]pet=1(?:&|$|#)/.test(String(value || ''));
    }
  };

  const isPetWindow = (window) => {
    try {
      if (!window || window.isDestroyed()) return false;
      if (window.__echoClassicPetPanelName) return false; // our own panels never count
      if (typeof window.getTitle === 'function' && window.getTitle() === PET_WINDOW_TITLE) return true;
      const href = window.webContents && !window.webContents.isDestroyed()
        ? window.webContents.getURL()
        : '';
      return hasPetQuery(href);
    } catch {
      return false;
    }
  };

  const isModPetWindow = (window) => {
    try {
      if (!window || window.isDestroyed()) return false;
      if (window.__echoClassicPetPanelName) return false;
      const contents = window.webContents;
      if (!contents || contents.isDestroyed()) return false;
      return isModPetTarget(contents.getURL());
    } catch {
      return false;
    }
  };

  const isModPanelWindow = (window) => {
    try {
      return Boolean(window && !window.isDestroyed() && window.__echoClassicPetPanelName);
    } catch {
      return false;
    }
  };

  const findModPetWindow = () =>
    BrowserWindow.getAllWindows().find((window) => isModPetWindow(window)) || null;

  const runInWindow = (window, script) => {
    try {
      if (!window || window.isDestroyed() || !window.webContents || window.webContents.isDestroyed()) return;
      window.webContents.executeJavaScript(script, true).catch(() => undefined);
    } catch { /* injection is best-effort */ }
  };

  // Push a payload into a renderer as `window.<globalName>` + a DOM event.
  const dispatchToWindow = (window, globalName, payload, eventName) => {
    runInWindow(window, `(() => {
      window.${globalName} = ${inlineJson(payload)};
      window.dispatchEvent(new Event('${eventName}'));
    })();`);
  };

  const injectGameData = (window) => {
    try {
      if (!isModPetWindow(window) && !isModPanelWindow(window)) return;
      window.webContents.executeJavaScript(gameDataScript, true).catch((error) => {
        log('WARN', `game data inject failed: ${error instanceof Error ? error.message : error}`);
      });
    } catch (error) {
      log('WARN', `game data inject failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  // --- panel windows (shop / work / stats) ---------------------------------

  let electronScreen;
  const resolveScreen = () => {
    if (electronScreen !== undefined) return electronScreen;
    try {
      electronScreen = (host && host.screen) || require('electron').screen || null;
    } catch {
      electronScreen = null;
    }
    return electronScreen;
  };

  const panelWindows = new Map(); // name -> BrowserWindow
  let lastPanelStateJson = null;  // cached engine snapshot for late-opening panels

  // Tell the pet renderer which panels are open (drives dock button states,
  // roaming pause and fresh state pushes for newly opened panels).
  const pushPanelList = () => {
    const petWindow = findModPetWindow();
    if (!petWindow) return;
    dispatchToWindow(petWindow, '__echoClassicPetPanels', [...panelWindows.keys()], 'echo-classic-pet-panels');
  };

  const pushStateToPanel = (window) => {
    if (!lastPanelStateJson) return;
    runInWindow(window, `(() => {
      window.__echoClassicPetPanelState = ${lastPanelStateJson};
      window.dispatchEvent(new Event('echo-classic-pet-panel-state'));
    })();`);
  };

  const broadcastPanelState = (state) => {
    lastPanelStateJson = inlineJson(state);
    for (const window of panelWindows.values()) pushStateToPanel(window);
  };

  const pushFocusToPanel = (window, tab) => {
    if (!tab) return;
    dispatchToWindow(window, '__echoClassicPetPanelFocus', { tab }, 'echo-classic-pet-panel-focus');
  };

  const positionPanelWindow = (window, name, petWindow) => {
    const def = PANEL_DEFS[name];
    let pet = null;
    try {
      pet = petWindow && !petWindow.isDestroyed() ? petWindow.getBounds() : null;
    } catch {
      pet = null;
    }
    if (!pet || !def) return;
    const screenApi = resolveScreen();
    let area = null;
    try {
      area = screenApi && typeof screenApi.getDisplayMatching === 'function'
        ? screenApi.getDisplayMatching(pet).workArea
        : null;
    } catch {
      area = null;
    }
    // Prefer the pet's right side, cascade additional panels, fall back to
    // the left side and clamp inside the work area.
    const slot = Math.max(0, [...panelWindows.keys()].indexOf(name));
    const cascade = slot * PANEL_CASCADE_PX;
    let x = pet.x + pet.width + PANEL_GAP_PX + cascade;
    let y = pet.y + cascade;
    if (area) {
      if (x + def.width > area.x + area.width) {
        x = pet.x - PANEL_GAP_PX - def.width - cascade;
      }
      x = Math.min(Math.max(area.x, x), area.x + area.width - def.width);
      y = Math.min(Math.max(area.y, y), area.y + area.height - def.height);
    }
    try {
      window.setBounds({
        x: Math.round(x),
        y: Math.round(y),
        width: def.width,
        height: def.height,
      });
    } catch (error) {
      log('WARN', `panel position failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  const closePanelWindow = (name) => {
    const window = panelWindows.get(name);
    if (!window) return;
    panelWindows.delete(name); // before teardown, so the closed handler no-ops
    pushPanelList();
    // Never close() a panel: on Windows (Electron >= 39.6.1, electron#50040)
    // close() on a visible frameless window hard-crashes the whole app with a
    // silent flash-quit — the deferred close teardown races the non-client
    // hittest of the cursor still hovering the window (use-after-free in
    // WebContentsView::NonClientHitTest), and panels are closed exactly while
    // being clicked (titlebar ×, Esc, dock toggle). Hide first so the window
    // leaves hit-testing, then destroy() — the same teardown ECHO's native
    // pet window uses. destroy() still emits 'closed' for our bookkeeping.
    try {
      if (window.isDestroyed()) return;
      window.hide();
    } catch { /* window may already be tearing down */ }
    try {
      if (!window.isDestroyed()) window.destroy();
    } catch { /* window may already be tearing down */ }
  };

  const closeAllPanelWindows = () => {
    for (const name of [...panelWindows.keys()]) closePanelWindow(name);
  };

  const openPanelWindow = (petWindow, name, tab) => {
    const def = PANEL_DEFS[name];
    if (!def) return;
    const existing = panelWindows.get(name);
    if (existing && !existing.isDestroyed()) {
      try {
        existing.show();
        existing.focus();
      } catch { /* focus is best-effort */ }
      pushFocusToPanel(existing, tab);
      pushPanelList();
      return;
    }

    let window;
    try {
      window = new BrowserWindow({
        width: def.width,
        height: def.height,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false, // transparent+resizable glitches on Windows; sizes are fixed anyway
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        title: `ECHO Pet Panel (${name})`, // must never equal PET_WINDOW_TITLE
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
    } catch (error) {
      log('WARN', `panel window create failed (${name}): ${error instanceof Error ? error.message : error}`);
      return;
    }

    window.__echoClassicPetPanelName = name;
    if (tab) window.__echoClassicPetPendingTab = tab;
    panelWindows.set(name, window);
    window.on('closed', () => {
      if (panelWindows.get(name) === window) {
        panelWindows.delete(name);
        pushPanelList();
      }
    });
    window.once('ready-to-show', () => {
      try { window.show(); } catch { /* window may have been closed already */ }
    });
    positionPanelWindow(window, name, petWindow);
    originalLoadFile.call(window, panelPagePath, { query: { panel: name } }).catch((error) => {
      log('WARN', `panel load failed (${name}): ${error instanceof Error ? error.message : error}`);
    });
    pushPanelList();
    log('INFO', `panel window opened: ${name}`);
  };

  // Actions dispatched from a panel window (buy food, start work, …) are
  // relayed to the pet window, where the engine executes them.
  const forwardPanelAction = (action) => {
    const petWindow = findModPetWindow();
    if (!petWindow) return;
    dispatchToWindow(petWindow, '__echoClassicPetPanelAction', action, 'echo-classic-pet-panel-action');
  };

  const handleBridgeMessage = (window, text) => {
    if (typeof text !== 'string' || !text) return;
    const index = text.indexOf(BRIDGE_TAG);
    if (index === -1) return;
    let payload = null;
    try {
      payload = JSON.parse(text.slice(index + BRIDGE_TAG.length).trim());
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object') return;

    const panelName = window.__echoClassicPetPanelName;
    if (panelName) {
      // Messages from one of our panel windows.
      if (payload.type === 'closePanel') {
        closePanelWindow(panelName);
      } else if (payload.type === 'panelAction' && payload.action && typeof payload.action === 'object') {
        forwardPanelAction(payload.action);
      }
      return;
    }

    if (!isModPetWindow(window)) return;
    // Messages from the pet window.
    const name = typeof payload.name === 'string' ? payload.name : '';
    const tab = typeof payload.tab === 'string' ? payload.tab : null;
    if (payload.type === 'openPanel') openPanelWindow(window, name, tab);
    else if (payload.type === 'closePanel') closePanelWindow(name);
    else if (payload.type === 'closeAllPanels') closeAllPanelWindows();
    else if (payload.type === 'panelState' && payload.state && typeof payload.state === 'object') {
      broadcastPanelState(payload.state);
    }
    else if (payload.type === 'statusPush') handleStatusPush(window, payload.status);
  };

  // --- loadFile / loadURL interception -----------------------------------

  const originalLoadFile = BrowserWindow.prototype.loadFile;
  const originalLoadURL = BrowserWindow.prototype.loadURL;

  const shouldRedirectFileLoad = (window, file, options) => {
    if (isModPetTarget(file)) return false;
    if (window.__echoClassicPetPanelName) return false;
    if (options && options.query && String(options.query.pet || '') === '1') return true;
    return isPetWindow(window);
  };

  BrowserWindow.prototype.loadFile = function loadFile(file, options) {
    try {
      if (shouldRedirectFileLoad(this, file, options)) {
        log('INFO', `redirecting pet loadFile ${file} -> ${PET_PAGE}`);
        return originalLoadFile.call(this, petPagePath, { query: petQuery() });
      }
    } catch (error) {
      log('WARN', `pet loadFile intercept failed: ${error instanceof Error ? error.message : error}`);
    }
    return originalLoadFile.call(this, file, options);
  };

  BrowserWindow.prototype.loadURL = function loadURL(url, options) {
    try {
      if (!isModPetTarget(url) && (hasPetQuery(url) || isPetWindow(this))) {
        log('INFO', `redirecting pet loadURL ${url} -> ${PET_PAGE}`);
        return originalLoadURL.call(this, petUrlWithQuery(), options);
      }
    } catch (error) {
      log('WARN', `pet loadURL intercept failed: ${error instanceof Error ? error.message : error}`);
    }
    return originalLoadURL.call(this, url, options);
  };

  // --- window watching (covers loads that happened before activation) ----

  const remappedWindows = new Set();

  const remapIfNativePetPage = (window) => {
    try {
      if (!window || window.isDestroyed() || !isPetWindow(window)) return;
      const href = window.webContents.getURL();
      // about:blank means the initial load is still pending; the loadFile /
      // loadURL wrap above already covers that path.
      if (!href || href === 'about:blank' || isModPetTarget(href)) return;
      remappedWindows.add(window);
      log('INFO', `remapping live pet window from ${href}`);
      originalLoadURL.call(window, petUrlWithQuery()).catch(() => undefined);
    } catch (error) {
      log('WARN', `pet window remap failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  const watchWindow = (window) => {
    if (!window || window.isDestroyed() || window.__echoClassicPetWatched) return;
    window.__echoClassicPetWatched = true;
    const onLoad = () => {
      remapIfNativePetPage(window);
      if (isModPetWindow(window)) {
        // A (re)load resets the renderer's engine and panel bookkeeping, so
        // any panel windows would reference a dead page. Start clean.
        window.__echoClassicPetIsPet = true;
        closeAllPanelWindows();
        pushPanelList();
        injectGameData(window);
        return;
      }
      if (isModPanelWindow(window)) {
        // ready-to-show can be unreliable for transparent windows on some
        // platforms; make sure a loaded panel is actually visible.
        try {
          if (!window.isVisible()) window.show();
        } catch { /* window may be tearing down */ }
        injectGameData(window);
        pushStateToPanel(window);
        const tab = window.__echoClassicPetPendingTab;
        window.__echoClassicPetPendingTab = null;
        if (tab) pushFocusToPanel(window, tab);
      }
    };
    window.webContents.on('did-finish-load', onLoad);
    window.webContents.on('did-navigate', onLoad);
    // Panel bridge: pet.js / panel.js signal via tagged console messages.
    // Electron's console-message signature differs across versions
    // ((event, level, message, …) vs a single details object), so accept both.
    window.webContents.on('console-message', (eventOrDetails, _level, message) => {
      const text = typeof message === 'string'
        ? message
        : (eventOrDetails && typeof eventOrDetails === 'object' && typeof eventOrDetails.message === 'string'
          ? eventOrDetails.message
          : '');
      if (text) handleBridgeMessage(window, text);
    });
    // Panels are anchored to the pet; when it hides or goes away they must
    // not linger as orphans.
    window.on('hide', () => {
      if (window.__echoClassicPetIsPet) closeAllPanelWindows();
    });
    window.on('closed', () => {
      remappedWindows.delete(window);
      if (window.__echoClassicPetIsPet) closeAllPanelWindows();
      if (petStatusWindow === window) {
        // The pet is gone: stop augmenting and hand the presence back to
        // ECHO's native sync.
        petStatusWindow = null;
        dropPetSteamPresence();
      }
    });
    onLoad();
  };

  const onWindowCreated = (_event, window) => watchWindow(window);
  app.on('browser-window-created', onWindowCreated);

  let initialWindows = 0;
  for (const window of BrowserWindow.getAllWindows()) {
    watchWindow(window);
    initialWindows += 1;
  }

  // --- Steam rich presence augmentation (event-driven, native-first) ------
  //
  // ECHO's SteamRichPresenceStatusSync listens to AudioSession events and
  // publishes snapshots ({steam_display token, status, title, artist,
  // details}) through SteamPresenceService -> steamworks.js localplayer.
  // Instead of running a parallel presence writer, this mod augments that
  // native pipeline:
  //   - preferred: wrap ECHO's internal SteamPresenceService.update (when the
  //     module is resolvable through the app) so every native snapshot gains
  //     the pet gameplay line;
  //   - fallback: patch setRichPresence on the steamworks.js client ECHO
  //     already initialised (resolved from the shared CJS module cache,
  //     never calling steamworks.init() again) to observe ECHO's writes and
  //     augment them in place.
  // Pet status arrives event-driven over the console bridge ('statusPush'
  // from game/status.js) — there is no polling and no timer. steam_display
  // always keeps ECHO's own localisation tokens: the pet line rides in
  // %details% (upgrading #Status_*Track to #Status_*TrackDetails when ECHO
  // published no details of its own) and in the raw status field.

  const STEAM_PRESENCE_KEYS = new Set(['steam_display', 'status', 'title', 'artist', 'details']);
  const STEAM_NATIVE_FIELD = {
    steam_display: 'display',
    status: 'status',
    title: 'title',
    artist: 'artist',
    details: 'details',
  };
  // Per ECHO's Steam localisation, #Status_{Loading,Playing,Paused}Track
  // render "%title% · %artist%" and the *Details variants append
  // " · %details%" — the only display upgrade this mod ever performs.
  const STEAM_TRACK_DETAILS_UPGRADE = {
    '#Status_LoadingTrack': '#Status_LoadingTrackDetails',
    '#Status_PlayingTrack': '#Status_PlayingTrackDetails',
    '#Status_PausedTrack': '#Status_PausedTrackDetails',
  };
  const STEAM_INTERNAL_CANDIDATES = [
    './out/main/integrations/steam/SteamworksService.js',
    './out/main/integrations/steam/SteamCapabilityServices.js',
  ];

  const steamPresence = {
    // steamStatusMode 'off' disables the whole bridge: no hooks are installed
    // and status pushes from the renderer are ignored.
    enabled: gameData.config.enableSteamStatus && gameData.config.steamStatusMode !== 'off',
    mode: null,                    // 'service' | 'client'
    service: null,
    serviceUpdate: null,           // pristine SteamPresenceService.update
    serviceClear: null,            // pristine SteamPresenceService.clear
    localplayer: null,
    originalSetRichPresence: null, // pristine localplayer.setRichPresence
    lastAcquireAt: 0,
    unavailableLogged: false,
    echoCleared: false,            // ECHO turned presence off; don't fight it
    native: { display: null, status: null, title: null, artist: null, details: null },
    wire: {},                      // last value actually written per key (client mode)
    pet: null,                     // { text, petLine } from the renderer bridge
    lastPetSignature: null,
    appliedOnce: false,
    failures: 0,
  };

  let petStatusWindow = null;

  const clipSteamValue = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.length > STEAM_VALUE_MAX_CHARS
      ? `${trimmed.slice(0, STEAM_VALUE_MAX_CHARS - 1)}…`
      : trimmed;
  };

  const steamAugmentationActive = () =>
    steamPresence.enabled
    && steamPresence.pet !== null
    && !steamPresence.echoCleared
    && steamPresence.failures < MAX_STEAM_WRITE_FAILURES;

  const composeSteamDetails = (nativeDetails) => {
    const petLine = steamPresence.pet && steamPresence.pet.petLine;
    if (!petLine) return nativeDetails;
    return clipSteamValue(nativeDetails ? `${nativeDetails} · ${petLine}` : petLine);
  };

  const composeSteamDisplay = (nativeDisplay) => {
    if (!nativeDisplay) return nativeDisplay;
    const petLine = steamPresence.pet && steamPresence.pet.petLine;
    return (petLine && STEAM_TRACK_DETAILS_UPGRADE[nativeDisplay]) || nativeDisplay;
  };

  const currentNativeSnapshot = () => ({ ...steamPresence.native });

  const augmentSteamSnapshot = (base) => ({
    ...base,
    display: composeSteamDisplay(base.display),
    details: composeSteamDetails(base.details || null),
    status: (steamPresence.pet && steamPresence.pet.text) || base.status,
  });

  const recordSteamWriteFailure = (error) => {
    steamPresence.failures += 1;
    if (steamPresence.failures <= 3) {
      log('WARN', `steam presence write failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  // Low-level write through the pristine steamworks.js function (client
  // mode). Deduped per key so redundant applies never hit the Steam API.
  const writeSteamKey = (key, value) => {
    const original = steamPresence.originalSetRichPresence;
    if (!original || !steamPresence.localplayer) return;
    const next = typeof value === 'string' ? value : null;
    if (Object.prototype.hasOwnProperty.call(steamPresence.wire, key) && steamPresence.wire[key] === next) return;
    try {
      original.call(steamPresence.localplayer, key, next);
      steamPresence.wire[key] = next;
    } catch (error) {
      recordSteamWriteFailure(error);
    }
  };

  const installSteamClientHook = (localplayer) => {
    const original = localplayer.setRichPresence;
    steamPresence.localplayer = localplayer;
    steamPresence.originalSetRichPresence = original;
    localplayer.setRichPresence = function setRichPresence(key, value) {
      const name = String(key);
      // Non-snapshot keys (connect, steam_player_group, ...) pass through.
      if (!STEAM_PRESENCE_KEYS.has(name)) return original.call(localplayer, name, value);
      const nativeValue = typeof value === 'string' ? value : null;
      steamPresence.native[STEAM_NATIVE_FIELD[name]] = nativeValue;
      // ECHO's clear() nulls steam_display first: respect the off state and
      // stop augmenting until ECHO publishes a snapshot again.
      if (name === 'steam_display') steamPresence.echoCleared = nativeValue === null;
      let outgoing = nativeValue;
      if (steamAugmentationActive()) {
        if (name === 'details') outgoing = composeSteamDetails(nativeValue);
        else if (name === 'steam_display') outgoing = composeSteamDisplay(nativeValue);
        else if (name === 'status') outgoing = steamPresence.pet.text || nativeValue;
      }
      return writeSteamKey(name, outgoing);
    };
  };

  const installSteamServiceHook = (service) => {
    const originalUpdate = service.update;
    const originalClear = typeof service.clear === 'function' ? service.clear : null;
    steamPresence.service = service;
    steamPresence.serviceUpdate = originalUpdate;
    steamPresence.serviceClear = originalClear;
    service.update = function update(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return originalUpdate.call(service, snapshot);
      steamPresence.native = {
        display: typeof snapshot.display === 'string' ? snapshot.display : null,
        status: typeof snapshot.status === 'string' ? snapshot.status : null,
        title: typeof snapshot.title === 'string' ? snapshot.title : null,
        artist: typeof snapshot.artist === 'string' ? snapshot.artist : null,
        details: typeof snapshot.details === 'string' ? snapshot.details : null,
      };
      steamPresence.echoCleared = false;
      return originalUpdate.call(service, steamAugmentationActive() ? augmentSteamSnapshot(snapshot) : snapshot);
    };
    if (originalClear) {
      service.clear = function clear() {
        steamPresence.echoCleared = true;
        steamPresence.native = { display: null, status: null, title: null, artist: null, details: null };
        return originalClear.call(service);
      };
    }
  };

  const resolveEchoPresenceService = (appRequire) => {
    for (const candidate of STEAM_INTERNAL_CANDIDATES) {
      try {
        const moduleExports = appRequire(candidate);
        const getter = moduleExports && moduleExports.getSteamPresenceService;
        const service = typeof getter === 'function' ? getter() : null;
        if (service && typeof service.update === 'function') return service;
      } catch { /* bundled builds don't expose internal modules; expected */ }
    }
    return null;
  };

  const resolveEchoSteamLocalplayer = () => {
    // ECHO loads steamworks.js lazily during its own Steam initialisation,
    // which leaves the native binding in the shared CJS module cache.
    // Grabbing it from there reuses ECHO's already-initialised Steam API
    // without ever calling steamworks.init() again. When it is absent, ECHO
    // is not running as its Steam build — the mod must not load or
    // initialise Steam on its own in that case.
    try {
      const cache = require.cache || {};
      const nativeKey = Object.keys(cache).find((key) => /steamworksjs[^/\\]*\.node$/i.test(key));
      const binding = nativeKey && cache[nativeKey] ? cache[nativeKey].exports : null;
      if (binding && binding.localplayer && typeof binding.localplayer.setRichPresence === 'function') {
        return binding.localplayer;
      }
    } catch { /* cache scan is best-effort */ }
    return null;
  };

  const ensureSteamPresenceTarget = () => {
    if (!steamPresence.enabled) return false;
    if (steamPresence.mode) return true;
    const now = Date.now();
    if (now - steamPresence.lastAcquireAt < STEAM_ACQUIRE_RETRY_MS) return false;
    steamPresence.lastAcquireAt = now;

    let appRequire = null;
    try {
      appRequire = createRequire(join(app.getAppPath(), 'package.json'));
    } catch { /* fall through to the client path */ }

    const service = appRequire ? resolveEchoPresenceService(appRequire) : null;
    if (service) {
      installSteamServiceHook(service);
      steamPresence.mode = 'service';
      log('INFO', 'steam presence: hooked ECHO SteamPresenceService (native integration)');
      return true;
    }

    const localplayer = resolveEchoSteamLocalplayer();
    if (localplayer) {
      installSteamClientHook(localplayer);
      steamPresence.mode = 'client';
      log('INFO', 'steam presence: attached to ECHO steamworks client (no re-init)');
      return true;
    }

    if (!steamPresence.unavailableLogged) {
      steamPresence.unavailableLogged = true;
      log('INFO', 'steam presence: ECHO steam runtime not available yet; will retry on status changes');
    }
    return false;
  };

  const applyPetSteamPresence = () => {
    if (!steamAugmentationActive()) return;
    if (steamPresence.mode === 'service') {
      if (!steamPresence.native.display || !steamPresence.serviceUpdate) return;
      try {
        steamPresence.serviceUpdate.call(steamPresence.service, augmentSteamSnapshot(currentNativeSnapshot()));
      } catch (error) {
        recordSteamWriteFailure(error);
      }
      return;
    }
    if (steamPresence.mode !== 'client') return;
    // Until ECHO's own snapshot has been observed, only the raw status field
    // is safe to touch; steam_display is never invented and never nulled.
    if (steamPresence.native.display) {
      writeSteamKey('details', composeSteamDetails(steamPresence.native.details));
      writeSteamKey('steam_display', composeSteamDisplay(steamPresence.native.display));
    }
    if (steamPresence.pet.text) writeSteamKey('status', steamPresence.pet.text);
  };

  const restoreNativeSteamPresence = () => {
    if (!steamPresence.appliedOnce) return;   // never overrode anything
    if (steamPresence.echoCleared) return;    // ECHO already cleared the wire
    if (steamPresence.mode === 'service') {
      if (steamPresence.serviceUpdate && steamPresence.native.display) {
        try {
          steamPresence.serviceUpdate.call(steamPresence.service, currentNativeSnapshot());
        } catch { /* restore is best-effort */ }
      }
      return;
    }
    if (steamPresence.mode !== 'client') return;
    writeSteamKey('details', steamPresence.native.details);
    if (steamPresence.native.display) writeSteamKey('steam_display', steamPresence.native.display);
    writeSteamKey('status', steamPresence.native.status);
  };

  const dropPetSteamPresence = () => {
    if (steamPresence.pet === null) return;
    steamPresence.pet = null;
    steamPresence.lastPetSignature = null;
    try { restoreNativeSteamPresence(); } catch { /* best effort */ }
  };

  const handleStatusPush = (window, status) => {
    if (!steamPresence.enabled) return;
    if (!status || typeof status !== 'object') return;
    const text = clipSteamValue(status.text);
    if (!text) return;
    petStatusWindow = window;
    const petLine = clipSteamValue(status.petLine);
    steamPresence.pet = { text, petLine };
    const signature = `${text}\u0000${petLine || ''}`;
    const changed = signature !== steamPresence.lastPetSignature;
    steamPresence.lastPetSignature = signature;
    if (!ensureSteamPresenceTarget()) return;
    if (changed || !steamPresence.appliedOnce) {
      steamPresence.appliedOnce = true;
      applyPetSteamPresence();
    }
  };

  const disposeSteamPresence = () => {
    // Stale console-message listeners on surviving pet windows can still
    // deliver statusPush after dispose; disabling here keeps handleStatusPush
    // and ensureSteamPresenceTarget from re-installing the Steam hooks.
    steamPresence.enabled = false;
    dropPetSteamPresence();
    if (steamPresence.mode === 'client' && steamPresence.localplayer && steamPresence.originalSetRichPresence) {
      try { steamPresence.localplayer.setRichPresence = steamPresence.originalSetRichPresence; } catch { /* best effort */ }
    }
    if (steamPresence.mode === 'service' && steamPresence.service) {
      try { if (steamPresence.serviceUpdate) steamPresence.service.update = steamPresence.serviceUpdate; } catch { /* best effort */ }
      try { if (steamPresence.serviceClear) steamPresence.service.clear = steamPresence.serviceClear; } catch { /* best effort */ }
    }
    steamPresence.mode = null;
    steamPresence.service = null;
    steamPresence.serviceUpdate = null;
    steamPresence.serviceClear = null;
    steamPresence.localplayer = null;
    steamPresence.originalSetRichPresence = null;
  };

  if (steamPresence.enabled) {
    // Eager attempt so ECHO's native writes are observed from the start;
    // retried (throttled) on each status push if the runtime is not up yet.
    ensureSteamPresenceTarget();
    log('INFO', `steam presence augmentation enabled (event-driven, mode ${gameData.config.steamStatusMode})`);
  } else {
    log('INFO', 'steam presence augmentation disabled by config');
  }

  log('INFO', `classic pet active (watched ${initialWindows} window(s), page ${petPagePath}, foods=${gameData.foods.length}, works=${gameData.works.length})`);

  return () => {
    try { app.removeListener('browser-window-created', onWindowCreated); } catch {}
    try { BrowserWindow.prototype.loadFile = originalLoadFile; } catch {}
    try { BrowserWindow.prototype.loadURL = originalLoadURL; } catch {}
    try { closeAllPanelWindows(); } catch {}
    // Stop overriding Steam presence and unhook, letting ECHO's native
    // rich presence sync resume untouched.
    try { disposeSteamPresence(); } catch {}
    // Close remapped pet windows; ECHO's native pet close handler converts
    // this into a hide, and the next pet toggle recreates the native page.
    for (const window of remappedWindows) {
      try {
        if (!window.isDestroyed()) window.close();
      } catch {}
    }
    remappedWindows.clear();
    log('INFO', 'classic pet disposed');
  };
};

module.exports = activate;
exports.activate = activate;
