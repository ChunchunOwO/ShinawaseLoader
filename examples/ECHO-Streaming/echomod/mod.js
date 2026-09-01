/* Community Streaming page. Mirrors ECHO's StreamingSearchPage through the public bridge. */
const external = echoExternalMod;
const manifest = external.manifest || {};
const config = external.config || {};
const echo = external.echo || {};
const pageSize = Math.max(10, Math.min(50, Math.round(Number(config.pageSize) || 30)));
const albumInitialTrackCount = 24;
const albumTrackRenderStep = 48;
const hiddenProviders = new Set(['mock', 'm3u8', 'kugou']);
const searchShortcuts = ['我的世界', 'Chillhop', 'Synthwave', 'Aimer'];
const accountAwareProviders = new Set(['netease', 'qqmusic', 'soundcloud', 'spotify', 'tidal', 'qobuz']);
const providerPriority = ['netease', 'qqmusic', 'plugin', 'soundcloud', 'youtube', 'tidal', 'qobuz', 'spotify', 'bilibili'];
const unsupportedDownloadProviders = new Set(['spotify', 'tidal', 'bilibili', 'youtube', 'plugin']);
const favoriteProviders = new Set(['bilibili', 'youtube', 'soundcloud']);
const activeDownloadStatuses = new Set(['queued', 'probing', 'downloading', 'extracting_audio', 'importing', 'binding_mv']);
const qualities = ['lossless', 'high', 'standard', 'hires'];
const defaultCover = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="14" fill="#eaf1f8"/><circle cx="31" cy="32" r="12" fill="#9fb6cc"/><path d="M28 67c11-19 25-25 42-9" fill="none" stroke="#5f7f9d" stroke-width="8" stroke-linecap="round"/></svg>')}`;

const locale = String(config.locale || 'zh-CN');
const chinese = locale.toLowerCase().startsWith('zh');
const accountText = (zh, en) => chinese ? zh : en;
const copy = chinese ? {
  streaming: '流媒体', streamingTitle: '流媒体音乐', streamingDescription: '搜索在线曲库，并在播放前临时解析音频地址。', currentProvider: '当前来源', preparingSearch: '等待搜索', searchPlaceholder: '搜索歌曲、艺人、专辑', providers: '流媒体平台', tabs: '结果类型', track: '歌曲', album: '专辑', artist: '艺人', playlist: '歌单', quality: '音质', lossless: '无损', high: '高音质', standard: '标准', hires: 'Hi-Res', losslessDescription: '优先 FLAC', highDescription: '优先 320kbps', standardDescription: '优先兼容性', hiresDescription: '平台支持时启用', available: '可用', disabled: '已禁用', notLoggedIn: '未登录', loggedIn: (name) => `${name} 已登录`, searching: '搜索中', searchingEllipsis: '搜索中...', resultCount: (n) => `${n} 个结果`, searchHint: '输入关键词开始搜索。实际音频 URL 只在播放时解析，队列不会保存 URL。', notFoundTrack: '没有找到匹配的流媒体歌曲。', notFoundAlbum: '没有找到匹配的专辑。', notFoundArtist: '没有找到匹配的艺人。', notFoundPlaylist: '没有找到匹配的歌单。', play: '播放', queue: '加入队列', queued: '已加入队列', favorite: '收藏', unfavorite: '取消收藏', download: '下载', resolving: '正在解析播放地址...', playing: '正在播放', unavailable: '这首歌暂时不可播放', albumKicker: '流媒体专辑', artistKicker: '流媒体艺人', playlistKicker: '流媒体歌单', readingAlbum: '读取专辑', readingPlaylist: '读取歌单', playPlaylist: '播放歌单', noPlaylistTracks: '这个歌单没有可显示的歌曲。', readingArtist: '读取艺人', playNow: '立即播放', playArtist: '播放艺人', addToQueue: '加入队列', downloadAlbum: '下载专辑', downloading: '下载中', tracks: '曲目', songs: '歌曲', discography: '作品', topTracks: '热门歌曲', albums: '专辑', source: '来源', released: '发行', unknown: '未知', close: '关闭', back: '流媒体', loading: '加载中...', loadMore: '加载更多', loadingMore: '加载中...', addPlaylist: '添加流媒体歌单', playlistHint: '粘贴网易云音乐、QQ 音乐或 Spotify 歌单链接，导入后会保存到本地播放列表。', playlistPlaceholder: '粘贴歌单链接，例如 https://music.163.com/#/playlist?id=...', add: '添加歌单', adding: '正在添加', cancelImport: '取消', syncPlaylists: '同步我的歌单', syncHint: '读取已登录的网易云音乐或 QQ 音乐账号歌单，选择后同步到本地播放列表。', syncMine: '同步我的歌单', refresh: '刷新列表', reading: '读取中', restart: '重启后可用', signedIn: '已登录', preferLoggedIn: '将优先读取已登录的平台。', needLogin: '请先在账号连接中登录网易云音乐或 QQ 音乐。', noPlaylists: '没有可同步的歌单，或当前平台尚未登录。', selectAll: '全选', deselectAll: '取消全选', selected: (a, b) => `已选择 ${a} / ${b}`, syncSelected: '同步选中歌单', syncing: '同步中', created: '我创建的歌单', favorited: '我收藏的歌单', accountPlaylist: '账号歌单', noticeTitle: '流媒体功能须知', noticeClose: '关闭须知', noticeConfirm: '我同意并继续', noticeCancel: '取消', consentPhrase: '我同意', consentInput: (phrase) => `输入“${phrase}”以继续`, noticeBody: 'ECHO 的流媒体入口只提供搜索、账号状态、收藏、歌单导入和播放入口整合。ECHO 不拥有、托管、出售或重新分发任何第三方流媒体平台的音频、视频、封面、歌词或元数据版权。', noticeItems: ['ECHO 的代码和插件受项目许可证约束；禁止破解、绕过授权、伪造权益、移除完整性校验，或把 ECHO 用作未经授权访问付费内容的工具。', '第三方平台、商标、曲库、API、账号、订阅、Cookie、DRM、地区限制和播放授权均由对应平台及权利人控制。', 'DMCA 是美国版权法中的通知与移除机制。权利人应通过对应平台或合法渠道提交通知。', '你应只使用自己有权访问的账号、订阅和内容，不得规避平台条款、下载限制、DRM、账号风控、付费墙或版权保护。', 'ECHO 不提供绕过会员、破解试听、规避付费或损害平台及权利人利益的能力。', 'ECHO 本质上是本地音乐播放器，流媒体入口优先级最低；出现问题时请先使用本地音乐库。', '如果你认为流媒体平台会员费用过高，请停止使用本功能并卸载软件。', '免责声明：ECHO 不对第三方平台造成的账号限制、服务中断、版权争议、DMCA 通知、数据丢失或地区不可用承担责任。'], noticeAcceptance: '继续表示你理解并接受：本功能是个人本地客户端辅助入口，不构成法律意见、版权授权、平台代理关系或内容可用性承诺。', imported: (name, count) => `已添加歌单：${name}，共 ${count} 首。可在播放列表页播放。`, synced: (ok, fail) => fail ? `歌单同步完成：成功 ${ok} 个，失败 ${fail} 个。` : `歌单同步完成：成功 ${ok} 个。`, noBridge: '桌面桥接不可用，请在 ECHO 客户端中使用流媒体。', downloadUnavailable: '桌面下载服务不可用。', unsupportedDownload: '此平台在 ECHO 中仅支持流播放，不提供下载任务。', recentSearches: '最近搜索', trackHeaderTitle: '歌曲', trackHeaderSource: '来源 / 音质', trackHeaderDuration: '时长', trackHeaderActions: '操作', accounts: '账号登录', searchSubmit: '搜索', downloadToMusic: '下载到音乐文件夹', downloadPlaylistToMusic: '下载整个歌单', musicSaveHint: (dir) => `保存到 ${dir}`, musicDownloadStarted: (title) => `开始下载：${title}`, musicDownloadDone: (title, path, quality) => `已保存：${title}${quality ? `（${quality}）` : ''}${path ? ` → ${path}` : ''}`, musicDownloadFailed: (title, message) => `下载失败：${title}${message ? ` - ${message}` : ''}`, downloadQualityTitle: '选择下载音质', probingQualities: '正在检测可用音质...', qualityCount: (n) => `${n} 种可用音质`, startDownload: '下载', cancelAction: '取消', playlistDownloadTitle: '下载歌单', readingPlaylistTracks: '正在读取歌单曲目...', applyAllQuality: '一键全部设置音质', perTrackQualityHint: '单独设置：点击歌曲行里的音质标签，可为单曲选择不同音质。', qualityFallbackNote: '不可用的音质会自动降级为该歌曲的最高可用音质。', probeProgress: (n, total) => `已检测音质 ${n}/${total}`, probeFailed: '无法检测该歌曲的音质，下载时将自动使用账号可用的最高音质。', probeFailedShort: '检测失败', skippedTracks: (n) => `已跳过 ${n} 个无法下载的项目（本地曲目或仅支持流播放的平台）。`, startPlaylistDownload: (n) => `开始下载（${n} 首）`, cancelDownload: '取消下载', downloadCancelled: (name) => `已取消歌单下载：${name}`, playlistDownloadBusy: '已有歌单正在下载，请稍候。', musicPlaylistReading: (name) => `正在读取歌单：${name}...`, musicPlaylistProgress: (name, done, total) => `正在下载歌单：${name}（${done}/${total}）`, musicPlaylistDone: (name, ok, failed, dir) => failed ? `歌单下载完成：${name}，成功 ${ok}，失败 ${failed}${dir ? ` → ${dir}` : ''}` : `歌单下载完成：${name}（${ok} 首）${dir ? ` → ${dir}` : ''}`, musicNoDownloadableTracks: '这个歌单没有可下载的歌曲。', mainBridgeUnavailable: '主进程下载桥接不可用，请用 ShinawaseLoader 重新启动 ECHO。', playlistItemsUnavailable: '无法读取歌单曲目，请更新 ECHO 后重试。', neteaseLoginRequired: '读取这个歌单需要登录（私密歌单仅登录后可见）。请先在账号页登录网易云音乐，再重试下载。', neteaseSessionExpired: '网易云登录已过期或失效：请在账号页重新登录网易云音乐，然后重试下载。', qqLoginRequired: '读取这个歌单需要登录（账号歌单仅登录后可见）。请先在账号页登录 QQ 音乐，再重试下载。', albumDownloadTitle: '下载专辑', artistDownloadTitle: '下载热门歌曲', downloadTopTracks: '下载热门歌曲', readingAlbumTracks: '正在读取专辑曲目...', musicNoDownloadableAlbum: '这张专辑没有可下载的歌曲。', musicNoDownloadableArtist: '这个艺人没有可下载的歌曲。', batchDownloadBusy: '已有批量下载正在进行，请稍候。', dailyTitle: '每日推荐歌单', dailyHint: '扫描网易云每日推荐歌曲、每日歌单、雷达、历史日推与个性化推荐，同步到本地歌单后可刷新和下载。', dailyScan: '扫描每日歌单', dailyRefresh: '刷新每日歌单', dailyRefreshing: '正在刷新每日歌单', dailyAuto: '自动刷新', dailyManual: '手动刷新', dailyAutoOn: '自动刷新已开启：每天 6:05（北京时间）以及启动后补刷。', dailyAutoOff: '自动刷新已关闭，可手动扫描或刷新。', dailyNeedLogin: '请先登录网易云音乐后再扫描每日推荐。', dailyEmpty: '没有读到每日推荐歌单。', dailyScanned: (n) => `已扫描 ${n} 个每日推荐歌单。`, dailySynced: (ok, fail) => fail ? `每日歌单同步完成：成功 ${ok} 个，失败 ${fail} 个。` : `每日歌单同步完成：成功 ${ok} 个。`, dailyRefreshed: (n) => `已刷新每日歌单：${n} 个。`, dailyKindSongs: '每日推荐', dailyKindResource: '每日歌单', dailyKindRadar: '雷达', dailyKindPersonalized: '推荐歌单', dailyKindHistory: '历史日推', dailyKindNewsong: '新歌推荐', dailySyncSelected: '同步选中每日歌单', dailyOpenNative: '在歌单页打开', dailyRefreshOne: '刷新',
} : {
  streaming: 'Streaming', streamingTitle: 'Streaming music', streamingDescription: 'Search online catalogs and resolve audio only when playback starts.', currentProvider: 'Current source', preparingSearch: 'Waiting for search', searchPlaceholder: 'Search songs, artists, or albums', providers: 'Streaming platforms', tabs: 'Result type', track: 'Tracks', album: 'Albums', artist: 'Artists', playlist: 'Playlists', quality: 'Quality', lossless: 'Lossless', high: 'High quality', standard: 'Standard', hires: 'Hi-Res', losslessDescription: 'Prefer FLAC', highDescription: 'Prefer 320kbps', standardDescription: 'Prefer compatibility', hiresDescription: 'Use when supported by the platform', available: 'Available', disabled: 'Disabled', notLoggedIn: 'Not logged in', loggedIn: (name) => `${name} logged in`, searching: 'Searching', searchingEllipsis: 'Searching...', resultCount: (n) => `${n} results`, searchHint: 'Enter a keyword to begin. Audio URLs are resolved only for playback and are never stored in the queue.', notFoundTrack: 'No streaming tracks found.', notFoundAlbum: 'No streaming albums found.', notFoundArtist: 'No streaming artists found.', notFoundPlaylist: 'No streaming playlists found.', play: 'Play', queue: 'Add to queue', queued: 'Added to queue', favorite: 'Favorite', unfavorite: 'Remove favorite', download: 'Download', resolving: 'Resolving playback address...', playing: 'Playing', unavailable: 'This track is not currently playable', albumKicker: 'Streaming Album', artistKicker: 'Streaming Artist', playlistKicker: 'Streaming Playlist', readingAlbum: 'Reading album', readingPlaylist: 'Reading playlist', playPlaylist: 'Play playlist', noPlaylistTracks: 'This playlist has no tracks to display.', readingArtist: 'Reading artist', playNow: 'Play Now', playArtist: 'Play Artist', addToQueue: 'Add to Queue', downloadAlbum: 'Download album', downloading: 'Downloading', tracks: 'Tracks', songs: 'Songs', discography: 'Discography', topTracks: 'Top Tracks', albums: 'Albums', source: 'Source', released: 'Released', unknown: 'Unknown', close: 'Close', back: 'Streaming', loading: 'Loading...', loadMore: 'Load more', loadingMore: 'Loading...', addPlaylist: 'Add streaming playlist', playlistHint: 'Paste a NetEase, QQ Music, or Spotify playlist URL to save it to the local playlists.', playlistPlaceholder: 'Paste a playlist URL, for example https://music.163.com/#/playlist?id=...', add: 'Add playlist', adding: 'Adding', cancelImport: 'Cancel', syncPlaylists: 'Sync my playlists', syncHint: 'Read playlists from a connected NetEase or QQ Music account and add selected playlists to local playback.', syncMine: 'Sync my playlists', refresh: 'Refresh list', reading: 'Reading', restart: 'Available after restart', signedIn: 'Signed in', preferLoggedIn: 'A connected platform will be preferred.', needLogin: 'Connect a NetEase or QQ Music account first.', noPlaylists: 'No playlists available or the platform is not connected.', selectAll: 'Select all', deselectAll: 'Deselect all', selected: (a, b) => `Selected ${a} / ${b}`, syncSelected: 'Sync selected playlists', syncing: 'Syncing', created: 'Created by me', favorited: 'Favorited by me', accountPlaylist: 'Account playlist', noticeTitle: 'Streaming Feature Notice', noticeClose: 'Close notice', noticeConfirm: 'I agree and continue', noticeCancel: 'Cancel', consentPhrase: 'I agree', consentInput: (phrase) => `Type "${phrase}" to continue`, noticeBody: 'The ECHO streaming entry only integrates search, account status, favorites, playlist import, and playback entry points. ECHO does not own, host, sell, or redistribute copyrights to third-party streaming audio, video, artwork, lyrics, or metadata.', noticeItems: ['ECHO code and plugins are governed by the project license; cracking, bypassing authorization, forging entitlements, removing integrity checks, or unauthorized access to paid content is prohibited.', 'Third-party platforms, trademarks, catalogs, APIs, accounts, subscriptions, cookies, DRM, regional restrictions, and playback authorization are controlled by the relevant platforms and rightsholders.', 'DMCA is a notice-and-takedown mechanism; rightsholders should use the relevant platform or lawful channel.', 'Use only accounts, subscriptions, and content you are authorized to access. Do not bypass platform terms, download limits, DRM, risk controls, paywalls, or copyright protections.', 'ECHO will not provide membership bypass, preview cracking, payment evasion, or anything that harms platforms or rightsholders.', 'ECHO is fundamentally a local music player; use the local library first when streaming has problems.', 'If streaming memberships are too expensive, stop using this feature and uninstall the software.', 'Disclaimer: ECHO is not liable for account restrictions, service interruptions, copyright disputes, DMCA notices, data loss, or regional unavailability.'], noticeAcceptance: 'Continuing means you understand and accept that this feature is a personal local-client helper, not legal advice, a copyright license, a platform agency relationship, or a promise that content will be available.', imported: (name, count) => `Added playlist: ${name}, ${count} tracks.`, synced: (ok, fail) => fail ? `Playlist sync complete: ${ok} succeeded, ${fail} failed.` : `Playlist sync complete: ${ok} succeeded.`, noBridge: 'The desktop bridge is unavailable. Open ECHO to use streaming.', downloadUnavailable: 'The desktop download service is unavailable.', unsupportedDownload: 'This platform supports streaming only in ECHO and does not provide download jobs.', recentSearches: 'Recent searches', trackHeaderTitle: 'Song', trackHeaderSource: 'Source / Quality', trackHeaderDuration: 'Duration', trackHeaderActions: 'Actions', accounts: 'Accounts', searchSubmit: 'Search', downloadToMusic: 'Download to Music folder', downloadPlaylistToMusic: 'Download entire playlist', musicSaveHint: (dir) => `Save to ${dir}`, musicDownloadStarted: (title) => `Downloading: ${title}`, musicDownloadDone: (title, path, quality) => `Saved: ${title}${quality ? ` (${quality})` : ''}${path ? ` → ${path}` : ''}`, musicDownloadFailed: (title, message) => `Download failed: ${title}${message ? ` - ${message}` : ''}`, downloadQualityTitle: 'Choose download quality', probingQualities: 'Detecting available qualities...', qualityCount: (n) => `${n} available ${n === 1 ? 'quality' : 'qualities'}`, startDownload: 'Download', cancelAction: 'Cancel', playlistDownloadTitle: 'Download playlist', readingPlaylistTracks: 'Reading playlist tracks...', applyAllQuality: 'Set one quality for all', perTrackQualityHint: 'Per-song: click the quality tags on a row to override individual songs.', qualityFallbackNote: 'Unavailable qualities fall back to the best quality each song offers.', probeProgress: (n, total) => `Probed ${n}/${total}`, probeFailed: 'Quality detection failed; the best quality your account can access will be used at download time.', probeFailedShort: 'Probe failed', skippedTracks: (n) => `Skipped ${n} item${n === 1 ? '' : 's'} that cannot be downloaded (local tracks or streaming-only platforms).`, startPlaylistDownload: (n) => `Download ${n} ${n === 1 ? 'track' : 'tracks'}`, cancelDownload: 'Cancel download', downloadCancelled: (name) => `Playlist download cancelled: ${name}`, playlistDownloadBusy: 'A playlist download is already running.', musicPlaylistReading: (name) => `Reading playlist: ${name}...`, musicPlaylistProgress: (name, done, total) => `Downloading playlist: ${name} (${done}/${total})`, musicPlaylistDone: (name, ok, failed, dir) => failed ? `Playlist download finished: ${name}, ${ok} saved, ${failed} failed${dir ? ` → ${dir}` : ''}` : `Playlist download finished: ${name} (${ok} tracks)${dir ? ` → ${dir}` : ''}`, musicNoDownloadableTracks: 'This playlist has no downloadable tracks.', mainBridgeUnavailable: 'The main-process download bridge is unavailable. Relaunch ECHO with ShinawaseLoader.', playlistItemsUnavailable: 'Could not read the playlist tracks. Update ECHO and try again.', neteaseLoginRequired: 'Reading this playlist requires a signed-in account (private playlists are only visible after login). Connect NetEase Cloud Music on the accounts page and retry.', neteaseSessionExpired: 'The NetEase Cloud Music session has expired. Sign in again on the accounts page and retry the download.', qqLoginRequired: 'Reading this playlist requires a signed-in account. Connect QQ Music on the accounts page and retry.', albumDownloadTitle: 'Download album', artistDownloadTitle: 'Download top tracks', downloadTopTracks: 'Download top tracks', readingAlbumTracks: 'Reading album tracks...', musicNoDownloadableAlbum: 'This album has no downloadable tracks.', musicNoDownloadableArtist: 'This artist has no downloadable tracks.', batchDownloadBusy: 'A batch download is already running.', dailyTitle: 'Daily recommendation playlists', dailyHint: 'Scan NetEase daily songs, daily playlists, radar, history, and personalized lists, then sync, refresh, or download them.', dailyScan: 'Scan daily playlists', dailyRefresh: 'Refresh daily playlists', dailyRefreshing: 'Refreshing daily playlists', dailyAuto: 'Auto refresh', dailyManual: 'Manual refresh', dailyAutoOn: 'Auto refresh is on: 06:05 Beijing time each day, plus a catch-up after launch.', dailyAutoOff: 'Auto refresh is off. Scan or refresh manually.', dailyNeedLogin: 'Connect a NetEase Cloud Music account before scanning daily recommendations.', dailyEmpty: 'No daily recommendation playlists were returned.', dailyScanned: (n) => `Scanned ${n} daily recommendation playlists.`, dailySynced: (ok, fail) => fail ? `Daily playlist sync finished: ${ok} succeeded, ${fail} failed.` : `Daily playlist sync finished: ${ok} succeeded.`, dailyRefreshed: (n) => `Refreshed ${n} daily playlists.`, dailyKindSongs: 'Daily songs', dailyKindResource: 'Daily playlists', dailyKindRadar: 'Radar', dailyKindPersonalized: 'Recommended', dailyKindHistory: 'History', dailyKindNewsong: 'New songs', dailySyncSelected: 'Sync selected daily playlists', dailyOpenNative: 'Open on Playlists page', dailyRefreshOne: 'Refresh',
};

const lyricsCopy = chinese ? {
  open: '\u6b4c\u8bcd', loading: '\u6b4c\u8bcd\u52a0\u8f7d\u4e2d...', missing: '\u6682\u65e0\u53ef\u7528\u6b4c\u8bcd', instrumental: '\u7eaf\u97f3\u4e50', source: '\u6765\u6e90', back: '\u8fd4\u56de\u6d41\u5a92\u4f53', failed: '\u6b4c\u8bcd\u52a0\u8f7d\u5931\u8d25'
} : {
  open: 'Lyrics', loading: 'Loading lyrics...', missing: 'No lyrics available', instrumental: 'Instrumental', source: 'Source', back: 'Back to Streaming', failed: 'Failed to load lyrics'
};
const togetherCopy = chinese ? {
  title: '一起听', invite: '邀请一起听', inviteFriend: '邀请好友', accept: '接受', decline: '忽略', leave: '离开', needLogin: '请先登录网易云后再一起听', creating: '正在创建房间...', inviting: '正在邀请好友...', emptyFriends: '没有可邀请的好友。可搜索网易云用户，或先去关注。', members: '正在一起听', duration: '时长', collapse: '收纳', expand: '展开', incoming: '邀请你一起听', copied: '已复制邀请链接', idle: '登录后可直接邀请好友，像网易云客户端一样同步听歌。', host: '房主', guest: '成员', songUnknown: '暂无曲目', copyLink: '复制邀请链接', refresh: '刷新', pickerTitle: '选择好友直接邀请', playing: '播放中', paused: '已暂停', trayHint: '托盘里也可以直接点好友邀请', joined: '已加入一起听', invited: (name) => `已邀请 ${name} 一起听`, searchFriends: '搜索好友', searchPlaceholder: '搜索网易云好友 / 用户', restoreTitle: '你还在一起听中', restoreBody: '关闭软件前的一起听房间还在。要恢复同步，还是退出房间？', restore: '恢复一起听', restoreLeave: '退出一起听', restoreSong: '上次在听',
} : {
  title: 'Listen together', invite: 'Invite to listen', inviteFriend: 'Invite friends', accept: 'Accept', decline: 'Dismiss', leave: 'Leave', needLogin: 'Sign in to NetEase Cloud Music first.', creating: 'Creating room...', inviting: 'Inviting friend...', emptyFriends: 'No friends to invite. Search a NetEase user or follow people first.', members: 'Listening together', duration: 'Duration', collapse: 'Collapse', expand: 'Expand', incoming: 'invited you to listen together', copied: 'Invite link copied', idle: 'Sign in, then invite a friend directly and sync like the official NetEase client.', host: 'Host', guest: 'Member', songUnknown: 'No track yet', copyLink: 'Copy invite link', refresh: 'Refresh', pickerTitle: 'Invite a friend directly', playing: 'Playing', paused: 'Paused', trayHint: 'Invite a friend from the tray too', joined: 'Joined listen-together', invited: (name) => `Invited ${name}`, searchFriends: 'Search friends', searchPlaceholder: 'Search NetEase friends / users', restoreTitle: 'You are still in a listen-together room', restoreBody: 'The room from last time is still open. Resume sync or leave the room?', restore: 'Resume', restoreLeave: 'Leave', restoreSong: 'Last track',
};

const ncmCopy = chinese ? {
  comments: '评论', similar: '相似歌曲', unblock: '解灰', sending: '发送', reply: '回复', delete: '删除', like: '点赞', loadMore: '更多评论', emptyComments: '暂无评论', needLogin: '登录网易云后才能评论', hot: '热门', latest: '最新', composer: '说说这首歌…', sent: '评论已发送', deleted: '评论已删除', similarHint: '根据当前歌曲推荐相似音乐，可加入队列或自动连播。', similarPlay: '播放这批', similarQueue: '加入队列', similarAuto: '自动连播', similarCount: '每批首数', similarDone: (n) => `已推荐 ${n} 首相似歌曲`, unblocked: '已尝试解灰播放', phone: '手机号', captcha: '验证码', sendCaptcha: '获取验证码', phoneLogin: '手机号登录', password: '密码（可选）', captchaSent: '验证码已发送', loggedIn: '手机号登录成功', country: '区号',
} : {
  comments: 'Comments', similar: 'Similar', unblock: 'Unblock', sending: 'Send', reply: 'Reply', delete: 'Delete', like: 'Like', loadMore: 'More comments', emptyComments: 'No comments yet', needLogin: 'Sign in to NetEase to comment', hot: 'Hot', latest: 'Latest', composer: 'Write a comment…', sent: 'Comment posted', deleted: 'Comment deleted', similarHint: 'Recommend similar tracks from the current song. Queue them or auto-play batches.', similarPlay: 'Play batch', similarQueue: 'Add to queue', similarAuto: 'Auto-play', similarCount: 'Batch size', similarDone: (n) => `Queued ${n} similar tracks`, unblocked: 'Playing via unblock sources', phone: 'Phone', captcha: 'Captcha', sendCaptcha: 'Send code', phoneLogin: 'Phone login', password: 'Password (optional)', captchaSent: 'Captcha sent', loggedIn: 'Signed in with phone', country: 'Code',
};
const stored = (() => { try { return external.settings?.get?.() || {}; } catch { return {}; } })();
const togetherUi = {
  snapshot: { loggedIn: false, inRoom: false, users: [], invites: [], friends: [], playlistIds: [] },
  sheetOpen: false,
  sheetTab: 'together',
  pickerOpen: false,
  applying: false,
  lastAppliedSeq: 0,
  lastSentSeq: 0,
  lastReportKey: '',
  expectedMs: 0,
  wasInRoom: false,
  friendQuery: '',
  friendSearchTimer: 0,
};
const ncmUi = {
  commentOpen: false,
  commentTrack: null,
  commentPage: 1,
  comments: [],
  hot: [],
  total: 0,
  selfId: null,
  loading: false,
  draft: '',
  replyTo: null,
  similarOpen: false,
  similarTrack: null,
  similarTracks: [],
  similarAutoPlay: stored.similarAutoPlay != null ? stored.similarAutoPlay === true : config.similarAutoPlay === true,
  similarCount: Math.max(3, Math.min(50, Math.round(Number(stored.similarCount ?? config.similarCount) || 10))),
  similarIds: [],
  similarPlayed: 0,
  similarSeed: null,
  lastSongId: null,
};
const state = {
  ready: false, accepted: false, noticeOpen: false, noticeConsent: '', pendingAccountSync: null, providers: [], provider: String(stored.provider || config.defaultProvider || 'netease'), quality: qualities.includes(stored.quality) ? stored.quality : (qualities.includes(config.defaultQuality) ? config.defaultQuality : 'lossless'), qualityMenuOpen: false, activeTab: ['track', 'album', 'artist', 'playlist'].includes(stored.activeTab) ? stored.activeTab : 'track', input: String(stored.input || stored.query || ''), query: String(stored.query || ''), result: stored.result || null, loading: false, requestId: 0, error: null, actionError: null, actionMessage: null, selectedAlbum: null, selectedAlbumDetail: null, albumLoading: false, albumError: null, albumTrackLimit: albumInitialTrackCount, selectedArtist: null, selectedArtistDetail: null, artistLoading: false, artistError: null, selectedPlaylist: null, selectedPlaylistDetail: null, playlistLoading: false, playlistError: null, playlistTrackLimit: albumInitialTrackCount, playlistUrl: '', accountPlaylistProvider: 'netease', accountPlaylists: [], selectedAccountPlaylistIds: {}, accountPanelOpen: false, accountPageOpen: false, loadingAccountPlaylists: false, syncingAccountPlaylistIds: {}, importingPlaylistKey: null, resolvingTrackKey: null, queuedTrackKey: null, downloadingTrackKey: null, downloadEnabled: false, downloadJobs: [], downloadJobIdsByTrackKey: {}, albumDownload: null, favoriteTrackIds: {}, favoriteTrackKey: null, failedCoverUrls: stored.failedCoverUrls || {}, currentStableKey: '', scrollTop: Number(stored.scrollTop) || 0, recentSearches: Array.isArray(stored.recentSearches) && stored.recentSearches.length ? stored.recentSearches.filter((item) => typeof item === 'string' && item.trim()).slice(0, 8) : searchShortcuts.slice(),
};
state.selectedLyricsTrack = null;
state.selectedLyrics = null;
state.lyricsLoading = false;
state.lyricsError = null;
state.lyricsRequestId = 0;
state.notifiedDownloadStatuses = {};
state.musicDownloadKeys = {};
state.musicPlaylistDownload = null;
state.musicTargetBase = '';
state.downloadQuality = qualities.includes(stored.downloadQuality) ? stored.downloadQuality : null;
state.accountStatuses = [];
state.accountBusy = {};
state.accountErrors = {};
state.dailyPlaylists = Array.isArray(stored.dailyPlaylists) ? stored.dailyPlaylists : [];
state.selectedDailyPlaylistKeys = {};
state.loadingDailyPlaylists = false;
state.refreshingDaily = false;
state.syncingDailyKeys = {};
state.dailyLastRefreshAt = stored.dailyLastRefreshAt || null;
state.dailySyncedKeys = stored.dailySyncedKeys && typeof stored.dailySyncedKeys === 'object' ? stored.dailySyncedKeys : {};
state.autoRefreshDaily = stored.autoRefreshDaily != null ? stored.autoRefreshDaily === true : config.autoRefreshDailyPlaylists !== false;
state.autoSyncDaily = stored.autoSyncDaily != null ? stored.autoSyncDaily === true : config.autoSyncDailyPlaylists === true;
state.accountMessages = {};
state.accountCookies = {};
state.accountBrowsers = {};
state.qobuzToken = '';
state.accountQr = null;
state.neteasePhone = '';
state.neteaseCaptcha = '';
state.neteasePassword = '';
state.neteaseCountry = '86';
const accountStatusFor = (provider) => state.accountStatuses.find((item) => item.provider === provider) || { provider, connected: false, username: null, displayName: null, avatarUrl: null, error: null };
const mergeAccountStatus = (status) => { if (!status?.provider) return; state.accountStatuses = [...state.accountStatuses.filter((item) => item.provider !== status.provider), status]; };
const refreshAccountPage = () => { if (accountRoot && !accountDisposed) accountRoot.replaceChildren(renderAccountPage()); else if (!disposed && state.accountPageOpen) render(); };
const loadAccountStatuses = async () => { const api = accountApi(); if (!api?.getStatuses) throw new Error(accountText('桌面账号桥接不可用，请重启 ECHO。', 'Desktop account bridge is unavailable. Restart ECHO.')); state.accountStatuses = await api.getStatuses(); refreshAccountPage(); return state.accountStatuses; };
const accountAction = async (provider, action, work) => { state.accountBusy[provider] = action; state.accountErrors[provider] = null; state.accountMessages[provider] = null; refreshAccountPage(); try { const result = await work(); if (result?.status) mergeAccountStatus(result.status); else if (result?.provider) mergeAccountStatus(result); if (result?.message) state.accountMessages[provider] = result.message; await loadAccountStatuses(); await loadProviders(true).catch(() => undefined); } catch (error) { state.accountErrors[provider] = error instanceof Error ? error.message : String(error); refreshAccountPage(); } finally { delete state.accountBusy[provider]; refreshAccountPage(); } };
const setAccountBrowser = (provider, browser) => void accountAction(provider, 'browser', async () => { state.accountBrowsers[provider] = browser; const result = await accountApi().setBrowser(provider, browser); mergeAccountStatus(result); return result; });
const saveAccountCookie = (provider) => void accountAction(provider, 'save', async () => { const cookie = String(state.accountCookies[provider] || '').trim(); if (!cookie) throw new Error(accountText('请先填写 Cookie。', 'Enter a Cookie first.')); const result = await accountApi().saveCookie(provider, cookie); state.accountCookies[provider] = ''; mergeAccountStatus(result); return result; });
const loginAccount = (provider) => void accountAction(provider, 'login', async () => { if (provider === 'qobuz') { const api = qobuzApi(); const token = String(state.qobuzToken || '').trim(); if (!api?.login) throw new Error(accountText('Qobuz 登录桥接不可用。', 'Qobuz login bridge is unavailable.')); if (!token) throw new Error(accountText('请先填写 Qobuz user_auth_token。', 'Enter the Qobuz user_auth_token first.')); const result = await api.login({ userAuthToken: token }); if (!result?.success) throw new Error(result?.error || accountText('Qobuz 登录失败。', 'Qobuz login failed.')); state.qobuzToken = ''; return { message: result.error || accountText('Qobuz 已登录。', 'Qobuz signed in.') }; } const api = accountApi(); if (!api?.startLogin) throw new Error(accountText('登录桥接不可用。', 'Login bridge is unavailable.')); if ((provider === 'youtube' || provider === 'soundcloud') && state.accountBrowsers[provider] && state.accountBrowsers[provider] !== 'none') await api.setBrowser(provider, state.accountBrowsers[provider]); return (await api.startLogin(provider)) || {}; });
const checkAccount = (provider) => void accountAction(provider, 'check', () => accountApi().check(provider));
const clearAccount = (provider) => void accountAction(provider, 'clear', () => accountApi().clear(provider));
const startNeteaseQrLogin = async () => { const api = accountApi(); if (!api?.startNeteaseQrLogin || !api?.pollNeteaseQrLogin) return loginAccount('netease'); state.accountErrors.netease = null; state.accountQr = await api.startNeteaseQrLogin(); refreshAccountPage(); window.clearTimeout(accountQrTimer); const poll = async () => { if (disposed || !state.accountQr || accountDisposed || !state.accountPageOpen) return; try { const result = await api.pollNeteaseQrLogin(state.accountQr.key); if (disposed || !state.accountQr) return; if (result?.status) mergeAccountStatus(result.status); if (['confirmed', 'expired', 'failed'].includes(result?.state)) { state.accountMessages.netease = result.message || result.state; state.accountQr = null; await loadAccountStatuses(); return; } state.accountQr = { ...state.accountQr, state: result?.state || state.accountQr.state, message: result?.message || state.accountQr.message }; refreshAccountPage(); accountQrTimer = window.setTimeout(poll, 2000); } catch (error) { state.accountErrors.netease = error instanceof Error ? error.message : String(error); state.accountQr = null; refreshAccountPage(); } }; void poll(); };
const renderAccountPage = () => { const page = make('div', 'streaming-page streaming-account-page'); const hero = make('header', 'streaming-hero'); const heroCopy = make('div', 'streaming-hero-copy'); heroCopy.append(make('span', 'streaming-kicker', accountText('账号连接', 'Account connections')), make('h1', '', accountText('流媒体账号', 'Streaming accounts')), make('p', '', accountText('登录、检查或退出第三方平台账号。登录信息由 ECHO 本地保存。', 'Sign in, check, or sign out of third-party platforms. Credentials stay local to ECHO.'))); hero.append(heroCopy); const actions = make('div', 'streaming-hero-meter'); actions.append(actionButton(accountText('刷新状态', 'Refresh'), 'refresh', () => loadAccountStatuses().catch((error) => { state.accountErrors.__global = error.message; refreshAccountPage(); }), { className: 'settings-action-button', title: accountText('刷新账号状态', 'Refresh account status') }), actionButton(accountText('检查全部', 'Check all'), 'check', () => accountAction('__global', 'check', () => accountApi().checkAll()), { className: 'settings-action-button', title: accountText('检查全部账号', 'Check all accounts') })); hero.append(actions); page.append(hero); if (state.accountErrors.__global) page.append(make('div', 'streaming-state streaming-state--error', state.accountErrors.__global)); const list = make('div', 'settings-account-list'); accountProviderOrder.forEach((provider) => { const status = accountStatusFor(provider); const row = make('article', 'settings-account-row streaming-account-row'); const summary = make('div', 'settings-account-summary'); const badge = make(status.connected ? 'span' : 'button', `${status.connected ? 'list-filter-chip active' : 'list-filter-chip settings-account-status-link'}`, status.connected ? accountText('已登录', 'Connected') : accountText('点击登录', 'Click to sign in')); badge.dataset.connected = String(status.connected); if (!status.connected) { badge.type = 'button'; badge.addEventListener('click', () => loginAccount(provider)); } summary.append(badge, make('div', '', make('h3', '', accountProviderLabels[provider] || provider)), make('p', '', accountText('使用 ECHO 本地账号桥接登录。', 'Sign in through ECHO local account bridge.'))); row.append(summary); const meta = make('div', 'settings-account-meta'); meta.append(make('span', '', status.displayName || status.username || accountText('未设置账号', 'No account connected'))); if (status.lastCheckedAt) meta.append(make('span', '', `${accountText('最近检查', 'Checked')} ${status.lastCheckedAt}`)); row.append(meta); const controls = make('div', 'settings-account-actions'); if (provider !== 'osu') controls.append(actionButton(state.accountBusy[provider] === 'login' ? accountText('登录中...', 'Opening...') : accountText('登录', 'Sign in'), 'link', provider === 'netease' ? startNeteaseQrLogin : () => loginAccount(provider), { className: 'settings-action-button settings-account-login-button', disabled: Boolean(state.accountBusy[provider]) })); controls.append(actionButton(state.accountBusy[provider] === 'check' ? accountText('检查中...', 'Checking...') : accountText('检查', 'Check'), 'refresh', () => checkAccount(provider), { className: 'settings-action-button', disabled: Boolean(state.accountBusy[provider]) })); controls.append(actionButton(accountText('退出', 'Sign out'), 'close', () => clearAccount(provider), { className: 'settings-danger-button', disabled: Boolean(state.accountBusy[provider]) })); row.append(controls); if (provider === 'youtube' || provider === 'soundcloud') { const browserLabel = make('label', 'settings-select-field settings-account-browser-field'); browserLabel.append(make('span', '', accountText('登录浏览器', 'Login browser'))); const browser = document.createElement('select'); ['none', 'edge', 'chrome', 'firefox'].forEach((value) => { const option = document.createElement('option'); option.value = value; option.textContent = value === 'none' ? accountText('不使用浏览器登录', 'No browser login') : value; option.selected = (state.accountBrowsers[provider] || 'none') === value; browser.append(option); }); browser.addEventListener('change', () => setAccountBrowser(provider, browser.value)); browserLabel.append(browser); row.append(browserLabel); } if (provider === 'qobuz') { const tokenLabel = make('label', 'settings-account-cookie-field'); const token = document.createElement('input'); token.type = 'password'; token.placeholder = 'Qobuz user_auth_token'; token.value = state.qobuzToken; token.addEventListener('input', () => { state.qobuzToken = token.value; }); tokenLabel.append(token); row.append(tokenLabel); } else if (provider !== 'osu') { const cookieLabel = make('label', 'settings-account-cookie-field'); const cookie = document.createElement('input'); cookie.type = 'password'; cookie.placeholder = accountText('粘贴 Cookie（可选）', 'Paste Cookie (optional)'); cookie.value = state.accountCookies[provider] || ''; cookie.addEventListener('input', () => { state.accountCookies[provider] = cookie.value; }); cookieLabel.append(cookie); row.append(cookieLabel, actionButton(accountText('保存 Cookie', 'Save Cookie'), 'check', () => saveAccountCookie(provider), { className: 'settings-action-button', disabled: Boolean(state.accountBusy[provider]) })); } if (provider === 'netease') row.append(renderNeteasePhoneLogin()); if (status.error) row.append(make('p', 'settings-inline-error settings-account-note', status.error)); if (state.accountMessages[provider]) row.append(make('p', 'settings-inline-note settings-account-note', state.accountMessages[provider])); if (state.accountErrors[provider]) row.append(make('p', 'settings-inline-error settings-account-note', state.accountErrors[provider])); list.append(row); }); page.append(list); if (state.accountQr) { const qr = make('section', 'streaming-account-qr settings-account-row'); qr.append(make('h2', '', accountText('网易云扫码登录', 'NetEase QR login'))); const image = document.createElement('img'); image.src = state.accountQr.qrUrl; image.alt = accountText('网易云登录二维码', 'NetEase login QR code'); image.width = 220; image.height = 220; qr.append(image, make('p', 'settings-inline-note', state.accountQr.message || accountText('请扫码登录。', 'Scan to sign in.')), actionButton(accountText('关闭二维码', 'Close QR'), 'close', () => { state.accountQr = null; window.clearTimeout(accountQrTimer); refreshAccountPage(); }, { className: 'settings-action-button' })); page.append(qr); } return page; };
let pageRoot = null; let disposed = false; let searchTimer = 0; let statusTimer = 0; let accountUnsubscribe = null; let downloadUnsubscribe = null; let playlistPageUnsubscribe = null; let dailyRefreshTimer = 0; let dailyRefreshInFlight = false; let paintNativeDailyPanel = () => {};
let searchComposing = false;
let searchRenderPending = false;
let searchCompositionEndedAt = 0;
let liveSearchInput = null;
let accountRoot = null; let accountDisposed = false; let accountsSidebarUnsubscribe = null; let qobuzSidebarUnsubscribe = null; let accountQrTimer = 0;

const shinawaseBridge = () => window.__echoShinawaseStreaming || {};
const streamApi = () => external.echo?.streaming || window.echo?.streaming || shinawaseBridge().streaming;
const playbackApi = () => external.echo?.playback || window.echo?.playback;
const downloadApi = () => external.echo?.downloads || window.echo?.downloads || shinawaseBridge().downloads;
const appApi = () => external.echo?.app || window.echo?.app;
const accountApi = () => external.echo?.accounts || window.echo?.accounts || shinawaseBridge().accounts;
const qobuzApi = () => external.echo?.qobuz || window.echo?.qobuz || shinawaseBridge().qobuz;
const libraryApi = () => external.echo?.library || window.echo?.library;
const openAccountPage = () => { state.accountPageOpen = !state.accountPageOpen; if (state.accountPageOpen && !state.accountStatuses.length) void loadAccountStatuses().catch((error) => { state.accountErrors.__global = error.message; render(); }); render(); };
const normalizeAccountQr = (page) => { const section = page.querySelector('.streaming-account-qr'); if (!section || !state.accountQr) return page; document.querySelectorAll('.settings-qr-login-backdrop[data-echo-streaming-qr]').forEach((node) => node.remove()); const backdrop = make('div', 'settings-qr-login-backdrop'); backdrop.dataset.echoStreamingQr = 'true'; backdrop.style.cssText = 'position:fixed;inset:0;z-index:120;display:grid;place-items:center;background:rgba(8,10,14,0.55)'; backdrop.addEventListener('mousedown', () => { state.accountQr = null; window.clearTimeout(accountQrTimer); render(); }); const dialog = make('section', 'settings-qr-login-dialog'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.addEventListener('mousedown', (event) => event.stopPropagation()); while (section.firstChild) dialog.append(section.firstChild); section.remove(); backdrop.append(dialog); document.body.append(backdrop); return page; };
const renderAccountView = () => { const page = make('div', 'streaming-page streaming-hub streaming-account-view'); page.style.position = 'relative'; page.style.display = 'grid'; page.style.gap = '18px'; page.style.padding = '52px 42px 24px'; page.style.overflow = 'auto'; const back = actionButton(accountText('返回流媒体', 'Back to Streaming'), 'arrow', openAccountPage, { className: 'album-back-button', title: accountText('返回流媒体', 'Back to Streaming') }); back.style.position = 'absolute'; back.style.top = '16px'; back.style.left = '42px'; back.style.zIndex = '2'; page.append(back); page.append(normalizeAccountQr(renderAccountPage())); return page; };
const accountProviderOrder = ['netease', 'qqmusic', 'kugou', 'bilibili', 'youtube', 'soundcloud', 'spotify', 'tidal', 'qobuz', 'osu'];
const accountProviderLabels = { netease: '网易云音乐', qqmusic: 'QQ 音乐', kugou: '酷狗音乐', bilibili: '哔哩哔哩', youtube: 'YouTube', soundcloud: 'SoundCloud', spotify: 'Spotify', tidal: 'TIDAL', qobuz: 'Qobuz', osu: 'osu!' };
const iconPaths = { play: '<path d="m6 4 14 8-14 8z" fill="currentColor"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', check: '<path d="m5 12 4 4L19 6"/>', heart: '<path d="M20.8 8.7c0 5.5-8.8 10.2-8.8 10.2S3.2 14.2 3.2 8.7A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z"/>', download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/>', arrow: '<path d="m15 18-6-6 6-6"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', radio: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2" fill="currentColor"/>', disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="m12 3 2 7"/>', user: '<circle cx="12" cy="8" r="3"/><path d="M5 20c.8-3.3 3.1-5 7-5s6.2 1.7 7 5"/>', link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/>', refresh: '<path d="M20 11a8 8 0 0 0-14.7-4L3 10m0-4v4h4M4 13a8 8 0 0 0 14.7 4L21 14m0 4v-4h-4"/>', chevron: '<path d="m6 9 6 6 6-6"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', shield: '<path d="M12 3 20 6v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>' };
iconPaths.music = '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>';
iconPaths.arrowRight = '<path d="M5 12h14M13 6l6 6-6 6"/>';
iconPaths.users = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>';
iconPaths.chat = '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>';
iconPaths.spark = '<path d="M12 3v4M12 17v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M3 12h4M17 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>';
const makeIcon = (name, size = 16) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true'); svg.innerHTML = iconPaths[name] || ''; return svg; };
const make = (tag, className = '', text = undefined) => { const node = document.createElement(tag); if (className) node.className = className; if (text instanceof Node) node.append(text); else if (text !== undefined) node.textContent = String(text ?? ''); return node; };
const actionButton = (label, iconName, handler, options = {}) => { const node = make('button', options.className || '', options.iconOnly ? undefined : label); node.type = 'button'; if (iconName) node.prepend(makeIcon(iconName, options.size || 16)); node.title = options.title || label; node.setAttribute('aria-label', options.ariaLabel || label); if (options.active !== undefined) node.dataset.active = String(options.active); if (options.disabled) node.disabled = true; node.addEventListener('click', (event) => { event.stopPropagation(); try { Promise.resolve(handler(event)).catch(reportError); } catch (error) { reportError(error); } }); return node; };
const renderNeteasePhoneLogin = () => {
  const box = make('div', 'echo-streaming-phone-login');
  box.append(make('strong', '', ncmCopy.phoneLogin));
  const row = make('div', 'echo-streaming-phone-row');
  const country = document.createElement('input');
  country.type = 'text';
  country.value = state.neteaseCountry;
  country.placeholder = ncmCopy.country;
  country.addEventListener('input', () => { state.neteaseCountry = country.value; });
  const phone = document.createElement('input');
  phone.type = 'tel';
  phone.value = state.neteasePhone;
  phone.placeholder = ncmCopy.phone;
  phone.addEventListener('input', () => { state.neteasePhone = phone.value; });
  row.append(country, phone);
  const captchaRow = make('div', 'echo-streaming-phone-row');
  const captcha = document.createElement('input');
  captcha.type = 'text';
  captcha.value = state.neteaseCaptcha;
  captcha.placeholder = ncmCopy.captcha;
  captcha.addEventListener('input', () => { state.neteaseCaptcha = captcha.value; });
  captchaRow.append(captcha, actionButton(ncmCopy.sendCaptcha, 'refresh', async () => {
    await invokeMain('neteaseCaptcha', { phone: state.neteasePhone, ctcode: state.neteaseCountry || '86' });
    state.accountMessages.netease = ncmCopy.captchaSent;
    refreshAccountPage();
  }, { className: 'settings-action-button' }));
  const password = document.createElement('input');
  password.type = 'password';
  password.value = state.neteasePassword;
  password.placeholder = ncmCopy.password;
  password.addEventListener('input', () => { state.neteasePassword = password.value; });
  box.append(row, captchaRow, password, actionButton(ncmCopy.phoneLogin, 'check', async () => {
    const result = await invokeMain('neteasePhoneLogin', {
      phone: state.neteasePhone,
      captcha: state.neteaseCaptcha,
      password: state.neteasePassword,
      countrycode: state.neteaseCountry || '86',
    });
    if (!result?.cookie) throw new Error(ncmCopy.needLogin);
    const saved = await accountApi().saveCookie('netease', result.cookie);
    if (saved?.status) mergeAccountStatus(saved.status);
    state.neteaseCaptcha = '';
    state.neteasePassword = '';
    state.accountMessages.netease = ncmCopy.loggedIn;
    await loadAccountStatuses();
    refreshAccountPage();
  }, { className: 'settings-action-button settings-account-login-button' }));
  return box;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const trackKey = (track) => String(track?.stableKey || track?.id || `streaming:${track?.provider || ''}:${track?.providerTrackId || ''}`);
const favoriteKey = (track) => `${track?.provider || ''}:${track?.providerTrackId || ''}`;
const formatDuration = (duration) => { if (!duration || !Number.isFinite(Number(duration)) || Number(duration) <= 0) return '--:--'; const seconds = Math.round(Number(duration)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
const formatTrackCount = (count) => `${count ?? 0} ${Number(count) === 1 ? (chinese ? '首' : 'track') : (chinese ? '首' : 'tracks')}`;
const formatAlbumDuration = (tracks) => { const total = (tracks || []).reduce((sum, item) => sum + (Number(item.duration) || 0), 0); if (total <= 0) return null; const minutes = Math.round(total / 60); const hours = Math.floor(minutes / 60); return hours ? `${hours} ${chinese ? '小时' : 'hr'} ${minutes % 60} ${chinese ? '分钟' : 'min'}` : `${minutes} ${chinese ? '分钟' : 'min'}`; };
const artistName = (artist) => { const name = String(artist?.name || '').trim(); return name && name !== 'Unknown Artist' ? name : String(artist?.providerArtistId || 'Unknown Artist'); };
const streamTrackArtists = (track) => Array.isArray(track?.artists) ? track.artists : [];
const providerStatus = (provider) => !provider?.enabled ? copy.disabled : provider.requiresAccount && !provider.accountConnected ? copy.notLoggedIn : provider.accountDisplayName ? copy.loggedIn(provider.accountDisplayName) : copy.available;
const sourceFor = (provider, label) => ({ type: 'streaming', label: label || `${copy.streaming} / ${provider}`, provider });
const streamingTrackWebUrl = (track) => { const id = encodeURIComponent(String(track?.providerTrackId || '')); switch (track?.provider) { case 'netease': return `https://music.163.com/#/song?id=${id}`; case 'qqmusic': return `https://y.qq.com/n/ryqq/songDetail/${id}`; case 'kugou': return `https://www.kugou.com/song/#hash=${encodeURIComponent(String(track.providerTrackId).split('.')[0])}`; case 'spotify': return `https://open.spotify.com/track/${id}`; case 'tidal': return `https://tidal.com/track/${id}`; case 'soundcloud': return String(track.providerTrackId || '').startsWith('http') ? track.providerTrackId : `https://soundcloud.com/search/sounds?q=${encodeURIComponent(`${track.artist || ''} ${track.title || track.providerTrackId || ''}`)}`; case 'bilibili': return `https://www.bilibili.com/video/${id}`; case 'youtube': return `https://www.youtube.com/watch?v=${id}`; default: return null; } };
const streamingPlaylistWebUrl = (playlist) => { const id = encodeURIComponent(String(playlist?.providerPlaylistId || '')); switch (playlist?.provider) { case 'netease': return `https://music.163.com/#/playlist?id=${id}`; case 'qqmusic': return `https://y.qq.com/n/ryqq/playlist/${id}`; case 'kugou': return `https://www.kugou.com/yy/special/single/${id}.html`; case 'spotify': return `https://open.spotify.com/playlist/${id}`; case 'tidal': return `https://tidal.com/playlist/${id}`; case 'soundcloud': return String(playlist?.providerPlaylistId || '').startsWith('http') ? playlist.providerPlaylistId : `https://soundcloud.com/search/sets?q=${encodeURIComponent(playlist?.title || '')}`; default: return playlist?.webUrl || null; } };
const toLibraryTrack = (track, quality = state.quality) => ({ id: trackKey(track), mediaType: 'streaming', path: trackKey(track), provider: track.provider, providerTrackId: track.providerTrackId, streamingQuality: quality, stableKey: trackKey(track), title: track.title || '', artist: track.artist || '', album: track.album || '', albumArtist: track.albumArtist || track.artist || '', trackNo: null, discNo: null, year: null, genre: null, duration: Number(track.duration) || 0, codec: null, sampleRate: null, bitDepth: null, bitrate: null, coverId: null, coverThumb: track.coverThumb || track.coverUrl || defaultCover, fieldSources: { title: track.provider, artist: track.provider, album: track.provider }, unavailable: track.playable === false });
const asLibraryTrack = (track, quality = state.quality) => {
  if (track?.mediaType === 'streaming' && track?.providerTrackId) {
    const key = track.stableKey || track.id || trackKey(track);
    return { ...track, id: key, path: key, streamingQuality: quality || track.streamingQuality || state.quality, stableKey: key };
  }
  return toLibraryTrack(track, quality);
};
const toPlayableTrack = (track, quality = state.quality) => {
  const item = asLibraryTrack(track, quality);
  const resolved = item.streamingQuality || item.quality || quality || state.quality;
  return { mediaType: 'streaming', trackId: item.id || item.trackId || trackKey(item), provider: item.provider, providerTrackId: item.providerTrackId, quality: resolved, streamingQuality: resolved, stableKey: item.stableKey || item.id || trackKey(item), title: item.title || '', artist: item.artist || '', album: item.album || '', albumArtist: item.albumArtist || item.artist || '', duration: Number(item.duration) || 0, coverThumb: item.coverThumb || defaultCover, playable: item.unavailable !== true && item.playable !== false, unavailableReason: item.unavailableReason || null };
};

const playerApi = () => external.player || window.__echoExternalPlayer;
const findPlaybackQueue = () => playerApi()?.queue?.() || null;
const playbackQualitiesFor = (track, quality) => {
  const requested = quality || state.quality;
  if (String(track?.provider) !== 'bilibili') return [requested];
  return [requested, 'high', 'standard', 'lossless'].filter((item, index, all) => item && all.indexOf(item) === index);
};
let togetherOnLocalPlay = async () => {};
let applyTogetherSnapshot = () => {};
let paintTogetherChrome = () => {};
let togetherInviteFlow = async () => {};
let disposeTogetherChrome = () => {};
const playViaQueue = async (track, options = {}) => {
  const qualities = playbackQualitiesFor(track, options.quality || state.quality);
  let lastError = null;
  for (const [index, quality] of qualities.entries()) {
    try {
      const item = asLibraryTrack(track, quality);
      const player = playerApi();
      const played = player?.playTrack
        ? await player.playTrack(item, { ...options, quality, forceRefresh: options.forceRefresh === true || index > 0 })
        : await (async () => {
          const playback = playbackApi();
          if (!playback?.playMediaItem) throw new Error(copy.noBridge);
          return playback.playMediaItem({
            item: toPlayableTrack(item, quality),
            startSeconds: options.startSeconds,
            forceRefresh: options.forceRefresh === true || index > 0,
          });
        })();
      if (!options.togetherRemote) void togetherOnLocalPlay(track, options);
      return played;
    } catch (error) {
      lastError = error;
    }
  }
  if (track?.provider === 'netease' && !options.unblockTried && /^\d+$/u.test(String(track.providerTrackId || ''))) {
    try {
      await invokeMain('neteaseUnblock', { id: track.providerTrackId, force: true });
      return await playViaQueue(track, { ...options, unblockTried: true, forceRefresh: true });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(copy.unavailable);
};
const appendViaQueue = (track, source) => {
  const player = playerApi();
  if (player?.append) return player.append(asLibraryTrack(track), source);
  throw new Error(copy.noBridge);
};
let prepareTimer = 0;
let prepareInFlight = null;
let prepareKey = '';
const cancelPlaybackPrepare = () => { window.clearTimeout(prepareTimer); prepareTimer = 0; prepareKey = ''; };
const schedulePlaybackPrepare = (track) => {
  cancelPlaybackPrepare();
  const playback = playbackApi();
  if (!track || track.playable === false || !playback?.prepareMediaItem) return;
  const key = `${trackKey(track)}:${state.quality}`;
  prepareKey = key;
  prepareTimer = window.setTimeout(() => {
    prepareTimer = 0;
    if (prepareKey !== key || prepareInFlight) return;
    const work = Promise.resolve(playback.prepareMediaItem({ item: toPlayableTrack(track, state.quality) })).catch(() => undefined).finally(() => { if (prepareInFlight === work) prepareInFlight = null; });
    prepareInFlight = work;
  }, 180);
};
const playCurrentStableKey = () => { const current = findPlaybackQueue()?.currentTrack; return current?.mediaType === 'streaming' ? String(current.stableKey || current.id || '') : ''; };
const favoriteIdsFromSnapshot = (snapshot) => { const ids = {}; for (const items of Object.values(snapshot?.providers || {})) for (const item of items || []) ids[`${item.provider}:${item.providerTrackId}`] = true; for (const collection of snapshot?.collections || []) for (const item of collection.tracks || []) ids[`${item.provider}:${item.providerTrackId}`] = true; return ids; };
const persistMemory = () => { try { external.settings?.set?.({ provider: state.provider, quality: state.quality, downloadQuality: state.downloadQuality, activeTab: state.activeTab, input: state.input, query: state.query, resultKey: state.result ? `${state.provider}:${state.activeTab}:${state.query.trim().toLocaleLowerCase()}` : null, result: state.result, failedCoverUrls: state.failedCoverUrls, scrollTop: state.scrollTop, recentSearches: state.recentSearches, dailyPlaylists: state.dailyPlaylists, dailyLastRefreshAt: state.dailyLastRefreshAt, dailySyncedKeys: state.dailySyncedKeys, autoRefreshDaily: state.autoRefreshDaily, autoSyncDaily: state.autoSyncDaily, similarAutoPlay: ncmUi.similarAutoPlay, similarCount: ncmUi.similarCount }); } catch {} };
const rememberSearch = (query) => { const value = String(query || '').trim(); if (!value) return; state.recentSearches = [value, ...state.recentSearches.filter((item) => item !== value)].slice(0, 8); };
const providerRailState = (provider) => accountAwareProviders.has(provider?.name) && provider.accountConnected !== true ? 'signedOut' : !provider?.enabled ? 'disabled' : accountAwareProviders.has(provider?.name) ? 'signedIn' : 'available';
const providerRailStatus = (provider) => { const rail = providerRailState(provider); return rail === 'disabled' ? copy.disabled : rail === 'signedOut' ? copy.notLoggedIn : rail === 'signedIn' ? copy.loggedIn(provider.accountDisplayName || provider.displayName) : copy.available; };
let packageDisposed = false;
void (async () => { try { const url = typeof external.assetUrl === 'function' ? `${external.assetUrl('spatial.css')}?v=${encodeURIComponent(manifest.version || '0')}&t=${Date.now()}` : null; const css = url ? await (await fetch(url, { cache: 'no-store' })).text() : await external.loadAsset('spatial.css'); if (!css || packageDisposed) return; const style = document.getElementById('echo-community-streaming-spatial') || document.createElement('style'); style.id = 'echo-community-streaming-spatial'; style.textContent = String(css) + (config.hideUnavailable === true ? '\n.streaming-row[data-unavailable="true"] { display: none; }' : ''); if (!style.isConnected) document.head.append(style); } catch {} })();
const showChromeNotice = (message) => window.dispatchEvent(new CustomEvent('app:show-chrome-notice', { detail: message }));
const reportError = (error) => { if (disposed) return; state.actionError = error instanceof Error ? error.message : String(error); state.actionMessage = null; render(); };
const setMessage = (message) => { state.actionError = null; state.actionMessage = message; render(); };
const visibleLyricsTracks = () => state.selectedAlbumDetail ? (state.selectedAlbumDetail.tracks || []).slice(0, state.albumTrackLimit) : state.selectedArtistDetail ? (state.selectedArtistDetail.topTracks || []) : state.selectedPlaylistDetail ? (state.selectedPlaylistDetail.tracks || []).slice(0, state.playlistTrackLimit) : (state.result?.tracks || []);
const providerSupportsLyrics = (track) => track?.lyricsStatus !== 'missing' && state.providers.find((item) => item.name === track?.provider)?.supportsLyrics !== false;
const openLyrics = async (track) => { if (!track || !providerSupportsLyrics(track)) { state.actionError = lyricsCopy.missing; state.actionMessage = null; render(); return; } try { await playViaQueue(track, { source: sourceFor(track.provider, `${copy.streaming} / ${track.provider}`), forceNewQueueItem: true }); window.dispatchEvent(new CustomEvent('app:navigate:lyrics')); } catch (error) { state.actionError = error instanceof Error ? error.message : String(error); state.actionMessage = null; render(); } };
const closeLyrics = () => { state.lyricsRequestId += 1; state.selectedLyricsTrack = null; state.selectedLyrics = null; state.lyricsLoading = false; state.lyricsError = null; render(); };
const renderLyricsDetail = () => { const track = state.selectedLyricsTrack || {}; const result = state.selectedLyrics; const page = make('div', 'streaming-page streaming-hub'); page.append(actionButton(lyricsCopy.back, 'arrow', closeLyrics, { className: 'album-back-button', title: lyricsCopy.back })); const hero = make('section', 'streaming-hero'); const cover = make('div', 'album-detail-cover'); appendCover(cover, track.coverThumb || track.coverUrl || defaultCover, trackKey(track)); hero.append(cover); const heading = make('div', 'streaming-hero-copy'); heading.append(make('span', 'streaming-kicker', lyricsCopy.open), make('h1', '', track.title || ''), make('p', '', track.artist || '')); const meta = make('div', 'album-detail-meta'); [track.provider, result?.sourceLabel ? `${lyricsCopy.source}: ${result.sourceLabel}` : null, result?.instrumental ? lyricsCopy.instrumental : null].filter(Boolean).forEach((item) => meta.append(make('span', '', item))); heading.append(meta); hero.append(heading); page.append(hero); const shell = make('div', 'streaming-results-shell'); if (state.lyricsLoading) shell.append(make('div', 'streaming-results-empty', lyricsCopy.loading)); else if (state.lyricsError) shell.append(make('div', 'streaming-state streaming-state--error', state.lyricsError)); else if (!result || result.status === 'missing' || (!result.lines?.length && !result.plainLyrics)) shell.append(make('div', 'streaming-results-empty', lyricsCopy.missing)); else { const lyrics = make('div', 'streaming-lyrics'); if (result.lines?.length) result.lines.forEach((line) => { const item = make('p', '', line.text || ''); if (line.translation || line.romanization) item.append(make('small', '', [line.translation, line.romanization].filter(Boolean).join(' / '))); lyrics.append(item); }); else lyrics.textContent = result.plainLyrics || ''; shell.append(lyrics); } page.append(shell); return page; };
const attachLyricsActions = () => { if (!pageRoot || state.selectedLyricsTrack) return; const tracks = visibleLyricsTracks(); pageRoot.querySelectorAll('.streaming-row').forEach((row, index) => { if (row.querySelector('[data-echo-streaming-lyrics]')) return; const track = tracks[index]; if (!track || !providerSupportsLyrics(track)) return; const actions = row.querySelector('.streaming-actions'); if (!actions) return; const button = actionButton(lyricsCopy.open, 'music', () => openLyrics(track), { iconOnly: true, title: lyricsCopy.open, ariaLabel: lyricsCopy.open, className: 'streaming-icon-button' }); button.dataset.echoStreamingLyrics = 'true'; actions.append(button); }); };
const indexDownloadJobs = (jobs) => { state.downloadJobIdsByTrackKey = Object.fromEntries((jobs || []).filter((job) => job?.streamingStableKey && job?.id).map((job) => [job.streamingStableKey, job.id])); };
const notifyDownloadJob = (job) => { if (!job || !['completed', 'failed'].includes(job.status) || state.notifiedDownloadStatuses[job.id] === job.status) return; state.notifiedDownloadStatuses[job.id] = job.status; showChromeNotice(job.status === 'completed' ? (chinese ? `下载完成：${job.title || ''}` : `Download completed: ${job.title || ''}`) : (chinese ? `下载失败：${job.title || ''}${job.error ? ` - ${job.error}` : ''}` : `Download failed: ${job.title || ''}${job.error ? ` - ${job.error}` : ''}`)); };
const appendCover = (parent, source, key, avatar = false) => { const cover = make('div', `streaming-cover${avatar ? ' streaming-cover--avatar' : ''}`); const src = source || defaultCover; cover.dataset.empty = String(src === defaultCover); const image = document.createElement('img'); image.src = state.failedCoverUrls[key] === src ? defaultCover : src; image.alt = ''; image.decoding = 'async'; image.loading = 'lazy'; image.width = 56; image.height = 56; image.addEventListener('error', () => { if (src !== defaultCover) { state.failedCoverUrls[key] = src; persistMemory(); image.src = defaultCover; cover.dataset.empty = 'true'; } }); cover.append(image); parent.append(cover); return cover; };

const appendTrackCredits = (parent, track) => { const credits = make('span', 'streaming-credit-links'); const artists = streamTrackArtists(track); if (artists.length) artists.forEach((artist, index) => { const part = make('span', 'streaming-credit-part'); if (index) part.append(make('span', 'streaming-credit-separator', ', ')); const link = make('button', 'streaming-inline-link', artist.name || artist.providerArtistId || 'Unknown Artist'); link.type = 'button'; link.addEventListener('click', (event) => { event.stopPropagation(); openArtist({ id: artist.id, provider: artist.provider, providerArtistId: artist.providerArtistId, name: artist.name, avatarUrl: null, coverUrl: null }); }); part.append(link); credits.append(part); }); else credits.append(make('span', '', track.artist || 'Unknown Artist')); credits.append(make('span', 'streaming-credit-separator', ' / ')); if (track.albumId) { const link = make('button', 'streaming-inline-link', track.album || ''); link.type = 'button'; link.addEventListener('click', (event) => { event.stopPropagation(); openAlbum({ id: `streaming:${track.provider}:album:${track.albumId}`, provider: track.provider, providerAlbumId: track.albumId, title: track.album, artist: track.albumArtist || track.artist, artists: track.artists, coverUrl: track.coverUrl, coverThumb: track.coverThumb, releaseDate: null, trackCount: null }); }); credits.append(link); } else credits.append(make('span', '', track.album || '')); parent.append(credits); };
const downloadJobFor = (track) => { const id = state.downloadJobIdsByTrackKey[trackKey(track)]; return id ? state.downloadJobs.find((job) => job.id === id) || null : null; };
const appendDownloadStatus = (parent, job) => { if (!job) return; const progress = clamp(job.progress, 0, 100); const labels = { queued: '排队中', probing: '解析链接', downloading: '下载中', extracting_audio: '提取音频', importing: '导入曲库', binding_mv: '绑定 MV', completed: '下载成功', failed: '下载失败', cancelled: '已取消' }; const box = make('div', 'streaming-download-progress'); box.dataset.status = job.status; const track = make('div', 'streaming-download-progress-track'); track.setAttribute('role', 'progressbar'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); track.setAttribute('aria-valuenow', String(Math.round(progress))); const fill = make('span'); fill.style.width = `${progress}%`; track.append(fill); box.append(track, make('small', '', `${labels[job.status] || job.status} · ${Math.round(progress)}%`)); if (job.status === 'failed' && job.error) box.append(make('small', '', job.error)); parent.append(box); };
let dismissStreamMenu = null;
const closeStreamMenu = () => { const dismiss = dismissStreamMenu; dismissStreamMenu = null; dismiss?.(); };
// Mounts a node on document.body near the cursor and wires the usual light
// dismissal (outside pointer, Escape, window blur). Returns a repositioner so
// panels that grow asynchronously can stay inside the viewport.
const openCursorPanel = (event, node) => {
  event.preventDefault();
  event.stopPropagation();
  closeStreamMenu();
  document.body.append(node);
  const place = () => {
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.round(Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8)))}px`;
    node.style.top = `${Math.round(Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8)))}px`;
  };
  place();
  const onPointerDown = (pointerEvent) => { if (!node.contains(pointerEvent.target)) closeStreamMenu(); };
  const onKeyDown = (keyEvent) => { if (keyEvent.key === 'Escape') closeStreamMenu(); };
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', closeStreamMenu);
  dismissStreamMenu = () => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', closeStreamMenu);
    node.remove();
  };
  return place;
};
const openStreamMenu = (event, entries) => {
  const items = (entries || []).filter(Boolean);
  if (!items.length) return;
  const menu = make('div', 'echo-streaming-context-menu');
  menu.setAttribute('role', 'menu');
  items.forEach((entry) => {
    const item = make('button', 'echo-streaming-context-menu-item');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    if (entry.icon) item.append(makeIcon(entry.icon, 15));
    const label = make('span');
    label.append(make('strong', '', entry.label));
    if (entry.hint) label.append(make('small', '', entry.hint));
    item.append(label);
    if (entry.disabled) item.disabled = true;
    item.addEventListener('click', () => { closeStreamMenu(); try { Promise.resolve(entry.onSelect?.()).catch(reportError); } catch (error) { reportError(error); } });
    menu.append(item);
  });
  openCursorPanel(event, menu);
};
const appendTrackRow = (parent, track, options = {}) => {
  const key = trackKey(track);
  const current = state.currentStableKey === key || playCurrentStableKey() === key;
  const job = downloadJobFor(track);
  const resolving = state.resolvingTrackKey === key;
  const downloading = state.downloadingTrackKey === key || Boolean(job && activeDownloadStatuses.has(job.status));
  const spatial = options.spatial === true;
  const currentProvider = state.providers.find((item) => item.name === (track.provider || state.provider));
  const row = make('article', 'streaming-row');
  row.dataset.playing = String(current);
  row.dataset.unavailable = String(track.playable === false);
  row.addEventListener('dblclick', () => void handlePlay(track));
  row.addEventListener('contextmenu', (event) => {
    if (state.musicDownloadKeys[key] === true) {
      openStreamMenu(event, [{ label: copy.downloadToMusic, hint: copy.downloading, icon: 'download', disabled: true }]);
      return;
    }
    openTrackDownloadPanel(event, track);
  });
  if (spatial) {
    row.addEventListener('mouseenter', () => schedulePlaybackPrepare(track));
    row.addEventListener('mouseleave', cancelPlaybackPrepare);
    row.append(make('span', 'streaming-row-index', String((options.index || 0) + 1)));
  }
  appendCover(row, track.coverThumb || track.coverUrl || defaultCover, key);
  const main = make('div', 'streaming-main');
  const titleLine = make('div', 'streaming-title-line');
  if (current) titleLine.append(make('span', 'playing-dot'));
  titleLine.append(make('strong', '', track.title || 'Untitled'));
  if (current) titleLine.append(make('em', '', copy.playing));
  main.append(titleLine);
  appendTrackCredits(main, track);
  if (!spatial) main.append(make('small', '', track.playable === false ? (track.unavailableReason || copy.unavailable) : `${track.provider} · ${trackQualitySummary(track)}`));
  row.append(main);
  if (spatial) {
    const meta = make('span', 'streaming-source-meta');
    meta.append(make('strong', '', currentProvider?.displayName || track.provider || ''));
    meta.append(make('small', '', track.playable === false ? (track.unavailableReason || copy.unavailable) : trackQualitySummary(track)));
    row.append(meta);
  }
  row.append(make('span', 'streaming-duration', formatDuration(track.duration)));
  const actions = make('div', 'streaming-actions');
  actions.addEventListener('dblclick', (event) => event.stopPropagation());
  const disabled = track.playable === false || Boolean(state.resolvingTrackKey);
  const playButton = actionButton(copy.play, 'play', () => handlePlay(track), { iconOnly: true, title: copy.play, ariaLabel: copy.play, disabled, className: 'streaming-icon-button' });
  if (spatial) {
    playButton.addEventListener('focus', () => schedulePlaybackPrepare(track));
    playButton.addEventListener('blur', cancelPlaybackPrepare);
  }
  actions.append(playButton);
  actions.append(actionButton(state.queuedTrackKey === key ? copy.queued : copy.queue, state.queuedTrackKey === key ? 'check' : 'list', () => handleAddToQueue(track), { iconOnly: true, title: copy.queue, ariaLabel: copy.queue, disabled: track.playable === false, className: 'streaming-icon-button' }));
  if (favoriteProviders.has(track.provider)) {
    const fav = state.favoriteTrackIds[favoriteKey(track)] === true;
    actions.append(actionButton(fav ? copy.unfavorite : copy.favorite, 'heart', () => handleToggleFavorite(track), { iconOnly: true, title: fav ? copy.unfavorite : copy.favorite, ariaLabel: fav ? copy.unfavorite : copy.favorite, active: fav, disabled: state.favoriteTrackKey === key, className: 'streaming-icon-button' }));
  }
  if (state.downloadEnabled && !unsupportedDownloadProviders.has(track.provider)) actions.append(actionButton(copy.download, downloading ? 'refresh' : 'download', () => handleDownload(track), { iconOnly: true, title: copy.download, ariaLabel: copy.download, disabled: downloading, className: 'streaming-icon-button' }));
  row.append(actions);
  if (resolving) row.append(make('div', 'streaming-resolving', copy.resolving));
  if (state.musicDownloadKeys[key] === true) {
    const musicProgress = make('div', 'streaming-resolving', `${copy.downloading}...`);
    musicProgress.dataset.musicDownloadKey = key;
    row.append(musicProgress);
  }
  appendDownloadStatus(row, job);
  parent.append(row);
};

const appendAlbumCard = (parent, album) => { const card = make('article', 'streaming-discovery-card'); card.setAttribute('role', 'button'); card.tabIndex = 0; card.addEventListener('click', () => openAlbum(album)); card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAlbum(album); } }); card.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); openStreamMenu(event, [{ label: copy.downloadAlbum, hint: musicMenuHint([album.artist, album.title].filter(Boolean).join(' - ') || album.title || ''), icon: 'download', disabled: Boolean(state.musicPlaylistDownload), onSelect: () => openAlbumDownloadFromCard(album) }]); }); appendCover(card, album.coverThumb || album.coverUrl || defaultCover, album.id); const main = make('div', 'streaming-main'); const line = make('div', 'streaming-title-line'); line.append(makeIcon('disc', 15), make('strong', '', album.title || 'Untitled')); main.append(line, make('span', '', album.artist || ''), make('small', '', `${album.provider} · ${album.trackCount ? formatTrackCount(album.trackCount) : (chinese ? '曲目数未知' : 'Track count unknown')}${album.releaseDate ? ` · ${album.releaseDate}` : ''}`)); card.append(main); parent.append(card); };
const appendArtistCard = (parent, artist) => { const card = make('article', 'streaming-discovery-card'); card.setAttribute('role', 'button'); card.tabIndex = 0; card.addEventListener('click', () => openArtist(artist)); card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openArtist(artist); } }); appendCover(card, artist.avatarUrl || artist.coverUrl || defaultCover, artist.id, true); const main = make('div', 'streaming-main'); const line = make('div', 'streaming-title-line'); line.append(makeIcon('user', 15), make('strong', '', artist.name || artist.providerArtistId || 'Unknown Artist')); main.append(line, make('span', '', artist.provider || ''), make('small', '', `${chinese ? '艺人 ID' : 'Artist ID'} · ${artist.providerArtistId || ''}`)); card.append(main); parent.append(card); };
const appendPlaylistCard = (parent, playlist) => { const card = make('article', 'streaming-discovery-card streaming-playlist-card'); card.setAttribute('role', 'button'); card.tabIndex = 0; card.addEventListener('click', () => openPlaylist(playlist)); card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPlaylist(playlist); } }); appendCover(card, playlist.coverThumb || playlist.coverUrl || defaultCover, playlist.id); const main = make('div', 'streaming-main'); const line = make('div', 'streaming-title-line'); line.append(makeIcon('list', 15), make('strong', '', playlist.title || 'Untitled')); main.append(line, make('span', '', playlist.creator || playlist.provider || ''), make('small', '', `${playlist.provider} · ${formatTrackCount(playlist.trackCount)}`)); card.append(main); const importing = state.importingPlaylistKey === playlist.id; card.append(actionButton(importing ? copy.adding : copy.add, 'list', () => handleImportStreamingPlaylist(playlist), { className: 'streaming-playlist-add', disabled: Boolean(state.importingPlaylistKey), title: importing ? copy.adding : copy.add })); card.addEventListener('contextmenu', (event) => openStreamMenu(event, [{ label: copy.downloadPlaylistToMusic, hint: musicMenuHint(playlist.title || ''), icon: 'download', disabled: Boolean(state.musicPlaylistDownload), onSelect: () => openPlaylistDownloadDialog(playlist) }])); parent.append(card); };
const appendAccountPlaylistRow = (parent, playlist) => { const row = make('div', 'streaming-account-playlist-row'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = state.selectedAccountPlaylistIds[playlist.providerPlaylistId] === true; checkbox.disabled = Object.keys(state.syncingAccountPlaylistIds).length > 0; checkbox.setAttribute('aria-label', `${copy.selectAll} ${playlist.title}`); checkbox.addEventListener('change', () => { state.selectedAccountPlaylistIds[playlist.providerPlaylistId] = checkbox.checked; render(); }); row.append(checkbox); appendCover(row, playlist.coverThumb || playlist.coverUrl || defaultCover, playlist.id); const main = make('span', 'streaming-account-playlist-main'); main.append(make('strong', '', playlist.title || 'Untitled')); const ownership = playlist.ownership === 'created' ? copy.created : playlist.ownership === 'favorited' ? copy.favorited : copy.accountPlaylist; main.append(make('small', '', `${ownership} · ${formatTrackCount(playlist.trackCount)}${playlist.creator ? ` · ${playlist.creator}` : ''}`)); row.append(main); const syncing = state.syncingAccountPlaylistIds[playlist.providerPlaylistId] === true; row.append(actionButton(syncing ? copy.syncing : copy.add, syncing ? 'refresh' : 'list', () => requestAccountPlaylistSync([playlist]), { className: 'streaming-account-playlist-add-one', disabled: Object.keys(state.syncingAccountPlaylistIds).length > 0, title: syncing ? copy.syncing : copy.add })); row.addEventListener('click', (event) => { if (event.target.closest('input, button')) return; openPlaylist(playlist); }); row.addEventListener('contextmenu', (event) => openStreamMenu(event, [{ label: copy.downloadPlaylistToMusic, hint: musicMenuHint(playlist.title || ''), icon: 'download', disabled: Boolean(state.musicPlaylistDownload), onSelect: () => openPlaylistDownloadDialog(playlist) }])); parent.append(row); };

const renderNoticeModal = () => { if (!state.noticeOpen) return null; const backdrop = make('div', 'settings-modal-backdrop settings-streaming-notice-backdrop'); backdrop.dataset.state = 'open'; backdrop.addEventListener('mousedown', () => cancelNotice()); const dialog = make('section', 'settings-font-modal settings-streaming-notice-modal'); dialog.dataset.state = 'open'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'settings-streaming-notice-title'); dialog.addEventListener('mousedown', (event) => event.stopPropagation()); const header = make('header', 'settings-font-modal-header'); const heading = make('div', 'settings-streaming-notice-heading'); heading.append(makeIcon('shield', 18), make('h3', '', copy.noticeTitle)); header.append(heading, actionButton(copy.close, 'close', cancelNotice, { iconOnly: true, className: 'settings-icon-button', title: copy.noticeClose })); dialog.append(header); const body = make('div', 'settings-streaming-notice-body'); body.append(make('p', '', copy.noticeBody)); const list = make('ul'); copy.noticeItems.forEach((item) => list.append(make('li', '', item))); body.append(list, make('p', '', copy.noticeAcceptance)); dialog.append(body); const label = make('label', 'settings-danger-confirm-field settings-streaming-notice-confirm'); label.append(make('span', '', copy.consentInput(copy.consentPhrase))); const input = document.createElement('input'); input.value = state.noticeConsent; input.autofocus = true; input.addEventListener('input', () => { state.noticeConsent = input.value; confirm.disabled = input.value.trim() !== copy.consentPhrase; }); input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && input.value.trim() === copy.consentPhrase) confirmNotice(); }); label.append(input); dialog.append(label); const actions = make('div', 'settings-streaming-notice-actions'); actions.append(actionButton(copy.noticeCancel, null, cancelNotice, { className: 'settings-action-button' })); const confirm = actionButton(copy.noticeConfirm, null, confirmNotice, { className: 'settings-danger-button', disabled: state.noticeConsent.trim() !== copy.consentPhrase }); actions.append(confirm); dialog.append(actions); backdrop.append(dialog); return backdrop; };
const renderGate = () => { const page = make('div', 'streaming-page streaming-hub'); const empty = make('div', 'streaming-results-empty'); const gate = make('div', 'streaming-entry-notice-gate'); gate.append(make('strong', '', copy.noticeTitle), make('span', '', copy.noticeAcceptance)); gate.append(actionButton(copy.noticeTitle, null, () => { state.noticeOpen = true; render(); }, { className: 'streaming-load-more' })); empty.append(gate); page.append(empty); if (state.noticeOpen) page.append(renderNoticeModal()); return page; };

const albumTitleClass = (title) => {
  const length = String(title || '').length;
  if (length > 32) return 'album-detail-title album-detail-title--very-long';
  if (length > 18) return 'album-detail-title album-detail-title--long';
  return 'album-detail-title';
};
const appendNativeCover = (parent, source, key, size = 320) => {
  const src = source || defaultCover;
  parent.dataset.empty = String(src === defaultCover);
  const image = document.createElement('img');
  image.src = state.failedCoverUrls[key] === src ? defaultCover : src;
  image.alt = '';
  image.decoding = 'async';
  image.draggable = false;
  image.width = size;
  image.height = size;
  image.addEventListener('error', () => {
    if (src === defaultCover) return;
    state.failedCoverUrls[key] = src;
    persistMemory();
    image.src = defaultCover;
    parent.dataset.empty = 'true';
  });
  parent.append(image);
  return image;
};
const bindDetailTrack = (node, track) => {
  const key = trackKey(track);
  node.addEventListener('click', () => void handlePlay(track));
  node.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (state.musicDownloadKeys[key] === true) {
      openStreamMenu(event, [{ label: copy.downloadToMusic, hint: copy.downloading, icon: 'download', disabled: true }]);
      return;
    }
    openTrackDownloadPanel(event, track);
  });
};
const appendAlbumTrackRow = (parent, track, index) => {
  const key = trackKey(track);
  const current = state.currentStableKey === key || playCurrentStableKey() === key;
  const row = make('button', 'album-track-row');
  row.type = 'button';
  row.setAttribute('role', 'listitem');
  row.dataset.playing = String(current);
  row.dataset.unavailable = String(track.playable === false);
  bindDetailTrack(row, track);
  const number = make('span', 'album-track-number');
  number.append(make('span', '', String(index + 1)));
  const playIcon = makeIcon('play', 13);
  playIcon.classList.add('album-track-row-play');
  number.append(playIcon);
  const copyBox = make('span', 'album-track-copy');
  copyBox.append(make('strong', '', track.title || 'Untitled'), make('small', '', track.artist || ''));
  const tags = make('span', 'album-track-tags');
  tags.append(make('em', '', track.album || track.provider || ''));
  row.append(number, copyBox, tags, make('span', 'album-track-duration', formatDuration(track.duration)), make('span', 'album-track-actions'));
  parent.append(row);
};
const appendPlaylistTrackRow = (parent, track) => {
  const key = trackKey(track);
  const current = state.currentStableKey === key || playCurrentStableKey() === key;
  const row = make('div', 'track-row');
  row.dataset.playing = String(current);
  row.dataset.clickable = 'true';
  row.dataset.unavailable = String(track.playable === false);
  row.setAttribute('role', 'listitem');
  row.tabIndex = 0;
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void handlePlay(track);
    }
  });
  bindDetailTrack(row, track);
  const cover = make('div', 'track-cover');
  appendNativeCover(cover, track.coverThumb || track.coverUrl || defaultCover, key, 96);
  const main = make('div', 'track-main');
  const titleRow = make('div', 'track-title-row');
  if (current) titleRow.append(make('span', 'playing-dot'));
  titleRow.append(make('strong', 'track-title', track.title || 'Untitled'));
  if (track.playable === false) titleRow.append(make('span', 'playing-pill unavailable-pill', track.unavailableReason || copy.unavailable));
  const subtitle = make('div', 'track-subtitle');
  subtitle.append(make('span', '', track.artist || ''));
  if (track.album) subtitle.append(make('span', 'track-subtitle-separator', ' - '), make('span', '', track.album));
  main.append(titleRow, subtitle);
  const actions = make('div', 'track-actions');
  actions.addEventListener('click', (event) => event.stopPropagation());
  actions.append(actionButton(copy.play, 'play', () => handlePlay(track), { iconOnly: true, className: 'row-action', title: copy.play, disabled: track.playable === false }));
  actions.append(actionButton(copy.queue, 'list', () => handleAddToQueue(track), { iconOnly: true, className: 'row-action', title: copy.queue, disabled: track.playable === false }));
  row.append(cover, main, make('span', 'track-duration', formatDuration(track.duration)), actions);
  parent.append(row);
};

const renderAlbumDetail = () => {
  const album = state.selectedAlbumDetail || state.selectedAlbum;
  const tracks = state.selectedAlbumDetail?.tracks || [];
  const page = make('div', 'album-detail-page');
  page.append(actionButton(copy.back, 'arrow', () => {
    state.selectedAlbum = null;
    state.selectedAlbumDetail = null;
    state.albumError = null;
    render();
  }, { className: 'album-back-button', title: copy.back }));
  const hero = make('section', 'album-detail-hero album-detail-switch-surface');
  const cover = make('div', 'album-detail-cover');
  appendNativeCover(cover, album?.coverThumb || album?.coverUrl || defaultCover, album?.id || album?.providerAlbumId, 320);
  hero.append(cover);
  const consoleBox = make('div', 'album-detail-console');
  const details = make('div', 'album-detail-copy');
  const title = make('h1', albumTitleClass(album?.title || ''), album?.title || '');
  details.append(make('span', 'album-detail-kicker', copy.albumKicker), title);
  if (album?.artist) details.append(make('span', 'album-detail-artist-link', album.artist));
  const meta = make('div', 'album-detail-meta');
  [album?.releaseDate, formatTrackCount(tracks.length || album?.trackCount), formatAlbumDuration(tracks), album?.provider].filter(Boolean).forEach((item) => meta.append(make('span', '', item)));
  details.append(meta);
  consoleBox.append(details);
  const actions = make('div', 'album-detail-actions');
  actions.append(actionButton(state.albumLoading ? copy.readingAlbum : copy.playNow, state.albumLoading ? 'refresh' : 'play', handlePlayAlbum, { className: 'album-primary-action', disabled: state.albumLoading || !tracks.length, title: copy.playNow }));
  const downloadable = tracks.filter((track) => canDownloadTrackToMusic(track)).length;
  actions.append(actionButton(state.musicPlaylistDownload ? copy.downloading : copy.downloadAlbum, state.musicPlaylistDownload ? 'refresh' : 'download', handleDownloadAlbum, { className: 'album-secondary-action', disabled: state.albumLoading || !downloadable || Boolean(state.musicPlaylistDownload), title: copy.downloadAlbum }));
  consoleBox.append(actions);
  if (state.albumError) consoleBox.append(make('p', 'album-detail-error', state.albumError));
  hero.append(consoleBox);
  const facts = make('aside', 'album-detail-facts');
  [[copy.source, album?.provider || ''], [copy.tracks, formatTrackCount(tracks.length || album?.trackCount)], [copy.released, album?.releaseDate || copy.unknown], [copy.quality, tracks.length ? trackQualitySummary(tracks[0]) : (chinese ? '读取中' : 'Reading signal')]].forEach(([label, value]) => {
    const fact = make('div', 'album-fact');
    fact.append(make('span', '', label), make('strong', '', value));
    facts.append(fact);
  });
  hero.append(facts);
  page.append(hero);
  const section = make('section', 'album-detail-track-console');
  const tabs = make('header', 'album-detail-tabs');
  const tab = make('button', 'album-detail-tab', copy.tracks);
  tab.type = 'button';
  tab.setAttribute('aria-current', 'page');
  tabs.append(tab);
  section.append(tabs);
  if (state.albumLoading && !tracks.length) section.append(make('p', 'album-detail-empty', chinese ? '正在读取专辑...' : 'Reading album...'));
  else if (!state.albumLoading && !tracks.length && !state.albumError) section.append(make('p', 'album-detail-empty', chinese ? '这张专辑没有可显示的歌曲。' : 'This album has no tracks to display.'));
  const list = make('div', 'album-track-list');
  list.setAttribute('role', 'list');
  const header = make('div', 'album-track-header');
  header.setAttribute('aria-hidden', 'true');
  header.append(make('span', '', '#'), make('span', '', copy.trackHeaderTitle), make('span', '', copy.album), make('span', '', copy.trackHeaderDuration));
  list.append(header);
  tracks.slice(0, state.albumTrackLimit).forEach((track, index) => appendAlbumTrackRow(list, track, index));
  if (tracks.length > state.albumTrackLimit) list.append(actionButton(copy.loadMore, null, () => { state.albumTrackLimit += albumTrackRenderStep; render(); }, { className: 'album-load-more' }));
  section.append(make('div', 'album-track-section', list));
  page.append(section);
  return page;
};
const renderArtistDetail = () => { const artist = state.selectedArtistDetail || state.selectedArtist; const name = artistName(artist); const page = make('div', 'streaming-artist-page'); page.append(actionButton(copy.back, 'arrow', () => { state.selectedArtist = null; state.selectedArtistDetail = null; state.artistError = null; render(); }, { className: 'streaming-artist-back', title: copy.back })); const hero = make('section', 'streaming-artist-hero'); const avatar = make('div', 'streaming-artist-avatar'); const src = artist?.coverUrl || artist?.avatarUrl; avatar.dataset.cover = String(Boolean(src)); if (src) { const image = document.createElement('img'); image.src = src; image.alt = ''; image.width = 512; image.height = 512; avatar.append(image); } else avatar.append(make('span', '', name.slice(0, 1).toUpperCase())); hero.append(avatar); const body = make('div', 'streaming-artist-copy'); body.append(make('span', 'streaming-artist-kicker', copy.artistKicker), make('h1', '', name)); const meta = make('div', 'streaming-artist-meta'); meta.append(make('span', '', artist?.provider || state.provider), make('span', '', formatTrackCount(state.selectedArtistDetail?.topTracks?.length || 0)), make('span', '', `${state.selectedArtistDetail?.albums?.length || 0} ${copy.albums.toLowerCase()}`)); body.append(meta, make('p', '', `${copy.streaming} catalog from ${artist?.provider || state.provider}.`)); const actions = make('div', 'streaming-artist-actions'); const top = state.selectedArtistDetail?.topTracks || []; actions.append(actionButton(state.artistLoading ? copy.readingArtist : copy.playArtist, state.artistLoading ? 'refresh' : 'play', handlePlayArtist, { className: 'streaming-artist-primary-action', disabled: state.artistLoading || !top.some((track) => track.playable), title: copy.playArtist }), actionButton(copy.addToQueue, 'list', handleQueueArtist, { className: 'streaming-artist-secondary-action', disabled: !top.some((track) => track.playable), title: copy.addToQueue }), actionButton(state.musicPlaylistDownload ? copy.downloading : copy.downloadTopTracks, state.musicPlaylistDownload ? 'refresh' : 'download', handleDownloadArtist, { className: 'streaming-artist-secondary-action', disabled: state.artistLoading || !top.some((track) => canDownloadTrackToMusic(track)) || Boolean(state.musicPlaylistDownload), title: copy.downloadTopTracks })); body.append(actions); if (state.artistError) body.append(make('p', 'streaming-artist-error', state.artistError)); hero.append(body); const stats = make('div', 'streaming-artist-stats'); [[copy.source, artist?.provider || state.provider], [copy.tracks, top.length], [copy.albums, state.selectedArtistDetail?.albums?.length || 0]].forEach(([label, value]) => { const item = make('div'); item.append(make('span', '', label), make('strong', '', value)); stats.append(item); }); hero.append(stats); page.append(hero); const trackSection = make('section', 'streaming-artist-section'); const heading = make('div', 'streaming-artist-section-heading'); const headingCopy = make('div'); headingCopy.append(make('span', '', copy.topTracks), make('h2', '', copy.songs)); heading.append(headingCopy); trackSection.append(heading); if (state.artistLoading && !top.length) trackSection.append(make('div', 'streaming-state', chinese ? '正在读取艺人...' : 'Reading artist...')); else if (!state.artistLoading && !top.length && !state.artistError) trackSection.append(make('div', 'streaming-state', chinese ? '这个艺人没有可显示的歌曲。' : 'This artist has no tracks to display.')); const list = make('div', 'streaming-artist-track-list'); top.forEach((track) => appendTrackRow(list, track)); trackSection.append(list); page.append(trackSection); const albums = state.selectedArtistDetail?.albums || []; if (albums.length) { const albumSection = make('section', 'streaming-artist-section'); const albumHeading = make('div', 'streaming-artist-section-heading'); const albumHeadingCopy = make('div'); albumHeadingCopy.append(make('span', '', copy.albums), make('h2', '', copy.discography)); albumHeading.append(albumHeadingCopy); albumSection.append(albumHeading); const albumList = make('div', 'streaming-artist-album-list'); albums.forEach((item) => appendAlbumCard(albumList, item)); albumSection.append(albumList); page.append(albumSection); } return page; };
const renderPlaylistDetail = () => {
  const playlist = state.selectedPlaylistDetail || state.selectedPlaylist;
  const tracks = state.selectedPlaylistDetail?.tracks || [];
  const coverSrc = playlist?.coverThumb || playlist?.coverUrl || defaultCover;
  const playable = tracks.filter((track) => track.playable !== false);
  const page = make('div', 'playlists-page streaming-playlist-page');
  const panel = make('div', 'playlist-detail-panel');
  const header = make('header', 'playlist-detail-header');
  header.style.cssText = 'display:grid;grid-template-columns:132px minmax(0,1fr);align-content:center;gap:14px 20px;';
  header.dataset.hasArt = String(Boolean(playlist?.coverThumb || playlist?.coverUrl));
  if (playlist?.coverThumb || playlist?.coverUrl) {
    const art = make('div', 'playlist-detail-hero-art');
    art.setAttribute('aria-hidden', 'true');
    appendNativeCover(art, coverSrc, playlist?.id || playlist?.providerPlaylistId, 640);
    header.append(art);
  }
  const cover = make('div', 'playlist-cover');
  appendNativeCover(cover, coverSrc, playlist?.id || playlist?.providerPlaylistId, 144);
  header.append(cover);
  const details = make('div', 'playlist-detail-copy');
  details.append(actionButton(copy.back, 'arrow', () => {
    state.selectedPlaylist = null;
    state.selectedPlaylistDetail = null;
    state.playlistError = null;
    render();
  }, { className: 'streaming-playlist-back', title: copy.back }));
  details.append(make('span', '', playlist?.dailyKind ? dailyKindLabel(playlist.dailyKind) : copy.playlistKicker));
  details.append(make('h2', '', playlist?.title || playlist?.name || ''));
  details.append(make('p', '', playlist?.creator || playlist?.provider || ''));
  details.append(make('small', '', [playlist?.provider, formatTrackCount(tracks.length || playlist?.trackCount), formatAlbumDuration(tracks)].filter(Boolean).join(' · ')));
  header.append(details);
  const actions = make('div', 'playlist-actions playlist-detail-primary-actions');
  actions.style.cssText = 'display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;align-self:start;gap:8px;width:auto;min-width:0;';
  const playlistAction = (label, iconName, handler, options = {}) => {
    const button = actionButton(label, iconName, handler, options);
    button.style.flex = '0 0 auto';
    button.style.width = 'auto';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    return button;
  };
  actions.append(playlistAction(state.playlistLoading ? copy.readingPlaylist : copy.playPlaylist, state.playlistLoading ? 'refresh' : 'play', handlePlayPlaylist, { className: 'primary-action', disabled: state.playlistLoading || !playable.length, title: copy.playPlaylist }));
  actions.append(playlistAction(copy.addToQueue, 'list', handleQueuePlaylist, { className: 'secondary-action', disabled: !playable.length, title: copy.addToQueue }));
  const downloadable = tracks.filter((track) => canDownloadTrackToMusic(track)).length;
  actions.append(playlistAction(state.musicPlaylistDownload ? copy.downloading : copy.downloadPlaylistToMusic, state.musicPlaylistDownload ? 'refresh' : 'download', () => openPlaylistDownloadDialog(state.selectedPlaylist || playlist), { className: 'secondary-action', disabled: state.playlistLoading || !downloadable || Boolean(state.musicPlaylistDownload), title: copy.downloadPlaylistToMusic }));
  if (playlist?.dailyKind || isVirtualDailyPlaylist(playlist)) {
    actions.append(playlistAction(state.refreshingDaily ? copy.dailyRefreshing : copy.dailyRefreshOne, 'refresh', async () => {
      await refreshDailyPlaylists([playlist]);
      await openPlaylist(asStreamingDailyPlaylist(playlist));
    }, { className: 'secondary-action', disabled: state.refreshingDaily, title: copy.dailyRefresh }));
    actions.append(playlistAction(copy.add, 'list', () => syncDailyPlaylists([playlist]), { className: 'secondary-action', title: copy.add }));
  } else if (!state.importingPlaylistKey) actions.append(playlistAction(copy.add, 'list', () => handleImportStreamingPlaylist(state.selectedPlaylist || playlist), { className: 'secondary-action', title: copy.add }));
  header.append(actions);
  panel.append(header);
  if (state.playlistError) panel.append(make('p', 'playlist-detail-error', state.playlistError));
  if (state.playlistLoading && !tracks.length) panel.append(make('div', 'list-footer', chinese ? '正在读取歌单...' : 'Reading playlist...'));
  else if (!state.playlistLoading && !tracks.length && !state.playlistError) panel.append(make('div', 'list-footer', copy.noPlaylistTracks));
  const list = make('div', 'playlist-track-list');
  list.setAttribute('role', 'list');
  tracks.slice(0, state.playlistTrackLimit).forEach((track) => appendPlaylistTrackRow(list, track));
  if (tracks.length > state.playlistTrackLimit) list.append(actionButton(copy.loadMore, null, () => { state.playlistTrackLimit += albumTrackRenderStep; render(); }, { className: 'streaming-load-more' }));
  panel.append(list);
  page.append(panel);
  return page;
};

const renderPlaylistPanel = (playlists) => { const panel = make('div', 'streaming-playlist-panel'); const form = make('form', 'streaming-playlist-import'); const copyBox = make('div', 'streaming-playlist-import-copy'); const copyTitle = make('span', '', copy.addPlaylist); copyTitle.prepend(makeIcon('link', 18)); copyBox.append(copyTitle, make('p', '', copy.playlistHint)); form.append(copyBox); const label = make('label'); label.append(makeIcon('link', 18)); const input = document.createElement('input'); input.value = state.playlistUrl; input.placeholder = copy.playlistPlaceholder; input.disabled = Boolean(state.importingPlaylistKey); input.addEventListener('input', () => { state.playlistUrl = input.value; }); label.append(input); form.append(label); form.append(actionButton(state.importingPlaylistKey ? copy.adding : copy.add, state.importingPlaylistKey ? 'refresh' : 'list', () => handleImportPlaylist(), { disabled: !state.playlistUrl.trim() || Boolean(state.importingPlaylistKey), title: copy.add })); form.addEventListener('submit', (event) => { event.preventDefault(); void handleImportPlaylist().catch(reportError); }); const sync = make('section', 'streaming-account-playlist-sync'); const syncCopy = make('div', 'streaming-playlist-import-copy'); const syncTitle = make('span', '', copy.syncPlaylists); syncTitle.prepend(makeIcon('refresh', 18)); syncCopy.append(syncTitle, make('p', '', copy.syncHint)); sync.append(syncCopy); const toolbar = make('div', 'streaming-account-playlist-toolbar'); if (state.accountPanelOpen) { const tabs = make('div', 'streaming-account-provider-tabs'); ['netease', 'qqmusic'].forEach((name) => { const descriptor = state.providers.find((item) => item.name === name); const tab = actionButton(descriptor?.displayName || (name === 'netease' ? '网易云音乐' : 'QQ 音乐'), null, () => { state.accountPlaylistProvider = name; state.accountPlaylists = []; state.selectedAccountPlaylistIds = {}; void loadAccountPlaylists(name); }, { className: name === state.accountPlaylistProvider ? 'active' : '', disabled: state.loadingAccountPlaylists || Object.keys(state.syncingAccountPlaylistIds).length > 0 }); if (descriptor?.accountConnected) tab.append(make('small', '', ` ${copy.signedIn}`)); tabs.append(tab); }); toolbar.append(tabs); } else toolbar.append(make('span', 'streaming-account-playlist-hint', state.providers.some((item) => (item.name === 'netease' || item.name === 'qqmusic') && item.accountConnected) ? copy.preferLoggedIn : copy.needLogin)); const stale = typeof streamApi()?.listAccountPlaylists !== 'function'; toolbar.append(actionButton(stale ? copy.restart : state.loadingAccountPlaylists ? copy.reading : state.accountPanelOpen ? copy.refresh : copy.syncMine, 'refresh', () => state.accountPanelOpen ? loadAccountPlaylists(state.accountPlaylistProvider) : openAccountPlaylistSync(), { className: 'streaming-playlist-add', disabled: stale || state.loadingAccountPlaylists || Object.keys(state.syncingAccountPlaylistIds).length > 0 })); sync.append(toolbar); if (state.accountPanelOpen) { const box = make('div', 'streaming-account-playlist-panel'); if (state.accountPlaylists.length) { const selection = make('div', 'streaming-account-playlist-selection'); const all = state.accountPlaylists.every((item) => state.selectedAccountPlaylistIds[item.providerPlaylistId] === true); selection.append(actionButton(all ? copy.deselectAll : copy.selectAll, all ? 'check' : 'list', () => { state.selectedAccountPlaylistIds = all ? {} : Object.fromEntries(state.accountPlaylists.map((item) => [item.providerPlaylistId, true])); render(); }, { className: 'streaming-inline-action' }), make('span', '', copy.selected(Object.values(state.selectedAccountPlaylistIds).filter(Boolean).length, state.accountPlaylists.length))); box.append(selection); const list = make('div', 'streaming-account-playlist-list'); state.accountPlaylists.forEach((item) => appendAccountPlaylistRow(list, item)); box.append(list); const actions = make('div', 'streaming-account-playlist-actions'); actions.append(make('span', '', state.accountPlaylistProvider), actionButton(copy.syncSelected, 'list', () => requestAccountPlaylistSync(state.accountPlaylists.filter((item) => state.selectedAccountPlaylistIds[item.providerPlaylistId])), { className: 'streaming-playlist-add', disabled: !state.accountPlaylists.some((item) => state.selectedAccountPlaylistIds[item.providerPlaylistId]) || Object.keys(state.syncingAccountPlaylistIds).length > 0 })); box.append(actions); } else box.append(make('div', 'streaming-results-empty', state.loadingAccountPlaylists ? copy.loading : copy.noPlaylists)); sync.append(box); } panel.append(form); panel.append(renderDailyPlaylistPanel()); panel.append(sync); if (playlists.length) { const list = make('div', 'streaming-discovery-list'); playlists.forEach((item) => appendPlaylistCard(list, item)); panel.append(list); } return panel; };

const resetSearchInput = () => {
  liveSearchInput = null;
  searchComposing = false;
  searchRenderPending = false;
  searchCompositionEndedAt = 0;
};
const searchReadyToSubmit = (event) => !searchComposing && !event.isComposing && Date.now() - searchCompositionEndedAt > 180;
const ensureSearchInput = () => {
  if (liveSearchInput) return liveSearchInput;
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = copy.searchPlaceholder;
  searchInput.value = state.input;
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.addEventListener('compositionstart', () => {
    searchComposing = true;
    window.clearTimeout(searchTimer);
  });
  searchInput.addEventListener('compositionend', () => {
    searchComposing = false;
    searchCompositionEndedAt = Date.now();
    state.input = searchInput.value;
    persistMemory();
    if (searchRenderPending) {
      searchRenderPending = false;
      render();
    }
  });
  searchInput.addEventListener('input', () => {
    state.input = searchInput.value;
    persistMemory();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && searchReadyToSubmit(event)) {
      event.preventDefault();
      submitSearch(searchInput.value);
    }
  });
  liveSearchInput = searchInput;
  return searchInput;
};
const submitSearch = (value = state.input) => {
  window.clearTimeout(searchTimer);
  state.input = String(value || '');
  state.query = state.input.trim();
  if (liveSearchInput && liveSearchInput.value !== state.input && !searchComposing) liveSearchInput.value = state.input;
  persistMemory();
  void runSearch(1, 'replace');
};
const renderMain = () => {
  const page = make('div', 'streaming-page streaming-hub streaming-hub--spatial');
  const currentProvider = state.providers.find((item) => item.name === state.provider) || { displayName: state.provider };
  const activeEntries = state.activeTab === 'album' ? state.result?.albums || [] : state.activeTab === 'artist' ? state.result?.artists || [] : state.activeTab === 'playlist' ? state.result?.playlists || [] : state.result?.tracks || [];
  const resultSummary = state.query ? (state.loading && !activeEntries.length ? copy.searching : `${activeEntries.length} ${chinese ? '个结果' : 'results'}`) : copy.preparingSearch;

  const rail = make('aside', 'streaming-source-rail');
  rail.setAttribute('aria-label', copy.providers);
  const heading = make('div', 'streaming-source-rail-heading');
  heading.append(make('span', '', copy.providers), make('small', '', String(state.providers.filter((item) => item.enabled).length)));
  rail.append(heading);
  const sourceList = make('div', 'streaming-source-list');
  state.providers.forEach((provider) => {
    const tab = actionButton('', null, () => {
      if (!provider.enabled) return;
      state.provider = provider.name;
      state.failedCoverUrls = {};
      void runSearch(1, 'replace');
    }, { disabled: !provider.enabled, title: provider.displayName || provider.name, ariaLabel: provider.displayName || provider.name });
    tab.dataset.active = String(provider.name === state.provider);
    const status = make('i');
    status.setAttribute('aria-hidden', 'true');
    status.dataset.status = providerRailState(provider);
    const label = make('span');
    label.append(make('strong', '', provider.displayName || provider.name), make('small', '', providerRailStatus(provider)));
    tab.replaceChildren(status, label);
    if (provider.name === state.provider) tab.append(make('span', 'streaming-source-active-dot'));
    sourceList.append(tab);
  });
  rail.append(sourceList);
  const recent = make('div', 'streaming-recent-searches');
  const recentHeading = make('div');
  recentHeading.append(make('span', '', copy.recentSearches), make('small', '', String(state.recentSearches.length)));
  recent.append(recentHeading);
  state.recentSearches.forEach((value) => {
    const chip = actionButton(value, 'search', () => submitSearch(value), { title: value });
    chip.dataset.active = String(value === state.query);
    chip.replaceChildren(makeIcon('search', 13), make('span', '', value));
    recent.append(chip);
  });
  rail.append(recent);
  page.append(rail);

  const workspace = make('main', 'streaming-workspace');
  const hero = make('header', 'streaming-hero');
  const heroCopy = make('div', 'streaming-hero-copy');
  const kicker = make('span', 'streaming-kicker');
  kicker.append(makeIcon('radio', 16), copy.streaming);
  heroCopy.append(kicker, make('h1', '', copy.streamingTitle), make('p', '', copy.streamingDescription));
  hero.append(heroCopy);
  const providerTabs = make('div', 'streaming-provider-tabs');
  providerTabs.setAttribute('aria-label', copy.providers);
  state.providers.forEach((provider) => {
    const tab = make('span');
    tab.dataset.active = String(provider.name === state.provider);
    tab.dataset.disabled = String(!provider.enabled);
    tab.append(make('span', '', provider.displayName || provider.name));
    providerTabs.append(tab);
  });
  hero.append(providerTabs);
  workspace.append(hero);

  const command = make('section', 'streaming-command-panel');
  const searchLabel = make('label', 'search-box streaming-search-box');
  searchLabel.append(makeIcon('search', 19));
  const searchInput = ensureSearchInput();
  searchInput.placeholder = copy.searchPlaceholder;
  if (document.activeElement !== searchInput && !searchComposing) searchInput.value = state.input;
  searchLabel.append(searchInput);
  command.append(searchLabel);
  command.append(actionButton(copy.searchSubmit, 'arrowRight', () => submitSearch(searchInput.value), { iconOnly: true, className: 'streaming-search-submit', title: copy.searchSubmit, ariaLabel: copy.searchPlaceholder }));
  const summary = make('div', 'streaming-command-summary');
  summary.setAttribute('aria-live', 'polite');
  summary.append(make('strong', '', currentProvider.displayName || state.provider), make('span', '', `${copy[state.activeTab] || state.activeTab} · ${resultSummary}`));
  command.append(summary);
  workspace.append(command);

  const toolbar = make('section', 'streaming-toolbar');
  const resultTabs = make('nav', 'streaming-result-tabs');
  resultTabs.setAttribute('aria-label', copy.tabs);
  ['track', 'album', 'artist', 'playlist'].forEach((tabName) => {
    const tab = actionButton(copy[tabName], null, () => { state.activeTab = tabName; state.qualityMenuOpen = false; void runSearch(1, 'replace'); }, {});
    tab.dataset.active = String(tabName === state.activeTab);
    resultTabs.append(tab);
  });
  toolbar.append(resultTabs);
  const qualityBox = make('div', 'streaming-quality-select');
  const qualityButton = actionButton(copy.quality, 'chevron', () => { state.qualityMenuOpen = !state.qualityMenuOpen; render(); }, { title: copy.quality });
  qualityButton.replaceChildren(make('span', '', copy.quality), make('strong', '', copy[state.quality] || state.quality), makeIcon('chevron', 15));
  qualityBox.append(qualityButton);
  if (state.qualityMenuOpen) {
    const menu = make('div', 'streaming-quality-menu');
    menu.setAttribute('role', 'listbox');
    qualities.forEach((quality) => {
      const option = actionButton(copy[quality], state.quality === quality ? 'check' : null, () => handleQualityChange(quality), {});
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(state.quality === quality));
      option.replaceChildren(make('span', '', copy[quality]));
      option.append(make('small', '', copy[`${quality}Description`]));
      menu.append(option);
    });
    qualityBox.append(menu);
  }
  toolbar.append(qualityBox);
  workspace.append(toolbar);

  const stateStack = make('div', 'streaming-state-stack');
  if (state.error) stateStack.append(make('div', 'streaming-state streaming-state--error', state.error));
  if (state.actionError) stateStack.append(make('div', 'streaming-state streaming-state--error', state.actionError));
  if (state.actionMessage) stateStack.append(make('div', 'streaming-state streaming-state--success', state.actionMessage));
  workspace.append(stateStack);

  const shell = make('div', 'streaming-results-shell');
  const count = activeEntries.length;
  const emptyMessage = state.loading && !count
    ? copy.searchingEllipsis
    : !state.query && state.activeTab !== 'playlist'
      ? copy.searchHint
      : state.query && !count && !state.error
        ? (copy[`notFound${state.activeTab[0].toUpperCase()}${state.activeTab.slice(1)}`] || copy.notFoundTrack)
        : null;
  if (state.activeTab === 'track' && !emptyMessage) {
    const header = make('div', 'streaming-track-header');
    header.setAttribute('aria-hidden', 'true');
    header.append(make('span', '', '#'), make('span', '', copy.trackHeaderTitle), make('span', '', copy.trackHeaderSource), make('span', '', copy.trackHeaderDuration), make('span', '', copy.trackHeaderActions));
    shell.append(header);
  }
  if (emptyMessage) shell.append(make('div', 'streaming-results-empty', emptyMessage));
  else if (state.activeTab === 'playlist') shell.append(renderPlaylistPanel(state.result?.playlists || []));
  else if (state.activeTab === 'album') {
    const list = make('div', 'streaming-discovery-list');
    (state.result?.albums || []).forEach((item) => appendAlbumCard(list, item));
    shell.append(list);
  } else if (state.activeTab === 'artist') {
    const list = make('div', 'streaming-discovery-list');
    (state.result?.artists || []).forEach((item) => appendArtistCard(list, item));
    shell.append(list);
  } else {
    const list = make('div', 'streaming-results');
    list.addEventListener('scroll', () => { state.scrollTop = list.scrollTop; persistMemory(); });
    const spacer = make('div', 'streaming-virtual-spacer');
    (state.result?.tracks || []).forEach((track, index) => appendTrackRow(spacer, track, { spatial: true, index }));
    list.append(spacer);
    if (state.scrollTop > 0) window.setTimeout(() => { list.scrollTop = state.scrollTop; }, 0);
    shell.append(list);
  }
  workspace.append(shell);
  if (state.activeTab !== 'playlist' && state.result?.hasMore) workspace.append(actionButton(state.loading ? copy.loadingMore : copy.loadMore, null, () => runSearch((state.result.page || 1) + 1, 'append'), { className: 'streaming-load-more', disabled: state.loading }));
  page.append(workspace);
  if (state.noticeOpen) page.append(renderNoticeModal());
  return page;
};
const renderAccountEntry = () => {
  if (!pageRoot || state.selectedLyricsTrack || state.selectedAlbum || state.selectedArtist || state.selectedPlaylist) return;
  const heading = pageRoot.querySelector('.streaming-source-rail-heading');
  if (!heading || heading.querySelector('[data-echo-account-entry]')) return;
  const button = actionButton(copy.accounts, 'user', openAccountPage, { className: 'settings-action-button streaming-account-toggle' });
  button.dataset.echoAccountEntry = 'true';
  heading.append(button);
};
const render = () => {
  if (!pageRoot || disposed) return;
  if (searchComposing) {
    searchRenderPending = true;
    return;
  }
  persistMemory();
  const search = liveSearchInput && pageRoot.contains(liveSearchInput) ? liveSearchInput : pageRoot.querySelector?.('.streaming-search-box input');
  const keepSearch = Boolean(search && document.activeElement === search);
  pageRoot.replaceChildren(state.ready ? (state.accountPageOpen ? renderAccountView() : state.selectedAlbum ? renderAlbumDetail() : state.selectedArtist ? renderArtistDetail() : state.selectedPlaylist ? renderPlaylistDetail() : state.accepted ? renderMain() : renderGate()) : make('div', 'streaming-page streaming-hub', make('div', 'streaming-results-empty', copy.loading)));
  if (!state.accountPageOpen) renderAccountEntry();
  attachLyricsActions();
  attachNeteaseTrackActions();
  if (!keepSearch) return;
  const next = liveSearchInput && pageRoot.contains(liveSearchInput) ? liveSearchInput : pageRoot.querySelector('.streaming-search-box input');
  if (next && document.activeElement !== next) next.focus({ preventScroll: true });
};

const loadProviders = async (force = false) => {
  const api = streamApi();
  if (!api?.getProviders) throw new Error(copy.noBridge);
  const items = await api.getProviders();
  let providers = (Array.isArray(items) ? items : []).filter((item) => !hiddenProviders.has(item.name) && (config.showDisabledProviders === true || item.enabled !== false));
  try {
    const accounts = await accountApi()?.getStatuses?.();
    if (Array.isArray(accounts)) {
      state.accountStatuses = accounts;
      providers = providers.map((item) => {
        const acc = accounts.find((row) => row.provider === item.name);
        if (!acc) return item;
        return {
          ...item,
          accountConnected: acc.connected === true,
          accountDisplayName: acc.displayName || acc.username || item.accountDisplayName || null,
          requiresAccount: accountAwareProviders.has(item.name) ? true : item.requiresAccount,
        };
      });
    }
  } catch {}
  state.providers = providers;
  const visible = state.providers;
  if (!visible.some((item) => item.name === state.provider && item.enabled !== false)) state.provider = providerPriority.find((name) => visible.some((item) => item.name === name && item.enabled !== false)) || visible.find((item) => item.enabled !== false)?.name || 'netease';
  if (force) render();
  return state.providers;
};
const loadFavorites = async () => { try { if (streamApi()?.getFavorites) state.favoriteTrackIds = favoriteIdsFromSnapshot(await streamApi().getFavorites()); } catch {} };
const loadJobs = async () => { try { if (downloadApi()?.getJobs) { state.downloadJobs = await downloadApi().getJobs(); indexDownloadJobs(state.downloadJobs); } } catch {} };
const runSearch = async (page = 1, mode = 'replace') => { const api = streamApi(); const query = state.query.trim(); if (!state.accepted || !query) { state.result = null; state.loading = false; state.error = null; render(); return; } if (!api?.search) { state.error = copy.noBridge; render(); return; } const requestId = ++state.requestId; state.loading = true; state.error = null; if (mode === 'replace' && document.activeElement !== pageRoot?.querySelector?.('.streaming-search-box input')) render(); try { const next = await api.search({ provider: state.provider, query, mediaTypes: [state.activeTab], page, pageSize }); if (requestId !== state.requestId) return; state.result = mode === 'append' && state.result ? { ...next, tracks: [...(state.result.tracks || []), ...(next.tracks || [])], albums: [...(state.result.albums || []), ...(next.albums || [])], artists: [...(state.result.artists || []), ...(next.artists || [])], playlists: [...(state.result.playlists || []), ...(next.playlists || [])], mvs: [...(state.result.mvs || []), ...(next.mvs || [])] } : next; state.result.page = page; if (mode === 'replace') rememberSearch(state.query); if (state.activeTab === 'track') void probeVisibleTrackQualities(state.result?.tracks); } catch (error) { if (requestId === state.requestId) { state.error = error instanceof Error ? error.message : String(error); if (mode === 'replace') state.result = null; } } finally { if (requestId === state.requestId) state.loading = false; persistMemory(); render(); } };
const handlePlay = async (track) => { const key = trackKey(track); if (state.resolvingTrackKey === key) return; if (track.playable === false && !(track.provider === 'netease' && config.autoUnblock !== false)) { state.actionError = track.unavailableReason || copy.unavailable; state.actionMessage = null; render(); return; } state.resolvingTrackKey = key; state.actionError = null; state.actionMessage = null; render(); try { const candidates = state.selectedArtistDetail?.topTracks?.some((item) => trackKey(item) === key) ? state.selectedArtistDetail.topTracks : state.selectedAlbumDetail?.tracks?.some((item) => trackKey(item) === key) ? state.selectedAlbumDetail.tracks : state.selectedPlaylistDetail?.tracks?.some((item) => trackKey(item) === key) ? state.selectedPlaylistDetail.tracks : state.result?.tracks || []; const playable = candidates.filter((item) => item.playable !== false).map((item) => toLibraryTrack(item)); await playViaQueue(track, { replaceQueueWith: playable.length ? playable : undefined, source: sourceFor(track.provider, `${copy.streaming} / ${track.provider}`), forceNewQueueItem: !playable.length }); state.actionMessage = null; } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/cancel/i.test(message)) {
        /* ignore */
      } else if (/not available in the Steam distribution/i.test(message) || message === 'streaming_bridge_not_ready') {
        state.actionError = chinese ? 'Steam 版尚未接入播放通道。请完全退出 ECHO 后用 Loader 重新打开，并确认已登录对应平台账号。' : 'Steam playback is not connected yet. Fully quit ECHO, relaunch with the Loader, and sign in to the platform account.';
      } else if (/streaming_source_unavailable/i.test(message)) {
        state.actionError = chinese ? '无法解析播放地址。请先在流媒体账号页登录，会员歌曲需要对应平台会员。' : 'Could not resolve playback. Sign in on the streaming accounts page; VIP tracks need a matching membership.';
      } else {
        state.actionError = message;
      }
    } finally { state.resolvingTrackKey = null; state.currentStableKey = key; render(); } };
const handleAddToQueue = (track) => { if (track.playable === false) { state.actionError = track.unavailableReason || copy.unavailable; state.actionMessage = null; render(); return; } appendViaQueue(track, sourceFor(track.provider, `${copy.streaming} / ${track.provider}`)); state.actionError = null; state.actionMessage = copy.queued; state.queuedTrackKey = trackKey(track); render(); window.setTimeout(() => { if (state.queuedTrackKey === trackKey(track)) { state.queuedTrackKey = null; render(); } }, 1400); };
const handleToggleFavorite = async (track) => { if (!favoriteProviders.has(track.provider) || !streamApi()?.setFavorite) return; const key = trackKey(track); state.favoriteTrackKey = key; render(); try { const result = await streamApi().setFavorite({ track, favorite: state.favoriteTrackIds[favoriteKey(track)] !== true }); state.favoriteTrackIds = favoriteIdsFromSnapshot(result.snapshot); window.dispatchEvent(new CustomEvent('streaming:favorites-changed', { detail: result.snapshot })); state.actionMessage = result.favorite ? `已收藏：${track.title}` : `已取消收藏：${track.title}`; state.actionError = null; } catch (error) { state.actionError = error instanceof Error ? error.message : String(error); state.actionMessage = null; } finally { state.favoriteTrackKey = null; render(); } };
const handleDownload = async (track) => { if (unsupportedDownloadProviders.has(track.provider)) throw new Error(copy.unsupportedDownload); const webpageUrl = streamingTrackWebUrl(track); if (!webpageUrl) throw new Error(chinese ? '此平台暂不支持直接下载。' : 'This platform does not support direct downloads.'); const stream = streamApi(); const downloads = downloadApi(); if (!stream?.resolvePlayback || !downloads?.createUrlJob) throw new Error(copy.downloadUnavailable); state.downloadingTrackKey = trackKey(track); state.actionError = null; state.actionMessage = null; render(); try { const source = await stream.resolvePlayback({ provider: track.provider, providerTrackId: track.providerTrackId, quality: state.quality }); const job = await downloads.createUrlJob(source.url, { title: track.title, artist: track.artist, album: track.album, albumArtist: track.albumArtist || track.artist, coverUrl: track.coverUrl || track.coverThumb || null, webpageUrl, bindMvAfterImport: false, requestHeaders: source.headers, directAudio: true, directAudioMimeType: source.mimeType, directAudioExtension: source.codec, streamingProvider: track.provider, streamingProviderTrackId: track.providerTrackId, streamingStableKey: trackKey(track), downloadAuthorizationToken: source.downloadAuthorizationToken }); state.downloadJobs = [job, ...state.downloadJobs.filter((item) => item.id !== job.id)]; state.downloadJobIdsByTrackKey[trackKey(track)] = job.id; state.actionMessage = `已加入下载队列：${track.title}`; } finally { state.downloadingTrackKey = null; render(); } };
const enrichBatchTracks = (tracks, extra = {}) => (Array.isArray(tracks) ? tracks : []).filter((track) => canDownloadTrackToMusic(track)).map((track) => ({
  ...track,
  album: track.album || extra.album || '',
  albumArtist: track.albumArtist || extra.albumArtist || track.artist || '',
  coverUrl: track.coverUrl || track.coverThumb || extra.coverUrl || null,
  coverThumb: track.coverThumb || track.coverUrl || extra.coverUrl || null,
}));
const albumFolderName = (album) => sanitizeFolderName([album?.artist, album?.title].filter(Boolean).join(' - ') || album?.title || 'Album') || 'Album';
const handleDownloadAlbum = () => {
  const detail = state.selectedAlbumDetail;
  if (!detail) return;
  openBatchMusicDownloadDialog({
    title: albumFolderName(detail),
    heading: copy.albumDownloadTitle,
    reading: copy.readingAlbumTracks,
    load: async () => {
      const tracks = enrichBatchTracks(detail.tracks, {
        album: detail.title,
        albumArtist: detail.artist,
        coverUrl: detail.coverUrl || detail.coverThumb || null,
      });
      if (!tracks.length) throw new Error(copy.musicNoDownloadableAlbum);
      return { name: albumFolderName(detail), tracks, skipped: Math.max(0, (detail.tracks || []).length - tracks.length) };
    },
  });
};
const openAlbumDownloadFromCard = async (album) => {
  if (state.musicPlaylistDownload) {
    showChromeNotice(copy.batchDownloadBusy);
    return;
  }
  const stream = streamApi();
  if (!stream?.getAlbum) throw new Error(copy.noBridge);
  const same = state.selectedAlbumDetail
    && (state.selectedAlbumDetail.id === album.id || (album.provider && album.providerAlbumId && state.selectedAlbumDetail.provider === album.provider && state.selectedAlbumDetail.providerAlbumId === album.providerAlbumId));
  const detail = same ? state.selectedAlbumDetail : await stream.getAlbum({ provider: album.provider, providerAlbumId: album.providerAlbumId });
  openBatchMusicDownloadDialog({
    title: albumFolderName(detail || album),
    heading: copy.albumDownloadTitle,
    reading: copy.readingAlbumTracks,
    load: async () => {
      const tracks = enrichBatchTracks(detail?.tracks, {
        album: detail?.title || album.title,
        albumArtist: detail?.artist || album.artist,
        coverUrl: detail?.coverUrl || detail?.coverThumb || album.coverUrl || album.coverThumb || null,
      });
      if (!tracks.length) throw new Error(copy.musicNoDownloadableAlbum);
      return { name: albumFolderName(detail || album), tracks, skipped: Math.max(0, (detail?.tracks || []).length - tracks.length) };
    },
  });
};
const handleDownloadArtist = () => {
  const detail = state.selectedArtistDetail;
  if (!detail) return;
  const name = sanitizeFolderName(artistName(detail)) || 'Artist';
  openBatchMusicDownloadDialog({
    title: name,
    heading: copy.artistDownloadTitle,
    reading: copy.readingAlbumTracks,
    load: async () => {
      const tracks = enrichBatchTracks(detail.topTracks, { coverUrl: detail.coverUrl || detail.avatarUrl || null });
      if (!tracks.length) throw new Error(copy.musicNoDownloadableArtist);
      return { name, tracks, skipped: Math.max(0, (detail.topTracks || []).length - tracks.length) };
    },
  });
};
const sanitizeFolderName = (value) => String(value ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/gu, ' ').replace(/\s+/gu, ' ').trim().replace(/[. ]+$/u, '');
let musicPlaylistRunId = 0;
const invokeMain = async (method, payload) => {
  const main = external.main;
  if (!main?.invoke) throw new Error(copy.mainBridgeUnavailable);
  let response;
  try {
    response = await main.invoke(method, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(/native_(host|package|main_method|invoke)|fetch failed|econnrefused|failed to fetch/iu.test(message) ? copy.mainBridgeUnavailable : message);
  }
  const result = response && typeof response === 'object' && 'result' in response ? response.result : response;
  if (result && typeof result === 'object' && result.ok === false) throw new Error(String(result.error || copy.mainBridgeUnavailable));
  return result;
};
const musicMenuHint = (subfolder = null) => {
  const base = state.musicTargetBase || (chinese ? '音乐/Stream' : 'Music/Stream');
  const folder = subfolder ? sanitizeFolderName(subfolder) : '';
  return copy.musicSaveHint(folder ? `${base}${base.includes('\\') ? '\\' : '/'}${folder}` : base);
};
const canDownloadTrackToMusic = (track) => track?.playable !== false && track?.unavailable !== true && !unsupportedDownloadProviders.has(track?.provider);
/*
 * Download quality selection.
 *
 * ECHO's bridge attaches a `qualities` array to every StreamingTrack, but the
 * providers fill it with hard-coded guesses: NetEase derives 2-3 buckets from
 * the `fee` flag (VIP tracks lose `lossless` even for VIP accounts, and
 * `hires` is never reported at all), QQ Music reports a fixed 1-or-3 bucket
 * list, and nothing carries bitrates or file sizes. That is why users saw
 * "too few" qualities. The mod now probes the provider's own per-track file
 * descriptors through the main process (`probeQualities` in main.cjs):
 * NetEase `v3/song/detail` (batched — the l/m/h/sq/hr file maps), QQ Music
 * `fcg_play_single_song` (`file.size_*`), and the HQ/SQ hashes KuGou embeds
 * in its track ids. Each confirmed tier includes the real codec / bitrate /
 * size, which the pickers display. Only when the rich probe is unavailable
 * do we fall back to the provider-reported array, and then to
 * `streaming.getTrack` (retried once; failures offer the full list instead
 * of silently forcing `standard`). The resolve-time fallback chain and the
 * delivered codec/bitrate toast are unchanged: a tier the account cannot
 * access still downgrades gracefully inside `resolvePlayback({ quality })`.
 */
const qualityRank = { hires: 3, lossless: 2, high: 1, standard: 0 };
const sortQualities = (list) => [...new Set(Array.isArray(list) ? list : [])].filter((quality) => qualities.includes(quality)).sort((left, right) => (qualityRank[right] ?? 0) - (qualityRank[left] ?? 0));
const allQualitiesSorted = () => sortQualities(qualities);
const clampQuality = (preferred, available) => available.includes(preferred) ? preferred : (available.find((quality) => (qualityRank[quality] ?? 0) <= (qualityRank[preferred] ?? 0)) || available[available.length - 1] || 'standard');
const configDownloadQuality = qualities.includes(config.defaultDownloadQuality) ? config.defaultDownloadQuality : null;
const preferredDownloadQuality = () => state.downloadQuality || configDownloadQuality || state.quality;
const rememberDownloadQuality = (quality) => { if (!qualities.includes(quality) || state.downloadQuality === quality) return; state.downloadQuality = quality; persistMemory(); };
// Providers the main process can probe for true per-file quality data, and
// the subset with batchable (or local) probes cheap enough to run eagerly
// for whole lists. QQ Music needs one request per song, so its rich probe
// only runs per-track (download panel / playlist dialog workers).
const richProbeProviders = new Set(['netease', 'qqmusic', 'kugou']);
const batchProbeProviders = new Set(['netease', 'kugou']);
const formatProbeSize = (bytes) => {
  const value = Number(bytes);
  if (!(value > 0)) return null;
  return value >= 1073741824 ? `${(value / 1073741824).toFixed(2)}GB` : `${(value / 1048576).toFixed(1)}MB`;
};
// "FLAC · 999kbps · 28.4MB" — real per-file facts from the provider probe.
const qualityDetailText = (detail) => {
  if (!detail) return '';
  const parts = [];
  const codec = String(detail.codec || '').trim();
  if (codec) parts.push(codec.toUpperCase());
  const kbps = Number(detail.bitrate) > 0 ? Math.round(Number(detail.bitrate) / 1000) : null;
  if (kbps) parts.push(`${kbps}kbps`);
  const size = formatProbeSize(detail.size);
  if (size) parts.push(size);
  return parts.join(' · ');
};
// Compact labels in the spirit of the platform tier names: 标准 128 /
// 高音质 320 / 无损 FLAC / Hi-Res. Falls back to the plain bucket name when
// no probe detail exists.
const qualityChipText = (quality, detail) => {
  const base = copy[quality] || quality;
  if (quality === 'lossless' || quality === 'hires') {
    const codec = String(detail?.codec || '').trim();
    return codec ? `${base} ${codec.toUpperCase()}` : base;
  }
  const kbps = Number(detail?.bitrate) > 0 ? Math.round(Number(detail.bitrate) / 1000) : null;
  return kbps ? `${base} ${kbps}` : base;
};
const normalizeRichProbe = (entry) => {
  const details = {};
  const list = [];
  for (const tier of Array.isArray(entry?.qualities) ? entry.qualities : []) {
    const quality = String(tier?.quality || '');
    if (!qualities.includes(quality) || details[quality]) continue;
    details[quality] = {
      codec: typeof tier.codec === 'string' && tier.codec ? tier.codec : null,
      bitrate: Number(tier.bitrate) > 0 ? Number(tier.bitrate) : null,
      size: Number(tier.size) > 0 ? Number(tier.size) : null,
    };
    list.push(quality);
  }
  const sorted = sortQualities(list);
  return sorted.length ? { qualities: sorted, details, failed: false } : null;
};
const qualityProbeCache = new Map();
// Resolved probe entry (never an in-flight promise), for synchronous renders.
const readyProbeEntry = (key) => {
  const cached = qualityProbeCache.get(key);
  return cached && typeof cached.then !== 'function' ? cached : null;
};
// One main-process call per provider fills the cache for a whole track list
// (NetEase batches 100 ids per request; KuGou decodes locally). Failures are
// silent — per-track probes pick up whatever is missing.
const probeTrackQualitiesBatch = async (tracks, providers = batchProbeProviders) => {
  const groups = new Map();
  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (!providers.has(track?.provider) || !track?.providerTrackId) continue;
    if (qualityProbeCache.has(trackKey(track))) continue;
    const group = groups.get(track.provider) || new Map();
    group.set(String(track.providerTrackId), trackKey(track));
    groups.set(track.provider, group);
  }
  await Promise.all([...groups.entries()].map(async ([provider, group]) => {
    try {
      const response = await invokeMain('probeQualities', { provider, providerTrackIds: [...group.keys()] });
      const results = response?.results && typeof response.results === 'object' ? response.results : {};
      for (const [providerTrackId, key] of group) {
        const normalized = normalizeRichProbe(results[providerTrackId]);
        if (normalized && !qualityProbeCache.has(key)) qualityProbeCache.set(key, normalized);
      }
    } catch {}
  }));
};
// Probes list rows right after they render (search / album / artist pages)
// so the quality column shows provider truth instead of the coarse flags.
const probeVisibleTrackQualities = async (tracks) => {
  const pending = (Array.isArray(tracks) ? tracks : []).filter((track) => batchProbeProviders.has(track?.provider) && track?.providerTrackId && !qualityProbeCache.has(trackKey(track)));
  if (!pending.length) return;
  try { await probeTrackQualitiesBatch(pending); } catch { return; }
  if (!disposed) render();
};
// Returns { qualities: string[], details?: object, failed: boolean,
// error?: string }. When the probe fails the full quality list is offered so
// the user still has a choice; the provider falls back to its best
// deliverable quality on resolve.
const probeTrackQualities = async (track) => {
  const key = trackKey(track);
  const cached = qualityProbeCache.get(key);
  if (cached) return cached;
  const work = (async () => {
    // 1) Rich probe through the main process: the provider's own per-file
    //    quality descriptors, with codec / bitrate / size.
    if (richProbeProviders.has(track?.provider) && track?.providerTrackId) {
      try {
        const response = await invokeMain('probeQualities', { provider: track.provider, providerTrackIds: [String(track.providerTrackId)] });
        const normalized = normalizeRichProbe(response?.results?.[String(track.providerTrackId)]);
        if (normalized) return normalized;
      } catch {}
    }
    // 2) Provider-reported flags from the search / album / playlist payload.
    const direct = sortQualities(track?.qualities);
    if (direct.length) return { qualities: direct, failed: false };
    // 3) Re-fetch fresh provider metadata through ECHO's bridge.
    const stream = streamApi();
    if (!stream?.getTrack || !track?.provider || !track?.providerTrackId) return { qualities: allQualitiesSorted(), failed: true };
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const fresh = await stream.getTrack({ provider: track.provider, providerTrackId: track.providerTrackId });
        const probed = sortQualities(fresh?.qualities);
        if (probed.length) return { qualities: probed, failed: false };
        return { qualities: allQualitiesSorted(), failed: true };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt === 0) await sleep(350 + Math.floor(Math.random() * 250));
      }
    }
    return { qualities: allQualitiesSorted(), failed: true, error: lastError };
  })();
  qualityProbeCache.set(key, work);
  const result = await work;
  // Cache successes only, so a transient failure can be retried later.
  if (result.failed) qualityProbeCache.delete(key);
  else qualityProbeCache.set(key, result);
  return result;
};
// Localized quality summary for list rows: prefers probed truth (with real
// bitrates) over the provider's coarse flags.
const trackQualitySummary = (track) => {
  const entry = readyProbeEntry(trackKey(track));
  const list = entry?.qualities?.length ? entry.qualities : sortQualities(track?.qualities);
  if (!list.length) return copy.standard;
  return list.map((quality) => qualityChipText(quality, entry?.details?.[quality])).join(' / ');
};
const describeDownloadQuality = (quality, source) => {
  const parts = [copy[quality] || quality];
  const codec = String(source?.codec || '').trim();
  if (codec && /^[a-z0-9]{2,5}$/iu.test(codec)) parts.push(codec.toUpperCase());
  const kbps = Number(source?.bitrate) > 0 ? Math.round(Number(source.bitrate) / 1000) : null;
  if (kbps) parts.push(`${kbps}kbps`);
  return parts.join(' · ');
};
const downloadTrackToMusic = async (track, subfolder = null, quality = preferredDownloadQuality(), extra = {}) => {
  const stream = streamApi();
  if (!stream?.resolvePlayback) throw new Error(copy.noBridge);
  // The renderer resolve acts as the availability gate and supplies fallback
  // url/headers; the main process re-resolves the same request through the
  // loader bridge so the actual download carries the logged-in account
  // session (renderer-facing IPC strips Cookie/Authorization headers).
  const source = await stream.resolvePlayback({ provider: track.provider, providerTrackId: track.providerTrackId, quality });
  if (!source?.url) throw new Error(copy.downloadUnavailable);
  const result = await invokeMain('downloadToMusic', {
    key: trackKey(track),
    url: source.url,
    headers: source.headers || {},
    mimeType: source.mimeType || null,
    extension: source.codec || null,
    provider: track.provider,
    providerTrackId: track.providerTrackId,
    quality,
    title: track.title || '',
    artist: track.artist || '',
    album: track.album || '',
    albumArtist: track.albumArtist || track.artist || '',
    trackNo: Number(extra.trackNo) > 0 ? Math.floor(Number(extra.trackNo)) : null,
    coverUrl: track.coverUrl || track.coverThumb || null,
    webpageUrl: streamingTrackWebUrl(track) || '',
    subfolder,
  });
  return { ...(result && typeof result === 'object' ? result : {}), source, quality };
};
const handleDownloadTrackToMusic = async (track, quality = preferredDownloadQuality()) => {
  if (!canDownloadTrackToMusic(track)) {
    state.actionError = unsupportedDownloadProviders.has(track?.provider) ? copy.unsupportedDownload : (track?.unavailableReason || copy.unavailable);
    state.actionMessage = null;
    render();
    return;
  }
  const key = trackKey(track);
  if (state.musicDownloadKeys[key] === true) return;
  state.musicDownloadKeys[key] = true;
  state.actionError = null;
  state.actionMessage = copy.musicDownloadStarted(track.title || '');
  render();
  try {
    const result = await downloadTrackToMusic(track, null, quality);
    if (result?.directory) state.musicTargetBase = result.directory;
    state.actionError = null;
    state.actionMessage = copy.musicDownloadDone(track.title || '', result?.path || '', describeDownloadQuality(quality, result?.source));
    showChromeNotice(state.actionMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.actionMessage = null;
    state.actionError = copy.musicDownloadFailed(track.title || '', message);
    showChromeNotice(state.actionError);
  } finally {
    delete state.musicDownloadKeys[key];
    render();
  }
};
// Right-click panel for a single song: probes which qualities the provider
// actually offers for this track, preselects the preferred one, and only
// starts the download after the user confirms.
const openTrackDownloadPanel = (event, track) => {
  if (!canDownloadTrackToMusic(track)) {
    openStreamMenu(event, [{
      label: copy.downloadToMusic,
      hint: unsupportedDownloadProviders.has(track?.provider) ? copy.unsupportedDownload : (track?.unavailableReason || copy.unavailable),
      icon: 'download',
      disabled: true,
    }]);
    return;
  }
  const panel = make('div', 'echo-streaming-context-menu echo-streaming-quality-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', copy.downloadQualityTitle);
  const header = make('div', 'echo-streaming-quality-panel-header');
  header.append(makeIcon('download', 15));
  const heading = make('span');
  heading.append(make('strong', '', copy.downloadQualityTitle), make('small', '', [track.artist, track.title].filter(Boolean).join(' - ') || track.title || ''));
  header.append(heading);
  panel.append(header);
  const body = make('div', 'echo-streaming-quality-panel-body');
  body.append(make('div', 'echo-streaming-quality-probing', copy.probingQualities));
  panel.append(body);
  const footer = make('div', 'echo-streaming-quality-panel-footer');
  footer.append(make('small', 'echo-streaming-quality-panel-hint', musicMenuHint()));
  const buttons = make('div', 'echo-streaming-quality-panel-buttons');
  const cancelButton = actionButton(copy.cancelAction, null, () => closeStreamMenu(), { className: 'echo-streaming-quality-cancel' });
  const downloadButton = actionButton(copy.startDownload, 'download', () => {}, { className: 'echo-streaming-quality-download', disabled: true });
  buttons.append(cancelButton, downloadButton);
  footer.append(buttons);
  panel.append(footer);
  const place = openCursorPanel(event, panel);
  let selected = null;
  void probeTrackQualities(track).then((probe) => {
    if (!panel.isConnected) return;
    const available = probe.qualities;
    const details = probe.details || {};
    selected = clampQuality(preferredDownloadQuality(), available);
    body.replaceChildren(make('small', 'echo-streaming-quality-count', probe.failed ? copy.probeFailed : copy.qualityCount(available.length)));
    const options = make('div', 'echo-streaming-quality-options');
    options.setAttribute('role', 'radiogroup');
    available.forEach((quality) => {
      const option = make('button', 'echo-streaming-quality-option');
      option.type = 'button';
      option.setAttribute('role', 'radio');
      const label = make('span');
      label.append(make('strong', '', qualityChipText(quality, details[quality])), make('small', '', qualityDetailText(details[quality]) || copy[`${quality}Description`] || ''));
      option.append(label, makeIcon('check', 14));
      option.dataset.quality = quality;
      option.dataset.selected = String(quality === selected);
      option.setAttribute('aria-checked', String(quality === selected));
      option.addEventListener('click', (clickEvent) => {
        clickEvent.stopPropagation();
        selected = quality;
        options.querySelectorAll('.echo-streaming-quality-option').forEach((node) => {
          node.dataset.selected = String(node.dataset.quality === quality);
          node.setAttribute('aria-checked', String(node.dataset.quality === quality));
        });
      });
      options.append(option);
    });
    body.append(options);
    downloadButton.disabled = false;
    downloadButton.addEventListener('click', () => {
      const quality = selected || available[0] || 'standard';
      closeStreamMenu();
      rememberDownloadQuality(quality);
      void handleDownloadTrackToMusic(track, quality).catch(reportError);
    });
    place();
  }).catch(() => {
    if (!panel.isConnected) return;
    body.replaceChildren(make('div', 'echo-streaming-quality-probing', copy.downloadUnavailable));
    place();
  });
};
// ECHO stable keys look like `streaming:<provider>:<providerTrackId>`.
const parseStreamingStableKey = (value) => {
  const match = /^streaming:([a-z0-9_-]+):(.+)$/iu.exec(String(value || ''));
  return match ? { provider: match[1], providerTrackId: match[2] } : null;
};
/*
 * Extracts a downloadable streaming track from one library playlist item.
 * `item.track` is only populated when ECHO's `streaming_tracks` cache row
 * still joins with the playlist item; depending on the ECHO build (and cache
 * lifetime) many 歌单 rows come back with `track: null` even though the item
 * itself still carries `sourceProvider` / `sourceItemId` and the title /
 * artist snapshots taken at import time. The old code silently dropped every
 * such row (`item?.track || item` never matches the filter because playlist
 * items use `mediaType: 'stream_track'` and different field names), which is
 * why most of a 歌单 could "fail to scan". This helper rebuilds the track
 * from whichever shape the item arrives in.
 */
const streamingTrackFromPlaylistItem = (item) => {
  const candidates = [item?.track, item];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || candidate.mediaType !== 'streaming') continue;
    if (candidate.provider && candidate.providerTrackId) return candidate;
    const parsed = parseStreamingStableKey(candidate.stableKey || candidate.id || candidate.path);
    if (parsed) return { ...candidate, provider: candidate.provider || parsed.provider, providerTrackId: candidate.providerTrackId || parsed.providerTrackId };
  }
  const container = item && typeof item === 'object' ? item : {};
  const parsed = parseStreamingStableKey(container.mediaId);
  const isStreamItem = container.mediaType === 'stream_track' || Boolean(parsed);
  if (!isStreamItem) return null;
  const provider = (typeof container.sourceProvider === 'string' && container.sourceProvider !== 'local' && container.sourceProvider) || parsed?.provider || null;
  const providerTrackId = (typeof container.sourceItemId === 'string' && container.sourceItemId) || parsed?.providerTrackId || null;
  if (!provider || !providerTrackId) return null;
  const stableKey = parsed ? String(container.mediaId) : `streaming:${provider}:${providerTrackId}`;
  return {
    id: stableKey,
    mediaType: 'streaming',
    path: stableKey,
    provider,
    providerTrackId,
    stableKey,
    title: container.titleSnapshot || 'Untitled',
    artist: container.artistSnapshot || '',
    album: container.albumSnapshot || '',
    albumArtist: container.artistSnapshot || '',
    duration: Number(container.durationSnapshot) || 0,
    coverThumb: container.coverThumb || null,
    playable: true,
  };
};
const listPlaylistStreamingTracks = async (playlistId) => {
  const library = libraryApi();
  if (!playlistId || typeof library?.getPlaylistItems !== 'function') throw new Error(copy.playlistItemsUnavailable);
  const tracks = [];
  const seen = new Set();
  let skipped = 0;
  const pageSize = 200;
  for (let page = 1; page <= 100; page += 1) {
    const result = await library.getPlaylistItems(playlistId, { page, pageSize });
    const items = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
    for (const item of items) {
      const track = streamingTrackFromPlaylistItem(item);
      if (!track) { skipped += 1; continue; }
      const key = `${track.provider}:${track.providerTrackId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push(track);
    }
    if (Array.isArray(result) || !items.length) break;
    if (result?.hasMore === true) continue;
    if (result?.hasMore === false) break;
    // Older builds omit hasMore: keep paging while full pages keep arriving.
    const total = Number(result?.total);
    if (Number.isFinite(total) && total > 0 ? page * pageSize >= total : items.length < pageSize) break;
  }
  return { tracks, skipped };
};
// The NetEase 歌单 id, from the provider playlist object or its web URL.
const neteasePlaylistIdFor = (playlist) => {
  if (playlist?.provider === 'netease' && /^\d+$/u.test(String(playlist.providerPlaylistId || '').trim())) return String(playlist.providerPlaylistId).trim();
  const url = String(playlist?.webUrl || '');
  const match = /music\.163\.com\/(?:#\/)?(?:m\/)?playlist(?:\/(\d+)|\?[^#]*?\bid=(\d+))/iu.exec(url);
  return match ? (match[1] || match[2]) : null;
};
/*
 * NetEase 歌单 are enumerated through the mod's own main-process handler
 * (`neteasePlaylist` in main.cjs): playlist detail + song detail requests
 * carry the same logged-in account cookie as playback, so 私密歌单 (private
 * playlists) scan correctly instead of importing zero songs through the
 * anonymous public bridge. Every row arrives with plain-https cover art and
 * its true per-file quality tiers, which pre-fill the probe cache so the
 * download dialog opens fully populated. Returns null when the main bridge
 * is unavailable so the caller can fall back to the legacy import path.
 */
const loadNeteasePlaylistTracksViaMain = async (playlist, fallbackName, options = {}) => {
  const playlistId = neteasePlaylistIdFor(playlist);
  if (!playlistId) return null;
  let listed = null;
  try {
    listed = await invokeMain('neteasePlaylist', { playlistId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/netease_login_required/u.test(message)) throw new Error(copy.neteaseLoginRequired);
    if (/netease_session_expired/u.test(message)) throw new Error(copy.neteaseSessionExpired);
    if (message === copy.mainBridgeUnavailable) return null;
    throw new Error(message);
  }
  const tracks = (Array.isArray(listed?.tracks) ? listed.tracks : []).map((item) => {
    const providerTrackId = String(item?.providerTrackId || '').trim();
    if (!providerTrackId) return null;
    const stableKey = `streaming:netease:${providerTrackId}`;
    const track = {
      id: stableKey,
      mediaType: 'streaming',
      path: stableKey,
      provider: 'netease',
      providerTrackId,
      stableKey,
      title: item.title || 'Untitled',
      artist: item.artist || '',
      album: item.album || '',
      albumArtist: item.albumArtist || item.artist || '',
      duration: Number(item.duration) || 0,
      coverUrl: item.coverUrl || null,
      coverThumb: item.coverThumb || item.coverUrl || null,
      playable: true,
    };
    const probe = normalizeRichProbe(item);
    if (probe) qualityProbeCache.set(trackKey(track), probe);
    return track;
  }).filter(Boolean);
  if (!tracks.length && options.requireTracks !== false) throw new Error(copy.musicNoDownloadableTracks);
  return { name: sanitizeFolderName(listed?.name || fallbackName) || 'Playlist', tracks, skipped: 0 };
};
const qqPlaylistIdFor = (playlist) => {
  if (playlist?.provider === 'qqmusic' && String(playlist.providerPlaylistId || '').trim()) return String(playlist.providerPlaylistId).trim();
  const url = String(playlist?.webUrl || '');
  const match = /y\.qq\.com\/(?:n\/ryqq\/)?playlist\/(\d+)/iu.exec(url);
  return match ? match[1] : null;
};
const mapMainPlaylistTracks = (listed, provider, fallbackName, options = {}) => {
  const tracks = (Array.isArray(listed?.tracks) ? listed.tracks : []).map((item) => {
    const providerTrackId = String(item?.providerTrackId || '').trim();
    if (!providerTrackId) return null;
    const stableKey = `streaming:${provider}:${providerTrackId}`;
    const track = {
      id: stableKey,
      mediaType: 'streaming',
      path: stableKey,
      provider,
      providerTrackId,
      stableKey,
      title: item.title || 'Untitled',
      artist: item.artist || '',
      album: item.album || '',
      albumArtist: item.albumArtist || item.artist || '',
      duration: Number(item.duration) || 0,
      coverUrl: item.coverUrl || null,
      coverThumb: item.coverThumb || item.coverUrl || null,
      playable: true,
    };
    const probe = normalizeRichProbe(item);
    if (probe) qualityProbeCache.set(trackKey(track), probe);
    return track;
  }).filter(Boolean);
  if (!tracks.length && options.requireTracks !== false) throw new Error(copy.musicNoDownloadableTracks);
  return { name: sanitizeFolderName(listed?.name || fallbackName) || 'Playlist', tracks, skipped: 0 };
};
const loadQqPlaylistTracksViaMain = async (playlist, fallbackName, options = {}) => {
  const playlistId = qqPlaylistIdFor(playlist);
  if (!playlistId) return null;
  let listed = null;
  try {
    listed = await invokeMain('qqPlaylist', { playlistId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/qq_login_required/u.test(message)) throw new Error(copy.qqLoginRequired);
    if (message === copy.mainBridgeUnavailable) return null;
    throw new Error(message);
  }
  return mapMainPlaylistTracks(listed, 'qqmusic', fallbackName, options);
};
const findImportedLibraryPlaylist = async (playlist) => {
  const sourceId = String(playlist?.providerPlaylistId || playlist?.sourcePlaylistId || '').trim();
  const importedId = playlist?.importedPlaylistId || playlist?.playlistId;
  const provider = playlist?.provider || playlist?.sourceProvider;
  try {
    const playlists = await libraryApi()?.getPlaylists?.();
    const items = Array.isArray(playlists) ? playlists : [];
    if (importedId) {
      const byId = items.find((item) => String(item.id) === String(importedId));
      if (byId) return byId;
    }
    if (!sourceId) return null;
    return items.find((item) => String(item.sourcePlaylistId || '') === sourceId && (!provider || item.sourceProvider === provider)) || null;
  } catch {
    return null;
  }
};
const loadPlaylistTracksForView = async (playlist) => {
  const fallbackName = playlist.title || playlist.name || 'Playlist';
  const viaDaily = await loadDailyPlaylistTracksViaMain(playlist, fallbackName, { requireTracks: false });
  if (viaDaily) return viaDaily;
  const viaNetease = await loadNeteasePlaylistTracksViaMain(playlist, fallbackName, { requireTracks: false });
  if (viaNetease) return viaNetease;
  const viaQq = await loadQqPlaylistTracksViaMain(playlist, fallbackName, { requireTracks: false });
  if (viaQq) return viaQq;
  const existing = await findImportedLibraryPlaylist(playlist);
  if (!existing) return { name: fallbackName, tracks: [], skipped: 0 };
  const listed = await listPlaylistStreamingTracks(existing.id);
  return { name: existing.name || fallbackName, tracks: listed.tracks, skipped: listed.skipped, importedPlaylistId: existing.id };
};
// Enumerates the downloadable streaming tracks of a streaming-page 歌单
// (provider playlist). NetEase lists go through the authenticated main
// process (see above); other providers are imported through ECHO's public
// bridge first and read back from the library. Tracks flagged unavailable at
// import time are intentionally kept: the flag is often stale anonymous
// privilege data (VIP tracks become downloadable once the account is
// connected) and the resolve step reports a precise per-track error when a
// track truly cannot be fetched.
const loadPlaylistTracksForDownload = async (playlist) => {
  const fallbackName = playlist.title || playlist.name || 'Playlist';
  const viaDaily = await loadDailyPlaylistTracksViaMain(playlist, fallbackName);
  if (viaDaily) return viaDaily;
  const viaNetease = await loadNeteasePlaylistTracksViaMain(playlist, fallbackName);
  if (viaNetease) return viaNetease;
  const viaQq = await loadQqPlaylistTracksViaMain(playlist, fallbackName);
  if (viaQq) return viaQq;
  const stream = streamApi();
  if (!stream?.importPlaylistFromUrl || !stream?.resolvePlayback) throw new Error(copy.noBridge);
  const url = playlist.webUrl || streamingPlaylistWebUrl(playlist);
  if (!url) throw new Error(copy.playlistItemsUnavailable);
  const imported = await stream.importPlaylistFromUrl(url);
  const name = sanitizeFolderName(imported?.playlistName || fallbackName) || 'Playlist';
  const listed = await listPlaylistStreamingTracks(imported?.playlistId);
  const tracks = listed.tracks.filter((track) => !unsupportedDownloadProviders.has(track.provider));
  const skipped = listed.skipped + (listed.tracks.length - tracks.length);
  if (!tracks.length) throw new Error(copy.musicNoDownloadableTracks);
  return { name, tracks, skipped };
};
// Sequentially downloads a per-song quality plan ([{ track, quality }]) into
// Music/Stream/<playlistName>/, keeping the in-page notices and toasts alive
// even when the dialog that started it has been closed.
const runPlaylistMusicDownload = async (playlistName, items, onProgress) => {
  const runId = ++musicPlaylistRunId;
  const job = { title: playlistName, total: items.length, done: 0, failed: 0, stage: 'downloading' };
  state.musicPlaylistDownload = job;
  state.actionError = null;
  showChromeNotice(copy.musicPlaylistProgress(playlistName, 0, items.length));
  render();
  let directory = null;
  for (const item of items) {
    if (musicPlaylistRunId !== runId) return { cancelled: true, done: job.done, failed: job.failed, directory };
    const track = item.track;
    const key = trackKey(track);
    state.musicDownloadKeys[key] = true;
    onProgress?.({ stage: 'downloading', track, done: job.done, failed: job.failed, total: items.length });
    render();
    let succeeded = false;
    let failureMessage = null;
    try {
      const quality = qualities.includes(item.quality) ? item.quality : clampQuality(preferredDownloadQuality(), (await probeTrackQualities(track)).qualities);
      const result = await downloadTrackToMusic(track, playlistName, quality, { trackNo: item.trackNo });
      directory = result?.directory || directory;
      job.done += 1;
      succeeded = true;
    } catch (error) {
      job.failed += 1;
      failureMessage = error instanceof Error ? error.message : String(error);
    } finally {
      delete state.musicDownloadKeys[key];
    }
    if (musicPlaylistRunId === runId) state.actionMessage = copy.musicPlaylistProgress(playlistName, job.done + job.failed, items.length);
    onProgress?.({ stage: 'progress', track, succeeded, error: failureMessage, done: job.done, failed: job.failed, total: items.length });
    render();
    await sleep(90);
  }
  if (musicPlaylistRunId !== runId) return { cancelled: true, done: job.done, failed: job.failed, directory };
  const summary = copy.musicPlaylistDone(playlistName, job.done, job.failed, directory);
  if (job.failed && !job.done) {
    state.actionMessage = null;
    state.actionError = summary;
  } else {
    state.actionError = null;
    state.actionMessage = summary;
  }
  showChromeNotice(summary);
  if (state.musicPlaylistDownload === job) state.musicPlaylistDownload = null;
  render();
  return { cancelled: false, done: job.done, failed: job.failed, directory, summary };
};
const cancelPlaylistMusicDownload = (playlistName) => {
  musicPlaylistRunId += 1;
  state.musicPlaylistDownload = null;
  const notice = copy.downloadCancelled(playlistName);
  state.actionMessage = notice;
  state.actionError = null;
  showChromeNotice(notice);
  render();
};
// 歌单 download dialog: reads the streaming playlist, probes per-song
// available qualities in the background, and offers 一键全部设置音质 plus
// per-song overrides before the batch download starts.
let playlistDialogDismiss = null;
const closePlaylistDownloadDialog = () => { const dismiss = playlistDialogDismiss; playlistDialogDismiss = null; dismiss?.(); };
const openBatchMusicDownloadDialog = (source) => {
  if (state.musicPlaylistDownload) {
    showChromeNotice(copy.batchDownloadBusy);
    return;
  }
  closeStreamMenu();
  closePlaylistDownloadDialog();
  const headingLabel = source.heading || copy.playlistDownloadTitle;
  const readingLabel = source.reading || copy.readingPlaylistTracks;
  const model = {
    stage: 'reading',
    name: sanitizeFolderName(source.title || 'Playlist') || 'Playlist',
    tracks: [],
    available: new Map(),
    details: new Map(),
    probeFailed: new Set(),
    choices: new Map(),
    globalQuality: null,
    probeDone: 0,
    skipped: 0,
    error: null,
    closed: false,
    progress: null,
    summary: null,
  };
  const backdrop = make('div', 'echo-streaming-download-dialog-backdrop');
  const dialog = make('section', 'echo-streaming-download-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', `${headingLabel} ${model.name}`);
  dialog.addEventListener('mousedown', (event) => event.stopPropagation());
  backdrop.append(dialog);
  document.body.append(backdrop);
  const requestClose = () => closePlaylistDownloadDialog();
  backdrop.addEventListener('mousedown', requestClose);
  const onKeyDown = (event) => { if (event.key === 'Escape') requestClose(); };
  window.addEventListener('keydown', onKeyDown, true);
  playlistDialogDismiss = () => {
    model.closed = true;
    window.removeEventListener('keydown', onKeyDown, true);
    backdrop.remove();
  };
  const effectiveQuality = (track) => {
    const key = trackKey(track);
    const explicit = model.choices.get(key);
    const available = model.available.get(key);
    const preferred = model.globalQuality || preferredDownloadQuality();
    if (explicit && (!available || available.includes(explicit))) return explicit;
    if (!available) return preferred;
    return clampQuality(preferred, available);
  };
  let updateQueued = false;
  const update = () => {
    if (model.closed) return;
    const previousList = dialog.querySelector('.echo-streaming-download-dialog-list');
    const scrollTop = previousList ? previousList.scrollTop : 0;
    dialog.replaceChildren(...buildContent());
    const nextList = dialog.querySelector('.echo-streaming-download-dialog-list');
    if (nextList && scrollTop) nextList.scrollTop = scrollTop;
  };
  const scheduleUpdate = () => {
    if (updateQueued || model.closed) return;
    updateQueued = true;
    window.setTimeout(() => { updateQueued = false; update(); }, 120);
  };
  const qualityChip = (quality, active, onPick, disabled = false, detail = null) => {
    const chip = make('button', 'echo-streaming-quality-chip', qualityChipText(quality, detail));
    chip.type = 'button';
    chip.dataset.active = String(active);
    chip.title = qualityDetailText(detail) || copy[`${quality}Description`] || copy[quality] || quality;
    if (disabled) chip.disabled = true;
    chip.addEventListener('click', (event) => { event.stopPropagation(); onPick(quality); });
    return chip;
  };
  const buildHeader = () => {
    const header = make('header', 'echo-streaming-download-dialog-header');
    const heading = make('div');
    heading.append(make('strong', '', `${headingLabel}：${model.name}`), make('small', '', musicMenuHint(model.name)));
    header.append(heading);
    header.append(actionButton(copy.close, 'close', requestClose, { iconOnly: true, className: 'echo-streaming-dialog-close', title: copy.close }));
    return header;
  };
  const buildTrackRow = (track, index) => {
    const key = trackKey(track);
    const row = make('div', 'echo-streaming-download-dialog-row');
    row.append(make('span', 'echo-streaming-download-dialog-index', String(index + 1)));
    const main = make('span', 'echo-streaming-download-dialog-main');
    main.append(make('strong', '', track.title || 'Untitled'), make('small', '', track.artist || ''));
    row.append(main);
    const available = model.available.get(key);
    const chips = make('span', 'echo-streaming-download-dialog-chips');
    if (!available) chips.append(make('small', 'echo-streaming-download-dialog-probing', copy.probingQualities));
    else {
      if (model.probeFailed.has(key)) {
        const marker = make('small', 'echo-streaming-download-dialog-probing', copy.probeFailedShort);
        marker.title = copy.probeFailed;
        chips.append(marker);
      }
      const active = effectiveQuality(track);
      const details = model.details.get(key) || null;
      available.forEach((quality) => chips.append(qualityChip(quality, quality === active, (picked) => {
        model.choices.set(key, picked);
        update();
      }, model.stage !== 'select', details ? details[quality] : null)));
    }
    row.append(chips);
    if (model.stage === 'downloading' || model.stage === 'done') {
      const status = model.progress?.results?.get(key);
      if (status) row.dataset.result = status;
      const failure = model.progress?.errors?.get(key);
      if (status === 'failed' && failure) {
        const note = make('small', 'echo-streaming-download-dialog-probing', failure);
        note.title = failure;
        row.append(note);
      }
    }
    return row;
  };
  const startDownload = () => {
    if (model.stage !== 'select' || !model.tracks.length) return;
    if (state.musicPlaylistDownload) {
      showChromeNotice(copy.batchDownloadBusy);
      return;
    }
    if (model.globalQuality) rememberDownloadQuality(model.globalQuality);
    const items = model.tracks.map((track, index) => ({ track, quality: effectiveQuality(track), trackNo: index + 1 }));
    model.stage = 'downloading';
    model.progress = { current: null, done: 0, failed: 0, total: items.length, results: new Map(), errors: new Map() };
    update();
    void runPlaylistMusicDownload(model.name, items, (progress) => {
      if (model.closed) return;
      if (progress.stage === 'downloading') model.progress.current = progress.track;
      if (progress.stage === 'progress') {
        model.progress.results.set(trackKey(progress.track), progress.succeeded ? 'ok' : 'failed');
        if (!progress.succeeded && progress.error) model.progress.errors.set(trackKey(progress.track), progress.error);
      }
      model.progress.done = progress.done;
      model.progress.failed = progress.failed;
      scheduleUpdate();
    }).then((result) => {
      if (model.closed) return;
      if (result?.cancelled) {
        model.stage = 'select';
        model.progress = null;
      } else {
        model.stage = 'done';
        model.summary = result?.summary || null;
      }
      update();
    }).catch((error) => {
      if (model.closed) return;
      model.stage = 'select';
      model.error = error instanceof Error ? error.message : String(error);
      update();
    });
  };
  const buildFooter = () => {
    const footer = make('footer', 'echo-streaming-download-dialog-footer');
    if (model.stage === 'select') {
      const probing = model.probeDone < model.tracks.length;
      footer.append(make('small', '', probing ? copy.probeProgress(model.probeDone, model.tracks.length) : copy.qualityCount(model.tracks.length ? sortQualities(model.tracks.flatMap((track) => model.available.get(trackKey(track)) || [])).length : 0)));
      const buttons = make('div', 'echo-streaming-quality-panel-buttons');
      buttons.append(actionButton(copy.cancelAction, null, requestClose, { className: 'echo-streaming-quality-cancel' }));
      buttons.append(actionButton(copy.startPlaylistDownload(model.tracks.length), 'download', startDownload, { className: 'echo-streaming-quality-download', disabled: !model.tracks.length }));
      footer.append(buttons);
    } else if (model.stage === 'downloading') {
      const finished = (model.progress?.done || 0) + (model.progress?.failed || 0);
      footer.append(make('small', '', copy.musicPlaylistProgress(model.name, finished, model.progress?.total || 0)));
      const buttons = make('div', 'echo-streaming-quality-panel-buttons');
      buttons.append(actionButton(copy.cancelDownload, 'close', () => cancelPlaylistMusicDownload(model.name), { className: 'echo-streaming-quality-cancel' }));
      footer.append(buttons);
    } else if (model.stage === 'done') {
      footer.append(make('small', '', model.summary || ''));
      const buttons = make('div', 'echo-streaming-quality-panel-buttons');
      buttons.append(actionButton(copy.close, null, requestClose, { className: 'echo-streaming-quality-download' }));
      footer.append(buttons);
    }
    return footer;
  };
  const buildContent = () => {
    const nodes = [buildHeader()];
    if (model.error) nodes.push(make('div', 'streaming-state streaming-state--error', model.error));
    if (model.stage === 'reading') {
      nodes.push(make('div', 'echo-streaming-download-dialog-loading', readingLabel));
      return nodes;
    }
    if (model.stage === 'select') {
      const global = make('section', 'echo-streaming-download-dialog-global');
      const globalCopy = make('div');
      globalCopy.append(make('strong', '', copy.applyAllQuality), make('small', '', copy.qualityFallbackNote));
      global.append(globalCopy);
      const chips = make('div', 'echo-streaming-download-dialog-chips');
      ['hires', 'lossless', 'high', 'standard'].forEach((quality) => chips.append(qualityChip(quality, model.globalQuality === quality, (picked) => {
        model.globalQuality = picked;
        model.choices.clear();
        update();
      })));
      global.append(chips);
      nodes.push(global);
      nodes.push(make('small', 'echo-streaming-download-dialog-hint', copy.perTrackQualityHint));
      if (model.skipped > 0) nodes.push(make('small', 'echo-streaming-download-dialog-hint', copy.skippedTracks(model.skipped)));
    } else if (model.stage === 'downloading' && model.progress) {
      const status = make('div', 'echo-streaming-download-dialog-status');
      const finished = model.progress.done + model.progress.failed;
      const bar = make('div', 'echo-streaming-download-dialog-bar');
      const fill = make('span');
      fill.style.width = `${model.progress.total ? Math.round((finished / model.progress.total) * 100) : 0}%`;
      bar.append(fill);
      status.append(bar);
      if (model.progress.current) status.append(make('small', '', `${copy.downloading}: ${model.progress.current.title || ''}`));
      nodes.push(status);
    }
    const list = make('div', 'echo-streaming-download-dialog-list');
    model.tracks.forEach((track, index) => list.append(buildTrackRow(track, index)));
    nodes.push(list);
    nodes.push(buildFooter());
    return nodes;
  };
  update();
  void (async () => {
    try {
      const loaded = await source.load();
      if (model.closed) return;
      model.name = loaded.name;
      model.tracks = loaded.tracks;
      model.skipped = loaded.skipped || 0;
      model.stage = 'select';
      update();
      // One batched main-process probe per provider first (NetEase resolves a
      // whole 歌单 in 1-2 requests; KuGou needs none); the workers below then
      // hit the cache instantly and only fall back per-track for the rest.
      await probeTrackQualitiesBatch(loaded.tracks);
      if (model.closed) return;
      const queue = [...loaded.tracks];
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (queue.length && !model.closed) {
          const track = queue.shift();
          const probe = await probeTrackQualities(track);
          if (model.closed) return;
          model.available.set(trackKey(track), probe.qualities);
          if (probe.details) model.details.set(trackKey(track), probe.details);
          if (probe.failed) model.probeFailed.add(trackKey(track));
          else model.probeFailed.delete(trackKey(track));
          model.probeDone += 1;
          scheduleUpdate();
        }
      }));
    } catch (error) {
      if (model.closed) return;
      model.error = error instanceof Error ? error.message : String(error);
      model.stage = 'select';
      update();
    }
  })();
};
const openPlaylistDownloadDialog = (playlist) => {
  openBatchMusicDownloadDialog({
    title: playlist.title || playlist.name || 'Playlist',
    heading: copy.playlistDownloadTitle,
    reading: copy.readingPlaylistTracks,
    load: () => loadPlaylistTracksForDownload(playlist),
  });
};
const onNativeBroadcast = (event) => {
  const detail = event?.detail;
  if (!detail || detail.id !== (manifest.id || 'echo.community-streaming')) return;
  if (detail.name === 'together-state') {
    applyTogetherSnapshot(detail.payload || {});
    return;
  }
  if (detail.name === 'together-open-invite') {
    applyTogetherSnapshot(detail.payload || togetherUi.snapshot);
    void togetherInviteFlow({ fromTray: true });
    return;
  }
  if (detail.name === 'together-restore-prompt') {
    applyTogetherSnapshot(detail.payload || togetherUi.snapshot);
    return;
  }
  if (detail.name === 'together-toggle-rail') {
    togetherUi.sheetOpen = !togetherUi.sheetOpen;
    togetherUi.sheetTab = 'together';
    persistMemory();
    paintTogetherChrome();
    return;
  }
  if (detail.name !== 'music-download-progress') return;
  const payload = detail.payload || {};
  const selector = window.CSS?.escape ? CSS.escape(String(payload.key || '')) : String(payload.key || '');
  const node = pageRoot?.querySelector?.(`[data-music-download-key="${selector}"]`);
  if (!node) return;
  node.textContent = payload.percent != null
    ? `${copy.downloading} ${payload.percent}%`
    : `${copy.downloading} ${((payload.receivedBytes || 0) / 1048576).toFixed(1)} MB`;
};
const revealNativePlaylists = () => {
  document.querySelectorAll('[data-echo-external-hidden="true"]').forEach((surface) => {
    delete surface.dataset.echoExternalHidden;
    surface.removeAttribute('hidden');
  });
  document.querySelectorAll('.echo-external-mod-page').forEach((page) => { page.hidden = true; });
  document.querySelectorAll('.nav-item[data-echo-external-sidebar]').forEach((button) => {
    button.setAttribute('aria-current', 'false');
    button.dataset.active = 'false';
  });
};
const findPlaylistsNav = () => document.querySelector('button.nav-item[data-workshop-icon="nav-playlists"]')
  || [...document.querySelectorAll('button.nav-item:not([data-echo-external-sidebar]):not([data-echo-external-loader]):not([data-echo-external-mods])')]
    .find((button) => /收藏与歌单|播放列表|Playlists|歌单/iu.test(button.textContent || ''));
const selectNativePlaylist = (imported) => {
  const id = imported?.playlistId ? String(imported.playlistId) : '';
  const name = String(imported?.playlistName || '').trim();
  const page = [...document.querySelectorAll('.playlists-page')].find((node) => {
    if (!node.isConnected) return false;
    const surface = node.closest('main') || node;
    return getComputedStyle(surface).display !== 'none';
  });
  if (!page) return false;
  const nodes = [...page.querySelectorAll('button, [role="button"], [data-playlist-id], .playlist-item')];
  const match = (id && nodes.find((el) => String(el.getAttribute('data-playlist-id') || el.dataset.playlistId || '') === id))
    || (name && nodes.find((el) => (el.textContent || '').includes(name)));
  if (!match) return false;
  match.click();
  return true;
};
const openImportedPlaylist = async (imported) => {
  window.dispatchEvent(new Event('library:playlists-changed'));
  try { await libraryApi()?.getPlaylists?.(); } catch {}
  if (!imported?.playlistId) return;
  const nav = findPlaylistsNav();
  if (nav) nav.click();
  else {
    try { external.extend?.navigate?.('playlists'); } catch {}
    window.dispatchEvent(new CustomEvent('app:navigate:route', { detail: 'playlists' }));
  }
  revealNativePlaylists();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(80);
    if (selectNativePlaylist(imported)) return;
  }
};
const handleImportPlaylist = async () => { const url = state.playlistUrl.trim(); if (!url) return; const stream = streamApi(); if (!stream?.importPlaylistFromUrl) throw new Error(copy.noBridge); state.importingPlaylistKey = '__url__'; render(); try { const imported = await stream.importPlaylistFromUrl(url); state.playlistUrl = ''; state.actionMessage = copy.imported(imported.playlistName, imported.importedCount); state.actionError = null; await openPlaylist({ title: imported.playlistName, name: imported.playlistName, importedPlaylistId: imported.playlistId, playlistId: imported.playlistId, trackCount: imported.importedCount }); } finally { state.importingPlaylistKey = null; render(); } };
const handleImportStreamingPlaylist = async (playlist) => {
  if (isVirtualDailyPlaylist(playlist) || playlist?.dailyKind) {
    await syncDailyPlaylists([playlist]);
    return;
  }
  const url = streamingPlaylistWebUrl(playlist);
  if (!url || state.importingPlaylistKey) return;
  const stream = streamApi();
  if (!stream?.importPlaylistFromUrl) throw new Error(copy.noBridge);
  state.importingPlaylistKey = playlist.id;
  render();
  try {
    const imported = await stream.importPlaylistFromUrl(url);
    state.actionMessage = copy.imported(imported.playlistName, imported.importedCount);
    state.actionError = null;
    await openPlaylist({ ...playlist, title: imported.playlistName || playlist.title, importedPlaylistId: imported.playlistId, playlistId: imported.playlistId, trackCount: imported.importedCount ?? playlist.trackCount });
  } finally {
    state.importingPlaylistKey = null;
    render();
  }
};
const dailyKindLabel = (kind) => ({
  songs: copy.dailyKindSongs,
  resource: copy.dailyKindResource,
  radar: copy.dailyKindRadar,
  personalized: copy.dailyKindPersonalized,
  history: copy.dailyKindHistory,
  newsong: copy.dailyKindNewsong,
}[kind] || copy.dailyTitle);
const dailyPlaylistKey = (playlist) => String(playlist?.key || `${playlist?.kind || 'resource'}:${playlist?.providerPlaylistId || ''}`);
const neteaseConnected = () => {
  const status = state.accountStatuses.find((item) => item.provider === 'netease');
  if (status) return status.connected === true;
  return Boolean(state.providers.find((item) => item.name === 'netease' && item.accountConnected));
};
const beijingStamp = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  const pick = (type) => parts.find((item) => item.type === type)?.value || '';
  return { date: `${pick('year')}-${pick('month')}-${pick('day')}`, hour: Number(pick('hour')) || 0, minute: Number(pick('minute')) || 0 };
};
const persistDailyState = () => persistMemory();
const rememberDailySync = (playlist, imported) => {
  const key = dailyPlaylistKey(playlist);
  state.dailySyncedKeys = {
    ...state.dailySyncedKeys,
    [key]: {
      key,
      kind: playlist.kind,
      providerPlaylistId: playlist.providerPlaylistId,
      title: imported?.playlistName || playlist.title,
      libraryPlaylistId: imported?.playlistId || null,
      syncedAt: new Date().toISOString(),
    },
  };
  persistDailyState();
};
const mapDailyMainTracks = (listed, fallbackName) => {
  const tracks = (Array.isArray(listed?.tracks) ? listed.tracks : []).map((item) => {
    const providerTrackId = String(item?.providerTrackId || '').trim();
    if (!providerTrackId) return null;
    const stableKey = `streaming:netease:${providerTrackId}`;
    const track = {
      id: stableKey,
      mediaType: 'streaming',
      path: stableKey,
      provider: 'netease',
      providerTrackId,
      stableKey,
      title: item.title || 'Untitled',
      artist: item.artist || '',
      album: item.album || '',
      albumArtist: item.albumArtist || item.artist || '',
      duration: Number(item.duration) || 0,
      coverUrl: item.coverUrl || null,
      coverThumb: item.coverThumb || item.coverUrl || null,
      playable: true,
    };
    const probe = normalizeRichProbe(item);
    if (probe) qualityProbeCache.set(trackKey(track), probe);
    return track;
  }).filter(Boolean);
  return { name: sanitizeFolderName(listed?.name || fallbackName) || 'Playlist', tracks, skipped: 0 };
};
const isVirtualDailyPlaylist = (playlist) => {
  const kind = playlist?.dailyKind || playlist?.kind;
  const id = String(playlist?.providerPlaylistId || '');
  return kind === 'songs' || kind === 'history' || kind === 'newsong' || id === 'daily-recommend' || id === 'daily-newsong' || id.startsWith('daily-history-');
};
const loadDailyPlaylistTracksViaMain = async (playlist, fallbackName, options = {}) => {
  if (!isVirtualDailyPlaylist(playlist)) return null;
  let listed = null;
  try {
    listed = await invokeMain('neteaseDailyPlaylistTracks', {
      kind: playlist.dailyKind || playlist.kind,
      id: playlist.dailyId || playlist.providerPlaylistId,
      dailyId: playlist.dailyId || null,
      providerPlaylistId: playlist.providerPlaylistId,
      refresh: options.refresh === true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/netease_login_required/u.test(message)) throw new Error(copy.neteaseLoginRequired);
    if (/netease_session_expired/u.test(message)) throw new Error(copy.neteaseSessionExpired);
    if (message === copy.mainBridgeUnavailable) return null;
    throw new Error(message);
  }
  const mapped = mapDailyMainTracks(listed, fallbackName);
  if (!mapped.tracks.length && options.requireTracks !== false) throw new Error(copy.musicNoDownloadableTracks);
  return mapped;
};
const asStreamingDailyPlaylist = (playlist) => ({
  ...playlist,
  id: playlist.id || `netease-daily:${dailyPlaylistKey(playlist)}`,
  provider: 'netease',
  dailyKind: playlist.kind,
  title: playlist.title,
  name: playlist.title,
});
const loadDailyPlaylists = async (options = {}) => {
  if (!neteaseConnected()) {
    state.actionError = copy.dailyNeedLogin;
    paintNativeDailyPanel();
    render();
    return [];
  }
  state.loadingDailyPlaylists = true;
  if (options.refresh) state.refreshingDaily = true;
  state.actionError = null;
  paintNativeDailyPanel();
  render();
  try {
    const result = await invokeMain('neteaseDailyPlaylists', { refresh: options.refresh === true });
    state.dailyPlaylists = Array.isArray(result?.playlists) ? result.playlists : [];
    state.dailyLastRefreshAt = result?.fetchedAt || new Date().toISOString();
    state.actionMessage = state.dailyPlaylists.length ? copy.dailyScanned(state.dailyPlaylists.length) : copy.dailyEmpty;
    persistDailyState();
    return state.dailyPlaylists;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.actionError = /netease_login_required/u.test(message) ? copy.dailyNeedLogin : message;
    return [];
  } finally {
    state.loadingDailyPlaylists = false;
    state.refreshingDaily = false;
    paintNativeDailyPanel();
    render();
  }
};
const syncDailyPlaylistToLibrary = async (playlist) => {
  const item = asStreamingDailyPlaylist(playlist);
  const stream = streamApi();
  if (item.syncMode === 'official-daily' || item.providerPlaylistId === 'daily-recommend') {
    if (!stream?.refreshNeteaseDailyRecommend) throw new Error(copy.noBridge);
    const imported = await stream.refreshNeteaseDailyRecommend();
    rememberDailySync(item, imported);
    return imported;
  }
  if (item.syncMode === 'url' || item.webUrl) {
    if (!stream?.importPlaylistFromUrl) throw new Error(copy.noBridge);
    const imported = await stream.importPlaylistFromUrl(item.webUrl || streamingPlaylistWebUrl(item));
    rememberDailySync(item, imported);
    return imported;
  }
  const library = libraryApi();
  if (!library?.createPlaylist || !library?.addStreamingTrackToPlaylist) throw new Error(copy.noBridge);
  const listed = await loadDailyPlaylistTracksViaMain(item, item.title, { requireTracks: true });
  if (!listed?.tracks?.length) throw new Error(copy.musicNoDownloadableTracks);
  const existingId = state.dailySyncedKeys[dailyPlaylistKey(item)]?.libraryPlaylistId;
  let playlistId = existingId;
  let playlistName = listed.name;
  if (playlistId) {
    try {
      const playlists = await library.getPlaylists?.();
      const found = (Array.isArray(playlists) ? playlists : []).find((entry) => String(entry.id) === String(playlistId));
      if (!found) playlistId = null;
      else playlistName = found.name || playlistName;
    } catch {
      playlistId = null;
    }
  }
  if (!playlistId) {
    const created = await library.createPlaylist({ name: listed.name, description: item.description || copy.dailyTitle });
    playlistId = created?.id;
    playlistName = created?.name || listed.name;
  }
  if (!playlistId) throw new Error(copy.playlistItemsUnavailable);
  try { await library.clearPlaylist?.(playlistId); } catch {}
  for (const track of listed.tracks) {
    try { await library.addStreamingTrackToPlaylist(playlistId, toLibraryTrack(track)); } catch {}
  }
  const imported = { playlistId, playlistName, importedCount: listed.tracks.length };
  rememberDailySync(item, imported);
  return imported;
};
const syncDailyPlaylists = async (items, options = {}) => {
  const list = (items || []).filter(Boolean);
  if (!list.length || Object.keys(state.syncingDailyKeys).length) return { ok: 0, failed: 0 };
  let ok = 0;
  let failed = 0;
  let lastImported = null;
  for (const playlist of list) {
    const key = dailyPlaylistKey(playlist);
    state.syncingDailyKeys[key] = true;
    paintNativeDailyPanel();
    render();
    try {
      lastImported = await syncDailyPlaylistToLibrary(playlist);
      ok += 1;
    } catch {
      failed += 1;
    } finally {
      delete state.syncingDailyKeys[key];
    }
  }
  state.selectedDailyPlaylistKeys = {};
  state.actionMessage = copy.dailySynced(ok, failed);
  paintNativeDailyPanel();
  render();
  if (options.openNative !== false && lastImported) await openImportedPlaylist(lastImported);
  else {
    window.dispatchEvent(new Event('library:playlists-changed'));
    try { await libraryApi()?.getPlaylists?.(); } catch {}
  }
  return { ok, failed };
};
const refreshDailyPlaylists = async (items) => {
  const targets = items?.length ? items : state.dailyPlaylists.filter((item) => state.dailySyncedKeys[dailyPlaylistKey(item)]);
  state.refreshingDaily = true;
  state.actionMessage = copy.dailyRefreshing;
  paintNativeDailyPanel();
  render();
  try {
    await loadDailyPlaylists({ refresh: true });
    const latest = new Map(state.dailyPlaylists.map((item) => [dailyPlaylistKey(item), item]));
    const toSync = (targets.length ? targets : state.dailyPlaylists)
      .map((item) => latest.get(dailyPlaylistKey(item)) || item)
      .filter((item) => state.autoSyncDaily || state.dailySyncedKeys[dailyPlaylistKey(item)] || (targets.length && items?.length));
    if (toSync.length) await syncDailyPlaylists(toSync, { openNative: false });
    state.actionMessage = copy.dailyRefreshed(toSync.length || state.dailyPlaylists.length);
    state.dailyLastRefreshAt = new Date().toISOString();
    persistDailyState();
  } finally {
    state.refreshingDaily = false;
    paintNativeDailyPanel();
    render();
  }
};
const shouldAutoRefreshDaily = () => {
  if (!state.autoRefreshDaily || !neteaseConnected()) return false;
  const now = beijingStamp();
  if (now.hour < 6 || (now.hour === 6 && now.minute < 5)) return false;
  const last = state.dailyLastRefreshAt ? beijingStamp(new Date(state.dailyLastRefreshAt)) : null;
  return !last || last.date !== now.date;
};
const runAutoDailyRefresh = async () => {
  if (packageDisposed || dailyRefreshInFlight || !shouldAutoRefreshDaily()) return;
  dailyRefreshInFlight = true;
  try {
    await refreshDailyPlaylists();
  } catch (error) {
    state.actionError = error instanceof Error ? error.message : String(error);
    paintNativeDailyPanel();
  } finally {
    dailyRefreshInFlight = false;
  }
};
const startDailyRefreshScheduler = () => {
  window.clearInterval(dailyRefreshTimer);
  dailyRefreshTimer = window.setInterval(async () => {
    if (!state.accountStatuses.length) {
      try { await loadAccountStatuses(); } catch {}
    }
    void runAutoDailyRefresh();
  }, 60_000);
  window.setTimeout(async () => {
    try { await loadAccountStatuses(); } catch {}
    if (shouldAutoRefreshDaily()) void runAutoDailyRefresh();
    else if (neteaseConnected() && !state.dailyPlaylists.length) void loadDailyPlaylists().catch(() => undefined);
  }, 2500);
};
const toggleAutoRefreshDaily = () => {
  state.autoRefreshDaily = !state.autoRefreshDaily;
  persistDailyState();
  state.actionMessage = state.autoRefreshDaily ? copy.dailyAutoOn : copy.dailyAutoOff;
  paintNativeDailyPanel();
  render();
  if (state.autoRefreshDaily) void runAutoDailyRefresh();
};
const appendDailyPlaylistRow = (parent, playlist) => {
  const key = dailyPlaylistKey(playlist);
  const row = make('div', 'streaming-account-playlist-row streaming-daily-playlist-row');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.selectedDailyPlaylistKeys[key] === true;
  checkbox.disabled = Object.keys(state.syncingDailyKeys).length > 0 || state.refreshingDaily;
  checkbox.setAttribute('aria-label', `${copy.selectAll} ${playlist.title}`);
  checkbox.addEventListener('change', () => { state.selectedDailyPlaylistKeys[key] = checkbox.checked; render(); });
  row.append(checkbox);
  appendCover(row, playlist.coverThumb || playlist.coverUrl || defaultCover, playlist.id || key);
  const main = make('span', 'streaming-account-playlist-main');
  main.append(make('strong', '', playlist.title || 'Untitled'));
  const synced = Boolean(state.dailySyncedKeys[key]);
  main.append(make('small', '', `${dailyKindLabel(playlist.kind)}${synced ? ` · ${copy.signedIn}` : ''} · ${formatTrackCount(playlist.trackCount)}${playlist.creator ? ` · ${playlist.creator}` : ''}`));
  row.append(main);
  const syncing = state.syncingDailyKeys[key] === true;
  row.append(actionButton(copy.dailyRefreshOne, 'refresh', () => refreshDailyPlaylists([playlist]), { className: 'streaming-account-playlist-add-one', disabled: state.refreshingDaily || Object.keys(state.syncingDailyKeys).length > 0, title: copy.dailyRefreshOne }));
  row.append(actionButton(syncing ? copy.syncing : copy.add, syncing ? 'refresh' : 'list', () => syncDailyPlaylists([playlist]), { className: 'streaming-account-playlist-add-one', disabled: Object.keys(state.syncingDailyKeys).length > 0, title: syncing ? copy.syncing : copy.add }));
  row.addEventListener('click', (event) => {
    if (event.target.closest('input, button')) return;
    void openPlaylist(asStreamingDailyPlaylist(playlist)).catch(reportError);
  });
  row.addEventListener('contextmenu', (event) => openStreamMenu(event, [
    { label: copy.dailyRefreshOne, icon: 'refresh', disabled: state.refreshingDaily, onSelect: () => refreshDailyPlaylists([playlist]) },
    { label: copy.add, icon: 'list', disabled: Object.keys(state.syncingDailyKeys).length > 0, onSelect: () => syncDailyPlaylists([playlist]) },
    { label: copy.downloadPlaylistToMusic, hint: musicMenuHint(playlist.title || ''), icon: 'download', disabled: Boolean(state.musicPlaylistDownload), onSelect: () => openPlaylistDownloadDialog(asStreamingDailyPlaylist(playlist)) },
    { label: copy.dailyOpenNative, icon: 'arrow', onSelect: () => syncDailyPlaylists([playlist], { openNative: true }) },
  ]));
  parent.append(row);
};
const renderDailyPlaylistPanel = () => {
  const panel = make('section', 'streaming-account-playlist-sync streaming-daily-playlist-sync');
  const copyBox = make('div', 'streaming-playlist-import-copy');
  const title = make('span', '', copy.dailyTitle);
  title.prepend(makeIcon('radio', 18));
  copyBox.append(title, make('p', '', copy.dailyHint));
  panel.append(copyBox);
  const toolbar = make('div', 'streaming-account-playlist-toolbar');
  toolbar.append(actionButton(state.loadingDailyPlaylists ? copy.reading : copy.dailyScan, 'search', () => loadDailyPlaylists(), { className: 'streaming-playlist-add', disabled: state.loadingDailyPlaylists || state.refreshingDaily, title: copy.dailyScan }));
  toolbar.append(actionButton(state.refreshingDaily ? copy.dailyRefreshing : copy.dailyRefresh, 'refresh', () => refreshDailyPlaylists(), { className: 'streaming-playlist-add', disabled: state.loadingDailyPlaylists || state.refreshingDaily, title: copy.dailyRefresh }));
  toolbar.append(actionButton(state.autoRefreshDaily ? copy.dailyAuto : copy.dailyManual, 'check', toggleAutoRefreshDaily, { className: state.autoRefreshDaily ? 'active' : '', title: state.autoRefreshDaily ? copy.dailyAutoOn : copy.dailyAutoOff }));
  panel.append(toolbar);
  const box = make('div', 'streaming-account-playlist-panel');
  if (state.dailyPlaylists.length) {
    const selection = make('div', 'streaming-account-playlist-selection');
    const all = state.dailyPlaylists.every((item) => state.selectedDailyPlaylistKeys[dailyPlaylistKey(item)] === true);
    selection.append(actionButton(all ? copy.deselectAll : copy.selectAll, all ? 'check' : 'list', () => {
      state.selectedDailyPlaylistKeys = all ? {} : Object.fromEntries(state.dailyPlaylists.map((item) => [dailyPlaylistKey(item), true]));
      render();
    }, { className: 'streaming-inline-action' }), make('span', '', copy.selected(Object.values(state.selectedDailyPlaylistKeys).filter(Boolean).length, state.dailyPlaylists.length)));
    box.append(selection);
    const list = make('div', 'streaming-account-playlist-list');
    state.dailyPlaylists.forEach((item) => appendDailyPlaylistRow(list, item));
    box.append(list);
    const actions = make('div', 'streaming-account-playlist-actions');
    actions.append(make('span', '', state.autoRefreshDaily ? copy.dailyAutoOn : copy.dailyAutoOff));
    actions.append(actionButton(copy.dailySyncSelected, 'list', () => syncDailyPlaylists(state.dailyPlaylists.filter((item) => state.selectedDailyPlaylistKeys[dailyPlaylistKey(item)])), { className: 'streaming-playlist-add', disabled: !state.dailyPlaylists.some((item) => state.selectedDailyPlaylistKeys[dailyPlaylistKey(item)]) || Object.keys(state.syncingDailyKeys).length > 0 }));
    box.append(actions);
  } else {
    box.append(make('div', 'streaming-results-empty', state.loadingDailyPlaylists ? copy.loading : (neteaseConnected() ? copy.dailyEmpty : copy.dailyNeedLogin)));
  }
  panel.append(box);
  return panel;
};
const loadAccountPlaylists = async (provider = state.accountPlaylistProvider) => { const stream = streamApi(); if (!stream?.listAccountPlaylists) throw new Error(chinese ? '当前窗口尚未加载歌单同步桥接，请重启 ECHO。' : 'Playlist sync is unavailable in this window. Restart ECHO.'); state.accountPlaylistProvider = provider; state.accountPanelOpen = true; state.loadingAccountPlaylists = true; state.actionError = null; render(); try { const result = await stream.listAccountPlaylists(provider); state.accountPlaylists = result.playlists || []; state.selectedAccountPlaylistIds = {}; state.actionMessage = state.accountPlaylists.length ? `已读取 ${state.accountPlaylists.length} 个歌单。` : copy.noPlaylists; } catch (error) { state.accountPlaylists = []; state.selectedAccountPlaylistIds = {}; state.actionError = error instanceof Error ? error.message : String(error); } finally { state.loadingAccountPlaylists = false; render(); } };
const openAccountPlaylistSync = () => { const connected = state.providers.find((item) => (item.name === 'netease' || item.name === 'qqmusic') && item.accountConnected); state.accountPlaylistProvider = connected?.name || state.accountPlaylistProvider; void loadAccountPlaylists(state.accountPlaylistProvider).catch(reportError); };
const syncAccountPlaylists = async (items) => { if (!items?.length || Object.keys(state.syncingAccountPlaylistIds).length) return; const stream = streamApi(); if (!stream?.importPlaylistFromUrl) throw new Error(copy.noBridge); let ok = 0; let failed = 0; for (const playlist of items) { state.syncingAccountPlaylistIds[playlist.providerPlaylistId] = true; render(); try { await stream.importPlaylistFromUrl(playlist.webUrl || streamingPlaylistWebUrl(playlist)); ok += 1; } catch { failed += 1; } finally { delete state.syncingAccountPlaylistIds[playlist.providerPlaylistId]; } } state.selectedAccountPlaylistIds = {}; await openImportedPlaylist({ playlistId: true }); state.actionMessage = copy.synced(ok, failed); render(); };
const requestAccountPlaylistSync = (items) => { if (!items?.length) return; if (!state.accepted) { state.pendingAccountSync = items; state.noticeOpen = true; render(); return; } void syncAccountPlaylists(items).catch(reportError); };
const openAlbum = async (album) => { state.selectedAlbum = album; state.selectedAlbumDetail = null; state.albumError = null; state.albumLoading = true; render(); try { if (!streamApi()?.getAlbum) throw new Error(copy.noBridge); state.selectedAlbumDetail = await streamApi().getAlbum({ provider: album.provider, providerAlbumId: album.providerAlbumId }); void probeVisibleTrackQualities(state.selectedAlbumDetail?.tracks); } catch (error) { state.albumError = error instanceof Error ? error.message : String(error); } finally { state.albumLoading = false; render(); } };
const openArtist = async (artist) => { state.selectedArtist = artist; state.selectedArtistDetail = null; state.artistError = null; state.artistLoading = true; render(); try { if (!streamApi()?.getArtist) throw new Error(copy.noBridge); state.selectedArtistDetail = await streamApi().getArtist({ provider: artist.provider, providerArtistId: artist.providerArtistId }); void probeVisibleTrackQualities(state.selectedArtistDetail?.topTracks); } catch (error) { state.artistError = error instanceof Error ? error.message : String(error); } finally { state.artistLoading = false; render(); } };
const openPlaylist = async (playlist) => {
  state.selectedAlbum = null;
  state.selectedAlbumDetail = null;
  state.selectedArtist = null;
  state.selectedArtistDetail = null;
  state.selectedPlaylist = playlist;
  state.selectedPlaylistDetail = null;
  state.playlistError = null;
  state.playlistLoading = true;
  state.playlistTrackLimit = albumInitialTrackCount;
  render();
  try {
    const listed = await loadPlaylistTracksForView(playlist);
    state.selectedPlaylistDetail = {
      ...playlist,
      ...listed,
      title: listed?.name || playlist.title || playlist.name || '',
      tracks: listed?.tracks || [],
    };
    void probeVisibleTrackQualities(state.selectedPlaylistDetail.tracks);
  } catch (error) {
    state.playlistError = error instanceof Error ? error.message : String(error);
  } finally {
    state.playlistLoading = false;
    render();
  }
};
const handlePlayPlaylist = async () => {
  const detail = state.selectedPlaylistDetail;
  const playable = (detail?.tracks || []).filter((track) => track.playable !== false).map((track) => toLibraryTrack(track));
  if (!playable.length) {
    state.playlistError = copy.noPlaylistTracks;
    render();
    return;
  }
  try {
    state.playlistError = null;
    await playViaQueue(playable[0], { replaceQueueWith: playable, source: sourceFor(detail.provider, `${detail.title || detail.name} / ${detail.provider || copy.playlist}`) });
  } catch (error) {
    state.playlistError = error instanceof Error ? error.message : String(error);
    render();
  }
};
const handleQueuePlaylist = () => {
  const detail = state.selectedPlaylistDetail;
  const source = sourceFor(detail?.provider || state.provider, `${detail?.title || detail?.name || copy.playlist} / ${detail?.provider || state.provider}`);
  (detail?.tracks || []).filter((track) => track.playable !== false).forEach((track) => appendViaQueue(track, source));
  setMessage(copy.queued);
};
const handlePlayAlbum = async () => { const detail = state.selectedAlbumDetail; const playable = (detail?.tracks || []).filter((track) => track.playable).map((track) => toLibraryTrack(track)); if (!playable.length) { state.albumError = chinese ? '这张专辑暂时没有可播放的歌曲。' : 'This album has no playable tracks.'; render(); return; } try { state.albumError = null; await playViaQueue(playable[0], { replaceQueueWith: playable, source: sourceFor(detail.provider, `${detail.title} / ${detail.provider}`) }); } catch (error) { state.albumError = error instanceof Error ? error.message : String(error); render(); } };
const handlePlayArtist = async () => { const detail = state.selectedArtistDetail; const playable = (detail?.topTracks || []).filter((track) => track.playable).map((track) => toLibraryTrack(track)); if (!playable.length) { state.artistError = chinese ? '这个艺人暂时没有可播放的歌曲。' : 'This artist has no playable tracks.'; render(); return; } try { state.artistError = null; await playViaQueue(playable[0], { replaceQueueWith: playable, source: sourceFor(detail.provider, `${artistName(detail)} / ${detail.provider}`) }); } catch (error) { state.artistError = error instanceof Error ? error.message : String(error); render(); } };
const handleQueueArtist = () => { const detail = state.selectedArtistDetail; const source = sourceFor(detail?.provider || state.provider, `${artistName(detail)} / ${detail?.provider || state.provider}`); (detail?.topTracks || []).filter((track) => track.playable).forEach((track) => appendViaQueue(track, source)); setMessage(copy.queued); };
const handleQualityChange = async (quality) => { state.quality = quality; state.qualityMenuOpen = false; persistMemory(); const current = findPlaybackQueue()?.currentTrack; render(); if (!current || current.mediaType !== 'streaming' || current.provider !== state.provider || current.streamingQuality === quality) return; try { const status = await playbackApi()?.getStatus?.(); if (status?.currentTrackId !== current.id || !['loading', 'playing'].includes(status.state)) return; await playViaQueue({ ...current, providerTrackId: current.providerTrackId, stableKey: current.stableKey || current.id }, { source: sourceFor(current.provider), startSeconds: Math.max(0, Number(status.positionMs || 0) / 1000), forceRefresh: true, quality }); state.actionMessage = chinese ? `已切换音质：${copy[quality]}` : `Quality switched: ${copy[quality]}`; render(); } catch (error) { reportError(error); } };
const confirmNotice = async () => { if (state.noticeConsent.trim() !== copy.consentPhrase) return; state.noticeOpen = false; state.noticeConsent = ''; state.accepted = true; try { await appApi()?.setSettings?.({ streamingPlaylistImportNoticeAccepted: true }); } catch {} render(); await Promise.all([loadProviders().catch((error) => { state.error = error.message; }), loadFavorites(), loadJobs()]); render(); if (state.pendingAccountSync) { const items = state.pendingAccountSync; state.pendingAccountSync = null; await syncAccountPlaylists(items); } if (state.query) await runSearch(1, 'replace'); };
const cancelNotice = () => { state.noticeOpen = false; state.noticeConsent = ''; state.pendingAccountSync = null; render(); };
const loadInitial = async () => { let settings = {}; try { settings = await appApi()?.getSettings?.() || {}; } catch {} state.downloadEnabled = settings.downloadsFeatureUnlocked === true; state.accepted = config.requireConsent === false || settings.streamingPlaylistImportNoticeAccepted === true; state.ready = true; render(); if (!state.accepted) { state.noticeOpen = false; return; } try { await loadProviders(); await Promise.all([loadFavorites(), loadJobs(), loadAccountStatuses().catch(() => undefined)]); bindAccountStatuses(); } catch (error) { state.accountErrors.__global = error instanceof Error ? error.message : String(error); } render(); if (state.query && !state.result) await runSearch(1, 'replace'); if (neteaseConnected()) { if (shouldAutoRefreshDaily()) void runAutoDailyRefresh(); else if (!state.dailyPlaylists.length) void loadDailyPlaylists().catch(() => undefined); paintNativeDailyPanel(); } };
const bindAccountStatuses = () => { try { accountUnsubscribe?.(); } catch {} const api = accountApi(); if (!api?.onStatusesChanged) return; accountUnsubscribe = api.onStatusesChanged((statuses) => { if (Array.isArray(statuses)) state.accountStatuses = statuses; void loadProviders(true).catch(() => undefined); refreshAccountPage(); if (neteaseConnected() && shouldAutoRefreshDaily()) void runAutoDailyRefresh(); paintNativeDailyPanel(); void togetherInvoke('togetherRefresh', {}).then((snap) => applyTogetherSnapshot(snap)).catch(() => undefined); }); };
const installNativePlaylistImport = () => {
  const marker = 'data-echo-streaming-playlist-import';
  const log = (message, extra) => {
    if (extra !== undefined) console.info('[ECHO-Streaming]', message, extra);
    else console.info('[ECHO-Streaming]', message);
  };
  let loggedMiss = false;
  let loggedMount = false;
  const miss = (reason) => {
    if (loggedMiss) return;
    loggedMiss = true;
    log(reason);
  };
  const buttonMarker = 'data-echo-streaming-import-button';
  const livePlaylistsSurface = () => document.querySelector('.app-shell > .page-surface[data-route-id="playlists"]:not([hidden]), .page-surface[data-route-id="playlists"]:not([hidden])');
  const isNativeChrome = (node) => {
    if (!node?.isConnected) return false;
    if (node.closest('.echo-external-mod-page, .streaming-page, .streaming-hub, .echo-external-mod-panel, .echo-external-loader-panel')) return false;
    if (pageRoot && pageRoot.contains(node)) return false;
    const surface = node.closest('.page-surface[data-route-id]');
    if (!surface || surface.hidden || surface.hasAttribute('hidden') || surface.dataset.echoExternalHidden === 'true') return false;
    return surface.getAttribute('data-route-id') === 'playlists';
  };
  const isLivePage = isNativeChrome;
  const findHeader = () => {
    const surface = livePlaylistsSurface();
    if (!surface || !isNativeChrome(surface)) return null;
    return surface.querySelector('.playlist-home-header, .collection-playlist-sidebar-header, .playlist-sidebar-header, aside.collection-playlist-sidebar > header, .playlist-collection-home > header');
  };
  // Same inline-SVG shape as the native lucide tool buttons in this header.
  const lucideSvg = (size, paths) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const cloudDownIcon = (size) => lucideSvg(size, '<path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/><path d="M12 12v9"/><path d="m8 17 4 4 4-4"/>');
  const closeIcon = (size) => lucideSvg(size, '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
  const removeForms = () => { for (const node of document.querySelectorAll(`form[${marker}]`)) node.remove(); };
  // Expanding form that mirrors the native "new local playlist" flow: it uses
  // the same playlist-create-form / secondary-action / tool-button classes so
  // the app stylesheet keeps it visually identical and sized to the sidebar.
  const openForm = (header) => {
    const existing = header.parentElement?.querySelector(`form[${marker}]`);
    removeForms();
    if (existing) return;
    const form = document.createElement('form');
    form.className = 'playlist-create-form echo-streaming-import-form';
    form.setAttribute(marker, 'true');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = copy.playlistPlaceholder;
    input.setAttribute('aria-label', copy.addPlaylist);
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'secondary-action';
    submit.disabled = true;
    const submitLabel = document.createElement('span');
    submitLabel.textContent = copy.add;
    submit.innerHTML = cloudDownIcon(15);
    submit.append(submitLabel);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'tool-button';
    cancel.setAttribute('aria-label', copy.cancelImport);
    cancel.title = copy.cancelImport;
    cancel.innerHTML = closeIcon(15);
    cancel.addEventListener('click', () => form.remove());
    input.addEventListener('input', () => { submit.disabled = !input.value.trim(); });
    input.addEventListener('keydown', (event) => { if (event.key === 'Escape') form.remove(); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const url = input.value.trim();
      if (!url || input.disabled) return;
      const stream = streamApi();
      if (!stream?.importPlaylistFromUrl) {
        log('importPlaylistFromUrl missing; streaming bridge is not exposed on this page');
        showChromeNotice(copy.noBridge);
        return;
      }
      input.disabled = true;
      submit.disabled = true;
      submitLabel.textContent = copy.adding;
      try {
        const imported = await stream.importPlaylistFromUrl(url);
        form.remove();
        await openImportedPlaylist(imported);
        showChromeNotice(copy.imported(imported.playlistName, imported.importedCount));
      } catch (error) {
        input.disabled = false;
        submit.disabled = false;
        submitLabel.textContent = copy.add;
        showChromeNotice(error instanceof Error ? error.message : String(error));
      }
    });
    form.append(input, submit, cancel);
    header.insertAdjacentElement('afterend', form);
    input.focus();
  };
  const dailyMarker = 'data-echo-streaming-daily';
  const dailyStyleId = 'echo-streaming-daily-native-style';
  const ensureDailyStyle = () => {
    if (document.getElementById(dailyStyleId)) return;
    const style = document.createElement('style');
    style.id = dailyStyleId;
    style.textContent = `
      .echo-streaming-daily-native { display: grid; gap: 8px; margin: 0 10px 10px; padding: 10px; border: 1px solid var(--theme-panel-border, rgba(0,0,0,.08)); border-radius: 10px; background: var(--theme-panel-bg, transparent); }
      .echo-streaming-daily-native header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .echo-streaming-daily-native header strong { font-size: 13px; }
      .echo-streaming-daily-native header small { display: block; color: var(--theme-muted-text, #6c7179); font-size: 11px; font-weight: 500; }
      .echo-streaming-daily-native-actions { display: flex; flex-wrap: wrap; gap: 6px; }
      .echo-streaming-daily-native-list { display: grid; gap: 6px; max-height: 280px; overflow: auto; }
      .echo-streaming-daily-native-row { display: grid; grid-template-columns: 36px minmax(0,1fr) auto auto auto; align-items: center; gap: 8px; min-height: 44px; }
      .echo-streaming-daily-native-row img { width: 36px; height: 36px; object-fit: cover; border-radius: 8px; }
      .echo-streaming-daily-native-row span { display: grid; min-width: 0; }
      .echo-streaming-daily-native-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
      .echo-streaming-daily-native-row small { color: var(--theme-muted-text, #6c7179); font-size: 11px; }
      .echo-streaming-daily-native-empty { color: var(--theme-muted-text, #6c7179); font-size: 12px; }
      .playlist-home-header:has([${buttonMarker}]) { grid-template-columns: minmax(0, 1fr) minmax(250px, 360px) max-content 40px 40px; }
      .playlist-home-header[data-onboarding="true"]:has([${buttonMarker}]) { grid-template-columns: minmax(0, 1fr) minmax(250px, 360px) 40px 40px; }
      .collection-playlist-sidebar-header:has([${buttonMarker}]) { grid-template-columns: minmax(0, 1fr) 34px 34px; }
      .collection-playlist-sidebar-header:has([${buttonMarker}]) .collection-playlist-import { grid-column: auto; }
      [${buttonMarker}] { display: grid; width: 34px; height: 34px; place-items: center; flex: none; }
      .playlist-home-header [${buttonMarker}] { width: 40px; height: 40px; }
    `;
    document.head.append(style);
  };
  const findSidebar = () => {
    const header = findHeader();
    return header?.parentElement || null;
  };
  const nativeButton = (label, title, handler, extraClass) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = extraClass || 'tool-button';
    button.textContent = label;
    button.title = title || label;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void Promise.resolve(handler()).catch((error) => showChromeNotice(error instanceof Error ? error.message : String(error)));
    });
    return button;
  };
  const renderNativeDaily = (host) => {
    host.replaceChildren();
    ensureDailyStyle();
    const header = document.createElement('header');
    const copyBox = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = copy.dailyTitle;
    const hint = document.createElement('small');
    hint.textContent = state.autoRefreshDaily ? copy.dailyAutoOn : copy.dailyAutoOff;
    copyBox.append(title, hint);
    const actions = document.createElement('div');
    actions.className = 'echo-streaming-daily-native-actions';
    actions.append(
      nativeButton(state.loadingDailyPlaylists ? copy.reading : copy.dailyScan, copy.dailyScan, () => loadDailyPlaylists()),
      nativeButton(state.refreshingDaily ? copy.dailyRefreshing : copy.dailyRefresh, copy.dailyRefresh, () => refreshDailyPlaylists()),
      nativeButton(state.autoRefreshDaily ? copy.dailyAuto : copy.dailyManual, state.autoRefreshDaily ? copy.dailyAutoOn : copy.dailyAutoOff, toggleAutoRefreshDaily),
    );
    header.append(copyBox, actions);
    host.append(header);
    if (state.actionMessage) {
      const status = document.createElement('small');
      status.textContent = state.actionMessage;
      host.append(status);
    }
    if (state.actionError) {
      const error = document.createElement('small');
      error.textContent = state.actionError;
      host.append(error);
    }
    if (!state.dailyPlaylists.length) {
      const empty = document.createElement('div');
      empty.className = 'echo-streaming-daily-native-empty';
      empty.textContent = state.loadingDailyPlaylists ? copy.loading : (neteaseConnected() ? copy.dailyEmpty : copy.dailyNeedLogin);
      host.append(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'echo-streaming-daily-native-list';
    state.dailyPlaylists.forEach((playlist) => {
      const row = document.createElement('div');
      row.className = 'echo-streaming-daily-native-row';
      const image = document.createElement('img');
      image.src = playlist.coverThumb || playlist.coverUrl || defaultCover;
      image.alt = '';
      const main = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = playlist.title || '';
      const meta = document.createElement('small');
      meta.textContent = `${dailyKindLabel(playlist.kind)} · ${formatTrackCount(playlist.trackCount)}`;
      main.append(name, meta);
      main.style.cursor = 'pointer';
      main.addEventListener('click', () => {
        void syncDailyPlaylists([playlist], { openNative: true }).catch((error) => showChromeNotice(error instanceof Error ? error.message : String(error)));
      });
      row.append(image, main);
      row.append(nativeButton(copy.dailyRefreshOne, copy.dailyRefreshOne, () => refreshDailyPlaylists([playlist])));
      row.append(nativeButton(copy.add, copy.add, () => syncDailyPlaylists([playlist]), 'secondary-action'));
      row.append(nativeButton(copy.download, copy.downloadPlaylistToMusic, () => openPlaylistDownloadDialog(asStreamingDailyPlaylist(playlist))));
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        openStreamMenu(event, [
          { label: copy.dailyRefreshOne, icon: 'refresh', onSelect: () => refreshDailyPlaylists([playlist]) },
          { label: copy.add, icon: 'list', onSelect: () => syncDailyPlaylists([playlist]) },
          { label: copy.downloadPlaylistToMusic, icon: 'download', disabled: Boolean(state.musicPlaylistDownload), onSelect: () => openPlaylistDownloadDialog(asStreamingDailyPlaylist(playlist)) },
        ]);
      });
      list.append(row);
    });
    host.append(list);
  };
  const mountDaily = () => {
    const sidebar = findSidebar();
    if (!sidebar) return false;
    let host = sidebar.querySelector(`[${dailyMarker}]`);
    if (host) return true;
    host = document.createElement('section');
    host.className = 'echo-streaming-daily-native';
    host.setAttribute(dailyMarker, 'true');
    const header = findHeader();
    if (header?.nextSibling) sidebar.insertBefore(host, header.nextSibling);
    else sidebar.append(host);
    renderNativeDaily(host);
    return true;
  };
  paintNativeDailyPanel = () => {
    for (const host of document.querySelectorAll(`[${dailyMarker}]`)) {
      if (!isLivePage(host)) continue;
      renderNativeDaily(host);
    }
  };
  const mount = () => {
    for (const node of document.querySelectorAll(`[${buttonMarker}], form[${marker}], [${dailyMarker}]`)) {
      if (!isLivePage(node)) node.remove();
    }
    const surface = livePlaylistsSurface();
    if (!surface || !isNativeChrome(surface)) return false;
    const header = findHeader();
    if (!header) {
      miss('native playlists header missing on the visible playlists route');
      return false;
    }
    loggedMiss = false;
    if (!header.querySelector(`[${buttonMarker}]`)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tool-button';
      button.setAttribute(buttonMarker, 'true');
      button.setAttribute('aria-label', copy.addPlaylist);
      button.title = copy.addPlaylist;
      button.innerHTML = cloudDownIcon(17);
      button.addEventListener('click', () => openForm(header));
      const nativeImport = header.querySelector(':scope > .collection-playlist-import, :scope > .tool-button');
      if (nativeImport) header.insertBefore(button, nativeImport);
      else header.append(button);
      if (!loggedMount) {
        loggedMount = true;
        log('added streaming playlist import button next to the local add button');
      }
    }
    mountDaily();
    return true;
  };
  let mountTimer = 0;
  const scheduleMount = () => {
    if (mountTimer) return;
    mountTimer = window.setTimeout(() => {
      mountTimer = 0;
      mount();
    }, 80);
  };
  mount();
  const observer = new MutationObserver(() => { scheduleMount(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const onRoute = (event) => {
    const route = event?.detail;
    if (route && route !== 'playlists') {
      loggedMiss = false;
      return;
    }
    window.setTimeout(mount, 50);
    if (!state.dailyPlaylists.length && neteaseConnected()) window.setTimeout(() => { void loadDailyPlaylists().catch(() => undefined); }, 200);
  };
  window.addEventListener('app:navigate:route', onRoute);
  window.addEventListener('popstate', scheduleMount);
  const poll = window.setInterval(() => {
    if (livePlaylistsSurface()) mount();
  }, 1500);
  return () => {
    observer.disconnect();
    window.removeEventListener('app:navigate:route', onRoute);
    window.removeEventListener('popstate', scheduleMount);
    window.clearTimeout(mountTimer);
    window.clearInterval(poll);
    paintNativeDailyPanel = () => {};
    for (const node of document.querySelectorAll(`[${buttonMarker}], form[${marker}], [${dailyMarker}]`)) node.remove();
    document.getElementById(dailyStyleId)?.remove();
  };
};
playlistPageUnsubscribe = installNativePlaylistImport();
startDailyRefreshScheduler();
const formatTogetherClock = (ms) => {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
};
const togetherErrorMessage = (error) => {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/netease_login_required/iu.test(message)) return togetherCopy.needLogin;
  return message;
};
const togetherTrackFromId = (songId, meta = {}) => {
  const id = String(songId || '').trim();
  if (!/^\d+$/u.test(id)) return null;
  return {
    provider: 'netease',
    providerTrackId: id,
    title: meta.songTitle || meta.title || `NetEase ${id}`,
    artist: meta.songArtist || meta.artist || '',
    album: '',
    coverUrl: meta.songCover || meta.coverUrl || defaultCover,
    coverThumb: meta.songCover || meta.coverUrl || defaultCover,
    duration: Math.max(0, Number(meta.songDurationMs || meta.durationMs || 0) / 1000),
    playable: true,
  };
};
const togetherQueueTracks = (snapshot) => {
  const ids = [...new Set((snapshot?.playlistIds || []).map((id) => String(id || '').trim()).filter((id) => /^\d+$/u.test(id)))];
  if (snapshot?.songId && !ids.includes(String(snapshot.songId))) ids.unshift(String(snapshot.songId));
  return ids.map((id) => togetherTrackFromId(id, snapshot)).filter(Boolean);
};
const togetherInvoke = async (method, payload) => {
  try {
    return await invokeMain(method, payload);
  } catch (error) {
    throw new Error(togetherErrorMessage(error));
  }
};
const togetherPlaybackControls = () => {
  const player = playerApi();
  const playback = playbackApi();
  return {
    pause: () => player?.pause?.() || playback?.pause?.(),
    play: () => player?.play?.() || playback?.resume?.() || playback?.play?.(),
    seek: (seconds) => player?.seek?.(seconds) || playback?.seek?.(seconds),
  };
};
const togetherCurrentNetease = () => {
  const current = findPlaybackQueue()?.currentTrack;
  if (!current || current.mediaType !== 'streaming' || current.provider !== 'netease') return null;
  const id = String(current.providerTrackId || '').trim();
  return /^\d+$/u.test(id) ? { track: current, songId: id } : null;
};
togetherOnLocalPlay = async (track, options = {}) => {
  if (togetherUi.applying || !togetherUi.snapshot.inRoom || track?.provider !== 'netease') return;
  const songId = String(track.providerTrackId || '').trim();
  if (!/^\d+$/u.test(songId)) return;
  const status = await playbackApi()?.getStatus?.().catch(() => null);
  const reported = await togetherInvoke('togetherReport', {
    songId,
    playStatus: status?.state === 'paused' || status?.state === 'pause' ? 'PAUSE' : 'PLAY',
    progressMs: Math.round((Number(options.startSeconds) || 0) * 1000) || Number(status?.positionMs) || 0,
    commandType: options.togetherCommand || 'GOTO',
    title: track.title,
    artist: track.artist,
    coverUrl: track.coverThumb || track.coverUrl,
    durationMs: Math.round((Number(track.duration) || 0) * 1000),
  }).catch(() => undefined);
  if (reported?.clientSeq) togetherUi.lastSentSeq = Number(reported.clientSeq) || togetherUi.lastSentSeq;
  const queue = options.replaceQueueWith || togetherQueueTracks(togetherUi.snapshot);
  const ids = [...new Set((queue || []).map((item) => item?.provider === 'netease' ? String(item.providerTrackId || '') : '').filter((id) => /^\d+$/u.test(id)))];
  if (ids.length) await togetherInvoke('togetherSyncList', { ids }).catch(() => undefined);
};
const applyTogetherRemoteCommand = async (command, snapshot) => {
  if (!command || togetherUi.applying) return;
  const seq = Number(command.clientSeq) || 0;
  if (seq && seq <= togetherUi.lastAppliedSeq) return;
  if (seq && seq === togetherUi.lastSentSeq) {
    togetherUi.lastAppliedSeq = seq;
    return;
  }
  const songId = String(command.targetSongId || snapshot?.songId || '').trim();
  const progressSec = Math.max(0, Number(command.progressMs || snapshot?.progressMs || 0) / 1000);
  const current = togetherCurrentNetease();
  const type = String(command.commandType || '').toUpperCase();
  const status = await playbackApi()?.getStatus?.().catch(() => null);
  const sameSong = Boolean(current?.songId && songId && current.songId === songId);
  const localPlaying = status?.state === 'playing' || status?.state === 'loading';
  const samePlay = command.playStatus === 'PLAY' ? localPlaying : !localPlaying;
  const samePos = Math.abs((Number(status?.positionMs) || 0) - (Number(command.progressMs) || 0)) < 1800;
  if (sameSong && samePlay && samePos && type !== 'GOTO') {
    togetherUi.lastAppliedSeq = seq || togetherUi.lastAppliedSeq;
    return;
  }
  togetherUi.applying = true;
  togetherUi.lastAppliedSeq = seq || togetherUi.lastAppliedSeq;
  try {
    const controls = togetherPlaybackControls();
    if ((type === 'GOTO' || (songId && songId !== current?.songId)) && songId) {
      const tracks = togetherQueueTracks({ ...snapshot, songId });
      const target = togetherTrackFromId(songId, snapshot);
      if (target) {
        await playViaQueue(target, {
          replaceQueueWith: tracks.length ? tracks.map((item) => toLibraryTrack(item)) : undefined,
          startSeconds: progressSec,
          togetherRemote: true,
          source: sourceFor('netease', togetherCopy.title),
        });
      }
    } else if (type === 'PAUSE') {
      await controls.pause?.();
    } else if (type === 'PLAY') {
      await controls.play?.();
      if (progressSec > 0) await controls.seek?.(progressSec);
    } else if (type === 'SEEK' || type === 'seek') {
      await controls.seek?.(progressSec);
      if (command.playStatus === 'PLAY') await controls.play?.();
    }
  } catch (error) {
    showChromeNotice(togetherErrorMessage(error));
  } finally {
    window.setTimeout(() => { togetherUi.applying = false; }, 800);
  }
};
applyTogetherSnapshot = (snapshot) => {
  const previous = togetherUi.snapshot;
  togetherUi.snapshot = snapshot && typeof snapshot === 'object' ? snapshot : togetherUi.snapshot;
  if (togetherUi.snapshot.inRoom && !togetherUi.wasInRoom && !togetherUi.snapshot.pendingRestore) {
    togetherUi.sheetOpen = true;
    togetherUi.sheetTab = 'together';
    persistMemory();
  }
  togetherUi.wasInRoom = Boolean(togetherUi.snapshot.inRoom);
  paintTogetherChrome();
  if (togetherUi.snapshot.pendingRestore) return;
  const command = togetherUi.snapshot.lastCommand;
  if (togetherUi.snapshot.inRoom && command && command.clientSeq !== previous?.lastCommand?.clientSeq) {
    void applyTogetherRemoteCommand(command, togetherUi.snapshot);
  } else if (togetherUi.snapshot.inRoom && !previous?.inRoom && togetherUi.snapshot.songId) {
    void applyTogetherRemoteCommand({
      commandType: 'GOTO',
      targetSongId: togetherUi.snapshot.songId,
      progressMs: togetherUi.snapshot.progressMs,
      playStatus: togetherUi.snapshot.playStatus,
      clientSeq: togetherUi.snapshot.clientSeq || 1,
    }, togetherUi.snapshot);
  }
};
const togetherReportLocal = async (commandType) => {
  if (togetherUi.applying || !togetherUi.snapshot.inRoom) return;
  const current = togetherCurrentNetease();
  if (!current) return;
  const status = await playbackApi()?.getStatus?.().catch(() => null);
  const playing = status?.state === 'playing' || status?.state === 'loading';
  const progressMs = Number(status?.positionMs) || 0;
  const playStatus = playing ? 'PLAY' : 'PAUSE';
  const key = `${current.songId}:${playStatus}:${commandType || ''}:${Math.floor(progressMs / 800)}`;
  if (!commandType && key === togetherUi.lastReportKey) return;
  togetherUi.lastReportKey = key;
  togetherUi.expectedMs = progressMs + (playing ? 1000 : 0);
  const reported = await togetherInvoke('togetherReport', {
    songId: current.songId,
    playStatus,
    progressMs,
    commandType: commandType || undefined,
    title: current.track.title,
    artist: current.track.artist,
    coverUrl: current.track.coverThumb || current.track.coverUrl,
    durationMs: Math.round((Number(current.track.duration) || 0) * 1000),
  }).catch(() => undefined);
  if (reported?.clientSeq) togetherUi.lastSentSeq = Number(reported.clientSeq) || togetherUi.lastSentSeq;
};
togetherInviteFlow = async () => {
  if (togetherUi.snapshot.pendingRestore) {
    paintTogetherChrome();
    return;
  }
  if (!neteaseConnected() && !togetherUi.snapshot.loggedIn) {
    showChromeNotice(togetherCopy.needLogin);
    state.accountPageOpen = true;
    render();
    return;
  }
  try {
    togetherUi.pickerOpen = true;
    paintTogetherChrome();
    const friends = await togetherInvoke('togetherFriends', { query: togetherUi.friendQuery, refresh: true });
    applyTogetherSnapshot({ ...togetherUi.snapshot, ...friends, friends: friends.friends || [] });
    togetherUi.pickerOpen = true;
    paintTogetherChrome();
  } catch (error) {
    showChromeNotice(togetherErrorMessage(error));
  }
};
const togetherAcceptInvite = async (invite) => {
  try {
    const joined = await togetherInvoke('togetherAccept', { roomId: invite.roomId, inviterId: invite.inviterId });
    applyTogetherSnapshot(joined);
    showChromeNotice(togetherCopy.joined);
  } catch (error) {
    showChromeNotice(togetherErrorMessage(error));
  }
};
const togetherLeaveRoom = async () => {
  try {
    const left = await togetherInvoke('togetherLeave', {});
    applyTogetherSnapshot(left);
  } catch (error) {
    showChromeNotice(togetherErrorMessage(error));
  }
};
const togetherCopyShare = async () => {
  const url = togetherUi.snapshot.shareUrl;
  if (!url) return;
  try {
    await navigator.clipboard?.writeText?.(url);
    showChromeNotice(togetherCopy.copied);
  } catch {
    showChromeNotice(url);
  }
};
const togetherSendInvite = async (userId, nickname) => {
  try {
    showChromeNotice(togetherCopy.inviting);
    const sent = await togetherInvoke('togetherInvite', { userIds: [userId] });
    applyTogetherSnapshot(sent);
    showChromeNotice(togetherCopy.invited(nickname || userId));
  } catch (error) {
    showChromeNotice(togetherErrorMessage(error));
  }
};
const togetherRestoreRoom = async () => {
  try {
    const restored = await togetherInvoke('togetherRestore', {});
    applyTogetherSnapshot(restored);
    showChromeNotice(togetherCopy.joined);
  } catch (error) {
    showChromeNotice(togetherErrorMessage(error));
  }
};
const renderTogetherPicker = () => {
  document.querySelectorAll('.echo-streaming-together-picker').forEach((node) => node.remove());
  if (!togetherUi.pickerOpen) return;
  const snap = togetherUi.snapshot;
  const backdrop = make('div', 'echo-streaming-together-picker');
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) {
      togetherUi.pickerOpen = false;
      paintTogetherChrome();
    }
  });
  const dialog = make('section', 'echo-streaming-together-picker-dialog');
  dialog.setAttribute('role', 'dialog');
  const header = make('header');
  header.append(make('strong', '', togetherCopy.pickerTitle));
  header.append(actionButton(copy.close, 'close', () => { togetherUi.pickerOpen = false; paintTogetherChrome(); }, { iconOnly: true, className: 'streaming-icon-button' }));
  dialog.append(header);
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'echo-streaming-together-search';
  search.placeholder = togetherCopy.searchPlaceholder;
  search.value = togetherUi.friendQuery;
  search.addEventListener('input', () => {
    togetherUi.friendQuery = search.value;
    window.clearTimeout(togetherUi.friendSearchTimer);
    togetherUi.friendSearchTimer = window.setTimeout(() => {
      void togetherInvoke('togetherFriends', { query: togetherUi.friendQuery }).then((result) => {
        if (!togetherUi.pickerOpen) return;
        togetherUi.snapshot = { ...togetherUi.snapshot, friends: result.friends || [] };
        paintTogetherChrome();
        const next = document.querySelector('.echo-streaming-together-search');
        if (next) {
          next.focus();
          next.value = togetherUi.friendQuery;
          try { next.setSelectionRange(togetherUi.friendQuery.length, togetherUi.friendQuery.length); } catch {}
        }
      }).catch((error) => showChromeNotice(togetherErrorMessage(error)));
    }, 280);
  });
  dialog.append(search);
  const friends = snap.friends || [];
  if (!friends.length) dialog.append(make('p', 'echo-streaming-together-empty', togetherCopy.emptyFriends));
  else {
    const list = make('div', 'echo-streaming-together-friend-list');
    friends.forEach((friend) => {
      const row = make('button', 'echo-streaming-together-friend');
      row.type = 'button';
      if (friend.avatarUrl) {
        const img = document.createElement('img');
        img.src = friend.avatarUrl;
        img.alt = '';
        row.append(img);
      } else row.append(makeIcon('user', 16));
      const copyBox = make('span');
      copyBox.append(make('strong', '', friend.nickname || friend.userId), make('small', '', friend.mutual ? togetherCopy.inviteFriend : friend.userId));
      row.append(copyBox);
      row.append(make('em', '', togetherCopy.invite));
      row.addEventListener('click', () => {
        togetherUi.pickerOpen = false;
        paintTogetherChrome();
        void togetherSendInvite(friend.userId, friend.nickname);
      });
      list.append(row);
    });
    dialog.append(list);
  }
  backdrop.append(dialog);
  document.body.append(backdrop);
  window.setTimeout(() => search.focus(), 0);
};
const renderTogetherRestore = () => {
  document.querySelectorAll('.echo-streaming-together-restore').forEach((node) => node.remove());
  const pending = togetherUi.snapshot.pendingRestore;
  if (!pending?.roomId) return;
  const names = (pending.users || []).map((user) => user.nickname).filter(Boolean);
  const others = names.filter((name) => name !== togetherUi.snapshot.nickname);
  const backdrop = make('div', 'echo-streaming-together-restore');
  const dialog = make('section', 'echo-streaming-together-restore-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.append(make('strong', '', togetherCopy.restoreTitle));
  dialog.append(make('p', '', others.length
    ? `${togetherCopy.restoreBody}\n${others.slice(0, 4).join('、')}`
    : togetherCopy.restoreBody));
  if (pending.songTitle) dialog.append(make('small', '', `${togetherCopy.restoreSong} · ${pending.songTitle}${pending.songArtist ? ` / ${pending.songArtist}` : ''}`));
  const actions = make('div', 'echo-streaming-together-restore-actions');
  actions.append(actionButton(togetherCopy.restore, 'check', () => void togetherRestoreRoom(), { className: 'echo-streaming-together-primary' }));
  actions.append(actionButton(togetherCopy.restoreLeave, 'close', () => void togetherLeaveRoom(), { className: 'echo-streaming-together-danger' }));
  dialog.append(actions);
  backdrop.append(dialog);
  document.body.append(backdrop);
};
const renderTogetherBanner = () => {
  document.querySelectorAll('.echo-streaming-together-banner').forEach((node) => node.remove());
  if (togetherUi.snapshot.pendingRestore) return;
  const invite = (togetherUi.snapshot.invites || []).find((item) => !togetherUi.snapshot.inRoom || item.roomId !== togetherUi.snapshot.roomId);
  if (!invite) return;
  const banner = make('div', 'echo-streaming-together-banner');
  if (invite.avatarUrl) {
    const img = document.createElement('img');
    img.src = invite.avatarUrl;
    img.alt = '';
    banner.append(img);
  }
  const text = make('div');
  text.append(make('strong', '', invite.nickname || invite.inviterId), make('span', '', togetherCopy.incoming));
  banner.append(text);
  banner.append(actionButton(togetherCopy.accept, 'check', () => void togetherAcceptInvite(invite), { className: 'echo-streaming-together-accept' }));
  banner.append(actionButton(togetherCopy.decline, 'close', () => {
    togetherUi.snapshot = { ...togetherUi.snapshot, invites: (togetherUi.snapshot.invites || []).filter((item) => item !== invite) };
    paintTogetherChrome();
  }, { className: 'echo-streaming-together-decline' }));
  document.body.append(banner);
};
const overlayCleanupSelector = '.echo-streaming-dock, .echo-streaming-sheet, .echo-streaming-sheet-backdrop, .echo-streaming-together-rail, .echo-streaming-comment-panel, .echo-streaming-similar-panel, .echo-streaming-together-picker, .echo-streaming-together-banner, .echo-streaming-together-restore, [data-echo-streaming-together="invite"], [data-echo-ncm-player]';
let fillCommentSheet = (root) => { root.append(make('p', 'echo-streaming-together-empty', copy.loading)); };
let fillSimilarSheet = (root) => { root.append(make('p', 'echo-streaming-together-empty', ncmCopy.similarHint)); };
const closeStreamingSheet = () => {
  togetherUi.sheetOpen = false;
  ncmUi.commentOpen = false;
  ncmUi.similarOpen = false;
  persistMemory();
  paintTogetherChrome();
};
const openStreamingSheet = (tab) => {
  togetherUi.sheetOpen = true;
  togetherUi.sheetTab = tab === 'comments' || tab === 'similar' ? tab : 'together';
  ncmUi.commentOpen = togetherUi.sheetTab === 'comments';
  ncmUi.similarOpen = togetherUi.sheetTab === 'similar';
  persistMemory();
  paintTogetherChrome();
};
const fillTogetherSheet = (root) => {
  const snap = togetherUi.snapshot;
  const header = make('header', 'echo-streaming-together-head');
  const heading = make('div');
  heading.append(make('strong', '', togetherCopy.title));
  heading.append(make('small', '', snap.inRoom ? `${snap.users?.length || 1} · ${formatTogetherClock(snap.elapsedMs)}` : togetherCopy.idle));
  header.append(heading);
  root.append(header);
  if (!snap.loggedIn && !neteaseConnected()) {
    root.append(make('p', 'echo-streaming-together-empty', togetherCopy.needLogin));
    root.append(actionButton(copy.accounts, 'user', () => { closeStreamingSheet(); state.accountPageOpen = true; render(); }, { className: 'echo-streaming-together-primary' }));
    return;
  }
  const nowPlaying = make('div', 'echo-streaming-together-now');
  if (snap.songCover) {
    const cover = document.createElement('img');
    cover.src = snap.songCover;
    cover.alt = '';
    nowPlaying.append(cover);
  } else nowPlaying.append(makeIcon('music', 18));
  const meta = make('div');
  meta.append(make('strong', '', snap.songTitle || togetherCopy.songUnknown));
  meta.append(make('small', '', [
    snap.songArtist || '',
    snap.playStatus === 'PLAY' ? togetherCopy.playing : togetherCopy.paused,
    snap.songDurationMs ? `${formatTogetherClock(snap.progressMs)} / ${formatTogetherClock(snap.songDurationMs)}` : formatTogetherClock(snap.progressMs),
  ].filter(Boolean).join(' · ')));
  nowPlaying.append(meta);
  root.append(nowPlaying);
  const actions = make('div', 'echo-streaming-together-actions');
  actions.append(actionButton(snap.inRoom ? togetherCopy.inviteFriend : togetherCopy.invite, 'users', () => void togetherInviteFlow(), { className: 'echo-streaming-together-primary' }));
  if (snap.inRoom) {
    actions.append(actionButton(togetherCopy.copyLink, 'link', () => void togetherCopyShare(), { className: 'echo-streaming-together-secondary' }));
    actions.append(actionButton(togetherCopy.leave, 'close', () => void togetherLeaveRoom(), { className: 'echo-streaming-together-danger' }));
  }
  root.append(actions);
  const members = make('div', 'echo-streaming-together-members');
  members.append(make('h3', '', togetherCopy.members));
  const users = snap.users?.length ? snap.users : (snap.inRoom && snap.userId ? [{ userId: snap.userId, nickname: snap.nickname, avatarUrl: snap.avatarUrl, joinedAt: snap.startedAt }] : []);
  if (!users.length) members.append(make('p', 'echo-streaming-together-empty', snap.inRoom ? togetherCopy.creating : togetherCopy.trayHint));
  users.forEach((user) => {
    const row = make('div', 'echo-streaming-together-user');
    if (user.avatarUrl) {
      const img = document.createElement('img');
      img.src = user.avatarUrl;
      img.alt = '';
      row.append(img);
    } else row.append(makeIcon('user', 16));
    const info = make('div');
    const role = user.userId && snap.inviterId && user.userId === snap.inviterId ? togetherCopy.host : togetherCopy.guest;
    info.append(make('strong', '', user.nickname || user.userId), make('small', '', `${role} · ${togetherCopy.duration} ${formatTogetherClock(user.joinedAt ? Date.now() - user.joinedAt : snap.elapsedMs)}`));
    row.append(info);
    members.append(row);
  });
  root.append(members);
  const invites = snap.invites || [];
  if (!invites.length) return;
  const inbox = make('div', 'echo-streaming-together-invites');
  inbox.append(make('h3', '', togetherCopy.incoming));
  invites.forEach((invite) => {
    const row = make('div', 'echo-streaming-together-invite-row');
    row.append(make('span', '', invite.nickname || invite.inviterId));
    row.append(actionButton(togetherCopy.accept, 'check', () => void togetherAcceptInvite(invite), { className: 'echo-streaming-together-accept' }));
    inbox.append(row);
  });
  root.append(inbox);
};
const paintStreamingDock = () => {
  document.querySelectorAll('.echo-streaming-dock').forEach((node) => node.remove());
  if (togetherUi.sheetOpen || togetherUi.snapshot.pendingRestore) return;
  const dock = make('nav', 'echo-streaming-dock');
  dock.setAttribute('aria-label', togetherCopy.title);
  const togetherBtn = actionButton(togetherCopy.title, 'users', () => openStreamingSheet('together'), { iconOnly: true, className: 'echo-streaming-dock-btn', title: togetherCopy.title });
  if (togetherUi.snapshot.inRoom) togetherBtn.dataset.active = 'true';
  const inviteCount = (togetherUi.snapshot.invites || []).length;
  if (inviteCount) togetherBtn.dataset.badge = inviteCount > 9 ? '9+' : String(inviteCount);
  dock.append(
    togetherBtn,
    actionButton(ncmCopy.comments, 'chat', () => void openNeteaseComments(), { iconOnly: true, className: 'echo-streaming-dock-btn', title: ncmCopy.comments }),
    actionButton(ncmCopy.similar, 'spark', () => void openNeteaseSimilar(), { iconOnly: true, className: 'echo-streaming-dock-btn', title: ncmCopy.similar }),
  );
  document.body.append(dock);
};
const paintStreamingSheet = () => {
  document.querySelectorAll('.echo-streaming-sheet, .echo-streaming-sheet-backdrop').forEach((node) => node.remove());
  if (!togetherUi.sheetOpen || togetherUi.snapshot.pendingRestore) return;
  const backdrop = make('div', 'echo-streaming-sheet-backdrop');
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeStreamingSheet();
  });
  const sheet = make('aside', 'echo-streaming-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const head = make('header', 'echo-streaming-sheet-head');
  const tabs = make('nav', 'echo-streaming-sheet-tabs');
  [
    { id: 'together', label: togetherCopy.title, icon: 'users' },
    { id: 'comments', label: ncmCopy.comments, icon: 'chat' },
    { id: 'similar', label: ncmCopy.similar, icon: 'spark' },
  ].forEach((tab) => {
    const button = actionButton(tab.label, tab.icon, () => {
      if (tab.id === 'comments') void openNeteaseComments();
      else if (tab.id === 'similar') void openNeteaseSimilar();
      else openStreamingSheet('together');
    }, { className: 'echo-streaming-sheet-tab', title: tab.label });
    button.dataset.active = String(togetherUi.sheetTab === tab.id);
    tabs.append(button);
  });
  head.append(tabs, actionButton(copy.close, 'close', closeStreamingSheet, { iconOnly: true, className: 'streaming-icon-button', title: copy.close }));
  const body = make('div', 'echo-streaming-sheet-body');
  if (togetherUi.sheetTab === 'comments') fillCommentSheet(body);
  else if (togetherUi.sheetTab === 'similar') fillSimilarSheet(body);
  else fillTogetherSheet(body);
  sheet.append(head, body);
  document.body.append(backdrop, sheet);
};
paintTogetherChrome = () => {
  if (packageDisposed) return;
  paintStreamingDock();
  paintStreamingSheet();
  renderTogetherRestore();
  renderTogetherBanner();
  renderTogetherPicker();
};
const onStreamingSheetKey = (event) => {
  if (event.key !== 'Escape' || togetherUi.pickerOpen || togetherUi.snapshot.pendingRestore) return;
  if (togetherUi.sheetOpen) closeStreamingSheet();
};
const installTogetherChrome = () => {
  window.addEventListener('echo-native', onNativeBroadcast);
  window.addEventListener('keydown', onStreamingSheetKey);
  const poll = window.setInterval(() => {
    if (packageDisposed) return;
    const elapsed = document.querySelector('.echo-streaming-sheet .echo-streaming-together-head small');
    if (elapsed && togetherUi.sheetOpen && togetherUi.sheetTab === 'together' && togetherUi.snapshot.inRoom) {
      elapsed.textContent = `${togetherUi.snapshot.users?.length || 1} · ${formatTogetherClock(togetherUi.snapshot.startedAt ? Date.now() - togetherUi.snapshot.startedAt : togetherUi.snapshot.elapsedMs)}`;
    }
    if (togetherUi.snapshot.inRoom && !togetherUi.applying) {
      void (async () => {
        const status = await playbackApi()?.getStatus?.().catch(() => null);
        const current = togetherCurrentNetease();
        if (!current || !status) return;
        const playing = status.state === 'playing';
        const progressMs = Number(status.positionMs) || 0;
        const jumped = Math.abs(progressMs - togetherUi.expectedMs) > 2200;
        const playStatus = playing ? 'PLAY' : 'PAUSE';
        const statusChanged = playStatus !== togetherUi.snapshot.playStatus;
        const songChanged = current.songId !== togetherUi.snapshot.songId;
        if (songChanged) await togetherReportLocal('GOTO');
        else if (statusChanged) await togetherReportLocal(playStatus);
        else if (jumped) await togetherReportLocal('seek');
        else await togetherReportLocal();
      })();
    }
  }, 1000);
  void togetherInvoke('togetherStatus', {}).then((snap) => applyTogetherSnapshot(snap)).catch(() => paintTogetherChrome());
  paintTogetherChrome();
  disposeTogetherChrome = () => {
    window.clearInterval(poll);
    window.removeEventListener('echo-native', onNativeBroadcast);
    window.removeEventListener('keydown', onStreamingSheetKey);
    document.querySelectorAll(overlayCleanupSelector).forEach((node) => node.remove());
  };
};
const neteaseTrackOf = (track) => {
  if (track?.provider === 'netease' && /^\d+$/u.test(String(track.providerTrackId || ''))) return track;
  const current = findPlaybackQueue()?.currentTrack;
  if (current?.provider === 'netease' && /^\d+$/u.test(String(current.providerTrackId || ''))) return current;
  return null;
};
const formatCommentTime = (ms) => {
  if (!ms) return '';
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const loadNeteaseComments = async (track, page = 1) => {
  const id = String(track?.providerTrackId || '');
  ncmUi.loading = true;
  paintNeteaseExtras();
  try {
    const result = await invokeMain('neteaseComments', { id, page, sortType: 3 });
    ncmUi.commentTrack = track;
    ncmUi.commentPage = page;
    ncmUi.comments = page > 1 ? [...ncmUi.comments, ...(result.comments || [])] : (result.comments || []);
    ncmUi.hot = result.hot || [];
    ncmUi.total = result.total || 0;
    ncmUi.selfId = result.selfId || null;
  } finally {
    ncmUi.loading = false;
    paintNeteaseExtras();
  }
};
const openNeteaseComments = async (track) => {
  const target = neteaseTrackOf(track);
  if (!target) {
    showChromeNotice(ncmCopy.emptyComments);
    return;
  }
  ncmUi.draft = '';
  ncmUi.replyTo = null;
  openStreamingSheet('comments');
  await loadNeteaseComments(target, 1);
};
const openNeteaseSimilar = async (track) => {
  const target = neteaseTrackOf(track);
  if (!target) return;
  ncmUi.similarTrack = target;
  openStreamingSheet('similar');
  const result = await invokeMain('neteaseSimilar', { id: target.providerTrackId, limit: ncmUi.similarCount });
  ncmUi.similarTracks = result.tracks || [];
  ncmUi.similarSeed = String(target.providerTrackId);
  paintTogetherChrome();
};
const queueSimilarTracks = async (playFirst = false) => {
  const tracks = ncmUi.similarTracks || [];
  if (!tracks.length) return;
  ncmUi.similarIds = tracks.map((item) => String(item.providerTrackId));
  ncmUi.similarPlayed = 0;
  if (playFirst) {
    await playViaQueue(tracks[0], { replaceQueueWith: tracks.map((item) => toLibraryTrack(item)), source: sourceFor('netease', ncmCopy.similar) });
  } else {
    for (const track of tracks) await appendViaQueue(track, sourceFor('netease', ncmCopy.similar));
  }
  showChromeNotice(ncmCopy.similarDone(tracks.length));
};
const similarOnTrackChange = async (force = false) => {
  const current = findPlaybackQueue()?.currentTrack;
  const id = current?.provider === 'netease' ? String(current.providerTrackId || '') : '';
  if (!id) return;
  if (!force && id === ncmUi.lastSongId) return;
  ncmUi.lastSongId = id;
  if (!ncmUi.similarAutoPlay) return;
  if (ncmUi.similarIds.includes(id)) ncmUi.similarPlayed += 1;
  const need = !ncmUi.similarIds.length || ncmUi.similarPlayed >= ncmUi.similarCount;
  if (!need) return;
  const result = await invokeMain('neteaseSimilar', { id, limit: ncmUi.similarCount }).catch(() => null);
  const tracks = result?.tracks || [];
  if (!tracks.length) return;
  ncmUi.similarTrack = current;
  ncmUi.similarTracks = tracks;
  ncmUi.similarSeed = id;
  ncmUi.similarIds = tracks.map((item) => String(item.providerTrackId));
  ncmUi.similarPlayed = 0;
  for (const track of tracks) await appendViaQueue(track, sourceFor('netease', ncmCopy.similar)).catch(() => undefined);
  showChromeNotice(ncmCopy.similarDone(tracks.length));
  if (ncmUi.similarOpen) paintNeteaseExtras();
};
const unblockNeteaseTrack = async (track) => {
  const target = neteaseTrackOf(track);
  if (!target) return;
  await invokeMain('neteaseUnblock', { id: target.providerTrackId, force: true });
  await playViaQueue(target, { forceRefresh: true, unblockTried: true, source: sourceFor('netease', ncmCopy.unblock) });
  showChromeNotice(ncmCopy.unblocked);
};
const renderCommentItem = (item, songId) => {
  const row = make('article', 'echo-streaming-comment');
  if (item.avatarUrl) {
    const img = document.createElement('img');
    img.src = item.avatarUrl;
    img.alt = '';
    row.append(img);
  }
  const body = make('div');
  body.append(make('strong', '', item.nickname || item.userId));
  body.append(make('p', '', item.content));
  const meta = make('div', 'echo-streaming-comment-meta');
  meta.append(make('small', '', formatCommentTime(item.time)));
  meta.append(actionButton(`${ncmCopy.like}${item.likedCount ? ` ${item.likedCount}` : ''}`, 'heart', async () => {
    await invokeMain('neteaseCommentLike', { id: songId, commentId: item.id, liked: !item.liked });
    item.liked = !item.liked;
    item.likedCount = Math.max(0, (item.likedCount || 0) + (item.liked ? 1 : -1));
    paintNeteaseExtras();
  }, { className: 'echo-streaming-comment-mini', active: item.liked }));
  meta.append(actionButton(ncmCopy.reply, 'chat', () => { ncmUi.replyTo = item; ncmUi.draft = ''; paintNeteaseExtras(); }, { className: 'echo-streaming-comment-mini' }));
  if (item.owner) meta.append(actionButton(ncmCopy.delete, 'close', async () => {
    await invokeMain('neteaseCommentDelete', { id: songId, commentId: item.id, page: 1 });
    showChromeNotice(ncmCopy.deleted);
    await loadNeteaseComments(ncmUi.commentTrack, 1);
  }, { className: 'echo-streaming-comment-mini' }));
  body.append(meta);
  (item.replies || []).forEach((reply) => {
    const nested = make('p', 'echo-streaming-comment-reply', `${reply.nickname}: ${reply.content}`);
    body.append(nested);
  });
  row.append(body);
  return row;
};
fillCommentSheet = (root) => {
  const title = make('header', 'echo-streaming-together-head');
  title.append(make('div', undefined, make('strong', '', ncmUi.commentTrack?.title || ncmCopy.comments)));
  root.append(title);
  const list = make('div', 'echo-streaming-comment-list');
  if (ncmUi.hot.length) {
    list.append(make('h3', '', ncmCopy.hot));
    ncmUi.hot.forEach((item) => list.append(renderCommentItem(item, ncmUi.commentTrack.providerTrackId)));
  }
  list.append(make('h3', '', ncmCopy.latest));
  if (ncmUi.loading && !ncmUi.comments.length) list.append(make('p', 'echo-streaming-together-empty', copy.loading));
  else if (!ncmUi.comments.length) list.append(make('p', 'echo-streaming-together-empty', ncmCopy.emptyComments));
  ncmUi.comments.forEach((item) => list.append(renderCommentItem(item, ncmUi.commentTrack?.providerTrackId)));
  if (ncmUi.comments.length < (ncmUi.total || 0)) list.append(actionButton(ncmCopy.loadMore, 'chevron', () => void loadNeteaseComments(ncmUi.commentTrack, ncmUi.commentPage + 1), { className: 'echo-streaming-together-secondary' }));
  root.append(list);
  const composer = make('form', 'echo-streaming-comment-composer');
  composer.addEventListener('submit', (event) => event.preventDefault());
  if (ncmUi.replyTo) composer.append(make('small', '', `${ncmCopy.reply} ${ncmUi.replyTo.nickname}`));
  const input = document.createElement('textarea');
  input.rows = 2;
  input.placeholder = neteaseConnected() ? ncmCopy.composer : ncmCopy.needLogin;
  input.value = ncmUi.draft;
  input.addEventListener('input', () => { ncmUi.draft = input.value; });
  composer.append(input, actionButton(ncmCopy.sending, 'check', async () => {
    const content = String(ncmUi.draft || '').trim();
    if (!content) return;
    await invokeMain('neteaseCommentAdd', {
      id: ncmUi.commentTrack.providerTrackId,
      content,
      commentId: ncmUi.replyTo?.id,
    });
    ncmUi.draft = '';
    ncmUi.replyTo = null;
    showChromeNotice(ncmCopy.sent);
    await loadNeteaseComments(ncmUi.commentTrack, 1);
  }, { className: 'echo-streaming-together-primary', disabled: !neteaseConnected() }));
  root.append(composer);
};
fillSimilarSheet = (root) => {
  const title = make('header', 'echo-streaming-together-head');
  title.append(make('div', undefined, make('strong', '', ncmUi.similarTrack?.title ? `${ncmCopy.similar} · ${ncmUi.similarTrack.title}` : ncmCopy.similar)));
  root.append(title, make('p', 'echo-streaming-together-empty', ncmCopy.similarHint));
  const tools = make('div', 'echo-streaming-together-actions');
  const auto = actionButton(ncmCopy.similarAuto, 'radio', () => {
    ncmUi.similarAutoPlay = !ncmUi.similarAutoPlay;
    persistMemory();
    paintTogetherChrome();
    if (ncmUi.similarAutoPlay) void similarOnTrackChange(true);
  }, { className: ncmUi.similarAutoPlay ? 'echo-streaming-together-primary' : 'echo-streaming-together-secondary', active: ncmUi.similarAutoPlay });
  const count = document.createElement('input');
  count.type = 'number';
  count.min = '3';
  count.max = '50';
  count.value = String(ncmUi.similarCount);
  count.title = ncmCopy.similarCount;
  count.addEventListener('change', () => {
    ncmUi.similarCount = Math.max(3, Math.min(50, Math.round(Number(count.value) || 10)));
    persistMemory();
  });
  tools.append(auto, count, actionButton(ncmCopy.similarPlay, 'play', () => void queueSimilarTracks(true), { className: 'echo-streaming-together-primary' }), actionButton(ncmCopy.similarQueue, 'list', () => void queueSimilarTracks(false), { className: 'echo-streaming-together-secondary' }));
  root.append(tools);
  const list = make('div', 'echo-streaming-similar-list');
  (ncmUi.similarTracks || []).forEach((track) => {
    const row = make('button', 'echo-streaming-together-friend');
    row.type = 'button';
    const copyBox = make('span');
    copyBox.append(make('strong', '', track.title || track.providerTrackId), make('small', '', track.artist || ''));
    row.append(copyBox);
    row.addEventListener('click', () => void playViaQueue(track, { source: sourceFor('netease', ncmCopy.similar) }));
    list.append(row);
  });
  root.append(list);
};
const paintNeteaseExtras = () => paintTogetherChrome();
const attachNeteaseTrackActions = () => {};
const ncmPlayerPoll = 0;
installTogetherChrome();
const installListeners = () => { if (downloadApi()?.onJobsUpdated) downloadUnsubscribe = downloadApi().onJobsUpdated((jobs) => { state.downloadJobs = Array.isArray(jobs) ? jobs : []; indexDownloadJobs(state.downloadJobs); state.downloadJobs.forEach(notifyDownloadJob); render(); }); bindAccountStatuses(); void invokeMain('target', {}).then((result) => { if (result?.directory) state.musicTargetBase = String(result.directory); }).catch(() => undefined); statusTimer = window.setInterval(() => { if (disposed) return; const key = playCurrentStableKey(); if (key !== state.currentStableKey) { state.currentStableKey = key; void similarOnTrackChange(); render(); } }, 1000); };

const stopAccountQrPolling = () => { window.clearTimeout(accountQrTimer); accountQrTimer = 0; state.accountQr = null; };
const disposeSidebar = external.sidebar.register({ id: 'main', label: manifest.name || copy.streaming, icon: '♫', order: Number(manifest.sidebarOrder) || 40, render(root) { pageRoot = root; disposed = false; installListeners(); render(); void loadInitial(); return () => { disposed = true; window.clearTimeout(searchTimer); window.clearInterval(statusTimer); resetSearchInput(); cancelPlaybackPrepare(); stopAccountQrPolling(); closeStreamMenu(); closePlaylistDownloadDialog(); accountUnsubscribe?.(); downloadUnsubscribe?.(); document.querySelectorAll('.settings-qr-login-backdrop[data-echo-streaming-qr]').forEach((node) => node.remove()); accountUnsubscribe = null; downloadUnsubscribe = null; pageRoot = null; }; } });
return () => { disposed = true; packageDisposed = true; window.clearTimeout(searchTimer); window.clearInterval(statusTimer); window.clearInterval(dailyRefreshTimer); window.clearInterval(ncmPlayerPoll); resetSearchInput(); cancelPlaybackPrepare(); stopAccountQrPolling(); closeStreamMenu(); closePlaylistDownloadDialog(); disposeTogetherChrome(); document.querySelectorAll('.echo-streaming-comment-panel, .echo-streaming-similar-panel').forEach((node) => node.remove()); accountUnsubscribe?.(); downloadUnsubscribe?.(); playlistPageUnsubscribe?.(); document.querySelectorAll('.settings-qr-login-backdrop[data-echo-streaming-qr]').forEach((node) => node.remove()); document.getElementById('echo-community-streaming-spatial')?.remove(); disposeSidebar?.(); };
