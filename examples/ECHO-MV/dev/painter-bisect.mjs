// Dev-only: find which element paints the purple area by toggling layers.
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
const shotTo = async (name) => {
  const s = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync('examples/ECHO-MV/dev/' + name, Buffer.from(s.data, 'base64'));
};

// step 1: hide ALL backdrop layers
console.log('hide backdrops:', JSON.stringify(await evalJson(`(() => {
  const els = document.querySelectorAll('.lyrics-backdrop, .lyrics-music-reactive-layer');
  els.forEach((n) => n.style.setProperty('display', 'none', 'important'));
  return els.length + ' hidden';
})()`)));
await new Promise((r) => setTimeout(r, 600));
await shotTo('bisect-no-backdrop.png');

// step 2: also paint lyrics-mv-background red again (still hidden backdrops)
await evalJson(`document.querySelector('.lyrics-mv-background')?.style.setProperty('background', '#ff2020', 'important')`);
await new Promise((r) => setTimeout(r, 600));
await shotTo('bisect-red-no-backdrop.png');

// restore
console.log('restore:', JSON.stringify(await evalJson(`(() => {
  document.querySelectorAll('.lyrics-backdrop, .lyrics-music-reactive-layer').forEach((n) => n.style.removeProperty('display'));
  document.querySelector('.lyrics-mv-background')?.style.removeProperty('background');
  return 'ok';
})()`)));
console.log('saved bisect-no-backdrop.png, bisect-red-no-backdrop.png');

try { ws.close(); } catch {}
process.exit(0);
