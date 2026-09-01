'use strict';

/*
 * ECHO Classic Pet renderer bootstrap (v3).
 *
 * Runs inside the native "ECHO Pet" BrowserWindow (ECHO preload bridge stays
 * available, so window.echo.pet.* / window.echo.playback.* keep working).
 *
 * v1 kept the original ECHO pixel pet look (idle/interact GIFs, transport
 * controls, drag). v2 added the full VPet-style gameplay. v3 redesigns the
 * whole UI in the ECHO dark glass theme:
 *
 *  - shop / work / stats open in separate frameless BrowserWindows next to
 *    the pet (main.cjs owns them; see panel.html / panel.js). The pet window
 *    itself always keeps its original small square — it is never resized.
 *    This page runs the game engine and pushes state snapshots to the
 *    panels; the panels send actions back (both via a tagged
 *    console-message bridge relayed by main.cjs),
 *  - an action dock of pixel icon buttons (shop / schedule / stats / sleep /
 *    dance) appears on hover,
 *  - pet action states come from assets/echo-pet-states.js +
 *    assets/pet-sprite.css: sleep / eat / work / walk / climb / raised /
 *    poor / ill / happy / levelup all swap to dedicated GIF frame sets
 *    (echo-pet-*.gif). Dragging the pet shows the raised (dangling) state
 *    while the pointer holds it, and leveling up bursts into the levelup
 *    celebration frames,
 *  - transport controls use the original ECHO pixel sprite sheet
 *    (assets/echo-pet-controls.png), cropped per button by pet.css exactly
 *    like the native pet window,
 *  - VPet-style roaming: when idle the pet occasionally strolls left/right
 *    along its screen edge (window.echo.pet.moveTo + the walk frames'
 *    waddle), pausing for drags, sleep, work, open panel windows and other
 *    activities.
 *
 * Game data (foods/works/phrases + config) is injected by main.cjs as
 * window.__echoClassicPetData, with a fetch/XHR fallback to data/*.json.
 */
(() => {
  const IDLE_SRC = 'assets/echo-pet-idle.gif';
  const INTERACT_SRC = 'assets/echo-pet-interact.gif';
  const DRAG_THRESHOLD_PX = 4;
  const TRANSPORT_ERROR_DURATION_MS = 2400;
  const DEFAULT_ANIMATION_DURATION_MS = 3600;
  const DATA_WAIT_TIMEOUT_MS = 8000;
  const PLAYBACK_POLL_MS = 2000;

  // Trailing throttle for engine-state pushes to the panel windows.
  const PANEL_STATE_THROTTLE_MS = 150;

  // First-run discoverability hint (never shown again once the key exists).
  const HINT_KEY = 'echo.classic-pet.hint.v1';
  const HINT_DISMISS_MS = 8000;
  const DOCK_PULSE_MS = 3000;

  // Renderer -> main bridge marker (main.cjs listens on console-message).
  const BRIDGE_TAG = '[echo-classic-pet:bridge]';

  const SPRITE_FILES = ['assets/ui-icons.svg', 'assets/fx-icons.svg'];

  const query = new URLSearchParams(window.location.search);
  const configuredDuration = Number(query.get('interactMs'));
  const animationDurationMs = Number.isFinite(configuredDuration) && configuredDuration >= 500 && configuredDuration <= 20000
    ? Math.round(configuredDuration)
    : DEFAULT_ANIMATION_DURATION_MS;

  const stage = document.getElementById('pet-stage');
  const character = document.getElementById('pet-character');
  const trigger = document.getElementById('pet-trigger');
  const statusEl = document.getElementById('pet-status');
  const statusBar = document.getElementById('cp-status-bar');
  const bubble = document.getElementById('cp-bubble');
  const bubbleText = document.getElementById('cp-bubble-text');
  const menuRoot = document.getElementById('cp-menu-root');
  const dock = document.getElementById('cp-dock');
  const dockButtons = {
    shop: document.getElementById('dock-shop'),
    work: document.getElementById('dock-work'),
    stats: document.getElementById('dock-stats'),
    sleep: document.getElementById('dock-sleep'),
    dance: document.getElementById('dock-dance'),
  };
  const transportButtons = {
    previous: document.getElementById('pet-previous'),
    playPause: document.getElementById('pet-play-pause'),
    next: document.getElementById('pet-next'),
  };
  const transportTitles = {
    previous: '上一首',
    playPause: '播放 / 暂停',
    next: '下一首',
  };
  const resetButton = document.getElementById('pet-reset');
  const hideButton = document.getElementById('pet-hide');

  // Preload every state's frame set so src swaps never flicker (interact +
  // the dedicated sleep / eat / work / walk / climb / raised / poor / ill /
  // happy / levelup GIFs).
  const preloadedSprites = [];
  const spriteManifest = window.EchoClassicPet?.petStates?.ASSETS?.sprites;
  for (const src of Object.values(spriteManifest || { interact: INTERACT_SRC })) {
    const img = new Image();
    img.src = src;
    preloadedSprites.push(img);
  }

  let animationTimer = null;
  let transportErrorTimer = null;
  let transportPending = false;
  let dragGesture = null;
  let dragFrame = null;
  let pendingDragPosition = null;
  let suppressCharacterClick = false;

  // ---------------------------------------------------------------------
  // Inline SVG sprites (pixel UI icons + stage FX glyphs)
  // ---------------------------------------------------------------------

  const fetchText = async (path) => {
    // fetch() may reject file:// URLs depending on the Chromium build, so
    // fall back to XHR which Electron allows for same-directory files.
    try {
      const response = await fetch(path);
      if (response.ok) return await response.text();
    } catch { /* fall through to XHR */ }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', path);
      xhr.responseType = 'text';
      xhr.onload = () => resolve(xhr.responseText);
      xhr.onerror = () => reject(new Error(`load failed: ${path}`));
      xhr.send();
    });
  };

  const injectSprites = async () => {
    const container = document.getElementById('cp-sprites');
    if (!container) return;
    const chunks = await Promise.all(
      SPRITE_FILES.map((file) => fetchText(file).catch((error) => {
        console.warn('[classic-pet] sprite load failed', file, error);
        return '';
      })),
    );
    container.innerHTML = chunks.join('\n');
    document.body.classList.add('cp-icons-ready');
  };

  void injectSprites();

  // ---------------------------------------------------------------------
  // Panel window bridge
  //
  // Shop / work / stats live in separate BrowserWindows owned by main.cjs.
  // This page only sends tagged console messages (openPanel / closePanel /
  // closeAllPanels / panelState) and mirrors which panels are open:
  // main.cjs pushes window.__echoClassicPetPanels + an
  // 'echo-classic-pet-panels' event on every open/close, and relays panel
  // actions as window.__echoClassicPetPanelAction +
  // 'echo-classic-pet-panel-action'. Without the native host these messages
  // go nowhere — but without the host main.cjs never redirects the pet
  // window to this page in the first place.
  // ---------------------------------------------------------------------

  const openPanels = new Set();
  let panelsChangedHook = null; // set by startGame (dock states + state push)

  const sendBridge = (payload) => {
    try {
      console.info(`${BRIDGE_TAG} ${JSON.stringify(payload)}`);
    } catch { /* bridge is best-effort */ }
  };

  window.addEventListener('echo-classic-pet-panels', () => {
    const list = Array.isArray(window.__echoClassicPetPanels) ? window.__echoClassicPetPanels : [];
    openPanels.clear();
    for (const name of list) {
      if (typeof name === 'string') openPanels.add(name);
    }
    if (panelsChangedHook) panelsChangedHook();
  });

  // ---------------------------------------------------------------------
  // Character animation (idle <-> interact GIF)
  //
  // Once the game boots, interactHook routes all interact feedback through
  // the visual-state layer (assets/echo-pet-states.js), which owns both the
  // .eps-anim--* classes and the GIF swaps. Before that (or if game data
  // fails to load) the raw v1 GIF swap below still works. dragStateHook is
  // the same idea for the raised (picked-up) state: the drag gesture calls
  // it with true/false and the visual layer dangles the pet while held.
  // ---------------------------------------------------------------------

  let interactHook = null;
  let dragStateHook = null;

  const setAnimating = (animating) => {
    const nextSrc = animating ? INTERACT_SRC : IDLE_SRC;
    if (!character.src.endsWith(nextSrc)) {
      character.src = nextSrc;
    }
  };

  const triggerAnimation = () => {
    if (interactHook) {
      interactHook();
      return;
    }
    if (animationTimer !== null) {
      window.clearTimeout(animationTimer);
    }
    setAnimating(true);
    animationTimer = window.setTimeout(() => {
      animationTimer = null;
      setAnimating(false);
    }, animationDurationMs);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') {
      return;
    }
    if (animationTimer !== null) {
      window.clearTimeout(animationTimer);
      animationTimer = null;
    }
    setAnimating(false);
  });

  // ---------------------------------------------------------------------
  // Window dragging via window.echo.pet.moveTo
  //
  // The window is always exactly the pet square, so window.screenX/Y is the
  // pet position directly.
  // ---------------------------------------------------------------------

  const flushPetDrag = () => {
    dragFrame = null;
    const position = pendingDragPosition;
    pendingDragPosition = null;
    if (position && window.echo && window.echo.pet && typeof window.echo.pet.moveTo === 'function') {
      Promise.resolve(window.echo.pet.moveTo(position)).catch(() => undefined);
    }
  };

  const schedulePetDrag = (position) => {
    pendingDragPosition = position;
    if (dragFrame === null) {
      dragFrame = window.requestAnimationFrame(flushPetDrag);
    }
  };

  trigger.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !Number.isFinite(window.screenX) || !Number.isFinite(window.screenY)) {
      return;
    }
    dragGesture = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startPetX: window.screenX,
      startPetY: window.screenY,
      moved: false,
    };
    if (typeof trigger.setPointerCapture === 'function') {
      trigger.setPointerCapture(event.pointerId);
    }
  });

  trigger.addEventListener('pointermove', (event) => {
    if (!dragGesture || dragGesture.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.screenX - dragGesture.startScreenX;
    const deltaY = event.screenY - dragGesture.startScreenY;
    if (!dragGesture.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) {
      return;
    }
    if (!dragGesture.moved && dragStateHook) {
      dragStateHook(true); // picked up: show the raised (dangling) state
    }
    dragGesture.moved = true;
    schedulePetDrag({
      x: dragGesture.startPetX + deltaX,
      y: dragGesture.startPetY + deltaY,
    });
  });

  const finishCharacterDrag = (event) => {
    if (!dragGesture || dragGesture.pointerId !== event.pointerId) {
      return;
    }
    const moved = dragGesture.moved;
    dragGesture = null;
    suppressCharacterClick = moved;
    if (moved && dragStateHook) {
      dragStateHook(false); // put down: fall back to the resolved state
    }
    if (dragFrame !== null) {
      window.cancelAnimationFrame(dragFrame);
      dragFrame = null;
      flushPetDrag();
    }
    if (typeof trigger.hasPointerCapture === 'function' && trigger.hasPointerCapture(event.pointerId)) {
      trigger.releasePointerCapture(event.pointerId);
    }
  };

  trigger.addEventListener('pointerup', finishCharacterDrag);
  trigger.addEventListener('pointercancel', finishCharacterDrag);

  // ---------------------------------------------------------------------
  // Transport controls (previous / play-pause / next)
  // ---------------------------------------------------------------------

  const setTransportDisabled = (disabled) => {
    for (const button of Object.values(transportButtons)) {
      button.disabled = disabled;
    }
  };

  const setTransportError = (message) => {
    statusEl.textContent = message || '';
    for (const [action, button] of Object.entries(transportButtons)) {
      button.title = message || transportTitles[action];
    }
  };

  const controlPlayback = async (type) => {
    const controlMainWindow = window.echo
      && window.echo.playback
      && window.echo.playback.controlMainWindow;
    if (typeof controlMainWindow !== 'function' || transportPending) {
      return;
    }

    transportPending = true;
    setTransportDisabled(true);
    setTransportError(null);
    if (transportErrorTimer !== null) {
      window.clearTimeout(transportErrorTimer);
      transportErrorTimer = null;
    }
    triggerAnimation();
    try {
      await controlMainWindow({ type });
    } catch (error) {
      setTransportError(error instanceof Error ? error.message : String(error));
      transportErrorTimer = window.setTimeout(() => {
        transportErrorTimer = null;
        setTransportError(null);
      }, TRANSPORT_ERROR_DURATION_MS);
    } finally {
      transportPending = false;
      setTransportDisabled(false);
    }
  };

  transportButtons.previous.addEventListener('click', () => { void controlPlayback('previous'); });
  transportButtons.playPause.addEventListener('click', () => { void controlPlayback('playPause'); });
  transportButtons.next.addEventListener('click', () => { void controlPlayback('next'); });

  const resetPetBounds = () => {
    const resetBounds = window.echo && window.echo.pet && window.echo.pet.resetBounds;
    if (typeof resetBounds === 'function') {
      Promise.resolve(resetBounds()).catch(() => undefined);
    }
  };

  const hidePet = () => {
    const hide = window.echo && window.echo.pet && window.echo.pet.hide;
    if (typeof hide === 'function') {
      Promise.resolve(hide()).catch(() => undefined);
    }
  };

  resetButton.addEventListener('click', resetPetBounds);
  hideButton.addEventListener('click', hidePet);

  // ---------------------------------------------------------------------
  // Game data loading
  // ---------------------------------------------------------------------

  const fetchJson = async (path) => JSON.parse(await fetchText(path));

  const waitForInjectedData = () => new Promise((resolve) => {
    if (window.__echoClassicPetData) {
      resolve(window.__echoClassicPetData);
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('echo-classic-pet-data', onEvent);
      window.clearInterval(pollTimer);
      window.clearTimeout(timeout);
      resolve(value);
    };
    const onEvent = () => finish(window.__echoClassicPetData || null);
    const pollTimer = window.setInterval(() => {
      if (window.__echoClassicPetData) finish(window.__echoClassicPetData);
    }, 200);
    const timeout = window.setTimeout(() => finish(null), DATA_WAIT_TIMEOUT_MS);
    window.addEventListener('echo-classic-pet-data', onEvent);
  });

  const loadGameData = async () => {
    const injected = await waitForInjectedData();
    if (injected && Array.isArray(injected.foods) && Array.isArray(injected.works)) {
      return injected;
    }
    const [foods, works, phrases] = await Promise.all([
      fetchJson('data/foods.json'),
      fetchJson('data/works.json'),
      fetchJson('data/phrases.json'),
    ]);
    return { foods, works, phrases, config: injected?.config || {} };
  };

  // ---------------------------------------------------------------------
  // Game bootstrap
  // ---------------------------------------------------------------------

  const root = window.EchoClassicPet;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };

  const svgIcon = (name, className = 'cp-icon') => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${name}`);
    svg.append(use);
    return svg;
  };

  const startGame = (data) => {
    const config = data.config || {};
    const phrases = data.phrases || {};
    const petName = typeof config.petName === 'string' && config.petName.trim()
      ? config.petName.trim()
      : 'ECHO';

    // --- configurable UI part visibility (all default on) ---------------
    //
    // Each show* config key set to false adds a body class; pet.css hides
    // the matching section. Behaviour behind the hidden chrome keeps
    // running (status line still feeds Steam, jobs still finish, speech
    // events still fire) — only the pixels go away.

    const UI_VISIBILITY = [
      ['showActionDock', 'cp-hide-dock'],
      ['showTransportControls', 'cp-hide-transport'],
      ['showWindowControls', 'cp-hide-window-controls'],
      ['showStatusBar', 'cp-hide-status-bar'],
      ['showSpeechBubble', 'cp-hide-bubble'],
      ['showWorkTimer', 'cp-hide-work-timer'],
      ['showContextMenu', 'cp-hide-menu'],
    ];
    for (const [key, className] of UI_VISIBILITY) {
      if (config[key] === false) document.body.classList.add(className);
    }
    const dockVisible = config.showActionDock !== false;
    const contextMenuEnabled = config.showContextMenu !== false;

    const save = root.saveStore.load(petName);
    if (config.petName) save.name = petName; // config rename applies to existing saves

    const engine = root.createEngine({
      save,
      works: data.works,
      foods: data.foods,
      config: { autoBuy: config.autoBuy !== false },
    });

    // --- pet visual states (assets/echo-pet-states.js + pet-sprite.css) --
    //
    // The controller maps engine mode/state (+ transient activities and the
    // listening flag) to one .eps-anim--* class, an .eps-fx--* stage overlay
    // and the right GIF. Its sync() only touches the DOM when the resolved
    // visual key changes (appliedKey diff guard), so per-tick engine 'change'
    // events never restart running CSS animations. Transient activities
    // (interact / eat / dance) clear themselves after one run.

    const ACTIVITY_DURATIONS_MS = {
      interact: animationDurationMs,
      eat: 2600,
      dance: 4200,
      levelup: 2600, // ≈ two loops of the celebration GIF
    };
    // Work start gets a short hop so the transition into the persistent
    // work-pulse state is acknowledged without masking the laptop frames
    // for long.
    const WORK_START_CUE_MS = 700;
    const petVisual = root.petStates.createController(character, { stage });

    const syncVisual = () => {
      petVisual.current.mode = engine.save.mode;
      petVisual.current.state = engine.save.state;
      petVisual.current.listening = ui.isPlaybackActive ? ui.isPlaybackActive() === true : false;
      petVisual.sync();
    };

    const playActivity = (name) => {
      petVisual.playAction(name, ACTIVITY_DURATIONS_MS[name]);
    };

    // Route the pre-game interact GIF swap through the visual layer.
    interactHook = () => playActivity('interact');

    // While the pointer drags the pet window, dangle it in the raised state.
    dragStateHook = (held) => {
      petVisual.setHeld(held === true);
    };

    // --- panel windows (shop / work / stats) --------------------------------
    //
    // The panels are separate BrowserWindows managed by main.cjs; this page
    // is the engine host. It mirrors the open-panel set (pushed by main.cjs),
    // sends throttled engine snapshots for the panels to render, and executes
    // the actions they dispatch.

    const isPanelOpen = (name) => openPanels.has(name);

    const updateDockStates = () => {
      dockButtons.shop.classList.toggle('is-active', isPanelOpen('shop'));
      dockButtons.work.classList.toggle('is-active', isPanelOpen('work'));
      dockButtons.stats.classList.toggle('is-active', isPanelOpen('stats'));
      const sleeping = engine.save.state === 'sleep';
      dockButtons.sleep.classList.toggle('is-active', sleeping);
      dockButtons.sleep.title = sleeping ? '起床' : '睡觉';
    };

    // Engine snapshot for the panel windows. Everything a panel renders is
    // precomputed here so the panels never duplicate engine formulas
    // (except the static per-minute job rate, which only needs the tick
    // constants).
    const buildPanelState = () => {
      const s = engine.save;
      const buffs = {};
      for (const food of engine.foods) {
        const { buff } = engine.eatBuff(food);
        if (buff < 1) buffs[food.name] = buff;
      }
      return {
        updatedAt: Date.now(),
        save: {
          name: s.name,
          level: s.level,
          levelMax: s.levelMax,
          mode: s.mode,
          state: s.state,
          money: s.money,
          exp: s.exp,
          strength: s.strength,
          strengthFood: s.strengthFood,
          strengthDrink: s.strengthDrink,
          feeling: s.feeling,
          health: s.health,
          likability: s.likability,
          likabilityMax: s.likabilityMax,
          nowWork: s.nowWork ? { ...s.nowWork } : null,
          stats: { ...s.stats },
        },
        derived: {
          strengthMax: engine.strengthMax(),
          feelingMax: engine.feelingMax(),
          levelUpNeed: engine.levelUpNeed(),
          change: { ...engine.change },
        },
        buffs,
      };
    };

    let panelStateTimer = null;
    const pushPanelState = () => {
      if (openPanels.size === 0) return;
      if (panelStateTimer !== null) return;
      panelStateTimer = window.setTimeout(() => {
        panelStateTimer = null;
        if (openPanels.size === 0) return;
        sendBridge({ type: 'panelState', state: buildPanelState() });
      }, PANEL_STATE_THROTTLE_MS);
    };

    engine.on('change', pushPanelState);

    panelsChangedHook = () => {
      updateDockStates();
      pushPanelState(); // a newly opened panel needs a fresh snapshot
    };

    const ui = {
      openPanel(name, options = {}) {
        const message = { type: 'openPanel', name };
        if (options && typeof options.tab === 'string') message.tab = options.tab;
        sendBridge(message);
        closeMenu();
      },
      closePanel(name) {
        sendBridge({ type: 'closePanel', name });
      },
      togglePanel(name) {
        if (isPanelOpen(name)) this.closePanel(name);
        else this.openPanel(name);
      },
      closeAllPanels() {
        sendBridge({ type: 'closeAllPanels' });
      },
      playInteract: triggerAnimation,
      flashLabel: null,       // set once touch module exists
      isPlaybackActive: null, // set once status module exists
      // Guarded like the 'touch' listener: waving over a sleeping pet must
      // not mask the sleep GIF with the interact bounce.
      onWave: () => {
        if (engine.save.state !== 'sleep') triggerAnimation();
      },
    };

    // Actions dispatched from the panel windows (relayed by main.cjs as
    // window.__echoClassicPetPanelAction + this event). The engine executes
    // them here; the resulting 'change' events push fresh snapshots back.
    window.addEventListener('echo-classic-pet-panel-action', () => {
      const action = window.__echoClassicPetPanelAction;
      window.__echoClassicPetPanelAction = null;
      if (!action || typeof action !== 'object') return;
      if (action.kind === 'buyFood') {
        const food = engine.foods.find((f) => f.name === action.name);
        if (!food) return;
        const result = engine.buyFood(food, action.quantity);
        if (!result.ok && result.reason === 'money') ui.flashLabel?.('钱不够啦…');
      } else if (action.kind === 'startWork') {
        const work = engine.findWork(action.id);
        if (!work) return;
        // engine.startWork toggles: starting the running job stops it.
        const result = engine.startWork(work);
        if (!result.ok && result.message) ui.flashLabel?.(result.message);
        else if (result.ok && !result.stopped) ui.closePanel('work');
      } else if (action.kind === 'stopWork') {
        engine.stopWork('manualstop');
      }
      // Failed actions emit no 'change'; push once so button states settle.
      pushPanelState();
    });

    // --- module wiring -----------------------------------------------------

    // The running work timer card stays on the pet stage (the schedule list
    // itself renders in the external work panel window).
    const workTimer = root.createWorkTimer(engine);
    stage.append(workTimer.card);

    const touch = root.createTouch(engine, ui, { stage, trigger });
    ui.flashLabel = (text) => {
      const rect = stage.getBoundingClientRect();
      touch.showFloatingLabel(text, rect.left + rect.width / 2, rect.top + rect.height * 0.35);
    };

    const say = root.createSay(engine, ui, { bubble, bubbleText }, phrases);
    const status = root.createStatus(engine, ui, { statusBar, sendBridge }, config);
    ui.isPlaybackActive = status.isPlaybackActive;

    // --- playback state: dance baseline ---
    // The play/pause sprite is a single glyph like the native pet (no visual
    // play/pause swap), so this poll only feeds the dance visual: syncVisual
    // reads the live listening flag and resolveVisualState turns it into the
    // 'dance' baseline while music plays.

    window.setInterval(() => {
      syncVisual();
    }, PLAYBACK_POLL_MS);

    // --- stage attributes (mode / state visuals + action states) ---

    const syncStageAttributes = () => {
      stage.dataset.mode = engine.save.mode;
      stage.dataset.state = engine.save.state;
      syncVisual();
      updateDockStates();
    };
    engine.on('change', syncStageAttributes);
    engine.on('mode', (before, next) => {
      syncStageAttributes();
      // The interact bounce is upbeat feedback; when the pet just turned
      // ill/poorcondition it would mask the sick visuals with a happy hop,
      // so only celebrate changes into the good moods.
      if (next !== 'ill' && next !== 'poorcondition') triggerAnimation();
    });
    engine.on('sleep', syncStageAttributes);
    engine.on('eat', () => playActivity('eat'));
    // Sync explicitly on work transitions (not just via the trailing 'change'
    // emit) so the work visual never depends on emit ordering.
    engine.on('workstart', () => {
      syncStageAttributes();
      petVisual.playAction('interact', WORK_START_CUE_MS);
    });
    engine.on('workend', (info) => {
      syncStageAttributes();
      if (info && info.reason === 'timefinish') triggerAnimation();
    });
    // No interact bounce while asleep: a wave-pat still applies its stat
    // effect, but the sleep GIF must not be masked by the happy hop.
    engine.on('touch', ({ applied }) => {
      if (applied && engine.save.state !== 'sleep') triggerAnimation();
    });
    // Level up: dedicated celebration frames, not the generic interact bounce.
    engine.on('levelup', () => playActivity('levelup'));

    // --- dance action (cosmetic beat-spin + chatter) ---

    const pick = (list) => (Array.isArray(list) && list.length
      ? list[Math.floor(Math.random() * list.length)]
      : null);

    const dance = () => {
      if (engine.save.state === 'sleep') {
        ui.flashLabel?.('睡觉中…嘘');
        return;
      }
      engine.markInteraction();
      // No triggerAnimation() here: it would route to playActivity('interact')
      // and immediately override the dance state.
      playActivity('dance');
      const line = pick(phrases.dance)
        || (ui.isPlaybackActive?.() ? '跟着节拍摇摆～♪' : '看我跳舞～');
      say.say(line, { animate: false });
    };

    // --- action dock wiring ---

    const persistentDock = config.persistentDock === true;
    if (persistentDock) dock.classList.add('is-persistent');

    dockButtons.shop.addEventListener('click', () => ui.togglePanel('shop'));
    dockButtons.work.addEventListener('click', () => ui.togglePanel('work'));
    dockButtons.stats.addEventListener('click', () => ui.togglePanel('stats'));
    dockButtons.sleep.addEventListener('click', () => { engine.toggleSleep(); });
    dockButtons.dance.addEventListener('click', dance);

    // --- first-run discoverability hint ---
    //
    // One-time banner explaining that the action dock lives behind hover and
    // the pet reacts to clicks, while the dock itself pulses briefly to show
    // where it is. Auto-hides after 8s or on click; the storage key is set
    // on first show so the hint never reappears.

    const showFirstRunHint = () => {
      try {
        if (window.localStorage.getItem(HINT_KEY)) return;
        window.localStorage.setItem(HINT_KEY, String(Date.now()));
      } catch {
        return; // storage unavailable: skip rather than nag on every launch
      }
      const hint = document.getElementById('cp-hint');
      if (!hint) return;
      if (persistentDock || !dockVisible) {
        // Always-visible dock (nothing hides behind hover) or hidden dock
        // (nothing to hover for): the hover tip would mislead either way,
        // so point at the other affordances instead.
        const text = hint.querySelector('.cp-hint-text');
        if (text) {
          text.textContent = contextMenuEnabled ? '点击宠物互动 · 右键打开菜单' : '点击宠物互动';
        }
      }
      hint.hidden = false;
      window.requestAnimationFrame(() => hint.classList.add('is-open'));
      let hideTimer = null;
      const dismiss = () => {
        if (hideTimer !== null) {
          window.clearTimeout(hideTimer);
          hideTimer = null;
        }
        hint.classList.remove('is-open');
        window.setTimeout(() => hint.remove(), 250); // after fade-out
      };
      hideTimer = window.setTimeout(dismiss, HINT_DISMISS_MS);
      hint.addEventListener('click', dismiss, { once: true });
      if (!persistentDock && dockVisible) {
        dock.classList.add('cp-dock--pulse');
        window.setTimeout(() => dock.classList.remove('cp-dock--pulse'), DOCK_PULSE_MS);
      }
    };

    showFirstRunHint();

    // --- character click: pat head/body + occasional chatter ---

    trigger.addEventListener('click', (event) => {
      if (suppressCharacterClick) {
        suppressCharacterClick = false;
        return;
      }
      triggerAnimation();
      if (engine.save.state === 'sleep') return; // let it sleep
      touch.tap(event);
      say.sayOnClick();
    });

    // --- context menu ------------------------------------------------------

    const menu = el('div', 'cp-menu');
    menuRoot.append(menu);

    const closeMenu = () => {
      menuRoot.classList.remove('is-open');
    };

    const menuLeaf = (label, action, options = {}) => {
      const button = el('button', 'cp-menu-item');
      button.type = 'button';
      if (options.icon) button.append(svgIcon(options.icon));
      button.append(document.createTextNode(label));
      if (options.disabled) button.disabled = true;
      if (options.title) button.title = options.title;
      button.addEventListener('click', () => {
        closeMenu();
        action();
      });
      return button;
    };

    const menuGroup = (label, children) => {
      const group = el('div', 'cp-menu-group');
      const head = el('button', 'cp-menu-item', label);
      head.type = 'button';
      head.append(el('span', 'cp-menu-caret', '▸'));
      head.addEventListener('click', () => {
        const expand = !group.classList.contains('is-expanded');
        for (const sibling of menu.querySelectorAll('.cp-menu-group')) {
          sibling.classList.remove('is-expanded');
        }
        group.classList.toggle('is-expanded', expand);
        head.querySelector('.cp-menu-caret').textContent = expand ? '▾' : '▸';
      });
      const sub = el('div', 'cp-menu-sub');
      for (const child of children) sub.append(child);
      group.append(head, sub);
      return group;
    };

    let resetArmed = false;

    const rebuildMenu = () => {
      menu.textContent = '';
      const sleeping = engine.save.state === 'sleep';
      // Open the external work panel window pre-focused on a tab.
      const openWorkTab = (tab) => () => ui.openPanel('work', { tab });

      menu.append(
        menuLeaf('喂食 · 打开商店', () => ui.openPanel('shop'), { icon: 'icon-food' }),
        menuGroup('🤝 互动', [
          menuLeaf('👋 摸摸头', () => {
            const rect = stage.getBoundingClientRect();
            const applied = engine.touch('head');
            if (applied) touch.showFloatingLabel('体力-2 心情+1', rect.left + rect.width / 2, rect.top + rect.height * 0.3);
            triggerAnimation();
          }),
          menuLeaf(sleeping ? '🌅 起床' : '💤 睡觉', () => engine.toggleSleep()),
          menuLeaf('🕺 跳舞', dance, { disabled: sleeping }),
          menuLeaf('💼 工作', openWorkTab('Work'), { disabled: engine.save.mode === 'ill', title: engine.save.mode === 'ill' ? '生病中无法工作' : undefined }),
          menuLeaf('📚 学习', openWorkTab('Study'), { disabled: engine.save.mode === 'ill' }),
          menuLeaf('🎮 玩耍', openWorkTab('Play'), { disabled: engine.save.mode === 'ill' }),
        ]),
        menuGroup('📋 面板', [
          menuLeaf('显示状态', () => ui.openPanel('stats'), { icon: 'icon-stats' }),
          menuLeaf('安排日程', () => ui.openPanel('work'), { icon: 'icon-work' }),
          menuLeaf('收起所有面板', () => ui.closeAllPanels()),
          menuLeaf(resetArmed ? '⚠️ 确认重置存档？' : '🗑 重置存档', () => {
            if (!resetArmed) {
              resetArmed = true;
              ui.flashLabel?.('再选一次以确认重置');
              window.setTimeout(() => { resetArmed = false; }, 4000);
              return;
            }
            resetArmed = false;
            root.saveStore.reset();
            window.location.reload();
          }),
        ]),
      );
      menu.append(el('div', 'cp-menu-sep'));
      menu.append(
        menuLeaf('📍 重置位置', resetPetBounds),
        menuLeaf('✖ 隐藏桌宠', hidePet),
      );
    };

    const openMenu = (clientX, clientY) => {
      rebuildMenu();
      menuRoot.classList.add('is-open');
      menu.style.left = '0px';
      menu.style.top = '0px';
      // measure after render, then clamp inside the window
      const menuRect = menu.getBoundingClientRect();
      const x = Math.min(Math.max(0, clientX), Math.max(0, window.innerWidth - menuRect.width - 2));
      const y = Math.min(Math.max(0, clientY), Math.max(0, window.innerHeight - menuRect.height - 2));
      menu.style.left = `${Math.round(x)}px`;
      menu.style.top = `${Math.round(y)}px`;
    };

    document.addEventListener('contextmenu', (event) => {
      // Always swallow the default menu (frameless transparent window);
      // only open ours when the config allows it.
      event.preventDefault();
      if (contextMenuEnabled) openMenu(event.clientX, event.clientY);
    });

    menuRoot.addEventListener('pointerdown', (event) => {
      if (event.target === menuRoot) closeMenu();
    });
    window.addEventListener('blur', closeMenu);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
        ui.closeAllPanels();
      }
    });

    // --- autonomous roaming (VPet-style walk along the work-area edge) ---
    //
    // Modeled on VPet's walk.left / walk.right move graphs (SpeedX with a
    // bounded Distance and turn-around Check margins near the display
    // edges): when nothing else is going on, the pet occasionally strolls a
    // short distance left or right along whatever screen edge it sits on
    // (Y never changes, so a pet parked on the taskbar edge stays there).
    // Movement drives the real native window through window.echo.pet.moveTo
    // (the same channel dragging uses), one rAF-paced sub-pixel step at a
    // time; the walk GIF's waddle + walk-bob keyframes + .eps-face--left
    // flip come from assets/pet-sprite.css via the 'walk' visual state.

    const roamingEnabled = config.enableRoaming !== false;
    const ROAM = {
      MIN_PAUSE_MS: 9000,   // idle gap between strolls
      MAX_PAUSE_MS: 24000,
      RETRY_MS: 4500,       // recheck delay while blocked (sleep/panels/…)
      MIN_DISTANCE_PX: 60,  // walk-distance budget per stroll
      MAX_DISTANCE_PX: 240,
      MIN_SPEED_PX_S: 26,   // ≈ VPet walk SpeedX scaled to the smaller pet
      MAX_SPEED_PX_S: 46,
      EDGE_MARGIN_PX: 8,    // keep this far away from the work-area edges
      OFFSIDE_TOLERANCE_PX: 40, // parked further outside? leave it alone
      MAX_FRAME_DT_MS: 64,  // clamp rAF gaps (throttling, load hiccups)
    };

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const roam = { timer: null, frame: null, walk: null };

    const canMovePet = () => Boolean(
      window.echo && window.echo.pet && typeof window.echo.pet.moveTo === 'function',
    );

    const roamAllowed = () =>
      roamingEnabled
      && canMovePet()
      && !reducedMotion.matches
      && document.visibilityState !== 'hidden'
      && engine.save.state === 'nomal'          // not sleeping, not working
      // Sick pets stay put: resolveVisualState shows ill/poor over walk, so
      // moving the window would slide a visibly stationary pet around.
      && engine.save.mode !== 'ill'
      && engine.save.mode !== 'poorcondition'
      && dragGesture === null                    // user is not dragging the pet
      && openPanels.size === 0                   // no panel windows open
      && !menuRoot.classList.contains('is-open') // no context menu
      // Any transient activity blocks a new stroll AND aborts a running one:
      // walkFrame re-checks this every frame, so e.g. an autobuy 'eat' stops
      // the window mid-walk instead of sliding the eating pet around.
      && petVisual.current.activity === null
      && !stage.matches(':hover');               // user is pointing at the pet

    const setWalkFacing = (direction) => {
      character.classList.toggle('eps-face--left', direction < 0);
    };

    const stopWalk = () => {
      if (roam.frame !== null) {
        window.cancelAnimationFrame(roam.frame);
        roam.frame = null;
      }
      roam.walk = null;
      character.classList.remove('eps-face--left');
      if (petVisual.current.moving) {
        petVisual.setMoving(false);
      }
    };

    const walkFrame = (timestamp) => {
      roam.frame = null;
      const walk = roam.walk;
      if (!walk) return;
      if (!roamAllowed()) {
        stopWalk();
        scheduleRoam();
        return;
      }
      if (walk.lastTimestamp !== null) {
        const dt = Math.min(ROAM.MAX_FRAME_DT_MS, timestamp - walk.lastTimestamp) / 1000;
        const step = walk.speed * dt;
        walk.x += step * walk.direction;
        walk.remaining -= step;
        // Turn around at the work-area edges (VPet CheckLeft/CheckRight).
        if (walk.x <= walk.minX) {
          walk.x = walk.minX;
          walk.direction = 1;
          setWalkFacing(walk.direction);
        } else if (walk.x >= walk.maxX) {
          walk.x = walk.maxX;
          walk.direction = -1;
          setWalkFacing(walk.direction);
        }
        const rounded = Math.round(walk.x);
        if (rounded !== walk.sentX) {
          walk.sentX = rounded;
          Promise.resolve(window.echo.pet.moveTo({ x: rounded, y: walk.y })).catch(() => undefined);
        }
      }
      walk.lastTimestamp = timestamp;
      if (walk.remaining <= 0) {
        stopWalk();
        scheduleRoam();
        return;
      }
      roam.frame = window.requestAnimationFrame(walkFrame);
    };

    const startWalk = () => {
      // The window is exactly the pet square, so window.screenX/Y is the
      // pet position (same as the drag path above).
      const petW = window.innerWidth || window.outerWidth;
      const x = window.screenX;
      const y = window.screenY;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !(petW > 0)) return false;

      const availLeft = Number.isFinite(window.screen.availLeft) ? window.screen.availLeft : 0;
      const availWidth = Number(window.screen.availWidth);
      if (!Number.isFinite(availWidth) || availWidth <= 0) return false;
      const minX = availLeft + ROAM.EDGE_MARGIN_PX;
      const maxX = availLeft + availWidth - petW - ROAM.EDGE_MARGIN_PX;
      if (maxX - minX < ROAM.MIN_DISTANCE_PX) return false; // no room to stroll
      if (x < minX - ROAM.OFFSIDE_TOLERANCE_PX || x > maxX + ROAM.OFFSIDE_TOLERANCE_PX) {
        return false; // deliberately parked outside the walkable strip
      }

      // Head for the roomier side, but flip a coin when both sides have
      // comfortable space (mirrors VPet's walk.left / walk.right pair).
      const roomLeft = x - minX;
      const roomRight = maxX - x;
      let direction = roomRight >= roomLeft ? 1 : -1;
      if (Math.min(roomLeft, roomRight) > ROAM.MAX_DISTANCE_PX && Math.random() < 0.5) {
        direction = -direction;
      }

      roam.walk = {
        x: Math.min(Math.max(x, minX), maxX),
        y,
        minX,
        maxX,
        direction,
        speed: ROAM.MIN_SPEED_PX_S + Math.random() * (ROAM.MAX_SPEED_PX_S - ROAM.MIN_SPEED_PX_S),
        remaining: ROAM.MIN_DISTANCE_PX + Math.random() * (ROAM.MAX_DISTANCE_PX - ROAM.MIN_DISTANCE_PX),
        lastTimestamp: null,
        sentX: null,
      };
      setWalkFacing(direction);
      // Walk is driven directly (no playActivity timer: the distance budget
      // decides the duration). Any real activity started meanwhile replaces
      // it, which the next walkFrame notices and aborts on.
      petVisual.setMoving(true);
      roam.frame = window.requestAnimationFrame(walkFrame);
      return true;
    };

    const scheduleRoam = (delayMs) => {
      if (!roamingEnabled) return;
      if (roam.timer !== null) window.clearTimeout(roam.timer);
      const delay = Number.isFinite(delayMs)
        ? delayMs
        : ROAM.MIN_PAUSE_MS + Math.random() * (ROAM.MAX_PAUSE_MS - ROAM.MIN_PAUSE_MS);
      roam.timer = window.setTimeout(() => {
        roam.timer = null;
        if (!roamAllowed()) {
          scheduleRoam(ROAM.RETRY_MS);
          return;
        }
        if (!startWalk()) scheduleRoam();
      }, delay);
    };

    // Stop strolling the instant the user grabs the pet (before the drag
    // even passes its movement threshold), and never keep a stale walk
    // running while the pet window is hidden.
    trigger.addEventListener('pointerdown', () => {
      if (roam.walk) {
        stopWalk();
        scheduleRoam();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && roam.walk) {
        stopWalk();
        scheduleRoam();
      }
    });

    // --- go ---

    // Resolve any work that finished while the pet window was closed.
    engine.checkWorkFinish();
    syncStageAttributes();
    engine.start();
    status.start();
    scheduleRoam();
    root.saveStore.attachAutosave(engine);
    root.saveStore.persist(engine.save);

    // Expose for debugging / other mods.
    window.__echoClassicPetEngine = engine;
  };

  loadGameData()
    .then(startGame)
    .catch((error) => {
      console.error('[classic-pet] game data failed to load; pet stays cosmetic', error);
      if (statusBar) statusBar.textContent = '桌宠数据加载失败（基础功能可用）';
      if (dock) dock.style.display = 'none';
      // Basic v1 behaviour still works: click = interact animation.
      trigger.addEventListener('click', () => {
        if (suppressCharacterClick) {
          suppressCharacterClick = false;
          return;
        }
        triggerAnimation();
      });
    });
})();
