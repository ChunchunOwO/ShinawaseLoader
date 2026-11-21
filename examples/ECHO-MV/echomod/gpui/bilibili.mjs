import { AsyncLocalStorage } from 'node:async_hooks';
import engineModule from '../main.cjs';

export async function activate(ctx) {
  const requests = new AsyncLocalStorage();
  let signedIn = (await ctx.storage.get('useBilibiliSession')) === true;
  const engine = engineModule.createEngine({
    dataDir: ctx.dataRoot,
    readBilibiliCookie: () => '',
    async fetchImpl(url, init) {
      const task = requests.getStore();
      task.signal.throwIfAborted();
      const headers = new Headers(init.headers);
      if (task.session && new URL(url).origin === 'https://api.bilibili.com') {
        headers.set('Cookie', 'SESSDATA=' + task.session);
      }
      const response = await fetch(url, { ...init, headers, redirect: 'error',
        signal: init.signal ? AbortSignal.any([init.signal, task.signal]) : task.signal });
      if (response.status === 403 || response.status === 412) task.denied = response.status;
      return response;
    },
  });

  async function request(signal, call) {
    const session = signedIn ? await ctx.credentials.get('bilibili-session') : null;
    signal.throwIfAborted();
    const task = { signal, session };
    const result = await requests.run(task, call);
    signal.throwIfAborted();
    if (task.denied && (!result || Array.isArray(result) && !result.length)) {
      throw new Error('哔哩哔哩暂未允许此次请求（HTTP ' + task.denied + '）。');
    }
    return result;
  }

  function snapshot(track) {
    return { trackId: track.id, title: track.title, artist: track.artist, durationSeconds: track.durationSeconds };
  }
  ctx.mv.registerProvider('bilibili', { title: 'ECHO MV · 哔哩哔哩' }, {
    search: ({ track, query, signal }) => request(signal, () => engine.nativeSearch(snapshot(track), query)),
    match: ({ track, signal }) => request(signal, () => engine.nativeMatch(snapshot(track))),
    async resolve({ track, candidate, signal }) {
      const bvid = /^bilibili:(BV[a-zA-Z0-9]+)$/u.exec(candidate.id)?.[1];
      if (!bvid) throw new Error('无效的哔哩哔哩视频 ID。');
      const video = { ...candidate, provider: 'bilibili', providerUrl: 'https://www.bilibili.com/video/' + bvid };
      const stream = await request(signal, () => engine.nativeResolve(snapshot(track), video));
      if (!stream?.playableInApp || !stream.url?.startsWith('https://')) throw new Error('此 MV 暂无可播放的视频流。');
      const headers = {};
      for (const [key, value] of Object.entries(stream.headers || {})) {
        if (['referer', 'user-agent'].includes(key.toLowerCase())) headers[key] = value;
      }
      return { url: stream.url, quality: stream.label, headers };
    },
  });

  const save = ctx.pages.registerAction('save', async ({fields}) => {
    const session = fields.session?.trim();
    if (session) {
      if (!/^[\x21-\x7e]{1,4096}$/u.test(session) || /[;,]/u.test(session)) throw new Error('请只填写 SESSDATA 的值。');
      await ctx.credentials.set('bilibili-session', session);
      await ctx.storage.set('useBilibiliSession', true);
      signedIn = true;
    }
    engine.setSettings({ patch: { maxQuality: fields.quality } });
    engine.flush();
    return page();
  });
  const logout = ctx.pages.registerAction('logout', async () => {
    await ctx.credentials.remove('bilibili-session');
    await ctx.storage.remove('useBilibiliSession');
    signedIn = false;
    return page();
  });
  function page() {
    return { title: 'ECHO MV', description: '在歌词设置的「MV 来源」选择 ECHO MV，可随当前曲目自动匹配或手动搜索。',
      fields: [{ id: 'quality', label: '最高画质', value: engine.getSettings().maxQuality,
        control: {kind: 'choice', options: ['720p','1080p','1440p','2160p','max'].map(value => ({value, label: value === 'max' ? '最高可用' : value}))} },
        {id: 'session', label: signedIn ? '更新个人 SESSDATA' : '个人 SESSDATA（可选）', secret: true}],
      actions: [{label: '保存', method: save}, ...(signedIn ? [{label: '移除账号', method: logout}] : [])] };
  }
  ctx.pages.register('settings', { title: 'ECHO MV' }, page);
}
