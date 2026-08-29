// Dev-only: inspect lyrics button + lyrics page visibility mechanics.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 25000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const out = {};
  const describe = (elm) => {
    if (!elm) return { exists: false };
    const rect = elm.getBoundingClientRect();
    const cs = getComputedStyle(elm);
    return {
      exists: true,
      checkVisibility: typeof elm.checkVisibility === 'function' ? elm.checkVisibility() : 'unsupported',
      rect: { w: Math.round(rect.width), h: Math.round(rect.height), x: Math.round(rect.x), y: Math.round(rect.y) },
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      className: String(elm.className).slice(0, 100),
      parentClass: elm.parentElement ? String(elm.parentElement.className).slice(0, 100) : null,
    };
  };
  const lyricsBtn = document.querySelector('button.transport-lyrics-button');
  out.lyricsBtn = describe(lyricsBtn);
  out.lyricsPage = describe(document.querySelector('.lyrics-page'));
  out.appShellLyrics = describe(document.querySelector('.app-shell--lyrics'));
  out.mvStub = describe(document.querySelector('section.lyrics-mv-panel'));
  if (lyricsBtn) {
    lyricsBtn.click();
    await new Promise((r) => setTimeout(r, 1800));
    out.afterClick_lyricsPage = describe(document.querySelector('.lyrics-page'));
    out.afterClick_btnPressed = lyricsBtn.getAttribute('aria-pressed');
    // route back check: click again to restore? NO — leave as-is for inspection.
  }
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
