// Dev-only: from the MAIN process, fetch an echo-mv URL through the default
// session to see which handler answers, then check unhandle layering.
const CDP_PORT = 9230;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list[0];
if (!target) { console.error('no main-process inspector target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 30000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const { session } = require('electron');
  const out = {};
  out.hasProtoLogHook = typeof globalThis.__echoMvProtoLog === 'function';
  const ses = session.defaultSession;
  try {
    const res = await ses.fetch('echo-mv://stream/probe-video/probe-variant');
    out.sesFetch = { status: res.status, contentType: res.headers.get('content-type'), body: (await res.text()).slice(0, 200) };
  } catch (e) { out.sesFetch = { err: String(e && e.message || e) }; }
  // Count handler layers: unhandle repeatedly and see when isProtocolHandled flips.
  const layers = [];
  for (let i = 0; i < 3; i += 1) {
    const before = ses.protocol.isProtocolHandled('echo-mv');
    if (!before) { layers.push({ i, before, note: 'not handled, stop' }); break; }
    try { ses.protocol.unhandle('echo-mv'); } catch (e) { layers.push({ i, before, unhandleErr: String(e && e.message || e) }); break; }
    const after = ses.protocol.isProtocolHandled('echo-mv');
    layers.push({ i, before, after });
    if (!after) break;
  }
  out.layers = layers;
  out.finalHandled = ses.protocol.isProtocolHandled('echo-mv');
  return out;
})()`, returnByValue: true, awaitPromise: true, includeCommandLineAPI: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
