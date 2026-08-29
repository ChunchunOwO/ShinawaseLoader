// Dev-only: load the echo-mv:// URL in a real <video> element (the same
// pipeline the MV panel uses) and report metadata.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 45000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const mv = window.__echoShinawaseStreaming.mv;
  const sel = await mv.getSelected('streaming:netease:3370692476');
  if (!sel?.mediaUrl) return { error: 'no selected mediaUrl' };
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  const result = await new Promise((resolve) => {
    const to = setTimeout(() => resolve({ event: 'timeout', readyState: v.readyState, errCode: v.error?.code ?? null }), 20000);
    v.addEventListener('loadedmetadata', () => { clearTimeout(to); resolve({ event: 'loadedmetadata', w: v.videoWidth, h: v.videoHeight, duration: Math.round(v.duration) }); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(to); resolve({ event: 'error', errCode: v.error?.code ?? null, errMsg: v.error?.message || null }); }, { once: true });
    v.src = sel.mediaUrl;
    v.load();
  });
  let played = null;
  if (result.event === 'loadedmetadata') {
    try { await v.play(); await new Promise((r) => setTimeout(r, 1500)); played = { currentTime: Number(v.currentTime.toFixed(2)), paused: v.paused }; v.pause(); } catch (e) { played = { playErr: String(e && e.message || e) }; }
  }
  v.removeAttribute('src'); try { v.load(); } catch {}
  return { mediaUrl: sel.mediaUrl.slice(0, 80), ...result, played };
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
