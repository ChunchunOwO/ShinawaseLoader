// Dev-only: watch the drawer busy lifecycle for 45s to find the stuck op.
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

await evalJson(`(() => {
  if (!document.querySelector('.mv-settings-drawer-root[data-open="true"]')) document.querySelector('.transport-mv-button')?.onclick?.();
  return 'ok';
})()`);
await new Promise((r) => setTimeout(r, 800));

let last = '';
for (let s = 0; s < 45; s += 1) {
  const snap = await evalJson(`(() => {
    const root = document.querySelector('.mv-settings-drawer-root');
    if (!root) return { drawer: 'closed' };
    const buttons = [...root.querySelectorAll('.mv-settings-actions button')].map((b) => (b.disabled ? '0' : '1')).join('');
    const master = root.querySelector('.mv-master-toggle')?.getAttribute('aria-pressed');
    const candidates = root.querySelectorAll('.mv-settings-candidate').length;
    const error = root.querySelector('.audio-drawer-error')?.textContent?.slice(0, 90) ?? null;
    const selected = root.querySelector('.mv-selected-card') ? root.querySelector('.mv-selected-card').textContent.slice(0, 50) : null;
    const searchBtn = root.querySelector('.mv-search-controls button[type="submit"]');
    return { buttons, master, candidates, error, selected, searchDisabled: searchBtn?.disabled ?? null };
  })()`);
  const key = JSON.stringify(snap);
  if (key !== last) {
    console.log(`t+${s}s`, key);
    last = key;
  }
  await new Promise((r) => setTimeout(r, 1000));
}

try { ws.close(); } catch {}
process.exit(0);
