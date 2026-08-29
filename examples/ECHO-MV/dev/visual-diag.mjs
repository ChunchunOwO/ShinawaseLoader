// Dev-only: check whether the playing MV video actually renders frames and
// how the immersive background stack is composited; grab a screenshot.
import { writeFileSync } from 'node:fs';
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 30000); });
const evalJson = async (expr, awaitPromise = false) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  return (r.result && 'value' in r.result) ? r.result.value : { exception: r.exceptionDetails?.text || r.exceptionDetails?.exception?.description };
};
await call('Runtime.enable');

console.log('== video frames ==');
console.log(JSON.stringify(await evalJson(`(async () => {
  const video = document.querySelector('.lyrics-mv-background-video') || document.querySelector('video.lyrics-mv-video');
  if (!video) return { error: 'no video element' };
  const t1 = video.currentTime;
  await new Promise((r) => setTimeout(r, 800));
  const t2 = video.currentTime;
  let frameInfo = null;
  try {
    frameInfo = video.getVideoPlaybackQuality ? {
      total: video.getVideoPlaybackQuality().totalVideoFrames,
      dropped: video.getVideoPlaybackQuality().droppedVideoFrames,
    } : null;
  } catch {}
  // draw current frame to canvas and sample pixels to see if it's black
  let sample = null;
  try {
    const c = document.createElement('canvas');
    c.width = 48; c.height = 27;
    const ctx = c.getContext('2d');
    ctx.drawImage(video, 0, 0, 48, 27);
    const data = ctx.getImageData(0, 0, 48, 27).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    sample = { avgBrightness: Math.round(sum / (data.length / 4) / 3) };
  } catch (e) { sample = { err: String(e).slice(0, 120) }; }
  const cs = getComputedStyle(video);
  const rect = video.getBoundingClientRect();
  return {
    src: String(video.currentSrc || '').slice(0, 90),
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    currentTimeAdvancing: t2 > t1,
    t1, t2,
    frameInfo,
    sample,
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    css: { opacity: cs.opacity, visibility: cs.visibility, display: cs.display, transform: cs.transform.slice(0, 50), filter: cs.filter.slice(0, 80), zIndex: cs.zIndex },
  };
})()`, true)));

console.log('== background stack ==');
console.log(JSON.stringify(await evalJson(`(() => {
  const bg = document.querySelector('.lyrics-mv-background');
  if (!bg) return { error: 'no background' };
  const cs = getComputedStyle(bg);
  const rect = bg.getBoundingClientRect();
  const page = document.querySelector('.lyrics-page');
  const pcs = page ? getComputedStyle(page) : null;
  // what's stacked at the center of the page?
  const cx = Math.round(rect.x + rect.width / 2);
  const cy = Math.round(rect.y + rect.height / 2);
  const stack = document.elementsFromPoint(cx, cy).slice(0, 8).map((n) => n.tagName.toLowerCase() + '.' + String(n.className?.baseVal ?? n.className).split(' ').slice(0, 2).join('.'));
  return {
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    css: { zIndex: cs.zIndex, opacity: cs.opacity, overlayOpacity: cs.getPropertyValue('--mv-immersive-overlay-opacity'), blur: cs.getPropertyValue('--mv-immersive-blur'), brightness: cs.getPropertyValue('--mv-immersive-brightness'), scale: cs.getPropertyValue('--mv-immersive-scale') },
    pageBackground: pcs ? pcs.backgroundColor : null,
    stackAtCenter: stack,
  };
})()`)));

const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-visual.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot saved: examples/ECHO-MV/dev/mv-visual.png');

try { ws.close(); } catch {}
process.exit(0);
