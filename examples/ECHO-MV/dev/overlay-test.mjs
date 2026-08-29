// Dev-only: break hardware overlay promotion with a tiny rotation and
// re-screenshot; if the frame appears, CDP was just missing the overlay plane.
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

console.log('rotate:', JSON.stringify(await evalJson(`(() => {
  const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
  if (!video) return 'no video';
  video.style.setProperty('transform', getComputedStyle(video).transform === 'none' ? 'rotate(0.02deg)' : 'translate(-50%, -50%) translateZ(0) scale(1.15) rotate(0.02deg)', 'important');
  return 'rotated: ' + video.style.transform;
})()`)));

await new Promise((r) => setTimeout(r, 900));
const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-rotated.png', Buffer.from(shot.data, 'base64'));

// revert
console.log('revert:', JSON.stringify(await evalJson(`(() => {
  const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
  if (video) video.style.removeProperty('transform');
  return 'ok';
})()`)));
console.log('screenshot: examples/ECHO-MV/dev/mv-rotated.png');

try { ws.close(); } catch {}
process.exit(0);
