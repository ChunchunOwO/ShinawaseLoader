// Dev-only: dump the live page CSP and capture securitypolicyviolation events
// while attempting an echo-mv video load.
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
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const out = {};
  out.metaCsp = [...document.querySelectorAll('meta[http-equiv]')].map((m) => ({ eq: m.httpEquiv, content: (m.content || '').slice(0, 500) }));
  out.violations = [];
  const onViolation = (e) => out.violations.push({ directive: e.violatedDirective, blockedURI: (e.blockedURI || '').slice(0, 90) });
  document.addEventListener('securitypolicyviolation', onViolation);
  const probeVideo = (url) => new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    const done = (result) => { try { v.removeAttribute('src'); v.load(); } catch {} resolve(result); };
    const timer = setTimeout(() => done({ timeout: true, networkState: v.networkState }), 3500);
    v.addEventListener('error', () => { clearTimeout(timer); done({ mediaError: v.error && v.error.code }); }, { once: true });
    v.addEventListener('loadedmetadata', () => { clearTimeout(timer); done({ ok: true }); }, { once: true });
    v.src = url; v.load();
  });
  out.video = await probeVideo('echo-mv://stream/probe-video/probe-variant');
  await new Promise((r2) => setTimeout(r2, 300));
  document.removeEventListener('securitypolicyviolation', onViolation);
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
