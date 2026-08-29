// Dev-only: run a snapshot search exactly like the mod would for the current track.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 60000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const out = {};
  const a = await window.echo.audio.getStatus();
  const mv = window.__echoShinawaseStreaming.mv;
  const snap = {
    trackId: a.currentTrackId,
    title: a.currentTrackTitle,
    artist: a.currentTrackArtist,
    durationSeconds: a.durationSeconds,
    coverThumb: a.currentTrackCoverUrl || null,
    mediaType: 'streaming',
    autoSelect: true,
  };
  out.snapshot = { ...snap, coverThumb: snap.coverThumb ? '(set)' : null };
  try {
    const cands = await mv.searchNetworkCandidatesForSnapshot(snap);
    out.count = Array.isArray(cands) ? cands.length : 'na';
    out.top = (cands || []).slice(0, 4).map((c) => ({ t: (c.title || '').slice(0, 46), s: c.score, p: c.playableInApp, prov: c.provider }));
  } catch (e) { out.searchErr = String(e && e.message || e); }
  try {
    const sel = await mv.getSelected(a.currentTrackId);
    out.selected = sel ? { title: (sel.title || '').slice(0, 46), score: sel.score, playable: sel.playableInApp, mediaUrl: (sel.mediaUrl || '').slice(0, 60), origin: sel.selectionOrigin, quality: sel.qualityLabel } : null;
  } catch (e) { out.selErr = String(e && e.message || e); }
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
