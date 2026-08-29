// Dev-only: inspect which sessions exist and where echo-mv / echo-video /
// echo-image protocol handlers are registered (default session vs window session).
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
const r = await call('Runtime.evaluate', { expression: `(() => {
  const { BrowserWindow, session } = require('electron');
  const out = { windows: [], defaultSession: {} };
  const schemes = ['echo-mv', 'echo-video', 'echo-image'];
  const report = (ses) => {
    const entry = {};
    for (const s of schemes) {
      try { entry[s] = typeof ses.protocol.isProtocolHandled === 'function' ? ses.protocol.isProtocolHandled(s) : 'no-api'; } catch (e) { entry[s] = 'err:' + (e && e.message); }
    }
    return entry;
  };
  out.defaultSession = report(session.defaultSession);
  for (const win of BrowserWindow.getAllWindows()) {
    const ses = win.webContents.session;
    out.windows.push({
      id: win.id,
      url: (win.webContents.getURL() || '').slice(0, 80),
      partition: ses === session.defaultSession ? '<default>' : (ses.getStoragePath ? String(ses.getStoragePath() || '').split(/[\\\\/]/).slice(-2).join('/') : '<custom>'),
      sameAsDefault: ses === session.defaultSession,
      handled: report(ses),
    });
  }
  return out;
})()`, returnByValue: true, includeCommandLineAPI: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
