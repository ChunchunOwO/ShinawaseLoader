'use strict';

/*
 * ECHO Classic Pet — visual state map (assets/pet-sprite.css companion).
 *
 * Loaded by pet.html before the game modules. Publishes
 * window.EchoClassicPet.petStates so the integration layer (pet.js) can
 * translate the engine's gameplay data (save.mode / save.state + transient
 * activities such as eating, touch interactions or music playback) into:
 *   - one .eps-anim--* class for the pet <img>  (.echo-pet-character)
 *   - one .eps-fx--* overlay class for the stage (.echo-pet-stage)
 *   - a per-state sprite src swap (each major state has dedicated GIF frames)
 *   - an FX glyph layer on the stage: pixel SVG glyphs (<use href="#fx-*">,
 *     symbols in assets/fx-icons.svg) that pet-sprite.css shows and animates
 *     per .eps-fx--* class
 *
 * Sprites: idle / interact are the original ECHO pixel GIFs; sleep / eat /
 * work / walk / climb / raised / poor / ill / happy / levelup are dedicated
 * frame sets derived from them (same 45x45 pixel grid + palette,
 * regenerable via tools/generate-pet-gifs.py).
 *
 * Engine vocabulary (game/engine.js):
 *   mode:  'happy' | 'nomal' | 'poorcondition' | 'ill'
 *   state: 'nomal' | 'work' | 'sleep'
 * Visual vocabulary (this file / pet-sprite.css):
 *   idle · interact · happy · poor · ill · sleep · work · eat · dance ·
 *   walk · climb · raised · levelup
 */
(() => {
  const root = (window.EchoClassicPet = window.EchoClassicPet || {});

  const IDLE_SRC = 'assets/echo-pet-idle.gif';
  const INTERACT_SRC = 'assets/echo-pet-interact.gif';
  const SLEEP_SRC = 'assets/echo-pet-sleep.gif';
  const EAT_SRC = 'assets/echo-pet-eat.gif';
  const WORK_SRC = 'assets/echo-pet-work.gif';
  const WALK_SRC = 'assets/echo-pet-walk.gif';
  const CLIMB_SRC = 'assets/echo-pet-climb.gif';
  const RAISED_SRC = 'assets/echo-pet-raised.gif';
  const POOR_SRC = 'assets/echo-pet-poor.gif';
  const ILL_SRC = 'assets/echo-pet-ill.gif';
  const HAPPY_SRC = 'assets/echo-pet-happy.gif';
  const LEVELUP_SRC = 'assets/echo-pet-levelup.gif';

  /*
   * Visual states. `priority` documents which state wins when several are
   * plausible at once (higher wins); resolveVisualState already encodes that
   * order, the field is informational for custom integrations.
   */
  const VISUAL_STATES = Object.freeze({
    idle: Object.freeze({
      className: 'eps-anim--idle',
      fxClassName: null,
      sprite: IDLE_SRC,
      keyframes: 'idle-breathe',
      priority: 0,
    }),
    dance: Object.freeze({ // music is playing (listening)
      className: 'eps-anim--dance',
      fxClassName: 'eps-fx--notes',
      sprite: IDLE_SRC,
      keyframes: 'dance-spin',
      priority: 10,
    }),
    happy: Object.freeze({ // dedicated frames: brightened art + star sparkles
      className: 'eps-anim--happy',
      fxClassName: 'eps-fx--sparkle',
      sprite: HAPPY_SRC,
      keyframes: 'happy-bounce',
      priority: 20,
    }),
    walk: Object.freeze({ // autonomous roaming stroll along the screen edge
      // Driven by pet.js via setMoving() while its roam controller moves the
      // native window. Dedicated waddle frames (echo-pet-walk.gif) + the
      // walk-step footstep rhythm; direction is a separate .eps-face--left
      // flip class managed by the controller.
      className: 'eps-anim--walk',
      fxClassName: null,
      sprite: WALK_SRC,
      keyframes: 'walk-step',
      priority: 25,
    }),
    poor: Object.freeze({ // engine mode 'poorcondition'; dedicated frames:
      // washed-out slump + sweat drop, CSS adds the slow droop bob
      className: 'eps-anim--poor',
      fxClassName: null,
      sprite: POOR_SRC,
      keyframes: 'poor-slump',
      priority: 30,
    }),
    ill: Object.freeze({ // dedicated frames: pale woozy sway + heat shimmer
      className: 'eps-anim--ill',
      fxClassName: 'eps-fx--dizzy',
      sprite: ILL_SRC,
      keyframes: 'ill-sway',
      priority: 40,
    }),
    work: Object.freeze({ // dedicated frames: laptop on lap + screen glow
      className: 'eps-anim--work',
      fxClassName: 'eps-fx--work',
      sprite: WORK_SRC,
      keyframes: 'work-pulse',
      priority: 50,
    }),
    sleep: Object.freeze({ // dedicated frames: dimmed pet + pixel Zzz
      className: 'eps-anim--sleep',
      fxClassName: 'eps-fx--zzz',
      sprite: SLEEP_SRC,
      keyframes: 'sleep-zzz',
      priority: 60,
    }),
    eat: Object.freeze({ // transient; dedicated frames: shrinking snack chew
      className: 'eps-anim--eat',
      fxClassName: 'eps-fx--crumbs',
      sprite: EAT_SRC,
      keyframes: null, // chewing is baked into the GIF frames
      priority: 70,
    }),
    climb: Object.freeze({ // transient: scaling a panel/window edge
      // (canvas expand); dedicated frames: mitts gripping above the head
      // with alternating pulls — motion is baked in, no CSS keyframes.
      className: 'eps-anim--climb',
      fxClassName: null,
      sprite: CLIMB_SRC,
      keyframes: null,
      priority: 75,
    }),
    interact: Object.freeze({ // transient: click/touch feedback
      className: 'eps-anim--interact',
      fxClassName: 'eps-fx--sparkle',
      sprite: INTERACT_SRC,
      keyframes: 'happy-bounce',
      priority: 80,
    }),
    levelup: Object.freeze({ // transient: level-up celebration
      // Dedicated frames: crouch, leap, starburst + rising arrow, happy
      // landing — the hop is baked in, no CSS keyframes.
      className: 'eps-anim--levelup',
      fxClassName: 'eps-fx--sparkle',
      sprite: LEVELUP_SRC,
      keyframes: null,
      priority: 85,
    }),
    raised: Object.freeze({ // held: dedicated frames bake the startled look
      // + leg kicks; the whole-body pendulum stays a CSS keyframe so the
      // two motions compose.
      className: 'eps-anim--raised',
      fxClassName: null,
      sprite: RAISED_SRC,
      keyframes: 'raised-dangle',
      priority: 90,
    }),
  });

  const ANIM_CLASSES = Object.freeze(
    Object.values(VISUAL_STATES).map((s) => s.className),
  );
  const FX_CLASSES = Object.freeze(
    [...new Set(Object.values(VISUAL_STATES).map((s) => s.fxClassName).filter(Boolean))],
  );

  /* Engine mode -> baseline visual state (when nothing else overrides it). */
  const MODE_TO_VISUAL = Object.freeze({
    happy: 'happy',
    nomal: 'idle',
    poorcondition: 'poor',
    ill: 'ill',
  });

  /*
   * Pick the visual state key for the current game situation.
   *
   *   resolveVisualState({
   *     mode:      engine.save.mode,          // 'happy'|'nomal'|'poorcondition'|'ill'
   *     state:     engine.save.state,         // 'nomal'|'work'|'sleep'
   *     activity:  'eat'|'interact'|'climb'|'levelup'|null, // transient action
   *     listening: status.isPlaybackActive(), // music playing -> dance
   *     held:      true while the pet is being dragged -> raised
   *     moving:    true while the pet roams -> walk
   *   })
   *
   * Precedence: raised (held) > transient activity > sleep > work > ill >
   * poor > walk (moving) > dance > happy > idle. Being picked up interrupts
   * everything (even sleep); sickness beats walking and dancing so the
   * health cue stays visible; a happy pet grooves along instead of just
   * sparkling.
   */
  const resolveVisualState = ({ mode, state, activity, listening, held, moving } = {}) => {
    if (held) return 'raised';
    if (activity && VISUAL_STATES[activity]) return activity;
    if (state === 'sleep') return 'sleep';
    if (state === 'work') return 'work';
    if (mode === 'ill') return 'ill';
    if (mode === 'poorcondition') return 'poor';
    if (moving) return 'walk';
    if (listening) return 'dance';
    return MODE_TO_VISUAL[mode] || 'idle';
  };

  /*
   * Stage FX glyph slots (one <svg><use href="#fx-*"></svg> each). Symbols
   * live in assets/fx-icons.svg (inlined by pet.js next to the ui/control
   * sprites); pet-sprite.css decides per .eps-fx--* stage class which slots
   * show, plus their position, color (currentColor) and animation. Two-glyph
   * effects (notes, sparkles) reuse one symbol across two slots.
   */
  const FX_GLYPHS = Object.freeze([
    Object.freeze({ slot: 'zzz', icon: 'fx-zzz' }),
    Object.freeze({ slot: 'note-a', icon: 'fx-note' }),
    Object.freeze({ slot: 'note-b', icon: 'fx-note' }),
    Object.freeze({ slot: 'sparkle-a', icon: 'fx-sparkle' }),
    Object.freeze({ slot: 'sparkle-b', icon: 'fx-sparkle' }),
    Object.freeze({ slot: 'crumb', icon: 'fx-crumb' }),
    Object.freeze({ slot: 'dizzy', icon: 'fx-dizzy' }),
    Object.freeze({ slot: 'gear', icon: 'fx-gear' }),
  ]);

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* Build the FX glyph layer inside a stage element (idempotent). */
  const ensureFxLayer = (stage) => {
    if (!stage || typeof stage.querySelector !== 'function') return null;
    let layer = stage.querySelector('.eps-fx-layer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.className = 'eps-fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    for (const { slot, icon } of FX_GLYPHS) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', `eps-fx-glyph eps-fx-glyph--${slot}`);
      const use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', `#${icon}`);
      svg.append(use);
      layer.append(svg);
    }
    stage.append(layer);
    return layer;
  };

  /*
   * Apply a visual state to the DOM.
   *
   *   applyVisualState({ character, stage }, 'dance')
   *
   * - character: the pet <img> (gets the .eps-anim--* class + sprite src)
   * - stage:     the stage element (gets the .eps-fx--* overlay class, the
   *              FX glyph layer and a data-visual attribute for
   *              debugging/custom CSS)
   * The sprite src is only swapped when it changes, so looping GIFs are not
   * restarted every tick. Returns the resolved state descriptor.
   */
  const applyVisualState = (elements, key) => {
    const visual = VISUAL_STATES[key] || VISUAL_STATES.idle;
    const { character, stage } = elements || {};

    if (character) {
      character.classList.remove(...ANIM_CLASSES);
      character.classList.add(visual.className);
      if (visual.sprite && !character.src.endsWith(visual.sprite)) {
        character.src = visual.sprite;
      }
    }
    if (stage) {
      ensureFxLayer(stage);
      stage.classList.remove(...FX_CLASSES);
      if (visual.fxClassName) stage.classList.add(visual.fxClassName);
      stage.dataset.visual = key in VISUAL_STATES ? key : 'idle';
    }
    return visual;
  };

  /* Default lifetimes for transient actions started via playAction(). */
  const ACTION_DURATIONS_MS = Object.freeze({
    eat: 1600,
    interact: 900,
    dance: 4200,
    climb: 2600,
    levelup: 2600, // ≈ two loops of the 1.32s celebration GIF
  });

  /*
   * Stateful controller over resolveVisualState/applyVisualState. pet.js
   * drives one instance from the live engine + playback state; custom
   * integrations can create their own:
   *
   *   const pet = petStates.createController(characterImg);
   *   pet.current.mode = 'happy';   // direct writes allowed…
   *   pet.sync();                   // …followed by an explicit sync
   *   pet.setMode('ill');           // or use the setters (sync included)
   *   pet.setState('sleep');
   *   pet.setListening(true);       // music playing -> dance baseline
   *   pet.setHeld(true);            // being dragged -> raised (until false)
   *   pet.setMoving(true);          // roaming -> walk baseline
   *   pet.playAction('eat');        // transient; falls back automatically
   *
   * The stage element (fx overlay host) is derived from the character's
   * closest .echo-pet-stage ancestor unless passed via options.stage.
   * sync() only touches the DOM when the resolved visual state changes, so
   * per-tick engine 'change' events never restart running CSS animations.
   */
  const createController = (character, options = {}) => {
    const stage = options.stage
      || (character && typeof character.closest === 'function'
        ? character.closest('.echo-pet-stage')
        : null);
    const elements = { character, stage };
    const current = {
      mode: 'nomal',
      state: 'nomal',
      listening: false,
      activity: null,
      held: false,
      moving: false,
    };

    let appliedKey = null;
    let actionTimer = null;

    const sync = () => {
      const key = resolveVisualState(current);
      if (key === appliedKey) return VISUAL_STATES[key] || VISUAL_STATES.idle;
      appliedKey = key;
      return applyVisualState(elements, key);
    };

    const stopAction = () => {
      if (actionTimer !== null) {
        clearTimeout(actionTimer);
        actionTimer = null;
      }
      current.activity = null;
      sync();
    };

    const playAction = (name, durationMs) => {
      if (!VISUAL_STATES[name]) return;
      if (actionTimer !== null) clearTimeout(actionTimer);
      current.activity = name;
      // Force a re-apply even when the same action is triggered twice in a
      // row (e.g. two quick feeds) so the fx overlay animation restarts.
      appliedKey = null;
      sync();
      const lifetime = Number.isFinite(durationMs) && durationMs > 0
        ? durationMs
        : ACTION_DURATIONS_MS[name] || 1200;
      actionTimer = setTimeout(() => {
        actionTimer = null;
        current.activity = null;
        sync();
      }, lifetime);
    };

    return {
      current,
      sync,
      setMode(mode) {
        current.mode = mode;
        sync();
      },
      setState(state) {
        current.state = state;
        sync();
      },
      setListening(listening) {
        current.listening = listening === true;
        sync();
      },
      setHeld(held) {
        current.held = held === true;
        sync();
      },
      setMoving(moving) {
        current.moving = moving === true;
        sync();
      },
      playAction,
      stopAction,
    };
  };

  /*
   * Manifest for the assets shipped alongside. `sprites` lists every GIF
   * frame set (pet.js preloads them so state swaps never flicker); the SVG
   * files are <symbol> collections that pet.js inlines into #cp-sprites so
   * <use href="#ctrl-*"> / <use href="#icon-*"> / <use href="#fx-*">
   * resolve offline.
   */
  const ASSETS = Object.freeze({
    stylesheet: 'assets/pet-sprite.css',
    sprites: Object.freeze({
      idle: IDLE_SRC,
      interact: INTERACT_SRC,
      sleep: SLEEP_SRC,
      eat: EAT_SRC,
      work: WORK_SRC,
      walk: WALK_SRC,
      climb: CLIMB_SRC,
      raised: RAISED_SRC,
      poor: POOR_SRC,
      ill: ILL_SRC,
      happy: HAPPY_SRC,
      levelup: LEVELUP_SRC,
    }),
    controls: Object.freeze({
      file: 'assets/controls-echo.svg',
      symbolPrefix: 'ctrl-',
      icons: Object.freeze(['previous', 'next', 'play', 'pause']),
    }),
    ui: Object.freeze({
      file: 'assets/ui-icons.svg',
      symbolPrefix: 'icon-',
      icons: Object.freeze(['shop', 'stats', 'work', 'sleep', 'food', 'coin', 'dance']),
    }),
    fx: Object.freeze({
      file: 'assets/fx-icons.svg',
      symbolPrefix: 'fx-',
      icons: Object.freeze(['zzz', 'note', 'sparkle', 'crumb', 'dizzy', 'gear']),
    }),
  });

  root.petStates = Object.freeze({
    VISUAL_STATES,
    ANIM_CLASSES,
    FX_CLASSES,
    FX_GLYPHS,
    MODE_TO_VISUAL,
    ACTION_DURATIONS_MS,
    ASSETS,
    resolveVisualState,
    applyVisualState,
    ensureFxLayer,
    createController,
  });
})();
