// Dev-only: reload page, wait for mod re-injection, then verify the MV button
// click path and both MV settings drawer entries (panel button + right-click).
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 25000); });
await call('Runtime.enable');
await call('Page.enable');

const evalJson = async (expr) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.value ?? { exception: r.exceptionDetails?.text };
};

console.log('reloading page...');
await call('Page.reload', { ignoreCache: false });
await new Promise((r) => setTimeout(r, 4000));

// wait for mod re-injection
let ready = false;
for (let i = 0; i < 30; i += 1) {
  const v = await evalJson(`({ mod: !!window.__echoMvModActive, btn: !!document.querySelector('.transport-mv-button') })`).catch(() => null);
  if (v && v.mod && v.btn) { ready = true; break; }
  await new Promise((r) => setTimeout(r, 1000));
}
console.log('mod re-injected:', ready);
if (!ready) { try { ws.close(); } catch {}; process.exit(1); }

const snap = async (label) => {
  console.log(label, JSON.stringify(await evalJson(`(() => {
    const b = document.querySelector('.transport-mv-button');
    const drawerRoot = document.querySelector('.mv-settings-drawer-root');
    return {
      pressed: b?.getAttribute('aria-pressed') ?? null,
      session: sessionStorage.getItem('echo:lyrics:view-mode'),
      viewMode: document.querySelector('.lyrics-page')?.dataset.viewMode ?? null,
      settingsEntry: !!document.querySelector('.lyrics-mv-settings-entry'),
      drawerOpen: drawerRoot?.dataset.open ?? null,
      drawerVisible: drawerRoot ? (drawerRoot.checkVisibility ? drawerRoot.checkVisibility() : false) : false,
    };
  })()`)));
};

await snap('r0 after reload:');

// 1) real click -> should enter MV mode
await evalJson(`document.querySelector('.transport-mv-button').click()`);
await new Promise((r) => setTimeout(r, 1500));
await snap('r1 after real MV click:');

// 2) settings entry click -> drawer opens
console.log('entry click:', JSON.stringify(await evalJson(`(() => { const b = document.querySelector('.lyrics-mv-settings-entry'); if (!b) return 'no entry'; b.click(); return 'clicked'; })()`)));
await new Promise((r) => setTimeout(r, 900));
await snap('r2 after entry click:');

// 3) Escape closes drawer
await call('Runtime.evaluate', { expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`, returnByValue: true });
await new Promise((r) => setTimeout(r, 900));
await snap('r3 after Escape:');

// 4) real click again -> back to lyrics mode
await evalJson(`document.querySelector('.transport-mv-button').click()`);
await new Promise((r) => setTimeout(r, 1200));
await snap('r4 after second MV click:');

// 5) right-click on MV button -> drawer opens
console.log('contextmenu:', JSON.stringify(await evalJson(`(() => {
  const b = document.querySelector('.transport-mv-button');
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  b.dispatchEvent(ev);
  return { defaultPrevented: ev.defaultPrevented };
})()`)));
await new Promise((r) => setTimeout(r, 900));
await snap('r5 after right-click:');

try { ws.close(); } catch {}
process.exit(0);
