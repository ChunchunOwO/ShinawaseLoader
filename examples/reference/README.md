# Reference Mods

Archived sample implementations. They stay in the repo for reading and reuse, but **do not** appear in the ShinawaseLoader installer optional-package list. Setup only offers ECHO Streaming and ECHO MV.

Pack a reference Mod yourself, then drop the `.echomod` into the game `Mods` folder or import it from the in-app Mods page.

| Name | Folder | Package |
| --- | --- | --- |
| ECHO Classic Pet | [ECHO-Pet](ECHO-Pet) | `examples/reference/packages/ECHO-Pet.echomod` |
| ECHO osu!downloader | [ECHO-OsuDownloader](ECHO-OsuDownloader) | `examples/reference/packages/ECHO-OsuDownloader.echomod` |
| ECHO AudioBand | [ECHO-AudioBand](ECHO-AudioBand) | `examples/reference/packages/ECHO-AudioBand.echomod` |
| ECHO Wallpaper Bridge | [ECHO-WallpaperBridge](ECHO-WallpaperBridge) | `examples/reference/packages/ECHO-WallpaperBridge.echomod` |
| ECHO Steam Listen Board | [ECHO-SteamListenBoard](ECHO-SteamListenBoard) | `examples/reference/packages/ECHO-SteamListenBoard.echomod` |
| ECHO Together | [ECHO-Together](ECHO-Together) | `examples/reference/packages/ECHO-Together.echomod` |
| ECHO Auxiliary Fix | [ECHO-AuxiliaryFix](ECHO-AuxiliaryFix) | `examples/reference/packages/ECHO-AuxiliaryFix.echomod` |

```powershell
.\pack-mod.bat .\examples\reference\ECHO-Pet\echomod .\examples\reference\packages\ECHO-Pet.echomod --zip
.\pack-mod.bat .\examples\reference\ECHO-OsuDownloader\echomod .\examples\reference\packages\ECHO-OsuDownloader.echomod --zip
.\pack-mod.bat .\examples\reference\ECHO-AudioBand\echomod .\examples\reference\packages\ECHO-AudioBand.echomod --zip
.\pack-mod.bat .\examples\reference\ECHO-WallpaperBridge\echomod .\examples\reference\packages\ECHO-WallpaperBridge.echomod --zip
.\pack-mod.bat .\examples\reference\ECHO-SteamListenBoard\echomod .\examples\reference\packages\ECHO-SteamListenBoard.echomod --zip
.\pack-mod.bat .\examples\reference\ECHO-Together\echomod .\examples\reference\packages\ECHO-Together.echomod --zip
.\pack-mod.bat .\examples\reference\ECHO-AuxiliaryFix\echomod .\examples\reference\packages\ECHO-AuxiliaryFix.echomod --zip
```

ECHO Wallpaper Bridge is also the reference client for ECHO's Wallpaper Engine bridge (`http://127.0.0.1:47668`). ECHO AudioBand and ECHO Wallpaper Bridge show the full section/switch/range/color `configUi` patterns.
