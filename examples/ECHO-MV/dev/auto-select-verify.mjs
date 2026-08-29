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
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 40000);
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
for (let i = 0; i < 25; i += 1) {
  if (await evalJson('Boolean(window.__echoMvModActive && window.echo?.mv?.setSettings)') === true) break;
  await new Promise((r) => setTimeout(r, 400));
}
console.log('enable', JSON.stringify(await evalJson(`(async () => {
  const next = await window.echo.mv.setSettings({ enabled: true, autoSearch: true });
  return { enabled: next?.enabled, autoSearch: next?.autoSearch };
})()`, true)));
await evalJson(`(() => { if (!document.querySelector('.lyrics-page')) document.querySelector('.transport-lyrics-button')?.click(); return true; })()`);
await new Promise((r) => setTimeout(r, 1000));
await evalJson(`document.querySelector('.transport-mv-button')?.click()`);
await new Promise((r) => setTimeout(r, 900));
if (await evalJson(`!document.querySelector('.echo-mv-sheet')`)) {
  await evalJson(`document.querySelector('.transport-mv-button')?.click()`);
  await new Promise((r) => setTimeout(r, 900));
}

const before = await evalJson(`({
  enable: document.querySelector('.echo-mv-enable input')?.checked ?? null,
  searchDisabled: document.querySelector('.mv-settings-actions button')?.disabled ?? null,
  selected: document.querySelector('.echo-mv-current strong')?.textContent ?? null,
})`);
console.log('before search', JSON.stringify(before));

await evalJson(`document.querySelector('.mv-settings-actions button')?.click()`);
let after = null;
for (let i = 0; i < 20; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  after = await evalJson(`({
    busy: document.querySelector('.mv-settings-actions button')?.disabled ?? null,
    candidates: document.querySelectorAll('.echo-mv-candidate').length,
    selected: document.querySelector('.mv-selected-card strong')?.textContent ?? null,
    enable: document.querySelector('.echo-mv-enable input')?.checked ?? null,
  })`);
  if (after.candidates > 0 && after.busy === false) break;
}
console.log('after search', JSON.stringify(after));

const toggle = await evalJson(`(() => {
  const btn = document.querySelector('.mv-current-song-toggle');
  const beforePressed = btn?.getAttribute('aria-pressed') ?? null;
  btn?.click();
  return { beforePressed, afterPressed: document.querySelector('.mv-current-song-toggle')?.getAttribute('aria-pressed') ?? null };
})()`);
await new Promise((r) => setTimeout(r, 300));
const toggleAfter = await evalJson(`document.querySelector('.mv-current-song-toggle')?.getAttribute('aria-pressed') ?? null`);
console.log('toggle', JSON.stringify({ ...toggle, settled: toggleAfter }));

ws.close();
const ok = after && after.busy === false && after.enable === true && toggleAfter && toggleAfter !== toggle.beforePressed;
process.exit(ok ? 0 : 2);
