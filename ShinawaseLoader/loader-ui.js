if (window.__echoExternalLoaderUi?.version >= 17) return 'already';
window.__echoExternalLoaderUi?.dispose?.();

const base = 'http://127.0.0.1:' + LOADER_PORT;
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
let currentFilter = 'all';
let statusTimer = 0;
let injectPopupTimer = 0;
let injectPopupShown = false;

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
const emptyArt = '<svg class="echo-empty-art" viewBox="0 0 160 110" fill="none" aria-hidden="true"><rect x="38" y="30" width="84" height="58" rx="14" stroke="currentColor" stroke-width="1.6" opacity=".32"/><rect x="50" y="20" width="60" height="44" rx="12" stroke="currentColor" stroke-width="1.6" opacity=".55"/><path d="M70 42h20M80 32v20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".72"/></svg>';

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
  .echo-external-loader-panel .section-kicker,
  .echo-mod-page .section-kicker {
    letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px; font-weight: 650;
    color: var(--theme-accent, #4b55e8);
  }
  .echo-toast {
    position: fixed; right: 20px; bottom: calc(var(--player-height, 112px) + 12px); z-index: 50;
    display: flex; align-items: stretch; gap: 0; min-width: 220px; max-width: min(420px, calc(100vw - 40px));
    overflow: hidden; pointer-events: none;
    border-radius: var(--radius-md, 10px);
    background: var(--theme-panel-bg-strong, #fff);
    color: var(--theme-page-text, inherit);
    border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1));
    box-shadow: var(--shadow-soft, 0 18px 48px rgba(36,39,48,0.12));
    font: 500 13px inherit;
    animation: echoToastIn 220ms ease-out;
  }
  .echo-toast-accent { width: 3px; flex: none; background: var(--theme-accent, #4b55e8); }
  .echo-toast.success .echo-toast-accent { background: var(--theme-success-text, #2f7d57); }
  .echo-toast.error .echo-toast-accent { background: var(--theme-danger-text, #c23b32); }
  .echo-toast.warn .echo-toast-accent { background: #c9862a; }
  .echo-toast-icon {
    display: grid; place-items: center; width: 36px; flex: none; opacity: 0.92;
  }
  .echo-toast-icon svg { width: 16px; height: 16px; display: block; }
  .echo-toast.success .echo-toast-icon { color: var(--theme-success-text, #2f7d57); }
  .echo-toast.error .echo-toast-icon { color: var(--theme-danger-text, #c23b32); }
  .echo-toast.warn .echo-toast-icon { color: #c9862a; }
  .echo-toast.info .echo-toast-icon { color: var(--theme-accent, #4b55e8); }
  .echo-toast-msg { flex: 1; min-width: 0; padding: 11px 14px 11px 0; line-height: 1.4; }
  .echo-config-overlay {
    position: fixed; inset: 0; z-index: 240; display: grid; place-items: center;
    padding: 24px;
    background: rgba(16,19,24,0.42);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    animation: echoOverlayIn 180ms ease-out;
  }
  .echo-config-overlay.is-leaving { animation: echoOverlayOut 160ms ease-in forwards; }
  .echo-config-card {
    width: min(560px, calc(100vw - 48px)); max-height: calc(100vh - 120px); overflow: hidden;
    display: flex; flex-direction: column;
    background: var(--theme-panel-bg, #fff); color: var(--theme-page-text, inherit);
    border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1));
    border-radius: 14px; box-shadow: var(--shadow-panel, 0 18px 48px rgba(36,39,48,0.16));
    animation: echoCardIn 200ms ease-out;
  }
  .echo-config-card[data-custom="true"] { width: min(720px, calc(100vw - 48px)); }
  .echo-config-overlay.is-leaving .echo-config-card { animation: echoCardOut 160ms ease-in forwards; }
  .echo-config-card header, .echo-config-card footer {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 16px 20px; flex: none;
  }
  .echo-config-card header {
    border-bottom: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08));
  }
  .echo-config-card header strong { font-size: 15px; letter-spacing: -0.01em; }
  .echo-config-card footer {
    border-top: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1));
    background: var(--theme-panel-bg, #fff);
  }
  .echo-config-card footer[data-save-hidden="true"] [data-save] { display: none; }
  .echo-config-body { display: grid; gap: 14px; padding: 16px 20px; flex: 1 1 auto; min-height: 0; overflow: auto; }
  .echo-config-field { display: grid; gap: 6px; font-size: 13px; }
  .echo-config-label { font-weight: 600; color: var(--theme-heading-text, inherit); }
  .echo-config-desc { color: var(--theme-muted-text, #6c7179); font-size: 12px; line-height: 1.45; }
  .echo-config-default { color: var(--theme-muted-text, #6c7179); font-size: 11px; }
  .echo-config-field input, .echo-config-field select, .echo-config-json {
    width: 100%; min-height: 38px; padding: 8px 11px; box-sizing: border-box;
    border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
    border-radius: 9px;
    background: var(--theme-field-bg, rgba(255,255,255,0.92));
    color: inherit; font: 13px inherit;
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  .echo-config-field select {
    appearance: none; padding-right: 32px;
    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position: calc(100% - 16px) calc(50% - 2px), calc(100% - 11px) calc(50% - 2px);
    background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
  }
  .echo-config-field input:focus, .echo-config-field select:focus, .echo-config-json:focus {
    outline: none; border-color: var(--theme-accent, #4b55e8);
    box-shadow: 0 0 0 3px var(--theme-accent-bg, rgba(75,85,232,0.16));
  }
  .echo-config-json {
    min-height: 220px; font: 12px/1.5 var(--font-mono, ui-monospace, Consolas, monospace); resize: vertical;
    background: var(--theme-code-bg, rgba(16,18,24,0.04));
  }
  .echo-config-json-wrap { display: grid; gap: 6px; }
  .echo-config-error {
    margin: 0 20px 12px; padding: 8px 12px; border-radius: 8px; flex: none;
    background: rgba(194,59,50,0.08); border: 1px solid rgba(194,59,50,0.16);
    color: var(--theme-danger-text, #c23b32); font-size: 12px; line-height: 1.4;
  }
  .echo-config-error:empty { display: none; }
  .echo-switch-field { display: flex; align-items: center; min-height: 28px; }
  .echo-switch-box {
    position: relative; width: 42px; height: 24px; flex: none;
  }
  .echo-switch-box input {
    position: absolute; inset: 0; opacity: 0; margin: 0; width: 100%; height: 100%; cursor: pointer; z-index: 1;
  }
  .echo-switch-box .echo-switch-track {
    display: block; width: 100%; height: 100%; border-radius: 999px;
    background: var(--theme-field-border, rgba(0,0,0,0.18));
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.04);
    transition: background 180ms ease;
  }
  .echo-switch-box .echo-switch-track::after {
    content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%;
    background: #fff; box-shadow: 0 1px 4px rgba(16,19,24,0.22);
    transition: transform 180ms ease;
  }
  .echo-switch-box input:checked + .echo-switch-track { background: var(--theme-accent, #4b55e8); }
  .echo-switch-box input:checked + .echo-switch-track::after { transform: translateX(18px); }
  .echo-switch-box input:focus-visible + .echo-switch-track {
    box-shadow: 0 0 0 3px var(--theme-accent-bg, rgba(75,85,232,0.18));
  }
  .echo-log-view {
    min-height: 220px; max-height: 360px; overflow: auto; white-space: pre-wrap;
    font: 12px var(--font-mono, ui-monospace, Consolas, monospace);
    background: var(--theme-field-bg, rgba(255,255,255,0.82));
    border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
    border-radius: var(--radius-sm, 6px); padding: 12px;
  }
  .echo-mod-page {
    display: flex; flex-direction: column; gap: 18px; min-height: 100%;
    padding: 28px 32px 120px; box-sizing: border-box;
  }
  .echo-mod-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .echo-mod-header h1 { margin: 6px 0 0; font-size: 28px; line-height: 1.15; letter-spacing: -0.03em; color: var(--theme-heading-text, inherit); }
  .echo-mod-header p { margin: 8px 0 0; max-width: 62ch; color: var(--theme-muted-text, #6c7179); }
  .echo-mod-actions { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; flex: none; }
  .echo-mod-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .echo-search { position: relative; flex: 1 1 240px; min-width: 180px; }
  .echo-search-icon {
    position: absolute; left: 11px; top: 50%; width: 15px; height: 15px; transform: translateY(-50%);
    color: var(--theme-muted-text, #6c7179); pointer-events: none;
  }
  .echo-search-icon svg { width: 100%; height: 100%; display: block; }
  .echo-mod-toolbar .echo-search-box {
    width: 100%; height: 38px; padding: 0 12px 0 34px; box-sizing: border-box;
    border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
    border-radius: 10px;
    background: var(--theme-field-bg, rgba(255,255,255,0.82));
    color: inherit; font: 13px inherit;
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  .echo-mod-toolbar .echo-search-box:focus {
    outline: none; border-color: var(--theme-accent, #4b55e8);
    box-shadow: 0 0 0 3px var(--theme-accent-bg, rgba(75,85,232,0.14));
  }
  .echo-mod-filters { display: flex; flex-wrap: wrap; gap: 8px; }
  .echo-mod-filters .list-filter-chip {
    border-radius: 999px; padding: 6px 12px;
    transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
  }
  .echo-mod-drop {
    display: flex; align-items: center; justify-content: center;
    min-height: 52px; padding: 12px 16px; cursor: pointer;
    border: 1px dashed var(--theme-panel-border, rgba(38,40,46,0.22));
    border-radius: 12px;
    color: var(--theme-muted-text, #6c7179); font-size: 13px;
    background: var(--theme-panel-bg, rgba(255,255,255,0.55));
    transition: border-color 160ms ease, background 160ms ease, color 160ms ease, box-shadow 160ms ease;
  }
  .echo-mod-drop.is-over {
    border-color: var(--theme-accent, #4b55e8);
    color: var(--theme-heading-text, inherit);
    background: var(--theme-accent-bg, rgba(75,85,232,0.08));
    box-shadow: inset 0 0 0 1px var(--theme-accent, #4b55e8);
  }
  .echo-mod-list { display: flex; flex-direction: column; gap: 10px; }
  .echo-mod-row {
    display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: 14px; align-items: center;
    min-height: 78px; padding: 13px 15px;
    border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1));
    border-radius: 14px; background: var(--theme-panel-bg, #fff);
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease;
  }
  .echo-mod-row:hover {
    transform: translateY(-2px);
    border-color: var(--theme-panel-border, rgba(38,40,46,0.16));
    box-shadow: var(--shadow-soft, 0 12px 32px rgba(36,39,48,0.10));
  }
  .echo-mod-row[data-enabled="true"] { background: var(--theme-list-row-bg-active, var(--theme-accent-bg, rgba(75,85,232,0.06))); }
  .echo-mod-icon {
    position: relative; width: 48px; height: 48px; border-radius: 13px; flex: none;
    display: grid; place-items: center; font-size: 16px; font-weight: 700;
    color: var(--theme-heading-text, inherit);
    background: linear-gradient(160deg, var(--theme-accent-bg, rgba(75,85,232,0.16)), rgba(75,85,232,0.04));
    box-shadow: inset 0 0 0 1px rgba(75,85,232,0.22);
  }
  .echo-mod-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: 13px; display: block; }
  .echo-mod-row[data-enabled="true"] .echo-mod-icon::after {
    content: ""; position: absolute; right: -2px; bottom: -2px; width: 10px; height: 10px; border-radius: 50%;
    background: var(--theme-success-text, #2f7d57);
    box-shadow: 0 0 0 2px var(--theme-panel-bg, #fff);
  }
  .echo-mod-copy { min-width: 0; }
  .echo-mod-copy strong { display: block; font-size: 14px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .echo-mod-copy em { display: block; margin-top: 4px; color: var(--theme-muted-text, #6c7179); font-size: 12px; font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .echo-mod-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .echo-badge {
    display: inline-flex; align-items: center; max-width: 100%;
    padding: 2px 7px; border-radius: 999px; font-size: 11px; line-height: 1.3;
    background: var(--theme-accent-bg, rgba(75,85,232,0.08));
    color: var(--theme-heading-text, inherit);
  }
  .echo-badge-id {
    background: var(--theme-field-bg, rgba(0,0,0,0.04));
    color: var(--theme-muted-text, #6c7179);
  }
  .echo-mod-row-actions { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; }
  .echo-switch {
    position: relative; width: 42px; height: 24px; padding: 0; border: 0; border-radius: 999px;
    background: var(--theme-field-border, rgba(0,0,0,0.18));
    cursor: pointer; flex: none;
    transition: background 180ms ease;
  }
  .echo-switch[aria-checked="true"] { background: var(--theme-accent, #4b55e8); }
  .echo-switch-thumb {
    position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%;
    background: #fff; box-shadow: 0 1px 4px rgba(16,19,24,0.22);
    transition: transform 180ms ease; pointer-events: none;
  }
  .echo-switch[aria-checked="true"] .echo-switch-thumb { transform: translateX(18px); }
  .echo-icon-btn {
    width: 34px; height: 34px; padding: 0; border-radius: 9px;
    display: grid; place-items: center;
    border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.12));
    background: var(--theme-panel-bg, #fff);
    color: var(--theme-muted-text, #6c7179);
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease, border-color 160ms ease, transform 160ms ease;
  }
  .echo-icon-btn svg { width: 16px; height: 16px; display: block; }
  .echo-icon-btn:hover {
    color: var(--theme-heading-text, inherit);
    border-color: var(--theme-panel-border, rgba(38,40,46,0.2));
    background: var(--theme-accent-bg, rgba(75,85,232,0.06));
  }
  .echo-icon-btn-danger:hover {
    color: var(--theme-danger-text, #c23b32);
    background: rgba(194,59,50,0.08);
    border-color: rgba(194,59,50,0.2);
  }
  .echo-empty {
    display: grid; justify-items: center; gap: 8px; padding: 36px 20px 28px;
    color: var(--theme-muted-text, #6c7179); text-align: center;
    border: 1px dashed var(--theme-panel-border, rgba(38,40,46,0.16));
    border-radius: 16px; background: var(--theme-panel-bg, rgba(255,255,255,0.4));
  }
  .echo-empty-art { width: 132px; height: 90px; color: var(--theme-accent, #4b55e8); }
  .echo-empty-title { margin: 4px 0 0; font-size: 15px; font-weight: 650; color: var(--theme-heading-text, inherit); }
  .echo-empty-hint { margin: 0; max-width: 42ch; font-size: 13px; line-height: 1.5; }
  @media (max-width: 760px) {
    .echo-mod-header, .echo-mod-toolbar { flex-direction: column; align-items: stretch; }
    .echo-mod-actions { justify-content: flex-end; }
    .echo-mod-row { grid-template-columns: 48px minmax(0, 1fr); }
    .echo-mod-row-actions { grid-column: 1 / -1; justify-content: flex-end; }
  }
  [data-echo-external-loader-group] .nav-icon-shell { display: grid; place-items: center; }
  [data-echo-external-loader-group] .nav-icon-shell svg { width: 21px; height: 21px; display: block; }
  .echo-status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .echo-status-chip {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 13px 14px; border-radius: 12px;
    background: var(--theme-panel-bg, #fff);
    border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1));
  }
  .echo-status-dot {
    width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; flex: none;
    background: var(--theme-accent, #4b55e8);
    box-shadow: 0 0 0 4px var(--theme-accent-bg, rgba(75,85,232,0.14));
  }
  .echo-status-chip[data-tone="ok"] .echo-status-dot {
    background: var(--theme-success-text, #2f7d57);
    box-shadow: 0 0 0 4px rgba(47,125,87,0.12);
  }
  .echo-status-chip[data-tone="warn"] .echo-status-dot {
    background: #c9862a; box-shadow: 0 0 0 4px rgba(201,134,42,0.14);
  }
  .echo-status-chip[data-tone="muted"] .echo-status-dot {
    background: #8b919a; box-shadow: 0 0 0 4px rgba(139,145,154,0.12);
  }
  .echo-status-chip small { display: block; color: var(--theme-muted-text, #6c7179); font-size: 11px; }
  .echo-status-chip strong { display: block; margin-top: 3px; color: var(--theme-heading-text, inherit); font-size: 13px; }
  .echo-debug-console {
    display: grid; grid-template-rows: auto 1fr auto; min-height: 320px; max-height: calc(100vh - 280px);
    border: 1px solid rgba(16,18,24,0.5); border-radius: 12px; overflow: hidden;
    background: #0e1118; color: #d7deea; font: 12px/1.5 var(--font-mono, ui-monospace, Consolas, monospace);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .echo-debug-toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 9px 12px; background: #151922; color: #8b93a7; border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .echo-debug-output {
    margin: 0; padding: 12px 14px; overflow: auto; white-space: pre-wrap; word-break: break-word;
    min-height: 220px; color: #c8d0dc;
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent;
  }
  .echo-debug-output::-webkit-scrollbar { width: 8px; }
  .echo-debug-output::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 99px; }
  .echo-config-body::-webkit-scrollbar { width: 8px; }
  .echo-config-body::-webkit-scrollbar-thumb { background: rgba(38,40,46,0.18); border-radius: 99px; }
  .echo-debug-output .echo-debug-in { color: #9ad4ff; }
  .echo-debug-output .echo-debug-err { color: #ff8b8b; }
  .echo-debug-form {
    display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center;
    padding: 9px 12px; background: #151922; border-top: 1px solid rgba(255,255,255,0.05);
  }
  .echo-debug-form span { color: #7dffb3; }
  .echo-debug-form input {
    width: 100%; border: 0; outline: none; background: transparent; color: #e8eef7;
    font: inherit; caret-color: #7dffb3;
  }
  @keyframes echoToastIn {
    from { opacity: 0; transform: translateX(16px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes echoOverlayIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes echoOverlayOut { from { opacity: 1; } to { opacity: 0; } }
  @keyframes echoCardIn {
    from { opacity: 0; transform: translateY(10px) scale(0.985); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes echoCardOut {
    from { opacity: 1; transform: translateY(0) scale(1); }
    to { opacity: 0; transform: translateY(8px) scale(0.985); }
  }
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
  .echo-inject-popup.echo-inject-popup-out { animation: shinawaseInjectOut 220ms ease-in forwards; }
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
  @media (prefers-reduced-motion: reduce) {
    .echo-toast, .echo-config-overlay, .echo-config-card, .echo-mod-row, .echo-switch, .echo-switch-thumb,
    .echo-switch-box .echo-switch-track, .echo-switch-box .echo-switch-track::after,
    .echo-icon-btn, .echo-mod-drop, .echo-inject-popup, .echo-inject-popup-fill,
    .echo-search-box, .echo-config-field input, .echo-config-field select, .echo-config-json {
      animation: none !important; transition: none !important;
    }
    .echo-mod-row:hover { transform: none; }
  }
`;
document.head.append(css);

const toast = (text, type = 'info') => {
  document.querySelectorAll('.echo-toast').forEach((node) => node.remove());
  const el = document.createElement('div');
  el.className = 'echo-toast ' + type;
  const icon = type === 'success' ? iconCheck : type === 'error' ? iconCross : type === 'warn' ? iconWarn : iconInfo;
  el.innerHTML = '<span class="echo-toast-accent"></span><span class="echo-toast-icon">' + icon + '</span><span class="echo-toast-msg"></span>';
  el.querySelector('.echo-toast-msg').textContent = String(text);
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
      [T.loader, 'v' + (status.loaderVersion || LOADER_VERSION), 'ok'],
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

const renderEmptyState = (isSearch) => {
  const empty = document.createElement('div');
  empty.className = 'echo-empty';
  empty.innerHTML = emptyArt + '<strong class="echo-empty-title"></strong><p class="echo-empty-hint"></p>';
  empty.querySelector('.echo-empty-title').textContent = isSearch ? T.emptySearch : T.emptyMods;
  empty.querySelector('.echo-empty-hint').textContent = isSearch ? T.emptySearchHint : T.emptyModsHint;
  return empty;
};

const renderModList = async () => {
  if (!modsPanel) return;
  const data = await api('/api/mods');
  const list = modsPanel.querySelector('[data-mod-list]');
  const allMods = data.mods || [];
  const items = allMods.filter((item) => {
    const hay = ((item.name || '') + ' ' + item.id + ' ' + (item.description || '')).toLowerCase();
    if (searchQuery && !hay.includes(searchQuery.toLowerCase())) return false;
    if (currentFilter === 'active') return item.enabled;
    if (currentFilter === 'inactive') return !item.enabled;
    return true;
  });
  modsPanel.querySelector('[data-count-all]').textContent = String(allMods.length);
  modsPanel.querySelector('[data-count-active]').textContent = String(allMods.filter((item) => item.enabled).length);
  modsPanel.querySelector('[data-count-inactive]').textContent = String(allMods.filter((item) => !item.enabled).length);
  if (!items.length) {
    list.replaceChildren(renderEmptyState(allMods.length > 0));
    return;
  }
  list.replaceChildren(...items.map((item) => {
    const card = document.createElement('article');
    card.className = 'echo-mod-row';
    card.dataset.enabled = String(item.enabled === true);
    card.innerHTML = '<span class="echo-mod-icon"></span><div class="echo-mod-copy"><strong></strong><em data-desc></em><div class="echo-mod-meta"><span class="echo-badge" data-version></span><span class="echo-badge echo-badge-id" data-id></span></div></div><div class="echo-mod-row-actions"></div>';
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
    card.querySelector('[data-id]').textContent = item.id;
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
      await renderModList();
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
      await renderModList();
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
  card.innerHTML = '<header><strong data-title></strong><button class="settings-action-button" type="button" data-close>' + T.close + '</button></header><div class="echo-config-body" data-body></div><p class="echo-config-error" data-error></p><footer data-footer><button class="settings-action-button" type="button" data-close>' + T.close + '</button><button class="settings-action-button" type="button" data-save>' + (T.save || 'Save') + '</button></footer>';
  card.querySelector('[data-title]').textContent = (T.config || 'Config') + ' · ' + modName;
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
  const readDraft = () => {
    const area = body.querySelector('[data-json]');
    if (area) return JSON.parse(area.value || '{}');
    const next = {};
    body.querySelectorAll('[data-key]').forEach((input) => {
      const key = input.dataset.key;
      if (input.type === 'checkbox') next[key] = input.checked;
      else if (input.dataset.kind === 'integer') next[key] = Number.parseInt(input.value, 10);
      else if (input.dataset.kind === 'number') next[key] = Number(input.value);
      else if (input.dataset.kind === 'json') next[key] = JSON.parse(input.value || input.dataset.empty || '{}');
      else next[key] = input.value;
    });
    return next;
  };
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
  const renderJsonEditor = (config) => {
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
    body.append(wrap);
  };
  const renderFields = (schema, config) => {
    const draft = config && typeof config === 'object' && !Array.isArray(config) ? { ...config } : {};
    const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : null;
    if (!props || !Object.keys(props).length) {
      renderJsonEditor(draft);
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
      body.append(field);
    });
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
        <div class="echo-search">
          <span class="echo-search-icon">${iconSearch}</span>
          <input class="echo-search-box" data-search placeholder="${T.searchMods}">
        </div>
        <div class="echo-mod-filters">
          <button class="list-filter-chip echo-filter active" data-filter="all">${T.filterAll} (<span data-count-all>0</span>)</button>
          <button class="list-filter-chip echo-filter" data-filter="active">${T.filterOn} (<span data-count-active>0</span>)</button>
          <button class="list-filter-chip echo-filter" data-filter="inactive">${T.filterOff} (<span data-count-inactive>0</span>)</button>
        </div>
      </div>
      <div class="echo-mod-drop" data-dropzone><span data-drop-label></span></div>
      <div class="echo-mod-list" data-mod-list></div>
    </div>
  `);
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
  version: 17,
  registerSidebar,
  unregisterSidebar: removeSidebar,
  dispose: () => {
    observer.disconnect();
    window.clearTimeout(ensureTimer);
    window.clearTimeout(injectPopupTimer);
    window.clearTimeout(configModalTimer);
    window.clearInterval(statusTimer);
    window.clearInterval(consoleTimer);
    document.querySelectorAll('.echo-inject-popup').forEach((node) => node.remove());
    nativeRouteEvents.forEach((eventName) => window.removeEventListener(eventName, onNativeRoute));
    modsPanel?.remove();
    loaderPanel?.remove();
    try { configModalCleanup?.(); } catch {}
    configModalCleanup = null;
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
