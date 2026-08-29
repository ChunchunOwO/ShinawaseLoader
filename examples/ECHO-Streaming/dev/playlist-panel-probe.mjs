const list = await (await fetch('http://127.0.0.1:9229/json')).json();
const target = list.find((item) => /app\.asar\/out\/renderer\/index\.html/u.test(item.url || '')) || list.find((item) => item.title === 'ECHO');
if (!target) {
  console.log(JSON.stringify({ error: 'no renderer' }));
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
  setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 15000);
});
await call('Runtime.enable');
const r = await call('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        className: el.className,
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        display: cs.display, grid: cs.gridTemplateColumns, padding: cs.padding,
        overflow: cs.overflow, position: cs.position, children: el.children.length,
      };
    };
    return {
      overlay: document.querySelector('.echo-external-mod-page:not([hidden])')?.className || null,
      tab: document.querySelector('.streaming-result-tabs [data-active="true"], .streaming-result-tabs button[data-active]')?.textContent || null,
      panel: box(document.querySelector('.streaming-playlist-panel')),
      form: box(document.querySelector('.streaming-playlist-import')),
      copy: box(document.querySelector('.streaming-playlist-import-copy')),
      sync: box(document.querySelector('.streaming-account-playlist-sync')),
      list: box(document.querySelector('.streaming-discovery-list')),
      card: box(document.querySelector('.streaming-playlist-card, .streaming-discovery-card')),
      cover: box(document.querySelector('.streaming-playlist-card .streaming-cover, .streaming-discovery-card .streaming-cover')),
      coverImg: box(document.querySelector('.streaming-playlist-card img, .streaming-discovery-card img')),
    };
  })()`,
});
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 2));
try { ws.close(); } catch {}
process.exit(0);
