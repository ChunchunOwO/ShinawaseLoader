const CDP_PORT = 9229;
const connect = async () => {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
  if (!target) throw new Error('no page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  const pending = new Map();
  let seq = 0;
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
  return { ws, call, evalJson };
};

let { ws, call, evalJson } = await connect();
await call('Page.enable');
await call('Page.reload', { ignoreCache: true });
ws.close();
await new Promise((r) => setTimeout(r, 8000));
({ ws, call, evalJson } = await connect());
for (let i = 0; i < 20; i += 1) {
  if (await evalJson('Boolean(window.__echoMvModActive)') === true) break;
  await new Promise((r) => setTimeout(r, 400));
}
await evalJson(`(() => { if (!document.querySelector('.lyrics-page')) document.querySelector('.transport-lyrics-button')?.click(); return true; })()`);
await new Promise((r) => setTimeout(r, 1000));
await evalJson(`document.querySelector('.transport-mv-button')?.click()`);
await new Promise((r) => setTimeout(r, 900));
if (await evalJson(`!document.querySelector('.echo-mv-sheet')`)) {
  await evalJson(`document.querySelector('.transport-mv-button')?.click()`);
  await new Promise((r) => setTimeout(r, 900));
}

const rebuilds = await evalJson(`(async () => {
  const root = document.querySelector('.echo-mv-root');
  if (!root) return { error: 'no-root' };
  let count = 0;
  const mo = new MutationObserver((records) => {
    if (records.some((item) => item.addedNodes.length || item.removedNodes.length)) count += 1;
  });
  mo.observe(root, { childList: true });
  await new Promise((r) => setTimeout(r, 2000));
  mo.disconnect();
  const input = document.querySelector('.echo-mv-enable input');
  const before = input?.checked ?? null;
  input?.click();
  await new Promise((r) => setTimeout(r, 400));
  const after = document.querySelector('.echo-mv-enable input')?.checked ?? null;
  return { rebuilds: count, before, after, toggled: before != null && after === !before, sheet: !!document.querySelector('.echo-mv-sheet') };
})()`, true);
console.log(JSON.stringify(rebuilds));
ws.close();
process.exit(rebuilds && rebuilds.rebuilds <= 2 && rebuilds.toggled && rebuilds.sheet ? 0 : 2);
