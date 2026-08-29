const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && state.pending.has(m.id)) {
    const p = state.pending.get(m.id);
    state.pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
});
const call = (method, params = {}) => new Promise((res, rej) => {
  const id = ++state.id;
  state.pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 15000);
});
await call('Runtime.enable');
const r = await call('Runtime.evaluate', {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const settings = await window.echo?.app?.getSettings?.();
    const labels = {};
    const keys = [
      'lyricsSettings.visual.pageStyleCinemaStage',
      'lyricsSettings.visual.pageStyleCoverStage',
      'lyricsSettings.visual.pageStyle',
      'lyricsSettings.visual.pageStyleTitle',
      'lyricsSettings.visual.stage',
      'lyricsSettings.visual.lyricsStage',
      'settings.lyrics.stage',
    ];
    // scrape visible option labels
    const options = [...document.querySelectorAll('option, [data-value], button, label, span')]
      .map((el) => (el.textContent || '').trim())
      .filter((t) => /舞台|影台|书面|cinema|cover stage|歌词样式|页面样式/i.test(t))
      .slice(0, 40);
    return {
      lyricsPageStyle: settings?.lyricsPageStyle,
      mvEnabledOfficial: settings?.mvEnabled,
      options,
      locale: settings?.locale,
    };
  })()`,
});
console.log(JSON.stringify(r.result?.value || r, null, 2));
ws.close();
