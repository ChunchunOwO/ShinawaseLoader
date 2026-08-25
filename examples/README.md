# Examples

Official sample packages. Source folders are not copied by `setup-modloader.bat`; the installer **optional packages** step can import the built `.echomod` files into the game `Mods` folder. Names match `echo.mod.json`.

| Name | Folder | Package |
| --- | --- | --- |
| ECHO Streaming | [ECHO-Streaming](ECHO-Streaming) | `examples/packages/ECHO-Streaming.echomod` |
| ECHO Classic Pet | [ECHO-Pet](ECHO-Pet) | `examples/packages/ECHO-Pet.echomod` |
| ECHO osu!downloader | [ECHO-OsuDownloader](ECHO-OsuDownloader) | `examples/packages/ECHO-OsuDownloader.echomod` |
| ECHO AudioBand | [ECHO-AudioBand](ECHO-AudioBand) | `examples/packages/ECHO-AudioBand.echomod` |
| ECHO MV | [ECHO-MV](ECHO-MV) | `examples/packages/ECHO-MV.echomod` |
| ECHO Wallpaper Bridge | [ECHO-WallpaperBridge](ECHO-WallpaperBridge) | `examples/packages/ECHO-WallpaperBridge.echomod` |

Every installer example ships a `config.schema.json` fallback form; most also include a custom `configUi` page (loader >= 1.6.0). ECHO AudioBand and ECHO Wallpaper Bridge show the full section/switch/range/color patterns.

ECHO Wallpaper Bridge doubles as the reference client for ECHO's Wallpaper Engine bridge (`http://127.0.0.1:47668`, endpoints `/health`, `/snapshot`, `/events`, `/echo-wallpaper-engine.js`), following `examples/wallpaper-engine/echo-bridge-example.js` in the ECHO repository.

Rebuild from the repository root:

```powershell
.\pack-mod.bat .\examples\ECHO-Streaming\echomod .\examples\packages\ECHO-Streaming.echomod --zip
.\pack-mod.bat .\examples\ECHO-Pet\echomod .\examples\packages\ECHO-Pet.echomod --zip
.\pack-mod.bat .\examples\ECHO-OsuDownloader\echomod .\examples\packages\ECHO-OsuDownloader.echomod --zip
.\pack-mod.bat .\examples\ECHO-AudioBand\echomod .\examples\packages\ECHO-AudioBand.echomod --zip
.\pack-mod.bat .\examples\ECHO-MV\echomod .\examples\packages\ECHO-MV.echomod --zip
.\pack-mod.bat .\examples\ECHO-WallpaperBridge\echomod .\examples\packages\ECHO-WallpaperBridge.echomod --zip
```

Drop a built `.echomod` into the game `Mods` folder, or import it from the in-app Mods page.
