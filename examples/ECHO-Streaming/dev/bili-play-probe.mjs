const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
const target = list.find((item) => /app\.asar\/out\/renderer\/index\.html/u.test(item.url || '')) || list.find((item) => item.title === 'ECHO');
if (!target) {
  console.log(JSON.stringify({ error: 'no renderer', titles: list.map((item) => item.title) }));
  process.exit(1);
}
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
  setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 30000);
});
await call('Runtime.enable');
const r = await call('Runtime.evaluate', {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const streaming = window.echo?.streaming;
    const providers = await streaming?.getProviders?.();
    const bili = (providers || []).find((item) => item.name === 'bilibili');
    const out = {
      bili,
      hasResolve: typeof streaming?.resolvePlayback === 'function',
      albumPage: Boolean(document.querySelector('.album-detail-page')),
      artistPage: Boolean(document.querySelector('.streaming-artist-page')),
      playlistPage: Boolean(document.querySelector('.streaming-playlist-page')),
      albumHero: document.querySelector('.album-detail-hero') ? {
        className: document.querySelector('.album-detail-hero').className,
        rect: document.querySelector('.album-detail-hero').getBoundingClientRect(),
      } : null,
      overlay: document.querySelector('.echo-external-mod-page:not([hidden])') ? {
        className: document.querySelector('.echo-external-mod-page:not([hidden])').className,
        child: document.querySelector('.echo-external-mod-page:not([hidden])').firstElementChild?.className || null,
      } : null,
    };
    try {
      const search = await streaming.search({ provider: 'bilibili', query: 'YOASOBI', mediaTypes: ['track'], page: 1, pageSize: 3 });
      const track = (search?.tracks || [])[0] || null;
      out.sample = track ? {
        title: track.title,
        providerTrackId: track.providerTrackId,
        playable: track.playable,
        unavailableReason: track.unavailableReason,
        id: track.id,
      } : null;
      if (track) {
        try {
          const source = await streaming.resolvePlayback({
            provider: 'bilibili',
            providerTrackId: track.providerTrackId,
            quality: 'standard',
          });
          out.resolve = {
            ok: true,
            urlHost: (() => { try { return new URL(source.url).host; } catch { return String(source.url || '').slice(0, 80); } })(),
            mimeType: source.mimeType || null,
            codec: source.codec || null,
            headerKeys: source.headers ? Object.keys(source.headers) : [],
          };
        } catch (error) {
          out.resolve = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }
    } catch (error) {
      out.searchError = error instanceof Error ? error.message : String(error);
    }
    return out;
  })()`,
});
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 2));
try { ws.close(); } catch {}
process.exit(0);
