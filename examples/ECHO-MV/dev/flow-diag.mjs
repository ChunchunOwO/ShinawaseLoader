// Dev-only: exercise the full user flow for the current track and find where
// MV playback breaks: search -> candidates -> select -> stream -> visible frames.
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

// 1) open drawer
await evalJson(`document.querySelector('.transport-mv-button')?.onclick?.()`);
await new Promise((r) => setTimeout(r, 1000));
console.log('drawer open:', JSON.stringify(await evalJson(`!!document.querySelector('.mv-settings-drawer-root[data-open="true"]')`)));
console.log('meter:', JSON.stringify(await evalJson(`(() => {
  const meter = document.querySelector('.mv-settings-drawer-root .mv-engine-meter');
  return meter ? meter.textContent.slice(0, 160) : null;
})()`)));

// 2) click network search
const clicked = await evalJson(`(() => {
  const btns = [...document.querySelectorAll('.mv-settings-drawer-root .mv-settings-actions button')];
  const target = btns[0];
  if (!target) return 'no button';
  if (target.disabled) return 'disabled';
  target.click();
  return 'clicked';
})()`);
console.log('search click:', JSON.stringify(clicked));

// 3) wait for results (poll up to 20s)
let result = null;
for (let i = 0; i < 20; i += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  result = await evalJson(`(() => {
    const root = document.querySelector('.mv-settings-drawer-root');
    if (!root) return { gone: true };
    const busy = [...root.querySelectorAll('.mv-settings-actions button')].some((b) => b.disabled);
    const candidates = [...root.querySelectorAll('.mv-settings-candidate')].map((c) => c.title || c.textContent.slice(0, 60));
    const error = root.querySelector('.audio-drawer-error')?.textContent ?? null;
    const notice = [...root.querySelectorAll('p, em')].map((n) => n.textContent).filter((t) => /未能|失败|error|无法|没有/i.test(t)).slice(0, 3);
    return { busy, candidateCount: candidates.length, candidates: candidates.slice(0, 5), error, notice };
  })()`);
  if (result && !result.busy && (result.candidateCount > 0 || result.error || i > 8)) break;
}
console.log('search result:', JSON.stringify(result));

// 4) if candidates, select the first one
if (result?.candidateCount > 0) {
  await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-settings-candidate')?.click()`);
  console.log('selected first candidate, waiting for stream...');
  let sel = null;
  for (let i = 0; i < 25; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    sel = await evalJson(`(() => {
      const root = document.querySelector('.mv-settings-drawer-root');
      const card = root?.querySelector('.mv-selected-card');
      const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
      const error = root?.querySelector('.audio-drawer-error')?.textContent ?? null;
      return {
        selectedCard: card ? card.textContent.slice(0, 80) : null,
        hasVideo: !!video,
        videoSrc: video ? String(video.currentSrc || video.src || '').slice(0, 90) : null,
        readyState: video?.readyState ?? null,
        paused: video?.paused ?? null,
        videoError: video?.error ? { code: video.error.code, message: String(video.error.message).slice(0, 120) } : null,
        error,
      };
    })()`);
    if (sel?.videoError || sel?.error || (sel?.hasVideo && sel.readyState >= 3)) break;
  }
  console.log('after select:', JSON.stringify(sel));

  // 5) frame sampling if video exists
  if (sel?.hasVideo) {
    console.log('frames:', JSON.stringify(await evalJson(`(async () => {
      const video = document.querySelector('.lyrics-mv-background-video, video.lyrics-mv-video');
      if (!video) return { error: 'video gone' };
      const t1 = video.currentTime;
      await new Promise((r) => setTimeout(r, 900));
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
      } catch (e) { brightness = 'canvas-err:' + String(e).slice(0, 80); }
      const rect = video.getBoundingClientRect();
      return { videoWidth: video.videoWidth, videoHeight: video.videoHeight, advancing: t2 > t1, frames: q, avgBrightness: brightness, rect: { w: Math.round(rect.width), h: Math.round(rect.height) } };
    })()`, true)));
  }
}

// 6) screenshot with drawer open, then close drawer and screenshot the page
const shot1 = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-flow-drawer.png', Buffer.from(shot1.data, 'base64'));
await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scrim')?.click()`);
await new Promise((r) => setTimeout(r, 1200));
const shot2 = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-flow-page.png', Buffer.from(shot2.data, 'base64'));
console.log('screenshots saved');

try { ws.close(); } catch {}
process.exit(0);
