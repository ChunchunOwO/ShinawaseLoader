# ShinawaseLoader

ShinawaseLoader is a community-made external ModLoader service. It does not use ECHO's built-in plugin runtime and does not patch ECHO by default. The loader starts ECHO with a local CDP port, injects enabled community Mods into the renderer, and owns its own Mods page/sidebar entries.

## Runtime features

- **Optimized performance:** concurrent injection requests are coalesced. The loader performs a lightweight renderer signature check and only re-evaluates a package after a renderer reload, package/config change, or explicit reinject. The default check interval is 5 seconds and is configurable.
- **Loading options:** the installer creates normal, debug, safe, and attach-only launchers. The CLI also accepts `--safe-mode`, `--debug`, `--load-mode`, `--inject-interval`, and `--startup-delay`.
- **Direct ECHO.exe startup:** an explicit `app-asar-bridge` option can start the external Loader and CDP port whenever ECHO.exe is opened. It is disabled by default and reversible.
- **Renderer runtime injection:** enabled packages are evaluated through ECHO's local CDP renderer context, so HTML, CSS, JavaScript, WASM assets, sidebar pages, and APIs exposed through `window.echo` can be extended without changing `app.asar`.
- **Error logging:** all Loader and package logs go to `ShinawaseLoader\Logs\loader.log`; errors are also written to `ShinawaseLoader\Logs\errors.log`.
- **Automated installation:** Steam paths are scanned automatically, Node is downloaded into the current-user cache, and no administrator elevation is requested.

### Debug Mode

Debug Mode is for development purposes. Use `start-echo-debug.cmd` or append `--debug` to help develop and debug ShinawaseLoader, Plugins, and Mods. It enables the Web console and debug-level logs. It is not the normal game-launch path.

## Source and release

This repository is the development source. Build the portable, end-user Loader with:

```powershell
.\build-release.bat
```

It creates `release\ShinawaseLoader-<version>` and `release\ShinawaseLoader-<version>.zip`. Only the release folder/ZIP should be distributed or used for installation; it excludes source-only Mod samples, packages, logs, state, backups, and Node cache.

## Setup

Run `setup-modloader.bat`. The installer scans Steam `libraryfolders.vdf`, common drives, and known user locations for the actual ECHO executable. For the current Steam build you can pass the exact directory:

```powershell
.\setup-modloader.bat -Action menu -EchoRoot "D:\SteamLibrary\steamapps\common\ECHO Playtest"
```

The menu stays open after each operation and includes install/update, status, launch, choose directory, uninstall, and exit. It remembers the selected executable under `%LOCALAPPDATA%\ShinawaseLoader`.

Operations:

- Install / update: copy the Loader, Mod template, and Plugin template to the selected ECHO directory; create `Mods`, `Plugins`, and `ShinawaseLoader\Logs`; and download the pinned Node.js runtime to the per-user cache only when it is missing.
- Check versions: show local, installed, and GitHub versions.
- Uninstall: remove `ShinawaseLoader` and keep `Mods`, `Plugins`, and installed packages.

The installer does not request administrator elevation. Installing into a protected directory can still require normal Windows write permission; dependency downloads themselves use the user cache. `-PatchApp` is an explicit opt-in direct-start bridge and is not required for the external CDP mode.

`node.exe` is intentionally not part of this source tree or any source package. The setup script downloads it from the URL in `ShinawaseLoader/loader-version.json`.

The generated launchers are in the installed `ShinawaseLoader` folder:

- `start-echo-with-mods.cmd`: normal external Mod/Plugin loading.
- `start-echo-debug.cmd`: development mode with Web console and debug logs.
- `start-echo-safe.cmd`: starts ECHO with all external package injection disabled.
- `attach-to-echo.cmd`: attaches to an ECHO instance that was already started with its CDP port.

Use the normal launcher instead of the Steam shortcut when Mods or Plugins should be active. Logs are written to `ShinawaseLoader\Logs`.

### Direct ECHO.exe auto start

To make a normal double-click of `ECHO.exe` start the Loader and inject enabled external packages, install the explicit bridge once:

```powershell
.\setup-modloader.bat -Action install -EchoRoot "D:\SteamLibrary\steamapps\common\ECHO Playtest" -PatchApp
```

This creates `ShinawaseLoader\backups\app.asar.original` before changing `app.asar`. The installed `loader.config.json` controls the mode and survives ordinary Loader updates:

```json
{
  "autoStart": true,
  "autoStartMode": "app-asar-bridge"
}
```

Set `autoStart` to `false` or `autoStartMode` to `manual` to stop auto startup. Uninstall restores the backed-up archive when it has not changed since the bridge was applied.

## Install a Mod

Use the embedded community `Mods` page in ECHO to import a `.echomod`/`.echo`, enable or disable it, edit configuration with inferred controls (booleans become switches; numbers and text get fields; complex values retain JSON fallback), and uninstall it. A separate `ShinawaseLoader` sidebar group contains the Loader page and every enabled Mod-owned page. A manifest can provide `configSchema` for titles, descriptions, enums, and numeric limits. Plugin packages are labeled in the same page and stored independently.

There are two folder drop paths. Copy a Mod package into `Mods` and a Plugin package into `Plugins`; ShinawaseLoader waits for the file to finish copying, validates it, extracts it to `Mods/installed/<mod-id>` or `Plugins/installed/<plugin-id>`, and archives the processed package under the matching `.processed` folder. Package type controls the final destination even if it was dropped into the other folder.

## Create and package a Mod

Copy `ShinawaseLoader/mod-template` and edit:

- `echo.mod.json`: id, name, version, description, icon, entry, config file, optional `configSchema`, and optional `entryType` (`html`/`css`).
- `config.json`: user-editable JSON defaults.
- `mod.js`: an async external renderer function. It receives `echoExternalMod` with `manifest`, `config`, `settings`, `fetchJson`, `uploadFile`, `assetUrl`, `loadAsset`, `sidebar`, `toast`, `console`, and `echo`.

Package the folder with:

```powershell
.\pack-mod.bat .\MyMod .\Packages\MyMod.echomod --zip
```

The packer recursively includes assets, preserves binary files as base64 in JSON mode, and can emit a standard deflated ZIP with `--zip`. Do not put secrets in a Mod package.

### Plugins and Mod-owned pages

Copy `ShinawaseLoader/plugin-template` to create a plugin. It uses `echo.plugin.json` and `plugin.js`, then packages with the same `pack-mod.bat` command. All Plugins are installed under the game `Plugins` folder.

An external Mod can add a native-looking sidebar entry without touching ECHO's source:

```js
const dispose = echoExternalMod.sidebar.register({
  id: 'main',
  label: 'My Mod',
  icon: '◆',
  order: 50,
  render(root, context) {
    root.innerHTML = `<h2>My Mod</h2><button id="run">Run</button>`;
    root.querySelector('#run').onclick = () => context.toast('Done');
  },
});
return dispose;
```

Register more than one page by using distinct page IDs, such as `dashboard` and `settings`; all of them remain in the same `ShinawaseLoader` sidebar group.

HTML/CSS/images and other assets are served through `echoExternalMod.assetUrl('page.html')` and `echoExternalMod.loadAsset('styles.css')`. `echoExternalMod.echo` exposes the public ECHO renderer bridge, and `GET /api/sdk` reports the namespaces available in the running build. See `ShinawaseLoader/SDK.md` for the full contract. Native code belongs in a separately launched local helper with explicit IPC; the Loader does not load arbitrary DLLs into the ECHO process or write process memory.

## ECHO Together

`mods/ECHO-Together/launcher.py` is the Python Mod launcher. It starts the local service and generates the renderer entry with the floating Together window. The service uses only the Python standard library.

```powershell
python .\mods\ECHO-Together\launcher.py --self-test
python -m unittest discover -s .\mods\ECHO-Together\service -p test_server.py
.\pack-mod.bat .\mods\ECHO-Together\echomod .\Packages\ECHO-Together.echomod
```

## Layout

```text
ShinawaseLoader/             Loader, SDK, ZIP helper, config, version, and templates
Mods/                        Mod drop folder created beside ECHO.exe after setup
Plugins/                     Plugin drop folder created beside ECHO.exe after setup
ShinawaseLoader/Logs/        Loader and error logs in the installed ECHO directory
Packages/                    checked-in .echomod packages
mods/ECHO-Together/          Python launcher, service, and renderer source
scripts/setup-modloader.ps1  install/update/uninstall/version checks
scripts/build-release.ps1    builds the portable release output
setup-modloader.bat          setup entry point
pack-mod.bat                 Mod authoring helper
build-release.bat            release build entry point
```
