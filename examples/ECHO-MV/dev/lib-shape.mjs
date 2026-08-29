// Dev-only: inspect library track shape and try playback invocations.
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

console.log(JSON.stringify(await evalJson(`(async () => {
  try {
    let res = null;
    try { res = await window.echo.library.getTracks({ limit: 3 }); } catch (e1) {
      try { res = await window.echo.library.getTracks(); } catch (e2) { return { err: String(e1).slice(0, 100) + ' | ' + String(e2).slice(0, 100) }; }
    }
    const arr = Array.isArray(res) ? res : (res?.tracks || res?.items || res?.rows || []);
    return {
      resultKeys: Array.isArray(res) ? 'array:' + res.length : Object.keys(res || {}).slice(0, 12),
      count: arr.length,
      first: arr[0] ? Object.fromEntries(Object.entries(arr[0]).slice(0, 18).map(([k, v]) => [k, String(v).slice(0, 50)])) : null,
    };
  } catch (e) { return { err: String(e).slice(0, 160) }; }
})()`, true), null, 2));

try { ws.close(); } catch {}
process.exit(0);
