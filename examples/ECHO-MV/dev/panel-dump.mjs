// Dev-only: dump current MV panel state without clicking anything.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /renderer\/index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 30000); });
await call('Runtime.enable');
for (let round = 0; round < 10; round += 1) {
  const r = await call('Runtime.evaluate', { expression: `(() => {
    const panel = document.querySelector('[data-echo-mv-mod]');
    const stub = document.querySelector('section.lyrics-mv-panel:not([data-echo-mv-mod])');
    const video = panel ? panel.querySelector('video') : null;
    const btn = document.querySelector('button.transport-mv-button');
    return {
      pressed: btn ? btn.getAttribute('aria-pressed') : null,
      modPanel: !!panel,
      panelClass: panel ? panel.className.slice(0, 120) : null,
      panelChildren: panel ? panel.children.length : null,
      stubPanel: !!stub,
      hasVideo: !!video,
      videoSrc: video ? (video.currentSrc || video.src || '').slice(0, 110) : null,
      videoReady: video ? video.readyState : null,
      videoErr: video && video.error ? video.error.code : null,
      panelText: panel ? (panel.textContent || '').trim().slice(0, 160) : null,
    };
  })()`, returnByValue: true });
  console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails));
  const v = r.result?.value;
  if (v && v.hasVideo && (v.videoReady >= 2 || v.videoErr)) break;
  await new Promise((r2) => setTimeout(r2, 3000));
}
try { ws.close(); } catch {}
process.exit(0);
