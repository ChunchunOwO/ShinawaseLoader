// Dev-only: fetch the echo-mv:// proxy URL from the renderer to prove the
// main-process protocol handler streams real video bytes.
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
  const out = { mediaUrl: sel.mediaUrl.slice(0, 80) };
  try {
    const res = await fetch(sel.mediaUrl, { headers: { Range: 'bytes=0-65535' } });
    out.status = res.status;
    out.contentType = res.headers.get('content-type');
    out.contentRange = res.headers.get('content-range');
    out.acceptRanges = res.headers.get('accept-ranges');
    const buf = await res.arrayBuffer();
    out.bytes = buf.byteLength;
    const head = new Uint8Array(buf.slice(0, 12));
    out.headHex = [...head].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    // mp4 signature: '....ftyp'
    out.looksLikeMp4 = String.fromCharCode(...new Uint8Array(buf.slice(4, 8))) === 'ftyp';
  } catch (e) { out.fetchErr = String(e && e.message || e); }
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
