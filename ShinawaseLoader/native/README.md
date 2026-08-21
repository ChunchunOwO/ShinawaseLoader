# Shinawase native host addon

`echo-native-host.node` is an N-API addon loaded by `native-host.cjs` inside ECHO's Electron main process. It `LoadLibrary`s package-declared host DLLs that export `EchoNative_Init`.

```powershell
.\scripts\build-native-host.ps1 -EchoRoot "D:\SteamLibrary\steamapps\common\ECHO Playtest"
```

The script targets Electron headers. Use `-Runtime node` only when testing the addon under the bundled Node runtime; ECHO in-process loading needs the Electron ABI.

Current-process `modules/read/write/protect` helpers are for authorized ECHO native-host / DSP development. They do not open other processes.
