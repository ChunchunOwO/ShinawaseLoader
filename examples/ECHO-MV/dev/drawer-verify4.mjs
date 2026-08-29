// Dev-only: inspect drawer content integrity + aria-pressed semantics after toggle clicks.
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

// capture window errors
await evalJson(`(() => { window.__mvErrs = []; window.addEventListener('error', (e) => window.__mvErrs.push(String(e.message))); return 'armed'; })()`);

await evalJson(`document.querySelector('.transport-mv-button')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
await new Promise((r) => setTimeout(r, 900));

const state1 = await evalJson(`(() => {
  const root = document.querySelector('.mv-settings-drawer-root');
  const toggle = root?.querySelector('.mv-current-song-toggle');
  return { rootChildren: root?.childElementCount ?? -1, toggleExists: !!toggle, pressed: toggle?.getAttribute('aria-pressed'), pressedType: toggle ? typeof toggle.getAttribute('aria-pressed') : 'n/a' };
})()`);
console.log('initial:', JSON.stringify(state1));

await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle')?.scrollIntoView({ block: 'center' })`);
await new Promise((r) => setTimeout(r, 300));
const pos = await evalJson(`(() => { const n = document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle'); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
await click(pos);
await new Promise((r) => setTimeout(r, 800));

const state2 = await evalJson(`(() => {
  const root = document.querySelector('.mv-settings-drawer-root');
  const toggle = root?.querySelector('.mv-current-song-toggle');
  const searchInput = root?.querySelector('.mv-search-input input');
  return { rootChildren: root?.childElementCount ?? -1, toggleExists: !!toggle, pressed: toggle?.getAttribute('aria-pressed'), searchValue: searchInput?.value ?? null, errs: window.__mvErrs };
})()`);
console.log('after toggle click:', JSON.stringify(state2));

// restore original off state if it flipped on
if (state2.pressed === 'true') {
  const pos2 = await evalJson(`(() => { const n = document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle'); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  await new Promise((r) => setTimeout(r, 200));
  if (pos2) { await click(pos2); await new Promise((r) => setTimeout(r, 500)); }
  console.log('restored:', JSON.stringify(await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-current-song-toggle')?.getAttribute('aria-pressed')`)));
}

// close
await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scrim')?.click()`);
await new Promise((r) => setTimeout(r, 900));
console.log('closed:', JSON.stringify(await evalJson(`!document.querySelector('.mv-settings-drawer-root')`)));

try { ws.close(); } catch {}
process.exit(0);
