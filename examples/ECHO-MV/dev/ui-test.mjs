// Dev-only: full UI interaction test — resume playback, click the MV
// transport button, wait for auto-search + video, dump panel state, screenshot.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 30000); });
await call('Runtime.enable');
const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception?.description || 'eval error').slice(0, 800) };
  return { value: r.result?.value };
};
const out = (label, data) => console.log(`\n=== ${label} ===\n${typeof data === 'string' ? data : JSON.stringify(data, null, 1)}`);

// 1. resume playback + click MV button
const clicked = await evaluate(`(async () => {
  try { await window.echo.playback.play(); } catch {}
  const btn = document.querySelector('.transport-mv-button');
  if (!btn) return { error: 'mv button missing' };
  btn.click();
  return { clicked: true, pressed: btn.getAttribute('aria-pressed'), active: btn.getAttribute('data-active') };
})()`);
out('click MV button', clicked.value ?? clicked.error);

// 2. poll panel for video readiness up to 25s
let panel = null;
for (let i = 0; i < 25; i += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  const p = await evaluate(`(() => {
    const section = document.querySelector('.lyrics-mv-panel');
    const mod = document.querySelector('[data-echo-mv-mod]');
    const video = (mod || section || document).querySelector('video');
    return {
      sectionExists: !!section,
      modMounted: !!mod,
      modClasses: mod ? String(mod.className).slice(0, 120) : null,
      hasVideo: !!video,
      videoSrc: video ? String(video.src || video.currentSrc || '').slice(0, 90) : null,
      videoReady: video ? video.readyState : null,
      videoW: video ? video.videoWidth : null,
      videoH: video ? video.videoHeight : null,
      playing: video ? !video.paused : null,
      statusText: (mod || section)?.querySelector('.lyrics-mv-status, .lyrics-mv-empty, .lyrics-mv-error, .lyrics-mv-unavailable')?.textContent?.slice(0, 120) || null,
    };
  })()`);
  panel = p.value ?? { error: p.error };
  if (panel.hasVideo && panel.videoReady >= 2 && panel.videoW > 0) break;
  if (i === 16 && !panel.modMounted) break;
}
out('MV panel state', panel);

// 3. screenshot
const shot = await call('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
const file = new URL(`./ui-test-${Date.now()}.png`, import.meta.url);
writeFileSync(file, Buffer.from(shot.data, 'base64'));
out('screenshot', decodeURIComponent(file.pathname));
try { ws.close(); } catch {}
process.exit(0);
