// Dev-only: attach to ECHO MAIN process inspector (9230) and compare
// electron net.fetch vs Node fetch against Bilibili endpoints.
const CDP_PORT = 9230;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list[0];
if (!target) { console.error('no main-process inspector target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 40000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const out = {};
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const testUrl = 'https://api.bilibili.com/x/web-interface/nav';
  const searchUrl = 'https://api.bilibili.com/x/web-interface/wbi/search/type?search_type=video&keyword=' + encodeURIComponent('YOASOBI');
  let electronNet = null;
  try { electronNet = require('electron').net; } catch (e) { out.requireErr = String(e && e.message || e); }
  const probe = async (label, fetcher, url, headers) => {
    try {
      const res = await fetcher(url, { headers });
      const text = await res.text();
      return { status: res.status, code: (() => { try { return JSON.parse(text).code; } catch { return 'nojson'; } })(), body: text.slice(0, 160) };
    } catch (e) { return { err: String(e && e.message || e) }; }
  };
  const headers = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' };
  if (electronNet) {
    out.electron_nav = await probe('nav', electronNet.fetch.bind(electronNet), testUrl, headers);
    out.electron_search = await probe('search', electronNet.fetch.bind(electronNet), searchUrl, headers);
  }
  out.node_nav = await probe('nav', globalThis.fetch, testUrl, headers);
  out.node_search = await probe('search', globalThis.fetch, searchUrl, headers);
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
