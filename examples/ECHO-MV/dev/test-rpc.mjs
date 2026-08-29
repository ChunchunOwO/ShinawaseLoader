// Dev-only: exercise the real MV backend through the mod's own mvApi
// (the same reference the UI uses: external.main.invoke -> native host).
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 45000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const mv = window.__echoShinawaseStreaming?.mv;
  const out = { hasMv: typeof mv, getSettings: typeof mv?.getSettings };
  if (!mv) return out;
  try { out.settings = await mv.getSettings(); } catch (e) { out.settingsErr = String(e && e.message || e); }
  try {
    const c = await mv.searchNetworkCandidatesForSnapshot({ trackId: 'rpc-1', title: '\u30a2\u30a4\u30c9\u30eb', artist: 'YOASOBI', durationSeconds: 214, mediaType: 'streaming', autoSelect: false });
    out.count = Array.isArray(c) ? c.length : 'na';
    out.top = Array.isArray(c) ? c.slice(0, 3).map((x) => ({ t: (x.title || '').slice(0, 40), s: x.score, p: x.playableInApp, prov: x.provider, q: (x.availableQualities || []).length })) : null;
    out.firstId = Array.isArray(c) && c[0] ? c[0].id : null;
  } catch (e) { out.searchErr = String(e && e.message || e); }
  try {
    const tmp = await mv.getTemporaryPlayableForSnapshot({ trackId: 'rpc-1', title: '\u30a2\u30a4\u30c9\u30eb', artist: 'YOASOBI', durationSeconds: 214, mediaType: 'streaming', autoSelect: true });
    out.temporary = tmp ? { provider: tmp.provider, playable: tmp.playableInApp, mediaUrl: (tmp.mediaUrl || '').slice(0, 60), quality: tmp.qualityLabel } : null;
  } catch (e) { out.tmpErr = String(e && e.message || e); }
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
