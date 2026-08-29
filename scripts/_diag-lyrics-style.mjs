const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) throw new Error('no page');
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
  setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 20000);
});
await call('Runtime.enable');
const r = await call('Runtime.evaluate', {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const shell = document.querySelector('.app-shell');
    const page = document.querySelector('.lyrics-page');
    let settings = null;
    try { settings = await window.echo?.app?.getSettings?.(); } catch {}
    const styleSheets = [...document.styleSheets].map((s) => s.href || s.ownerNode?.id || s.ownerNode?.getAttribute?.('data-echo-mv') || 'inline').slice(0, 40);
    const cinemaRules = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = [...sheet.cssRules]; } catch { continue; }
      for (const rule of rules) {
        const text = rule.cssText || '';
        if (/cinemaStage|coverStage|cinema-stage|cover-stage|lyrics-stage|歌词舞台/i.test(text)) {
          cinemaRules.push(text.slice(0, 240));
          if (cinemaRules.length >= 40) break;
        }
      }
      if (cinemaRules.length >= 40) break;
    }
    return {
      shellClass: shell ? String(shell.className) : null,
      pageStyle: page?.getAttribute('data-lyrics-page-style'),
      settingsStyle: settings?.lyricsPageStyle || settings?.lyrics?.pageStyle || null,
      lyricsKeys: settings ? Object.keys(settings).filter((k) => /lyric|stage|cinema|cover|style|mv/i.test(k)).sort() : null,
      pickedSettings: settings ? {
        lyricsPageStyle: settings.lyricsPageStyle,
        lyricsBackgroundMode: settings.lyricsBackgroundMode,
        lyricsImmersiveCoverStyleEnabled: settings.lyricsImmersiveCoverStyleEnabled,
        lyricsMvAutoShowTrackInfoDisabled: settings.lyricsMvAutoShowTrackInfoDisabled,
        lyricsHeaderHidden: settings.lyricsHeaderHidden,
      } : null,
      styleSheets,
      cinemaRules,
    };
  })()`,
});
console.log(JSON.stringify(r.result?.value || r, null, 2));
ws.close();
