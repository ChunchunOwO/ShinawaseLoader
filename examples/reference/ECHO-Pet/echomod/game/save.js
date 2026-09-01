'use strict';

/*
 * Save / load for the classic pet game state.
 * Persists to localStorage under a versioned key, autosaves on an interval
 * and on page unload.
 */
(() => {
  const root = (window.EchoClassicPet = window.EchoClassicPet || {});

  const SAVE_KEY = 'echo.classic-pet.save.v1';
  const AUTOSAVE_INTERVAL_MS = 30000;

  const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

  const sanitize = (raw, petName) => {
    const base = root.defaultSave(petName);
    if (!raw || typeof raw !== 'object') return base;
    const out = { ...base };
    for (const key of Object.keys(base)) {
      const value = raw[key];
      if (value === undefined) continue;
      if (isFiniteNumber(base[key]) && !isFiniteNumber(value)) continue;
      out[key] = value;
    }
    out.name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : base.name;
    out.buyTimes = raw.buyTimes && typeof raw.buyTimes === 'object' ? raw.buyTimes : {};
    out.stats = { ...base.stats, ...(raw.stats && typeof raw.stats === 'object' ? raw.stats : {}) };
    if (!['nomal', 'work', 'sleep'].includes(out.state)) out.state = 'nomal';
    if (!root.MODES.includes(out.mode)) out.mode = 'nomal';
    if (out.nowWork && (typeof out.nowWork !== 'object' || !out.nowWork.id)) out.nowWork = null;
    // A save that was mid-work but is now long past the finish time resolves
    // on the first checkWorkFinish() call after load.
    return out;
  };

  const load = (petName) => {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return sanitize(null, petName);
      return sanitize(JSON.parse(raw), petName);
    } catch (error) {
      console.warn('[classic-pet] save load failed, starting fresh', error);
      return sanitize(null, petName);
    }
  };

  const persist = (save) => {
    try {
      save.savedAt = Date.now();
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      return true;
    } catch (error) {
      console.warn('[classic-pet] save persist failed', error);
      return false;
    }
  };

  const reset = () => {
    try { window.localStorage.removeItem(SAVE_KEY); } catch { /* best effort */ }
  };

  const attachAutosave = (engine) => {
    const timer = window.setInterval(() => persist(engine.save), AUTOSAVE_INTERVAL_MS);
    const onUnload = () => persist(engine.save);
    window.addEventListener('beforeunload', onUnload);
    // Milestone events save immediately so progress survives crashes.
    engine.on('workend', () => persist(engine.save));
    engine.on('levelup', () => persist(engine.save));
    engine.on('eat', () => persist(engine.save));
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', onUnload);
    };
  };

  root.saveStore = { SAVE_KEY, load, persist, reset, attachAutosave };
})();
