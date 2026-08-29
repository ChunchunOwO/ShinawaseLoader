// Dev-only: verify MV button click path + settings drawer entries (no reload).
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

const evalJson = async (expr) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.value ?? { exception: r.exceptionDetails?.text };
};

const snap = async (label) => {
  console.log(label, JSON.stringify(await evalJson(`(() => {
    const b = document.querySelector('.transport-mv-button');
    const drawerRoot = document.querySelector('.mv-settings-drawer-root');
    return {
      mod: !!window.__echoMvModActive,
      btn: !!b,
      pressed: b?.getAttribute('aria-pressed') ?? null,
      session: sessionStorage.getItem('echo:lyrics:view-mode'),
      viewMode: document.querySelector('.lyrics-page')?.dataset.viewMode ?? null,
      settingsEntry: !!document.querySelector('.lyrics-mv-settings-entry'),
      drawerOpen: drawerRoot?.dataset.open ?? null,
      drawerVisible: drawerRoot ? (drawerRoot.checkVisibility ? drawerRoot.checkVisibility() : false) : false,
    };
  })()`)));
};

await snap('v0 initial:');

// 1) real click -> should enter MV mode
await evalJson(`document.querySelector('.transport-mv-button').click()`);
await new Promise((r) => setTimeout(r, 1500));
await snap('v1 after real MV click:');

// 2) settings entry click -> drawer opens
console.log('entry click:', JSON.stringify(await evalJson(`(() => { const b = document.querySelector('.lyrics-mv-settings-entry'); if (!b) return 'no entry'; b.click(); return 'clicked'; })()`)));
await new Promise((r) => setTimeout(r, 900));
await snap('v2 after entry click:');

// 3) Escape closes drawer
await evalJson(`(window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), 'esc')`);
await new Promise((r) => setTimeout(r, 900));
await snap('v3 after Escape:');

// 4) real click again -> back to lyrics mode
await evalJson(`document.querySelector('.transport-mv-button').click()`);
await new Promise((r) => setTimeout(r, 1200));
await snap('v4 after second MV click:');

// 5) right-click on MV button -> drawer opens even outside MV mode
console.log('contextmenu:', JSON.stringify(await evalJson(`(() => {
  const b = document.querySelector('.transport-mv-button');
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  b.dispatchEvent(ev);
  return { defaultPrevented: ev.defaultPrevented };
})()`)));
await new Promise((r) => setTimeout(r, 900));
await snap('v5 after right-click:');

// 6) close via scrim to restore state
await evalJson(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scrim')?.click()`);
await new Promise((r) => setTimeout(r, 700));
await snap('v6 after scrim close:');

try { ws.close(); } catch {}
process.exit(0);
