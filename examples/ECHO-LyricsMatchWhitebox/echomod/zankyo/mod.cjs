'use strict';
const { createHash } = require('node:crypto');
const { create } = require('./providers.cjs');
const { createLyricsNormalizer } = require('./normalizer.cjs');
const names = { 'amll-ttml': 'AMLL TTML', netease: '网易云音乐', qqmusic: 'QQ 音乐', lrclib: 'LRCLIB' };
const group = (kind, children) => ({ kind, children: children.filter(Boolean) });
const text = (text, tone) => ({ kind: 'text', text: String(text), tone });
const button = (text, action, selected = false) => ({ kind: 'button', text, action, selected });
const field = (id, text, value = '', extra = {}) => ({ kind: 'field', id, text, value: String(value), ...extra });
const hash = input => createHash('sha256').update(input).digest('hex').slice(0, 32);
const identity = track => hash([track.title, track.artist, Math.round(track.durationSeconds || 0)].join('\0'));
const sourceId = candidate => `${candidate.provider}:${candidate.providerLyricsId || hash(candidate.syncedLyrics || candidate.karaokeLyrics || candidate.plainLyrics || '')}`;
const lyrics = candidate => Object.fromEntries(['instrumental', 'plainLyrics', 'syncedLyrics', 'karaokeLyrics', 'translationLyrics', 'romanizationLyrics']
  .filter(key => candidate[key] != null).map(key => [key, candidate[key]]));

exports.activate = async function activate(ctx) {
  const { zankyo: z, settings, timers } = ctx;
  let saved = settings.get(), media = null, query = '', source = 'all', candidates = [], selected = -1;
  let message = '', busy = false, page, closed = false, revision = 0, task, resultSequence;
  let automatic = false, pendingAutomatic = ctx.config.forceEnable === true;
  const stop = new AbortController(), api = create(() => saved);
  const options = () => ({ ...ctx.config, ...saved });
  function normalizer() {
    const config = options();
    return createLyricsNormalizer({ enabled: config.normalizeEnabled, traditionalToSimplified: config.normalizeTraditional,
      kanaMode: config.normalizeKana, stripNoiseWords: config.normalizeNoise, keepVersionTags: config.normalizeKeepVersion,
      includeArtist: config.normalizeIncludeArtist });
  }
  function queryTrack(current = media) {
    if (!current) throw new Error('请先播放一首歌曲。');
    return { trackId: current.catalog?.id || null, title: current.title, artist: current.artist || '',
      album: current.metadata?.album || null, durationSeconds: current.durationSeconds || null };
  }
  function cleanCandidate(candidate) {
    return { provider: candidate.provider, providerLyricsId: candidate.providerLyricsId || null,
      sourceId: sourceId(candidate), title: candidate.title || '', artist: candidate.artist || '', album: candidate.album || '',
      durationSeconds: candidate.durationSeconds || null, ...lyrics(candidate) };
  }
  async function lookup(track, signal, ids, useMemory) {
    const clean = normalizer(), normalized = { ...track, title: clean.normalize(track.title),
      artist: options().normalizeIncludeArtist ? clean.normalize(track.artist || '') : '' };
    const memory = saved.choices?.[identity(track)];
    if (useMemory && memory && ids.includes(memory.provider) && memory.id) {
      const exact = await api.byId(memory.provider, memory.id, track, signal).catch(() => null);
      if (exact) return [cleanCandidate(exact)];
    }
    const searches = await Promise.allSettled(ids.map(id => api.search(id, normalized, signal)));
    signal.throwIfAborted();
    if (searches.every(result => result.status === 'rejected')) throw new Error('歌词来源暂时不可用，请稍后重试或切换来源。');
    const unique = new Map();
    for (const result of searches) {
      if (result.status !== 'fulfilled') continue;
      for (const candidate of result.value) {
        const value = cleanCandidate(candidate);
        const key = hash(JSON.stringify(lyrics(value)));
        if (Buffer.byteLength(JSON.stringify(value)) <= 1024 * 1024 && !unique.has(key)) unique.set(key, value);
      }
    }
    const results = [...unique.values()].slice(0, 32);
    if (useMemory && memory) {
      const chosen = results.find(candidate => candidate.sourceId === memory.sourceId);
      if (chosen) return [chosen];
    }
    return results;
  }
  const enabledSources = () => (saved.sources || Object.keys(names)).filter(id => names[id]);
  const registerProviders = () => Promise.all([
    z.providers.register('lyrics', 'whitebox', { title: '歌词匹配白盒 · 多源与记忆' }, {
      lookup: ({ track, signal, automatic }) => lookup(track, signal, enabledSources(), automatic),
    }),
    ...Object.keys(names).map(id => z.providers.register('lyrics', id, { title: '白盒 · ' + names[id] }, {
      lookup: ({ track, signal, automatic }) => lookup(track, signal, [id], automatic),
    })),
  ]);
  async function search() {
    const current = revision, track = queryTrack();
    task?.abort(); task = new AbortController();
    const signal = AbortSignal.any([stop.signal, task.signal, AbortSignal.timeout(16000)]);
    busy = true; message = ''; page.refresh();
    try {
      const searchTrack = query.trim() ? { ...track, title: normalizer().normalize(query.trim()), artist: '' } : track;
      const result = await z.core('lyrics.search', { source: { plugin: z.providers.plugin, provider: source === 'all' ? 'whitebox' : source }, track: searchTrack });
      signal.throwIfAborted();
      if (current !== revision) return;
      candidates = result; selected = result.length ? 0 : -1; resultSequence = media.sequence;
      message = result.length ? `找到 ${result.length} 个候选` : '未找到可用歌词，可以修改关键词或切换来源。';
    } finally { if (current === revision) { busy = false; page.refresh(); } }
  }
  async function refreshTrack() {
    const current = await z.core('media.current');
    if (closed) return;
    if (current?.sequence !== media?.sequence) {
      revision++; task?.abort(); media = current; candidates = []; selected = -1; query = ''; busy = false; message = '';
      page.refresh();
    } else media = current;
    if (pendingAutomatic) {
      try {
        await z.call('ui.lyricsProvider', { enabled: true, source: { plugin: z.providers.plugin, provider: 'whitebox' } });
        pendingAutomatic = false; automatic = true; page.refresh();
      } catch (error) {
        if (!/still loading/iu.test(error?.message || '')) throw error;
      }
    } else {
      try {
        const state = await z.call('ui.lyricsProvider', {});
        const active = Boolean(state?.enabled && state?.source?.plugin === z.providers.plugin && state?.source?.provider === 'whitebox');
        if (active !== automatic) { automatic = active; page.refresh(); }
      } catch {}
    }
  }
  function render() {
    const candidate = candidates[selected], config = options();
    const preview = candidate && group('column', [
      { kind: 'heading', text: `${candidate.title} · ${candidate.artist}` },
      text(`${names[candidate.provider] || candidate.provider} · ${candidate.instrumental ? '纯音乐' :
        candidate.karaokeLyrics ? '逐字歌词' : candidate.syncedLyrics ? '时间轴歌词' : '纯文本歌词'}`, 'muted'),
      group('row', [button('应用本曲', 'apply'), button('应用并记住选择', 'remember')]),
      { kind: 'code', text: (candidate.karaokeLyrics || candidate.syncedLyrics || candidate.plainLyrics || '纯音乐').slice(0, 60000) },
      candidate.translationLyrics && group('column', [{ kind: 'heading', text: '翻译预览' }, { kind: 'code', text: candidate.translationLyrics.slice(0, 60000) }]),
      candidate.romanizationLyrics && group('column', [{ kind: 'heading', text: '罗马音预览' }, { kind: 'code', text: candidate.romanizationLyrics.slice(0, 60000) }]),
    ]);
    return group('column', [
      group('mast', [{ kind: 'kicker', text: 'SHINAWASE · LYRICS MATCH WHITEBOX' }, { kind: 'title', text: '歌词匹配白盒' },
        text('多源匹配、完整歌词与翻译预览、记忆本曲选择。', 'muted')]),
      { kind: 'heading', text: media ? `${media.title} · ${media.artist}` : '当前没有播放曲目' },
      group('row', [button('刷新当前曲目', 'refresh'), button(automatic ? '自动匹配：开' : '启用白盒自动匹配', 'automatic', automatic),
        button('重新匹配', 'search'), button('忘记本曲选择', 'forget')]),
      field('lyrics-query', '搜索关键词（留空按当前曲目匹配）', query, { submit: 'search' }),
      group('row', [button('全部来源', 'source/all', source === 'all'),
        ...Object.entries(names).map(([id, label]) => button(label, 'source/' + id, source === id)), button(busy ? '匹配中…' : '搜索', 'search')]),
      message && text(message, 'muted'),
      group('columns', [
        group('column', [
          { kind: 'heading', text: `歌词候选 · ${candidates.length}` },
          ...candidates.map((row, index) => group('setting', [
            group('column', [text(`${row.title} · ${row.artist}`), text(`${names[row.provider] || row.provider} · ${row.album || ''}`, 'muted')]),
            button('预览', 'preview/' + index, selected === index),
          ])),
          !candidates.length && text('播放歌曲后点击匹配，或输入关键词搜索。', 'muted'),
        ]),
        preview,
      ]),
      { kind: 'heading', text: '本曲歌词' },
      field('lyrics-offset', '偏移（毫秒，±10000）', '0'),
      group('row', [button('应用偏移', 'offset'), button('清除歌词覆盖', 'clear'), button('标记为纯音乐', 'instrumental')]),
      { kind: 'heading', text: '查询标准化' },
      group('row', [
        ...[['normalizeEnabled', '标准化'], ['normalizeTraditional', '繁简转换'], ['normalizeNoise', '移除噪声'],
          ['normalizeKeepVersion', '保留版本标记'], ['normalizeIncludeArtist', '包含歌手']].map(([id, label]) =>
          button(`${label}：${config[id] ? '开' : '关'}`, 'option/' + id, Boolean(config[id]))),
        button(`假名：${config.normalizeKana || 'off'}`, 'kana'),
      ]),
      text('自动匹配来源', 'muted'),
      group('row', Object.entries(names).map(([id, label]) => button(label, 'enabled/' + id, enabledSources().includes(id)))),
    ]);
  }
  page = z.ui.createPage({ id: 'lyrics', label: '歌词匹配', render, async action(name, fields) {
    if (name === 'refresh') await refreshTrack();
    else if (name === 'search') { query = fields['lyrics-query'] || ''; await search(); }
    else if (name.startsWith('source/')) { source = name.slice(7); if (source !== 'all' && !names[source]) throw new Error('未知来源'); }
    else if (name.startsWith('preview/')) selected = Number(name.slice(8));
    else if (name === 'automatic') {
      const result = await z.call('ui.lyricsProvider', { enabled: !automatic, source: { plugin: z.providers.plugin, provider: 'whitebox' } });
      automatic = result.enabled;
    } else if (name === 'apply' || name === 'remember') {
      const candidate = candidates[selected];
      if (!candidate || resultSequence !== media?.sequence) throw new Error('曲目或候选已更新，请重新匹配。');
      const track = queryTrack();
      await z.core('lyrics.applyProvider', { expectedSequence: resultSequence, lyrics: lyrics(candidate) });
      if (name === 'remember') {
        const choices = { ...saved.choices };
        delete choices[identity(track)];
        choices[identity(track)] = { provider: candidate.provider, id: candidate.providerLyricsId || null, sourceId: candidate.sourceId };
        while (Object.keys(choices).length > 128) delete choices[Object.keys(choices)[0]];
        saved = settings.set({ choices });
      }
      message = name === 'remember' ? '已应用并记住本曲选择' : '已应用本曲歌词';
    } else if (name === 'forget') {
      const choices = { ...saved.choices }; delete choices[identity(queryTrack())]; saved = settings.set({ choices });
      message = '已忘记本曲选择';
    } else if (['offset', 'clear', 'instrumental'].includes(name)) {
      if (!media) throw new Error('请先播放歌曲');
      const offsetMs = Number(fields['lyrics-offset']);
      if (name === 'offset' && (!Number.isFinite(offsetMs) || Math.abs(offsetMs) > 10000)) throw new Error('偏移范围为 ±10000 毫秒');
      await z.core('lyrics.editCurrent', { expectedSequence: media.sequence, operation: name, offsetMs });
      message = '本曲歌词已更新';
    } else if (name.startsWith('option/')) {
      const id = name.slice(7); saved = settings.set({ [id]: !options()[id] });
    } else if (name === 'kana') {
      const values = ['off', 'auto', 'hiragana', 'katakana'];
      saved = settings.set({ normalizeKana: values[(values.indexOf(options().normalizeKana || 'off') + 1) % values.length] });
    } else if (name.startsWith('enabled/')) {
      const id = name.slice(8), values = enabledSources();
      if (!names[id]) throw new Error('未知来源');
      const sources = values.includes(id) ? values.filter(value => value !== id) : [...values, id];
      if (!sources.length) throw new Error('至少保留一个自动匹配来源');
      saved = settings.set({ sources });
    }
  } });
  try {
    await registerProviders();
  } catch (error) {
    closed = true; stop.abort(); task?.abort(); page.close();
    throw error;
  }
  let polling = false;
  const timer = timers.setInterval(() => {
    if (closed || polling) return; polling = true;
    refreshTrack().catch(error => { message = error.message; page.refresh(); }).finally(() => { polling = false; });
  }, 1500);
  await refreshTrack();
  return () => { closed = true; stop.abort(); task?.abort(); timers.clearInterval(timer); page.close(); };
};
