// Dev-only: play a local library track, open lyrics, bind an MV candidate if
// needed, and verify the video paints with the backdrop neutralized.
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

// 1) get first local track and play it
const played = await evalJson(`(async () => {
  try {
    const tracks = await window.echo.library.getTracks({ limit: 5 }).catch(() => window.echo.library.getTracks());
    const arr = Array.isArray(tracks) ? tracks : (tracks?.tracks || tracks?.items || []);
    if (!arr.length) return { error: 'no local tracks' };
    const track = arr[0];
    try { await window.echo.playback.playMediaItem(track); } catch { await window.echo.playback.playLocalFile(track.filePath || track.path || track.file); }
    return { playing: (track.title || track.fileName || '?').slice(0, 40), id: track.id ?? track.trackId ?? null };
  } catch (e) { return { error: String(e).slice(0, 160) }; }
})()`, true);
console.log('play local:', JSON.stringify(played));
if (played?.error) { console.log('abort'); process.exit(1); }
await new Promise((r) => setTimeout(r, 3500));

// 2) go to lyrics page via transport button
console.log('open lyrics:', JSON.stringify(await evalJson(`(() => {
  if (document.querySelector('.lyrics-page')) return 'already';
  const btn = document.querySelector('button.transport-lyrics-button');
  if (!btn) return 'no lyrics button';
  btn.click();
  return 'clicked';
})()`)));
await new Promise((r) => setTimeout(r, 2500));

// 3) watch for auto flow; if no video after 12s, bind first candidate manually
let snap = null;
for (let s = 0; s < 12; s += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  snap = await evalJson(`(() => {
    const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
    return { hasVideo: !!video, paused: video?.paused ?? null };
  })()`);
  if (snap.hasVideo) break;
}
console.log('auto video:', JSON.stringify(snap));

if (!snap?.hasVideo) {
  console.log('drawer open:', JSON.stringify(await evalJson(`(() => { document.querySelector('.transport-mv-button')?.onclick?.(); return 'ok'; })()`)));
  await new Promise((r) => setTimeout(r, 1000));
  console.log('search:', JSON.stringify(await evalJson(`(() => {
    const btn = [...document.querySelectorAll('.mv-settings-drawer-root .mv-settings-actions button')][0];
    if (!btn) return 'missing';
    if (btn.disabled) return 'disabled';
    btn.click();
    return 'clicked';
  })()`)));
  for (let s = 0; s < 15; s += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const c = await evalJson(`document.querySelectorAll('.mv-settings-drawer-root .mv-settings-candidate').length`);
    if (c > 0) { console.log('candidates:', c); break; }
  }
  console.log('bind first:', JSON.stringify(await evalJson(`(() => {
    const item = document.querySelector('.mv-settings-drawer-root .mv-settings-candidate');
    if (!item) return 'none';
    item.click();
    return 'clicked';
  })()`)));
  await new Promise((r) => setTimeout(r, 6000));
  await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scrim')?.click()`);
  await new Promise((r) => setTimeout(r, 1000));
}

// 4) final state + screenshot
console.log('final:', JSON.stringify(await evalJson(`(async () => {
  const audio = await window.echo?.audio?.getStatus?.().catch(() => null);
  const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
  const bd = document.querySelector('.lyrics-backdrop');
  return {
    audio: audio?.state,
    hasVideo: !!video,
    paused: video?.paused ?? null,
    t: video ? Math.round(video.currentTime * 10) / 10 : null,
    ready: video?.readyState ?? null,
    backdropBg: bd ? (getComputedStyle(bd).backgroundImage === 'none' ? 'none' : 'gradient') : 'missing',
  };
})()`, true)));

await new Promise((r) => setTimeout(r, 2000));
const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-local-final.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot: examples/ECHO-MV/dev/mv-local-final.png');

try { ws.close(); } catch {}
process.exit(0);
