export function activate(context) {
  async function nowPlaying() {
    const { title, artist } = await context.playback.get();
    return { title: title || '', artist: artist || '' };
  }
  async function page() {
    const { title, artist } = await nowPlaying();
    return {
      title: 'Shinawase Mod',
      description: [title, artist].filter(Boolean).join(' · ') || '当前没有播放曲目',
      actions: [{ label: '刷新', method: refresh }],
    };
  }
  const refresh = context.pages.registerAction('refresh', page);
  context.pages.register('home', { title: 'Shinawase Mod' }, page);
  context.commands.register('now-playing', { title: '当前播放' }, nowPlaying);
}
