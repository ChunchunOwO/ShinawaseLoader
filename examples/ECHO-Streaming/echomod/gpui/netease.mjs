import { netease } from './netease-api.mjs';

export async function activate(ctx) {
  let signedIn = await ctx.storage.get('useNeteaseSession') === true;
  let quality = await ctx.storage.get('quality') || 'standard';
  const api = netease({session: () => signedIn ? ctx.credentials.get('netease-session') : null, quality: () => quality});
  const source = {plugin: ctx.pluginId, provider: 'netease'};
  ctx.lyrics.registerProvider('netease', {title: '网易云音乐歌词'}, api.lyrics);
  ctx.sources.registerProvider(source.provider, {title: '网易云音乐 · ECHO Streaming'}, api);

  const save = ctx.pages.registerAction('save', async ({fields, signal}) => {
    const token = fields.session?.trim();
    if (token) {
      if (!/^[\x21-\x7e]{1,4096}$/u.test(token) || /[;,]/u.test(token)) throw new Error('请只填写 MUSIC_U 的值。');
      await api.userId(signal, token);
      await ctx.credentials.set('netease-session', token);
      await ctx.storage.set('useNeteaseSession', true);
      signedIn = true;
    }
    await ctx.storage.set('quality', fields.quality);
    quality = fields.quality;
    return settings();
  });
  const logout = ctx.pages.registerAction('logout', async () => {
    await ctx.credentials.remove('netease-session');
    await ctx.storage.remove('useNeteaseSession');
    signedIn = false;
    return settings();
  });
  function settings() {
    const options = [{value:'standard',label:'标准'}, {value:'exhigh',label:'极高'},
      {value:'lossless',label:'无损'}, {value:'hires',label:'Hi-Res'}];
    return {title:'网易云音乐设置', fields:[
      {id:'session', label: signedIn ? '更新个人 MUSIC_U' : '个人 MUSIC_U（可选）', secret:true},
      {id:'quality', label:'播放音质', value:quality, control:{kind:'choice', options}}],
      actions:[{label:'保存', method:save}, ...(signedIn ? [{label:'退出账号', method:logout}] : []),
        {label:'返回', method:home}]};
  }
  const account = ctx.pages.registerAction('settings', settings);
  const home = ctx.pages.registerAction('home', landing);
  const search = ctx.pages.registerAction('search', ({fields,signal}) => catalog({query:fields.query.trim(), page:1}, signal));
  const browse = ctx.pages.registerAction('browse', ({data,signal}) => catalog(data, signal));
  const play = ctx.pages.registerAction('queue', async ({data}) => {
    await ctx.queue.submit({mode:data.mode, tracks:[{kind:'source', source, track:data.track}]});
  });

  function landing() {
    return {title:'ECHO Streaming', fields:[{id:'query', label:'歌曲或艺人'}],
      actions:[{label:'搜索', method:search}, {label:'浏览歌单', method:browse, input:{page:1}},
        {label:'账号与音质', method:account}]};
  }

  async function catalog(state, signal) {
    const {query, collectionId = null, page} = state;
    const options = {page, pageSize:15, signal};
    const result = query ? await api.search({...options, query}) : await api.browse({...options, collectionId});
    const rows = (result.collections ?? []).map(item => ({ title:item.title, actions:[{label:'打开', method:browse,
      input:{collectionId:item.id, title:item.title, page:1}}] }));
    for (const item of result.tracks) {
      rows.push({title:item.title, detail:[item.artist,item.album].filter(Boolean).join(' · '),
        actions:[{label:'播放', method:play, input:{mode:'play',track:item}},
          {label:'加入队列', method:play, input:{mode:'append',track:item}}]});
    }
    return {title:query || state.title || '网易云歌单', rows,
      description: rows.length ? undefined : '没有找到可显示的结果。',
      actions:[{label:'返回首页', method:home},
        ...(page > 1 ? [{label:'上一页', method:browse, input:{...state,page:page-1}}] : []),
        ...(result.hasMore ? [{label:'下一页', method:browse, input:{...state,page:page+1}}] : [])]};
  }
  ctx.pages.register('streaming', {title:'ECHO Streaming'}, landing);
}
