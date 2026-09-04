/**
 * ECHO Lyrics Match Whitebox
 *
 * Restores drawer rematch + optional candidate panel, but does NOT auto-pop a
 * floating overlay on every track change. Entry point is a persistent
 * top-right lyrics-settings icon on the lyrics page → opens the official
 * right-side drawer (same as ECHODev / titlebar「歌词设置」).
 *
 * Does not patch ECHO / ECHOSteam source.
 */
const external = echoExternalMod;
const config = external.config && typeof external.config === 'object' ? external.config : {};

/** Legacy: force-enable floating candidate panel. Default OFF — auto-pop is the bug. */
const forceEnable = config.forceEnable === true;
/** Re-enable if something else clears the flag. Only meaningful with forceEnable. */
const keepForced = config.keepForced === true;
/** On boot, clear a previously forced auto-open so play no longer pops the overlay. */
const disableAutoOpenOnBoot = config.disableAutoOpenOnBoot !== false;
const injectToggle = config.injectToggle !== false;
const injectRematch = config.injectRematch !== false;
/** Keep drawer open on rematch so matching stays in the side drawer (ECHODev-style). */
const closeDrawerOnRematch = config.closeDrawerOnRematch === true;
/** Never inject a floating corner blob; lyrics settings already lives in the titlebar. */
const injectCornerIcon = config.injectCornerIcon === true;
const notify = config.notify !== false;

const chinese = (() => {
  const configured = String(config.locale || 'auto');
  const lang = String(document.documentElement.lang || navigator.language || '');
  return configured === 'zh-CN'
    || (configured !== 'en-US' && lang.toLowerCase().startsWith('zh'));
})();

const copy = {
  toastOn: chinese
    ? '歌词匹配白盒：已开启自动弹出候选（播放时会盖住歌词页）。'
    : 'Lyrics match white-box: auto-open candidates enabled (covers the lyrics page while playing).',
  toastOff: chinese
    ? '歌词匹配改为右上角图标进入抽屉，播放时不再自动弹出浮层。'
    : 'Lyrics matching uses the top-right icon → drawer; no auto overlay while playing.',
  toggleLabel: chinese ? '自动打开候选' : 'Auto open lyrics chooser',
  toggleHint: chinese
    ? '网络匹配时在歌词页弹出候选浮层。默认关闭；需要时在抽屉里手动打开。'
    : 'Show the floating candidate panel during network matching. Off by default.',
  rematchTitle: chinese ? '重新匹配' : 'Rematch lyrics',
  rematchHint: chinese
    ? '清理当前缓存并重新查找'
    : 'Clear the current cache and search again',
  rematchAction: chinese ? '匹配' : 'Match',
  rematchBusy: chinese ? '匹配中…' : 'Matching…',
  rematchToast: chinese
    ? '已开始重新匹配，请在抽屉「匹配」页查看结果。'
    : 'Rematch started — check the Match tab in the drawer.',
  cornerIconLabel: chinese ? '歌词设置' : 'Lyrics settings',
  cornerIconTitle: chinese
    ? '打开歌词设置抽屉（匹配 / 显示 / 桌面 / 高级）'
    : 'Open lyrics settings drawer (Match / Display / Desktop / Advanced)',
};

const TOGGLE_HOST = 'data-echo-lmwb-host';
const TOGGLE_INPUT = 'data-echo-lmwb-input';
const REMATCH_HOST = 'data-echo-lmwb-rematch';
const CORNER_HOST = 'data-echo-lmwb-corner';
const STYLE_HOST = 'data-echo-lmwb-style';
const SETTING_KEY = 'lyricsCandidatePanelAutoOpenEnabled';
const REMATCH_EVENT = 'lyrics:rematch-requested';
const OPEN_DRAWER_EVENT = 'app:open-lyrics-settings';

/**
 * Steam/asar sometimes clips match-panel actions; also keep our drawer injects
 * from stretching host audio-device-pill / engine-meter grids.
 * Keep the official lyrics settings drawer docked to the right (ECHODev-style).
 */
const PANEL_LAYOUT_CSS = `
.lyrics-match-panel {
  pointer-events: auto !important;
  z-index: 12 !important;
}
.lyrics-match-panel .lyrics-candidate {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto !important;
  grid-template-areas:
    "copy footer"
    "badges footer"
    "preview preview"
    "warning warning" !important;
  align-items: start !important;
  overflow: visible !important;
  pointer-events: auto !important;
  min-height: 0 !important;
  height: auto !important;
  padding: 8px 9px !important;
  column-gap: 10px !important;
  row-gap: 5px !important;
}
.lyrics-match-panel .lyrics-candidate-copy { grid-area: copy !important; min-width: 0 !important; }
.lyrics-match-panel .lyrics-candidate-copy em {
  white-space: normal !important;
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;
  overflow: hidden !important;
  line-height: 1.35 !important;
}
.lyrics-match-panel .lyrics-candidate-badges {
  grid-area: badges !important;
  flex-wrap: wrap !important;
  max-width: 100% !important;
  max-height: 40px !important;
  overflow: hidden !important;
  min-width: 0 !important;
}
.lyrics-match-panel .lyrics-candidate-badges small {
  max-width: 100% !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
.lyrics-match-panel .lyrics-candidate-badges .lyrics-reason-badge ~ .lyrics-reason-badge {
  display: none !important;
}
.lyrics-match-panel .lyrics-candidate-preview {
  grid-area: preview !important;
  min-width: 0 !important;
  max-height: 4.8em !important;
  overflow: hidden !important;
  margin: 0 !important;
}
.lyrics-match-panel .lyrics-candidate-warning {
  grid-area: warning !important;
  min-width: 0 !important;
}
.lyrics-match-panel .lyrics-candidate-footer {
  grid-area: footer !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-end !important;
  align-self: start !important;
  justify-self: end !important;
  position: relative !important;
  z-index: 2 !important;
  pointer-events: auto !important;
}
.lyrics-match-panel .lyrics-candidate-actions,
.lyrics-match-panel .lyrics-candidate-actions button {
  position: relative !important;
  z-index: 2 !important;
  pointer-events: auto !important;
  touch-action: manipulation !important;
}
.lyrics-match-panel__results .lyrics-candidate-list {
  min-height: 0 !important;
  overflow: auto !important;
}

/* Drawer injects: clamp like host pills so long copy cannot blow the grid. */
.lyrics-settings-drawer button[data-echo-lmwb-rematch] {
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}
.lyrics-settings-drawer button[data-echo-lmwb-rematch] > span {
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: hidden !important;
}
.lyrics-settings-drawer button[data-echo-lmwb-rematch] strong,
.lyrics-settings-drawer button[data-echo-lmwb-rematch] small {
  display: block !important;
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
.lyrics-settings-drawer label[data-echo-lmwb-host] {
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}
.lyrics-settings-drawer label[data-echo-lmwb-host] > span {
  min-width: 0 !important;
}
.lyrics-settings-drawer label[data-echo-lmwb-host] small {
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;
  overflow: hidden !important;
  white-space: normal !important;
}

/* Keep lyrics settings as a right-side drawer, not a centered floating card. */
.lyrics-settings-drawer-root.audio-drawer-root {
  position: fixed !important;
  inset: 0 !important;
  z-index: 130 !important;
  pointer-events: none !important;
}
.lyrics-settings-drawer-root[data-open="true"] {
  pointer-events: auto !important;
}
.lyrics-settings-drawer-root .audio-drawer.lyrics-settings-drawer {
  position: absolute !important;
  top: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  left: auto !important;
  width: min(460px, calc(100vw - 18px)) !important;
  max-width: min(460px, calc(100vw - 18px)) !important;
  height: auto !important;
  margin: 0 !important;
  border-radius: 30px 0 0 30px !important;
  transform-origin: right center !important;
}

/* Default: never paint the leftover circular blob. Official titlebar already has 歌词设置. */
button[data-echo-lmwb-corner],
button.echo-mv-corner {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
  width: 0 !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  opacity: 0 !important;
}
`;

let disposed = false;
let enabling = false;
/** Ignore settings events caused by our own writes. */
let selfWriteDepth = 0;
/** User turned the setting off via our injected toggle this session. */
let userOptedOut = false;
let lastNotified = false;
let cachedEnabled = null;
let injectTimer = 0;
let bootTimer = 0;
let bootAttempts = 0;
let rematchBusy = false;
let cornerSyncTimer = 0;

const cleanups = [];
const MAX_BOOT_ATTEMPTS = 20;
const BOOT_RETRY_MS = 500;
const INJECT_DEBOUNCE_MS = 200;
const needsDomInject = injectToggle || injectRematch || injectCornerIcon;

const getApp = () => {
  const fromExternal = external.echo?.app;
  if (fromExternal?.getSettings && fromExternal?.setSettings) return fromExternal;
  const fromWindow = window.echo?.app;
  if (fromWindow?.getSettings && fromWindow?.setSettings) return fromWindow;
  return null;
};

const isEnabledValue = (value) => value === true;

const readEnabled = async () => {
  const app = getApp();
  if (!app) return null;
  try {
    const settings = await app.getSettings();
    return isEnabledValue(settings?.[SETTING_KEY]);
  } catch {
    return null;
  }
};

const dispatchDisplay = (enabled) => {
  window.dispatchEvent(new CustomEvent('lyrics:display-settings-changed', {
    detail: { [SETTING_KEY]: enabled === true },
  }));
};

const dispatchSettings = (enabled) => {
  const detail = { [SETTING_KEY]: enabled === true };
  window.dispatchEvent(new CustomEvent('settings:changed', { detail }));
  window.dispatchEvent(new CustomEvent('lyrics:display-settings-changed', { detail }));
};

const writeEnabled = async (enabled) => {
  const app = getApp();
  if (!app) return null;
  const next = enabled === true;
  const previous = cachedEnabled;
  selfWriteDepth += 1;
  try {
    cachedEnabled = next;
    syncInjectedInputs(next);
    dispatchDisplay(next);

    const saved = await app.setSettings({ [SETTING_KEY]: next });
    const confirmed = saved && typeof saved === 'object'
      ? isEnabledValue(saved[SETTING_KEY])
      : next;
    cachedEnabled = confirmed;
    syncInjectedInputs(confirmed);
    dispatchSettings(confirmed);
    return confirmed;
  } catch (error) {
    cachedEnabled = typeof previous === 'boolean' ? previous : null;
    if (typeof cachedEnabled === 'boolean') {
      syncInjectedInputs(cachedEnabled);
      dispatchSettings(cachedEnabled);
    }
    try { external.log?.warn?.('[lyrics-match-whitebox] enable failed', error); } catch {}
    throw error;
  } finally {
    selfWriteDepth = Math.max(0, selfWriteDepth - 1);
  }
};

const syncInjectedInputs = (enabled) => {
  if (typeof enabled !== 'boolean') return;
  for (const input of document.querySelectorAll(`input[${TOGGLE_INPUT}]`)) {
    if (input.checked !== enabled) input.checked = enabled;
  }
};

const closeFloatingMatchPanel = () => {
  try {
    const close = document.querySelector('.lyrics-match-panel .lyrics-match-close, .lyrics-match-panel button[aria-label*="Close" i], .lyrics-match-panel button[title*="Close" i]');
    if (close && typeof close.click === 'function') {
      close.click();
      return true;
    }
  } catch {}
  return false;
};

const ensureEnabled = async ({ quiet = false } = {}) => {
  if (!forceEnable || userOptedOut || disposed || enabling) return false;
  const app = getApp();
  if (!app) return false;

  enabling = true;
  try {
    const current = await readEnabled();
    if (disposed || userOptedOut) return false;
    if (current === null) return false;
    cachedEnabled = current;
    if (current === true) {
      syncInjectedInputs(true);
      return true;
    }

    const confirmed = await writeEnabled(true);
    if (confirmed === true && !quiet && notify && !lastNotified && !disposed) {
      lastNotified = true;
      try { external.toast?.(copy.toastOn); } catch {}
    }
    return confirmed === true;
  } catch (error) {
    try { external.log?.warn?.('[lyrics-match-whitebox] enable failed', error); } catch {}
    return false;
  } finally {
    enabling = false;
  }
};

/** Clear a previously forced auto-open so play no longer covers the lyrics page. */
const ensureAutoOpenDisabled = async ({ quiet = false } = {}) => {
  if (forceEnable || disposed || enabling) return false;
  if (!disableAutoOpenOnBoot) return false;
  const app = getApp();
  if (!app) return false;

  enabling = true;
  try {
    const current = await readEnabled();
    if (disposed) return false;
    if (current === null) return false;
    cachedEnabled = current;
    if (current === false) {
      syncInjectedInputs(false);
      closeFloatingMatchPanel();
      return true;
    }

    const confirmed = await writeEnabled(false);
    closeFloatingMatchPanel();
    if (confirmed === false && !quiet && notify && !lastNotified && !disposed) {
      lastNotified = true;
      try { external.toast?.(copy.toastOff); } catch {}
    }
    return confirmed === false;
  } catch (error) {
    try { external.log?.warn?.('[lyrics-match-whitebox] disable auto-open failed', error); } catch {}
    return false;
  } finally {
    enabling = false;
  }
};

const scheduleBoot = () => {
  if (disposed) return;
  if (!forceEnable && !disableAutoOpenOnBoot) return;
  if (bootTimer) window.clearTimeout(bootTimer);
  bootTimer = window.setTimeout(async () => {
    bootTimer = 0;
    if (disposed) return;
    const ok = forceEnable
      ? await ensureEnabled({ quiet: bootAttempts > 0 })
      : await ensureAutoOpenDisabled({ quiet: bootAttempts > 0 });
    bootAttempts += 1;
    if (ok || disposed || bootAttempts >= MAX_BOOT_ATTEMPTS) return;
    if (forceEnable && userOptedOut) return;
    scheduleBoot();
  }, bootAttempts === 0 ? 0 : BOOT_RETRY_MS);
};

const onSettingsEvent = (event) => {
  if (disposed) return;
  if (selfWriteDepth > 0) return;

  const detail = event?.detail;
  const hasKey = detail
    && typeof detail === 'object'
    && !Array.isArray(detail)
    && Object.prototype.hasOwnProperty.call(detail, SETTING_KEY);

  if (hasKey) {
    const enabled = isEnabledValue(detail[SETTING_KEY]);
    cachedEnabled = enabled;
    syncInjectedInputs(enabled);
    if (enabled) {
      userOptedOut = false;
      return;
    }
    if (keepForced && forceEnable && !userOptedOut) {
      void ensureEnabled({ quiet: true });
    }
    return;
  }

  void (async () => {
    const enabled = await readEnabled();
    if (disposed || enabled === null) return;
    cachedEnabled = enabled;
    syncInjectedInputs(enabled);
    if (enabled) {
      userOptedOut = false;
      return;
    }
    if (keepForced && forceEnable && !userOptedOut) {
      await ensureEnabled({ quiet: true });
    }
  })();
};

const findInjectAnchor = () => {
  const automation = document.querySelector(
    '.lyrics-settings-drawer .lyrics-current-track-section .lyrics-current-track-automation',
  );
  if (automation) return { parent: automation, after: null };

  const threshold = document.querySelector(
    '.lyrics-settings-master-section__details .lyrics-match-threshold-control, '
    + '.lyrics-display-panel .lyrics-match-threshold-control, '
    + '.lyrics-match-threshold-control',
  );
  if (threshold?.parentElement) {
    return { parent: threshold.parentElement, after: threshold };
  }

  const details = document.querySelector(
    '#settings-subsection-lyrics-display .lyrics-settings-master-section__details',
  );
  if (details) return { parent: details, after: null };

  return null;
};

const buildToggleRow = (enabled) => {
  const row = document.createElement('label');
  row.className = 'audio-toggle-row';
  row.setAttribute(TOGGLE_HOST, '1');
  row.style.minWidth = '0';

  const text = document.createElement('span');
  text.style.minWidth = '0';
  const title = document.createElement('strong');
  title.textContent = copy.toggleLabel;
  const hint = document.createElement('small');
  hint.textContent = copy.toggleHint;
  text.append(title, hint);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute(TOGGLE_INPUT, '1');
  input.setAttribute('aria-label', copy.toggleLabel);
  input.checked = enabled === true;

  input.addEventListener('change', () => {
    const want = input.checked === true;
    userOptedOut = !want;
    void (async () => {
      try {
        const confirmed = await writeEnabled(want);
        if (confirmed === null) {
          input.checked = cachedEnabled === true;
          return;
        }
        if (confirmed !== want) {
          input.checked = confirmed;
          userOptedOut = !confirmed;
        }
        if (!confirmed) closeFloatingMatchPanel();
      } catch (error) {
        try { external.log?.warn?.('[lyrics-match-whitebox] toggle failed', error); } catch {}
        input.checked = cachedEnabled === true;
      }
    })();
  });

  row.append(text, input);
  return row;
};

const closeLyricsSettingsDrawer = () => {
  const selectors = [
    '.lyrics-settings-drawer button[aria-label*="Close" i]',
    '.lyrics-settings-drawer button[aria-label*="关闭"]',
    '.lyrics-settings-drawer [data-drawer-close]',
    '.lyrics-settings-drawer .lyrics-settings-close',
    '.audio-drawer-close',
  ];
  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button && typeof button.click === 'function') {
      button.click();
      return true;
    }
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  return false;
};

const openLyricsSettingsDrawer = () => {
  window.dispatchEvent(new Event(OPEN_DRAWER_EVENT));
};

const isLyricsSettingsDrawerOpen = () => {
  const root = document.querySelector('.lyrics-settings-drawer-root');
  return root?.getAttribute('data-open') === 'true';
};

const requestRematch = async () => {
  if (disposed || rematchBusy) return;
  rematchBusy = true;
  setRematchBusy(true);
  try {
    if (forceEnable && !userOptedOut) {
      await ensureEnabled({ quiet: true });
    }
    window.dispatchEvent(new Event(REMATCH_EVENT));
    if (notify) {
      try { external.toast?.(copy.rematchToast); } catch {}
    }
    if (closeDrawerOnRematch) {
      window.setTimeout(() => {
        if (!disposed) closeLyricsSettingsDrawer();
      }, 80);
    }
  } catch (error) {
    try { external.log?.warn?.('[lyrics-match-whitebox] rematch failed', error); } catch {}
  } finally {
    window.setTimeout(() => {
      rematchBusy = false;
      if (!disposed) setRematchBusy(false);
    }, 600);
  }
};

const setRematchBusy = (busy) => {
  for (const button of document.querySelectorAll(`button[${REMATCH_HOST}]`)) {
    button.disabled = busy;
    const action = button.querySelector('em');
    if (action) action.textContent = busy ? copy.rematchBusy : copy.rematchAction;
  }
};

const buildRematchButton = () => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'audio-device-pill lyrics-current-track-action';
  button.setAttribute(REMATCH_HOST, '1');
  button.setAttribute('aria-label', copy.rematchTitle);

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '15');
  icon.setAttribute('height', '15');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8');
  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('d', 'M3 3v5h5');
  icon.append(path1, path2);

  const copyWrap = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = copy.rematchTitle;
  const hint = document.createElement('small');
  hint.textContent = copy.rematchHint;
  copyWrap.append(title, hint);

  const action = document.createElement('em');
  action.textContent = copy.rematchAction;

  button.append(icon, copyWrap, action);
  button.addEventListener('click', () => {
    void requestRematch();
  });
  return button;
};

const buildCornerIcon = () => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute(CORNER_HOST, '1');
  button.setAttribute('aria-label', copy.cornerIconLabel);
  button.title = copy.cornerIconTitle;
  button.setAttribute('data-active', isLyricsSettingsDrawerOpen() ? 'true' : 'false');

  // Captions-style icon (matches ECHODev titlebar lyrics-settings).
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', '18');
  rect.setAttribute('height', '14');
  rect.setAttribute('x', '3');
  rect.setAttribute('y', '5');
  rect.setAttribute('rx', '2');
  rect.setAttribute('ry', '2');
  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line1.setAttribute('d', 'M7 15h4M15 15h2M7 11h2M13 11h4');
  icon.append(rect, line1);
  button.append(icon);

  button.addEventListener('click', (event) => {
    try { event?.preventDefault?.(); } catch {}
    try { event?.stopPropagation?.(); } catch {}
    if (isLyricsSettingsDrawerOpen()) {
      closeLyricsSettingsDrawer();
    } else {
      openLyricsSettingsDrawer();
    }
    window.setTimeout(() => syncCornerIconState(), 120);
  });
  return button;
};

const syncCornerIconState = () => {
  const button = document.querySelector(`button[${CORNER_HOST}]`);
  if (!button || typeof button.setAttribute !== 'function') return;
  button.setAttribute('data-active', isLyricsSettingsDrawerOpen() ? 'true' : 'false');
};

const injectToggleRow = () => {
  if (!injectToggle || disposed) return;

  const existing = document.querySelector(`[${TOGGLE_HOST}]`);
  const anchor = findInjectAnchor();
  if (!anchor) {
    existing?.remove();
    return;
  }

  if (existing && existing.parentElement === anchor.parent) {
    if (typeof cachedEnabled === 'boolean') syncInjectedInputs(cachedEnabled);
    return;
  }

  existing?.remove();
  const enabled = cachedEnabled === true;
  const row = buildToggleRow(enabled);
  if (anchor.after && anchor.after.parentElement === anchor.parent) {
    anchor.after.insertAdjacentElement('afterend', row);
  } else {
    anchor.parent.append(row);
  }

  if (cachedEnabled === null) {
    void (async () => {
      const value = await readEnabled();
      if (disposed || value === null) return;
      cachedEnabled = value;
      syncInjectedInputs(value);
    })();
  }
};

const injectRematchButton = () => {
  if (!injectRematch || disposed) return;

  const actions = document.querySelector('.lyrics-current-track-section .lyrics-current-track-actions');
  const existing = document.querySelector(`button[${REMATCH_HOST}]`);
  if (!actions) {
    existing?.remove();
    return;
  }

  if (existing && existing.parentElement === actions) {
    existing.disabled = rematchBusy;
    return;
  }

  existing?.remove();
  const button = buildRematchButton();
  if (rematchBusy) button.disabled = true;
  actions.insertBefore(button, actions.firstChild);
};

const injectCornerButton = () => {
  document.querySelectorAll(`button[${CORNER_HOST}], button.echo-mv-corner`).forEach((node) => {
    try { node.remove(); } catch {}
  });
};

const injectPanelLayoutCss = () => {
  if (disposed) return false;
  let style = document.querySelector(`style[${STYLE_HOST}]`);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute(STYLE_HOST, '1');
    const host = document.head || document.documentElement || document.body;
    if (!host) return false;
    host.appendChild(style);
  }
  if (style.textContent !== PANEL_LAYOUT_CSS) {
    style.textContent = PANEL_LAYOUT_CSS;
  }
  return (style.textContent || '').length > 100;
};

const injectAll = () => {
  if (disposed) return;
  injectPanelLayoutCss();
  injectToggleRow();
  injectRematchButton();
  injectCornerButton();
};

const scheduleInject = () => {
  if (!needsDomInject || disposed) return;
  if (injectTimer) window.clearTimeout(injectTimer);
  injectTimer = window.setTimeout(() => {
    injectTimer = 0;
    if (!disposed) injectAll();
  }, INJECT_DEBOUNCE_MS);
};

window.addEventListener('settings:changed', onSettingsEvent);
window.addEventListener('lyrics:display-settings-changed', onSettingsEvent);
cleanups.push(() => {
  window.removeEventListener('settings:changed', onSettingsEvent);
  window.removeEventListener('lyrics:display-settings-changed', onSettingsEvent);
});

if (needsDomInject) {
  const observer = new MutationObserver(() => {
    if (disposed) return;
    scheduleInject();
    if (cornerSyncTimer) window.clearTimeout(cornerSyncTimer);
    cornerSyncTimer = window.setTimeout(() => {
      cornerSyncTimer = 0;
      if (!disposed) syncCornerIconState();
    }, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-open', 'class'] });
  cleanups.push(() => observer.disconnect());
}

injectPanelLayoutCss();
scheduleBoot();
scheduleInject();
// Re-assert CSS shortly after boot — loader re-inject / page transitions can drop the tag.
window.setTimeout(() => { if (!disposed) injectPanelLayoutCss(); }, 800);
window.setTimeout(() => { if (!disposed) injectPanelLayoutCss(); }, 2500);

return () => {
  disposed = true;
  if (bootTimer) window.clearTimeout(bootTimer);
  if (injectTimer) window.clearTimeout(injectTimer);
  if (cornerSyncTimer) window.clearTimeout(cornerSyncTimer);
  for (const cleanup of cleanups.splice(0)) {
    try { cleanup(); } catch {}
  }
  for (const node of document.querySelectorAll(`[${TOGGLE_HOST}], button[${REMATCH_HOST}], button[${CORNER_HOST}], style[${STYLE_HOST}]`)) {
    try { node.remove(); } catch {}
  }
};
