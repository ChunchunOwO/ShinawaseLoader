// Dev-only: detect fetch/media patching and service workers in the renderer.
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
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const out = {};
  out.fetchStr = String(window.fetch).slice(0, 120);
  out.fetchIsNative = /native code/.test(String(window.fetch));
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    out.mediaSrcDesc = desc ? { hasGet: !!desc.get, hasSet: !!desc.set, setStr: desc.set ? String(desc.set).slice(0, 120) : null } : 'inherited';
  } catch (e) { out.mediaSrcDesc = 'err:' + e.message; }
  try {
    const setAttr = Element.prototype.setAttribute;
    out.setAttributeNative = /native code/.test(String(setAttr));
  } catch {}
  try {
    out.swSupported = 'serviceWorker' in navigator;
    if (out.swSupported) {
      const regs = await navigator.serviceWorker.getRegistrations();
      out.swRegs = regs.map((r2) => ({ scope: r2.scope, active: !!r2.active, scriptURL: r2.active ? r2.active.scriptURL : null }));
      out.swController = navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null;
    }
  } catch (e) { out.swErr = String(e && e.message || e); }
  try {
    const XHR = window.XMLHttpRequest;
    out.xhrNative = /native code/.test(String(XHR));
  } catch {}
  out.loaderGlobals = Object.keys(window).filter((k) => /shinawase|echoShin|__echo/i.test(k)).slice(0, 30);
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
