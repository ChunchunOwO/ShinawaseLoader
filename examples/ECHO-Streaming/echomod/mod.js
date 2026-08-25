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
  streaming: '流媒体', streamingTitle: '流媒体音乐', streamingDescription: '搜索在线曲库，并在播放前临时解析音频地址。', currentProvider: '当前来源', preparingSearch: '等待搜索', searchPlaceholder: '搜索歌曲、艺人、专辑', providers: '流媒体平台', tabs: '结果类型', track: '歌曲', album: '专辑', artist: '艺人', playlist: '歌单', quality: '音质', lossless: '无损', high: '高音质', standard: '标准', hires: 'Hi-Res', losslessDescription: '优先 FLAC', highDescription: '优先 320kbps', standardDescription: '优先兼容性', hiresDescription: '平台支持时启用', available: '可用', disabled: '已禁用', notLoggedIn: '未登录', loggedIn: (name) => `${name} 已登录`, searching: '搜索中', searchingEllipsis: '搜索中...', resultCount: (n) => `${n} 个结果`, searchHint: '输入关键词开始搜索。实际音频 URL 只在播放时解析，队列不会保存 URL。', notFoundTrack: '没有找到匹配的流媒体歌曲。', notFoundAlbum: '没有找到匹配的专辑。', notFoundArtist: '没有找到匹配的艺人。', notFoundPlaylist: '没有找到匹配的歌单。', play: '播放', queue: '加入队列', queued: '已加入队列', favorite: '收藏', unfavorite: '取消收藏', download: '下载', resolving: '正在解析播放地址...', playing: '正在播放', unavailable: '这首歌暂时不可播放', albumKicker: '流媒体专辑', artistKicker: '流媒体艺人', readingAlbum: '读取专辑', readingArtist: '读取艺人', playNow: '立即播放', playArtist: '播放艺人', addToQueue: '加入队列', downloadAlbum: '下载专辑', downloading: '下载中', tracks: '曲目', songs: '歌曲', discography: '作品', topTracks: '热门歌曲', albums: '专辑', source: '来源', released: '发行', unknown: '未知', close: '关闭', back: '流媒体', loading: '加载中...', loadMore: '加载更多', loadingMore: '加载中...', addPlaylist: '添加流媒体歌单', playlistHint: '粘贴网易云音乐、QQ 音乐或 Spotify 歌单链接，导入后会保存到本地播放列表。', playlistPlaceholder: '粘贴歌单链接，例如 https://music.163.com/#/playlist?id=...', add: '添加歌单', adding: '正在添加', cancelImport: '取消', syncPlaylists: '同步我的歌单', syncHint: '读取已登录的网易云音乐或 QQ 音乐账号歌单，选择后同步到本地播放列表。', syncMine: '同步我的歌单', refresh: '刷新列表', reading: '读取中', restart: '重启后可用', signedIn: '已登录', preferLoggedIn: '将优先读取已登录的平台。', needLogin: '请先在账号连接中登录网易云音乐或 QQ 音乐。', noPlaylists: '没有可同步的歌单，或当前平台尚未登录。', selectAll: '全选', deselectAll: '取消全选', selected: (a, b) => `已选择 ${a} / ${b}`, syncSelected: '同步选中歌单', syncing: '同步中', created: '我创建的歌单', favorited: '我收藏的歌单', accountPlaylist: '账号歌单', noticeTitle: '流媒体功能须知', noticeClose: '关闭须知', noticeConfirm: '我同意并继续', noticeCancel: '取消', consentPhrase: '我同意', consentInput: (phrase) => `输入“${phrase}”以继续`, noticeBody: 'ECHO Next 的流媒体入口只提供搜索、账号状态、收藏、歌单导入和播放入口整合。ECHO 不拥有、托管、出售或重新分发任何第三方流媒体平台的音频、视频、封面、歌词或元数据版权。', noticeItems: ['ECHO 的代码和插件受项目许可证约束；禁止破解、绕过授权、伪造权益、移除完整性校验，或把 ECHO 用作未经授权访问付费内容的工具。', '第三方平台、商标、曲库、API、账号、订阅、Cookie、DRM、地区限制和播放授权均由对应平台及权利人控制。', 'DMCA 是美国版权法中的通知与移除机制。权利人应通过对应平台或合法渠道提交通知。', '你应只使用自己有权访问的账号、订阅和内容，不得规避平台条款、下载限制、DRM、账号风控、付费墙或版权保护。', 'ECHO 不提供绕过会员、破解试听、规避付费或损害平台及权利人利益的能力。', 'ECHO 本质上是本地音乐播放器，流媒体入口优先级最低；出现问题时请先使用本地音乐库。', '如果你认为流媒体平台会员费用过高，请停止使用本功能并卸载软件。', '免责声明：ECHO 不对第三方平台造成的账号限制、服务中断、版权争议、DMCA 通知、数据丢失或地区不可用承担责任。'], noticeAcceptance: '继续表示你理解并接受：本功能是个人本地客户端辅助入口，不构成法律意见、版权授权、平台代理关系或内容可用性承诺。', imported: (name, count) => `已添加歌单：${name}，共 ${count} 首。可在播放列表页播放。`, synced: (ok, fail) => fail ? `歌单同步完成：成功 ${ok} 个，失败 ${fail} 个。` : `歌单同步完成：成功 ${ok} 个。`, noBridge: '桌面桥接不可用，请在 ECHO Next 客户端中使用流媒体。', downloadUnavailable: '桌面下载服务不可用。', unsupportedDownload: '此平台在 ECHO Next 中仅支持流播放，不提供下载任务。', recentSearches: '最近搜索', trackHeaderTitle: '歌曲', trackHeaderSource: '来源 / 音质', trackHeaderDuration: '时长', trackHeaderActions: '操作', accounts: '账号登录', searchSubmit: '搜索', downloadToMusic: '下载到音乐文件夹', downloadPlaylistToMusic: '下载整个歌单', musicSaveHint: (dir) => `保存到 ${dir}`, musicDownloadStarted: (title) => `开始下载：${title}`, musicDownloadDone: (title, path, quality) => `已保存：${title}${quality ? `（${quality}）` : ''}${path ? ` → ${path}` : ''}`, musicDownloadFailed: (title, message) => `下载失败：${title}${message ? ` - ${message}` : ''}`, downloadQualityTitle: '选择下载音质', probingQualities: '正在检测可用音质...', qualityCount: (n) => `${n} 种可用音质`, startDownload: '下载', cancelAction: '取消', playlistDownloadTitle: '下载歌单', readingPlaylistTracks: '正在读取歌单曲目...', applyAllQuality: '一键全部设置音质', perTrackQualityHint: '单独设置：点击歌曲行里的音质标签，可为单曲选择不同音质。', qualityFallbackNote: '不可用的音质会自动降级为该歌曲的最高可用音质。', probeProgress: (n, total) => `已检测音质 ${n}/${total}`, probeFailed: '无法检测该歌曲的音质，下载时将自动使用账号可用的最高音质。', probeFailedShort: '检测失败', skippedTracks: (n) => `已跳过 ${n} 个无法下载的项目（本地曲目或仅支持流播放的平台）。`, startPlaylistDownload: (n) => `开始下载（${n} 首）`, cancelDownload: '取消下载', downloadCancelled: (name) => `已取消歌单下载：${name}`, playlistDownloadBusy: '已有歌单正在下载，请稍候。', musicPlaylistReading: (name) => `正在读取歌单：${name}...`, musicPlaylistProgress: (name, done, total) => `正在下载歌单：${name}（${done}/${total}）`, musicPlaylistDone: (name, ok, failed, dir) => failed ? `歌单下载完成：${name}，成功 ${ok}，失败 ${failed}${dir ? ` → ${dir}` : ''}` : `歌单下载完成：${name}（${ok} 首）${dir ? ` → ${dir}` : ''}`, musicNoDownloadableTracks: '这个歌单没有可下载的歌曲。', mainBridgeUnavailable: '主进程下载桥接不可用，请用 ShinawaseLoader 重新启动 ECHO。', playlistItemsUnavailable: '无法读取歌单曲目，请更新 ECHO 后重试。', neteaseLoginRequired: '读取这个歌单需要登录（私密歌单仅登录后可见）。请先在账号页登录网易云音乐，再重试下载。',
} : {
  streaming: 'Streaming', streamingTitle: 'Streaming music', streamingDescription: 'Search online catalogs and resolve audio only when playback starts.', currentProvider: 'Current source', preparingSearch: 'Waiting for search', searchPlaceholder: 'Search songs, artists, or albums', providers: 'Streaming platforms', tabs: 'Result type', track: 'Tracks', album: 'Albums', artist: 'Artists', playlist: 'Playlists', quality: 'Quality', lossless: 'Lossless', high: 'High quality', standard: 'Standard', hires: 'Hi-Res', losslessDescription: 'Prefer FLAC', highDescription: 'Prefer 320kbps', standardDescription: 'Prefer compatibility', hiresDescription: 'Use when supported by the platform', available: 'Available', disabled: 'Disabled', notLoggedIn: 'Not logged in', loggedIn: (name) => `${name} logged in`, searching: 'Searching', searchingEllipsis: 'Searching...', resultCount: (n) => `${n} results`, searchHint: 'Enter a keyword to begin. Audio URLs are resolved only for playback and are never stored in the queue.', notFoundTrack: 'No streaming tracks found.', notFoundAlbum: 'No streaming albums found.', notFoundArtist: 'No streaming artists found.', notFoundPlaylist: 'No streaming playlists found.', play: 'Play', queue: 'Add to queue', queued: 'Added to queue', favorite: 'Favorite', unfavorite: 'Remove favorite', download: 'Download', resolving: 'Resolving playback address...', playing: 'Playing', unavailable: 'This track is not currently playable', albumKicker: 'Streaming Album', artistKicker: 'Streaming Artist', readingAlbum: 'Reading album', readingArtist: 'Reading artist', playNow: 'Play Now', playArtist: 'Play Artist', addToQueue: 'Add to Queue', downloadAlbum: 'Download album', downloading: 'Downloading', tracks: 'Tracks', songs: 'Songs', discography: 'Discography', topTracks: 'Top Tracks', albums: 'Albums', source: 'Source', released: 'Released', unknown: 'Unknown', close: 'Close', back: 'Streaming', loading: 'Loading...', loadMore: 'Load more', loadingMore: 'Loading...', addPlaylist: 'Add streaming playlist', playlistHint: 'Paste a NetEase, QQ Music, or Spotify playlist URL to save it to the local playlists.', playlistPlaceholder: 'Paste a playlist URL, for example https://music.163.com/#/playlist?id=...', add: 'Add playlist', adding: 'Adding', cancelImport: 'Cancel', syncPlaylists: 'Sync my playlists', syncHint: 'Read playlists from a connected NetEase or QQ Music account and add selected playlists to local playback.', syncMine: 'Sync my playlists', refresh: 'Refresh list', reading: 'Reading', restart: 'Available after restart', signedIn: 'Signed in', preferLoggedIn: 'A connected platform will be preferred.', needLogin: 'Connect a NetEase or QQ Music account first.', noPlaylists: 'No playlists available or the platform is not connected.', selectAll: 'Select all', deselectAll: 'Deselect all', selected: (a, b) => `Selected ${a} / ${b}`, syncSelected: 'Sync selected playlists', syncing: 'Syncing', created: 'Created by me', favorited: 'Favorited by me', accountPlaylist: 'Account playlist', noticeTitle: 'Streaming Feature Notice', noticeClose: 'Close notice', noticeConfirm: 'I agree and continue', noticeCancel: 'Cancel', consentPhrase: 'I agree', consentInput: (phrase) => `Type "${phrase}" to continue`, noticeBody: 'The ECHO Next streaming entry only integrates search, account status, favorites, playlist import, and playback entry points. ECHO does not own, host, sell, or redistribute copyrights to third-party streaming audio, video, artwork, lyrics, or metadata.', noticeItems: ['ECHO code and plugins are governed by the project license; cracking, bypassing authorization, forging entitlements, removing integrity checks, or unauthorized access to paid content is prohibited.', 'Third-party platforms, trademarks, catalogs, APIs, accounts, subscriptions, cookies, DRM, regional restrictions, and playback authorization are controlled by the relevant platforms and rightsholders.', 'DMCA is a notice-and-takedown mechanism; rightsholders should use the relevant platform or lawful channel.', 'Use only accounts, subscriptions, and content you are authorized to access. Do not bypass platform terms, download limits, DRM, risk controls, paywalls, or copyright protections.', 'ECHO will not provide membership bypass, preview cracking, payment evasion, or anything that harms platforms or rightsholders.', 'ECHO is fundamentally a local music player; use the local library first when streaming has problems.', 'If streaming memberships are too expensive, stop using this feature and uninstall the software.', 'Disclaimer: ECHO is not liable for account restrictions, service interruptions, copyright disputes, DMCA notices, data loss, or regional unavailability.'], noticeAcceptance: 'Continuing means you understand and accept that this feature is a personal local-client helper, not legal advice, a copyright license, a platform agency relationship, or a promise that content will be available.', imported: (name, count) => `Added playlist: ${name}, ${count} tracks.`, synced: (ok, fail) => fail ? `Playlist sync complete: ${ok} succeeded, ${fail} failed.` : `Playlist sync complete: ${ok} succeeded.`, noBridge: 'The desktop bridge is unavailable. Open ECHO Next to use streaming.', downloadUnavailable: 'The desktop download service is unavailable.', unsupportedDownload: 'This platform supports streaming only in ECHO Next and does not provide download jobs.', recentSearches: 'Recent searches', trackHeaderTitle: 'Song', trackHeaderSource: 'Source / Quality', trackHeaderDuration: 'Duration', trackHeaderActions: 'Actions', accounts: 'Accounts', searchSubmit: 'Search', downloadToMusic: 'Download to Music folder', downloadPlaylistToMusic: 'Download entire playlist', musicSaveHint: (dir) => `Save to ${dir}`, musicDownloadStarted: (title) => `Downloading: ${title}`, musicDownloadDone: (title, path, quality) => `Saved: ${title}${quality ? ` (${quality})` : ''}${path ? ` → ${path}` : ''}`, musicDownloadFailed: (title, message) => `Download failed: ${title}${message ? ` - ${message}` : ''}`, downloadQualityTitle: 'Choose download quality', probingQualities: 'Detecting available qualities...', qualityCount: (n) => `${n} available ${n === 1 ? 'quality' : 'qualities'}`, startDownload: 'Download', cancelAction: 'Cancel', playlistDownloadTitle: 'Download playlist', readingPlaylistTracks: 'Reading playlist tracks...', applyAllQuality: 'Set one quality for all', perTrackQualityHint: 'Per-song: click the quality tags on a row to override individual songs.', qualityFallbackNote: 'Unavailable qualities fall back to the best quality each song offers.', probeProgress: (n, total) => `Probed ${n}/${total}`, probeFailed: 'Quality detection failed; the best quality your account can access will be used at download time.', probeFailedShort: 'Probe failed', skippedTracks: (n) => `Skipped ${n} item${n === 1 ? '' : 's'} that cannot be downloaded (local tracks or streaming-only platforms).`, startPlaylistDownload: (n) => `Download ${n} ${n === 1 ? 'track' : 'tracks'}`, cancelDownload: 'Cancel download', downloadCancelled: (name) => `Playlist download cancelled: ${name}`, playlistDownloadBusy: 'A playlist download is already running.', musicPlaylistReading: (name) => `Reading playlist: ${name}...`, musicPlaylistProgress: (name, done, total) => `Downloading playlist: ${name} (${done}/${total})`, musicPlaylistDone: (name, ok, failed, dir) => failed ? `Playlist download finished: ${name}, ${ok} saved, ${failed} failed${dir ? ` → ${dir}` : ''}` : `Playlist download finished: ${name} (${ok} tracks)${dir ? ` → ${dir}` : ''}`, musicNoDownloadableTracks: 'This playlist has no downloadable tracks.', mainBridgeUnavailable: 'The main-process download bridge is unavailable. Relaunch ECHO with ShinawaseLoader.', playlistItemsUnavailable: 'Could not read the playlist tracks. Update ECHO and try again.', neteaseLoginRequired: 'Reading this playlist requires a signed-in account (private playlists are only visible after login). Connect NetEase Cloud Music on the accounts page and retry.',
};

const lyricsCopy = chinese ? {
  open: '\u6b4c\u8bcd', loading: '\u6b4c\u8bcd\u52a0\u8f7d\u4e2d...', missing: '\u6682\u65e0\u53ef\u7528\u6b4c\u8bcd', instrumental: '\u7eaf\u97f3\u4e50', source: '\u6765\u6e90', back: '\u8fd4\u56de\u6d41\u5a92\u4f53', failed: '\u6b4c\u8bcd\u52a0\u8f7d\u5931\u8d25'
} : {
  open: 'Lyrics', loading: 'Loading lyrics...', missing: 'No lyrics available', instrumental: 'Instrumental', source: 'Source', back: 'Back to Streaming', failed: 'Failed to load lyrics'
};

const stored = (() => { try { return external.settings?.get?.() || {}; } catch { return {}; } })();
const state = {
  ready: false, accepted: false, noticeOpen: false, noticeConsent: '', pendingAccountSync: null, providers: [], provider: String(stored.provider || config.defaultProvider || 'netease'), quality: qualities.includes(stored.quality) ? stored.quality : (qualities.includes(config.defaultQuality) ? config.defaultQuality : 'lossless'), qualityMenuOpen: false, activeTab: ['track', 'album', 'artist', 'playlist'].includes(stored.activeTab) ? stored.activeTab : 'track', input: String(stored.input || stored.query || ''), query: String(stored.query || ''), result: stored.result || null, loading: false, requestId: 0, error: null, actionError: null, actionMessage: null, selectedAlbum: null, selectedAlbumDetail: null, albumLoading: false, albumError: null, albumTrackLimit: albumInitialTrackCount, selectedArtist: null, selectedArtistDetail: null, artistLoading: false, artistError: null, playlistUrl: '', accountPlaylistProvider: 'netease', accountPlaylists: [], selectedAccountPlaylistIds: {}, accountPanelOpen: false, accountPageOpen: false, loadingAccountPlaylists: false, syncingAccountPlaylistIds: {}, importingPlaylistKey: null, resolvingTrackKey: null, queuedTrackKey: null, downloadingTrackKey: null, downloadEnabled: false, downloadJobs: [], downloadJobIdsByTrackKey: {}, albumDownload: null, favoriteTrackIds: {}, favoriteTrackKey: null, failedCoverUrls: stored.failedCoverUrls || {}, currentStableKey: '', scrollTop: Number(stored.scrollTop) || 0, recentSearches: Array.isArray(stored.recentSearches) && stored.recentSearches.length ? stored.recentSearches.filter((item) => typeof item === 'string' && item.trim()).slice(0, 8) : searchShortcuts.slice(),
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
state.accountMessages = {};
state.accountCookies = {};
state.accountBrowsers = {};
state.qobuzToken = '';
state.accountQr = null;
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
const renderAccountPage = () => { const page = make('div', 'streaming-page streaming-account-page'); const hero = make('header', 'streaming-hero'); const heroCopy = make('div', 'streaming-hero-copy'); heroCopy.append(make('span', 'streaming-kicker', accountText('账号连接', 'Account connections')), make('h1', '', accountText('流媒体账号', 'Streaming accounts')), make('p', '', accountText('登录、检查或退出第三方平台账号。登录信息由 ECHO 本地保存。', 'Sign in, check, or sign out of third-party platforms. Credentials stay local to ECHO.'))); hero.append(heroCopy); const actions = make('div', 'streaming-hero-meter'); actions.append(actionButton(accountText('刷新状态', 'Refresh'), 'refresh', () => loadAccountStatuses().catch((error) => { state.accountErrors.__global = error.message; refreshAccountPage(); }), { className: 'settings-action-button', title: accountText('刷新账号状态', 'Refresh account status') }), actionButton(accountText('检查全部', 'Check all'), 'check', () => accountAction('__global', 'check', () => accountApi().checkAll()), { className: 'settings-action-button', title: accountText('检查全部账号', 'Check all accounts') })); hero.append(actions); page.append(hero); if (state.accountErrors.__global) page.append(make('div', 'streaming-state streaming-state--error', state.accountErrors.__global)); const list = make('div', 'settings-account-list'); accountProviderOrder.forEach((provider) => { const status = accountStatusFor(provider); const row = make('article', 'settings-account-row streaming-account-row'); const summary = make('div', 'settings-account-summary'); const badge = make(status.connected ? 'span' : 'button', `${status.connected ? 'list-filter-chip active' : 'list-filter-chip settings-account-status-link'}`, status.connected ? accountText('已登录', 'Connected') : accountText('点击登录', 'Click to sign in')); badge.dataset.connected = String(status.connected); if (!status.connected) { badge.type = 'button'; badge.addEventListener('click', () => loginAccount(provider)); } summary.append(badge, make('div', '', make('h3', '', accountProviderLabels[provider] || provider)), make('p', '', accountText('使用 ECHO 本地账号桥接登录。', 'Sign in through ECHO local account bridge.'))); row.append(summary); const meta = make('div', 'settings-account-meta'); meta.append(make('span', '', status.displayName || status.username || accountText('未设置账号', 'No account connected'))); if (status.lastCheckedAt) meta.append(make('span', '', `${accountText('最近检查', 'Checked')} ${status.lastCheckedAt}`)); row.append(meta); const controls = make('div', 'settings-account-actions'); if (provider !== 'osu') controls.append(actionButton(state.accountBusy[provider] === 'login' ? accountText('登录中...', 'Opening...') : accountText('登录', 'Sign in'), 'link', provider === 'netease' ? startNeteaseQrLogin : () => loginAccount(provider), { className: 'settings-action-button settings-account-login-button', disabled: Boolean(state.accountBusy[provider]) })); controls.append(actionButton(state.accountBusy[provider] === 'check' ? accountText('检查中...', 'Checking...') : accountText('检查', 'Check'), 'refresh', () => checkAccount(provider), { className: 'settings-action-button', disabled: Boolean(state.accountBusy[provider]) })); controls.append(actionButton(accountText('退出', 'Sign out'), 'close', () => clearAccount(provider), { className: 'settings-danger-button', disabled: Boolean(state.accountBusy[provider]) })); row.append(controls); if (provider === 'youtube' || provider === 'soundcloud') { const browserLabel = make('label', 'settings-select-field settings-account-browser-field'); browserLabel.append(make('span', '', accountText('登录浏览器', 'Login browser'))); const browser = document.createElement('select'); ['none', 'edge', 'chrome', 'firefox'].forEach((value) => { const option = document.createElement('option'); option.value = value; option.textContent = value === 'none' ? accountText('不使用浏览器登录', 'No browser login') : value; option.selected = (state.accountBrowsers[provider] || 'none') === value; browser.append(option); }); browser.addEventListener('change', () => setAccountBrowser(provider, browser.value)); browserLabel.append(browser); row.append(browserLabel); } if (provider === 'qobuz') { const tokenLabel = make('label', 'settings-account-cookie-field'); const token = document.createElement('input'); token.type = 'password'; token.placeholder = 'Qobuz user_auth_token'; token.value = state.qobuzToken; token.addEventListener('input', () => { state.qobuzToken = token.value; }); tokenLabel.append(token); row.append(tokenLabel); } else if (provider !== 'osu') { const cookieLabel = make('label', 'settings-account-cookie-field'); const cookie = document.createElement('input'); cookie.type = 'password'; cookie.placeholder = accountText('粘贴 Cookie（可选）', 'Paste Cookie (optional)'); cookie.value = state.accountCookies[provider] || ''; cookie.addEventListener('input', () => { state.accountCookies[provider] = cookie.value; }); cookieLabel.append(cookie); row.append(cookieLabel, actionButton(accountText('保存 Cookie', 'Save Cookie'), 'check', () => saveAccountCookie(provider), { className: 'settings-action-button', disabled: Boolean(state.accountBusy[provider]) })); } if (status.error) row.append(make('p', 'settings-inline-error settings-account-note', status.error)); if (state.accountMessages[provider]) row.append(make('p', 'settings-inline-note settings-account-note', state.accountMessages[provider])); if (state.accountErrors[provider]) row.append(make('p', 'settings-inline-error settings-account-note', state.accountErrors[provider])); list.append(row); }); page.append(list); if (state.accountQr) { const qr = make('section', 'streaming-account-qr settings-account-row'); qr.append(make('h2', '', accountText('网易云扫码登录', 'NetEase QR login'))); const image = document.createElement('img'); image.src = state.accountQr.qrUrl; image.alt = accountText('网易云登录二维码', 'NetEase login QR code'); image.width = 220; image.height = 220; qr.append(image, make('p', 'settings-inline-note', state.accountQr.message || accountText('请扫码登录。', 'Scan to sign in.')), actionButton(accountText('关闭二维码', 'Close QR'), 'close', () => { state.accountQr = null; window.clearTimeout(accountQrTimer); refreshAccountPage(); }, { className: 'settings-action-button' })); page.append(qr); } return page; };
let pageRoot = null; let disposed = false; let searchTimer = 0; let statusTimer = 0; let accountUnsubscribe = null; let downloadUnsubscribe = null; let playlistPageUnsubscribe = null; let albumDownloadRunId = 0;
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
const makeIcon = (name, size = 16) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true'); svg.innerHTML = iconPaths[name] || ''; return svg; };
const make = (tag, className = '', text = undefined) => { const node = document.createElement(tag); if (className) node.className = className; if (text instanceof Node) node.append(text); else if (text !== undefined) node.textContent = String(text ?? ''); return node; };
const actionButton = (label, iconName, handler, options = {}) => { const node = make('button', options.className || '', options.iconOnly ? undefined : label); node.type = 'button'; if (iconName) node.prepend(makeIcon(iconName, options.size || 16)); node.title = options.title || label; node.setAttribute('aria-label', options.ariaLabel || label); if (options.active !== undefined) node.dataset.active = String(options.active); if (options.disabled) node.disabled = true; node.addEventListener('click', (event) => { event.stopPropagation(); try { Promise.resolve(handler(event)).catch(reportError); } catch (error) { reportError(error); } }); return node; };
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
const playViaQueue = async (track, options = {}) => {
  const quality = options.quality || state.quality;
  const item = asLibraryTrack(track, quality);
  const player = playerApi();
  if (player?.playTrack) return player.playTrack(item, options);
  const playback = playbackApi();
  if (!playback?.playMediaItem) throw new Error(copy.noBridge);
  return playback.playMediaItem({ item: toPlayableTrack(item, quality), startSeconds: options.startSeconds, forceRefresh: options.forceRefresh === true });
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
const persistMemory = () => { try { external.settings?.set?.({ provider: state.provider, quality: state.quality, downloadQuality: state.downloadQuality, activeTab: state.activeTab, input: state.input, query: state.query, resultKey: state.result ? `${state.provider}:${state.activeTab}:${state.query.trim().toLocaleLowerCase()}` : null, result: state.result, failedCoverUrls: state.failedCoverUrls, scrollTop: state.scrollTop, recentSearches: state.recentSearches }); } catch {} };
const rememberSearch = (query) => { const value = String(query || '').trim(); if (!value) return; state.recentSearches = [value, ...state.recentSearches.filter((item) => item !== value)].slice(0, 8); };
const providerRailState = (provider) => accountAwareProviders.has(provider?.name) && provider.accountConnected !== true ? 'signedOut' : !provider?.enabled ? 'disabled' : accountAwareProviders.has(provider?.name) ? 'signedIn' : 'available';
const providerRailStatus = (provider) => { const rail = providerRailState(provider); return rail === 'disabled' ? copy.disabled : rail === 'signedOut' ? copy.notLoggedIn : rail === 'signedIn' ? copy.loggedIn(provider.accountDisplayName || provider.displayName) : copy.available; };
let packageDisposed = false;
void (async () => { if (document.getElementById('echo-community-streaming-spatial')) return; try { const css = await external.loadAsset('spatial.css'); if (!css || packageDisposed) return; const style = document.createElement('style'); style.id = 'echo-community-streaming-spatial'; style.textContent = String(css) + (config.hideUnavailable === true ? '\n.streaming-row[data-unavailable="true"] { display: none; }' : ''); document.head.append(style); } catch {} })();
const showChromeNotice = (message) => window.dispatchEvent(new CustomEvent('app:show-chrome-notice', { detail: message }));
const reportError = (error) => { if (disposed) return; state.actionError = error instanceof Error ? error.message : String(error); state.actionMessage = null; render(); };
const setMessage = (message) => { state.actionError = null; state.actionMessage = message; render(); };
const visibleLyricsTracks = () => state.selectedAlbumDetail ? (state.selectedAlbumDetail.tracks || []).slice(0, state.albumTrackLimit) : state.selectedArtistDetail ? (state.selectedArtistDetail.topTracks || []) : (state.result?.tracks || []);
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

const appendAlbumCard = (parent, album) => { const card = make('article', 'streaming-discovery-card'); card.setAttribute('role', 'button'); card.tabIndex = 0; card.addEventListener('click', () => openAlbum(album)); card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAlbum(album); } }); appendCover(card, album.coverThumb || album.coverUrl || defaultCover, album.id); const main = make('div', 'streaming-main'); const line = make('div', 'streaming-title-line'); line.append(makeIcon('disc', 15), make('strong', '', album.title || 'Untitled')); main.append(line, make('span', '', album.artist || ''), make('small', '', `${album.provider} · ${album.trackCount ? formatTrackCount(album.trackCount) : (chinese ? '曲目数未知' : 'Track count unknown')}${album.releaseDate ? ` · ${album.releaseDate}` : ''}`)); card.append(main); parent.append(card); };
const appendArtistCard = (parent, artist) => { const card = make('article', 'streaming-discovery-card'); card.setAttribute('role', 'button'); card.tabIndex = 0; card.addEventListener('click', () => openArtist(artist)); card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openArtist(artist); } }); appendCover(card, artist.avatarUrl || artist.coverUrl || defaultCover, artist.id, true); const main = make('div', 'streaming-main'); const line = make('div', 'streaming-title-line'); line.append(makeIcon('user', 15), make('strong', '', artist.name || artist.providerArtistId || 'Unknown Artist')); main.append(line, make('span', '', artist.provider || ''), make('small', '', `${chinese ? '艺人 ID' : 'Artist ID'} · ${artist.providerArtistId || ''}`)); card.append(main); parent.append(card); };
const appendPlaylistCard = (parent, playlist) => { const card = make('article', 'streaming-discovery-card streaming-playlist-card'); appendCover(card, playlist.coverThumb || playlist.coverUrl || defaultCover, playlist.id); const main = make('div', 'streaming-main'); const line = make('div', 'streaming-title-line'); line.append(makeIcon('list', 15), make('strong', '', playlist.title || 'Untitled')); main.append(line, make('span', '', playlist.creator || playlist.provider || ''), make('small', '', `${playlist.provider} · ${formatTrackCount(playlist.trackCount)}`)); card.append(main); const importing = state.importingPlaylistKey === playlist.id; card.append(actionButton(importing ? copy.adding : copy.add, 'list', () => handleImportStreamingPlaylist(playlist), { className: 'streaming-playlist-add', disabled: Boolean(state.importingPlaylistKey), title: importing ? copy.adding : copy.add })); card.addEventListener('contextmenu', (event) => openStreamMenu(event, [{ label: copy.downloadPlaylistToMusic, hint: musicMenuHint(playlist.title || ''), icon: 'download', disabled: Boolean(state.musicPlaylistDownload), onSelect: () => openPlaylistDownloadDialog(playlist) }])); parent.append(card); };
const appendAccountPlaylistRow = (parent, playlist) => { const row = make('div', 'streaming-account-playlist-row'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = state.selectedAccountPlaylistIds[playlist.providerPlaylistId] === true; checkbox.disabled = Object.keys(state.syncingAccountPlaylistIds).length > 0; checkbox.setAttribute('aria-label', `${copy.selectAll} ${playlist.title}`); checkbox.addEventListener('change', () => { state.selectedAccountPlaylistIds[playlist.providerPlaylistId] = checkbox.checked; render(); }); row.append(checkbox); appendCover(row, playlist.coverThumb || playlist.coverUrl || defaultCover, playlist.id); const main = make('span', 'streaming-account-playlist-main'); main.append(make('strong', '', playlist.title || 'Untitled')); const ownership = playlist.ownership === 'created' ? copy.created : playlist.ownership === 'favorited' ? copy.favorited : copy.accountPlaylist; main.append(make('small', '', `${ownership} · ${formatTrackCount(playlist.trackCount)}${playlist.creator ? ` · ${playlist.creator}` : ''}`)); row.append(main); const syncing = state.syncingAccountPlaylistIds[playlist.providerPlaylistId] === true; row.append(actionButton(syncing ? copy.syncing : copy.add, syncing ? 'refresh' : 'list', () => requestAccountPlaylistSync([playlist]), { className: 'streaming-account-playlist-add-one', disabled: Object.keys(state.syncingAccountPlaylistIds).length > 0, title: syncing ? copy.syncing : copy.add })); row.addEventListener('contextmenu', (event) => openStreamMenu(event, [{ label: copy.downloadPlaylistToMusic, hint: musicMenuHint(playlist.title || ''), icon: 'download', disabled: Boolean(state.musicPlaylistDownload), onSelect: () => openPlaylistDownloadDialog(playlist) }])); parent.append(row); };

const renderNoticeModal = () => { if (!state.noticeOpen) return null; const backdrop = make('div', 'settings-modal-backdrop settings-streaming-notice-backdrop'); backdrop.dataset.state = 'open'; backdrop.addEventListener('mousedown', () => cancelNotice()); const dialog = make('section', 'settings-font-modal settings-streaming-notice-modal'); dialog.dataset.state = 'open'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'settings-streaming-notice-title'); dialog.addEventListener('mousedown', (event) => event.stopPropagation()); const header = make('header', 'settings-font-modal-header'); const heading = make('div', 'settings-streaming-notice-heading'); heading.append(makeIcon('shield', 18), make('h3', '', copy.noticeTitle)); header.append(heading, actionButton(copy.close, 'close', cancelNotice, { iconOnly: true, className: 'settings-icon-button', title: copy.noticeClose })); dialog.append(header); const body = make('div', 'settings-streaming-notice-body'); body.append(make('p', '', copy.noticeBody)); const list = make('ul'); copy.noticeItems.forEach((item) => list.append(make('li', '', item))); body.append(list, make('p', '', copy.noticeAcceptance)); dialog.append(body); const label = make('label', 'settings-danger-confirm-field settings-streaming-notice-confirm'); label.append(make('span', '', copy.consentInput(copy.consentPhrase))); const input = document.createElement('input'); input.value = state.noticeConsent; input.autofocus = true; input.addEventListener('input', () => { state.noticeConsent = input.value; confirm.disabled = input.value.trim() !== copy.consentPhrase; }); input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && input.value.trim() === copy.consentPhrase) confirmNotice(); }); label.append(input); dialog.append(label); const actions = make('div', 'settings-streaming-notice-actions'); actions.append(actionButton(copy.noticeCancel, null, cancelNotice, { className: 'settings-action-button' })); const confirm = actionButton(copy.noticeConfirm, null, confirmNotice, { className: 'settings-danger-button', disabled: state.noticeConsent.trim() !== copy.consentPhrase }); actions.append(confirm); dialog.append(actions); backdrop.append(dialog); return backdrop; };
const renderGate = () => { const page = make('div', 'streaming-page streaming-hub'); const empty = make('div', 'streaming-results-empty'); const gate = make('div', 'streaming-entry-notice-gate'); gate.append(make('strong', '', copy.noticeTitle), make('span', '', copy.noticeAcceptance)); gate.append(actionButton(copy.noticeTitle, null, () => { state.noticeOpen = true; render(); }, { className: 'streaming-load-more' })); empty.append(gate); page.append(empty); if (state.noticeOpen) page.append(renderNoticeModal()); return page; };

const renderAlbumDetail = () => { const album = state.selectedAlbumDetail || state.selectedAlbum; const page = make('div', 'album-detail-page'); page.append(actionButton(copy.back, 'arrow', () => { state.selectedAlbum = null; state.selectedAlbumDetail = null; state.albumError = null; render(); }, { className: 'album-back-button', title: copy.back })); const hero = make('section', 'album-detail-hero'); const cover = make('div', 'album-detail-cover'); const coverSrc = album?.coverThumb || album?.coverUrl || defaultCover; cover.dataset.empty = String(coverSrc === defaultCover); const image = document.createElement('img'); image.src = coverSrc; image.alt = ''; image.width = 320; image.height = 320; image.decoding = 'async'; cover.append(image); hero.append(cover); const consoleBox = make('div', 'album-detail-console'); const details = make('div', 'album-detail-copy'); details.append(make('span', 'album-detail-kicker', copy.albumKicker), make('h1', '', album?.title || ''), make('p', '', album?.artist || '')); const meta = make('div', 'album-detail-meta'); [album?.releaseDate, formatTrackCount(state.selectedAlbumDetail?.tracks?.length ?? album?.trackCount), formatAlbumDuration(state.selectedAlbumDetail?.tracks || []), album?.provider].filter(Boolean).forEach((item) => meta.append(make('span', '', item))); details.append(meta); consoleBox.append(details); const actions = make('div', 'album-detail-actions'); actions.append(actionButton(state.albumLoading ? copy.readingAlbum : copy.playNow, state.albumLoading ? 'refresh' : 'play', handlePlayAlbum, { className: 'album-primary-action', disabled: state.albumLoading || !(state.selectedAlbumDetail?.tracks || []).length, title: copy.playNow })); const downloadable = (state.selectedAlbumDetail?.tracks || []).filter((track) => track.playable && !unsupportedDownloadProviders.has(track.provider) && streamingTrackWebUrl(track)).length; if (state.downloadEnabled) actions.append(actionButton(state.albumDownload ? copy.downloading : copy.downloadAlbum, state.albumDownload ? 'refresh' : 'download', handleDownloadAlbum, { className: 'album-secondary-action', disabled: state.albumLoading || !downloadable || Boolean(state.albumDownload), title: copy.downloadAlbum })); consoleBox.append(actions); if (state.albumError) consoleBox.append(make('p', 'album-detail-error', state.albumError)); hero.append(consoleBox); const facts = make('aside', 'album-detail-facts'); [[copy.source, album?.provider || ''], [copy.tracks, formatTrackCount(state.selectedAlbumDetail?.tracks?.length ?? album?.trackCount)], [copy.released, album?.releaseDate || copy.unknown], [copy.quality, state.selectedAlbumDetail?.tracks?.length ? trackQualitySummary(state.selectedAlbumDetail.tracks[0]) : (chinese ? '读取中' : 'Reading signal')]].forEach(([label, value]) => { const fact = make('div', 'album-fact'); fact.append(make('span', '', label), make('strong', '', value)); facts.append(fact); }); hero.append(facts); page.append(hero); const section = make('section', 'album-detail-track-console'); section.append(make('header', 'album-detail-tabs')); const tracks = state.selectedAlbumDetail?.tracks || []; if (state.albumLoading && !tracks.length) section.append(make('div', 'streaming-state', chinese ? '正在读取专辑...' : 'Reading album...')); else if (!state.albumLoading && !tracks.length && !state.albumError) section.append(make('div', 'streaming-state', chinese ? '这张专辑没有可显示的歌曲。' : 'This album has no tracks to display.')); const list = make('div', 'streaming-album-track-list'); tracks.slice(0, state.albumTrackLimit).forEach((track) => appendTrackRow(list, track)); if (tracks.length > state.albumTrackLimit) list.append(actionButton(copy.loadMore, null, () => { state.albumTrackLimit += albumTrackRenderStep; render(); }, { className: 'streaming-load-more' })); section.append(list); page.append(section); return page; };
const renderArtistDetail = () => { const artist = state.selectedArtistDetail || state.selectedArtist; const name = artistName(artist); const page = make('div', 'streaming-artist-page'); page.append(actionButton(copy.back, 'arrow', () => { state.selectedArtist = null; state.selectedArtistDetail = null; state.artistError = null; render(); }, { className: 'streaming-artist-back', title: copy.back })); const hero = make('section', 'streaming-artist-hero'); const avatar = make('div', 'streaming-artist-avatar'); const src = artist?.coverUrl || artist?.avatarUrl; avatar.dataset.cover = String(Boolean(src)); if (src) { const image = document.createElement('img'); image.src = src; image.alt = ''; image.width = 512; image.height = 512; avatar.append(image); } else avatar.append(make('span', '', name.slice(0, 1).toUpperCase())); hero.append(avatar); const body = make('div', 'streaming-artist-copy'); body.append(make('span', 'streaming-artist-kicker', copy.artistKicker), make('h1', '', name)); const meta = make('div', 'streaming-artist-meta'); meta.append(make('span', '', artist?.provider || state.provider), make('span', '', formatTrackCount(state.selectedArtistDetail?.topTracks?.length || 0)), make('span', '', `${state.selectedArtistDetail?.albums?.length || 0} ${copy.albums.toLowerCase()}`)); body.append(meta, make('p', '', `${copy.streaming} catalog from ${artist?.provider || state.provider}.`)); const actions = make('div', 'streaming-artist-actions'); const top = state.selectedArtistDetail?.topTracks || []; actions.append(actionButton(state.artistLoading ? copy.readingArtist : copy.playArtist, state.artistLoading ? 'refresh' : 'play', handlePlayArtist, { className: 'streaming-artist-primary-action', disabled: state.artistLoading || !top.some((track) => track.playable), title: copy.playArtist }), actionButton(copy.addToQueue, 'list', handleQueueArtist, { className: 'streaming-artist-secondary-action', disabled: !top.some((track) => track.playable), title: copy.addToQueue })); body.append(actions); if (state.artistError) body.append(make('p', 'streaming-artist-error', state.artistError)); hero.append(body); const stats = make('div', 'streaming-artist-stats'); [[copy.source, artist?.provider || state.provider], [copy.tracks, top.length], [copy.albums, state.selectedArtistDetail?.albums?.length || 0]].forEach(([label, value]) => { const item = make('div'); item.append(make('span', '', label), make('strong', '', value)); stats.append(item); }); hero.append(stats); page.append(hero); const trackSection = make('section', 'streaming-artist-section'); const heading = make('div', 'streaming-artist-section-heading'); const headingCopy = make('div'); headingCopy.append(make('span', '', copy.topTracks), make('h2', '', copy.songs)); heading.append(headingCopy); trackSection.append(heading); if (state.artistLoading && !top.length) trackSection.append(make('div', 'streaming-state', chinese ? '正在读取艺人...' : 'Reading artist...')); else if (!state.artistLoading && !top.length && !state.artistError) trackSection.append(make('div', 'streaming-state', chinese ? '这个艺人没有可显示的歌曲。' : 'This artist has no tracks to display.')); const list = make('div', 'streaming-artist-track-list'); top.forEach((track) => appendTrackRow(list, track)); trackSection.append(list); page.append(trackSection); const albums = state.selectedArtistDetail?.albums || []; if (albums.length) { const albumSection = make('section', 'streaming-artist-section'); const albumHeading = make('div', 'streaming-artist-section-heading'); const albumHeadingCopy = make('div'); albumHeadingCopy.append(make('span', '', copy.albums), make('h2', '', copy.discography)); albumHeading.append(albumHeadingCopy); albumSection.append(albumHeading); const albumList = make('div', 'streaming-artist-album-list'); albums.forEach((item) => appendAlbumCard(albumList, item)); albumSection.append(albumList); page.append(albumSection); } return page; };

const renderPlaylistPanel = (playlists) => { const panel = make('div', 'streaming-playlist-panel'); const form = make('form', 'streaming-playlist-import'); const copyBox = make('div', 'streaming-playlist-import-copy'); const copyTitle = make('span', '', copy.addPlaylist); copyTitle.prepend(makeIcon('link', 18)); copyBox.append(copyTitle, make('p', '', copy.playlistHint)); form.append(copyBox); const label = make('label'); label.append(makeIcon('link', 18)); const input = document.createElement('input'); input.value = state.playlistUrl; input.placeholder = copy.playlistPlaceholder; input.disabled = Boolean(state.importingPlaylistKey); input.addEventListener('input', () => { state.playlistUrl = input.value; }); label.append(input); form.append(label); form.append(actionButton(state.importingPlaylistKey ? copy.adding : copy.add, state.importingPlaylistKey ? 'refresh' : 'list', () => handleImportPlaylist(), { disabled: !state.playlistUrl.trim() || Boolean(state.importingPlaylistKey), title: copy.add })); form.addEventListener('submit', (event) => { event.preventDefault(); void handleImportPlaylist().catch(reportError); }); const sync = make('section', 'streaming-account-playlist-sync'); const syncCopy = make('div', 'streaming-playlist-import-copy'); const syncTitle = make('span', '', copy.syncPlaylists); syncTitle.prepend(makeIcon('refresh', 18)); syncCopy.append(syncTitle, make('p', '', copy.syncHint)); sync.append(syncCopy); const toolbar = make('div', 'streaming-account-playlist-toolbar'); if (state.accountPanelOpen) { const tabs = make('div', 'streaming-account-provider-tabs'); ['netease', 'qqmusic'].forEach((name) => { const descriptor = state.providers.find((item) => item.name === name); const tab = actionButton(descriptor?.displayName || (name === 'netease' ? '网易云音乐' : 'QQ 音乐'), null, () => { state.accountPlaylistProvider = name; state.accountPlaylists = []; state.selectedAccountPlaylistIds = {}; void loadAccountPlaylists(name); }, { className: name === state.accountPlaylistProvider ? 'active' : '', disabled: state.loadingAccountPlaylists || Object.keys(state.syncingAccountPlaylistIds).length > 0 }); if (descriptor?.accountConnected) tab.append(make('small', '', ` ${copy.signedIn}`)); tabs.append(tab); }); toolbar.append(tabs); } else toolbar.append(make('span', 'streaming-account-playlist-hint', state.providers.some((item) => (item.name === 'netease' || item.name === 'qqmusic') && item.accountConnected) ? copy.preferLoggedIn : copy.needLogin)); const stale = typeof streamApi()?.listAccountPlaylists !== 'function'; toolbar.append(actionButton(stale ? copy.restart : state.loadingAccountPlaylists ? copy.reading : state.accountPanelOpen ? copy.refresh : copy.syncMine, 'refresh', () => state.accountPanelOpen ? loadAccountPlaylists(state.accountPlaylistProvider) : openAccountPlaylistSync(), { className: 'streaming-playlist-add', disabled: stale || state.loadingAccountPlaylists || Object.keys(state.syncingAccountPlaylistIds).length > 0 })); sync.append(toolbar); if (state.accountPanelOpen) { const box = make('div', 'streaming-account-playlist-panel'); if (state.accountPlaylists.length) { const selection = make('div', 'streaming-account-playlist-selection'); const all = state.accountPlaylists.every((item) => state.selectedAccountPlaylistIds[item.providerPlaylistId] === true); selection.append(actionButton(all ? copy.deselectAll : copy.selectAll, all ? 'check' : 'list', () => { state.selectedAccountPlaylistIds = all ? {} : Object.fromEntries(state.accountPlaylists.map((item) => [item.providerPlaylistId, true])); render(); }, { className: 'streaming-inline-action' }), make('span', '', copy.selected(Object.values(state.selectedAccountPlaylistIds).filter(Boolean).length, state.accountPlaylists.length))); box.append(selection); const list = make('div', 'streaming-account-playlist-list'); state.accountPlaylists.forEach((item) => appendAccountPlaylistRow(list, item)); box.append(list); const actions = make('div', 'streaming-account-playlist-actions'); actions.append(make('span', '', state.accountPlaylistProvider), actionButton(copy.syncSelected, 'list', () => requestAccountPlaylistSync(state.accountPlaylists.filter((item) => state.selectedAccountPlaylistIds[item.providerPlaylistId])), { className: 'streaming-playlist-add', disabled: !state.accountPlaylists.some((item) => state.selectedAccountPlaylistIds[item.providerPlaylistId]) || Object.keys(state.syncingAccountPlaylistIds).length > 0 })); box.append(actions); } else box.append(make('div', 'streaming-results-empty', state.loadingAccountPlaylists ? copy.loading : copy.noPlaylists)); sync.append(box); } panel.append(sync); if (playlists.length) { const list = make('div', 'streaming-discovery-list'); playlists.forEach((item) => appendPlaylistCard(list, item)); panel.append(list); } panel.append(form); return panel; };

const submitSearch = (value = state.input) => {
  window.clearTimeout(searchTimer);
  state.input = String(value || '');
  state.query = state.input.trim();
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
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = copy.searchPlaceholder;
  searchInput.value = state.input;
  searchInput.autocomplete = 'off';
  searchInput.addEventListener('compositionstart', () => { searchInput.dataset.composing = 'true'; });
  searchInput.addEventListener('compositionend', () => { delete searchInput.dataset.composing; });
  searchInput.addEventListener('input', () => {
    state.input = searchInput.value;
    persistMemory();
    if (searchInput.dataset.composing) return;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => submitSearch(state.input), 800);
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !searchInput.dataset.composing) {
      event.preventDefault();
      submitSearch(searchInput.value);
    }
  });
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
  if (!pageRoot || state.selectedLyricsTrack || state.selectedAlbum || state.selectedArtist) return;
  const heading = pageRoot.querySelector('.streaming-source-rail-heading');
  if (!heading || heading.querySelector('[data-echo-account-entry]')) return;
  const button = actionButton(copy.accounts, 'user', openAccountPage, { className: 'settings-action-button streaming-account-toggle' });
  button.dataset.echoAccountEntry = 'true';
  heading.append(button);
};
const render = () => {
  if (!pageRoot || disposed) return;
  persistMemory();
  const search = pageRoot.querySelector?.('.streaming-search-box input');
  const keepSearch = Boolean(search && document.activeElement === search);
  const caret = keepSearch ? [search.selectionStart, search.selectionEnd] : null;
  pageRoot.replaceChildren(state.ready ? (state.accountPageOpen ? renderAccountView() : state.selectedAlbum ? renderAlbumDetail() : state.selectedArtist ? renderArtistDetail() : state.accepted ? renderMain() : renderGate()) : make('div', 'streaming-page streaming-hub', make('div', 'streaming-results-empty', copy.loading)));
  if (!state.accountPageOpen) renderAccountEntry();
  attachLyricsActions();
  if (!keepSearch) return;
  const next = pageRoot.querySelector('.streaming-search-box input');
  if (!next) return;
  next.focus({ preventScroll: true });
  try { next.setSelectionRange(caret?.[0] ?? next.value.length, caret?.[1] ?? next.value.length); } catch {}
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
const runSearch = async (page = 1, mode = 'replace') => { const api = streamApi(); const query = state.query.trim(); if (!state.accepted || !query) { state.result = null; state.loading = false; state.error = null; render(); return; } if (!api?.search) { state.error = copy.noBridge; render(); return; } const requestId = ++state.requestId; state.loading = true; state.error = null; if (mode === 'replace' && document.activeElement !== pageRoot?.querySelector?.('.streaming-search-box input')) render(); try { const next = await api.search({ provider: state.provider, query, mediaTypes: [state.activeTab], page, pageSize }); if (requestId !== state.requestId) return; state.result = mode === 'append' && state.result ? { ...next, tracks: [...(state.result.tracks || []), ...(next.tracks || [])], albums: [...(state.result.albums || []), ...(next.albums || [])], artists: [...(state.result.artists || []), ...(next.artists || [])], playlists: [...(state.result.playlists || []), ...(next.playlists || [])], mvs: [...(state.result.mvs || []), ...(next.mvs || [])] } : next; state.result.page = page; state.input = state.query; if (mode === 'replace') rememberSearch(state.query); if (state.activeTab === 'track') void probeVisibleTrackQualities(state.result?.tracks); } catch (error) { if (requestId === state.requestId) { state.error = error instanceof Error ? error.message : String(error); if (mode === 'replace') state.result = null; } } finally { if (requestId === state.requestId) state.loading = false; persistMemory(); render(); } };
const handlePlay = async (track) => { const key = trackKey(track); if (state.resolvingTrackKey === key) return; if (track.playable === false) { state.actionError = track.unavailableReason || copy.unavailable; state.actionMessage = null; render(); return; } state.resolvingTrackKey = key; state.actionError = null; state.actionMessage = null; render(); try { const candidates = state.selectedArtistDetail?.topTracks?.some((item) => trackKey(item) === key) ? state.selectedArtistDetail.topTracks : state.selectedAlbumDetail?.tracks?.some((item) => trackKey(item) === key) ? state.selectedAlbumDetail.tracks : state.result?.tracks || []; const playable = candidates.filter((item) => item.playable !== false).map((item) => toLibraryTrack(item)); await playViaQueue(track, { replaceQueueWith: playable.length ? playable : undefined, source: sourceFor(track.provider, `${copy.streaming} / ${track.provider}`), forceNewQueueItem: !playable.length }); state.actionMessage = null; } catch (error) {
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
const handleDownloadAlbum = async () => { const detail = state.selectedAlbumDetail; if (!detail || state.albumDownload) return; const stream = streamApi(); const downloads = downloadApi(); const list = (detail.tracks || []).filter((track) => track.playable && !unsupportedDownloadProviders.has(track.provider) && streamingTrackWebUrl(track)); if (!stream?.resolvePlayback || !downloads?.createUrlJob) throw new Error(copy.downloadUnavailable); if (!list.length) throw new Error(chinese ? '这张专辑没有可下载的歌曲。' : 'This album has no downloadable tracks.'); const runId = ++albumDownloadRunId; state.albumDownload = { albumId: detail.id, title: detail.title, total: list.length, queued: 0, failedToQueue: 0, jobIds: [] }; showChromeNotice(`${chinese ? '准备下载专辑' : 'Preparing album download'}：${detail.title}（0/${list.length}）`); render(); const subdirectory = [detail.artist, detail.title].filter(Boolean).join(' - ') || detail.title; for (let index = 0; index < list.length; index += 1) { if (albumDownloadRunId !== runId) return; const track = list[index]; state.downloadingTrackKey = trackKey(track); showChromeNotice(`${chinese ? '解析专辑' : 'Resolving album'}：${detail.title}，${index + 1}/${list.length} · ${track.title}`); try { const source = await stream.resolvePlayback({ provider: track.provider, providerTrackId: track.providerTrackId, quality: state.quality }); const job = await downloads.createUrlJob(source.url, { title: track.title, artist: track.artist, album: track.album || detail.title, albumArtist: track.albumArtist || detail.artist || track.artist, coverUrl: track.coverUrl || track.coverThumb || detail.coverUrl || detail.coverThumb || null, webpageUrl: streamingTrackWebUrl(track), outputSubdirectory: subdirectory, bindMvAfterImport: false, deferImportToLibrary: true, requestHeaders: source.headers, directAudio: true, directAudioMimeType: source.mimeType, directAudioExtension: source.codec, streamingProvider: track.provider, streamingProviderTrackId: track.providerTrackId, streamingStableKey: trackKey(track), downloadAuthorizationToken: source.downloadAuthorizationToken }); state.downloadJobs = [job, ...state.downloadJobs.filter((item) => item.id !== job.id)]; state.downloadJobIdsByTrackKey[trackKey(track)] = job.id; state.albumDownload.queued += 1; state.albumDownload.jobIds.push(job.id); } catch (error) { state.albumDownload.failedToQueue += 1; state.actionError = error instanceof Error ? error.message : String(error); } finally { state.downloadingTrackKey = null; render(); } await sleep(90); } const done = state.albumDownload?.queued || 0; const failed = state.albumDownload?.failedToQueue || 0; const notice = failed ? `专辑已加入下载队列：${detail.title}，成功 ${done}/${list.length}，失败 ${failed}` : `专辑已加入下载队列：${detail.title}（${done}/${list.length}）`; showChromeNotice(notice); state.actionMessage = notice; if (!done) state.albumDownload = null; render(); };
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
const loadNeteasePlaylistTracksViaMain = async (playlist, fallbackName) => {
  const playlistId = neteasePlaylistIdFor(playlist);
  if (!playlistId) return null;
  let listed = null;
  try {
    listed = await invokeMain('neteasePlaylist', { playlistId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/netease_login_required/u.test(message)) throw new Error(copy.neteaseLoginRequired);
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
  if (!tracks.length) throw new Error(copy.musicNoDownloadableTracks);
  return { name: sanitizeFolderName(listed?.name || fallbackName) || 'Playlist', tracks, skipped: 0 };
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
  const viaMain = await loadNeteasePlaylistTracksViaMain(playlist, fallbackName);
  if (viaMain) return viaMain;
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
const openPlaylistDownloadDialog = (playlist) => {
  if (state.musicPlaylistDownload) {
    showChromeNotice(copy.playlistDownloadBusy);
    return;
  }
  closeStreamMenu();
  closePlaylistDownloadDialog();
  const model = {
    stage: 'reading',
    name: sanitizeFolderName(playlist.title || playlist.name || 'Playlist') || 'Playlist',
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
  dialog.setAttribute('aria-label', `${copy.playlistDownloadTitle} ${model.name}`);
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
    heading.append(make('strong', '', `${copy.playlistDownloadTitle}：${model.name}`), make('small', '', musicMenuHint(model.name)));
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
      showChromeNotice(copy.playlistDownloadBusy);
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
      nodes.push(make('div', 'echo-streaming-download-dialog-loading', copy.readingPlaylistTracks));
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
      const loaded = await loadPlaylistTracksForDownload(playlist);
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
const onNativeBroadcast = (event) => {
  const detail = event?.detail;
  if (!detail || detail.id !== (manifest.id || 'echo.community-streaming') || detail.name !== 'music-download-progress') return;
  const payload = detail.payload || {};
  const selector = window.CSS?.escape ? CSS.escape(String(payload.key || '')) : String(payload.key || '');
  const node = pageRoot?.querySelector?.(`[data-music-download-key="${selector}"]`);
  if (!node) return;
  node.textContent = payload.percent != null
    ? `${copy.downloading} ${payload.percent}%`
    : `${copy.downloading} ${((payload.receivedBytes || 0) / 1048576).toFixed(1)} MB`;
};
const openImportedPlaylist = async (imported) => {
  window.dispatchEvent(new Event('library:playlists-changed'));
  try { await libraryApi()?.getPlaylists?.(); } catch {}
  if (imported?.playlistId) {
    window.dispatchEvent(new CustomEvent('app:navigate:route', { detail: 'playlists' }));
  }
};
const handleImportPlaylist = async () => { const url = state.playlistUrl.trim(); if (!url) return; const stream = streamApi(); if (!stream?.importPlaylistFromUrl) throw new Error(copy.noBridge); state.importingPlaylistKey = '__url__'; render(); try { const imported = await stream.importPlaylistFromUrl(url); state.playlistUrl = ''; state.actionMessage = copy.imported(imported.playlistName, imported.importedCount); state.actionError = null; await openImportedPlaylist(imported); } finally { state.importingPlaylistKey = null; render(); } };
const handleImportStreamingPlaylist = async (playlist) => { const url = streamingPlaylistWebUrl(playlist); if (!url || state.importingPlaylistKey) return; const stream = streamApi(); if (!stream?.importPlaylistFromUrl) throw new Error(copy.noBridge); state.importingPlaylistKey = playlist.id; render(); try { const imported = await stream.importPlaylistFromUrl(url); state.actionMessage = copy.imported(imported.playlistName, imported.importedCount); state.actionError = null; await openImportedPlaylist(imported); } finally { state.importingPlaylistKey = null; render(); } };
const loadAccountPlaylists = async (provider = state.accountPlaylistProvider) => { const stream = streamApi(); if (!stream?.listAccountPlaylists) throw new Error(chinese ? '当前窗口尚未加载歌单同步桥接，请重启 ECHO Next。' : 'Playlist sync is unavailable in this window. Restart ECHO Next.'); state.accountPlaylistProvider = provider; state.accountPanelOpen = true; state.loadingAccountPlaylists = true; state.actionError = null; render(); try { const result = await stream.listAccountPlaylists(provider); state.accountPlaylists = result.playlists || []; state.selectedAccountPlaylistIds = {}; state.actionMessage = state.accountPlaylists.length ? `已读取 ${state.accountPlaylists.length} 个歌单。` : copy.noPlaylists; } catch (error) { state.accountPlaylists = []; state.selectedAccountPlaylistIds = {}; state.actionError = error instanceof Error ? error.message : String(error); } finally { state.loadingAccountPlaylists = false; render(); } };
const openAccountPlaylistSync = () => { const connected = state.providers.find((item) => (item.name === 'netease' || item.name === 'qqmusic') && item.accountConnected); state.accountPlaylistProvider = connected?.name || state.accountPlaylistProvider; void loadAccountPlaylists(state.accountPlaylistProvider).catch(reportError); };
const syncAccountPlaylists = async (items) => { if (!items?.length || Object.keys(state.syncingAccountPlaylistIds).length) return; const stream = streamApi(); if (!stream?.importPlaylistFromUrl) throw new Error(copy.noBridge); let ok = 0; let failed = 0; for (const playlist of items) { state.syncingAccountPlaylistIds[playlist.providerPlaylistId] = true; render(); try { await stream.importPlaylistFromUrl(playlist.webUrl || streamingPlaylistWebUrl(playlist)); ok += 1; } catch { failed += 1; } finally { delete state.syncingAccountPlaylistIds[playlist.providerPlaylistId]; } } state.selectedAccountPlaylistIds = {}; await openImportedPlaylist({ playlistId: true }); state.actionMessage = copy.synced(ok, failed); render(); };
const requestAccountPlaylistSync = (items) => { if (!items?.length) return; if (!state.accepted) { state.pendingAccountSync = items; state.noticeOpen = true; render(); return; } void syncAccountPlaylists(items).catch(reportError); };
const openAlbum = async (album) => { state.selectedAlbum = album; state.selectedAlbumDetail = null; state.albumError = null; state.albumLoading = true; render(); try { if (!streamApi()?.getAlbum) throw new Error(copy.noBridge); state.selectedAlbumDetail = await streamApi().getAlbum({ provider: album.provider, providerAlbumId: album.providerAlbumId }); void probeVisibleTrackQualities(state.selectedAlbumDetail?.tracks); } catch (error) { state.albumError = error instanceof Error ? error.message : String(error); } finally { state.albumLoading = false; render(); } };
const openArtist = async (artist) => { state.selectedArtist = artist; state.selectedArtistDetail = null; state.artistError = null; state.artistLoading = true; render(); try { if (!streamApi()?.getArtist) throw new Error(copy.noBridge); state.selectedArtistDetail = await streamApi().getArtist({ provider: artist.provider, providerArtistId: artist.providerArtistId }); void probeVisibleTrackQualities(state.selectedArtistDetail?.topTracks); } catch (error) { state.artistError = error instanceof Error ? error.message : String(error); } finally { state.artistLoading = false; render(); } };
const handlePlayAlbum = async () => { const detail = state.selectedAlbumDetail; const playable = (detail?.tracks || []).filter((track) => track.playable).map((track) => toLibraryTrack(track)); if (!playable.length) { state.albumError = chinese ? '这张专辑暂时没有可播放的歌曲。' : 'This album has no playable tracks.'; render(); return; } try { state.albumError = null; await playViaQueue(playable[0], { replaceQueueWith: playable, source: sourceFor(detail.provider, `${detail.title} / ${detail.provider}`) }); } catch (error) { state.albumError = error instanceof Error ? error.message : String(error); render(); } };
const handlePlayArtist = async () => { const detail = state.selectedArtistDetail; const playable = (detail?.topTracks || []).filter((track) => track.playable).map((track) => toLibraryTrack(track)); if (!playable.length) { state.artistError = chinese ? '这个艺人暂时没有可播放的歌曲。' : 'This artist has no playable tracks.'; render(); return; } try { state.artistError = null; await playViaQueue(playable[0], { replaceQueueWith: playable, source: sourceFor(detail.provider, `${artistName(detail)} / ${detail.provider}`) }); } catch (error) { state.artistError = error instanceof Error ? error.message : String(error); render(); } };
const handleQueueArtist = () => { const detail = state.selectedArtistDetail; const source = sourceFor(detail?.provider || state.provider, `${artistName(detail)} / ${detail?.provider || state.provider}`); (detail?.topTracks || []).filter((track) => track.playable).forEach((track) => appendViaQueue(track, source)); setMessage(copy.queued); };
const handleQualityChange = async (quality) => { state.quality = quality; state.qualityMenuOpen = false; persistMemory(); const current = findPlaybackQueue()?.currentTrack; render(); if (!current || current.mediaType !== 'streaming' || current.provider !== state.provider || current.streamingQuality === quality) return; try { const status = await playbackApi()?.getStatus?.(); if (status?.currentTrackId !== current.id || !['loading', 'playing'].includes(status.state)) return; await playViaQueue({ ...current, providerTrackId: current.providerTrackId, stableKey: current.stableKey || current.id }, { source: sourceFor(current.provider), startSeconds: Math.max(0, Number(status.positionMs || 0) / 1000), forceRefresh: true, quality }); state.actionMessage = chinese ? `已切换音质：${copy[quality]}` : `Quality switched: ${copy[quality]}`; render(); } catch (error) { reportError(error); } };
const confirmNotice = async () => { if (state.noticeConsent.trim() !== copy.consentPhrase) return; state.noticeOpen = false; state.noticeConsent = ''; state.accepted = true; try { await appApi()?.setSettings?.({ streamingPlaylistImportNoticeAccepted: true }); } catch {} render(); await Promise.all([loadProviders().catch((error) => { state.error = error.message; }), loadFavorites(), loadJobs()]); render(); if (state.pendingAccountSync) { const items = state.pendingAccountSync; state.pendingAccountSync = null; await syncAccountPlaylists(items); } if (state.query) await runSearch(1, 'replace'); };
const cancelNotice = () => { state.noticeOpen = false; state.noticeConsent = ''; state.pendingAccountSync = null; render(); };
const loadInitial = async () => { let settings = {}; try { settings = await appApi()?.getSettings?.() || {}; } catch {} state.downloadEnabled = settings.downloadsFeatureUnlocked === true; state.accepted = config.requireConsent === false || settings.streamingPlaylistImportNoticeAccepted === true; state.ready = true; render(); if (!state.accepted) { state.noticeOpen = false; return; } try { await loadProviders(); await Promise.all([loadFavorites(), loadJobs(), loadAccountStatuses().catch(() => undefined)]); bindAccountStatuses(); } catch (error) { state.accountErrors.__global = error instanceof Error ? error.message : String(error); } render(); if (state.query && !state.result) await runSearch(1, 'replace'); };
const bindAccountStatuses = () => { try { accountUnsubscribe?.(); } catch {} const api = accountApi(); if (!api?.onStatusesChanged) return; accountUnsubscribe = api.onStatusesChanged((statuses) => { if (Array.isArray(statuses)) state.accountStatuses = statuses; void loadProviders(true).catch(() => undefined); refreshAccountPage(); }); };
const installNativePlaylistImport = () => {
  const marker = 'data-echo-streaming-playlist-import';
  const log = (message, extra) => {
    if (extra !== undefined) console.info('[ECHO-Streaming]', message, extra);
    else console.info('[ECHO-Streaming]', message);
  };
  let lastMissAt = 0;
  let lastMissReason = '';
  const miss = (reason, extra) => {
    const now = Date.now();
    if (reason === lastMissReason && now - lastMissAt < 4000) return;
    lastMissAt = now;
    lastMissReason = reason;
    log(reason, extra);
  };
  const buttonMarker = 'data-echo-streaming-import-button';
  // Route transitions keep a hidden copy of the previous page in the DOM
  // (AnimatedOutlet double-buffering), so the page lookup must only accept
  // copies whose surrounding <main> is actually rendered.
  const isLivePage = (node) => {
    if (!node || !node.isConnected) return false;
    const surface = node.closest('main') || node;
    return getComputedStyle(surface).display !== 'none';
  };
  // Strictly the native playlists page sidebar header; never the mod's own
  // streaming pages (that caused the control to show up in the wrong place).
  const findHeader = () => {
    for (const page of document.querySelectorAll('.playlists-page')) {
      if (!isLivePage(page)) continue;
      if (page.closest('.streaming-page, .streaming-hub')) continue;
      if (pageRoot && pageRoot.contains(page)) continue;
      const header = page.querySelector('.playlist-sidebar .playlist-sidebar-header');
      if (header) return header;
    }
    return null;
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
  const mount = () => {
    for (const node of document.querySelectorAll(`[${buttonMarker}], form[${marker}]`)) {
      if (!isLivePage(node)) node.remove();
    }
    const header = findHeader();
    if (!header) {
      miss('native playlists sidebar header not found; waiting for .playlists-page .playlist-sidebar-header');
      return false;
    }
    if (header.querySelector(`[${buttonMarker}]`)) return true;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tool-button';
    button.setAttribute(buttonMarker, 'true');
    button.setAttribute('aria-label', copy.addPlaylist);
    button.title = copy.addPlaylist;
    button.innerHTML = cloudDownIcon(17);
    button.addEventListener('click', () => openForm(header));
    header.append(button);
    log('added streaming playlist import button next to the local add button');
    return true;
  };
  mount();
  const observer = new MutationObserver(() => { mount(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const onRoute = (event) => {
    const route = event?.detail;
    if (route && route !== 'playlists') return;
    window.setTimeout(mount, 50);
  };
  window.addEventListener('app:navigate:route', onRoute);
  window.addEventListener('popstate', mount);
  const poll = window.setInterval(mount, 1500);
  return () => {
    observer.disconnect();
    window.removeEventListener('app:navigate:route', onRoute);
    window.removeEventListener('popstate', mount);
    window.clearInterval(poll);
    for (const node of document.querySelectorAll(`[${buttonMarker}], form[${marker}]`)) node.remove();
  };
};
playlistPageUnsubscribe = installNativePlaylistImport();
const installListeners = () => { if (downloadApi()?.onJobsUpdated) downloadUnsubscribe = downloadApi().onJobsUpdated((jobs) => { state.downloadJobs = Array.isArray(jobs) ? jobs : []; indexDownloadJobs(state.downloadJobs); state.downloadJobs.forEach(notifyDownloadJob); render(); }); bindAccountStatuses(); window.addEventListener('echo-native', onNativeBroadcast); void invokeMain('target', {}).then((result) => { if (result?.directory) state.musicTargetBase = String(result.directory); }).catch(() => undefined); statusTimer = window.setInterval(() => { if (disposed) return; const key = playCurrentStableKey(); if (key !== state.currentStableKey) { state.currentStableKey = key; render(); } }, 1000); };

const stopAccountQrPolling = () => { window.clearTimeout(accountQrTimer); accountQrTimer = 0; state.accountQr = null; };
const disposeSidebar = external.sidebar.register({ id: 'main', label: manifest.name || copy.streaming, icon: '♫', order: Number(manifest.sidebarOrder) || 40, render(root) { pageRoot = root; disposed = false; installListeners(); render(); void loadInitial(); return () => { disposed = true; window.clearTimeout(searchTimer); window.clearInterval(statusTimer); cancelPlaybackPrepare(); stopAccountQrPolling(); closeStreamMenu(); closePlaylistDownloadDialog(); window.removeEventListener('echo-native', onNativeBroadcast); accountUnsubscribe?.(); downloadUnsubscribe?.(); document.querySelectorAll('.settings-qr-login-backdrop[data-echo-streaming-qr]').forEach((node) => node.remove()); accountUnsubscribe = null; downloadUnsubscribe = null; pageRoot = null; }; } });
return () => { disposed = true; packageDisposed = true; window.clearTimeout(searchTimer); window.clearInterval(statusTimer); cancelPlaybackPrepare(); stopAccountQrPolling(); closeStreamMenu(); closePlaylistDownloadDialog(); window.removeEventListener('echo-native', onNativeBroadcast); accountUnsubscribe?.(); downloadUnsubscribe?.(); playlistPageUnsubscribe?.(); document.querySelectorAll('.settings-qr-login-backdrop[data-echo-streaming-qr]').forEach((node) => node.remove()); document.getElementById('echo-community-streaming-spatial')?.remove(); disposeSidebar?.(); };
