const origin = 'https://music.163.com';
const qualityLevels = new Set(['standard', 'exhigh', 'lossless', 'hires']);

function id(value) {
  const text = String(value ?? '');
  if (!/^\d{1,20}$/u.test(text)) throw new Error('无效的网易云音乐 ID。');
  return text;
}

function https(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password || !['https:', 'http:'].includes(url.protocol)) return undefined;
    url.protocol = 'https:';
    return url.href;
  } catch { return undefined; }
}

function track(row) {
  const album = row.al ?? row.album ?? {};
  return { providerTrackId: id(row.id), title: row.name,
    artist: (row.ar ?? row.artists ?? []).map(a => a.name).filter(Boolean).join(' / '),
    album: album.name, coverUrl: https(album.picUrl), duration: (row.dt ?? row.duration ?? 0) / 1000 };
}

function playlist(row) {
  return {kind: 'playlist', id: id(row.id), title: row.name, coverUrl: https(row.picUrl ?? row.coverImgUrl),
    itemCount: row.trackCount};
}

export function netease({ session, quality }) {
  async function api(path, params, signal, {post = false, token} = {}) {
    const url = new URL('/api/' + path, origin);
    const query = new URLSearchParams(params);
    if (!post) url.search = query.toString();
    const credential = token ?? await session();
    const headers = { Referer: origin + '/', 'User-Agent': 'Mozilla/5.0' };
    if (credential) headers.Cookie = 'MUSIC_U=' + credential;
    const response = await fetch(url, { method: post ? 'POST' : 'GET', headers, body: post ? query : undefined,
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
    if (!response.ok) throw new Error('网易云音乐 HTTP ' + response.status);
    const json = await response.json();
    if (json.code !== 200) throw new Error('网易云音乐：' + (json.message || json.msg || json.code));
    return json;
  }

  async function userId(signal, token) {
    const {account} = await api('nuser/account/get', {}, signal, {token});
    if (!account?.id || Number(account.status) < 0) throw new Error('网易云音乐账号尚未连接，或登录已过期。');
    return id(account.id);
  }

  async function details(ids, signal) {
    if (!ids.length) return [];
    const result = await api('v3/song/detail', {c: JSON.stringify(ids.map(value => ({id: id(value)})))}, signal);
    const byId = new Map((result.songs ?? []).map(song => [String(song.id), song]));
    return ids.map(value => byId.get(String(value))).filter(Boolean).map(track);
  }

  return {
    userId,
    async lyrics({track, exact, signal}) {
      if (!exact || !/^\d{1,20}$/u.test(track.trackId ?? '')) return [];
      const result = await api('song/lyric', {id: track.trackId, lv: -1, tv: -1, rv: -1}, signal);
      if (!result.lrc?.lyric && !result.nolyric) return [];
      return [{title: track.title, artist: track.artist, syncedLyrics: result.lrc?.lyric,
        translationLyrics: result.tlyric?.lyric, romanizationLyrics: result.romalrc?.lyric,
        instrumental: result.nolyric === true}];
    },
    async search({query, page, pageSize, signal}) {
      if (!query.trim()) return {tracks: [], hasMore: false};
      const offset = (page - 1) * pageSize;
      const {result} = await api('search/get/web', {s: query, type: '1', limit: pageSize, offset}, signal);
      const songs = result?.songs ?? [];
      return {tracks: songs.map(track), hasMore: songs.length > 0 && offset + songs.length < result.songCount};
    },
    async browse({collectionId, page, pageSize, signal}) {
      const offset = (page - 1) * pageSize;
      if (!collectionId) {
        const {result} = await api('personalized/playlist', {limit: 50}, signal);
        const folders = await session() ? [
          {id:'mine', kind:'folder', title:'我的歌单'}, {id:'daily', kind:'playlist', title:'每日推荐'},
        ] : [];
        const items = folders.concat((result ?? []).map(playlist));
        return {tracks: [], collections: items.slice(offset, offset + pageSize), hasMore: offset + pageSize < items.length};
      }
      if (collectionId === 'mine') {
        const uid = await userId(signal);
        const result = await api('user/playlist', {uid, limit: pageSize, offset}, signal);
        return {tracks: [], collections: (result.playlist ?? []).map(playlist), hasMore: Boolean(result.more)};
      }
      if (collectionId === 'daily') {
        if (!await session()) throw new Error('每日推荐需要先连接网易云音乐账号。');
        const result = await api('v3/discovery/recommend/songs', {}, signal, {post:true});
        const songs = result.data?.dailySongs ?? [];
        return {tracks: songs.slice(offset, offset + pageSize).map(track), hasMore: offset + pageSize < songs.length};
      }
      const result = await api('v6/playlist/detail', {id: id(collectionId), n: 0}, signal);
      if (!Array.isArray(result.playlist?.trackIds)) throw new Error('这份歌单当前不可读取。');
      const ids = result.playlist.trackIds;
      return {tracks: await details(ids.slice(offset, offset + pageSize).map(row => row.id), signal),
        hasMore: offset + pageSize < ids.length};
    },
    async resolve({providerTrackId, signal}) {
      const songId = id(providerTrackId);
      const level = qualityLevels.has(quality()) ? quality() : 'standard';
      const [songs, playback] = await Promise.all([details([songId], signal),
        api('song/enhance/player/url/v1', {ids: '[' + songId + ']', level,
          encodeType: ['lossless','hires'].includes(level) ? 'flac' : 'mp3'}, signal)]);
      const row = playback.data?.[0];
      const url = https(row?.url);
      if (!url || row.code !== 200 || row.freeTrialInfo) throw new Error('网易云音乐未为当前账号和地区提供整曲播放。');
      if (!songs.length) throw new Error('找不到这首歌曲。');
      const song = songs[0];
      return {title: song.title, artist: song.artist, album: song.album, duration: song.duration, cover: song.coverUrl, url,
        lyricsProvider: 'netease', followStreamRate: true};
    },
  };
}
