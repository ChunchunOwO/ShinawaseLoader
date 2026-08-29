// Dev-only: resume playback briefly, screenshot the MV rendering, restore state.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /renderer\/index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 45000); });
await call('Runtime.enable');
const evalJs = async (expr) => {
  const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.value;
};
const wasPlaying = await evalJs(`(async () => {
  const s = await window.echo.playback.getState();
  const playing = s && (s.state === 'playing' || s.isPlaying === true);
  if (!playing) { try { await window.echo.playback.play(); } catch {} }
  return playing;
})()`);
await new Promise((r) => setTimeout(r, 4000));
const sync = await evalJs(`(() => {
  const v = document.querySelector('video.lyrics-mv-background-video') || document.querySelector('[data-echo-mv-mod] video') || document.querySelector('.lyrics-mv-background video');
  return v ? { src: (v.currentSrc || '').slice(0, 100), ready: v.readyState, paused: v.paused, time: v.currentTime, muted: v.muted, rate: v.playbackRate } : null;
})()`);
console.log('videoState:', JSON.stringify(sync));
const shot = await call('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
const out = `examples/ECHO-MV/dev/mv-visual-${Date.now()}.png`;
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('screenshot:', out);
if (!wasPlaying) {
  await evalJs(`(async () => { try { await window.echo.playback.pause(); } catch {} return true; })()`);
  console.log('restored paused state');
}
try { ws.close(); } catch {}
process.exit(0);
