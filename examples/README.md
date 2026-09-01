# Examples

Official sample packages. Source folders are not copied by `setup-modloader.bat`; the installer **optional packages** step can import the built `.echomod` files into the game `Mods` folder. Names match `echo.mod.json`.

## Preinstall (installer optional packages)

Only these two appear in the setup optional-package list (checked by default):

| Name | Folder | Package |
| --- | --- | --- |
| ECHO Streaming | [ECHO-Streaming](ECHO-Streaming) | `examples/packages/ECHO-Streaming.echomod` |
| ECHO MV | [ECHO-MV](ECHO-MV) | `examples/packages/ECHO-MV.echomod` |

Rebuild from the repository root:

```powershell
.\pack-mod.bat .\examples\ECHO-Streaming\echomod .\examples\packages\ECHO-Streaming.echomod --zip
.\pack-mod.bat .\examples\ECHO-MV\echomod .\examples\packages\ECHO-MV.echomod --zip
```

Every installer example ships a `config.schema.json` fallback form; most also include a custom `configUi` page (loader >= 1.6.0).

## Reference mods

Other sample Mods live under [`reference/`](reference/) as archived implementations. They are **not** listed in the installer optional packages and are **not** imported by `setup-modloader`. Pack and drop them yourself if you need them. See [`reference/README.md`](reference/README.md).

Drop a built `.echomod` into the Steam stable game `Mods` folder (`D:\SteamLibrary\steamapps\common\ECHO\Mods`), or import it from the in-app Mods page. Runtime userData is `%APPDATA%\ECHO Steam`, not leftover `ECHO NEXT` / `ECHO`.
