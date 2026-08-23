# Examples

Official sample packages. Source folders are not copied by `setup-modloader.bat`; the installer **optional packages** step can import the built `.echomod` files into the game `Mods` folder. Names match `echo.mod.json`.

| Name | Folder | Package |
| --- | --- | --- |
| ECHO Streaming | [ECHO-Streaming](ECHO-Streaming) | `examples/packages/ECHO-Streaming.echomod` |
| ECHO Together | [ECHO-Together](ECHO-Together) | `examples/packages/ECHO-Together.echomod` |
| ECHO Auxiliary Fix | [ECHO-AuxiliaryFix](ECHO-AuxiliaryFix) | `examples/packages/ECHO-AuxiliaryFix.echomod` |
| ECHO osu!downloader | [ECHO-OsuDownloader](ECHO-OsuDownloader) | `examples/packages/ECHO-OsuDownloader.echomod` |
| ECHO AudioBand | [ECHO-AudioBand](ECHO-AudioBand) | `examples/packages/ECHO-AudioBand.echomod` |
| ECHO MV | [ECHO-MV](ECHO-MV) | `examples/packages/ECHO-MV.echomod` |

Rebuild from the repository root:

```powershell
.\pack-mod.bat .\examples\ECHO-Streaming\echomod .\examples\packages\ECHO-Streaming.echomod --zip
.\pack-mod.bat .\examples\ECHO-Together\echomod .\examples\packages\ECHO-Together.echomod --zip
.\pack-mod.bat .\examples\ECHO-AuxiliaryFix\echomod .\examples\packages\ECHO-AuxiliaryFix.echomod --zip
.\pack-mod.bat .\examples\ECHO-OsuDownloader\echomod .\examples\packages\ECHO-OsuDownloader.echomod --zip
.\pack-mod.bat .\examples\ECHO-AudioBand\echomod .\examples\packages\ECHO-AudioBand.echomod --zip
.\pack-mod.bat .\examples\ECHO-MV\echomod .\examples\packages\ECHO-MV.echomod --zip
```

Drop a built `.echomod` into the game `Mods` folder, or import it from the in-app Mods page.
