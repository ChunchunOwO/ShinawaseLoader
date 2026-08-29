// Dev-only: select the first search candidate, verify stream + visible frames.
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

await evalJson(`(() => {
  if (!document.querySelector('.mv-settings-drawer-root[data-open="true"]')) document.querySelector('.transport-mv-button')?.onclick?.();
  return 'ok';
})()`);
await new Promise((r) => setTimeout(r, 800));

const pick = await evalJson(`(() => {
  const item = document.querySelector('.mv-settings-drawer-root .mv-settings-candidate');
  if (!item) return 'no candidate';
  if (item.disabled) return 'disabled';
  item.click();
  return 'clicked: ' + (item.title || item.textContent).slice(0, 50);
})()`);
console.log('candidate:', JSON.stringify(pick));

let last = '';
for (let s = 0; s < 30; s += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  const snap = await evalJson(`(() => {
    const root = document.querySelector('.mv-settings-drawer-root');
    const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
    return {
      selected: root?.querySelector('.mv-selected-card')?.textContent?.slice(0, 50) ?? null,
      error: root?.querySelector('.audio-drawer-error')?.textContent?.slice(0, 120) ?? null,
      hasVideo: !!video,
      src: video ? String(video.currentSrc || video.src || '').slice(40, 120) : null,
      ready: video?.readyState ?? null,
      paused: video?.paused ?? null,
      vErr: video?.error ? { code: video.error.code, msg: String(video.error.message).slice(0, 80) } : null,
    };
  })()`);
  const key = JSON.stringify(snap);
  if (key !== last) { console.log(`t+${s}s`, key); last = key; }
  if ((snap.hasVideo && snap.ready >= 3) || snap.vErr || snap.error) break;
}

console.log('frames:', JSON.stringify(await evalJson(`(async () => {
  const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
  if (!video) return { error: 'no video' };
  const t1 = video.currentTime;
  await new Promise((r) => setTimeout(r, 1000));
  const t2 = video.currentTime;
  let q = null;
  try { const pq = video.getVideoPlaybackQuality(); q = { total: pq.totalVideoFrames, dropped: pq.droppedVideoFrames }; } catch {}
  let brightness = null;
  try {
    const c = document.createElement('canvas'); c.width = 48; c.height = 27;
    const ctx = c.getContext('2d');
    ctx.drawImage(video, 0, 0, 48, 27);
    const d = ctx.getImageData(0, 0, 48, 27).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    brightness = Math.round(s / (d.length / 4) / 3);
  } catch (e) { brightness = 'canvas-err:' + String(e).slice(0, 60); }
  return { w: video.videoWidth, h: video.videoHeight, t1, t2, advancing: t2 > t1, frames: q, avgBrightness: brightness };
})()`, true)));

// close drawer and screenshot the final page
await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scrim')?.click()`);
await new Promise((r) => setTimeout(r, 1500));
const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-playing.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot: examples/ECHO-MV/dev/mv-playing.png');

try { ws.close(); } catch {}
process.exit(0);
