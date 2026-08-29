// Dev-only: reload the renderer (cold boot), wait for mod injection, play,
// and verify the bound MV restores with a visible backdrop-free video.
import { writeFileSync } from 'node:fs';
const CDP_PORT = 9229;
const listTargets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json());
const connect = async () => {
  const list = await listTargets();
  const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  const pending = new Map();
  let seq = 0;
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
  const call = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 30000); });
  const evalJson = async (expr, awaitPromise = false) => {
    const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
    return (r.result && 'value' in r.result) ? r.result.value : { exception: r.exceptionDetails?.text || r.exceptionDetails?.exception?.description };
  };
  await call('Runtime.enable');
  return { ws, call, evalJson };
};

let { ws, call, evalJson } = await connect();
console.log('reloading page...');
try { await call('Page.enable'); await call('Page.reload', { ignoreCache: false }); } catch {}
try { ws.close(); } catch {}
await new Promise((r) => setTimeout(r, 9000));

({ ws, call, evalJson } = await connect());
// wait for mod injection
for (let s = 0; s < 30; s += 1) {
  const active = await evalJson(`Boolean(window.__echoMvModActive)`);
  if (active === true) { console.log(`mod injected after ~${s}s`); break; }
  await new Promise((r) => setTimeout(r, 1000));
}

// kick playback
console.log('play:', JSON.stringify(await evalJson(`(async () => {
  try { await window.echo?.playback?.play?.(); return 'ok'; } catch (e) { return 'err:' + String(e).slice(0, 100); }
})()`, true)));

let last = '';
let good = false;
for (let s = 0; s < 50; s += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  const snap = await evalJson(`(async () => {
    const audio = await window.echo?.audio?.getStatus?.().catch(() => null);
    const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
    const bd = document.querySelector('.lyrics-backdrop');
    return {
      audio: audio?.state,
      track: (audio?.currentTrackTitle || '').slice(0, 24),
      lyricsVisible: !!document.querySelector('.lyrics-page'),
      hasVideo: !!video,
      paused: video?.paused ?? null,
      t: video ? Math.round(video.currentTime) : null,
      backdropBg: bd ? (getComputedStyle(bd).backgroundImage === 'none' ? 'none' : 'gradient') : 'missing',
    };
  })()`, true);
  const key = JSON.stringify(snap);
  if (key !== last) { console.log(`t+${s}s`, key); last = key; }
  if (snap.hasVideo && snap.paused === false && (snap.t ?? 0) > 3 && snap.backdropBg === 'none') { good = true; break; }
}
console.log('pipeline ok:', good);

await new Promise((r) => setTimeout(r, 1500));
const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-coldboot.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot: examples/ECHO-MV/dev/mv-coldboot.png');

try { ws.close(); } catch {}
process.exit(0);
