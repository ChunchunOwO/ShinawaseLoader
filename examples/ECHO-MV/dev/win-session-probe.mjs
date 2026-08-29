// Dev-only: per-window session check — full URL, isProtocolHandled, and a
// session.fetch through THAT window's session to see which handler answers.
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
  const { BrowserWindow, session } = require('electron');
  const out = [];
  for (const win of BrowserWindow.getAllWindows()) {
    const ses = win.webContents.session;
    const entry = {
      id: win.id,
      url: win.webContents.getURL(),
      sameAsDefault: ses === session.defaultSession,
      handledMv: ses.protocol.isProtocolHandled('echo-mv'),
    };
    try {
      const res = await ses.fetch('echo-mv://stream/win-probe-' + win.id + '/v');
      entry.sesFetch = { status: res.status, ct: res.headers.get('content-type') };
    } catch (e) { entry.sesFetch = { err: String(e && e.message || e) }; }
    out.push(entry);
  }
  return out;
})()`, returnByValue: true, awaitPromise: true, includeCommandLineAPI: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
