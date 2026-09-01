# Shinawase native host addon

`echo-native-host.node` is an N-API addon loaded by `native-host.cjs` inside ECHO's Electron main process. It `LoadLibrary`s package-declared host DLLs that export `EchoNative_Init`.

```powershell
.\scripts\build-native-host.ps1 -EchoRoot "D:\SteamLibrary\steamapps\common\ECHO"
```

The script targets Electron **43.3.0** headers by default (echo-steam **26.9.1**, Chromium 150, Node `>=22.23.2 <23`). Resolution order:

1. The Electron `version` file next to `ECHO.exe` (this install is `43.3.0`).
2. `ECHO.exe` / `ECHO Steam.exe` FileVersion, but only when it looks like Electron 40+.
3. Fallback `43.3.0`.

Do not pass app FileVersion (for example **26.9.1**) to node-gyp — that is not an Electron ABI. Use `-Runtime node` only when testing the addon under the bundled Node runtime; ECHO in-process loading needs the Electron ABI.

Current-process `modules/read/write/protect` helpers are for authorized ECHO native-host / DSP development. They do not open other processes.
