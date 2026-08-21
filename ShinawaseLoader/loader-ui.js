if (window.__echoExternalLoaderUi?.version >= 8) return 'already';
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
  .echo-modal-overlay { position: fixed; inset: 0; z-index: 45; display: grid; place-items: center; background: rgba(16,19,24,0.42); }
  .echo-modal-card {
    width: min(720px, calc(100vw - 48px)); max-height: calc(100vh - 120px); overflow: auto;
    background: var(--theme-panel-bg, #fff); color: var(--theme-page-text, inherit);
    border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1));
    border-radius: var(--radius-md, 8px); box-shadow: var(--shadow-panel, 0 10px 28px rgba(36,39,48,0.05));
  }
  .echo-modal-header, .echo-modal-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; }
  .echo-modal-body { padding: 0 20px 16px; }
  .echo-log-view {
    min-height: 220px; max-height: 360px; overflow: auto; white-space: pre-wrap;
    font: 12px var(--font-mono, ui-monospace, Consolas, monospace);
    background: var(--theme-field-bg, rgba(255,255,255,0.82));
    border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
    border-radius: var(--radius-sm, 6px); padding: 12px;
  }
  .echo-mod-card {
    display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center;
    padding: 14px 16px; border: 1px solid var(--theme-list-row-border, var(--theme-panel-border, rgba(38,40,46,0.1)));
    border-radius: var(--radius-md, 8px); background: var(--theme-list-row-bg, var(--theme-panel-bg, #fff));
  }
  .echo-mod-card[data-enabled="true"] { background: var(--theme-list-row-bg-active, var(--theme-accent-bg, rgba(75,85,232,0.06))); }
  .echo-status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
  .echo-status-chip {
    padding: 12px 14px; border-radius: var(--radius-md, 8px);
    background: var(--theme-panel-bg, #fff); border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1));
  }
  .echo-status-chip small { display: block; color: var(--theme-muted-text, #6c7179); font-size: 11px; }
  .echo-status-chip strong { display: block; margin-top: 4px; color: var(--theme-heading-text, inherit); font-size: 13px; }
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
  surface.dataset.echoExternalHidden = 'true';
  surface.setAttribute('hidden', '');
});
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
const nativeRouteEvents = ['app:navigate:lyrics', 'app:navigate:route', 'app:navigate:lyrics-back'];
const onNativeRoute = () => closeSidebarPage();
nativeRouteEvents.forEach((eventName) => window.addEventListener(eventName, onNativeRoute));

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
    shell.textContent = icon;
    const text = document.createElement('span');
    text.className = 'nav-item-label';
    text.textContent = label;
    button.append(shell, text);
  }
  button.querySelector('.nav-item-label').textContent = label;
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
  const nativeNav = document.querySelector('.sidebar-group[data-group="preferences"] .utility-nav')
    || document.querySelector('[data-group="preferences"] .nav-list');
  if (nativeNav) {
    loaderNav = nativeNav;
    loaderGroup = nativeNav.closest('.sidebar-group');
    return loaderNav;
  }
  const groups = document.querySelector('.sidebar-groups');
  if (!groups) return null;
  let group = groups.querySelector('[data-echo-external-loader-group]');
  if (!group) {
    group = document.createElement('section');
    group.className = 'sidebar-group sidebar-group--utility';
    group.dataset.group = 'preferences';
    group.dataset.echoExternalLoaderGroup = 'true';
    const heading = document.createElement('h2');
    heading.className = 'sidebar-group-label';
    heading.textContent = T.loader;
    const nav = document.createElement('nav');
    nav.className = 'nav-list utility-nav';
    group.append(heading, nav);
    groups.append(group);
  }
  loaderGroup = group;
  loaderNav = group.querySelector('.utility-nav') || group.querySelector('.nav-list');
  return loaderNav;
};

const ensureLoaderButtons = (nav) => {
  if (!nav) return null;
  loaderButton = makeNavButton(nav, 'loader', T.loader, '◎', openLoader);
  modsButton = makeNavButton(nav, 'mods', T.mods, '◆', openMods);
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
      [T.console, status.enableWebConsole ? T.on : T.off],
      ['debug', status.debugMode ? T.on : T.off],
      [T.language, status.locale === 'en' ? T.english : T.chinese],
    ];
    grid.replaceChildren(...rows.map(([label, value]) => {
      const chip = document.createElement('div');
      chip.className = 'echo-status-chip';
      chip.innerHTML = '<small></small><strong></strong>';
      chip.firstChild.textContent = label;
      chip.lastChild.textContent = value;
      return chip;
    }));
  } catch (error) {
    toast(error.message, 'error');
  }
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
          <button class="settings-action-button" data-action="console">${T.openConsole}</button>
          <button class="settings-action-button" data-action="errors">${T.viewErrors}</button>
          <button class="settings-action-button" data-action="perf">${T.exportPerf}</button>
          <button class="settings-action-button" data-action="locale">${T.changeLanguage}</button>
          <button class="settings-action-button" data-action="update">${T.updateLoader}</button>
          <button class="settings-action-button" data-action="debug">${T.debugOn}</button>
        </div>
      </header>
      <section class="settings-section">
        <h2 class="section-title">${T.status}</h2>
        <div class="echo-status-grid" data-status-grid></div>
      </section>
      <section class="settings-section">
        <h2 class="section-title">${T.viewErrors}</h2>
        <pre class="echo-log-view" data-log-view>${T.noErrors}</pre>
      </section>
    </div>
  `);
  showPanel(loaderPanel, loaderButton);
  loaderPanel.querySelector('[data-action="console"]').onclick = () => window.open(base, '_blank');
  loaderPanel.querySelector('[data-action="errors"]').onclick = async () => {
    const logs = await api('/api/logs?kind=error&tail=120');
    loaderPanel.querySelector('[data-log-view]').textContent = logs.text || T.noErrors;
  };
  loaderPanel.querySelector('[data-action="perf"]').onclick = async () => {
    const report = await api('/api/perf', { method: 'POST' });
    toast(T.perfReady + ' · ' + (report.file || ''), 'success');
  };
  loaderPanel.querySelector('[data-action="locale"]').onclick = async () => {
    const next = LOADER_LOCALE === 'zh' ? 'en' : 'zh';
    await api('/api/locale', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: next }) });
    toast(next === 'zh' ? T.chinese : T.english, 'success');
    window.__echoExternalLoaderUi?.dispose?.();
    location.reload();
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
  await renderStatus();
  const logs = await api('/api/logs?kind=error&tail=80').catch(() => ({ text: T.noErrors }));
  loaderPanel.querySelector('[data-log-view]').textContent = logs.text || T.noErrors;
  window.clearInterval(statusTimer);
  statusTimer = window.setInterval(() => void renderStatus(), 4000);
};

const renderModList = async () => {
  if (!modsPanel) return;
  const data = await api('/api/mods');
  const list = modsPanel.querySelector('[data-mod-list]');
  const items = (data.mods || []).filter((item) => {
    const hay = (item.name + ' ' + item.id).toLowerCase();
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
    card.className = 'echo-mod-card plugin-list-item';
    card.dataset.enabled = String(item.enabled === true);
    card.innerHTML = '<div><strong></strong><p></p></div><div class="plugins-header-actions"></div>';
    card.querySelector('strong').textContent = item.name || item.id;
    card.querySelector('p').textContent = (item.kind || 'mod') + ' · ' + (item.version || '1.0.0') + ' · ' + item.id;
    const actions = card.lastChild;
    const toggle = document.createElement('button');
    toggle.className = 'settings-action-button';
    toggle.textContent = item.enabled ? T.enabled : T.disabled;
    toggle.onclick = async () => {
      await api('/api/mod/' + encodeURIComponent(item.id) + '/' + (item.enabled ? 'disable' : 'enable'), { method: 'POST' });
      await renderModList();
    };
    const config = document.createElement('button');
    config.className = 'settings-action-button';
    config.textContent = 'Config';
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
  configModal.className = 'echo-modal-overlay';
  configModal.innerHTML = '<div class="echo-modal-card"><div class="echo-modal-header"><strong></strong><button class="settings-action-button" data-close>' + T.close + '</button></div><div class="echo-modal-body"><textarea class="echo-log-view" data-json></textarea><p class="echo-config-error" data-error></p></div><div class="echo-modal-footer"><button class="settings-action-button" data-close>' + T.close + '</button><button class="settings-action-button" data-save>Save</button></div></div>';
  configModal.querySelector('strong').textContent = 'Config · ' + modName;
  document.body.append(configModal);
  const close = () => { configModal?.remove(); configModal = null; };
  configModal.querySelectorAll('[data-close]').forEach((button) => { button.onclick = close; });
  try {
    const response = await api('/api/mod/' + encodeURIComponent(modId) + '/config');
    configModal.querySelector('[data-json]').value = JSON.stringify(response.config || {}, null, 2);
    configModal.querySelector('[data-save]').onclick = async () => {
      try {
        const parsed = JSON.parse(configModal.querySelector('[data-json]').value || '{}');
        await api('/api/mod/' + encodeURIComponent(modId) + '/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config: parsed }) });
        toast('OK', 'success');
        close();
      } catch (error) { configModal.querySelector('[data-error]').textContent = error.message; }
    };
  } catch (error) { configModal.querySelector('[data-error]').textContent = error.message; }
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
    <div class="page-stack plugins-page">
      <header class="plain-page-header plugins-header">
        <div>
          <span class="section-kicker">${T.modsKicker}</span>
          <h1>${T.modsTitle}</h1>
          <p>${T.modsHint}</p>
        </div>
        <div class="plugins-header-actions">
          <input class="echo-search-box" data-search placeholder="${T.searchMods}">
          <input type="file" accept=".echomod,.echo,application/json,application/zip" data-file hidden>
          <button class="settings-action-button" data-action="import">${T.importMod}</button>
          <button class="settings-action-button" data-action="reinject">${T.reload}</button>
        </div>
      </header>
      <div class="echo-dropzone settings-section" data-dropzone>${T.dropHint}</div>
      <div class="settings-chip-row">
        <button class="list-filter-chip active" data-filter="all">${T.filterAll} (<span data-count-all>0</span>)</button>
        <button class="list-filter-chip" data-filter="active">${T.filterOn} (<span data-count-active>0</span>)</button>
        <button class="list-filter-chip" data-filter="inactive">${T.filterOff} (<span data-count-inactive>0</span>)</button>
      </div>
      <div class="plugins-list" data-mod-list></div>
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
  const entries = [...sidebarEntries.values()].sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
  let anchor = modsButton?.nextElementSibling || null;
  for (const entry of entries) {
    let button = sidebarButtons.get(entry.id);
    if (!button || !button.isConnected) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-item';
      button.dataset.echoExternalSidebar = entry.id;
      button.innerHTML = '<span class="nav-icon-shell"></span><span class="nav-item-label"></span>';
      button.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); mountSidebarPage(entry); }, true);
      sidebarButtons.set(entry.id, button);
    }
    button.querySelector('.nav-icon-shell').textContent = entry.icon || '◇';
    button.querySelector('.nav-item-label').textContent = entry.label;
    if (button !== anchor) nav.insertBefore(button, anchor);
    anchor = button.nextElementSibling;
  }
  return true;
};

const registerSidebar = (entry) => {
  sidebarEntries.set(entry.id, entry);
  renderSidebarButtons();
  return () => removeSidebar(entry.id);
};

const ensure = () => {
  const nav = ensureLoaderGroup();
  if (!nav) return false;
  ensureLoaderButtons(nav);
  renderSidebarButtons();
  return true;
};

const observer = new MutationObserver(ensure);
observer.observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', (event) => {
  const navItem = event.target?.closest?.('.nav-item');
  if (!navItem) return;
  if (navItem.dataset.echoExternalSidebar || navItem.dataset.echoExternalLoader || navItem.dataset.echoExternalMods) return;
  if (navItem !== activeNav) closeSidebarPage();
}, true);
ensure();

window.__echoExternalLoaderUi = {
  version: 8,
  registerSidebar,
  unregisterSidebar: removeSidebar,
  dispose: () => {
    observer.disconnect();
    window.clearInterval(statusTimer);
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
