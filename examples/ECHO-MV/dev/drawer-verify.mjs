// Dev-only: verify drawer stability + trusted-input interactions after the fix.
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
const centerOf = async (selector) => evalJson(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
const click = async (pos) => {
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 80));
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
};
await call('Runtime.enable');

console.log('mod state:', JSON.stringify(await evalJson(`({ mod: !!window.__echoMvModActive, entryGone: !document.querySelector('.lyrics-mv-settings-entry') })`)));

// open drawer via right-click on MV button
await evalJson(`document.querySelector('.transport-mv-button')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
await new Promise((r) => setTimeout(r, 900));

// 1) rebuild count over 3s (should be ~0)
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
console.log('rebuilds in 3s:', JSON.stringify(await evalJson(`(window.__mvObs?.disconnect?.(), window.__mvRebuilds)`)));

// 2) trusted wheel scroll
const asidePos = await centerOf('.mv-settings-drawer-root .audio-drawer');
for (let i = 0; i < 4; i += 1) {
  await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: asidePos.x, y: asidePos.y, deltaX: 0, deltaY: 240 });
  await new Promise((r) => setTimeout(r, 120));
}
await new Promise((r) => setTimeout(r, 300));
console.log('scrollTop after wheel:', JSON.stringify(await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scroll')?.scrollTop ?? null`)));

// 3) trusted click on a settings toggle (auto preload switch) and observe aria-pressed flip
const toggleBefore = await evalJson(`(() => { const rows = document.querySelectorAll('.mv-settings-drawer-root .mv-auto-apply-toggle'); const n = rows[1] || rows[0]; if (!n) return null; n.scrollIntoView({ block: 'center' }); return n.getAttribute('aria-pressed'); })()`);
await new Promise((r) => setTimeout(r, 300));
const togglePos = await evalJson(`(() => { const rows = document.querySelectorAll('.mv-settings-drawer-root .mv-auto-apply-toggle'); const n = rows[1] || rows[0]; if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
if (togglePos) {
  await click(togglePos);
  await new Promise((r) => setTimeout(r, 700));
  const toggleAfter = await evalJson(`(() => { const rows = document.querySelectorAll('.mv-settings-drawer-root .mv-auto-apply-toggle'); const n = rows[1] || rows[0]; return n?.getAttribute('aria-pressed') ?? null; })()`);
  console.log('toggle pressed before/after:', JSON.stringify({ before: toggleBefore, after: toggleAfter }));
  // flip it back
  await click(togglePos);
  await new Promise((r) => setTimeout(r, 500));
} else {
  console.log('toggle not found');
}

// 4) trusted click close button
const closePos = await centerOf('.mv-settings-drawer-root .audio-drawer-close');
await click(closePos);
await new Promise((r) => setTimeout(r, 900));
console.log('drawer after close click:', JSON.stringify(await evalJson(`document.querySelector('.mv-settings-drawer-root')?.dataset.open ?? 'removed'`)));

try { ws.close(); } catch {}
process.exit(0);
