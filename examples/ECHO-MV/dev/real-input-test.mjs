// Dev-only: reproduce the dead drawer with trusted CDP input events and count
// how often the drawer DOM gets rebuilt.
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
  return r.result?.value ?? { exception: r.exceptionDetails?.text };
};
await call('Runtime.enable');

// ensure drawer open
await evalJson(`document.querySelector('.transport-mv-button')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
await new Promise((r) => setTimeout(r, 900));

// 1) count drawer rebuilds over 3 seconds
console.log('rebuild count (3s):', JSON.stringify(await (async () => {
  await evalJson(`(() => {
    window.__mvRebuilds = 0;
    const root = document.querySelector('.mv-settings-drawer-root');
    if (!root) return 'no root';
    window.__mvObs?.disconnect?.();
    window.__mvObs = new MutationObserver((muts) => { for (const m of muts) if (m.type === 'childList' && m.target === root) window.__mvRebuilds += 1; });
    window.__mvObs.observe(root, { childList: true });
    return 'armed';
  })()`);
  await new Promise((r) => setTimeout(r, 3000));
  return evalJson(`(window.__mvObs?.disconnect?.(), window.__mvRebuilds)`);
})()));

// 2) trusted wheel scroll over the drawer
const wheelResult = await (async () => {
  const rect = await evalJson(`(() => { const a = document.querySelector('.mv-settings-drawer-root .audio-drawer'); if (!a) return null; const r = a.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  if (!rect) return 'no aside';
  const before = await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scroll')?.scrollTop ?? null`);
  for (let i = 0; i < 4; i += 1) {
    await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: rect.x, y: rect.y, deltaX: 0, deltaY: 240 });
    await new Promise((r) => setTimeout(r, 120));
  }
  await new Promise((r) => setTimeout(r, 400));
  const after = await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scroll')?.scrollTop ?? null`);
  return { before, after };
})();
console.log('wheel scroll:', JSON.stringify(wheelResult));

// 3) trusted click on the network search button (first action button)
const clickResult = await (async () => {
  const pos = await evalJson(`(() => { const b = document.querySelector('.mv-settings-drawer-root .audio-drawer-close'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  if (!pos) return 'no close button';
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 90));
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 800));
  const open = await evalJson(`document.querySelector('.mv-settings-drawer-root')?.dataset.open ?? 'gone'`);
  return { clickedCloseButton: true, drawerOpenAfter: open };
})();
console.log('trusted click close:', JSON.stringify(clickResult));

try { ws.close(); } catch {}
process.exit(0);
