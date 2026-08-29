// Dev-only: trusted-input click checks for the MV settings drawer.
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

// ensure drawer open (right-click MV button)
const opened = await evalJson(`(() => {
  if (document.querySelector('.mv-settings-drawer-root[data-open="true"]')) return 'already';
  document.querySelector('.transport-mv-button')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  return 'opened';
})()`);
console.log('drawer:', JSON.stringify(opened));
await new Promise((r) => setTimeout(r, 900));

// scroll back to top first so the current-song toggle is in view
await evalJson(`(() => { const s = document.querySelector('.mv-settings-drawer-root .audio-drawer-scroll'); if (s) s.scrollTop = 0; return 'top'; })()`);
await new Promise((r) => setTimeout(r, 300));

// 1) trusted click on the always-present "use current song" switch
const before = await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle')?.getAttribute('aria-pressed') ?? null`);
const pos = await evalJson(`(() => { const n = document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle'); if (!n) return null; const r = n.getBoundingClientRect(); return (r.width > 0 && r.y > 0 && r.y < innerHeight) ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null; })()`);
if (pos && typeof pos.x === 'number') {
  await click(pos);
  await new Promise((r) => setTimeout(r, 700));
  const after = await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle')?.getAttribute('aria-pressed') ?? null`);
  console.log('current-song toggle before/after:', JSON.stringify({ before, after }));
  await click(pos); // restore
  await new Promise((r) => setTimeout(r, 500));
} else {
  console.log('toggle not clickable:', JSON.stringify(pos));
}

// 2) trusted click on close button
const closePos = await evalJson(`(() => { const n = document.querySelector('.mv-settings-drawer-root .audio-drawer-close'); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
if (closePos && typeof closePos.x === 'number') {
  await click(closePos);
  await new Promise((r) => setTimeout(r, 1000));
  console.log('drawer after close click:', JSON.stringify(await evalJson(`document.querySelector('.mv-settings-drawer-root') ? (document.querySelector('.mv-settings-drawer-root').dataset.open ?? 'no-flag') : 'removed'`)));
} else {
  console.log('close button not found');
}

try { ws.close(); } catch {}
process.exit(0);
