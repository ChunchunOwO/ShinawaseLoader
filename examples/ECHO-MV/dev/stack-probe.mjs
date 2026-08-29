// Dev-only: elementsFromPoint stack at screen center to find what covers the MV video.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /renderer\/index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 30000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(() => {
  const x = Math.round(window.innerWidth / 2);
  const y = Math.round(window.innerHeight / 2);
  const els = document.elementsFromPoint(x, y);
  return els.slice(0, 14).map((el) => {
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      cls: String(el.className).slice(0, 90),
      bg: cs.backgroundColor,
      bgImg: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 60),
      opacity: cs.opacity,
      zIndex: cs.zIndex,
      backdrop: cs.backdropFilter && cs.backdropFilter !== 'none' ? cs.backdropFilter.slice(0, 40) : null,
    };
  });
})()`, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
