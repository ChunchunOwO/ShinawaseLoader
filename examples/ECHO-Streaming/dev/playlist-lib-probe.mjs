const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
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
  setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 20000);
});
await call('Runtime.enable');
const r = await call('Runtime.evaluate', {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const playlists = await window.echo.library.getPlaylists();
    const items = Array.isArray(playlists) ? playlists : (playlists?.playlists || playlists?.items || []);
    return {
      type: typeof playlists,
      keys: playlists && typeof playlists === 'object' && !Array.isArray(playlists) ? Object.keys(playlists) : null,
      count: items.length,
      sample: items.slice(0, 8).map((p) => ({
        id: p.id || p.playlistId,
        name: p.name || p.title,
        sourceProvider: p.sourceProvider,
        sourceId: p.sourceId || p.sourceItemId || p.providerPlaylistId,
        trackCount: p.trackCount || p.count,
        keys: Object.keys(p).slice(0, 20),
      })),
    };
  })()`,
});
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 2));
try { ws.close(); } catch {}
process.exit(0);
