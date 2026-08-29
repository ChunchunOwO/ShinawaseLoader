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

const raw = await call('Runtime.evaluate', {
  expression: `(() => {
    try {
      const items = [...document.querySelectorAll('.echo-mv-quality-item')];
      const chip = items.find((n) => n.textContent.includes('720p') && n.textContent.includes('\\u6700\\u9ad8'));
      const before = chip ? chip.getAttribute('aria-pressed') : 'missing';
      if (chip) chip.click();
      return { count: items.length, before, after: chip ? chip.getAttribute('aria-pressed') : 'missing' };
    } catch (error) {
      return { error: String(error && error.message || error) };
    }
  })()`,
  returnByValue: true,
});
console.log('raw', JSON.stringify(raw, null, 2));
const quality = (raw.result && 'value' in raw.result) ? raw.result.value : raw;
await new Promise((r) => setTimeout(r, 400));
const qualityAfter = await evalJson(`(() => {
  const chip = [...document.querySelectorAll('.echo-mv-quality-item')].find((n) => n.textContent.includes('720p') && n.textContent.includes('最高'));
  return chip?.getAttribute('aria-pressed');
})()`);

const sw = await evalJson(`(() => {
  const btn = document.querySelector('.mv-auto-apply-toggle, .mv-source-toggle.mv-auto-apply-toggle, button.mv-source-toggle');
  const before = btn?.getAttribute('aria-pressed');
  const text = (btn?.innerText || '').replace(/\\s+/g, ' ').slice(0, 40);
  btn?.click();
  return { cls: btn?.className, text, before, after: btn?.getAttribute('aria-pressed') };
})()`);
await new Promise((r) => setTimeout(r, 400));
const swAfter = await evalJson(`document.querySelector('.mv-auto-apply-toggle, button.mv-source-toggle')?.getAttribute('aria-pressed')`);

const hide = await evalJson(`(() => {
  const btn = [...document.querySelectorAll('.echo-mv-icon-btn')][0];
  btn?.click();
  return document.querySelector('.echo-mv-root')?.dataset.collapsed;
})()`);

console.log(JSON.stringify({ quality, qualityAfter, sw, swAfter, hide }, null, 2));
ws.close();
