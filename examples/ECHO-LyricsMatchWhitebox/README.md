# ECHO Lyrics Match Whitebox

**Loader Mod only** — does not patch ECHO / ECHOSteam source.

Steam 默认关闭 `lyricsCandidatePanelAutoOpenEnabled`，网络匹配在后台进行但不弹出候选面板。本 Mod：

1. 打开该开关，让官方 `lyrics-match-panel` 显示匹配结果
2. 在歌词设置抽屉「当前歌曲」操作区注入 **重新匹配**（Steam 本体没有），点击后派发 `lyrics:rematch-requested`，清空缓存并重新打开候选面板
3. 可选注入「自动打开候选」开关

## 安装

导入 `examples/packages/ECHO-LyricsMatchWhitebox.echomod` 到 `Mods`，用 `ECHO.modded.exe` 启动。

## 配置

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `forceEnable` | `true` | 启动时打开自动弹出候选 |
| `keepForced` | `false` | 被关掉后是否再次强制打开 |
| `injectToggle` | `true` | 在「匹配 → 当前歌曲」自动化区注入「自动打开候选」 |
| `injectRematch` | `true` | 注入「重新匹配」按钮 |
| `closeDrawerOnRematch` | `true` | 重新匹配后关闭抽屉以便看到面板 |
| `notify` | `true` | toast |
| `locale` | `auto` | 文案语言 |

## 自检

```powershell
node .\scripts\_smoke-lyrics-whitebox.cjs
node .\scripts\pack-echomod.mjs .\examples\ECHO-LyricsMatchWhitebox\echomod .\examples\packages\ECHO-LyricsMatchWhitebox.echomod
```
