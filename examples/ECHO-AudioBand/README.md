# ECHO AudioBand

把 [AudioBand](https://github.com/AudioBand/AudioBand) 的「任务栏正在播放」条移植到 ECHO：封面、滚动标题、可拖进度、上一首 / 播放暂停 / 下一首，叠在 Windows 任务栏上方（靠近托盘）。由 ShinawaseLoader 作为外部 Mod 注入。

A port of the [AudioBand](https://github.com/AudioBand/AudioBand) taskbar now-playing bar to the ECHO music app, implemented as a ShinawaseLoader external mod. Album art, scrolling title/artist, a seekable progress bar, and playback controls sit on top of the Windows taskbar near the tray.

## 功能 Features

- 叠在任务栏条内的无边框置顶窗口（靠近系统托盘）
- 封面、滚动标题 / 艺人、可点击进度条、上一首 / 播放暂停 / 下一首
- 由 ECHO 播放状态驱动，并控制 ECHO 播放
- 主题 `auto` 跟随系统任务栏深浅色，也可强制深色 / 浅色；强调色、透明度、自动隐藏
- 靠右时自动避开系统托盘（托盘变宽/变窄会跟着让位）
- 悬停封面弹出大图预览（曲名 / 艺人 / 专辑）
- 中键单击进度条以外的条身切下一首
- 无缝融合任务栏：直角、不透明、填满任务栏条高度，视觉上如同嵌入（不改变窗口层级）

## 配置 Config

| 键 Key | 默认 Default | 说明 |
| --- | --- | --- |
| `locale` | `auto` | `auto` / `zh-CN` / `en-US` |
| `widgetWidth` | `360` | 条宽度，200–800 |
| `alignment` | `right` | `left` / `center` / `right` |
| `offsetX` | `180` | 靠左时的水平内边距；靠右且自动避开托盘可用时忽略 |
| `offsetY` | `0` | 垂直偏移 |
| `monitor` | `primary` | `primary` 或显示器索引（0 起） |
| `customHeight` | `48` | 垂直任务栏或自动隐藏时的浮动高度 |
| `showAlbumArt` | `true` | 显示封面 |
| `showControls` | `true` | 显示控制按钮 |
| `showProgress` | `true` | 显示进度条 |
| `showTime` | `false` | 显示 `mm:ss / mm:ss` |
| `theme` | `auto` | `auto` / `dark` / `light`（`auto` 跟随任务栏深浅色） |
| `accentColor` | `#4da3ff` | 进度与悬停强调色 |
| `backgroundOpacity` | `88` | 0–100 |
| `scrollingText` | `true` | 溢出时滚动标题 |
| `autoHideWhenStopped` | `false` | 停止且无标题超过 8 秒后隐藏 |
| `pollIntervalMs` | `1000` | 渲染进程轮询间隔，250–5000 |
| `autoAvoidTray` | `true` | 靠右时按托盘矩形自动让位 |
| `hoverPreview` | `true` | 悬停封面时显示大图预览 |
| `seamlessMode` | `false` | 直角、不透明、填满任务栏条，视觉上如同嵌入（不改变窗口层级） |

保存配置后，加载器会重新注入 `mod.js`（带上新配置）并 `invoke('configure')` 到已运行的 `main.cjs`。主进程不会随配置保存而重启。

## 原理 How it works

- `main.cjs` 在 ECHO 的 Electron 主进程里开一个 frameless、always-on-top 的 `toolbar` 窗口，按显示器工作区与边界的差值定位任务栏条，并加载 `widget.html`。
- 长驻 `taskbar-helper.ps1` 通过 JSON Lines 查询托盘矩形 / 系统深浅色。
- `mod.js` 只在拥有 `window.echo.playback` 的窗口里按 `pollIntervalMs` 读取 `player.status()` / `player.queue()`，把封面转成 data URL 后 `main.invoke('status')`。组件窗口自身被跳过。
- 组件按钮通过 IPC 回到主进程，再 `host.broadcast('command')` 给 `mod.js` 调用 `play` / `pause` / `next` / `previous` / `seek`。

## 限制 Limitations

- 垂直任务栏（左/右）或任务栏自动隐藏时，改为贴在工作区右下角上方的浮动条。
- 需要 ShinawaseLoader 的 native host / main-bootstrap（`main.cjs`）。未启用时会提示一次。
- Win10/11 任务栏 z-order 不保证：窗口使用 `setAlwaysOnTop(..., 'screen-saver')`，部分系统仍可能把任务栏画在上面。
- 助手进程不可用时：主题 `auto` 回退为深色，托盘避让回退为 `offsetX`。

## 已知问题 / Fixed in 1.1.0

- 1.0.0：`mod.js` 注入到所有窗口（含组件自身）。没有 `window.echo.playback` 的窗口会把空的 `stopped` 状态推到主进程，与主窗口的真实状态来回覆盖，播放信息无法同步。1.1.0 跳过组件窗口，并只在拥有 playback 的窗口启动轮询。
- 1.0.0：播放与暂停图标同时显示，因为 SVG 没有 `.hidden` IDL 属性。1.1.0 用 `.is-playing` CSS 切换。

## v1.2.0

- SetParent 真正嵌入任务栏已移除：实测会打断 Chromium 的鼠标输入，并与透明窗口合成冲突。`seamlessMode` 是视觉替代（直角、不透明、填满任务栏条高度，不改变窗口层级）。
- 跑马灯不再每秒重建 DOM / 重启动画，循环起始处有短暂停顿。
- 重新安装 `.echomod` 包会把该包的 `config.json` 重置为默认值（加载器行为）。

## 灵感 Credit

Inspired by [AudioBand](https://github.com/AudioBand/AudioBand).
