# ShinawaseLoader

ShinawaseLoader is an external Mod Loader for the current ECHOSteam desktop build. It does not use ECHO's built-in plugin runtime. The loader is installed beside `ECHO.exe`, injects enabled Mods through the local CDP bridge, and renders the Mods page inside ECHO's own content grid.

## Setup

Run `setup-modloader.bat`, enter a custom ECHO directory (or press Enter for the default), and choose an operation:

- Install / update: copy the Loader and Mod template to the selected ECHO directory, create `Mods`, and download the pinned Node.js runtime dependency only when it is missing.
- Check versions: show local, installed, and GitHub versions.
- Uninstall: remove `ShinawaseLoader` and keep `Mods` and installed Mods.

The default target is `..\ECHOSteam-main\dist\win-unpacked`. A different target can be passed as `setup-modloader.bat -EchoRoot "D:\Apps\ECHO"`.

`node.exe` is intentionally not part of this source tree or any source package. The setup script downloads it from the URL in `ShinawaseLoader/loader-version.json`.

The ECHO build must expose the external-loader bridge and CDP port (`9229`). When installed, ECHO starts `ShinawaseLoader.mjs attach` automatically according to `ShinawaseLoader/loader.config.json`. Set `showConsole` to `true` or start ECHO with `--mod-loader-console` to show the Loader console. Loader and Mod logs are written to `ShinawaseLoader/loader-debug.log` and shown in the console.

## Install a Mod

Use the embedded `Mods` page in ECHO to import a `.echomod`, enable or disable it, edit its JSON configuration, and uninstall it. No Mod BAT is required.

There is also a folder drop path: copy a `.echomod` directly into the installed ECHO root's `Mods` folder. ShinawaseLoader watches that folder, validates the package, extracts it to `Mods/installed/<mod-id>`, and moves the processed package to `Mods/.processed`.

## Create and package a Mod

Copy `ShinawaseLoader/mod-template` and edit:

- `echo.mod.json`: id, name, version, description, icon, entry, and config file.
- `config.json`: user-editable JSON defaults.
- `mod.js`: an async external renderer function. It receives `echoExternalMod` with `manifest`, `config`, `settings`, `fetchJson`, `uploadFile`, `toast`, `console`, and `echo`.

Package the folder with:

```powershell
.\pack-mod.bat .\MyMod .\Packages\MyMod.echomod
```

`.echomod` is a single JSON package containing the manifest and validated text assets. Do not put secrets in a Mod package.

## ECHO Together

`mods/ECHO-Together/launcher.py` is the Python Mod launcher. It starts the local service and generates the renderer entry with the floating Together window. The service uses only the Python standard library.

```powershell
python .\mods\ECHO-Together\launcher.py --self-test
python -m unittest discover -s .\mods\ECHO-Together\service -p test_server.py
.\pack-mod.bat .\mods\ECHO-Together\echomod .\Packages\ECHO-Together.echomod
```

## Layout

```text
ShinawaseLoader/             Loader, config, version, and Mod template
Mods/                        created beside ECHO.exe after setup
Packages/                    checked-in .echomod packages
mods/ECHO-Together/          Python launcher, service, and renderer source
scripts/setup-modloader.ps1  install/update/uninstall/version checks
setup-modloader.bat          setup entry point
pack-mod.bat                 Mod authoring helper
```
