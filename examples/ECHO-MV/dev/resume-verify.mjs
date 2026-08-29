// Dev-only: verify the pause/resume propagation fix end-to-end.
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

const snap = (label) => evalJson(`(async () => {
  const audio = await window.echo?.audio?.getStatus?.().catch(() => null);
  const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
  return {
    label: ${JSON.stringify('x')},
    audioState: audio?.state ?? null,
    videoExists: !!video,
    videoPaused: video?.paused ?? null,
    videoTime: video ? Math.round(video.currentTime * 10) / 10 : null,
  };
})()`, true);

console.log('initial:', JSON.stringify(await snap()));

// ensure music is playing (click transport play if paused)
const ensured = await evalJson(`(async () => {
  const audio = await window.echo?.audio?.getStatus?.().catch(() => null);
  if (audio?.state === 'playing') return 'already-playing';
  const btn = document.querySelector('.player-transport .transport-play-button, button[data-workshop-icon="transport-play"]')
    || [...document.querySelectorAll('.player-transport button, .transport-controls button')].find((b) => /play|播放/i.test(b.getAttribute('aria-label') || ''));
  if (btn) { btn.click(); return 'clicked-play'; }
  try { await window.echo?.playback?.play?.(); return 'api-play'; } catch (e) { return 'no-way:' + String(e).slice(0, 60); }
})()`, true);
console.log('ensure playing:', JSON.stringify(ensured));
await new Promise((r) => setTimeout(r, 2500));
console.log('after play:', JSON.stringify(await snap()));

// pause music via transport
const paused = await evalJson(`(async () => {
  const btn = [...document.querySelectorAll('.player-transport button, .transport-controls button')].find((b) => /pause|暂停/i.test(b.getAttribute('aria-label') || ''));
  if (btn) { btn.click(); return 'clicked-pause'; }
  try { await window.echo?.playback?.pause?.(); return 'api-pause'; } catch (e) { return 'no-way:' + String(e).slice(0, 60); }
})()`, true);
console.log('pause action:', JSON.stringify(paused));
await new Promise((r) => setTimeout(r, 2000));
console.log('after pause:', JSON.stringify(await snap()));

// resume music
const resumed = await evalJson(`(async () => {
  const btn = [...document.querySelectorAll('.player-transport button, .transport-controls button')].find((b) => /^(play|播放)/i.test(b.getAttribute('aria-label') || ''));
  if (btn) { btn.click(); return 'clicked-play'; }
  try { await window.echo?.playback?.play?.(); return 'api-play'; } catch (e) { return 'no-way:' + String(e).slice(0, 60); }
})()`, true);
console.log('resume action:', JSON.stringify(resumed));
await new Promise((r) => setTimeout(r, 2500));
const final = await snap();
console.log('after resume:', JSON.stringify(final));

// video time advancing check
const t1 = await evalJson(`document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video')?.currentTime ?? null`);
await new Promise((r) => setTimeout(r, 1500));
const t2 = await evalJson(`document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video')?.currentTime ?? null`);
console.log('video advancing:', JSON.stringify({ t1: Math.round(t1 * 10) / 10, t2: Math.round(t2 * 10) / 10, advancing: t2 > t1 }));

const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-final.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot: examples/ECHO-MV/dev/mv-final.png');

try { ws.close(); } catch {}
process.exit(0);
