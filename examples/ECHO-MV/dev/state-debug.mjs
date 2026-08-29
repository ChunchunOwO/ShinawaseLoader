// Dev-only: inspect backend MV state for the current track.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 40000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const out = {};
  const st = await window.echo.playback.getStatus().catch(() => null);
  out.playback = st ? { state: st.state, trackId: st.currentTrackId, title: st.currentTrackTitle, artist: st.currentTrackArtist } : null;
  const mv = window.__echoShinawaseStreaming?.mv;
  if (!mv) return { ...out, error: 'no mv bridge' };
  const trackId = st?.currentTrackId;
  if (!trackId) return { ...out, error: 'no current track' };
  try { out.selected = await mv.getSelected(trackId); } catch (e) { out.selectedErr = String(e && e.message || e); }
  try {
    const cands = await mv.getCandidates(trackId);
    out.candidatesCount = Array.isArray(cands) ? cands.length : 'na';
    out.candidatesTop = Array.isArray(cands) ? cands.slice(0, 3).map((c) => ({ t: (c.title || '').slice(0, 44), s: c.score, p: c.playableInApp, prov: c.provider })) : null;
  } catch (e) { out.candidatesErr = String(e && e.message || e); }
  // card content shows what snapshot the panel used
  const card = document.querySelector('[data-echo-mv-mod] .lyrics-mv-card');
  out.cardText = card ? card.textContent.slice(0, 160) : null;
  // settings relevant to auto flow
  try { const s = await mv.getSettings(); out.auto = { autoSearch: s.autoSearch, autoPreload: s.autoPreload, threshold: s.autoApplyThreshold, enabled: s.enabled, providers: s.enabledProviders }; } catch {}
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
