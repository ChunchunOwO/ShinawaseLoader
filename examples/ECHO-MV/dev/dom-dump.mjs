// Dev-only: dump MV panel DOM structure and all video elements in the page.
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
const r = await call('Runtime.evaluate', { expression: `(() => {
  const out = {};
  const short = (el, depth) => {
    if (!el || depth > 3) return null;
    return {
      tag: el.tagName,
      cls: (el.className && String(el.className).slice(0, 90)) || '',
      kids: [...el.children].slice(0, 8).map((c) => short(c, depth + 1)),
    };
  };
  const panel = document.querySelector('[data-echo-mv-mod]');
  out.panel = panel ? short(panel, 0) : null;
  out.panelHtml = panel ? panel.outerHTML.slice(0, 800) : null;
  out.videos = [...document.querySelectorAll('video')].map((v) => ({
    cls: String(v.className).slice(0, 60),
    src: (v.currentSrc || v.src || '').slice(0, 100),
    ready: v.readyState,
    err: v.error ? v.error.code : null,
    parentCls: v.parentElement ? String(v.parentElement.className).slice(0, 60) : null,
    connected: v.isConnected,
    rect: (() => { const r2 = v.getBoundingClientRect(); return [Math.round(r2.width), Math.round(r2.height)]; })(),
  }));
  const st = window.__echoMvModState || null;
  out.modStateKeys = st ? Object.keys(st).slice(0, 40) : null;
  out.modState = st ? {
    viewMode: st.viewMode, loading: st.loading, error: st.error && String(st.error).slice(0, 120),
    selectedId: st.selectedVideo && st.selectedVideo.id, selMediaUrl: st.selectedVideo && st.selectedVideo.mediaUrl,
    candidates: Array.isArray(st.candidates) ? st.candidates.length : null,
    trackId: st.trackId || (st.playback && st.playback.trackId),
    lyricsWasVisible: st.lyricsWasVisible,
  } : null;
  return out;
})()`, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
