// Dev-only: trusted click on an in-drawer switch after scrolling it into view.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 20000); });
const evalJson = async (expr) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
  return (r.result && 'value' in r.result) ? r.result.value : { exception: r.exceptionDetails?.text };
};
const click = async (pos) => {
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 80));
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
};
await call('Runtime.enable');

await evalJson(`document.querySelector('.transport-mv-button')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
await new Promise((r) => setTimeout(r, 900));

await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle')?.scrollIntoView({ block: 'center' })`);
await new Promise((r) => setTimeout(r, 400));

const before = await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle')?.getAttribute('aria-pressed') ?? 'missing'`);
const pos = await evalJson(`(() => { const n = document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle'); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), visible: r.y >= 0 && r.y < innerHeight }; })()`);
console.log('toggle pos:', JSON.stringify(pos));
if (pos && typeof pos.x === 'number') {
  await click(pos);
  await new Promise((r) => setTimeout(r, 700));
  const after = await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle')?.getAttribute('aria-pressed') ?? 'missing'`);
  console.log('toggle before/after:', JSON.stringify({ before, after }));
  if (after !== before) { await click(pos); await new Promise((r) => setTimeout(r, 400)); }
}

// close via Escape for good measure
await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await new Promise((r) => setTimeout(r, 1000));
console.log('drawer after Escape:', JSON.stringify(await evalJson(`document.querySelector('.mv-settings-drawer-root') ? (document.querySelector('.mv-settings-drawer-root').dataset.open ?? 'no-flag') : 'removed'`)));

try { ws.close(); } catch {}
process.exit(0);
