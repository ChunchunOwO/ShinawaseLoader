// Dev-only: diagnose why window.echo.mv is not wired despite bridge + proxy present.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 20000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(() => {
  const info = {};
  info.patched = window.__echoShinawaseEchoPatched === true;
  const s = window.__echoShinawaseStreaming;
  info.streamObjType = typeof s;
  info.streamFrozen = s ? Object.isFrozen(s) : null;
  info.streamExtensible = s ? Object.isExtensible(s) : null;
  info.streamMvType = typeof s?.mv;
  info.streamMvGetSettings = typeof s?.mv?.getSettings;
  info.streamKeys = s ? Object.keys(s) : [];
  info.echoMv = window.echo?.mv === null ? 'null' : typeof window.echo?.mv;
  info.echoStreaming = window.echo?.streaming === null ? 'null' : typeof window.echo?.streaming;
  info.echoAccounts = window.echo?.accounts === null ? 'null' : typeof window.echo?.accounts;
  const d = Object.getOwnPropertyDescriptor(window.echo, 'mv');
  info.echoMvDescriptor = d ? { hasValue: 'value' in d, valueType: d.value===null?'null':typeof d.value, hasGet: !!d.get, configurable: d.configurable, writable: d.writable } : 'none';
  try {
    const base = window.echo;
    const test = new Proxy(base, { get(t,p){ const v=Reflect.get(t,p); if(p==='mv' && (v===null||v===undefined) && s && s.mv) return s.mv; return v; }});
    info.testProxyMvGetSettings = typeof test.mv?.getSettings;
    info.testProxyStreaming = test.streaming === null ? 'null' : typeof test.streaming;
    info.testProxyAccounts = test.accounts === null ? 'null' : typeof test.accounts;
  } catch(e) { info.testErr = String(e); }
  try { info.canAssign = (() => { try { window.echo.__mvProbe = 1; const ok = window.echo.__mvProbe === 1; try { delete window.echo.__mvProbe; } catch {} return ok; } catch { return false; } })(); } catch(e){ info.canAssign = 'err:'+String(e); }
  return info;
})()`, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
