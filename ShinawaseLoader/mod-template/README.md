# ShinawaseLoader external mod template

1. Copy this folder and change `echo.mod.json` (`id`, `name`, `version`, and `description`).
2. Put startup code in `mod.js`. It runs inside the ECHO Steam renderer and receives `echoExternalMod`. Keep `minEchoVersion` at `26.8.15` unless the package truly needs a newer host; the current aligned install is echo-steam **26.8.28** at `D:\SteamLibrary\steamapps\common\ECHO`.
3. Put user-editable defaults in `config.json`. Add `config.schema.json` when you want labels, descriptions, switches, enum menus, or numeric limits in the Mods page.
4. Optional: set `configUi` in `echo.mod.json` to a package-relative script such as `config-ui.js`. The Mods page runs that script with `echoConfigUi` so you can ship a custom configuration page. Use `echoConfigUi.ui.form(schema, config)` to reuse the loader's schema auto-form, `echoConfigUi.ui.field(key, spec, value)` for single loader-styled fields, and `echoConfigUi.defaults()` for a config object built from schema defaults. If the script is missing or throws, the loader falls back to the schema form.
5. Add an SVG at `icon.svg` and package the folder as one `.echomod` or ZIP `.echo` file.

`mod.js` receives `echoExternalMod.sidebar.register(...)` for Mod-owned sidebar pages. `echoExternalMod.loaderSettings.get/set/onChange` reads or adjusts the loader's appearance settings (accent color, density, card layout) and reacts to the `shinawase:ui-settings` event. `echoExternalMod.main` and `echoExternalMod.native` talk to the asar-bridge native host when a package declares `main` or `native.modules`. Give each page a stable `id` such as `main` or `settings`; every registered page appears under the ShinawaseLoader sidebar group. Use `assetUrl('file.html')` or `loadAsset('file.css')` for packaged resources. `echoExternalMod.echo` is the public ECHO renderer bridge, while `echoExternalMod.sdk.list/get/call` helps discover and call available APIs without tying the Mod to one ECHO build. Returning a cleanup function removes DOM, timers, listeners, and sidebar pages when the Mod is disabled.

The entry script must return a cleanup function when it creates DOM, timers, or listeners.
