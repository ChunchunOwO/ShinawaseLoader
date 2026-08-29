import { readFileSync } from 'node:fs';

const CDP_PORT = 9229;
const cssText = readFileSync('C:/Users/RR/Desktop/Codex-Projects/ECHO-ModLoader/examples/ECHO-MV/echomod/mv.css', 'utf8');
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
const evalJson = async (expr) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
  return (r.result && 'value' in r.result) ? r.result.value : r;
};
await call('Runtime.enable');
await evalJson(`(() => {
  let style = document.getElementById('echo-mv-mod-css');
  if (!style) {
    style = document.createElement('style');
    style.id = 'echo-mv-mod-css';
    document.head.append(style);
  }
  style.textContent = ${JSON.stringify(cssText)};
  return true;
})()`);
if (!await evalJson(`!!document.querySelector('.echo-mv-sheet')`)) {
  await evalJson(`document.querySelector('.transport-mv-button')?.click()`);
  await new Promise((r) => setTimeout(r, 700));
}
const snap = await evalJson(`(() => {
  const rows = [...document.querySelectorAll('.echo-mv-sheet .mv-source-toggle')].slice(0, 8).map((n) => {
    const track = n.querySelector('.mv-switch-track');
    return { pressed: n.getAttribute('aria-pressed'), track: track ? getComputedStyle(track).backgroundColor : null };
  });
  const on = rows.find((r) => r.pressed === 'true');
  const off = rows.find((r) => r.pressed === 'false');
  return { different: Boolean(on && off && on.track !== off.track), on, off };
})()`);
console.log(JSON.stringify(snap, null, 2));
ws.close();
process.exit(snap.different ? 0 : 2);
