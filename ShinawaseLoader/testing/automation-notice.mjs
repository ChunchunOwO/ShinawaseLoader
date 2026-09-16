// A temporary renderer notice owned by live testing clients, never by the loader.
import { randomUUID } from 'node:crypto';

// Serialized into the connected renderer. Keep this function self-contained.
const updateNotice = (sessionId, remove = false) => {
  const key = '__shinawaseTestingAutomationNotice';
  let state = window[key];
  if (remove) {
    if (state) {
      state.sessions.delete(sessionId);
      state.update();
    }
    return true;
  }
  if (!state) {
    const node = document.createElement('div');
    node.id = 'shinawase-testing-automation-notice';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.style.cssText = `
      all: initial !important; position: fixed !important;
      top: 8px !important; left: 50% !important; transform: translateX(-50%) !important;
      z-index: 2147483647 !important; display: block !important;
      width: max-content !important; max-width: calc(100% - 32px) !important;
      box-sizing: border-box !important;
      padding: 8px 16px !important; border: 1px solid #d97706 !important;
      border-radius: 8px !important; background: #fef3c7 !important; color: #78350f !important;
      box-shadow: 0 2px 10px #0003 !important;
      font: 600 14px/1.4 "Segoe UI", "Microsoft YaHei", sans-serif !important;
      text-align: center !important; pointer-events: none !important;
      user-select: none !important; -webkit-app-region: no-drag !important;
    `;
    state = { sessions: new Map(), node, timer: null };
    state.update = () => {
      const now = Date.now();
      for (const [id, expiresAt] of state.sessions) {
        if (expiresAt <= now) state.sessions.delete(id);
      }
      if (!state.sessions.size) {
        clearInterval(state.timer);
        node.remove();
        if (window[key] === state) delete window[key];
        return;
      }
      const language = document.documentElement.lang || navigator.language || 'en';
      const message = /^zh\b/i.test(language)
        ? '本实例正在用于自动化测试'
        : 'This instance is being used for automated testing';
      if (node.textContent !== message) node.textContent = message;
      if (!node.isConnected) (document.body || document.documentElement).append(node);
    };
    window[key] = state;
    state.timer = setInterval(state.update, 1000);
  }
  // A crashed/disconnected test runner cannot leave a permanent badge behind.
  state.sessions.set(sessionId, Date.now() + 10000);
  state.update();
  return state.node.isConnected;
};

/** Show the notice until the returned async disposer is called. */
export const startAutomationNotice = async (renderer) => {
  const sessionId = randomUUID();
  const expression = (remove) => `(${updateNotice.toString()})(${JSON.stringify(sessionId)}, ${remove})`;
  let stopped = false;
  let pending = null;
  const refresh = () => {
    if (stopped) return Promise.resolve();
    if (!pending) {
      pending = renderer.evalValue(expression(false), { awaitPromise: false })
        .then((visible) => {
          if (visible !== true) throw new Error('automation notice could not be mounted');
        })
        .finally(() => { pending = null; });
    }
    return pending;
  };
  try {
    await refresh();
  } catch (error) {
    await renderer.evalValue(expression(true), { awaitPromise: false }).catch(() => undefined);
    throw error;
  }
  // Refresh also remounts the notice after a renderer reload. No persistent
  // preload/new-document script is installed, including after a runner crash.
  const heartbeat = setInterval(() => { refresh().catch(() => undefined); }, 2000);
  heartbeat.unref?.();
  return async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    // Drain an in-flight refresh so it cannot recreate the notice after removal.
    await pending?.catch(() => undefined);
    await renderer.evalValue(expression(true), { awaitPromise: false });
  };
};
