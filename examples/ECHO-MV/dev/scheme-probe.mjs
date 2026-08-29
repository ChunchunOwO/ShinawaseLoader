// Dev-only: from the RENDERER, compare echo-mv vs echo-video vs echo-image
// scheme behavior (fetch + video element) to detect which schemes are
// privileged (registerSchemesAsPrivileged) in the shipped app.
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
  const probeFetch = async (url) => {
    try {
      const res = await fetch(url);
      return { status: res.status, ct: res.headers.get('content-type') };
    } catch (e) { return { err: String(e && e.message || e) }; }
  };
  out.fetch_echo_mv = await probeFetch('echo-mv://stream/probe-video/probe-variant');
  out.fetch_echo_video = await probeFetch('echo-video://mv/probe-video');
  out.fetch_echo_image = await probeFetch('echo-image://remote/https%3A%2F%2Fexample.com%2Fx.jpg');
  const probeVideo = (url) => new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    const done = (result) => { try { v.removeAttribute('src'); v.load(); } catch {} resolve(result); };
    const timer = setTimeout(() => done({ timeout: true, networkState: v.networkState, readyState: v.readyState }), 4000);
    v.addEventListener('error', () => { clearTimeout(timer); done({ error: v.error ? { code: v.error.code, message: v.error.message } : 'unknown' }); }, { once: true });
    v.addEventListener('loadedmetadata', () => { clearTimeout(timer); done({ ok: true, duration: v.duration }); }, { once: true });
    v.src = url; v.load();
  });
  out.video_echo_mv = await probeVideo('echo-mv://stream/probe-video/probe-variant');
  out.video_echo_video = await probeVideo('echo-video://mv/probe-video');
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
