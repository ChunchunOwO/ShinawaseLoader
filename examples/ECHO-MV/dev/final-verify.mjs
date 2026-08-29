// Dev-only: final end-to-end verification after the backdrop + resume fixes.
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

// confirm the new CSS is live (style tag contains the !important rule)
console.log('css live:', JSON.stringify(await evalJson(`[...document.querySelectorAll('style')].some((s) => s.textContent.includes('.lyrics-backdrop-atmosphere') && s.textContent.includes('display: none !important'))`)));

// backdrop neutralized?
console.log('backdrop:', JSON.stringify(await evalJson(`(() => {
  const b = document.querySelector('.lyrics-backdrop');
  if (!b) return 'missing';
  const cs = getComputedStyle(b);
  const atmo = document.querySelector('.lyrics-backdrop-atmosphere');
  return { bgImage: cs.backgroundImage === 'none' ? 'none' : cs.backgroundImage.slice(0, 40), atmosphereDisplay: atmo ? getComputedStyle(atmo).display : 'missing' };
})()`)));

// playback + video state
console.log('video:', JSON.stringify(await evalJson(`(async () => {
  const audio = await window.echo?.audio?.getStatus?.().catch(() => null);
  const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
  return {
    audioState: audio?.state, track: (audio?.currentTrackTitle || '').slice(0, 30),
    hasVideo: !!video, ready: video?.readyState ?? null, paused: video?.paused ?? null,
    t: video ? Math.round(video.currentTime * 10) / 10 : null,
  };
})()`, true)));

const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-fixed-final.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot: examples/ECHO-MV/dev/mv-fixed-final.png');

try { ws.close(); } catch {}
process.exit(0);
