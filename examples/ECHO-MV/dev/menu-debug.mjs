// Dev-only: reproduce "MV button doesn't open the MV settings menu".
// Checks mod state, transport button, settings entry, then tries openDrawer via the app event.
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

const snap = async (label) => {
  const r = await call('Runtime.evaluate', { expression: `(() => {
    const page = document.querySelector('.lyrics-page');
    const pageVisible = page ? (page.checkVisibility ? page.checkVisibility() : page.getBoundingClientRect().width > 0) : false;
    const drawerRoot = document.querySelector('.mv-settings-drawer-root');
    return {
      modActive: !!window.__echoMvModActive,
      btn: !!document.querySelector('.transport-mv-button'),
      btnPressed: document.querySelector('.transport-mv-button')?.getAttribute('aria-pressed') ?? null,
      pageExists: !!page,
      pageVisible,
      pageViewMode: page ? (page.dataset.viewMode || 'unset') : null,
      session: (() => { try { return sessionStorage.getItem('echo:lyrics:view-mode'); } catch { return null; } })(),
      settingsEntry: !!document.querySelector('.lyrics-mv-settings-entry'),
      drawerRoot: !!drawerRoot,
      drawerOpen: drawerRoot ? drawerRoot.dataset.open : null,
      drawerVisible: drawerRoot ? (drawerRoot.checkVisibility ? drawerRoot.checkVisibility() : false) : false,
    };
  })()`, returnByValue: true });
  console.log(label, JSON.stringify(r.result?.value ?? r.exceptionDetails));
};

await snap('t0 initial:');

// 1) click the MV transport button like a user (real click)
await call('Runtime.evaluate', { expression: `document.querySelector('.transport-mv-button')?.click()`, returnByValue: true });
await new Promise((r) => setTimeout(r, 1200));
await snap('t1 after MV button click:');

// 2) click the settings entry if present
const r2 = await call('Runtime.evaluate', { expression: `(() => { const b = document.querySelector('.lyrics-mv-settings-entry'); if (!b) return 'no entry'; b.click(); return 'clicked'; })()`, returnByValue: true });
console.log('t2 settings entry click:', JSON.stringify(r2.result?.value));
await new Promise((r) => setTimeout(r, 900));
await snap('t3 after settings entry click:');

// 3) if still nothing, dispatch the app event directly
const r3 = await call('Runtime.evaluate', { expression: `(window.dispatchEvent(new CustomEvent('app:open-mv-settings')), 'dispatched')`, returnByValue: true });
console.log('t4 event dispatch:', JSON.stringify(r3.result?.value));
await new Promise((r) => setTimeout(r, 900));
await snap('t5 after app:open-mv-settings:');

try { ws.close(); } catch {}
process.exit(0);
