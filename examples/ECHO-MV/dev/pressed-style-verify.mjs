const CDP_PORT = 9229;
const connect = async () => {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
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
  const evalJson = async (expr) => {
    const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
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
await new Promise((r) => setTimeout(r, 900));
await evalJson(`document.querySelector('.transport-mv-button')?.click()`);
await new Promise((r) => setTimeout(r, 800));
if (await evalJson(`!document.querySelector('.echo-mv-sheet')`)) {
  await evalJson(`document.querySelector('.transport-mv-button')?.click()`);
  await new Promise((r) => setTimeout(r, 800));
}

const snap = await evalJson(`(() => {
  const chips = [...document.querySelectorAll('.echo-mv-quality-item')].map((n) => {
    const cs = getComputedStyle(n);
    return { pressed: n.getAttribute('aria-pressed'), bg: cs.backgroundColor, color: cs.color, text: n.textContent.trim().slice(0, 18) };
  });
  const toggles = [...document.querySelectorAll('.echo-mv-sheet .mv-source-toggle')].slice(0, 6).map((n) => {
    const track = n.querySelector('.mv-switch-track');
    return {
      pressed: n.getAttribute('aria-pressed'),
      track: track ? getComputedStyle(track).backgroundColor : null,
      text: (n.innerText || '').replace(/\\s+/g, ' ').slice(0, 24),
    };
  });
  return { chips: chips.slice(0, 8), toggles };
})()`);
console.log(JSON.stringify(snap, null, 2));
const onChip = (snap.chips || []).find((item) => item.pressed === 'true');
const offChip = (snap.chips || []).find((item) => item.pressed === 'false');
const onToggle = (snap.toggles || []).find((item) => item.pressed === 'true');
const ok = Boolean(onChip && offChip && onChip.bg !== offChip.bg && onToggle && onToggle.pressed === 'true');
console.log('ok', ok, { onChip, offChip, onToggle });
ws.close();
process.exit(ok ? 0 : 2);
