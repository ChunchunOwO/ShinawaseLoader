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
    const page = document.querySelector('.streaming-playlist-page, .playlist-detail-header, .album-detail-page');
    const header = document.querySelector('.playlist-detail-header');
    const actions = document.querySelector('.playlist-actions, .playlist-detail-primary-actions, .album-detail-actions');
    const style = document.getElementById('echo-community-streaming-spatial');
    const read = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        className: el.className,
        display: cs.display,
        flexDirection: cs.flexDirection,
        flexWrap: cs.flexWrap,
        gridTemplateColumns: cs.gridTemplateColumns,
        width: cs.width,
        minWidth: cs.minWidth,
        justifyContent: cs.justifyContent,
        children: [...el.children].map((child) => {
          const c = getComputedStyle(child);
          return {
            tag: child.tagName,
            className: child.className,
            display: c.display,
            width: c.width,
            flex: c.flex,
            alignSelf: c.alignSelf,
          };
        }),
      };
    };
    return {
      overlay: document.querySelector('.echo-external-mod-page:not([hidden])')?.className || null,
      pageClass: page?.className || null,
      cssHasFlex: Boolean(style?.textContent?.includes('playlist-detail-primary-actions') && style.textContent.includes('display: flex')),
      header: read(header),
      actions: read(actions),
      albumActions: read(document.querySelector('.album-detail-actions')),
    };
  })()`,
});
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 2));
try { ws.close(); } catch {}
process.exit(0);
