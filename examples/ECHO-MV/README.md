# ECHO MV

恢复官方发布版剥离的 MV（音乐视频）功能：播放条入口、原版 MV 面板与设置、在线视频源应用内播放、外部搜索（仅外部打开）。由 ShinawaseLoader 在 ECHO 主进程注入 `main.cjs`，渲染端由同包 `mod.js` 对接。

Restores the music-video backend that shipping ECHO builds omit. ShinawaseLoader loads `main.cjs` inside the Electron main process; the renderer UI lives in `mod.js`.

## 使用

- 播放条 **MV 按钮**：进入 MV 模式并自动匹配加载，**不会**弹出设置
- 歌词页 **右上角胶片图标**（或标题栏 MV 设置、`app:open-mv-settings`）：拉开右侧 MV 设置抽屉
- 普通 **歌词入口** 只显示歌词；从 MV 切回歌词立即停止并移除视频。只有明确进入 MV 模式才显示、播放视频，重载 Mod 不恢复上次的 MV 模式。
- 抽屉里的 **「启用 MV」总开关**：控制 MV 功能是否可用，不会让普通歌词页自动播放视频；后台预加载仅准备匹配结果。
- 抽屉内按 `Esc` 或点遮罩关闭
- 注意：没有正在播放的曲目时，播放条与歌词页由应用本身隐藏，MV 按钮也会跟着不可见

## 功能

- 按曲目搜索 / 绑定 / 选择 MV，候选按 sourceId 去重持久化
- 本地扫描：音频同目录及 `MV` / `mv` / `video` / `videos` 子目录、上级 `MV` / `video`
- 在线视频源：搜索、DASH（AVC / AV1 可内嵌，无音轨；HEVC / 杜比视界除外）与 MP4 直链；流经 `echo-mv://` 代理
- 外部搜索：配置 API Key 后可搜索，解析结果恒为外部打开
- 自定义链接：视频页 URL 或源站视频编号
- 自动匹配：默认阈值 0.7；清理 `(LTD)` / `(Marathon)` 等曲库标签与通用艺人名，识别无空格中日文标题。强标题加时长或 MV 标记可自动应用；最多尝试 3 个相关候选，解析可播后提交（`selectionOrigin=auto`），保留手动绑定。
- 加载：自动预加载开启时随播放提前匹配；进入页面补加载、合并重复请求，近期搜索结果缓存 60 秒。空结果不缓存，再次进入可重试；播放错误自动刷新一次，并显示加载/失败状态。
- 播放恢复：歌曲恢复播放或视频缓冲完成后自动续播；各视频独立控制 seek 冷却，不打断未完成的自动跳转。可见页面中连续 12 秒无播放进展时，每个 MV 自动重载一次，仍失败则显示重试提示；暂停与隐藏页面不触发卡顿恢复。
- 临时流：不写盘，TTL ≤ 15 分钟，`echo-mv://ephemeral/{token}`
- 对齐音频起点：选中 MV 后，在「MV 音画校准」里点击「检测并对齐」。支持本地视频与 Bilibili 独立音轨，分析前 120 秒的首次持续声音并保存为该 MV 的起点；片头对白/音效也算声音，不做歌曲指纹匹配。可取消、手动微调或归零；失败不修改起点。需要应用附带或 PATH 中的 FFmpeg，检测最长 25 秒，MV 始终静音。

设置保存在 Steam 稳定版 `%APPDATA%\ECHO Steam\echo-mv-mod\store.json`，**不会**改写 `echo-settings.json`。

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| 外部搜索 API Key | `""` | 空则跳过外部搜索 |
| 视频源 Cookie | `""` | 可选覆盖，用于更高清晰度 |
| `debugLog` | `false` | 冗余日志（不会打印完整 Cookie） |

Mods 页的「配置」使用自定义配置页（`config-ui.js`）：API Key 与 Cookie 以密码框显示，可点击「显示 / 隐藏」切换。

MV 面板里的选项（自动搜索、清晰度上限、沉浸背景等）走 `mv.getSettings` / `mv.setSettings`，与 Loader 的 `config.json` 分开。

## 协议

已安装的 ECHO 已把 `echo-video` / `echo-mv` 登记为特权 scheme，但没有 handler。本 Mod 在 `app.whenReady()` 后补上：

- `echo-video://mv/{videoId}` — 本地文件，支持 Range / HEAD
- `echo-mv://stream/{videoId}/{variantId}` — 远端流代理（Referer / UA / Cookie）
- `echo-mv://ephemeral/{token}` — 临时流

`TrackVideo.filePath` 对外恒为 `null`。

## 开发

```powershell
node --check .\examples\ECHO-MV\echomod\main.cjs
node --test .\examples\ECHO-MV\dev\matching-regression.test.mjs
node --test .\examples\ECHO-MV\dev\audio-start.test.mjs
node --test .\examples\ECHO-MV\dev\playback-recovery.test.mjs
node .\examples\ECHO-MV\dev\test-engine.mjs
```

引擎测试不启动 ECHO，只用 Node 22 全局 `fetch` 访问在线视频源。若返回 412，属风控，不是语法错误。

## 限制

- DASH 内嵌是「只有画面」：音轨仍走 ECHO 正在播放的音频
- 无 Cookie 时 1080p+ 可能不可用，会降级
- 外部搜索结果不能在应用内播
- 需要 Loader native-host（`main.cjs`）。未启用时渲染端调 `main.invoke` 会失败
- 在线视频源可能 412 封禁直链，约 2 分钟内改外部打开
