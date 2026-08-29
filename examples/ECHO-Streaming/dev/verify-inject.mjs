const list = await (await fetch('http://127.0.0.1:9229/json')).json();
const target = list.find((item) => /app\.asar\/out\/renderer\/index\.html/u.test(item.url || '')) || list.find((item) => item.title === 'ECHO');
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
  returnByValue: true,
  expression: `(() => {
    const css = document.getElementById('echo-community-streaming-spatial')?.textContent || '';
    return {
      cssHasPlaylistPage: css.includes('streaming-playlist-page'),
      cssHasAlbumTrack: css.includes('playlist-track-list'),
      cssLen: css.length,
      overlay: document.querySelector('.echo-external-mod-page:not([hidden])')?.className || null,
      album: Boolean(document.querySelector('.album-detail-page')),
      playlist: Boolean(document.querySelector('.playlists-page.streaming-playlist-page')),
      artist: Boolean(document.querySelector('.streaming-artist-page')),
    };
  })()`,
});
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 2));
try { ws.close(); } catch {}
process.exit(0);
