const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) throw new Error('no ECHO page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
});
const call = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 30000);
});
const evalJson = async (expr, awaitPromise = false) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  return (r.result && 'value' in r.result) ? r.result.value : { exception: r.exceptionDetails?.text || r.exceptionDetails?.exception?.description };
};
await call('Runtime.enable');
await call('Page.enable');
await call('Page.reload', { ignoreCache: true });
ws.close();
await new Promise((r) => setTimeout(r, 8000));

const list2 = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target2 = list2.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const ws2 = new WebSocket(target2.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws2.addEventListener('open', res, { once: true }); ws2.addEventListener('error', rej, { once: true }); });
const pending2 = new Map();
let seq2 = 0;
ws2.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending2.has(m.id)) {
    const p = pending2.get(m.id);
    pending2.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
});
const call2 = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq2;
  pending2.set(id, { res, rej });
  ws2.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending2.has(id)) { pending2.delete(id); rej(new Error('timeout')); } }, 30000);
});
const eval2 = async (expr, awaitPromise = false) => {
  const r = await call2('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  return (r.result && 'value' in r.result) ? r.result.value : { exception: r.exceptionDetails?.text || r.exceptionDetails?.exception?.description };
};
await call2('Runtime.enable');
for (let i = 0; i < 20; i += 1) {
  if (await eval2('Boolean(window.__echoMvModActive)') === true) break;
  await new Promise((r) => setTimeout(r, 400));
}
await eval2(`(() => {
  if (!document.querySelector('.lyrics-page')) document.querySelector('.transport-lyrics-button')?.click();
  return true;
})()`);
await new Promise((r) => setTimeout(r, 1000));
await eval2(`document.querySelector('.transport-mv-button')?.click()`);
await new Promise((r) => setTimeout(r, 800));
if (await eval2(`!document.querySelector('.echo-mv-sheet')`)) {
  await eval2(`document.querySelector('.transport-mv-button')?.click()`);
  await new Promise((r) => setTimeout(r, 800));
}
await eval2(`document.querySelector('.echo-mv-sheet .mv-settings-actions button')?.click()`);
await new Promise((r) => setTimeout(r, 4000));
const layout = await eval2(`(() => {
  const items = [...document.querySelectorAll('.echo-mv-candidate')].map((n) => {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    return { y: Math.round(r.y), h: Math.round(r.height), display: cs.display, position: cs.position, flex: cs.flex };
  });
  let overlap = 0;
  for (let i = 1; i < items.length; i += 1) {
    if (items[i].y < items[i - 1].y + items[i - 1].h - 2) overlap += 1;
  }
  return { count: items.length, overlap, items: items.slice(0, 8) };
})()`);
console.log(JSON.stringify(layout, null, 2));
ws2.close();
process.exit(layout && layout.count > 1 && layout.overlap === 0 ? 0 : 2);
