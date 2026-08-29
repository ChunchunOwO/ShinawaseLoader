const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
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
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 20000);
});
const evalJson = async (expr, awaitPromise = false) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  return (r.result && 'value' in r.result) ? r.result.value : { exception: r.exceptionDetails?.text || r.exceptionDetails?.exception?.description };
};
await call('Runtime.enable');
console.log(JSON.stringify(await evalJson(`(() => {
  const sheet = document.querySelector('.echo-mv-sheet');
  const buttons = [...(sheet?.querySelectorAll('button') || [])].map((n) => ({
    cls: n.className,
    disabled: n.disabled,
    text: (n.innerText || '').replace(/\\s+/g, ' ').slice(0, 40),
  }));
  const cands = [...document.querySelectorAll('.echo-mv-candidate')].map((n) => ({
    title: n.querySelector('strong')?.textContent,
    badges: [...n.querySelectorAll('small')].map((s) => s.textContent),
  }));
  return {
    sheet: !!sheet,
    open: document.querySelector('.echo-mv-root')?.dataset.open,
    buttonCount: buttons.length,
    buttons: buttons.slice(0, 20),
    selected: document.querySelector('.mv-selected-card strong')?.textContent,
    candidates: cands.slice(0, 8),
    toggles: buttons.filter((b) => /toggle|source/.test(b.cls)).length,
  };
})()`, false), null, 2));
ws.close();
