# ShinawaseLoader SDK

ShinawaseLoader uses external Chrome DevTools Protocol injection. It does not require an `app.asar` patch for normal operation.

## Runtime object

Each external Mod or Plugin receives `echoExternalMod`:

- `manifest`, `config`: package metadata and editable JSON configuration.
- `echo`: ECHO's public renderer bridge (`window.echo`). Use this for playback, library, queue, settings, and other APIs exposed by the running ECHO build.
- `sdk.status()`: Loader runtime status. `sdk.list(path)`, `sdk.get(path)`, and `sdk.call(path, ...args)` discover and call public `window.echo` paths without hard-coding a specific ECHO version.
- `settings.get()` / `settings.set(patch)`: per-package browser storage.
- `assetUrl(path)` / `loadAsset(path, options)`: serve packaged HTML, CSS, images, WASM, or data assets.
- `sidebar.register({ id, label, icon, order, render })`: add a page in the ShinawaseLoader sidebar group.
- `fetchJson(url, options)`, `uploadFile(input)`: Loader-mediated HTTP helpers.
- `toast(message)`, `console.debug/info/warn/error`, `log(...)`: user feedback and Logs output.

`GET /api/sdk` reports the `window.echo` namespaces available in the current ECHO build. `GET /api/status` reports active launch mode, performance settings, and folder locations.

Use `echo-external-mod.d.ts` for editor hints in JavaScript or TypeScript projects. The external SDK tracks the public bridge present in the installed build; it intentionally does not depend on ECHO's built-in plugin runtime.

## Package locations

- `Mods/`: Mod drop folder; installed Mods live in `Mods/installed`.
- `Plugins/`: Plugin drop folder; installed Plugins live in `Plugins/installed`.
- `ShinawaseLoader/Logs/loader.log`: runtime and package logs.
- `ShinawaseLoader/Logs/errors.log`: errors only.

## Native code

Use a separately launched local helper with an explicit loopback IPC protocol when a package needs native work. DLLs may be packaged as assets, but ShinawaseLoader does not load arbitrary DLLs into the ECHO process or write its memory. This keeps the loader external, reversible, and independent of `app.asar`.
