// Shinawase Testing SDK - mirrored public contract constants.
//
// The testing SDK never imports ShinawaseLoader.mjs (importing it has side
// effects: it reads config, parses argv, and starts the CLI). The small set of
// loader behaviors the SDK must agree with is mirrored here instead, each with
// a provenance note. tests/contract-sync.test.mjs asserts the mirrored
// literals are still present in ShinawaseLoader.mjs so drift fails a test run
// instead of silently desynchronizing.

import { normalize } from 'node:path';

export const testingSdkVersion = 1;

// ShinawaseLoader.mjs safeId(): package id shape.
export const SAFE_ID_SOURCE = '^[a-z0-9][a-z0-9._-]{1,63}$';
export const SAFE_ID_PATTERN = new RegExp(SAFE_ID_SOURCE, 'iu');
export const isSafeId = (id) => typeof id === 'string' && SAFE_ID_PATTERN.test(id);

// ShinawaseLoader.mjs safeRelative(): package-relative path rules. The mirror
// converts backslashes to '/' before normalize() (the loader converts after):
// on POSIX, normalize() treats '\' as an ordinary character, so pre-converting
// makes 'a\..\..\x' resolve and get rejected exactly as the Windows-only
// loader rejects it. Same verdicts on Windows; loader-side fix is a separate PR.
export const safeRelative = (value) => {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('invalid_mod_file');
  const clean = normalize(value.replaceAll('\\', '/')).replaceAll('\\', '/');
  if (clean === '.' || clean.startsWith('../') || clean === '..' || clean.startsWith('/') || /^[a-z]:/iu.test(clean)) throw new Error('invalid_mod_file');
  return clean;
};

// ShinawaseLoader.mjs manifestNames / packageTypes / packageExtensions /
// maxPackageBytes / packageKind().
export const MANIFEST_NAMES = ['echo.mod.json', 'echo.plugin.json', 'manifest.json'];
export const PACKAGE_TYPES = new Set(['echo-external-mod', 'echo-plugin-package', 'echo-next-plugin-package', 'echo-workshop-item']);
export const PACKAGE_EXTENSIONS = new Set(['.echomod', '.echo']);
export const MAX_PACKAGE_BYTES = 512 * 1024 * 1024;
export const packageKind = (type) => type === 'echo-plugin-package' || type === 'echo-next-plugin-package' ? 'plugin' : 'mod';

// scripts/pack-echomod.mjs maxFiles / maxBytes: the packer refuses larger
// packages, so validation warns before authors hit it. The loader itself
// accepts up to MAX_PACKAGE_BYTES, but pack-mod.bat stops at 128 MB.
export const PACKER_MAX_FILES = 512;
export const PACKER_MAX_BYTES = 128 * 1024 * 1024;

// ShinawaseLoader.mjs defaultPort / defaultDebugPort / inspectPort defaults.
export const DEFAULT_LOADER_PORT = 17862;
export const DEFAULT_CDP_PORT = 9229;
export const DEFAULT_INSPECT_PORT = 9230;

// ShinawaseLoader.mjs readRequest(): the HTTP API rejects bodies above this,
// which bounds what POST /api/import can carry (base64 inflates by 4/3).
export const MAX_REQUEST_BYTES = 64 * 1024 * 1024;

// ShinawaseLoader.mjs iconMime keys.
export const ICON_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico']);

// Renderer globals installed by the loader (loader-ui.js and the runtime
// expressions in ShinawaseLoader.mjs).
export const EXTERNAL_MODS_GLOBAL = '__echoExternalMods';
export const LOADER_UI_GLOBAL = '__echoExternalLoaderUi';
export const PLAYER_GLOBAL = '__echoExternalPlayer';
export const EXTEND_GLOBAL = '__echoExternalExtend';

// Minimum runtime versions the injection cycle expects (ShinawaseLoader.mjs
// injectEnabled(): uiVersion < 59, playerVersion < 1, extendVersion < 1).
export const MIN_UI_VERSION = 59;
export const MIN_PLAYER_VERSION = 1;
export const MIN_EXTEND_VERSION = 1;

// ShinawaseLoader.mjs injectIntoTarget(): per-package browser storage key.
export const settingsStorageKey = (id) => `echo.external-mod.${id}`;

// ShinawaseLoader.mjs injectIntoTarget() publicEchoPath(): path segment rules
// for sdk.list/get/call.
export const SDK_PATH_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
export const SDK_BLOCKED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

// ShinawaseLoader.mjs extendRuntimeExpression blocked set for hook paths.
export const EXTEND_BLOCKED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']);

// ShinawaseLoader.mjs externalContext(): the ctx object embedded into the
// injected wrapper.
export const externalContext = (id, manifest, config, baseUrl) => ({ id, manifest, config, baseUrl });

// ShinawaseLoader.mjs injectIntoTarget(): entries run as
// `(async function(echoExternalMod, console) { source })`, so top-level
// `return` and `await` are legal in package entries.
export const ENTRY_WRAPPER_PARAMS = ['echoExternalMod', 'console'];
export const wrapEntryExpression = (source) => `(async function(echoExternalMod, console) {\n${source}\n})`;

// SDK.md "Custom config UI": configUi scripts run as an async function whose
// only argument is echoConfigUi.
export const CONFIG_UI_WRAPPER_PARAMS = ['echoConfigUi'];
export const wrapConfigUiExpression = (source) => `(async function(echoConfigUi) {\n${source}\n})`;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Compile-only syntax check in the loader's exact wrapper shape. Never
// executes the source. Throws SyntaxError on invalid entries.
export const compileEntry = (source) => AsyncFunction(...ENTRY_WRAPPER_PARAMS, String(source ?? ''));
export const compileConfigUi = (source) => AsyncFunction(...CONFIG_UI_WRAPPER_PARAMS, String(source ?? ''));

// ShinawaseLoader.mjs modEntrySource(): html/css entries are converted to a
// generated JavaScript entry before wrapping.
export const buildEntrySource = (id, manifest, entryPath, source) => {
  const extension = String(entryPath || '').toLowerCase().match(/\.[a-z0-9]+$/u)?.[0] || '';
  if (manifest.entryType === 'html' || extension === '.html' || extension === '.htm') {
    return `echoExternalMod.sidebar.register({ label: ${JSON.stringify(manifest.name || id)}, order: ${Number(manifest.sidebarOrder) || 50}, html: ${JSON.stringify(source)} });`;
  }
  if (manifest.entryType === 'css' || extension === '.css') {
    return `const style = document.createElement('style'); style.dataset.echoExternalMod = ${JSON.stringify(id)}; style.textContent = ${JSON.stringify(source)}; document.head.append(style); return () => style.remove();`;
  }
  return source;
};

// ShinawaseLoader.mjs classifyEchoWindow(): the loader injects Main windows
// only; the live client must select the same target.
export const classifyEchoWindow = (url = '', title = '') => {
  const href = String(url || '');
  const name = String(title || '');
  if (/[?&]desktopLyrics=1/i.test(href) || /ECHO Desktop Lyrics/i.test(name)) return 'DesktopLyrics';
  if (/[?&]taskbarMiniPlayer=1/i.test(href) || /Taskbar Mini Player/i.test(name)) return 'TaskbarMiniPlayer';
  if (/[?&]miniPlayer=1/i.test(href) || /ECHO Mini Player/i.test(name)) return 'MiniPlayer';
  if (/[?&]pet=1/i.test(href) || /^ECHO Pet$/i.test(name)) return 'Pet';
  if (/[?&]cli=1/i.test(href) || /ECHO CLI/i.test(name)) return 'Cli';
  if (/ECHO (?:Debug |Developer )?Console/i.test(name) || /调试控制台/i.test(name) || /^DevConsole$/i.test(name)) return 'DevConsole';
  if (/auxiliary\.html/i.test(href)) return 'Auxiliary';
  return 'Main';
};

// ShinawaseLoader.mjs targetProbeExpression: readiness + injected-mod state,
// evaluated in the renderer. Read-only (the streaming echo patch the loader
// applies in its own probe is intentionally not mirrored here).
export const rendererProbeExpression = `(() => {
  const splash = document.querySelector('.echo-startup-shell');
  const startupReady = !splash || document.documentElement.dataset.echoStartup === 'ready';
  return {
    ready: startupReady && Boolean(document.querySelector('.app-shell')),
    title: String(document.title || ''),
    route: document.querySelector('.page-surface[data-route-id]:not([hidden])')?.getAttribute('data-route-id') || null,
    uiVersion: Number(window.__echoExternalLoaderUi?.version || 0),
    playerVersion: Number(window.__echoExternalPlayer?.version || 0),
    extendVersion: Number(window.__echoExternalExtend?.version || 0),
    mods: Object.fromEntries(Object.entries(window.__echoExternalMods || {}).map(([id, value]) => [id, String(value?.signature || '').slice(0, 64)])),
    viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 },
  };
})()`;

// ShinawaseLoader.mjs loader-ui asset route shape (assetUrl in the injected
// bridge): GET /api/mod/:id/file/:path.
export const assetUrlPath = (id, filePath) => '/api/mod/' + encodeURIComponent(id) + '/file/' + encodeURIComponent(String(filePath || '').replaceAll('\\', '/'));

// ShinawaseLoader.mjs defaultUiSettings: loader appearance settings surface
// exposed to mods through loaderSettings.
export const DEFAULT_UI_SETTINGS = Object.freeze({
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
});

// SDK.md "echo-steam 26.9.1 alignment": window.echo namespaces observed on the
// aligned host. Method shapes are intentionally not frozen (SDK.md tells mods
// to discover them at runtime), so the harness only guarantees the namespaces
// plus the two methods the loader itself relies on.
export const ECHO_NAMESPACES = ['steam', 'workshop', 'app', 'desktopLyrics', 'miniPlayer', 'pet', 'library', 'playback', 'streaming', 'lyrics', 'mv', 'accounts'];
