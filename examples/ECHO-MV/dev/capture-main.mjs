// Dev-only: capture the main window via webContents.capturePage (works occluded).
const CDP_PORT = 9230;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list[0];
if (!target) { console.error('no main-process inspector target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 40000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.getAllWindows().find((w) => /renderer\\/index\\.html/.test(w.webContents.getURL()));
  if (!win) return { err: 'no main window' };
  const img = await win.webContents.capturePage();
  return { png: img.toPNG().toString('base64') };
})()`, returnByValue: true, awaitPromise: true, includeCommandLineAPI: true });
const v = r.result?.value;
if (!v || v.err || !v.png) { console.error('capture failed:', JSON.stringify(v || r.exceptionDetails).slice(0, 300)); process.exit(1); }
const { writeFileSync } = await import('node:fs');
const out = `examples/ECHO-MV/dev/mv-visual-${Date.now()}.png`;
writeFileSync(out, Buffer.from(v.png, 'base64'));
console.log('screenshot:', out);
try { ws.close(); } catch {}
process.exit(0);
