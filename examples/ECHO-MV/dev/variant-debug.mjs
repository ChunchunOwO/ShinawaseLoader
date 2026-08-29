// Dev-only: inspect resolveStreams output for the selected video.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 60000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const mv = window.__echoShinawaseStreaming.mv;
  const out = {};
  try {
    const res = await mv.resolveStreams('5ed81461-a40f-4b47-95d3-a3b5f4def457');
    out.videoMediaUrl = (res.video?.mediaUrl || '').slice(0, 90);
    out.videoPlayable = res.video?.playableInApp;
    out.selectedVariantId = res.selectedVariantId ?? res.video?.selectedVariantId ?? null;
    out.resKeys = Object.keys(res).slice(0, 12);
    const variants = res.variants || res.streams || [];
    out.variants = variants.slice(0, 8).map((v) => ({ id: v.variantId || v.id, q: v.qualityLabel || v.quality, playable: v.playableInApp, proto: v.protocol, hasUrl: !!v.url, expired: v.expiresAt ? (Date.parse(v.expiresAt) < Date.now()) : null }));
  } catch (e) { out.resolveErr = String(e && e.message || e); }
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
