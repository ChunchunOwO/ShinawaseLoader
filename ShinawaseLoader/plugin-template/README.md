# ShinawaseLoader external plugin template

1. Copy this folder and update `echo.plugin.json`.
2. Put renderer startup code in `plugin.js`. Keep `minEchoVersion` at `26.8.15` unless the plugin needs a newer host. The current aligned install is echo-steam **26.9.1** at `D:\SteamLibrary\steamapps\common\ECHO`.
3. Package it with `pack-mod.bat <folder> <output.echo> --zip`.
4. Drop the package into the game's `Plugins` folder or import it from the Loader page.

Plugins are stored in `Plugins/installed/<plugin-id>`. The script receives the same `echoExternalMod` SDK as Mods and can use `echoExternalMod.echo` to call ECHO's public renderer API without changing `app.asar`. For main-process or host-dll work, copy `../native-plugin-template` instead.

Return a cleanup function for every DOM node, event listener, timer, or sidebar page that the plugin creates.
