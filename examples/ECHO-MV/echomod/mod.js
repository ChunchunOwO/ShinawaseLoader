if (window.__echoMvModActive) return () => {};
window.__echoMvModActive = true;

const I18N = {"zh":{"mvPanel.title":"MV","mvPanel.action.settings":"设置","mvPanel.action.search":"搜索","mvPanel.candidates.empty":"暂无候选","mvPanel.action.close":"关闭","mvPanel.action.hide":"隐藏","mvPanel.action.expand":"展开","mvPanel.action.copied":"已复制","mvPanel.action.copy":"复制","mvPanel.action.dismissUnavailable":"关闭 MV 不可用提示","mvPanel.diagnostics.title":"MV 诊断报告","mvPanel.notice.unavailable":"MV 不可用","mvPanel.status.bilibiliBlocked":"Bilibili 暂时拒绝直链解析。可以在 MV 设置里打开诊断报告、配置 Bilibili Cookie，或先外部打开。","mvPanel.status.databaseUnread":"MV 数据库不可读。先到曲库恢复里修复数据库；修复前可以在 MV 设置里临时绑定本地视频或自定义链接。","mvPanel.status.externalRequired":"当前 MV 需要外部播放。点 MV 设置里的“在外部打开”，或换一个应用内候选。","mvPanel.status.inAppUnavailable":"当前 MV 暂时不能在应用内播放。可以降低最高画质、换来源，或外部打开。","mvPanel.status.loadFailed":"MV 加载失败","mvPanel.status.loading":"正在加载 MV","mvPanel.status.localUnsupported":"本地视频格式不支持。请换成 mp4/webm，或用系统播放器外部打开。","mvPanel.status.missingUrl":"缺少可播放地址。请在 MV 设置里重新搜索、手动粘贴链接，或导入本地视频。","mvPanel.status.networkFailed":"网络 MV 请求失败。先检查代理/网络；也可以在 MV 设置里切换 Bilibili/YouTube 来源、降低画质后重试。","mvPanel.status.notFound":"未找到可播放 MV。可以打开 MV 设置手动搜索、粘贴 Bilibili/YouTube 链接，或导入本地视频。","mvPanel.status.temporaryPlayback":"临时 MV 播放中，数据库待修复","mvPanel.status.unavailable":"MV 不可用","mvPanel.status.videoFailed":"视频加载失败。请换一个候选、降低画质，或外部打开；本地视频可换成浏览器支持的 mp4/webm。","playerTransport.action.mv":"MV","route.mvSettings.description":"MV 绑定与本地匹配设置。","route.mvSettings.label":"MV 设置","mvSettings.action.chooseFile":"导入本地视频","mvSettings.action.close":"关闭 MV 设置","mvSettings.action.collapseNetwork":"折叠网络来源","mvSettings.action.dragReorder":"拖拽调整优先级","mvSettings.action.dragSource":"拖拽 {provider} 调整优先级","mvSettings.action.expandNetwork":"展开网络来源","mvSettings.action.findLocal":"查找本地","mvSettings.action.openExternal":"在外部打开已选 MV","mvSettings.action.refresh":"刷新","mvSettings.action.removeSelected":"移除已选 MV","mvSettings.action.searchNetwork":"搜索网络 MV","mvSettings.aria.candidates":"MV 候选列表","mvSettings.aria.drawer":"MV 设置","mvSettings.aria.engineStatus":"MV 引擎状态","mvSettings.aria.maxQuality":"最高画质 {quality}","mvSettings.aria.maxQualityOptions":"最高画质选项","mvSettings.aria.networkSources":"网络来源优先级","mvSettings.aria.selectedQuality":"已选 MV 画质 {quality}","mvSettings.aria.selectedQualityOptions":"已选 MV 画质选项","mvSettings.badge.credentialsMain":"凭据保留在主进程","mvSettings.badge.proxyOnly":"仅代理访问","mvSettings.binding.selectedMv":"已选 MV","mvSettings.binding.title":"MV来源","mvSettings.candidate.external":"外部","mvSettings.candidate.inApp":"应用内","mvSettings.custom.apply":"应用自定义 MV","mvSettings.custom.description":"粘贴 YouTube 或 Bilibili 视频链接作为当前 MV。","mvSettings.custom.directDash":"直连流（DASH）","mvSettings.custom.input":"自定义 MV 链接","mvSettings.custom.placeholder":"https://youtube.com/watch?v=... 或 BVxxxxxxxx","mvSettings.custom.playing":"正在播放：{provider} - {sourceId}","mvSettings.custom.title":"自定义 MV","mvSettings.custom.videoTitle":"视频标题：{title}","mvSettings.engine.mvTitle":"MV标题","mvSettings.engine.network":"网络","mvSettings.engine.quality":"画质","mvSettings.engine.selected":"已选","mvSettings.engine.title":"MV 引擎","mvSettings.error.actionFailed":"MV 操作失败。请稍后重试，或先换成本地视频/自定义链接。","mvSettings.error.bilibiliBlocked":"Bilibili 解析被拦截。先打开 MV 诊断报告，配置 Bilibili Cookie 或外部打开；原始原因：{reason}","mvSettings.error.noActiveTrackBinding":"没有可用于 MV 绑定的当前曲库歌曲","mvSettings.error.noActiveTrackMatching":"没有可用于 MV 匹配的当前曲库歌曲","mvSettings.error.noActiveTrackNetworkSearch":"没有可用于网络 MV 搜索的当前曲库歌曲","mvSettings.error.databaseUnavailable":"MV 数据库暂时不可读，请先到曲库恢复里修复数据库。","mvSettings.error.noLocalCandidates":"没有找到本地 MV 候选","mvSettings.error.noNetworkCandidates":"没有找到网络 MV 候选","mvSettings.error.networkFailed":"网络 MV 请求失败。先检查代理/网络，或切换来源、降低最高画质后重试；原始原因：{reason}","mvSettings.general.enabled":"启用 MV","mvSettings.immersive.blur":"毛玻璃模糊","mvSettings.immersive.autoScale":"自动缩放","mvSettings.immersive.autoScaleDescription":"根据 MV 宽高自动补偿缩放，尽量避免背景黑边。","mvSettings.immersive.brightness":"背景亮度","mvSettings.immersive.description":"开启后，歌词页使用当前 MV 作为背景。","mvSettings.immersive.dragHint":"也可以在歌词页空白处拖动调整。","mvSettings.immersive.hideLyrics":"MV 界面隐藏歌词","mvSettings.immersive.hideLyricsDescription":"开启后，切到 MV 界面时不显示歌词文本；默认关闭。","mvSettings.immersive.lyricsReadability":"歌词可读性增强","mvSettings.immersive.lyricsReadabilityDescription":"为沉浸式 MV 上的歌词增加描边和投影。","mvSettings.immersive.overlay":"暗色遮罩","mvSettings.immersive.overlayHint":"越低越接近原片，越高歌词越清晰。","mvSettings.immersive.positionX":"横向位置","mvSettings.immersive.positionY":"纵向位置","mvSettings.immersive.reset":"重置沉浸式背景","mvSettings.immersive.title":"沉浸式 MV 背景","mvSettings.immersive.tuning":"沉浸式背景调节","mvSettings.immersive.visualHint":"用于调节沉浸式背景观感。","mvSettings.immersive.zoom":"背景缩放","mvSettings.network.autoApply":"自动搜索网络MV","mvSettings.network.autoApplyThreshold":"自动应用匹配度","mvSettings.network.autoApplyThresholdDescription":"候选达到 {threshold} 以上才会自动应用。","mvSettings.network.autoPreload":"是否预加载MV","mvSettings.network.autoPreloadDescription":"开启后，只要播放歌曲就会尝试提前查找并准备当前歌曲的 MV。","mvSettings.network.diagnosticsReport":"MV 诊断报告","mvSettings.network.diagnosticsReportDescription":"默认关闭；开启后，MV 页面无画面时显示可复制的本机诊断信息。","mvSettings.network.allow60fps":"允许 60fps","mvSettings.network.allow60fpsDescription":"允许选择 60fps 画质。","mvSettings.network.maxQuality":"最高画质","mvSettings.network.preferHighestViewCount":"按播放量匹配","mvSettings.network.preferHighestViewCountDescription":"只在匹配度相同且已通过自动应用门槛的候选中优先播放量。","mvSettings.network.titleOnlySearch":"只用歌曲名搜 MV","mvSettings.network.titleOnlySearchDescription":"开启后自动搜索只用歌曲名；关闭后使用歌曲名和歌手。","mvSettings.network.replayAudioOnChange":"切换MV后自动重播音乐","mvSettings.network.replayAudioOnChangeDescription":"开启后，手动选择或绑定新的 MV 会重新播放当前歌曲，让新 MV 立即生效。","mvSettings.network.restartAudioOnLoad":"MV 跟随音乐进度","mvSettings.network.restartAudioOnLoadDescription":"开启后，会持续校准 MV 视频时间，不会 seek 或重启音频；歌词同步偏移不会影响 MV。","mvSettings.network.syncMode":"同步模式","mvSettings.network.syncModeDescription":"轻微偏差用变速追平，大偏差才跳转视频。","mvSettings.network.syncMode.stable":"稳定","mvSettings.network.syncMode.balanced":"均衡","mvSettings.network.syncMode.precise":"精准","mvSettings.network.title":"网络来源","mvSettings.offset.aria":"MV 同步延迟","mvSettings.offset.description":"正数让 MV 画面提前，负数让 MV 画面延后；只记住当前歌曲的 MV。","mvSettings.offset.earlier":"MV 提前 {value}","mvSettings.offset.earlierShort":"提前 {value}","mvSettings.offset.input":"偏移秒数","mvSettings.offset.later":"MV 延后 {value}","mvSettings.offset.laterShort":"延后 {value}","mvSettings.offset.replay":"重播","mvSettings.offset.replayTitle":"重新播放当前歌曲，并按 MV 起播点同步视频","mvSettings.offset.reset":"重置 MV 延迟","mvSettings.offset.resetShort":"重置","mvSettings.offset.slider":"MV 同步延迟滑杆","mvSettings.offset.startDescription":"输入视频里的起点秒数，最高 600 秒；这首歌会直接从那里对齐播放。","mvSettings.offset.startInput":"MV 起播秒数","mvSettings.offset.startTitle":"从第几秒开始播放","mvSettings.offset.step":"调节步长","mvSettings.offset.title":"MV 音画校准","mvSettings.provider.local":"本地","mvSettings.quality.max":"最高","mvSettings.search.input":"MV 搜索关键词","mvSettings.search.placeholder":"输入 MV 搜索关键词","mvSettings.search.useCurrentSong":"使用当前歌曲和歌手搜索","mvSettings.status.auto":"自动","mvSettings.status.noActiveTrack":"没有当前歌曲","mvSettings.status.none":"无","mvSettings.status.off":"关闭","mvSettings.status.on":"开启","mvSettings.title":"MV 设置"},"en":{"mvPanel.title":"MV","mvPanel.action.settings":"Settings","mvPanel.action.search":"Search","mvPanel.candidates.empty":"No candidates","mvPanel.action.close":"Close","mvPanel.action.hide":"Hide","mvPanel.action.expand":"Expand","mvPanel.action.copied":"Copied","mvPanel.action.copy":"Copy","mvPanel.action.dismissUnavailable":"Dismiss MV unavailable notice","mvPanel.diagnostics.title":"MV Diagnostics Report","mvPanel.notice.unavailable":"MV unavailable","mvPanel.status.bilibiliBlocked":"Bilibili temporarily blocked direct stream parsing. Enable the MV diagnostics report, add a Bilibili cookie, or open it externally for now.","mvPanel.status.databaseUnread":"MV database is unreadable. Repair the library database first; until then, bind a local video or custom link in MV Settings.","mvPanel.status.externalRequired":"This MV requires external playback. Use Open externally in MV Settings, or choose another in-app candidate.","mvPanel.status.inAppUnavailable":"This MV cannot play in-app right now. Lower the max quality, switch source, or open it externally.","mvPanel.status.loadFailed":"MV failed to load","mvPanel.status.loading":"Loading MV","mvPanel.status.localUnsupported":"Local video format is not supported. Use mp4/webm, or open it with the system player.","mvPanel.status.missingUrl":"Missing playable URL. Search again in MV Settings, paste a link manually, or import a local video.","mvPanel.status.networkFailed":"Network MV request failed. Check proxy/network, or switch Bilibili/YouTube source and lower quality in MV Settings before retrying.","mvPanel.status.notFound":"No playable MV found. Open MV Settings to search manually, paste a Bilibili/YouTube link, or import a local video.","mvPanel.status.temporaryPlayback":"Temporary MV playing; database still needs repair","mvPanel.status.unavailable":"MV unavailable","mvPanel.status.videoFailed":"Video failed to load. Try another candidate, lower quality, or open externally; for local videos, use browser-supported mp4/webm.","playerTransport.action.mv":"MV","route.mvSettings.description":"MV binding and local matching settings.","route.mvSettings.label":"MV Settings","mvSettings.action.chooseFile":"Import local video","mvSettings.action.close":"Close MV settings","mvSettings.action.collapseNetwork":"Collapse network sources","mvSettings.action.dragReorder":"Drag to set priority","mvSettings.action.dragSource":"Drag {provider} to set priority","mvSettings.action.expandNetwork":"Expand network sources","mvSettings.action.findLocal":"Find local","mvSettings.action.openExternal":"Open selected MV externally","mvSettings.action.refresh":"Refresh","mvSettings.action.removeSelected":"Remove selected MV","mvSettings.action.searchNetwork":"Search network MV","mvSettings.aria.candidates":"MV candidates","mvSettings.aria.drawer":"MV settings","mvSettings.aria.engineStatus":"MV engine status","mvSettings.aria.maxQuality":"Max quality {quality}","mvSettings.aria.maxQualityOptions":"Max quality options","mvSettings.aria.networkSources":"Network source priority","mvSettings.aria.selectedQuality":"Selected MV quality {quality}","mvSettings.aria.selectedQualityOptions":"Selected MV quality options","mvSettings.badge.credentialsMain":"Credentials stay in main","mvSettings.badge.proxyOnly":"Proxy only","mvSettings.binding.selectedMv":"Selected MV","mvSettings.binding.title":"MV Source","mvSettings.candidate.external":"External","mvSettings.candidate.inApp":"In-app","mvSettings.custom.apply":"Apply custom MV","mvSettings.custom.description":"Paste a YouTube or Bilibili video link as the current MV.","mvSettings.custom.directDash":"Direct stream (DASH)","mvSettings.custom.input":"Custom MV link","mvSettings.custom.placeholder":"https://youtube.com/watch?v=... or BVxxxxxxxx","mvSettings.custom.playing":"Now playing: {provider} - {sourceId}","mvSettings.custom.title":"Custom MV","mvSettings.custom.videoTitle":"Video title: {title}","mvSettings.engine.mvTitle":"MV Title","mvSettings.engine.network":"Network","mvSettings.engine.quality":"Quality","mvSettings.engine.selected":"Selected","mvSettings.engine.title":"MV Engine","mvSettings.error.actionFailed":"MV action failed. Try again later, or switch to a local video/custom link for now.","mvSettings.error.bilibiliBlocked":"Bilibili parsing was blocked. Enable the MV diagnostics report, add a Bilibili cookie, or open externally. Original reason: {reason}","mvSettings.error.noActiveTrackBinding":"No active library track for MV binding","mvSettings.error.noActiveTrackMatching":"No active library track for MV matching","mvSettings.error.noActiveTrackNetworkSearch":"No active library track for network MV search","mvSettings.error.databaseUnavailable":"MV database is temporarily unavailable. Repair the database in Library Recovery first.","mvSettings.error.noLocalCandidates":"No local MV candidates found","mvSettings.error.noNetworkCandidates":"No network MV candidates found","mvSettings.error.networkFailed":"Network MV request failed. Check proxy/network, or switch source and lower max quality before retrying. Original reason: {reason}","mvSettings.general.enabled":"Enable MV","mvSettings.immersive.blur":"Glass blur","mvSettings.immersive.autoScale":"Auto scale","mvSettings.immersive.autoScaleDescription":"Automatically compensates for the MV aspect ratio to reduce background black bars.","mvSettings.immersive.brightness":"Background brightness","mvSettings.immersive.description":"Use the current MV as the lyrics page background.","mvSettings.immersive.dragHint":"Drag empty space on the lyrics page to fine tune it.","mvSettings.immersive.hideLyrics":"Hide lyrics in MV view","mvSettings.immersive.hideLyricsDescription":"When enabled, lyrics text is hidden while the MV view is open. Off by default.","mvSettings.immersive.lyricsReadability":"Lyrics readability boost","mvSettings.immersive.lyricsReadabilityDescription":"Adds outline and shadow to lyrics over immersive MV.","mvSettings.immersive.overlay":"Dark overlay","mvSettings.immersive.overlayHint":"Lower keeps the MV closer to the original; higher keeps lyrics clearer.","mvSettings.immersive.positionX":"Horizontal position","mvSettings.immersive.positionY":"Vertical position","mvSettings.immersive.reset":"Reset immersive background","mvSettings.immersive.title":"Immersive MV background","mvSettings.immersive.tuning":"Immersive background tuning","mvSettings.immersive.visualHint":"Tune how the immersive background looks.","mvSettings.immersive.zoom":"Background zoom","mvSettings.network.autoApply":"Auto search network MV","mvSettings.network.autoApplyThreshold":"Auto-apply match","mvSettings.network.autoApplyThresholdDescription":"Only apply candidates at {threshold} or higher.","mvSettings.network.autoPreload":"Preload MV","mvSettings.network.autoPreloadDescription":"When enabled, playing a song will look up and prepare its MV ahead of time.","mvSettings.network.diagnosticsReport":"MV diagnostics report","mvSettings.network.diagnosticsReportDescription":"Off by default; when enabled, the MV page shows a copyable local report if no video is visible.","mvSettings.network.allow60fps":"Allow 60fps","mvSettings.network.allow60fpsDescription":"Allow 60fps quality when available.","mvSettings.network.maxQuality":"Max quality","mvSettings.network.preferHighestViewCount":"Match by views","mvSettings.network.preferHighestViewCountDescription":"Uses views only to break ties between candidates that already pass the auto-apply threshold.","mvSettings.network.titleOnlySearch":"Search MV by title only","mvSettings.network.titleOnlySearchDescription":"When enabled, automatic MV search uses only the song title. Turn it off to search by title and artist.","mvSettings.network.replayAudioOnChange":"Replay music after switching MV","mvSettings.network.replayAudioOnChangeDescription":"When enabled, manually selecting or binding a new MV replays the current song so the MV applies immediately.","mvSettings.network.restartAudioOnLoad":"Follow music progress","mvSettings.network.restartAudioOnLoadDescription":"When enabled, the MV video time is continuously corrected. Audio is not seeked or restarted, and lyrics sync offsets do not affect the MV.","mvSettings.network.syncMode":"Sync mode","mvSettings.network.syncModeDescription":"Small drift is corrected by video speed; large drift seeks the video.","mvSettings.network.syncMode.stable":"Stable","mvSettings.network.syncMode.balanced":"Balanced","mvSettings.network.syncMode.precise":"Precise","mvSettings.network.title":"Network Sources","mvSettings.offset.aria":"MV sync offset","mvSettings.offset.description":"Positive values advance the MV; negative values delay it. Saved only for this song MV.","mvSettings.offset.earlier":"MV earlier {value}","mvSettings.offset.earlierShort":"Earlier {value}","mvSettings.offset.input":"Offset seconds","mvSettings.offset.later":"MV later {value}","mvSettings.offset.laterShort":"Later {value}","mvSettings.offset.replay":"Replay","mvSettings.offset.replayTitle":"Replay the current song and sync the video from the MV start point","mvSettings.offset.reset":"Reset MV offset","mvSettings.offset.resetShort":"Reset","mvSettings.offset.slider":"MV sync offset slider","mvSettings.offset.startDescription":"Enter the start second in the video, up to 600s. This song aligns from there.","mvSettings.offset.startInput":"MV start second","mvSettings.offset.startTitle":"Start video from","mvSettings.offset.step":"Adjustment step","mvSettings.offset.title":"MV sync calibration","mvSettings.provider.local":"Local","mvSettings.quality.max":"Max","mvSettings.search.input":"MV search keywords","mvSettings.search.placeholder":"Enter MV search keywords","mvSettings.search.useCurrentSong":"Search with current song and artist","mvSettings.status.auto":"Auto","mvSettings.status.noActiveTrack":"No active track","mvSettings.status.none":"None","mvSettings.status.off":"Off","mvSettings.status.on":"On","mvSettings.title":"MV Settings"}};
const EMBEDDED_CSS = "/* === lyrics.css === */\r\n.lyrics-left-panel,\r\n.lyrics-mv-panel,\r\n.lyrics-no-track,\r\n.lyrics-empty,\r\n.lyrics-error,\r\n.lyrics-copy-notice,\r\n.lyrics-custom-lrc-drop {\r\n  position: relative;\r\n  z-index: 1;\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-host-style=\"true\"]) {\r\n  grid-template-columns: minmax(0, 1fr);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-host-style=\"true\"]) .lyrics-scroll {\r\n  width: min(100%, 1320px);\r\n  justify-self: center;\r\n  padding-inline: clamp(22px, 5vw, 120px);\r\n  transform: none;\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-host-style=\"true\"]) .lyrics-back-button {\r\n  justify-self: start;\r\n}\r\n.lyrics-mv-background {\r\n  --mv-immersive-blur: 0px;\r\n  --mv-immersive-brightness: 100%;\r\n  --mv-immersive-overlay-opacity: 0;\r\n  position: absolute;\r\n  inset: 0;\r\n  z-index: 0;\r\n  overflow: hidden;\r\n  background: #101820;\r\n  cursor: grab;\r\n  touch-action: none;\r\n}\r\n.lyrics-mv-background[data-dragging=\"true\"] {\r\n  cursor: grabbing;\r\n}\r\n.lyrics-mv-background::after {\r\n  position: absolute;\r\n  inset: 0;\r\n  background:\r\n    linear-gradient(90deg, rgba(8, 11, 16, 0.72), rgba(8, 11, 16, 0.42) 48%, rgba(8, 11, 16, 0.62)),\r\n    linear-gradient(180deg, rgba(8, 11, 16, 0.22), rgba(8, 11, 16, 0.68));\r\n  content: \"\";\r\n  opacity: var(--mv-immersive-overlay-opacity);\r\n  pointer-events: none;\r\n}\r\n.lyrics-mv-background-video {\r\n  width: 100%;\r\n  height: 100%;\r\n  border: 0;\r\n  object-fit: cover;\r\n  object-position: var(--mv-immersive-position-x, 50%) var(--mv-immersive-position-y, 50%);\r\n  transform: translateZ(0) scale(var(--mv-immersive-scale, 1.15));\r\n  transform-origin: var(--mv-immersive-position-x, 50%) var(--mv-immersive-position-y, 50%);\r\n  transition: transform 180ms cubic-bezier(0.2, 0, 0.2, 1);\r\n  filter: blur(var(--mv-immersive-blur)) saturate(1.05) brightness(var(--mv-immersive-brightness));\r\n  backface-visibility: hidden;\r\n  will-change: transform;\r\n}\r\n.lyrics-mv-background[data-auto-scale=\"true\"] .lyrics-mv-background-video:not(.lyrics-mv-background-video--youtube) {\r\n  object-fit: contain;\r\n}\r\n.lyrics-mv-background-video--youtube {\r\n  position: absolute;\r\n  top: 50%;\r\n  left: 50%;\r\n  width: max(100vw, calc(100vh * 16 / 9));\r\n  height: max(100vh, calc(100vw * 9 / 16));\r\n  object-fit: initial;\r\n  pointer-events: none;\r\n  transform: translate(-50%, -50%) translateZ(0) scale(var(--mv-immersive-scale, 1.15));\r\n  transform-origin: center;\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-backdrop {\r\n  background: transparent !important;\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-backdrop::before {\r\n  opacity: 0 !important;\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-backdrop::after {\r\n  opacity: 0 !important;\r\n}\r\n/* Ambience layers postdate the original MV feature and paint a nearly opaque\r\n   tint above z-index 0; hide them while the immersive MV background is active. */\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-backdrop-source,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-backdrop-cover,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-backdrop-previous-cover,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-backdrop-atmosphere,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-backdrop-theme-filter,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-music-reactive-layer {\r\n  display: none !important;\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) {\r\n  --lyrics-mv-heading-color: color-mix(\r\n    in srgb,\r\n    color-mix(in srgb, var(--theme-heading-text) 46%, #ffffff 54%) 76%,\r\n    var(--theme-accent-solid-bg) 24%\r\n  );\r\n  --lyrics-mv-muted-color: color-mix(\r\n    in srgb,\r\n    color-mix(in srgb, var(--theme-muted-text) 38%, #ffffff 62%) 82%,\r\n    var(--theme-accent-solid-bg) 18%\r\n  );\r\n  --lyrics-mv-control-color: color-mix(in srgb, var(--lyrics-mv-heading-color) 88%, #ffffff 12%);\r\n  --lyrics-mv-control-bg: color-mix(in srgb, var(--theme-panel-bg-strong) 44%, transparent);\r\n  --lyrics-mv-control-border: color-mix(in srgb, var(--theme-accent-solid-bg) 36%, #ffffff 64%);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-track-copy h1,\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-track-copy p,\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-track-album,\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-track-artist {\r\n  color: var(--lyrics-mv-muted-color);\r\n  text-shadow: none;\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-back-button,\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-match-status,\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-empty {\r\n  color: var(--lyrics-mv-muted-color);\r\n  text-shadow:\r\n    0 2px 4px rgb(0 0 0 / 0.62),\r\n    0 12px 28px var(--theme-overlay-bg);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-track-copy h1 {\r\n  color: var(--lyrics-mv-heading-color);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-track-album:hover {\r\n  color: var(--lyrics-mv-heading-color);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-back-button {\r\n  color: var(--lyrics-mv-control-color);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-back-button:hover {\r\n  color: var(--lyrics-mv-heading-color);\r\n  background: transparent;\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-line {\r\n  color: var(--lyrics-readable-color);\r\n  text-shadow: 0 2px 16px var(--theme-overlay-bg);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-line[data-past=\"true\"] {\r\n  opacity: 0.2;\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-line[data-active=\"true\"] {\r\n  color: var(--lyrics-readable-color);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) {\r\n  --lyrics-readable-color: color-mix(in srgb, var(--theme-heading-text) 86%, var(--lyrics-color) 14%);\r\n  --lyrics-word-accent-color: color-mix(in srgb, var(--color-accent-strong) 72%, var(--theme-heading-text) 28%);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-mv-background::after {\r\n  opacity: max(var(--mv-immersive-overlay-opacity), 0.42);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-line[data-focus-distance=\"1\"],\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-line[data-focus-distance=\"2\"],\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-line[data-focus-distance=\"3\"],\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-line[data-focus-distance=\"4\"] {\r\n  opacity: var(--lyrics-context-opacity);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background):not([data-echo-mv-stage=\"true\"]) .lyrics-track-cover {\r\n  border-color: rgba(255, 255, 255, 0.32);\r\n  background: var(--theme-legacy-white-a18, rgba(255, 255, 255, 0.18));\r\n  box-shadow: 0 20px 52px var(--theme-overlay-bg);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-mv-panel[data-immersive-active=\"true\"] {\r\n  display: none;\r\n}\r\n.lyrics-page:has(.lyrics-mv-panel[data-mv-enabled=\"false\"]) .lyrics-mv-panel {\r\n  display: none;\r\n}\r\n.lyrics-page:has(.lyrics-mv-panel[data-mv-enabled=\"true\"][data-immersive-active=\"false\"]) .lyrics-backdrop::before {\r\n  background: none;\r\n}\r\n.lyrics-page[data-background=\"cover\"]:has(.lyrics-mv-panel[data-mv-enabled=\"true\"][data-immersive-active=\"false\"]) .lyrics-backdrop::after {\r\n  filter: blur(var(--lyrics-cover-blur))\r\n    brightness(var(--lyrics-cover-brightness)) saturate(1.04);\r\n  opacity: var(--lyrics-cover-opacity);\r\n}\r\n.lyrics-page[data-background=\"customWallpaper\"]:has(.lyrics-mv-panel[data-mv-enabled=\"true\"][data-immersive-active=\"false\"]) .lyrics-backdrop {\r\n  background: transparent;\r\n}\r\n.lyrics-page[data-background=\"customWallpaper\"]:has(.lyrics-mv-panel[data-mv-enabled=\"true\"][data-immersive-active=\"false\"]) .lyrics-backdrop::after {\r\n  filter: blur(var(--lyrics-cover-blur))\r\n    brightness(var(--lyrics-cover-brightness)) saturate(1.02);\r\n  opacity: var(--lyrics-cover-opacity);\r\n}\r\nhtml[data-theme=\"light\"] .lyrics-page[data-background=\"customWallpaper\"]:has(.lyrics-mv-panel[data-mv-enabled=\"true\"][data-immersive-active=\"false\"]) .lyrics-backdrop::before,\r\nhtml:not([data-theme=\"dark\"]) .lyrics-page[data-background=\"customWallpaper\"]:has(.lyrics-mv-panel[data-mv-enabled=\"true\"][data-immersive-active=\"false\"]) .lyrics-backdrop::before {\r\n  background:\r\n    radial-gradient(circle at 50% 42%, var(--theme-panel-bg-strong), transparent 42%),\r\n    linear-gradient(180deg, var(--theme-panel-bg-muted), var(--theme-panel-bg) 72%);\r\n  opacity: 0.58;\r\n}\r\n.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability=\"true\"]) .lyrics-line .lyrics-line-primary {\r\n  text-shadow:\r\n    0 1px 2px rgba(0, 0, 0, 0.72),\r\n    0 4px 12px rgba(0, 0, 0, 0.46),\r\n    0 0 24px rgba(0, 0, 0, 0.22);\r\n}\r\n.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability=\"true\"]) .lyrics-line[data-active=\"true\"] .lyrics-line-primary {\r\n  text-shadow:\r\n    0 1px 2px rgba(0, 0, 0, 0.78),\r\n    0 5px 14px rgba(0, 0, 0, 0.52),\r\n    0 0 28px rgba(0, 0, 0, 0.26);\r\n}\r\n.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability=\"true\"]) .lyrics-line small,\r\n.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability=\"true\"]) .lyrics-line em {\r\n  text-shadow:\r\n    0 1px 2px rgba(0, 0, 0, 0.58),\r\n    0 4px 10px rgba(0, 0, 0, 0.36),\r\n    0 0 18px rgba(0, 0, 0, 0.18);\r\n}\r\n.lyrics-track-cover img,\r\n.lyrics-mv-artwork img {\r\n  width: 100%;\r\n  height: 100%;\r\n  object-fit: cover;\r\n}\r\n.lyrics-offset-controls,\r\n.lyrics-smart-alignment,\r\n.mv-offset-controls {\r\n  display: flex;\r\n  width: min(100%, 760px);\r\n  align-items: center;\r\n  gap: 10px;\r\n  flex-wrap: wrap;\r\n  padding-left: 18px;\r\n  transform: translateY(-8px);\r\n}\r\n.mv-offset-controls {\r\n  position: absolute;\r\n  right: 18px;\r\n  bottom: 18px;\r\n  z-index: 3;\r\n  width: auto;\r\n  max-width: calc(100% - 36px);\r\n  justify-content: flex-end;\r\n  padding-left: 0;\r\n  transform: none;\r\n}\r\n.lyrics-offset-value,\r\n.lyrics-smart-alignment-suggestion,\r\n.mv-offset-value {\r\n  display: inline-flex;\r\n  min-width: 64px;\r\n  min-height: 30px;\r\n  align-items: center;\r\n  justify-content: center;\r\n  color: var(--theme-panel-bg-strong);\r\n  border: 1px solid var(--theme-legacy-border-soft, var(--theme-panel-border, rgba(38, 40, 46, 0.1)));\r\n  border-radius: 8px;\r\n  background: var(--theme-legacy-surface-a52, rgba(255, 255, 255, 0.52));\r\n  font-size: 11px;\r\n  font-weight: 850;\r\n  white-space: nowrap;\r\n}\r\n.lyrics-offset-label,\r\n.lyrics-smart-alignment-label,\r\n.mv-offset-label {\r\n  display: inline-flex;\r\n  min-height: 30px;\r\n  align-items: center;\r\n  color: var(--theme-panel-bg-strong);\r\n  font-size: 11px;\r\n  font-weight: 850;\r\n  white-space: nowrap;\r\n}\r\n.lyrics-offset-controls p,\r\n.lyrics-smart-alignment p,\r\n.mv-offset-controls p {\r\n  flex-basis: 100%;\r\n  margin: -2px 0 0;\r\n  color: rgba(50, 71, 96, 0.62);\r\n  font-size: 11px;\r\n  font-weight: 720;\r\n  line-height: 1.35;\r\n}\r\n.lyrics-offset-buttons,\r\n.lyrics-smart-alignment-buttons,\r\n.mv-offset-buttons {\r\n  display: flex;\r\n  min-width: 0;\r\n  align-items: center;\r\n  gap: 7px;\r\n  overflow-x: auto;\r\n  padding: 1px 0 2px;\r\n  scrollbar-width: none;\r\n}\r\n.lyrics-offset-buttons::-webkit-scrollbar,\r\n.lyrics-smart-alignment-buttons::-webkit-scrollbar,\r\n.mv-offset-buttons::-webkit-scrollbar {\r\n  display: none;\r\n}\r\n.lyrics-offset-buttons button,\r\n.lyrics-smart-alignment-buttons button,\r\n.mv-offset-buttons button {\r\n  display: inline-flex;\r\n  min-height: 30px;\r\n  flex: 0 0 auto;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 5px;\r\n  padding: 0 9px;\r\n  color: rgba(50, 71, 96, 0.82);\r\n  border: 1px solid var(--theme-legacy-border-soft, var(--theme-panel-border, rgba(38, 40, 46, 0.1)));\r\n  border-radius: 8px;\r\n  background: var(--theme-legacy-surface-a52, rgba(255, 255, 255, 0.52));\r\n  box-shadow:\r\n    0 1px 2px rgba(35, 54, 78, 0.04),\r\n    inset 0 1px 0 var(--theme-legacy-surface-a72, rgba(255, 255, 255, 0.72));\r\n  cursor: pointer;\r\n  font-size: 11px;\r\n  font-weight: 820;\r\n  white-space: nowrap;\r\n}\r\n.lyrics-offset-buttons button:hover,\r\n.lyrics-smart-alignment-buttons button:hover,\r\n.mv-offset-buttons button:hover {\r\n  color: var(--theme-page-text);\r\n  background: var(--theme-legacy-surface-a86, rgba(255, 255, 255, 0.86));\r\n}\r\n.lyrics-offset-buttons button:disabled,\r\n.lyrics-smart-alignment-buttons button:disabled,\r\n.mv-offset-buttons button:disabled {\r\n  cursor: default;\r\n  opacity: 0.5;\r\n}\r\n.lyrics-offset-buttons svg,\r\n.lyrics-smart-alignment-buttons svg,\r\n.mv-offset-buttons svg {\r\n  flex: 0 0 auto;\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-offset-value,\r\nhtml[data-theme=\"dark\"] .lyrics-smart-alignment-suggestion,\r\nhtml[data-theme=\"dark\"] .lyrics-offset-buttons button,\r\nhtml[data-theme=\"dark\"] .lyrics-smart-alignment-buttons button,\r\nhtml[data-theme=\"dark\"] .lyrics-offset-label,\r\nhtml[data-theme=\"dark\"] .lyrics-smart-alignment-label,\r\nhtml[data-theme=\"dark\"] .mv-offset-value,\r\nhtml[data-theme=\"dark\"] .mv-offset-label,\r\nhtml[data-theme=\"dark\"] .mv-offset-buttons button {\r\n  color: rgba(229, 237, 255, 0.8);\r\n  border-color: var(--theme-legacy-white-a10, rgba(255, 255, 255, 0.10));\r\n  background: var(--theme-legacy-white-a08, rgba(255, 255, 255, 0.08));\r\n  box-shadow:\r\n    0 1px 2px rgba(0, 0, 0, 0.1),\r\n    inset 0 1px 0 var(--theme-legacy-white-a06, rgba(255, 255, 255, 0.06));\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-offset-controls p,\r\nhtml[data-theme=\"dark\"] .lyrics-smart-alignment p,\r\nhtml[data-theme=\"dark\"] .mv-offset-controls p {\r\n  color: rgba(229, 237, 255, 0.58);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-offset-buttons button:hover,\r\nhtml[data-theme=\"dark\"] .lyrics-smart-alignment-buttons button:hover,\r\nhtml[data-theme=\"dark\"] .mv-offset-buttons button:hover {\r\n  color: var(--theme-panel-bg-strong);\r\n  background: var(--theme-legacy-white-a14, rgba(255, 255, 255, 0.14));\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line {\r\n  min-height: calc(clamp(82px, 9.8vh, 118px) * var(--lyrics-line-spacing, 0.82));\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line[data-active=\"true\"] {\r\n  min-height: calc(clamp(82px, 9.8vh, 118px) * var(--lyrics-line-spacing, 0.82));\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line .lyrics-line-primary {\r\n  max-width: min(100%, 1120px, var(--lyrics-line-max-width));\r\n  font-size: calc(var(--lyrics-font-size) * 0.9);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line[data-active=\"true\"] .lyrics-line-primary {\r\n  font-size: calc(var(--lyrics-font-size) * 1.25);\r\n  line-height: 1.18;\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line[data-density=\"medium\"] .lyrics-line-primary {\r\n  font-size: calc(var(--lyrics-font-size) * 0.84);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line[data-density=\"medium\"][data-active=\"true\"] .lyrics-line-primary {\r\n  font-size: calc(var(--lyrics-font-size) * 1.12);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line[data-density=\"long\"] .lyrics-line-primary {\r\n  font-size: calc(var(--lyrics-font-size) * 0.74);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line[data-density=\"long\"][data-active=\"true\"] .lyrics-line-primary {\r\n  font-size: calc(var(--lyrics-font-size) * 0.96);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line[data-density=\"dense\"] .lyrics-line-primary {\r\n  font-size: calc(var(--lyrics-font-size) * 0.64);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line[data-density=\"dense\"][data-active=\"true\"] .lyrics-line-primary {\r\n  font-size: calc(var(--lyrics-font-size) * 0.84);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line[data-secondary-lines=\"2\"][data-active=\"true\"] .lyrics-line-primary {\r\n  font-size: calc(var(--lyrics-font-size) * 1.06);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line small {\r\n  font-size: var(--lyrics-secondary-font-size);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-line em {\r\n  font-size: calc(var(--lyrics-secondary-font-size) * 0.9);\r\n}\r\n.lyrics-mv-panel--fallback {\r\n  display: grid;\r\n  place-items: center;\r\n  min-height: 0;\r\n  color: var(--theme-heading-text);\r\n}\r\n.lyrics-mv-fallback {\r\n  display: grid;\r\n  gap: 8px;\r\n  width: min(420px, 100%);\r\n  padding: 18px 20px;\r\n  border: 1px solid color-mix(in srgb, var(--theme-border, var(--theme-panel-border, rgba(38, 40, 46, 0.12))) 70%, transparent);\r\n  border-radius: 8px;\r\n  background: color-mix(in srgb, var(--theme-surface, var(--theme-panel-bg, rgba(255, 255, 255, 0.76))) 86%, transparent);\r\n  box-shadow: 0 18px 40px rgba(31, 36, 56, 0.12);\r\n}\r\n.lyrics-mv-fallback strong {\r\n  font-size: 16px;\r\n  line-height: 1.35;\r\n}\r\n.lyrics-mv-fallback span {\r\n  color: var(--theme-muted-text);\r\n  font-size: 13px;\r\n  line-height: 1.45;\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"roseVinyl\"][data-view-mode=\"lyrics\"][data-background=\"cover\"] .lyrics-mv-panel[data-mv-enabled=\"false\"] {\r\n  position: relative;\r\n  z-index: 7;\r\n  display: grid;\r\n  grid-column: 2;\r\n  grid-row: 1;\r\n  place-items: center;\r\n  transform: none;\r\n}\r\n@media (max-width: 900px) {\r\n.lyrics-page[data-lyrics-page-style=\"roseVinyl\"][data-view-mode=\"lyrics\"][data-background=\"cover\"] .lyrics-mv-panel[data-mv-enabled=\"false\"] {\r\n    display: none;\r\n  }\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"editorial\"][data-view-mode=\"lyrics\"] .lyrics-mv-panel[data-mv-enabled=\"false\"] {\r\n  display: none;\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-match-panel {\r\n  margin-left: 18px;\r\n  --lyrics-match-panel-bg: rgba(10, 14, 20, 0.62);\r\n  --lyrics-match-panel-border: rgba(255, 255, 255, 0.16);\r\n  --lyrics-match-panel-shadow: 0 22px 56px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.12);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-match-auto-open,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-match-auto-open {\r\n  color: rgba(229, 237, 255, 0.72);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-match-current,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-match-current {\r\n  border-color: rgba(255, 255, 255, 0.11);\r\n  background: rgba(255, 255, 255, 0.07);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-match-current small,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-match-current small {\r\n  color: rgba(229, 237, 255, 0.62);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-match-status,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-match-status {\r\n  --lyrics-match-status-color: rgba(229, 237, 255, 0.72);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-source-quality__item,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-source-quality__item {\r\n  border-color: rgba(255, 255, 255, 0.11);\r\n  background: rgba(255, 255, 255, 0.07);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-source-quality__item small,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-source-quality__item small {\r\n  color: rgba(229, 237, 255, 0.72);\r\n  background: rgba(255, 255, 255, 0.09);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-match-close,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-match-close {\r\n  --lyrics-match-close-color: rgba(229, 237, 255, 0.74);\r\n  --lyrics-match-close-border: rgba(255, 255, 255, 0.12);\r\n  --lyrics-match-close-bg: rgba(255, 255, 255, 0.08);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-match-close:hover,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-match-close:hover {\r\n  --lyrics-match-close-color: #ffffff;\r\n  --lyrics-match-close-border: rgba(255, 255, 255, 0.2);\r\n  --lyrics-match-close-bg: rgba(255, 255, 255, 0.14);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-source-filters button,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-source-filters button {\r\n  --lyrics-source-filter-color: rgba(229, 237, 255, 0.76);\r\n  --lyrics-source-filter-border: rgba(255, 255, 255, 0.12);\r\n  --lyrics-source-filter-bg: rgba(255, 255, 255, 0.08);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-source-filters button[data-active=\"true\"],\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-source-filters button[data-active=\"true\"] {\r\n  --lyrics-source-filter-color: #ffffff;\r\n  --lyrics-source-filter-border: rgba(143, 207, 189, 0.38);\r\n  --lyrics-source-filter-bg: rgba(143, 207, 189, 0.18);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-source-filters small,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-source-filters small {\r\n  --lyrics-source-filter-count-color: rgba(229, 237, 255, 0.62);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate {\r\n  --lyrics-candidate-text: rgba(235, 242, 252, 0.92);\r\n  --lyrics-candidate-border: rgba(255, 255, 255, 0.11);\r\n  --lyrics-candidate-bg: rgba(255, 255, 255, 0.08);\r\n  --lyrics-candidate-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate--instrumental,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate--instrumental {\r\n  --lyrics-candidate-border: rgba(255, 204, 128, 0.38);\r\n  --lyrics-candidate-bg: rgba(255, 191, 96, 0.12);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate:hover,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate:hover {\r\n  --lyrics-candidate-border: rgba(143, 207, 189, 0.26);\r\n  --lyrics-candidate-bg: rgba(255, 255, 255, 0.13);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate strong,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate strong {\r\n  --lyrics-candidate-title-color: rgba(246, 249, 255, 0.96);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate em,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate em {\r\n  --lyrics-candidate-meta-color: rgba(229, 237, 255, 0.62);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate-badges small,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate-badges small {\r\n  --lyrics-candidate-badge-color: rgba(229, 237, 255, 0.76);\r\n  --lyrics-candidate-badge-bg: rgba(255, 255, 255, 0.1);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate-badges .lyrics-risk-badge--low,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate-badges .lyrics-risk-badge--low {\r\n  --lyrics-candidate-badge-color: #c7efde;\r\n  --lyrics-candidate-badge-bg: rgba(42, 120, 86, 0.42);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate-badges .lyrics-risk-badge--medium,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate-badges .lyrics-risk-badge--medium {\r\n  --lyrics-candidate-badge-color: #f4d99c;\r\n  --lyrics-candidate-badge-bg: rgba(150, 103, 28, 0.42);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate-badges .lyrics-risk-badge--high,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate-badges .lyrics-risk-badge--high {\r\n  --lyrics-candidate-badge-color: #ffd2cf;\r\n  --lyrics-candidate-badge-bg: rgba(162, 64, 56, 0.42);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate-badges .lyrics-kind-badge--instrumental,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate-badges .lyrics-kind-badge--instrumental {\r\n  --lyrics-candidate-badge-color: #ffe5b8;\r\n  --lyrics-candidate-badge-bg: rgba(255, 183, 77, 0.28);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate-badges .lyrics-reason-badge,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate-badges .lyrics-reason-badge {\r\n  --lyrics-candidate-badge-color: rgba(229, 237, 255, 0.68);\r\n  --lyrics-candidate-badge-bg: rgba(255, 255, 255, 0.08);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-candidate-preview,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-candidate-preview {\r\n  color: rgba(229, 237, 255, 0.72);\r\n  border-left-color: rgba(143, 207, 189, 0.3);\r\n  background: rgba(255, 255, 255, 0.07);\r\n}\r\nhtml[data-theme=\"dark\"] :is(.lyrics-candidate-actions button, .lyrics-candidate-show-all, .lyrics-match-entry-actions button, .lyrics-match-import-action),\r\n.lyrics-page:has(.lyrics-mv-background) :is(.lyrics-candidate-actions button, .lyrics-candidate-show-all, .lyrics-match-entry-actions button, .lyrics-match-import-action) {\r\n  color: rgba(229, 237, 255, 0.82);\r\n  border-color: rgba(255, 255, 255, 0.14);\r\n  background: rgba(255, 255, 255, 0.09);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-match-entry-actions input[type=\"search\"],\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-match-entry-actions input[type=\"search\"] {\r\n  color: rgba(229, 237, 255, 0.86);\r\n  border-color: rgba(255, 255, 255, 0.14);\r\n  background: rgba(255, 255, 255, 0.09);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-match-entry-actions span,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-match-entry-actions span {\r\n  color: rgba(229, 237, 255, 0.62);\r\n}\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-match-panel .lyrics-candidate,\r\nhtml[data-theme=\"dark\"] .lyrics-match-panel .lyrics-candidate {\r\n  --lyrics-candidate-text: #26384f;\r\n  --lyrics-candidate-title-color: #23324a;\r\n  --lyrics-candidate-meta-color: rgba(66, 84, 107, 0.76);\r\n  --lyrics-candidate-border: rgba(54, 73, 95, 0.14);\r\n  --lyrics-candidate-bg: rgba(255, 255, 255, 0.86);\r\n  --lyrics-candidate-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-match-panel .lyrics-candidate-next-step,\r\n.lyrics-page:has(.lyrics-mv-background) .lyrics-match-panel .lyrics-candidate-next-step {\r\n  color: #456076;\r\n  background: rgba(226, 235, 244, 0.84);\r\n}\r\n.lyrics-mv-panel {\r\n  position: relative;\r\n  display: grid;\r\n  min-height: 0;\r\n  align-content: center;\r\n  justify-items: center;\r\n  gap: 12px;\r\n  transform: translateY(clamp(20px, 4.2vh, 58px));\r\n  transition:\r\n    opacity var(--echo-motion-panel-ms) var(--echo-motion-ease-quick),\r\n    transform var(--echo-motion-panel-ms) var(--echo-motion-ease-quick);\r\n}\r\n.lyrics-mv-ambient {\r\n  position: absolute;\r\n  width: min(68%, 560px);\r\n  aspect-ratio: 1;\r\n  border-radius: 36px;\r\n  background-position: center;\r\n  background-size: cover;\r\n  filter: blur(42px) saturate(1.15);\r\n  opacity: 0.24;\r\n}\r\n.lyrics-mv-unavailable-reason {\r\n  position: fixed;\r\n  top: clamp(88px, 8vh, 112px);\r\n  left: clamp(14px, 1.8vw, 24px);\r\n  z-index: 7;\r\n  display: grid;\r\n  max-width: min(280px, calc(100vw - 28px));\r\n  grid-template-columns: minmax(0, 1fr) 18px;\r\n  gap: 2px 7px;\r\n  padding: 7px 7px 7px 9px;\r\n  color: rgba(43, 56, 74, 0.86);\r\n  border: 1px solid rgba(255, 255, 255, 0.66);\r\n  border-radius: 10px;\r\n  background: rgba(255, 255, 255, 0.48);\r\n  box-shadow: 0 10px 28px rgba(51, 68, 94, 0.08);\r\n  backdrop-filter: blur(14px);\r\n  opacity: 0.78;\r\n  transition: opacity 160ms ease, transform 160ms ease;\r\n}\r\n.lyrics-mv-unavailable-reason:hover,\r\n.lyrics-mv-unavailable-reason:focus-within {\r\n  opacity: 1;\r\n}\r\n.lyrics-mv-unavailable-reason span {\r\n  color: rgba(75, 91, 116, 0.68);\r\n  font-size: 10px;\r\n  font-weight: 850;\r\n  line-height: 1;\r\n  text-transform: uppercase;\r\n}\r\n.lyrics-mv-unavailable-reason span,\r\n.lyrics-mv-unavailable-reason strong {\r\n  grid-column: 1;\r\n}\r\n.lyrics-mv-unavailable-reason strong {\r\n  overflow: hidden;\r\n  color: #1d2d44;\r\n  font-size: 11px;\r\n  font-weight: 820;\r\n  line-height: 1.25;\r\n  overflow-wrap: anywhere;\r\n}\r\n.lyrics-mv-unavailable-close {\r\n  display: grid;\r\n  width: 18px;\r\n  height: 18px;\r\n  grid-column: 2;\r\n  grid-row: 1 / span 2;\r\n  align-self: start;\r\n  place-items: center;\r\n  padding: 0;\r\n  color: rgba(75, 91, 116, 0.62);\r\n  border: 0;\r\n  border-radius: 999px;\r\n  background: transparent;\r\n  cursor: pointer;\r\n}\r\n.lyrics-mv-unavailable-close:hover,\r\n.lyrics-mv-unavailable-close:focus-visible {\r\n  color: #1d2d44;\r\n  background: rgba(255, 255, 255, 0.58);\r\n  outline: none;\r\n}\r\n.lyrics-mv-diagnostics-report {\r\n  position: fixed;\r\n  right: clamp(14px, 1.8vw, 24px);\r\n  bottom: clamp(88px, 10vh, 128px);\r\n  z-index: 7;\r\n  display: grid;\r\n  width: min(420px, calc(100vw - 28px));\r\n  gap: 8px;\r\n  padding: 10px;\r\n  color: rgba(238, 244, 252, 0.94);\r\n  border: 1px solid rgba(255, 255, 255, 0.16);\r\n  border-radius: 14px;\r\n  background: rgba(14, 19, 28, 0.78);\r\n  box-shadow: 0 20px 54px rgba(0, 0, 0, 0.26);\r\n  backdrop-filter: blur(18px) saturate(1.12);\r\n}\r\n.lyrics-mv-diagnostics-report > div {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 10px;\r\n}\r\n.lyrics-mv-diagnostics-report strong {\r\n  font-size: 12px;\r\n  font-weight: 860;\r\n}\r\n.lyrics-mv-diagnostics-report button {\r\n  display: inline-flex;\r\n  min-height: 26px;\r\n  align-items: center;\r\n  gap: 5px;\r\n  padding: 0 9px;\r\n  color: rgba(238, 244, 252, 0.92);\r\n  border: 1px solid rgba(255, 255, 255, 0.16);\r\n  border-radius: 999px;\r\n  background: rgba(255, 255, 255, 0.1);\r\n  cursor: pointer;\r\n}\r\n.lyrics-mv-diagnostics-report textarea {\r\n  width: 100%;\r\n  height: 168px;\r\n  resize: vertical;\r\n  box-sizing: border-box;\r\n  padding: 9px;\r\n  color: rgba(238, 244, 252, 0.88);\r\n  border: 1px solid rgba(255, 255, 255, 0.12);\r\n  border-radius: 10px;\r\n  outline: none;\r\n  background: rgba(2, 6, 12, 0.48);\r\n  font-family: ui-monospace, SFMono-Regular, Consolas, \"Liberation Mono\", monospace;\r\n  font-size: 11px;\r\n  line-height: 1.42;\r\n}\r\n.lyrics-mv-card {\r\n  position: relative;\r\n  display: grid;\r\n  width: min(78vh, 100%);\r\n  max-width: 560px;\r\n  aspect-ratio: 16 / 10;\r\n  overflow: hidden;\r\n  grid-template-columns: minmax(150px, 0.88fr) minmax(0, 1fr);\r\n  align-items: center;\r\n  gap: clamp(18px, 3.2vw, 30px);\r\n  padding: clamp(20px, 3.4vw, 34px);\r\n  color: #31425a;\r\n  border: 1px solid var(--theme-legacy-surface-a64, rgba(255, 255, 255, 0.64));\r\n  border-radius: 26px;\r\n  background:\r\n    linear-gradient(\r\n      145deg,\r\n      var(--theme-legacy-surface-a90, rgba(255, 255, 255, 0.90)),\r\n      rgba(232, 237, 244, 0.82)\r\n    ),\r\n    #f2f2f4;\r\n  box-shadow:\r\n    0 34px 90px rgba(0, 0, 0, 0.18),\r\n    inset 0 1px 0 var(--theme-legacy-surface-a76, rgba(255, 255, 255, 0.76));\r\n}\r\n.lyrics-mv-card-backdrop {\r\n  position: absolute;\r\n  inset: 0;\r\n  overflow: hidden;\r\n  pointer-events: none;\r\n}\r\n.lyrics-mv-card-backdrop::before {\r\n  position: absolute;\r\n  inset: 0;\r\n  background:\r\n    radial-gradient(circle at 24% 26%, rgba(255, 255, 255, 0.7), transparent 28%),\r\n    linear-gradient(135deg, rgba(70, 94, 132, 0.12), rgba(255, 255, 255, 0.44));\r\n  content: \"\";\r\n}\r\n.lyrics-mv-card-backdrop img {\r\n  width: 100%;\r\n  height: 100%;\r\n  object-fit: cover;\r\n  filter: blur(30px) saturate(1.05);\r\n  opacity: 0.24;\r\n  transform: scale(1.16);\r\n}\r\n.lyrics-mv-artwork,\r\n.lyrics-mv-copy {\r\n  position: relative;\r\n  z-index: 1;\r\n}\r\n.lyrics-mv-artwork {\r\n  display: grid;\r\n  width: min(100%, 190px);\r\n  aspect-ratio: 1;\r\n  justify-self: end;\r\n  overflow: hidden;\r\n  place-items: center;\r\n  color: var(--theme-muted-text);\r\n  border: 5px solid var(--theme-legacy-surface-a90, rgba(255, 255, 255, 0.90));\r\n  border-radius: 20px;\r\n  background: linear-gradient(145deg, var(--theme-on-accent), #e7e7eb);\r\n  box-shadow:\r\n    0 20px 46px rgba(31, 48, 70, 0.2),\r\n    inset 0 0 0 1px rgba(29, 29, 31, 0.05);\r\n}\r\n.lyrics-mv-card[data-cover=\"true\"] .lyrics-mv-artwork img {\r\n  filter: saturate(1.02);\r\n}\r\n.lyrics-mv-copy {\r\n  display: grid;\r\n  min-width: 0;\r\n  gap: 8px;\r\n}\r\n.lyrics-mv-player {\r\n  position: relative;\r\n  display: grid;\r\n  width: min(78vh, 100%);\r\n  max-width: 680px;\r\n  aspect-ratio: 16 / 9;\r\n  overflow: hidden;\r\n  color: #eef3f7;\r\n  border: 1px solid var(--theme-legacy-surface-a64, rgba(255, 255, 255, 0.64));\r\n  border-radius: 26px;\r\n  background: #111821;\r\n  box-shadow:\r\n    0 34px 90px rgba(0, 0, 0, 0.18),\r\n    inset 0 1px 0 var(--theme-legacy-white-a12, rgba(255, 255, 255, 0.12));\r\n}\r\n.lyrics-mv-video {\r\n  width: 100%;\r\n  height: 100%;\r\n  border: 0;\r\n  background: #111821;\r\n  object-fit: contain;\r\n}\r\n.lyrics-mv-actions button,\r\n.lyrics-mv-candidate-badges small {\r\n  display: inline-flex;\r\n  min-height: 30px;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 6px;\r\n  padding: 0 10px;\r\n  border-radius: 8px;\r\n  font-size: 11px;\r\n  font-weight: 820;\r\n  white-space: nowrap;\r\n}\r\n.lyrics-mv-actions {\r\n  display: flex;\r\n  width: min(78vh, 100%);\r\n  max-width: 680px;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 8px;\r\n  flex-wrap: wrap;\r\n}\r\n.lyrics-mv-actions button {\r\n  color: var(--theme-muted-text);\r\n  border: 1px solid var(--theme-legacy-border, var(--theme-panel-border-strong, rgba(38, 40, 46, 0.18)));\r\n  background: var(--theme-panel-bg);\r\n  box-shadow:\r\n    0 1px 2px rgba(35, 54, 78, 0.04),\r\n    inset 0 1px 0 var(--theme-legacy-surface-a72, rgba(255, 255, 255, 0.72));\r\n  cursor: pointer;\r\n}\r\n.lyrics-mv-actions button:hover,\r\n.lyrics-mv-candidate:hover {\r\n  background: var(--theme-legacy-surface-a90, rgba(255, 255, 255, 0.90));\r\n}\r\n.lyrics-mv-actions button:disabled,\r\n.lyrics-mv-candidate:disabled {\r\n  cursor: default;\r\n  opacity: 0.52;\r\n}\r\n.lyrics-mv-candidates {\r\n  display: grid;\r\n  width: min(78vh, 100%);\r\n  max-width: 680px;\r\n  max-height: 220px;\r\n  gap: 8px;\r\n  overflow: auto;\r\n  padding: 2px;\r\n}\r\n.lyrics-mv-candidate {\r\n  display: grid;\r\n  width: 100%;\r\n  min-height: 54px;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  align-items: center;\r\n  gap: 12px;\r\n  padding: 9px 11px;\r\n  color: #26384f;\r\n  border: 1px solid var(--theme-legacy-border-soft, var(--theme-panel-border, rgba(38, 40, 46, 0.1)));\r\n  border-radius: 8px;\r\n  background: var(--theme-panel-bg);\r\n  cursor: pointer;\r\n  text-align: left;\r\n}\r\n.lyrics-mv-candidate > span:first-child {\r\n  display: grid;\r\n  min-width: 0;\r\n  gap: 3px;\r\n}\r\n.lyrics-mv-candidate strong,\r\n.lyrics-mv-candidate em {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.lyrics-mv-candidate strong {\r\n  color: var(--theme-legacy-page-text, var(--theme-page-text, #26384f));\r\n  font-size: 13px;\r\n  font-weight: 840;\r\n}\r\n.lyrics-mv-candidate em {\r\n  color: rgba(66, 84, 107, 0.68);\r\n  font-size: 11px;\r\n  font-style: normal;\r\n  font-weight: 720;\r\n}\r\n.lyrics-mv-candidate-badges {\r\n  display: flex;\r\n  justify-content: flex-end;\r\n  gap: 6px;\r\n  flex-wrap: wrap;\r\n}\r\n.lyrics-mv-candidate-badges small {\r\n  min-height: 22px;\r\n  padding: 0 7px;\r\n  color: #456076;\r\n  background: rgba(226, 235, 244, 0.84);\r\n  line-height: 22px;\r\n}\r\n.lyrics-mv-error {\r\n  width: min(78vh, 100%);\r\n  max-width: 680px;\r\n  margin: 0;\r\n  color: #b3261e;\r\n  font-size: 12px;\r\n  font-weight: 760;\r\n  text-align: center;\r\n}\r\n.lyrics-mv-placeholder {\r\n  display: grid;\r\n  width: 100%;\r\n  height: 100%;\r\n  place-items: center;\r\n  background:\r\n    radial-gradient(\r\n      circle at 32% 24%,\r\n      var(--theme-legacy-surface-a86, rgba(255, 255, 255, 0.86)),\r\n      transparent 30%\r\n    ),\r\n    linear-gradient(145deg, #ffffff, #e7e7eb);\r\n}\r\n.lyrics-mv-copy span {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  width: fit-content;\r\n  min-height: 26px;\r\n  padding: 0 9px;\r\n  color: var(--theme-muted-text);\r\n  border: 1px solid var(--theme-legacy-border-soft, var(--theme-panel-border, rgba(38, 40, 46, 0.1)));\r\n  border-radius: 8px;\r\n  background: var(--theme-legacy-surface-a58, rgba(255, 255, 255, 0.58));\r\n  font-size: 11px;\r\n  font-weight: 850;\r\n  text-transform: uppercase;\r\n}\r\n.lyrics-mv-copy strong,\r\n.lyrics-mv-copy em {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.lyrics-mv-copy strong {\r\n  color: #203149;\r\n  font-size: clamp(18px, 2vw, 24px);\r\n  font-weight: 850;\r\n  line-height: 1.08;\r\n}\r\n.lyrics-mv-copy em {\r\n  color: rgba(55, 74, 98, 0.68);\r\n  font-size: 14px;\r\n  font-style: normal;\r\n  font-weight: 740;\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-mv-unavailable-reason {\r\n  color: rgba(226, 234, 244, 0.86);\r\n  border-color: rgba(255, 255, 255, 0.12);\r\n  background: rgba(14, 22, 34, 0.46);\r\n  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.22);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-mv-unavailable-reason span {\r\n  color: rgba(201, 214, 232, 0.62);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-mv-unavailable-reason strong {\r\n  color: rgba(244, 248, 255, 0.94);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-mv-unavailable-close {\r\n  color: rgba(201, 214, 232, 0.58);\r\n}\r\nhtml[data-theme=\"dark\"] .lyrics-mv-unavailable-close:hover,\r\nhtml[data-theme=\"dark\"] .lyrics-mv-unavailable-close:focus-visible {\r\n  color: rgba(244, 248, 255, 0.94);\r\n  background: rgba(255, 255, 255, 0.1);\r\n}\r\n.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability=\"true\"]) .lyrics-line .lyrics-line-primary {\r\n  -webkit-text-stroke: 0.012em rgba(0, 0, 0, 0.48);\r\n  background: transparent;\r\n  border-radius: 0;\r\n  box-shadow: none;\r\n  paint-order: stroke fill;\r\n  text-shadow:\r\n    0 1px 2px rgba(0, 0, 0, 0.78),\r\n    0 5px 16px rgba(0, 0, 0, 0.54),\r\n    0 0 28px rgba(0, 0, 0, 0.3);\r\n}\r\n.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability=\"true\"]) .lyrics-line[data-active=\"true\"] .lyrics-line-primary {\r\n  -webkit-text-stroke: 0.014em rgba(0, 0, 0, 0.56);\r\n  text-shadow:\r\n    0 1px 2px rgba(0, 0, 0, 0.84),\r\n    0 6px 18px rgba(0, 0, 0, 0.6),\r\n    0 0 32px rgba(0, 0, 0, 0.36);\r\n}\r\n.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability=\"true\"]) .lyrics-line small,\r\n.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability=\"true\"]) .lyrics-line em {\r\n  -webkit-text-stroke: 0.01em rgba(0, 0, 0, 0.42);\r\n  background: transparent;\r\n  border-radius: 0;\r\n  box-shadow: none;\r\n  paint-order: stroke fill;\r\n  text-shadow:\r\n    0 1px 2px rgba(0, 0, 0, 0.66),\r\n    0 4px 12px rgba(0, 0, 0, 0.42),\r\n    0 0 22px rgba(0, 0, 0, 0.24);\r\n}\r\n@media (max-width: 1180px) {\r\n.lyrics-mv-card {\r\n    width: min(100%, 560px);\r\n    grid-template-columns: minmax(112px, 0.7fr) minmax(0, 1fr);\r\n  }\r\n.lyrics-mv-panel {\r\n    transform: none;\r\n  }\r\n.lyrics-mv-unavailable-reason {\r\n    top: 58px;\r\n    left: 10px;\r\n    max-width: min(260px, calc(100vw - 20px));\r\n  }\r\n}\r\n@media (min-width: 1500px) {\r\n.lyrics-page[data-window-maximized=\"true\"]:has(.lyrics-mv-background) .lyrics-scroll {\r\n    transform: none;\r\n  }\r\n}\r\n@media (max-width: 720px) {\r\n.lyrics-mv-card {\r\n    grid-template-columns: 1fr;\r\n    aspect-ratio: auto;\r\n    min-height: 280px;\r\n    justify-items: center;\r\n    text-align: center;\r\n  }\r\n.lyrics-mv-artwork {\r\n    width: 148px;\r\n    justify-self: center;\r\n  }\r\n.lyrics-mv-copy {\r\n    justify-items: center;\r\n  }\r\n}\r\n@media (prefers-reduced-motion: reduce) {\r\n.lyrics-backdrop::after,\r\n  .lyrics-backdrop-cover,\r\n  .lyrics-backdrop-previous-cover,\r\n  .lyrics-mv-background-video,\r\n  .lyrics-page[data-track-transition=\"true\"][data-lyrics-page-style=\"roseVinyl\"]::after,\r\n  .lyrics-page[data-track-transition=\"true\"] .lyrics-backdrop::after,\r\n  .lyrics-page[data-track-transition=\"true\"] .lyrics-backdrop-cover,\r\n  .lyrics-page[data-track-transition=\"true\"] .lyrics-track-header,\r\n  .lyrics-page[data-track-transition=\"true\"] .lyrics-track-cover,\r\n  .lyrics-style-cover-card-image,\r\n  .lyrics-page[data-track-transition=\"true\"] .lyrics-track-copy,\r\n  .lyrics-page[data-track-transition=\"true\"] .lyrics-scroll {\r\n    animation: none !important;\r\n    transition: none !important;\r\n    will-change: auto;\r\n  }\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"roseVinyl\"][data-view-mode=\"lyrics\"][data-background=\"cover\"] .lyrics-mv-panel[data-mv-enabled=\"false\"],\r\n.app-shell--lyrics-player-drawer .lyrics-page[data-lyrics-page-style=\"roseVinyl\"][data-view-mode=\"lyrics\"][data-background=\"cover\"] .lyrics-mv-panel[data-mv-enabled=\"false\"] {\r\n  display: grid;\r\n  grid-column: 2;\r\n  grid-row: 1;\r\n  place-items: center;\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"roseVinyl\"][data-window-maximized=\"true\"][data-view-mode=\"lyrics\"][data-background=\"cover\"] .lyrics-mv-panel[data-mv-enabled=\"false\"],\r\n.app-shell--lyrics-player-drawer .lyrics-page[data-lyrics-page-style=\"roseVinyl\"][data-window-maximized=\"true\"][data-view-mode=\"lyrics\"][data-background=\"cover\"] .lyrics-mv-panel[data-mv-enabled=\"false\"] {\r\n  transform: translateY(clamp(-56px, -4.5vh, -36px));\r\n}\r\n@media (min-width: 901px) and (max-height: 1000px) {\r\n.lyrics-page[data-lyrics-page-style=\"roseVinyl\"][data-window-maximized=\"false\"][data-view-mode=\"lyrics\"][data-background=\"cover\"] .lyrics-mv-panel[data-mv-enabled=\"false\"],\r\n  .app-shell--lyrics-player-drawer .lyrics-page[data-lyrics-page-style=\"roseVinyl\"][data-window-maximized=\"false\"][data-view-mode=\"lyrics\"][data-background=\"cover\"] .lyrics-mv-panel[data-mv-enabled=\"false\"] {\r\n    place-items: start center;\r\n    padding-top: clamp(82px, 11vh, 104px);\r\n  }\r\n}\r\n@media (max-width: 900px) {\r\n.lyrics-page[data-lyrics-page-style=\"roseVinyl\"][data-view-mode=\"lyrics\"][data-background=\"cover\"] .lyrics-mv-panel[data-mv-enabled=\"false\"],\r\n  .app-shell--lyrics-player-drawer .lyrics-page[data-lyrics-page-style=\"roseVinyl\"][data-view-mode=\"lyrics\"][data-background=\"cover\"] .lyrics-mv-panel[data-mv-enabled=\"false\"] {\r\n    display: none;\r\n  }\r\n}\r\n\r\n/* === app.css === */\r\n.settings-page .settings-cache-panel--mv-overview,\r\n.settings-page .settings-cache-panel--mv-network,\r\n.settings-page .settings-cache-panel--mv-immersive {\r\n  max-width: min(100%, 1120px);\r\n  gap: 10px;\r\n  border: 0;\r\n  border-radius: 0;\r\n  background: transparent;\r\n  box-shadow: none;\r\n}\r\n.settings-page .settings-cache-panel--mv-network > .settings-chip-row,\r\n.settings-page .settings-cache-panel--mv-immersive > .settings-chip-row {\r\n  grid-column: 1 / -1;\r\n  max-width: none;\r\n}\r\n.settings-page .settings-cache-panel--mv-network .settings-inline-toggle,\r\n.settings-page .settings-cache-panel--mv-immersive .settings-inline-toggle {\r\n  width: 100%;\r\n  min-width: 0;\r\n  min-height: 36px;\r\n  justify-content: space-between;\r\n  padding: 0 9px 0 11px;\r\n  border-color: color-mix(in srgb, var(--theme-list-row-border) 70%, transparent);\r\n  border-radius: 4px;\r\n  background: color-mix(in srgb, var(--theme-list-row-bg) 68%, transparent);\r\n  box-shadow: none;\r\n}\r\n.settings-page .settings-cache-panel--mv-network .settings-inline-toggle span,\r\n.settings-page .settings-cache-panel--mv-immersive .settings-inline-toggle span {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.settings-page .settings-cache-panel--mv-immersive {\r\n  grid-template-columns: repeat(2, minmax(280px, 1fr));\r\n  align-items: center;\r\n}\r\n.settings-page .settings-cache-panel--mv-immersive > .settings-chip-row {\r\n  display: grid;\r\n  grid-template-columns: minmax(260px, 1fr) auto;\r\n  gap: 8px;\r\n}\r\n.settings-page .settings-cache-panel--mv-immersive .settings-wallpaper-control {\r\n  grid-template-columns: minmax(76px, 116px) minmax(0, 1fr);\r\n  align-items: center;\r\n  gap: 8px 12px;\r\n  min-height: 40px;\r\n  padding: 7px 9px;\r\n  border-radius: 4px;\r\n  background: color-mix(in srgb, var(--theme-list-row-bg) 60%, transparent);\r\n  box-shadow: none;\r\n}\r\n.settings-page .settings-cache-panel--mv-immersive .settings-wallpaper-control > span {\r\n  color: var(--theme-page-text);\r\n  font-size: 12px;\r\n  font-weight: 820;\r\n  white-space: nowrap;\r\n}\r\n.settings-page .settings-cache-panel--mv-immersive .settings-range-field {\r\n  grid-template-columns: minmax(150px, 1fr) 48px;\r\n  gap: 8px;\r\n}\r\n.settings-page .settings-cache-panel--mv-immersive .settings-range-field span {\r\n  min-height: 26px;\r\n  font-size: 11px;\r\n}\r\n.settings-page .settings-mv-workspace > .setting-row:has(.settings-cache-panel--mv-immersive) {\r\n  min-width: 0;\r\n  grid-column: 1 / -1;\r\n  grid-template-columns: minmax(190px, 0.24fr) minmax(0, 0.76fr);\r\n  align-items: center;\r\n  gap: 20px;\r\n  padding: 14px 18px;\r\n  border: 1px solid var(--theme-panel-border);\r\n  border-radius: 8px;\r\n  background: var(--theme-panel-bg);\r\n  box-shadow: none;\r\n}\r\n.settings-page .settings-mv-workspace > .setting-row:has(.settings-cache-panel--mv-immersive) .setting-info h3 {\r\n  font-size: 14px;\r\n}\r\n.settings-page .settings-mv-workspace > .setting-row:has(.settings-cache-panel--mv-immersive) .setting-info p {\r\n  font-size: 11px;\r\n}\r\n.settings-page .settings-mv-workspace .settings-cache-panel--mv-immersive {\r\n  width: 100%;\r\n  max-width: none;\r\n  grid-template-columns: repeat(2, minmax(260px, 1fr));\r\n  gap: 8px;\r\n}\r\n.settings-page .settings-mv-workspace .settings-cache-panel--mv-immersive .settings-wallpaper-control {\r\n  min-width: 0;\r\n  min-height: 36px;\r\n  grid-template-columns: minmax(86px, 112px) minmax(0, 1fr);\r\n  padding: 4px 8px;\r\n}\r\n@media (max-width: 1500px) {\r\n.settings-page .settings-mv-workspace > .setting-row:has(.settings-cache-panel--mv-immersive) {\r\n    grid-template-columns: minmax(0, 1fr);\r\n  }\r\n.settings-page .settings-mv-workspace .settings-cache-panel--mv-immersive {\r\n    grid-template-columns: repeat(2, minmax(220px, 1fr));\r\n  }\r\n}\r\n@media (max-width: 760px) {\r\n.settings-page .settings-mv-side-column,\r\n  .settings-page .settings-mv-workspace .settings-cache-panel--mv-immersive,\r\n  .settings-page .settings-mv-primary-column .settings-mv-overview-card--quality,\r\n  .settings-page .settings-mv-primary-column .settings-cache-panel--mv-network > .settings-wallpaper-control {\r\n    grid-template-columns: minmax(0, 1fr);\r\n  }\r\n}\r\n.lyrics-engine-meter .audio-engine-meter__top,\r\n.mv-engine-meter .audio-engine-meter__top {\r\n  grid-template-columns: 34px minmax(0, 1fr) 18px;\r\n}\r\n.mv-engine-meter .audio-engine-meter__grid {\r\n  grid-template-columns: minmax(0, 1.4fr) minmax(88px, 0.75fr);\r\n}\r\n.mv-settings-list {\r\n  display: grid;\r\n  gap: 9px;\r\n}\r\n.mv-settings-actions {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  flex-wrap: wrap;\r\n}\r\n.mv-section-menu-open {\r\n  position: relative;\r\n  z-index: 5;\r\n}\r\n.mv-settings-drawer .mv-network-section,\r\n.echo-mv-sheet .mv-network-section {\r\n  order: 2;\r\n}\r\n.mv-network-section > :not(.audio-drawer-section-title):not(.echo-mv-section-title):not(.mv-quality-controls):not(.mv-source-list) {\r\n  order: 2;\r\n}\r\n.mv-network-section > .audio-drawer-section-title,\r\n.mv-network-section > .echo-mv-section-title {\r\n  order: 0;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  width: 100%;\r\n}\r\n.mv-network-section > .audio-drawer-section-title > span,\r\n.mv-network-section > .echo-mv-section-title > span {\r\n  display: inline-flex;\r\n  min-width: 0;\r\n  align-items: center;\r\n  gap: 10px;\r\n}\r\n.mv-section-collapse {\r\n  display: grid;\r\n  width: 30px;\r\n  height: 30px;\r\n  flex: 0 0 auto;\r\n  place-items: center;\r\n  color: rgba(232, 240, 255, 0.82);\r\n  border: 1px solid var(--theme-glass-bg-soft, rgba(255, 255, 255, 0.13));\r\n  border-radius: 8px;\r\n  background: var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n  cursor: pointer;\r\n}\r\n.mv-section-collapse:hover {\r\n  color: var(--theme-overlay-text);\r\n  background: var(--theme-glass-bg-raised, rgba(255, 255, 255, 0.14));\r\n}\r\n.mv-section-collapse svg {\r\n  transition: transform 160ms ease;\r\n}\r\n.mv-network-section--open .mv-section-collapse svg {\r\n  transform: rotate(180deg);\r\n}\r\n.mv-network-section > .mv-quality-controls,\r\n.mv-network-section > .mv-source-list {\r\n  order: 1;\r\n}\r\n.mv-settings-drawer .audio-drawer-scroll {\r\n  padding-bottom: 96px;\r\n  scrollbar-color: rgba(228, 235, 255, 0.34) var(--theme-glass-bg-subtle, rgba(255, 255, 255, 0.05));\r\n  scrollbar-width: thin;\r\n}\r\n.mv-settings-drawer .audio-drawer-scroll::-webkit-scrollbar {\r\n  display: block;\r\n  width: 10px;\r\n}\r\n.mv-settings-drawer .audio-drawer-scroll::-webkit-scrollbar-track {\r\n  margin: 22px 0;\r\n  border-radius: 999px;\r\n  background: rgba(255, 255, 255, 0.05);\r\n}\r\n.mv-settings-drawer .audio-drawer-scroll::-webkit-scrollbar-thumb {\r\n  border: 3px solid rgba(0, 0, 0, 0);\r\n  border-radius: 999px;\r\n  background: rgba(231, 237, 255, 0.38);\r\n  background-clip: padding-box;\r\n}\r\n.mv-settings-drawer .audio-drawer-scroll::-webkit-scrollbar-thumb:hover {\r\n  background: rgba(244, 248, 255, 0.52);\r\n  background-clip: padding-box;\r\n}\r\n.mv-settings-actions button,\r\n.mv-search-controls > button[type='submit'],\r\n.mv-custom-controls button,\r\n.mv-selected-card button,\r\n.mv-source-drag-handle,\r\n.mv-source-toggle,\r\n.mv-quality-trigger {\r\n  display: inline-flex;\r\n  min-height: 32px;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 6px;\r\n  padding: 0 11px;\r\n  color: var(--audio-drawer-soft-text);\r\n  border: 1px solid var(--theme-glass-bg-soft, rgba(255, 255, 255, 0.13));\r\n  border-radius: 8px;\r\n  background: var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n  cursor: pointer;\r\n  font-size: 12px;\r\n  font-weight: 820;\r\n}\r\n.mv-settings-actions button:hover,\r\n.mv-search-controls > button[type='submit']:hover,\r\n.mv-custom-controls button:hover,\r\n.mv-selected-card button:hover,\r\n.mv-settings-candidate:hover,\r\n.mv-source-drag-handle:hover,\r\n.mv-source-toggle:hover,\r\n.mv-quality-trigger:hover {\r\n  background: var(--theme-glass-bg-raised, rgba(255, 255, 255, 0.14));\r\n}\r\n.mv-settings-actions button:disabled,\r\n.mv-search-controls > button[type='submit']:disabled,\r\n.mv-custom-controls button:disabled,\r\n.mv-settings-candidate:disabled,\r\n.mv-quality-popover button:disabled {\r\n  color: rgba(220, 231, 255, 0.58);\r\n  border-color: var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n  background: var(--theme-glass-bg-subtle, rgba(255, 255, 255, 0.05));\r\n  cursor: default;\r\n  opacity: 0.52;\r\n}\r\n.mv-search-controls > button[type='submit']:disabled:hover,\r\n.mv-custom-controls button:disabled:hover {\r\n  background: var(--theme-glass-bg-subtle, rgba(255, 255, 255, 0.05));\r\n}\r\n.mv-source-list {\r\n  display: grid;\r\n  gap: 8px;\r\n}\r\n.mv-source-row {\r\n  display: grid;\r\n  grid-template-columns: 46px minmax(0, 1fr);\r\n  align-items: center;\r\n  gap: 8px;\r\n  transition:\r\n    opacity 160ms ease,\r\n    transform 160ms ease;\r\n}\r\n.mv-source-row[data-dragging=\"true\"] {\r\n  opacity: 0.56;\r\n}\r\n.mv-source-row[data-drop-target=\"true\"] .mv-source-toggle,\r\n.mv-source-row[data-drop-target=\"true\"] .mv-source-drag-handle {\r\n  border-color: rgba(143, 207, 189, 0.42);\r\n  background: rgba(143, 207, 189, 0.16);\r\n}\r\n.mv-source-drag-handle {\r\n  width: 46px;\r\n  min-height: 42px;\r\n  padding: 0;\r\n  color: rgba(220, 231, 255, 0.72);\r\n  cursor: grab;\r\n  user-select: none;\r\n}\r\n.mv-source-drag-handle:active {\r\n  cursor: grabbing;\r\n}\r\n.mv-source-drag-handle small {\r\n  min-width: 14px;\r\n  color: rgba(220, 231, 255, 0.58);\r\n  font-size: 10px;\r\n  font-weight: 860;\r\n  line-height: 1;\r\n}\r\n.mv-source-toggle {\r\n  min-height: 42px;\r\n  width: 100%;\r\n  gap: 10px;\r\n  justify-content: flex-start;\r\n  padding: 0 12px;\r\n  text-align: left;\r\n}\r\n.mv-source-toggle .mv-switch-track {\r\n  position: relative;\r\n  display: inline-flex;\r\n  width: 34px;\r\n  height: 20px;\r\n  flex: 0 0 auto;\r\n  align-items: center;\r\n  border-radius: 999px;\r\n  background: rgba(220, 231, 255, 0.24);\r\n  transition:\r\n    background 160ms ease;\r\n}\r\n.mv-source-toggle .mv-switch-track span {\r\n  width: 14px;\r\n  height: 14px;\r\n  margin-left: 2px;\r\n  border-radius: 50%;\r\n  background: rgba(244, 248, 255, 0.78);\r\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22);\r\n  transition:\r\n    background 160ms ease,\r\n    transform 160ms ease;\r\n}\r\n.mv-source-toggle[aria-pressed=\"true\"] {\r\n  border-color: var(--theme-glass-bg-hover, rgba(255, 255, 255, 0.18));\r\n  background: var(--theme-glass-bg-soft, rgba(255, 255, 255, 0.13));\r\n}\r\n.mv-source-toggle[aria-pressed=\"true\"] .mv-switch-track {\r\n  background: rgba(104, 151, 226, 0.44);\r\n}\r\n.mv-source-toggle[aria-pressed=\"true\"] .mv-switch-track span {\r\n  background: #f4f8ff;\r\n  transform: translateX(14px);\r\n}\r\n.mv-source-toggle.mv-master-toggle {\r\n  min-height: 56px;\r\n  padding: 2px 0 6px;\r\n  border-color: transparent;\r\n  background: transparent;\r\n}\r\n.mv-source-toggle.mv-master-toggle:hover,\r\n.mv-source-toggle.mv-master-toggle[aria-pressed=\"true\"],\r\n.mv-source-toggle.mv-master-toggle[aria-pressed=\"true\"]:hover {\r\n  border-color: transparent;\r\n  background: transparent;\r\n}\r\n.mv-source-toggle.mv-master-toggle .mv-switch-track {\r\n  width: 46px;\r\n  height: 26px;\r\n  background: rgba(220, 231, 255, 0.3);\r\n}\r\n.mv-source-toggle.mv-master-toggle .mv-switch-track span {\r\n  width: 20px;\r\n  height: 20px;\r\n  background: var(--theme-overlay-text);\r\n}\r\n.mv-source-toggle.mv-master-toggle[aria-pressed=\"true\"] .mv-switch-track {\r\n  background: rgba(143, 207, 189, 0.62);\r\n}\r\n.mv-source-toggle.mv-master-toggle[aria-pressed=\"true\"] .mv-switch-track span {\r\n  transform: translateX(20px);\r\n}\r\n.mv-source-toggle.mv-master-toggle .mv-toggle-copy {\r\n  gap: 4px;\r\n}\r\n.mv-source-toggle.mv-master-toggle .mv-toggle-copy strong {\r\n  font-size: 15px;\r\n  font-weight: 900;\r\n}\r\n.mv-source-toggle.mv-master-toggle .mv-toggle-copy em {\r\n  color: rgba(220, 231, 255, 0.72);\r\n  font-size: 12px;\r\n  font-weight: 820;\r\n}\r\n.mv-auto-apply-toggle {\r\n  min-height: 54px;\r\n  align-items: center;\r\n  padding-block: 8px;\r\n}\r\n.mv-current-song-toggle,\r\n.mv-auto-apply-toggle {\r\n  border-color: transparent;\r\n  background: transparent;\r\n}\r\n.mv-current-song-toggle:hover,\r\n.mv-auto-apply-toggle:hover,\r\n.mv-current-song-toggle[aria-pressed=\"true\"],\r\n.mv-auto-apply-toggle[aria-pressed=\"true\"],\r\n.mv-current-song-toggle[aria-pressed=\"true\"]:hover,\r\n.mv-auto-apply-toggle[aria-pressed=\"true\"]:hover {\r\n  border-color: transparent;\r\n  background: transparent;\r\n}\r\n.mv-toggle-copy {\r\n  display: grid;\r\n  min-width: 0;\r\n  gap: 3px;\r\n}\r\n.mv-toggle-copy strong,\r\n.mv-toggle-copy em {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.mv-toggle-copy strong {\r\n  color: var(--audio-drawer-text);\r\n  font-size: 12px;\r\n  font-weight: 840;\r\n}\r\n.mv-toggle-copy em {\r\n  overflow: visible;\r\n  color: rgba(220, 231, 255, 0.6);\r\n  font-size: 10px;\r\n  font-style: normal;\r\n  font-weight: 760;\r\n  line-height: 1.35;\r\n  text-overflow: clip;\r\n  white-space: normal;\r\n}\r\n.mv-threshold-control {\r\n  display: grid;\r\n  gap: 10px;\r\n  padding: 8px 12px 12px;\r\n}\r\n.mv-threshold-copy {\r\n  display: grid;\r\n  gap: 3px;\r\n}\r\n.mv-threshold-copy strong {\r\n  color: var(--audio-drawer-text);\r\n  font-size: 12px;\r\n  font-weight: 840;\r\n}\r\n.mv-threshold-copy em {\r\n  color: rgba(220, 231, 255, 0.6);\r\n  font-size: 10px;\r\n  font-style: normal;\r\n  font-weight: 760;\r\n  line-height: 1.35;\r\n}\r\n.mv-threshold-slider {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) 42px;\r\n  align-items: center;\r\n  gap: 10px;\r\n}\r\n.mv-threshold-slider input {\r\n  width: 100%;\r\n  accent-color: #8fcfbd;\r\n}\r\n.mv-threshold-slider strong {\r\n  color: var(--audio-drawer-soft-text);\r\n  font-size: 12px;\r\n  font-weight: 860;\r\n  text-align: right;\r\n}\r\n.mv-sync-mode-control {\r\n  display: grid;\r\n  gap: 10px;\r\n  padding: 4px 12px 12px;\r\n}\r\n.mv-sync-mode-buttons {\r\n  display: grid;\r\n  grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  gap: 6px;\r\n}\r\n.mv-sync-mode-buttons button {\r\n  min-height: 30px;\r\n  color: var(--audio-drawer-soft-text);\r\n  border: 1px solid var(--theme-glass-bg, rgba(255, 255, 255, 0.16));\r\n  border-radius: 8px;\r\n  background: var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n  cursor: pointer;\r\n  font-size: 11px;\r\n  font-weight: 850;\r\n}\r\n.mv-sync-mode-buttons button[aria-pressed=\"true\"] {\r\n  color: #10251f;\r\n  border-color: rgba(143, 207, 189, 0.72);\r\n  background: #8fcfbd;\r\n}\r\n.mv-immersive-controls {\r\n  display: grid;\r\n  gap: 8px;\r\n  padding: 2px 0 4px;\r\n}\r\n.mv-immersive-collapse {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  align-items: center;\r\n  gap: 10px;\r\n  min-height: 46px;\r\n  padding: 9px 11px;\r\n  color: var(--audio-drawer-text);\r\n  border: 1px solid var(--theme-glass-bg, rgba(255, 255, 255, 0.16));\r\n  border-radius: 10px;\r\n  background: var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n  cursor: pointer;\r\n  text-align: left;\r\n}\r\n.mv-immersive-collapse:hover {\r\n  border-color: rgba(143, 207, 189, 0.28);\r\n  background: var(--theme-glass-bg-raised, rgba(255, 255, 255, 0.14));\r\n}\r\n.mv-immersive-collapse > span {\r\n  display: flex;\r\n  min-width: 0;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n.mv-immersive-collapse strong {\r\n  flex: 0 0 auto;\r\n  font-size: 12px;\r\n  font-weight: 880;\r\n}\r\n.mv-immersive-collapse em {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--audio-drawer-muted-text);\r\n  font-size: 11px;\r\n  font-style: normal;\r\n  font-weight: 760;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.mv-immersive-collapse > svg:last-child {\r\n  color: var(--audio-drawer-muted-text);\r\n  transition: transform 160ms ease;\r\n}\r\n.mv-immersive-controls--open .mv-immersive-collapse > svg:last-child {\r\n  transform: rotate(180deg);\r\n}\r\n.mv-immersive-controls-body {\r\n  display: grid;\r\n  gap: 8px;\r\n}\r\n.mv-immersive-reset {\r\n  display: inline-flex;\r\n  width: fit-content;\r\n  min-height: 30px;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 6px;\r\n  margin: 0 12px 2px;\r\n  padding: 0 10px;\r\n  color: var(--audio-drawer-soft-text);\r\n  border: 1px solid var(--theme-glass-bg, rgba(255, 255, 255, 0.16));\r\n  border-radius: 8px;\r\n  background: var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n  cursor: pointer;\r\n  font-size: 11px;\r\n  font-weight: 820;\r\n}\r\n.mv-immersive-reset:hover {\r\n  border-color: rgba(143, 207, 189, 0.28);\r\n  background: var(--theme-glass-bg-raised, rgba(255, 255, 255, 0.14));\r\n}\r\n.mv-quality-controls {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr);\r\n  align-items: end;\r\n  gap: 8px;\r\n}\r\n.mv-quality-menu {\r\n  position: relative;\r\n  display: grid;\r\n  min-width: 0;\r\n  gap: 6px;\r\n}\r\n.mv-field-label {\r\n  display: grid;\r\n  color: rgba(220, 231, 255, 0.7);\r\n  font-size: 11px;\r\n  font-weight: 800;\r\n}\r\n.mv-quality-trigger {\r\n  min-width: 0;\r\n  width: 100%;\r\n  outline: 0;\r\n  font: inherit;\r\n  justify-content: space-between;\r\n  padding: 0 12px;\r\n  text-align: left;\r\n}\r\n.mv-quality-trigger span {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.mv-quality-trigger svg:last-child {\r\n  flex: 0 0 auto;\r\n  opacity: 0.72;\r\n}\r\n.mv-quality-popover {\r\n  position: absolute;\r\n  z-index: 30;\r\n  top: calc(100% + 6px);\r\n  right: 0;\r\n  left: 0;\r\n  display: grid;\r\n  gap: 4px;\r\n  padding: 6px;\r\n  border: 1px solid var(--theme-glass-bg-strong, rgba(255, 255, 255, 0.22));\r\n  border-radius: 10px;\r\n  background: rgba(35, 37, 55, 0.97);\r\n  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34);\r\n  backdrop-filter: blur(14px);\r\n}\r\n.mv-quality-popover button {\r\n  display: grid;\r\n  min-height: 34px;\r\n  grid-template-columns: minmax(0, 1fr) 18px;\r\n  align-items: center;\r\n  gap: 8px;\r\n  padding: 0 9px;\r\n  color: var(--audio-drawer-soft-text);\r\n  border: 0;\r\n  border-radius: 7px;\r\n  background: transparent;\r\n  cursor: pointer;\r\n  font: inherit;\r\n  font-size: 12px;\r\n  font-weight: 820;\r\n  text-align: left;\r\n}\r\n.mv-quality-popover button:hover,\r\n.mv-quality-popover button[data-selected=\"true\"] {\r\n  background: rgba(143, 207, 189, 0.13);\r\n}\r\n.mv-quality-popover button span {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.mv-selected-card {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  align-items: center;\r\n  gap: 10px;\r\n  padding: 11px;\r\n  border: 1px solid rgba(143, 207, 189, 0.18);\r\n  border-radius: 10px;\r\n  background: rgba(143, 207, 189, 0.08);\r\n}\r\n.mv-selected-card > span {\r\n  display: grid;\r\n  min-width: 0;\r\n  gap: 3px;\r\n}\r\n.mv-selected-card strong,\r\n.mv-selected-card em,\r\n.mv-settings-candidate strong,\r\n.mv-settings-candidate em {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.mv-selected-card strong,\r\n.mv-settings-candidate strong {\r\n  color: var(--audio-drawer-text);\r\n  font-size: 12px;\r\n  font-weight: 840;\r\n}\r\n.mv-selected-card em,\r\n.mv-settings-candidate em {\r\n  color: rgba(220, 231, 255, 0.62);\r\n  font-size: 11px;\r\n  font-style: normal;\r\n  font-weight: 740;\r\n}\r\n.mv-selected-card > div {\r\n  display: flex;\r\n  gap: 6px;\r\n}\r\n.mv-selected-card button {\r\n  width: 32px;\r\n  padding: 0;\r\n}\r\n.mv-drawer-offset {\r\n  display: grid;\r\n  gap: 8px;\r\n  padding: 10px;\r\n  border: 1px solid rgba(220, 231, 255, 0.1);\r\n  border-radius: 9px;\r\n  background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.025));\r\n}\r\n.mv-drawer-offset .mv-offset-collapse-toggle {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  align-items: center;\r\n  gap: 8px;\r\n  width: 100%;\r\n  min-width: 0;\r\n  height: 30px;\r\n  padding: 0 8px;\r\n  color: rgba(220, 231, 255, 0.82);\r\n  border-color: transparent;\r\n  border-radius: 8px;\r\n  background: rgba(255, 255, 255, 0.04);\r\n}\r\n.mv-drawer-offset .mv-offset-collapse-toggle > span {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 5px;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--audio-drawer-text);\r\n  font-size: 12px;\r\n  font-weight: 840;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.mv-drawer-offset .mv-offset-collapse-toggle strong {\r\n  color: rgba(244, 248, 255, 0.82);\r\n  font-size: 12px;\r\n  font-weight: 850;\r\n}\r\n.mv-drawer-offset .mv-offset-advanced {\r\n  display: grid;\r\n  gap: 8px;\r\n  padding-top: 2px;\r\n}\r\n.mv-drawer-offset .mv-offset-advanced p {\r\n  margin: 0;\r\n  color: rgba(220, 231, 255, 0.62);\r\n  font-size: 11px;\r\n  font-weight: 720;\r\n  line-height: 1.35;\r\n}\r\n.mv-drawer-offset .mv-offset-slider-row {\r\n  display: grid;\r\n  grid-template-columns: auto minmax(0, 1fr) auto;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n.mv-drawer-offset .mv-offset-slider-row span {\r\n  min-width: 44px;\r\n  color: rgba(220, 231, 255, 0.58);\r\n  font-size: 10px;\r\n  font-weight: 760;\r\n  text-align: center;\r\n}\r\n.mv-drawer-offset .mv-offset-slider-row input {\r\n  width: 100%;\r\n  min-width: 0;\r\n  accent-color: var(--theme-accent, var(--color-accent, #4b55e8));\r\n}\r\n.mv-drawer-offset .mv-offset-number {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) 112px auto;\r\n  align-items: center;\r\n  gap: 8px;\r\n  min-width: 0;\r\n}\r\n.mv-drawer-offset .mv-offset-number span,\r\n.mv-drawer-offset .mv-offset-number em {\r\n  color: rgba(220, 231, 255, 0.66);\r\n  font-size: 11px;\r\n  font-style: normal;\r\n  font-weight: 760;\r\n}\r\n.mv-drawer-offset .mv-offset-number input {\r\n  min-width: 0;\r\n  height: 30px;\r\n  padding: 0 9px;\r\n  border: 1px solid var(--theme-glass-bg, rgba(255, 255, 255, 0.16));\r\n  border-radius: 7px;\r\n  background: rgba(255, 255, 255, 0.055);\r\n  color: rgba(244, 248, 255, 0.9);\r\n  font: inherit;\r\n  font-size: 12px;\r\n  font-weight: 780;\r\n}\r\n.mv-drawer-offset .mv-offset-step-row {\r\n  display: grid;\r\n  grid-template-columns: auto repeat(5, minmax(38px, 1fr));\r\n  align-items: center;\r\n  width: 100%;\r\n  gap: 6px;\r\n}\r\n.mv-drawer-offset .mv-offset-step-row > span {\r\n  min-width: max-content;\r\n  color: rgba(220, 231, 255, 0.66);\r\n  font-size: 11px;\r\n  font-weight: 760;\r\n  white-space: nowrap;\r\n}\r\n.mv-drawer-offset .mv-offset-step-row button {\r\n  height: 26px;\r\n  min-width: 0;\r\n  padding: 0 7px;\r\n  color: rgba(220, 231, 255, 0.75);\r\n  border-color: transparent;\r\n  border-radius: 999px;\r\n  background: rgba(255, 255, 255, 0.055);\r\n  font-size: 11px;\r\n}\r\n.mv-drawer-offset .mv-offset-step-row button[aria-pressed=\"true\"] {\r\n  color: var(--theme-overlay-text);\r\n  border-color: color-mix(in srgb, var(--theme-accent, var(--color-accent, #4b55e8)) 48%, transparent);\r\n  background: color-mix(in srgb, var(--theme-accent, var(--color-accent, #4b55e8)) 30%, rgba(255, 255, 255, 0.07));\r\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);\r\n}\r\n.mv-drawer-offset .mv-offset-actions {\r\n  display: grid;\r\n  grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  width: 100%;\r\n  gap: 7px;\r\n}\r\n.mv-drawer-offset .mv-offset-actions button {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 5px;\r\n  min-width: 0;\r\n  flex: initial;\r\n  height: 30px;\r\n  padding: 0 6px;\r\n  color: rgba(220, 231, 255, 0.82);\r\n  border-color: transparent;\r\n  border-radius: 999px;\r\n  background: rgba(255, 255, 255, 0.055);\r\n  font-size: 10.5px;\r\n  font-weight: 800;\r\n}\r\n.mv-drawer-offset .mv-offset-actions button span {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.mv-drawer-offset .mv-offset-actions button svg {\r\n  flex: 0 0 auto;\r\n}\r\n.mv-drawer-offset .mv-offset-actions button:hover,\r\n.mv-drawer-offset .mv-offset-step-row button:hover {\r\n  color: var(--theme-overlay-text);\r\n  background: var(--theme-glass-bg-raised, rgba(255, 255, 255, 0.14));\r\n}\r\n.mv-drawer-offset .mv-offset-start-card {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) 88px 64px;\r\n  align-items: center;\r\n  gap: 8px;\r\n  padding: 8px;\r\n  border: 1px solid color-mix(in srgb, var(--theme-accent, var(--color-accent, #4b55e8)) 28%, transparent);\r\n  border-radius: 8px;\r\n  background: color-mix(in srgb, var(--theme-accent, var(--color-accent, #4b55e8)) 10%, rgba(255, 255, 255, 0.045));\r\n}\r\n.mv-drawer-offset .mv-offset-start-card > span {\r\n  display: grid;\r\n  min-width: 0;\r\n  gap: 3px;\r\n}\r\n.mv-drawer-offset .mv-offset-start-card strong {\r\n  color: var(--audio-drawer-text);\r\n  font-size: 11.5px;\r\n  font-weight: 840;\r\n}\r\n.mv-drawer-offset .mv-offset-start-card > span em {\r\n  color: rgba(220, 231, 255, 0.6);\r\n  font-size: 10.5px;\r\n  font-style: normal;\r\n  font-weight: 720;\r\n  line-height: 1.35;\r\n}\r\n.mv-drawer-offset .mv-offset-start-card label {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  align-items: center;\r\n  gap: 6px;\r\n}\r\n.mv-drawer-offset .mv-offset-start-card input {\r\n  min-width: 0;\r\n  height: 30px;\r\n  padding: 0 8px;\r\n  border: 1px solid color-mix(in srgb, var(--theme-accent, var(--color-accent, #4b55e8)) 34%, transparent);\r\n  border-radius: 8px;\r\n  background: rgba(255, 255, 255, 0.08);\r\n  color: rgba(244, 248, 255, 0.94);\r\n  font: inherit;\r\n  font-size: 13px;\r\n  font-weight: 850;\r\n}\r\n.mv-drawer-offset .mv-offset-start-card label em {\r\n  color: rgba(220, 231, 255, 0.66);\r\n  font-size: 11px;\r\n  font-style: normal;\r\n  font-weight: 760;\r\n}\r\n.mv-drawer-offset .mv-offset-replay-button {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 5px;\r\n  min-width: 0;\r\n  height: 30px;\r\n  padding: 0 7px;\r\n  color: rgba(244, 248, 255, 0.9);\r\n  border-color: color-mix(in srgb, var(--theme-accent, var(--color-accent, #4b55e8)) 28%, transparent);\r\n  border-radius: 999px;\r\n  background: color-mix(in srgb, var(--theme-accent, var(--color-accent, #4b55e8)) 18%, rgba(255, 255, 255, 0.07));\r\n  font-size: 10.5px;\r\n  font-weight: 850;\r\n}\r\n.mv-drawer-offset .mv-offset-replay-button span {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.mv-drawer-offset .mv-offset-replay-button svg {\r\n  flex: 0 0 auto;\r\n}\r\n.mv-settings-candidates {\r\n  display: grid;\r\n  gap: 8px;\r\n  max-height: 220px;\r\n  overflow: auto;\r\n  padding-right: 5px;\r\n  scrollbar-color: rgba(236, 240, 255, 0.36) var(--theme-glass-bg-subtle, rgba(255, 255, 255, 0.05));\r\n  scrollbar-width: thin;\r\n}\r\n.mv-settings-search-empty,\r\n.mv-settings-search-error {\r\n  margin: 0;\r\n  padding: 10px 12px;\r\n  border-radius: 8px;\r\n  font-size: 11px;\r\n  font-weight: 760;\r\n  line-height: 1.45;\r\n}\r\n.mv-settings-search-empty {\r\n  color: rgba(220, 231, 255, 0.76);\r\n  border: 1px solid rgba(220, 231, 255, 0.1);\r\n  background: rgba(220, 231, 255, 0.08);\r\n}\r\n.mv-settings-search-error {\r\n  color: rgba(255, 218, 218, 0.9);\r\n  border: 1px solid rgba(255, 184, 184, 0.18);\r\n  background: rgba(154, 65, 65, 0.18);\r\n}\r\n.mv-settings-candidates::-webkit-scrollbar {\r\n  width: 9px;\r\n}\r\n.mv-settings-candidates::-webkit-scrollbar-track {\r\n  border-radius: 999px;\r\n  background: var(--theme-glass-bg-subtle, rgba(255, 255, 255, 0.05));\r\n}\r\n.mv-settings-candidates::-webkit-scrollbar-thumb {\r\n  border: 2px solid rgba(0, 0, 0, 0);\r\n  border-radius: 999px;\r\n  background: rgba(237, 241, 255, 0.42);\r\n  background-clip: padding-box;\r\n}\r\n.mv-settings-candidates::-webkit-scrollbar-thumb:hover {\r\n  background: rgba(247, 250, 255, 0.58);\r\n  background-clip: padding-box;\r\n}\r\n.mv-settings-candidate {\r\n  display: grid;\r\n  width: 100%;\r\n  min-height: 54px;\r\n  grid-template-columns: 52px minmax(0, 1fr) auto auto auto;\r\n  align-items: center;\r\n  gap: 8px;\r\n  padding: 9px 11px;\r\n  color: rgba(244, 248, 255, 0.88);\r\n  border: 1px solid var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n  border-radius: 8px;\r\n  background: var(--theme-glass-bg-subtle, rgba(255, 255, 255, 0.05));\r\n  cursor: pointer;\r\n  text-align: left;\r\n}\r\n.mv-settings-candidate > span {\r\n  display: grid;\r\n  min-width: 0;\r\n  gap: 3px;\r\n}\r\n.mv-settings-candidate .mv-candidate-thumb {\r\n  display: grid;\r\n  width: 52px;\r\n  aspect-ratio: 16 / 10;\r\n  place-items: center;\r\n  overflow: hidden;\r\n  color: rgba(220, 231, 255, 0.7);\r\n  border-radius: 7px;\r\n  background: var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n}\r\n.mv-candidate-thumb img {\r\n  width: 100%;\r\n  height: 100%;\r\n  object-fit: cover;\r\n}\r\n.mv-candidate-thumb-fallback {\r\n  display: grid;\r\n  width: 100%;\r\n  height: 100%;\r\n  min-width: 0;\r\n  grid-template-columns: 15px minmax(0, 1fr);\r\n  align-items: center;\r\n  gap: 5px;\r\n  padding: 0 7px;\r\n  color: rgba(220, 231, 255, 0.72);\r\n}\r\n.mv-candidate-thumb-fallback em {\r\n  overflow: hidden;\r\n  color: rgba(244, 248, 255, 0.78);\r\n  font-size: 10px;\r\n  font-style: normal;\r\n  font-weight: 820;\r\n  line-height: 1.1;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.mv-settings-candidate small {\r\n  min-height: 22px;\r\n  padding: 0 7px;\r\n  color: rgba(220, 231, 255, 0.72);\r\n  border-radius: 7px;\r\n  background: var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n  font-size: 10px;\r\n  font-weight: 820;\r\n  line-height: 22px;\r\n  white-space: nowrap;\r\n}\r\n.mv-search-controls {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  gap: 9px;\r\n  padding-top: 13px;\r\n  border-top: 1px solid var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n}\r\n.mv-search-input {\r\n  display: grid;\r\n  min-width: 0;\r\n  min-height: 42px;\r\n  grid-template-columns: 18px minmax(0, 1fr);\r\n  align-items: center;\r\n  gap: 8px;\r\n  padding: 0 12px;\r\n  color: rgba(220, 231, 255, 0.7);\r\n  border: 1px solid var(--theme-glass-bg, rgba(255, 255, 255, 0.16));\r\n  border-radius: 10px;\r\n  background: rgba(11, 16, 28, 0.16);\r\n}\r\n.mv-search-input:focus-within {\r\n  border-color: rgba(142, 171, 235, 0.44);\r\n  background: rgba(14, 20, 34, 0.28);\r\n}\r\n.mv-search-input input {\r\n  width: 100%;\r\n  min-width: 0;\r\n  color: var(--audio-drawer-text);\r\n  border: 0;\r\n  outline: 0;\r\n  background: transparent;\r\n  font: inherit;\r\n  font-size: 13px;\r\n  font-weight: 760;\r\n}\r\n.mv-search-input input::placeholder {\r\n  color: rgba(220, 231, 255, 0.48);\r\n}\r\n.mv-search-controls > button[type='submit'] {\r\n  min-height: 42px;\r\n  padding: 0 12px;\r\n}\r\n.mv-current-song-toggle {\r\n  grid-column: 1 / -1;\r\n  min-height: 40px;\r\n  padding: 0 14px;\r\n}\r\n.mv-current-song-toggle .mv-toggle-copy {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 10px;\r\n}\r\n.mv-current-song-toggle .mv-toggle-copy strong {\r\n  flex: 0 1 auto;\r\n}\r\n.mv-current-song-toggle .mv-toggle-copy em {\r\n  flex: 0 0 auto;\r\n  white-space: nowrap;\r\n}\r\n.mv-custom-card {\r\n  position: relative;\r\n  display: grid;\r\n  gap: 12px;\r\n  padding: 13px 0 14px;\r\n  border-top: 1px solid var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n}\r\n.mv-custom-heading,\r\n.mv-custom-controls,\r\n.mv-custom-status {\r\n  position: relative;\r\n  z-index: 1;\r\n}\r\n.mv-custom-heading {\r\n  display: grid;\r\n  gap: 6px;\r\n}\r\n.mv-custom-heading span {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 9px;\r\n  color: var(--audio-drawer-soft-text);\r\n}\r\n.mv-custom-heading strong {\r\n  font-size: 13px;\r\n  font-weight: 850;\r\n}\r\n.mv-custom-heading em {\r\n  color: rgba(220, 231, 255, 0.58);\r\n  font-size: 11px;\r\n  font-style: normal;\r\n  font-weight: 730;\r\n  line-height: 1.45;\r\n}\r\n.mv-custom-controls {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) 48px;\r\n  gap: 9px;\r\n  padding: 0;\r\n  border-radius: 12px;\r\n}\r\n.mv-custom-input {\r\n  display: grid;\r\n  min-width: 0;\r\n  min-height: 46px;\r\n  align-items: center;\r\n  padding: 0 13px;\r\n  border: 1px solid rgba(255, 255, 255, 0.11);\r\n  border-radius: 11px;\r\n  background: rgba(11, 16, 28, 0.16);\r\n}\r\n.mv-custom-input:focus-within {\r\n  border-color: rgba(142, 171, 235, 0.44);\r\n  background: rgba(14, 20, 34, 0.28);\r\n}\r\n.mv-custom-input input {\r\n  width: 100%;\r\n  min-width: 0;\r\n  color: rgba(244, 248, 255, 0.94);\r\n  border: 0;\r\n  outline: 0;\r\n  background: transparent;\r\n  font: inherit;\r\n  font-size: 12px;\r\n  font-weight: 780;\r\n}\r\n.mv-custom-input input::placeholder {\r\n  color: rgba(220, 231, 255, 0.36);\r\n}\r\n.mv-custom-controls button {\r\n  min-height: 46px;\r\n  padding: 0;\r\n  color: rgba(232, 228, 255, 0.92);\r\n  border-color: rgba(142, 171, 235, 0.18);\r\n  border-radius: 11px;\r\n  background: var(--theme-glass-bg-muted, rgba(255, 255, 255, 0.09));\r\n}\r\n.mv-custom-controls button:hover {\r\n  color: var(--theme-overlay-text);\r\n  border-color: rgba(142, 171, 235, 0.34);\r\n  background: var(--theme-glass-bg-raised, rgba(255, 255, 255, 0.14));\r\n}\r\n.mv-custom-status {\r\n  display: grid;\r\n  min-width: 0;\r\n  gap: 8px;\r\n  color: rgba(220, 231, 255, 0.62);\r\n  font-size: 11px;\r\n  font-weight: 760;\r\n}\r\n.mv-custom-status a,\r\n.mv-custom-status > span {\r\n  min-width: 0;\r\n  max-width: 100%;\r\n  overflow: hidden;\r\n  color: rgba(220, 231, 255, 0.68);\r\n  text-decoration: none;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.mv-custom-status a {\r\n  display: inline-flex;\r\n  width: fit-content;\r\n  max-width: 100%;\r\n  align-items: center;\r\n  gap: 6px;\r\n}\r\n.mv-custom-status a:hover {\r\n  color: var(--audio-drawer-text);\r\n  text-decoration: underline;\r\n  text-underline-offset: 3px;\r\n}\r\n.mv-custom-status a svg {\r\n  flex: 0 0 auto;\r\n}\r\n.mv-custom-badges {\r\n  display: flex;\r\n  min-width: 0;\r\n  align-items: center;\r\n  gap: 8px;\r\n  flex-wrap: wrap;\r\n}\r\n.mv-custom-status strong,\r\n.mv-custom-status em {\r\n  display: inline-flex;\r\n  min-height: 24px;\r\n  align-items: center;\r\n  padding: 0 9px;\r\n  color: rgba(222, 229, 255, 0.9);\r\n  border: 1px solid rgba(134, 121, 214, 0.25);\r\n  border-radius: 6px;\r\n  background: rgba(103, 91, 169, 0.34);\r\n  font-style: normal;\r\n  font-weight: 840;\r\n}\r\n.mv-settings-list span {\r\n  display: grid;\r\n  grid-template-columns: 18px minmax(0, 1fr);\r\n  align-items: center;\r\n  gap: 9px;\r\n  color: var(--audio-drawer-muted-text);\r\n  font-size: 12px;\r\n  font-weight: 760;\r\n  line-height: 1.45;\r\n}\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-copy strong {\r\n  color: var(--theme-page-text);\r\n  font-size: 13px;\r\n}\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-copy em {\r\n  color: var(--settings-lyrics-muted-text);\r\n  font-size: 11px;\r\n}\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-slider {\r\n  width: 100%;\r\n  grid-template-columns: minmax(180px, 1fr) auto;\r\n  justify-content: stretch;\r\n}\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-slider input[type=\"range\"] {\r\n  appearance: none;\r\n  width: 100%;\r\n  height: 18px;\r\n  border-radius: 999px;\r\n  background: transparent;\r\n  accent-color: var(--settings-lyrics-slider-thumb);\r\n  cursor: pointer;\r\n}\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-slider input[type=\"range\"]::-webkit-slider-runnable-track {\r\n  height: 5px;\r\n  border-radius: 999px;\r\n  background: var(--settings-lyrics-slider-track);\r\n  box-shadow: inset 0 1px 1px color-mix(in srgb, var(--theme-page-text) 8%, transparent);\r\n}\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-slider input[type=\"range\"]::-webkit-slider-thumb {\r\n  appearance: none;\r\n  width: 15px;\r\n  height: 15px;\r\n  margin-top: -5px;\r\n  border: 2px solid var(--settings-lyrics-slider-thumb-border);\r\n  border-radius: 50%;\r\n  background: var(--settings-lyrics-slider-thumb);\r\n  box-shadow: var(--settings-lyrics-slider-thumb-shadow);\r\n}\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-slider input[type=\"range\"]::-moz-range-track {\r\n  height: 5px;\r\n  border-radius: 999px;\r\n  background: var(--settings-lyrics-slider-track);\r\n}\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-slider input[type=\"range\"]::-moz-range-progress {\r\n  height: 5px;\r\n  border-radius: 999px;\r\n  background: var(--settings-lyrics-slider-thumb);\r\n}\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-slider input[type=\"range\"]::-moz-range-thumb {\r\n  width: 13px;\r\n  height: 13px;\r\n  border: 2px solid var(--settings-lyrics-slider-thumb-border);\r\n  border-radius: 50%;\r\n  background: var(--settings-lyrics-slider-thumb);\r\n  box-shadow: var(--settings-lyrics-slider-thumb-shadow);\r\n}\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-slider strong {\r\n  min-width: 38px;\r\n  padding: 2px 7px;\r\n  color: var(--settings-lyrics-value-text);\r\n  border-radius: 999px;\r\n  background: var(--settings-lyrics-value-bg);\r\n  text-align: center;\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-size-controls .mv-threshold-control {\r\n  display: grid;\r\n  min-width: 0;\r\n  min-height: 74px;\r\n  grid-template-columns: minmax(0, 1fr);\r\n  align-content: center;\r\n  gap: 9px;\r\n  padding: 10px 12px;\r\n  border: 1px solid var(--settings-lyrics-border-subtle);\r\n  border-radius: 8px;\r\n  background:\r\n    linear-gradient(135deg, color-mix(in srgb, var(--theme-accent-bg) 18%, transparent), transparent 58%),\r\n    var(--settings-lyrics-chip-bg);\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-size-controls .mv-threshold-copy {\r\n  min-width: 0;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  align-items: baseline;\r\n  gap: 8px;\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-size-controls .mv-threshold-copy strong {\r\n  overflow: hidden;\r\n  color: var(--theme-page-text);\r\n  font-size: 12px;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-size-controls .mv-threshold-copy em {\r\n  overflow: hidden;\r\n  color: var(--settings-lyrics-muted-text);\r\n  font-size: 10px;\r\n  text-align: right;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-size-controls .mv-threshold-slider {\r\n  width: 100%;\r\n  max-width: 280px;\r\n  grid-template-columns: minmax(120px, 1fr) auto;\r\n  justify-self: end;\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-opacity-control .mv-threshold-copy strong {\r\n  color: var(--theme-page-text);\r\n  font-size: 13px;\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-opacity-control .mv-threshold-copy em {\r\n  color: var(--theme-muted-text);\r\n  font-size: 12px;\r\n  font-weight: 720;\r\n  line-height: 1.45;\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-opacity-control .mv-threshold-slider {\r\n  width: 100%;\r\n  grid-template-columns: minmax(160px, 1fr) auto;\r\n  justify-content: stretch;\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-opacity-control .mv-threshold-slider input[type=\"range\"] {\r\n  appearance: none;\r\n  width: 100%;\r\n  height: 18px;\r\n  border-radius: 999px;\r\n  background: transparent;\r\n  accent-color: var(--settings-lyrics-slider-thumb);\r\n  cursor: pointer;\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-opacity-control .mv-threshold-slider input[type=\"range\"]::-webkit-slider-runnable-track {\r\n  height: 5px;\r\n  border-radius: 999px;\r\n  background: var(--settings-lyrics-slider-track);\r\n  box-shadow: inset 0 1px 1px color-mix(in srgb, var(--theme-page-text) 8%, transparent);\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-opacity-control .mv-threshold-slider input[type=\"range\"]::-webkit-slider-thumb {\r\n  appearance: none;\r\n  width: 15px;\r\n  height: 15px;\r\n  margin-top: -5px;\r\n  border: 2px solid var(--settings-lyrics-slider-thumb-border);\r\n  border-radius: 50%;\r\n  background: var(--settings-lyrics-slider-thumb);\r\n  box-shadow: var(--settings-lyrics-slider-thumb-shadow);\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-opacity-control .mv-threshold-slider input[type=\"range\"]::-moz-range-track {\r\n  height: 5px;\r\n  border-radius: 999px;\r\n  background: var(--settings-lyrics-slider-track);\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-opacity-control .mv-threshold-slider input[type=\"range\"]::-moz-range-progress {\r\n  height: 5px;\r\n  border-radius: 999px;\r\n  background: var(--settings-lyrics-slider-thumb);\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-opacity-control .mv-threshold-slider input[type=\"range\"]::-moz-range-thumb {\r\n  width: 13px;\r\n  height: 13px;\r\n  border: 2px solid var(--settings-lyrics-slider-thumb-border);\r\n  border-radius: 50%;\r\n  background: var(--settings-lyrics-slider-thumb);\r\n  box-shadow: var(--settings-lyrics-slider-thumb-shadow);\r\n}\r\n.lyrics-settings-panel .lyrics-desktop-opacity-control .mv-threshold-copy strong {\r\n  color: var(--theme-page-text, var(--audio-drawer-text));\r\n  font-size: 13px;\r\n}\r\n.lyrics-settings-panel .lyrics-desktop-opacity-control .mv-threshold-copy em {\r\n  color: var(--theme-muted-text, var(--audio-drawer-muted-text));\r\n  font-size: 12px;\r\n  font-weight: 720;\r\n  line-height: 1.45;\r\n}\r\n.lyrics-settings-panel .lyrics-desktop-opacity-control .mv-threshold-slider {\r\n  width: 100%;\r\n  max-width: 340px;\r\n  justify-self: end;\r\n  grid-template-columns: minmax(160px, 1fr) auto;\r\n}\r\n.lyrics-settings-drawer .audio-drawer-scroll,\r\n.lyrics-settings-drawer .audio-drawer-section,\r\n.lyrics-settings-drawer .audio-drawer-options,\r\n.lyrics-settings-drawer .audio-drawer-mini-grid,\r\n.lyrics-settings-drawer .audio-toggle-row,\r\n.lyrics-settings-drawer .audio-toggle-row > span,\r\n.lyrics-settings-drawer .audio-device-pill,\r\n.lyrics-settings-drawer .audio-device-pill span,\r\n.lyrics-settings-drawer .lyrics-font-panel,\r\n.lyrics-settings-drawer .lyrics-desktop-font-panel-body,\r\n.lyrics-settings-drawer .lyrics-font-actions,\r\n.lyrics-settings-drawer .lyrics-background-select,\r\n.lyrics-settings-drawer .lyrics-background-segmented,\r\n.lyrics-settings-drawer .lyrics-background-controls,\r\n.lyrics-settings-drawer .lyrics-cover-tuning,\r\n.lyrics-settings-drawer .lyrics-cover-tuning-body,\r\n.lyrics-settings-drawer .lyrics-source-panel,\r\n.lyrics-settings-drawer .lyrics-source-panel-body,\r\n.lyrics-settings-drawer .lyrics-source-grid,\r\n.lyrics-settings-drawer .lyrics-source-option,\r\n.lyrics-settings-drawer .lyrics-source-option span:not(.lyrics-source-drag-handle),\r\n.lyrics-settings-drawer .lyrics-color-panel,\r\n.lyrics-settings-drawer .lyrics-color-panel__header,\r\n.lyrics-settings-drawer .lyrics-mini-player-options,\r\n.lyrics-settings-drawer .lyrics-mini-player-tuning-row,\r\n.lyrics-settings-drawer .lyrics-desktop-settings-panel,\r\n.lyrics-settings-drawer .lyrics-desktop-size-controls,\r\n.lyrics-settings-drawer .lyrics-desktop-opacity-control,\r\n.lyrics-settings-drawer .lyrics-visual-group,\r\n.lyrics-settings-drawer .lyrics-visual-group__toggle,\r\n.lyrics-settings-drawer .lyrics-visual-group__heading,\r\n.lyrics-settings-drawer .lyrics-visual-group__heading > span,\r\n.lyrics-settings-drawer .lyrics-visual-group__shell,\r\n.lyrics-settings-drawer .lyrics-visual-group__content,\r\n.lyrics-settings-drawer .mv-threshold-slider {\r\n  min-width: 0;\r\n  max-width: 100%;\r\n  box-sizing: border-box;\r\n}\r\n.lyrics-settings-drawer .lyrics-section-collapse-button,\r\n.lyrics-settings-drawer .lyrics-settings-advanced-toggle,\r\n.lyrics-settings-drawer .lyrics-background-tuning-collapse-button,\r\n.lyrics-settings-drawer .lyrics-desktop-settings-panel__header span,\r\n.lyrics-settings-drawer .lyrics-desktop-opacity-control .mv-threshold-copy strong {\r\n  color: var(--settings-lyrics-drawer-text);\r\n}\r\n.lyrics-settings-drawer .lyrics-section-collapse-button small,\r\n.lyrics-settings-drawer .lyrics-section-collapse-button > span > svg,\r\n.lyrics-settings-drawer .lyrics-section-collapse-button > svg:last-child,\r\n.lyrics-settings-drawer .lyrics-background-tuning-collapse-button small,\r\n.lyrics-settings-drawer .lyrics-background-tuning-collapse-button > svg:last-child,\r\n.lyrics-settings-drawer .lyrics-desktop-settings-panel__header small,\r\n.lyrics-settings-drawer .lyrics-desktop-opacity-control .mv-threshold-copy em,\r\n.lyrics-settings-drawer .audio-drawer-options > p,\r\n.lyrics-settings-drawer .lyrics-visual-group__content > p,\r\n.lyrics-settings-drawer .lyrics-cover-tuning > p,\r\n.lyrics-settings-drawer .lyrics-source-panel p,\r\n.lyrics-settings-drawer .lyrics-mini-player-color-panel p {\r\n  color: var(--settings-lyrics-drawer-muted-text);\r\n  line-height: 1.35;\r\n}\r\n.lyrics-settings-drawer .lyrics-mini-player-tuning-row .lyrics-drawer-range,\r\n.lyrics-settings-drawer .lyrics-desktop-size-controls .mv-threshold-control,\r\n.lyrics-settings-drawer .lyrics-cover-tuning .lyrics-drawer-range {\r\n  width: 100%;\r\n  max-width: 100%;\r\n}\r\n.lyrics-settings-drawer .lyrics-word-highlight-settings .lyrics-drawer-range,\r\n.lyrics-settings-drawer .lyrics-style-range-grid .lyrics-drawer-range,\r\n.lyrics-settings-drawer .lyrics-match-threshold-control .mv-threshold-slider {\r\n  width: 100%;\r\n  max-width: 100%;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n}\r\n.lyrics-settings-drawer .lyrics-desktop-opacity-control .mv-threshold-slider {\r\n  width: 100%;\r\n  max-width: none;\r\n  justify-self: stretch;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n}\r\n.lyrics-settings-drawer .lyrics-desktop-opacity-control .mv-threshold-slider input[type=\"range\"] {\r\n  min-width: 0;\r\n}\r\n.lyrics-settings-drawer .mv-threshold-control {\r\n  --lyrics-drawer-range-progress: var(--lyrics-desktop-size-progress, 50%);\r\n  --lyrics-drawer-slider-fill: color-mix(in srgb, var(--audio-drawer-soft-text) 72%, var(--theme-accent-solid-bg) 28%);\r\n  --lyrics-drawer-slider-track: color-mix(in srgb, var(--theme-overlay-text) 18%, transparent);\r\n  --lyrics-drawer-slider-thumb: color-mix(in srgb, var(--theme-overlay-text) 88%, var(--theme-accent-solid-bg) 12%);\r\n  --lyrics-drawer-slider-thumb-border: color-mix(in srgb, var(--theme-overlay-bg) 46%, transparent);\r\n  --lyrics-drawer-slider-thumb-shadow: 0 4px 10px color-mix(in srgb, var(--theme-overlay-bg) 46%, transparent);\r\n  -webkit-app-region: no-drag;\r\n  gap: 10px;\r\n  min-width: 0;\r\n  padding-inline: 0;\r\n}\r\n.lyrics-settings-drawer .mv-threshold-copy strong,\r\n.lyrics-settings-drawer .lyrics-desktop-opacity-control .mv-threshold-copy strong,\r\n.lyrics-settings-drawer .lyrics-desktop-size-controls .mv-threshold-copy strong,\r\n.lyrics-settings-drawer .lyrics-match-threshold-control .mv-threshold-copy strong {\r\n  color: var(--audio-drawer-text);\r\n}\r\n.lyrics-settings-drawer .mv-threshold-copy em,\r\n.lyrics-settings-drawer .lyrics-desktop-opacity-control .mv-threshold-copy em,\r\n.lyrics-settings-drawer .lyrics-desktop-size-controls .mv-threshold-copy em,\r\n.lyrics-settings-drawer .lyrics-match-threshold-control .mv-threshold-copy em {\r\n  color: var(--audio-drawer-muted-text);\r\n}\r\n.lyrics-settings-drawer .mv-threshold-slider output,\r\n.lyrics-settings-drawer .mv-threshold-slider > strong,\r\n.lyrics-settings-drawer .lyrics-desktop-size-controls output,\r\n.lyrics-settings-drawer .lyrics-desktop-opacity-control output,\r\n.lyrics-settings-drawer .lyrics-match-threshold-control .mv-threshold-slider strong {\r\n  display: inline-flex;\r\n  width: 56px;\r\n  min-width: 56px;\r\n  max-width: 56px;\r\n  min-height: 32px;\r\n  align-items: center;\r\n  justify-content: flex-end;\r\n  padding: 0;\r\n  color: var(--audio-drawer-soft-text);\r\n  border-radius: 0;\r\n  background: transparent;\r\n  box-sizing: border-box;\r\n  font-size: 14px;\r\n  font-weight: 860;\r\n  line-height: 1;\r\n  pointer-events: none;\r\n  text-align: center;\r\n}\r\n.lyrics-settings-drawer .mv-threshold-slider {\r\n  -webkit-app-region: no-drag;\r\n  width: 100%;\r\n  grid-template-columns: minmax(0, 1fr) 56px;\r\n  gap: 14px;\r\n  align-items: center;\r\n  padding-right: 4px;\r\n  box-sizing: border-box;\r\n}\r\n.lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"] {\r\n  position: relative;\r\n  z-index: 2;\r\n  display: block;\r\n  appearance: none;\r\n  -webkit-app-region: no-drag;\r\n  width: 100%;\r\n  min-width: 0;\r\n  height: 28px;\r\n  margin: 0;\r\n  padding: 0;\r\n  border-radius: 999px;\r\n  background: transparent;\r\n  accent-color: var(--lyrics-drawer-slider-fill);\r\n  cursor: pointer;\r\n  pointer-events: auto;\r\n  touch-action: none;\r\n}\r\n.lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"]::-webkit-slider-runnable-track {\r\n  height: 6px;\r\n  border-radius: 999px;\r\n  background:\r\n    linear-gradient(\r\n      90deg,\r\n      var(--lyrics-drawer-slider-fill) 0 var(--lyrics-drawer-range-progress),\r\n      var(--lyrics-drawer-slider-track) var(--lyrics-drawer-range-progress) 100%\r\n    );\r\n  box-shadow: inset 0 1px 1px color-mix(in srgb, var(--theme-overlay-bg) 32%, transparent);\r\n}\r\n.lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"]::-webkit-slider-thumb {\r\n  appearance: none;\r\n  width: 18px;\r\n  height: 18px;\r\n  margin-top: -6px;\r\n  border: 2px solid var(--lyrics-drawer-slider-thumb-border);\r\n  border-radius: 50%;\r\n  background: var(--lyrics-drawer-slider-thumb);\r\n  box-shadow: var(--lyrics-drawer-slider-thumb-shadow);\r\n  cursor: grab;\r\n}\r\n.lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"]:active::-webkit-slider-thumb {\r\n  cursor: grabbing;\r\n}\r\n.lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"]::-moz-range-track {\r\n  height: 6px;\r\n  border-radius: 999px;\r\n  background: var(--lyrics-drawer-slider-track);\r\n}\r\n.lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"]::-moz-range-progress {\r\n  height: 6px;\r\n  border-radius: 999px;\r\n  background: var(--lyrics-drawer-slider-fill);\r\n}\r\n.lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"]::-moz-range-thumb {\r\n  width: 16px;\r\n  height: 16px;\r\n  border: 2px solid var(--lyrics-drawer-slider-thumb-border);\r\n  border-radius: 50%;\r\n  background: var(--lyrics-drawer-slider-thumb);\r\n  box-shadow: var(--lyrics-drawer-slider-thumb-shadow);\r\n  cursor: grab;\r\n}\r\n.lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"]:disabled {\r\n  cursor: default;\r\n  opacity: 0.58;\r\n}\r\n.lyrics-settings-drawer .lyrics-settings-advanced-wrap--drawer .lyrics-drawer-range,\r\n.lyrics-settings-drawer .lyrics-settings-advanced-wrap--drawer .lyrics-color-panel,\r\n.lyrics-settings-drawer .lyrics-settings-advanced-wrap--drawer .lyrics-mini-player-color-panel,\r\n.lyrics-settings-drawer .lyrics-settings-advanced-wrap--drawer .lyrics-background-controls,\r\n.lyrics-settings-drawer .lyrics-settings-advanced-wrap--drawer .lyrics-desktop-settings-panel,\r\n.lyrics-settings-drawer .lyrics-settings-advanced-wrap--drawer .lyrics-source-panel,\r\n.lyrics-settings-drawer .lyrics-settings-advanced-wrap--drawer .lyrics-word-highlight-settings,\r\n.lyrics-settings-drawer .lyrics-settings-advanced-wrap--drawer .lyrics-word-highlight-notes,\r\n.lyrics-settings-drawer .lyrics-settings-advanced-wrap--drawer .lyrics-match-threshold-control,\r\n.lyrics-settings-drawer .lyrics-settings-advanced-wrap--drawer .lyrics-desktop-size-controls .mv-threshold-control,\r\n.lyrics-settings-drawer .lyrics-settings-advanced-wrap--drawer .lyrics-desktop-opacity-control {\r\n  border: 0;\r\n  border-top: 1px solid rgba(220, 232, 255, 0.08);\r\n  border-radius: 0;\r\n  background: transparent;\r\n  box-shadow: none;\r\n}\r\n.settings-lyrics-panel .lyrics-drawer-range em,\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-slider strong,\r\n.settings-lyrics-panel .lyrics-desktop-size-controls output,\r\n.settings-lyrics-panel .lyrics-desktop-opacity-control output,\r\n.settings-lyrics-panel .lyrics-desktop-font-panel .lyrics-color-panel__header > em,\r\n.settings-lyrics-panel .lyrics-desktop-font-collapse-button > em {\r\n  border-radius: 4px;\r\n  box-shadow: none;\r\n}\r\n.settings-lyrics-panel .lyrics-match-threshold-control .mv-threshold-slider,\r\n.settings-lyrics-panel .lyrics-desktop-size-controls .mv-threshold-slider,\r\n.settings-lyrics-panel .lyrics-desktop-opacity-control .mv-threshold-slider {\r\n  max-width: none;\r\n  justify-self: stretch;\r\n}\r\n.settings-lyrics-panel .lyrics-desktop-size-controls .mv-threshold-control {\r\n  min-height: 58px;\r\n  padding: 9px 10px;\r\n  border-radius: 4px;\r\n  border: 1px solid var(--settings-lyrics-border-subtle);\r\n  background: color-mix(in srgb, var(--theme-list-row-bg) 54%, transparent);\r\n  box-shadow: none;\r\n}\r\nhtml[data-theme=\"dark\"] .settings-lyrics-panel .audio-toggle-row,\r\nhtml[data-theme=\"dark\"] .settings-lyrics-panel .lyrics-drawer-range,\r\nhtml[data-theme=\"dark\"] .settings-lyrics-panel .lyrics-match-threshold-control,\r\nhtml[data-theme=\"dark\"] .settings-lyrics-panel .lyrics-desktop-opacity-control,\r\nhtml[data-theme=\"dark\"] .settings-lyrics-panel .lyrics-desktop-size-controls .mv-threshold-control,\r\nhtml[data-theme=\"dark\"] .settings-lyrics-panel .lyrics-desktop-font-panel,\r\nhtml[data-theme=\"dark\"] .settings-lyrics-panel .lyrics-mini-player-color-panel,\r\nhtml[data-theme=\"dark\"] .settings-lyrics-panel .lyrics-source-panel,\r\nhtml[data-theme=\"dark\"] .settings-lyrics-panel .lyrics-color-panel {\r\n  border-color: var(--color-border);\r\n  background: transparent;\r\n}\r\n@media (max-width: 760px) {\r\n.lyrics-settings-panel .lyrics-desktop-size-controls .mv-threshold-slider,\r\n  .settings-lyrics-panel .lyrics-desktop-size-controls .mv-threshold-slider {\r\n    max-width: none;\r\n    justify-self: stretch;\r\n  }\r\n}\r\n@media (max-width: 1180px) {\r\n.settings-page .settings-cache-panel--mv-overview,\r\n  .settings-page .settings-cache-panel--mv-immersive {\r\n    grid-template-columns: 1fr;\r\n  }\r\n}\r\n@media (orientation: portrait) and (min-width: 761px) and (max-width: 1400px) {\r\n.settings-wallpaper-controls,\r\n  .settings-page .settings-cache-panel--mv-overview,\r\n  .settings-page .settings-cache-panel--mv-immersive {\r\n    grid-template-columns: 1fr;\r\n  }\r\n}\r\n@media (max-width: 640px) {\r\n.settings-page .settings-cache-panel--mv-overview,\r\n  .settings-page .settings-cache-panel--mv-network .settings-mv-toggle-grid,\r\n  .settings-page .settings-cache-panel--mv-network .settings-mv-provider-grid,\r\n  .settings-page .settings-cache-panel--mv-network .settings-mv-sync-row,\r\n  .settings-page .settings-cache-panel--mv-immersive,\r\n  .settings-page .settings-cache-panel--mv-immersive > .settings-chip-row,\r\n  .settings-page .settings-mv-overview-card--quality,\r\n  .settings-page .settings-cache-panel--mv-network > .settings-wallpaper-control {\r\n    grid-template-columns: 1fr;\r\n  }\r\n}\r\n\r\n/* === theme-presets.css === */\r\nhtml[data-theme-preset=\"childrenDoodle\"] .page-surface:has(.lyrics-page:not([data-theme-filter=\"false\"]) .lyrics-mv-panel[data-mv-enabled=\"true\"]) {\r\n  background: #05070b;\r\n}\r\nhtml[data-theme-preset=\"childrenDoodle\"] .lyrics-page:not([data-theme-filter=\"false\"]):has(.lyrics-mv-panel[data-mv-enabled=\"true\"]) {\r\n  background: #05070b;\r\n}\r\nhtml[data-theme-preset=\"childrenDoodle\"] .lyrics-page:not([data-theme-filter=\"false\"]):has(.lyrics-mv-panel[data-mv-enabled=\"true\"])::before,\r\nhtml[data-theme-preset=\"childrenDoodle\"] .lyrics-page:not([data-theme-filter=\"false\"]):has(.lyrics-mv-panel[data-mv-enabled=\"true\"])::after {\r\n  display: none;\r\n}\r\nhtml[data-theme-preset=\"childrenDoodle\"] .lyrics-page:not([data-theme-filter=\"false\"]):has(.lyrics-mv-panel[data-mv-enabled=\"true\"]) .lyrics-backdrop {\r\n  background:\r\n    radial-gradient(circle at 50% 8%, rgb(78 90 124 / 0.24), transparent 36%),\r\n    linear-gradient(180deg, #090b12 0%, #05070b 100%);\r\n}\r\nhtml[data-theme-preset=\"childrenDoodle\"] .lyrics-page:not([data-theme-filter=\"false\"]):has(.lyrics-mv-panel[data-mv-enabled=\"true\"]) .lyrics-backdrop::before {\r\n  background: linear-gradient(180deg, rgb(3 5 10 / 0.24), rgb(3 5 10 / 0.54));\r\n  opacity: 1;\r\n}\r\nhtml[data-theme-preset=\"childrenDoodle\"] .lyrics-page:not([data-theme-filter=\"false\"]):has(.lyrics-mv-panel[data-mv-enabled=\"true\"]) .lyrics-backdrop::after {\r\n  opacity: 0.18;\r\n  mix-blend-mode: normal;\r\n  filter: blur(var(--lyrics-cover-blur)) brightness(calc(var(--lyrics-cover-brightness) * 0.82)) saturate(0.94);\r\n}\r\nhtml[data-theme-preset=\"childrenDoodle\"] .lyrics-page:has(.lyrics-mv-panel[data-mv-enabled=\"true\"]) .lyrics-mv-panel,\r\nhtml[data-theme-preset=\"childrenDoodle\"] .lyrics-page:has(.lyrics-mv-panel[data-mv-enabled=\"true\"]) .lyrics-mv-player,\r\nhtml[data-theme-preset=\"childrenDoodle\"] .lyrics-page:has(.lyrics-mv-panel[data-mv-enabled=\"true\"]) .lyrics-mv-video {\r\n  background-color: #05070b;\r\n}\r\nhtml[data-theme-preset=\"childrenDoodle\"] .app-shell:not(.app-shell--wallpaper) .page-surface:not(:has(.lyrics-mv-panel[data-mv-enabled=\"true\"])) {\r\n  background:\r\n    var(--children-doodle-pencil-haze),\r\n    var(--children-doodle-paper),\r\n    linear-gradient(135deg, rgb(255 244 220 / 0.9), rgb(255 217 236 / 0.58) 52%, rgb(214 247 255 / 0.62));\r\n}\r\nhtml[data-theme=\"dark\"][data-theme-preset=\"childrenDoodle\"] .app-shell:not(.app-shell--wallpaper) .page-surface:not(:has(.lyrics-mv-panel[data-mv-enabled=\"true\"])) {\r\n  background:\r\n    var(--children-doodle-surface-bg),\r\n    var(--preset-app-bg) !important;\r\n}\r\nhtml[data-theme-preset=\"FINAL\"] :is(.lyrics-left-panel, .lyrics-mv-panel, .lyrics-track-header, .lyrics-match-panel, .lyrics-offset-controls) {\r\n  color: #2d281f;\r\n}\r\nhtml[data-theme-mode=\"ambient\"] :is(\r\n  .track-row,\r\n  .streaming-row,\r\n  .streaming-discovery-card,\r\n  .playlist-list-item,\r\n  .download-search-result,\r\n  .download-job-row,\r\n  .queue-row,\r\n  .album-track-row,\r\n  .artist-track-row,\r\n  .remote-source-coming-soon,\r\n  .lyrics-candidate,\r\n  .lyrics-mv-candidate\r\n) {\r\n  border-color: rgb(238 242 251 / 0.048);\r\n  background:\r\n    linear-gradient(180deg, rgb(255 255 255 / 0.026), rgb(255 255 255 / 0.014)),\r\n    rgb(255 255 255 / 0.018);\r\n  box-shadow:\r\n    inset 0 1px 0 rgb(255 255 255 / 0.026);\r\n}\r\nhtml[data-theme-mode=\"ambient\"] :is(\r\n  .track-row:hover,\r\n  .streaming-row:hover,\r\n  .streaming-discovery-card:hover,\r\n  .playlist-list-item:hover,\r\n  .playlist-list-item[data-active=\"true\"],\r\n  .download-search-result:hover,\r\n  .download-job-row:hover,\r\n  .queue-row:hover,\r\n  .album-track-row:hover,\r\n  .artist-track-row:hover,\r\n  .remote-source-coming-soon:hover,\r\n  .lyrics-candidate:hover,\r\n  .lyrics-mv-candidate:hover\r\n) {\r\n  border-color: rgb(238 242 251 / 0.09);\r\n  background:\r\n    linear-gradient(180deg, rgb(255 255 255 / 0.056), rgb(255 255 255 / 0.032)),\r\n    rgb(255 255 255 / 0.028);\r\n  box-shadow:\r\n    inset 0 1px 0 rgb(255 255 255 / 0.045);\r\n  transform: none;\r\n}\r\nhtml[data-theme-mode=\"ambient\"] :is(\r\n  .settings-range-field input[type=\"range\"],\r\n  .settings-theme-custom-slider input[type=\"range\"],\r\n  .settings-lyrics-panel .lyrics-drawer-range input[type=\"range\"],\r\n  .settings-lyrics-panel .mv-threshold-slider input[type=\"range\"],\r\n  .lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"],\r\n  .control-popover-slider\r\n) {\r\n  height: 22px;\r\n  accent-color: #9ca9c5;\r\n  background: transparent;\r\n  -webkit-appearance: none;\r\n  appearance: none;\r\n}\r\nhtml[data-theme-mode=\"ambient\"] :is(\r\n  .settings-range-field input[type=\"range\"],\r\n  .settings-theme-custom-slider input[type=\"range\"],\r\n  .settings-lyrics-panel .lyrics-drawer-range input[type=\"range\"],\r\n  .settings-lyrics-panel .mv-threshold-slider input[type=\"range\"],\r\n  .lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"],\r\n  .control-popover-slider\r\n)::-webkit-slider-runnable-track {\r\n  height: 6px;\r\n  border: 0;\r\n  border-radius: 999px;\r\n  background: rgb(255 255 255 / 0.13);\r\n  box-shadow: inset 0 1px 1px rgb(0 0 0 / 0.22);\r\n}\r\nhtml[data-theme-mode=\"ambient\"] :is(\r\n  .settings-range-field input[type=\"range\"],\r\n  .settings-theme-custom-slider input[type=\"range\"],\r\n  .settings-lyrics-panel .lyrics-drawer-range input[type=\"range\"],\r\n  .settings-lyrics-panel .mv-threshold-slider input[type=\"range\"],\r\n  .lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"],\r\n  .control-popover-slider\r\n)::-webkit-slider-thumb {\r\n  width: 18px;\r\n  height: 18px;\r\n  margin-top: -6px;\r\n  border: 0;\r\n  border-radius: 50%;\r\n  background: linear-gradient(180deg, #c4cee5, #8e9cba);\r\n  box-shadow:\r\n    0 5px 14px rgb(0 0 0 / 0.24),\r\n    inset 0 1px 0 rgb(255 255 255 / 0.3);\r\n  -webkit-appearance: none;\r\n  appearance: none;\r\n}\r\nhtml[data-theme-mode=\"ambient\"] :is(\r\n  .settings-range-field input[type=\"range\"],\r\n  .settings-theme-custom-slider input[type=\"range\"],\r\n  .settings-lyrics-panel .lyrics-drawer-range input[type=\"range\"],\r\n  .settings-lyrics-panel .mv-threshold-slider input[type=\"range\"],\r\n  .lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"],\r\n  .control-popover-slider\r\n)::-moz-range-track {\r\n  height: 6px;\r\n  border: 0;\r\n  border-radius: 999px;\r\n  background: rgb(255 255 255 / 0.13);\r\n  box-shadow: inset 0 1px 1px rgb(0 0 0 / 0.22);\r\n}\r\nhtml[data-theme-mode=\"ambient\"] :is(\r\n  .settings-range-field input[type=\"range\"],\r\n  .settings-theme-custom-slider input[type=\"range\"],\r\n  .settings-lyrics-panel .lyrics-drawer-range input[type=\"range\"],\r\n  .settings-lyrics-panel .mv-threshold-slider input[type=\"range\"],\r\n  .lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"],\r\n  .control-popover-slider\r\n)::-moz-range-progress {\r\n  height: 6px;\r\n  border-radius: 999px;\r\n  background: linear-gradient(90deg, #9ca9c5, #65738f);\r\n}\r\nhtml[data-theme-mode=\"ambient\"] :is(\r\n  .settings-range-field input[type=\"range\"],\r\n  .settings-theme-custom-slider input[type=\"range\"],\r\n  .settings-lyrics-panel .lyrics-drawer-range input[type=\"range\"],\r\n  .settings-lyrics-panel .mv-threshold-slider input[type=\"range\"],\r\n  .lyrics-settings-drawer .mv-threshold-slider input[type=\"range\"],\r\n  .control-popover-slider\r\n)::-moz-range-thumb {\r\n  width: 18px;\r\n  height: 18px;\r\n  border: 0;\r\n  border-radius: 50%;\r\n  background: linear-gradient(180deg, #c4cee5, #8e9cba);\r\n  box-shadow:\r\n    0 5px 14px rgb(0 0 0 / 0.24),\r\n    inset 0 1px 0 rgb(255 255 255 / 0.3);\r\n}\r\n\r\n/* === scrollbars.css === */\r\n:is(\r\n  .page-surface,\r\n  .track-list,\r\n  .sort-menu,\r\n  .media-wall-scroll-shell,\r\n  .mv-settings-candidates,\r\n  .mini-player-queue-panel,\r\n  .signal-path-popover.signal-path-popover--roon\r\n) {\r\n  scrollbar-color: var(--echo-scrollbar-thumb) transparent;\r\n  scrollbar-width: thin;\r\n}\r\n:is(\r\n  .page-surface,\r\n  .track-list,\r\n  .sort-menu,\r\n  .media-wall-scroll-shell,\r\n  .mv-settings-candidates,\r\n  .mini-player-queue-panel,\r\n  .signal-path-popover.signal-path-popover--roon\r\n)::-webkit-scrollbar {\r\n  width: var(--echo-scrollbar-size);\r\n  height: var(--echo-scrollbar-size);\r\n}\r\n:is(\r\n  .page-surface,\r\n  .track-list,\r\n  .sort-menu,\r\n  .media-wall-scroll-shell,\r\n  .mv-settings-candidates,\r\n  .mini-player-queue-panel,\r\n  .signal-path-popover.signal-path-popover--roon\r\n)::-webkit-scrollbar-track {\r\n  margin: 8px 0;\r\n  border-radius: 999px;\r\n  background: transparent;\r\n}\r\n:is(\r\n  .page-surface,\r\n  .track-list,\r\n  .sort-menu,\r\n  .media-wall-scroll-shell,\r\n  .mv-settings-candidates,\r\n  .mini-player-queue-panel,\r\n  .signal-path-popover.signal-path-popover--roon\r\n)::-webkit-scrollbar-thumb {\r\n  min-height: var(--echo-scrollbar-min-thumb);\r\n  border: 3px solid transparent;\r\n  border-radius: 999px;\r\n  background: var(--echo-scrollbar-thumb);\r\n  background-clip: padding-box;\r\n  box-shadow: inset 0 0 0 1px var(--echo-scrollbar-thumb-shadow);\r\n}\r\n:is(\r\n  .page-surface,\r\n  .track-list,\r\n  .sort-menu,\r\n  .media-wall-scroll-shell,\r\n  .mv-settings-candidates,\r\n  .mini-player-queue-panel,\r\n  .signal-path-popover.signal-path-popover--roon\r\n)::-webkit-scrollbar-thumb:hover {\r\n  border-width: 2px;\r\n  background: var(--echo-scrollbar-thumb-hover);\r\n  background-clip: padding-box;\r\n}\r\n:is(\r\n  .page-surface,\r\n  .track-list,\r\n  .sort-menu,\r\n  .media-wall-scroll-shell,\r\n  .mv-settings-candidates,\r\n  .mini-player-queue-panel,\r\n  .signal-path-popover.signal-path-popover--roon\r\n)::-webkit-scrollbar-thumb:active {\r\n  border-width: 2px;\r\n  background: var(--echo-scrollbar-thumb-active);\r\n  background-clip: padding-box;\r\n}\r\n.mv-settings-drawer .audio-drawer-scroll {\r\n  scrollbar-color: var(--echo-scrollbar-thumb) transparent;\r\n}\r\n.mv-settings-drawer .audio-drawer-scroll::-webkit-scrollbar {\r\n  display: block;\r\n  width: var(--echo-scrollbar-size);\r\n}\r\n.mv-settings-drawer .audio-drawer-scroll::-webkit-scrollbar-track {\r\n  margin: 18px 0;\r\n  border-radius: 999px;\r\n  background: transparent;\r\n}\r\n.mv-settings-drawer .audio-drawer-scroll::-webkit-scrollbar-thumb {\r\n  border: 3px solid transparent;\r\n  border-radius: 999px;\r\n  background: var(--echo-scrollbar-thumb);\r\n  background-clip: padding-box;\r\n  box-shadow: inset 0 0 0 1px var(--echo-scrollbar-thumb-shadow);\r\n}\r\n.mv-settings-drawer .audio-drawer-scroll::-webkit-scrollbar-thumb:hover {\r\n  border-width: 2px;\r\n  background: var(--echo-scrollbar-thumb-hover);\r\n  background-clip: padding-box;\r\n}\r\n\r\n/* === lyrics-folded.css === */\r\n.lyrics-page[data-lyrics-page-style=\"folded\"][data-view-mode=\"lyrics\"] .lyrics-mv-panel[data-mv-enabled=\"false\"] {\r\n  display: none;\r\n}\r\n\r\n/* === lyrics-cover-stage.css === */\r\n.lyrics-page[data-lyrics-page-style=\"coverStage\"][data-view-mode=\"lyrics\"] .lyrics-mv-panel[data-mv-enabled=\"false\"] {\r\n  display: none;\r\n}\r\n\r\n/* === lyrics-cut-board.css === */\r\n.lyrics-page[data-lyrics-page-style=\"cutBoard\"][data-view-mode=\"lyrics\"] .lyrics-backdrop-atmosphere,\r\n.lyrics-page[data-lyrics-page-style=\"cutBoard\"][data-view-mode=\"lyrics\"] .lyrics-music-reactive-layer,\r\n.lyrics-page[data-lyrics-page-style=\"cutBoard\"][data-view-mode=\"lyrics\"] .lyrics-mv-panel[data-mv-enabled=\"false\"] {\r\n  display: none;\r\n  animation: none !important;\r\n}\r\n\r\n/* === lyrics-kinetic-poster.css === */\r\n.lyrics-page[data-lyrics-page-style=\"kineticPoster\"][data-view-mode=\"lyrics\"] .lyrics-music-reactive-layer,\r\n.lyrics-page[data-lyrics-page-style=\"kineticPoster\"][data-view-mode=\"lyrics\"] .lyrics-mv-panel[data-mv-enabled=\"false\"] {\r\n  display: none;\r\n}\r\n\r\n/* === ui-polish.css === */\r\n.track-row,\r\n.streaming-row,\r\n.streaming-discovery-card,\r\n.playlist-list-item,\r\n.queue-row,\r\n.album-track-row,\r\n.artist-track-row,\r\n.remote-source-coming-soon,\r\n.lyrics-candidate,\r\n.lyrics-mv-candidate {\r\n  border-color: var(--echo-polish-border);\r\n  border-radius: var(--radius-md);\r\n  background: var(--echo-polish-row-bg);\r\n  box-shadow: none;\r\n}\r\n.track-row:hover,\r\n.track-row[data-playing=\"true\"],\r\n.streaming-row:hover,\r\n.streaming-row[data-playing=\"true\"],\r\n.streaming-discovery-card:hover,\r\n.playlist-list-item:hover,\r\n.playlist-list-item[data-active=\"true\"],\r\n.queue-row:hover,\r\n.album-track-row:hover,\r\n.album-track-row[data-playing='true'],\r\n.artist-track-row:hover,\r\n.artist-track-row[data-playing=\"true\"],\r\n.remote-source-coming-soon:hover,\r\n.lyrics-candidate:hover,\r\n.lyrics-mv-candidate:hover {\r\n  border-color: var(--echo-polish-border-strong);\r\n  background: var(--echo-polish-row-bg-hover);\r\n  box-shadow: none;\r\n  transform: none;\r\n}\r\n.app-shell--acrylic:not(.app-shell--wallpaper) :is(\r\n  .audio-drawer-root,\r\n  .lyrics-settings-drawer-root,\r\n  .mv-settings-drawer-root,\r\n  .echo-mv-root\r\n) {\r\n  z-index: 130;\r\n}\r\n.settings-page #settings-sec-lyrics .settings-lyrics-panel .lyrics-desktop-size-controls .mv-threshold-control {\r\n  min-height: 56px;\r\n  grid-template-columns: minmax(220px, 0.34fr) minmax(320px, 0.66fr);\r\n  align-items: center;\r\n  gap: 18px;\r\n  padding: 10px 0;\r\n  border: 0;\r\n  border-bottom: 1px solid color-mix(in srgb, var(--theme-panel-border) 70%, transparent);\r\n  border-radius: 0;\r\n  background: transparent;\r\n}\r\n.settings-page #settings-sec-lyrics .settings-lyrics-panel :is(\r\n  .lyrics-color-panel__header,\r\n  .mv-threshold-copy\r\n) strong {\r\n  color: var(--theme-heading-text);\r\n  font-size: 13px;\r\n  font-weight: 690;\r\n}\r\n.settings-page #settings-sec-lyrics .settings-lyrics-panel :is(\r\n  .lyrics-color-panel__header,\r\n  .mv-threshold-copy\r\n) em {\r\n  color: var(--theme-subtle-text);\r\n  font-size: 11px;\r\n  font-weight: 540;\r\n}\r\n@media (max-width: 980px) {\r\n.settings-page #settings-sec-lyrics .settings-lyrics-panel .lyrics-desktop-direction-row,\r\n  .settings-page #settings-sec-lyrics .settings-lyrics-panel .lyrics-desktop-size-controls .mv-threshold-control {\r\n    grid-template-columns: minmax(0, 1fr);\r\n  }\r\n}\r\n\r\n/* === echo-mv extras === */\r\n.lyrics-page[data-mv-lyrics-hidden=\"true\"] .lyrics-scroll,\r\n.lyrics-page[data-mv-lyrics-hidden=\"true\"] .lyrics-empty {\r\n  visibility: hidden;\r\n  pointer-events: none;\r\n}\r\n\r\n.transport-mv-button.is-soft-active {\r\n  color: var(--theme-accent-text-strong, currentColor);\r\n}\r\n\r\nsection.lyrics-mv-panel,\r\n.lyrics-mv-settings-entry {\r\n  display: none !important;\r\n}\r\n\r\n.echo-mv-root {\r\n  position: fixed;\r\n  inset: 0;\r\n  z-index: 40;\r\n  pointer-events: none;\r\n}\r\n.echo-mv-root[data-open=\"true\"] {\r\n  pointer-events: auto;\r\n}\r\n.echo-mv-root[data-collapsed=\"true\"] {\r\n  pointer-events: none;\r\n}\r\n.echo-mv-root[data-collapsed=\"true\"] .echo-mv-sheet {\r\n  pointer-events: auto;\r\n}\r\n.echo-mv-root[data-collapsed=\"true\"] .echo-mv-scrim {\r\n  display: none;\r\n}\r\n.echo-mv-scrim {\r\n  position: absolute;\r\n  inset: 0;\r\n  padding: 0;\r\n  border: 0;\r\n  background: transparent;\r\n  cursor: default;\r\n}\r\n.echo-mv-sheet {\r\n  --echo-mv-sheet-text: #26384f;\r\n  --echo-mv-sheet-border: rgba(40, 46, 54, .1);\r\n  --echo-mv-sheet-bg: rgba(248, 250, 252, .82);\r\n  --echo-mv-sheet-shadow: 0 16px 36px rgba(30, 37, 47, .12), inset 0 1px 0 rgba(255, 255, 255, .58);\r\n  --audio-drawer-text: var(--echo-mv-sheet-text);\r\n  position: absolute;\r\n  top: clamp(56px, 8vh, 88px);\r\n  right: clamp(16px, 2vw, 28px);\r\n  z-index: 1;\r\n  display: grid;\r\n  width: min(560px, calc(100vw - 28px));\r\n  max-height: min(78vh, 820px);\r\n  grid-template-rows: auto auto auto auto minmax(0, 1fr);\r\n  gap: 6px;\r\n  padding: 9px;\r\n  overflow: hidden;\r\n  color: var(--echo-mv-sheet-text);\r\n  border: 1px solid var(--echo-mv-sheet-border);\r\n  border-radius: 8px;\r\n  background: var(--echo-mv-sheet-bg);\r\n  box-shadow: var(--echo-mv-sheet-shadow);\r\n  backdrop-filter: blur(22px) saturate(1.12);\r\n}\r\nhtml[data-theme=dark] .echo-mv-sheet {\r\n  --echo-mv-sheet-text: rgba(236, 244, 255, .92);\r\n  --echo-mv-sheet-border: rgba(255, 255, 255, .12);\r\n  --echo-mv-sheet-bg: rgba(12, 18, 27, .78);\r\n  --echo-mv-sheet-shadow: 0 20px 50px rgba(0, 0, 0, .3), inset 0 1px 0 rgba(255, 255, 255, .08);\r\n}\r\n.echo-mv-root[data-collapsed=\"true\"] .echo-mv-sheet {\r\n  grid-template-rows: auto;\r\n  max-height: none;\r\n}\r\n.echo-mv-root[data-open=\"false\"] .echo-mv-sheet {\r\n  opacity: 0;\r\n  transform: translateY(8px);\r\n  pointer-events: none;\r\n}\r\n.echo-mv-sheet-bar {\r\n  display: flex;\r\n  min-width: 0;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 10px;\r\n}\r\n.echo-mv-sheet-bar > strong {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  font-size: 12px;\r\n  font-weight: 840;\r\n  letter-spacing: 0.08em;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.echo-mv-sheet-actions {\r\n  display: inline-flex;\r\n  flex: 0 0 auto;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n.echo-mv-enable {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  color: color-mix(in srgb, var(--echo-mv-sheet-text) 72%, transparent);\r\n  font-size: 11px;\r\n  font-weight: 780;\r\n  white-space: nowrap;\r\n}\r\n.echo-mv-enable input {\r\n  width: 14px;\r\n  height: 14px;\r\n  margin: 0;\r\n  accent-color: var(--theme-accent-solid-bg, #6ea8ff);\r\n}\r\n.echo-mv-icon-btn {\r\n  display: inline-flex;\r\n  width: 28px;\r\n  height: 28px;\r\n  flex: 0 0 auto;\r\n  align-items: center;\r\n  justify-content: center;\r\n  padding: 0;\r\n  color: color-mix(in srgb, var(--echo-mv-sheet-text) 70%, transparent);\r\n  border: 1px solid var(--theme-legacy-border-soft, rgba(54, 73, 95, .14));\r\n  border-radius: 8px;\r\n  background: var(--theme-legacy-surface-a52, rgba(255, 255, 255, .52));\r\n  cursor: pointer;\r\n}\r\n.echo-mv-icon-btn:hover {\r\n  color: var(--echo-mv-sheet-text);\r\n  background: var(--theme-legacy-surface-a86, rgba(255, 255, 255, .86));\r\n}\r\n.echo-mv-status {\r\n  margin: 0;\r\n  color: color-mix(in srgb, var(--echo-mv-sheet-text) 64%, transparent);\r\n  font-size: 12px;\r\n  font-weight: 760;\r\n}\r\n.echo-mv-current {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) auto;\r\n  gap: 8px;\r\n  padding: 7px 9px;\r\n  border: 1px solid rgba(54, 73, 95, .11);\r\n  border-radius: 8px;\r\n  background: rgba(255, 255, 255, .56);\r\n}\r\nhtml[data-theme=dark] .echo-mv-current {\r\n  border-color: rgba(255, 255, 255, .1);\r\n  background: rgba(255, 255, 255, .06);\r\n}\r\n.echo-mv-current span {\r\n  display: grid;\r\n  min-width: 0;\r\n  gap: 2px;\r\n}\r\n.echo-mv-current small {\r\n  color: color-mix(in srgb, var(--echo-mv-sheet-text) 58%, transparent);\r\n  font-size: 10px;\r\n  font-weight: 720;\r\n}\r\n.echo-mv-current strong {\r\n  overflow: hidden;\r\n  color: var(--echo-mv-sheet-text);\r\n  font-size: 12px;\r\n  font-weight: 840;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.echo-mv-quality {\r\n  display: flex;\r\n  min-width: 0;\r\n  gap: 6px;\r\n  overflow-x: auto;\r\n  padding-bottom: 1px;\r\n  scrollbar-width: thin;\r\n}\r\n.echo-mv-quality-item {\r\n  display: flex;\r\n  min-width: max-content;\r\n  flex: 0 0 auto;\r\n  align-items: center;\r\n  gap: 6px;\r\n  padding: 5px 7px;\r\n  color: var(--echo-mv-sheet-text);\r\n  border: 1px solid rgba(54, 73, 95, .11);\r\n  border-radius: 8px;\r\n  background: rgba(255, 255, 255, .56);\r\n  cursor: pointer;\r\n}\r\nhtml[data-theme=dark] .echo-mv-quality-item {\r\n  border-color: rgba(255, 255, 255, .1);\r\n  background: rgba(255, 255, 255, .06);\r\n}\r\n.echo-mv-quality-item[aria-pressed=\"true\"],\r\n.echo-mv-quality-item[data-active=\"true\"] {\r\n  border-color: rgba(255, 255, 255, .72);\r\n  background: rgba(248, 250, 255, .94);\r\n  color: #2f3650;\r\n}\r\n.echo-mv-quality-item strong {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  font-size: 12px;\r\n  font-weight: 840;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.echo-mv-quality-item small {\r\n  display: inline-flex;\r\n  min-height: 18px;\r\n  align-items: center;\r\n  padding: 0 6px;\r\n  color: #374c63b8;\r\n  border-radius: 999px;\r\n  background: #e2ebf4c2;\r\n  font-size: 10px;\r\n  font-weight: 780;\r\n  line-height: 1;\r\n  white-space: nowrap;\r\n}\r\n.echo-mv-sheet-body {\r\n  display: flex;\r\n  min-height: 0;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  overflow: auto;\r\n  padding: 2px 4px 4px 0;\r\n  scrollbar-width: thin;\r\n}\r\n.echo-mv-section,\r\n.echo-mv-section-title,\r\n.echo-mv-section-title h3 {\r\n  min-width: 0;\r\n}\r\n.echo-mv-section {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  flex: 0 0 auto;\r\n}\r\n.echo-mv-section-title {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  color: var(--echo-mv-sheet-text);\r\n}\r\n.echo-mv-section-title h3 {\r\n  margin: 0;\r\n  font-size: 13px;\r\n  font-weight: 840;\r\n}\r\n.echo-mv-candidate-list {\r\n  display: flex;\r\n  flex: 0 0 auto;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n  max-height: min(360px, 40vh);\r\n  overflow: auto;\r\n  align-content: start;\r\n}\r\n.echo-mv-candidate {\r\n  display: grid;\r\n  flex: 0 0 auto;\r\n  grid-template-columns: 56px minmax(0, 1fr);\r\n  grid-template-rows: auto auto;\r\n  grid-template-areas: \"thumb copy\" \"thumb badges\";\r\n  column-gap: 10px;\r\n  row-gap: 5px;\r\n  width: 100%;\r\n  min-height: 64px;\r\n  height: auto;\r\n  padding: 8px 9px;\r\n  text-align: left;\r\n  color: var(--echo-mv-sheet-text);\r\n  border: 1px solid rgba(54, 73, 95, .14);\r\n  border-radius: 8px;\r\n  background: rgba(255, 255, 255, .86);\r\n  cursor: pointer;\r\n}\r\nhtml[data-theme=dark] .echo-mv-candidate {\r\n  border-color: rgba(255, 255, 255, .12);\r\n  background: rgba(255, 255, 255, .06);\r\n}\r\n.echo-mv-candidate:hover {\r\n  border-color: rgba(63, 96, 134, .28);\r\n}\r\n.echo-mv-candidate-thumb {\r\n  grid-area: thumb;\r\n  align-self: center;\r\n  width: 56px;\r\n  height: 40px;\r\n  overflow: hidden;\r\n  border-radius: 6px;\r\n  background: rgba(54, 73, 95, .12);\r\n}\r\n.echo-mv-candidate-thumb img,\r\n.echo-mv-candidate-thumb-fallback {\r\n  display: block;\r\n  width: 100%;\r\n  height: 100%;\r\n  object-fit: cover;\r\n}\r\n.echo-mv-candidate-thumb-fallback {\r\n  display: grid;\r\n  place-items: center;\r\n}\r\n.echo-mv-candidate-copy {\r\n  grid-area: copy;\r\n  display: grid;\r\n  min-width: 0;\r\n  gap: 2px;\r\n}\r\n.echo-mv-candidate-copy strong,\r\n.echo-mv-candidate-copy em {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.echo-mv-candidate-copy strong {\r\n  font-size: 12px;\r\n  font-weight: 840;\r\n}\r\n.echo-mv-candidate-copy em {\r\n  color: color-mix(in srgb, var(--echo-mv-sheet-text) 62%, transparent);\r\n  font-size: 10px;\r\n  font-style: normal;\r\n}\r\n.echo-mv-candidate-badges {\r\n  grid-area: badges;\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 4px;\r\n}\r\n.echo-mv-candidate-badges small {\r\n  display: inline-flex;\r\n  min-height: 18px;\r\n  align-items: center;\r\n  padding: 0 6px;\r\n  color: #456076;\r\n  border-radius: 999px;\r\n  background: rgba(226, 235, 244, .84);\r\n  font-size: 9px;\r\n  font-weight: 780;\r\n  line-height: 18px;\r\n}\r\nhtml[data-theme=dark] .echo-mv-candidate-badges small {\r\n  color: rgba(236, 244, 255, .82);\r\n  background: rgba(229, 237, 255, .18);\r\n}\r\n.echo-mv-error {\r\n  margin: 0;\r\n  color: #8a3d38;\r\n  font-size: 12px;\r\n}\r\n.echo-mv-sheet .mv-toggle-copy em,\r\n.echo-mv-sheet .mv-threshold-copy em {\r\n  color: color-mix(in srgb, var(--echo-mv-sheet-text) 62%, transparent);\r\n}\r\n.echo-mv-quality-item[aria-pressed=\"true\"],\r\n.echo-mv-quality-item[data-active=\"true\"] {\r\n  color: #2f3650;\r\n  border-color: #ffffffb8;\r\n  background: #f8fafff0;\r\n  box-shadow: inset 0 0 0 1px rgba(47, 54, 80, .08);\r\n}\r\nhtml[data-theme=dark] .echo-mv-quality-item[aria-pressed=\"true\"],\r\nhtml[data-theme=dark] .echo-mv-quality-item[data-active=\"true\"] {\r\n  color: #10251f;\r\n  border-color: rgba(143, 207, 189, .82);\r\n  background: #8fcfbd;\r\n}\r\nhtml[data-theme=dark] .echo-mv-quality-item[aria-pressed=\"true\"] small,\r\nhtml[data-theme=dark] .echo-mv-quality-item[data-active=\"true\"] small {\r\n  color: #1b3a32;\r\n  background: rgba(16, 37, 31, .14);\r\n}\r\n.echo-mv-sheet .mv-source-toggle .mv-switch-track,\r\n.echo-mv-sheet .mv-current-song-toggle .mv-switch-track,\r\n.echo-mv-sheet .mv-auto-apply-toggle .mv-switch-track {\r\n  background: rgba(54, 73, 95, .22);\r\n}\r\nhtml[data-theme=dark] .echo-mv-sheet .mv-source-toggle .mv-switch-track,\r\nhtml[data-theme=dark] .echo-mv-sheet .mv-current-song-toggle .mv-switch-track,\r\nhtml[data-theme=dark] .echo-mv-sheet .mv-auto-apply-toggle .mv-switch-track {\r\n  background: rgba(255, 255, 255, .18);\r\n}\r\n.echo-mv-sheet .mv-source-toggle[aria-pressed=\"true\"] .mv-switch-track,\r\n.echo-mv-sheet .mv-current-song-toggle[aria-pressed=\"true\"] .mv-switch-track,\r\n.echo-mv-sheet .mv-auto-apply-toggle[aria-pressed=\"true\"] .mv-switch-track,\r\nhtml[data-theme=dark] .echo-mv-sheet .mv-source-toggle[aria-pressed=\"true\"] .mv-switch-track,\r\nhtml[data-theme=dark] .echo-mv-sheet .mv-current-song-toggle[aria-pressed=\"true\"] .mv-switch-track,\r\nhtml[data-theme=dark] .echo-mv-sheet .mv-auto-apply-toggle[aria-pressed=\"true\"] .mv-switch-track {\r\n  background: #8fcfbd !important;\r\n}\r\n.echo-mv-sheet .mv-source-toggle[aria-pressed=\"true\"] .mv-switch-track span,\r\n.echo-mv-sheet .mv-current-song-toggle[aria-pressed=\"true\"] .mv-switch-track span,\r\n.echo-mv-sheet .mv-auto-apply-toggle[aria-pressed=\"true\"] .mv-switch-track span,\r\nhtml[data-theme=dark] .echo-mv-sheet .mv-source-toggle[aria-pressed=\"true\"] .mv-switch-track span,\r\nhtml[data-theme=dark] .echo-mv-sheet .mv-current-song-toggle[aria-pressed=\"true\"] .mv-switch-track span,\r\nhtml[data-theme=dark] .echo-mv-sheet .mv-auto-apply-toggle[aria-pressed=\"true\"] .mv-switch-track span {\r\n  background: #10251f !important;\r\n  transform: translateX(14px) !important;\r\n}\r\n.echo-mv-sheet .mv-sync-mode-buttons button[aria-pressed=\"true\"],\r\n.echo-mv-sheet .mv-offset-step-row button[aria-pressed=\"true\"] {\r\n  color: #10251f;\r\n  border-color: rgba(143, 207, 189, .82);\r\n  background: #8fcfbd;\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"coverStage\"] .echo-mv-sheet {\r\n  right: auto;\r\n  left: clamp(16px, 2vw, 28px);\r\n}\r\n\r\n/* Keep official cinema / cover stages when MV is the backdrop. */\r\n.lyrics-page[data-echo-mv-stage=\"true\"]:has(.lyrics-mv-background) .lyrics-mv-background {\r\n  z-index: 0;\r\n  background: #020407;\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"cinemaStage\"]:has(.lyrics-mv-background) .lyrics-backdrop {\r\n  background: transparent !important;\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"cinemaStage\"]:has(.lyrics-mv-background) .lyrics-backdrop::before {\r\n  opacity: 0.42 !important;\r\n  z-index: 2;\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"cinemaStage\"]:has(.lyrics-mv-background) .lyrics-cinema-stage-chrome {\r\n  z-index: 1;\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"cinemaStage\"] .lyrics-mv-settings-entry {\r\n  top: clamp(56px, 8vh, 78px);\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"coverStage\"]:has(.lyrics-mv-background) {\r\n  --cover-stage-text: rgb(var(--lyrics-cover-text-rgb, 248 248 248) / 1);\r\n  --cover-stage-muted: rgb(var(--lyrics-cover-text-rgb, 248 248 248) / .78);\r\n  grid-template-columns: minmax(0, 58%) minmax(0, 42%);\r\n  grid-template-rows: minmax(0, 1fr);\r\n  gap: 0;\r\n  padding: 0;\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"coverStage\"]:has(.lyrics-mv-background) .lyrics-mv-background {\r\n  z-index: 2;\r\n  inset: 0 auto 0 0;\r\n  width: 72%;\r\n  cursor: grab;\r\n  mask-image: linear-gradient(90deg, #000 0%, #000 42%, rgb(0 0 0 / .86) 54%, rgb(0 0 0 / .52) 68%, rgb(0 0 0 / .2) 82%, rgb(0 0 0 / .06) 92%, transparent 100%);\r\n  -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 42%, rgb(0 0 0 / .86) 54%, rgb(0 0 0 / .52) 68%, rgb(0 0 0 / .2) 82%, rgb(0 0 0 / .06) 92%, transparent 100%);\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"coverStage\"]:has(.lyrics-mv-background) .lyrics-cover-stage-artwork {\r\n  background: rgb(var(--lyrics-cover-color-deep-rgb, 22 24 30));\r\n}\r\n.lyrics-page[data-lyrics-page-style=\"coverStage\"]:has(.lyrics-mv-background) .lyrics-cover-stage-image,\r\n.lyrics-page[data-lyrics-page-style=\"coverStage\"]:has(.lyrics-mv-background) .lyrics-cover-stage-bridge,\r\n.lyrics-page[data-lyrics-page-style=\"coverStage\"]:has(.lyrics-mv-background) .lyrics-cover-stage-color-field {\r\n  opacity: 0;\r\n}\r\n@media (max-width: 720px) {\r\n  .lyrics-page[data-lyrics-page-style=\"coverStage\"]:has(.lyrics-mv-background) {\r\n    grid-template-columns: minmax(0, 1fr);\r\n  }\r\n  .lyrics-page[data-lyrics-page-style=\"coverStage\"]:has(.lyrics-mv-background) .lyrics-mv-background {\r\n    inset: 0;\r\n    width: 100%;\r\n    mask-image: none;\r\n    -webkit-mask-image: none;\r\n  }\r\n}\r\n";

const external = echoExternalMod;
const log = (...values) => { try { external.log?.(...values); } catch {} };
const toast = (message) => { try { external.toast?.(String(message || '')); } catch {} };

const LYRICS_VIEW_MODE_KEY = 'echo:lyrics:view-mode';
const MV_VIEW_MODE_KEY = 'echo.mv.view-mode';
const DIAGNOSTICS_KEY = 'echo:mv:show-diagnostics-report';
const IMMERSIVE_CONTROLS_KEY = 'echo.mv.immersive-controls-open';
const LOCALE_KEY = 'echo.locale';
const CSS_ID = 'echo-mv-mod-css';
const OPEN_MV_SETTINGS_EVENT = 'app:open-mv-settings';
const SETTINGS_CHANGED_EVENT = 'settings:changed';
const MV_CHANGED_EVENT = 'mv:changed';
const MV_CANDIDATES_EVENT = 'mv:candidatesChanged';
const PLAYBACK_SEEKED_EVENT = 'playback:seeked';
const MV_ENDED_EVENT = 'mv:ended-before-audio';
const DIAGNOSTICS_EVENT = 'mv:diagnostics-preference-changed';
const IMMERSIVE_WHEEL_EVENT = 'lyrics:mv-immersive-background-scale-wheel';
const SMART_READABLE_EVENT = 'lyrics:smart-readable-video-sample';
const NAV_LYRICS_EVENT = 'app:navigate:lyrics';

const MV_OFFSET_MIN = -600000;
const MV_OFFSET_MAX = 600000;
const MV_OFFSET_STEP = 100;
const OFFSET_STEP_OPTIONS = [100, 500, 1000, 5000, 10000];
const NETWORK_PROVIDERS = ['bilibili', 'youtube'];
const QUALITY_CAPS = ['720p', '1080p', '1440p', '2160p', 'max'];
const SYNC_MODES = ['stable', 'balanced', 'precise'];
const MV_SETTINGS_KEYS = ['enabled', 'autoSearch', 'autoPreload', 'autoApplyThreshold', 'titleOnlySearch', 'preferHighestViewCount', 'immersiveBackground', 'immersiveBackgroundAutoScale', 'immersiveBackgroundScalePercent', 'immersiveBackgroundOffsetXPercent', 'immersiveBackgroundOffsetYPercent', 'immersiveBackgroundBlurPx', 'immersiveBackgroundBrightnessPercent', 'immersiveBackgroundOverlayOpacityPercent', 'lyricsReadabilityEnhanced', 'hideLyrics', 'restartAudioOnLoad', 'syncMode', 'replayAudioOnChange', 'enabledProviders', 'providerOrder', 'maxQuality', 'allow60fps'];
const RELOAD_SETTINGS_KEYS = ['enabled', 'autoSearch', 'autoPreload', 'titleOnlySearch', 'preferHighestViewCount', 'enabledProviders', 'providerOrder', 'maxQuality', 'allow60fps'];
const SYNC_PROFILES = {
  stable: { toleranceSeconds: 1.2, hardSeekSeconds: 4, maxRateDelta: 0.06 },
  balanced: { toleranceSeconds: 0.45, hardSeekSeconds: 2, maxRateDelta: 0.12 },
  precise: { toleranceSeconds: 0.2, hardSeekSeconds: 0.9, maxRateDelta: 0.18 },
};
const SYNC_INTERVALS = { stable: 750, balanced: 400, precise: 250 };
const DIRECT_BILI_SYNC = { toleranceSeconds: 0.18, hardSeekSeconds: 0.75, maxRateDelta: 0.18 };
const DRAW_EXIT_MS = 480;
const SCALE_MIN = 70;
const SCALE_MAX = 220;
const SCALE_WHEEL_STEP = 5;
const SCALE_SAVE_MS = 360;
const NOTICE_DISMISS_MS = 3000;
const SYNC_COOLDOWN_MS = 1000;

const fallbackSettings = {
  enabled: true,
  autoSearch: true,
  autoPreload: true,
  autoApplyThreshold: 0.7,
  titleOnlySearch: false,
  preferHighestViewCount: true,
  immersiveBackground: true,
  immersiveBackgroundAutoScale: true,
  immersiveBackgroundScalePercent: 115,
  immersiveBackgroundOffsetXPercent: 50,
  immersiveBackgroundOffsetYPercent: 50,
  immersiveBackgroundBlurPx: 0,
  immersiveBackgroundBrightnessPercent: 100,
  immersiveBackgroundOverlayOpacityPercent: 0,
  lyricsReadabilityEnhanced: false,
  hideLyrics: false,
  restartAudioOnLoad: false,
  syncMode: 'balanced',
  replayAudioOnChange: true,
  enabledProviders: ['bilibili', 'youtube'],
  providerOrder: ['bilibili', 'youtube'],
  maxQuality: 'max',
  allow60fps: true,
};
const immersiveDefaults = {
  immersiveBackgroundAutoScale: true,
  immersiveBackgroundScalePercent: 115,
  immersiveBackgroundOffsetXPercent: 50,
  immersiveBackgroundOffsetYPercent: 50,
  immersiveBackgroundBlurPx: 0,
  immersiveBackgroundBrightnessPercent: 100,
  immersiveBackgroundOverlayOpacityPercent: 0,
};

const ICONS = {
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  music2: '<circle cx="8" cy="18" r="4"/><path d="M12 18V2l7 1v15"/><circle cx="19" cy="16" r="4"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  clapperboard: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><rect width="20" height="14" x="2" y="8" rx="2"/>',
  monitorPlay: '<path d="M10 7.75a.75.75 0 0 1 1.142-.638l3.664 2.249a.75.75 0 0 1 0 1.276l-3.664 2.25A.75.75 0 0 1 10 12.25z"/><path d="M12 17v4"/><path d="M8 21h8"/><rect width="20" height="14" x="2" y="3" rx="2"/>',
  shieldCheck: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  folder: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  fileVideo: '<path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><rect width="8" height="6" x="2" y="12" rx="1"/><path d="m10 15.5 4 2.5v-6l-4 2.5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  minus: '<path d="M5 12h14"/>',
  rewind: '<path d="M12 6 6.5 10.5 12 15"/><path d="M6 6v12"/><path d="m18 6-5.5 4.5L18 15"/><path d="M12 6v12"/>',
  fastForward: '<path d="M12 6v12"/><path d="m6 6 5.5 4.5L6 15"/><path d="M18 6v12"/><path d="m12 6 5.5 4.5L12 15"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
};

let localeId = 'en';
const interpolate = (text, options) => {
  if (!options) return text;
  return Object.keys(options).reduce((current, key) => current.split('{' + key + '}').join(String(options[key])), text);
};
const t = (key, options) => {
  const table = I18N[localeId] || I18N.en || {};
  return interpolate(table[key] || I18N.en?.[key] || I18N.zh?.[key] || key, options);
};
const detectLocale = () => {
  const candidates = [];
  try { candidates.push(window.localStorage.getItem(LOCALE_KEY)); } catch {}
  candidates.push(document.documentElement.lang, navigator.language, navigator.userLanguage);
  for (const value of candidates) {
    const lang = String(value || '').toLowerCase();
    if (!lang) continue;
    if (lang.startsWith('zh')) return 'zh';
    if (lang.startsWith('en')) return 'en';
  }
  return 'en';
};
localeId = detectLocale();

const echoApi = () => window.echo || external.echo || {};
const playerApi = () => external.player || window.__echoExternalPlayer || null;
const unwrap = (value) => {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'result') && (value.ok === true || value.ok === undefined)) {
    return value.result;
  }
  return value;
};
const invoke = async (method, payload) => {
  if (typeof external.main?.invoke !== 'function') throw new Error('ECHO-MV main bridge unavailable');
  return unwrap(await external.main.invoke(method, payload || {}));
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clampOffset = (value) => clamp(Math.round(Number(value) || 0), MV_OFFSET_MIN, MV_OFFSET_MAX);
const clampScale = (value) => Math.round(clamp(Number(value) || 115, SCALE_MIN, SCALE_MAX));
const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const textOf = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};
const numOf = (...values) => {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
};
const svgIcon = (name, size = 16) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('width', String(size));
  node.setAttribute('height', String(size));
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', size >= 20 ? '1.9' : '1.8');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = ICONS[name] || '';
  return node;
};
const el = (tag, className, attrs, children) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs && typeof attrs === 'object') {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;
      if (key === 'on') continue;
      if (key.startsWith('aria-') && typeof value === 'boolean') {
        node.setAttribute(key, value ? 'true' : 'false');
        continue;
      }
      if (key === 'checked' || key === 'disabled' || key === 'readOnly' || key === 'draggable') {
        node[key] = Boolean(value);
        continue;
      }
      if (value === false && key !== 'value') continue;
      if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
        continue;
      }
      if (key === 'dataset' && value && typeof value === 'object') {
        for (const [dataKey, dataValue] of Object.entries(value)) {
          if (dataValue !== undefined && dataValue !== null) node.dataset[dataKey] = String(dataValue);
        }
        continue;
      }
      if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, String(value));
    }
  }
  const list = children === undefined ? [] : Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === undefined || child === null || child === false) continue;
    if (child instanceof Node) node.append(child);
    else node.append(String(child));
  }
  return node;
};
const btn = (className, attrs, children) => el('button', className, { type: 'button', ...attrs }, children);
const formatScore = (score) => `${Math.round((Number(score) || 0) * 100)}%`;
const formatThreshold = (threshold) => `${Math.round((threshold ?? 0.7) * 100)}%`;
const thresholdFromPercent = (value) => clamp(Math.round(Number(value) || 70), 30, 100) / 100;
const formatDuration = (seconds) => {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '';
  const total = Math.round(n);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
const formatOffsetMagnitude = (offsetMs) => {
  const abs = Math.abs(offsetMs);
  if (abs > 0 && abs < 1000) return `${abs}ms`;
  const seconds = abs / 1000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
};
const formatOffset = (offsetMs) => (offsetMs === 0 ? '0s' : `${offsetMs > 0 ? '+' : '-'}${formatOffsetMagnitude(offsetMs)}`);
const formatSecondsInput = (seconds) => seconds.toFixed(1).replace(/\.0$/, '');
const providerLabel = (provider) => {
  if (provider === 'local') return t('mvSettings.provider.local');
  if (provider === 'bilibili') return 'Bilibili';
  if (provider === 'youtube') return 'YouTube';
  return provider || t('mvSettings.status.none');
};
const qualityCapLabel = (quality) => (quality === '2160p' ? '4K' : quality === 'max' ? t('mvSettings.quality.max') : quality);
const isResolutionQualityLabel = (label) => /^(?:8K|4K|\d{3,4}p)(?:\s*\/?\s*\d{2,3}fps|\s+\d{2,3}fps)?$/i.test(String(label || '').trim());
const heightFromQualityLabel = (label) => {
  const normalized = String(label || '').trim();
  if (/^8K\b/i.test(normalized)) return 4320;
  if (/^4K\b/i.test(normalized)) return 2160;
  const match = normalized.match(/^(\d{3,4})p\b/i);
  return match ? Number(match[1]) : null;
};
const formatVideoQuality = (video, emptyLabel) => {
  if (!video) return emptyLabel;
  const resolutionLabel = video.height
    ? video.height >= 4320 ? '8K' : video.height >= 2160 ? '4K' : `${video.height}p`
    : video.width ? `${video.width}px` : null;
  const qualityLabel = video.qualityLabel?.trim() || null;
  const qualityHeight = qualityLabel && isResolutionQualityLabel(qualityLabel) ? heightFromQualityLabel(qualityLabel) : null;
  const canTrust = qualityLabel !== null && (!isResolutionQualityLabel(qualityLabel) || !video.height || !qualityHeight || qualityHeight <= video.height || video.height >= qualityHeight * 0.7);
  const baseLabel = canTrust ? qualityLabel : resolutionLabel ?? qualityLabel;
  if (!baseLabel) return emptyLabel;
  if (!video.fps || video.fps < 55) return baseLabel;
  const fpsLabel = `${Math.round(video.fps)}fps`;
  return new RegExp(`\\b${fpsLabel.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i').test(baseLabel) ? baseLabel : `${baseLabel} / ${fpsLabel}`;
};
const formatVideoTitle = (video, emptyLabel) => video ? (textOf(video.title, video.sourceId) || emptyLabel) : emptyLabel;
const rawRecord = (value) => asObject(value);
const isReceiverTrackId = (value) => Boolean(value && (String(value).startsWith('dlna-receiver:') || String(value).startsWith('airplay-receiver:')));
const isStreamingTrack = (track) => Boolean(track?.mediaType === 'streaming' && track.provider && track.providerTrackId);
const streamingTrackKey = (track) => textOf(track?.stableKey) || (track?.provider && track?.providerTrackId ? `streaming:${track.provider}:${track.providerTrackId}` : '');
const snapshotTrackIdFor = (track, fallbackId) => {
  if (track?.mediaType === 'streaming') {
    const key = streamingTrackKey(track);
    if (key) return key;
  }
  return track?.id || fallbackId;
};
const shouldUseSnapshotSearch = (track, trackId) => Boolean(isReceiverTrackId(trackId) || track?.isTemporary || track?.mediaType === 'remote' || track?.mediaType === 'streaming');
const isPlayableVideo = (video) => Boolean(video?.playableInApp && video.mediaUrl);
const isUnplayableSearchCandidate = (video) => Boolean(video && video.sourceType === 'search_candidate' && (!video.playableInApp || !video.mediaUrl));
const isAdaptiveStream = (video) => Boolean(video?.mimeType && (String(video.mimeType).includes('mpegurl') || String(video.mimeType).includes('dash') || String(video.mimeType).includes('application/vnd.apple.mpegurl')));
const isEchoLive = (video) => rawRecord(video?.rawProviderJson)?.echoLiveStream === true;
const isBilibiliBlocked = (video) => video?.provider === 'bilibili' && rawRecord(video?.rawProviderJson)?.unavailableReason === 'bilibili-playurl-blocked';
const isMutedVideoOnly = (video) => rawRecord(video?.rawProviderJson)?.mutedVideoOnly === true || video?.provider === 'bilibili';
const isMvDatabaseError = (error) => /MV database is temporarily unavailable|database disk image is malformed|DatabaseHealthError|SQLITE_CORRUPT|file is not a database|MV 数据库/i.test(error instanceof Error ? error.message : String(error || ''));
const isDirectBili = (video, target) => {
  if (!video || video.provider !== 'bilibili' || !target) return false;
  const id = biliIdFromTarget(target);
  return Boolean(id && video.sourceId === id);
};
const shouldFollowMusic = (settings, video, target) => settings.restartAudioOnLoad === true || isDirectBili(video, target);
const videoToCandidate = (video) => ({
  id: video.id,
  provider: video.provider,
  sourceType: video.sourceType,
  title: video.title ?? video.sourceId ?? video.id,
  artist: video.artist,
  filePath: video.filePath,
  url: video.url,
  providerUrl: video.providerUrl,
  thumbnailUrl: video.thumbnailUrl,
  uploader: null,
  viewCount: typeof rawRecord(video.rawProviderJson)?.viewCount === 'number' ? rawRecord(video.rawProviderJson).viewCount : null,
  availableQualities: [],
  durationSeconds: video.durationSeconds,
  score: video.score,
  playableInApp: video.playableInApp,
  reasons: [],
});
const youtubeIdFromValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{11}$/u.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || null;
    if (parsed.hostname.endsWith('youtube.com')) return parsed.searchParams.get('v') || parsed.pathname.match(/\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/u)?.[1] || null;
  } catch {
    return raw.match(/[?&]v=([A-Za-z0-9_-]{11})/u)?.[1] || raw.match(/youtu\.be\/([A-Za-z0-9_-]{11})/u)?.[1] || null;
  }
  return null;
};
const biliIdFromTarget = (target) => {
  if (target?.provider !== 'bilibili') return null;
  const rawId = String(target.providerTrackId || '').trim();
  if (!rawId) return null;
  if (/^https?:\/\//iu.test(rawId)) {
    try { return new URL(rawId).pathname.match(/\/video\/((?:BV[A-Za-z0-9]+)|(?:av\d+))/iu)?.[1] || null; } catch { return null; }
  }
  return rawId.match(/^BV[A-Za-z0-9]+$/iu)?.[0] || rawId.match(/^av\d+$/iu)?.[0] || null;
};
const youtubeEmbedUrl = (video, options) => {
  if (!video || video.provider !== 'youtube' || video.sourceType !== 'manual') return null;
  const videoId = youtubeIdFromValue(video.providerUrl || video.url || video.sourceId);
  if (!videoId) return null;
  const url = new URL(`https://www.youtube.com/embed/${videoId}`);
  url.searchParams.set('autoplay', options.autoplay ? '1' : '0');
  url.searchParams.set('mute', '1');
  url.searchParams.set('controls', options.controls === false ? '0' : '1');
  url.searchParams.set('rel', '0');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('iv_load_policy', '3');
  if (options.controls === false) {
    url.searchParams.set('disablekb', '1');
    url.searchParams.set('fs', '0');
    url.searchParams.set('modestbranding', '1');
  }
  if (options.loop) {
    url.searchParams.set('loop', '1');
    url.searchParams.set('playlist', videoId);
  }
  return url.toString();
};

const HOST_LYRICS_STYLES = new Set(['editorial', 'folded', 'roseVinyl', 'cinemaStage', 'kineticPoster', 'coverStage', 'cutBoard']);
const STAGE_LYRICS_STYLES = new Set(['cinemaStage', 'coverStage']);
const lyricsPageStyle = (page = lyricsPageEl()) => String(page?.getAttribute('data-lyrics-page-style') || '');
const isHostLyricsStyle = (page) => HOST_LYRICS_STYLES.has(lyricsPageStyle(page));
const isLyricsStageStyle = (page) => STAGE_LYRICS_STYLES.has(lyricsPageStyle(page));
const rememberViewMode = (mode) => {
  try { window.sessionStorage.setItem(MV_VIEW_MODE_KEY, mode); } catch {}
  try { window.sessionStorage.setItem(LYRICS_VIEW_MODE_KEY, 'lyrics'); } catch {}
};
const readViewMode = () => {
  try {
    const ours = window.sessionStorage.getItem(MV_VIEW_MODE_KEY);
    if (ours === 'mv' || ours === 'lyrics') return ours;
    return window.sessionStorage.getItem(LYRICS_VIEW_MODE_KEY) === 'mv' ? 'mv' : 'lyrics';
  } catch {
    return 'lyrics';
  }
};
const readDiagnostics = () => {
  try { return window.localStorage.getItem(DIAGNOSTICS_KEY) === 'true'; } catch { return false; }
};
const writeDiagnostics = (enabled) => {
  try {
    if (enabled) window.localStorage.setItem(DIAGNOSTICS_KEY, 'true');
    else window.localStorage.removeItem(DIAGNOSTICS_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent(DIAGNOSTICS_EVENT, { detail: { enabled } }));
};
const readImmersiveOpen = () => {
  try { return window.localStorage.getItem(IMMERSIVE_CONTROLS_KEY) === 'true'; } catch { return false; }
};
const writeImmersiveOpen = (enabled) => {
  try { window.localStorage.setItem(IMMERSIVE_CONTROLS_KEY, enabled ? 'true' : 'false'); } catch {}
};

const dispatchSettingsChanged = (patch) => {
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: patch }));
};
const notifyMvChanged = (trackId) => {
  window.dispatchEvent(new CustomEvent(MV_CHANGED_EVENT, { detail: { trackId } }));
};

const normalizeClock = (clock) => ({
  positionSeconds: Number.isFinite(clock?.positionSeconds) && clock.positionSeconds > 0 ? clock.positionSeconds : 0,
  updatedAtMs: Number.isFinite(clock?.updatedAtMs) ? clock.updatedAtMs : performance.now(),
  playbackRate: Number.isFinite(Number(clock?.playbackRate)) ? clamp(Number(clock.playbackRate), 0.5, 2) : 1,
  durationSeconds: clock?.durationSeconds && Number.isFinite(clock.durationSeconds) && clock.durationSeconds > 0 ? clock.durationSeconds : null,
  state: clock?.state || 'idle',
});
const estimateClockPosition = (clock, nowMs = performance.now()) => {
  const normalized = normalizeClock(clock);
  const elapsed = normalized.state === 'playing' ? Math.max(0, (nowMs - normalized.updatedAtMs) / 1000) * normalized.playbackRate : 0;
  const position = normalized.positionSeconds + elapsed;
  return normalized.durationSeconds ? Math.min(position, normalized.durationSeconds) : position;
};
const targetVideoTime = (video, clock, offsetMs) => {
  const position = Math.max(0, estimateClockPosition(clock) + (Number(offsetMs) || 0) / 1000);
  const duration = Number(video.duration);
  if (video.loop && Number.isFinite(duration) && duration > 0) return position % duration;
  return position;
};
const signedDrift = (video, targetTime) => {
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  let drift = targetTime - current;
  const duration = Number(video.duration);
  if (video.loop && Number.isFinite(duration) && duration > 0) {
    if (drift > duration / 2) drift -= duration;
    else if (drift < -duration / 2) drift += duration;
  }
  return drift;
};
const playVideo = (video) => {
  try {
    const result = video.play();
    if (result && typeof result.catch === 'function') void result.catch(() => undefined);
  } catch {}
};
const releaseVideo = (video) => {
  if (!video) return;
  try { video.pause(); } catch {}
  try {
    video.removeAttribute('src');
    video.load();
  } catch {}
};

const currentQueueTrack = () => {
  try {
    const queue = playerApi()?.queue?.();
    return asObject(queue?.currentTrack) || asObject(queue?.current) || asObject(queue?.nowPlaying) || null;
  } catch {
    return null;
  }
};

const snapshotFromTrack = (track, trackId, extras = {}) => {
  const audioClock = extras.audioClock || state.audioClock;
  const title = textOf(track?.title, extras.title, 'Unknown Title');
  const artist = textOf(track?.artist, track?.albumArtist, extras.artist, 'Unknown Artist');
  return {
    trackId: snapshotTrackIdFor(track, trackId),
    title,
    artist,
    album: textOf(track?.album) || null,
    albumArtist: textOf(track?.albumArtist) || null,
    durationSeconds: numOf(track?.duration, track?.durationSeconds, extras.durationSeconds, audioClock.durationSeconds),
    coverThumb: track?.coverThumb || extras.coverThumb || extras.coverUrl || null,
    mediaType: track?.mediaType || extras.mediaType || 'local',
    path: textOf(track?.path, extras.path) || undefined,
    query: extras.query || undefined,
    autoSelect: extras.autoSelect === true ? true : undefined,
  };
};

const enrichSnapshot = async (trackId, extras = {}) => {
  if (!trackId) throw new Error('trackId required');
  let track = asObject(extras.track) || (state.trackId === trackId ? state.currentTrack : null);
  if (!track) {
    try { track = asObject(await echoApi().library?.getTrack?.(trackId)); } catch {}
  }
  if (!track) {
    const queued = currentQueueTrack();
    if (queued && (queued.id === trackId || queued.stableKey === trackId || queued.path === trackId || streamingTrackKey(queued) === trackId)) {
      track = queued;
    }
  }
  if (!track) {
    const status = state.playbackStatus || {};
    const audio = state.audioStatus || {};
    if ((status.currentTrackId === trackId || audio.currentTrackId === trackId) || extras.allowPlaybackFallback !== false) {
      track = {
        id: trackId,
        title: textOf(audio.currentTrackTitle, extras.title),
        artist: textOf(audio.currentTrackArtist, extras.artist),
        album: textOf(audio.currentTrackAlbum),
        albumArtist: textOf(audio.currentTrackAlbumArtist),
        duration: numOf(audio.durationSeconds, status.durationMs ? status.durationMs / 1000 : null) || 0,
        coverThumb: audio.currentTrackCoverUrl || null,
        mediaType: extras.mediaType || (status.filePath ? 'local' : 'streaming'),
        path: textOf(status.filePath, audio.currentFilePath),
      };
    }
  }
  return snapshotFromTrack(track, trackId, extras);
};

const mvApi = {
  getSelected: (trackId) => invoke('mv.getSelected', { trackId }),
  getSettings: () => invoke('mv.getSettings', {}),
  setSettings: (patch) => invoke('mv.setSettings', { patch }),
  findLocalCandidates: async (trackId) => invoke('mv.findLocalCandidates', { snapshot: await enrichSnapshot(trackId) }),
  searchNetworkCandidates: async (trackId, query) => invoke('mv.searchNetworkCandidates', { snapshot: await enrichSnapshot(trackId, { query, autoSelect: true }), query, autoSelect: true }),
  searchNetworkCandidatesForSnapshot: (request) => invoke('mv.searchNetworkCandidatesForSnapshot', { snapshot: request }),
  getTemporaryPlayableForSnapshot: (request) => invoke('mv.getTemporaryPlayableForSnapshot', { snapshot: request }),
  getCandidates: (trackId) => invoke('mv.getCandidates', { trackId }),
  resolveStreams: (videoId) => invoke('mv.resolveStreams', { videoId }),
  setQuality: (videoId, qualityId) => invoke('mv.setQuality', { videoId, qualityId }),
  setOffset: (trackId, offsetMs) => invoke('mv.setOffset', { trackId, offsetMs }),
  chooseLocalVideo: (trackId) => invoke('mv.chooseLocalVideo', { trackId }),
  bindLocalVideo: (trackId, filePath) => invoke('mv.bindLocalVideo', { trackId, filePath }),
  bindUrl: (trackId, url) => invoke('mv.bindUrl', { trackId, url }),
  selectVideo: (trackId, videoId) => invoke('mv.selectVideo', { trackId, videoId }),
  clearSelected: (trackId) => invoke('mv.clearSelected', { trackId }),
  openExternal: (videoId) => invoke('mv.openExternal', { videoId }),
};

const installMvApi = () => {
  const extra = (window.__echoShinawaseStreaming ||= {});
  extra.mv = mvApi;
  const echo = window.echo;
  if (!echo) {
    window.echo = { mv: mvApi };
    return;
  }
  try { echo.mv = mvApi; } catch {}
  if (echo.mv === mvApi || typeof echo.mv?.getSettings === 'function') return;
  try {
    Object.defineProperty(echo, 'mv', { value: mvApi, configurable: true, writable: true });
  } catch {}
  if (echo.mv === mvApi || typeof echo.mv?.getSettings === 'function') return;
  if (window.__echoShinawaseEchoPatched) return;
  try {
    const base = echo;
    const table = (window.__echoShinawaseStreaming ||= {});
    table.mv = mvApi;
    window.echo = new Proxy(base, {
      get(target, prop) {
        const value = Reflect.get(target, prop);
        if ((value === null || value === undefined) && table[prop]) return table[prop];
        return value;
      },
    });
    window.__echoShinawaseEchoPatched = true;
  } catch {}
};

const uninstallMvApi = () => {
  try {
    if (window.__echoShinawaseStreaming?.mv === mvApi) delete window.__echoShinawaseStreaming.mv;
  } catch {}
  try {
    if (window.echo?.mv === mvApi) {
      try { delete window.echo.mv; } catch {
        try { window.echo.mv = undefined; } catch {}
      }
    }
  } catch {}
};

installMvApi();

const state = {
  settings: { ...fallbackSettings },
  hasLoadedSettings: false,
  selectedVideo: null,
  candidates: [],
  variants: [],
  trackId: null,
  currentTrack: null,
  streamingTarget: null,
  title: '',
  artist: '',
  coverUrl: null,
  isLoading: false,
  error: null,
  videoError: false,
  noticeDismissed: false,
  copiedDiagnostics: false,
  diagnosticsEnabled: readDiagnostics(),
  viewMode: readViewMode(),
  isAudioPlaying: false,
  audioClock: normalizeClock({ positionSeconds: 0, updatedAtMs: performance.now(), playbackRate: 1, durationSeconds: null, state: 'idle' }),
  playbackStatus: null,
  audioStatus: null,
  requestId: 0,
  preloadAttempt: null,
  lastSyncAt: 0,
  seeking: false,
  failedCovers: new Set(),
  failedThumbs: new Set(),
  immersiveBounds: null,
  immersiveVideoSize: null,
  drawerOpen: false,
  drawerRender: false,
  drawerMotion: false,
  sheetCollapsed: false,
  sheetIgnoreCloseUntil: 0,
  busy: false,
  busyCandidateId: null,
  networkError: null,
  networkNotice: null,
  searchQuery: '',
  useCurrentSong: true,
  customUrl: '',
  maxQualityOpen: false,
  networkOpen: true,
  immersiveOpen: readImmersiveOpen(),
  offsetOpen: false,
  offsetSaving: false,
  offsetStep: 500,
  draggedProvider: null,
  dragOverProvider: null,
  originalPanelHtml: null,
  originalEnabled: null,
  originalViewMode: null,
};
const refs = {
  panel: null,
  lyricsPage: null,
  background: null,
  foregroundVideo: null,
  backgroundVideo: null,
  notice: null,
  diagnostics: null,
  settingsBtn: null,
  drawerRoot: null,
  transportBtn: null,
};
const timers = {
  poll: 0,
  sync: 0,
  notice: 0,
  scaleSave: 0,
  drawerExit: 0,
  copyReset: 0,
  render: 0,
};
const disposers = [];
let disposed = false;
let lastVideoKey = '';
let lastBgKey = '';
let lastPanelSignature = '';
let lastDrawerSignature = '';
let pendingDrawerRender = false;
let scalePending = null;
let resizeObserver = null;

const isLyricsPageVisible = () => Boolean(document.querySelector('.lyrics-page, .app-shell--lyrics'));
const lyricsPageEl = () => document.querySelector('.lyrics-page');
const hideOfficialMvChrome = (page) => {
  page?.querySelectorAll('section.lyrics-mv-panel').forEach((node) => {
    node.dataset.echoMvStub = 'true';
    node.hidden = true;
  });
};
const ownedPanelEl = () => document.querySelector('aside.echo-mv-panel');
const ensureOwnedPanel = (page) => {
  hideOfficialMvChrome(page);
  page?.querySelectorAll('section.lyrics-mv-panel[data-echo-mv-mod="true"]').forEach((node) => node.remove());
  let panel = ownedPanelEl();
  if (!panel) {
    panel = el('aside', 'echo-mv-panel', { 'aria-label': t('mvPanel.title') });
    page.append(panel);
  } else if (panel.parentElement !== page) {
    page.append(panel);
  }
  return panel;
};
const teardownOwnedPanel = () => {
  ownedPanelEl()?.remove();
  lastPanelSignature = '';
  lastVideoKey = '';
  refs.panel = null;
  refs.foregroundVideo = null;
};
const shouldAutoSearch = () => {
  if (!state.trackId || state.settings.autoSearch === false) return false;
  return state.isAudioPlaying || isReceiverTrackId(state.trackId) || (state.settings.autoPreload !== false && shouldUseSnapshotSearch(state.currentTrack, state.trackId));
};
const panelActive = () => state.settings.enabled !== false;
const lyricsVisible = () => isLyricsPageVisible() && !document.hidden;

const applyLocaleFromApp = async () => {
  try {
    const settings = await echoApi().app?.getSettings?.();
    const locale = String(settings?.locale || '');
    if (locale.toLowerCase().startsWith('zh')) localeId = 'zh';
    else if (locale.toLowerCase().startsWith('en')) localeId = 'en';
  } catch {}
};

const loadSettings = async () => {
  try {
    const next = await mvApi.getSettings();
    if (next && typeof next === 'object') state.settings = { ...fallbackSettings, ...next };
    else state.settings = { ...fallbackSettings };
  } catch {
    state.settings = { ...fallbackSettings };
  }
  state.hasLoadedSettings = true;
  return state.settings;
};

const patchSettings = async (patch) => {
  state.settings = { ...state.settings, ...patch };
  scheduleRender();
  try {
    const next = await mvApi.setSettings(patch);
    if (next && typeof next === 'object') state.settings = { ...fallbackSettings, ...next };
    dispatchSettingsChanged(patch);
    applyPageFlags();
    scheduleRender();
    if (typeof patch.enabled === 'boolean') {
      try {
        const app = echoApi().app;
        if (app?.getSettings && app.setSettings) {
          const appSettings = await app.getSettings();
          if (appSettings.lyricsMvAutoShowTrackInfoDisabled !== false) {
            const lyricsPatch = { lyricsHeaderHidden: patch.enabled };
            await app.setSettings(lyricsPatch);
            dispatchSettingsChanged(lyricsPatch);
          }
        }
      } catch {}
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
    await loadSettings();
    scheduleRender();
  }
};

const summarizeLoadError = (message) => {
  if (/MV database is temporarily unavailable|database disk image is malformed|DatabaseHealthError|SQLITE_CORRUPT|file is not a database/i.test(message)) return t('mvPanel.status.databaseUnread');
  if (/bilibili|playurl|blocked|forbidden|403|412|credential|cookie|SESSDATA/i.test(message)) return t('mvPanel.status.bilibiliBlocked');
  if (/network|fetch|timeout|timed out|AbortError|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)) return t('mvPanel.status.networkFailed');
  if (/MEDIA_ERR|decode|demux|unsupported|format|source|ERR_FILE_NOT_FOUND|404/i.test(message)) return t('mvPanel.status.videoFailed');
  return String(message || '').trim() || t('mvPanel.status.loadFailed');
};
const summarizeActionError = (error) => {
  const message = error instanceof Error ? error.message : String(error || '');
  if (isMvDatabaseError(error)) return t('mvSettings.error.databaseUnavailable');
  if (/bilibili|playurl|blocked|forbidden|403|412|credential|cookie|SESSDATA/iu.test(message)) return t('mvSettings.error.bilibiliBlocked', { reason: message || t('mvSettings.error.actionFailed') });
  if (/network|fetch|timeout|timed out|AbortError|ECONN|ENOTFOUND|EAI_AGAIN/iu.test(message)) return t('mvSettings.error.networkFailed', { reason: message || t('mvSettings.error.actionFailed') });
  return message.trim() || t('mvSettings.error.actionFailed');
};

const resolveNetworkVideo = async (video) => {
  if (!video || video.temporary || video.provider === 'local') return video;
  try {
    const resolved = await mvApi.resolveStreams(video.id);
    if (resolved?.variants) state.variants = resolved.variants;
    const next = resolved?.video || resolved;
    return isPlayableVideo(video) && !isPlayableVideo(next) ? video : next;
  } catch (error) {
    if (isMvDatabaseError(error)) throw error;
    return video;
  }
};

const snapshotForActive = (options = {}) => snapshotFromTrack(state.currentTrack, state.trackId, {
  title: state.title,
  artist: state.artist,
  coverUrl: state.coverUrl,
  audioClock: state.audioClock,
  mediaType: options.forceSnapshot ? 'local' : (state.currentTrack?.mediaType || 'remote'),
  autoSelect: options.autoSelect,
  query: options.query,
});

const searchCandidatesForActive = async (options = {}) => {
  if (!state.trackId) return null;
  if ((options.forceSnapshot || shouldUseSnapshotSearch(state.currentTrack, state.trackId))) {
    const request = { ...snapshotForActive(options), autoSelect: true };
    await mvApi.searchNetworkCandidatesForSnapshot(request);
    return mvApi.getSelected(request.trackId);
  }
  try { await mvApi.findLocalCandidates(state.trackId); } catch {}
  const afterLocal = await mvApi.getSelected(state.trackId);
  if (isPlayableVideo(afterLocal)) return afterLocal;
  await mvApi.searchNetworkCandidates(state.trackId, options.query);
  return mvApi.getSelected(state.trackId);
};

const loadSelected = async (options = {}) => {
  if (!lyricsVisible()) return;
  if (!panelActive() && !shouldAutoSearch()) return;
  const requestId = ++state.requestId;
  if (!options.preserveCurrent) state.selectedVideo = null;
  state.isLoading = Boolean(state.trackId);
  state.error = null;
  state.videoError = false;
  if (!state.trackId) {
    state.isLoading = false;
    scheduleRender();
    return;
  }
  try {
    const nextSettings = await loadSettings();
    if (state.requestId !== requestId) return;
    if (nextSettings.enabled === false) {
      state.selectedVideo = null;
      state.isLoading = false;
      scheduleRender();
      return;
    }
    const effectiveId = snapshotTrackIdFor(state.currentTrack, state.trackId) || state.trackId;
    let video = await mvApi.getSelected(effectiveId);
    if (state.streamingTarget) {
      const biliId = biliIdFromTarget(state.streamingTarget);
      const rawBili = String(state.streamingTarget.providerTrackId || '').trim();
      const biliUrl = state.streamingTarget.provider === 'bilibili'
        ? (/^https?:\/\//i.test(rawBili) ? rawBili : (biliId ? `https://www.bilibili.com/video/${encodeURIComponent(biliId)}` : null))
        : null;
      const ytId = state.streamingTarget.provider === 'youtube' ? youtubeIdFromValue(state.streamingTarget.providerTrackId) : null;
      const ytUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : null;
      if (biliUrl && (!video || video.provider !== 'bilibili' || video.sourceId !== biliId)) {
        try { video = await mvApi.bindUrl(effectiveId, biliUrl); } catch {}
      }
      if (ytUrl && (!video || video.provider !== 'youtube' || video.sourceId !== ytId)) {
        try { video = await mvApi.bindUrl(effectiveId, ytUrl); } catch {}
      }
    }
    const canSearch = shouldAutoSearch() && (panelActive() || nextSettings.autoSearch !== false);
    if (!video && canSearch && state.preloadAttempt !== state.trackId) {
      state.preloadAttempt = state.trackId;
        video = (await searchCandidatesForActive()) || (await mvApi.getSelected(effectiveId));
    }
    let resolved = await resolveNetworkVideo(video);
    if (isUnplayableSearchCandidate(resolved) && canSearch && state.preloadAttempt !== state.trackId) {
      state.preloadAttempt = state.trackId;
      video = (await searchCandidatesForActive()) || (await mvApi.getSelected(effectiveId));
      resolved = await resolveNetworkVideo(video);
    }
    if (state.requestId !== requestId) return;
    state.selectedVideo = resolved;
  } catch (error) {
    if (state.requestId !== requestId) return;
    if (isMvDatabaseError(error)) {
      try {
        const fallback = await mvApi.getTemporaryPlayableForSnapshot({ ...snapshotForActive({ forceSnapshot: true }) });
        const resolved = await resolveNetworkVideo(fallback);
        if (state.requestId === requestId && resolved?.playableInApp && resolved.mediaUrl) {
          state.selectedVideo = resolved;
          state.error = null;
          state.isLoading = false;
          scheduleRender();
          return;
        }
      } catch {}
    }
    state.error = error instanceof Error ? error.message : String(error);
    state.selectedVideo = null;
    toast(summarizeLoadError(state.error));
  } finally {
    if (state.requestId === requestId) {
      state.isLoading = false;
      scheduleRender();
    }
  }
};

const refreshPlayback = async () => {
  const echo = echoApi();
  let playback = null;
  let audio = null;
  try { playback = await echo.playback?.getStatus?.(); } catch {}
  try { audio = await echo.audio?.getStatus?.(); } catch {}
  state.playbackStatus = playback;
  state.audioStatus = audio;
  const queued = currentQueueTrack();
  const trackId = audio?.currentTrackId || playback?.currentTrackId || queued?.id || queued?.stableKey || null;
  const playing = audio?.state === 'playing' || playback?.state === 'playing';
  const positionSeconds = numOf(audio?.positionSeconds, playback?.positionMs != null ? playback.positionMs / 1000 : null) || 0;
  const durationSeconds = numOf(audio?.durationSeconds, playback?.durationMs != null ? playback.durationMs / 1000 : queued?.duration) || null;
  const playbackRate = numOf(audio?.playbackRate) || 1;
  const audioState = audio?.state || playback?.state || 'idle';
  const prevTrackId = state.trackId;
  const wasPlaying = state.isAudioPlaying;
  state.audioClock = normalizeClock({
    positionSeconds,
    updatedAtMs: performance.now(),
    playbackRate,
    durationSeconds,
    state: audioState,
  });
  state.isAudioPlaying = playing;
  if (trackId && trackId !== state.trackId) {
    state.trackId = trackId;
    state.currentTrack = queued && (queued.id === trackId || queued.stableKey === trackId || streamingTrackKey(queued) === trackId) ? queued : state.currentTrack;
    if (!state.currentTrack || (state.currentTrack.id !== trackId && state.currentTrack.stableKey !== trackId)) {
      try { state.currentTrack = asObject(await echo.library?.getTrack?.(trackId)) || queued; } catch { state.currentTrack = queued; }
    }
    state.title = textOf(state.currentTrack?.title, audio?.currentTrackTitle);
    state.artist = textOf(state.currentTrack?.artist, state.currentTrack?.albumArtist, audio?.currentTrackArtist);
    state.coverUrl = state.currentTrack?.coverThumb || audio?.currentTrackCoverUrl || null;
    if (isStreamingTrack(state.currentTrack)) {
      state.streamingTarget = { provider: state.currentTrack.provider, providerTrackId: state.currentTrack.providerTrackId };
    } else {
      state.streamingTarget = null;
    }
    state.preloadAttempt = null;
    state.lastSyncAt = 0;
    state.seeking = false;
    state.noticeDismissed = false;
    if (lyricsVisible() && (panelActive() || shouldAutoSearch())) void loadSelected();
  } else {
    if (!state.title) state.title = textOf(queued?.title, audio?.currentTrackTitle);
    if (!state.artist) state.artist = textOf(queued?.artist, audio?.currentTrackArtist);
    if (!state.coverUrl) state.coverUrl = queued?.coverThumb || audio?.currentTrackCoverUrl || null;
    if (!wasPlaying && playing && !state.selectedVideo && state.trackId && lyricsVisible() && shouldAutoSearch()) {
      void loadSelected();
    }
  }
  if (prevTrackId && trackId !== prevTrackId) scheduleRender();
  if (panelActive()) syncVideos({ bypassCooldown: Math.abs(positionSeconds - (state.audioClock.positionSeconds || 0)) > 2 });
};

const applyRate = (video) => {
  if (!video) return;
  try { video.playbackRate = state.audioClock.playbackRate; } catch {}
};
const syncOne = (video, options = {}) => {
  const follow = shouldFollowMusic(state.settings, state.selectedVideo, state.streamingTarget);
  if (!video || isEchoLive(state.selectedVideo) || state.seeking || (!follow && !options.force)) return false;
  const target = targetVideoTime(video, state.audioClock, state.selectedVideo?.offsetMs || 0);
  const driftSigned = signedDrift(video, target);
  const drift = Math.abs(driftSigned);
  const profile = isDirectBili(state.selectedVideo, state.streamingTarget) ? DIRECT_BILI_SYNC : (SYNC_PROFILES[state.settings.syncMode || 'balanced'] || SYNC_PROFILES.balanced);
  const cooldown = isDirectBili(state.selectedVideo, state.streamingTarget) ? 150 : SYNC_COOLDOWN_MS;
  const now = Date.now();
  if (!options.force && drift <= profile.toleranceSeconds) {
    applyRate(video);
    return false;
  }
  if (!options.force && drift < profile.hardSeekSeconds) {
    const correction = clamp(driftSigned / profile.hardSeekSeconds, -profile.maxRateDelta, profile.maxRateDelta);
    try {
      video.playbackRate = state.audioClock.playbackRate * (1 + correction);
      return true;
    } catch {
      return false;
    }
  }
  if (!options.force && !options.bypassCooldown && now - state.lastSyncAt < cooldown) return false;
  try {
    video.currentTime = target;
    applyRate(video);
    if (options.recordCooldown !== false) state.lastSyncAt = now;
    return true;
  } catch {
    return false;
  }
};
const syncVideos = (options = {}) => {
  if (!panelActive() || document.hidden) return false;
  const a = syncOne(refs.foregroundVideo, options);
  const b = syncOne(refs.backgroundVideo, { ...options, recordCooldown: false });
  return a || b;
};

const unavailableReason = () => {
  const video = state.selectedVideo;
  const showVideo = Boolean(state.settings.enabled !== false && video?.playableInApp && video.mediaUrl && !state.videoError);
  const yt = youtubeEmbedUrl(video, { autoplay: state.isAudioPlaying, controls: false });
  if (showVideo || yt) return showVideo && video?.temporary && !isEchoLive(video) ? t('mvPanel.status.temporaryPlayback') : null;
  if (state.error) return summarizeLoadError(state.error);
  if (state.isLoading) return t('mvPanel.status.loading');
  if (!video) return t('mvPanel.status.notFound');
  if (isBilibiliBlocked(video)) return t('mvPanel.status.bilibiliBlocked');
  if (state.videoError) return t('mvPanel.status.videoFailed');
  if (!video.playableInApp) return video.provider === 'local' ? t('mvPanel.status.localUnsupported') : t('mvPanel.status.externalRequired');
  if (!video.mediaUrl) return t('mvPanel.status.missingUrl');
  return t('mvPanel.status.inAppUnavailable');
};

const applyPageFlags = () => {
  const page = lyricsPageEl();
  const mvOn = panelActive();
  if (page) {
    if (page.dataset.viewMode === 'mv') page.dataset.viewMode = 'lyrics';
    page.dataset.echoMv = mvOn ? 'on' : 'off';
    if (isHostLyricsStyle(page)) page.dataset.echoMvHostStyle = 'true';
    else delete page.dataset.echoMvHostStyle;
    if (isLyricsStageStyle(page)) page.dataset.echoMvStage = 'true';
    else delete page.dataset.echoMvStage;
    if (mvOn && state.settings.hideLyrics === true) page.setAttribute('data-mv-lyrics-hidden', 'true');
    else page.removeAttribute('data-mv-lyrics-hidden');
  }
  hideOfficialMvChrome(page);
  page?.querySelectorAll('aside.echo-mv-panel').forEach((node) => node.remove());
  if (refs.transportBtn) {
    const open = Boolean(state.drawerOpen && isLyricsPageVisible());
    refs.transportBtn.classList.toggle('is-soft-active', open);
    refs.transportBtn.setAttribute('aria-pressed', String(open));
  }
};

const bindVideoEvents = (video, kind) => {
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.addEventListener('error', () => {
    state.videoError = true;
    scheduleRender();
  });
  video.addEventListener('seeking', () => { state.seeking = true; });
  video.addEventListener('seeked', () => { state.seeking = false; });
  video.addEventListener('loadedmetadata', () => {
    if (kind === 'background') {
      const width = Math.round(video.videoWidth || state.selectedVideo?.width || 0);
      const height = Math.round(video.videoHeight || state.selectedVideo?.height || 0);
      if (width > 0 && height > 0) state.immersiveVideoSize = { width, height };
    }
    applyRate(video);
    syncVideos({ force: true, bypassCooldown: true });
    if (state.isAudioPlaying) playVideo(video);
    else video.pause();
    scheduleRender();
  });
  if (kind === 'foreground') {
    video.addEventListener('ended', () => {
      if (state.isAudioPlaying) window.dispatchEvent(new CustomEvent(MV_ENDED_EVENT, { detail: { trackId: state.trackId } }));
    });
  }
};

const ensureBackground = (page, mediaUrl, adaptive, youtubeUrl) => {
  let background = page.querySelector(':scope > .lyrics-mv-background');
  if (!background) {
    background = el('div', 'lyrics-mv-background', { 'aria-hidden': 'true' });
    page.prepend(background);
  }
  refs.background = background;
  const scale = ((state.settings.immersiveBackgroundScalePercent ?? 115) / 100);
  const autoScale = state.settings.immersiveBackgroundAutoScale === false ? 1 : (() => {
    const bounds = state.immersiveBounds;
    const size = state.immersiveVideoSize;
    if (!bounds || !size || bounds.width <= 0 || bounds.height <= 0 || size.width <= 0 || size.height <= 0) return 1;
    const cover = Math.max(bounds.width / size.width, bounds.height / size.height);
    const contain = Math.min(bounds.width / size.width, bounds.height / size.height);
    if (!Number.isFinite(cover) || !Number.isFinite(contain) || contain <= 0) return 1;
    return clamp(cover / contain, 1, 3.5);
  })();
  background.style.setProperty('--mv-immersive-scale', (scale * autoScale).toFixed(2));
  background.style.setProperty('--mv-immersive-auto-scale', autoScale.toFixed(2));
  background.style.setProperty('--mv-immersive-position-x', `${state.settings.immersiveBackgroundOffsetXPercent ?? 50}%`);
  background.style.setProperty('--mv-immersive-position-y', `${state.settings.immersiveBackgroundOffsetYPercent ?? 50}%`);
  background.style.setProperty('--mv-immersive-blur', `${state.settings.immersiveBackgroundBlurPx ?? 0}px`);
  background.style.setProperty('--mv-immersive-brightness', `${state.settings.immersiveBackgroundBrightnessPercent ?? 100}%`);
  background.style.setProperty('--mv-immersive-overlay-opacity', ((state.settings.immersiveBackgroundOverlayOpacityPercent ?? 0) / 100).toFixed(2));
  background.dataset.autoScale = state.settings.immersiveBackgroundAutoScale === false ? 'false' : 'true';
  if (state.settings.lyricsReadabilityEnhanced === true) background.dataset.lyricsReadability = 'true';
  else delete background.dataset.lyricsReadability;
  if (youtubeUrl) background.dataset.provider = 'youtube';
  else delete background.dataset.provider;
  if (!background.dataset.echoMvDragBound) {
    background.dataset.echoMvDragBound = 'true';
    let drag = null;
    background.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      background.setPointerCapture(event.pointerId);
      drag = {
        startX: event.clientX,
        startY: event.clientY,
        offsetX: state.settings.immersiveBackgroundOffsetXPercent ?? 50,
        offsetY: state.settings.immersiveBackgroundOffsetYPercent ?? 50,
      };
      background.dataset.dragging = 'true';
    });
    background.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const rect = background.getBoundingClientRect();
      const nextX = clamp(Math.round(drag.offsetX + ((event.clientX - drag.startX) / Math.max(1, rect.width)) * 100), 0, 100);
      const nextY = clamp(Math.round(drag.offsetY + ((event.clientY - drag.startY) / Math.max(1, rect.height)) * 100), 0, 100);
      state.settings.immersiveBackgroundOffsetXPercent = nextX;
      state.settings.immersiveBackgroundOffsetYPercent = nextY;
      background.style.setProperty('--mv-immersive-position-x', `${nextX}%`);
      background.style.setProperty('--mv-immersive-position-y', `${nextY}%`);
    });
    const endDrag = (event, persist) => {
      if (!drag) return;
      const rect = background.getBoundingClientRect();
      const nextX = clamp(Math.round(drag.offsetX + ((event.clientX - drag.startX) / Math.max(1, rect.width)) * 100), 0, 100);
      const nextY = clamp(Math.round(drag.offsetY + ((event.clientY - drag.startY) / Math.max(1, rect.height)) * 100), 0, 100);
      drag = null;
      background.dataset.dragging = 'false';
      try { background.releasePointerCapture(event.pointerId); } catch {}
      if (persist) void patchSettings({ immersiveBackgroundOffsetXPercent: nextX, immersiveBackgroundOffsetYPercent: nextY });
    };
    background.addEventListener('pointerup', (event) => endDrag(event, true));
    background.addEventListener('pointercancel', (event) => endDrag(event, false));
    background.addEventListener('wheel', (event) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY < 0 ? 1 : -1;
      const next = clampScale((state.settings.immersiveBackgroundScalePercent ?? 115) + direction * SCALE_WHEEL_STEP);
      state.settings.immersiveBackgroundScalePercent = next;
      background.style.setProperty('--mv-immersive-scale', ((next / 100) * autoScale).toFixed(2));
      scalePending = next;
      window.clearTimeout(timers.scaleSave);
      timers.scaleSave = window.setTimeout(() => {
        timers.scaleSave = 0;
        if (scalePending !== null) void patchSettings({ immersiveBackgroundScalePercent: scalePending });
        scalePending = null;
      }, SCALE_SAVE_MS);
    }, { passive: false });
  }
  if (youtubeUrl) {
    lastBgKey = `yt:${youtubeUrl}`;
    background.replaceChildren(el('iframe', 'lyrics-mv-background-video lyrics-mv-background-video--youtube', {
      src: youtubeUrl,
      allow: 'autoplay; encrypted-media; picture-in-picture',
      referrerpolicy: 'strict-origin-when-cross-origin',
      tabindex: '-1',
      title: '',
    }));
    refs.backgroundVideo = null;
    return;
  }
  const key = `bg:${state.selectedVideo?.id || 'unknown'}:${mediaUrl || 'none'}`;
  let video = background.querySelector('video.lyrics-mv-background-video');
  if (!video || lastBgKey !== key) {
    releaseVideo(video);
    video = el('video', 'lyrics-mv-background-video', { loop: true });
    bindVideoEvents(video, 'background');
    background.replaceChildren(video);
    lastBgKey = key;
  }
  refs.backgroundVideo = video;
  if (!adaptive && video.getAttribute('src') !== mediaUrl) video.src = mediaUrl || '';
  video.muted = true;
  video.loop = true;
};

const removeBackground = (page) => {
  page?.querySelectorAll(':scope > .lyrics-mv-background').forEach((node) => {
    node.querySelectorAll('video').forEach(releaseVideo);
    node.remove();
  });
  refs.background = null;
  refs.backgroundVideo = null;
  lastBgKey = '';
};

const renderPanel = () => {
  const page = lyricsPageEl();
  if (!page) return;
  refs.lyricsPage = page;
  hideOfficialMvChrome(page);
  page.querySelectorAll(':scope > aside.echo-mv-panel, :scope > .lyrics-mv-unavailable-reason, :scope > .lyrics-mv-diagnostics-report, :scope > .lyrics-mv-settings-entry, :scope > section.lyrics-mv-panel[data-echo-mv-mod="true"]').forEach((node) => node.remove());
  refs.panel = null;
  const enabled = panelActive();
  applyPageFlags();
  if (!enabled) {
    removeBackground(page);
    releaseVideo(refs.foregroundVideo);
    lastPanelSignature = '';
    return;
  }
  const video = state.selectedVideo;
  const mediaUrl = video?.playableInApp && video.mediaUrl && !state.videoError ? video.mediaUrl : null;
  const yt = youtubeEmbedUrl(video, { autoplay: state.isAudioPlaying, controls: false });
  const ytBg = youtubeEmbedUrl(video, { autoplay: state.isAudioPlaying, controls: false, loop: true });
  const showVideo = Boolean(mediaUrl);
  const live = isEchoLive(video);
  const immersive = Boolean(!live && ((state.settings.immersiveBackground !== false && showVideo) || (yt && ytBg)));
  const signature = [enabled, mediaUrl || '', yt || '', immersive, video?.id || '', lyricsPageStyle(page)].join('\0');
  if (signature === lastPanelSignature) {
    if (immersive && (mediaUrl || ytBg)) ensureBackground(page, mediaUrl, isAdaptiveStream(video), yt ? ytBg : null);
    return;
  }
  lastPanelSignature = signature;
  if (immersive && (mediaUrl || ytBg)) ensureBackground(page, mediaUrl, isAdaptiveStream(video), yt ? ytBg : null);
  else removeBackground(page);
  refs.foregroundVideo = null;
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (immersive && refs.background && window.ResizeObserver) {
    const updateBounds = () => {
      const rect = refs.background.getBoundingClientRect();
      state.immersiveBounds = { width: Math.round(rect.width || window.innerWidth), height: Math.round(rect.height || window.innerHeight) };
    };
    updateBounds();
    resizeObserver = new ResizeObserver(updateBounds);
    resizeObserver.observe(refs.background);
  }
};

const replayCurrent = async () => {
  if (state.settings.replayAudioOnChange === false) return;
  const track = state.currentTrack;
  if (!track) return;
  try {
    const player = playerApi();
    if (player?.playTrack) await player.playTrack(track);
    else if (echoApi().playback?.play) await echoApi().playback.play();
  } catch {}
};

const runBusy = async (work) => {
  state.busy = true;
  state.error = null;
  state.networkError = null;
  state.networkNotice = null;
  scheduleRender();
  try {
    await work();
  } catch (error) {
    const message = summarizeActionError(error);
    state.error = message;
    toast(message);
  } finally {
    state.busy = false;
    scheduleRender();
  }
};

const bestAutoCandidate = (candidates) => {
  const threshold = state.settings.autoApplyThreshold ?? 0.7;
  return [...(candidates || [])]
    .filter((item) => Number(item.score) >= threshold)
    .sort((left, right) => (Number(right.score) || 0) - (Number(left.score) || 0))[0] || null;
};

const searchNetwork = () => runBusy(async () => {
  if (!state.trackId) throw new Error(t('mvSettings.error.noActiveTrackNetworkSearch'));
  const query = state.searchQuery;
  const track = state.currentTrack;
  const effectiveId = snapshotTrackIdFor(track, state.trackId);
  const autoSelect = state.settings.autoSearch !== false;
  const next = track && shouldUseSnapshotSearch(track, effectiveId)
    ? await mvApi.searchNetworkCandidatesForSnapshot(snapshotFromTrack(track, effectiveId, { query, title: state.title, artist: state.artist, coverUrl: state.coverUrl, autoSelect }))
    : await mvApi.searchNetworkCandidates(effectiveId, query);
  state.candidates = Array.isArray(next) ? next : [];
  state.networkNotice = state.candidates.length === 0 ? t('mvSettings.error.noNetworkCandidates') : null;
  let selected = await resolveNetworkVideo(await mvApi.getSelected(effectiveId));
  if (autoSelect && !isPlayableVideo(selected)) {
    const best = bestAutoCandidate(state.candidates);
    if (best?.id) {
      try {
        selected = await resolveNetworkVideo(await mvApi.selectVideo(effectiveId, best.id));
      } catch {}
    }
  }
  state.selectedVideo = selected;
  if (selected) notifyMvChanged(effectiveId);
});

const findLocal = () => runBusy(async () => {
  if (!state.trackId) throw new Error(t('mvSettings.error.noActiveTrackMatching'));
  const next = await mvApi.findLocalCandidates(state.trackId);
  state.candidates = Array.isArray(next) ? next : [];
  state.networkNotice = state.candidates.length === 0 ? t('mvSettings.error.noLocalCandidates') : null;
});

const chooseLocal = () => runBusy(async () => {
  if (!state.trackId) throw new Error(t('mvSettings.error.noActiveTrackBinding'));
  const video = await mvApi.chooseLocalVideo(state.trackId);
  if (video) {
    state.selectedVideo = video;
    state.candidates = [];
    notifyMvChanged(state.trackId);
    await replayCurrent();
  }
});

const bindCustom = () => runBusy(async () => {
  if (!state.trackId) throw new Error(t('mvSettings.error.noActiveTrackBinding'));
  const video = await mvApi.bindUrl(state.trackId, state.customUrl);
  state.selectedVideo = await resolveNetworkVideo(video);
  state.candidates = [];
  notifyMvChanged(state.trackId);
  await replayCurrent();
});

const selectCandidate = (candidateId) => runBusy(async () => {
  if (!state.trackId) throw new Error(t('mvSettings.error.noActiveTrackBinding'));
  state.busyCandidateId = candidateId;
  const effectiveId = snapshotTrackIdFor(state.currentTrack, state.trackId);
  const video = await mvApi.selectVideo(effectiveId, candidateId);
  state.selectedVideo = await resolveNetworkVideo(video);
  state.candidates = [];
  state.busyCandidateId = null;
  notifyMvChanged(effectiveId);
  await replayCurrent();
});

const clearSelected = () => runBusy(async () => {
  if (!state.trackId) return;
  await mvApi.clearSelected(state.trackId);
  state.selectedVideo = null;
  notifyMvChanged(state.trackId);
});

const openExternal = async () => {
  if (!state.selectedVideo) return;
  try { await mvApi.openExternal(state.selectedVideo.id); }
  catch (error) { state.error = summarizeActionError(error); toast(state.error); scheduleRender(); }
};

const changeOffset = async (nextOffsetMs) => {
  if (!state.trackId || !state.selectedVideo) return;
  const clamped = clampOffset(nextOffsetMs);
  state.selectedVideo = { ...state.selectedVideo, offsetMs: clamped };
  state.offsetSaving = true;
  scheduleRender();
  try {
    const next = await mvApi.setOffset(state.trackId, clamped);
    if (next) state.selectedVideo = await resolveNetworkVideo(next);
    notifyMvChanged(state.trackId);
    syncVideos({ force: true, bypassCooldown: true });
  } catch (error) {
    state.error = summarizeActionError(error);
  } finally {
    state.offsetSaving = false;
    scheduleRender();
  }
};

const switchRow = (pressed, title, description, onClick, extraClass = 'mv-auto-apply-toggle') => btn(`mv-source-toggle ${extraClass}`, { 'aria-pressed': pressed, onclick: onClick }, [
  el('span', 'mv-switch-track', { 'aria-hidden': 'true' }, [el('span')]),
  el('span', 'mv-toggle-copy', null, [el('strong', '', null, title), el('em', '', null, description)]),
]);

const sliderRow = (title, hint, attrs, display) => {
  const label = el('label', 'mv-threshold-control');
  label.append(
    el('span', 'mv-threshold-copy', null, [el('strong', '', null, title), el('em', '', null, hint)]),
    el('span', 'mv-threshold-slider', null, [
      el('input', '', { type: 'range', ...attrs }),
      el('strong', '', null, display),
    ]),
  );
  return label;
};

const renderOffset = () => {
  if (!state.trackId || !state.selectedVideo) return null;
  const offset = clampOffset(state.selectedVideo.offsetMs || 0);
  const step = state.offsetStep;
  const section = el('section', 'mv-drawer-offset', { 'aria-label': t('mvSettings.offset.aria') });
  const startCard = el('div', 'mv-offset-start-card');
  const startInput = el('input', '', {
    type: 'number',
    min: '0',
    max: String(MV_OFFSET_MAX / 1000),
    step: '0.1',
    value: formatSecondsInput(Math.max(0, offset) / 1000),
    'aria-label': t('mvSettings.offset.startInput'),
    disabled: Boolean(state.error && isMvDatabaseError(state.error)),
  });
  startInput.addEventListener('change', () => {
    const next = Number(startInput.value);
    if (Number.isFinite(next)) void changeOffset(Math.max(0, next) * 1000);
  });
  startCard.append(
    el('span', '', null, [el('strong', '', null, t('mvSettings.offset.startTitle')), el('em', '', null, t('mvSettings.offset.startDescription'))]),
    el('label', '', null, [startInput, el('em', '', null, 's')]),
    btn('mv-offset-replay-button', {
      'aria-label': t('mvSettings.offset.replayTitle'),
      title: t('mvSettings.offset.replayTitle'),
      disabled: state.busy || !state.currentTrack,
      onclick: () => { notifyMvChanged(state.trackId); void replayCurrent(); },
    }, [svgIcon('play', 14), el('span', '', null, t('mvSettings.offset.replay'))]),
  );
  const collapse = btn('mv-offset-collapse-toggle', {
    'aria-expanded': state.offsetOpen,
    onclick: () => { state.offsetOpen = !state.offsetOpen; scheduleRender(); },
  }, [
    el('span', '', null, [state.offsetOpen ? svgIcon('chevronDown', 14) : svgIcon('chevronRight', 14), t('mvSettings.offset.title')]),
    el('strong', '', null, formatOffset(offset)),
  ]);
  section.append(startCard, collapse);
  if (state.offsetOpen) {
    const advanced = el('div', 'mv-offset-advanced');
    const slider = el('input', '', {
      type: 'range',
      min: String(MV_OFFSET_MIN),
      max: String(MV_OFFSET_MAX),
      step: String(MV_OFFSET_STEP),
      value: String(offset),
      'aria-label': t('mvSettings.offset.slider'),
    });
    slider.addEventListener('change', () => void changeOffset(Number(slider.value)));
    const number = el('input', '', {
      type: 'number',
      min: String(MV_OFFSET_MIN / 1000),
      max: String(MV_OFFSET_MAX / 1000),
      step: '0.1',
      value: String(offset / 1000),
      'aria-label': t('mvSettings.offset.input'),
    });
    number.addEventListener('change', () => void changeOffset(Number(number.value) * 1000));
    const steps = el('div', 'mv-offset-step-row', { role: 'group', 'aria-label': t('mvSettings.offset.step') });
    steps.append(el('span', '', null, t('mvSettings.offset.step')));
    OFFSET_STEP_OPTIONS.forEach((item) => {
      steps.append(btn('', {
        'aria-pressed': state.offsetStep === item,
        onclick: () => { state.offsetStep = item; scheduleRender(); },
      }, formatOffsetMagnitude(item)));
    });
    const later = clampOffset(offset - step);
    const earlier = clampOffset(offset + step);
    const actions = el('div', 'mv-offset-actions');
    actions.append(
      btn('', { disabled: state.offsetSaving || later === offset, title: t('mvSettings.offset.later', { value: formatOffsetMagnitude(step) }), onclick: () => void changeOffset(later) }, [svgIcon('rewind', 15), el('span', '', null, t('mvSettings.offset.laterShort', { value: formatOffsetMagnitude(step) }))]),
      btn('', { disabled: state.offsetSaving || earlier === offset, title: t('mvSettings.offset.earlier', { value: formatOffsetMagnitude(step) }), onclick: () => void changeOffset(earlier) }, [svgIcon('fastForward', 15), el('span', '', null, t('mvSettings.offset.earlierShort', { value: formatOffsetMagnitude(step) }))]),
      btn('', { disabled: state.offsetSaving || offset === 0, title: t('mvSettings.offset.reset'), onclick: () => void changeOffset(0) }, [svgIcon('rotate', 14), el('span', '', null, t('mvSettings.offset.resetShort'))]),
    );
    advanced.append(
      el('p', '', null, t('mvSettings.offset.description')),
      el('div', 'mv-offset-slider-row', null, [el('span', '', null, formatOffset(MV_OFFSET_MIN)), slider, el('span', '', null, formatOffset(MV_OFFSET_MAX))]),
      el('label', 'mv-offset-number', null, [el('span', '', null, t('mvSettings.offset.input')), number, el('em', '', null, 's')]),
      steps,
      actions,
    );
    section.append(advanced);
  }
  return section;
};

const setSelectedQuality = (qualityId) => {
  const selected = state.selectedVideo;
  if (!selected) return;
  void (async () => {
    try {
      const next = await mvApi.setQuality(selected.id, qualityId);
      state.selectedVideo = next;
      notifyMvChanged(state.trackId);
      scheduleRender();
    } catch (error) {
      toast(summarizeActionError(error));
    }
  })();
};

const renderQualityChips = () => {
  const settings = state.settings;
  const selected = state.selectedVideo;
  const row = el('div', 'echo-mv-quality', { role: 'group', 'aria-label': t('mvSettings.aria.maxQualityOptions') });
  QUALITY_CAPS.forEach((qualityId) => {
    row.append(btn('echo-mv-quality-item', {
      'aria-pressed': settings.maxQuality === qualityId,
      dataset: { active: settings.maxQuality === qualityId },
      onclick: () => { state.maxQualityOpen = false; void patchSettings({ maxQuality: qualityId }); },
    }, [
      el('strong', '', null, qualityCapLabel(qualityId)),
      el('small', '', null, t('mvSettings.network.maxQuality')),
    ]));
  });
  row.append(btn('echo-mv-quality-item', {
    'aria-pressed': settings.allow60fps !== false,
    dataset: { active: settings.allow60fps !== false },
    onclick: () => void patchSettings({ allow60fps: settings.allow60fps === false }),
  }, [el('strong', '', null, '60fps'), el('small', '', null, t('mvSettings.network.allow60fps'))]));
  if (state.variants.length && selected) {
    state.variants.forEach((variant) => {
      row.append(btn('echo-mv-quality-item', {
        'aria-pressed': variant.id === selected.selectedQualityId,
        dataset: { active: variant.id === selected.selectedQualityId },
        onclick: () => setSelectedQuality(variant.id),
      }, [
        el('strong', '', null, variant.label || variant.id),
        el('small', '', null, t('mvSettings.engine.quality')),
      ]));
    });
  }
  return row;
};

const sheetSignature = () => {
  const selected = state.selectedVideo;
  const settings = state.settings;
  return [
    state.drawerRender,
    state.drawerMotion,
    state.sheetCollapsed,
    localeId,
    state.busy,
    state.busyCandidateId,
    state.trackId,
    state.title,
    state.artist,
    state.searchQuery,
    state.useCurrentSong,
    state.customUrl,
    state.networkOpen,
    state.maxQualityOpen,
    state.offsetOpen,
    state.offsetStep,
    state.offsetSaving,
    state.immersiveOpen,
    state.error,
    state.networkNotice,
    state.networkError,
    state.diagnosticsEnabled,
    state.draggedProvider,
    state.dragOverProvider,
    state.isLoading,
    settings.enabled,
    settings.maxQuality,
    settings.allow60fps,
    settings.autoSearch,
    settings.autoPreload,
    settings.autoApplyThreshold,
    settings.titleOnlySearch,
    settings.preferHighestViewCount,
    settings.restartAudioOnLoad,
    settings.syncMode,
    settings.replayAudioOnChange,
    settings.immersiveBackground,
    settings.hideLyrics,
    settings.lyricsReadabilityEnhanced,
    settings.immersiveBackgroundAutoScale,
    settings.immersiveBackgroundScalePercent,
    settings.immersiveBackgroundOffsetXPercent,
    settings.immersiveBackgroundOffsetYPercent,
    settings.immersiveBackgroundBlurPx,
    settings.immersiveBackgroundBrightnessPercent,
    settings.immersiveBackgroundOverlayOpacityPercent,
    (settings.enabledProviders || []).join(','),
    (settings.providerOrder || []).join(','),
    selected?.id,
    selected?.offsetMs,
    selected?.qualityLabel,
    selected?.selectedQualityId,
    selected?.mediaUrl,
    selected?.title,
    state.candidates.map((item) => item.id).join(','),
    state.variants.map((item) => item.id).join(','),
  ].join('\0');
};

const sheetIsBusy = (root) => Boolean(root?.querySelector(':active'));
const sheetFocusKey = (node) => [node?.tagName, node?.type, node?.getAttribute?.('aria-label'), node?.className].filter(Boolean).join('|');

const renderDrawer = () => {
  if (!state.drawerRender) {
    refs.drawerRoot?.remove();
    refs.drawerRoot = null;
    lastDrawerSignature = '';
    pendingDrawerRender = false;
    return;
  }
  const settings = state.settings;
  const enabled = settings.enabled !== false;
  const selected = state.selectedVideo;
  const collapsed = state.sheetCollapsed;
  const signature = sheetSignature();
  const root = refs.drawerRoot && refs.drawerRoot.isConnected
    ? refs.drawerRoot
    : el('div', 'echo-mv-root no-drag', { role: 'presentation' });
  refs.drawerRoot = root;
  root.dataset.open = state.drawerMotion ? 'true' : 'false';
  root.dataset.collapsed = collapsed ? 'true' : 'false';
  if (signature === lastDrawerSignature && root.isConnected && root.querySelector('.echo-mv-sheet')) return;
  if (sheetIsBusy(root) && root.querySelector('.echo-mv-sheet')) {
    pendingDrawerRender = true;
    return;
  }
  lastDrawerSignature = signature;
  pendingDrawerRender = false;
  const activeTitle = state.currentTrack ? `${state.currentTrack.title} - ${state.currentTrack.artist || state.currentTrack.albumArtist || ''}` : (state.trackId || t('mvSettings.status.noActiveTrack'));
  const reason = unavailableReason();
  const scrim = btn('echo-mv-scrim', { 'aria-label': t('mvSettings.action.close'), onclick: onSheetScrimClick });
  const sheet = el('aside', 'echo-mv-sheet', { 'aria-label': t('mvSettings.aria.drawer') });
  const enable = el('label', 'echo-mv-enable');
  const enableInput = el('input', '', { type: 'checkbox', checked: enabled });
  enableInput.addEventListener('change', () => void patchSettings({ enabled: enableInput.checked }));
  enable.append(enableInput, el('span', '', null, t('mvSettings.general.enabled')));
  const bar = el('div', 'echo-mv-sheet-bar');
  bar.append(
    el('strong', '', null, t('mvPanel.title')),
    el('div', 'echo-mv-sheet-actions', null, [
      enable,
      btn('echo-mv-icon-btn', {
        'aria-label': collapsed ? t('mvPanel.action.expand') : t('mvPanel.action.hide'),
        title: collapsed ? t('mvPanel.action.expand') : t('mvPanel.action.hide'),
        onclick: () => { state.sheetCollapsed = !state.sheetCollapsed; scheduleRender(); },
      }, [svgIcon(collapsed ? 'chevronDown' : 'minus', 16)]),
      btn('echo-mv-icon-btn', {
        'aria-label': t('mvPanel.action.close'),
        title: t('mvSettings.action.close'),
        onclick: () => openDrawer(false),
      }, [svgIcon('x', 16)]),
    ]),
  );
  const status = el('p', 'echo-mv-status', { 'aria-live': 'polite' }, reason || selected?.title || (state.isLoading ? t('mvPanel.status.loading') : t('mvSettings.engine.title')));
  const current = el('div', 'echo-mv-current');
  current.append(
    el('span', '', null, [el('small', '', null, t('mvSettings.engine.title')), el('strong', '', null, activeTitle)]),
    el('span', '', null, [el('small', '', null, t('mvSettings.engine.mvTitle')), el('strong', '', null, formatVideoTitle(selected, t('mvSettings.status.none')))]),
    el('span', '', null, [el('small', '', null, t('mvSettings.engine.quality')), el('strong', '', null, formatVideoQuality(selected, t('mvSettings.status.none')))]),
  );
  const body = el('div', 'echo-mv-sheet-body');
  const binding = el('section', 'echo-mv-section');
  binding.append(
    el('div', 'echo-mv-section-title', null, [svgIcon('database', 17), el('h3', '', null, t('mvSettings.binding.title'))]),
    el('div', 'mv-settings-actions', null, [
      btn('', { disabled: state.busy || !enabled, onclick: () => void searchNetwork() }, [svgIcon('globe', 15), t('mvSettings.action.searchNetwork')]),
      btn('', { disabled: state.busy, onclick: () => void findLocal() }, [svgIcon('search', 15), t('mvSettings.action.findLocal')]),
      btn('', { disabled: state.busy, onclick: () => void chooseLocal() }, [svgIcon('folder', 15), t('mvSettings.action.chooseFile')]),
      btn('', { disabled: state.busy, onclick: () => void loadSelected({ preserveCurrent: true }) }, [svgIcon('rotate', 15), t('mvSettings.action.refresh')]),
    ]),
  );
  if (selected) {
    const card = el('div', 'mv-selected-card');
    card.append(
      el('span', '', null, [
        el('strong', '', null, selected.title || t('mvSettings.binding.selectedMv')),
        el('em', '', null, `${providerLabel(selected.provider)}${formatVideoQuality(selected, '') ? ` / ${formatVideoQuality(selected, '')}` : ''}`),
      ]),
      el('div', '', null, [
        (!selected.playableInApp || selected.provider !== 'local') ? btn('', { 'aria-label': t('mvSettings.action.openExternal'), title: t('mvSettings.action.openExternal'), onclick: () => void openExternal() }, [svgIcon('external', 15)]) : null,
        btn('', { 'aria-label': t('mvSettings.action.removeSelected'), title: t('mvSettings.action.removeSelected'), onclick: () => void clearSelected() }, [svgIcon('x', 15)]),
      ]),
    );
    binding.append(card);
  }
  const offset = renderOffset();
  if (offset) binding.append(offset);
  const custom = el('form', 'mv-custom-card');
  custom.addEventListener('submit', (event) => { event.preventDefault(); void bindCustom(); });
  const customInput = el('input', '', {
    value: state.customUrl,
    'aria-label': t('mvSettings.custom.input'),
    placeholder: t('mvSettings.custom.placeholder'),
  });
  customInput.addEventListener('input', () => { state.customUrl = customInput.value; });
  custom.append(
    el('div', 'mv-custom-heading', null, [
      el('span', '', null, [svgIcon('link', 15), el('strong', '', null, t('mvSettings.custom.title'))]),
      el('em', '', null, t('mvSettings.custom.description')),
    ]),
    el('div', 'mv-custom-controls', null, [
      el('label', 'mv-custom-input', null, [customInput]),
      btn('', { type: 'submit', 'aria-label': t('mvSettings.custom.apply'), title: t('mvSettings.custom.apply'), disabled: state.busy || !state.customUrl.trim() }, [svgIcon('play', 17)]),
    ]),
  );
  if (selected?.providerUrl) {
    const link = el('a', '', { href: selected.providerUrl, target: '_blank', rel: 'noreferrer' }, [
      t('mvSettings.custom.playing', { provider: providerLabel(selected.provider), sourceId: selected.sourceId || selected.id }),
      svgIcon('external', 12),
    ]);
    link.addEventListener('click', (event) => { event.preventDefault(); void openExternal(); });
    custom.append(el('div', 'mv-custom-status', null, [
      link,
      el('span', '', null, t('mvSettings.custom.videoTitle', { title: selected.title || t('mvSettings.binding.selectedMv') })),
      el('span', 'mv-custom-badges', null, [
        el('em', '', null, selected.playableInApp ? t('mvSettings.custom.directDash') : t('mvSettings.candidate.external')),
        el('strong', '', null, formatVideoQuality(selected, t('mvSettings.status.none'))),
      ]),
    ]));
  }
  binding.append(custom);
  const search = el('form', 'mv-search-controls');
  search.addEventListener('submit', (event) => { event.preventDefault(); void searchNetwork(); });
  const searchInput = el('input', '', {
    value: state.searchQuery,
    'aria-label': t('mvSettings.search.input'),
    placeholder: t('mvSettings.search.placeholder'),
  });
  searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value;
    if (state.useCurrentSong) state.useCurrentSong = false;
  });
  search.append(
    el('label', 'mv-search-input', null, [svgIcon('search', 15), searchInput]),
    btn('', { type: 'submit', disabled: state.busy || !enabled || !state.searchQuery.trim() }, [svgIcon('search', 15), t('mvSettings.action.searchNetwork')]),
    switchRow(state.useCurrentSong, t('mvSettings.search.useCurrentSong'), state.useCurrentSong ? t('mvSettings.status.on') : t('mvSettings.status.off'), () => {
      state.useCurrentSong = !state.useCurrentSong;
      if (state.useCurrentSong) state.searchQuery = [state.title, state.artist].filter(Boolean).join(' ');
      scheduleRender();
    }, 'mv-current-song-toggle'),
  );
  binding.append(search);
  if (state.candidates.length) {
    const list = el('div', 'echo-mv-candidate-list', { 'aria-label': t('mvSettings.aria.candidates') });
    state.candidates.forEach((candidate) => {
      const item = btn('echo-mv-candidate', {
        disabled: state.busy || state.busyCandidateId !== null,
        title: candidate.title,
        onclick: () => void selectCandidate(candidate.id),
      });
      const thumb = el('span', 'echo-mv-candidate-thumb');
      if (candidate.thumbnailUrl && !state.failedThumbs.has(candidate.id)) {
        const img = el('img', '', { alt: candidate.title, draggable: 'false', referrerpolicy: 'no-referrer', src: candidate.thumbnailUrl });
        img.addEventListener('error', () => { state.failedThumbs.add(candidate.id); scheduleRender(); });
        thumb.append(img);
      } else {
        thumb.append(el('span', 'echo-mv-candidate-thumb-fallback', { 'aria-label': candidate.title }, [svgIcon('fileVideo', 15)]));
      }
      const badges = el('span', 'echo-mv-candidate-badges');
      badges.append(
        el('small', '', null, providerLabel(candidate.provider)),
        el('small', '', null, formatScore(candidate.score)),
        formatDuration(candidate.durationSeconds) ? el('small', '', null, formatDuration(candidate.durationSeconds)) : null,
        el('small', '', null, candidate.playableInApp ? t('mvSettings.candidate.inApp') : t('mvSettings.candidate.external')),
      );
      item.append(
        thumb,
        el('span', 'echo-mv-candidate-copy', null, [
          el('strong', '', null, candidate.title),
          el('em', '', null, candidate.uploader || (candidate.reasons || []).slice(0, 3).join(' / ') || providerLabel(candidate.provider)),
        ]),
        badges,
      );
      list.append(item);
    });
    binding.append(list);
  } else if (state.networkNotice) {
    binding.append(el('p', 'mv-settings-search-empty', { role: 'status' }, state.networkNotice));
  } else if (state.networkError) {
    binding.append(el('p', 'mv-settings-search-error', { role: 'alert' }, state.networkError));
  }

  const network = el('section', `echo-mv-section mv-network-section${state.networkOpen ? ' mv-network-section--open' : ''}${state.maxQualityOpen ? ' mv-section-menu-open' : ''}`);
  network.append(el('div', 'echo-mv-section-title', null, [
    el('span', '', null, [svgIcon('globe', 17), el('h3', '', null, t('mvSettings.network.title'))]),
    btn('mv-section-collapse', {
      'aria-expanded': state.networkOpen,
      'aria-label': state.networkOpen ? t('mvSettings.action.collapseNetwork') : t('mvSettings.action.expandNetwork'),
      title: state.networkOpen ? t('mvSettings.action.collapseNetwork') : t('mvSettings.action.expandNetwork'),
      onclick: () => { state.networkOpen = !state.networkOpen; scheduleRender(); },
    }, [svgIcon('chevronDown', 16)]),
  ]));
  if (state.networkOpen) {
    const enabledProviders = new Set(settings.enabledProviders || []);
    network.append(
      switchRow(settings.autoSearch, t('mvSettings.network.autoApply'), settings.autoSearch ? t('mvSettings.status.on') : t('mvSettings.status.off'), () => {
        void (async () => {
          await patchSettings({ autoSearch: !settings.autoSearch });
          if (state.settings.autoSearch) void searchNetwork();
        })();
      }),
      sliderRow(t('mvSettings.network.autoApplyThreshold'), t('mvSettings.network.autoApplyThresholdDescription', { threshold: formatThreshold(settings.autoApplyThreshold) }), {
        min: '30', max: '100', step: '1', value: String(Math.round((settings.autoApplyThreshold ?? 0.7) * 100)),
        'aria-label': t('mvSettings.network.autoApplyThreshold'),
        onchange: (event) => void patchSettings({ autoApplyThreshold: thresholdFromPercent(event.currentTarget.value) }),
      }, formatThreshold(settings.autoApplyThreshold)),
      switchRow(settings.autoPreload, t('mvSettings.network.autoPreload'), t('mvSettings.network.autoPreloadDescription'), () => void patchSettings({ autoPreload: !settings.autoPreload })),
      switchRow(settings.titleOnlySearch !== false, t('mvSettings.network.titleOnlySearch'), t('mvSettings.network.titleOnlySearchDescription'), () => void patchSettings({ titleOnlySearch: settings.titleOnlySearch === false })),
      switchRow(state.diagnosticsEnabled, t('mvSettings.network.diagnosticsReport'), t('mvSettings.network.diagnosticsReportDescription'), () => {
        state.diagnosticsEnabled = !state.diagnosticsEnabled;
        writeDiagnostics(state.diagnosticsEnabled);
        scheduleRender();
      }),
      switchRow(settings.preferHighestViewCount !== false, t('mvSettings.network.preferHighestViewCount'), t('mvSettings.network.preferHighestViewCountDescription'), () => void patchSettings({ preferHighestViewCount: !(settings.preferHighestViewCount !== false) })),
      switchRow(settings.restartAudioOnLoad, t('mvSettings.network.restartAudioOnLoad'), t('mvSettings.network.restartAudioOnLoadDescription'), () => void patchSettings({ restartAudioOnLoad: !settings.restartAudioOnLoad })),
    );
    if (settings.restartAudioOnLoad) {
      const modes = el('div', 'mv-sync-mode-control');
      const group = el('div', 'mv-sync-mode-buttons', { role: 'group', 'aria-label': t('mvSettings.network.syncMode') });
      SYNC_MODES.forEach((mode) => {
        group.append(btn('', {
          'aria-pressed': (settings.syncMode || 'balanced') === mode,
          onclick: () => void patchSettings({ syncMode: mode }),
        }, t(`mvSettings.network.syncMode.${mode}`)));
      });
      modes.append(el('span', 'mv-threshold-copy', null, [el('strong', '', null, t('mvSettings.network.syncMode')), el('em', '', null, t('mvSettings.network.syncModeDescription'))]), group);
      network.append(modes);
    }
    network.append(
      switchRow(settings.replayAudioOnChange !== false, t('mvSettings.network.replayAudioOnChange'), t('mvSettings.network.replayAudioOnChangeDescription'), () => void patchSettings({ replayAudioOnChange: settings.replayAudioOnChange === false })),
      switchRow(settings.immersiveBackground !== false, t('mvSettings.immersive.title'), t('mvSettings.immersive.description'), () => void patchSettings({ immersiveBackground: settings.immersiveBackground === false })),
      switchRow(settings.hideLyrics === true, t('mvSettings.immersive.hideLyrics'), t('mvSettings.immersive.hideLyricsDescription'), () => void patchSettings({ hideLyrics: !settings.hideLyrics })),
      switchRow(settings.lyricsReadabilityEnhanced === true, t('mvSettings.immersive.lyricsReadability'), t('mvSettings.immersive.lyricsReadabilityDescription'), () => void patchSettings({ lyricsReadabilityEnhanced: !settings.lyricsReadabilityEnhanced })),
    );
    if (settings.immersiveBackground !== false) {
      const immersive = el('div', `mv-immersive-controls${state.immersiveOpen ? ' mv-immersive-controls--open' : ''}`);
      immersive.append(btn('mv-immersive-collapse', {
        'aria-expanded': state.immersiveOpen,
        onclick: () => {
          state.immersiveOpen = !state.immersiveOpen;
          writeImmersiveOpen(state.immersiveOpen);
          scheduleRender();
        },
      }, [
        el('span', '', null, [svgIcon('monitorPlay', 15), el('strong', '', null, t('mvSettings.immersive.tuning')), el('em', '', null, t('mvSettings.immersive.visualHint'))]),
        svgIcon('chevronDown', 16),
      ]));
      if (state.immersiveOpen) {
        const body = el('div', 'mv-immersive-controls-body');
        body.append(
          btn('mv-immersive-reset', { onclick: () => void patchSettings(immersiveDefaults) }, [svgIcon('rotate', 15), t('mvSettings.immersive.reset')]),
          switchRow(settings.immersiveBackgroundAutoScale !== false, t('mvSettings.immersive.autoScale'), t('mvSettings.immersive.autoScaleDescription'), () => void patchSettings({ immersiveBackgroundAutoScale: settings.immersiveBackgroundAutoScale === false })),
          sliderRow(t('mvSettings.immersive.zoom'), `${settings.immersiveBackgroundScalePercent ?? 115}%`, {
            min: '70', max: '220', step: '1', value: String(settings.immersiveBackgroundScalePercent ?? 115),
            'aria-label': t('mvSettings.immersive.zoom'),
            onchange: (event) => void patchSettings({ immersiveBackgroundScalePercent: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundScalePercent ?? 115}%`),
          sliderRow(t('mvSettings.immersive.positionX'), t('mvSettings.immersive.dragHint'), {
            min: '0', max: '100', step: '1', value: String(settings.immersiveBackgroundOffsetXPercent ?? 50),
            'aria-label': t('mvSettings.immersive.positionX'),
            onchange: (event) => void patchSettings({ immersiveBackgroundOffsetXPercent: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundOffsetXPercent ?? 50}%`),
          sliderRow(t('mvSettings.immersive.positionY'), t('mvSettings.immersive.dragHint'), {
            min: '0', max: '100', step: '1', value: String(settings.immersiveBackgroundOffsetYPercent ?? 50),
            'aria-label': t('mvSettings.immersive.positionY'),
            onchange: (event) => void patchSettings({ immersiveBackgroundOffsetYPercent: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundOffsetYPercent ?? 50}%`),
          sliderRow(t('mvSettings.immersive.blur'), t('mvSettings.immersive.visualHint'), {
            min: '0', max: '32', step: '1', value: String(settings.immersiveBackgroundBlurPx ?? 0),
            'aria-label': t('mvSettings.immersive.blur'),
            onchange: (event) => void patchSettings({ immersiveBackgroundBlurPx: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundBlurPx ?? 0}px`),
          sliderRow(t('mvSettings.immersive.brightness'), t('mvSettings.immersive.visualHint'), {
            min: '60', max: '140', step: '1', value: String(settings.immersiveBackgroundBrightnessPercent ?? 100),
            'aria-label': t('mvSettings.immersive.brightness'),
            onchange: (event) => void patchSettings({ immersiveBackgroundBrightnessPercent: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundBrightnessPercent ?? 100}%`),
          sliderRow(t('mvSettings.immersive.overlay'), t('mvSettings.immersive.overlayHint'), {
            min: '0', max: '100', step: '1', value: String(settings.immersiveBackgroundOverlayOpacityPercent ?? 0),
            'aria-label': t('mvSettings.immersive.overlay'),
            onchange: (event) => void patchSettings({ immersiveBackgroundOverlayOpacityPercent: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundOverlayOpacityPercent ?? 0}%`),
        );
        immersive.append(body);
      }
      network.append(immersive);
    }
    const quality = el('div', 'mv-quality-controls');
    const menu = el('div', 'mv-quality-menu');
    menu.append(el('span', 'mv-field-label', null, t('mvSettings.network.maxQuality')));
    menu.append(btn('mv-quality-trigger', {
      'aria-expanded': state.maxQualityOpen,
      'aria-label': t('mvSettings.aria.maxQuality', { quality: qualityCapLabel(settings.maxQuality) }),
      onclick: () => { state.maxQualityOpen = !state.maxQualityOpen; scheduleRender(); },
    }, [el('span', '', null, qualityCapLabel(settings.maxQuality)), svgIcon('chevronDown', 15)]));
    if (state.maxQualityOpen) {
      const pop = el('div', 'mv-quality-popover', { role: 'menu', 'aria-label': t('mvSettings.aria.maxQualityOptions') });
      QUALITY_CAPS.forEach((qualityId) => {
        pop.append(btn('', {
          role: 'menuitem',
          dataset: { selected: settings.maxQuality === qualityId },
          onclick: () => { state.maxQualityOpen = false; void patchSettings({ maxQuality: qualityId }); },
        }, [el('span', '', null, qualityCapLabel(qualityId)), settings.maxQuality === qualityId ? svgIcon('check', 13) : null]));
      });
      menu.append(pop);
    }
    quality.append(menu);
    network.append(quality);
    network.append(switchRow(settings.allow60fps !== false, t('mvSettings.network.allow60fps'), t('mvSettings.network.allow60fpsDescription'), () => void patchSettings({ allow60fps: settings.allow60fps === false })));
    if (state.variants.length && selected) {
      const selectedMenu = el('div', 'mv-quality-menu');
      selectedMenu.append(el('span', 'mv-field-label', null, t('mvSettings.aria.selectedQuality', { quality: selected.qualityLabel || formatVideoQuality(selected, t('mvSettings.status.none')) })));
      const select = el('select', 'mv-quality-trigger');
      state.variants.forEach((variant) => {
        const option = el('option', '', { value: variant.id }, variant.label || variant.id);
        if (variant.id === selected.selectedQualityId) option.selected = true;
        select.append(option);
      });
      select.addEventListener('change', () => {
        void (async () => {
          try {
            const next = await mvApi.setQuality(selected.id, select.value);
            state.selectedVideo = next;
            notifyMvChanged(state.trackId);
            scheduleRender();
          } catch (error) {
            toast(summarizeActionError(error));
          }
        })();
      });
      selectedMenu.append(select);
      network.append(selectedMenu);
    }
    const sources = el('div', 'mv-source-list', { role: 'list', 'aria-label': t('mvSettings.aria.networkSources') });
    (settings.providerOrder || NETWORK_PROVIDERS).forEach((provider, index) => {
      const row = el('div', 'mv-source-row', {
        role: 'listitem',
        dataset: {
          dragging: state.draggedProvider === provider,
          dropTarget: state.draggedProvider && state.draggedProvider !== provider && state.dragOverProvider === provider,
        },
      });
      row.addEventListener('dragover', (event) => {
        if (!state.draggedProvider || state.draggedProvider === provider) return;
        event.preventDefault();
        state.dragOverProvider = provider;
        scheduleRender();
      });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const from = state.draggedProvider || event.dataTransfer.getData('text/plain');
        state.draggedProvider = null;
        state.dragOverProvider = null;
        const order = [...(state.settings.providerOrder || NETWORK_PROVIDERS)];
        const fromIndex = order.indexOf(from);
        const toIndex = order.indexOf(provider);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
        const [item] = order.splice(fromIndex, 1);
        order.splice(toIndex, 0, item);
        void patchSettings({ providerOrder: order });
      });
      const handle = el('span', 'mv-source-drag-handle', {
        draggable: true,
        role: 'button',
        tabindex: '0',
        'aria-label': t('mvSettings.action.dragSource', { provider: providerLabel(provider) }),
        title: t('mvSettings.action.dragReorder'),
      }, [svgIcon('grip', 16), el('small', '', null, String(index + 1))]);
      handle.addEventListener('dragstart', (event) => {
        state.draggedProvider = provider;
        state.dragOverProvider = provider;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', provider);
      });
      handle.addEventListener('dragend', () => { state.draggedProvider = null; state.dragOverProvider = null; scheduleRender(); });
      row.append(
        handle,
        btn('mv-source-toggle', { 'aria-pressed': enabledProviders.has(provider), onclick: () => {
          const next = enabledProviders.has(provider)
            ? (settings.enabledProviders || []).filter((item) => item !== provider)
            : [...(settings.enabledProviders || []), provider];
          void patchSettings({ enabledProviders: next });
        } }, [
          el('span', 'mv-switch-track', { 'aria-hidden': 'true' }, [el('span')]),
          providerLabel(provider),
        ]),
      );
      sources.append(row);
    });
    network.append(sources);
  }
  body.append(binding, network);
  if (state.error && state.error !== state.networkError) body.append(el('p', 'echo-mv-error', null, state.error));
  sheet.append(bar);
  if (!collapsed) sheet.append(status, current, renderQualityChips(), body);
  const active = document.activeElement;
  const restore = root.contains(active) ? {
    key: sheetFocusKey(active),
    value: active.value,
    start: active.selectionStart,
    end: active.selectionEnd,
  } : null;
  root.replaceChildren(scrim, sheet);
  if (!root.isConnected) document.body.append(root);
  if (restore?.key) {
    const next = [...root.querySelectorAll('input, textarea, button, select')].find((node) => sheetFocusKey(node) === restore.key);
    if (next) {
      next.focus();
      if (restore.value != null && 'value' in next) {
        try {
          next.value = restore.value;
          if (typeof restore.start === 'number') next.setSelectionRange(restore.start, restore.end ?? restore.start);
        } catch {}
      }
    }
  }
};

const scheduleRender = () => {
  if (disposed) return;
  if (timers.render) return;
  timers.render = window.requestAnimationFrame(() => {
    timers.render = 0;
    if (disposed) return;
    applyPageFlags();
    if (isLyricsPageVisible()) renderPanel();
    renderDrawer();
    if (pendingDrawerRender && !sheetIsBusy(refs.drawerRoot)) {
      pendingDrawerRender = false;
      lastDrawerSignature = '';
      renderDrawer();
    }
  });
};

const onSheetScrimClick = (event) => {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (performance.now() < state.sheetIgnoreCloseUntil) return;
  openDrawer(false);
};

const openDrawer = (open) => {
  if (state.drawerOpen === open && state.drawerRender === open) return;
  state.drawerOpen = open;
  window.clearTimeout(timers.drawerExit);
  if (open) {
    state.sheetIgnoreCloseUntil = performance.now() + 360;
    state.sheetCollapsed = false;
    state.drawerRender = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        state.drawerMotion = true;
        scheduleRender();
      });
    });
    void loadSettings();
    if (state.useCurrentSong) state.searchQuery = [state.title, state.artist].filter(Boolean).join(' ');
    if (state.trackId) {
      void (async () => {
        try {
          const video = await mvApi.getSelected(state.trackId);
          state.selectedVideo = await resolveNetworkVideo(video);
          const saved = await mvApi.getCandidates(state.trackId);
          if (Array.isArray(saved)) state.candidates = saved.filter((item) => !item.selected).map((item) => item.title ? item : videoToCandidate(item));
          scheduleRender();
        } catch (error) {
          state.error = summarizeActionError(error);
          scheduleRender();
        }
      })();
    }
  } else {
    state.drawerMotion = false;
    state.maxQualityOpen = false;
    scheduleRender();
    timers.drawerExit = window.setTimeout(() => {
      state.drawerRender = false;
      scheduleRender();
    }, DRAW_EXIT_MS);
  }
  scheduleRender();
};

const setViewMode = (mode, navigate) => {
  state.viewMode = mode;
  rememberViewMode(mode);
  applyPageFlags();
  if (mode === 'mv' && isLyricsPageVisible()) {
    void loadSelected({ preserveCurrent: true });
  }
  if (navigate && !isLyricsPageVisible()) {
    window.dispatchEvent(new CustomEvent(NAV_LYRICS_EVENT, { detail: { mode } }));
  }
  scheduleRender();
};

let lastEntryToggleAt = 0;
const onMvButtonClick = (event) => {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const now = performance.now();
  if (now - lastEntryToggleAt < 250) return;
  lastEntryToggleAt = now;
  if (!isLyricsPageVisible()) {
    window.dispatchEvent(new CustomEvent(NAV_LYRICS_EVENT, { detail: { mode: 'lyrics' } }));
  }
  openDrawer(!state.drawerOpen);
};

const bindTransportButton = (button) => {
  if (button.dataset.echoMvBound === 'true') {
    refs.transportBtn = button;
    applyPageFlags();
    return;
  }
  button.dataset.echoMvBound = 'true';
  button.onclick = null;
  button.addEventListener('click', onMvButtonClick);
  refs.transportBtn = button;
  applyPageFlags();
};

const mountTransportButton = (lyricsButton) => {
  if (!lyricsButton?.parentElement) return;
  const existing = lyricsButton.parentElement.querySelector(':scope > .transport-mv-button');
  if (existing?.dataset.echoMvBound === 'true') {
    bindTransportButton(existing);
    return;
  }
  existing?.remove();
  const label = t('playerTransport.action.mv');
  const button = btn('icon-button transport-media-button transport-mv-button', {
    'data-workshop-icon': 'transport-mv',
    'aria-label': label,
    title: label,
  }, [svgIcon('film', 18)]);
  lyricsButton.parentElement.insertBefore(button, lyricsButton);
  bindTransportButton(button);
};

const restorePanel = () => {
  const page = lyricsPageEl();
  removeBackground(page);
  page?.querySelectorAll(':scope > .lyrics-mv-unavailable-reason, :scope > .lyrics-mv-diagnostics-report, :scope > .lyrics-mv-settings-entry').forEach((node) => node.remove());
  releaseVideo(refs.foregroundVideo);
  releaseVideo(refs.backgroundVideo);
  teardownOwnedPanel();
  hideOfficialMvChrome(page);
  page?.removeAttribute('data-mv-lyrics-hidden');
  if (page && page.dataset.viewMode === 'mv') page.dataset.viewMode = 'lyrics';
};

const onKeyDown = (event) => {
  if (event.key === 'Escape' && state.drawerOpen) {
    event.stopImmediatePropagation();
    openDrawer(false);
  }
};

const onSettingsChanged = (event) => {
  const patch = event instanceof CustomEvent ? event.detail : null;
  if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
    const keys = Object.keys(patch);
    if (keys.some((key) => MV_SETTINGS_KEYS.includes(key))) {
      state.settings = { ...state.settings, ...patch };
      applyPageFlags();
      if (keys.some((key) => RELOAD_SETTINGS_KEYS.includes(key))) void loadSelected({ preserveCurrent: true });
      else scheduleRender();
      return;
    }
  }
  void loadSettings().then(() => { applyPageFlags(); scheduleRender(); });
};

const onMvChanged = (event) => {
  const trackId = event instanceof CustomEvent ? event.detail?.trackId : null;
  if (!trackId || trackId === state.trackId) void loadSelected({ preserveCurrent: true });
};

const onCandidatesChanged = (event) => {
  const detail = event instanceof CustomEvent ? event.detail : null;
  if (!detail?.trackId || detail.trackId !== snapshotTrackIdFor(state.currentTrack, state.trackId) || !Array.isArray(detail.candidates)) return;
  state.candidates = detail.candidates;
  state.networkNotice = detail.candidates.length === 0 ? t('mvSettings.error.noNetworkCandidates') : null;
  scheduleRender();
};

const onSeeked = (event) => {
  const detail = event instanceof CustomEvent ? event.detail : null;
  const eventTrackId = typeof detail?.trackId === 'string' ? detail.trackId : null;
  if (eventTrackId && eventTrackId !== state.trackId) return;
  const position = Number(detail?.positionSeconds);
  if (!Number.isFinite(position)) return;
  state.audioClock = normalizeClock({ ...state.audioClock, positionSeconds: Math.max(0, position), updatedAtMs: performance.now() });
  syncVideos({ force: true, bypassCooldown: true });
};

const onNavigateLyrics = (event) => {
  const mode = event instanceof CustomEvent ? event.detail?.mode : null;
  if (mode === 'mv') openDrawer(true);
  else applyPageFlags();
};

const startTimers = () => {
  const tick = () => {
    if (disposed) return;
    void refreshPlayback();
    if (panelActive() && state.isAudioPlaying && shouldFollowMusic(state.settings, state.selectedVideo, state.streamingTarget)) {
      syncVideos();
    }
  };
  timers.poll = window.setInterval(tick, 250);
  void tick();
};

const observeDom = () => {
  const scan = () => {
    const lyricsButton = document.querySelector('button.transport-lyrics-button');
    if (lyricsButton) mountTransportButton(lyricsButton);
    applyPageFlags();
    if (!isLyricsPageVisible()) return;
    if (ownedPanelEl()) ownedPanelEl().remove();
    if (panelActive() && !refs.background) renderPanel();
  };
  scan();
  let scanTimer = 0;
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => { scanTimer = 0; if (!disposed) scan(); }, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  disposers.push(() => {
    observer.disconnect();
    window.clearTimeout(scanTimer);
  });
  if (external.extend?.observe) {
    disposers.push(external.extend.observe('button.transport-lyrics-button', (node) => mountTransportButton(node)));
  }
};

const injectCss = async () => {
  let cssText = EMBEDDED_CSS;
  try {
    const loaded = await external.loadAsset?.('mv.css');
    if (typeof loaded === 'string' && loaded.trim()) cssText = loaded;
  } catch {}
  if (external.extend?.css) {
    disposers.push(external.extend.css(CSS_ID, cssText));
    return;
  }
  const style = el('style', '', { id: CSS_ID });
  style.textContent = cssText;
  document.head.append(style);
  disposers.push(() => style.remove());
};

const onVisibility = () => {
  if (document.hidden) {
    refs.foregroundVideo?.pause();
    refs.backgroundVideo?.pause();
  } else if (state.isAudioPlaying && panelActive()) {
    if (refs.foregroundVideo) playVideo(refs.foregroundVideo);
    if (refs.backgroundVideo) playVideo(refs.backgroundVideo);
    syncVideos({ force: true, bypassCooldown: true });
  }
};

const addWin = (type, handler, options) => {
  window.addEventListener(type, handler, options);
  disposers.push(() => window.removeEventListener(type, handler, options));
};

addWin('keydown', onKeyDown, true);
addWin(SETTINGS_CHANGED_EVENT, onSettingsChanged);
addWin(MV_CHANGED_EVENT, onMvChanged);
addWin(MV_CANDIDATES_EVENT, onCandidatesChanged);
addWin(PLAYBACK_SEEKED_EVENT, onSeeked);
addWin(NAV_LYRICS_EVENT, onNavigateLyrics);
addWin(OPEN_MV_SETTINGS_EVENT, () => openDrawer(true));
addWin(DIAGNOSTICS_EVENT, (event) => {
  const enabled = event instanceof CustomEvent ? event.detail?.enabled : readDiagnostics();
  state.diagnosticsEnabled = enabled === true;
  scheduleRender();
});
addWin(IMMERSIVE_WHEEL_EVENT, (event) => {
  const deltaY = Number(event instanceof CustomEvent ? event.detail?.deltaY : 0);
  if (!deltaY || !refs.background) return;
  const direction = deltaY < 0 ? 1 : -1;
  void patchSettings({ immersiveBackgroundScalePercent: clampScale((state.settings.immersiveBackgroundScalePercent ?? 115) + direction * SCALE_WHEEL_STEP) });
});
document.addEventListener('visibilitychange', onVisibility);
disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));
const flushSheetRender = () => {
  if (!pendingDrawerRender) return;
  scheduleRender();
};
document.addEventListener('pointerup', flushSheetRender, true);
document.addEventListener('pointercancel', flushSheetRender, true);
disposers.push(() => {
  document.removeEventListener('pointerup', flushSheetRender, true);
  document.removeEventListener('pointercancel', flushSheetRender, true);
});

try {
  const off = echoApi().audio?.onStatus?.((status) => {
    state.audioStatus = status;
    if (!lyricsVisible() && !panelActive()) return;
    void refreshPlayback();
  });
  if (typeof off === 'function') disposers.push(off);
} catch {}

void injectCss();
rememberViewMode(state.viewMode);
void applyLocaleFromApp().then(() => scheduleRender());
void loadSettings().then(() => {
  rememberViewMode(state.viewMode);
  applyPageFlags();
  if (lyricsVisible() && (panelActive() || shouldAutoSearch())) void loadSelected();
  scheduleRender();
});
observeDom();
startTimers();
log('ECHO-MV renderer ready');

const dispose = () => {
  if (disposed) return;
  disposed = true;
  window.__echoMvModActive = false;
  Object.values(timers).forEach((id) => {
    window.clearTimeout(id);
    window.clearInterval(id);
    window.cancelAnimationFrame(id);
  });
  resizeObserver?.disconnect();
  refs.transportBtn?.remove();
  refs.drawerRoot?.remove();
  restorePanel();
  uninstallMvApi();
  while (disposers.length) {
    try { disposers.pop()?.(); } catch {}
  }
};

return dispose;

