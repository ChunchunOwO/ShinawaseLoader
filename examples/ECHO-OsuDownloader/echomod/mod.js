/* osu! beatmap downloader. Talks to ECHO's downloads bridge (search, mirrors,
   account library) exposed by ShinawaseLoader; osu!-only requests need no
   feature unlock. Downloads extract audio/cover/BPM from .osz archives and
   import them into the library. */
const external = echoExternalMod;
const manifest = external.manifest || {};
const config = external.config || {};

const locale = String(config.locale || 'zh-CN');
const chinese = locale.toLowerCase().startsWith('zh');
// The downloads bridge clamps limitPerProvider to 1-20, so never advertise more.
const searchLimit = Math.max(5, Math.min(20, Number(config.searchLimit) || 20));
const bestPageSize = 50;
const mostPlayedPageSize = 50;
const activeJobStatuses = new Set(['queued', 'probing', 'downloading', 'extracting_audio', 'importing', 'binding_mv']);
const rulesets = ['osu', 'taiko', 'fruits', 'mania'];
const rulesetLabels = { osu: 'osu!', taiko: 'osu!taiko', fruits: 'osu!catch', mania: 'osu!mania' };
const mirrors = ['auto', 'official', 'sayobot', 'catboy', 'nerinyan'];
const defaultCover = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="14" fill="#fce7f3"/><circle cx="48" cy="48" r="22" fill="none" stroke="#ec4899" stroke-width="7"/><circle cx="48" cy="48" r="7" fill="#ec4899"/></svg>')}`;

const copy = chinese ? {
  kicker: 'osu! 谱面下载',
  title: 'osu!downloader',
  description: '搜索 osu! 谱面（beatmapset）并下载音频到本地曲库：自动提取音频、封面与谱面 BPM，支持多镜像与 osu! 账号谱面库。',
  notLoggedIn: '未登录 osu!',
  login: '登录', logout: '退出登录', check: '检查', refresh: '刷新',
  ffmpegOk: 'FFmpeg 可用', ffmpegMissing: '缺少 FFmpeg：非 MP3 音频无法转换',
  mirror: '下载镜像', mirrorNames: { auto: '自动选择', official: '官方 osu.ppy.sh（需登录）', sayobot: 'Sayobot 小夜', catboy: 'Catboy (osu.direct)', nerinyan: 'NeriNyan' },
  outputDir: '下载目录', chooseDir: '选择', defaultDir: '未设置（首次下载时选择）',
  importToLibrary: '下载后导入曲库',
  tabSearch: '搜索谱面', tabAccount: '账号谱面库', tabJobs: '下载队列',
  searchPlaceholder: '搜索谱面 / 艺术家 / 作图者，或粘贴 beatmapset 链接、纯数字 ID',
  searchAction: '搜索', searching: '搜索中...',
  searchHint: '关键词经 Sayobot / 官方 / Catboy 镜像搜索。下载的 .osz 会自动解包出音频与封面，BPM 取自谱面 timing 数据。',
  searchEmpty: '没有找到匹配的谱面。',
  resultCount: (n) => `${n} 个谱面`,
  download: '下载', downloadingBtn: '下载中', downloadedBtn: '已完成', retry: '重试',
  queuedNotice: (title) => `已加入下载队列：${title}`,
  downloadAll: '下载本页全部',
  loginRequired: '登录 osu! 账号后可浏览你的最佳成绩、收藏谱面与最常游玩，并逐个或批量下载。',
  loginHint: '将打开 osu.ppy.sh 官方登录窗口，登录凭据仅保存在本地。',
  loginBusy: '正在打开登录窗口...',
  kindBest: '最佳成绩', kindFavourites: '收藏谱面', kindMostPlayed: '最常游玩',
  statGlobalRank: '全球排名', statCountryRank: '国家排名', statPp: 'PP', statAccuracy: '准确率', statPlayCount: '游玩次数', statLevel: '等级',
  collectionEmpty: '这个列表暂时是空的。',
  loadMore: '加载更多', loading: '加载中...',
  position: (n) => `#${n}`,
  playCountLabel: (n) => `${n} 次游玩`,
  jobsEmpty: '暂无 osu! 下载任务。',
  clearCompleted: '清除已完成', cancel: '取消',
  jobStatus: { queued: '排队中', probing: '解析中', downloading: '下载中', extracting_audio: '提取音频', importing: '导入曲库', binding_mv: '绑定 MV', completed: '已完成', failed: '失败', cancelled: '已取消' },
  jobDone: (title) => `谱面下载完成：${title}`,
  jobFailed: (title, error) => `谱面下载失败：${title}${error ? ` - ${error}` : ''}`,
  noBridge: '下载桥接不可用。请确认 ShinawaseLoader 已正确安装并重启 ECHO。',
  loginNeededError: '需要登录 osu! 账号。',
  errors: {
    osu_account_login_required: '需要登录 osu! 账号。',
    osu_downloader_only_supports_beatmapset_links: '只支持 osu.ppy.sh 的 beatmapset 链接。',
    osu_favourites_limit_exceeded: '收藏谱面数量超出单次读取上限。',
  },
} : {
  kicker: 'osu! beatmap downloads',
  title: 'osu!downloader',
  description: 'Search osu! beatmapsets and download their audio into the local library: audio, cover art, and beatmap BPM are extracted automatically, with mirror selection and osu! account library support.',
  notLoggedIn: 'Not signed in to osu!',
  login: 'Sign in', logout: 'Sign out', check: 'Check', refresh: 'Refresh',
  ffmpegOk: 'FFmpeg available', ffmpegMissing: 'FFmpeg missing: non-MP3 audio cannot be converted',
  mirror: 'Mirror', mirrorNames: { auto: 'Auto', official: 'Official osu.ppy.sh (login required)', sayobot: 'Sayobot', catboy: 'Catboy (osu.direct)', nerinyan: 'NeriNyan' },
  outputDir: 'Output folder', chooseDir: 'Choose', defaultDir: 'Not set (chosen on first download)',
  importToLibrary: 'Import to library after download',
  tabSearch: 'Search', tabAccount: 'Account library', tabJobs: 'Download queue',
  searchPlaceholder: 'Search beatmaps / artists / mappers, or paste a beatmapset link or numeric ID',
  searchAction: 'Search', searching: 'Searching...',
  searchHint: 'Queries go through the Sayobot / official / Catboy mirrors. Downloaded .osz archives are unpacked for audio and cover art; BPM comes from beatmap timing data.',
  searchEmpty: 'No matching beatmapsets found.',
  resultCount: (n) => `${n} beatmapsets`,
  download: 'Download', downloadingBtn: 'Downloading', downloadedBtn: 'Done', retry: 'Retry',
  queuedNotice: (title) => `Queued for download: ${title}`,
  downloadAll: 'Download all on this page',
  loginRequired: 'Sign in to osu! to browse your best scores, favourites, and most played beatmapsets, and download them individually or in bulk.',
  loginHint: 'Opens the official osu.ppy.sh login window. Credentials stay local.',
  loginBusy: 'Opening login window...',
  kindBest: 'Best scores', kindFavourites: 'Favourites', kindMostPlayed: 'Most played',
  statGlobalRank: 'Global rank', statCountryRank: 'Country rank', statPp: 'PP', statAccuracy: 'Accuracy', statPlayCount: 'Play count', statLevel: 'Level',
  collectionEmpty: 'This list is empty for now.',
  loadMore: 'Load more', loading: 'Loading...',
  position: (n) => `#${n}`,
  playCountLabel: (n) => `${n} plays`,
  jobsEmpty: 'No osu! download jobs yet.',
  clearCompleted: 'Clear completed', cancel: 'Cancel',
  jobStatus: { queued: 'Queued', probing: 'Probing', downloading: 'Downloading', extracting_audio: 'Extracting audio', importing: 'Importing', binding_mv: 'Binding MV', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' },
  jobDone: (title) => `Beatmapset downloaded: ${title}`,
  jobFailed: (title, error) => `Beatmapset download failed: ${title}${error ? ` - ${error}` : ''}`,
  noBridge: 'The downloads bridge is unavailable. Make sure ShinawaseLoader is installed, then restart ECHO.',
  loginNeededError: 'An osu! account login is required.',
  errors: {
    osu_account_login_required: 'An osu! account login is required.',
    osu_downloader_only_supports_beatmapset_links: 'Only osu.ppy.sh beatmapset links are supported.',
    osu_favourites_limit_exceeded: 'Too many favourites to read in one request.',
  },
};

const bridge = () => window.__echoShinawaseStreaming || {};
const downloadsApi = () => external.echo?.downloads || window.echo?.downloads || bridge().downloads;
const accountsApi = () => external.echo?.accounts || window.echo?.accounts || bridge().accounts;
// external.toast prefers the loader toast and falls back to the legacy
// app:show-chrome-notice event; current ECHO Steam no longer guarantees the latter.
const showChromeNotice = (message) => external.toast(String(message));
const friendlyError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  for (const [needle, text] of Object.entries(copy.errors)) if (message.includes(needle)) return text;
  return message;
};

const state = {
  tab: 'search',
  input: '', query: '', results: [], searching: false, searched: false, searchError: null,
  settings: null, tools: null,
  account: { connected: false, username: null, displayName: null, avatarUrl: null },
  profile: null, profileLoading: false, profileError: null, loggingIn: false,
  kind: 'best', ruleset: 'osu',
  collection: [], collectionTotal: null, collectionLoading: false, collectionError: null, collectionPage: 0, collectionDone: false,
  jobs: [], pendingDownloads: {}, notified: {}, bulkDownloading: false,
};

let pageRoot = null;
let disposed = true;
let modDisposed = false;
let scrollTop = 0;
let jobsUnsubscribe = null;
let statusesUnsubscribe = null;
let notifySeeded = false;
let collectionToken = 0;

/* ---------- tiny DOM helpers ---------- */
const make = (tag, className = '', text = undefined) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text instanceof Node) node.append(text);
  else if (text !== undefined) node.textContent = String(text ?? '');
  return node;
};
const iconPaths = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  download: '<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-4L3 10m0-4v4h4M4 13a8 8 0 0 0 14.7 4L21 14m0 4v-4h-4"/>',
  user: '<circle cx="12" cy="8" r="3"/><path d="M5 20c.8-3.3 3.1-5 7-5s6.2 1.7 7 5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  circle: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  star: '<path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2-5.6-3.1-5.6 3.1 1.2-6.2L3 9.5l6.3-.8z"/>',
};
const makeIcon = (name, size = 15) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = iconPaths[name] || '';
  return svg;
};
const button = (label, iconName, handler, options = {}) => {
  const node = make('button', `osu-dl-btn${options.variant ? ` osu-dl-btn--${options.variant}` : ''}`, label);
  node.type = 'button';
  if (iconName) node.prepend(makeIcon(iconName, options.size || 15));
  node.title = options.title || label;
  if (options.disabled) node.disabled = true;
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    Promise.resolve(handler(event)).catch((error) => showChromeNotice(friendlyError(error)));
  });
  return node;
};
const cover = (url, className) => {
  const image = document.createElement('img');
  image.className = className;
  image.loading = 'lazy';
  image.src = url || defaultCover;
  image.addEventListener('error', () => { if (image.src !== defaultCover) image.src = defaultCover; });
  return image;
};
const formatDuration = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  const whole = Math.round(value);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
const formatInt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString(chinese ? 'zh-CN' : 'en-US') : null;
};
const formatBytes = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

/* ---------- job bookkeeping ---------- */
const beatmapsetIdFrom = (url) => {
  const match = String(url || '').match(/(?:beatmapsets|\/s)\/(\d+)/u);
  return match ? match[1] : null;
};
const osuJobs = () => state.jobs.filter((job) => job.provider === 'osu');
const jobForBeatmapset = (beatmapsetId) => {
  if (!beatmapsetId) return null;
  const matches = osuJobs().filter((job) => beatmapsetIdFrom(job.sourceUrl) === String(beatmapsetId));
  if (!matches.length) return null;
  return matches.find((job) => activeJobStatuses.has(job.status)) || matches.find((job) => job.status === 'completed') || matches[matches.length - 1];
};
const notifyJob = (job) => {
  if (!job || job.provider !== 'osu' || !['completed', 'failed'].includes(job.status)) return;
  if (state.notified[job.id] === job.status) return;
  state.notified[job.id] = job.status;
  showChromeNotice(job.status === 'completed' ? copy.jobDone(job.title || job.sourceUrl) : copy.jobFailed(job.title || job.sourceUrl, job.error));
};
// Jobs persist across ECHO restarts; mark the first snapshot as already
// notified so historical completed/failed jobs do not toast on every injection.
const seedNotified = (jobs) => {
  if (notifySeeded) return;
  notifySeeded = true;
  for (const job of jobs) {
    if (job?.provider === 'osu' && ['completed', 'failed'].includes(job.status)) state.notified[job.id] = job.status;
  }
};

/* ---------- data loading ---------- */
const loadSettings = async () => { const api = downloadsApi(); if (api?.getSettings) state.settings = await api.getSettings(); };
const loadTools = async () => { const api = downloadsApi(); if (api?.checkTools) state.tools = await api.checkTools(); };
const loadJobs = async () => {
  const api = downloadsApi();
  if (!api?.getJobs) return;
  state.jobs = (await api.getJobs()) || [];
  seedNotified(state.jobs);
};
const loadAccountStatus = async () => {
  const api = accountsApi();
  if (!api?.getStatuses) return;
  const statuses = await api.getStatuses();
  const status = (Array.isArray(statuses) ? statuses : []).find((item) => item.provider === 'osu');
  state.account = status ? { connected: status.connected === true, username: status.username, displayName: status.displayName, avatarUrl: status.avatarUrl } : state.account;
};
const loadProfile = async () => {
  const api = downloadsApi();
  if (!api?.getOsuAccountProfile || !state.account.connected || state.profileLoading) return;
  state.profileLoading = true; state.profileError = null; render();
  try { state.profile = await api.getOsuAccountProfile(); }
  catch (error) { state.profile = null; state.profileError = friendlyError(error); }
  finally { state.profileLoading = false; render(); }
};
const collectionRequest = (page) => {
  if (state.kind === 'best') return { kind: 'best', ruleset: state.ruleset, start: page * bestPageSize + 1, end: Math.min((page + 1) * bestPageSize, 100) };
  if (state.kind === 'most_played') return { kind: 'most_played', offset: page * mostPlayedPageSize, limit: mostPlayedPageSize };
  return { kind: 'favourites' };
};
// Fresh loads supersede any in-flight request (kind/ruleset switches mid-load);
// stale responses are discarded by the token check. Appends wait their turn.
const loadCollection = async (append = false) => {
  const api = downloadsApi();
  if (!api?.getOsuAccountCollection || !state.account.connected) return;
  if (append && (state.collectionLoading || state.collectionDone)) return;
  const token = ++collectionToken;
  const page = append ? state.collectionPage + 1 : 0;
  state.collectionLoading = true; state.collectionError = null;
  if (!append) { state.collection = []; state.collectionTotal = null; state.collectionDone = false; }
  render();
  try {
    const response = await api.getOsuAccountCollection(collectionRequest(page));
    if (token !== collectionToken) return;
    const items = Array.isArray(response?.items) ? response.items : [];
    state.collection = append ? [...state.collection, ...items] : items;
    state.collectionTotal = response?.total ?? null;
    state.collectionPage = page;
    if (response?.profile) state.profile = response.profile;
    const pageSize = state.kind === 'best' ? bestPageSize : mostPlayedPageSize;
    state.collectionDone = state.kind === 'favourites'
      || items.length < pageSize
      || (state.kind === 'best' && (page + 1) * bestPageSize >= 100)
      || (state.collectionTotal !== null && state.collection.length >= state.collectionTotal);
  } catch (error) {
    if (token === collectionToken) state.collectionError = friendlyError(error);
  } finally {
    if (token === collectionToken) { state.collectionLoading = false; render(); }
  }
};

/* ---------- actions ---------- */
const runSearch = async () => {
  const api = downloadsApi();
  const query = state.input.trim();
  if (!query || state.searching) return;
  if (!api?.search) { showChromeNotice(copy.noBridge); return; }
  state.searching = true; state.searchError = null; state.query = query; render();
  try {
    const response = await api.search({ query, provider: 'osu', providerLock: 'osu', limitPerProvider: searchLimit });
    state.results = Array.isArray(response?.results) ? response.results : [];
    state.searched = true;
    const providerError = (response?.errors || []).find((item) => item.provider === 'osu');
    if (providerError && !state.results.length) state.searchError = friendlyError(providerError.error);
  } catch (error) {
    state.results = []; state.searched = true; state.searchError = friendlyError(error);
  } finally {
    state.searching = false; render();
  }
};
const ensureOutputDirectory = async () => {
  const api = downloadsApi();
  if (state.settings?.osuOutputDirectory || state.settings?.outputDirectory) return true;
  if (!api?.chooseOutputDirectory) return true;
  const settings = await api.chooseOutputDirectory('osu');
  if (!settings) return false; // user cancelled the folder picker
  state.settings = settings; render();
  return true;
};
const downloadBeatmapset = async (webpageUrl, title) => {
  const api = downloadsApi();
  if (!api?.createUrlJob) { showChromeNotice(copy.noBridge); return; }
  const beatmapsetId = beatmapsetIdFrom(webpageUrl);
  if (!beatmapsetId || state.pendingDownloads[beatmapsetId]) return;
  if (!(await ensureOutputDirectory())) return;
  state.pendingDownloads[beatmapsetId] = true; render();
  try {
    await api.createUrlJob(webpageUrl, { providerLock: 'osu' });
    showChromeNotice(copy.queuedNotice(title || webpageUrl));
  } finally {
    delete state.pendingDownloads[beatmapsetId]; render();
  }
};
const downloadCollectionPage = async () => {
  if (state.bulkDownloading) return;
  const targets = state.collection.filter((item) => {
    const job = jobForBeatmapset(item.beatmapsetId);
    return !job || job.status === 'failed' || job.status === 'cancelled';
  });
  if (!targets.length) return;
  state.bulkDownloading = true; render();
  try {
    for (const item of targets) {
      if (disposed) break;
      await downloadBeatmapset(item.webpageUrl, item.title).catch((error) => showChromeNotice(friendlyError(error)));
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  } finally {
    state.bulkDownloading = false; render();
  }
};
const loginOsu = async () => {
  const api = accountsApi();
  if (!api?.startLogin) { showChromeNotice(copy.noBridge); return; }
  state.loggingIn = true; render();
  try {
    await api.startLogin('osu');
    await loadAccountStatus();
    if (state.account.connected) { void loadProfile(); void loadCollection(false); }
  } finally {
    state.loggingIn = false; render();
  }
};
const logoutOsu = async () => {
  const api = accountsApi();
  if (!api?.clear) return;
  await api.clear('osu');
  state.account = { connected: false, username: null, displayName: null, avatarUrl: null };
  state.profile = null; state.collection = []; state.collectionTotal = null;
  render();
};
const checkOsu = async () => {
  const api = accountsApi();
  if (!api?.check) return;
  await api.check('osu');
  await loadAccountStatus();
  render();
};
const setMirror = async (mirror) => {
  const api = downloadsApi();
  if (!api?.setSettings) return;
  state.settings = await api.setSettings({ osuDownloadMirror: mirror });
  render();
};
const setImportToLibrary = async (enabled) => {
  const api = downloadsApi();
  if (!api?.setSettings) return;
  state.settings = await api.setSettings({ importToLibrary: enabled });
  render();
};
const chooseOutputDirectory = async () => {
  const api = downloadsApi();
  if (!api?.chooseOutputDirectory) return;
  const settings = await api.chooseOutputDirectory('osu');
  if (settings) { state.settings = settings; render(); }
};
const cancelJob = async (jobId) => { const api = downloadsApi(); if (api?.cancelJob) { await api.cancelJob(jobId); await loadJobs(); render(); } };
const clearCompletedJobs = async () => { const api = downloadsApi(); if (api?.clearCompleted) { state.jobs = (await api.clearCompleted('osu')) || []; render(); } };

/* ---------- rendering ---------- */
const renderHero = () => {
  const hero = make('header', 'osu-dl-hero');
  const heroCopy = make('div', 'osu-dl-hero-copy');
  heroCopy.append(make('span', 'osu-dl-kicker', copy.kicker), make('h1', '', manifest.name || copy.title), make('p', '', copy.description));
  const side = make('div', 'osu-dl-hero-side');
  const accountChip = make('span', 'osu-dl-chip');
  if (state.account.connected) {
    accountChip.append(cover(state.account.avatarUrl, ''), make('span', '', state.account.displayName || state.account.username || 'osu!'));
    accountChip.dataset.tone = 'ok';
  } else {
    accountChip.append(makeIcon('user', 14), make('span', '', copy.notLoggedIn));
  }
  side.append(accountChip);
  if (state.tools) {
    const tone = state.tools.ffmpegAvailable ? 'ok' : 'warn';
    const toolsChip = make('span', 'osu-dl-chip', state.tools.ffmpegAvailable ? copy.ffmpegOk : copy.ffmpegMissing);
    toolsChip.dataset.tone = tone;
    toolsChip.prepend(makeIcon(state.tools.ffmpegAvailable ? 'check' : 'close', 13));
    side.append(toolsChip);
  }
  hero.append(heroCopy, side);
  return hero;
};
const renderSettings = () => {
  const bar = make('div', 'osu-dl-settings');
  const mirrorLabel = make('label', '', copy.mirror);
  const mirrorSelect = document.createElement('select');
  mirrors.forEach((mirror) => {
    const option = document.createElement('option');
    option.value = mirror;
    option.textContent = copy.mirrorNames[mirror] || mirror;
    option.selected = (state.settings?.osuDownloadMirror || 'auto') === mirror;
    mirrorSelect.append(option);
  });
  mirrorSelect.addEventListener('change', () => { void setMirror(mirrorSelect.value).catch((error) => showChromeNotice(friendlyError(error))); });
  mirrorLabel.append(mirrorSelect);
  const dirLabel = make('label', '', copy.outputDir);
  dirLabel.append(make('span', 'osu-dl-dir', state.settings?.osuOutputDirectory || state.settings?.outputDirectory || copy.defaultDir));
  dirLabel.append(button(copy.chooseDir, 'folder', chooseOutputDirectory, { variant: 'ghost', size: 13 }));
  const importLabel = make('label', '');
  const importToggle = document.createElement('input');
  importToggle.type = 'checkbox';
  importToggle.checked = state.settings?.importToLibrary !== false;
  importToggle.addEventListener('change', () => { void setImportToLibrary(importToggle.checked).catch((error) => showChromeNotice(friendlyError(error))); });
  importLabel.append(importToggle, make('span', '', copy.importToLibrary));
  bar.append(mirrorLabel, dirLabel, importLabel);
  return bar;
};
const renderTabs = () => {
  const tabs = make('div', 'osu-dl-tabs');
  const activeCount = osuJobs().filter((job) => activeJobStatuses.has(job.status)).length;
  const entries = [
    ['search', copy.tabSearch, null],
    ['account', copy.tabAccount, null],
    ['jobs', copy.tabJobs, osuJobs().length ? String(activeCount || osuJobs().length) : null],
  ];
  for (const [id, label, badge] of entries) {
    const tab = make('button', 'osu-dl-tab', label);
    tab.type = 'button';
    tab.dataset.active = String(state.tab === id);
    if (badge) tab.append(make('span', 'osu-dl-badge', badge));
    tab.addEventListener('click', () => { if (state.tab !== id) { state.tab = id; render(); } });
    tabs.append(tab);
  }
  return tabs;
};
const downloadButtonFor = (webpageUrl, title) => {
  const beatmapsetId = beatmapsetIdFrom(webpageUrl);
  const job = jobForBeatmapset(beatmapsetId);
  const pending = beatmapsetId && state.pendingDownloads[beatmapsetId];
  if (pending || (job && activeJobStatuses.has(job.status))) return button(copy.downloadingBtn, 'download', () => {}, { variant: 'primary', disabled: true });
  if (job && job.status === 'completed') return button(copy.downloadedBtn, 'check', () => downloadBeatmapset(webpageUrl, title), { title: copy.retry });
  return button(copy.download, 'download', () => downloadBeatmapset(webpageUrl, title), { variant: 'primary' });
};
const beatmapCard = ({ coverUrl, title, subtitle, meta, webpageUrl }) => {
  const card = make('article', 'osu-dl-card');
  card.append(cover(coverUrl, 'osu-dl-cover'));
  const body = make('div', 'osu-dl-card-body');
  body.append(make('div', 'osu-dl-card-title', title));
  if (subtitle) body.append(make('div', 'osu-dl-card-sub', subtitle));
  if (meta?.length) {
    const metaRow = make('div', 'osu-dl-card-meta');
    for (const item of meta) { if (item) metaRow.append(make('span', '', item)); }
    body.append(metaRow);
  }
  const actions = make('div', 'osu-dl-card-actions');
  actions.append(downloadButtonFor(webpageUrl, title));
  card.append(body, actions);
  return card;
};
const renderSearchView = () => {
  const view = make('section', '');
  view.style.display = 'grid';
  view.style.gap = '12px';
  const row = make('div', 'osu-dl-search-row');
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = copy.searchPlaceholder;
  input.value = state.input;
  input.addEventListener('input', () => { state.input = input.value; });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') void runSearch(); });
  const submit = button(state.searching ? copy.searching : copy.searchAction, 'search', runSearch, { variant: 'primary', disabled: state.searching });
  row.append(input, submit);
  view.append(row, make('p', 'osu-dl-hint', copy.searchHint));
  if (state.searchError) view.append(make('div', 'osu-dl-state osu-dl-state--error', state.searchError));
  else if (state.searching) view.append(make('div', 'osu-dl-state', copy.searching));
  else if (state.searched && !state.results.length) view.append(make('div', 'osu-dl-state', copy.searchEmpty));
  else if (state.results.length) {
    view.append(make('p', 'osu-dl-hint', copy.resultCount(state.results.length)));
    const list = make('div', 'osu-dl-list');
    for (const result of state.results) {
      list.append(beatmapCard({
        coverUrl: result.thumbnailUrl,
        title: result.title,
        subtitle: result.uploader,
        meta: [formatDuration(result.durationSeconds), result.publishedAt ? String(result.publishedAt).slice(0, 10) : null],
        webpageUrl: result.webpageUrl,
      }));
    }
    view.append(list);
  }
  return view;
};
const renderProfile = () => {
  const profile = state.profile;
  const card = make('div', 'osu-dl-profile');
  card.append(cover(profile?.avatarUrl || state.account.avatarUrl, 'osu-dl-avatar'));
  const name = make('div', 'osu-dl-profile-name');
  name.append(make('strong', '', profile?.username || state.account.displayName || state.account.username || 'osu!'));
  if (profile?.countryCode) name.append(make('span', '', profile.countryCode + (profile.isSupporter ? ' · supporter' : '')));
  card.append(name);
  if (profile) {
    const stats = make('div', 'osu-dl-stats');
    const stat = (label, value) => {
      if (value === null || value === undefined) return null;
      const node = make('div', 'osu-dl-stat');
      node.append(make('b', '', value), make('span', '', label));
      return node;
    };
    [
      stat(copy.statGlobalRank, profile.globalRank ? `#${formatInt(profile.globalRank)}` : null),
      stat(copy.statCountryRank, profile.countryRank ? `#${formatInt(profile.countryRank)}` : null),
      stat(copy.statPp, profile.performancePoints ? formatInt(Math.round(profile.performancePoints)) : null),
      stat(copy.statAccuracy, Number.isFinite(profile.hitAccuracy) ? `${profile.hitAccuracy.toFixed(2)}%` : null),
      stat(copy.statPlayCount, formatInt(profile.playCount)),
      stat(copy.statLevel, Number.isFinite(profile.level) ? String(Math.floor(profile.level)) : null),
    ].forEach((node) => { if (node) stats.append(node); });
    card.append(stats);
  }
  return card;
};
const renderAccountView = () => {
  const view = make('section', '');
  view.style.display = 'grid';
  view.style.gap = '12px';
  if (!state.account.connected) {
    const login = make('div', 'osu-dl-login');
    login.append(makeIcon('circle', 34), make('p', '', copy.loginRequired), make('p', '', copy.loginHint));
    login.append(button(state.loggingIn ? copy.loginBusy : copy.login, 'user', loginOsu, { variant: 'primary', disabled: state.loggingIn }));
    view.append(login);
    return view;
  }
  view.append(renderProfile());
  if (state.profileError) view.append(make('div', 'osu-dl-state osu-dl-state--error', state.profileError));
  const kindRow = make('div', 'osu-dl-kind-row');
  const kinds = [['best', copy.kindBest], ['favourites', copy.kindFavourites], ['most_played', copy.kindMostPlayed]];
  for (const [kind, label] of kinds) {
    const chip = make('button', 'osu-dl-tab', label);
    chip.type = 'button';
    chip.dataset.active = String(state.kind === kind);
    chip.addEventListener('click', () => { if (state.kind !== kind) { state.kind = kind; void loadCollection(false); } });
    kindRow.append(chip);
  }
  if (state.kind === 'best') {
    const rulesetSelect = document.createElement('select');
    rulesets.forEach((ruleset) => {
      const option = document.createElement('option');
      option.value = ruleset;
      option.textContent = rulesetLabels[ruleset];
      option.selected = state.ruleset === ruleset;
      rulesetSelect.append(option);
    });
    rulesetSelect.addEventListener('change', () => { state.ruleset = rulesetSelect.value; void loadCollection(false); });
    const rulesetLabel = make('label', '');
    rulesetLabel.style.cssText = 'display:inline-flex;align-items:center';
    rulesetLabel.append(rulesetSelect);
    rulesetSelect.style.cssText = 'min-height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--theme-field-border,rgba(127,127,127,.25));background:var(--theme-field-bg,rgba(127,127,127,.06));color:inherit;font-size:12.5px';
    kindRow.append(rulesetLabel);
  }
  kindRow.append(make('span', 'osu-dl-spacer'));
  kindRow.append(button(copy.refresh, 'refresh', () => { void loadProfile(); void loadCollection(false); }, { variant: 'ghost' }));
  if (state.collection.length) kindRow.append(button(state.bulkDownloading ? copy.downloadingBtn : copy.downloadAll, 'download', downloadCollectionPage, { disabled: state.bulkDownloading }));
  kindRow.append(button(copy.check, 'refresh', checkOsu, { variant: 'ghost' }), button(copy.logout, 'close', logoutOsu, { variant: 'ghost' }));
  view.append(kindRow);
  if (state.collectionError) view.append(make('div', 'osu-dl-state osu-dl-state--error', state.collectionError));
  else if (state.collectionLoading && !state.collection.length) view.append(make('div', 'osu-dl-state', copy.loading));
  else if (!state.collection.length) view.append(make('div', 'osu-dl-state', copy.collectionEmpty));
  else {
    const list = make('div', 'osu-dl-list');
    for (const item of state.collection) {
      const meta = [copy.position(item.position)];
      if (state.kind === 'best') {
        if (item.pp) meta.push(`${Math.round(item.pp)}pp`);
        if (item.accuracy) meta.push(`${(item.accuracy * 100).toFixed(2)}%`);
        if (item.scoreRank) meta.push(item.scoreRank);
        if (item.starRating) meta.push(`★${item.starRating.toFixed(2)}`);
        if (item.difficultyName) meta.push(item.difficultyName);
        if (item.mods?.length) meta.push(item.mods.join(''));
      } else if (state.kind === 'most_played' && item.playCount) {
        meta.push(copy.playCountLabel(formatInt(item.playCount)));
      }
      if (item.durationSeconds) meta.push(formatDuration(item.durationSeconds));
      list.append(beatmapCard({
        coverUrl: item.coverUrl,
        title: item.title,
        subtitle: [item.artist, item.creator].filter(Boolean).join(' · '),
        meta,
        webpageUrl: item.webpageUrl,
      }));
    }
    view.append(list);
    if (!state.collectionDone) {
      const footer = make('div', 'osu-dl-footer-row');
      footer.append(button(state.collectionLoading ? copy.loading : copy.loadMore, null, () => loadCollection(true), { disabled: state.collectionLoading }));
      view.append(footer);
    }
  }
  return view;
};
const renderJobsView = () => {
  const view = make('section', '');
  view.style.display = 'grid';
  view.style.gap = '12px';
  const jobs = osuJobs();
  const toolbar = make('div', 'osu-dl-kind-row');
  toolbar.append(make('span', 'osu-dl-spacer'));
  if (jobs.some((job) => ['completed', 'failed', 'cancelled'].includes(job.status))) {
    toolbar.append(button(copy.clearCompleted, 'close', clearCompletedJobs, { variant: 'ghost' }));
  }
  view.append(toolbar);
  if (!jobs.length) { view.append(make('div', 'osu-dl-state', copy.jobsEmpty)); return view; }
  const list = make('div', 'osu-dl-list');
  for (const job of [...jobs].reverse()) {
    const card = make('article', 'osu-dl-card');
    card.append(cover(job.thumbnailUrl, 'osu-dl-cover'));
    const body = make('div', 'osu-dl-card-body');
    body.append(make('div', 'osu-dl-card-title', job.title || job.sourceUrl));
    const meta = make('div', 'osu-dl-card-meta');
    if (job.artist) meta.append(make('span', '', job.artist));
    const size = formatBytes(job.totalBytes || job.downloadedBytes);
    if (size) meta.append(make('span', '', size));
    if (job.status === 'downloading' && job.speedBytesPerSecond) meta.append(make('span', '', `${formatBytes(job.speedBytesPerSecond)}/s`));
    body.append(meta);
    if (activeJobStatuses.has(job.status)) {
      const progress = make('div', 'osu-dl-job-progress');
      const fill = make('i', '');
      // Job progress is reported on a 0-100 scale by the downloads bridge.
      fill.style.width = `${Math.round(Math.max(0, Math.min(100, Number(job.progress) || 0)))}%`;
      progress.append(fill);
      body.append(progress);
    }
    if (job.error) body.append(make('div', 'osu-dl-job-error', job.error));
    const actions = make('div', 'osu-dl-card-actions');
    const status = make('span', 'osu-dl-job-status', copy.jobStatus[job.status] || job.status);
    status.dataset.status = job.status;
    actions.append(status);
    if (activeJobStatuses.has(job.status)) actions.append(button(copy.cancel, 'close', () => cancelJob(job.id), { variant: 'danger' }));
    card.append(body, actions);
    list.append(card);
  }
  view.append(list);
  return view;
};
const render = () => {
  if (!pageRoot || disposed) return;
  const previousScroll = pageRoot.firstElementChild ? pageRoot.firstElementChild.scrollTop : scrollTop;
  const page = make('div', 'osu-dl-page');
  if (!downloadsApi()) {
    page.append(renderHero(), make('div', 'osu-dl-state osu-dl-state--error', copy.noBridge));
  } else {
    page.append(renderHero(), renderSettings(), renderTabs());
    page.append(state.tab === 'search' ? renderSearchView() : state.tab === 'account' ? renderAccountView() : renderJobsView());
  }
  page.addEventListener('scroll', () => { scrollTop = page.scrollTop; }, { passive: true });
  pageRoot.replaceChildren(page);
  page.scrollTop = previousScroll;
};

/* ---------- boot ---------- */
const styleElementId = 'echo-osu-downloader-styles';
void (async () => {
  try {
    const css = await external.loadAsset('styles.css');
    if (!css || modDisposed) return;
    // Update in place so a package update replaces stale CSS from the
    // previous injection instead of keeping it around.
    let style = document.getElementById(styleElementId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleElementId;
      document.head.append(style);
    }
    style.textContent = String(css);
  } catch {}
})();

const installListeners = () => {
  const downloads = downloadsApi();
  if (downloads?.onJobsUpdated && !jobsUnsubscribe) {
    jobsUnsubscribe = downloads.onJobsUpdated((jobs) => {
      state.jobs = Array.isArray(jobs) ? jobs : [];
      if (notifySeeded) state.jobs.forEach(notifyJob);
      else seedNotified(state.jobs);
      render();
    });
  }
  const accounts = accountsApi();
  if (accounts?.onStatusesChanged && !statusesUnsubscribe) {
    statusesUnsubscribe = accounts.onStatusesChanged((statuses) => {
      const status = (Array.isArray(statuses) ? statuses : []).find((item) => item.provider === 'osu');
      if (status) {
        const wasConnected = state.account.connected;
        state.account = { connected: status.connected === true, username: status.username, displayName: status.displayName, avatarUrl: status.avatarUrl };
        if (!wasConnected && state.account.connected) { void loadProfile(); void loadCollection(false); }
        render();
      }
    });
  }
};

const disposeSidebar = external.sidebar.register({
  id: 'main',
  label: manifest.name || copy.title,
  icon: '◉',
  order: Number(config.sidebarOrder) || 42,
  render(root) {
    pageRoot = root;
    disposed = false;
    render();
    installListeners();
    void (async () => {
      await Promise.allSettled([loadSettings(), loadTools(), loadJobs(), loadAccountStatus()]);
      if (disposed) return;
      render();
      if (state.account.connected) { void loadProfile(); void loadCollection(false); }
    })();
    return () => {
      disposed = true;
      pageRoot = null;
    };
  },
});

return () => {
  disposed = true;
  modDisposed = true;
  jobsUnsubscribe?.();
  statusesUnsubscribe?.();
  jobsUnsubscribe = null;
  statusesUnsubscribe = null;
  disposeSidebar?.();
  document.getElementById(styleElementId)?.remove();
};
