// Dev-only: capture the low-level network error for echo-mv:// loads.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
const events = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.loadingFailed' || m.method === 'Network.requestWillBeSent' || m.method === 'Network.responseReceived') {
    const p = m.params;
    if (m.method === 'Network.requestWillBeSent' && !/^echo-mv:|^echo-video:|^echo-image:/.test(p.request?.url || '')) return;
    events.push({ ev: m.method.replace('Network.', ''), url: (p.request?.url || p.response?.url || '').slice(0, 70), errorText: p.errorText, blockedReason: p.blockedReason, status: p.response?.status, mime: p.response?.mimeType, requestId: p.requestId });
  }
});
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 30000); });
await call('Runtime.enable');
await call('Network.enable');
await call('Runtime.evaluate', { expression: `(async () => {
  const mv = window.__echoShinawaseStreaming.mv;
  const sel = await mv.getSelected('streaming:netease:3370692476');
  // echo-mv attempt
  const v = document.createElement('video');
  v.muted = true; v.src = sel.mediaUrl; v.load();
  // echo-image control (native protocol known to work)
  const a = await window.echo.audio.getStatus();
  if (a.currentTrackCoverUrl?.startsWith('echo-image:')) { const img = new Image(); img.src = a.currentTrackCoverUrl; }
  await new Promise((r) => setTimeout(r, 3000));
  v.removeAttribute('src'); try { v.load(); } catch {}
  return 'done';
})()`, awaitPromise: true, returnByValue: true });
await new Promise((r) => setTimeout(r, 1000));
// match failures to requests
console.log(JSON.stringify(events, null, 1));
try { ws.close(); } catch {}
process.exit(0);
