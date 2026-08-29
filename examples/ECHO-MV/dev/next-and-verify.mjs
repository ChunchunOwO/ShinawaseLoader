// Dev-only: skip to next track to un-stick playback, then verify MV pipeline.
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

console.log('next:', JSON.stringify(await evalJson(`(async () => {
  try { await window.echo?.playback?.next?.(); return 'ok'; } catch (e) { return 'err:' + String(e).slice(0, 100); }
})()`, true)));

let last = '';
for (let s = 0; s < 45; s += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  const snap = await evalJson(`(async () => {
    const audio = await window.echo?.audio?.getStatus?.().catch(() => null);
    const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
    const bd = document.querySelector('.lyrics-backdrop');
    const root = document.querySelector('.mv-settings-drawer-root');
    return {
      audio: audio?.state,
      track: (audio?.currentTrackTitle || '').slice(0, 24),
      hasVideo: !!video,
      paused: video?.paused ?? null,
      t: video ? Math.round(video.currentTime) : null,
      backdropBg: bd ? (getComputedStyle(bd).backgroundImage === 'none' ? 'none' : 'gradient') : 'missing',
      candidates: root ? root.querySelectorAll('.mv-settings-candidate').length : null,
    };
  })()`, true);
  const key = JSON.stringify(snap);
  if (key !== last) { console.log(`t+${s}s`, key); last = key; }
  if (snap.hasVideo && snap.paused === false && snap.t > 3 && snap.backdropBg === 'none') break;
}

await new Promise((r) => setTimeout(r, 1200));
const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-live-final2.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot: examples/ECHO-MV/dev/mv-live-final2.png');

try { ws.close(); } catch {}
process.exit(0);
