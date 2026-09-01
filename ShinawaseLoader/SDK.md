# ShinawaseLoader SDK

ShinawaseLoader uses external Chrome DevTools Protocol injection. It does not require an `app.asar` patch for normal operation.

## Runtime object

Each external Mod or Plugin receives `echoExternalMod`:

- `manifest`, `config`: package metadata and editable JSON configuration.
- `echo`: ECHO's public renderer bridge (`window.echo`). Use this for playback, library, queue, settings, and other APIs exposed by the running ECHO build.
- `player`: ShinawaseLoader's independently mounted player runtime (`window.__echoExternalPlayer`). It binds to ECHO's public playback API and queue. Use `player.status/play/pause/stop/seek/next/previous/playTrack/append/replaceQueue`. The same surface is also at `GET/POST /api/player`.
- `extend`: independently mounted renderer extension runtime (`window.__echoExternalExtend`). Use it to inject CSS, wrap public `window.echo` methods, listen to app events, hide native nav items, or replace a native route with a Mod page. Disablers returned by `css/hook/on/replaceRoute/hideNav/hide/observe` run automatically when the package is disabled.
- `main`: in-process Electron main-process RPC. A package `main` script (for example `main.cjs`) runs inside ECHO after the asar-bridge starts `native-host.cjs`. Use `main.invoke(method, payload)` from the renderer.
- `native`: in-process native host. Declared `.node` addons and host DLLs are loaded inside ECHO, not by remote process injection. Use `native.status/modules/invoke`. Current-process memory helpers (`scan`, `read`/`write`/`protect`, typed readers) require `native.memory: true` plus `nativeMemoryApi`.
- `sdk.status()`: Loader runtime status. `sdk.list(path)`, `sdk.get(path)`, and `sdk.call(path, ...args)` discover and call public `window.echo` paths without hard-coding a specific ECHO version.
- `settings.get()` / `settings.set(patch)`: per-package browser storage.
- `loaderSettings.get()` / `loaderSettings.set(patch)` / `loaderSettings.onChange(handler)`: the loader's shared appearance settings (accent color, density, card layout, badge visibility). `set` applies live when the loader UI is mounted; changes fire the `shinawase:ui-settings` window event. `onChange` disposers run automatically when the package is disabled.
- `assetUrl(path)` / `loadAsset(path, options)`: serve packaged HTML, CSS, images, WASM, or data assets.
- `sidebar.register({ id, label, icon, order, render })`: add a page in the ShinawaseLoader sidebar group.
- `fetchJson(url, options)`, `uploadFile(input)`: Loader-mediated HTTP helpers.
- `toast(message)`, `console.debug/info/warn/error`, `log(...)`: user feedback and Logs output.

`GET /api/sdk` reports the `window.echo` namespaces available in the current ECHO build. `GET /api/status` reports active launch mode, performance settings, folder locations, and the aligned Echo target (`echoTarget`, including `runtime` fingerprint vs the live Steam asar). `GET /api/runtime` / `POST /api/runtime/sync` inspect or force-refresh the isolated Mod runtime after a Steam update.

Use `echo-external-mod.d.ts` for editor hints in JavaScript or TypeScript projects. The external SDK tracks the public bridge present in the installed build; it intentionally does not depend on ECHO's built-in plugin runtime.

## echo-steam 26.9.1 alignment

Current verified host: **echo-steam 26.9.1** at `...\steamapps\common\ECHO\ECHO.exe` (also recognizes `ECHO Steam.exe`). Electron **43.3.0**, Chromium 150.0.7871.212, Steam AppId **5105150**, Workshop SDK **1.15.0** (`native-shell` kind). The isolated Mod runtime (`ShinawaseLoader/modded-runtime`) is fingerprinted against the live Steam `app.asar` / `ECHO.exe`; Steam updates trigger `runtime-sync.mjs` on the next launch.

- **userData**: `%APPDATA%\ECHO Steam`. Honor `ECHO_USER_DATA_PATH_OVERRIDE` when set. Do not treat leftover `%APPDATA%\ECHO NEXT` as the Steam edition store.
- **Window kinds** (Electron names `MainWindow` / `DesktopLyrics` / `MiniPlayer` / `TaskbarMiniPlayer` / `Pet` / `Cli` / `DevConsole`). The loader classifies the main renderer as `Main` and injects only that surface.
- **`window.echo` namespaces** observed on this build: `steam`, `workshop`, `app`, `desktopLyrics`, `miniPlayer`, `pet`, `library`, `playback`, `streaming`, `lyrics`, `mv`, `accounts`. Method names are **not** frozen here — call `sdk.list(path)` / `sdk.get(path)` / `GET /api/sdk` at runtime. The loader itself uses `echo.app.getSettings` / `echo.app.setSettings` and `echo.playback.getStatus` when present.
- **Custom protocols** (asset / media URL schemes, not `window.echo` methods): `echo-cover`, `echo-audio`, `echo-video`, `echo-mv`, `echo-wallpaper`, `echo-image`, `echo-artist-image`, `echo-album-extra`, `echo-workshop`, `echo-osu-sb`.
- **Audio backend contract**: `audioBackendContractVersion = 2` on this host. That is the host audio-backend contract, not an Electron ABI.

## Renderer extension

`echoExternalMod.extend` can reshape the running ECHO window without touching `ECHO.exe` or `app.asar`:

```js
echoExternalMod.extend.css('theme', '.player-bar { opacity: 0.96; }');
echoExternalMod.extend.hideNav('workshop');
echoExternalMod.extend.hook('playback.pause', async (original) => {
  echoExternalMod.log('pause intercepted');
  return original();
});
echoExternalMod.extend.replaceRoute('community', {
  render(root) {
    root.innerHTML = '<h1>Community replaced by a Mod</h1>';
  },
});
```

`GET /api/sdk` reports `extend.version`, `native`, and `main` when those runtimes are available.

## Loader UI settings

The Loader page has an Appearance section. Every option persists in `loader.config.json` under `ui` and applies immediately without reinjection:

| Key | Values | Effect |
| --- | --- | --- |
| `density` | `comfortable` (default), `compact` | Spacing and control sizes on loader-owned pages. |
| `accentColor` | `''` (default) or `#rrggbb` | Overrides `--theme-accent` on loader-owned surfaces only; empty follows the ECHO theme. |
| `animations` | `true` (default), `false` | Loader UI animations and transitions. |
| `cardLayout` | `list` (default), `grid` | Mods page card arrangement. |
| `showModDescriptions` | `true` (default), `false` | Description line on mod cards. |
| `showModVersions` | `true` (default), `false` | Version badge on mod cards. |
| `showModIds` | `true` (default), `false` | Package-id badge on mod cards. |
| `rememberFilters` | `true` (default), `false` | Persist the Mods page filter chip and sort order across sessions. |
| `modSort` | `name` (default), `recent`, `enabled` | Mods page sort: by name, by install time, or enabled first. |
| `modFilter` | `all` (default), `active`, `inactive` | Last selected filter chip (used when `rememberFilters` is on). |

HTTP surface:

- `GET /api/ui-settings` returns `{ ui, defaults }`.
- `PUT /api/ui-settings` merges a partial `{ ui: { ... } }` (or a bare settings object), sanitizes it, persists it, and returns the result.
- `GET /api/settings/export` returns a `shinawase-loader-settings` document with the full `loader.config.json` surface plus `locale` and `ui`. The Appearance section's Export button downloads it as JSON.
- `POST /api/settings/import` accepts an exported document (or a bare `settings` object). `ui`, `locale`, and `debugMode` apply live; other keys (ports, load mode, injection timings, native host) are written to `loader.config.json` and reported in `requiresRestart`.

Mods read the same settings through `echoExternalMod.loaderSettings` and can subscribe via `loaderSettings.onChange(handler)` or the `shinawase:ui-settings` window event, for example to match a custom page to the user's accent color or density.

## echo-steam renderer notes

echo-steam 26.9.1 (the current Steam renderer; older docs called this "ECHO Next") reshaped the UI. The loader adapts automatically, but mod authors should know:

- **Sidebar**: the grouped sidebar (`.sidebar-groups` / `.sidebar-group-label`) was replaced by a flat `aside.sidebar` with a main `nav.nav-list`, a `.sidebar-spacer`, and a `nav.nav-list.utility-nav`. `sidebar.register(...)` keeps working; the loader injects its group into either shape.
- **`extend.hideNav(routeId)`**: the Steam renderer removed the per-route `[data-workshop-icon]` markers, so CSS hiding no longer matches. The loader additionally patches the native `sidebarHiddenRouteIds` app setting (via `window.echo.app.setSettings`) and restores it on `showNav` / cleanup. Route ids follow the current sidebar ids (`home`, `songs`, `streaming`, `queue`, `playlists`, `plugins`, `settings`, ...).
- **Route surfaces**: `.page-surface[data-route-id]`, `app:navigate:*` events, and `extend.replaceRoute` are unchanged.
- **Theme variables**: the Steam renderer removed `--theme-accent`, `--theme-code-bg`, `--theme-border`, `--theme-card-bg`, `--theme-card-border`, `--theme-hover-bg`, and `--theme-surface`. The loader bridges these to the new tokens (`--theme-accent-solid-bg`, `--theme-field-bg`, `--theme-panel-border(-strong)`, `--theme-panel-bg`, `--theme-list-row-bg-hover`, `--color-surface`) at runtime, but new CSS should target the new token names directly.
- **Official plugins**: ECHO ships its own sandboxed plugin system (`%APPDATA%\ECHO Steam\plugins\<id>\echo.plugin.json` + `plugin.js`, packaged as JSON `.echo` files with `"type": "echo-next-plugin-package"`). Those plugins use the sandboxed `echo` plugin API (`echo.commands`, `echo.net`, ...), not `echoExternalMod`, and are best imported through ECHO's own Plugins page (`window.echo.plugins.importPackage` when that path exists — confirm with `sdk.list('plugins')`). ShinawaseLoader packages keep using `echo.mod.json` / ShinawaseLoader `echo.plugin.json` manifests with the `echoExternalMod` SDK.

## Package locations

- `Mods/`: Mod drop folder; installed Mods live in `Mods/installed`.
- `Plugins/`: Plugin drop folder; installed Plugins live in `Plugins/installed`.
- `ShinawaseLoader/Logs/loader.log`: runtime and package logs.
- `ShinawaseLoader/Logs/errors.log`: errors only.

## Native code

ECHO's official plugin VM stays sandboxed and cannot touch Node, Electron, or the audio host. ShinawaseLoader's community native host is the authorized extension path for complete ECHO modification. It is loaded by the existing `app-asar-bridge` inside ECHO's Electron main process. That is in-process plugin loading, not remote `CreateRemoteThread` injection into an unrelated process.

The Loader prefers a non-asar path: when it launches ECHO it passes `--inspect` and evaluates `main-bootstrap.cjs` in the Electron main process. That registers the official streaming/account IPC, `session.registerPreloadScript(streaming-preload.cjs)` (falls back to `setPreloads` on older Electron), and the native host. Isolated `ECHO.modded.exe` and the optional asar-bridge remain available. Safe mode and `--no-native-host` turn native loading off.

Workshop items of kind `native-shell` (`echo.workshop.json` + `native-shell.json`) are installed as Mods. The loader host in `native-shell-host.cjs` spawns the packaged Windows exe (`--pipe <name>`, stdio ignored) and speaks protocol v1. A package can also set `nativeShell` on `echo.mod.json`; when that field is present the built-in host runs and `main.cjs` is not loaded.

A package may declare:

```json
{
  "main": "main.cjs",
  "native": {
    "memory": true,
    "modules": [
      { "kind": "node-addon", "entry": "native/addon.node" },
      { "kind": "host-dll", "entry": "native/plugin.dll", "export": "EchoNative_Init", "invoke": "EchoNative_Invoke" }
    ]
  }
}
```

- `main.cjs` receives a host with `electron`, `ipcMain`, `hookIpc`, `overlay.file`, `handle`, and `broadcast`.
- `host-dll` modules must export `EchoNative_Init`. See `native/echo_native.h`.
- Build the loader host addon with `.\scripts\build-native-host.ps1` so ECHO can load those DLLs. Copy `ShinawaseLoader/native-plugin-template` for a complete example.
- `echoExternalMod.native.read/write/protect` only operate on the current ECHO process and only for packages that set `native.memory`. They exist so native audio-host / DSP hook development can inspect ECHO's own modules. They do not open other processes.

`GET /api/native/status`, `POST /api/native/call`, and `POST /api/native/reload` proxy the in-process host. If the asar-bridge is not installed, those endpoints report `native_host_unavailable`.

Separately launched loopback helpers remain valid when a package does not need to live inside ECHO.

## Native memory & DLL development

Enable current-process memory APIs with `native.memory: true` in the package manifest (and leave `nativeMemoryApi` on in `loader.config.json`). Then `echoExternalMod.native` can inspect ECHO's own modules:

- `modules()` lists loaded modules as `{ name, base, size }`. `moduleInfo(name)` returns one entry (case-insensitive) or `null`.
- `scan({ module, pattern, limit })` searches a module for an AOB signature. `module` empty means the main exe. `pattern` is space-separated hex bytes; `??` or `?` is a wildcard (`"48 8B ?? ?? E8"`). `limit` 0 means no cap. Results are `{ address, offset }`.
- `read({ module, offset, size })`, `write({ module, offset, data })`, and `protect({ module, offset, size, prot })` are offset-based from the module base. `data` is base64.
- Typed helpers (little-endian): `readBytes` / `writeBytes`, `readInt32` / `writeInt32`, `readUInt32` / `writeUInt32`, `readFloat` / `writeFloat`, `readDouble` / `writeDouble`, `readBigInt64` / `writeBigInt64` (BigInt as string on read; write accepts BigInt or a numeric string), `readBigUint64`, `readPointer` (`"0x…"`), `readString(module, offset, size)` (UTF-8, cut at the first NUL).

```js
const native = echoExternalMod.native;
const module = (await native.moduleInfo('ECHO.exe'))?.name || '';
const { matches } = await native.scan({ module, pattern: '48 8B ?? ?? E8', limit: 8 });
const hit = matches[0];
const bytes = await native.readBytes(module, hit.offset, 5);
bytes[0] = 0x90;
await native.protect({ module, offset: hit.offset, size: 5, prot: 7 });
await native.writeBytes(module, hit.offset, bytes);
```

## Custom config UI

A package may ship its own configuration page instead of using the Mods-page schema form.

Add a package-relative script path to `echo.mod.json`:

```json
{
  "config": "config.json",
  "configSchema": "config.schema.json",
  "configUi": "config-ui.js"
}
```

When the user opens Config, the loader fetches `GET /api/mod/:id/config` and, if `manifest.configUi` is a string, loads that file from `GET /api/mod/:id/file/:path`. The script runs as an async function whose only argument is `echoConfigUi`. Returning a cleanup function is optional; the loader calls it when the modal closes.

File and config routes work for installed packages even when the package is disabled, so a custom config page can still open and save.

### echoConfigUi

| Member | Signature | Notes |
| --- | --- | --- |
| `root` | `HTMLElement` | Modal body. The custom page may replace its contents. |
| `modId` | `string` | Installed package id. |
| `manifest` | `object` | Package manifest. |
| `schema` | `object \| null` | Parsed `configSchema`, if any. |
| `config` | `object` | Deep clone of the current config (`structuredClone`, JSON fallback). |
| `save(next)` | `(next) => Promise<object>` | `PUT /api/mod/:id/config`. Toasts on success and returns the saved config. Does **not** close the modal. |
| `close()` | `() => void` | Close the modal. |
| `toast(message, type?)` | `(message, type?) => void` | Loader toast. `type` is `info`, `success`, `error`, or `warn`. |
| `onSave(handler)` | `(handler) => void` | Shows the default Save button. Clicking it `await`s `handler()`. A returned plain object is PUT then the modal closes; a void/null return only closes. |
| `assetUrl(path)` | `(path) => string` | URL for a packaged file. |
| `loadAsset(path, options?)` | `(path, { binary }?) => Promise<string \| ArrayBuffer>` | Fetch a packaged file as text or binary. |
| `defaults()` | `() => object` | Config object built from the `default` values in `configSchema` properties. |
| `loaderSettings()` | `() => object` | Snapshot of the loader appearance settings (see "Loader UI settings"). |
| `ui.form(schema?, config?)` | `(schema?, config?) => { element, read }` | Renders the loader's schema auto-form (switches, enum menus, numeric limits, JSON fallback) into a detached element. Defaults to the package schema and current config. `read()` returns the values as a config object. |
| `ui.field(key, spec?, value?)` | `(key, spec?, value?) => { element, read }` | Renders one loader-styled field from a JSON-schema property spec. `read()` returns the field value. |

If `onSave` is never called, the default Save button stays hidden. The page should call `save(next)` itself. When the handler returns a plain object, the loader PUTs it and closes; when it returns nothing, the loader only closes.

`ui.form` and `ui.field` let a custom page mix the auto-form with hand-built controls while keeping loader styling:

```js
const { root, schema, config, ui, defaults, onSave } = echoConfigUi;
const form = ui.form(schema, config);
const extra = ui.field('nickname', { type: 'string', title: 'Nickname' }, config.nickname);
root.append(form.element, extra.element);
onSave(() => ({ ...config, ...form.read(), nickname: extra.read() }));
// defaults() -> { accent: 'auto', ... } from schema default values.
```

### Example

```js
const { root, manifest, schema, config, save, close, toast, assetUrl } = echoConfigUi;
const draft = { ...config };

root.innerHTML = `
  <label>${schema?.properties?.message?.title || 'Message'}
    <input data-message value="">
  </label>
  <button type="button" data-save>Save</button>
  <button type="button" data-close>Close</button>
`;
root.querySelector('[data-message]').value = draft.message || '';
root.querySelector('[data-save]').onclick = async () => {
  draft.message = root.querySelector('[data-message]').value;
  await save(draft);
  toast('Saved', 'success');
};
root.querySelector('[data-close]').onclick = () => close();

// Optional: echoConfigUi.onSave(() => draft) shows the loader Save button and closes after PUT.
// Optional: echoConfigUi.loadAsset('icon.svg') or assetUrl('icon.svg') for packaged files.

return () => { root.replaceChildren(); };
```

### Fallback

If `configUi` is missing, the script cannot be fetched, or the script throws, ShinawaseLoader falls back to the schema auto-form (or a JSON editor when there is no schema). A toast and error banner explain the fallback.

A successful `PUT /api/mod/:id/config` already calls `requestInjection('config')`, so the loader reinjects enabled packages after save.
