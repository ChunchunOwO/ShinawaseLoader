// Dev-only: manually apply the empty-target shell proxy and exercise the real
// backend through window.echo.mv, to prove the wiring end-to-end.
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
  const real = window.echo;
  const api = window.__echoShinawaseStreaming?.mv;
  out.hasApi = typeof api?.getSettings;
  if (!api) return out;
  try {
    const shell = new Proxy({}, {
      get(_t,p){ if(p==='mv') return api; return real[p]; },
      has(_t,p){ if(p==='mv') return true; try{return p in real}catch{return false} },
      set(_t,p,v){ try{real[p]=v}catch{} return true; },
      deleteProperty(_t,p){ try{delete real[p]}catch{} return true; },
      getOwnPropertyDescriptor(_t,p){ if(p==='mv') return {value:api,writable:true,enumerable:true,configurable:true}; let d; try{d=Object.getOwnPropertyDescriptor(real,p)}catch{} if(d)d.configurable=true; return d; },
      ownKeys(_t){ let k=[]; try{k=Reflect.ownKeys(real)}catch{} return k.includes('mv')?k:[...k,'mv']; },
    });
    window.echo = shell;
    out.assigned = window.echo === shell;
    out.echoMv = typeof window.echo.mv?.getSettings;
    out.streaming = typeof window.echo.streaming;
    out.playback = typeof window.echo.playback;
    out.library = typeof window.echo.library;
  } catch(e){ out.applyErr = String(e && e.stack || e); return out; }
  try { out.settings = await window.echo.mv.getSettings(); } catch(e){ out.settingsErr = String(e && e.message || e); }
  try {
    const c = await window.echo.mv.searchNetworkCandidatesForSnapshot({ trackId:'verify-1', title:'\u30a2\u30a4\u30c9\u30eb', artist:'YOASOBI', durationSeconds:214, mediaType:'streaming', autoSelect:false });
    out.searchCount = Array.isArray(c) ? c.length : 'not-array';
    out.searchTop = Array.isArray(c) ? c.slice(0,3).map(x=>({t:(x.title||'').slice(0,42), s:x.score, p:x.playableInApp, prov:x.provider})) : null;
  } catch(e){ out.searchErr = String(e && e.message || e); }
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
