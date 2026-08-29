// Dev-only: invoke the MV button handler synchronously and capture any error.
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
const r = await call('Runtime.evaluate', { expression: `(() => {
  const btn = document.querySelector('.transport-mv-button');
  if (!btn) return { error: 'no button' };
  const out = { hasOnclick: typeof btn.onclick };
  try { btn.onclick && btn.onclick(); out.invoked = true; } catch (e) { out.err = String(e && e.stack || e).slice(0, 700); }
  out.pressed = btn.getAttribute('aria-pressed');
  out.softActive = btn.classList.contains('is-soft-active');
  const page = document.querySelector('.lyrics-page');
  out.pageExists = !!page;
  out.pageViewMode = page ? (page.dataset.viewMode || 'unset') : null;
  out.modPanel = !!document.querySelector('[data-echo-mv-mod]');
  out.stubPanel = !!document.querySelector('section.lyrics-mv-panel');
  out.session = (() => { try { return sessionStorage.getItem('echo:lyrics:view-mode'); } catch (e) { return 'err:' + e.message; } })();
  return out;
})()`, awaitPromise: false, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
