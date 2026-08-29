# ECHO Steam Listen Board

官方加载器测试 Mod：只检查**当前 ECHO 进程**里已经初始化的 Steam 运行时，并把聆听排行榜 / 用户统计写到 Steam App ID **5105150**。不随 `setup-modloader` 安装，也不在 examples/packages 的安装器可选列表里。

Official loader test package: inspect the **in-process** ECHO Steam runtime and upload listening leaderboard / user-stat data for Steam App ID **5105150**. Standalone — not copied by `setup-modloader.bat` and not listed in the installer optional packages.

## 打包 Pack

```powershell
.\pack-mod.bat .\examples\ECHO-SteamListenBoard\echomod .\examples\packages\ECHO-SteamListenBoard.echomod --zip
```

把生成的 `.echomod` 放到游戏 `Mods` 目录，或在加载器 Mods 页导入。This is not bundled by setup; pack and drop it yourself.

## 启动 Launch

必须通过 **ShinawaseLoader / Mod Loader**（inspector + native-host）启动 ECHO，这样 `main.cjs` 才会在 Electron 主进程里运行。

Must launch Echo via the Mod Loader (inspector / native-host). The raw Steam shortcut does **not** load `main.cjs`, so inspect / upload will be unavailable.

## 做什么 What it does

侧栏页「Steam 聆听排行榜测试 / Steam LB Test」：

1. 检查当前 ECHO 进程（pid、App ID、已加载的 `echo-steam-leaderboards` / `steamworksjs` / `steam_api64.dll`）
2. 读取 Steam 运行时状态与本地 Steam ID（仅当前用户，只读展示）
3. 读取 `LibraryService.getSteamLeaderboardHistoryStats()` 的本地聆听统计（可编辑）
4. 打开 ECHO 的 `steamLeaderboardsEnabled`（默认关闭）
5. 走官方 `SteamLeaderboardService.sync(stats, true)`（找不到服务时再对 5 个官方榜 `findLeaderboard` + `uploadScore`）
6. 可选：按只增策略同步 `ECHO_STAT_*` 用户统计（`max(remote, local)` + `stats.store()`）
7. 自定义单榜上传（allowlist + dry-run）与下载条目表

Does **not** `OpenProcess` other PIDs, does **not** inject, does **not** call `steamworks.init()` a second time, does **not** call `echo-steam-leaderboards` `initialize()` (ECHO already did), and does **not** `FindOrCreateLeaderboard`. Steam ID is local identity only.

## 排行榜 Boards

App ID: `5105150`

| boardId | apiName | score field |
| --- | --- | --- |
| `listening-time` | `ECHO_LISTENING_SECONDS_V1` | `totalPlayedSeconds` |
| `completed-tracks` | `ECHO_COMPLETED_TRACKS_V1` | `completedUniqueTracks` |
| `listening-streak` | `ECHO_LONGEST_STREAK_DAYS_V1` | `longestCompletionStreakDays` |
| `deep-session` | `ECHO_LONGEST_SESSION_SECONDS_V1` | `longestListeningSessionSeconds` |
| `rediscovered-tracks` | `ECHO_REDISCOVERED_TRACKS_V1` | `rediscoveredTrackCount` |

`uploadScore` 的 details 固定 7 个 int32：

`[completedUniqueTracks, listeningSessionCount, longestListeningSessionSeconds, longestCompletionStreakDays, nightPlayedSeconds, rediscoveredTrackCount, completedShortUniqueTracks]`

分数钳制在 `0..2147483647`。原生 addon 的 `uploadScore(handle, score, details)` 不传 method，ECHO 侧等价于 **KeepBest**。

下载范围：

- `global` — request 0, start 1, end 50
- `around-user` — request 1, start -4, end 5
- `friends` — request 2, start 0, end 0

用户统计（可选）：`ECHO_STAT_LISTEN_MINUTES`、`ECHO_STAT_COMPLETED_PLAYS`、`ECHO_STAT_UNIQUE_TRACKS`、`ECHO_STAT_LONGEST_STREAK_DAYS`、`ECHO_STAT_NIGHT_MINUTES`、`ECHO_STAT_LONGEST_SESSION_MINUTES`、`ECHO_STAT_REDISCOVERED_TRACKS`、`ECHO_STAT_COMPLETED_ALBUMS`。只升不降。

ECHO 设置：`steamLeaderboardsEnabled` 默认 `false`；`steamListeningStatsEnabled` 默认 `true`。

## 安全 Safety

- **进程内 only**：`native.modules()` / Toolhelp 快照都是当前 PID。不打开其他进程，不注入。
- **不二次初始化 Steam**：复用 `require.cache` 里 ECHO 已经 `init` 过的 steamworks.js，以及已经 `initialize(dllPath)` 过的 `echo-steam-leaderboards.node`。本 Mod **不会**再 `require` 另一份 addon，也 **不会**调用 `binding.initialize`。
- **会写到线上 Steam 榜**：KeepBest，通常不会把更高分改低，但仍是对 App 5105150 的真实写入。
- **不能替别人上传**：Steam ID 只显示本地玩家。
- **不要** 对 `steam:*` IPC 使用 `hookIpc`（原 handler 会丢）。本 Mod 只调用已有 handler 或 ECHO 服务对象。

## 配置 Config

| 键 Key | 默认 Default | 说明 |
| --- | --- | --- |
| `locale` | `auto` | `auto` / `zh-CN` / `en-US` |
| `confirmBeforeUpload` | `true` | 自定义上传前确认（渲染进程）；主进程仍拒绝未知榜单 |
| `alsoSyncUserStats` | `false` | 官方同步排行榜后是否再同步 `ECHO_STAT_*` |
| `allowCustomScores` | `true` | 允许自定义单榜上传 |
| `defaultBoard` | `listening-time` | 默认榜单 |
| `defaultScore` | `0` | 自定义分数；`0` 表示用本地统计字段 |
| `defaultScope` | `global` | 下载条目范围 |

## 注意 Notes

- 未通过加载器启动时，侧栏会提示需要 native host，Steam 快捷方式无法加载 `main.cjs`。
- 本包不附带 `steam_api64.dll`。
- 只检查**当前进程**（`process.execPath` / `argv0` / `app.getPath('exe')`），优先匹配稳定版 `ECHO.exe` / `ECHO Steam.exe` / `ECHO.modded.exe`，并仍接受遗留进程名 `ECHO NEXT.exe` / `ECHO Playtest.exe`，以及 `app.echo.steam` / `SteamAppId=5105150` / `ECHO_GAME_ROOT` / 已加载的 `steam_api64.dll` 等信号。不会 OpenProcess 其他 PID。`steam_api64.dll` 对齐 `resources\app.asar.unpacked\node_modules\steamworks.js\dist\win64\`。
- 只有已经读到**另一个**数字 App ID（不是 `5105150`）时，上传 / 同步才会被拒绝。环境里没有 App ID、值为空 / 0 / 未设置时，检查、状态、本地统计、启用、下载条目仍可用，界面只给警告（上传走当前已初始化的 Steam 会话）。**不会**把未知 App ID 当成外部 App、也不会因此灰掉整页。缺少 native host 时提示需要加载器启动。
