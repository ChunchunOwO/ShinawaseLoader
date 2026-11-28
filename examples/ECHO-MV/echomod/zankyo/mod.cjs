'use strict';
const { createEngine } = require('../main.cjs');
const { AsyncLocalStorage } = require('node:async_hooks');
const group = (kind, children) => ({ kind, children: children.filter(Boolean) });
const text = (text, tone) => ({ kind: 'text', text: String(text), tone });
const button = (text, action, selected = false) => ({ kind: 'button', text, action, selected });
const field = (id, text, value = '', extra = {}) => ({ kind: 'field', id, text, value: String(value), ...extra });
const qualities = ['720p', '1080p', '1440p', '2160p', 'max'].map(value => ({ value, label: value === 'max' ? '最高可用' : value }));

exports.activate = async function activate(ctx) {
  const { zankyo: z, settings, timers } = ctx;
  let saved = settings.get(), track = null, snapshot = null, candidates = [], video = null, phase = 'idle', message = '';
  let closed = false, page, revision = 0, work, hostActive = false;
  const stop = new AbortController(), requests = new AsyncLocalStorage();
  const relay = await z.media.createRelay();
  const engine = createEngine({
    dataDir: ctx.dataRoot,
    config: () => ({ ...ctx.config, bilibiliCookie: saved.bilibiliCookie || ctx.config.bilibiliCookie }),
    readBilibiliCookie: () => '',
    fetchImpl: (url, init = {}) => fetch(url, { ...init, redirect: 'error',
      signal: AbortSignal.any([stop.signal, ...(init.signal ? [init.signal] : []),
        ...(requests.getStore() ? [requests.getStore()] : []), AbortSignal.timeout(12000)]) }),
  });
  const refresh = () => { if (!closed) page?.refresh(); };
  function invalidate() {
    revision++; work?.abort(); video = null; candidates = []; relay.clear();
  }
  function expected(id) {
    if (id && track?.id !== id) throw new Error('曲目已切换，请重新操作。');
    if (!track) throw new Error('请先播放一首歌曲。');
    return revision;
  }
  async function publish(selected, current) {
    if (!selected) { video = null; return; }
    let url;
    if (selected.provider === 'local') {
      const file = engine.getVideoFileForProtocol(selected.id);
      if (!file?.filePath) throw new Error('本地 MV 文件不存在。');
      url = await relay.publishFile(file.filePath);
    } else {
      const stream = await engine.getStreamVariantForProtocol(selected.id, selected.selectedQualityId);
      if (!stream?.url) throw new Error(selected.provider === 'youtube' ? '此 YouTube MV 由原实现提供浏览器播放，请使用外部打开。' : '此 MV 暂无可用的视频流。');
      url = relay.publish(stream.url, stream.headers || {});
    }
    if (current !== revision || closed) return;
    video = { url, trackId: track.id, title: selected.title || track.title, sourceLabel: selected.provider,
      timingKey: `${z.providers.plugin}/network/${selected.provider}:${selected.sourceId || selected.id}`,
      quality: selected.qualityLabel || '本地', startSeconds: Math.max(0, selected.offsetMs / 1000),
      durationSeconds: selected.durationSeconds || 0, canLowerQuality: selected.provider !== 'local' };
    phase = 'ready'; message = 'MV 已就绪'; refresh();
  }
  async function search(query, automatic, abort) {
    const current = expected();
    phase = 'searching'; message = '正在匹配 MV…'; refresh();
    const local = engine.findLocalCandidates({ snapshot });
    const remembered = engine.getSelected({ trackId: track.id });
    if (automatic && remembered) {
      await publish(remembered, current);
      if (video) return;
    }
    if (automatic && local[0]?.score >= 0.7) {
      await publish(await engine.selectVideo({ trackId: track.id, videoId: local[0].id }), current);
      return;
    }
    const network = await requests.run(abort, () => engine.searchNetworkCandidates({
      snapshot, query, autoSelect: automatic,
    }));
    abort.throwIfAborted();
    if (current !== revision) return;
    candidates = [...local, ...network].slice(0, 24);
    if (automatic) await publish(engine.getSelected({ trackId: track.id }), current);
    if (!video) { phase = candidates.length ? 'candidates' : 'empty'; message = candidates.length ? '请选择匹配的 MV' : '未找到匹配 MV'; }
    refresh();
  }
  function startSearch(query, automatic) {
    work?.abort(); work = new AbortController();
    const abort = AbortSignal.any([stop.signal, work.signal, AbortSignal.timeout(18000)]);
    const current = revision;
    void search(query, automatic, abort).catch(error => {
      if (!closed && current === revision && !work?.signal.aborted) {
        phase = 'error'; message = String(error.message).slice(0, 1024); refresh();
      }
    });
  }
  async function observe({ track: next, enabled = true, active = true }) {
    const wasActive = hostActive;
    hostActive = enabled && active;
    if (next?.id === track?.id) {
      const prefs = engine.getSettings();
      if (hostActive && !wasActive && track && prefs.enabled !== false && prefs.autoSearch !== false) startSearch(undefined, true);
      return;
    }
    invalidate(); track = next; phase = 'idle'; message = '';
    if (!track) { snapshot = null; refresh(); return; }
    const current = revision;
    const media = await z.core('media.current');
    if (current !== revision) return;
    snapshot = { trackId: track.id, title: track.title, artist: track.artist, durationSeconds: track.durationSeconds,
      ...(media?.mvTrack?.id === track.id && media.path ? { path: media.path } : {}) };
    const prefs = engine.getSettings();
    if (enabled && active && prefs.enabled !== false && prefs.autoSearch !== false) startSearch(undefined, true);
    refresh();
  }
  const handlers = {
    observe,
    status: async () => ({
      loggedIn: Boolean(saved.bilibiliCookie || ctx.config.bilibiliCookie), username: saved.bilibiliCookie ? '个人会话' : '',
      video, automatic: { trackId: track?.id || null, phase, message,
        candidates: candidates.map(row => ({ id: row.id, title: row.title || '', artist: row.artist || '',
          durationSeconds: row.durationSeconds || 0, score: row.score || 0, reasons: row.reasons || row.rawProviderJson?.reasons || [] })) },
      capabilities: Object.keys(handlers).filter(key => key !== 'status'), qualities,
    }),
    async search({ trackId, query }) { expected(trackId); startSearch(query, false); },
    async select({ trackId, candidateId, signal }) {
      const current = expected(trackId); work?.abort();
      const selected = await requests.run(signal, () => engine.selectVideo({ trackId: track.id, videoId: candidateId }));
      signal.throwIfAborted();
      if (current !== revision) throw new Error('曲目已切换');
      await publish(selected, current);
    },
    async retry() { expected(); startSearch(undefined, true); },
    async clear() {
      expected(); work?.abort(); engine.clearSelected({ trackId: track.id });
      video = null; relay.clear(); phase = 'idle'; message = '已清除本曲 MV'; refresh();
    },
    async deactivate() { hostActive = false; invalidate(); phase = 'idle'; refresh(); },
    async quality({ quality }) {
      if (!qualities.some(item => item.value === quality)) throw new Error('无效画质');
      engine.setSettings({ patch: { maxQuality: quality } }); engine.flush();
      if (!track) { refresh(); return; }
      const current = expected(), selected = engine.getSelected({ trackId: track.id });
      if (selected) {
        await engine.resolveStreams({ videoId: selected.id, forceRefresh: true });
        await publish(engine.getSelected({ trackId: track.id }), current);
      }
      refresh();
    },
    async lowerQuality({ url }) {
      if (url !== video?.url) return;
      const index = qualities.findIndex(item => item.value === engine.getSettings().maxQuality);
      if (index > 0) await handlers.quality({ quality: qualities[index - 1].value });
    },
    async playbackFailed({ url }) {
      if (url !== video?.url) return;
      video = null; phase = 'error'; message = 'MV 播放失败，可降低画质或重试。'; refresh();
    },
    async skip({ trackId, candidateId }) {
      expected(trackId); candidates = candidates.filter(candidate => candidate.id !== candidateId); refresh();
    },
    async load({ trackId, video: id, startSeconds = 0, signal }) {
      await handlers.select({ trackId, candidateId: id, signal });
      if (video) video.startSeconds = Math.max(0, Math.min(600, startSeconds));
    },
    async searchUrl({ query }) { return 'https://search.bilibili.com/video?keyword=' + encodeURIComponent(query); },
  };
  await z.providers.register('mv', 'network', { title: 'ECHO MV · 网络与本地' }, handlers);
  async function currentTrack() {
    const media = await z.core('media.current');
    if (media?.mvTrack?.id !== track?.id) await observe({ track: media?.mvTrack || null, enabled: false, active: false });
  }
  async function enable() {
    await z.settings.set({ lyricsWorkshopMvSource: { plugin: z.providers.plugin, provider: 'network' }, lyricsWorkshopMvResume: true });
  }
  function render() {
    const prefs = engine.getSettings(), selected = track && engine.getSelected({ trackId: track.id });
    return group('column', [
      group('mast', [{ kind: 'kicker', text: 'SHINAWASE · MUSIC VIDEO' }, { kind: 'title', text: 'MV' },
        text('沿用原 Mod 的匹配、候选、记忆选择和画质规则，在原生歌词页播放。', 'muted')]),
      group('row', [button('启用此 MV 来源', 'enable'), button('打开原生 MV 面板', 'open-mv'), button('刷新当前曲目', 'refresh')]),
      { kind: 'heading', text: track ? `${track.title} · ${track.artist}` : '当前没有播放曲目' },
      text(message || '播放一首歌曲后自动匹配 MV。', phase === 'error' ? 'error' : 'muted'),
      group('row', [button(prefs.autoSearch ? '自动匹配：开' : '自动匹配：关', 'automatic', prefs.autoSearch),
        button('重新匹配', 'retry'), button('清除本曲 MV', 'clear'), button('选择本地 MV', 'local')]),
      field('mv-query', '搜索关键词', '', { submit: 'search' }), button('搜索候选', 'search'),
      field('mv-url', '手动指定哔哩哔哩 / YouTube 视频链接'), button('绑定链接', 'bind'),
      group('row', qualities.map(item => button(item.label, 'quality/' + item.value, prefs.maxQuality === item.value))),
      selected && group('column', [
        text(`已选：${selected.title} · ${selected.qualityLabel || selected.provider}`, 'success'),
        group('row', [button('在浏览器打开', 'external'), button('检测音频起点', 'detect-start')]),
        field('mv-offset', 'MV 起点偏移（毫秒）', selected.offsetMs || 0), button('保存偏移', 'offset'),
      ]),
      { kind: 'heading', text: `候选 · ${candidates.length}` },
      ...candidates.map((row, index) => group('setting', [
        group('column', [text(`${row.title} · ${row.artist || ''}`),
          text(`${row.provider} · ${Math.round((row.score || 0) * 100)}% · ${(row.reasons || row.rawProviderJson?.reasons || []).join(' / ')}`, 'muted')]),
        group('row', [button('选择', 'select/' + index), button('外部打开', 'external/' + index)]),
      ])),
      { kind: 'heading', text: '账号与搜索' },
      field('mv-cookie', saved.bilibiliCookie ? '更新哔哩哔哩 Cookie（已配置）' : '哔哩哔哩 Cookie（可选）', '', { secret: true }),
      group('row', [button('保存账号', 'account'), button('移除账号', 'logout'),
        button(prefs.titleOnlySearch ? '仅标题搜索：开' : '仅标题搜索：关', 'title-only', prefs.titleOnlySearch),
        button(prefs.allow60fps ? '60fps：开' : '60fps：关', 'fps', prefs.allow60fps)]),
    ]);
  }
  page = z.ui.createPage({ id: 'mv', label: 'MV', render, async action(name, fields) {
    const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(18000)]);
    if (name === 'refresh') await currentTrack();
    else if (name === 'enable') { await enable(); message = '已选为原生 MV 来源'; }
    else if (name === 'open-mv') { await enable(); await z.call('ui.openMv'); }
    else if (name === 'automatic' || name === 'title-only' || name === 'fps') {
      const key = { automatic: 'autoSearch', 'title-only': 'titleOnlySearch', fps: 'allow60fps' }[name];
      engine.setSettings({ patch: { [key]: !engine.getSettings()[key] } }); engine.flush();
    } else if (name === 'retry') await handlers.retry();
    else if (name === 'clear') await handlers.clear();
    else if (name === 'search') await handlers.search({ query: fields['mv-query']?.trim(), trackId: track?.id });
    else if (name.startsWith('quality/')) await handlers.quality({ quality: name.slice(8) });
    else if (name.startsWith('select/')) {
      const row = candidates[Number(name.slice(7))]; if (!row) throw new Error('候选已更新');
      await handlers.select({ trackId: track?.id, candidateId: row.id, signal }); await enable();
    } else if (name === 'local') {
      const current = expected(), id = track.id;
      const files = await z.ui.choosePath();
      if (current !== revision || track.id !== id) throw new Error('曲目已切换');
      if (files?.[0]) await publish(engine.bindLocalVideo({ trackId: id, filePath: files[0] }), current);
    } else if (name === 'bind') {
      const current = expected();
      const selected = engine.bindUrl({ trackId: track.id, url: fields['mv-url']?.trim() });
      await publish(selected, current);
    } else if (name === 'offset') {
      const current = expected(), offsetMs = Number(fields['mv-offset']);
      if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) > 600000) throw new Error('偏移范围为 ±600000 毫秒');
      await publish(engine.setOffset({ trackId: track.id, offsetMs }), current);
    } else if (name === 'detect-start') {
      const current = expected(), id = track.id, selected = engine.getSelected({ trackId: id });
      if (!selected) throw new Error('请先选择 MV');
      const result = await engine.detectAudioStart({ videoId: selected.id });
      if (current !== revision) throw new Error('曲目已切换');
      await publish(engine.applyAudioStart({ trackId: id, videoId: selected.id,
        startMs: result.startMs, expectedOffsetMs: selected.offsetMs }), current);
    } else if (name === 'external' || name.startsWith('external/')) {
      const selected = name === 'external' ? engine.getSelected({ trackId: track?.id }) : candidates[Number(name.slice(9))];
      if (selected?.providerUrl) await z.ui.openUrl(selected.providerUrl);
      else throw new Error('本地视频请使用原生 MV 面板播放。');
    } else if (name === 'account') {
      const cookie = fields['mv-cookie']?.trim();
      if (!cookie || /[\r\n]/u.test(cookie) || cookie.length > 16384) throw new Error('Cookie 格式不正确');
      saved = settings.set({ bilibiliCookie: cookie }); message = '账号已保存';
    } else if (name === 'logout') { saved = settings.set({ bilibiliCookie: '' }); message = '账号已移除'; }
  } });
  await currentTrack();
  let polling = false;
  const timer = timers.setInterval(() => {
    if (polling || closed) return; polling = true;
    currentTrack().catch(error => { message = error.message; refresh(); }).finally(() => { polling = false; });
  }, 1500);
  return () => {
    closed = true; stop.abort(); work?.abort(); timers.clearInterval(timer); page.close();
    relay.close(); engine.flush(); engine.dispose();
  };
};
