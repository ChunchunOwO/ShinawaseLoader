# ECHO MV

恢复官方发布版剥离的 MV（音乐视频）功能：播放条入口、原版 MV 面板与设置、Bilibili 应用内播放、YouTube 搜索（仅外部打开）。由 ShinawaseLoader 在 ECHO 主进程注入 `main.cjs`，渲染端由同包 `mod.js` 对接。

Restores the music-video backend that shipping ECHO builds omit. ShinawaseLoader loads `main.cjs` inside the Electron main process; the renderer UI lives in `mod.js`.

## 使用

- 播放条只留 **MV 入口**：单击开关歌词页上的 Mod 自建 MV 面板（右键、`app:open-mv-settings` 打开设置）
- 抽屉里的 **「启用 MV」总开关**：控制是否搜索 / 播放 MV
- 官方歌词舞台布局保持不变；MV 背景和面板都由本 Mod 自己画，不依赖官方空壳导航
- 抽屉内按 `Esc` 或点遮罩关闭
- 注意：没有正在播放的曲目时，播放条与歌词页由应用本身隐藏，MV 按钮也会跟着不可见

## 功能

- 按曲目搜索 / 绑定 / 选择 MV，候选按 sourceId 去重持久化
- 本地扫描：音频同目录及 `MV` / `mv` / `video` / `videos` 子目录、上级 `MV` / `video`
- Bilibili：WBI 搜索、DASH（AVC / AV1 可内嵌，无音轨；HEVC / 杜比视界除外）与 MP4 直链；流经 `echo-mv://` 代理
- YouTube：配置 API Key 后可搜索，解析结果恒为外部打开
- 自定义链接：YouTube / Bilibili URL 或裸 BV 号
- 自动匹配：阈值 0.7、领先 0.08 / 高置信 0.86，先解析可播再提交（`selectionOrigin=auto`）
- 临时流：不写盘，TTL ≤ 15 分钟，`echo-mv://ephemeral/{token}`

设置保存在 ECHO `userData\echo-mv-mod\store.json`，**不会**改写 `echo-settings.json`。

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `youtubeApiKey` | `""` | YouTube Data API v3。空则跳过 YouTube 搜索 |
| `bilibiliCookie` | `""` | 可选覆盖。留空则复用流媒体 Mod 登录的 Bilibili Cookie，用于高码率 |
| `debugLog` | `false` | 冗余日志（不会打印完整 Cookie） |

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
node .\examples\ECHO-MV\dev\protocol-lookup-test.mjs
node .\examples\ECHO-MV\dev\test-engine.mjs
```

引擎测试不启动 ECHO，只用 Node 22 全局 `fetch` 打 Bilibili。若返回 412，属风控，不是语法错误。

## 限制

- DASH 内嵌是「只有画面」：音轨仍走 ECHO 正在播放的音频
- 无 Cookie 时 1080p+ 可能不可用，会降级
- YouTube 不能在应用内播
- 需要 Loader native-host（`main.cjs`）。未启用时渲染端调 `main.invoke` 会失败
- Bilibili 可能 412 封禁 playurl，约 2 分钟内改外部打开
- 开发时若用 native-host `/reload` 热重载 `main.cjs`：`unhandle` → `handle` 会使已打开页面丢失 `echo-mv` / `echo-video` 的 URLLoaderFactory（渲染端合成 404，且请求不会到达 handler），需刷新页面（并重注入 `mod.js`）恢复。正常随游戏启动加载不受影响
