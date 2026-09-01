# Native ECHO plugin template

This package extends ECHO from three layers:

1. `plugin.js` — renderer UI through the existing CDP SDK.
2. `main.cjs` — Electron main-process script loaded by the asar-bridge native host.
3. `native/plugin.c` — in-process host DLL with the `EchoNative_*` ABI.

Build the example DLL after installing a C toolchain:

```powershell
cmake -S native -B native/build
cmake --build native/build --config Release
copy native\build\Release\echo-example.dll native\echo-example.dll
```

Build the loader host addon so ShinawaseLoader can `LoadLibrary` declared DLLs inside ECHO:

```powershell
.\scripts\build-native-host.ps1 -EchoRoot "D:\SteamLibrary\steamapps\common\ECHO"
```

Default Electron headers are **43.3.0** (echo-steam **26.9.1**, Chromium 150). The addon must match that ABI. Target install: `D:\SteamLibrary\steamapps\common\ECHO`. Keep `minEchoVersion` at `26.8.15` unless the plugin cannot run on that floor.

Run `setup-modloader.bat` to install the isolated runtime (`ECHO.modded.exe` + `ShinawaseLoader\modded-runtime`). It never patches Steam `resources\app.asar`; `-PatchApp` is accepted for older callers and ignored. Keep `nativeHost` enabled in `loader.config.json`. Safe mode disables native loading.

Current-process memory helpers (`native.memory: true`) are for developing hooks against ECHO's own native hosts. They do not open other processes.
