# ShinawaseLoader SDK

ShinawaseLoader uses external Chrome DevTools Protocol injection. It does not require an `app.asar` patch for normal operation.

## Zankyo / native GPUI (experimental)

The launcher automatically detects Electron or a compatible Zankyo binary.
Electron keeps the CDP runtime described below. Zankyo uses a separate encrypted
session and native GPUI views; it displays **“Zankyo 版本适配正在进行中，不保证完全可用性。”**
on each launch. The native **Shinawase** dock is fixed above Settings, with a
separate caret for its animated drawer. It opens Loader, Mod Market, Mods and
registered native Mod pages.

The Loader page uses the existing settings, Steam launch options, update,
locale, performance report and debug-console operations. Mods retains search,
runtime/enabled filters, sort, list/grid layout, file import, reload, schema or
JSON configuration and removal confirmation. Market uses the existing catalog,
recommendations, shuffle, filters, detail/README, login, upload and management
API. These controls are rendered by GPUI; no browser or WebView is embedded.
An Electron `configUi` script still requires a native implementation; its
schema/JSON configuration remains editable.

A dual-runtime package keeps its Electron entry and declares:

```json
{
  "id": "author.example",
  "name": "Example",
  "version": "1.0.0",
  "entry": "mod.js",
  "zankyo": { "entry": "zankyo.js" }
}
```

`zankyo.js` is an async function body receiving `echoExternalMod`, with
top-level `await` and a returned cleanup function. It runs as trusted code in
the Loader's Node process. It receives `id`, `manifest`, `config`, `log`,
`runtime: 'gpui'`, `zankyo` and the supported compatibility context below.
Entry selection is `zankyo.entry`, then `gpui.entry`, then the legacy renderer
JavaScript entry (`entry` or the usual `mod.js` / `plugin.js`). A `gpui-plugin`
is installed and enabled through ECHO's plugin interface; this state does not
mean the external Loader has loaded it. Native and compatibility entries report
`loaded` with `runtime: 'zankyo'` or `'electron-compat'`; unsupported Electron
surfaces report `incompatible` with a migration reason. See `zankyo-template` and use
`zankyo-external-mod.d.ts` for editor declarations.

```js
const { core, ui, settings, native } = echoExternalMod.zankyo;
const capabilities = await core('host.describe');
const views = await ui.views();
await ui.patch(views.find(name => name.endsWith('::player_view::Player')), {
  type: 'column',
  children: [
    { type: 'original' },
    { type: 'button', text: 'Next', onClick: 'next', padding: 8 }
  ]
});
return ui.onAction(async action => {
  if (action === 'next') await core('playback.control', { action: 'next' });
});
```

`ui.patch(view, tree)` replaces any registered view in the next native render.
An `original` node can embed its original subtree once. Native node types are
`row`, `column`, `text`, `button`, and `original`; style fields are documented
in the types. `ui.remove(view?)` restores the original. `ui.action(command)`
uses ECHO's existing shortcut names; `settings.get/set` reads/updates the native
preferences through ECHO's normal persistence path. `core(method,input)` uses
the host command registry, retaining ECHO's domain permissions and validation.
`zankyo.call('session.describe')` reports the native protocol and build ID.

External providers use `zankyo.providers.register(kind, id, {title}, handlers)`,
where `kind` is `sources`, `lyrics`, or `mv`. They execute in the Loader and
register with the existing native router as `shinawase.<package-id>`.
Source callbacks receive `search`, `browse`, and `resolve` inputs; lyrics use
`lookup({track, automatic, exact, signal})`. MV uses managed session operations
(`observe`, `status`, `search`, `select`, `retry`, `clear`, `deactivate`, with
optional quality/load/failure operations). Every callback receives an
`AbortSignal`. Registration is limited to 64 capabilities per package, requests
to 32 outstanding callbacks, and every callback has an 18-second deadline.
The independent encrypted polling loop permits nested Core calls.

`zankyo.media.createRelay()` creates a package-owned loopback media relay with
`publish(url, headers)`, `publishFile(absolutePath)`, `clear()` and `close()`.
Each relay retains at most eight streams and serves bounded concurrent range
requests. Four relays are allowed per package. Disable, failed startup and
reload close them automatically. Credentials remain in the Loader; native
queues contain stable provider references and tokenized media addresses.

`dataRoot` is a package-owned persistent directory; `timers` retire with the
package. `importModule(relativePath)` loads package-local CJS or MJS after real
path validation. CJS dependencies and directly imported MJS files participate
in reload fingerprints. Bundle transitive MJS dependencies into that module
when they must reload together. `importDependency(name)` accesses installed
Loader dependencies or Node built-ins in the same full-trust process.

`ui.createPage({id,label,render,action})` serializes page actions, displays
action errors and suppresses unchanged screen updates. Its result exposes
`refresh()`, `error(message)` and `close()`. `ui.choosePath({directory,multiple})`
uses the native picker; `ui.openUrl(url)` accepts HTTP(S). The generic
`ui.lyricsProvider` call selects the existing native automatic lyrics source,
and `ui.openMv` opens the existing native MV controls.

Core additions for external media tools are `media.current`, `lyrics.search`,
`lyrics.applyProvider` and `lyrics.editCurrent`. Current-track writes require
`expectedSequence` from `media.current`; they reject a changed track instance.
`lyrics.applyProvider` preserves original, timed, word-timed, translated and
romanized lyric fields. `lyrics.editCurrent` accepts `offset`, `clear`, and
`instrumental`. Explicit local-library writes can still use `trackId`.
See the three [active external ports](../examples/ZANKYO-PORTS.md).

`ui.page(id, { label, body })` registers or replaces a native Mod page in the
same drawer and returns its remover. Page IDs belong to their package. All
pages and action handlers retire on disable, reload, startup failure or session
loss. With at least eight Mod pages the drawer provides a page filter.

```js
const { ui } = echoExternalMod.zankyo;
const removePage = ui.page('tools', {
  label: 'My tools',
  body: { kind: 'section', children: [
    { kind: 'heading', text: 'My tools' },
    { kind: 'field', id: 'message', text: 'Message', value: 'Hello' },
    { kind: 'button', text: 'Apply', action: 'apply', tone: 'primary' }
  ] }
});
const stop = ui.onAction(async (action, fields) => {
  if (action === 'apply') echoExternalMod.log(fields.message);
});
return () => { stop(); removePage(); };
```

Use `ShinawasePageNode` in `zankyo-external-mod.d.ts` for supported controls.
Page actions and field values travel over the owning encrypted session. Native
file pickers send only chosen paths back to the Loader; file reads and API work
stay off ECHO's UI thread. Native package imports share the API's 32 MiB upload
limit; settings import is limited to 1 MiB. Settings export refuses to overwrite
an existing file. Use a new destination when exporting.

For deeper changes, `native.load('relative/module.dll')` (or `.dylib`/`.so`)
loads a full-trust in-process extension. It exports
`Shinawase_HostBuild_v1` and `Shinawase_Entry_v1` as documented in ECHO GPUI's
`docs/shinawase.md` and `examples/shinawase/shinawase.h`. Native extensions can
mutate live native objects and replace the rendered `AnyElement` at each view
boundary. They must target the exact `nativeBuild`, compiler and GPUI build;
this is not a stable Rust object ABI. `native.invoke(input)` calls event 2.
Retirement disables hooks but keeps code mapped until exit; restart after
32 library loads.

Disable, changed entry/config, failed initialization and disconnection remove
the package's transient overrides and retire native hooks. Explicit Core and
settings writes persist. File paths must stay inside the package, including
symlink resolution. Enabled entries are trusted Node code, not a sandbox.

The session uses per-launch AES-256-GCM keys and sequence-checked frames. ECHO
connects only to the owning Loader and removes inherited key variables before
starting workers. Keys are never persisted or exposed by HTTP; there is no
generic HTTP/native RPC proxy. `/api/zankyo/status` requires the installation's
`x-shinawase-token`, including non-browser requests. During a GPUI session,
mutating Loader HTTP requests also require that token. This protects the launch
capability; it does not isolate either process from an administrator/debugger
or already enabled full-trust code.

`attach` cannot retrofit this capability into an ordinary running GPUI process:
restart it through Shinawase. The Shinawase startup card has been removed on
both runtimes; saved `startupSplash` values are ignored and the setting is no
longer offered. The Loader also sends a false compatibility flag to suppress
the card in older matching GPUI hosts. The Zankyo experimental notice still appears.

## Electron API compatibility on Zankyo

The compatibility layer lives in `zankyo-compat.mjs` in the Loader. GPUI does
not run an Electron renderer, a browser or a simulated DOM. API-only async
renderer entries can run unchanged. A legacy dependency on `main`, `native`,
`nativeShell`, the sandboxed Plugin VM, HTML or CSS requires a native port.
Use `sdk.list()` and feature detection: this is an implemented subset, not the
complete Electron preload contract.
`extend` is `null`; DOM replacement/CSS hooks require the native view interfaces.

- `echo` and the scoped `window.echo` expose `app.getSettings/setSettings` for
  GPUI preference keys and playback `getStatus`, `play`, `pause`, `stop`, `seek`,
  `setRepeatMode`, `playMediaItem`, `playLocalFile` and `onStatus`. Status uses
  Electron's `positionMs` / `durationMs`; calls retain Core validation. The
  native preference key set may differ from Electron's. Unknown keys fail.
- `player` provides the same basic controls, next/previous, `status()` in
  seconds, `playback()` returning the playback API, queue submission/append,
  replacement, clearing and supported `command()` actions. `queue()` is a
  bounded native snapshot, not a mutable renderer queue VM; it exposes the
  first 256 items and pagination metadata. The native status does not disclose
  file paths; `filePath` is `null`. Indexed local track IDs and already
  resolved stream URLs work. Provider resolution and local file-path-only
  playback need a source integration; unsupported options fail explicitly.
- `sdk.getEcho/list/get/call/status`, `toast`, package-owned `settings`,
  `assetUrl/loadAsset`, `fetchJson/uploadFile`, and `loaderSettings.get/set/onChange`
  reuse Loader services. Settings are stored per package under
  `zankyo-settings/`, capped at 64 KiB and saved by rename. They are separate
  from Electron's old renderer localStorage. Package assets keep the realpath
  boundary and an 8 MiB read limit.
- `sidebar.register({ id, label, native })` renders a `ShinawasePageNode`.
  The external `plugin-template` demonstrates this using one entry script.
  A dual UI descriptor may keep `html` / `render` beside `native`; Electron
  uses its existing UI while GPUI selects the native descriptor. Native page
  actions use `zankyo.ui.onAction(action, fields)`.

Playback listeners share one host snapshot per polling cycle and read only
when subscribed. Disabling/reloading or failed initialization retires page
registrations, listeners and scoped timers; late calls through that Mod's
context reject after retirement. These entries are full-trust Node code and
can deliberately bypass scoped helpers. This is not process isolation.

For audio integration, call the generic registry via `zankyo.core`:
`audio.output.listDevices/getStatus/setOutput`, `audio.dsp.getGraph/applyGraph`,
`audio.dsp.getRackOrder/setRackOrder` and `audio.getAnalysis`. Host checks,
including Pro DSP availability, still apply. `queue.submit` accepts catalog,
source and resolved stream references. The `zankyo-template` includes an audio
tools page using these interfaces, with no platform/provider logic in GPUI.
Changing a decoder, device driver/backend or realtime PCM processing requires
an implementation in the separate Audio Host. The UI-process native ABI does
not automatically make Electron `.node` addons or audio backends compatible.


## Native ECHO GPUI target

This is ECHO's standard plugin route. It is separate from the encrypted
external `zankyo.entry` session above and does not provide arbitrary native
view replacement. A package can declare both entries; the external Loader
uses `zankyo.entry`, while the `gpui` commands select `gpui.entry`.

A dual-target Mod keeps its renderer `entry` and adds `"gpui": {"protocol": 1, "entry": "gpui/plugin.mjs"}` to the same manifest. Keep all GPUI code and assets under `gpui/`. Export `activate(context)` and use the native Workshop context for pages, commands, storage and playback. See `mod-template/gpui/plugin.mjs`. The host receives the original Mod ID, title, version and GPUI descriptor, including any required capabilities. The ZIP contains the GPUI subtree. To share an existing implementation with the Electron target, list its package-root module filenames in the optional top-level `gpuiAssets` array. ECHO MV uses this for its matching engine.

Use `ShinawaseLoader.mjs gpui test <directory-or-echomod> [command-id] --echo "<GPUI>"` to activate it in the host's temporary library. Use `gpui install` with the same package to register it in the desktop profile; approve it in the application's installed plugins view. For distribution, `gpui pack <directory-or-echomod> <new.zip>` writes a standalone file for GPUI's normal import flow.

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
- `sidebar.register({ id, label, icon, order, render })`: add a page to the Shinawase sidebar, the drawer that the **Shinawase** row above ECHO's Settings opens. Pages sort by `order`, then label, below Loader, Mod Market and Mods; with eight or more pages the drawer adds a filter field. Each page keeps a `.nav-item[data-echo-external-sidebar="<id>"]` button in the DOM while the drawer is closed, so calling `.click()` on it still opens the page.
- `fetchJson(url, options)`, `uploadFile(input)`: Loader-mediated HTTP helpers.
- `toast(message)`, `console.debug/info/warn/error`, `log(...)`: user feedback and Logs output.

The Loader API only answers `127.0.0.1`, `localhost`, and `[::1]` Host headers. Requests that carry an `Origin` header (any browser context, including the ECHO renderer) must send `x-shinawase-token`; the injected Loader UI receives it as `LOADER_TOKEN`, and it is stored in `ShinawaseLoader/.api-token`. In the ECHO main window the Loader patches `fetch` and `XMLHttpRequest` to add the header automatically for calls to its own `/api/*`, so mods that call `${baseUrl}/api/...` directly keep working unchanged (`sendBeacon`, `EventSource`, and `WebSocket` cannot carry the header). Non-browser clients (the Testing SDK, PowerShell, `curl`) send no `Origin` and need no token.

`GET /api/sdk` reports the `window.echo` namespaces available in the current ECHO build. `GET /api/status` reports active launch mode, performance settings, folder locations, and the aligned Echo target (`echoTarget`, including `runtime` fingerprint vs the live Steam asar). `GET /api/runtime` / `POST /api/runtime/sync` inspect or force-refresh the isolated Mod runtime after a Steam update.

Use `echo-external-mod.d.ts` for editor hints in JavaScript or TypeScript projects. The external SDK tracks the public bridge present in the installed build; it intentionally does not depend on ECHO's built-in plugin runtime.

For automated testing of packages — an offline harness that runs entries in the exact injected wrapper against a recorded `echoExternalMod` mock, static manifest/archive validation, and live attach-only acceptance over the HTTP API and CDP — see `ShinawaseLoader/TESTING.md` and the modules under `ShinawaseLoader/testing/` (types in `testing/shinawase-testing.d.ts`).

## echo-steam 26.10.18 alignment

Current aligned host: **echo-steam 26.10.26** (checked live on an isolated copy of the 26.10.26 Steam build; asar patches also checked against 26.10.24 and a 26.10.25 source build; 26.10.16 and later are covered) at `...\steamapps\common\ECHO\ECHO.exe` (also recognizes `ECHO Steam.exe`). Electron **43.8.1**, Steam AppId **5105090** (ECHO Playtest is `5105150` and is never auto-selected), Workshop SDK `native-shell` kind. The isolated Mod runtime (`ShinawaseLoader/modded-runtime`) is fingerprinted against the live Steam `app.asar` / `ECHO.exe`; Steam updates trigger `runtime-sync.mjs` on the next launch.

- **Retired upstream**: ECHO 26.10.8 removed its own platform streaming, platform account login, downloader, Qobuz and MV services, and the Steam build's preload `IpcChannels` table no longer carries their channels. On a Loader install, `window.echo.streaming` / `accounts` / `downloads` / `qobuz` come from the Loader's preload bridge (which carries its own channel table) and the bundled streaming bridge, not from ECHO.

- **userData**: `%APPDATA%\ECHO Steam`. Honor `ECHO_USER_DATA_PATH_OVERRIDE` when set. Do not treat leftover `%APPDATA%\ECHO NEXT` as the Steam edition store.
- **Window kinds** (Electron names `MainWindow` / `DesktopLyrics` / `MiniPlayer` / `TaskbarMiniPlayer` / `Pet` / `Cli` / `DevConsole`; 26.10 adds the desktop music wall, `index.html?desktopWall=1`, and the quick-search window). The loader classifies only ECHO's own renderer document (`…/renderer/index.html` without an auxiliary marker) as `Main` and injects only that surface. Account and Workshop login windows, `data:` popups, and every other page are `External` and are never probed.
- **`window.echo` namespaces** observed on this build include `steam`, `workshop`, `app`, `desktopLyrics`, `miniPlayer`, `taskbarMiniPlayer`, `pet`, `library`, `playback`, `lyrics`, `quickSearch`, `audio`, `podcasts`, `listening`, plus `streaming`, `accounts`, `downloads` and `qobuz` from the Loader's preload bridge (`mv` is gone since 26.10.8). Method names are **not** frozen here — call `sdk.list(path)` / `sdk.get(path)` / `GET /api/sdk` at runtime. The loader itself uses `echo.app.getSettings` / `echo.app.setSettings` and `echo.playback.getStatus` when present.
- **Custom protocols** (asset / media URL schemes, not `window.echo` methods): `echo-cover`, `echo-audio`, `echo-video`, `echo-mv`, `echo-wallpaper`, `echo-image`, `echo-artist-image`, `echo-album-extra`, `echo-workshop`, `echo-osu-sb`, `echo-font`, `echo-listening-avatar`.
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
| `showTitlebarBrand` | `true` (default), `false` | Show or hide the injected Shiawase label in ECHO's title bar. |
| `cardLayout` | `list` (default), `grid` | Mods page card arrangement. |
| `showModDescriptions` | `true` (default), `false` | Description line on mod cards. |
| `showModVersions` | `true` (default), `false` | Version badge on mod cards. |
| `showModIds` | `true` (default), `false` | Package-id badge on mod cards. |
| `rememberFilters` | `true` (default), `false` | Persist the Mods page filter chip and sort order across sessions. |
| `modSort` | `name` (default), `recent`, `enabled` | Mods page sort: by name, by install time, or enabled first. |
| `modFilter` | `all` (default), `active`, `inactive` | Last selected filter chip (used when `rememberFilters` is on). |

HTTP surface:

- `GET /api/market` returns the plugin market catalog (`ok`, `mods`, `recommended`, `tags`, `catalogUrl`, `updatedAt`), merged with locally installed versions (`installed`, `installedVersion`, `updateAvailable`, `status`). `?force=1` bypasses the short catalog cache. Catalog URL defaults to `https://echo.shiinasuki.com/mod-market/index.json` and can be overridden with `loader.config.json` `marketUrl` or `ECHO_MOD_MARKET_URL`.
- `GET /api/market/search?q=&tag=` filters the current catalog.
- `POST /api/market/install` with `{ id }` downloads the listing, verifies `sha256`, imports it, and enables it on first install.
- Market APIs require an Echow4seHub account. The website uses the Flarum session cookie; the Loader stores a Flarum API token from `POST /api/market/login`.
- `GET /api/market/me` returns the signed-in Hub user (`id`, `username`, `displayName`, `isAdmin`).
- `POST /api/market/upload` publishes a `.echomod` as that user. Official ids stay locked unless the user is an admin.
- `GET /api/market/mod/:id` returns listing plus `readme`, `intro`, stats, and `canManage`.
- `POST /api/market/page` updates intro/README. Authors manage their own packages; admins can edit any.
- `POST /api/market/unlist` with `{ id, unlisted }` hides or restores a package.
- `POST /api/market/event` with `{ type: view|download|install, id }` records stats.
- `GET /api/ui-settings` returns `{ ui, defaults }`.
- `PUT /api/ui-settings` merges a partial `{ ui: { ... } }` (or a bare settings object), sanitizes it, persists it, and returns the result.
- `GET /api/settings/export` returns a `shinawase-loader-settings` document with the full `loader.config.json` surface plus `locale` and `ui`. The Appearance section's Export button downloads it as JSON.
- `POST /api/settings/import` accepts an exported document (or a bare `settings` object). `ui`, `locale`, and `debugMode` apply live; other keys (ports, load mode, injection timings, native host) are written to `loader.config.json` and reported in `requiresRestart`.

Mods read the same settings through `echoExternalMod.loaderSettings` and can subscribe via `loaderSettings.onChange(handler)` or the `shinawase:ui-settings` window event, for example to match a custom page to the user's accent color or density.

## echo-steam renderer notes

echo-steam (the current Steam renderer; older docs called this "ECHO Next") keeps reshaping the UI. The loader adapts automatically, but mod authors should know:

- **Sidebar**: 26.9.x shipped a flat `aside.sidebar` (main `nav.nav-list`, `.sidebar-spacer`, `nav.nav-list.utility-nav`). 26.10.x groups it again: `.sidebar-header` holds the search entry, `.sidebar-groups` holds a pinned `start` group (Home), a scrolling `.sidebar-main-groups`, and the utility group (Settings); routes can fold under a parent as `.nav-item-branch` with a `.sidebar-subnav`. `sidebar.register(...)` keeps working; the loader places its Shinawase dock above Settings in every shape.
- **Playlists (26.10.8+)**: the collection opens on `.playlists-page--home` (`header.playlist-overview-header` with `.playlist-overview-actions`, then the artwork wall `.playlist-wall`; cards are `button.playlist-wall-open[data-wall-focus]`). A playlist opens as `.playlists-page--wall-detail` (`nav.playlist-wall-navigation`, `header.playlist-detail-header`, `.playlist-detail-primary-actions`). There is no playlist rail any more: `.collection-playlist-sidebar` only renders as the floating "new playlist" card while `[data-creating="true"]`. Open a playlist by id with `window.dispatchEvent(new CustomEvent('app:global-search:navigate-playlist', { detail: { playlistId } }))`.
- **`extend.hideNav(routeId)`**: the Steam renderer removed the per-route `[data-workshop-icon]` markers, so CSS hiding no longer matches. The loader additionally patches the native `sidebarHiddenRouteIds` app setting (via `window.echo.app.setSettings`) and restores it on `showNav` / cleanup. Route ids follow the current sidebar ids (`home`, `songs`, `streaming`, `queue`, `playlists`, `plugins`, `settings`, ...).
- **Route surfaces**: `.page-surface[data-route-id]`, `app:navigate:*` events, and `extend.replaceRoute` are unchanged.
- **Theme variables**: the Steam renderer removed `--theme-accent`, `--theme-code-bg`, `--theme-border`, `--theme-card-bg`, `--theme-card-border`, `--theme-hover-bg`, and `--theme-surface`. The loader bridges these to the new tokens (`--theme-accent-solid-bg`, `--theme-field-bg`, `--theme-panel-border(-strong)`, `--theme-panel-bg`, `--theme-list-row-bg-hover`, `--color-surface`) at runtime, but new CSS should target the new token names directly.
- **Official plugins**: ECHO ships its own sandboxed plugin system (`%APPDATA%\ECHO Steam\plugins\<id>\echo.plugin.json` + `plugin.js`, packaged as JSON `.echo` files with `"type": "echo-next-plugin-package"`). Those plugins use the sandboxed `echo` plugin API (`echo.commands`, `echo.net`, ...), not `echoExternalMod`, and are best imported through ECHO's own Plugins page (`window.echo.plugins.importPackage` when that path exists — confirm with `sdk.list('plugins')`). ShinawaseLoader packages keep using `echo.mod.json` / ShinawaseLoader `echo.plugin.json` manifests with the `echoExternalMod` SDK.

## Package locations

- `Mods/`: Mod drop folder; installed Mods live in `Mods/installed`.
- `Plugins/`: Plugin drop folder; installed Plugins live in `Plugins/installed`.
- `ShinawaseLoader/Logs/loader.log`: runtime and package logs.
- `ShinawaseLoader/Logs/errors.log`: errors only, including `loader exited code=...` when the Loader process dies.
- `ShinawaseLoader/Logs/loader-stderr.log`: the Loader's own stderr; a crash stack appears here and nowhere else.

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
| `root` | `HTMLElement` | Body of the config sheet (a side panel). The custom page may replace its contents. |
| `modId` | `string` | Installed package id. |
| `manifest` | `object` | Package manifest. |
| `schema` | `object \| null` | Parsed `configSchema`, if any. |
| `config` | `object` | Deep clone of the current config (`structuredClone`, JSON fallback). |
| `save(next)` | `(next) => Promise<object>` | `PUT /api/mod/:id/config`. Toasts on success and returns the saved config. Does **not** close the modal. |
| `close()` | `() => void` | Close the config sheet. |
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
