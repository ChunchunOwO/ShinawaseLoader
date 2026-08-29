// Dev-only: check document.hidden, bring ECHO to front, then re-check MV panel mount + video.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 25000); });
await call('Runtime.enable');
const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception?.description || 'eval error').slice(0, 600) };
  return { value: r.result?.value };
};
const out = (label, data) => console.log(`\n=== ${label} ===\n${typeof data === 'string' ? data : JSON.stringify(data, null, 1)}`);

const vis0 = await evaluate(`({ hidden: document.hidden, visibility: document.visibilityState })`);
out('visibility before', vis0.value ?? vis0.error);

await call('Page.enable');
await call('Page.bringToFront');
await new Promise((r) => setTimeout(r, 1200));

const vis1 = await evaluate(`({ hidden: document.hidden, visibility: document.visibilityState })`);
out('visibility after bringToFront', vis1.value ?? vis1.error);

// ensure mv mode still on, then poll for panel + video
let panel = null;
for (let i = 0; i < 30; i += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  const p = await evaluate(`(() => {
    const mod = document.querySelector('[data-echo-mv-mod]');
    const video = mod ? mod.querySelector('video') : null;
    const bg = document.querySelector('.lyrics-mv-background');
    return {
      modMounted: !!mod,
      mvEnabled: mod?.dataset.mvEnabled || null,
      childClasses: mod ? [...mod.children].map((c) => String(c.className).split(' ')[0]).slice(0, 8) : null,
      hasVideo: !!video,
      videoSrc: video ? String(video.currentSrc || video.src || '').slice(0, 80) : null,
      videoReady: video ? video.readyState : null,
      videoW: video ? video.videoWidth : null,
      playing: video ? !video.paused : null,
      background: !!bg,
      statusText: mod?.querySelector('.lyrics-mv-status, .lyrics-mv-empty, .lyrics-mv-error, .lyrics-mv-unavailable')?.textContent?.slice(0, 140) || null,
    };
  })()`);
  panel = p.value ?? { error: p.error };
  if (panel.hasVideo && panel.videoReady >= 2 && panel.videoW > 0) break;
}
out('MV panel state', panel);

const shot = await call('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
const file = new URL(`./front-test-${Date.now()}.png`, import.meta.url);
writeFileSync(file, Buffer.from(shot.data, 'base64'));
out('screenshot', decodeURIComponent(file.pathname));
try { ws.close(); } catch {}
process.exit(0);
