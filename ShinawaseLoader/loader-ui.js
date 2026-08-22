if (window.__echoExternalLoaderUi?.version >= 15) return 'already';
window.__echoExternalLoaderUi?.dispose?.();

const base = 'http://127.0.0.1:' + LOADER_PORT;
let modsPanel = null;
let loaderPanel = null;
let configModal = null;
let activeNav = null;
let activeSidebar = null;
let loaderGroup = null;
let loaderNav = null;
let loaderButton = null;
let modsButton = null;
const sidebarEntries = new Map();
const sidebarButtons = new Map();
const sidebarPages = new Map();
let searchQuery = '';
let currentFilter = 'all';
let statusTimer = 0;
let injectPopupTimer = 0;
let injectPopupShown = false;

const css = document.createElement('style');
css.id = 'echo-loader-ui-style';
css.textContent = `
  .echo-external-mod-panel, .echo-external-loader-panel {
    grid-row: 2; grid-column: 2; min-width: 0; min-height: 0; z-index: 1;
    overflow: auto; position: relative;
    background: var(--theme-page-bg, var(--color-bg, #f6f6f7));
    color: var(--theme-page-text, var(--color-text, #2d3036));
    font-family: var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif);
  }
  .echo-external-mod-panel[hidden], .echo-external-loader-panel[hidden], .echo-external-mod-page[hidden] { display: none !important; }
  .echo-external-mod-page {
    grid-row: 2; grid-column: 2; min-width: 0; min-height: 0; overflow: auto;
    background: var(--theme-page-bg, var(--color-bg, #f6f6f7));
  }
  .echo-toast {
    position: fixed; right: 20px; bottom: calc(var(--player-height, 112px) + 12px); z-index: 50;
    padding: 10px 16px; border-radius: var(--radius-md, 8px);
    background: var(--theme-panel-bg-strong, #fff);
    color: var(--theme-page-text, inherit);
    border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1));
    box-shadow: var(--shadow-soft, 0 20px 56px rgba(36,39,48,0.08));
    font: 500 13px inherit; pointer-events: none;
  }
  .echo-toast.error { color: var(--theme-danger-text, #c23b32); }
  .echo-toast.success { color: var(--theme-success-text, #2f7d57); }
  .echo-config-overlay { position: fixed; inset: 0; z-index: 240; display: grid; place-items: center; background: rgba(16,19,24,0.48); padding: 24px; }
  .echo-config-card {
    width: min(560px, calc(100vw - 48px)); max-height: calc(100vh - 120px); overflow: auto;
    display: flex; flex-direction: column; gap: 0;
    background: var(--theme-panel-bg, #fff); color: var(--theme-page-text, inherit);
    border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1));
    border-radius: var(--radius-md, 8px); box-shadow: var(--shadow-panel, 0 10px 28px rgba(36,39,48,0.12));
  }
  .echo-config-card header, .echo-config-card footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; }
  .echo-config-card header strong { font-size: 15px; }
  .echo-config-body { display: grid; gap: 12px; padding: 0 20px 16px; }
  .echo-config-field { display: grid; gap: 6px; font-size: 13px; }
  .echo-config-field span { color: var(--theme-muted-text, #6c7179); }
  .echo-config-field input, .echo-config-field select, .echo-config-json {
    width: 100%; min-height: 36px; padding: 8px 10px; box-sizing: border-box;
    border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
    border-radius: var(--radius-sm, 6px);
    background: var(--theme-field-bg, rgba(255,255,255,0.92));
    color: inherit; font: 13px inherit;
  }
  .echo-config-json { min-height: 220px; font: 12px/1.45 var(--font-mono, ui-monospace, Consolas, monospace); resize: vertical; }
  .echo-config-error { margin: 0; min-height: 1.2em; color: var(--theme-danger-text, #c23b32); font-size: 12px; }
  .echo-log-view {
    min-height: 220px; max-height: 360px; overflow: auto; white-space: pre-wrap;
    font: 12px var(--font-mono, ui-monospace, Consolas, monospace);
    background: var(--theme-field-bg, rgba(255,255,255,0.82));
    border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
    border-radius: var(--radius-sm, 6px); padding: 12px;
  }
  .echo-mod-page {
    display: flex; flex-direction: column; gap: 16px; min-height: 100%;
    padding: 28px 32px 120px; box-sizing: border-box;
  }
  .echo-mod-header {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  }
  .echo-mod-header h1 { margin: 6px 0 0; font-size: 28px; line-height: 1.15; }
  .echo-mod-header p { margin: 8px 0 0; max-width: 62ch; color: var(--theme-muted-text, #6c7179); }
  .echo-mod-actions { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; flex: none; }
  .echo-mod-toolbar {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .echo-mod-toolbar .echo-search-box {
    flex: 1 1 240px; min-width: 180px; height: 36px; padding: 0 12px;
    border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
    border-radius: var(--radius-sm, 6px);
    background: var(--theme-field-bg, rgba(255,255,255,0.82));
    color: inherit; font: 13px inherit;
  }
  .echo-mod-filters { display: flex; flex-wrap: wrap; gap: 8px; }
  .echo-mod-drop {
    display: flex; align-items: center; justify-content: center;
    min-height: 44px; padding: 10px 14px; cursor: pointer;
    border: 1px dashed var(--theme-panel-border, rgba(38,40,46,0.22));
    border-radius: var(--radius-md, 8px);
    color: var(--theme-muted-text, #6c7179); font-size: 13px;
    background: var(--theme-panel-bg, rgba(255,255,255,0.55));
  }
  .echo-mod-list { display: flex; flex-direction: column; gap: 8px; }
  .echo-mod-row {
    display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 12px; align-items: center;
    min-height: 72px; padding: 12px 14px;
    border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1));
    border-radius: var(--radius-md, 8px); background: var(--theme-panel-bg, #fff);
  }
  .echo-mod-row[data-enabled="true"] { background: var(--theme-list-row-bg-active, var(--theme-accent-bg, rgba(75,85,232,0.06))); }
  .echo-mod-icon {
    width: 44px; height: 44px; border-radius: 10px; flex: none;
    display: grid; place-items: center; font-size: 16px;
    background: var(--theme-accent-bg, rgba(75,85,232,0.08));
    color: var(--theme-heading-text, inherit);
  }
  .echo-mod-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: 10px; display: block; }
  .echo-mod-copy { min-width: 0; }
  .echo-mod-copy strong { display: block; font-size: 14px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .echo-mod-copy em { display: block; margin-top: 3px; color: var(--theme-muted-text, #6c7179); font-size: 12px; font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .echo-mod-copy small { display: block; margin-top: 2px; color: var(--theme-muted-text, #6c7179); font-size: 11px; }
  .echo-mod-row-actions { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; }
  .echo-mod-row-actions button { white-space: nowrap; }
  @media (max-width: 760px) {
    .echo-mod-header, .echo-mod-toolbar { flex-direction: column; align-items: stretch; }
    .echo-mod-actions { justify-content: flex-end; }
    .echo-mod-row { grid-template-columns: 44px minmax(0, 1fr); }
    .echo-mod-row-actions { grid-column: 1 / -1; justify-content: flex-end; }
  }
  [data-echo-external-loader-group] .nav-icon-shell { display: grid; place-items: center; }
  [data-echo-external-loader-group] .nav-icon-shell svg { width: 21px; height: 21px; display: block; }
  .echo-status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
  .echo-debug-console {
    display: grid; grid-template-rows: auto 1fr auto; min-height: 320px; max-height: calc(100vh - 280px);
    border: 1px solid rgba(38,40,46,0.16); border-radius: 8px; overflow: hidden;
    background: #101218; color: #d7deea; font: 12px/1.45 var(--font-mono, ui-monospace, Consolas, monospace);
  }
  .echo-debug-toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 8px 10px; background: #161a22; color: #8b93a7; border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .echo-debug-output {
    margin: 0; padding: 10px 12px; overflow: auto; white-space: pre-wrap; word-break: break-word;
    min-height: 220px; color: #c8d0dc;
  }
  .echo-debug-output .echo-debug-in { color: #9ad4ff; }
  .echo-debug-output .echo-debug-err { color: #ff8b8b; }
  .echo-debug-form {
    display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center;
    padding: 8px 10px; background: #161a22; border-top: 1px solid rgba(255,255,255,0.06);
  }
  .echo-debug-form span { color: #7dffb3; }
  .echo-debug-form input {
    width: 100%; border: 0; outline: none; background: transparent; color: #e8eef7;
    font: inherit; caret-color: #7dffb3;
  }
  .echo-status-chip {
    padding: 12px 14px; border-radius: var(--radius-md, 8px);
    background: var(--theme-panel-bg, #fff); border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1));
  }
  .echo-status-chip small { display: block; color: var(--theme-muted-text, #6c7179); font-size: 11px; }
  .echo-status-chip strong { display: block; margin-top: 4px; color: var(--theme-heading-text, inherit); font-size: 13px; }
  @keyframes shinawaseInjectIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes shinawaseInjectOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(8px); }
  }
  @keyframes shinawaseInjectFill { from { width: 0 } to { width: 100% } }
  .echo-inject-popup {
    position: fixed; right: 20px; bottom: calc(var(--player-height, 112px) + 16px); z-index: 60;
    display: flex; align-items: stretch; gap: 12px; min-width: 240px; padding: 14px 16px; box-sizing: border-box;
    background: var(--theme-panel-bg-strong, var(--theme-panel-bg, #fff));
    color: var(--theme-page-text, inherit);
    border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.12));
    border-radius: var(--radius-md, 10px);
    box-shadow: var(--shadow-panel, 0 12px 32px rgba(20,22,28,0.18));
    font-family: var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif);
    pointer-events: none;
    animation: shinawaseInjectIn 240ms ease-out;
  }
  .echo-inject-popup.echo-inject-popup-out { animation: shinawaseInjectOut 300ms ease-in forwards; }
  .echo-inject-popup-accent {
    width: 4px; flex: none; border-radius: 999px; background: var(--theme-accent, #4b55e8);
  }
  .echo-inject-popup-body { flex: 1; min-width: 0; }
  .echo-inject-popup-title { font-size: 14px; font-weight: 600; line-height: 1.3; }
  .echo-inject-popup-sub { margin-top: 3px; font-size: 12px; color: var(--theme-muted-text, #6c7179); }
  .echo-inject-popup-track {
    margin-top: 10px; height: 4px; border-radius: 999px; overflow: hidden;
    background: var(--theme-field-border, rgba(0,0,0,0.1));
  }
  .echo-inject-popup-fill {
    display: block; height: 100%; width: 0; border-radius: inherit;
    background: var(--theme-accent, #4b55e8);
    animation: shinawaseInjectFill 3s linear forwards;
  }
`;
document.head.append(css);

const toast = (text, type = 'info') => {
  document.querySelectorAll('.echo-toast').forEach((node) => node.remove());
  const el = document.createElement('div');
  el.className = 'echo-toast ' + type;
  el.textContent = String(text);
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
};
window.__echoModToast = toast;

const api = async (path, options) => {
  const res = await fetch(base + path, options);
  const val = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(val.error || 'request failed (' + res.status + ')');
  return val;
};

const hideNativeSurfaces = () => document.querySelectorAll('.page-surface:not([hidden])').forEach((surface) => {
  if (surface.classList.contains('echo-external-loader-panel') || surface.classList.contains('echo-external-mod-panel') || surface.classList.contains('echo-external-mod-page')) return;
  surface.dataset.echoExternalHidden = 'true';
  surface.setAttribute('hidden', '');
});
const pageHost = () => document.querySelector('.app-shell') || document.body;
const attachPanel = (panel) => {
  const host = pageHost();
  if (panel && host && panel.parentElement !== host) host.append(panel);
};
const restoreNativeSurfaces = () => document.querySelectorAll('[data-echo-external-hidden="true"]').forEach((surface) => {
  delete surface.dataset.echoExternalHidden;
  surface.removeAttribute('hidden');
});
const hideAllPanels = () => {
  if (modsPanel) modsPanel.hidden = true;
  if (loaderPanel) loaderPanel.hidden = true;
  sidebarPages.forEach((page) => { page.hidden = true; });
  activeSidebar = null;
  [loaderButton, modsButton].forEach((button) => {
    if (!button) return;
    button.setAttribute('aria-current', 'false');
    button.dataset.active = 'false';
  });
  sidebarButtons.forEach((button) => { button.setAttribute('aria-current', 'false'); button.dataset.active = 'false'; });
};
const showPanel = (panel, button) => {
  attachPanel(panel);
  hideAllPanels();
  hideNativeSurfaces();
  panel.hidden = false;
  activeNav = button;
  if (button) {
    button.setAttribute('aria-current', 'page');
    button.dataset.active = 'true';
  }
};
const closeSidebarPage = () => {
  hideAllPanels();
  restoreNativeSurfaces();
};
const nativeRouteEvents = ['app:navigate:lyrics', 'app:navigate:lyrics-back'];
const onNativeRoute = () => closeSidebarPage();
nativeRouteEvents.forEach((eventName) => window.addEventListener(eventName, onNativeRoute));

const navSvg = (paths) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
const loaderNavIcon = navSvg('<path d="M12 3 4.8 7.2v9.6L12 21l7.2-4.2V7.2L12 3z"/><circle cx="12" cy="12" r="2.35"/><path d="M12 3v6.4"/>');
const modsNavIcon = navSvg('<rect x="3.2" y="3.2" width="7.6" height="7.6" rx="1.6"/><rect x="13.2" y="3.2" width="7.6" height="7.6" rx="1.6"/><rect x="3.2" y="13.2" width="7.6" height="7.6" rx="1.6"/><rect x="13.2" y="13.2" width="7.6" height="7.6" rx="1.6"/>');

const makeNavButton = (nav, key, label, icon, onClick) => {
  let button = nav.querySelector('[data-echo-external-' + key + ']');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-item';
    button.dataset['echoExternal' + key[0].toUpperCase() + key.slice(1)] = 'true';
    button.dataset.echoExternalOwned = 'true';
    button.setAttribute('aria-label', label);
    button.title = label;
    const shell = document.createElement('span');
    shell.className = 'nav-icon-shell';
    shell.innerHTML = icon;
    const text = document.createElement('span');
    text.className = 'nav-item-label';
    text.textContent = label;
    button.append(shell, text);
  }
  button.querySelector('.nav-item-label').textContent = label;
  const shell = button.querySelector('.nav-icon-shell');
  if (shell && !shell.querySelector('svg')) shell.innerHTML = icon;
  if (button.dataset.echoExternalBound !== 'true') {
    button.dataset.echoExternalBound = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      activeNav = button;
      void onClick();
    }, true);
  }
  return button;
};

const ensureLoaderGroup = () => {
  const groups = document.querySelector('.sidebar-groups');
  if (!groups) return null;
  document.querySelectorAll('[data-echo-external-owned="true"]').forEach((button) => {
    if (!button.closest('[data-echo-external-loader-group]')) button.remove();
  });
  let group = groups.querySelector('[data-echo-external-loader-group]');
  if (!group) {
    group = document.createElement('section');
    group.className = 'sidebar-group';
    group.dataset.echoExternalLoaderGroup = 'true';
    const heading = document.createElement('h2');
    heading.className = 'sidebar-group-label';
    heading.textContent = T.loaderGroup || 'Shinawase Loader';
    const nav = document.createElement('nav');
    nav.className = 'nav-list';
    group.append(heading, nav);
  } else {
    const heading = group.querySelector('.sidebar-group-label');
    if (heading) heading.textContent = T.loaderGroup || 'Shinawase Loader';
  }
  if (group.parentElement !== groups) groups.append(group);
  loaderGroup = group;
  loaderNav = group.querySelector('.nav-list');
  return loaderNav;
};

const ensureLoaderButtons = (nav) => {
  if (!nav) return null;
  loaderButton = makeNavButton(nav, 'loader', T.loader, loaderNavIcon, openLoader);
  modsButton = makeNavButton(nav, 'mods', T.mods, modsNavIcon, openMods);
  if (loaderButton.parentElement !== nav) nav.prepend(modsButton);
  if (modsButton.previousElementSibling !== loaderButton) nav.insertBefore(loaderButton, modsButton);
  return modsButton;
};

const mountPage = (className, html) => {
  const panel = document.createElement('section');
  panel.className = className;
  panel.innerHTML = html;
  (document.querySelector('.app-shell') || document.body).append(panel);
  return panel;
};

const renderStatus = async () => {
  if (!loaderPanel || loaderPanel.hidden) return;
  try {
    const status = await api('/api/status');
    const grid = loaderPanel.querySelector('[data-status-grid]');
    const rows = [
      [T.loader, 'v' + (status.loaderVersion || LOADER_VERSION)],
      [T.listen, '127.0.0.1:' + status.port],
      [T.cdp, String(status.debugPort)],
      [T.inspect, String(status.inspectPort)],
      [T.native, status.nativeHost ? String(status.nativePort) : T.off],
      ['debug', status.debugMode ? T.on : T.off],
    ];
    grid.replaceChildren(...rows.map(([label, value]) => {
      const chip = document.createElement('div');
      chip.className = 'echo-status-chip';
      chip.innerHTML = '<small></small><strong></strong>';
      chip.firstChild.textContent = label;
      chip.lastChild.textContent = value;
      return chip;
    }));
    const debugBtn = loaderPanel.querySelector('[data-action="debug"]');
    if (debugBtn) debugBtn.textContent = status.debugMode ? T.debugOff : T.debugOn;
  } catch (error) {
    toast(error.message, 'error');
  }
};

let consoleTimer = 0;
let consolePaused = false;
let lastLogText = '';
const consoleStick = (out) => out && (out.scrollHeight - out.scrollTop - out.clientHeight < 32);
const consoleAppend = (text, className, forceScroll = false) => {
  const out = loaderPanel?.querySelector('[data-console-out]');
  if (!out || !text) return;
  const stick = forceScroll || consoleStick(out);
  const line = document.createElement('div');
  if (className) line.className = className;
  line.textContent = text;
  out.append(line);
  if (stick) out.scrollTop = out.scrollHeight;
};
const refreshDebugLog = async () => {
  if (!loaderPanel || loaderPanel.hidden || consolePaused) return;
  const logs = await api('/api/logs?tail=120').catch(() => null);
  const text = String(logs?.text || '');
  if (!text || text === lastLogText) return;
  const prev = lastLogText ? lastLogText.split('\n') : [];
  const next = text.split('\n');
  const added = next.length >= prev.length && next.slice(0, prev.length).join('\n') === prev.join('\n')
    ? next.slice(prev.length)
    : next;
  lastLogText = text;
  added.filter(Boolean).forEach((line) => consoleAppend(line, /error|fail/i.test(line) ? 'echo-debug-err' : ''));
};
const consoleHelp = () => [
  'help                 show this list',
  'status               loader ports and packages',
  'inject               reinject enabled mods',
  'debug [on|off]       toggle debug logging',
  'log [n]              tail loader.log',
  'error [n]            tail errors.log',
  'packages             installed packages',
  'clear                clear this console',
].join('\n');
const runDebugCommand = async (command) => {
  const line = String(command || '').trim();
  if (!line) return;
  consoleAppend('> ' + line, 'echo-debug-in', true);
  if (line === 'clear' || line === 'cls') {
    const out = loaderPanel.querySelector('[data-console-out]');
    if (out) out.replaceChildren();
    lastLogText = '';
    return;
  }
  if (line === 'help' || line === '?') {
    consoleHelp().split('\n').forEach((row) => consoleAppend(row));
    return;
  }
  try {
    const result = await api('/api/console', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: line }) });
    String(result.output || '').split('\n').forEach((row) => consoleAppend(row));
    if (line === 'debug' || line.startsWith('debug ')) await renderStatus();
  } catch (error) {
    consoleAppend(String(error.message || error), 'echo-debug-err');
  }
};

const applyLocale = async () => {
  const next = (typeof LOADER_LOCALE !== 'undefined' && LOADER_LOCALE === 'en') ? 'zh' : 'en';
  await api('/api/locale', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: next }) });
  if (typeof LOADER_LOCALE !== 'undefined') LOADER_LOCALE = next;
  if (typeof LOCALES !== 'undefined' && LOCALES[next]) T = LOCALES[next];
  const showMods = Boolean(modsPanel && !modsPanel.hidden);
  loaderPanel?.remove();
  modsPanel?.remove();
  loaderPanel = null;
  modsPanel = null;
  window.clearInterval(statusTimer);
  window.clearInterval(consoleTimer);
  lastLogText = '';
  ensureLoaderButtons(loaderNav);
  if (showMods) await openMods();
  else await openLoader();
};

const openLoader = async () => {
  if (loaderPanel) {
    showPanel(loaderPanel, loaderButton);
    await renderStatus();
    return;
  }
  loaderPanel = mountPage('echo-external-loader-panel page-surface', `
    <div class="page-stack plugins-page">
      <header class="plain-page-header plugins-header">
        <div>
          <span class="section-kicker">${T.loaderKicker}</span>
          <h1>${T.loaderTitle}</h1>
          <p>${T.loaderHint}</p>
        </div>
        <div class="plugins-header-actions">
          <button class="settings-action-button" data-action="locale">${T.changeLanguage}</button>
          <button class="settings-action-button" data-action="perf">${T.exportPerf}</button>
          <button class="settings-action-button" data-action="update">${T.updateLoader}</button>
          <button class="settings-action-button" data-action="debug">${T.debugOn}</button>
        </div>
      </header>
      <section class="settings-section">
        <h2 class="section-title">${T.status}</h2>
        <div class="echo-status-grid" data-status-grid></div>
      </section>
      <section class="settings-section">
        <h2 class="section-title">${T.debugConsole}</h2>
        <div class="echo-debug-console">
          <div class="echo-debug-toolbar">
            <span>${T.consoleHint}</span>
            <button class="settings-action-button" data-action="console-clear">${T.consoleClear}</button>
          </div>
          <pre class="echo-debug-output" data-console-out></pre>
          <form class="echo-debug-form" data-console-form>
            <span>&gt;</span>
            <input data-console-in spellcheck="false" autocomplete="off" placeholder="help">
          </form>
        </div>
      </section>
    </div>
  `);
  showPanel(loaderPanel, loaderButton);
  loaderPanel.querySelector('[data-action="locale"]').onclick = () => void applyLocale().catch((error) => toast(error.message, 'error'));
  loaderPanel.querySelector('[data-action="perf"]').onclick = async () => {
    const report = await api('/api/perf', { method: 'POST' });
    toast(T.perfReady + ' · ' + (report.file || ''), 'success');
  };
  loaderPanel.querySelector('[data-action="update"]').onclick = async () => {
    try {
      const result = await api('/api/update');
      toast(result.updateAvailable ? (T.updateAvailable + ' ' + result.remote) : T.updateCurrent, result.updateAvailable ? 'info' : 'success');
    } catch (error) { toast(T.updateFailed + ': ' + error.message, 'error'); }
  };
  loaderPanel.querySelector('[data-action="debug"]').onclick = async () => {
    const status = await api('/api/status');
    const next = !status.debugMode;
    await api('/api/debug', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: next }) });
    toast(next ? T.debugOn : T.debugOff, 'success');
    await renderStatus();
  };
  loaderPanel.querySelector('[data-action="console-clear"]').onclick = () => {
    loaderPanel.querySelector('[data-console-out]')?.replaceChildren();
    lastLogText = '';
  };
  loaderPanel.querySelector('[data-console-form]').onsubmit = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const consoleInput = loaderPanel.querySelector('[data-console-in]');
  consoleInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const value = consoleInput.value;
    consoleInput.value = '';
    void runDebugCommand(value);
  }, true);
  await renderStatus();
  await refreshDebugLog();
  window.clearInterval(statusTimer);
  window.clearInterval(consoleTimer);
  statusTimer = window.setInterval(() => void renderStatus(), 4000);
  consoleTimer = window.setInterval(() => void refreshDebugLog(), 1500);
};

const renderModList = async () => {
  if (!modsPanel) return;
  const data = await api('/api/mods');
  const list = modsPanel.querySelector('[data-mod-list]');
  const items = (data.mods || []).filter((item) => {
    const hay = ((item.name || '') + ' ' + item.id + ' ' + (item.description || '')).toLowerCase();
    if (searchQuery && !hay.includes(searchQuery.toLowerCase())) return false;
    if (currentFilter === 'active') return item.enabled;
    if (currentFilter === 'inactive') return !item.enabled;
    return true;
  });
  modsPanel.querySelector('[data-count-all]').textContent = String((data.mods || []).length);
  modsPanel.querySelector('[data-count-active]').textContent = String((data.mods || []).filter((item) => item.enabled).length);
  modsPanel.querySelector('[data-count-inactive]').textContent = String((data.mods || []).filter((item) => !item.enabled).length);
  list.replaceChildren(...items.map((item) => {
    const card = document.createElement('article');
    card.className = 'echo-mod-row';
    card.dataset.enabled = String(item.enabled === true);
    card.innerHTML = '<span class="echo-mod-icon"></span><div class="echo-mod-copy"><strong></strong><em data-desc></em><small data-version></small></div><div class="echo-mod-row-actions"></div>';
    const icon = card.querySelector('.echo-mod-icon');
    if (item.iconDataUrl) {
      const img = document.createElement('img');
      img.src = item.iconDataUrl;
      img.alt = '';
      icon.replaceChildren(img);
    } else {
      icon.textContent = (item.name || item.id || '?').slice(0, 1).toUpperCase();
    }
    card.querySelector('strong').textContent = item.name || item.id;
    card.querySelector('[data-desc]').textContent = item.description || item.id;
    card.querySelector('[data-version]').textContent = 'v' + (item.version || '1.0.0');
    const actions = card.querySelector('.echo-mod-row-actions');
    const toggle = document.createElement('button');
    toggle.className = 'settings-action-button';
    toggle.textContent = item.enabled ? T.enabled : T.disabled;
    toggle.onclick = async () => {
      await api('/api/mod/' + encodeURIComponent(item.id) + '/' + (item.enabled ? 'disable' : 'enable'), { method: 'POST' });
      await renderModList();
    };
    const config = document.createElement('button');
    config.className = 'settings-action-button';
    config.textContent = T.config || 'Config';
    config.onclick = () => openConfigModal(item.id, item.name || item.id);
    const remove = document.createElement('button');
    remove.className = 'settings-danger-button';
    remove.textContent = T.removed;
    remove.onclick = async () => {
      if (!confirm(item.id)) return;
      await api('/api/mod/' + encodeURIComponent(item.id), { method: 'DELETE' });
      await renderModList();
    };
    actions.append(toggle, config, remove);
    return card;
  }));
};

const openConfigModal = async (modId, modName) => {
  configModal?.remove();
  configModal = document.createElement('div');
  configModal.className = 'echo-config-overlay';
  const card = document.createElement('div');
  card.className = 'echo-config-card';
  card.innerHTML = '<header><strong data-title></strong><button class="settings-action-button" type="button" data-close>' + T.close + '</button></header><div class="echo-config-body" data-body></div><p class="echo-config-error" data-error></p><footer><button class="settings-action-button" type="button" data-close>' + T.close + '</button><button class="settings-action-button" type="button" data-save>' + (T.save || 'Save') + '</button></footer>';
  card.querySelector('[data-title]').textContent = (T.config || 'Config') + ' · ' + modName;
  configModal.append(card);
  (document.querySelector('.app-shell') || document.body).append(configModal);
  const close = () => {
    window.removeEventListener('keydown', onKey);
    configModal?.remove();
    configModal = null;
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  configModal.addEventListener('mousedown', (event) => { if (event.target === configModal) close(); });
  configModal.querySelectorAll('[data-close]').forEach((button) => { button.onclick = close; });
  const body = card.querySelector('[data-body]');
  const errorNode = card.querySelector('[data-error]');
  const readDraft = () => {
    const area = body.querySelector('[data-json]');
    if (area) return JSON.parse(area.value || '{}');
    const next = {};
    body.querySelectorAll('[data-key]').forEach((input) => {
      const key = input.dataset.key;
      if (input.type === 'checkbox') next[key] = input.checked;
      else if (input.dataset.kind === 'integer') next[key] = Number.parseInt(input.value, 10);
      else if (input.dataset.kind === 'number') next[key] = Number(input.value);
      else next[key] = input.value;
    });
    return next;
  };
  const renderFields = (schema, config) => {
    const draft = config && typeof config === 'object' && !Array.isArray(config) ? { ...config } : {};
    const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : null;
    if (!props || !Object.keys(props).length) {
      const area = document.createElement('textarea');
      area.className = 'echo-config-json';
      area.dataset.json = 'true';
      area.value = JSON.stringify(draft, null, 2);
      body.append(area);
      return;
    }
    Object.entries(props).forEach(([key, spec]) => {
      const field = document.createElement('label');
      field.className = 'echo-config-field';
      const caption = document.createElement('span');
      caption.textContent = spec.title || key;
      field.append(caption);
      if (spec.type === 'boolean') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.key = key;
        input.checked = draft[key] === true;
        field.append(input);
      } else if (Array.isArray(spec.enum) && spec.enum.length) {
        const select = document.createElement('select');
        select.dataset.key = key;
        spec.enum.forEach((value) => {
          const option = document.createElement('option');
          option.value = String(value);
          option.textContent = String(value);
          if (String(draft[key] ?? spec.enum[0]) === String(value)) option.selected = true;
          select.append(option);
        });
        field.append(select);
      } else {
        const input = document.createElement('input');
        input.dataset.key = key;
        if (spec.type === 'integer' || spec.type === 'number') {
          input.type = 'number';
          input.dataset.kind = spec.type;
          if (spec.minimum != null) input.min = String(spec.minimum);
          if (spec.maximum != null) input.max = String(spec.maximum);
        } else input.type = 'text';
        input.value = draft[key] == null ? '' : String(draft[key]);
        field.append(input);
      }
      body.append(field);
    });
  };
  try {
    const response = await api('/api/mod/' + encodeURIComponent(modId) + '/config');
    try {
      renderFields(response.schema, response.config || {});
    } catch (error) {
      body.replaceChildren();
      const area = document.createElement('textarea');
      area.className = 'echo-config-json';
      area.dataset.json = 'true';
      area.value = JSON.stringify(response.config || {}, null, 2);
      body.append(area);
      errorNode.textContent = error.message;
    }
    card.querySelector('[data-save]').onclick = async () => {
      try {
        const parsed = readDraft();
        await api('/api/mod/' + encodeURIComponent(modId) + '/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config: parsed }) });
        toast('OK', 'success');
        close();
      } catch (error) { errorNode.textContent = error.message; }
    };
  } catch (error) { errorNode.textContent = error.message; }
};

const processFileImport = async (file) => {
  if (!file) return;
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const res = await api('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: btoa(binary), name: file.name }) });
  toast((res.manifest?.name || res.manifest?.id || file.name), 'success');
  await renderModList();
};

const openMods = async () => {
  if (modsPanel) {
    showPanel(modsPanel, modsButton);
    await renderModList();
    return;
  }
  modsPanel = mountPage('echo-external-mod-panel page-surface', `
    <div class="echo-mod-page">
      <header class="echo-mod-header">
        <div>
          <span class="section-kicker">${T.modsKicker}</span>
          <h1>${T.modsTitle}</h1>
          <p>${T.modsHint}</p>
        </div>
        <div class="echo-mod-actions">
          <input type="file" accept=".echomod,.echo,application/json,application/zip" data-file hidden>
          <button class="settings-action-button" data-action="import">${T.importMod}</button>
          <button class="settings-action-button" data-action="reinject">${T.reload}</button>
        </div>
      </header>
      <div class="echo-mod-toolbar">
        <input class="echo-search-box" data-search placeholder="${T.searchMods}">
        <div class="echo-mod-filters">
          <button class="list-filter-chip active" data-filter="all">${T.filterAll} (<span data-count-all>0</span>)</button>
          <button class="list-filter-chip" data-filter="active">${T.filterOn} (<span data-count-active>0</span>)</button>
          <button class="list-filter-chip" data-filter="inactive">${T.filterOff} (<span data-count-inactive>0</span>)</button>
        </div>
      </div>
      <div class="echo-mod-drop" data-dropzone>${T.dropHint}</div>
      <div class="echo-mod-list" data-mod-list></div>
    </div>
  `);
  showPanel(modsPanel, modsButton);
  const fileInput = modsPanel.querySelector('[data-file]');
  modsPanel.querySelector('[data-action="import"]').onclick = () => fileInput.click();
  fileInput.onchange = (event) => { const file = event.target.files?.[0]; if (file) processFileImport(file); fileInput.value = ''; };
  const dropzone = modsPanel.querySelector('[data-dropzone]');
  dropzone.onclick = () => fileInput.click();
  dropzone.ondragover = (event) => event.preventDefault();
  dropzone.ondrop = (event) => { event.preventDefault(); const file = event.dataTransfer?.files?.[0]; if (file) processFileImport(file); };
  modsPanel.querySelector('[data-search]').oninput = (event) => { searchQuery = event.target.value; void renderModList(); };
  modsPanel.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.onclick = () => {
      modsPanel.querySelectorAll('[data-filter]').forEach((node) => node.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      void renderModList();
    };
  });
  modsPanel.querySelector('[data-action="reinject"]').onclick = async () => {
    const result = await api('/api/reinject', { method: 'POST' });
    toast(String(result.targets || 0), 'success');
  };
  await renderModList();
};

const mountSidebarPage = (entry) => {
  let page = sidebarPages.get(entry.id);
  if (!page) {
    page = document.createElement('section');
    page.className = 'echo-external-mod-page page-surface';
    page.hidden = true;
    page.dataset.echoExternalPage = entry.id;
    (document.querySelector('.app-shell') || document.body).append(page);
    sidebarPages.set(entry.id, page);
  }
  hideAllPanels();
  hideNativeSurfaces();
  attachPanel(page);
  page.hidden = false;
  activeSidebar = entry.id;
  sidebarButtons.forEach((button, id) => {
    const active = id === entry.id;
    button.setAttribute('aria-current', active ? 'page' : 'false');
    button.dataset.active = String(active);
  });
  if (entry.mounted) return;
  try {
    if (typeof entry.render === 'function') entry.cleanup = entry.render(page, entry.context || {});
    else if (typeof entry.html === 'string') page.innerHTML = entry.html;
    entry.mounted = true;
  } catch (error) {
    page.textContent = String(error?.message || error);
    toast(String(error?.message || error), 'error');
  }
};

const removeSidebar = (id) => {
  const entry = sidebarEntries.get(id);
  if (entry) { try { entry.cleanup?.(); } catch {} }
  sidebarEntries.delete(id);
  sidebarButtons.get(id)?.remove();
  sidebarButtons.delete(id);
  sidebarPages.get(id)?.remove();
  sidebarPages.delete(id);
  if (activeSidebar === id) closeSidebarPage();
};

const renderSidebarButtons = () => {
  const nav = ensureLoaderGroup();
  if (!nav) return false;
  ensureLoaderButtons(nav);
  for (const [id, button] of sidebarButtons) if (!sidebarEntries.has(id)) { button.remove(); sidebarButtons.delete(id); }
  const entries = [...sidebarEntries.values()].sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0) || String(left.label || '').localeCompare(String(right.label || '')));
  let anchor = modsButton?.nextElementSibling || null;
  for (const entry of entries) {
    let button = sidebarButtons.get(entry.id);
    if (!button || !button.isConnected) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-item';
      button.dataset.echoExternalSidebar = entry.id;
      button.innerHTML = '<span class="nav-icon-shell"></span><span class="nav-item-label"></span>';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const current = sidebarEntries.get(entry.id);
        if (current) mountSidebarPage(current);
      }, true);
      sidebarButtons.set(entry.id, button);
    }
    button.querySelector('.nav-icon-shell').textContent = entry.icon || '◇';
    button.querySelector('.nav-item-label').textContent = entry.label || entry.id;
    button.setAttribute('aria-label', entry.label || entry.id);
    button.title = entry.label || entry.id;
    if (button !== anchor) nav.insertBefore(button, anchor);
    anchor = button.nextElementSibling;
  }
  return true;
};

const registerSidebar = (id, options = {}, context = {}) => {
  const spec = (id && typeof id === 'object') ? id : { ...(options || {}) };
  const packageId = (id && typeof id === 'object') ? '' : String(id || '');
  const localId = String(spec.id || (packageId ? 'main' : ''));
  const entryId = packageId && localId && packageId !== localId ? (packageId + ':' + localId) : (localId || packageId);
  const entry = {
    id: entryId,
    label: String(spec.label || spec.name || context.manifest?.name || context.manifest?.id || packageId || localId),
    icon: spec.icon || '◇',
    order: Number(spec.order) || 50,
    render: spec.render,
    html: spec.html,
    context: context && typeof context === 'object' ? context : {},
    mounted: false,
    cleanup: null,
  };
  if (!entry.id) return () => {};
  const previous = sidebarEntries.get(entry.id);
  if (previous) {
    previous.label = entry.label;
    previous.icon = entry.icon;
    previous.order = entry.order;
    previous.context = entry.context;
    if (!previous.mounted) {
      previous.render = entry.render;
      previous.html = entry.html;
    }
    sidebarEntries.set(previous.id, previous);
    renderSidebarButtons();
    return () => removeSidebar(previous.id);
  }
  sidebarEntries.set(entry.id, entry);
  renderSidebarButtons();
  return () => removeSidebar(entry.id);
};

const splashActive = () => {
  const splash = document.querySelector('.echo-startup-shell');
  return Boolean(splash && document.documentElement.dataset.echoStartup !== 'ready');
};

const maybeShowInjectedPopup = () => {
  if (injectPopupShown) return;
  if (!document.querySelector('.app-shell')) return;
  try {
    if (sessionStorage.getItem('shinawase:injected-popup')) {
      injectPopupShown = true;
      return;
    }
    sessionStorage.setItem('shinawase:injected-popup', '1');
  } catch {}
  injectPopupShown = true;
  document.querySelectorAll('.echo-inject-popup').forEach((node) => node.remove());
  const el = document.createElement('div');
  el.className = 'echo-inject-popup';
  el.innerHTML = '<span class="echo-inject-popup-accent"></span><div class="echo-inject-popup-body"><div class="echo-inject-popup-title"></div><div class="echo-inject-popup-track"><span class="echo-inject-popup-fill"></span></div></div>';
  el.querySelector('.echo-inject-popup-title').textContent = 'Shinawase Injected';
  document.body.append(el);
  void api('/api/mods').then((data) => {
    if (!el.isConnected) return;
    const count = (data.mods || []).filter((mod) => mod.enabled).length;
    const sub = document.createElement('div');
    sub.className = 'echo-inject-popup-sub';
    sub.textContent = count === 1 ? '1 mod active' : count + ' mods active';
    el.querySelector('.echo-inject-popup-title').after(sub);
  }).catch(() => {});
  window.clearTimeout(injectPopupTimer);
  injectPopupTimer = window.setTimeout(() => {
    injectPopupTimer = 0;
    if (!el.isConnected) return;
    el.classList.add('echo-inject-popup-out');
    injectPopupTimer = window.setTimeout(() => {
      injectPopupTimer = 0;
      el.remove();
    }, 300);
  }, 3000);
};

const ensure = () => {
  if (splashActive()) return false;
  attachPanel(loaderPanel);
  attachPanel(modsPanel);
  sidebarPages.forEach((page) => attachPanel(page));
  const nav = ensureLoaderGroup();
  if (!nav) return false;
  ensureLoaderButtons(nav);
  renderSidebarButtons();
  maybeShowInjectedPopup();
  return true;
};

let ensureTimer = 0;
const observeTarget = () => document.querySelector('.sidebar') || document.querySelector('.sidebar-groups') || document.body;
const scheduleEnsure = () => {
  if (ensureTimer) return;
  ensureTimer = window.setTimeout(() => {
    ensureTimer = 0;
    observer.disconnect();
    try { ensure(); } finally {
      const root = observeTarget();
      if (root) observer.observe(root, { childList: true, subtree: true });
    }
  }, 250);
};

const observer = new MutationObserver(scheduleEnsure);
const startObserver = () => {
  if (splashActive()) {
    window.setTimeout(startObserver, 400);
    return;
  }
  const root = observeTarget();
  if (root) observer.observe(root, { childList: true, subtree: true });
  ensure();
};
startObserver();
document.addEventListener('click', (event) => {
  const navItem = event.target?.closest?.('.nav-item');
  if (!navItem) return;
  if (navItem.dataset.echoExternalSidebar || navItem.dataset.echoExternalLoader || navItem.dataset.echoExternalMods) return;
  if (navItem !== activeNav) closeSidebarPage();
}, true);

window.__echoExternalLoaderUi = {
  version: 15,
  registerSidebar,
  unregisterSidebar: removeSidebar,
  dispose: () => {
    observer.disconnect();
    window.clearTimeout(ensureTimer);
    window.clearTimeout(injectPopupTimer);
    window.clearInterval(statusTimer);
    window.clearInterval(consoleTimer);
    document.querySelectorAll('.echo-inject-popup').forEach((node) => node.remove());
    nativeRouteEvents.forEach((eventName) => window.removeEventListener(eventName, onNativeRoute));
    modsPanel?.remove();
    loaderPanel?.remove();
    configModal?.remove();
    css.remove();
    sidebarEntries.forEach((entry) => { try { entry.cleanup?.(); } catch {} });
    sidebarButtons.forEach((button) => button.remove());
    sidebarPages.forEach((page) => page.remove());
    sidebarEntries.clear();
    sidebarButtons.clear();
    sidebarPages.clear();
    restoreNativeSurfaces();
    delete window.__echoExternalLoaderUi;
    delete window.__echoModToast;
  },
};
'installed';
