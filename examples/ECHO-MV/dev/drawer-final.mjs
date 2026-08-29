// Dev-only: final end-to-end check of the MV settings drawer after fixes.
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

// wait for the reinjected mod (aria fix marker: a switch carrying aria-pressed="true" or "false")
let ready = false;
for (let i = 0; i < 24; i += 1) {
  await evalJson(`document.querySelector('.transport-mv-button')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
  await new Promise((r) => setTimeout(r, 1000));
  const probe = await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle')?.getAttribute('aria-pressed') ?? 'none'`);
  if (probe === 'true' || probe === 'false') { ready = true; console.log('mod reinjected, aria-pressed =', probe); break; }
  await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scrim')?.click()`);
  await new Promise((r) => setTimeout(r, 4000));
}
if (!ready) { console.log('mod not reinjected yet'); process.exit(2); }

// stability: zero rebuilds over 3s
await evalJson(`(() => { window.__mvRebuilds = 0; const root = document.querySelector('.mv-settings-drawer-root'); window.__mvObs?.disconnect?.(); window.__mvObs = new MutationObserver((muts) => { for (const m of muts) if (m.type === 'childList' && m.target === root) window.__mvRebuilds += 1; }); window.__mvObs.observe(root, { childList: true }); return 'armed'; })()`);
await new Promise((r) => setTimeout(r, 3000));
console.log('rebuilds in 3s:', JSON.stringify(await evalJson(`(window.__mvObs?.disconnect?.(), window.__mvRebuilds)`)));

// trusted wheel scroll down and back up
const asidePos = await evalJson(`(() => { const n = document.querySelector('.mv-settings-drawer-root .audio-drawer'); const r = n.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
for (let i = 0; i < 3; i += 1) { await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: asidePos.x, y: asidePos.y, deltaX: 0, deltaY: 300 }); await new Promise((r) => setTimeout(r, 100)); }
await new Promise((r) => setTimeout(r, 250));
const scrolled = await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scroll')?.scrollTop`);
console.log('wheel scroll down ->', JSON.stringify(scrolled));

// trusted click master toggle (top of drawer, flip + restore) with literal aria values
await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scroll').scrollTop = 0`);
await new Promise((r) => setTimeout(r, 250));
const masterBefore = await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-master-toggle')?.getAttribute('aria-pressed') ?? 'missing'`);
const masterPos = await evalJson(`(() => { const n = document.querySelector('.mv-settings-drawer-root .mv-master-toggle'); if (!n) return null; const r = n.getBoundingClientRect(); return (r.width > 0 && r.y >= 0 && r.y < innerHeight) ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null; })()`);
if (masterPos && typeof masterPos.x === 'number') {
  await click(masterPos);
  await new Promise((r) => setTimeout(r, 900));
  const masterAfter = await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-master-toggle')?.getAttribute('aria-pressed') ?? 'missing'`);
  console.log('master toggle before/after:', JSON.stringify({ before: masterBefore, after: masterAfter }));
  if (masterAfter !== masterBefore) {
    await click(masterPos);
    await new Promise((r) => setTimeout(r, 900));
    console.log('master restored to:', JSON.stringify(await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-master-toggle')?.getAttribute('aria-pressed')`)));
  }
} else {
  console.log('master toggle not in view:', JSON.stringify(masterPos), JSON.stringify(masterBefore));
}

// Escape closes
await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await new Promise((r) => setTimeout(r, 1000));
console.log('drawer closed via Escape:', JSON.stringify(await evalJson(`!document.querySelector('.mv-settings-drawer-root')`)));
console.log('settings entry gone:', JSON.stringify(await evalJson(`!document.querySelector('.lyrics-mv-settings-entry')`)));

try { ws.close(); } catch {}
process.exit(0);
