'use strict';
const backend = require('./providers.cjs');
const names = { netease: '网易云音乐', qqmusic: 'QQ 音乐', bilibili: '哔哩哔哩',
  soundcloud: 'SoundCloud', youtube: 'YouTube', spotify: 'Spotify', tidal: 'TIDAL', qobuz: 'Qobuz' };
const home = { netease: 'https://music.163.com', qqmusic: 'https://y.qq.com', bilibili: 'https://www.bilibili.com',
  soundcloud: 'https://soundcloud.com', youtube: 'https://www.youtube.com', spotify: 'https://accounts.spotify.com',
  tidal: 'https://login.tidal.com', qobuz: 'https://www.qobuz.com' };
const group = (kind, children) => ({ kind, children: children.filter(Boolean) });
const text = (text, tone) => ({ kind: 'text', text: String(text), tone });
const button = (text, action, selected = false) => ({ kind: 'button', text, action, selected });
const field = (id, text, value = '', extra = {}) => ({ kind: 'field', id, text, value, ...extra });
const cover = value => value?.startsWith('echo-image://remote/') ? decodeURIComponent(value.slice(20).split('?')[0]) : value;
const sourceTrack = track => ({ providerTrackId: String(track.providerTrackId), title: track.title,
  artist: track.artist || '', album: track.album || '', duration: Math.max(0, Number(track.duration) || 0),
  ...(track.coverUrl ? { coverUrl: cover(track.coverUrl) } : {}) });
const collection = (item, kind) => ({ id: `${kind}:${item.providerAlbumId || item.providerPlaylistId || item.providerArtistId}`,
  kind: kind === 'artist' ? 'folder' : kind, title: item.title || item.name, coverUrl: item.coverUrl || undefined,
  ...(Number.isInteger(item.trackCount) ? { itemCount: item.trackCount } : {}) });

exports.activate = async function activate(ctx) {
  const { zankyo: z, settings, timers } = ctx;
  let saved = settings.get();
  let provider = names[saved.provider] ? saved.provider : (names[ctx.config.defaultProvider] ? ctx.config.defaultProvider : 'netease');
  const defaultQuality = ['standard', 'high', 'lossless', 'hires'].includes(ctx.config.defaultQuality) ? ctx.config.defaultQuality : 'high';
  const currentQuality = () => saved.quality || defaultQuality;
  let query = '', type = 'track', pageNumber = 1, view = 'browse', busy = false, closed = false;
  let tracks = [], collections = [], title = '搜索音乐，或打开我的歌单', hasMore = false, location = null;
  let message = '', qr = null, qrKey = '', qrTimer, task;
  const stop = new AbortController();
  const ncm = ctx.importDependency('@neteasecloudmusicapienhanced/api');
  const api = backend.create(() => saved, ncm);
  const relay = await z.media.createRelay();
  const signal = () => AbortSignal.any([stop.signal, AbortSignal.timeout(16000)]);
  const invoke = (id, method, input, abort = signal()) => api.invoke(id, method, input, abort);
  const save = patch => { saved = settings.set(patch); };
  const account = () => saved.accounts?.[provider] || {};
  async function browse(id, input) {
    const { collectionId, page = 1, pageSize = 24, signal: abort } = input;
    if (collectionId) {
      const [kind, ...parts] = collectionId.split(':');
      const key = parts.join(':');
      let result;
      if (kind === 'album') result = await invoke(id, 'getAlbum', { providerAlbumId: key }, abort);
      else if (kind === 'artist') result = await invoke(id, 'getArtist', { providerArtistId: key }, abort);
      else if (kind === 'playlist') result = await invoke(id, 'getPlaylist', { providerPlaylistId: key, page, pageSize }, abort);
      else if (kind === 'liked') result = await invoke(id, 'getLikedSongsPlaylist', { page, pageSize }, abort);
      else if (kind === 'daily') result = await invoke(id, 'getDailyRecommendPlaylist', {}, abort);
      else throw new Error('未知的流媒体集合。');
      const all = result.tracks || result.topTracks || [];
      // Playlist methods already paginate; album/artist responses are sliced here.
      const paged = ['playlist', 'liked'].includes(kind);
      return { tracks: (paged ? all : all.slice((page - 1) * pageSize, page * pageSize)).map(sourceTrack),
        collections: [], hasMore: paged ? Boolean(result.hasMore) : page * pageSize < all.length };
    }
    const instance = api.providers.get(id), items = [];
    if (instance.getLikedSongsPlaylist) items.push({ id: 'liked:', kind: 'playlist', title: '我喜欢的音乐' });
    if (instance.getDailyRecommendPlaylist) items.push({ id: 'daily:', kind: 'playlist', title: '每日推荐' });
    if (instance.listAccountPlaylists) {
      const playlists = await invoke(id, 'listAccountPlaylists', {}, abort);
      items.push(...playlists.map(item => collection(item, 'playlist')));
    }
    return { tracks: [], collections: items.slice((page - 1) * pageSize, page * pageSize), hasMore: page * pageSize < items.length };
  }
  for (const id of Object.keys(names)) {
    await z.providers.register('sources', id, { title: `Streaming · ${names[id]}` }, {
      async search({ query, page = 1, pageSize = 24, signal }) {
        const result = await invoke(id, 'search', { provider: id, query, page, pageSize, mediaTypes: ['track'] }, signal);
        return { tracks: result.tracks.slice(0, pageSize).map(sourceTrack), hasMore: Boolean(result.hasMore) };
      },
      browse: input => browse(id, input),
      async resolve({ providerTrackId, signal }) {
        if (['spotify', 'tidal'].includes(id)) throw new Error(`${names[id]} 的当前接口仅支持目录浏览，播放需使用官方播放器。`);
        const [track, playback] = await Promise.all([
          invoke(id, 'getTrack', { providerTrackId }, signal),
          invoke(id, 'resolvePlayback', { provider: id, providerTrackId, quality: currentQuality() }, signal),
        ]);
        if (track.playable === false) throw new Error(track.unavailableReason || '当前账号无整曲播放权限。');
        if (!playback.url || playback.freeTrialInfo) throw new Error('平台未提供整曲播放地址。');
        return { ...sourceTrack(track), url: relay.publish(playback.url, playback.headers || {}),
          lyricsProvider: id, followStreamRate: true };
      },
    });
    if (typeof api.providers.get(id).getLyrics === 'function') {
      await z.providers.register('lyrics', id, { title: `Streaming · ${names[id]}（精确曲目）` }, {
        async lookup({ track, exact, signal }) {
          if (!exact || !track.trackId) return [];
          const result = await invoke(id, 'getLyrics', { providerTrackId: track.trackId }, signal);
          if (result.status === 'missing') return [];
          return [{ ...result, provider: id, title: track.title, artist: track.artist || '', album: track.album || '',
            durationSeconds: track.durationSeconds || null }];
        },
      });
    }
  }
  async function load() {
    task?.abort(); task = new AbortController();
    const current = task;
    busy = true; page.refresh();
    const abort = AbortSignal.any([signal(), current.signal]);
    try {
      if (location) {
        const result = await browse(provider, { collectionId: location.id, page: pageNumber, signal: abort });
        tracks = result.tracks; collections = result.collections; hasMore = result.hasMore; title = location.title;
      } else {
        const result = await invoke(provider, 'search', { provider, query, page: pageNumber, pageSize: 24, mediaTypes: [type] }, abort);
        tracks = result.tracks || [];
        collections = [
          ...(result.albums || []).map(item => collection(item, 'album')),
          ...(result.artists || []).map(item => collection(item, 'artist')),
          ...(result.playlists || []).map(item => collection(item, 'playlist')),
        ].slice(0, 24);
        title = `${names[provider]} · ${query}`; hasMore = result.hasMore;
      }
      abort.throwIfAborted();
    } finally { if (task === current) { busy = false; page.refresh(); } }
  }
  async function queue(items, mode) {
    if (!items.length) return;
    await z.core('queue.submit', { mode, tracks: items.slice(0, 1000).map(track => ({
      kind: 'source', source: { plugin: z.providers.plugin, provider }, track: sourceTrack(track),
    })) });
    message = mode === 'play' ? '已开始播放' : '已加入队列';
  }
  async function loginCheck() {
    if (!qrKey || closed) return;
    const result = (await ncm.login_qr_check({ key: qrKey, timestamp: Date.now() })).body;
    if (closed) return;
    if (result.code === 803 && result.cookie) {
      save({ accounts: { ...saved.accounts, netease: { cookie: result.cookie } } });
      qr = null; qrKey = ''; timers.clearInterval(qrTimer); message = '网易云音乐已登录'; page.refresh();
    } else if (result.code === 800) {
      qrKey = ''; timers.clearInterval(qrTimer); message = '二维码已过期，请重新生成。'; page.refresh();
    }
  }
  function render() {
    const instance = api.providers.get(provider);
    const accountPage = group('column', [
      text('账号凭据仅保存到本 Mod 的本地设置；留空表示保留。', 'muted'),
      text(account().cookie || account().accessToken || account().browser ? '已配置账号' : '尚未配置账号', 'muted'),
      button('在浏览器打开登录页', 'login-web'),
      ...(['netease', 'qqmusic', 'bilibili', 'youtube', 'soundcloud'].includes(provider)
        ? [field('stream-cookie', 'Cookie', '', { secret: true })]
        : [field('stream-token', 'Access Token', '', { secret: true })]),
      ...(['youtube', 'soundcloud'].includes(provider) ? [
        field('stream-browser', 'yt-dlp 浏览器登录来源（chrome / edge / firefox，留空使用 Cookie）', account().browser || ''),
        text('需要系统可用的 yt-dlp。浏览器来源由用户自行选择。', 'muted'),
      ] : []),
      ...(provider === 'qobuz' ? [field('stream-app', 'Qobuz App ID', saved.qobuzAppId || ''),
        field('stream-secret', 'Qobuz App Secret', '', { secret: true })] : []),
      group('row', [button('保存账号', 'save-account'), button('移除账号', 'logout'),
        provider === 'netease' && button('网易云扫码登录', 'login-qr')]),
      qr && { kind: 'image', image: qr },
      provider === 'netease' && qrKey && button('检查扫码结果', 'login-check'),
      ...(provider === 'netease' ? [field('stream-phone', '手机号'), field('stream-country', '国家码', '86'),
        field('stream-captcha', '短信验证码', '', { secret: true }),
        group('row', [button('发送验证码', 'phone-code'), button('手机号登录', 'phone-login')])] : []),
      provider === 'tidal' && field('stream-scope', 'Access Token Scopes', account().scope || ''),
    ]);
    return group('column', [
      group('mast', [{ kind: 'kicker', text: 'SHINAWASE · STREAMING' }, { kind: 'title', text: '流媒体' },
        text('搜索音乐、浏览专辑与歌单，通过 ECHO 原生队列播放。', 'muted')]),
      group('row', Object.entries(names).map(([id, label]) => button(label, `provider/${id}`, provider === id))),
      group('row', [button('发现 / 搜索', 'tab/browse', view === 'browse'), button('账号', 'tab/account', view === 'account'),
        ...['standard', 'high', 'lossless', 'hires'].map((quality, i) => button(['标准', '高音质', '无损', 'Hi-Res'][i],
          `quality/${quality}`, currentQuality() === quality))]),
      message && text(message, 'success'),
      ['spotify', 'tidal'].includes(provider) && text('此平台当前提供目录浏览；原生音频播放需要平台提供兼容的播放接口。', 'muted'),
      view === 'account' ? accountPage : group('column', [
        group('row', ['track', 'album', 'artist', 'playlist'].filter(value => !instance.descriptor?.supportedSearchMediaTypes ||
          instance.descriptor.supportedSearchMediaTypes.includes(value)).map(value =>
          button({ track: '单曲', album: '专辑', artist: '艺人', playlist: '歌单' }[value], `type/${value}`, type === value))),
        field('stream-query', '搜索', query, { submit: 'search' }),
        group('row', [button(busy ? '搜索中…' : '搜索', 'search'),
          instance.listAccountPlaylists && button('我的歌单', 'mine'),
          instance.getLikedSongsPlaylist && button('我喜欢的音乐', 'liked'),
          instance.getDailyRecommendPlaylist && button('每日推荐', 'daily')]),
        { kind: 'heading', text: title },
        tracks.length > 0 && group('row', [button('播放本页', 'play-page'), button('本页加入队列', 'append-page')]),
        ...collections.map((item, index) => group('row', [text(`${item.kind === 'album' ? '专辑' : item.kind === 'folder' ? '艺人' : '歌单'} · ${item.title}`),
          button('打开', `open/${index}`)])),
        ...tracks.map((track, index) => group('setting', [
          text(`${String((pageNumber - 1) * 24 + index + 1).padStart(2, '0')}  ${track.title}  ·  ${track.artist || ''}  ·  ${track.album || ''}`),
          group('row', [...(['spotify', 'tidal'].includes(provider) ? [button('官方播放器', 'login-web')] :
            [button('播放', `play/${index}`), button('下一首', `next/${index}`), button('加入队列', `append/${index}`)]),
            instance.setTrackLiked && button('喜欢', `like/${index}`)]),
        ])),
        !tracks.length && !collections.length && text(busy ? '正在请求平台…' : '暂无结果。搜索音乐或打开歌单。', 'muted'),
        group('row', [pageNumber > 1 && button('上一页', 'previous'), text(`第 ${pageNumber} 页`, 'muted'), hasMore && button('下一页', 'more')]),
      ]),
    ]);
  }
  const page = z.ui.createPage({ id: 'streaming', label: '流媒体', render, async action(name, fields) {
    if (name.startsWith('provider/')) {
      provider = name.slice(9); if (!names[provider]) throw new Error('未知平台');
      task?.abort(); timers.clearInterval(qrTimer); qr = null; qrKey = ''; busy = false; save({ provider }); location = null; tracks = []; collections = []; pageNumber = 1; message = '';
      return;
    }
    if (name.startsWith('tab/')) { view = name.slice(4); return; }
    if (name.startsWith('quality/')) { save({ quality: name.slice(8) }); return; }
    if (name.startsWith('type/')) { type = name.slice(5); location = null; return; }
    if (name === 'search') { query = (fields['stream-query'] || '').trim(); location = null; pageNumber = 1; if (query) await load(); }
    else if (name === 'previous' || name === 'more') { pageNumber += name === 'more' ? 1 : -1; await load(); }
    else if (['liked', 'daily'].includes(name)) { location = { id: name + ':', title: name === 'liked' ? '我喜欢的音乐' : '每日推荐' }; pageNumber = 1; await load(); }
    else if (name === 'mine') {
      busy = true; page.refresh();
      try {
        const result = await browse(provider, { signal: signal(), page: 1 });
        tracks = []; collections = result.collections; hasMore = result.hasMore; title = '我的歌单';
        location = { id: null, title }; pageNumber = 1;
      } finally { busy = false; }
    } else if (name.startsWith('open/')) {
      location = collections[Number(name.slice(5))]; if (!location) throw new Error('列表已更新');
      pageNumber = 1; await load();
    } else if (['play-page', 'append-page'].includes(name)) await queue(tracks, name === 'play-page' ? 'play' : 'append');
    else if (/^(play|next|append|like)\//u.test(name)) {
      const [operation, index] = name.split('/'), track = tracks[Number(index)];
      if (!track) throw new Error('列表已更新');
      if (operation === 'like') { await invoke(provider, 'setTrackLiked', { providerTrackId: track.providerTrackId, liked: true }); message = '已加入平台喜欢列表'; }
      else await queue([track], { play: 'play', next: 'playNext', append: 'append' }[operation]);
    } else if (name === 'login-web') await z.ui.openUrl(home[provider]);
    else if (name === 'save-account') {
      const next = { ...account() };
      for (const [id, key] of [['stream-cookie', 'cookie'], ['stream-token', 'accessToken']]) {
        if (fields[id]?.trim()) {
          if (/[\r\n]/u.test(fields[id]) || fields[id].length > 16384) throw new Error('账号凭据格式不正确');
          next[key] = fields[id].trim();
        }
      }
      if (['youtube', 'soundcloud'].includes(provider)) {
        const browser = fields['stream-browser']?.trim() || '';
        if (browser && !['chrome', 'edge', 'firefox', 'brave', 'chromium', 'opera', 'safari'].includes(browser)) throw new Error('不支持的浏览器');
        next.browser = browser || undefined;
      }
      const patch = { accounts: { ...saved.accounts, [provider]: next } };
      if (provider === 'tidal' && fields['stream-scope']?.trim()) next.scope = fields['stream-scope'].trim();
      if (provider === 'qobuz') {
        patch.qobuzAppId = fields['stream-app']?.trim() || saved.qobuzAppId;
        if (fields['stream-secret']?.trim()) patch.qobuzAppSecret = fields['stream-secret'].trim();
      }
      save(patch); message = '账号设置已保存';
    } else if (name === 'logout') {
      timers.clearInterval(qrTimer); qr = null; qrKey = '';
      const accounts = { ...saved.accounts }; delete accounts[provider]; save({ accounts }); message = '账号已移除';
    } else if (name === 'login-qr') {
      const key = (await ncm.login_qr_key({ timestamp: Date.now() })).body?.data?.unikey;
      if (!key) throw new Error('无法生成登录二维码');
      const data = (await ncm.login_qr_create({ key, qrimg: true })).body?.data?.qrimg;
      const match = /^data:image\/png;base64,(.+)$/u.exec(data || '');
      if (!match) throw new Error('登录二维码格式无效');
      qr = { format: 'png', bytes: [...Buffer.from(match[1], 'base64')] }; qrKey = key;
      timers.clearInterval(qrTimer);
      let checking = false;
      qrTimer = timers.setInterval(() => {
        if (checking) return; checking = true;
        loginCheck().catch(() => {}).finally(() => { checking = false; });
      }, 2500);
    } else if (name === 'login-check') await loginCheck();
    else if (name === 'phone-code' || name === 'phone-login') {
      const phone = fields['stream-phone']?.trim(), countrycode = fields['stream-country']?.trim() || '86';
      if (!/^\d{5,20}$/u.test(phone || '') || !/^\d{1,4}$/u.test(countrycode)) throw new Error('手机号或国家码不正确');
      if (name === 'phone-code') {
        const result = (await ncm.captcha_sent({ phone, ctcode: countrycode })).body;
        if (result?.code !== 200) throw new Error('验证码发送失败，请稍后再试');
        message = '验证码已发送';
      } else {
        const captcha = fields['stream-captcha']?.trim();
        if (!/^\d{4,8}$/u.test(captcha || '')) throw new Error('请填写短信验证码');
        const result = (await ncm.login_cellphone({ phone, countrycode, captcha })).body;
        if (!result?.cookie || result.code !== 200) throw new Error('登录失败，请检查验证码');
        if (!closed) save({ accounts: { ...saved.accounts, netease: { cookie: result.cookie } } });
        message = '网易云音乐已登录';
      }
    }
  } });
  return () => { closed = true; stop.abort(); task?.abort(); timers.clearInterval(qrTimer); page.close(); relay.close(); };
};
