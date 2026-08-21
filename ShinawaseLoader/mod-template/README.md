# ShinawaseLoader external mod template

1. Copy this folder and change `echo.mod.json` (`id`, `name`, `version`, and `description`).
2. Put startup code in `mod.js`. It runs inside the ECHOSteam renderer and receives `echoExternalMod`.
3. Put user-editable defaults in `config.json`. Add `config.schema.json` when you want labels, descriptions, switches, enum menus, or numeric limits in the Mods page.
4. Add an SVG at `icon.svg` and package the folder as one `.echomod` or ZIP `.echo` file.

`mod.js` receives `echoExternalMod.sidebar.register(...)` for Mod-owned sidebar pages. `echoExternalMod.main` and `echoExternalMod.native` talk to the asar-bridge native host when a package declares `main` or `native.modules`. Give each page a stable `id` such as `main` or `settings`; every registered page appears under the ShinawaseLoader sidebar group. Use `assetUrl('file.html')` or `loadAsset('file.css')` for packaged resources. `echoExternalMod.echo` is the public ECHO renderer bridge, while `echoExternalMod.sdk.list/get/call` helps discover and call available APIs without tying the Mod to one ECHO build. Returning a cleanup function removes DOM, timers, listeners, and sidebar pages when the Mod is disabled.

The entry script must return a cleanup function when it creates DOM, timers, or listeners.
