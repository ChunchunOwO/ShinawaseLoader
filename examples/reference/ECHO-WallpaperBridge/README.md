# ECHO Wallpaper Bridge

参考 Mod：不出现在安装器可选包。自行打包后导入。 See [`../README.md`](../README.md).

在 ECHO 内直接查看 Wallpaper Engine 桥接的实时数据：32 段频谱可视化、能量 / 瞬态仪表、正在播放与输出模式。数据来自 ECHO 主进程内置的本地桥接服务（SSE），与 Wallpaper Engine 网页壁纸使用完全相同的数据源。派生自 ECHO 仓库 `examples/wallpaper-engine/echo-bridge-example.js` 的接入模式。

An in-app viewer for ECHO's built-in Wallpaper Engine bridge: a live 32-band spectrum visualizer, energy / transient meters, now-playing and output-mode readouts. It consumes the same localhost SSE stream that Wallpaper Engine web wallpapers use, following the pattern of `examples/wallpaper-engine/echo-bridge-example.js` in the ECHO repository.

## 数据源 Data source

支持 Wallpaper Engine 桥接的 ECHO 版本会在启动时开启一个仅监听本机的 HTTP 服务（默认 `http://127.0.0.1:47668`）：

| Endpoint | 说明 |
| --- | --- |
| `/health` | 服务状态与已连接客户端数 |
| `/snapshot` | 当前快照（单次 JSON） |
| `/events` | SSE 事件流，`snapshot` 事件随播放状态推送 |
| `/echo-wallpaper-engine.js` | 官方帮助脚本，供网页壁纸引用 |

快照包含 `track`（标题 / 艺人 / 封面 / 进度）、`audio`（`visualSpectrum` 32 段、`visualEnergy`、`visualTransient`、遥测状态）与 `scene`（音乐响应场景参数）。

## 功能 Features

- Loader 侧栏「壁纸桥接」页：连接状态、正在播放卡片、频谱画布、能量 / 瞬态仪表、输出模式徽章
- 断线自动重连（EventSource 原生重试），并提供手动重连按钮
- 可选把 `--echo-wallpaper-*` CSS 变量写到 ECHO 窗口根元素（与官方帮助脚本同名同义），主题和其他 Mod 可以直接引用
- 频谱颜色默认跟随 ECHO 主题强调色（`--theme-accent-solid-bg` / `--color-accent`，含 Loader 外观设置的强调色覆盖），也可固定为自定义颜色
- 自定义配置页（`configUi`），包含桥接连通性测试

## 配置 Config

| 键 Key | 默认 Default | 说明 |
| --- | --- | --- |
| `bridgeUrl` | `http://127.0.0.1:47668` | 桥接服务地址 |
| `barCount` | `32` | 频谱条数量，8–32 |
| `applyCssVariables` | `false` | 是否导出 `--echo-wallpaper-*` CSS 变量 |
| `accentColor` | `""` | 频谱颜色（`#RRGGBB`），留空跟随主题 |

## 打包 Pack

```powershell
.\pack-mod.bat .\examples\reference\ECHO-WallpaperBridge\echomod .\examples\reference\packages\ECHO-WallpaperBridge.echomod --zip
```

## 注意 Notes

- 桥接服务由 ECHO 自身启动；若测试连接失败，请确认当前 ECHO 版本包含 Wallpaper Engine 桥接。
- 服务仅监听 `127.0.0.1`，不会暴露到局域网。
- 本 Mod 只读取快照，不控制播放。
