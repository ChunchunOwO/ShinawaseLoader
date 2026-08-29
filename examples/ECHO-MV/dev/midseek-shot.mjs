// Dev-only: seek to mid-song, let the MV sync, and screenshot to confirm
// frames are actually visible to the user.
import { writeFileSync } from 'node:fs';
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 25000); });
const evalJson = async (expr, awaitPromise = false) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  return (r.result && 'value' in r.result) ? r.result.value : { exception: r.exceptionDetails?.text || r.exceptionDetails?.exception?.description };
};
await call('Runtime.enable');

const seeked = await evalJson(`(async () => {
  try {
    if (window.echo?.playback?.seek) { await window.echo.playback.seek(75000); return 'seek-ms'; }
    if (window.echo?.audio?.seek) { await window.echo.audio.seek(75); return 'seek-s'; }
  } catch (e) { return 'seek-err:' + String(e).slice(0, 80); }
  return 'no-seek-api';
})()`, true);
console.log('seek:', JSON.stringify(seeked));
await new Promise((r) => setTimeout(r, 4000));

console.log('state:', JSON.stringify(await evalJson(`(async () => {
  const audio = await window.echo?.audio?.getStatus?.().catch(() => null);
  const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
  return { audioState: audio?.state, audioPos: Math.round((audio?.positionSeconds ?? -1) * 10) / 10, videoT: video ? Math.round(video.currentTime * 10) / 10 : null, paused: video?.paused ?? null };
})()`, true)));

const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-mid.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot: examples/ECHO-MV/dev/mv-mid.png');

try { ws.close(); } catch {}
process.exit(0);
