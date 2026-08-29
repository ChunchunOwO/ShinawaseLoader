// Dev-only: inspect echo.audio.getStatus() and queue session for snapshot data.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 30000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const out = {};
  out.audioKeys = window.echo.audio ? Object.keys(window.echo.audio).slice(0, 30) : null;
  try { out.audioStatus = await window.echo.audio?.getStatus?.(); } catch (e) { out.audioErr = String(e && e.message || e); }
  try {
    const q = await window.echo.playback?.getQueueSession?.();
    const items = Array.isArray(q?.items) ? q.items : Array.isArray(q?.queue) ? q.queue : null;
    out.queueSessionShape = q ? Object.keys(q).slice(0, 15) : null;
    out.queueCurrent = (() => {
      if (!q) return null;
      const idx = Number(q.currentIndex ?? q.index ?? -1);
      const item = items && idx >= 0 ? items[idx] : null;
      return item ? { id: item.id, stableKey: item.stableKey, title: item.title, artist: item.artist, duration: item.duration, provider: item.provider, providerTrackId: item.providerTrackId } : null;
    })();
    out.queueLen = items ? items.length : null;
  } catch (e) { out.queueErr = String(e && e.message || e); }
  try { out.fullPlayback = await window.echo.playback.getStatus(); } catch {}
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1).slice(0, 4000));
try { ws.close(); } catch {}
process.exit(0);
