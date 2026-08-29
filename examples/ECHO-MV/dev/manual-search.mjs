// Dev-only: manual network search via the drawer UI, watching results/errors.
import { writeFileSync } from 'node:fs';
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

const click = await evalJson(`(() => {
  const btn = [...document.querySelectorAll('.mv-settings-drawer-root .mv-settings-actions button')][0];
  if (!btn) return 'missing';
  if (btn.disabled) return 'disabled';
  btn.click();
  return 'clicked';
})()`);
console.log('network search click:', JSON.stringify(click));

let last = '';
for (let s = 0; s < 35; s += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  const snap = await evalJson(`(() => {
    const root = document.querySelector('.mv-settings-drawer-root');
    if (!root) return { drawer: 'closed' };
    const buttons = [...root.querySelectorAll('.mv-settings-actions button')].map((b) => (b.disabled ? '0' : '1')).join('');
    const cands = [...root.querySelectorAll('.mv-settings-candidate')].map((c) => (c.title || c.textContent).slice(0, 40));
    return {
      buttons,
      candidates: cands.length,
      first3: cands.slice(0, 3),
      error: root.querySelector('.audio-drawer-error')?.textContent?.slice(0, 140) ?? null,
      selected: root.querySelector('.mv-selected-card')?.textContent?.slice(0, 60) ?? null,
    };
  })()`);
  const key = JSON.stringify(snap);
  if (key !== last) { console.log(`t+${s}s`, key); last = key; }
  if (snap.candidates > 0 || snap.error) break;
}

const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-search.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot: examples/ECHO-MV/dev/mv-search.png');

try { ws.close(); } catch {}
process.exit(0);
