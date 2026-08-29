// Dev-only: pause the MV background video and resync it to the audio position.
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
  const v = document.querySelector('video.lyrics-mv-background-video');
  if (!v) return { err: 'no video' };
  let audioPos = null;
  try { const s = await window.echo.playback.getState(); audioPos = s && (s.positionSeconds ?? s.position ?? null); } catch {}
  v.pause();
  if (typeof audioPos === 'number' && Number.isFinite(audioPos)) v.currentTime = audioPos;
  return { paused: v.paused, time: v.currentTime, audioPos };
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails));
try { ws.close(); } catch {}
process.exit(0);
