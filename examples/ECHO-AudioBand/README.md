# ECHO AudioBand

把 [AudioBand](https://github.com/AudioBand/AudioBand) 的「任务栏正在播放」条移植到 ECHO。模组开启即显示，不隐藏、不拦截官方任务栏播放器。界面由独立的 WinUI 3 进程绘制，不走 Electron `BrowserWindow`。

A port of the [AudioBand](https://github.com/AudioBand/AudioBand) taskbar now-playing bar. Enable the mod to show the bar. It does not hide or intercept ECHO’s official taskbar mini player. **The bar is a self-contained WinUI 3 host**, not an Electron overlay.

## 功能 Features

- 加载器里开启本模组即显示任务栏条；官方迷你播放器由 ECHO 自己的设置控制
- WinUI 3 无边框置顶工具窗口（不抢焦点），叠在任务栏条内
- 适配系统任务栏靠左 / 居中，并自动对齐系统托盘图标
- 封面、滚动标题 / 艺人、可点击进度条、上一首 / 播放暂停 / 下一首
- 点击封面打开 ECHO；悬停封面显示大封面、艺术家、专辑
- 点击歌名 / 艺术家进入双行歌词模式；放不下就滚动；切行有快速流光
- 歌词模式悬停显示歌名 / 艺术家；歌曲模式悬停显示歌词
- 右键菜单：打开 ECHO、复制曲目、打开歌词页、切换歌词 / 歌曲
- 滚轮微调进度；中键切下一首
- 材质 `mica` / `acrylic` / `tabbed` / `none`（Win10 上 Mica 自动回退 Acrylic）
- 全屏 / 演示模式隐藏

## 构建 Build

需要 .NET 8 SDK（仓库脚本会用 `%LOCALAPPDATA%\dotnet-sdk`）。这是 **unpackaged + self-contained WinUI 3**：`WindowsPackageType=None`，`EnableMsixTooling=true` 走 WinAppSDK NuGet 的 PRI 任务，`WindowsAppSdkBootstrapInitialize=false` 因为运行时已打进 `echomod/host`。

```powershell
.\examples\ECHO-AudioBand\build-winui.ps1
```

然后打包：

```powershell
.\pack-mod.bat .\examples\ECHO-AudioBand\echomod .\examples\packages\ECHO-AudioBand.echomod --zip
```

`echomod/host/` 是 publish 产物，不进 git。没编过 host 时 `main.cjs` 会打错误日志，配置页保存会返回 `winui_host_missing`。

## 配置 Config

| 键 Key | 默认 Default | 说明 |
| --- | --- | --- |
| `locale` | `auto` | `auto` / `zh-CN` / `en-US` |
| `widgetWidth` | `360` | 100% 缩放下的条宽度，200–800 |
| `uiScale` | `100` | 界面缩放 50–200；条宽、字号、封面、按钮、预览一起变 |
| `alignment` | `right` | `left` / `center` / `right`；会读取系统任务栏左/中对齐 |
| `offsetX` | `12` | 靠左时从空档左缘再内缩 |
| `offsetY` | `0` | 垂直偏移 |
| `monitor` | `primary` | `primary` 或显示器索引（0 起） |
| `customHeight` | `48` | 垂直任务栏或自动隐藏时的浮动高度 |
| `showAlbumArt` | `true` | 显示封面 |
| `showControls` | `true` | 显示控制按钮 |
| `showProgress` | `true` | 显示进度条 |
| `showTime` | `false` | 显示 `mm:ss / mm:ss` |
| `theme` | `auto` | `auto` / `dark` / `light` |
| `accentColor` | `#4da3ff` | 进度与悬停强调色 |
| `backgroundOpacity` | `88` | 0–100；有系统材质时条背景会更透 |
| `scrollingText` | `true` | 溢出时滚动标题 / 歌词 |
| `autoHideWhenStopped` | `false` | 停止且无标题超过 8 秒后隐藏 |
| `pollIntervalMs` | `1000` | 渲染进程轮询间隔，250–5000 |
| `autoAvoidTray` | `true` | 所有对齐都避开托盘；靠右贴托盘左侧 |
| `hoverPreview` | `true` | 悬停封面时显示大图、艺术家、专辑 |
| `seamlessMode` | `false` | 直角、不透明、填满任务栏条，关掉系统材质 |
| `backdrop` | `mica` | `mica` / `acrylic` / `tabbed` / `none` |
| `hideWhenFullscreen` | `true` | 独占 / D3D / 无边框铺满监视器时隐藏 |
| `hideWhenPresentation` | `true` | Windows 演示模式时隐藏 |

保存配置后，加载器会重新注入 `mod.js` 并 `invoke('configure')`。WinUI 进程不会随配置保存而重启，只收一条 JSON。可见性跟随 ECHO `taskbarMiniPlayerEnabled`，没有单独的「替换原版」开关。

## 原理 How it works

- `main.cjs` 只做桥：拉起 `echomod/host/EchoAudioBand.exe`，用 named pipe 走 JSON Lines（WinUI WinExe 不能重定向 stdio，否则 Windows App Runtime 会在启动时崩）。
- 官方 `ECHO Taskbar Mini Player` 窗口在 `loadFile` / `loadURL` / `browser-window-created` 时立刻隐藏，不销毁，以免拆掉 ECHO 自己的 IPC。
- 歌词通过 `sdk.list` / `sdk.call` 发现 `echo.lyrics`、`echo.desktopLyrics`、`echo.playback`、`echo.streaming.getLyrics`，不写死某一版方法名。
- WinUI 进程自己算任务栏几何（`TaskbarAl`、任务列表、`TrayNotifyWnd`）、系统主题、全屏 / 演示检测，并画条。
- `mod.js` 只在拥有 `window.echo.playback` 的窗口里按 `pollIntervalMs` 读播放状态和歌词，封面转 data URL 后 `main.invoke('status')`。

协议（每行一条 JSON）：

- 主进程 → host：`config` / `status` / `quit`
- host → 主进程：`ready` / `command` / `log`

## 限制 Limitations

- 垂直任务栏或任务栏自动隐藏时，改为贴在工作区右下角上方的浮动条。
- 需要 ShinawaseLoader native host（`main.cjs`）以及编好的 WinUI host。
- 不 `SetParent` 进任务栏：Win11 任务栏嵌入不稳定。窗口用 `WS_EX_NOACTIVATE` + topmost 叠在条上。
- Win10 没有 Mica，host 会改用 Acrylic。

## v1.4.0

- 开启原版任务栏迷你播放器后自动使用模组条，原版窗口保持隐藏。
- 歌词模式：双行、溢出滚动、切行流光；悬停在歌曲 / 歌词之间对调预览。
- 任务栏几何适配系统靠左 / 居中，并自动对齐托盘。
- 悬停封面显示大封面、艺术家、专辑；点击封面打开 ECHO。
- 歌词走 `sdk.list` / `sdk.call`，不再猜测或绕过公共 API。

## v1.3.0

- 任务栏条从 Electron `BrowserWindow` 换成独立 WinUI 3 进程（Windows App SDK 1.6，自包含 publish）。
- 全屏 / 演示模式隐藏；离开全屏后约 400ms 再显示，避免 Alt-Tab 闪烁。

## 灵感 Credit

Inspired by [AudioBand](https://github.com/AudioBand/AudioBand).
