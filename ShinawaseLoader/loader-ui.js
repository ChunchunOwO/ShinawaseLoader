// Keep this guard in sync with window.__echoExternalLoaderUi.version
// and ShinawaseLoader.mjs (uiVersion < 63).
if (window.__echoExternalLoaderUi?.version >= 63) return 'already';
window.__echoExternalLoaderUi?.dispose?.();

const base = 'http://127.0.0.1:' + LOADER_PORT;
const authHeaders = { 'x-shinawase-token': LOADER_TOKEN };
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
  steamLaunchReminder: false,
  showTitlebarBrand: true,
};
let uiSettings = {
  ...defaultUiSettings,
  ...((typeof LOADER_UI_SETTINGS !== 'undefined' && LOADER_UI_SETTINGS && typeof LOADER_UI_SETTINGS === 'object') ? LOADER_UI_SETTINGS : {}),
};
let modsPanel = null;
let marketPanel = null;
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
let marketButton = null;
const sidebarEntries = new Map();
const sidebarButtons = new Map();
const sidebarPages = new Map();
let searchQuery = '';
let currentFilter = uiSettings.rememberFilters !== false ? (uiSettings.modFilter || 'all') : 'all';
let currentSort = uiSettings.modSort || 'name';
let statusTimer = 0;
let cachedGameRoot = '';
let steamCopyTimer = 0;
let steamReminderShown = false;
let steamReminderEl = null;
const DISCLAIMER_STORAGE_KEY = 'shinawase:disclaimer-accepted';
const readLocalDisclaimerAccepted = () => {
  try { return localStorage.getItem(DISCLAIMER_STORAGE_KEY) === '1'; } catch { return false; }
};
const writeLocalDisclaimerAccepted = () => {
  try { localStorage.setItem(DISCLAIMER_STORAGE_KEY, '1'); } catch {}
};
let disclaimerAccepted = (typeof DISCLAIMER_ACCEPTED !== 'undefined' && DISCLAIMER_ACCEPTED === true) || readLocalDisclaimerAccepted();
let disclaimerOverlay = null;
let disclaimerBusy = false;
let modsListAnimate = true;
let searchTimer = 0;
let modsCache = [];
let marketSearchQuery = '';
let marketFilter = 'all';
let marketTag = '';
let marketCache = { ok: true, mods: [], recommended: [], tags: [], error: '', updatedAt: null };
let marketRandomPick = [];
let marketRecPage = 1;
let marketListPage = 1;
let marketBusyId = '';
let marketListAnimate = true;
let marketLoading = false;
let marketUser = null;
const marketViewed = new Set();

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
const iconGrid = svgIcon('<rect x="4" y="4" width="6.6" height="6.6" rx="1.7"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.7"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.7"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.7"/>');
const iconRows = svgIcon('<rect x="4" y="4.6" width="16" height="6" rx="2.2"/><rect x="4" y="13.4" width="16" height="6" rx="2.2"/>');
const iconRefresh = svgIcon('<path d="M20 11a8 8 0 0 0-14.3-3.6M4 4.4v3.5h3.5"/><path d="M4 13a8 8 0 0 0 14.3 3.6M20 19.6v-3.5h-3.5"/>');
const iconDownload = svgIcon('<path d="M12 4.4v10.2M7.6 10.4 12 14.8l4.4-4.4"/><path d="M5 17.4v1c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-1"/>');
const iconChevL = svgIcon('<path d="m14.5 6-6 6 6 6"/>');
const iconChevR = svgIcon('<path d="m9.5 6 6 6-6 6"/>');
const iconDice = svgIcon('<rect x="4.5" y="4.5" width="15" height="15" rx="4.2"/><circle cx="9" cy="9" r=".95" fill="currentColor"/><circle cx="15" cy="9" r=".95" fill="currentColor"/><circle cx="12" cy="12" r=".95" fill="currentColor"/><circle cx="9" cy="15" r=".95" fill="currentColor"/><circle cx="15" cy="15" r=".95" fill="currentColor"/>');
const iconUser = svgIcon('<circle cx="12" cy="8.6" r="3.6"/><path d="M5 19.6c.8-3.4 3.6-5.2 7-5.2s6.2 1.8 7 5.2"/>');
const iconBolt = svgIcon('<path d="M13 3.2 5.6 13.2h5.3L10.2 20.8l7.4-10h-5.3L13 3.2z"/>');
const iconTranslate = svgIcon('<path d="M4 6.4h9M8.5 4.2v2.2M6.2 6.4c.5 3 2.7 5.4 5.9 7M12 6.4c-.6 3-3 5.8-7.4 7.4"/><path d="m13.6 20 3.5-8.4 3.5 8.4M14.8 17.4h4.6"/>');
const iconPulse = svgIcon('<path d="M3 12h4l2.4-6 4.2 12 2.4-6H21"/>');
const iconBug = svgIcon('<rect x="8" y="8.5" width="8" height="10.5" rx="4"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0M4.5 12.5H8M16 12.5h3.5M5.5 7.5 8.4 10M18.5 7.5 15.6 10M5.5 18l2.9-2.4M18.5 18l-2.9-2.4"/>');
const iconGauge = svgIcon('<path d="M4.5 16a7.5 7.5 0 1 1 15 0"/><path d="m12 16 3.4-4.6"/><circle cx="12" cy="16" r="1"/>');
const iconStar = svgIcon('<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4L12 16.2l-4.8 2.7 1-5.4-4-3.8 5.4-.7L12 4z"/>');
const iconEye = svgIcon('<path d="M2.8 12S6 5.8 12 5.8 21.2 12 21.2 12 18 18.2 12 18.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>');
const iconCopy = svgIcon('<rect x="8.5" y="8.5" width="10.5" height="10.5" rx="2.4"/><path d="M15.5 8.5V6.8c0-1-.8-1.8-1.8-1.8H6.8C5.8 5 5 5.8 5 6.8v6.9c0 1 .8 1.8 1.8 1.8h1.7"/>');
const iconTerminal = svgIcon('<rect x="3.5" y="5" width="17" height="14" rx="3.2"/><path d="m7.6 10 3 2.4-3 2.4M13 15h3.6"/>');
const iconPalette = svgIcon('<path d="M12 4a8 8 0 1 0 0 16c1.2 0 1.8-.8 1.8-1.7 0-.6-.3-1-.5-1.4-.3-.5-.1-1.3.9-1.3H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7.4 16.7 4 12 4z"/><circle cx="8" cy="11.5" r=".9" fill="currentColor"/><circle cx="11" cy="8" r=".9" fill="currentColor"/><circle cx="15.2" cy="8.8" r=".9" fill="currentColor"/>');
const iconPlug = svgIcon('<path d="M9 3.5V8M15 3.5V8M6.5 8h11v3.6a5.5 5.5 0 0 1-11 0V8zM12 17.1V21"/>');
const iconShield = svgIcon('<path d="M12 3.4 5 6v5.6c0 4.2 2.8 7.6 7 9 4.2-1.4 7-4.8 7-9V6l-7-2.6z"/><path d="m9 12.2 2.2 2.2 3.8-4.4"/>');
const iconSparkle = svgIcon('<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.3l-1.9-5.5L4.5 10.9 10.1 9 12 3.5z"/><path d="M19 3.5v3M17.5 5h3"/>');
const iconLayers = svgIcon('<path d="m12 4 8.5 4.6L12 13.2 3.5 8.6 12 4z"/><path d="m3.5 12.6 8.5 4.6 8.5-4.6M3.5 16.4 12 21l8.5-4.6"/>');
const emptyArt = '<svg class="echo-empty-art" viewBox="0 0 176 118" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle class="o" cx="88" cy="60" r="52" stroke-width="1" stroke-dasharray="2 8" opacity=".4"/>'
  + '<g class="c"><rect x="20" y="54" width="68" height="46" rx="12" stroke-width="1.4" opacity=".24"/></g>'
  + '<g class="b"><rect x="42" y="40" width="76" height="50" rx="13" stroke-width="1.5" opacity=".5"/></g>'
  + '<g class="a"><rect x="64" y="22" width="86" height="58" rx="15" stroke-width="1.8" fill="currentColor" fill-opacity=".08"/><path d="M107 40v22M96 51h22" stroke-width="2.2"/></g>'
  + '<circle class="s" cx="34" cy="26" r="2.6" fill="currentColor" stroke="none"/>'
  + '<circle class="s s2" cx="152" cy="98" r="3" fill="currentColor" stroke="none"/>'
  + '<path class="s" d="M150 22v9M145.5 26.5h9" stroke-width="1.7"/>'
  + '<path class="s s2" d="M22 84v7M18.5 87.5h7" stroke-width="1.5"/>'
  + '</svg>';

// ---- Motion kit ---------------------------------------------------------
const motionOff = () => reduceMotion() || uiSettings.animations === false;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Big display title: words in clipped lines, letters rising with a stagger and
// drifting from the heading colour into the accent.
const titleHtml = (text) => {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const total = words.join('').length || 1;
  let n = 0;
  return words.map((word) => '<span class="shl-word" aria-hidden="true">' + [...word].map((ch) => {
    const k = Math.round((n / total) * 72);
    const html = '<span class="shl-ch" style="--n:' + n + ';--k:' + k + '">' + escapeHtml(ch) + '</span>';
    n += 1;
    return html;
  }).join('') + '</span>').join('');
};
const mastHtml = ({ kicker, pill = '', title, lede = '', actions = '', copyExtra = '', aside = '' }) => [
  '<header class="shl-mast">',
  '<div class="shl-aurora" aria-hidden="true"><i></i><i></i><i></i></div>',
  '<div class="shl-mast-copy">',
  '<div class="shl-kicker"><span class="shl-live" data-live></span><span>' + escapeHtml(kicker) + '</span>' + pill + '</div>',
  '<h1 class="shl-title" aria-label="' + escapeHtml(title) + '">' + titleHtml(title) + '</h1>',
  lede ? '<p class="shl-lede">' + escapeHtml(lede) + '</p>' : '',
  copyExtra,
  '</div>',
  actions ? '<div class="shl-mast-actions">' + actions + '</div>' : '',
  aside,
  '</header>',
].join('');

// Deterministic per-package colour. Icons with artwork contribute their own
// dominant hue (sampled once, cached); everything else hashes from the id.
const hueOf = (text) => {
  let hash = 2166136261;
  for (const ch of String(text || '')) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return Math.abs(hash) % 360;
};
const tintCache = new Map();
const applyTint = (host, seed, iconSrc) => {
  const fallback = 'hsl(' + hueOf(seed) + ' 72% 58%)';
  host.style.setProperty('--tint', tintCache.get(iconSrc) || fallback);
  if (!iconSrc || !String(iconSrc).startsWith('data:') || tintCache.has(iconSrc) || String(iconSrc).length > 400000) return;
  const img = new Image();
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 12; canvas.height = 12;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 12, 12);
      const data = ctx.getImageData(0, 0, 12, 12).data;
      let r = 0; let g = 0; let b = 0; let w = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        if (alpha < 0.3) continue;
        const hi = Math.max(data[i], data[i + 1], data[i + 2]);
        const lo = Math.min(data[i], data[i + 1], data[i + 2]);
        const weight = alpha * ((hi - lo) / 255 + 0.04) ** 2;
        r += data[i] * weight; g += data[i + 1] * weight; b += data[i + 2] * weight; w += weight;
      }
      if (w < 0.25) return;
      const color = 'rgb(' + Math.round(r / w) + ' ' + Math.round(g / w) + ' ' + Math.round(b / w) + ')';
      tintCache.set(iconSrc, color);
      if (host.isConnected) host.style.setProperty('--tint', color);
    } catch { /* remote icons taint the canvas; keep the hashed colour */ }
  };
  img.src = iconSrc;
};

const tweenNumber = (node, target, ms = 700) => {
  if (!node) return;
  const to = Number(target) || 0;
  const from = Number(node.dataset.v ?? 0) || 0;
  const pad = Number(node.dataset.pad || 0);
  const paint = (value) => { const text = String(Math.round(value)); node.textContent = pad ? text.padStart(pad, '0') : text; };
  window.cancelAnimationFrame(Number(node.dataset.raf || 0));
  node.dataset.v = String(to);
  if (motionOff() || from === to || !node.isConnected) { paint(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    paint(from + (to - from) * (1 - (1 - k) ** 4));
    node.dataset.raf = k < 1 ? String(window.requestAnimationFrame(step)) : '0';
  };
  node.dataset.raf = String(window.requestAnimationFrame(step));
};

// Pointer-tracked spotlight for any .shl-spot card inside `root`.
const bindSpotlight = (root) => {
  root.addEventListener('pointermove', (event) => {
    const card = event.target?.closest?.('.shl-spot');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', (event.clientX - rect.left) + 'px');
    card.style.setProperty('--my', (event.clientY - rect.top) + 'px');
  }, { passive: true });
};

// Segmented control with a spring-driven thumb.
const syncSeg = (seg) => {
  const active = seg?.querySelector(':scope > .active');
  if (!active || !active.offsetWidth) return;
  seg.style.setProperty('--x', active.offsetLeft + 'px');
  seg.style.setProperty('--w', active.offsetWidth + 'px');
  seg.dataset.ready = 'true';
};
const segObserver = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => entries.forEach((entry) => syncSeg(entry.target))) : null;
const watchSeg = (seg) => {
  if (!seg) return;
  segObserver?.observe(seg);
  window.requestAnimationFrame(() => syncSeg(seg));
};
const syncAllSegs = (host) => host?.querySelectorAll('[data-seg]').forEach(syncSeg);

// FLIP: run `mutate`, then glide every surviving [data-id] child from its old
// position to the new one.
const flipRender = (list, mutate) => {
  const before = new Map();
  if (!motionOff()) list.querySelectorAll(':scope > [data-id]').forEach((node) => before.set(node.dataset.id, node.getBoundingClientRect()));
  mutate();
  if (!before.size) return;
  list.querySelectorAll(':scope > [data-id]').forEach((node) => {
    const old = before.get(node.dataset.id);
    if (!old || node.classList.contains('is-entering')) return;
    const now = node.getBoundingClientRect();
    const dx = old.left - now.left;
    const dy = old.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    node.animate([{ transform: 'translate(' + dx + 'px, ' + dy + 'px)' }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  });
};

const css = document.createElement('style');
css.id = 'echo-loader-ui-style';
css.textContent = `
  /* =====================================================================
     Shinawase Loader UI
     Visual language: "aurora + instrument". Every surface derives from ECHO's
     theme tokens, so light/dark and the user's accent flow through unchanged.
     Tokens are declared on every loader surface (not just :root) so the
     per-surface accent override from Appearance settings re-resolves them.
     ===================================================================== */
  :root, .echo-external-mod-panel, .echo-external-loader-panel, .echo-external-mod-page,
  .echo-config-overlay, .echo-disclaimer-overlay, .echo-steam-reminder, .echo-toast-stack, .echo-toast, .echo-inject-popup,
  [data-echo-external-loader-group] {
    --shl-font: var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif);
    --shl-mono: var(--font-mono, ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace);
    --shl-accent: var(--theme-accent, #4b55e8);
    --shl-accent-bg: var(--theme-accent-bg, rgba(75, 85, 232, 0.12));
    --shl-accent-strong: var(--theme-accent-text-strong, var(--theme-accent, #4b55e8));
    --shl-accent-solid: var(--theme-accent-solid-bg, var(--theme-accent, #4b55e8));
    --shl-on-accent: var(--theme-on-accent, #fff);
    --shl-focus-ring: var(--theme-focus-ring, var(--theme-accent-bg, rgba(75, 85, 232, 0.2)));
    --shl-muted: var(--theme-muted-text, #6c7179);
    --shl-subtle: var(--theme-subtle-text, #7b8493);
    --shl-heading: var(--theme-heading-text, #17181c);
    --shl-page: var(--theme-page-bg, var(--color-bg, #f6f6f7));
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
    --shl-glass: color-mix(in srgb, var(--shl-panel-strong) 78%, transparent);
    --shl-well: color-mix(in srgb, var(--shl-page) 62%, var(--shl-panel));
    --shl-hi: color-mix(in srgb, var(--shl-heading) 7%, transparent);
    --shl-glow: color-mix(in srgb, var(--shl-accent) 46%, transparent);
    --shl-sh: 20 22 30;
    --aurora-1: color-mix(in srgb, var(--shl-accent) 86%, #ff4fa3);
    --aurora-2: color-mix(in srgb, var(--shl-accent) 66%, #22d3ee);
    --aurora-3: color-mix(in srgb, var(--shl-accent) 58%, #fbbf24);
    --shl-ease: cubic-bezier(0.33, 1, 0.68, 1);
    --shl-out: cubic-bezier(0.16, 1, 0.3, 1);
    --shl-spring: cubic-bezier(0.34, 1.36, 0.5, 1);
    --shl-r1: 10px; --shl-r2: 14px; --shl-r3: 20px; --shl-r4: 28px;
  }
  :is(html, body)[data-theme="dark"] :is(.echo-external-mod-panel, .echo-external-loader-panel, .echo-config-overlay, .echo-disclaimer-overlay, .echo-steam-reminder, .echo-toast-stack, .echo-toast) {
    --shl-sh: 0 0 0;
  }

  /* ---- Panels ---- */
  .echo-external-mod-panel, .echo-external-loader-panel {
    grid-row: 2; grid-column: 2; min-width: 0; min-height: 0; z-index: 1;
    overflow-x: hidden; overflow-y: auto; position: relative; padding: 0 !important;
    background: var(--shl-page);
    color: var(--theme-page-text, var(--color-text, #2d3036));
    font-family: var(--shl-font);
    scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--shl-subtle) 38%, transparent) transparent;
    scroll-behavior: smooth;
  }
  .echo-external-mod-panel::-webkit-scrollbar, .echo-external-loader-panel::-webkit-scrollbar { width: 10px; }
  .echo-external-mod-panel::-webkit-scrollbar-thumb, .echo-external-loader-panel::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--shl-subtle) 34%, transparent); border-radius: 99px; border: 3px solid transparent; background-clip: padding-box;
  }
  .echo-external-mod-panel[hidden], .echo-external-loader-panel[hidden], .echo-external-mod-page[hidden] { display: none !important; }
  .echo-external-mod-page {
    grid-row: 2; grid-column: 2; min-width: 0; min-height: 0; overflow: auto;
    background: var(--shl-page);
  }
  .echo-external-mod-panel *, .echo-external-loader-panel *, .echo-config-overlay *, .echo-disclaimer-overlay * { box-sizing: border-box; }
  .echo-external-mod-panel [hidden], .echo-external-loader-panel [hidden] { display: none !important; }
  .echo-external-mod-panel ::selection, .echo-external-loader-panel ::selection { background: color-mix(in srgb, var(--shl-accent) 28%, transparent); }
  .echo-external-mod-panel :focus-visible, .echo-external-loader-panel :focus-visible,
  .echo-config-overlay :focus-visible, .echo-disclaimer-overlay :focus-visible {
    outline: 2px solid var(--shl-accent); outline-offset: 2px;
  }
  .shl-page {
    position: relative; width: min(100%, 1240px); margin: 0 auto; padding: 0 44px 132px;
    display: grid; gap: 26px; align-content: start;
  }
  .echo-external-mod-panel:not([hidden]) .shl-page > *,
  .echo-external-loader-panel:not([hidden]) .shl-page > * {
    animation: shlRise 720ms var(--shl-out) backwards;
    animation-delay: calc(var(--s, 0) * 70ms);
  }
  .shl-page > :nth-child(1) { --s: 0; }
  .shl-page > :nth-child(2) { --s: 1; }
  .shl-page > :nth-child(3) { --s: 2; }
  .shl-page > :nth-child(4) { --s: 3; }
  .shl-page > :nth-child(5) { --s: 4; }
  .shl-page > :nth-child(n+6) { --s: 5; }

  /* ---- Masthead ---- */
  .shl-mast {
    position: relative; isolation: isolate;
    display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 24px 32px;
    padding: 58px 0 6px;
  }
  .shl-aurora {
    position: absolute; z-index: -1; pointer-events: none; overflow: hidden;
    left: -14%; right: -14%; top: -80px; height: 460px;
    -webkit-mask-image: linear-gradient(180deg, #000 34%, transparent 96%);
    mask-image: linear-gradient(180deg, #000 34%, transparent 96%);
  }
  .shl-aurora i {
    position: absolute; border-radius: 50%; filter: blur(64px); opacity: 0.46; will-change: transform;
  }
  .shl-aurora i:nth-child(1) { width: 540px; height: 330px; left: 12%; top: -30px; background: var(--aurora-1); animation: shlDriftA 24s ease-in-out infinite alternate; }
  .shl-aurora i:nth-child(2) { width: 470px; height: 300px; left: 44%; top: 10px; background: var(--aurora-2); animation: shlDriftB 30s ease-in-out infinite alternate; }
  .shl-aurora i:nth-child(3) { width: 380px; height: 250px; right: 6%; top: -40px; background: var(--aurora-3); opacity: 0.3; animation: shlDriftC 36s ease-in-out infinite alternate; }
  .shl-aurora::after {
    content: ""; position: absolute; inset: 0;
    background-image: radial-gradient(color-mix(in srgb, var(--shl-heading) 22%, transparent) 1px, transparent 1.3px);
    background-size: 24px 24px; opacity: 0.35;
    -webkit-mask-image: radial-gradient(70% 90% at 50% 20%, #000, transparent);
    mask-image: radial-gradient(70% 90% at 50% 20%, #000, transparent);
  }
  @supports (animation-timeline: scroll()) {
    .shl-aurora { animation: shlParallax linear both; animation-timeline: scroll(nearest block); animation-range: 0 480px; }
  }
  .shl-kicker {
    display: inline-flex; align-items: center; gap: 10px;
    font: 700 11px/1 var(--shl-mono); letter-spacing: 0.22em; text-transform: uppercase;
    color: var(--shl-accent-strong);
  }
  .shl-live {
    position: relative; width: 8px; height: 8px; border-radius: 50%; flex: none;
    background: var(--shl-success);
  }
  .shl-live::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; background: inherit;
    animation: shlPing 2.4s var(--shl-out) infinite;
  }
  .shl-live[data-tone="warn"] { background: var(--shl-warning); }
  .shl-live[data-tone="off"] { background: var(--shl-subtle); }
  .shl-live[data-tone="off"]::after { animation: none; }
  .shl-pill {
    display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 999px;
    font: 700 10.5px var(--shl-mono); letter-spacing: 0.04em; text-transform: none;
    color: var(--shl-accent-strong);
    background: color-mix(in srgb, var(--shl-accent-bg) 76%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-accent) 24%, transparent);
  }
  .shl-title {
    display: flex; flex-wrap: wrap; column-gap: 0.2em; margin: 16px 0 0;
    font: 800 clamp(50px, 6.2vw, 88px)/0.94 var(--shl-font); letter-spacing: -0.068em;
    color: var(--shl-heading);
  }
  .shl-word { display: inline-block; overflow: hidden; padding: 0 0.1em 0.14em 0.03em; margin: 0 -0.07em -0.14em 0; white-space: pre; }
  .shl-ch {
    display: inline-block;
    color: color-mix(in srgb, var(--shl-heading) calc(100% - var(--k, 0) * 1%), var(--shl-accent));
    animation: shlChar 900ms var(--shl-out) backwards;
    animation-delay: calc(var(--n, 0) * 42ms + 140ms);
  }
  .shl-lede { margin: 18px 0 0; max-width: 58ch; color: var(--shl-muted); font-size: 14.5px; line-height: 1.62; }
  .shl-mast-copy { min-width: 0; flex: 1 1 420px; }
  .shl-mast-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding-bottom: 8px; }

  /* ---- Buttons ---- */
  .shl-btn, :is(.echo-external-mod-panel, .echo-external-loader-panel, .echo-config-overlay, .echo-disclaimer-overlay, .echo-steam-reminder) .settings-action-button {
    position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    height: 38px; min-height: 38px; padding: 0 16px; border-radius: 12px; overflow: hidden; flex: none;
    border: 1px solid var(--shl-border); background: var(--shl-panel); color: var(--shl-heading);
    font: 650 12.5px/1 var(--shl-font); letter-spacing: -0.005em; white-space: nowrap; text-decoration: none; cursor: pointer;
    box-shadow: inset 0 1px 0 var(--shl-hi), 0 1px 2px rgb(var(--shl-sh) / 0.06);
    transition: transform 240ms var(--shl-spring), border-color 180ms var(--shl-ease), box-shadow 220ms var(--shl-ease), background 180ms var(--shl-ease), color 180ms var(--shl-ease), opacity 180ms var(--shl-ease);
  }
  .shl-btn svg { width: 15px; height: 15px; flex: none; display: block; }
  .shl-btn:hover, :is(.echo-external-mod-panel, .echo-external-loader-panel, .echo-config-overlay, .echo-disclaimer-overlay, .echo-steam-reminder) .settings-action-button:hover {
    transform: translateY(-1px); color: var(--shl-heading);
    border-color: color-mix(in srgb, var(--shl-accent) 48%, var(--shl-border));
    box-shadow: inset 0 1px 0 var(--shl-hi), 0 10px 22px -10px rgb(var(--shl-sh) / 0.34), 0 0 0 3px color-mix(in srgb, var(--shl-accent) 9%, transparent);
  }
  .shl-btn:active, :is(.echo-external-mod-panel, .echo-external-loader-panel, .echo-config-overlay, .echo-disclaimer-overlay, .echo-steam-reminder) .settings-action-button:active {
    transform: translateY(0) scale(0.965); transition-duration: 90ms;
  }
  .shl-btn:disabled, .shl-btn[disabled], .shl-btn.is-locked { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
  .shl-btn--primary, .echo-btn-primary {
    color: var(--shl-on-accent) !important;
    border-color: color-mix(in srgb, var(--shl-accent-solid) 72%, #000) !important;
    background: linear-gradient(180deg, color-mix(in srgb, var(--shl-accent-solid) 84%, #fff), var(--shl-accent-solid)) !important;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.32), 0 12px 26px -12px var(--shl-glow) !important;
  }
  .shl-btn--primary::after, .echo-btn-primary::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(105deg, transparent 32%, rgb(255 255 255 / 0.4) 50%, transparent 68%);
    transform: translateX(-125%); transition: transform 800ms var(--shl-out);
  }
  .shl-btn--primary:hover::after, .echo-btn-primary:hover::after { transform: translateX(125%); }
  .shl-btn--primary:hover, .echo-btn-primary:hover {
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.32), 0 16px 30px -12px var(--shl-glow), 0 0 0 4px color-mix(in srgb, var(--shl-accent) 16%, transparent) !important;
  }
  .shl-btn--ghost { background: transparent; box-shadow: none; border-color: transparent; color: var(--shl-muted); }
  .shl-btn--ghost:hover { background: var(--shl-row-hover); box-shadow: none; color: var(--shl-heading); }
  .shl-btn--danger, .echo-btn-danger { color: var(--shl-danger); }
  .shl-btn--danger:hover, .echo-btn-danger:hover {
    border-color: color-mix(in srgb, var(--shl-danger) 46%, var(--shl-border)) !important;
    background: color-mix(in srgb, var(--shl-danger) 8%, var(--shl-panel));
  }
  .shl-btn--sm { height: 32px; min-height: 32px; padding: 0 12px; border-radius: 10px; font-size: 12px; }
  .shl-btn--icon { width: 38px; padding: 0; }
  .shl-btn--sm.shl-btn--icon { width: 32px; }
  .shl-btn--spin svg { animation: shlSpin 900ms linear infinite; }

  /* ---- Segmented control ---- */
  .shl-seg {
    position: relative; display: inline-flex; flex: none; padding: 4px; gap: 2px; border-radius: 15px;
    background: var(--shl-well); border: 1px solid var(--shl-border);
    box-shadow: inset 0 1px 2px rgb(var(--shl-sh) / 0.06);
  }
  .shl-seg-thumb {
    position: absolute; top: 4px; bottom: 4px; left: 0; width: var(--w, 0px); border-radius: 11px; pointer-events: none;
    transform: translateX(var(--x, 4px)); opacity: 0;
    background: var(--shl-panel-strong);
    box-shadow: 0 0 0 1px var(--shl-border), 0 1px 2px rgb(var(--shl-sh) / 0.1), 0 8px 16px -8px rgb(var(--shl-sh) / 0.34);
    transition: transform 460ms var(--shl-spring), width 460ms var(--shl-spring), opacity 200ms var(--shl-ease);
  }
  .shl-seg[data-ready="true"] .shl-seg-thumb { opacity: 1; }
  .shl-seg > button {
    position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 8px;
    height: 34px; padding: 0 14px; border: 0; border-radius: 11px; background: transparent;
    color: var(--shl-muted); font: 650 12.5px var(--shl-font); white-space: nowrap; cursor: pointer;
    transition: color 220ms var(--shl-ease);
  }
  .shl-seg > button:hover { color: var(--shl-heading); }
  .shl-seg > button.active { color: var(--shl-heading); }
  .shl-seg > button svg { width: 15px; height: 15px; display: block; }
  .shl-seg--icons > button { padding: 0 11px; }
  .echo-filter-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 21px; height: 19px; padding: 0 6px; border-radius: 999px;
    background: color-mix(in srgb, currentColor 11%, transparent);
    font: 700 10.5px var(--shl-mono); font-variant-numeric: tabular-nums;
    transition: background 240ms var(--shl-ease), color 240ms var(--shl-ease);
  }
  .shl-seg > button.active .echo-filter-count { background: var(--shl-accent-bg); color: var(--shl-accent-strong); }

  /* ---- Chips (tags) ---- */
  .shl-chip {
    display: inline-flex; align-items: center; gap: 8px; flex: none; height: 34px; padding: 0 13px;
    border-radius: 999px; border: 1px solid var(--shl-border); background: var(--shl-panel);
    color: var(--shl-muted); font: 650 12.5px var(--shl-font); white-space: nowrap; cursor: pointer;
    transition: transform 240ms var(--shl-spring), color 180ms var(--shl-ease), border-color 180ms var(--shl-ease), background 180ms var(--shl-ease), box-shadow 180ms var(--shl-ease);
  }
  .shl-chip:hover { color: var(--shl-heading); border-color: var(--shl-border-strong); transform: translateY(-1px); }
  .shl-chip:active { transform: scale(0.96); }
  .shl-chip.active {
    color: var(--shl-accent-strong); border-color: color-mix(in srgb, var(--shl-accent) 50%, transparent);
    background: var(--shl-accent-bg); box-shadow: 0 8px 18px -10px var(--shl-glow);
  }

  /* ---- Fields ---- */
  .shl-search { position: relative; flex: 1 1 260px; min-width: 190px; }
  .shl-search input {
    width: 100%; height: 44px; padding: 0 42px 0 44px; border-radius: 14px;
    border: 1px solid var(--shl-border); background: var(--shl-well); color: inherit;
    font: 500 13.5px var(--shl-font);
    transition: border-color 200ms var(--shl-ease), box-shadow 200ms var(--shl-ease), background 200ms var(--shl-ease);
  }
  .shl-search input::placeholder { color: var(--shl-subtle); }
  .shl-search input::-webkit-search-cancel-button, .shl-search input::-webkit-search-decoration { -webkit-appearance: none; appearance: none; }
  .shl-search input:hover { border-color: var(--shl-border-strong); }
  .shl-search input:focus {
    outline: none; background: var(--shl-panel); border-color: var(--shl-accent);
    box-shadow: 0 0 0 4px var(--shl-focus-ring), 0 12px 28px -14px var(--shl-glow);
  }
  .echo-search-icon {
    position: absolute; left: 15px; top: 50%; width: 17px; height: 17px; transform: translateY(-50%);
    color: var(--shl-subtle); pointer-events: none; transition: color 200ms var(--shl-ease), transform 320ms var(--shl-spring);
  }
  .echo-search-icon svg { width: 100%; height: 100%; display: block; }
  .shl-search:focus-within .echo-search-icon { color: var(--shl-accent); transform: translateY(-50%) scale(1.1) rotate(-8deg); }
  .echo-search-clear {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    width: 28px; height: 28px; padding: 0; display: grid; place-items: center;
    border: 0; border-radius: 9px; background: transparent; color: var(--shl-subtle); cursor: pointer;
    transition: background 160ms var(--shl-ease), color 160ms var(--shl-ease);
  }
  .echo-search-clear[hidden] { display: none; }
  .echo-search-clear svg { width: 13px; height: 13px; display: block; }
  .echo-search-clear:hover { background: var(--shl-row-hover); color: var(--shl-heading); }
  .shl-select {
    height: 44px; padding: 0 36px 0 14px; flex: none; appearance: none; cursor: pointer;
    border: 1px solid var(--shl-border); border-radius: 14px; background-color: var(--shl-well); color: inherit;
    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position: calc(100% - 18px) calc(50% - 2px), calc(100% - 13px) calc(50% - 2px);
    background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
    font: 600 12.5px var(--shl-font);
    transition: border-color 200ms var(--shl-ease), box-shadow 200ms var(--shl-ease);
  }
  .shl-select:hover { border-color: var(--shl-border-strong); }
  .shl-select:focus { outline: none; border-color: var(--shl-accent); box-shadow: 0 0 0 4px var(--shl-focus-ring); }

  /* ---- Switches ---- */
  .echo-switch-field { display: flex; align-items: center; min-height: 28px; }
  .echo-switch-box { position: relative; width: 46px; height: 26px; flex: none; }
  .echo-switch-box input { position: absolute; inset: 0; opacity: 0; margin: 0; width: 100%; height: 100%; cursor: pointer; z-index: 1; }
  .echo-switch-box .echo-switch-track {
    display: block; width: 100%; height: 100%; border-radius: 999px;
    background: color-mix(in srgb, var(--shl-subtle) 38%, transparent);
    box-shadow: inset 0 1px 3px rgb(var(--shl-sh) / 0.18);
    transition: background 260ms var(--shl-ease), box-shadow 260ms var(--shl-ease);
  }
  .echo-switch-box .echo-switch-track::after {
    content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 999px;
    background: #fff; box-shadow: 0 2px 6px rgb(var(--shl-sh) / 0.34);
    transition: transform 340ms var(--shl-spring), width 200ms var(--shl-ease);
  }
  .echo-switch-box input:active + .echo-switch-track::after { width: 26px; }
  .echo-switch-box input:checked + .echo-switch-track { background: var(--shl-accent); box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.22), 0 0 0 4px color-mix(in srgb, var(--shl-accent) 16%, transparent); }
  .echo-switch-box input:checked + .echo-switch-track::after { transform: translateX(20px); }
  .echo-switch-box input:checked:active + .echo-switch-track::after { transform: translateX(14px); }
  .echo-switch-box input:focus-visible + .echo-switch-track { outline: 2px solid var(--shl-accent); outline-offset: 2px; }
  .echo-switch {
    position: relative; width: 46px; height: 26px; padding: 0; border: 0; border-radius: 999px; flex: none; cursor: pointer;
    background: color-mix(in srgb, var(--shl-subtle) 38%, transparent);
    box-shadow: inset 0 1px 3px rgb(var(--shl-sh) / 0.18);
    transition: background 260ms var(--shl-ease), box-shadow 260ms var(--shl-ease);
  }
  .echo-switch[aria-checked="true"] {
    background: var(--shl-accent);
    box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.22), 0 0 0 4px color-mix(in srgb, var(--shl-accent) 16%, transparent), 0 8px 20px -6px var(--shl-glow);
  }
  .echo-switch:disabled { cursor: progress; }
  .echo-switch-thumb {
    position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 999px; pointer-events: none;
    background: #fff; box-shadow: 0 2px 6px rgb(var(--shl-sh) / 0.34);
    transition: transform 340ms var(--shl-spring), width 200ms var(--shl-ease);
  }
  .echo-switch:active .echo-switch-thumb { width: 26px; }
  .echo-switch[aria-checked="true"] .echo-switch-thumb { transform: translateX(20px); }
  .echo-switch[aria-checked="true"]:active .echo-switch-thumb { transform: translateX(14px); }

  /* ---- Icon buttons ---- */
  .echo-icon-btn {
    width: 38px; height: 38px; padding: 0; border-radius: 12px; display: grid; place-items: center; flex: none;
    border: 1px solid transparent; background: transparent; color: var(--shl-muted); cursor: pointer;
    transition: background 180ms var(--shl-ease), color 180ms var(--shl-ease), border-color 180ms var(--shl-ease), transform 240ms var(--shl-spring);
  }
  .echo-icon-btn svg { width: 17px; height: 17px; display: block; transition: transform 420ms var(--shl-spring); }
  .echo-icon-btn:hover {
    color: var(--shl-accent-strong); background: color-mix(in srgb, var(--shl-accent-bg) 70%, transparent);
    border-color: color-mix(in srgb, var(--shl-accent) 24%, transparent);
  }
  .echo-icon-btn[data-action="config"]:hover svg, .echo-icon-btn.is-config:hover svg { transform: rotate(90deg); }
  .echo-icon-btn:active { transform: scale(0.9); }
  .echo-icon-btn-danger:hover {
    color: var(--shl-danger); background: color-mix(in srgb, var(--shl-danger) 10%, transparent);
    border-color: color-mix(in srgb, var(--shl-danger) 28%, transparent);
  }
  .echo-icon-btn-danger[data-armed="true"] {
    color: #fff; background: var(--shl-danger); border-color: transparent; width: auto; padding: 0 12px; gap: 6px;
    box-shadow: 0 8px 20px -8px var(--shl-danger); animation: shlShake 420ms var(--shl-out);
  }
  .echo-icon-btn-danger[data-armed="true"]::after { content: attr(data-armed-label); font: 700 11.5px var(--shl-font); }
  .echo-icon-btn-danger[data-armed="true"] { display: inline-flex; align-items: center; justify-content: center; }

  /* ---- Toolbar (sticky, frosted) ---- */
  .shl-toolbar {
    position: sticky; top: 14px; z-index: 6;
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px; border-radius: 22px;
    background: var(--shl-glass); border: 1px solid var(--shl-border);
    backdrop-filter: blur(22px) saturate(1.6); -webkit-backdrop-filter: blur(22px) saturate(1.6);
    box-shadow: inset 0 1px 0 var(--shl-hi), 0 18px 40px -22px rgb(var(--shl-sh) / 0.5);
  }
  .shl-toolbar[hidden] { display: none; }
  .shl-toolbar .shl-search input { background: color-mix(in srgb, var(--shl-well) 80%, transparent); }
  .shl-toolbar .shl-seg { background: color-mix(in srgb, var(--shl-well) 80%, transparent); }

  /* ---- Badges ---- */
  .echo-badge {
    display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
    height: 22px; padding: 0 9px; border-radius: 999px;
    font: 650 11px var(--shl-font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: var(--shl-muted); background: var(--shl-well); box-shadow: inset 0 0 0 1px var(--shl-border);
  }
  .echo-badge-version {
    font-family: var(--shl-mono); font-size: 10.5px;
    color: var(--shl-accent-strong); background: color-mix(in srgb, var(--shl-accent-bg) 66%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-accent) 20%, transparent);
  }
  .echo-badge-id { font-family: var(--shl-mono); font-size: 10.5px; font-weight: 500; }
  .echo-badge-state i { width: 6px; height: 6px; border-radius: 50%; flex: none; background: currentColor; }
  .echo-badge-state[data-on="true"] {
    color: var(--shl-success); background: color-mix(in srgb, var(--shl-success) 11%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-success) 26%, transparent);
  }
  .echo-badge-state[data-on="true"] i { animation: shlBlink 2.4s ease-in-out infinite; }
  .echo-badge-state[data-on="false"] { color: var(--shl-subtle); }
  .echo-badge-official {
    color: var(--shl-accent-strong); background: color-mix(in srgb, var(--shl-accent-bg) 76%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-accent) 24%, transparent);
  }
  .echo-badge-update {
    color: var(--shl-warning); background: color-mix(in srgb, var(--shl-warning) 13%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-warning) 30%, transparent);
  }
  .echo-badge svg { width: 11px; height: 11px; display: block; }

  /* ---- Cards base ---- */
  .shl-card {
    position: relative; isolation: isolate; overflow: hidden; min-width: 0;
    border-radius: var(--shl-r3); border: 1px solid var(--shl-border); background: var(--shl-panel);
    box-shadow: inset 0 1px 0 var(--shl-hi), 0 1px 2px rgb(var(--shl-sh) / 0.04), 0 18px 40px -30px rgb(var(--shl-sh) / 0.5);
  }
  .shl-spot::before {
    content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: 0;
    background: radial-gradient(420px circle at var(--mx, 50%) var(--my, -30%), color-mix(in srgb, var(--tint, var(--shl-accent)) 18%, transparent), transparent 62%);
    transition: opacity 320ms var(--shl-ease);
  }
  .shl-spot:hover::before { opacity: 1; }
  .shl-spot::after {
    content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none; opacity: 0; border-radius: inherit; padding: 1px;
    background: radial-gradient(240px circle at var(--mx, 50%) var(--my, -30%), color-mix(in srgb, var(--tint, var(--shl-accent)) 70%, transparent), transparent 70%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude;
    transition: opacity 320ms var(--shl-ease);
  }
  .shl-spot:hover::after { opacity: 1; }
  .shl-card-title {
    display: flex; align-items: center; gap: 10px; margin: 0 0 16px;
    font: 750 16px/1.2 var(--shl-font); letter-spacing: -0.025em; color: var(--shl-heading);
  }
  .shl-card-title svg { width: 18px; height: 18px; color: var(--shl-accent); flex: none; }
  .shl-card-title small { margin-left: auto; font: 500 12px var(--shl-font); letter-spacing: 0; color: var(--shl-subtle); }


  /* ---- Mods: power rail ---- */
  .shl-rack {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 26px;
    padding: 20px 26px;
  }
  .shl-rack-num { display: grid; gap: 6px; }
  .shl-rack-num > span { font: 700 10.5px var(--shl-mono); letter-spacing: 0.18em; text-transform: uppercase; color: var(--shl-subtle); }
  .shl-rack-num > div { display: flex; align-items: baseline; gap: 6px; font-variant-numeric: tabular-nums; }
  .shl-rack-num b { font: 800 46px/0.9 var(--shl-font); letter-spacing: -0.06em; color: var(--shl-heading); }
  .shl-rack-num em { font: 600 18px var(--shl-mono); font-style: normal; color: var(--shl-subtle); }
  .shl-rail { display: flex; flex-wrap: wrap; align-content: center; gap: 6px; min-height: 40px; }
  .shl-cell {
    position: relative; width: 12px; height: 34px; padding: 0; border: 0; border-radius: 5px; cursor: pointer;
    background: color-mix(in srgb, var(--shl-subtle) 24%, transparent);
    transform-origin: 50% 100%;
    transition: background 300ms var(--shl-ease), transform 380ms var(--shl-spring), box-shadow 300ms var(--shl-ease);
    animation: shlCellIn 600ms var(--shl-out) backwards; animation-delay: calc(var(--i, 0) * 22ms + 200ms);
  }
  .shl-cell[data-on="true"] {
    background: linear-gradient(180deg, color-mix(in srgb, var(--tint, var(--shl-accent)) 70%, #fff), var(--tint, var(--shl-accent)));
    box-shadow: 0 6px 16px -4px color-mix(in srgb, var(--tint, var(--shl-accent)) 70%, transparent);
  }
  .shl-cell:hover { transform: scaleY(1.22) scaleX(1.12); }
  .shl-cell.is-pop { animation: shlCellPop 640ms var(--shl-spring); }
  .shl-cell.is-focus { transform: scaleY(1.4) scaleX(1.25); box-shadow: 0 0 0 2px var(--shl-panel), 0 0 0 4px var(--tint, var(--shl-accent)); }
  .shl-rack-hint { max-width: 22ch; text-align: right; font-size: 12px; line-height: 1.5; color: var(--shl-subtle); }

  /* ---- Mods: import strip + drop veil ---- */
  .echo-mod-drop {
    position: relative; display: flex; align-items: center; justify-content: center; gap: 12px;
    min-height: 58px; padding: 12px 20px; cursor: pointer; border-radius: 18px;
    border: 1.5px dashed color-mix(in srgb, var(--shl-border-strong) 90%, transparent);
    color: var(--shl-muted); font: 550 13px var(--shl-font);
    background: color-mix(in srgb, var(--shl-panel) 50%, transparent);
    transition: border-color 220ms var(--shl-ease), background 220ms var(--shl-ease), color 220ms var(--shl-ease), box-shadow 220ms var(--shl-ease), transform 320ms var(--shl-spring);
  }
  .echo-drop-icon {
    display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; flex: none;
    color: var(--shl-accent); background: color-mix(in srgb, var(--shl-accent) 12%, transparent);
    transition: transform 380ms var(--shl-spring);
  }
  .echo-drop-icon svg { width: 16px; height: 16px; display: block; }
  .echo-mod-drop:hover {
    border-color: color-mix(in srgb, var(--shl-accent) 55%, transparent); color: var(--shl-heading);
    background: color-mix(in srgb, var(--shl-accent-bg) 34%, transparent);
  }
  .echo-mod-drop:hover .echo-drop-icon { transform: translateY(-2px) scale(1.06); }
  .echo-mod-drop.is-over {
    border-style: solid; border-color: var(--shl-accent); color: var(--shl-accent-strong);
    background: color-mix(in srgb, var(--shl-accent-bg) 70%, transparent);
    box-shadow: 0 0 0 5px var(--shl-focus-ring); transform: scale(1.01);
  }
  .echo-mod-drop.is-locked { opacity: 0.6; }
  .shl-veil { position: sticky; top: 0; height: 0; z-index: 40; pointer-events: none; }
  .shl-veil > div {
    position: absolute; left: 0; right: 0; top: 0; height: var(--h, 100vh);
    display: grid; place-items: center; align-content: center; gap: 18px; text-align: center;
    opacity: 0; visibility: hidden; font: 800 30px var(--shl-font); letter-spacing: -0.04em; color: var(--shl-accent-strong);
    background: color-mix(in srgb, var(--shl-page) 74%, transparent);
    backdrop-filter: blur(14px) saturate(1.4); -webkit-backdrop-filter: blur(14px) saturate(1.4);
    transition: opacity 240ms var(--shl-ease), visibility 0s linear 240ms;
  }
  .shl-veil > div::before {
    content: ""; position: absolute; inset: 22px; border-radius: 30px;
    border: 2px dashed color-mix(in srgb, var(--shl-accent) 65%, transparent);
    background: radial-gradient(60% 60% at 50% 50%, color-mix(in srgb, var(--shl-accent) 12%, transparent), transparent);
    animation: shlBreath 2.2s ease-in-out infinite;
  }
  .shl-veil > div > * { position: relative; }
  .shl-veil svg { width: 54px; height: 54px; animation: shlBob 1.4s ease-in-out infinite; }
  .shl-veil.is-on { pointer-events: auto; }
  .shl-veil.is-on > div { opacity: 1; visibility: visible; transition-delay: 0s; }

  /* ---- Mods: list + cards ---- */
  .echo-mod-list { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .echo-mod-row {
    position: relative; isolation: isolate; overflow: hidden;
    display: grid; grid-template-columns: 58px minmax(0, 1fr) auto; gap: 18px; align-items: center;
    min-height: 92px; padding: 16px 18px 16px 20px;
    border: 1px solid var(--shl-border); border-radius: var(--shl-r3);
    background: var(--shl-panel);
    box-shadow: inset 0 1px 0 var(--shl-hi), 0 1px 2px rgb(var(--shl-sh) / 0.04);
    transition: transform 320ms var(--shl-spring), box-shadow 320ms var(--shl-ease), border-color 240ms var(--shl-ease), background 320ms var(--shl-ease);
  }
  .echo-mod-row.is-entering { animation: shlCardIn 640ms var(--shl-out) backwards; animation-delay: calc(var(--row-i, 0) * 46ms); }
  .echo-mod-row.is-flash { animation: shlRowFlash 1400ms var(--shl-out); }
  .echo-mod-row.is-leaving { animation: shlCardOut 320ms var(--shl-ease) forwards; pointer-events: none; }
  .echo-mod-row:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--tint, var(--shl-accent)) 32%, var(--shl-border));
    box-shadow: inset 0 1px 0 var(--shl-hi), 0 22px 44px -26px rgb(var(--shl-sh) / 0.55);
  }
  .echo-mod-row[data-enabled="true"] {
    background: linear-gradient(100deg, color-mix(in srgb, var(--tint, var(--shl-accent)) 10%, var(--shl-panel)), var(--shl-panel) 58%);
    border-color: color-mix(in srgb, var(--tint, var(--shl-accent)) 24%, var(--shl-border));
  }
  .echo-mod-row > .shl-bar {
    position: absolute; left: 0; top: 16%; bottom: 16%; width: 4px; border-radius: 0 4px 4px 0; z-index: 3;
    background: linear-gradient(180deg, color-mix(in srgb, var(--tint, var(--shl-accent)) 60%, #fff), var(--tint, var(--shl-accent)));
    box-shadow: 0 0 18px 1px color-mix(in srgb, var(--tint, var(--shl-accent)) 70%, transparent);
    transform: scaleY(0); transform-origin: 50% 50%; transition: transform 520ms var(--shl-spring);
  }
  .echo-mod-row[data-enabled="true"] > .shl-bar { transform: scaleY(1); }
  .echo-mod-row > .shl-sweep {
    position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0;
    background: linear-gradient(100deg, transparent 20%, color-mix(in srgb, var(--tint, var(--shl-accent)) 34%, transparent) 50%, transparent 80%);
    transform: translateX(-100%);
  }
  .echo-mod-row.is-powering > .shl-sweep { animation: shlSweep 900ms var(--shl-out); }
  .echo-mod-icon {
    position: relative; width: 58px; height: 58px; border-radius: 18px; flex: none;
    display: grid; place-items: center; font: 800 21px var(--shl-font); color: #fff;
    background: linear-gradient(150deg, color-mix(in srgb, var(--tint, var(--shl-accent)) 92%, #fff), color-mix(in srgb, var(--tint, var(--shl-accent)) 70%, #000));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.4), 0 12px 24px -12px color-mix(in srgb, var(--tint, var(--shl-accent)) 80%, transparent);
    transition: transform 420ms var(--shl-spring), filter 320ms var(--shl-ease), opacity 320ms var(--shl-ease);
  }
  .echo-mod-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block; }
  .echo-mod-row:hover .echo-mod-icon { transform: scale(1.07) rotate(-3deg); }
  .echo-mod-row[data-enabled="false"] .echo-mod-icon { filter: saturate(0.25) brightness(0.98); opacity: 0.72; }
  .echo-mod-icon > .shl-pulse {
    position: absolute; right: -3px; bottom: -3px; width: 13px; height: 13px; border-radius: 50%;
    background: var(--shl-success); box-shadow: 0 0 0 3px var(--shl-panel);
    transform: scale(0); transition: transform 420ms var(--shl-spring);
  }
  .echo-mod-icon > .shl-pulse::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; background: inherit; animation: shlPing 2.4s var(--shl-out) infinite;
  }
  .echo-mod-row[data-enabled="true"] .echo-mod-icon > .shl-pulse { transform: scale(1); }
  .echo-mod-copy { min-width: 0; }
  .shl-titleline { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .echo-mod-copy strong {
    display: block; min-width: 0; font: 720 16px/1.25 var(--shl-font); letter-spacing: -0.02em; color: var(--shl-heading);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .echo-mod-copy em {
    display: block; margin-top: 4px; color: var(--shl-muted); font-size: 13px; font-style: normal; line-height: 1.45;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .echo-mod-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .echo-mod-copy [hidden], .echo-mod-meta[hidden] { display: none !important; }
  .echo-mod-row-actions { display: flex; flex-wrap: nowrap; align-items: center; gap: 4px; }
  .echo-mod-row-actions .echo-switch { margin-right: 8px; }
  .echo-mod-row .echo-icon-btn:not([data-armed="true"]) { opacity: 0.5; }
  .echo-mod-row:hover .echo-icon-btn, .echo-mod-row:focus-within .echo-icon-btn { opacity: 1; }

  .echo-mod-list[data-layout="grid"] { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
  .echo-mod-list[data-layout="grid"] .echo-mod-row {
    grid-template-columns: 52px minmax(0, 1fr); grid-template-rows: auto auto; align-items: start; align-content: space-between; gap: 14px 14px; padding: 18px;
  }
  .echo-mod-list[data-layout="grid"] .echo-mod-icon { width: 52px; height: 52px; border-radius: 16px; font-size: 19px; }
  .echo-mod-list[data-layout="grid"] .echo-mod-copy em { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .echo-mod-list[data-layout="grid"] .echo-mod-row-actions { grid-column: 1 / -1; justify-content: flex-end; padding-top: 12px; border-top: 1px solid var(--shl-border); }
  .echo-mod-list[data-layout="grid"] .echo-mod-row-actions .echo-switch { margin-right: auto; }

  /* ---- Empty state ---- */
  .echo-empty {
    position: relative; display: grid; justify-items: center; gap: 8px; padding: 54px 24px 46px; overflow: hidden;
    color: var(--shl-muted); text-align: center; border-radius: var(--shl-r4);
    border: 1.5px dashed color-mix(in srgb, var(--shl-border-strong) 80%, transparent);
    background: radial-gradient(90% 100% at 50% 0%, color-mix(in srgb, var(--shl-accent-bg) 60%, transparent), transparent 62%);
    animation: shlRise 640ms var(--shl-out) backwards;
  }
  .echo-empty-art { width: 176px; height: 118px; color: var(--shl-accent); overflow: visible; }
  .echo-empty-art .a { animation: shlFloat 6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .echo-empty-art .b { animation: shlFloat 6s ease-in-out -1.6s infinite; transform-box: fill-box; transform-origin: center; }
  .echo-empty-art .c { animation: shlFloat 6s ease-in-out -3.2s infinite; transform-box: fill-box; transform-origin: center; }
  .echo-empty-art .o { animation: shlSpin 26s linear infinite; transform-box: fill-box; transform-origin: center; }
  .echo-empty-art .s { animation: shlTwinkle 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .echo-empty-art .s2 { animation-delay: -1.4s; }
  .echo-empty-title { margin: 8px 0 0; font: 750 18px var(--shl-font); letter-spacing: -0.02em; color: var(--shl-heading); }
  .echo-empty-hint { margin: 0; max-width: 46ch; font-size: 13.5px; line-height: 1.6; }
  .echo-empty .shl-btn { margin-top: 14px; }

  /* ---- Skeleton ---- */
  .echo-skel {
    display: grid; grid-template-columns: 58px minmax(0, 1fr) 96px; gap: 18px; align-items: center;
    min-height: 92px; padding: 16px 20px; border-radius: var(--shl-r3);
    border: 1px solid var(--shl-border); background: var(--shl-panel);
  }
  .echo-skel i {
    display: block; height: 12px; border-radius: 8px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--shl-subtle) 14%, transparent) 20%, color-mix(in srgb, var(--shl-accent) 20%, transparent) 50%, color-mix(in srgb, var(--shl-subtle) 14%, transparent) 80%);
    background-size: 220% 100%; animation: shlShimmer 1.3s linear infinite;
  }
  .echo-skel-icon { width: 58px; height: 58px; border-radius: 18px; }
  .echo-skel-copy { display: grid; gap: 10px; }
  .echo-skel-copy i:first-child { width: 36%; height: 15px; }
  .echo-skel-copy i:last-child { width: 70%; }
  .echo-skel-btn { height: 36px; border-radius: 12px; }
  .echo-mod-list[data-layout="store"] > .echo-skel {
    grid-template-columns: 1fr; grid-template-rows: 92px auto auto; gap: 14px; min-height: 250px; padding: 0 0 18px; overflow: hidden;
  }
  .echo-mod-list[data-layout="store"] > .echo-skel > i:first-child { height: 92px; border-radius: 0; }


  /* ---- Market: account chip ---- */
  .shl-account {
    display: inline-flex; align-items: center; gap: 10px; height: 38px; padding: 0 6px 0 5px; border-radius: 999px;
    border: 1px solid var(--shl-border); background: var(--shl-panel);
    box-shadow: inset 0 1px 0 var(--shl-hi);
  }
  .shl-account[hidden] { display: none; }
  .shl-avatar {
    display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; flex: none;
    font: 800 12px var(--shl-font); color: #fff;
    background: conic-gradient(from 210deg, var(--aurora-1), var(--aurora-2), var(--aurora-3), var(--aurora-1));
  }
  .shl-account [data-account-name] { max-width: 14ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 650 12.5px var(--shl-font); color: var(--shl-heading); }
  .shl-account .shl-btn { height: 28px; min-height: 28px; padding: 0 11px; border-radius: 999px; font-size: 11.5px; }

  /* ---- Market: spotlight hero ---- */
  .shl-hero {
    position: relative; isolation: isolate; overflow: hidden; min-height: 320px; border-radius: var(--shl-r4); color: #fff;
    background:
      radial-gradient(70% 120% at 100% 0%, color-mix(in srgb, var(--tint, var(--shl-accent)) 60%, transparent), transparent 62%),
      radial-gradient(60% 100% at 0% 100%, color-mix(in srgb, var(--tint, var(--shl-accent)) 32%, transparent), transparent 70%),
      linear-gradient(135deg, color-mix(in srgb, var(--tint, var(--shl-accent)) 42%, #0b0d15), color-mix(in srgb, var(--tint, var(--shl-accent)) 14%, #07080d));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.16), 0 34px 70px -34px color-mix(in srgb, var(--tint, var(--shl-accent)) 70%, transparent), 0 1px 2px rgb(var(--shl-sh) / 0.2);
    transition: background 700ms var(--shl-ease);
  }
  .shl-hero[hidden] { display: none; }
  .shl-hero::before {
    content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: 0.5;
    background-image: linear-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.05) 1px, transparent 1px);
    background-size: 34px 34px;
    -webkit-mask-image: radial-gradient(80% 100% at 80% 20%, #000, transparent 75%);
    mask-image: radial-gradient(80% 100% at 80% 20%, #000, transparent 75%);
  }
  .shl-hero-slides { position: relative; min-height: 320px; }
  .shl-slide {
    position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(200px, 0.75fr); align-items: center; gap: 30px;
    padding: 38px 46px 54px; opacity: 0; visibility: hidden; pointer-events: none;
    transition: opacity 520ms var(--shl-ease), visibility 0s linear 520ms;
  }
  .shl-slide.is-active { opacity: 1; visibility: visible; pointer-events: auto; transition-delay: 0s; }
  .shl-slide-copy { display: grid; gap: 12px; justify-items: start; min-width: 0; }
  .shl-slide.is-active .shl-slide-copy > * { animation: shlSlideText 800ms var(--shl-out) backwards; animation-delay: calc(var(--d, 0) * 80ms + 120ms); }
  .shl-slide-eyebrow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; --d: 0; }
  .shl-slide-eyebrow .echo-badge { background: rgb(255 255 255 / 0.14); color: #fff; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.22); }
  .shl-slide-eyebrow .echo-badge-update { background: color-mix(in srgb, var(--shl-warning) 34%, transparent); }
  .shl-slide h2 {
    --d: 1; margin: 0; font: 800 clamp(30px, 3.6vw, 50px)/1 var(--shl-font); letter-spacing: -0.055em;
    overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    text-shadow: 0 2px 24px rgb(0 0 0 / 0.25);
  }
  .shl-slide p {
    --d: 2; margin: 0; max-width: 52ch; font-size: 14.5px; line-height: 1.6; color: rgb(255 255 255 / 0.82);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .shl-slide-stats { --d: 3; display: flex; flex-wrap: wrap; gap: 6px 18px; font: 600 12.5px var(--shl-font); color: rgb(255 255 255 / 0.78); }
  .shl-slide-stats span { display: inline-flex; align-items: center; gap: 6px; }
  .shl-slide-stats svg { width: 14px; height: 14px; opacity: 0.85; }
  .shl-slide-cta { --d: 4; display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
  .shl-slide .shl-btn { background: rgb(255 255 255 / 0.12); color: #fff; border-color: rgb(255 255 255 / 0.22); box-shadow: none; backdrop-filter: blur(8px); }
  .shl-slide .shl-btn:hover { background: rgb(255 255 255 / 0.2); border-color: rgb(255 255 255 / 0.4); box-shadow: 0 12px 26px -12px rgb(0 0 0 / 0.5); color: #fff; }
  .shl-slide .shl-btn--primary {
    background: #fff !important; color: color-mix(in srgb, var(--tint, var(--shl-accent)) 55%, #0b0d15) !important; border-color: transparent !important;
    box-shadow: 0 16px 30px -14px rgb(0 0 0 / 0.6) !important;
  }
  .shl-slide .shl-btn--primary::after { background: linear-gradient(105deg, transparent 32%, color-mix(in srgb, var(--tint, var(--shl-accent)) 30%, transparent) 50%, transparent 68%); }
  .shl-slide-art { position: relative; display: grid; place-items: center; min-height: 220px; }
  .shl-orbit {
    position: absolute; border-radius: 50%; border: 1px solid rgb(255 255 255 / 0.16);
    animation: shlSpin 40s linear infinite;
  }
  .shl-orbit:nth-child(1) { width: 250px; height: 250px; }
  .shl-orbit:nth-child(2) { width: 330px; height: 330px; animation-duration: 64s; animation-direction: reverse; border-style: dashed; opacity: 0.6; }
  .shl-orbit::after {
    content: ""; position: absolute; top: 10%; left: 50%; width: 9px; height: 9px; margin-left: -4.5px; border-radius: 50%;
    background: #fff; box-shadow: 0 0 16px 3px rgb(255 255 255 / 0.65);
  }
  .shl-slide-icon {
    position: relative; width: 164px; height: 164px; padding: 12px; border-radius: 48px; display: grid; place-items: center;
    font: 800 64px var(--shl-font); color: #fff;
    background: linear-gradient(150deg, rgb(255 255 255 / 0.4), rgb(255 255 255 / 0.08));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.32), 0 44px 70px -26px rgb(0 0 0 / 0.65), 0 0 90px -10px color-mix(in srgb, var(--tint, var(--shl-accent)) 70%, transparent);
  }
  .shl-slide.is-active .shl-slide-icon { animation: shlIconIn 1100ms var(--shl-spring) 100ms backwards, shlBob 6s ease-in-out 1.2s infinite; }
  .shl-slide-icon img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 36px; box-shadow: 0 12px 30px -10px rgb(0 0 0 / 0.55); }
  .shl-hero-nav {
    position: absolute; left: 46px; right: 46px; bottom: 20px; z-index: 3;
    display: flex; align-items: center; gap: 14px;
  }
  .shl-dots { display: flex; gap: 8px; flex: 1; }
  .shl-dot {
    position: relative; width: 26px; height: 5px; padding: 0; border: 0; border-radius: 99px; cursor: pointer; overflow: hidden;
    background: rgb(255 255 255 / 0.24); transition: width 420ms var(--shl-out), background 240ms var(--shl-ease);
  }
  .shl-dot::after { content: ""; position: absolute; inset: 0; background: #fff; transform: scaleX(0); transform-origin: 0 50%; }
  .shl-dot.is-active { width: 58px; }
  .shl-dot.is-active::after { animation: shlProgress var(--dur, 7s) linear forwards; }
  .shl-hero:hover .shl-dot.is-active::after, .shl-hero.is-paused .shl-dot.is-active::after { animation-play-state: paused; }
  .shl-dot.is-done::after { transform: scaleX(1); }
  .shl-hero-arrows { display: flex; gap: 8px; }
  .shl-hero-arrows button {
    width: 36px; height: 36px; padding: 0; display: grid; place-items: center; border-radius: 12px; cursor: pointer;
    border: 1px solid rgb(255 255 255 / 0.22); background: rgb(255 255 255 / 0.1); color: #fff; backdrop-filter: blur(8px);
    transition: background 180ms var(--shl-ease), transform 240ms var(--shl-spring);
  }
  .shl-hero-arrows button:hover { background: rgb(255 255 255 / 0.22); transform: scale(1.06); }
  .shl-hero-arrows button:active { transform: scale(0.92); }
  .shl-hero-arrows svg { width: 16px; height: 16px; display: block; }

  .shl-market-home, .shl-market-manage { display: grid; gap: 26px; min-width: 0; align-content: start; }
  .shl-market-manage .shl-mast { padding-top: 12px; }
  .shl-dice.is-rolling svg, [data-random-shuffle].is-rolling svg { animation: shlSpin 640ms var(--shl-out); }

  /* ---- Market: sections + tag rail ---- */
  .shl-section { display: grid; gap: 16px; min-width: 0; }
  .shl-section[hidden] { display: none !important; }
  .shl-section-head { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .shl-section-head h3 { margin: 0; font: 780 20px/1 var(--shl-font); letter-spacing: -0.035em; color: var(--shl-heading); white-space: nowrap; }
  .shl-section-head::after { content: ""; height: 1px; flex: 1; order: 1; background: linear-gradient(90deg, var(--shl-border-strong), transparent); }
  .shl-section-head > .shl-btn { order: 2; }
  .shl-section-head small { font: 600 11px var(--shl-mono); letter-spacing: 0.08em; color: var(--shl-subtle); }
  .echo-tag-row {
    display: flex; gap: 8px; overflow-x: auto; padding: 4px 2px 8px; margin: 0 -2px;
    scrollbar-width: none; overscroll-behavior-x: contain;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 18px, #000 calc(100% - 28px), transparent);
    mask-image: linear-gradient(90deg, transparent, #000 18px, #000 calc(100% - 28px), transparent);
  }
  .echo-tag-row::-webkit-scrollbar { display: none; }
  .echo-tag-row .echo-filter-count { min-width: 20px; }
  .echo-search-suggest {
    position: absolute; left: 0; right: 0; top: calc(100% + 10px); z-index: 12;
    display: grid; padding: 6px; border-radius: 16px;
    border: 1px solid var(--shl-border); background: var(--shl-panel-strong);
    box-shadow: 0 30px 60px -20px rgb(var(--shl-sh) / 0.6);
    animation: shlPop 260ms var(--shl-out);
  }
  .echo-search-suggest[hidden] { display: none; }
  .echo-search-suggest button {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
    padding: 10px 12px; border: 0; border-radius: 11px; background: transparent; color: inherit;
    font: 600 13px var(--shl-font); cursor: pointer; text-align: left;
    transition: background 140ms var(--shl-ease), padding-left 240ms var(--shl-out);
  }
  .echo-search-suggest button:hover { background: var(--shl-accent-bg); padding-left: 16px; }
  .echo-search-suggest small { color: var(--shl-subtle); font: 500 11px var(--shl-mono); }

  /* ---- Market: storefront cards ---- */
  .echo-mod-list[data-layout="store"] { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
  .echo-mod-list[data-layout="store"] > .echo-empty { grid-column: 1 / -1; }
  .echo-mod-list[data-layout="store"] > .echo-skel .echo-skel-copy { padding: 0 20px; }
  .echo-mod-list[data-layout="store"] > .echo-skel .echo-skel-btn { margin: 0 20px; }
  .echo-store-card {
    display: flex; flex-direction: column; gap: 0; grid-template-columns: none; padding: 0; min-height: 268px;
    align-items: stretch; --cover: 96px;
  }
  .echo-store-card:hover { transform: translateY(-4px); }
  .shl-cover {
    position: relative; height: var(--cover); flex: none; overflow: hidden;
    background:
      radial-gradient(90% 160% at 100% 0%, color-mix(in srgb, var(--tint, var(--shl-accent)) 55%, transparent), transparent 70%),
      linear-gradient(120deg, color-mix(in srgb, var(--tint, var(--shl-accent)) 30%, var(--shl-panel)), color-mix(in srgb, var(--tint, var(--shl-accent)) 8%, var(--shl-panel)));
  }
  .shl-cover::before {
    content: ""; position: absolute; inset: -20%; opacity: 0.5;
    background-image: repeating-linear-gradient(115deg, color-mix(in srgb, var(--tint, var(--shl-accent)) 30%, transparent) 0 1px, transparent 1px 14px);
    transition: transform 900ms var(--shl-out);
  }
  .echo-store-card:hover .shl-cover::before { transform: translateX(-32px); }
  .shl-cover::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, transparent 40%, var(--shl-panel));
  }
  .shl-cover-tags { position: absolute; top: 12px; right: 12px; z-index: 1; display: flex; gap: 6px; }
  .shl-store-main { position: relative; display: grid; gap: 4px; padding: 0 20px; margin-top: -30px; z-index: 1; min-width: 0; }
  .echo-store-card .echo-mod-icon {
    width: 62px; height: 62px; border-radius: 19px; font-size: 22px; margin-bottom: 8px;
    box-shadow: 0 0 0 4px var(--shl-panel), inset 0 1px 0 rgb(255 255 255 / 0.4), 0 14px 26px -12px color-mix(in srgb, var(--tint, var(--shl-accent)) 80%, transparent);
  }
  .echo-store-card:hover .echo-mod-icon { transform: translateY(-3px) scale(1.06) rotate(-4deg); }
  .echo-store-body { min-width: 0; }
  .echo-store-body strong {
    display: block; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font: 760 17px/1.3 var(--shl-font); letter-spacing: -0.028em; color: var(--shl-heading); transition: color 160ms var(--shl-ease);
  }
  .echo-store-body strong:hover { color: var(--shl-accent-strong); }
  .echo-store-byline {
    display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-top: 4px; min-width: 0;
    color: var(--shl-subtle); font: 550 12px var(--shl-font);
  }
  .echo-store-byline span { display: inline-flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .echo-store-byline svg { width: 12px; height: 12px; flex: none; }
  .echo-store-body em {
    display: -webkit-box; margin-top: 10px; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    color: var(--shl-muted); font-size: 13px; font-style: normal; line-height: 1.52; overflow-wrap: anywhere;
  }
  .echo-store-body em[hidden] { display: none; }
  .echo-store-foot {
    display: flex; align-items: center; gap: 8px; margin-top: auto; padding: 14px 20px 18px; min-width: 0;
  }
  .echo-store-foot .echo-mod-row-actions { width: 100%; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .echo-store-ghost {
    display: inline-flex; align-items: center; justify-content: center; height: 34px; padding: 0 13px; border-radius: 11px;
    border: 1px solid var(--shl-border); background: transparent; color: var(--shl-muted); text-decoration: none; cursor: pointer;
    font: 650 12.5px var(--shl-font); transition: background 160ms var(--shl-ease), color 160ms var(--shl-ease), border-color 160ms var(--shl-ease), transform 240ms var(--shl-spring);
  }
  .echo-store-ghost:hover { background: var(--shl-row-hover); color: var(--shl-heading); border-color: var(--shl-border-strong); }
  .echo-store-ghost:active { transform: scale(0.95); }
  .echo-market-action {
    position: relative; overflow: hidden; min-width: 92px; height: 34px; padding: 0 16px; border-radius: 11px; flex: none;
    border: 1px solid color-mix(in srgb, var(--shl-accent-solid) 70%, #000); color: var(--shl-on-accent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--shl-accent-solid) 84%, #fff), var(--shl-accent-solid));
    font: 700 12.5px var(--shl-font); cursor: pointer; white-space: nowrap;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.3), 0 10px 22px -12px var(--shl-glow);
    transition: transform 240ms var(--shl-spring), box-shadow 220ms var(--shl-ease), opacity 160ms var(--shl-ease), background 260ms var(--shl-ease), color 260ms var(--shl-ease);
  }
  .echo-market-action::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(105deg, transparent 32%, rgb(255 255 255 / 0.4) 50%, transparent 68%);
    transform: translateX(-125%); transition: transform 800ms var(--shl-out);
  }
  .echo-market-action:hover { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.3), 0 14px 26px -12px var(--shl-glow), 0 0 0 4px color-mix(in srgb, var(--shl-accent) 14%, transparent); }
  .echo-market-action:hover::after { transform: translateX(125%); }
  .echo-market-action:active { transform: scale(0.95); }
  .echo-market-action:disabled { cursor: progress; transform: none; }
  .echo-market-action:disabled::after {
    transform: none; animation: shlBusy 1.1s linear infinite;
    background: linear-gradient(105deg, transparent 20%, rgb(255 255 255 / 0.45) 50%, transparent 80%); background-size: 200% 100%;
  }
  .echo-market-action[data-kind="done"] {
    background: color-mix(in srgb, var(--shl-success) 11%, transparent); color: var(--shl-success);
    border-color: color-mix(in srgb, var(--shl-success) 30%, var(--shl-border)); box-shadow: none;
  }
  .echo-market-action[data-kind="done"]::after { display: none; }
  .echo-market-action[data-kind="done"] svg { width: 14px; height: 14px; vertical-align: -2px; margin-right: 4px; }
  .echo-market-action[data-kind="update"] {
    background: linear-gradient(180deg, color-mix(in srgb, var(--shl-warning) 84%, #fff), var(--shl-warning));
    border-color: color-mix(in srgb, var(--shl-warning) 70%, #000); color: #1b1300;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.35), 0 10px 22px -12px color-mix(in srgb, var(--shl-warning) 70%, transparent);
  }
  .echo-market-action.is-just-installed { animation: shlBurst 900ms var(--shl-out); }
  .echo-store-card[data-update="true"] { border-color: color-mix(in srgb, var(--shl-warning) 34%, var(--shl-border)); }
  .echo-store-card[data-installed="true"] .shl-cover { filter: saturate(0.85); }

  /* ---- Market: pager ---- */
  .echo-store-pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 10px 0 0; }
  .echo-store-pager[hidden] { display: none !important; }
  .echo-store-pager button {
    min-width: 38px; height: 38px; padding: 0 12px; border: 1px solid transparent; border-radius: 12px;
    background: transparent; color: var(--shl-muted); font: 700 13px var(--shl-mono); cursor: pointer;
    transition: background 160ms var(--shl-ease), color 160ms var(--shl-ease), transform 240ms var(--shl-spring);
  }
  .echo-store-pager button:hover:not(:disabled):not(.is-current) { background: var(--shl-row-hover); color: var(--shl-heading); transform: translateY(-1px); }
  .echo-store-pager button.is-current {
    background: var(--shl-accent-bg); color: var(--shl-accent-strong);
    border-color: color-mix(in srgb, var(--shl-accent) 34%, transparent); cursor: default;
  }
  .echo-store-pager button:disabled { opacity: 0.35; cursor: default; }

  /* ---- Market: login + manage ---- */
  .echo-market-login-overlay {
    position: fixed; inset: 0; z-index: 420; display: grid; place-items: center; padding: 24px;
    background: color-mix(in srgb, #06080d 58%, transparent);
    backdrop-filter: blur(20px) saturate(1.2); -webkit-backdrop-filter: blur(20px) saturate(1.2);
    animation: echoOverlayIn 240ms var(--shl-ease);
  }
  .echo-market-login-overlay[hidden] { display: none !important; }
  .echo-market-login-card {
    position: relative; overflow: hidden; width: min(430px, calc(100vw - 48px));
    display: grid; gap: 16px; padding: 30px 30px 24px;
    background: var(--shl-panel); color: var(--theme-page-text, inherit);
    border: 1px solid var(--shl-border); border-radius: 26px;
    box-shadow: 0 50px 100px -30px rgb(0 0 0 / 0.7), inset 0 1px 0 var(--shl-hi);
    animation: echoCardIn 520ms var(--shl-spring);
  }
  .echo-market-login-card::before {
    content: ""; position: absolute; left: -20%; right: -20%; top: -90px; height: 220px; z-index: 0; opacity: 0.55; filter: blur(30px);
    background: radial-gradient(50% 60% at 30% 50%, var(--aurora-1), transparent), radial-gradient(50% 60% at 75% 40%, var(--aurora-2), transparent);
  }
  .echo-market-login-card > * { position: relative; z-index: 1; }
  .echo-market-login-card h2 { margin: 30px 0 0; font: 800 28px/1.05 var(--shl-font); letter-spacing: -0.05em; color: var(--shl-heading); }
  .echo-market-login-card .echo-config-desc { margin: 0; }
  .echo-market-login-card form { display: grid; gap: 10px; }
  .echo-market-login-card input {
    width: 100%; height: 46px; padding: 0 15px; border: 1px solid var(--shl-border); border-radius: 14px;
    background: var(--shl-well); color: inherit; font: 500 14px var(--shl-font);
    transition: border-color 180ms var(--shl-ease), box-shadow 180ms var(--shl-ease), background 180ms var(--shl-ease);
  }
  .echo-market-login-card input:focus { outline: none; background: var(--shl-panel); border-color: var(--shl-accent); box-shadow: 0 0 0 4px var(--shl-focus-ring); }
  .echo-market-login-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 6px; }
  .shl-manage-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
  .echo-market-page [data-manage-list] .echo-mod-row { grid-template-columns: minmax(0, 1fr) !important; min-height: 0; }
  .echo-market-page [data-manage-list] .echo-mod-row-actions { justify-content: flex-start; flex-wrap: wrap; gap: 8px; }
  .echo-md { display: grid; gap: 10px; font-size: 13.5px; line-height: 1.7; }
  .echo-md h3, .echo-md h4, .echo-md h2 { margin: 12px 0 0; font: 760 15px var(--shl-font); letter-spacing: -0.02em; color: var(--shl-heading); }
  .echo-md p, .echo-md li { margin: 0; color: var(--shl-muted); }
  .echo-md ul { margin: 0; padding-left: 1.3em; display: grid; gap: 4px; }
  .echo-md pre {
    margin: 0; padding: 14px 16px; overflow: auto; border-radius: 14px; border: 1px solid var(--shl-border);
    background: var(--shl-well); font: 12px/1.6 var(--shl-mono);
  }
  @media (max-width: 1280px) { .echo-mod-list[data-layout="store"] { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 860px) {
    .echo-mod-list[data-layout="store"] { grid-template-columns: minmax(0, 1fr); }
    .shl-slide { grid-template-columns: minmax(0, 1fr); padding: 30px 26px 60px; }
    .shl-slide-art { display: none; }
    .shl-hero-nav { left: 26px; right: 26px; }
  }


  /* ---- Loader: link diagram ---- */
  .shl-link-card { flex: 0 1 480px; display: grid; gap: 18px; padding: 22px 24px 18px; align-self: flex-end; }
  .shl-link-card::before {
    content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    background: radial-gradient(90% 120% at 100% 0%, color-mix(in srgb, var(--shl-accent) 14%, transparent), transparent 64%);
  }
  .shl-link { display: grid; grid-template-columns: auto minmax(60px, 1fr) auto; align-items: start; }
  .shl-node { position: relative; display: grid; justify-items: center; gap: 9px; width: 96px; text-align: center; }
  .shl-node-disc {
    position: relative; display: grid; place-items: center; width: 68px; height: 68px; border-radius: 24px; color: #fff;
    background: linear-gradient(150deg, color-mix(in srgb, var(--shl-accent-solid) 90%, #fff), color-mix(in srgb, var(--shl-accent-solid) 68%, #000));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.4), 0 18px 32px -14px var(--shl-glow);
    transition: filter 400ms var(--shl-ease), box-shadow 400ms var(--shl-ease), transform 500ms var(--shl-spring);
  }
  .shl-node:hover .shl-node-disc { transform: translateY(-3px) scale(1.05) rotate(-3deg); }
  .shl-node-disc svg { width: 30px; height: 30px; display: block; }
  .shl-node-disc::after {
    content: ""; position: absolute; inset: -7px; border-radius: 30px; border: 1.5px solid var(--shl-success);
    opacity: 0; animation: shlRing 2.8s var(--shl-out) infinite;
  }
  .shl-node[data-tone="ok"] .shl-node-disc::after { opacity: 1; }
  .shl-node[data-tone="warn"] .shl-node-disc::after { opacity: 1; border-color: var(--shl-warning); }
  .shl-node[data-tone="off"] .shl-node-disc { filter: grayscale(1) brightness(1.05); opacity: 0.55; box-shadow: none; }
  .shl-node[data-node="echo"] .shl-node-disc {
    background: linear-gradient(150deg, #5cc8ff, #1877d9);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.4), 0 18px 32px -14px rgb(24 119 217 / 0.6);
  }
  .shl-node b { font: 780 14px/1 var(--shl-font); letter-spacing: -0.02em; color: var(--shl-heading); }
  .shl-node small { display: block; margin-top: -3px; max-width: 14ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 11px var(--shl-mono); color: var(--shl-subtle); }
  .shl-wire { position: relative; height: 68px; margin: 0 6px; display: grid; align-items: center; }
  .shl-wire::before {
    content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 2px; transform: translateY(-50%); border-radius: 2px;
    background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--shl-subtle) 46%, transparent) 0 7px, transparent 7px 13px);
    background-size: 26px 2px; animation: shlMarch 1.6s linear infinite;
  }
  .shl-wire[data-tone="ok"]::before {
    background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--shl-success) 80%, transparent) 0 7px, transparent 7px 13px);
    background-size: 26px 2px;
  }
  .shl-wire[data-tone="warn"]::before {
    background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--shl-warning) 84%, transparent) 0 7px, transparent 7px 13px);
    background-size: 26px 2px;
  }
  .shl-wire[data-tone="off"]::before { animation: none; }
  .shl-wire em {
    position: relative; z-index: 1; justify-self: center; margin-top: -34px; padding: 3px 9px; border-radius: 999px;
    font: 700 10.5px var(--shl-mono); font-style: normal; letter-spacing: 0.05em; color: var(--shl-muted);
    background: var(--shl-panel); box-shadow: 0 0 0 1px var(--shl-border);
  }
  .shl-wire i {
    position: absolute; top: 50%; left: 0; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; opacity: 0;
    background: var(--shl-success); box-shadow: 0 0 14px 2px var(--shl-success);
  }
  .shl-wire[data-tone="ok"] i { opacity: 1; animation: shlPacket 2.4s linear infinite; }
  .shl-wire[data-tone="ok"] i:nth-of-type(2) { animation-delay: -0.8s; }
  .shl-wire[data-tone="ok"] i:nth-of-type(3) { animation-delay: -1.6s; }
  .shl-wire[data-tone="warn"] i { opacity: 1; background: var(--shl-warning); box-shadow: 0 0 14px 2px var(--shl-warning); animation: shlPacket 4.2s linear infinite; }
  .shl-sats { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 14px; border-top: 1px solid var(--shl-border); }
  .shl-sat {
    display: inline-flex; align-items: center; gap: 8px; height: 28px; padding: 0 11px; border-radius: 999px;
    background: var(--shl-well); box-shadow: inset 0 0 0 1px var(--shl-border);
    font: 650 11.5px var(--shl-font); color: var(--shl-muted);
  }
  .shl-sat i { width: 7px; height: 7px; border-radius: 50%; background: var(--shl-subtle); transition: background 300ms var(--shl-ease), box-shadow 300ms var(--shl-ease); }
  .shl-sat[data-tone="ok"] i { background: var(--shl-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--shl-success) 20%, transparent); }
  .shl-sat[data-tone="warn"] i { background: var(--shl-warning); box-shadow: 0 0 0 3px color-mix(in srgb, var(--shl-warning) 22%, transparent); }
  .shl-sat b { font: 700 11px var(--shl-mono); color: var(--shl-heading); }

  /* ---- Loader: bento ---- */
  .shl-bento { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
  .shl-bento > .shl-card { padding: 24px 26px 26px; }
  .shl-b-12 { grid-column: span 12; }
  .shl-b-7 { grid-column: span 7; }
  .shl-b-5 { grid-column: span 5; }
  .echo-status-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .echo-status-chip {
    position: relative; display: grid; gap: 7px; min-width: 0; padding: 14px 16px 15px; border-radius: 16px;
    background: var(--shl-well); border: 1px solid var(--shl-border); overflow: hidden;
    animation: shlCardIn 560ms var(--shl-out) backwards; animation-delay: calc(var(--i, 0) * 40ms + 120ms);
    transition: transform 320ms var(--shl-spring), border-color 220ms var(--shl-ease), background 220ms var(--shl-ease);
  }
  .echo-status-chip:hover { transform: translateY(-2px); border-color: var(--shl-border-strong); background: var(--shl-panel); }
  .echo-status-chip small {
    display: flex; align-items: center; gap: 8px; color: var(--shl-subtle);
    font: 700 10.5px var(--shl-mono); letter-spacing: 0.14em; text-transform: uppercase;
  }
  .echo-status-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--shl-accent); transition: background 300ms var(--shl-ease), box-shadow 300ms var(--shl-ease); }
  .echo-status-chip[data-tone="ok"] .echo-status-dot { background: var(--shl-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--shl-success) 18%, transparent); }
  .echo-status-chip[data-tone="warn"] .echo-status-dot { background: var(--shl-warning); box-shadow: 0 0 0 3px color-mix(in srgb, var(--shl-warning) 20%, transparent); }
  .echo-status-chip[data-tone="muted"] .echo-status-dot { background: var(--shl-subtle); box-shadow: 0 0 0 3px color-mix(in srgb, var(--shl-subtle) 16%, transparent); }
  .echo-status-chip strong {
    display: block; min-width: 0; overflow-wrap: anywhere; color: var(--shl-heading);
    font: 700 15px/1.2 var(--shl-mono); letter-spacing: -0.02em; font-variant-numeric: tabular-nums;
  }
  .echo-status-chip.is-changed { animation: shlFlash 900ms var(--shl-out); }

  /* ---- Loader: steam + toggles ---- */
  .shl-lines { display: grid; gap: 14px; }
  .shl-lines > .shl-btn { justify-self: start; }
  .shl-lines p { margin: 0; font-size: 13px; line-height: 1.6; color: var(--shl-muted); }
  .shl-lines .shl-strong { font: 700 14px/1.4 var(--shl-font); color: var(--shl-heading); letter-spacing: -0.01em; }
  .echo-steam-launch-copy {
    position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 4px 14px; width: 100%;
    padding: 15px 16px; text-align: left; cursor: pointer; border-radius: 16px; overflow: hidden;
    border: 1px solid var(--shl-border); background: #0d1017; color: #d9e0ee; font: inherit;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.07), 0 18px 34px -22px rgb(var(--shl-sh) / 0.7);
    transition: transform 280ms var(--shl-spring), border-color 220ms var(--shl-ease), box-shadow 260ms var(--shl-ease);
  }
  .echo-steam-launch-copy::before {
    content: "$"; grid-row: 1 / span 2; font: 700 15px var(--shl-mono); color: #7dffb3; text-shadow: 0 0 14px rgb(125 255 179 / 0.6);
  }
  .echo-steam-launch-copy::after {
    content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0;
    background: linear-gradient(105deg, transparent 30%, rgb(125 255 179 / 0.12) 50%, transparent 70%); transform: translateX(-100%);
  }
  .echo-steam-launch-copy:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--shl-accent) 55%, rgb(255 255 255 / 0.1)); }
  .echo-steam-launch-copy:hover::after { opacity: 1; animation: shlSweep 1.4s var(--shl-out); }
  .echo-steam-launch-copy:active { transform: scale(0.985); }
  .echo-steam-launch-copy code {
    display: block; white-space: pre-wrap; word-break: break-all; color: #e6ecf7;
    font: 500 12.5px/1.5 var(--shl-mono);
  }
  .echo-steam-launch-copy small {
    grid-column: 2 / span 2; display: block; font: 700 10.5px var(--shl-mono); letter-spacing: 0.12em; text-transform: uppercase; color: #8aa0c4;
    transition: color 200ms var(--shl-ease);
  }
  .echo-steam-launch-copy[data-copy-state="ok"] { border-color: color-mix(in srgb, var(--shl-success) 60%, transparent); animation: shlBurst 700ms var(--shl-out); }
  .echo-steam-launch-copy[data-copy-state="ok"] small { color: #7dffb3; }
  .echo-steam-launch-copy[data-copy-state="err"] { border-color: color-mix(in srgb, var(--shl-danger) 60%, transparent); animation: shlShake 420ms var(--shl-out); }
  .echo-steam-launch-copy[data-copy-state="err"] small { color: #ff8b8b; }
  .echo-steam-launch-copy .shl-copy-ico { grid-column: 3; grid-row: 1; display: grid; place-items: center; color: #8aa0c4; transition: color 200ms var(--shl-ease), transform 320ms var(--shl-spring); }
  .echo-steam-launch-copy .shl-copy-ico svg { width: 17px; height: 17px; display: block; }
  .echo-steam-launch-copy:hover .shl-copy-ico { color: #fff; transform: scale(1.12); }
  .echo-appearance-hint { margin: -6px 0 18px; color: var(--shl-muted); font-size: 13px; line-height: 1.55; }
  .shl-toggle {
    display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 16px 0 0; margin-top: 4px;
    border-top: 1px solid var(--shl-border);
  }
  .shl-toggle > div { display: grid; gap: 3px; min-width: 0; }
  .shl-toggle strong { font: 680 13.5px var(--shl-font); color: var(--shl-heading); letter-spacing: -0.01em; }
  .shl-toggle span { font-size: 12.5px; line-height: 1.5; color: var(--shl-muted); }

  /* ---- Loader: appearance ---- */
  .shl-prefs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 44px; }
  .echo-appearance-row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 60px; padding: 10px 0;
    border-bottom: 1px solid var(--shl-border);
  }
  .echo-appearance-row > strong { font: 650 13.5px var(--shl-font); color: var(--shl-heading); letter-spacing: -0.01em; }
  .echo-appearance-row > .shl-seg { padding: 3px; border-radius: 13px; }
  .echo-appearance-row > .shl-seg > button { height: 30px; padding: 0 12px; font-size: 12px; }
  .echo-appearance-row > .shl-seg .shl-seg-thumb { top: 3px; bottom: 3px; border-radius: 10px; }
  .echo-appearance-color { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
  .shl-swatch {
    position: relative; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; flex: none;
    background: var(--c); box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.14), 0 6px 12px -6px var(--c);
    transition: transform 320ms var(--shl-spring), box-shadow 220ms var(--shl-ease);
  }
  .shl-swatch:hover { transform: scale(1.22); }
  .shl-swatch:active { transform: scale(0.9); }
  .shl-swatch.is-on { box-shadow: 0 0 0 2px var(--shl-panel), 0 0 0 4px var(--c), 0 8px 16px -6px var(--c); transform: scale(1.05); }
  .shl-swatch.is-on::after {
    content: ""; position: absolute; left: 8px; top: 5px; width: 6px; height: 10px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);
    filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.4)); animation: shlPop 300ms var(--shl-spring);
  }
  .shl-swatch--custom {
    background: conic-gradient(#ff5a5f, #ffb400, #3ddc84, #22d3ee, #6366f1, #d946ef, #ff5a5f); overflow: hidden;
  }
  .shl-swatch--custom input { position: absolute; inset: -6px; width: 40px; height: 40px; opacity: 0; cursor: pointer; }
  .echo-appearance-color .shl-reset {
    height: 24px; padding: 0 9px; border: 1px solid var(--shl-border); border-radius: 999px; background: transparent; color: var(--shl-muted);
    font: 650 11px var(--shl-font); cursor: pointer; transition: color 160ms var(--shl-ease), border-color 160ms var(--shl-ease), background 160ms var(--shl-ease);
  }
  .echo-appearance-color .shl-reset:hover { color: var(--shl-heading); border-color: var(--shl-border-strong); background: var(--shl-row-hover); }
  .echo-appearance-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }

  /* ---- Loader: terminal ---- */
  .echo-debug-console {
    display: grid; grid-template-rows: auto 1fr auto; min-height: 340px; max-height: min(560px, calc(100vh - 240px)); overflow: hidden;
    border-radius: 18px; border: 1px solid rgb(255 255 255 / 0.08);
    background: radial-gradient(90% 60% at 0% 0%, color-mix(in srgb, var(--shl-accent) 10%, transparent), transparent 60%), linear-gradient(180deg, #0f131c, #090b11);
    color: #d3dbe9; font: 12.5px/1.6 var(--shl-mono);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 30px 60px -30px rgb(0 0 0 / 0.7);
    transition: border-color 240ms var(--shl-ease), box-shadow 240ms var(--shl-ease);
  }
  .echo-debug-console:focus-within {
    border-color: color-mix(in srgb, var(--shl-accent) 60%, rgb(255 255 255 / 0.08));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 30px 60px -30px rgb(0 0 0 / 0.7), 0 0 0 4px color-mix(in srgb, var(--shl-accent) 16%, transparent);
  }
  .echo-debug-toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 14px;
    background: rgb(255 255 255 / 0.03); color: #7f8aa3; border-bottom: 1px solid rgb(255 255 255 / 0.06);
  }
  .echo-debug-toolbar-left { display: inline-flex; align-items: center; gap: 12px; min-width: 0; font-size: 11.5px; }
  .echo-debug-dots { display: inline-flex; gap: 6px; flex: none; }
  .echo-debug-dots i { width: 10px; height: 10px; border-radius: 50%; opacity: 0.9; transition: transform 240ms var(--shl-spring); }
  .echo-debug-console:hover .echo-debug-dots i { transform: scale(1.15); }
  .echo-debug-dots i:nth-child(1) { background: #ff5f57; }
  .echo-debug-dots i:nth-child(2) { background: #febc2e; }
  .echo-debug-dots i:nth-child(3) { background: #28c840; }
  .echo-debug-actions { display: flex; align-items: center; gap: 8px; }
  .echo-debug-clear {
    height: 26px; padding: 0 11px; border-radius: 8px; cursor: pointer;
    border: 1px solid rgb(255 255 255 / 0.1); background: rgb(255 255 255 / 0.05); color: #a9b4cb; font: 650 11px var(--shl-font);
    transition: background 160ms var(--shl-ease), color 160ms var(--shl-ease), transform 240ms var(--shl-spring);
  }
  .echo-debug-clear:hover { background: rgb(255 255 255 / 0.12); color: #f0f4fb; }
  .echo-debug-clear:active { transform: scale(0.94); }
  .echo-debug-output {
    margin: 0; padding: 12px 16px; overflow: auto; white-space: pre-wrap; word-break: break-word; min-height: 220px; color: #c6cfdd;
    scrollbar-width: thin; scrollbar-color: rgb(255 255 255 / 0.18) transparent;
  }
  .echo-debug-output::-webkit-scrollbar { width: 8px; }
  .echo-debug-output::-webkit-scrollbar-thumb { background: rgb(255 255 255 / 0.16); border-radius: 99px; }
  .echo-debug-output > div { padding: 1px 0; border-radius: 4px; animation: shlLine 420ms var(--shl-out); }
  .echo-debug-output time { color: #566079; margin-right: 8px; }
  .echo-debug-output b { display: inline-block; min-width: 5.2ch; margin-right: 8px; font-weight: 700; color: #7fb4ff; }
  .echo-debug-output .lv-warn b { color: #ffcd6b; }
  .echo-debug-output .lv-error b, .echo-debug-output .echo-debug-err b { color: #ff8585; }
  .echo-debug-output .lv-debug b { color: #7f8aa3; }
  .echo-debug-output .echo-debug-in { color: #9ad4ff; }
  .echo-debug-output .echo-debug-err { color: #ff8b8b; }
  .echo-debug-form { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: center; padding: 12px 16px; background: rgb(255 255 255 / 0.03); border-top: 1px solid rgb(255 255 255 / 0.06); }
  .echo-debug-form span { color: #7dffb3; font-weight: 700; text-shadow: 0 0 12px rgb(125 255 179 / 0.5); }
  .echo-debug-form input { width: 100%; border: 0; outline: none; background: transparent; color: #eef2fa; font: inherit; caret-color: #7dffb3; }
  .echo-debug-form input::placeholder { color: rgb(139 147 167 / 0.5); }


  /* ---- Sheet (config + market detail) ---- */
  .echo-config-overlay {
    position: fixed; inset: 0; z-index: 240; display: flex; justify-content: flex-end; align-items: stretch; padding: 14px;
    background: color-mix(in srgb, #05070c 46%, transparent);
    backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2);
    animation: echoOverlayIn 260ms var(--shl-ease);
  }
  .echo-config-overlay.is-leaving { animation: echoOverlayOut 240ms var(--shl-ease) forwards; }
  .echo-config-card {
    position: relative; isolation: isolate; width: min(540px, 100%); height: 100%; overflow: hidden;
    display: flex; flex-direction: column;
    background: var(--shl-panel); color: var(--theme-page-text, inherit);
    border: 1px solid var(--shl-border); border-radius: 28px;
    box-shadow: 0 60px 120px -30px rgb(0 0 0 / 0.65), inset 0 1px 0 var(--shl-hi);
    animation: shlSheetIn 620ms var(--shl-out);
  }
  .echo-config-card[data-custom="true"] { width: min(780px, 100%); }
  .echo-config-card[data-detail="true"] { width: min(680px, 100%); }
  .echo-config-overlay.is-leaving .echo-config-card { animation: shlSheetOut 260ms var(--shl-ease) forwards; }
  .echo-config-card header {
    position: relative; display: flex; align-items: center; justify-content: space-between; gap: 14px; flex: none;
    padding: 22px 24px 18px; overflow: hidden;
    border-bottom: 1px solid var(--shl-border);
  }
  .echo-config-card header::before {
    content: ""; position: absolute; left: -10%; right: -10%; top: -70px; height: 190px; z-index: -1; opacity: 0.5; filter: blur(30px);
    background: radial-gradient(50% 60% at 20% 50%, color-mix(in srgb, var(--tint, var(--aurora-1)) 90%, transparent), transparent), radial-gradient(50% 60% at 80% 40%, var(--aurora-2), transparent);
  }
  .echo-config-lead { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .echo-config-lead .echo-mod-icon { width: 48px; height: 48px; border-radius: 15px; font-size: 18px; }
  .echo-config-lead .echo-mod-icon:hover { transform: none; }
  .echo-config-heading { display: grid; gap: 3px; min-width: 0; }
  .echo-config-kicker { font: 700 10.5px var(--shl-mono); letter-spacing: 0.2em; text-transform: uppercase; color: var(--shl-accent-strong); }
  .echo-config-card header strong {
    font: 780 21px/1.15 var(--shl-font); letter-spacing: -0.035em; color: var(--shl-heading);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .echo-config-close { width: 38px; height: 38px; border-radius: 12px; flex: none; border-color: var(--shl-border); background: var(--shl-panel); }
  .echo-config-close:hover svg { transform: rotate(90deg); }
  .echo-config-card footer {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex: none; padding: 16px 24px;
    border-top: 1px solid var(--shl-border); background: color-mix(in srgb, var(--shl-well) 70%, transparent);
  }
  .echo-config-card footer[data-save-hidden="true"] [data-save] { display: none; }
  .echo-config-body {
    display: grid; gap: 12px; align-content: start; padding: 22px 24px; flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain;
    scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--shl-subtle) 40%, transparent) transparent;
  }
  .echo-config-body::-webkit-scrollbar { width: 8px; }
  .echo-config-body::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--shl-subtle) 36%, transparent); border-radius: 99px; }
  .echo-config-body > *, .echo-config-form > * { animation: shlFieldIn 520ms var(--shl-out) backwards; animation-delay: calc(var(--fi, 0) * 42ms + 120ms); }
  .echo-config-body > :nth-child(1), .echo-config-form > :nth-child(1) { --fi: 0; }
  .echo-config-body > :nth-child(2), .echo-config-form > :nth-child(2) { --fi: 1; }
  .echo-config-body > :nth-child(3), .echo-config-form > :nth-child(3) { --fi: 2; }
  .echo-config-body > :nth-child(4), .echo-config-form > :nth-child(4) { --fi: 3; }
  .echo-config-body > :nth-child(5), .echo-config-form > :nth-child(5) { --fi: 4; }
  .echo-config-body > :nth-child(6), .echo-config-form > :nth-child(6) { --fi: 5; }
  .echo-config-body > :nth-child(7), .echo-config-form > :nth-child(7) { --fi: 6; }
  .echo-config-body > :nth-child(n+8), .echo-config-form > :nth-child(n+8) { --fi: 7; }
  .echo-config-form { display: grid; gap: 12px; }
  .echo-config-field {
    display: grid; gap: 7px; padding: 15px 16px 16px; border-radius: 18px;
    border: 1px solid var(--shl-border); background: var(--shl-well); font: 13px var(--shl-font);
    transition: border-color 200ms var(--shl-ease), background 200ms var(--shl-ease), box-shadow 200ms var(--shl-ease);
  }
  .echo-config-field:focus-within { border-color: color-mix(in srgb, var(--shl-accent) 50%, var(--shl-border)); background: var(--shl-panel); box-shadow: 0 0 0 4px var(--shl-focus-ring); }
  .echo-config-field:has(.echo-switch-field) { grid-template-columns: minmax(0, 1fr) auto; column-gap: 18px; align-items: center; }
  .echo-config-field:has(.echo-switch-field) > .echo-config-label, .echo-config-field:has(.echo-switch-field) > .echo-config-desc { grid-column: 1; }
  .echo-config-field:has(.echo-switch-field) > .echo-switch-field { grid-column: 2; grid-row: 1 / span 2; }
  .echo-config-label { font: 680 13.5px var(--shl-font); letter-spacing: -0.01em; color: var(--shl-heading); }
  .echo-config-desc { color: var(--shl-muted); font-size: 12.5px; line-height: 1.55; }
  .echo-config-default { display: inline-flex; align-items: center; gap: 5px; color: var(--shl-subtle); font: 500 11px var(--shl-mono); }
  .echo-config-field input:not([type="range"]):not([type="checkbox"]), .echo-config-field select, .echo-config-json {
    width: 100%; min-height: 42px; padding: 0 13px; border: 1px solid var(--shl-field-border); border-radius: 12px;
    background: var(--shl-panel); color: inherit; font: 500 13.5px var(--shl-font);
    transition: border-color 180ms var(--shl-ease), box-shadow 180ms var(--shl-ease);
  }
  .echo-config-field input:hover, .echo-config-field select:hover, .echo-config-json:hover { border-color: var(--shl-border-strong); }
  .echo-config-field select {
    appearance: none; padding-right: 34px; cursor: pointer;
    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position: calc(100% - 17px) calc(50% - 2px), calc(100% - 12px) calc(50% - 2px);
    background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
  }
  .echo-config-field input:focus, .echo-config-field select:focus, .echo-config-json:focus { outline: none; border-color: var(--shl-accent); box-shadow: 0 0 0 3px var(--shl-focus-ring); }
  .echo-config-json { min-height: 220px; padding: 12px 14px; font: 12px/1.6 var(--shl-mono); resize: vertical; }
  .echo-config-json-wrap { display: grid; gap: 7px; }
  .echo-config-range { display: grid; grid-template-columns: minmax(0, 1fr) 96px; align-items: center; gap: 14px; }
  .echo-config-range input[type="range"] {
    -webkit-appearance: none; appearance: none; width: 100%; height: 22px; margin: 0; background: transparent; cursor: pointer;
    --p: 50%;
  }
  .echo-config-range input[type="range"]::-webkit-slider-runnable-track {
    height: 6px; border-radius: 99px;
    background: linear-gradient(90deg, var(--shl-accent) var(--p), color-mix(in srgb, var(--shl-subtle) 30%, transparent) var(--p));
  }
  .echo-config-range input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 20px; height: 20px; margin-top: -7px; border-radius: 50%; background: #fff; border: 0;
    box-shadow: 0 0 0 1px rgb(var(--shl-sh) / 0.14), 0 3px 10px rgb(var(--shl-sh) / 0.4); transition: transform 240ms var(--shl-spring);
  }
  .echo-config-range input[type="range"]:hover::-webkit-slider-thumb { transform: scale(1.14); }
  .echo-config-range input[type="range"]:active::-webkit-slider-thumb { transform: scale(0.92); box-shadow: 0 0 0 6px var(--shl-focus-ring), 0 3px 10px rgb(var(--shl-sh) / 0.4); }
  .echo-config-error {
    margin: 0 24px 14px; padding: 11px 14px; border-radius: 14px; flex: none;
    background: color-mix(in srgb, var(--shl-danger) 9%, transparent); border: 1px solid color-mix(in srgb, var(--shl-danger) 24%, transparent);
    color: var(--shl-danger); font: 550 12.5px/1.5 var(--shl-font); animation: shlShake 420ms var(--shl-out);
  }
  .echo-config-error:empty { display: none; }
  .shl-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 10px; }
  .shl-tile { display: grid; gap: 5px; padding: 14px 15px; border-radius: 16px; background: var(--shl-well); border: 1px solid var(--shl-border); }
  .shl-tile small { font: 700 10px var(--shl-mono); letter-spacing: 0.16em; text-transform: uppercase; color: var(--shl-subtle); }
  .shl-tile b { font: 780 21px/1 var(--shl-font); letter-spacing: -0.04em; color: var(--shl-heading); font-variant-numeric: tabular-nums; }
  .echo-config-card[data-detail="true"] .echo-config-body { gap: 18px; }

  /* ---- Toasts ---- */
  .echo-toast-stack {
    position: fixed; right: 22px; bottom: calc(var(--player-height, 112px) + 16px); z-index: 320;
    display: flex; flex-direction: column; align-items: flex-end; gap: 10px; pointer-events: none;
  }
  .echo-toast {
    position: relative; display: flex; align-items: center; gap: 12px; overflow: hidden;
    min-width: 250px; max-width: min(430px, calc(100vw - 44px)); padding: 10px 18px 12px 10px; pointer-events: auto; cursor: pointer;
    border-radius: 18px; background: var(--shl-glass); color: var(--theme-page-text, inherit);
    border: 1px solid var(--shl-border);
    box-shadow: inset 0 1px 0 var(--shl-hi), 0 24px 50px -20px rgb(var(--shl-sh) / 0.6);
    backdrop-filter: blur(22px) saturate(1.6); -webkit-backdrop-filter: blur(22px) saturate(1.6);
    font: 550 13px/1.45 var(--shl-font);
    animation: shlToastIn 620ms var(--shl-spring);
  }
  .echo-toast::after {
    content: ""; position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; transform-origin: 0 50%;
    background: currentColor; opacity: 0.55; animation: shlToastTime 3.6s linear forwards;
  }
  .echo-toast:hover::after { animation-play-state: paused; }
  .echo-toast.is-leaving { animation: shlToastOut 300ms var(--shl-ease) forwards; pointer-events: none; }
  .echo-toast-icon {
    display: grid; place-items: center; width: 34px; height: 34px; border-radius: 12px; flex: none;
    color: var(--shl-accent); background: color-mix(in srgb, currentColor 14%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 24%, transparent);
  }
  .echo-toast-icon svg { width: 16px; height: 16px; display: block; }
  .echo-toast.success { color: var(--shl-success); }
  .echo-toast.error { color: var(--shl-danger); }
  .echo-toast.warn { color: var(--shl-warning); }
  .echo-toast .echo-toast-msg { color: var(--theme-page-text, var(--shl-heading)); }
  .echo-toast.success .echo-toast-icon svg path { stroke-dasharray: 24; animation: shlDraw 520ms var(--shl-out) 160ms backwards; }
  .echo-toast-msg { flex: 1; min-width: 0; overflow-wrap: anywhere; }

  /* ---- First-run disclaimer ---- */
  .echo-disclaimer-overlay {
    position: fixed; inset: 0; z-index: 400; display: grid; place-items: center; padding: 24px; font-family: var(--shl-font);
    background: radial-gradient(60% 60% at 50% 30%, color-mix(in srgb, var(--aurora-1) 22%, transparent), transparent 70%), color-mix(in srgb, #05070c 66%, transparent);
    backdrop-filter: blur(22px) saturate(1.3); -webkit-backdrop-filter: blur(22px) saturate(1.3);
    animation: echoOverlayIn 300ms var(--shl-ease);
  }
  .echo-disclaimer-overlay.is-leaving { animation: echoOverlayOut 240ms var(--shl-ease) forwards; }
  .echo-disclaimer-card {
    position: relative; isolation: isolate; width: min(680px, calc(100vw - 48px)); max-height: calc(100vh - 64px); overflow: hidden;
    display: flex; flex-direction: column;
    background: var(--shl-panel); color: var(--theme-page-text, inherit);
    border: 1px solid var(--shl-border); border-radius: 30px;
    box-shadow: 0 60px 120px -30px rgb(0 0 0 / 0.7), inset 0 1px 0 var(--shl-hi);
    animation: echoCardIn 700ms var(--shl-spring);
  }
  .echo-disclaimer-overlay.is-leaving .echo-disclaimer-card { animation: echoCardOut 240ms var(--shl-ease) forwards; }
  .echo-disclaimer-card::before {
    content: ""; position: absolute; left: -10%; right: -10%; top: -110px; height: 260px; z-index: -1; opacity: 0.55; filter: blur(34px);
    background: radial-gradient(50% 60% at 25% 50%, var(--aurora-1), transparent), radial-gradient(50% 60% at 78% 40%, var(--aurora-3), transparent);
  }
  .echo-disclaimer-card header { display: flex; align-items: flex-start; gap: 16px; padding: 28px 30px 18px; flex: none; }
  .echo-disclaimer-icon {
    display: grid; place-items: center; width: 46px; height: 46px; border-radius: 16px; flex: none;
    color: var(--shl-warning); background: color-mix(in srgb, var(--shl-warning) 16%, var(--shl-panel));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-warning) 30%, transparent), 0 14px 26px -12px color-mix(in srgb, var(--shl-warning) 60%, transparent);
    animation: shlBob 3.6s ease-in-out infinite;
  }
  .echo-disclaimer-icon svg { width: 22px; height: 22px; display: block; }
  .echo-disclaimer-heading { display: grid; gap: 4px; min-width: 0; }
  .echo-disclaimer-kicker { font: 700 10.5px var(--shl-mono); letter-spacing: 0.22em; text-transform: uppercase; color: var(--shl-accent-strong); }
  .echo-disclaimer-heading strong { font: 800 30px/1.05 var(--shl-font); letter-spacing: -0.05em; color: var(--shl-heading); }
  .echo-disclaimer-body {
    display: grid; gap: 16px; padding: 4px 30px 22px; flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain;
    scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--shl-subtle) 40%, transparent) transparent;
  }
  .echo-disclaimer-body::-webkit-scrollbar { width: 8px; }
  .echo-disclaimer-body::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--shl-subtle) 36%, transparent); border-radius: 99px; }
  .echo-disclaimer-intro { margin: 0; font: 500 14px/1.7 var(--shl-font); color: var(--theme-page-text, inherit); }
  .echo-disclaimer-rules { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
  .echo-disclaimer-rules li {
    display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 12px; align-items: start; margin: 0; padding: 12px 14px;
    border: 1px solid var(--shl-border); border-radius: 16px; background: var(--shl-well);
    font: 500 13px/1.65 var(--shl-font); color: var(--theme-page-text, inherit);
    animation: shlFieldIn 600ms var(--shl-out) backwards; animation-delay: calc(var(--ri, 0) * 60ms + 260ms);
  }
  .echo-disclaimer-rules li::before {
    content: attr(data-index); display: grid; place-items: center; width: 32px; height: 32px; border-radius: 11px;
    font: 700 12px/1 var(--shl-mono); color: var(--shl-accent-strong);
    background: color-mix(in srgb, var(--shl-accent-bg) 76%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shl-accent) 24%, transparent);
  }
  .echo-disclaimer-rules li:nth-child(1) { --ri: 0; } .echo-disclaimer-rules li:nth-child(2) { --ri: 1; }
  .echo-disclaimer-rules li:nth-child(3) { --ri: 2; } .echo-disclaimer-rules li:nth-child(4) { --ri: 3; }
  .echo-disclaimer-rules li:nth-child(5) { --ri: 4; } .echo-disclaimer-rules li:nth-child(6) { --ri: 5; }
  .echo-disclaimer-rules li:nth-child(n+7) { --ri: 6; }
  .echo-disclaimer-hint { margin: 0; font: 500 12.5px/1.5 var(--shl-font); color: var(--shl-muted); }
  .echo-disclaimer-field { display: grid; gap: 8px; }
  .echo-disclaimer-field label { font: 700 13px var(--shl-font); color: var(--shl-heading); }
  .echo-disclaimer-field input {
    width: 100%; height: 50px; padding: 0 16px; border: 1px solid var(--shl-field-border); border-radius: 15px;
    background: var(--shl-well); color: inherit; font: 600 16px var(--shl-font); letter-spacing: 0.02em;
    transition: border-color 180ms var(--shl-ease), box-shadow 180ms var(--shl-ease), background 180ms var(--shl-ease);
  }
  .echo-disclaimer-field input:focus { outline: none; background: var(--shl-panel); border-color: var(--shl-accent); box-shadow: 0 0 0 4px var(--shl-focus-ring); }
  .echo-disclaimer-error { margin: 0; min-height: 1.2em; color: var(--shl-danger); font: 550 12.5px/1.45 var(--shl-font); }
  .echo-disclaimer-error:empty { visibility: hidden; }
  .echo-disclaimer-card footer {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 16px 30px; flex: none;
    border-top: 1px solid var(--shl-border); background: color-mix(in srgb, var(--shl-well) 70%, transparent);
  }
  .echo-disclaimer-card footer .shl-btn { height: 44px; padding: 0 26px; font-size: 13.5px; }
  .echo-disclaimer-card footer .shl-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none !important; transform: none; }

  /* ---- Steam reminder + inject popup ---- */
  .echo-inject-popup, .echo-steam-reminder {
    position: fixed; right: 22px; z-index: 60; box-sizing: border-box; overflow: hidden;
    background: var(--shl-glass); color: var(--theme-page-text, inherit);
    border: 1px solid var(--shl-border); border-radius: 22px; font-family: var(--shl-font);
    box-shadow: inset 0 1px 0 var(--shl-hi), 0 40px 80px -30px rgb(var(--shl-sh) / 0.7);
    backdrop-filter: blur(22px) saturate(1.6); -webkit-backdrop-filter: blur(22px) saturate(1.6);
    animation: shlToastIn 620ms var(--shl-spring);
  }
  .echo-inject-popup {
    bottom: calc(var(--player-height, 112px) + 18px);
    display: flex; align-items: center; gap: 14px; min-width: 270px; padding: 14px 18px 14px 14px; pointer-events: none;
  }
  .echo-inject-popup.echo-inject-popup-out { animation: shinawaseInjectOut 260ms var(--shl-ease) forwards; }
  .echo-inject-popup-icon {
    display: grid; place-items: center; width: 42px; height: 42px; border-radius: 14px; flex: none; color: #fff;
    background: linear-gradient(150deg, var(--aurora-1), var(--shl-accent-solid)); box-shadow: 0 12px 24px -10px var(--shl-glow);
  }
  .echo-inject-popup-icon svg { width: 20px; height: 20px; display: block; }
  .echo-inject-popup-body { flex: 1; min-width: 0; }
  .echo-inject-popup-title { font: 740 14px/1.3 var(--shl-font); letter-spacing: -0.02em; }
  .echo-inject-popup-sub { margin-top: 2px; font-size: 12px; color: var(--shl-muted); }
  .echo-inject-popup-track { margin-top: 10px; height: 3px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--shl-subtle) 26%, transparent); }
  .echo-inject-popup-fill { display: block; height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, var(--aurora-1), var(--aurora-2)); animation: shinawaseInjectFill 3s linear forwards; }
  .echo-steam-reminder {
    bottom: calc(var(--player-height, 112px) + 18px); z-index: 280; width: min(440px, calc(100vw - 44px));
    display: grid; gap: 12px; padding: 18px 20px 16px 18px;
  }
  .echo-steam-reminder::before {
    content: ""; position: absolute; left: -20%; right: -20%; top: -70px; height: 150px; z-index: -1; opacity: 0.4; filter: blur(28px);
    background: radial-gradient(50% 60% at 30% 50%, var(--aurora-1), transparent), radial-gradient(50% 60% at 80% 40%, var(--aurora-2), transparent);
  }
  .echo-steam-reminder.is-leaving { animation: shinawaseInjectOut 260ms var(--shl-ease) forwards; pointer-events: none; }
  .echo-steam-reminder-head { display: flex; align-items: flex-start; gap: 12px; }
  .echo-steam-reminder-icon {
    display: grid; place-items: center; width: 40px; height: 40px; border-radius: 14px; flex: none; font-size: 18px; color: #fff;
    background: linear-gradient(150deg, var(--aurora-1), var(--shl-accent-solid)); box-shadow: 0 12px 24px -10px var(--shl-glow);
  }
  .echo-steam-reminder-title { font: 760 15px/1.3 var(--shl-font); letter-spacing: -0.02em; }
  .echo-steam-reminder-body { margin-top: 4px; font-size: 12.5px; color: var(--shl-muted); line-height: 1.55; }
  .echo-steam-reminder-hint { font: 500 11.5px var(--shl-mono); color: var(--shl-subtle); }
  .echo-steam-reminder-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }


  /* ---- Sidebar nav ---- */
  [data-echo-external-loader-group] .nav-icon-shell { display: grid; place-items: center; }
  [data-echo-external-loader-group] .nav-icon-shell svg { width: 21px; height: 21px; display: block; }
  /* Many registered mods outgrow the sidebar. Keep an internal scrollport so
     library + utility stay pinned, but NEVER paint a scrollbar on any sidebar
     surface (wheel/touch scroll still works). */
  .sidebar,
  .sidebar .sidebar-groups,
  .sidebar-groups > [data-echo-external-loader-group],
  .sidebar-groups > [data-echo-external-loader-group] .nav-list,
  .sidebar > [data-echo-external-loader-group],
  .sidebar > [data-echo-external-loader-group] .nav-list {
    scrollbar-width: none !important;
  }
  .sidebar::-webkit-scrollbar,
  .sidebar .sidebar-groups::-webkit-scrollbar,
  .sidebar-groups > [data-echo-external-loader-group]::-webkit-scrollbar,
  .sidebar-groups > [data-echo-external-loader-group] .nav-list::-webkit-scrollbar,
  .sidebar > [data-echo-external-loader-group]::-webkit-scrollbar,
  .sidebar > [data-echo-external-loader-group] .nav-list::-webkit-scrollbar {
    width: 0 !important;
    height: 0 !important;
    display: none !important;
  }
  .sidebar .sidebar-groups {
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* Never flex-shrink the loader group — a tall library list used to crush it
     to 1px (Shinawase Loader vanished). Size to content; if many mods, the
     nav-list becomes an internal scrollport (scrollbar still hidden).
     Zero utility's margin-top:auto so free space stays in .sidebar-groups. */
  .sidebar-groups:has(> [data-echo-external-loader-group]) > .sidebar-group--utility {
    margin-top: 0;
  }
  .sidebar-groups > [data-echo-external-loader-group] {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    min-height: auto;
    margin-top: auto; /* pin Loader + utility to the bottom when space allows */
    overflow: hidden;
  }
  /* No overscroll-behavior: contain on this list. ECHO scrolls the library in
     .sidebar-groups, or in the sibling .sidebar-main-groups once playlists are
     open. contain traps the wheel while the pointer is over Shinawase Loader
     (the list often does not overflow) and the sidebar above stops moving.
     onLoaderGroupWheel forwards whatever this list does not consume. */
  .sidebar-groups > [data-echo-external-loader-group] .nav-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: auto;
    max-height: min(42vh, 360px);
    overflow-x: hidden;
    overflow-y: auto;
  }
  /* Flat sidebar (echo-steam dropped .sidebar-groups): style our injected group ourselves. */
  .sidebar > [data-echo-external-loader-group] {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    min-height: auto;
    margin-top: 14px;
    overflow: hidden;
  }
  .sidebar > [data-echo-external-loader-group] .sidebar-group-label {
    margin: 0 0 6px; padding: 0 12px; font-size: 10.5px; font-weight: 680;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--theme-subtle-text, var(--theme-muted-text, #a0a4aa));
  }
  .sidebar > [data-echo-external-loader-group] .nav-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: auto;
    max-height: min(42vh, 360px);
    overflow-x: hidden;
    overflow-y: auto;
  }
  /* Loader sits above utility; collapse the spacer. */
  .sidebar:has(> [data-echo-external-loader-group]) > .sidebar-spacer {
    flex: 0 0 0;
    min-height: 0;
    height: 0;
    overflow: hidden;
  }
  .app-shell--sidebar-icon-only [data-echo-external-loader-group] .sidebar-group-label,
  .sidebar[data-icon-only] [data-echo-external-loader-group] .sidebar-group-label { display: none; }
  .app-shell--sidebar-icon-only .sidebar-groups > [data-echo-external-loader-group] .nav-list,
  .sidebar[data-icon-only] .sidebar-groups > [data-echo-external-loader-group] .nav-list,
  .app-shell--sidebar-icon-only .sidebar > [data-echo-external-loader-group] .nav-list,
  .sidebar[data-icon-only] > [data-echo-external-loader-group] .nav-list {
    max-height: none;
  }
  @media (max-width: 980px) {
    /* Keep Loader reachable in the short icon rail even when the library
       list overflows — stick the cluster above Settings at the bottom. */
    .sidebar-groups > [data-echo-external-loader-group] {
      position: sticky;
      bottom: 0;
      z-index: 3;
      margin-top: auto;
      background: var(--theme-sidebar-bg, var(--theme-panel-bg, transparent));
    }
    .sidebar-groups > [data-echo-external-loader-group] .nav-list,
    .sidebar > [data-echo-external-loader-group] .nav-list {
      max-height: none;
      overflow: visible;
    }
    .sidebar > [data-echo-external-loader-group] {
      flex-direction: column;
      margin-top: 0;
      align-items: stretch;
    }
    .sidebar > [data-echo-external-loader-group] .nav-list { flex-direction: column; min-width: 0; }
    .sidebar:has(> [data-echo-external-loader-group]) > .sidebar-spacer { display: none; }
  }


  /* Sidebar polish: an accent tick that slides in on the active entry, icons that lean in on hover. */
  [data-echo-external-loader-group] .nav-item { position: relative; }
  [data-echo-external-loader-group] .nav-item[data-active="true"]::before {
    content: ""; position: absolute; left: -7px; top: 24%; bottom: 24%; width: 3px; border-radius: 0 3px 3px 0; pointer-events: none;
    background: linear-gradient(180deg, var(--shl-accent), var(--aurora-2));
    box-shadow: 0 0 12px 1px var(--shl-glow); animation: shlTick 520ms var(--shl-spring);
  }
  [data-echo-external-loader-group] .nav-icon-shell svg { transition: transform 420ms var(--shl-spring); }
  [data-echo-external-loader-group] .nav-item:hover .nav-icon-shell svg { transform: scale(1.14) rotate(-6deg); }
  [data-echo-external-loader-group] .nav-item[data-active="true"] .nav-icon-shell { color: var(--shl-accent-strong); }
  [data-echo-external-loader-group] .sidebar-group-label {
    background: linear-gradient(90deg, currentColor 30%, var(--shl-accent) 60%, var(--aurora-2) 80%, currentColor);
    background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    animation: shlLabel 9s linear infinite;
  }
  /* ---- Titlebar Shiawase mark (CSS-only so React re-renders cannot wipe it) ---- */
  .app-titlebar-brand > strong { order: 0; }
  .app-titlebar-brand > strong + span { order: 1; }
  .app-titlebar-brand::after {
    content: "Shiawase";
    order: 2;
    display: inline-flex;
    height: 18px;
    align-items: center;
    align-self: center;
    padding: 0 3px;
    border: none;
    color: var(--shl-accent-strong, var(--theme-accent-text-strong, var(--theme-accent, #4b55e8)));
    background: linear-gradient(115deg,
      var(--shl-accent-strong, var(--theme-accent-text-strong, #4b55e8)) 15%,
      color-mix(in srgb, var(--shl-accent, var(--theme-accent, #4b55e8)) 72%, #a78bfa) 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    box-shadow: none;
    font-family: "Outfit", "Segoe UI", sans-serif;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.035em;
    white-space: nowrap;
    pointer-events: none;
  }
  .app-titlebar-brand > .app-titlebar-pro-slot,
  .app-titlebar-brand > .app-titlebar-version,
  .app-titlebar-brand > .app-titlebar-update,
  .app-titlebar-brand > button {
    order: 3;
  }
  html[data-shl-hide-titlebar-brand] .app-titlebar-brand::after { content: none; display: none; }



  /* ---- Density: compact ---- */
  [data-density="compact"] .shl-page { gap: 18px; padding-bottom: 96px; }
  [data-density="compact"] .shl-mast { padding-top: 36px; }
  [data-density="compact"] .shl-title { font-size: clamp(38px, 4.6vw, 62px); }
  [data-density="compact"] .shl-lede { margin-top: 12px; }
  [data-density="compact"] .echo-mod-row { min-height: 68px; padding: 10px 14px 10px 16px; gap: 14px; grid-template-columns: 42px minmax(0, 1fr) auto; border-radius: 16px; }
  [data-density="compact"] .echo-mod-icon { width: 42px; height: 42px; border-radius: 13px; font-size: 16px; }
  [data-density="compact"] .echo-mod-copy strong { font-size: 14px; }
  [data-density="compact"] .echo-mod-copy em { margin-top: 2px; }
  [data-density="compact"] .echo-mod-meta { margin-top: 6px; }
  [data-density="compact"] .echo-mod-list { gap: 8px; }
  [data-density="compact"] .shl-rack { padding: 12px 20px; }
  [data-density="compact"] .shl-rack-num b { font-size: 34px; }
  [data-density="compact"] .echo-mod-drop { min-height: 44px; padding: 8px 14px; }
  [data-density="compact"] .echo-store-card { min-height: 220px; --cover: 72px; }
  [data-density="compact"] .shl-hero, [data-density="compact"] .shl-hero-slides { min-height: 264px; }
  [data-density="compact"] .echo-appearance-row { min-height: 48px; }
  [data-density="compact"] .echo-status-chip { padding: 10px 13px; }
  [data-density="compact"] .shl-bento > .shl-card { padding: 18px 20px 20px; }

  /* ---- Keyframes ---- */
  @keyframes shlRise { from { opacity: 0; transform: translateY(26px) scale(0.985); } to { opacity: 1; transform: none; } }
  @keyframes shlChar { from { transform: translateY(112%) rotate(6deg); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes shlPing { 0% { transform: scale(1); opacity: 0.55; } 70%, 100% { transform: scale(2.8); opacity: 0; } }
  @keyframes shlRing { 0% { transform: scale(0.94); opacity: 0.8; } 70%, 100% { transform: scale(1.22); opacity: 0; } }
  @keyframes shlDriftA { from { transform: translate3d(-40px, 0, 0) scale(1); } to { transform: translate3d(90px, 40px, 0) scale(1.18); } }
  @keyframes shlDriftB { from { transform: translate3d(60px, 20px, 0) scale(1.1); } to { transform: translate3d(-80px, -10px, 0) scale(0.92); } }
  @keyframes shlDriftC { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(-90px, 50px, 0) scale(1.24); } }
  @keyframes shlParallax { to { transform: translateY(-90px); opacity: 0.2; } }
  @keyframes shlSpin { to { transform: rotate(360deg); } }
  @keyframes shlBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  @keyframes shlShake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }
  @keyframes shlCellIn { from { transform: scaleY(0.1); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }
  @keyframes shlCellPop { 0% { transform: scaleY(1); } 30% { transform: scaleY(1.7) scaleX(1.3); } 100% { transform: scaleY(1); } }
  @keyframes shlBreath { 0%, 100% { opacity: 0.7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.008); } }
  @keyframes shlBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
  @keyframes shlFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
  @keyframes shlTwinkle { 0%, 100% { opacity: 0.2; transform: scale(0.6); } 50% { opacity: 0.95; transform: scale(1.25); } }
  @keyframes shlCardIn { from { opacity: 0; transform: translateY(22px) scale(0.965); } to { opacity: 1; transform: none; } }
  @keyframes shlCardOut { to { opacity: 0; transform: scale(0.94) translateX(24px); } }
  @keyframes shlSweep { 0% { opacity: 0; transform: translateX(-100%); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateX(100%); } }
  @keyframes shlShimmer { from { background-position: 100% 0; } to { background-position: -120% 0; } }
  @keyframes shlSlideText { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  @keyframes shlIconIn { from { opacity: 0; transform: scale(0.6) rotate(-16deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
  @keyframes shlProgress { to { transform: scaleX(1); } }
  @keyframes shlBusy { from { background-position: 200% 0; } to { background-position: -100% 0; } }
  @keyframes shlBurst { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--shl-success) 60%, transparent); transform: scale(0.94); } 40% { transform: scale(1.06); } 100% { box-shadow: 0 0 0 16px transparent; transform: none; } }
  @keyframes shlPop { from { opacity: 0; transform: translateY(-6px) scale(0.96); } to { opacity: 1; transform: none; } }
  @keyframes shlPacket { 0% { left: 0; transform: scale(0.4); opacity: 0; } 12% { opacity: 1; transform: scale(1); } 88% { opacity: 1; transform: scale(1); } 100% { left: 100%; transform: scale(0.4); opacity: 0; } }
  @keyframes shlMarch { to { background-position: 26px 0; } }
  @keyframes shlFlash { 0% { background: color-mix(in srgb, var(--shl-accent) 22%, var(--shl-well)); } 100% { background: var(--shl-well); } }
  @keyframes shlLine { from { opacity: 0; transform: translateX(-8px); background: rgb(255 255 255 / 0.07); } to { opacity: 1; transform: none; background: transparent; } }
  @keyframes shlFieldIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes shlSheetIn { from { opacity: 0; transform: translateX(72px) scale(0.98); } to { opacity: 1; transform: none; } }
  @keyframes shlSheetOut { to { opacity: 0; transform: translateX(56px) scale(0.985); } }
  @keyframes shlToastIn { from { opacity: 0; transform: translateX(46px) scale(0.92); } to { opacity: 1; transform: none; } }
  @keyframes shlToastOut { to { opacity: 0; transform: translateX(36px) scale(0.94); } }
  @keyframes shlToastTime { to { transform: scaleX(0); } }
  @keyframes shlDraw { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
  @keyframes shlRowFlash { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--tint, var(--shl-accent)) 70%, transparent); } 30% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--tint, var(--shl-accent)) 40%, transparent); } 100% { box-shadow: 0 0 0 14px transparent; } }
  @keyframes shlTick { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  @keyframes shlLabel { to { background-position: -220% 0; } }
  @keyframes echoOverlayIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes echoOverlayOut { from { opacity: 1; } to { opacity: 0; } }
  @keyframes echoCardIn { from { opacity: 0; transform: translateY(26px) scale(0.94); } to { opacity: 1; transform: none; } }
  @keyframes echoCardOut { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(12px) scale(0.97); } }
  @keyframes shinawaseInjectOut { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(10px) scale(0.97); } }
  @keyframes shinawaseInjectFill { from { width: 0 } to { width: 100% } }

  /* ---- Motion + input preferences ---- */
  @media (prefers-reduced-motion: reduce) {
    .echo-external-mod-panel *, .echo-external-mod-panel *::before, .echo-external-mod-panel *::after,
    .echo-external-loader-panel *, .echo-external-loader-panel *::before, .echo-external-loader-panel *::after,
    .echo-external-mod-page *,
    .echo-toast, .echo-toast *, .echo-toast-stack *,
    .echo-config-overlay, .echo-config-overlay *,
    .echo-disclaimer-overlay, .echo-disclaimer-overlay *,
    .echo-inject-popup, .echo-inject-popup *, .echo-steam-reminder, .echo-steam-reminder * {
      animation-duration: 0.01ms !important; animation-delay: 0ms !important; animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important; scroll-behavior: auto !important;
    }
    .echo-mod-row:hover, .echo-status-chip:hover, .echo-icon-btn:hover, .echo-mod-icon, .echo-drop-icon { transform: none !important; }
  }
  @media (hover: none) { .echo-mod-row .echo-icon-btn { opacity: 1; } }
  @media (max-width: 1050px) {
    .shl-b-7, .shl-b-5 { grid-column: span 12; }
    .echo-status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .shl-prefs { grid-template-columns: minmax(0, 1fr); }
    .shl-rack { grid-template-columns: auto minmax(0, 1fr); }
    .shl-rack-hint { display: none; }
  }
  @media (max-width: 760px) {
    .shl-page { padding: 0 18px 100px; gap: 18px; }
    .shl-mast { padding-top: 34px; }
    .shl-toolbar { position: static; }
    .echo-mod-row { grid-template-columns: 52px minmax(0, 1fr); }
    .echo-mod-row-actions { grid-column: 1 / -1; justify-content: flex-end; padding-top: 4px; }
    .echo-status-grid { grid-template-columns: minmax(0, 1fr); }
    .echo-toast-stack { right: 12px; left: 12px; align-items: stretch; }
    .echo-toast { max-width: none; }
    .echo-config-overlay { padding: 8px; }
  }
`;
const accentCss = document.createElement('style');
accentCss.id = 'echo-loader-ui-accent';
const motionCss = document.createElement('style');
motionCss.id = 'echo-loader-ui-motion';
document.head.append(css, accentCss, motionCss);
document.documentElement.toggleAttribute('data-shl-hide-titlebar-brand', uiSettings.showTitlebarBrand === false);

const loaderSurfaces = '.echo-external-mod-panel, .echo-external-loader-panel, .echo-external-mod-page, .echo-config-overlay, .echo-disclaimer-overlay, .echo-steam-reminder, .echo-toast-stack, .echo-toast, .echo-inject-popup, [data-echo-external-loader-group]';
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
  window.setTimeout(() => el.remove(), 300);
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

const steamLaunchOptionsFor = (gameRoot) => {
  const root = String(gameRoot || cachedGameRoot || '').replace(/[\\/]+$/u, '');
  if (!root) return '';
  return '"' + root + '\\ECHO.modded.exe" %command%';
};

const copyText = async (text) => {
  const value = String(text || '');
  if (!value) throw new Error('empty');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {}
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, area.value.length);
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy_failed');
};

const setSteamCopyFeedback = (button, state) => {
  if (!button) return;
  const hint = button.querySelector('small');
  const idle = T.steamLaunchClickCopy || 'Click to copy';
  window.clearTimeout(steamCopyTimer);
  if (!state) {
    button.removeAttribute('data-copy-state');
    if (hint) hint.textContent = idle;
    return;
  }
  button.dataset.copyState = state;
  if (hint) {
    hint.textContent = state === 'ok'
      ? (T.steamLaunchCopied || 'Copied')
      : (T.steamLaunchCopyFail || 'Copy failed');
  }
  steamCopyTimer = window.setTimeout(() => {
    steamCopyTimer = 0;
    if (!button.isConnected) return;
    button.removeAttribute('data-copy-state');
    if (hint) hint.textContent = idle;
  }, 1800);
};

const bindSteamLaunchCopy = (button, optionsText) => {
  if (!button) return;
  const apply = (text) => {
    const value = String(text || '');
    button.dataset.launchOptions = value;
    const code = button.querySelector('code');
    if (code) code.textContent = value || '…\\ECHO.modded.exe" %command%';
  };
  apply(optionsText);
  button.onclick = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const value = button.dataset.launchOptions || steamLaunchOptionsFor(cachedGameRoot);
    if (!value) {
      setSteamCopyFeedback(button, 'err');
      return;
    }
    try {
      await copyText(value);
      setSteamCopyFeedback(button, 'ok');
    } catch {
      setSteamCopyFeedback(button, 'err');
    }
  };
};

const steamLaunchReminderEnabled = () => uiSettings.steamLaunchReminder === true;

const dismissSteamLaunchReminder = () => {
  const el = steamReminderEl;
  steamReminderEl = null;
  if (!el?.isConnected) return;
  if (reduceMotion() || uiSettings.animations === false) {
    el.remove();
    return;
  }
  el.classList.add('is-leaving');
  window.setTimeout(() => el.remove(), 220);
};

const setSteamLaunchReminderPreference = async (enabled) => {
  const next = enabled === true;
  await saveUiSettings({ steamLaunchReminder: next });
  syncSteamLaunchReminderToggle();
  if (!next) {
    steamReminderShown = true;
    dismissSteamLaunchReminder();
    return;
  }
  steamReminderShown = false;
  maybeShowSteamLaunchReminder();
};

const syncSteamLaunchReminderToggle = () => {
  const button = loaderPanel?.querySelector('[data-steam-reminder-toggle]');
  if (!button) return;
  button.setAttribute('aria-checked', steamLaunchReminderEnabled() ? 'true' : 'false');
};
let autoUpdateEnabled = true;
const syncAutoUpdateToggle = () => {
  const button = loaderPanel?.querySelector('[data-auto-update-toggle]');
  if (!button) return;
  button.setAttribute('aria-checked', autoUpdateEnabled ? 'true' : 'false');
};
const setAutoUpdatePreference = async (enabled) => {
  const result = await api('/api/settings/auto-update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: enabled !== false }),
  });
  autoUpdateEnabled = result.autoUpdate !== false;
  syncAutoUpdateToggle();
  toast(autoUpdateEnabled ? (T.autoUpdateOn || 'On') : (T.autoUpdateOff || 'Off'), 'success');
};

const showSteamLaunchReminder = () => {
  if (!steamLaunchReminderEnabled()) return;
  if (steamReminderShown || steamReminderEl?.isConnected) return;
  if (!document.querySelector('.app-shell')) return;
  document.querySelectorAll('.echo-steam-reminder').forEach((node) => node.remove());
  const el = document.createElement('div');
  el.className = 'echo-steam-reminder';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = [
    '<div class="echo-steam-reminder-head">',
    '<span class="echo-steam-reminder-icon" aria-hidden="true">喵</span>',
    '<div>',
    '<div class="echo-steam-reminder-title"></div>',
    '<div class="echo-steam-reminder-body"></div>',
    '</div>',
    '</div>',
    '<div class="echo-steam-reminder-hint"></div>',
    '<button type="button" class="echo-steam-launch-copy" data-steam-launch-copy>',
    '<code></code>',
    '<small></small>',
    '</button>',
    '<div class="echo-steam-reminder-actions">',
    '<button type="button" class="shl-btn shl-btn--sm" data-steam-disable></button>',
    '<button type="button" class="shl-btn shl-btn--sm shl-btn--primary" data-steam-dismiss></button>',
    '</div>',
  ].join('');
  el.querySelector('.echo-steam-reminder-title').textContent = T.steamLaunchTitle || '';
  el.querySelector('.echo-steam-reminder-body').textContent = T.steamLaunchBody || '';
  el.querySelector('.echo-steam-reminder-hint').textContent = T.steamLaunchHint || '';
  el.querySelector('[data-steam-dismiss]').textContent = T.steamLaunchDismiss || '知道了';
  el.querySelector('[data-steam-disable]').textContent = T.steamLaunchDisableDefault || '以后默认不显示';
  el.querySelector('[data-steam-dismiss]').onclick = () => {
    steamReminderShown = true;
    dismissSteamLaunchReminder();
  };
  el.querySelector('[data-steam-disable]').onclick = () => {
    void setSteamLaunchReminderPreference(false).catch((error) => toast(error.message, 'error'));
  };
  bindSteamLaunchCopy(el.querySelector('[data-steam-launch-copy]'), steamLaunchOptionsFor(cachedGameRoot));
  document.body.append(el);
  steamReminderEl = el;
  steamReminderShown = true;
};

const maybeShowSteamLaunchReminder = () => {
  if (!steamLaunchReminderEnabled()) return;
  showSteamLaunchReminder();
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
  let timer = 0;
  const arm = (ms) => { window.clearTimeout(timer); timer = window.setTimeout(() => dismissToast(el), ms); };
  el.addEventListener('mouseenter', () => window.clearTimeout(timer));
  el.addEventListener('mouseleave', () => arm(1800));
  el.addEventListener('click', () => { window.clearTimeout(timer); dismissToast(el); });
  stack.append(el);
  arm(3600);
};
window.__echoModToast = toast;

const api = async (path, options) => {
  const res = await fetch(base + path, { ...options, headers: { ...authHeaders, ...options?.headers } });
  const val = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(val.error || 'request failed (' + res.status + ')');
  return val;
};

const syncModsToolbar = () => {
  if (!modsPanel) return;
  const sortSelect = modsPanel.querySelector('[data-sort]');
  if (sortSelect && sortSelect.value !== currentSort) sortSelect.value = currentSort;
  modsPanel.querySelectorAll('[data-filter]').forEach((chip) => chip.classList.toggle('active', chip.dataset.filter === currentFilter));
  const layout = uiSettings.cardLayout === 'grid' ? 'grid' : 'list';
  modsPanel.querySelectorAll('[data-layout-set]').forEach((button) => button.classList.toggle('active', button.dataset.layoutSet === layout));
  syncAllSegs(modsPanel);
};

const applyUiSettings = () => {
  document.documentElement.toggleAttribute('data-shl-hide-titlebar-brand', uiSettings.showTitlebarBrand === false);
  const density = uiSettings.density === 'compact' ? 'compact' : 'comfortable';
  const panels = [modsPanel, marketPanel, loaderPanel, ...sidebarPages.values()];
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
  if (marketPanel && !marketPanel.hidden) renderMarketList();
  return { ...uiSettings };
};

const isLoaderSurface = (surface) => surface.classList.contains('echo-external-loader-panel') || surface.classList.contains('echo-external-mod-panel') || surface.classList.contains('echo-external-mod-page');
const hideNativeSurfaces = () => document.querySelectorAll('.page-surface:not([hidden])').forEach((surface) => {
  if (isLoaderSurface(surface)) return;
  if (surface.closest('aside.sidebar, .sidebar, .sidebar-groups')) return;
  surface.dataset.echoExternalHidden = 'true';
  surface.setAttribute('hidden', '');
});
const pageHost = () => document.querySelector('.app-shell') || document.body;
const attachPanel = (panel) => {
  const host = pageHost();
  if (panel && host && panel.parentElement !== host) host.append(panel);
  watchPanelEntrance(panel);
};
const restoreNativeSurfaces = () => document.querySelectorAll('[data-echo-external-hidden="true"]').forEach((surface) => {
  delete surface.dataset.echoExternalHidden;
  surface.removeAttribute('hidden');
});
const hideAllPanels = () => {
  if (modsPanel) modsPanel.hidden = true;
  if (marketPanel) marketPanel.hidden = true;
  if (loaderPanel) loaderPanel.hidden = true;
  sidebarPages.forEach((page) => { page.hidden = true; });
  activeSidebar = null;
  [loaderButton, modsButton, marketButton].forEach((button) => {
    if (!button) return;
    button.setAttribute('aria-current', 'false');
    button.dataset.active = 'false';
  });
  sidebarButtons.forEach((button) => { button.setAttribute('aria-current', 'false'); button.dataset.active = 'false'; });
};
let lastFrameAt = 0;
const markFrame = () => {
  lastFrameAt = Date.now();
  window.requestAnimationFrame(markFrame);
};
window.requestAnimationFrame(markFrame);
const framesStalled = (windowMs = 200) => Boolean(lastFrameAt) && Date.now() - lastFrameAt > windowMs;
const stuckPanelAnimations = (panel) => {
  const stuck = [];
  let animations = [];
  try { animations = panel.getAnimations({ subtree: true }); } catch { return stuck; }
  for (const animation of animations) {
    const effect = animation.effect;
    const timing = effect && effect.getComputedTiming ? effect.getComputedTiming() : null;
    if (!timing || timing.iterations === Infinity) continue;
    if (effect && effect.pseudoElement) continue;
    const state = animation.playState;
    if (state === 'finished' || state === 'idle') continue;
    if (state === 'running' && (Number(animation.currentTime) || 0) > 0) continue;
    const target = effect && effect.target;
    if (target) {
      const opacity = Number(getComputedStyle(target).opacity);
      if (Number.isFinite(opacity) && opacity > 0.05) continue;
    }
    stuck.push(animation);
  }
  return stuck;
};
const canFinish = (animation) => {
  const effect = animation.effect;
  if (!effect || typeof effect.getComputedTiming !== 'function') return false;
  if (animation.playbackRate === 0) return false;
  return effect.getComputedTiming().endTime !== Infinity;
};
const releasePanelEntrance = (panel) => {
  if (!panel || typeof panel.getAnimations !== 'function') return;
  const stuck = stuckPanelAnimations(panel);
  if (!stuck.length) return;
  if (framesStalled()) {
    for (const animation of stuck) {
      if (!canFinish(animation)) continue;
      try { animation.finish(); } catch {}
    }
    return;
  }
  for (const animation of stuck) {
    try { animation.play(); } catch {}
  }
  window.setTimeout(() => {
    if (!framesStalled(80)) return;
    for (const animation of stuck) {
      const state = animation.playState;
      if (state === 'finished' || state === 'idle') continue;
      if (animation.startTime !== null && (Number(animation.currentTime) || 0) > 0) continue;
      if (!canFinish(animation)) continue;
      try { animation.finish(); } catch {}
    }
  }, 120);
};
const watchPanelEntrance = (panel) => {
  if (!panel || typeof MutationObserver !== 'function') return;
  if (panel.dataset.shlEntranceWatch === 'true') return;
  panel.dataset.shlEntranceWatch = 'true';
  const observer = new MutationObserver(() => {
    if (panel.hidden) return;
    void panel.offsetHeight;
    releasePanelEntrance(panel);
  });
  observer.observe(panel, { childList: true, subtree: true });
};
const showPanel = (panel, button) => {
  attachPanel(panel);
  hideAllPanels();
  hideNativeSurfaces();
  panel.hidden = false;
  void panel.offsetHeight;
  releasePanelEntrance(panel);
  window.requestAnimationFrame(() => syncAllSegs(panel));
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

// ECHO also routes from entry points the .nav-item click hook never sees
// (titlebar actions, shortcuts, player controls). Watch the surface host: when
// a native page-surface becomes visible while one of our pages is open, yield
// to it — hide our panels and drop the hidden markers WITHOUT unhiding, since
// ECHO's router owns surface visibility again and restoring here would stack
// the previous native page under the new one.
const loaderPageActive = () => Boolean(
  (loaderPanel && !loaderPanel.hidden) || (modsPanel && !modsPanel.hidden) || (marketPanel && !marketPanel.hidden)
  || (activeSidebar && sidebarPages.get(activeSidebar) && !sidebarPages.get(activeSidebar).hidden));
// subtree childList also fires for unrelated UI churn (list rerenders, player
// updates); only the mutations below can change which page-surface is visible,
// so anything else skips the full surface rescan.
const surfaceMutationRelevant = (records) => records.some((record) => {
  if (record.type === 'attributes') return record.target?.classList?.contains('page-surface') === true;
  for (const node of record.addedNodes) {
    if (node?.classList?.contains('page-surface')) return true;
  }
  return false;
});
const onSurfaceMutation = (records) => {
  if (!loaderPageActive()) return;
  if (!surfaceMutationRelevant(records)) return;
  const nativeVisible = [...document.querySelectorAll('.page-surface:not([hidden])')]
    .some((surface) => !isLoaderSurface(surface) && !surface.closest('aside.sidebar, .sidebar, .sidebar-groups'));
  if (!nativeVisible) return;
  hideAllPanels();
  document.querySelectorAll('[data-echo-external-hidden="true"]').forEach((surface) => { delete surface.dataset.echoExternalHidden; });
};
const surfaceObserver = new MutationObserver(onSurfaceMutation);
let surfaceObserverTarget = null;
const observeSurfaces = () => {
  const host = pageHost();
  if (!host || host === surfaceObserverTarget) return;
  surfaceObserver.disconnect();
  surfaceObserver.observe(host, { childList: true, attributes: true, attributeFilter: ['hidden'], subtree: true });
  surfaceObserverTarget = host;
};

const navSvg = (paths) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
const loaderNavIcon = navSvg('<path d="M12 3 4.8 7.2v9.6L12 21l7.2-4.2V7.2L12 3z"/><circle cx="12" cy="12" r="2.35"/><path d="M12 3v6.4"/>');
const modsNavIcon = navSvg('<rect x="3.2" y="3.2" width="7.6" height="7.6" rx="1.6"/><rect x="13.2" y="3.2" width="7.6" height="7.6" rx="1.6"/><rect x="3.2" y="13.2" width="7.6" height="7.6" rx="1.6"/><rect x="13.2" y="13.2" width="7.6" height="7.6" rx="1.6"/>');
const marketNavIcon = navSvg('<path d="M7.2 8.5h9.6l-.9 10c-.12 1.18-1.1 2.08-2.3 2.08H10.4c-1.2 0-2.18-.9-2.3-2.08L7.2 8.5z"/><path d="M9.5 8.5V6.7A2.5 2.5 0 0 1 12 4.2a2.5 2.5 0 0 1 2.5 2.5v1.8"/><path d="M10.2 12.6v2.6M13.8 12.6v2.6"/>');

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

// The loader nav-list scrolls on its own. ECHO scrolls the library on an ancestor
// (.sidebar-groups / .sidebar) or, with playlists open, the sibling
// .sidebar-main-groups. Once this list cannot consume the wheel, forward it there.
const loaderGroupWheelTarget = (group, delta, eventTarget) => {
  if (!group || !Number.isFinite(delta) || delta === 0) return null;
  const canScrollBy = (element) => {
    if (!element || element.nodeType !== 1) return false;
    let overflow = '';
    try { overflow = getComputedStyle(element).overflowY; } catch { return false; }
    if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'overlay') return false;
    if (element.scrollHeight <= element.clientHeight + 1) return false;
    if (delta < 0) return element.scrollTop > 0;
    return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  };
  let node = eventTarget?.nodeType === 1 ? eventTarget : eventTarget?.parentElement || null;
  while (node && node !== group) {
    if (canScrollBy(node)) return null;
    node = node.parentElement;
  }
  const sidebar = group.closest?.('aside.sidebar, .sidebar') || null;
  const mainGroups = sidebar?.querySelector?.('.sidebar-main-groups') || null;
  const candidates = [group.parentElement, mainGroups, sidebar];
  for (const candidate of candidates) {
    if (!candidate || candidate === group || group.contains(candidate)) continue;
    if (canScrollBy(candidate)) return candidate;
  }
  return null;
};
const onLoaderGroupWheel = (event) => {
  if (event.defaultPrevented || event.ctrlKey) return;
  const raw = Number(event.deltaY) || 0;
  const pixels = event.deltaMode === 1 ? raw * 16 : event.deltaMode === 2 ? raw * (event.currentTarget?.clientHeight || 0) : raw;
  const target = loaderGroupWheelTarget(event.currentTarget, pixels, event.target);
  if (!target) return;
  target.scrollTop += pixels;
  event.preventDefault();
};
const bindLoaderGroupWheel = (group) => {
  if (!group || group.dataset.echoExternalWheel === 'true') return;
  group.dataset.echoExternalWheel = 'true';
  group.addEventListener('wheel', onLoaderGroupWheel, { capture: true, passive: false });
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
    // Keep utility (Settings) pinned below us — never append after it or the
    // loader collapses under contain:paint when the window is short.
    const utility = groups.querySelector(':scope > .sidebar-group--utility');
    if (group.parentElement !== groups || group.nextElementSibling !== (utility || null)) {
      if (utility) groups.insertBefore(group, utility);
      else groups.append(group);
    }
  } else {
    const anchor = flatSidebar.querySelector(':scope > .sidebar-spacer') || flatSidebar.querySelector(':scope > .utility-nav');
    if (group.parentElement !== flatSidebar || (anchor && group.nextElementSibling !== anchor)) {
      if (anchor) flatSidebar.insertBefore(group, anchor);
      else flatSidebar.append(group);
    }
  }
  loaderGroup = group;
  loaderNav = group.querySelector('.nav-list');
  bindLoaderGroupWheel(group);
  return loaderNav;
};

const ensureLoaderButtons = (nav) => {
  if (!nav) return null;
  loaderButton = makeNavButton(nav, 'loader', T.loader, loaderNavIcon, openLoader);
  marketButton = makeNavButton(nav, 'market', T.market || 'Mod Market', marketNavIcon, openMarket);
  modsButton = makeNavButton(nav, 'mods', T.mods, modsNavIcon, openMods);
  return modsButton;
};

const mountPage = (className, html) => {
  const panel = document.createElement('section');
  panel.className = className;
  panel.innerHTML = html;
  (document.querySelector('.app-shell') || document.body).append(panel);
  return panel;
};

const refreshSteamLaunchUi = (gameRoot) => {
  if (gameRoot) cachedGameRoot = String(gameRoot);
  const options = steamLaunchOptionsFor(cachedGameRoot);
  loaderPanel?.querySelectorAll('[data-steam-launch-copy]').forEach((node) => bindSteamLaunchCopy(node, options));
};

// Live link diagram (Loader <-> ECHO) + port tiles. Tiles are built once and
// patched in place so values that change flash instead of the grid rebuilding.
const paintLink = (status, echo, echoLabel) => {
  const root = loaderPanel;
  if (!root) return;
  const echoOk = Boolean(echo.selected && echo.version);
  const synced = Boolean(echo.runtime?.current);
  const linkTone = echoOk ? (synced ? 'ok' : 'warn') : 'off';
  const set = (selector, tone, text) => {
    const node = root.querySelector(selector);
    if (!node) return null;
    node.dataset.tone = tone;
    if (text !== undefined) { const label = node.querySelector('[data-text]'); if (label) label.textContent = text; }
    return node;
  };
  set('[data-node="loader"]', 'ok');
  set('[data-node="echo"]', linkTone);
  set('[data-wire]', linkTone);
  root.querySelectorAll('[data-live]').forEach((dot) => { dot.dataset.tone = linkTone; });
  const loaderSub = root.querySelector('[data-node="loader"] small');
  if (loaderSub) loaderSub.textContent = 'v' + (status.loaderVersion || LOADER_VERSION);
  const echoSub = root.querySelector('[data-node="echo"] small');
  if (echoSub) echoSub.textContent = echoLabel;
  const wireLabel = root.querySelector('[data-wire] em');
  if (wireLabel) wireLabel.textContent = 'CDP :' + status.debugPort;
  set('[data-sat="inspect"]', status.inspectPort ? 'ok' : 'off').querySelector('b').textContent = ':' + status.inspectPort;
  set('[data-sat="native"]', status.nativeHost ? 'ok' : 'off').querySelector('b').textContent = status.nativeHost ? ':' + status.nativePort : T.off;
  set('[data-sat="runtime"]', synced ? 'ok' : 'warn').querySelector('b').textContent = synced ? (T.runtimeCurrent || 'aligned') : (T.runtimeStale || 'needs sync');
  set('[data-sat="debug"]', status.debugMode ? 'warn' : 'off').querySelector('b').textContent = status.debugMode ? T.on : T.off;
};

const renderStatus = async () => {
  if (!loaderPanel || loaderPanel.hidden || document.hidden) return;
  try {
    const status = await api('/api/status');
    autoUpdateEnabled = status.autoUpdate !== false;
    syncAutoUpdateToggle();
    const grid = loaderPanel.querySelector('[data-status-grid]');
    const echo = status.echoTarget || {};
    cachedGameRoot = status.gameRoot || cachedGameRoot;
    refreshSteamLaunchUi(cachedGameRoot);
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
    if (grid.childElementCount !== rows.length) {
      grid.replaceChildren(...rows.map((_, index) => {
        const chip = document.createElement('div');
        chip.className = 'echo-status-chip';
        chip.style.setProperty('--i', String(index));
        chip.innerHTML = '<small><span class="echo-status-dot"></span><span data-label></span></small><strong></strong>';
        return chip;
      }));
    }
    rows.forEach(([label, value, tone], index) => {
      const chip = grid.children[index];
      const strong = chip.querySelector('strong');
      chip.dataset.tone = tone;
      chip.querySelector('[data-label]').textContent = label;
      if (strong.textContent !== value) {
        const first = strong.textContent === '';
        strong.textContent = value;
        if (!first && !motionOff()) {
          chip.classList.remove('is-changed');
          void chip.offsetWidth;
          chip.classList.add('is-changed');
        }
      }
    });
    paintLink(status, echo, echoLabel);
    const debugLabel = loaderPanel.querySelector('[data-debug-label]');
    if (debugLabel) debugLabel.textContent = status.debugMode ? T.debugOff : T.debugOn;
  } catch (error) {
    toast(error.message, 'error');
  }
};

let consoleTimer = 0;
let consolePaused = false;
let lastLogText = '';
const consoleMaxLines = 400; // keep the live console from growing without bound
const consoleStick = (out) => out && (out.scrollHeight - out.scrollTop - out.clientHeight < 32);
// Log rows are parsed into time / level / message so the terminal can colour
// them; the raw text is kept on the row for copy.
const logRowPattern = /^\[?(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})[\d.]*Z?)\]?\s*\[(\w+)\]\s*(.*)$/u;
const buildLogLine = (row) => {
  const line = document.createElement('div');
  line.dataset.raw = row;
  const match = logRowPattern.exec(row);
  if (match) {
    const level = match[3].toUpperCase();
    line.className = 'lv-' + level.toLowerCase();
    const time = document.createElement('time');
    time.textContent = match[2];
    const tag = document.createElement('b');
    tag.textContent = level;
    const message = document.createElement('span');
    message.textContent = match[4];
    line.append(time, tag, message);
  } else {
    if (/error|fail/i.test(row)) line.className = 'echo-debug-err';
    line.textContent = row;
  }
  return line;
};
const consoleAppend = (text, className, forceScroll = false) => {
  const out = loaderPanel?.querySelector('[data-console-out]');
  if (!out || !text) return;
  const stick = forceScroll || consoleStick(out);
  const line = document.createElement('div');
  line.dataset.raw = text;
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
  visible.forEach((row) => fragment.append(buildLogLine(row)));
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
  'market               plugin market catalog',
  'clear                clear this console',
].join('\n');
const runDebugCommand = async (command) => {
  const line = String(command || '').trim();
  if (!line) return;
  consoleAppend('> ' + line, 'echo-debug-in', true);
  if (line === 'clear' || line === 'cls') {
    try { await api('/api/logs', { method: 'POST' }); } catch { /* ignore */ }
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
  const showMarket = Boolean(marketPanel && !marketPanel.hidden);
  loaderPanel?.remove();
  modsPanel?.remove();
  marketPanel?.remove();
  loaderPanel = null;
  modsPanel = null;
  marketPanel = null;
  window.clearInterval(statusTimer);
  window.clearInterval(consoleTimer);
  lastLogText = '';
  ensureLoaderButtons(loaderNav);
  if (showMarket) await openMarket();
  else if (showMods) await openMods();
  else await openLoader();
};

const applyLocale = async () => {
  const next = (typeof LOADER_LOCALE !== 'undefined' && LOADER_LOCALE === 'en') ? 'zh' : 'en';
  await api('/api/locale', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: next }) });
  if (typeof LOADER_LOCALE !== 'undefined') LOADER_LOCALE = next;
  if (typeof LOCALES !== 'undefined' && LOCALES[next]) T = LOCALES[next];
  await rebuildUi();
};

const ACCENT_PRESETS = ['#4b55e8', '#7c5cff', '#d946ef', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4'];
// Appearance controls are built once and then only re-synced, so the segmented
// thumb and swatch ring animate between states instead of snapping.
const buildAppearance = (grid) => {
  const fail = (error) => toast(error.message, 'error');
  const row = (label, control) => {
    const el = document.createElement('div');
    el.className = 'echo-appearance-row';
    const caption = document.createElement('strong');
    caption.textContent = label;
    el.append(caption, control);
    return el;
  };
  const segControl = (key, options, iconOnly) => {
    const seg = document.createElement('div');
    seg.className = 'shl-seg' + (iconOnly ? ' shl-seg--icons' : '');
    seg.dataset.seg = '';
    seg.dataset.pref = key;
    seg.innerHTML = '<i class="shl-seg-thumb"></i>';
    options.forEach(([value, label, icon]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.value = value;
      button.innerHTML = (icon || '') + '<span></span>';
      button.querySelector('span').textContent = label;
      if (iconOnly) button.title = label;
      button.onclick = () => void saveUiSettings({ [key]: value }).catch(fail);
      seg.append(button);
    });
    watchSeg(seg);
    return seg;
  };
  const switchControl = (key, label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'echo-switch';
    button.dataset.pref = key;
    button.setAttribute('role', 'switch');
    if (label) button.setAttribute('aria-label', label);
    button.innerHTML = '<span class="echo-switch-thumb"></span>';
    button.onclick = () => void saveUiSettings({ [key]: uiSettings[key] !== true }).catch(fail);
    return button;
  };
  const accentControl = () => {
    const wrap = document.createElement('span');
    wrap.className = 'echo-appearance-color';
    ACCENT_PRESETS.forEach((hex) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'shl-swatch';
      swatch.dataset.value = hex;
      swatch.style.setProperty('--c', hex);
      swatch.title = hex;
      swatch.setAttribute('aria-label', hex);
      swatch.onclick = () => void saveUiSettings({ accentColor: hex }).catch(fail);
      wrap.append(swatch);
    });
    const custom = document.createElement('label');
    custom.className = 'shl-swatch shl-swatch--custom';
    custom.dataset.custom = '';
    custom.title = T.accentColor;
    const input = document.createElement('input');
    input.type = 'color';
    input.onchange = () => void saveUiSettings({ accentColor: input.value }).catch(fail);
    custom.append(input);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'shl-reset';
    reset.dataset.reset = '';
    reset.textContent = T.accentReset || 'Reset';
    reset.onclick = () => void saveUiSettings({ accentColor: '' }).catch(fail);
    wrap.append(custom, reset);
    return wrap;
  };
  grid.replaceChildren(
    row(T.showTitlebarBrand, switchControl('showTitlebarBrand', T.showTitlebarBrand)),
    row(T.density, segControl('density', [['comfortable', T.densityComfortable], ['compact', T.densityCompact]])),
    row(T.cardLayout, segControl('cardLayout', [['list', T.layoutList, iconRows], ['grid', T.layoutGrid, iconGrid]])),
    row(T.accentColor, accentControl()),
    row(T.animations, switchControl('animations')),
    row(T.showDescriptions, switchControl('showModDescriptions')),
    row(T.showVersions, switchControl('showModVersions')),
    row(T.showIds, switchControl('showModIds')),
    row(T.rememberFilters, switchControl('rememberFilters')),
  );
};
const renderAppearance = () => {
  const grid = loaderPanel?.querySelector('[data-appearance]');
  if (!grid) return;
  if (grid.dataset.built !== 'true') {
    buildAppearance(grid);
    grid.dataset.built = 'true';
  }
  grid.querySelectorAll('.echo-switch[data-pref]').forEach((button) => {
    button.setAttribute('aria-checked', uiSettings[button.dataset.pref] === true ? 'true' : 'false');
  });
  grid.querySelectorAll('[data-seg][data-pref]').forEach((seg) => {
    const current = String(uiSettings[seg.dataset.pref]);
    seg.querySelectorAll(':scope > button').forEach((button) => button.classList.toggle('active', button.dataset.value === current));
    syncSeg(seg);
  });
  const accent = /^#[0-9a-f]{6}$/i.test(uiSettings.accentColor || '') ? uiSettings.accentColor.toLowerCase() : '';
  let matched = false;
  grid.querySelectorAll('.shl-swatch[data-value]').forEach((swatch) => {
    const on = Boolean(accent) && swatch.dataset.value === accent;
    matched = matched || on;
    swatch.classList.toggle('is-on', on);
  });
  const custom = grid.querySelector('[data-custom]');
  if (custom) {
    custom.classList.toggle('is-on', Boolean(accent) && !matched);
    custom.style.setProperty('--c', accent || '#7c5cff');
    const input = custom.querySelector('input');
    if (input) input.value = accent || '#4b55e8';
  }
  const reset = grid.querySelector('[data-reset]');
  if (reset) reset.hidden = !accent;
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
  const btn = (attrs, icon, label, cls = '') => '<button type="button" class="shl-btn ' + cls + '" ' + attrs + '>' + icon + '<span>' + label + '</span></button>';
  loaderPanel = mountPage('echo-external-loader-panel page-surface', `
    <div class="shl-page echo-loader-layout">
      ${mastHtml({
        kicker: T.loaderKicker,
        pill: '<span class="shl-pill">v' + escapeHtml(LOADER_VERSION) + '</span>',
        title: T.loaderTitle,
        lede: T.loaderHint,
        copyExtra: '<div class="shl-mast-actions" style="padding:24px 0 0">'
          + btn('data-action="locale"', iconTranslate, T.changeLanguage)
          + btn('data-action="perf"', iconGauge, T.exportPerf)
          + btn('data-action="debug"', iconBug, '<span data-debug-label>' + T.debugOn + '</span>')
          + '</div>',
        aside: `
          <div class="shl-card shl-link-card" aria-hidden="false">
            <div class="shl-link" data-link>
              <div class="shl-node" data-node="loader" data-tone="ok">
                <div class="shl-node-disc">${iconCube}</div>
                <b>${escapeHtml(T.loader)}</b><small>v${escapeHtml(LOADER_VERSION)}</small>
              </div>
              <div class="shl-wire" data-wire data-tone="off"><em>CDP</em><i></i><i></i><i></i></div>
              <div class="shl-node" data-node="echo" data-tone="off">
                <div class="shl-node-disc">${iconPulse}</div>
                <b>${escapeHtml(T.echoHost || 'ECHO')}</b><small>…</small>
              </div>
            </div>
            <div class="shl-sats">
              <span class="shl-sat" data-sat="inspect" data-tone="off"><i></i>${escapeHtml(T.inspect)} <b>–</b></span>
              <span class="shl-sat" data-sat="native" data-tone="off"><i></i>${escapeHtml(T.native)} <b>–</b></span>
              <span class="shl-sat" data-sat="runtime" data-tone="off"><i></i>${escapeHtml(T.runtime || 'runtime')} <b>–</b></span>
              <span class="shl-sat" data-sat="debug" data-tone="off"><i></i>debug <b>–</b></span>
            </div>
          </div>`,
      })}
      <div class="shl-bento">
        <section class="shl-card shl-b-12">
          <h2 class="shl-card-title">${iconPulse}${T.status}</h2>
          <div class="echo-status-grid" data-status-grid></div>
        </section>
        <section class="shl-card shl-spot shl-b-7" data-steam-banner>
          <h2 class="shl-card-title">${iconTerminal}${T.steamLaunchSection || 'Steam launch options'}</h2>
          <div class="shl-lines">
            <p class="shl-strong">${T.steamLaunchTitle || ''}</p>
            <p>${T.steamLaunchBody || ''}</p>
            <button type="button" class="echo-steam-launch-copy" data-steam-launch-copy title="${T.steamLaunchClickCopy || 'Click to copy'}">
              <code></code>
              <span class="shl-copy-ico">${iconCopy}</span>
              <small>${T.steamLaunchClickCopy || 'Click to copy'}</small>
            </button>
            <p class="echo-steam-banner-hint">${T.steamLaunchHint || ''}</p>
            <div class="shl-toggle">
              <div>
                <strong>${T.steamLaunchReminderToggle || '启动时弹出提示'}</strong>
                <span>${T.steamLaunchReminderHint || ''}</span>
              </div>
              <button type="button" class="echo-switch" role="switch" data-steam-reminder-toggle aria-checked="false">
                <span class="echo-switch-thumb"></span>
              </button>
            </div>
          </div>
        </section>
        <section class="shl-card shl-spot shl-b-5">
          <h2 class="shl-card-title">${iconRefresh}${T.autoUpdateSection || 'Updates'}</h2>
          <div class="shl-lines">
            <p>${T.autoUpdateHint || ''}</p>
            <div class="shl-toggle">
              <div><strong>${T.autoUpdateToggle || 'Check GitHub updates on launch'}</strong></div>
              <button type="button" class="echo-switch" role="switch" data-auto-update-toggle aria-checked="true">
                <span class="echo-switch-thumb"></span>
              </button>
            </div>
            ${btn('data-action="update"', iconBolt, T.updateLoader, 'shl-btn--primary')}
          </div>
        </section>
        <section class="shl-card shl-b-12">
          <h2 class="shl-card-title">${iconPalette}${T.appearance}</h2>
          <p class="echo-appearance-hint">${T.appearanceHint}</p>
          <div class="shl-prefs" data-appearance></div>
          <div class="echo-appearance-actions">
            ${btn('data-action="export-settings"', iconDownload, T.exportSettings)}
            ${btn('data-action="import-settings"', iconUpload, T.importSettings)}
            <input type="file" accept="application/json,.json" data-settings-file hidden>
          </div>
        </section>
        <section class="shl-card shl-b-12">
          <h2 class="shl-card-title">${iconTerminal}${T.debugConsole}</h2>
          <div class="echo-debug-console">
            <div class="echo-debug-toolbar">
              <span class="echo-debug-toolbar-left">
                <span class="echo-debug-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                <span>${T.consoleHint}</span>
              </span>
              <span class="echo-debug-actions">
                <button class="echo-debug-clear" data-action="console-copy" title="${T.consoleCopy}">${T.consoleCopy}</button>
                <button class="echo-debug-clear" data-action="console-clear">${T.consoleClear}</button>
              </span>
            </div>
            <pre class="echo-debug-output" data-console-out></pre>
            <form class="echo-debug-form" data-console-form>
              <span>&#10095;</span>
              <input data-console-in spellcheck="false" autocomplete="off" placeholder="help">
            </form>
          </div>
        </section>
      </div>
    </div>
  `);
  bindSpotlight(loaderPanel);
  showPanel(loaderPanel, loaderButton);
  loaderPanel.querySelector('[data-action="locale"]').onclick = () => void applyLocale().catch((error) => toast(error.message, 'error'));
  loaderPanel.querySelector('[data-action="perf"]').onclick = async () => {
    const report = await api('/api/perf', { method: 'POST' });
    toast(T.perfReady + ' · ' + (report.file || ''), 'success');
  };
  loaderPanel.querySelector('[data-action="update"]').onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.classList.add('shl-btn--spin');
    try {
      const result = await api('/api/update', { method: 'POST' });
      if (!result.ok) throw new Error(result.error || T.updateFailed);
      if (result.updated && result.restart) toast(T.updateApplied + ' v' + (result.remote || ''), 'success');
      else if (result.updated) toast(T.updatePackages + (result.remote ? ' · ' + result.remote : ''), 'success');
      else toast(T.updateCurrent + (result.remote ? ' v' + result.remote : ''), 'success');
    } catch (error) { toast(T.updateFailed + ': ' + error.message, 'error'); }
    button.disabled = false;
    button.classList.remove('shl-btn--spin');
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
  loaderPanel.querySelector('[data-action="console-clear"]').onclick = async () => {
    try { await api('/api/logs', { method: 'POST' }); } catch (error) { toast(error.message, 'error'); }
    loaderPanel.querySelector('[data-console-out]')?.replaceChildren();
    lastLogText = '';
  };
  loaderPanel.querySelector('[data-action="console-copy"]').onclick = async () => {
    const out = loaderPanel.querySelector('[data-console-out]');
    const text = out ? [...out.children].map((row) => row.dataset.raw || row.textContent).join('\n') : '';
    if (!text.trim()) { toast(T.consoleNoLog || '没有可复制的日志', 'info'); return; }
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; }
    } catch { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch { ok = false; }
    }
    toast(ok ? (T.consoleCopied || '已复制') : (T.consoleCopyFail || '复制失败'), ok ? 'success' : 'error');
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
  refreshSteamLaunchUi(cachedGameRoot);
  syncSteamLaunchReminderToggle();
  const reminderToggle = loaderPanel.querySelector('[data-steam-reminder-toggle]');
  if (reminderToggle) {
    reminderToggle.onclick = () => {
      void setSteamLaunchReminderPreference(!steamLaunchReminderEnabled()).catch((error) => toast(error.message, 'error'));
    };
  }
  syncAutoUpdateToggle();
  const autoUpdateToggle = loaderPanel.querySelector('[data-auto-update-toggle]');
  if (autoUpdateToggle) {
    autoUpdateToggle.onclick = () => {
      void setAutoUpdatePreference(!autoUpdateEnabled).catch((error) => toast(error.message, 'error'));
    };
  }
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
  if (!isSearch) {
    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'shl-btn shl-btn--primary';
    cta.innerHTML = iconUpload + '<span></span>';
    cta.querySelector('span').textContent = T.importMod;
    cta.onclick = () => modsPanel?.querySelector('[data-file]')?.click();
    empty.append(cta);
  }
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

const paintModCounts = () => {
  if (!modsPanel) return;
  const active = modsCache.filter((item) => item.enabled).length;
  modsPanel.querySelectorAll('[data-count-all]').forEach((node) => tweenNumber(node, modsCache.length));
  modsPanel.querySelectorAll('[data-count-active]').forEach((node) => tweenNumber(node, active));
  modsPanel.querySelectorAll('[data-count-inactive]').forEach((node) => tweenNumber(node, modsCache.length - active));
};

// The power rail: one cell per installed mod, lit while it is enabled.
const renderRack = () => {
  const rail = modsPanel?.querySelector('[data-rail]');
  if (!rail) return;
  const existing = new Map([...rail.children].map((cell) => [cell.dataset.cell, cell]));
  const ordered = [...modsCache].sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id)));
  const cells = ordered.map((item, index) => {
    let cell = existing.get(item.id);
    const on = item.enabled === true;
    if (!cell) {
      cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'shl-cell';
      cell.dataset.cell = item.id;
      cell.dataset.on = String(on);
      applyTint(cell, item.id, item.iconDataUrl);
      cell.onclick = () => {
        const card = modsPanel?.querySelector('[data-mod-list] > [data-id="' + String(item.id).replace(/"/g, '') + '"]');
        if (!card) return;
        card.scrollIntoView({ block: 'center', behavior: motionOff() ? 'auto' : 'smooth' });
        card.classList.remove('is-flash');
        void card.offsetWidth;
        card.classList.add('is-flash');
        cell.classList.add('is-focus');
        window.setTimeout(() => cell.classList.remove('is-focus'), 1200);
      };
    } else if (cell.dataset.on !== String(on)) {
      cell.dataset.on = String(on);
      cell.classList.remove('is-pop');
      void cell.offsetWidth;
      cell.classList.add('is-pop');
    }
    cell.style.setProperty('--i', String(Math.min(index, 40)));
    cell.title = (item.name || item.id) + ' · ' + (on ? (T.enabled || 'On') : (T.disabled || 'Off'));
    cell.setAttribute('aria-label', cell.title);
    return cell;
  });
  rail.replaceChildren(...cells);
};

const paintModState = (card, item) => {
  const on = item.enabled === true;
  card.dataset.enabled = String(on);
  const state = card.querySelector('[data-state]');
  state.dataset.on = String(on);
  state.querySelector('[data-state-text]').textContent = on ? (T.enabled || 'On') : (T.disabled || 'Off');
  const toggle = card.querySelector('.echo-switch');
  toggle.setAttribute('aria-checked', on ? 'true' : 'false');
  toggle.title = on ? (T.disableMod || T.disabled) : (T.enableMod || T.enabled);
};

const buildModCard = (item, index, animate) => {
  const card = document.createElement('article');
  card.className = 'echo-mod-row shl-spot';
  card.dataset.id = item.id;
  if (animate) {
    card.classList.add('is-entering');
    card.style.setProperty('--row-i', String(Math.min(index, 10)));
  }
  card.innerHTML = '<i class="shl-bar"></i><i class="shl-sweep"></i><span class="echo-mod-icon"></span>'
    + '<div class="echo-mod-copy"><div class="shl-titleline"><strong></strong><span class="echo-badge echo-badge-state" data-state><i aria-hidden="true"></i><span data-state-text></span></span></div>'
    + '<em data-desc></em><div class="echo-mod-meta"><span class="echo-badge echo-badge-version" data-version></span><span class="echo-badge echo-badge-id" data-idbadge></span></div></div>'
    + '<div class="echo-mod-row-actions"></div>';
  const icon = card.querySelector('.echo-mod-icon');
  if (item.iconDataUrl) {
    const img = document.createElement('img');
    img.src = item.iconDataUrl;
    img.alt = '';
    icon.replaceChildren(img);
  } else {
    icon.textContent = (item.name || item.id || '?').slice(0, 1).toUpperCase();
  }
  icon.insertAdjacentHTML('beforeend', '<i class="shl-pulse"></i>');
  applyTint(card, item.id, item.iconDataUrl);
  const title = card.querySelector('strong');
  title.textContent = item.name || item.id;
  title.title = item.name || item.id;
  const desc = card.querySelector('[data-desc]');
  desc.textContent = item.description || item.id;
  desc.hidden = uiSettings.showModDescriptions === false;
  const versionBadge = card.querySelector('[data-version]');
  versionBadge.textContent = 'v' + (item.version || '1.0.0');
  versionBadge.hidden = uiSettings.showModVersions === false;
  const idBadge = card.querySelector('[data-idbadge]');
  idBadge.textContent = item.id;
  idBadge.title = item.id;
  idBadge.hidden = uiSettings.showModIds === false;
  card.querySelector('.echo-mod-meta').hidden = versionBadge.hidden && idBadge.hidden;

  const actions = card.querySelector('.echo-mod-row-actions');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'echo-switch';
  toggle.setAttribute('role', 'switch');
  toggle.innerHTML = '<span class="echo-switch-thumb"></span>';
  toggle.onclick = async () => {
    if (toggle.disabled) return;
    toggle.disabled = true;
    const next = item.enabled !== true;
    item.enabled = next;
    paintModState(card, item);
    paintModCounts();
    renderRack();
    if (next && !motionOff()) {
      card.classList.remove('is-powering');
      void card.offsetWidth;
      card.classList.add('is-powering');
      window.setTimeout(() => card.classList.remove('is-powering'), 950);
    }
    try {
      await api('/api/mod/' + encodeURIComponent(item.id) + '/' + (next ? 'enable' : 'disable'), { method: 'POST' });
    } catch (error) {
      item.enabled = !next;
      paintModState(card, item);
      paintModCounts();
      renderRack();
      toast(error.message, 'error');
    }
    toggle.disabled = false;
    // A filtered view should drop the row once its state no longer matches,
    // but let the new state land visually first.
    if (currentFilter !== 'all') window.setTimeout(() => { if (modsPanel && !modsPanel.hidden) renderModList(); }, motionOff() ? 0 : 520);
  };
  const config = document.createElement('button');
  config.type = 'button';
  config.className = 'echo-icon-btn is-config';
  config.title = T.config || 'Config';
  config.setAttribute('aria-label', T.config || 'Config');
  config.innerHTML = iconGear;
  config.onclick = () => openConfigModal(item.id, item.name || item.id);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'echo-icon-btn echo-icon-btn-danger';
  remove.title = T.remove || T.removed;
  remove.setAttribute('aria-label', T.remove || T.removed);
  remove.dataset.armedLabel = T.confirmRemove || 'Confirm';
  remove.innerHTML = iconTrash;
  let disarmTimer = 0;
  const disarm = () => { window.clearTimeout(disarmTimer); delete remove.dataset.armed; };
  remove.addEventListener('blur', disarm);
  remove.onclick = async () => {
    if (remove.dataset.armed !== 'true') {
      remove.dataset.armed = 'true';
      window.clearTimeout(disarmTimer);
      disarmTimer = window.setTimeout(disarm, 2800);
      return;
    }
    disarm();
    remove.disabled = true;
    try {
      await api('/api/mod/' + encodeURIComponent(item.id), { method: 'DELETE' });
    } catch (error) {
      remove.disabled = false;
      toast(error.message, 'error');
      return;
    }
    modsCache = modsCache.filter((entry) => entry.id !== item.id);
    card.classList.add('is-leaving');
    window.setTimeout(() => {
      const list = card.parentElement;
      if (list) flipRender(list, () => card.remove());
      paintModCounts();
      renderRack();
      if (list && !list.querySelector(':scope > [data-id]')) renderModList();
    }, motionOff() ? 0 : 300);
  };
  actions.append(toggle, config, remove);
  paintModState(card, item);
  return card;
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
  paintModCounts();
  renderRack();
  if (!items.length) {
    list.replaceChildren(renderEmptyState(allMods.length > 0));
    return;
  }
  const known = new Set([...list.querySelectorAll(':scope > [data-id]')].map((node) => node.dataset.id));
  const build = () => list.replaceChildren(...items.map((item, index) => buildModCard(item, index, animate || !known.has(item.id))));
  if (animate) build();
  else flipRender(list, build);
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
  }, 260);
};

const openConfigModal = async (modId, modName) => {
  teardownConfigModal(true);
  configModal = document.createElement('div');
  configModal.className = 'echo-config-overlay';
  const card = document.createElement('div');
  card.className = 'echo-config-card';
  card.innerHTML = '<header><div class="echo-config-lead"><span class="echo-mod-icon" data-lead></span><div class="echo-config-heading"><span class="echo-config-kicker"></span><strong data-title></strong></div></div><button class="echo-icon-btn echo-config-close" type="button" data-close>' + iconCross + '</button></header><div class="echo-config-body" data-body></div><p class="echo-config-error" data-error></p><footer data-footer><button class="shl-btn" type="button" data-close>' + T.close + '</button><button class="shl-btn shl-btn--primary" type="button" data-save>' + (T.save || 'Save') + '</button></footer>';
  card.querySelector('.echo-config-kicker').textContent = T.config || 'Config';
  card.querySelector('[data-title]').textContent = modName;
  const leadMeta = modsCache.find((entry) => entry.id === modId);
  const lead = card.querySelector('[data-lead]');
  if (leadMeta?.iconDataUrl) {
    const leadImg = document.createElement('img');
    leadImg.src = leadMeta.iconDataUrl;
    leadImg.alt = '';
    lead.append(leadImg);
  } else {
    lead.textContent = String(modName || '?').slice(0, 1).toUpperCase();
  }
  applyTint(card, modId, leadMeta?.iconDataUrl);
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
        const lo = Number(spec.minimum);
        const hi = Number(spec.maximum);
        if ((spec.type === 'integer' || spec.type === 'number') && spec.minimum != null && spec.maximum != null && Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
          const wrap = document.createElement('div');
          wrap.className = 'echo-config-range';
          const slider = document.createElement('input');
          slider.type = 'range';
          slider.min = String(lo);
          slider.max = String(hi);
          slider.step = spec.type === 'integer' ? '1' : String(Math.max((hi - lo) / 100, 0.01));
          const paint = () => slider.style.setProperty('--p', (((Number(slider.value) - lo) / (hi - lo)) * 100) + '%');
          slider.value = input.value !== '' ? input.value : String(spec.default ?? lo);
          paint();
          slider.oninput = () => { input.value = slider.value; paint(); };
          input.addEventListener('input', () => { if (input.value !== '') { slider.value = input.value; paint(); } });
          wrap.append(slider, input);
          field.append(wrap);
        } else field.append(input);
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
    const response = await fetch(base + '/api/mod/' + encodeURIComponent(modId) + '/file/' + encodeURIComponent(path), { headers: authHeaders });
    if (!response.ok) throw new Error('mod_config_ui_http_' + response.status);
    const source = await response.text();
    const assetUrl = (filePath) => base + '/api/mod/' + encodeURIComponent(modId) + '/file/' + encodeURIComponent(String(filePath || '').replaceAll('\\', '/'));
    const loadAsset = async (filePath, options = {}) => {
      const asset = await fetch(assetUrl(filePath), { headers: authHeaders });
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

const bytesToBase64 = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const processFileImport = async (file) => {
  if (!file) return;
  const buffer = await file.arrayBuffer();
  const res = await api('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: bytesToBase64(new Uint8Array(buffer)), name: file.name }) });
  toast((res.manifest?.name || res.manifest?.id || file.name), 'success');
  await loadMods();
};

const processFiles = async (files) => {
  for (const file of [...(files || [])]) await processFileImport(file).catch((error) => toast(error.message, 'error'));
};

const openMods = async () => {
  if (modsPanel) {
    modsListAnimate = true;
    showPanel(modsPanel, modsButton);
    await loadMods();
    return;
  }
  const filterButton = (value, label, count) => '<button type="button" class="' + (value === 'all' ? 'active' : '') + '" data-filter="' + value + '">' + label + '<span class="echo-filter-count" data-count-' + count + '>0</span></button>';
  modsPanel = mountPage('echo-external-mod-panel page-surface', `
    <div class="shl-veil" data-veil><div>${iconUpload}<span data-veil-label></span></div></div>
    <div class="shl-page echo-mod-page">
      ${mastHtml({
        kicker: T.modsKicker,
        title: T.modsTitle,
        lede: T.modsHint,
        actions: '<input type="file" accept=".echomod,.echo,application/json,application/zip" data-file multiple hidden>'
          + '<button type="button" class="shl-btn" data-action="import">' + iconUpload + '<span>' + T.importMod + '</span></button>'
          + '<button type="button" class="shl-btn shl-btn--primary" data-action="reinject">' + iconRefresh + '<span>' + T.reload + '</span></button>',
      })}
      <section class="shl-card shl-rack">
        <div class="shl-rack-num">
          <span>${T.modsActiveLabel || 'Active'}</span>
          <div><b data-count-active data-pad="2">00</b><em>/ <span data-count-all>0</span></em></div>
        </div>
        <div class="shl-rail" data-rail></div>
        <p class="shl-rack-hint">${T.modsRailHint || ''}</p>
      </section>
      <div class="shl-toolbar">
        <div class="shl-search">
          <span class="echo-search-icon">${iconSearch}</span>
          <input type="search" data-search placeholder="${T.searchMods}" autocomplete="off" spellcheck="false">
          <button class="echo-search-clear" type="button" data-search-clear hidden>${iconCross}</button>
        </div>
        <div class="shl-seg" data-seg data-filters><i class="shl-seg-thumb"></i>
          ${filterButton('all', T.filterAll, 'all')}${filterButton('active', T.filterOn, 'active')}${filterButton('inactive', T.filterOff, 'inactive')}
        </div>
        <select class="shl-select" data-sort aria-label="${T.sortMods}" title="${T.sortMods}">
          <option value="name">${T.sortName}</option>
          <option value="recent">${T.sortRecent}</option>
          <option value="enabled">${T.sortEnabled}</option>
        </select>
        <div class="shl-seg shl-seg--icons" data-seg data-layouts><i class="shl-seg-thumb"></i>
          <button type="button" data-layout-set="list" title="${T.layoutList}" aria-label="${T.layoutList}">${iconRows}</button>
          <button type="button" data-layout-set="grid" title="${T.layoutGrid}" aria-label="${T.layoutGrid}">${iconGrid}</button>
        </div>
      </div>
      <div class="echo-mod-drop" data-dropzone>
        <span class="echo-drop-icon" aria-hidden="true">${iconUpload}</span>
        <span data-drop-label></span>
      </div>
      <div class="echo-mod-list" data-mod-list></div>
    </div>
  `);
  bindSpotlight(modsPanel);
  modsPanel.querySelectorAll('[data-seg]').forEach(watchSeg);
  modsListAnimate = true;
  showPanel(modsPanel, modsButton);
  const fileInput = modsPanel.querySelector('[data-file]');
  const dropLabel = modsPanel.querySelector('[data-drop-label]');
  dropLabel.textContent = T.dropHint;
  modsPanel.querySelector('[data-veil-label]').textContent = T.dropActive || T.dropHint;
  modsPanel.querySelector('[data-action="import"]').onclick = () => fileInput.click();
  fileInput.onchange = (event) => { const files = event.target.files; if (files?.length) void processFiles(files); fileInput.value = ''; };
  const dropzone = modsPanel.querySelector('[data-dropzone]');
  dropzone.onclick = () => fileInput.click();
  // Dragging a file anywhere over the page raises a full-page drop veil.
  const veil = modsPanel.querySelector('[data-veil]');
  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
  const setVeil = (on) => {
    veil.style.setProperty('--h', modsPanel.clientHeight + 'px');
    veil.classList.toggle('is-on', on);
    dropzone.classList.toggle('is-over', on);
  };
  modsPanel.addEventListener('dragenter', (event) => { if (hasFiles(event)) { event.preventDefault(); setVeil(true); } });
  modsPanel.addEventListener('dragover', (event) => { if (hasFiles(event)) { event.preventDefault(); if (!veil.classList.contains('is-on')) setVeil(true); } });
  modsPanel.addEventListener('dragleave', (event) => { if (!modsPanel.contains(event.relatedTarget)) setVeil(false); });
  modsPanel.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setVeil(false);
    void processFiles(event.dataTransfer?.files);
  });
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
      currentFilter = chip.dataset.filter;
      syncModsToolbar();
      persistListPrefs();
      renderModList();
    };
  });
  modsPanel.querySelectorAll('[data-layout-set]').forEach((button) => {
    button.onclick = () => void saveUiSettings({ cardLayout: button.dataset.layoutSet }).catch((error) => toast(error.message, 'error'));
  });
  const sortSelect = modsPanel.querySelector('[data-sort]');
  sortSelect.value = currentSort;
  sortSelect.onchange = () => {
    currentSort = sortSelect.value;
    persistListPrefs();
    renderModList();
  };
  modsPanel.querySelector('[data-action="reinject"]').onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.classList.add('shl-btn--spin');
    try {
      const result = await api('/api/reinject', { method: 'POST' });
      toast(String(result.targets || 0), 'success');
    } catch (error) { toast(error.message, 'error'); }
    button.disabled = false;
    button.classList.remove('shl-btn--spin');
  };
  applyUiSettings();
  await loadMods();
};

const formatBytes = (value) => {
  const size = Number(value) || 0;
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(size < 10 * 1024 ? 1 : 0) + ' KB';
  return (size / (1024 * 1024)).toFixed(2) + ' MB';
};
const formatCount = (value) => {
  const n = Number(value) || 0;
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n / 1000) + 'k';
};
const renderMarkdown = (host, source) => {
  host.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'echo-md';
  const lines = String(source || '').replaceAll('\r\n', '\n').split('\n');
  let i = 0;
  let para = [];
  const flush = () => {
    if (!para.length) return;
    const p = document.createElement('p');
    p.textContent = para.join(' ');
    wrap.append(p);
    para = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      flush();
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i += 1; }
      const pre = document.createElement('pre');
      pre.textContent = buf.join('\n');
      wrap.append(pre);
      i += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      const el = document.createElement('h' + Math.min(4, heading[1].length + 1));
      el.textContent = heading[2];
      wrap.append(el);
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flush();
      const ul = document.createElement('ul');
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const li = document.createElement('li');
        li.textContent = lines[i].replace(/^\s*[-*]\s+/, '');
        ul.append(li);
        i += 1;
      }
      wrap.append(ul);
      continue;
    }
    if (!line.trim()) { flush(); i += 1; continue; }
    para.push(line.trim());
    i += 1;
  }
  flush();
  if (!wrap.childElementCount) {
    const p = document.createElement('p');
    p.textContent = T.marketNoReadme || '';
    wrap.append(p);
  }
  host.append(wrap);
};
const marketLocaleText = (item, key) => {
  const zh = item[key + 'Zh'];
  const fallback = item[key] || '';
  const english = item[key + 'En'] || fallback;
  const chinese = zh || fallback;
  return (typeof LOADER_LOCALE !== 'undefined' && LOADER_LOCALE === 'en') ? (english || chinese) : (chinese || english);
};
const marketSearchScore = (item, query) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 1;
  const name = String(marketLocaleText(item, 'name') || '').toLowerCase();
  const desc = String(marketLocaleText(item, 'description') || '').toLowerCase();
  const ident = String(item.id || '').toLowerCase();
  const author = String(item.author || '').toLowerCase();
  const tags = (item.tags || []).map((tag) => String(tag).toLowerCase());
  let score = 0;
  if (name === q) score += 200;
  else if (name.startsWith(q)) score += 120;
  else if (name.includes(q)) score += 80;
  if (ident.includes(q)) score += 70;
  if (tags.some((tag) => tag === q || tag.includes(q))) score += 60;
  if (desc.includes(q)) score += 24;
  if (author.includes(q)) score += 16;
  return score;
};
const renderMarketEmpty = (kind) => {
  const empty = document.createElement('div');
  empty.className = 'echo-empty';
  empty.innerHTML = emptyArt + '<strong class="echo-empty-title"></strong><p class="echo-empty-hint"></p>';
  if (kind === 'offline') {
    empty.querySelector('.echo-empty-title').textContent = T.marketOffline || T.failed;
    empty.querySelector('.echo-empty-hint').textContent = T.marketOfflineHint || '';
  } else if (kind === 'login') {
    empty.querySelector('.echo-empty-title').textContent = T.marketLogin || 'Sign in';
    empty.querySelector('.echo-empty-hint').textContent = T.marketLoginHint || '';
  } else if (kind === 'search') {
    empty.querySelector('.echo-empty-title').textContent = T.marketEmptySearch || T.emptySearch;
    empty.querySelector('.echo-empty-hint').textContent = T.marketEmptySearchHint || T.emptySearchHint;
  } else {
    empty.querySelector('.echo-empty-title').textContent = T.marketEmpty || T.emptyMods;
    empty.querySelector('.echo-empty-hint').textContent = T.marketEmptyHint || T.emptyModsHint;
  }
  return empty;
};
const renderMarketSkeleton = () => {
  const list = marketPanel?.querySelector('[data-market-list]');
  if (!list) return;
  list.replaceChildren(...Array.from({ length: MARKET_LIST_PAGE }, () => {
    const row = document.createElement('div');
    row.className = 'echo-skel';
    row.innerHTML = '<i class="echo-skel-icon"></i><div class="echo-skel-copy"><i></i><i></i></div><i class="echo-skel-btn"></i>';
    return row;
  }));
};
const syncMarketToolbar = () => {
  if (!marketPanel) return;
  marketPanel.querySelectorAll('[data-market-filter]').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.marketFilter === marketFilter);
  });
  syncAllSegs(marketPanel);
};
const MARKET_LIST_PAGE = 6;
const MARKET_REC_PAGE = 3;
const MARKET_RANDOM_COUNT = 3;
const shuffleMarketMods = (count) => {
  const pool = [...(marketCache.mods || [])].filter((item) => !item.unlisted);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
  }
  return pool.slice(0, Math.min(count, pool.length));
};
const sliceMarketPage = (items, page, size) => {
  const pages = Math.max(1, Math.ceil((items.length || 0) / size) || 1);
  const current = Math.min(Math.max(1, page || 1), pages);
  return { page: current, pages, items: items.slice((current - 1) * size, current * size) };
};
const paintMarketPager = (host, pages, page, onPage) => {
  if (!host) return;
  host.hidden = false;
  host.classList.add('echo-store-pager');
  const total = Math.max(1, pages || 1);
  const current = Math.min(Math.max(1, page || 1), total);
  const nodes = [];
  const add = (label, target, isHere) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (isHere) button.classList.add('is-current');
    if (target && target !== current) button.onclick = () => onPage(target);
    else if (!isHere) button.disabled = true;
    nodes.push(button);
  };
  add('‹', current > 1 ? current - 1 : 0, false);
  for (let n = 1; n <= total; n += 1) add(String(n), n, n === current);
  add('›', current < total ? current + 1 : 0, false);
  host.replaceChildren(...nodes);
};
const compareMarketItems = (left, right) => {
  const leftScore = marketSearchScore(left, marketSearchQuery);
  const rightScore = marketSearchScore(right, marketSearchQuery);
  if (marketSearchQuery.trim() && leftScore !== rightScore) return rightScore - leftScore;
  if (left.updateAvailable !== right.updateAvailable) return left.updateAvailable ? -1 : 1;
  if (left.featured !== right.featured) return left.featured ? -1 : 1;
  if ((left.channel === 'official') !== (right.channel === 'official')) return left.channel === 'official' ? -1 : 1;
  return String(marketLocaleText(left, 'name') || left.id).localeCompare(String(marketLocaleText(right, 'name') || right.id));
};
let marketJustInstalled = '';
const marketItemIcon = (item) => item.iconDataUrl || item.iconUrl || '';
const marketBadge = (kind, icon, label) => '<span class="echo-badge echo-badge-' + kind + '">' + icon + '<span>' + escapeHtml(label) + '</span></span>';
const renderMarketCard = (item, index, animate) => {
  const card = document.createElement('article');
  card.className = 'echo-mod-row echo-store-card shl-spot';
  card.dataset.id = item.id;
  card.dataset.installed = String(item.installed === true);
  card.dataset.update = String(item.updateAvailable === true);
  if (animate) {
    card.classList.add('is-entering');
    card.style.setProperty('--row-i', String(Math.min(index, 8)));
  }
  card.innerHTML = '<div class="shl-cover"><div class="shl-cover-tags"></div></div>'
    + '<div class="shl-store-main"><span class="echo-mod-icon"></span><div class="echo-store-body"><strong></strong><div class="echo-store-byline"></div><em data-desc></em></div></div>'
    + '<div class="echo-store-foot"><div class="echo-mod-row-actions"></div></div>';
  const iconSrc = marketItemIcon(item);
  const icon = card.querySelector('.echo-mod-icon');
  if (iconSrc) {
    const img = document.createElement('img');
    img.src = iconSrc;
    img.alt = '';
    icon.replaceChildren(img);
  } else {
    icon.textContent = (marketLocaleText(item, 'name') || item.id || '?').slice(0, 1).toUpperCase();
  }
  applyTint(card, item.id, iconSrc);
  const tags = card.querySelector('.shl-cover-tags');
  if (item.channel === 'official') tags.insertAdjacentHTML('beforeend', marketBadge('official', iconShield, T.marketOfficial || 'Official'));
  if (item.updateAvailable) tags.insertAdjacentHTML('beforeend', marketBadge('update', iconBolt, T.updateMarket || 'Update'));
  const title = card.querySelector('strong');
  title.textContent = marketLocaleText(item, 'name') || item.id;
  title.title = item.id;
  title.onclick = () => void openMarketDetail(item);
  const byline = card.querySelector('.echo-store-byline');
  const stat = (icon, text) => {
    const span = document.createElement('span');
    span.innerHTML = icon + '<span></span>';
    span.lastElementChild.textContent = text;
    return span;
  };
  if (item.author) byline.append(stat(iconUser, item.author));
  byline.append(stat(iconDownload, formatCount(item.downloads)), stat(iconEye, formatCount(item.views)));
  const desc = card.querySelector('[data-desc]');
  desc.textContent = marketLocaleText(item, 'description') || item.id;
  desc.hidden = uiSettings.showModDescriptions === false;
  const actions = card.querySelector('.echo-mod-row-actions');
  if (item.homepage) {
    const repo = document.createElement('a');
    repo.className = 'echo-store-ghost';
    repo.href = item.homepage;
    repo.target = '_blank';
    repo.rel = 'noopener';
    repo.textContent = T.marketRepo || 'Repo';
    actions.append(repo);
  }
  const info = document.createElement('button');
  info.type = 'button';
  info.className = 'echo-store-ghost';
  info.textContent = T.marketIntro || T.marketDetails || 'About';
  info.onclick = () => void openMarketDetail(item);
  actions.append(info, marketActionButton(item));
  return card;
};
const marketActionButton = (item) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'echo-market-action';
  if (marketBusyId === item.id) {
    button.disabled = true;
    button.textContent = T.installingMarket || '…';
  } else if (item.updateAvailable) {
    button.dataset.kind = 'update';
    button.textContent = T.updateMarket || 'Update';
    button.onclick = () => void installMarketItem(item);
  } else if (item.installed) {
    button.dataset.kind = 'done';
    button.innerHTML = iconCheck + '<span></span>';
    button.querySelector('span').textContent = T.installedMarket || 'Installed';
    button.onclick = () => void openMods();
    if (marketJustInstalled === item.id) button.classList.add('is-just-installed');
  } else {
    button.textContent = T.installMarket || 'Install';
    button.onclick = () => void installMarketItem(item);
  }
  return button;
};
const filteredMarketItems = () => {
  const all = marketCache.mods || [];
  return all.filter((item) => {
    if (marketSearchScore(item, marketSearchQuery) <= 0) return false;
    if (marketTag && !(item.tags || []).includes(marketTag)) return false;
    if (marketFilter === 'updates') return item.updateAvailable;
    if (marketFilter === 'available') return !item.installed;
    if (marketFilter === 'installed') return item.installed;
    return true;
  }).sort(compareMarketItems);
};
const renderMarketTags = () => {
  const host = marketPanel?.querySelector('[data-market-tags]');
  if (!host) return;
  const counts = new Map();
  (marketCache.mods || []).forEach((item) => (item.tags || []).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
  host.hidden = counts.size === 0;
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'shl-chip' + (marketTag ? '' : ' active');
  all.dataset.marketTag = '';
  all.innerHTML = '<span></span><span class="echo-filter-count"></span>';
  all.firstElementChild.textContent = T.marketAllTags || T.filterAll;
  all.querySelector('.echo-filter-count').textContent = String((marketCache.mods || []).length);
  all.onclick = () => { marketTag = ''; marketListPage = 1; marketRecPage = 1; renderMarketList(); };
  const chips = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([tag, count]) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'shl-chip' + (marketTag === tag ? ' active' : '');
    chip.innerHTML = '<span></span><span class="echo-filter-count"></span>';
    chip.querySelector('span').textContent = tag;
    chip.querySelector('.echo-filter-count').textContent = String(count);
    chip.onclick = () => { marketTag = marketTag === tag ? '' : tag; marketListPage = 1; marketRecPage = 1; renderMarketList(); };
    return chip;
  });
  host.replaceChildren(all, ...chips);
};
const renderMarketSuggest = () => {
  const box = marketPanel?.querySelector('[data-market-suggest]');
  const input = marketPanel?.querySelector('[data-market-search]');
  if (!box || !input) return;
  const q = marketSearchQuery.trim();
  if (!q || document.activeElement !== input) {
    box.hidden = true;
    return;
  }
  const hits = filteredMarketItems().slice(0, 6);
  if (!hits.length) {
    box.hidden = true;
    return;
  }
  box.replaceChildren(...hits.map((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = '<span></span><small></small>';
    button.querySelector('span').textContent = marketLocaleText(item, 'name') || item.id;
    button.querySelector('small').textContent = item.id;
    button.onclick = () => {
      marketSearchQuery = marketLocaleText(item, 'name') || item.id;
      input.value = marketSearchQuery;
      box.hidden = true;
      renderMarketList();
    };
    return button;
  }));
  box.hidden = false;
};
// ---- Spotlight hero ------------------------------------------------------
// Slides advance on the animationend of the active progress dot, so hover-pause,
// reduced motion and "animations off" all fall out of CSS for free.
let marketHeroIndex = 0;
const marketHeroItems = () => {
  const mods = (marketCache.mods || []).filter((item) => !item.unlisted);
  const byId = new Map(mods.map((item) => [item.id, item]));
  const picked = (marketCache.recommended || []).filter((item) => !item.unlisted).map((item) => byId.get(item.id) || item);
  const pool = picked.length ? picked : [...mods].sort((left, right) => (Number(right.downloads) || 0) - (Number(left.downloads) || 0));
  return pool.slice(0, 5);
};
const setHeroSlide = (hero, index, restart = false) => {
  const slides = [...hero.querySelectorAll('.shl-slide')];
  if (!slides.length) return;
  marketHeroIndex = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => slide.classList.toggle('is-active', i === marketHeroIndex));
  hero.querySelectorAll('.shl-dot').forEach((dot, i) => {
    if (restart && i === marketHeroIndex) { dot.classList.remove('is-active'); void dot.offsetWidth; }
    dot.classList.toggle('is-active', i === marketHeroIndex);
    dot.classList.toggle('is-done', i < marketHeroIndex);
  });
  const paintTint = () => {
    const tint = getComputedStyle(slides[marketHeroIndex]).getPropertyValue('--tint').trim();
    if (tint) hero.style.setProperty('--tint', tint);
  };
  paintTint();
  window.setTimeout(paintTint, 450);
};
const renderMarketHero = (items) => {
  const hero = marketPanel?.querySelector('[data-hero]');
  if (!hero) return;
  if (!items.length) {
    hero.hidden = true;
    hero.dataset.sig = '';
    return;
  }
  hero.hidden = false;
  const sig = items.map((item) => [item.id, item.installed ? 1 : 0, item.updateAvailable ? 1 : 0, marketBusyId === item.id ? 1 : 0, item.downloads, item.views].join(':')).join('|');
  if (hero.dataset.sig === sig) return;
  hero.dataset.sig = sig;
  const slidesHost = hero.querySelector('[data-slides]');
  const dotsHost = hero.querySelector('[data-dots]');
  const slides = items.map((item) => {
    const slide = document.createElement('article');
    slide.className = 'shl-slide';
    const name = marketLocaleText(item, 'name') || item.id;
    slide.innerHTML = '<div class="shl-slide-copy"><div class="shl-slide-eyebrow"></div><h2></h2><p></p><div class="shl-slide-stats"></div><div class="shl-slide-cta"></div></div>'
      + '<div class="shl-slide-art"><i class="shl-orbit"></i><i class="shl-orbit"></i><div class="shl-slide-icon"></div></div>';
    const eyebrow = slide.querySelector('.shl-slide-eyebrow');
    eyebrow.insertAdjacentHTML('beforeend', marketBadge('featured', iconSparkle, T.marketRecommend || 'Featured'));
    if (item.channel === 'official') eyebrow.insertAdjacentHTML('beforeend', marketBadge('official', iconShield, T.marketOfficial || 'Official'));
    if (item.updateAvailable) eyebrow.insertAdjacentHTML('beforeend', marketBadge('update', iconBolt, T.updateMarket || 'Update'));
    slide.querySelector('h2').textContent = name;
    slide.querySelector('p').textContent = marketLocaleText(item, 'description') || item.id;
    const stats = slide.querySelector('.shl-slide-stats');
    [[iconUser, item.author], [iconDownload, formatCount(item.downloads)], [iconEye, formatCount(item.views)]].forEach(([icon, text]) => {
      if (!text) return;
      const span = document.createElement('span');
      span.innerHTML = icon + '<span></span>';
      span.lastElementChild.textContent = text;
      stats.append(span);
    });
    const iconSrc = marketItemIcon(item);
    const art = slide.querySelector('.shl-slide-icon');
    if (iconSrc) {
      const img = document.createElement('img');
      img.src = iconSrc;
      img.alt = '';
      art.append(img);
    } else {
      art.textContent = name.slice(0, 1).toUpperCase();
    }
    applyTint(slide, item.id, iconSrc);
    const cta = slide.querySelector('.shl-slide-cta');
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'shl-btn shl-btn--primary';
    if (marketBusyId === item.id) { primary.disabled = true; primary.textContent = T.installingMarket || '…'; }
    else if (item.updateAvailable) { primary.innerHTML = iconBolt + '<span></span>'; primary.lastElementChild.textContent = T.updateMarket || 'Update'; primary.onclick = () => void installMarketItem(item); }
    else if (item.installed) { primary.innerHTML = iconCheck + '<span></span>'; primary.lastElementChild.textContent = T.installedMarket || 'Installed'; primary.onclick = () => void openMods(); }
    else { primary.innerHTML = iconDownload + '<span></span>'; primary.lastElementChild.textContent = T.installMarket || 'Install'; primary.onclick = () => void installMarketItem(item); }
    const about = document.createElement('button');
    about.type = 'button';
    about.className = 'shl-btn';
    about.textContent = T.marketIntro || T.marketDetails || 'About';
    about.onclick = () => void openMarketDetail(item);
    cta.append(primary, about);
    return slide;
  });
  slidesHost.replaceChildren(...slides);
  dotsHost.replaceChildren(...items.map((_, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'shl-dot';
    dot.setAttribute('aria-label', String(index + 1));
    dot.onclick = () => setHeroSlide(hero, index, true);
    dot.addEventListener('animationend', (event) => {
      if (event.pseudoElement !== '::after' || reduceMotion() || uiSettings.animations === false) return;
      if (dot.classList.contains('is-active')) setHeroSlide(hero, marketHeroIndex + 1);
    });
    return dot;
  }));
  hero.querySelector('[data-hero-arrows]').hidden = items.length < 2;
  setHeroSlide(hero, Math.min(marketHeroIndex, items.length - 1), true);
};

const renderMarketList = () => {
  if (!marketPanel) return;
  const animate = marketListAnimate;
  marketListAnimate = false;
  const list = marketPanel.querySelector('[data-market-list]');
  list.dataset.layout = 'store';
  const all = marketCache.mods || [];
  marketPanel.querySelector('[data-count-all]').textContent = String(all.length);
  marketPanel.querySelector('[data-count-updates]').textContent = String(all.filter((item) => item.updateAvailable).length);
  marketPanel.querySelector('[data-count-available]').textContent = String(all.filter((item) => !item.installed).length);
  marketPanel.querySelector('[data-count-installed]').textContent = String(all.filter((item) => item.installed).length);
  syncMarketToolbar();
  renderMarketTags();
  renderMarketSuggest();
  const listPager = marketPanel.querySelector('[data-list-pager]');
  const randomWrap = marketPanel.querySelector('[data-random-wrap]');
  const randomList = marketPanel.querySelector('[data-random-list]');
  if (randomList) randomList.dataset.layout = 'store';
  const searching = Boolean(marketSearchQuery.trim() || marketTag || marketFilter !== 'all');
  const hideHero = Boolean(searching || marketLoading || !marketCache.ok || !all.length);
  const hideRandom = Boolean(searching || marketLoading || !marketCache.ok || !all.length);
  renderMarketHero(hideHero ? [] : marketHeroItems());
  if (hideRandom && randomWrap) randomWrap.hidden = true;
  if (marketLoading) {
    renderMarketSkeleton();
    if (listPager) listPager.hidden = true;
    return;
  }
  if (!marketCache.ok) {
    list.replaceChildren(renderMarketEmpty(marketCache.error === 'login_required' ? 'login' : 'offline'));
    if (listPager) listPager.hidden = true;
    return;
  }
  const items = filteredMarketItems();
  const listPage = sliceMarketPage(items, marketListPage, MARKET_LIST_PAGE);
  marketListPage = listPage.page;
  const tally = marketPanel.querySelector('[data-all-count]');
  if (tally) tally.textContent = String(items.length).padStart(2, '0');
  const build = () => {
    if (!items.length) list.replaceChildren(renderMarketEmpty(all.length ? 'search' : 'empty'));
    else list.replaceChildren(...listPage.items.map((item, index) => renderMarketCard(item, index, animate)));
  };
  if (animate || !items.length) build();
  else flipRender(list, build);
  paintMarketPager(listPager, listPage.pages, listPage.page, (page) => { marketListPage = page; renderMarketList(); });
  if (listPager) listPager.hidden = !items.length || listPage.pages < 2;
  if (!hideRandom) {
    if (!marketRandomPick.length) marketRandomPick = shuffleMarketMods(MARKET_RANDOM_COUNT);
    if (randomWrap) randomWrap.hidden = marketRandomPick.length === 0;
    if (randomList) randomList.replaceChildren(...marketRandomPick.map((item, index) => renderMarketCard(item, index, false)));
  }
  marketJustInstalled = '';
};
const setMarketLoginOpen = (open) => {
  const overlay = marketPanel?.querySelector('[data-login-overlay]');
  if (!overlay) return;
  overlay.hidden = !open;
  if (open) marketPanel.querySelector('[data-login-id]')?.focus();
};
const syncMarketAccount = () => {
  if (!marketPanel) return;
  const openLogin = marketPanel.querySelector('[data-open-login]');
  const account = marketPanel.querySelector('[data-account]');
  const nameEl = marketPanel.querySelector('[data-account-name]');
  const avatar = marketPanel.querySelector('[data-avatar]');
  const uploadBtn = marketPanel.querySelector('[data-action="upload"]');
  const drop = marketPanel.querySelector('[data-upload-drop]');
  const manageBtn = marketPanel.querySelector('[data-action="manage"]');
  const managing = marketPanel.querySelector('[data-market-manage]') && !marketPanel.querySelector('[data-market-manage]').hidden;
  if (marketUser) {
    const name = marketUser.displayName || marketUser.username || '';
    if (openLogin) openLogin.hidden = true;
    setMarketLoginOpen(false);
    if (account) account.hidden = false;
    if (nameEl) nameEl.textContent = name;
    if (avatar) avatar.textContent = (name || '?').slice(0, 1).toUpperCase();
    if (uploadBtn) { uploadBtn.hidden = !!managing; uploadBtn.classList.remove('is-locked'); }
    if (drop) { drop.hidden = !!managing; drop.classList.remove('is-locked'); }
    if (manageBtn) manageBtn.hidden = false;
  } else {
    if (openLogin) openLogin.hidden = false;
    if (account) account.hidden = true;
    if (uploadBtn) { uploadBtn.hidden = !!managing; uploadBtn.classList.add('is-locked'); }
    if (drop) { drop.hidden = !!managing; drop.classList.add('is-locked'); }
    if (manageBtn) manageBtn.hidden = true;
    showMarketManage(false);
  }
  const dropLabel = marketPanel.querySelector('[data-upload-label]');
  if (dropLabel) dropLabel.textContent = marketUser ? (T.marketUploadHint || T.dropHint) : (T.marketUploadLocked || T.marketUploadHint || '');
};
const loadMarket = async (force = false) => {
  if (!marketPanel) return;
  marketLoading = true;
  const refreshBtn = marketPanel.querySelector('[data-action="refresh"]');
  if (refreshBtn) refreshBtn.disabled = true;
  renderMarketList();
  try {
    const me = await api('/api/market/me').catch(() => ({ user: null }));
    marketUser = me.user || null;
    syncMarketAccount();
    const result = await api('/api/market' + (force ? '?force=1' : ''));
    if (force) marketRandomPick = [];
    marketCache = {
      ok: result.ok !== false,
      mods: Array.isArray(result.mods) ? result.mods : [],
      recommended: Array.isArray(result.recommended) ? result.recommended : [],
      tags: Array.isArray(result.tags) ? result.tags : [],
      error: result.error || '',
      updatedAt: result.updatedAt || null,
    };
  } catch (error) {
    marketCache = { ok: false, mods: [], recommended: [], tags: [], error: error.message, updatedAt: null };
  } finally {
    marketLoading = false;
    marketListAnimate = true;
    if (refreshBtn) refreshBtn.disabled = false;
    renderMarketList();
  }
};
const installMarketItem = async (item) => {
  if (!item?.id || marketBusyId) return;
  marketBusyId = item.id;
  renderMarketList();
  try {
    const result = await api('/api/market/install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    });
    const name = marketLocaleText(item, 'name') || item.id;
    const template = result.updated ? (T.marketUpdatedToast || '{name}') : (T.marketInstalledToast || '{name}');
    toast(template.replace('{name}', name), 'success');
    marketBusyId = '';
    marketJustInstalled = item.id;
    await loadMarket(true);
    if (modsPanel) await loadMods();
  } catch (error) {
    toast(error.message, 'error');
    marketBusyId = '';
    renderMarketList();
  }
};
let marketDetailEl = null;
const closeMarketDetail = (immediate = false) => {
  const el = marketDetailEl;
  marketDetailEl = null;
  if (!el) return;
  if (immediate || reduceMotion() || uiSettings.animations === false) { el.remove(); return; }
  el.classList.add('is-leaving');
  window.setTimeout(() => el.remove(), 260);
};
const openMarketDetail = async (item) => {
  if (!item?.id) return;
  closeMarketDetail(true);
  const overlay = document.createElement('div');
  overlay.className = 'echo-config-overlay';
  const card = document.createElement('div');
  card.className = 'echo-config-card';
  card.dataset.detail = 'true';
  card.innerHTML = '<header><div class="echo-config-lead"><span class="echo-mod-icon"></span><div class="echo-config-heading"><span class="echo-config-kicker"></span><strong></strong></div></div><button class="echo-icon-btn echo-config-close" type="button" data-close>' + iconCross + '</button></header><div class="echo-config-body" data-body></div><footer data-footer></footer>';
  card.querySelector('.echo-config-kicker').textContent = item.author || (item.channel === 'official' ? (T.marketOfficial || 'Official') : (T.marketCommunity || 'Community'));
  const displayName = marketLocaleText(item, 'name') || item.id;
  card.querySelector('strong').textContent = displayName;
  const iconSrc = marketItemIcon(item);
  const leadIcon = card.querySelector('.echo-mod-icon');
  if (iconSrc) {
    const img = document.createElement('img');
    img.src = iconSrc;
    img.alt = '';
    leadIcon.append(img);
  } else {
    leadIcon.textContent = displayName.slice(0, 1).toUpperCase();
  }
  applyTint(card, item.id, iconSrc);
  overlay.append(card);
  marketDetailEl = overlay;
  (document.querySelector('.app-shell') || document.body).append(overlay);
  const close = () => closeMarketDetail();
  overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
  overlay.querySelector('[data-close]').onclick = close;
  const onKey = (event) => { if (event.key === 'Escape') { window.removeEventListener('keydown', onKey); close(); } };
  window.addEventListener('keydown', onKey);
  const body = card.querySelector('[data-body]');
  const footer = card.querySelector('[data-footer]');
  try {
    const payload = await api('/api/market/mod/' + encodeURIComponent(item.id));
    const detail = payload.mod || item;
    if (!marketViewed.has(item.id)) {
      marketViewed.add(item.id);
      void api('/api/market/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'view', id: item.id }) }).catch(() => {});
      detail.views = (Number(detail.views) || 0) + 1;
      const local = (marketCache.mods || []).find((row) => row.id === item.id);
      if (local) local.views = detail.views;
    }
    const tiles = document.createElement('div');
    tiles.className = 'shl-tiles';
    [
      [T.marketDownloads || 'Downloads', formatCount(detail.downloads)],
      [T.marketViews || 'Views', formatCount(detail.views)],
      [T.marketInstalls || 'Installs', formatCount(detail.installs)],
      ['Version', 'v' + (detail.version || item.version || '1.0.0')],
      ['Size', formatBytes(detail.size || item.size)],
    ].forEach(([label, value]) => {
      const tile = document.createElement('div');
      tile.className = 'shl-tile';
      tile.innerHTML = '<small></small><b></b>';
      tile.querySelector('small').textContent = label;
      tile.querySelector('b').textContent = value;
      tiles.append(tile);
    });
    const intro = document.createElement('p');
    intro.className = 'echo-config-desc';
    intro.style.fontSize = '14px';
    intro.textContent = marketLocaleText(detail, 'intro') || marketLocaleText(detail, 'description') || marketLocaleText(item, 'description') || '';
    const readme = document.createElement('div');
    renderMarkdown(readme, payload.readme || '');
    body.append(tiles, intro, readme);
    const manage = payload.canManage || (marketUser && (marketUser.isAdmin || String(detail.authorId || item.authorId || '') === String(marketUser.id)));
    if (manage) {
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'shl-btn';
      go.textContent = T.marketManage || 'Manage';
      go.onclick = () => { close(); marketManageFocus = item.id; showMarketManage(true); };
      footer.append(go);
    }
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'shl-btn shl-btn--primary';
    if (item.updateAvailable) action.textContent = T.updateMarket || 'Update';
    else if (item.installed) action.textContent = T.installedMarket || 'Installed';
    else action.textContent = T.installMarket || 'Install';
    action.onclick = () => { close(); if (!item.installed || item.updateAvailable) void installMarketItem(item); else void openMods(); };
    footer.append(action);
  } catch (error) {
    body.textContent = error.message;
  }
};
let marketManageFocus = '';
let marketManageScope = 'mine';
const ownedMarketMods = () => (marketCache.mods || []).filter((item) => marketUser && String(item.authorId || '') === String(marketUser.id));
const managedMarketMods = () => {
  if (marketUser?.isAdmin && marketManageScope === 'all') return marketCache.mods || [];
  return ownedMarketMods();
};
const showMarketManage = (on) => {
  if (!marketPanel) return;
  const home = marketPanel.querySelector('[data-market-home]');
  const manage = marketPanel.querySelector('[data-market-manage]');
  if (home) home.hidden = !!on;
  if (manage) manage.hidden = !on;
  marketPanel.querySelectorAll('[data-market-chrome]').forEach((el) => { el.hidden = !!on; });
  const drop = marketPanel.querySelector('[data-upload-drop]');
  if (drop) drop.hidden = !!on || !marketUser;
  if (on) renderMarketManage();
  else marketManageFocus = '';
};
const renderMarketManage = () => {
  const list = marketPanel?.querySelector('[data-manage-list]');
  if (!list) return;
  if (marketManageFocus && marketUser?.isAdmin && !ownedMarketMods().some((item) => item.id === marketManageFocus)) marketManageScope = 'all';
  const items = managedMarketMods();
  const nodes = [];
  if (marketUser?.isAdmin) {
    const scope = document.createElement('div');
    scope.className = 'shl-manage-bar';
    [['mine', T.marketMine || 'Mine'], ['all', T.marketManageAll || 'All']].forEach(([id, label]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'shl-chip' + (marketManageScope === id ? ' active' : '');
      chip.textContent = label;
      chip.onclick = () => { marketManageScope = id; renderMarketManage(); };
      scope.append(chip);
    });
    nodes.push(scope);
  }
  if (!items.length) {
    const empty = renderMarketEmpty('empty');
    const title = empty.querySelector('.echo-empty-title');
    const hint = empty.querySelector('.echo-empty-hint');
    if (title) title.textContent = T.marketNoManaged || T.marketEmpty;
    if (hint) hint.textContent = T.marketNoManagedHint || '';
    nodes.push(empty);
    list.replaceChildren(...nodes);
    return;
  }
  nodes.push(...items.map((item) => {
    const open = marketManageFocus === item.id;
    const card = document.createElement('article');
    card.className = 'echo-mod-row';
    card.dataset.id = item.id;
    card.style.gridTemplateColumns = 'minmax(0,1fr)';
    card.innerHTML = '<div class="echo-mod-copy"><strong></strong><em data-desc></em></div><div class="echo-mod-row-actions" data-row></div><div data-editor hidden></div>';
    card.querySelector('strong').textContent = marketLocaleText(item, 'name') || item.id;
    card.querySelector('[data-desc]').textContent = item.unlisted ? (T.marketUnlisted || 'Unlisted') : item.id;
    const row = card.querySelector('[data-row]');
    const editor = card.querySelector('[data-editor]');
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'shl-btn shl-btn--sm';
    edit.textContent = open ? (T.close || 'Close') : (T.marketEdit || 'Edit');
    edit.onclick = () => {
      marketManageFocus = open ? '' : item.id;
      renderMarketManage();
    };
    const unlist = document.createElement('button');
    unlist.type = 'button';
    unlist.className = 'shl-btn shl-btn--sm';
    unlist.textContent = item.unlisted ? (T.marketRelist || 'Relist') : (T.marketUnlist || 'Unlist');
    unlist.onclick = async () => {
      unlist.disabled = true;
      try {
        await api('/api/market/unlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: item.id, unlisted: !item.unlisted }) });
        toast(item.unlisted ? (T.marketRelist || 'Relist') : (T.marketUnlist || 'Unlist'), 'success');
        await loadMarket(true);
        showMarketManage(true);
      } catch (error) { toast(error.message, 'error'); }
      unlist.disabled = false;
    };
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'shl-btn shl-btn--sm shl-btn--danger';
    del.textContent = T.marketDelete || 'Delete';
    del.onclick = async () => {
      const name = marketLocaleText(item, 'name') || item.id;
      if (item.channel === 'official' && !window.confirm((T.marketOfficialDeleteConfirm || T.marketDeleteConfirm || '{name}').replace('{name}', name))) return;
      if (!window.confirm((T.marketDeleteConfirm || '{name}').replace('{name}', name))) return;
      del.disabled = true;
      try {
        await api('/api/market/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: item.id }) });
        toast((T.marketDeleted || '{name}').replace('{name}', name), 'success');
        marketManageFocus = '';
        await loadMarket(true);
        showMarketManage(true);
      } catch (error) { toast(error.message, 'error'); }
      del.disabled = false;
    };
    row.append(edit, unlist, del);
    if (open) {
      editor.hidden = false;
      editor.innerHTML = '<textarea data-intro class="echo-config-json" style="min-height:72px;margin:8px 0;width:100%"></textarea><textarea data-readme class="echo-config-json" style="min-height:110px;margin:0 0 8px;width:100%"></textarea>';
      const introBox = editor.querySelector('[data-intro]');
      const readme = editor.querySelector('[data-readme]');
      introBox.value = marketLocaleText(item, 'intro') || marketLocaleText(item, 'description') || '';
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'shl-btn shl-btn--sm shl-btn--primary';
      save.textContent = T.marketSavePage || 'Save';
      save.onclick = async () => {
        save.disabled = true;
        try {
          await api('/api/market/page', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: item.id, intro: introBox.value, introZh: introBox.value, readme: readme.value }) });
          toast(T.marketPageSaved || 'OK', 'success');
          await loadMarket(true);
          showMarketManage(true);
        } catch (error) { toast(error.message, 'error'); }
        save.disabled = false;
      };
      editor.append(save);
      void api('/api/market/mod/' + encodeURIComponent(item.id)).then((val) => { if (val.readme) readme.value = val.readme; }).catch(() => {});
    }
    return card;
  }));
  list.replaceChildren(...nodes);
  if (marketManageFocus) list.querySelector('[data-id="' + String(marketManageFocus).replace(/"/g, '') + '"]')?.scrollIntoView({ block: 'nearest' });
};
const processMarketUpload = async (file) => {
  if (!file || marketBusyId) return;
  if (!marketUser) {
    setMarketLoginOpen(true);
    return;
  }
  marketBusyId = 'upload';
  const dropLabel = marketPanel?.querySelector('[data-upload-label]');
  if (dropLabel) dropLabel.textContent = T.marketUploading || T.installingMarket;
  try {
    const buffer = await file.arrayBuffer();
    const result = await api('/api/market/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: bytesToBase64(new Uint8Array(buffer)), name: file.name }),
    });
    const name = result.mod?.name || result.mod?.id || file.name;
    toast((T.marketUploadedToast || '{name}').replace('{name}', name), 'success');
    marketBusyId = '';
    await loadMarket(true);
  } catch (error) {
    toast(error.message, 'error');
    marketBusyId = '';
  } finally {
    if (dropLabel) dropLabel.textContent = T.marketUploadHint || T.dropHint;
    renderMarketList();
  }
};
const openMarket = async () => {
  if (marketPanel) {
    marketListAnimate = true;
    showPanel(marketPanel, marketButton);
    await loadMarket(false);
    return;
  }
  const filterButton = (value, label, count) => '<button type="button" class="' + (value === 'all' ? 'active' : '') + '" data-market-filter="' + value + '">' + label + '<span class="echo-filter-count" data-count-' + count + '>0</span></button>';
  marketPanel = mountPage('echo-external-mod-panel page-surface', `
    <div class="shl-page echo-mod-page echo-market-page">
      ${mastHtml({
        kicker: T.marketKicker || 'Marketplace',
        title: T.marketTitle || 'Mod Market',
        lede: T.marketHint || '',
        actions: '<input type="file" accept=".echomod,.echo" data-upload-file hidden>'
          + '<div class="shl-account" data-account hidden><span class="shl-avatar" data-avatar></span><span data-account-name></span>'
          + '<button type="button" class="shl-btn shl-btn--ghost" data-logout>' + (T.marketLogout || 'Sign out') + '</button></div>'
          + '<button type="button" class="shl-btn shl-btn--primary" data-open-login>' + iconUser + '<span>' + (T.marketLogin || '账号登录') + '</span></button>'
          + '<button type="button" class="shl-btn" data-action="upload">' + iconUpload + '<span>' + (T.marketUpload || 'Upload') + '</span></button>'
          + '<button type="button" class="shl-btn" data-action="manage" hidden>' + iconLayers + '<span>' + (T.marketManage || 'Manage') + '</span></button>'
          + '<button type="button" class="shl-btn" data-action="refresh">' + iconRefresh + '<span>' + (T.refreshMarket || 'Refresh') + '</span></button>',
      })}
      <div class="echo-market-login-overlay" data-login-overlay hidden>
        <div class="echo-market-login-card">
          <h2>${T.marketLogin || '账号登录'}</h2>
          <p class="echo-config-desc">${T.marketLoginHint || ''}</p>
          <form data-market-login>
            <input data-login-id autocomplete="username" placeholder="${T.marketLoginUser || 'Username'}">
            <input data-login-pass type="password" autocomplete="current-password" placeholder="${T.marketLoginPass || 'Password'}">
            <div class="echo-market-login-actions">
              <a class="shl-btn" data-register href="https://echo.shiinasuki.com/register" target="_blank" rel="noopener">${T.marketRegister || '前往注册'}</a>
              <button class="shl-btn" type="button" data-login-close>${T.close || 'Close'}</button>
              <button class="shl-btn shl-btn--primary" type="submit">${T.marketLogin || '账号登录'}</button>
            </div>
          </form>
        </div>
      </div>
      <div class="shl-market-home" data-market-home>
        <section class="shl-hero" data-hero hidden>
          <div class="shl-hero-slides" data-slides></div>
          <div class="shl-hero-nav">
            <div class="shl-dots" data-dots></div>
            <div class="shl-hero-arrows" data-hero-arrows>
              <button type="button" data-hero-prev aria-label="Previous">${iconChevL}</button>
              <button type="button" data-hero-next aria-label="Next">${iconChevR}</button>
            </div>
          </div>
        </section>
        <div class="shl-toolbar" data-market-chrome>
          <div class="shl-search">
            <span class="echo-search-icon">${iconSearch}</span>
            <input type="search" data-market-search placeholder="${T.searchMarket || T.searchMods}" autocomplete="off" spellcheck="false">
            <button class="echo-search-clear" type="button" data-market-search-clear hidden>${iconCross}</button>
            <div class="echo-search-suggest" data-market-suggest hidden></div>
          </div>
          <div class="shl-seg" data-seg>
            <i class="shl-seg-thumb"></i>
            ${filterButton('all', T.filterAll, 'all')}${filterButton('updates', T.filterUpdates, 'updates')}${filterButton('available', T.filterAvailable, 'available')}${filterButton('installed', T.filterInstalled, 'installed')}
          </div>
        </div>
        <div class="echo-tag-row" data-market-tags></div>
        <section class="shl-section" data-all-wrap>
          <div class="shl-section-head"><h3>${T.marketAllPlugins || '全部插件'}</h3><small data-all-count>00</small></div>
          <div class="echo-mod-list" data-market-list></div>
          <div class="echo-store-pager" data-list-pager></div>
        </section>
        <section class="shl-section" data-random-wrap hidden>
          <div class="shl-section-head">
            <h3>${T.marketRandom || '随机插件'}</h3>
            <button class="shl-btn shl-btn--sm" type="button" data-random-shuffle>${iconDice}<span>${T.marketRandomOnce || '随机一发'}</span></button>
          </div>
          <div class="echo-mod-list" data-random-list></div>
        </section>
        <div class="echo-mod-drop" data-upload-drop data-market-chrome>
          <span class="echo-drop-icon" aria-hidden="true">${iconUpload}</span>
          <span data-upload-label></span>
        </div>
      </div>
      <div class="shl-market-manage" data-market-manage hidden>
        ${mastHtml({
          kicker: T.marketManage || 'Manage',
          title: T.marketManage || 'Manage',
          lede: T.marketManageHint || '',
          actions: '<button type="button" class="shl-btn" data-manage-back>' + iconChevL + '<span>' + (T.marketManageBack || 'Back') + '</span></button>',
        })}
        <div class="echo-mod-list" data-manage-list></div>
      </div>
    </div>
  `);
  bindSpotlight(marketPanel);
  marketPanel.querySelectorAll('[data-seg]').forEach(watchSeg);
  marketListAnimate = true;
  showPanel(marketPanel, marketButton);
  const searchInput = marketPanel.querySelector('[data-market-search]');
  const searchClear = marketPanel.querySelector('[data-market-search-clear]');
  const dropLabel = marketPanel.querySelector('[data-upload-label]');
  const fileInput = marketPanel.querySelector('[data-upload-file]');
  const dropzone = marketPanel.querySelector('[data-upload-drop]');
  dropLabel.textContent = T.marketUploadHint || T.dropHint;
  searchInput.value = marketSearchQuery;
  searchClear.hidden = !marketSearchQuery;
  searchInput.oninput = () => {
    marketSearchQuery = searchInput.value;
    searchClear.hidden = !marketSearchQuery;
    marketListPage = 1;
    marketRecPage = 1;
    renderMarketList();
  };
  searchInput.onfocus = () => renderMarketSuggest();
  searchInput.onblur = () => window.setTimeout(() => {
    const box = marketPanel?.querySelector('[data-market-suggest]');
    if (box) box.hidden = true;
  }, 180);
  searchClear.onclick = () => {
    searchInput.value = '';
    marketSearchQuery = '';
    searchClear.hidden = true;
    marketListPage = 1;
    marketRecPage = 1;
    searchInput.focus();
    renderMarketList();
  };
  marketPanel.querySelectorAll('[data-market-filter]').forEach((chip) => {
    chip.onclick = () => {
      marketFilter = chip.dataset.marketFilter;
      marketListPage = 1;
      marketRecPage = 1;
      syncMarketToolbar();
      renderMarketList();
    };
  });
  const hero = marketPanel.querySelector('[data-hero]');
  marketPanel.querySelector('[data-hero-prev]').onclick = () => setHeroSlide(hero, marketHeroIndex - 1, true);
  marketPanel.querySelector('[data-hero-next]').onclick = () => setHeroSlide(hero, marketHeroIndex + 1, true);
  const refreshButton = marketPanel.querySelector('[data-action="refresh"]');
  refreshButton.onclick = () => void loadMarket(true);
  marketPanel.querySelector('[data-random-shuffle]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    button.classList.remove('is-rolling');
    void button.offsetWidth;
    button.classList.add('is-rolling');
    marketRandomPick = shuffleMarketMods(MARKET_RANDOM_COUNT);
    renderMarketList();
  });
  marketPanel.querySelector('[data-action="manage"]').onclick = () => showMarketManage(true);
  marketPanel.querySelector('[data-manage-back]').onclick = () => showMarketManage(false);
  marketPanel.querySelector('[data-open-login]').onclick = () => setMarketLoginOpen(true);
  marketPanel.querySelector('[data-login-close]').onclick = () => setMarketLoginOpen(false);
  marketPanel.querySelector('[data-login-overlay]').onclick = (event) => {
    if (event.target === event.currentTarget) setMarketLoginOpen(false);
  };
  marketPanel.querySelector('[data-market-login]').onsubmit = async (event) => {
    event.preventDefault();
    try {
      const result = await api('/api/market/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identification: marketPanel.querySelector('[data-login-id]').value,
          password: marketPanel.querySelector('[data-login-pass]').value,
        }),
      });
      marketUser = result.user || null;
      marketPanel.querySelector('[data-login-pass]').value = '';
      setMarketLoginOpen(false);
      toast((T.marketLoggedIn || '{name}').replace('{name}', marketUser?.displayName || marketUser?.username || ''), 'success');
      await loadMarket(true);
    } catch (error) {
      toast(error.message, 'error');
    }
  };
  marketPanel.querySelector('[data-logout]').onclick = async () => {
    try { await api('/api/market/logout', { method: 'POST' }); } catch {}
    marketUser = null;
    await loadMarket(true);
  };
  const needMarketLogin = () => {
    if (marketUser) return false;
    setMarketLoginOpen(true);
    return true;
  };
  marketPanel.querySelector('[data-action="upload"]').onclick = () => {
    if (needMarketLogin()) return;
    fileInput.click();
  };
  dropzone.onclick = () => {
    if (needMarketLogin()) return;
    fileInput.click();
  };
  fileInput.onchange = () => { const file = fileInput.files?.[0]; if (file) processMarketUpload(file); fileInput.value = ''; };
  dropzone.ondragover = (event) => { event.preventDefault(); if (!marketUser) return; dropzone.classList.add('is-over'); };
  dropzone.ondragleave = (event) => { if (dropzone.contains(event.relatedTarget)) return; dropzone.classList.remove('is-over'); };
  dropzone.ondrop = (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-over');
    if (needMarketLogin()) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) processMarketUpload(file);
  };
  applyUiSettings();
  await loadMarket(true);
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
  void page.offsetHeight;
  releasePanelEntrance(page);
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

const hiddenSidebarStash = () => {
  let stash = document.getElementById('echo-hidden-sidebar-stash');
  if (!stash) {
    stash = document.createElement('div');
    stash.id = 'echo-hidden-sidebar-stash';
    stash.hidden = true;
    stash.style.display = 'none';
    document.body.append(stash);
  }
  return stash;
};

const renderSidebarButtons = () => {
  const nav = ensureLoaderGroup();
  if (!nav) return false;
  ensureLoaderButtons(nav);
  for (const [id, button] of sidebarButtons) if (!sidebarEntries.has(id)) { button.remove(); sidebarButtons.delete(id); }
  const entries = [...sidebarEntries.values()].sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0) || String(left.label || '').localeCompare(String(right.label || '')));
  const visible = [];
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
    const iconShell = button.querySelector('.nav-icon-shell');
    const icon = entry.icon || '◇';
    if (typeof icon === 'string' && icon.includes('<svg')) iconShell.innerHTML = icon;
    else iconShell.textContent = icon;
    button.querySelector('.nav-item-label').textContent = entry.label || entry.id;
    button.setAttribute('aria-label', entry.label || entry.id);
    button.title = entry.label || entry.id;
    if (entry.hidden) hiddenSidebarStash().append(button);
    else visible.push(button);
  }
  const rail = [loaderButton, marketButton, modsButton, ...visible].filter(Boolean);
  for (let index = rail.length - 1; index >= 0; index -= 1) {
    const button = rail[index];
    const before = rail[index + 1] || null;
    if (button.parentElement !== nav || button.nextElementSibling !== before) nav.insertBefore(button, before);
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
    hidden: spec.hidden === true,
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
    previous.hidden = entry.hidden;
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

const disclaimerPhrase = () => {
  if (typeof DISCLAIMER_CONSENT_PHRASE === 'string' && DISCLAIMER_CONSENT_PHRASE) return DISCLAIMER_CONSENT_PHRASE;
  return T.disclaimerConsentPhrase || '我同意';
};

const dismissDisclaimerOverlay = () => {
  const el = disclaimerOverlay;
  disclaimerOverlay = null;
  if (!el?.isConnected) return;
  if (reduceMotion() || uiSettings.animations === false) {
    el.remove();
    return;
  }
  el.classList.add('is-leaving');
  window.setTimeout(() => el.remove(), 200);
};

const syncDisclaimerConfirm = () => {
  if (!disclaimerOverlay) return;
  const input = disclaimerOverlay.querySelector('[data-disclaimer-input]');
  const confirm = disclaimerOverlay.querySelector('[data-disclaimer-confirm]');
  if (!input || !confirm) return;
  confirm.disabled = String(input.value || '').trim() !== disclaimerPhrase();
};

const submitDisclaimer = async () => {
  if (!disclaimerOverlay || disclaimerBusy) return;
  const input = disclaimerOverlay.querySelector('[data-disclaimer-input]');
  const error = disclaimerOverlay.querySelector('[data-disclaimer-error]');
  const confirm = disclaimerOverlay.querySelector('[data-disclaimer-confirm]');
  const consent = String(input?.value || '').trim();
  if (consent !== disclaimerPhrase()) {
    if (error) error.textContent = T.disclaimerMismatch || '请准确输入「我同意」';
    input?.focus?.();
    input?.select?.();
    syncDisclaimerConfirm();
    return;
  }
  disclaimerBusy = true;
  if (confirm) confirm.disabled = true;
  if (error) error.textContent = '';
  // Persist locally first so a dead Loader API cannot trap the user on this gate.
  writeLocalDisclaimerAccepted();
  disclaimerAccepted = true;
  try {
    await api('/api/disclaimer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ consent }),
    });
  } catch {
    // Loader may have exited after injection; local acceptance is enough to continue.
  } finally {
    disclaimerBusy = false;
  }
  dismissDisclaimerOverlay();
  maybeShowSteamLaunchReminder();
};

const showDisclaimerOverlay = () => {
  if (disclaimerAccepted || disclaimerOverlay?.isConnected) return;
  document.querySelectorAll('.echo-disclaimer-overlay').forEach((node) => node.remove());
  const el = document.createElement('div');
  el.className = 'echo-disclaimer-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'echo-disclaimer-title');
  el.innerHTML = [
    '<section class="echo-disclaimer-card">',
    '<header>',
    '<span class="echo-disclaimer-icon" aria-hidden="true">' + iconWarn + '</span>',
    '<div class="echo-disclaimer-heading">',
    '<span class="echo-disclaimer-kicker"></span>',
    '<strong id="echo-disclaimer-title"></strong>',
    '</div>',
    '</header>',
    '<div class="echo-disclaimer-body">',
    '<p class="echo-disclaimer-intro" data-disclaimer-intro></p>',
    '<ol class="echo-disclaimer-rules" data-disclaimer-rules></ol>',
    '<p class="echo-disclaimer-hint" data-disclaimer-hint></p>',
    '<div class="echo-disclaimer-field">',
    '<label for="echo-disclaimer-input"></label>',
    '<input id="echo-disclaimer-input" type="text" autocomplete="off" spellcheck="false" data-disclaimer-input />',
    '</div>',
    '<p class="echo-disclaimer-error" data-disclaimer-error></p>',
    '</div>',
    '<footer>',
    '<button class="shl-btn shl-btn--primary" type="button" data-disclaimer-confirm disabled></button>',
    '</footer>',
    '</section>',
  ].join('');
  el.querySelector('.echo-disclaimer-kicker').textContent = T.disclaimerKicker || '使用前须知';
  el.querySelector('#echo-disclaimer-title').textContent = T.disclaimerTitle || '免责声明';
  const intro = Array.isArray(T.disclaimerRules) && T.disclaimerIntro
    ? T.disclaimerIntro
    : (T.disclaimerBody || '');
  el.querySelector('[data-disclaimer-intro]').textContent = intro;
  const rulesRoot = el.querySelector('[data-disclaimer-rules]');
  const rules = Array.isArray(T.disclaimerRules) ? T.disclaimerRules : [];
  if (rules.length) {
    rules.forEach((rule, index) => {
      const item = document.createElement('li');
      item.dataset.index = String(index + 1).padStart(2, '0');
      item.textContent = String(rule || '');
      rulesRoot.append(item);
    });
  } else {
    rulesRoot.remove();
  }
  el.querySelector('[data-disclaimer-hint]').textContent = T.disclaimerHint || '';
  const label = el.querySelector('.echo-disclaimer-field label');
  const phrase = disclaimerPhrase();
  label.textContent = phrase;
  const input = el.querySelector('[data-disclaimer-input]');
  input.placeholder = T.disclaimerPlaceholder || phrase;
  const confirm = el.querySelector('[data-disclaimer-confirm]');
  confirm.textContent = T.disclaimerConfirm || '继续';
  input.addEventListener('input', () => {
    const errorNode = el.querySelector('[data-disclaimer-error]');
    if (errorNode) errorNode.textContent = '';
    syncDisclaimerConfirm();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitDisclaimer();
    }
  });
  confirm.addEventListener('click', () => void submitDisclaimer());
  // Block backdrop clicks / Esc from dismissing — consent is required.
  el.addEventListener('mousedown', (event) => {
    if (event.target === el) {
      event.preventDefault();
      input.focus();
    }
  });
  document.body.append(el);
  disclaimerOverlay = el;
  syncDisclaimerConfirm();
  window.setTimeout(() => input.focus(), 40);
};

const maybeShowDisclaimer = () => {
  if (disclaimerAccepted) return;
  if (!document.querySelector('.app-shell')) return;
  showDisclaimerOverlay();
};

const ensure = () => {
  if (splashActive()) return false;
  ensureLegacyThemeVars();
  observeSurfaces();
  attachPanel(loaderPanel);
  attachPanel(modsPanel);
  attachPanel(marketPanel);
  sidebarPages.forEach((page) => attachPanel(page));
  const nav = ensureLoaderGroup();
  if (!nav) return false;
  ensureLoaderButtons(nav);
  renderSidebarButtons();
  maybeShowSteamLaunchReminder();
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
// Capture on window so this runs ahead of ECHO's document handlers and of any
// listener a previous UI instance failed to remove.
const onNavControlClick = (event) => {
  const control = event.target?.closest?.('.nav-item, .titlebar-action');
  if (!control) return;
  if (control.dataset.echoExternalSidebar || control.dataset.echoExternalLoader || control.dataset.echoExternalMods || control.dataset.echoExternalMarket) return;
  // ECHO route controls toggle away from their page when it is already the
  // current route. Our pages never change ECHO's route, so with one open a
  // click on the active control means "back to that page": swallow it and
  // restore the surface we hid instead of letting ECHO toggle to the previous
  // route. Drawer triggers (data-drawer-trigger) never route; leave them alone.
  if (loaderPageActive() && control.dataset.active === 'true' && control.dataset.drawerTrigger !== 'true'
    && document.querySelector('.page-surface[data-echo-external-hidden="true"]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeSidebarPage();
    return;
  }
  if (control.classList.contains('nav-item') && control !== activeNav) closeSidebarPage();
};
window.addEventListener('click', onNavControlClick, true);

window.__echoExternalLoaderUi = {
  version: 63,
  registerSidebar,
  unregisterSidebar: removeSidebar,
  uiSettings: () => ({ ...uiSettings }),
  setUiSettings: (patch) => saveUiSettings(patch),
  dispose: () => {
    observer.disconnect();
    surfaceObserver.disconnect();
    window.removeEventListener('click', onNavControlClick, true);
    window.clearTimeout(ensureTimer);
    window.clearTimeout(configModalTimer);
    window.clearTimeout(searchTimer);
    window.clearTimeout(steamCopyTimer);
    window.clearInterval(statusTimer);
    window.clearInterval(consoleTimer);
    document.querySelectorAll('.echo-inject-popup, .echo-disclaimer-overlay, .echo-steam-reminder, .echo-toast-stack, .echo-toast').forEach((node) => node.remove());
    disclaimerOverlay = null;
    steamReminderEl = null;
    toastStack = null;
    steamCopyTimer = 0;
    nativeRouteEvents.forEach((eventName) => window.removeEventListener(eventName, onNativeRoute));
    modsPanel?.remove();
    marketPanel?.remove();
    marketDetailEl?.remove();
    loaderPanel?.remove();
    try { configModalCleanup?.(); } catch {}
    configModalCleanup = null;
    configModal?.remove();
    css.remove();
    document.documentElement.removeAttribute('data-shl-hide-titlebar-brand');
    accentCss.remove();
    motionCss.remove();
    segObserver?.disconnect();
    legacyThemeBridge?.remove();
    loaderGroup?.remove();
    document.getElementById('echo-hidden-sidebar-stash')?.remove();
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
