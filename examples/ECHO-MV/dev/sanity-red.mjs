// Dev-only: sanity check the CDP screenshot pipeline with a fixed red box.
import { writeFileSync } from 'node:fs';
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 25000); });
const evalJson = async (expr, awaitPromise = false) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  return (r.result && 'value' in r.result) ? r.result.value : { exception: r.exceptionDetails?.text || r.exceptionDetails?.exception?.description };
};
await call('Runtime.enable');

console.log('inject:', JSON.stringify(await evalJson(`(() => {
  const box = document.createElement('div');
  box.id = 'mv-sanity-red';
  box.style.cssText = 'position:fixed;top:80px;left:80px;width:220px;height:220px;background:#ff2020;z-index:2147483647;pointer-events:none;';
  document.body.append(box);
  return 'ok';
})()`)));
await new Promise((r) => setTimeout(r, 700));
const shot1 = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/sanity-surface.png', Buffer.from(shot1.data, 'base64'));
let shot2ok = false;
try {
  const shot2 = await call('Page.captureScreenshot', { format: 'png', fromSurface: false });
  writeFileSync('examples/ECHO-MV/dev/sanity-renderer.png', Buffer.from(shot2.data, 'base64'));
  shot2ok = true;
} catch (e) { console.log('fromSurface:false failed:', String(e).slice(0, 120)); }
await evalJson(`document.getElementById('mv-sanity-red')?.remove()`);
console.log('saved sanity-surface.png' + (shot2ok ? ' and sanity-renderer.png' : ''));

try { ws.close(); } catch {}
process.exit(0);
