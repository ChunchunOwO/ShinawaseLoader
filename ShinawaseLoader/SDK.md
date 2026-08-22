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
- `assetUrl(path)` / `loadAsset(path, options)`: serve packaged HTML, CSS, images, WASM, or data assets.
- `sidebar.register({ id, label, icon, order, render })`: add a page in the ShinawaseLoader sidebar group.
- `fetchJson(url, options)`, `uploadFile(input)`: Loader-mediated HTTP helpers.
- `toast(message)`, `console.debug/info/warn/error`, `log(...)`: user feedback and Logs output.

`GET /api/sdk` reports the `window.echo` namespaces available in the current ECHO build. `GET /api/status` reports active launch mode, performance settings, and folder locations.

Use `echo-external-mod.d.ts` for editor hints in JavaScript or TypeScript projects. The external SDK tracks the public bridge present in the installed build; it intentionally does not depend on ECHO's built-in plugin runtime.

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

## Package locations

- `Mods/`: Mod drop folder; installed Mods live in `Mods/installed`.
- `Plugins/`: Plugin drop folder; installed Plugins live in `Plugins/installed`.
- `ShinawaseLoader/Logs/loader.log`: runtime and package logs.
- `ShinawaseLoader/Logs/errors.log`: errors only.

## Native code

ECHO NEXT's official plugin VM stays sandboxed and cannot touch Node, Electron, or the audio host. ShinawaseLoader's community native host is the authorized extension path for complete ECHO modification. It is loaded by the existing `app-asar-bridge` inside ECHO's Electron main process. That is in-process plugin loading, not remote `CreateRemoteThread` injection into an unrelated process.

The Loader prefers a non-asar path: when it launches ECHO it passes `--inspect` and evaluates `main-bootstrap.cjs` in the Electron main process. That registers the official streaming/account IPC, `session.setPreloads(streaming-preload.cjs)`, and the native host. Isolated `ECHO.modded.exe` and the optional asar-bridge remain available. Safe mode and `--no-native-host` turn native loading off.

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
