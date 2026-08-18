# ShinawaseLoader external mod template

1. Copy this folder and change `echo.mod.json` (`id`, `name`, `version`, and `description`).
2. Put startup code in `mod.js`. It runs inside the ECHOSteam renderer and receives `echoExternalMod`.
3. Put user-editable defaults in `config.json`. The Mods page can edit this file as JSON.
4. Add an SVG at `icon.svg` and package the folder as one `.echomod` file.

The entry script must return a cleanup function when it creates DOM, timers, or listeners.
