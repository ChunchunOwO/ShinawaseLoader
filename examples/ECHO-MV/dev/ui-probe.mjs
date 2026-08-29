// Dev-only: inspect playback/library API shape and current UI state.
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
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const out = {};
  const keys = (o) => { try { return o ? Object.keys(o).slice(0, 40) : null; } catch { return 'err'; } };
  out.playbackKeys = keys(window.echo?.playback);
  out.libraryKeys = keys(window.echo?.library);
  out.queueKeys = keys(window.echo?.queue);
  try {
    const fns = ['getState', 'getStatus', 'getPlaybackState', 'getCurrent'];
    for (const f of fns) {
      if (typeof window.echo?.playback?.[f] === 'function') {
        const st = await window.echo.playback[f]();
        out.stateVia = f;
        out.state = st && { status: st.status || st.state, trackId: st.trackId || st.currentTrackId || st.track?.id, title: st.track?.title || st.title };
        break;
      }
    }
  } catch (e) { out.stateErr = String(e && e.message || e); }
  out.mvButton = !!document.querySelector('.transport-mv-button');
  out.lyricsButton = !!document.querySelector('.transport-lyrics-button');
  out.lyricsPageOpen = !!document.querySelector('.lyrics-page');
  out.route = location.hash || location.pathname;
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
