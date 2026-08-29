// Dev-only: find any playable library track and play it, then check MV state.
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

console.log('mod active:', JSON.stringify(await evalJson(`Boolean(window.__echoMvModActive)`)));
console.log('echo keys:', JSON.stringify(await evalJson(`Object.keys(window.echo || {}).filter((k) => window.echo[k]).slice(0, 30)`)));
console.log('library api:', JSON.stringify(await evalJson(`(() => {
  const lib = window.echo?.library;
  if (!lib) return null;
  return Object.keys(lib).slice(0, 25);
})()`)));
console.log('playback api:', JSON.stringify(await evalJson(`(() => {
  const pb = window.echo?.playback;
  if (!pb) return null;
  return Object.keys(pb).slice(0, 30);
})()`)));
console.log('queue api:', JSON.stringify(await evalJson(`(() => {
  const q = window.echo?.queue;
  if (!q) return null;
  return Object.keys(q).slice(0, 25);
})()`)));

try { ws.close(); } catch {}
process.exit(0);
