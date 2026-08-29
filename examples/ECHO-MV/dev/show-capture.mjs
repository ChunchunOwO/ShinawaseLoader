// Dev-only: bring the ECHO window to front, then capture via CDP (compositor path).
const mainList = await (await fetch('http://127.0.0.1:9230/json/list')).json();
const mainTarget = mainList[0];
const mws = new WebSocket(mainTarget.webSocketDebuggerUrl);
await new Promise((res, rej) => { mws.addEventListener('open', res, { once: true }); mws.addEventListener('error', rej, { once: true }); });
let mseq = 0; const mpend = new Map();
mws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && mpend.has(m.id)) { const p = mpend.get(m.id); mpend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const mcall = (method, params = {}) => new Promise((res, rej) => { const id = ++mseq; mpend.set(id, { res, rej }); mws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (mpend.has(id)) { mpend.delete(id); rej(new Error('timeout')); } }, 20000); });
await mcall('Runtime.enable');
await mcall('Runtime.evaluate', { expression: `(() => {
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.getAllWindows().find((w) => /renderer\\/index\\.html/.test(w.webContents.getURL()));
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  return true;
})()`, returnByValue: true, includeCommandLineAPI: true });
mws.close();
await new Promise((r) => setTimeout(r, 1200));

const list = await (await fetch('http://127.0.0.1:9229/json/list')).json();
const target = list.find((t) => t.type === 'page' && /renderer\/index\.html/i.test(t.url || ''));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pend.has(id)) { pend.delete(id); rej(new Error('timeout')); } }, 25000); });
await call('Runtime.enable');
await call('Runtime.evaluate', { expression: `(async () => { const v = document.querySelector('video.lyrics-mv-background-video'); if (v) { v.currentTime = 95; try { await v.play(); } catch {} } return true; })()`, awaitPromise: true, returnByValue: true });
await new Promise((r) => setTimeout(r, 1200));
const shot = await call('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
const out = `examples/ECHO-MV/dev/mv-visual-front-${Date.now()}.png`;
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('screenshot:', out);
try { ws.close(); } catch {}
process.exit(0);
