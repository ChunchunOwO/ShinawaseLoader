// Loader UI generation 22. Keep this guard in sync with
// window.__echoExternalLoaderUi.version and ShinawaseLoader.mjs (uiVersion < 22).
if (window.__echoExternalLoaderUi?.version >= 22) return 'already';
window.__echoExternalLoaderUi?.dispose?.();

const base = 'http://127.0.0.1:' + LOADER_PORT;
const defaultUiSettings = {
  density: 'comfortable',
  accentColor: '',
  animations: true,
  cardLayout: 'list',
  showModDescriptions: true,
  showModVersions: true,
  showModIds: true,
  rememberFilters: true,
  modSort: 'name',
  modFilter: 'all',
};
let uiSettings = {
  ...defaultUiSettings,
  ...((typeof LOADER_UI_SETTINGS !== 'undefined' && LOADER_UI_SETTINGS && typeof LOADER_UI_SETTINGS === 'object') ? LOADER_UI_SETTINGS : {}),
};
let modsPanel = null;
let loaderPanel = null;
let configModal = null;
let configModalCleanup = null;
let configModalTimer = 0;
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
let currentFilter = uiSettings.rememberFilters !== false ? (uiSettings.modFilter || 'all') : 'all';
let currentSort = uiSettings.modSort || 'name';
let statusTimer = 0;
let injectPopupTimer = 0;
let injectPopupShown = false;
let modsListAnimate = true;
let searchTimer = 0;
let modsCache = [];

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
const cloneValue = (value) => {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch {}
  }
  try { return JSON.parse(JSON.stringify(value ?? {})); } catch { return {}; }
};
const svgIcon = (paths) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
const iconSearch = svgIcon('<circle cx="11" cy="11" r="6.4"/><path d="m16.3 16.3 4.2 4.2"/>');
const iconGear = svgIcon('<circle cx="12" cy="12" r="3"/><path d="M12 3.6v2.1M12 18.3v2.1M4.8 6.6l1.5 1.5M17.7 16l1.5 1.5M3.6 12h2.1M18.3 12h2.1M4.8 17.4l1.5-1.5M17.7 8.1l1.5-1.5"/>');
const iconTrash = svgIcon('<path d="M5 7h14M9.5 7V5.4c0-.8.6-1.4 1.4-1.4h2.2c.8 0 1.4.6 1.4 1.4V7M8.2 7l.7 12.2c.1.8.7 1.4 1.5 1.4h3.2c.8 0 1.4-.6 1.5-1.4L15.8 7"/>');
const iconCheck = svgIcon('<path d="M5 12.4 9.3 17 19 7"/>');
const iconCross = svgIcon('<path d="M7 7l10 10M17 7 7 17"/>');
const iconInfo = svgIcon('<circle cx="12" cy="12" r="8"/><path d="M12 8h.01M11.2 11.2H12V16h.8"/>');
const iconWarn = svgIcon('<path d="M12 4.2 21 19.2H3L12 4.2z"/><path d="M12 9.4v5M12 16.6h.01"/>');
const iconUpload = svgIcon('<path d="M12 15.6V5.4M7.6 9.6 12 5.2l4.4 4.4"/><path d="M5 16.2v1.4c0 .9.7 1.6 1.6 1.6h10.8c.9 0 1.6-.7 1.6-1.6v-1.4"/>');
const iconCube = svgIcon('<path d="M12 3 4.8 7.2v9.6L12 21l7.2-4.2V7.2L12 3z"/><path d="M12 12v8.6M12 12 4.9 7.3M12 12l7.1-4.7"/>');
const emptyArt = '<svg class="echo-empty-art" viewBox="0 0 160 110" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<rect x="30" y="36" width="76" height="54" rx="14" stroke-width="1.5" opacity=".2"/>'
  + '<rect x="42" y="26" width="76" height="54" rx="14" stroke-width="1.5" opacity=".42"/>'
  + '<rect x="54" y="16" width="76" height="54" rx="14" stroke-width="1.6" opacity=".85"/>'
  + '<path d="M92 34v18M83 43h18" stroke-width="1.8" opacity=".9"/>'
  + '<path d="M18 62h8M22 58v8" stroke-width="1.5" opacity=".38"/>'
  + '<circle cx="34" cy="18" r="2.2" fill="currentColor" stroke="none" opacity=".38"/>'
  + '<circle cx="142" cy="86" r="2.6" fill="currentColor" stroke="none" opacity=".28"/>'
  + '</svg>';

const css = document.createElement('style');
css.id = 'echo-loader-ui-style';
css.textContent = `
  /* Design tokens. Declared on every loader surface (not just :root) so the
     per-surface accent override from Appearance settings re-resolves them. */
  :root, .echo-external-mod-panel, .echo-external-loader-panel, .echo-external-mod-page,
  .echo-config-overlay, .echo-toast-stack, .echo-toast, .echo-inject-popup,
  [data-echo-external-loader-group] {
    --shl-font: var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif);
    --shl-mono: var(--font-mono, ui-monospace, "Cascadia Mono", Consolas, monospace);
    --shl-accent: var(--theme-accent, #4b55e8);
    --shl-accent-bg: var(--theme-accent-bg, rgba(75, 85, 232, 0.12));
    --shl-accent-strong: var(--theme-accent-text-strong, var(--theme-accent, #4b55e8));
    --shl-accent-solid: var(--theme-accent-solid-bg, var(--theme-accent, #4b55e8));
    --shl-on-accent: var(--theme-on-accent, #fff);
    --shl-focus-ring: var(--theme-focus-ring, var(--theme-accent-bg, rgba(75, 85, 232, 0.2)));
    --shl-muted: var(--theme-muted-text, #6c7179);
    --shl-subtle: var(--theme-subtle-text, #7b8493);
    --shl-panel: var(--theme-panel-bg, #fff);
    --shl-panel-strong: var(--theme-panel-bg-strong, var(--theme-panel-bg, #fff));
    --shl-border: var(--theme-panel-border, rgba(38, 40, 46, 0.1));
    --shl-border-strong: var(--theme-panel-border-strong, rgba(38, 40, 46, 0.18));
    --shl-field-bg: var(--theme-field-bg, rgba(255, 255, 255, 0.86));
    --shl-field-border: var(--theme-field-border, rgba(0, 0, 0, 0.14));
    --shl-success: var(--theme-success-text, #2f8f62);
    --shl-danger: var(--theme-danger-text, #c23b32);
    --shl-warning: var(--theme-warning-text, #c48a2a);
    --shl-row-hover: var(--theme-list-row-bg-hover, rgba(0, 0, 0, 0.04));
    --shl-shadow-soft: var(--shadow-soft, 0 12px 32px rgba(22, 25, 32, 0.1));
    --shl-shadow-panel: var(--shadow-panel, 0 24px 64px rgba(18, 20, 26, 0.18));
    --shl-glass: color-mix(in srgb, var(--shl-panel-strong) 84%, transparent);
    --shl-ease: cubic-bezier(0.33, 1, 0.68, 1);
    --shl-spring: cubic-bezier(0.34, 1.26, 0.44, 1);
  }

  /* ---- Panels ---- */
  .echo-external-mod-panel, .echo-external-loader-panel {
    grid-row: 2; grid-column: 2; min-width: 0; min-height: 0; z-index: 1;
    overflow: auto; position: relative;
    background: var(--theme-page-bg, var(--color-bg, #f6f6f7));
    color: var(--theme-page-text, var(--color-text, #2d3036));
    font-family: var(--shl-font);
  }
  .echo-external-mod-panel[hidden], .echo-external-loader-panel[hidden], .echo-external-mod-page[hidden] { display: none !important; }
  .echo-external-mod-page {
    grid-row: 2; grid-column: 2; min-width: 0; min-height: 0; overflow: auto;
    background: var(--theme-page-bg, var(--color-bg, #f6f6f7));
  }
  .echo-external-loader-panel .section-kicker,
  .echo-mod-page .section-kicker {
    letter-spacing: 0.1em; text-transform: uppercase; font-size: 11px; font-weight: 700;
    color: var(--shl-accent-strong);
  }
  .echo-kicker-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
  .echo-version-pill {
    display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px;
    font: 650 11px var(--shl-mono); letter-spacing: 0;
    color: var(--shl-accent-strong);
    background: color-mix(in srgb, var(--shl-accent-bg) 70%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-accent) 20%, transparent);
  }

  /* ---- Toasts ---- */
  .echo-toast-stack {
    position: fixed; right: 20px; bottom: calc(var(--player-height, 112px) + 14px); z-index: 320;
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    pointer-events: none;
  }
  .echo-toast {
    display: flex; align-items: center; gap: 11px;
    min-width: 230px; max-width: min(420px, calc(100vw - 40px));
    padding: 9px 15px 9px 9px; box-sizing: border-box;
    pointer-events: auto; cursor: pointer;
    border-radius: 13px;
    background: var(--shl-glass);
    color: var(--theme-page-text, inherit);
    border: 1px solid var(--shl-border);
    box-shadow: var(--shl-shadow-soft);
    backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4);
    font: 500 13px/1.45 var(--shl-font);
    animation: echoToastIn 280ms var(--shl-spring);
  }
  .echo-toast.is-leaving { animation: echoToastOut 220ms var(--shl-ease) forwards; pointer-events: none; }
  .echo-toast-icon {
    display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; flex: none;
    color: var(--shl-accent);
    background: color-mix(in srgb, currentColor 13%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 22%, transparent);
  }
  .echo-toast-icon svg { width: 15px; height: 15px; display: block; }
  .echo-toast.success .echo-toast-icon { color: var(--shl-success); }
  .echo-toast.error .echo-toast-icon { color: var(--shl-danger); }
  .echo-toast.warn .echo-toast-icon { color: var(--shl-warning); }
  .echo-toast.success { border-color: color-mix(in srgb, var(--shl-success) 26%, var(--shl-border)); }
  .echo-toast.error { border-color: color-mix(in srgb, var(--shl-danger) 30%, var(--shl-border)); }
  .echo-toast.warn { border-color: color-mix(in srgb, var(--shl-warning) 30%, var(--shl-border)); }
  .echo-toast-msg { flex: 1; min-width: 0; }

  /* ---- Config modal ---- */
  .echo-config-overlay {
    position: fixed; inset: 0; z-index: 240; display: grid; place-items: center;
    padding: 24px;
    background: color-mix(in srgb, #0a0d13 48%, transparent);
    backdrop-filter: blur(16px) saturate(1.15); -webkit-backdrop-filter: blur(16px) saturate(1.15);
    animation: echoOverlayIn 200ms var(--shl-ease);
  }
  .echo-config-overlay.is-leaving { animation: echoOverlayOut 170ms var(--shl-ease) forwards; }
  .echo-config-card {
    width: min(560px, calc(100vw - 48px)); max-height: calc(100vh - 110px); overflow: hidden;
    display: flex; flex-direction: column;
    background: var(--shl-panel); color: var(--theme-page-text, inherit);
    border: 1px solid var(--shl-border);
    border-radius: 18px; box-shadow: var(--shl-shadow-panel);
    animation: echoCardIn 300ms var(--shl-spring);
  }
  .echo-config-card[data-custom="true"] { width: min(760px, calc(100vw - 48px)); }
  .echo-config-overlay.is-leaving .echo-config-card { animation: echoCardOut 170ms var(--shl-ease) forwards; }
  .echo-config-card header {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 16px 20px 14px; flex: none;
    border-bottom: 1px solid var(--shl-border);
  }
  .echo-config-heading { display: grid; gap: 2px; min-width: 0; }
  .echo-config-kicker {
    font: 700 10.5px var(--shl-font); letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--shl-accent-strong);
  }
  .echo-config-card header strong {
    font-size: 16px; font-weight: 650; letter-spacing: -0.01em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--theme-heading-text, inherit);
  }
  .echo-config-close { width: 32px; height: 32px; border-radius: 10px; flex: none; }
  .echo-config-close svg { width: 15px; height: 15px; }
  .echo-config-card footer {
    display: flex; align-items: center; justify-content: flex-end; gap: 9px;
    padding: 14px 20px; flex: none;
    border-top: 1px solid var(--shl-border);
    background: color-mix(in srgb, var(--shl-row-hover) 55%, transparent);
  }
  .echo-config-card footer[data-save-hidden="true"] [data-save] { display: none; }
  .echo-config-card footer .echo-btn-primary {
    background: var(--shl-accent-solid); border-color: transparent; color: var(--shl-on-accent);
    box-shadow: 0 6px 18px color-mix(in srgb, var(--shl-accent) 30%, transparent);
    transition: filter 160ms var(--shl-ease), transform 160ms var(--shl-ease), box-shadow 160ms var(--shl-ease);
  }
  .echo-config-card footer .echo-btn-primary:hover { filter: brightness(1.07); color: var(--shl-on-accent); }
  .echo-config-card footer .echo-btn-primary:active {
    transform: translateY(1px) scale(0.99);
    box-shadow: 0 3px 10px color-mix(in srgb, var(--shl-accent) 26%, transparent);
  }
  .echo-config-body {
    display: grid; gap: 16px; padding: 18px 20px; flex: 1 1 auto; min-height: 0; overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--shl-subtle) 40%, transparent) transparent;
  }
  .echo-config-body::-webkit-scrollbar { width: 8px; }
  .echo-config-body::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--shl-subtle) 36%, transparent); border-radius: 99px;
  }
  .echo-config-body > * { animation: echoFieldIn 300ms var(--shl-ease) backwards; }
  .echo-config-body > :nth-child(1) { animation-delay: 30ms; }
  .echo-config-body > :nth-child(2) { animation-delay: 55ms; }
  .echo-config-body > :nth-child(3) { animation-delay: 80ms; }
  .echo-config-body > :nth-child(4) { animation-delay: 105ms; }
  .echo-config-body > :nth-child(5) { animation-delay: 130ms; }
  .echo-config-body > :nth-child(6) { animation-delay: 155ms; }
  .echo-config-body > :nth-child(7) { animation-delay: 180ms; }
  .echo-config-body > :nth-child(8) { animation-delay: 205ms; }
  .echo-config-body > :nth-child(n+9) { animation-delay: 230ms; }
  .echo-config-form { display: grid; gap: 14px; }
  .echo-config-field { display: grid; gap: 6px; font: 13px var(--shl-font); }
  .echo-config-label { font-weight: 650; font-size: 13px; color: var(--theme-heading-text, inherit); }
  .echo-config-desc { color: var(--shl-muted); font-size: 12px; line-height: 1.5; }
  .echo-config-default {
    display: inline-flex; align-items: center; gap: 5px;
    color: var(--shl-subtle); font: 500 11px var(--shl-mono);
  }
  .echo-config-field input, .echo-config-field select, .echo-config-json {
    width: 100%; min-height: 40px; padding: 9px 12px; box-sizing: border-box;
    border: 1px solid var(--shl-field-border);
    border-radius: 10px;
    background: var(--shl-field-bg);
    color: inherit; font: 13px var(--shl-font);
    transition: border-color 160ms var(--shl-ease), box-shadow 160ms var(--shl-ease), background 160ms var(--shl-ease);
  }
  .echo-config-field input:hover, .echo-config-field select:hover, .echo-config-json:hover {
    border-color: var(--shl-border-strong);
  }
  .echo-config-field select {
    appearance: none; padding-right: 32px; cursor: pointer;
    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position: calc(100% - 16px) calc(50% - 2px), calc(100% - 11px) calc(50% - 2px);
    background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
  }
  .echo-config-field input:focus, .echo-config-field select:focus, .echo-config-json:focus {
    outline: none; border-color: var(--shl-accent);
    box-shadow: 0 0 0 3px var(--shl-focus-ring);
  }
  .echo-config-json {
    min-height: 220px; font: 12px/1.55 var(--shl-mono); resize: vertical;
    background: var(--theme-code-bg, rgba(16, 18, 24, 0.04));
  }
  .echo-config-json-wrap { display: grid; gap: 6px; }
  .echo-config-error {
    margin: 0 20px 12px; padding: 9px 12px; border-radius: 10px; flex: none;
    background: color-mix(in srgb, var(--shl-danger) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--shl-danger) 22%, transparent);
    color: var(--shl-danger); font: 500 12px/1.45 var(--shl-font);
  }
  .echo-config-error:empty { display: none; }

  /* ---- Switches ---- */
  .echo-switch-field { display: flex; align-items: center; min-height: 28px; }
  .echo-switch-box { position: relative; width: 42px; height: 24px; flex: none; }
  .echo-switch-box input {
    position: absolute; inset: 0; opacity: 0; margin: 0; width: 100%; height: 100%; cursor: pointer; z-index: 1;
  }
  .echo-switch-box .echo-switch-track {
    display: block; width: 100%; height: 100%; border-radius: 999px;
    background: color-mix(in srgb, var(--shl-subtle) 42%, transparent);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
    transition: background 200ms var(--shl-ease);
  }
  .echo-switch-box .echo-switch-track::after {
    content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 999px;
    background: #fff; box-shadow: 0 1px 4px rgba(16, 19, 24, 0.24);
    transition: transform 220ms var(--shl-spring), width 160ms var(--shl-ease);
  }
  .echo-switch-box input:active + .echo-switch-track::after { width: 24px; }
  .echo-switch-box input:checked + .echo-switch-track { background: var(--shl-accent); }
  .echo-switch-box input:checked + .echo-switch-track::after { transform: translateX(18px); }
  .echo-switch-box input:checked:active + .echo-switch-track::after { transform: translateX(14px); }
  .echo-switch-box input:focus-visible + .echo-switch-track { box-shadow: 0 0 0 3px var(--shl-focus-ring); }
  .echo-switch {
    position: relative; width: 42px; height: 24px; padding: 0; border: 0; border-radius: 999px;
    background: color-mix(in srgb, var(--shl-subtle) 42%, transparent);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
    cursor: pointer; flex: none;
    transition: background 200ms var(--shl-ease);
  }
  .echo-switch[aria-checked="true"] { background: var(--shl-accent); }
  .echo-switch:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--shl-focus-ring); }
  .echo-switch-thumb {
    position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 999px;
    background: #fff; box-shadow: 0 1px 4px rgba(16, 19, 24, 0.24);
    transition: transform 220ms var(--shl-spring), width 160ms var(--shl-ease); pointer-events: none;
  }
  .echo-switch:active .echo-switch-thumb { width: 24px; }
  .echo-switch[aria-checked="true"] .echo-switch-thumb { transform: translateX(18px); }
  .echo-switch[aria-checked="true"]:active .echo-switch-thumb { transform: translateX(14px); }

  .echo-log-view {
    min-height: 220px; max-height: 360px; overflow: auto; white-space: pre-wrap;
    font: 12px/1.55 var(--shl-mono);
    background: var(--shl-field-bg);
    border: 1px solid var(--shl-field-border);
    border-radius: 10px; padding: 12px;
    scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--shl-subtle) 40%, transparent) transparent;
  }

  /* ---- Mods page ---- */
  .echo-mod-page {
    display: flex; flex-direction: column; gap: 20px; min-height: 100%;
    padding: 28px 32px 120px; box-sizing: border-box;
  }
  .echo-mod-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .echo-mod-header h1 {
    margin: 6px 0 0; font-size: 29px; line-height: 1.12; letter-spacing: -0.03em; font-weight: 700;
    color: var(--theme-heading-text, inherit);
  }
  .echo-mod-header p { margin: 8px 0 0; max-width: 62ch; color: var(--shl-muted); font-size: 13.5px; line-height: 1.55; }
  .echo-mod-actions { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; flex: none; }
  .echo-mod-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .echo-search { position: relative; flex: 1 1 260px; min-width: 200px; }
  .echo-search-icon {
    position: absolute; left: 13px; top: 50%; width: 16px; height: 16px; transform: translateY(-50%);
    color: var(--shl-subtle); pointer-events: none;
    transition: color 160ms var(--shl-ease);
  }
  .echo-search-icon svg { width: 100%; height: 100%; display: block; }
  .echo-search:focus-within .echo-search-icon { color: var(--shl-accent); }
  .echo-mod-toolbar .echo-search-box {
    width: 100%; height: 40px; padding: 0 38px; box-sizing: border-box;
    border: 1px solid var(--shl-field-border);
    border-radius: 12px;
    background: var(--shl-field-bg);
    color: inherit; font: 13px var(--shl-font);
    transition: border-color 160ms var(--shl-ease), box-shadow 160ms var(--shl-ease);
  }
  .echo-mod-toolbar .echo-search-box::placeholder { color: var(--shl-subtle); }
  .echo-mod-toolbar .echo-search-box::-webkit-search-cancel-button,
  .echo-mod-toolbar .echo-search-box::-webkit-search-decoration { -webkit-appearance: none; appearance: none; }
  .echo-mod-toolbar .echo-search-box:hover { border-color: var(--shl-border-strong); }
  .echo-mod-toolbar .echo-search-box:focus {
    outline: none; border-color: var(--shl-accent);
    box-shadow: 0 0 0 3px var(--shl-focus-ring);
  }
  .echo-search-clear {
    position: absolute; right: 7px; top: 50%; transform: translateY(-50%);
    width: 26px; height: 26px; padding: 0; display: grid; place-items: center;
    border: 0; border-radius: 8px; background: transparent;
    color: var(--shl-subtle); cursor: pointer;
    transition: background 160ms var(--shl-ease), color 160ms var(--shl-ease);
  }
  .echo-search-clear[hidden] { display: none; }
  .echo-search-clear svg { width: 13px; height: 13px; display: block; }
  .echo-search-clear:hover { background: var(--shl-row-hover); color: var(--theme-heading-text, inherit); }
  .echo-mod-filters { display: flex; flex-wrap: wrap; gap: 8px; }
  .echo-mod-filters .echo-filter {
    display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 5px 12px;
    border-radius: 999px; border: 1px solid var(--shl-border);
    background: var(--shl-panel); color: var(--shl-muted);
    font: 600 12.5px var(--shl-font); cursor: pointer;
    transition: background 160ms var(--shl-ease), color 160ms var(--shl-ease), border-color 160ms var(--shl-ease), box-shadow 160ms var(--shl-ease);
  }
  .echo-mod-filters .echo-filter:hover {
    color: var(--theme-heading-text, inherit);
    border-color: var(--shl-border-strong);
    background: var(--shl-row-hover);
  }
  .echo-mod-filters .echo-filter:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--shl-focus-ring); }
  .echo-mod-filters .echo-filter.active {
    border-color: color-mix(in srgb, var(--shl-accent) 52%, transparent);
    background: var(--shl-accent-bg);
    color: var(--shl-accent-strong);
  }
  .echo-filter-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 14px; padding: 1px 6px; border-radius: 999px;
    background: color-mix(in srgb, currentColor 11%, transparent);
    font-size: 11px; font-variant-numeric: tabular-nums; line-height: 1.4;
  }
  .echo-sort-select {
    height: 40px; padding: 0 34px 0 13px; box-sizing: border-box; flex: none;
    appearance: none; cursor: pointer;
    border: 1px solid var(--shl-field-border);
    border-radius: 12px;
    background: var(--shl-field-bg);
    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position: calc(100% - 17px) calc(50% - 2px), calc(100% - 12px) calc(50% - 2px);
    background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
    color: inherit; font: 13px var(--shl-font);
    transition: border-color 160ms var(--shl-ease), box-shadow 160ms var(--shl-ease);
  }
  .echo-sort-select:hover { border-color: var(--shl-border-strong); }
  .echo-sort-select:focus {
    outline: none; border-color: var(--shl-accent);
    box-shadow: 0 0 0 3px var(--shl-focus-ring);
  }
  .echo-mod-drop {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    min-height: 56px; padding: 12px 18px; cursor: pointer;
    border: 1.5px dashed color-mix(in srgb, var(--shl-border-strong) 85%, transparent);
    border-radius: 14px;
    color: var(--shl-muted); font: 500 13px var(--shl-font);
    background: color-mix(in srgb, var(--shl-panel) 55%, transparent);
    transition: border-color 180ms var(--shl-ease), background 180ms var(--shl-ease), color 180ms var(--shl-ease), box-shadow 180ms var(--shl-ease);
  }
  .echo-drop-icon {
    display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; flex: none;
    color: var(--shl-accent);
    background: color-mix(in srgb, var(--shl-accent) 11%, transparent);
    transition: transform 200ms var(--shl-spring);
  }
  .echo-drop-icon svg { width: 15px; height: 15px; display: block; }
  .echo-mod-drop:hover {
    border-color: color-mix(in srgb, var(--shl-accent) 45%, transparent);
    color: var(--theme-heading-text, inherit);
    background: color-mix(in srgb, var(--shl-accent-bg) 30%, transparent);
  }
  .echo-mod-drop:hover .echo-drop-icon { transform: translateY(-1px); }
  .echo-mod-drop.is-over {
    border-color: var(--shl-accent); border-style: solid;
    color: var(--shl-accent-strong);
    background: color-mix(in srgb, var(--shl-accent-bg) 65%, transparent);
    box-shadow: 0 0 0 3px var(--shl-focus-ring);
  }
  .echo-mod-drop.is-over .echo-drop-icon { transform: scale(1.08); }

  /* ---- Mod cards ---- */
  .echo-mod-list { display: flex; flex-direction: column; gap: 12px; }
  .echo-mod-row {
    display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: 14px; align-items: center;
    min-height: 80px; padding: 14px 16px;
    border: 1px solid var(--shl-border);
    border-radius: 16px; background: var(--shl-panel);
    transition: transform 200ms var(--shl-ease), box-shadow 200ms var(--shl-ease), border-color 200ms var(--shl-ease), background 200ms var(--shl-ease);
  }
  .echo-mod-row.is-entering {
    animation: echoRowIn 300ms var(--shl-ease) backwards;
    animation-delay: calc(var(--row-i, 0) * 28ms);
  }
  .echo-mod-row:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--shl-accent) 26%, var(--shl-border));
    box-shadow: var(--shl-shadow-soft);
  }
  .echo-mod-row[data-enabled="true"] {
    border-color: color-mix(in srgb, var(--shl-accent) 22%, var(--shl-border));
    background: linear-gradient(135deg, color-mix(in srgb, var(--shl-accent-bg) 46%, transparent), transparent 62%), var(--shl-panel);
  }
  .echo-mod-icon {
    position: relative; width: 48px; height: 48px; border-radius: 14px; flex: none;
    display: grid; place-items: center; font: 700 17px var(--shl-font);
    color: var(--shl-accent-strong);
    background: linear-gradient(160deg, color-mix(in srgb, var(--shl-accent) 20%, transparent), color-mix(in srgb, var(--shl-accent) 5%, transparent));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-accent) 24%, transparent);
    transition: transform 200ms var(--shl-spring), filter 200ms var(--shl-ease), opacity 200ms var(--shl-ease);
  }
  .echo-mod-row:hover .echo-mod-icon { transform: scale(1.04); }
  .echo-mod-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block; }
  .echo-mod-row[data-enabled="false"] .echo-mod-icon { filter: saturate(0.35); opacity: 0.75; }
  .echo-mod-row[data-enabled="true"] .echo-mod-icon::after {
    content: ""; position: absolute; right: -2px; bottom: -2px; width: 10px; height: 10px; border-radius: 50%;
    background: var(--shl-success);
    box-shadow: 0 0 0 2px var(--shl-panel), 0 0 8px color-mix(in srgb, var(--shl-success) 55%, transparent);
  }
  .echo-mod-copy { min-width: 0; }
  .echo-mod-copy strong {
    display: block; font-size: 14.5px; font-weight: 650; line-height: 1.3; letter-spacing: -0.01em;
    color: var(--theme-heading-text, inherit);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .echo-mod-copy em {
    display: block; margin-top: 3px; color: var(--shl-muted); font-size: 12.5px; font-style: normal;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .echo-mod-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
  .echo-mod-copy [hidden], .echo-mod-meta[hidden] { display: none !important; }
  .echo-badge {
    display: inline-flex; align-items: center; gap: 5px; max-width: 100%;
    padding: 3px 8px; border-radius: 999px;
    font: 600 11px var(--shl-font); line-height: 1.3; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    color: var(--shl-muted);
    background: var(--shl-row-hover);
    box-shadow: inset 0 0 0 1px var(--shl-border);
  }
  .echo-badge-version {
    color: var(--shl-accent-strong);
    background: color-mix(in srgb, var(--shl-accent-bg) 66%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-accent) 18%, transparent);
  }
  .echo-badge-id { font-family: var(--shl-mono); font-size: 10.5px; font-weight: 500; }
  .echo-badge-state i { width: 6px; height: 6px; border-radius: 50%; flex: none; background: currentColor; }
  .echo-badge-state[data-on="true"] {
    color: var(--shl-success);
    background: color-mix(in srgb, var(--shl-success) 10%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-success) 24%, transparent);
  }
  .echo-badge-state[data-on="false"] { color: var(--shl-subtle); }
  .echo-mod-row-actions { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; }
  .echo-mod-row .echo-icon-btn { opacity: 0.55; }
  .echo-mod-row:hover .echo-icon-btn, .echo-mod-row:focus-within .echo-icon-btn { opacity: 1; }
  .echo-icon-btn {
    width: 34px; height: 34px; padding: 0; border-radius: 10px;
    display: grid; place-items: center;
    border: 1px solid var(--shl-border);
    background: var(--shl-panel);
    color: var(--shl-muted);
    cursor: pointer;
    transition: background 160ms var(--shl-ease), color 160ms var(--shl-ease), border-color 160ms var(--shl-ease), transform 160ms var(--shl-ease), box-shadow 160ms var(--shl-ease), opacity 160ms var(--shl-ease);
  }
  .echo-icon-btn svg { width: 16px; height: 16px; display: block; }
  .echo-icon-btn:hover {
    color: var(--shl-accent-strong);
    border-color: color-mix(in srgb, var(--shl-accent) 36%, var(--shl-border));
    background: color-mix(in srgb, var(--shl-accent-bg) 55%, transparent);
    transform: translateY(-1px);
  }
  .echo-icon-btn:active { transform: translateY(0) scale(0.94); }
  .echo-icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--shl-focus-ring); }
  .echo-icon-btn-danger:hover {
    color: var(--shl-danger);
    background: color-mix(in srgb, var(--shl-danger) 9%, transparent);
    border-color: color-mix(in srgb, var(--shl-danger) 30%, var(--shl-border));
  }

  /* ---- Empty state ---- */
  .echo-empty {
    display: grid; justify-items: center; gap: 6px; padding: 44px 24px 36px;
    color: var(--shl-muted); text-align: center;
    border: 1.5px dashed color-mix(in srgb, var(--shl-border-strong) 80%, transparent);
    border-radius: 18px;
    background: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--shl-accent-bg) 55%, transparent), transparent 52%);
    animation: echoFieldIn 320ms var(--shl-ease) backwards;
  }
  .echo-empty-art { width: 138px; height: 94px; color: var(--shl-accent); animation: echoEmptyFloat 6s ease-in-out infinite; }
  .echo-empty-title { margin: 6px 0 0; font-size: 15px; font-weight: 650; color: var(--theme-heading-text, inherit); }
  .echo-empty-hint { margin: 0; max-width: 44ch; font-size: 13px; line-height: 1.55; }

  /* ---- Sidebar nav ---- */
  [data-echo-external-loader-group] .nav-icon-shell { display: grid; place-items: center; }
  [data-echo-external-loader-group] .nav-icon-shell svg { width: 21px; height: 21px; display: block; }
  /* Flat sidebar (echo-steam dropped .sidebar-groups): style our injected group ourselves. */
  .sidebar > [data-echo-external-loader-group] { display: flex; flex: none; flex-direction: column; min-height: 0; margin-top: 14px; }
  .sidebar > [data-echo-external-loader-group] .sidebar-group-label {
    margin: 0 0 6px; padding: 0 12px; font-size: 10.5px; font-weight: 680;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--theme-subtle-text, var(--theme-muted-text, #a0a4aa));
  }
  .sidebar > [data-echo-external-loader-group] .nav-list { display: flex; flex-direction: column; gap: 5px; }
  .app-shell--sidebar-icon-only .sidebar > [data-echo-external-loader-group] .sidebar-group-label,
  .sidebar[data-icon-only] > [data-echo-external-loader-group] .sidebar-group-label { display: none; }
  @media (max-width: 980px) {
    .sidebar > [data-echo-external-loader-group] { flex-direction: row; margin-top: 0; align-items: center; }
    .sidebar > [data-echo-external-loader-group] .sidebar-group-label { display: none; }
    .sidebar > [data-echo-external-loader-group] .nav-list { flex-direction: row; min-width: max-content; }
  }

  /* ---- Loader status page ---- */
  .echo-status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(158px, 1fr)); gap: 10px; }
  .echo-status-chip {
    display: flex; align-items: flex-start; gap: 11px;
    padding: 14px 15px; border-radius: 14px;
    background: var(--shl-panel);
    border: 1px solid var(--shl-border);
    transition: transform 180ms var(--shl-ease), border-color 180ms var(--shl-ease), box-shadow 180ms var(--shl-ease);
  }
  .echo-status-chip:hover {
    transform: translateY(-1px);
    border-color: var(--shl-border-strong);
    box-shadow: var(--shl-shadow-soft);
  }
  .echo-status-dot {
    width: 8px; height: 8px; margin-top: 4px; border-radius: 50%; flex: none;
    background: var(--shl-accent);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--shl-accent) 15%, transparent);
  }
  .echo-status-chip[data-tone="ok"] .echo-status-dot {
    background: var(--shl-success);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--shl-success) 14%, transparent);
  }
  .echo-status-chip[data-tone="warn"] .echo-status-dot {
    background: var(--shl-warning);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--shl-warning) 16%, transparent);
  }
  .echo-status-chip[data-tone="muted"] .echo-status-dot {
    background: var(--shl-subtle);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--shl-subtle) 14%, transparent);
  }
  .echo-status-chip small {
    display: block; color: var(--shl-subtle);
    font: 650 10.5px var(--shl-font); letter-spacing: 0.07em; text-transform: uppercase;
  }
  .echo-status-chip strong {
    display: block; margin-top: 4px; color: var(--theme-heading-text, inherit);
    font: 650 13.5px var(--shl-font); font-variant-numeric: tabular-nums;
  }

  /* ---- Appearance settings ---- */
  .echo-appearance-hint { margin: 0 0 4px; color: var(--shl-muted); font-size: 12.5px; line-height: 1.5; }
  .echo-appearance-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
  .echo-appearance-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    min-height: 54px; padding: 10px 15px; box-sizing: border-box; border-radius: 14px;
    background: var(--shl-panel);
    border: 1px solid var(--shl-border);
    transition: border-color 180ms var(--shl-ease), box-shadow 180ms var(--shl-ease);
  }
  .echo-appearance-row:hover { border-color: var(--shl-border-strong); }
  .echo-appearance-row > strong { font: 600 13px var(--shl-font); color: var(--theme-heading-text, inherit); }
  .echo-appearance-row select {
    height: 32px; padding: 0 28px 0 10px; box-sizing: border-box; flex: none; max-width: 150px;
    appearance: none; cursor: pointer;
    border: 1px solid var(--shl-field-border);
    border-radius: 9px;
    background: var(--shl-field-bg);
    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position: calc(100% - 14px) calc(50% - 2px), calc(100% - 9px) calc(50% - 2px);
    background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
    color: inherit; font: 12px var(--shl-font);
    transition: border-color 160ms var(--shl-ease), box-shadow 160ms var(--shl-ease);
  }
  .echo-appearance-row select:focus {
    outline: none; border-color: var(--shl-accent);
    box-shadow: 0 0 0 3px var(--shl-focus-ring);
  }
  .echo-appearance-color { display: flex; align-items: center; gap: 6px; flex: none; }
  .echo-appearance-color input[type="color"] {
    width: 34px; height: 26px; padding: 2px; cursor: pointer;
    border: 1px solid var(--shl-field-border);
    border-radius: 8px; background: var(--shl-field-bg);
  }
  .echo-appearance-color button {
    height: 26px; padding: 0 9px; cursor: pointer; font: 600 11px var(--shl-font);
    border: 1px solid var(--shl-border);
    border-radius: 8px; background: var(--shl-panel);
    color: var(--shl-muted);
    transition: color 160ms var(--shl-ease), border-color 160ms var(--shl-ease), background 160ms var(--shl-ease);
  }
  .echo-appearance-color button:hover {
    color: var(--theme-heading-text, inherit);
    border-color: var(--shl-border-strong);
    background: var(--shl-row-hover);
  }
  .echo-appearance-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }

  /* ---- Debug console ---- */
  .echo-debug-console {
    display: grid; grid-template-rows: auto 1fr auto; min-height: 320px; max-height: calc(100vh - 280px);
    border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 14px; overflow: hidden;
    background: linear-gradient(180deg, #10141d, #0b0e15); color: #d7deea;
    font: 12px/1.55 var(--shl-mono);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 10px 30px rgba(8, 10, 15, 0.28);
    transition: border-color 180ms var(--shl-ease);
  }
  .echo-debug-console:focus-within { border-color: color-mix(in srgb, var(--shl-accent) 55%, rgba(255, 255, 255, 0.08)); }
  .echo-debug-toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 9px 12px; background: rgba(255, 255, 255, 0.035); color: #8b93a7;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .echo-debug-toolbar-left { display: inline-flex; align-items: center; gap: 10px; min-width: 0; font-size: 11px; }
  .echo-debug-dots { display: inline-flex; gap: 5px; flex: none; }
  .echo-debug-dots i { width: 9px; height: 9px; border-radius: 50%; opacity: 0.85; }
  .echo-debug-dots i:nth-child(1) { background: #ff5f57; }
  .echo-debug-dots i:nth-child(2) { background: #febc2e; }
  .echo-debug-dots i:nth-child(3) { background: #28c840; }
  .echo-debug-clear {
    min-height: 26px; padding: 3px 10px; border-radius: 7px;
    border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.05);
    color: #aeb7c9; font: 600 11px var(--shl-font); cursor: pointer;
    transition: background 160ms var(--shl-ease), color 160ms var(--shl-ease);
  }
  .echo-debug-clear:hover { background: rgba(255, 255, 255, 0.1); color: #e8eef7; }
  .echo-debug-output {
    margin: 0; padding: 12px 14px; overflow: auto; white-space: pre-wrap; word-break: break-word;
    min-height: 220px; color: #c8d0dc;
    scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
  }
  .echo-debug-output::-webkit-scrollbar { width: 8px; }
  .echo-debug-output::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.16); border-radius: 99px; }
  .echo-debug-output .echo-debug-in { color: #9ad4ff; }
  .echo-debug-output .echo-debug-err { color: #ff8b8b; }
  .echo-debug-form {
    display: grid; grid-template-columns: auto 1fr; gap: 9px; align-items: center;
    padding: 10px 13px; background: rgba(255, 255, 255, 0.03); border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .echo-debug-form span { color: #7dffb3; font-weight: 700; }
  .echo-debug-form input {
    width: 100%; border: 0; outline: none; background: transparent; color: #e8eef7;
    font: inherit; caret-color: #7dffb3;
  }
  .echo-debug-form input::placeholder { color: rgba(139, 147, 167, 0.5); }

  /* ---- Inject popup ---- */
  .echo-inject-popup {
    position: fixed; right: 20px; bottom: calc(var(--player-height, 112px) + 16px); z-index: 60;
    display: flex; align-items: center; gap: 12px; min-width: 250px;
    padding: 13px 16px 13px 13px; box-sizing: border-box;
    background: var(--shl-glass);
    color: var(--theme-page-text, inherit);
    border: 1px solid var(--shl-border);
    border-radius: 15px;
    box-shadow: var(--shl-shadow-panel);
    backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4);
    font-family: var(--shl-font);
    pointer-events: none;
    animation: shinawaseInjectIn 300ms var(--shl-spring);
  }
  .echo-inject-popup.echo-inject-popup-out { animation: shinawaseInjectOut 220ms var(--shl-ease) forwards; }
  .echo-inject-popup-icon {
    display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; flex: none;
    color: var(--shl-accent);
    background: color-mix(in srgb, var(--shl-accent) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-accent) 24%, transparent);
  }
  .echo-inject-popup-icon svg { width: 20px; height: 20px; display: block; }
  .echo-inject-popup-body { flex: 1; min-width: 0; }
  .echo-inject-popup-title { font-size: 13.5px; font-weight: 650; line-height: 1.3; letter-spacing: -0.01em; }
  .echo-inject-popup-sub { margin-top: 2px; font-size: 12px; color: var(--shl-muted); }
  .echo-inject-popup-track {
    margin-top: 9px; height: 3px; border-radius: 999px; overflow: hidden;
    background: color-mix(in srgb, var(--shl-subtle) 26%, transparent);
  }
  .echo-inject-popup-fill {
    display: block; height: 100%; width: 0; border-radius: inherit;
    background: linear-gradient(90deg, var(--shl-accent), color-mix(in srgb, var(--shl-accent) 65%, #fff));
    animation: shinawaseInjectFill 3s linear forwards;
  }

  /* ---- Density: compact ---- */
  [data-density="compact"] .echo-mod-page { padding: 20px 24px 100px; gap: 14px; }
  [data-density="compact"] .echo-mod-header h1 { font-size: 22px; }
  [data-density="compact"] .echo-mod-header p { margin-top: 4px; font-size: 13px; }
  [data-density="compact"] .echo-mod-row { min-height: 56px; padding: 8px 12px; gap: 10px; grid-template-columns: 36px minmax(0, 1fr) auto; border-radius: 12px; }
  [data-density="compact"] .echo-mod-icon { width: 36px; height: 36px; border-radius: 11px; font-size: 13px; }
  [data-density="compact"] .echo-mod-copy strong { font-size: 13px; }
  [data-density="compact"] .echo-mod-copy em { margin-top: 2px; }
  [data-density="compact"] .echo-mod-meta { margin-top: 5px; }
  [data-density="compact"] .echo-mod-drop { min-height: 42px; padding: 8px 14px; }
  [data-density="compact"] .echo-mod-list { gap: 8px; }
  [data-density="compact"] .echo-status-chip { padding: 10px 12px; }
  [data-density="compact"] .echo-appearance-row { min-height: 44px; padding: 7px 12px; }
  [data-density="compact"] .echo-icon-btn { width: 30px; height: 30px; }

  /* ---- Layout: grid ---- */
  .echo-mod-list[data-layout="grid"] {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px;
  }
  .echo-mod-list[data-layout="grid"] .echo-mod-row {
    grid-template-columns: 40px minmax(0, 1fr); grid-template-rows: auto auto; align-items: start; align-content: space-between;
  }
  .echo-mod-list[data-layout="grid"] .echo-mod-icon { width: 40px; height: 40px; border-radius: 12px; font-size: 15px; }
  .echo-mod-list[data-layout="grid"] .echo-mod-copy strong { white-space: normal; }
  .echo-mod-list[data-layout="grid"] .echo-mod-row-actions { grid-column: 1 / -1; justify-content: flex-end; }

  /* ---- Keyframes ---- */
  @keyframes echoToastIn {
    from { opacity: 0; transform: translateX(18px) scale(0.97); }
    to { opacity: 1; transform: translateX(0) scale(1); }
  }
  @keyframes echoToastOut {
    from { opacity: 1; transform: translateX(0) scale(1); }
    to { opacity: 0; transform: translateX(14px) scale(0.97); }
  }
  @keyframes echoOverlayIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes echoOverlayOut { from { opacity: 1; } to { opacity: 0; } }
  @keyframes echoCardIn {
    from { opacity: 0; transform: translateY(14px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes echoCardOut {
    from { opacity: 1; transform: translateY(0) scale(1); }
    to { opacity: 0; transform: translateY(8px) scale(0.98); }
  }
  @keyframes echoRowIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes echoFieldIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes echoEmptyFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }
  @keyframes shinawaseInjectIn {
    from { opacity: 0; transform: translateY(10px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes shinawaseInjectOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(8px); }
  }
  @keyframes shinawaseInjectFill { from { width: 0 } to { width: 100% } }

  /* ---- Motion + input preferences ---- */
  @media (prefers-reduced-motion: reduce) {
    .echo-external-mod-panel *, .echo-external-loader-panel *, .echo-external-mod-page *,
    .echo-toast, .echo-toast *, .echo-toast-stack *,
    .echo-config-overlay, .echo-config-overlay *,
    .echo-inject-popup, .echo-inject-popup * {
      animation-duration: 0.01ms !important;
      animation-delay: 0ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
    .echo-mod-row:hover, .echo-status-chip:hover, .echo-icon-btn:hover,
    .echo-mod-icon, .echo-drop-icon { transform: none !important; }
  }
  @media (hover: none) {
    .echo-mod-row .echo-icon-btn { opacity: 1; }
  }
  @media (max-width: 760px) {
    .echo-mod-header, .echo-mod-toolbar { flex-direction: column; align-items: stretch; }
    .echo-mod-actions { justify-content: flex-end; }
    .echo-mod-row { grid-template-columns: 48px minmax(0, 1fr); }
    .echo-mod-row-actions { grid-column: 1 / -1; justify-content: flex-end; padding-top: 2px; }
    .echo-toast-stack { right: 12px; left: 12px; align-items: stretch; }
    .echo-toast { max-width: none; }
  }
`;
const accentCss = document.createElement('style');
accentCss.id = 'echo-loader-ui-accent';
const motionCss = document.createElement('style');
motionCss.id = 'echo-loader-ui-motion';
document.head.append(css, accentCss, motionCss);

const loaderSurfaces = '.echo-external-mod-panel, .echo-external-loader-panel, .echo-external-mod-page, .echo-config-overlay, .echo-toast-stack, .echo-toast, .echo-inject-popup, [data-echo-external-loader-group]';
const hexToRgba = (hex, alpha) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return 'rgba(' + ((value >> 16) & 255) + ',' + ((value >> 8) & 255) + ',' + (value & 255) + ',' + alpha + ')';
};
const noMotionText = loaderSurfaces + ', ' + loaderSurfaces.split(', ').map((part) => part + ' *').join(', ') +
  ' { animation: none !important; transition: none !important; }\n  .echo-mod-row:hover, .echo-status-chip:hover, .echo-icon-btn:hover, .echo-mod-icon, .echo-drop-icon { transform: none !important; }';

let toastStack = null;
const ensureToastStack = () => {
  if (!toastStack || !toastStack.isConnected) {
    toastStack = document.createElement('div');
    toastStack.className = 'echo-toast-stack';
    document.body.append(toastStack);
  }
  return toastStack;
};
const dismissToast = (el) => {
  if (!el.isConnected || el.dataset.leaving === 'true') return;
  el.dataset.leaving = 'true';
  if (reduceMotion() || uiSettings.animations === false) { el.remove(); return; }
  el.classList.add('is-leaving');
  window.setTimeout(() => el.remove(), 240);
};

// echo-steam dropped several legacy theme variables that older mods (and this
// UI) still reference. When they are missing but the new token set is present,
// bridge them once so var() fallbacks and color-mix() usages keep resolving.
let legacyThemeBridge = null;
const ensureLegacyThemeVars = () => {
  if (legacyThemeBridge?.isConnected) return;
  const rootStyle = getComputedStyle(document.documentElement);
  const missing = (name) => !rootStyle.getPropertyValue(name).trim();
  if (!missing('--theme-accent')) return;
  if (missing('--theme-accent-solid-bg') && missing('--color-accent')) return;
  legacyThemeBridge = document.createElement('style');
  legacyThemeBridge.id = 'echo-loader-legacy-theme-bridge';
  legacyThemeBridge.textContent = `:root {
    --theme-accent: var(--theme-accent-solid-bg, var(--color-accent, #4b55e8));
    --theme-code-bg: var(--theme-field-bg, rgba(16,18,24,0.04));
    --theme-border: var(--theme-panel-border-strong, var(--color-border-strong, rgba(38,40,46,0.18)));
    --theme-card-bg: var(--theme-panel-bg, var(--color-surface, rgba(255,255,255,0.76)));
    --theme-card-border: var(--theme-panel-border, var(--color-border, rgba(38,40,46,0.1)));
    --theme-hover-bg: var(--theme-list-row-bg-hover, var(--theme-button-bg-hover, rgba(255,255,255,0.92)));
    --theme-surface: var(--color-surface, var(--theme-panel-bg, rgba(255,255,255,0.76)));
  }`;
  document.head.append(legacyThemeBridge);
};

const toast = (text, type = 'info') => {
  const stack = ensureToastStack();
  while (stack.childElementCount >= 3) stack.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = 'echo-toast ' + type;
  el.setAttribute('role', 'status');
  const icon = type === 'success' ? iconCheck : type === 'error' ? iconCross : type === 'warn' ? iconWarn : iconInfo;
  el.innerHTML = '<span class="echo-toast-icon" aria-hidden="true">' + icon + '</span><span class="echo-toast-msg"></span>';
  el.querySelector('.echo-toast-msg').textContent = String(text);
  el.addEventListener('click', () => dismissToast(el));
  stack.append(el);
  window.setTimeout(() => dismissToast(el), 3600);
};
window.__echoModToast = toast;

const api = async (path, options) => {
  const res = await fetch(base + path, options);
  const val = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(val.error || 'request failed (' + res.status + ')');
  return val;
};

const syncModsToolbar = () => {
  if (!modsPanel) return;
  const sortSelect = modsPanel.querySelector('[data-sort]');
  if (sortSelect && sortSelect.value !== currentSort) sortSelect.value = currentSort;
  modsPanel.querySelectorAll('[data-filter]').forEach((chip) => chip.classList.toggle('active', chip.dataset.filter === currentFilter));
};

const applyUiSettings = () => {
  const density = uiSettings.density === 'compact' ? 'compact' : 'comfortable';
  const panels = [modsPanel, loaderPanel, ...sidebarPages.values()];
  panels.forEach((panel) => { if (panel) panel.dataset.density = density; });
  const list = modsPanel?.querySelector('[data-mod-list]');
  if (list) list.dataset.layout = uiSettings.cardLayout === 'grid' ? 'grid' : 'list';
  accentCss.textContent = /^#[0-9a-f]{6}$/i.test(uiSettings.accentColor || '')
    ? loaderSurfaces + ' { --theme-accent: ' + uiSettings.accentColor + '; --theme-accent-bg: ' + hexToRgba(uiSettings.accentColor, 0.14) + '; --theme-accent-text-strong: ' + uiSettings.accentColor + '; --theme-accent-solid-bg: ' + uiSettings.accentColor + '; }'
    : '';
  motionCss.textContent = uiSettings.animations === false ? noMotionText : '';
  syncModsToolbar();
  try { window.dispatchEvent(new CustomEvent('shinawase:ui-settings', { detail: { ...uiSettings } })); } catch {}
};

const saveUiSettings = async (patch) => {
  const next = { ...uiSettings, ...(patch && typeof patch === 'object' ? patch : {}) };
  const result = await api('/api/ui-settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ui: next }),
  });
  uiSettings = { ...defaultUiSettings, ...(result.ui || {}) };
  applyUiSettings();
  renderAppearance();
  if (modsPanel && !modsPanel.hidden) renderModList();
  return { ...uiSettings };
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
const nativeRouteEvents = ['app:navigate:lyrics', 'app:navigate:lyrics-back', 'app:navigate:route'];
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
  // Older ECHO renders a grouped sidebar (.sidebar-groups). echo-steam flattened
  // the sidebar to <aside class="sidebar"> with plain .nav-list children, so fall
  // back to the flat sidebar and slot our group above the spacer / utility nav.
  const groups = document.querySelector('.sidebar-groups');
  const flatSidebar = groups ? null : document.querySelector('aside.sidebar, .sidebar');
  const host = groups || flatSidebar;
  if (!host) return null;
  document.querySelectorAll('[data-echo-external-owned="true"]').forEach((button) => {
    if (!button.closest('[data-echo-external-loader-group]')) button.remove();
  });
  let group = document.querySelector('[data-echo-external-loader-group]');
  if (!group) {
    group = document.createElement('section');
    group.className = 'sidebar-group';
    group.dataset.echoExternalLoaderGroup = 'true';
    const heading = document.createElement('h2');
    heading.className = 'sidebar-group-label sidebar-section-label';
    heading.textContent = T.loaderGroup || 'Shinawase Loader';
    const nav = document.createElement('nav');
    nav.className = 'nav-list';
    group.append(heading, nav);
  } else {
    const heading = group.querySelector('.sidebar-group-label');
    if (heading) heading.textContent = T.loaderGroup || 'Shinawase Loader';
  }
  if (groups) {
    if (group.parentElement !== groups) groups.append(group);
  } else {
    const anchor = flatSidebar.querySelector(':scope > .sidebar-spacer') || flatSidebar.querySelector(':scope > .utility-nav');
    if (group.parentElement !== flatSidebar || (anchor && group.nextElementSibling !== anchor)) {
      if (anchor) flatSidebar.insertBefore(group, anchor);
      else flatSidebar.append(group);
    }
  }
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
  if (!loaderPanel || loaderPanel.hidden || document.hidden) return;
  try {
    const status = await api('/api/status');
    const grid = loaderPanel.querySelector('[data-status-grid]');
    const echo = status.echoTarget || {};
    const echoLabel = [echo.product, echo.version].filter(Boolean).join(' ') || (T.echoHost || 'ECHO');
    const rows = [
      [T.loader, 'v' + (status.loaderVersion || LOADER_VERSION), 'ok'],
      [T.echoProduct || T.echoHost || 'ECHO', echoLabel, echo.selected && echo.version ? 'ok' : 'muted'],
      [T.runtime || 'runtime', echo.runtime?.current ? (T.runtimeCurrent || 'aligned') + (echo.runtime.echoVersion ? ' ' + echo.runtime.echoVersion : '') : (T.runtimeStale || 'needs sync'), echo.runtime?.current ? 'ok' : 'warn'],
      [T.listen, '127.0.0.1:' + status.port, 'ok'],
      [T.cdp, String(status.debugPort), 'ok'],
      [T.inspect, String(status.inspectPort), 'ok'],
      [T.native, status.nativeHost ? String(status.nativePort) : T.off, status.nativeHost ? 'ok' : 'muted'],
      ['debug', status.debugMode ? T.on : T.off, status.debugMode ? 'warn' : 'muted'],
    ];
    grid.replaceChildren(...rows.map(([label, value, tone]) => {
      const chip = document.createElement('div');
      chip.className = 'echo-status-chip';
      chip.dataset.tone = tone;
      chip.innerHTML = '<span class="echo-status-dot"></span><div><small></small><strong></strong></div>';
      chip.querySelector('small').textContent = label;
      chip.querySelector('strong').textContent = value;
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
const consoleMaxLines = 400; // keep the live console from growing without bound
const consoleStick = (out) => out && (out.scrollHeight - out.scrollTop - out.clientHeight < 32);
const consoleAppend = (text, className, forceScroll = false) => {
  const out = loaderPanel?.querySelector('[data-console-out]');
  if (!out || !text) return;
  const stick = forceScroll || consoleStick(out);
  const line = document.createElement('div');
  if (className) line.className = className;
  line.textContent = text;
  out.append(line);
  while (out.childElementCount > consoleMaxLines) out.firstElementChild.remove();
  if (stick) out.scrollTop = out.scrollHeight;
};
const refreshDebugLog = async () => {
  if (!loaderPanel || loaderPanel.hidden || consolePaused || document.hidden) return;
  const logs = await api('/api/logs?tail=120').catch(() => null);
  const text = String(logs?.text || '');
  if (!text || text === lastLogText) return;
  const prev = lastLogText ? lastLogText.split('\n') : [];
  const next = text.split('\n');
  const added = next.length >= prev.length && next.slice(0, prev.length).join('\n') === prev.join('\n')
    ? next.slice(prev.length)
    : next;
  lastLogText = text;
  const lines = added.filter(Boolean);
  if (!lines.length) return;
  const out = loaderPanel.querySelector('[data-console-out]');
  if (!out) return;
  const stick = consoleStick(out);
  const visible = lines.length > consoleMaxLines ? lines.slice(-consoleMaxLines) : lines;
  const fragment = document.createDocumentFragment();
  visible.forEach((row) => {
    const line = document.createElement('div');
    if (/error|fail/i.test(row)) line.className = 'echo-debug-err';
    line.textContent = row;
    fragment.append(line);
  });
  out.append(fragment);
  while (out.childElementCount > consoleMaxLines) out.firstElementChild.remove();
  if (stick) out.scrollTop = out.scrollHeight;
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

const rebuildUi = async () => {
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

const applyLocale = async () => {
  const next = (typeof LOADER_LOCALE !== 'undefined' && LOADER_LOCALE === 'en') ? 'zh' : 'en';
  await api('/api/locale', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: next }) });
  if (typeof LOADER_LOCALE !== 'undefined') LOADER_LOCALE = next;
  if (typeof LOCALES !== 'undefined' && LOCALES[next]) T = LOCALES[next];
  await rebuildUi();
};

const renderAppearance = () => {
  const grid = loaderPanel?.querySelector('[data-appearance]');
  if (!grid) return;
  const row = (label, control) => {
    const el = document.createElement('div');
    el.className = 'echo-appearance-row';
    const caption = document.createElement('strong');
    caption.textContent = label;
    el.append(caption, control);
    return el;
  };
  const selectControl = (key, options) => {
    const select = document.createElement('select');
    options.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.append(option);
    });
    select.value = String(uiSettings[key]);
    select.onchange = () => void saveUiSettings({ [key]: select.value }).catch((error) => toast(error.message, 'error'));
    return select;
  };
  const switchControl = (key) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'echo-switch';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', uiSettings[key] === true ? 'true' : 'false');
    button.innerHTML = '<span class="echo-switch-thumb"></span>';
    button.onclick = () => void saveUiSettings({ [key]: uiSettings[key] !== true }).catch((error) => toast(error.message, 'error'));
    return button;
  };
  const accentControl = () => {
    const wrap = document.createElement('span');
    wrap.className = 'echo-appearance-color';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = /^#[0-9a-f]{6}$/i.test(uiSettings.accentColor || '') ? uiSettings.accentColor : '#4b55e8';
    input.onchange = () => void saveUiSettings({ accentColor: input.value }).catch((error) => toast(error.message, 'error'));
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = T.accentReset || 'Reset';
    reset.onclick = () => void saveUiSettings({ accentColor: '' }).catch((error) => toast(error.message, 'error'));
    wrap.append(input, reset);
    return wrap;
  };
  grid.replaceChildren(
    row(T.density, selectControl('density', [['comfortable', T.densityComfortable], ['compact', T.densityCompact]])),
    row(T.cardLayout, selectControl('cardLayout', [['list', T.layoutList], ['grid', T.layoutGrid]])),
    row(T.accentColor, accentControl()),
    row(T.animations, switchControl('animations')),
    row(T.showDescriptions, switchControl('showModDescriptions')),
    row(T.showVersions, switchControl('showModVersions')),
    row(T.showIds, switchControl('showModIds')),
    row(T.rememberFilters, switchControl('rememberFilters')),
  );
};

const exportLoaderSettings = async () => {
  const { ok, ...payload } = await api('/api/settings/export');
  const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'shinawase-loader-settings.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  toast(T.settingsExported || 'Settings exported', 'success');
};

const importLoaderSettings = async (file) => {
  if (!file) return;
  const payload = JSON.parse(await file.text());
  const result = await api('/api/settings/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  uiSettings = { ...defaultUiSettings, ...(result.ui || {}) };
  currentSort = uiSettings.modSort || 'name';
  if (uiSettings.rememberFilters !== false) currentFilter = uiSettings.modFilter || 'all';
  const restartHint = (result.requiresRestart || []).length ? ' · ' + (T.restartNote || '') : '';
  toast((T.settingsImported || 'Settings imported') + restartHint, 'success');
  const nextLocale = result.locale;
  if (typeof LOADER_LOCALE !== 'undefined' && typeof LOCALES !== 'undefined' && nextLocale && nextLocale !== LOADER_LOCALE && LOCALES[nextLocale]) {
    LOADER_LOCALE = nextLocale;
    T = LOCALES[nextLocale];
    await rebuildUi();
    return;
  }
  applyUiSettings();
  renderAppearance();
  if (modsPanel && !modsPanel.hidden) renderModList();
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
          <div class="echo-kicker-row">
            <span class="section-kicker">${T.loaderKicker}</span>
            <span class="echo-version-pill">v${LOADER_VERSION}</span>
          </div>
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
        <h2 class="section-title">${T.appearance}</h2>
        <p class="echo-appearance-hint">${T.appearanceHint}</p>
        <div class="echo-appearance-grid" data-appearance></div>
        <div class="echo-appearance-actions">
          <button class="settings-action-button" data-action="export-settings">${T.exportSettings}</button>
          <button class="settings-action-button" data-action="import-settings">${T.importSettings}</button>
          <input type="file" accept="application/json,.json" data-settings-file hidden>
        </div>
      </section>
      <section class="settings-section">
        <h2 class="section-title">${T.debugConsole}</h2>
        <div class="echo-debug-console">
          <div class="echo-debug-toolbar">
            <span class="echo-debug-toolbar-left">
              <span class="echo-debug-dots" aria-hidden="true"><i></i><i></i><i></i></span>
              <span>${T.consoleHint}</span>
            </span>
            <button class="echo-debug-clear" data-action="console-clear">${T.consoleClear}</button>
          </div>
          <pre class="echo-debug-output" data-console-out></pre>
          <form class="echo-debug-form" data-console-form>
            <span>&#10095;</span>
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
      const result = await api('/api/update', { method: 'POST' });
      if (!result.ok) throw new Error(result.error || T.updateFailed);
      if (result.updated && result.restart) toast(T.updateApplied + ' v' + (result.remote || ''), 'success');
      else if (result.updated) toast(T.updatePackages + (result.remote ? ' · ' + result.remote : ''), 'success');
      else toast(T.updateCurrent + (result.remote ? ' v' + result.remote : ''), 'success');
    } catch (error) { toast(T.updateFailed + ': ' + error.message, 'error'); }
  };
  loaderPanel.querySelector('[data-action="debug"]').onclick = async () => {
    const status = await api('/api/status');
    const next = !status.debugMode;
    await api('/api/debug', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: next }) });
    toast(next ? T.debugOn : T.debugOff, 'success');
    await renderStatus();
  };
  loaderPanel.querySelector('[data-action="export-settings"]').onclick = () => void exportLoaderSettings().catch((error) => toast(error.message, 'error'));
  const settingsFile = loaderPanel.querySelector('[data-settings-file]');
  loaderPanel.querySelector('[data-action="import-settings"]').onclick = () => settingsFile.click();
  settingsFile.onchange = (event) => {
    const file = event.target.files?.[0];
    settingsFile.value = '';
    if (file) void importLoaderSettings(file).catch((error) => toast((T.settingsImportFailed || 'Import failed') + ': ' + error.message, 'error'));
  };
  renderAppearance();
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
  applyUiSettings();
  await renderStatus();
  await refreshDebugLog();
  window.clearInterval(statusTimer);
  window.clearInterval(consoleTimer);
  statusTimer = window.setInterval(() => void renderStatus(), 4000);
  consoleTimer = window.setInterval(() => void refreshDebugLog(), 1500);
};

const renderEmptyState = (isSearch) => {
  const empty = document.createElement('div');
  empty.className = 'echo-empty';
  empty.innerHTML = emptyArt + '<strong class="echo-empty-title"></strong><p class="echo-empty-hint"></p>';
  empty.querySelector('.echo-empty-title').textContent = isSearch ? T.emptySearch : T.emptyMods;
  empty.querySelector('.echo-empty-hint').textContent = isSearch ? T.emptySearchHint : T.emptyModsHint;
  return empty;
};

const compareMods = (left, right) => {
  if (currentSort === 'enabled' && left.enabled !== right.enabled) return left.enabled ? -1 : 1;
  if (currentSort === 'recent') {
    const leftTime = Date.parse(left.importedAt || '') || 0;
    const rightTime = Date.parse(right.importedAt || '') || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
  }
  return String(left.name || left.id).localeCompare(String(right.name || right.id));
};

// Fetch once, render many: search, filter, sort, and appearance changes
// re-render from the cached list instead of refetching /api/mods (and
// re-encoding icons server-side) on every keystroke. Actions that change
// loader state go through loadMods.
const loadMods = async () => {
  modsCache = (await api('/api/mods')).mods || [];
  renderModList();
};
const renderModList = () => {
  if (!modsPanel) return;
  const animate = modsListAnimate;
  modsListAnimate = false;
  const list = modsPanel.querySelector('[data-mod-list]');
  list.dataset.layout = uiSettings.cardLayout === 'grid' ? 'grid' : 'list';
  const allMods = modsCache;
  const items = allMods.filter((item) => {
    const hay = ((item.name || '') + ' ' + item.id + ' ' + (item.description || '')).toLowerCase();
    if (searchQuery && !hay.includes(searchQuery.toLowerCase())) return false;
    if (currentFilter === 'active') return item.enabled;
    if (currentFilter === 'inactive') return !item.enabled;
    return true;
  }).sort(compareMods);
  modsPanel.querySelector('[data-count-all]').textContent = String(allMods.length);
  modsPanel.querySelector('[data-count-active]').textContent = String(allMods.filter((item) => item.enabled).length);
  modsPanel.querySelector('[data-count-inactive]').textContent = String(allMods.filter((item) => !item.enabled).length);
  if (!items.length) {
    list.replaceChildren(renderEmptyState(allMods.length > 0));
    return;
  }
  list.replaceChildren(...items.map((item, index) => {
    const card = document.createElement('article');
    card.className = 'echo-mod-row';
    card.dataset.enabled = String(item.enabled === true);
    if (animate) {
      card.classList.add('is-entering');
      card.style.setProperty('--row-i', String(Math.min(index, 8)));
    }
    card.innerHTML = '<span class="echo-mod-icon"></span><div class="echo-mod-copy"><strong></strong><em data-desc></em><div class="echo-mod-meta"><span class="echo-badge echo-badge-state" data-state><i aria-hidden="true"></i></span><span class="echo-badge echo-badge-version" data-version></span><span class="echo-badge echo-badge-id" data-id></span></div></div><div class="echo-mod-row-actions"></div>';
    const icon = card.querySelector('.echo-mod-icon');
    if (item.iconDataUrl) {
      const img = document.createElement('img');
      img.src = item.iconDataUrl;
      img.alt = '';
      icon.replaceChildren(img);
    } else {
      icon.textContent = (item.name || item.id || '?').slice(0, 1).toUpperCase();
    }
    const title = card.querySelector('strong');
    title.textContent = item.name || item.id;
    title.title = item.name || item.id;
    const desc = card.querySelector('[data-desc]');
    desc.textContent = item.description || item.id;
    desc.hidden = uiSettings.showModDescriptions === false;
    const state = card.querySelector('[data-state]');
    state.dataset.on = String(item.enabled === true);
    state.append(document.createTextNode(item.enabled ? (T.enabled || 'On') : (T.disabled || 'Off')));
    const versionBadge = card.querySelector('[data-version]');
    versionBadge.textContent = 'v' + (item.version || '1.0.0');
    versionBadge.hidden = uiSettings.showModVersions === false;
    const idBadge = card.querySelector('[data-id]');
    idBadge.textContent = item.id;
    idBadge.title = item.id;
    idBadge.hidden = uiSettings.showModIds === false;
    card.querySelector('.echo-mod-meta').hidden = versionBadge.hidden && idBadge.hidden;
    const actions = card.querySelector('.echo-mod-row-actions');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'echo-switch';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', item.enabled ? 'true' : 'false');
    toggle.title = item.enabled ? (T.disableMod || T.disabled) : (T.enableMod || T.enabled);
    toggle.innerHTML = '<span class="echo-switch-thumb"></span>';
    toggle.onclick = async () => {
      await api('/api/mod/' + encodeURIComponent(item.id) + '/' + (item.enabled ? 'disable' : 'enable'), { method: 'POST' });
      await loadMods();
    };
    const config = document.createElement('button');
    config.type = 'button';
    config.className = 'echo-icon-btn';
    config.title = T.config || 'Config';
    config.setAttribute('aria-label', T.config || 'Config');
    config.innerHTML = iconGear;
    config.onclick = () => openConfigModal(item.id, item.name || item.id);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'echo-icon-btn echo-icon-btn-danger';
    remove.title = T.remove || T.removed;
    remove.setAttribute('aria-label', T.remove || T.removed);
    remove.innerHTML = iconTrash;
    remove.onclick = async () => {
      if (!confirm(item.id)) return;
      await api('/api/mod/' + encodeURIComponent(item.id), { method: 'DELETE' });
      await loadMods();
    };
    actions.append(toggle, config, remove);
    return card;
  }));
};

const teardownConfigModal = (immediate = false) => {
  window.clearTimeout(configModalTimer);
  configModalTimer = 0;
  const finish = () => {
    try { configModalCleanup?.(); } catch {}
    configModalCleanup = null;
    configModal?.remove();
    configModal = null;
  };
  if (!configModal || immediate || reduceMotion() || configModal.classList.contains('is-leaving')) {
    finish();
    return;
  }
  configModal.classList.add('is-leaving');
  configModalTimer = window.setTimeout(() => {
    configModalTimer = 0;
    finish();
  }, 180);
};

const openConfigModal = async (modId, modName) => {
  teardownConfigModal(true);
  configModal = document.createElement('div');
  configModal.className = 'echo-config-overlay';
  const card = document.createElement('div');
  card.className = 'echo-config-card';
  card.innerHTML = '<header><div class="echo-config-heading"><span class="echo-config-kicker"></span><strong data-title></strong></div><button class="echo-icon-btn echo-config-close" type="button" data-close>' + iconCross + '</button></header><div class="echo-config-body" data-body></div><p class="echo-config-error" data-error></p><footer data-footer><button class="settings-action-button" type="button" data-close>' + T.close + '</button><button class="settings-action-button echo-btn-primary" type="button" data-save>' + (T.save || 'Save') + '</button></footer>';
  card.querySelector('.echo-config-kicker').textContent = T.config || 'Config';
  card.querySelector('[data-title]').textContent = modName;
  const closeIcon = card.querySelector('.echo-config-close');
  closeIcon.setAttribute('aria-label', T.close);
  closeIcon.title = T.close;
  configModal.append(card);
  (document.querySelector('.app-shell') || document.body).append(configModal);
  const body = card.querySelector('[data-body]');
  const errorNode = card.querySelector('[data-error]');
  const saveBtn = card.querySelector('[data-save]');
  const footer = card.querySelector('[data-footer]');
  let customCleanup = null;
  let saveHandler = null;
  const close = () => teardownConfigModal(false);
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  configModalCleanup = () => {
    window.removeEventListener('keydown', onKey);
    try { customCleanup?.(); } catch {}
    customCleanup = null;
  };
  configModal.addEventListener('mousedown', (event) => { if (event.target === configModal) close(); });
  configModal.querySelectorAll('[data-close]').forEach((button) => { button.onclick = close; });

  const setSaveVisible = (visible) => {
    saveBtn.hidden = !visible;
    footer.dataset.saveHidden = visible ? 'false' : 'true';
  };
  const putConfig = async (next) => {
    const result = await api('/api/mod/' + encodeURIComponent(modId) + '/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config: next }),
    });
    return result.config;
  };
  const readDraftFrom = (container) => {
    const area = container.querySelector('[data-json]');
    if (area) return JSON.parse(area.value || '{}');
    const next = {};
    container.querySelectorAll('[data-key]').forEach((input) => {
      const key = input.dataset.key;
      if (input.type === 'checkbox') next[key] = input.checked;
      else if (input.dataset.kind === 'integer') next[key] = Number.parseInt(input.value, 10);
      else if (input.dataset.kind === 'number') next[key] = Number(input.value);
      else if (input.dataset.kind === 'json') next[key] = JSON.parse(input.value || input.dataset.empty || '{}');
      else next[key] = input.value;
    });
    return next;
  };
  const readDraft = () => readDraftFrom(body);
  const fieldCaption = (field, spec, key) => {
    const caption = document.createElement('span');
    caption.className = 'echo-config-label';
    caption.textContent = spec.title || key;
    field.append(caption);
    if (spec.description) {
      const desc = document.createElement('span');
      desc.className = 'echo-config-desc';
      desc.textContent = spec.description;
      field.append(desc);
    }
  };
  const resolvedValue = (draft, key, spec) => {
    if (Object.prototype.hasOwnProperty.call(draft, key) && draft[key] != null) return draft[key];
    if (Object.prototype.hasOwnProperty.call(spec, 'default')) return spec.default;
    return undefined;
  };
  const renderJsonEditorInto = (container, config) => {
    const wrap = document.createElement('div');
    wrap.className = 'echo-config-json-wrap';
    const label = document.createElement('span');
    label.className = 'echo-config-label';
    label.textContent = T.jsonEditor || 'JSON';
    const hint = document.createElement('span');
    hint.className = 'echo-config-desc';
    hint.textContent = T.jsonHint || '';
    const area = document.createElement('textarea');
    area.className = 'echo-config-json';
    area.dataset.json = 'true';
    area.value = JSON.stringify(config && typeof config === 'object' ? config : {}, null, 2);
    wrap.append(label, hint, area);
    container.append(wrap);
  };
  const renderJsonEditor = (config) => renderJsonEditorInto(body, config);
  const renderFieldsInto = (container, schema, config) => {
    const draft = config && typeof config === 'object' && !Array.isArray(config) ? { ...config } : {};
    const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : null;
    if (!props || !Object.keys(props).length) {
      renderJsonEditorInto(container, draft);
      return;
    }
    Object.entries(props).forEach(([key, rawSpec]) => {
      const spec = rawSpec && typeof rawSpec === 'object' ? rawSpec : {};
      const field = document.createElement('label');
      field.className = 'echo-config-field';
      fieldCaption(field, spec, key);
      const value = resolvedValue(draft, key, spec);
      if (spec.type === 'boolean') {
        const box = document.createElement('span');
        box.className = 'echo-switch-field';
        const sw = document.createElement('span');
        sw.className = 'echo-switch-box';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.key = key;
        input.checked = value === true;
        const track = document.createElement('span');
        track.className = 'echo-switch-track';
        sw.append(input, track);
        box.append(sw);
        field.append(box);
      } else if (Array.isArray(spec.enum) && spec.enum.length) {
        const select = document.createElement('select');
        select.dataset.key = key;
        spec.enum.forEach((optionValue) => {
          const option = document.createElement('option');
          option.value = String(optionValue);
          option.textContent = String(optionValue);
          if (String(value ?? spec.enum[0]) === String(optionValue)) option.selected = true;
          select.append(option);
        });
        field.append(select);
      } else if (spec.type === 'object' || spec.type === 'array') {
        const area = document.createElement('textarea');
        area.className = 'echo-config-json';
        area.dataset.key = key;
        area.dataset.kind = 'json';
        area.dataset.empty = spec.type === 'array' ? '[]' : '{}';
        const fallback = spec.type === 'array' ? [] : {};
        area.value = JSON.stringify(value === undefined ? (Object.prototype.hasOwnProperty.call(spec, 'default') ? spec.default : fallback) : value, null, 2);
        field.append(area);
      } else {
        const input = document.createElement('input');
        input.dataset.key = key;
        if (spec.type === 'integer' || spec.type === 'number') {
          input.type = 'number';
          input.dataset.kind = spec.type;
          if (spec.minimum != null) input.min = String(spec.minimum);
          if (spec.maximum != null) input.max = String(spec.maximum);
        } else input.type = 'text';
        input.value = value == null ? '' : String(value);
        field.append(input);
      }
      if (Object.prototype.hasOwnProperty.call(spec, 'default') && spec.type !== 'boolean') {
        const hint = document.createElement('span');
        hint.className = 'echo-config-default';
        hint.textContent = (T.defaultHint || 'Default') + ': ' + (typeof spec.default === 'string' ? spec.default : JSON.stringify(spec.default));
        field.append(hint);
      }
      container.append(field);
    });
  };
  const renderFields = (schema, config) => renderFieldsInto(body, schema, config);
  const schemaDefaults = (schema) => {
    const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const defaults = {};
    Object.entries(props).forEach(([key, spec]) => {
      if (spec && typeof spec === 'object' && Object.prototype.hasOwnProperty.call(spec, 'default')) defaults[key] = cloneValue(spec.default);
    });
    return defaults;
  };
  const bindSchemaSave = () => {
    setSaveVisible(true);
    saveBtn.onclick = async () => {
      try {
        errorNode.textContent = '';
        const parsed = readDraft();
        await putConfig(parsed);
        toast(T.configSaved || 'OK', 'success');
        close();
      } catch (error) { errorNode.textContent = error.message; }
    };
  };
  const fallbackToSchema = (schema, config, reason) => {
    body.replaceChildren();
    card.removeAttribute('data-custom');
    saveHandler = null;
    if (reason) {
      errorNode.textContent = T.configFallback || reason;
      toast(T.configFallback || reason, 'warn');
    }
    try {
      renderFields(schema, config || {});
    } catch (error) {
      body.replaceChildren();
      renderJsonEditor(config || {});
      errorNode.textContent = error.message;
    }
    bindSchemaSave();
  };
  const mountCustomPage = async (scriptPath, payload) => {
    const path = String(scriptPath || '').replaceAll('\\', '/');
    const response = await fetch(base + '/api/mod/' + encodeURIComponent(modId) + '/file/' + encodeURIComponent(path));
    if (!response.ok) throw new Error('mod_config_ui_http_' + response.status);
    const source = await response.text();
    const assetUrl = (filePath) => base + '/api/mod/' + encodeURIComponent(modId) + '/file/' + encodeURIComponent(String(filePath || '').replaceAll('\\', '/'));
    const loadAsset = async (filePath, options = {}) => {
      const asset = await fetch(assetUrl(filePath));
      if (!asset.ok) throw new Error('mod_asset_http_' + asset.status);
      return options.binary === true ? asset.arrayBuffer() : asset.text();
    };
    card.dataset.custom = 'true';
    setSaveVisible(false);
    saveBtn.onclick = async () => {
      try {
        errorNode.textContent = '';
        if (!saveHandler) return;
        const next = await saveHandler();
        if (next && typeof next === 'object' && !Array.isArray(next)) await putConfig(next);
        toast(T.configSaved || 'OK', 'success');
        close();
      } catch (error) { errorNode.textContent = error.message; }
    };
    const context = {
      root: body,
      modId,
      manifest: payload.manifest || {},
      schema: payload.schema || null,
      config: cloneValue(payload.config || {}),
      save: async (next) => {
        const saved = await putConfig(next);
        toast(T.configSaved || 'OK', 'success');
        return saved;
      },
      close,
      toast: (message, type) => toast(message, type || 'info'),
      onSave: (fn) => {
        saveHandler = typeof fn === 'function' ? fn : null;
        setSaveVisible(Boolean(saveHandler));
      },
      assetUrl,
      loadAsset,
      defaults: () => schemaDefaults(payload.schema),
      loaderSettings: () => ({ ...uiSettings }),
      ui: {
        form: (formSchema, formConfig) => {
          const wrap = document.createElement('div');
          wrap.className = 'echo-config-form';
          const schemaValue = formSchema === undefined ? payload.schema : formSchema;
          const configValue = cloneValue(formConfig === undefined ? payload.config : formConfig);
          renderFieldsInto(wrap, schemaValue, configValue && typeof configValue === 'object' ? configValue : {});
          return { element: wrap, read: () => readDraftFrom(wrap) };
        },
        field: (key, spec = {}, value) => {
          const name = String(key);
          const wrap = document.createElement('div');
          wrap.className = 'echo-config-form';
          renderFieldsInto(wrap, { properties: { [name]: spec } }, value === undefined ? {} : { [name]: value });
          return { element: wrap, read: () => readDraftFrom(wrap)[name] };
        },
      },
    };
    const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
    const run = new AsyncFn('echoConfigUi', '"use strict";\n' + source);
    const cleanup = await run(context);
    if (typeof cleanup === 'function') customCleanup = cleanup;
  };

  try {
    const response = await api('/api/mod/' + encodeURIComponent(modId) + '/config');
    const manifest = response.manifest || {};
    if (typeof manifest.configUi === 'string') {
      try {
        await mountCustomPage(manifest.configUi, response);
      } catch (error) {
        fallbackToSchema(response.schema, response.config || {}, error.message);
      }
    } else {
      fallbackToSchema(response.schema, response.config || {});
    }
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
  await loadMods();
};

const openMods = async () => {
  if (modsPanel) {
    modsListAnimate = true;
    showPanel(modsPanel, modsButton);
    await loadMods();
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
        <div class="echo-search">
          <span class="echo-search-icon">${iconSearch}</span>
          <input class="echo-search-box" type="search" data-search placeholder="${T.searchMods}">
          <button class="echo-search-clear" type="button" data-search-clear hidden>${iconCross}</button>
        </div>
        <div class="echo-mod-filters">
          <button class="list-filter-chip echo-filter active" data-filter="all">${T.filterAll}<span class="echo-filter-count" data-count-all>0</span></button>
          <button class="list-filter-chip echo-filter" data-filter="active">${T.filterOn}<span class="echo-filter-count" data-count-active>0</span></button>
          <button class="list-filter-chip echo-filter" data-filter="inactive">${T.filterOff}<span class="echo-filter-count" data-count-inactive>0</span></button>
        </div>
        <select class="echo-sort-select" data-sort aria-label="${T.sortMods}" title="${T.sortMods}">
          <option value="name">${T.sortName}</option>
          <option value="recent">${T.sortRecent}</option>
          <option value="enabled">${T.sortEnabled}</option>
        </select>
      </div>
      <div class="echo-mod-drop" data-dropzone>
        <span class="echo-drop-icon" aria-hidden="true">${iconUpload}</span>
        <span data-drop-label></span>
      </div>
      <div class="echo-mod-list" data-mod-list></div>
    </div>
  `);
  modsListAnimate = true;
  showPanel(modsPanel, modsButton);
  const fileInput = modsPanel.querySelector('[data-file]');
  const dropLabel = modsPanel.querySelector('[data-drop-label]');
  dropLabel.textContent = T.dropHint;
  modsPanel.querySelector('[data-action="import"]').onclick = () => fileInput.click();
  fileInput.onchange = (event) => { const file = event.target.files?.[0]; if (file) processFileImport(file); fileInput.value = ''; };
  const dropzone = modsPanel.querySelector('[data-dropzone]');
  dropzone.onclick = () => fileInput.click();
  dropzone.ondragover = (event) => {
    event.preventDefault();
    dropzone.classList.add('is-over');
    dropLabel.textContent = T.dropActive || T.dropHint;
  };
  dropzone.ondragleave = (event) => {
    if (dropzone.contains(event.relatedTarget)) return;
    dropzone.classList.remove('is-over');
    dropLabel.textContent = T.dropHint;
  };
  dropzone.ondrop = (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-over');
    dropLabel.textContent = T.dropHint;
    const file = event.dataTransfer?.files?.[0];
    if (file) processFileImport(file);
  };
  const searchInput = modsPanel.querySelector('[data-search]');
  const searchClear = modsPanel.querySelector('[data-search-clear]');
  searchInput.value = searchQuery;
  searchClear.hidden = !searchQuery;
  searchInput.oninput = () => {
    searchQuery = searchInput.value;
    searchClear.hidden = !searchQuery;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { searchTimer = 0; renderModList(); }, 150);
  };
  searchClear.onclick = () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.hidden = true;
    searchInput.focus();
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    renderModList();
  };
  const persistListPrefs = () => {
    if (uiSettings.rememberFilters === false) return;
    uiSettings = { ...uiSettings, modSort: currentSort, modFilter: currentFilter };
    void api('/api/ui-settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ui: uiSettings }),
    }).catch(() => {});
  };
  modsPanel.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.onclick = () => {
      modsPanel.querySelectorAll('[data-filter]').forEach((node) => node.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      persistListPrefs();
      renderModList();
    };
  });
  const sortSelect = modsPanel.querySelector('[data-sort]');
  sortSelect.value = currentSort;
  sortSelect.onchange = () => {
    currentSort = sortSelect.value;
    persistListPrefs();
    renderModList();
  };
  modsPanel.querySelector('[data-action="reinject"]').onclick = async () => {
    const result = await api('/api/reinject', { method: 'POST' });
    toast(String(result.targets || 0), 'success');
  };
  applyUiSettings();
  await loadMods();
};

const mountSidebarPage = (entry) => {
  let page = sidebarPages.get(entry.id);
  if (!page) {
    page = document.createElement('section');
    page.className = 'echo-external-mod-page page-surface';
    page.hidden = true;
    page.dataset.echoExternalPage = entry.id;
    page.dataset.density = uiSettings.density === 'compact' ? 'compact' : 'comfortable';
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
  el.innerHTML = '<span class="echo-inject-popup-icon" aria-hidden="true">' + iconCube + '</span><div class="echo-inject-popup-body"><div class="echo-inject-popup-title"></div><div class="echo-inject-popup-track"><span class="echo-inject-popup-fill"></span></div></div>';
  el.querySelector('.echo-inject-popup-title').textContent = T.injectedTitle || 'Shinawase Injected';
  document.body.append(el);
  void api('/api/mods').then((data) => {
    if (!el.isConnected) return;
    const count = (data.mods || []).filter((mod) => mod.enabled).length;
    const sub = document.createElement('div');
    sub.className = 'echo-inject-popup-sub';
    sub.textContent = count === 1 ? (T.injectedOne || '1 mod active') : String(T.injectedMany || '{n} mods active').replace('{n}', String(count));
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
    }, reduceMotion() ? 0 : 220);
  }, 3000);
};

const ensure = () => {
  if (splashActive()) return false;
  ensureLegacyThemeVars();
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
  version: 22,
  registerSidebar,
  unregisterSidebar: removeSidebar,
  uiSettings: () => ({ ...uiSettings }),
  setUiSettings: (patch) => saveUiSettings(patch),
  dispose: () => {
    observer.disconnect();
    window.clearTimeout(ensureTimer);
    window.clearTimeout(injectPopupTimer);
    window.clearTimeout(configModalTimer);
    window.clearTimeout(searchTimer);
    window.clearInterval(statusTimer);
    window.clearInterval(consoleTimer);
    document.querySelectorAll('.echo-inject-popup, .echo-toast-stack, .echo-toast').forEach((node) => node.remove());
    toastStack = null;
    nativeRouteEvents.forEach((eventName) => window.removeEventListener(eventName, onNativeRoute));
    modsPanel?.remove();
    loaderPanel?.remove();
    try { configModalCleanup?.(); } catch {}
    configModalCleanup = null;
    configModal?.remove();
    css.remove();
    accentCss.remove();
    motionCss.remove();
    legacyThemeBridge?.remove();
    loaderGroup?.remove();
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
