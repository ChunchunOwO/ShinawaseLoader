// Dev-only: test the renderer-side RPC path and inspect drawer busy state.
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

// 1) renderer -> loader RPC fetch
console.log('renderer rpc:', JSON.stringify(await evalJson(`(async () => {
  const started = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout-8s'), 8000);
    const resp = await fetch('http://127.0.0.1:17862/api/native/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'main.invoke', packageId: 'echo.mv', payload: { method: 'mv.status', payload: {} } }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await resp.json();
    return { ms: Math.round(performance.now() - started), status: resp.status, backendOk: body?.result?.ok === true };
  } catch (error) {
    return { ms: Math.round(performance.now() - started), error: String(error).slice(0, 220) };
  }
})()`, true)));

// 2) drawer button disabled breakdown
console.log('buttons:', JSON.stringify(await evalJson(`(() => {
  const root = document.querySelector('.mv-settings-drawer-root');
  if (!root) return 'drawer closed';
  return [...root.querySelectorAll('.mv-settings-actions button')].map((b) => ({ text: b.textContent.trim().slice(0, 14), disabled: b.disabled }));
})()`)));

// 3) master toggle + meter
console.log('master:', JSON.stringify(await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-master-toggle')?.getAttribute('aria-pressed') ?? 'drawer closed'`)));

try { ws.close(); } catch {}
process.exit(0);
