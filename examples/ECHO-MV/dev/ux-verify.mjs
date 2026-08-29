// Dev-only: verify redesigned UX — click MV button toggles the settings
// drawer; master switch toggles the MV view on the lyrics page.
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
const trustedClick = async (pos) => {
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 80));
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
};
await call('Runtime.enable');

// wait for the new build: synthetic click on MV button should open the drawer
let injected = false;
for (let i = 0; i < 30; i += 1) {
  const r = await evalJson(`(() => {
    const btn = document.querySelector('.transport-mv-button');
    if (!btn || typeof btn.onclick !== 'function') return 'no-btn';
    btn.onclick();
    return 'clicked';
  })()`);
  if (r === 'clicked') {
    await new Promise((res) => setTimeout(res, 700));
    const drawer = await evalJson(`!!document.querySelector('.mv-settings-drawer-root')`);
    if (drawer) { injected = true; break; }
  }
  await new Promise((res) => setTimeout(res, 4000));
}
console.log('new build active (click opened drawer):', injected);
if (!injected) process.exit(2);

// close it again via second click (toggle behavior)
await evalJson(`document.querySelector('.transport-mv-button').onclick()`);
await new Promise((r) => setTimeout(r, 900));
console.log('second click closed drawer:', JSON.stringify(await evalJson(`!document.querySelector('.mv-settings-drawer-root')`)));

// button visibility + trusted click if visible
const btnPos = await evalJson(`(() => { const n = document.querySelector('.transport-mv-button'); if (!n) return null; const r = n.getBoundingClientRect(); const vis = typeof n.checkVisibility === 'function' ? n.checkVisibility() : (r.width > 0); return vis ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : { hidden: true }; })()`);
console.log('transport button pos:', JSON.stringify(btnPos));
if (btnPos && typeof btnPos.x === 'number') {
  await trustedClick(btnPos);
  await new Promise((r) => setTimeout(r, 900));
  console.log('trusted click opened drawer:', JSON.stringify(await evalJson(`!!document.querySelector('.mv-settings-drawer-root[data-open="true"]')`)));
  console.log('button aria-pressed:', JSON.stringify(await evalJson(`document.querySelector('.transport-mv-button')?.getAttribute('aria-pressed')`)));
} else {
  // no visible transport (likely no track playing) — open via synthetic path
  await evalJson(`document.querySelector('.transport-mv-button').onclick()`);
  await new Promise((r) => setTimeout(r, 900));
  console.log('drawer open (synthetic):', JSON.stringify(await evalJson(`!!document.querySelector('.mv-settings-drawer-root[data-open="true"]')`)));
}

// master switch OFF -> MV panel torn down; ON -> panel returns
const masterState = await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-master-toggle')?.getAttribute('aria-pressed')`);
console.log('master before:', JSON.stringify(masterState));
await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-master-toggle')?.click()`);
await new Promise((r) => setTimeout(r, 1200));
console.log('after toggle #1:', JSON.stringify(await evalJson(`(() => ({
  master: document.querySelector('.mv-settings-drawer-root .mv-master-toggle')?.getAttribute('aria-pressed'),
  ownedPanel: !!document.querySelector('section.lyrics-mv-panel[data-echo-mv-mod="true"]'),
  pageViewMode: document.querySelector('.lyrics-page')?.dataset.viewMode ?? null,
}))()`)));
await evalJson(`document.querySelector('.mv-settings-drawer-root .mv-master-toggle')?.click()`);
await new Promise((r) => setTimeout(r, 1200));
console.log('after toggle #2 (restored):', JSON.stringify(await evalJson(`(() => ({
  master: document.querySelector('.mv-settings-drawer-root .mv-master-toggle')?.getAttribute('aria-pressed'),
  pageViewMode: document.querySelector('.lyrics-page')?.dataset.viewMode ?? null,
}))()`)));

// close drawer
await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scrim')?.click()`);
await new Promise((r) => setTimeout(r, 900));
console.log('closed at end:', JSON.stringify(await evalJson(`!document.querySelector('.mv-settings-drawer-root')`)));

try { ws.close(); } catch {}
process.exit(0);
