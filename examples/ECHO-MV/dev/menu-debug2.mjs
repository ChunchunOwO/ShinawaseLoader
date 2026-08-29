// Dev-only: compare real click vs onclick() on the MV button within one session,
// then click the settings entry and inspect the drawer.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const pages = list.filter((t) => t.type === 'page');
console.log('page targets:', pages.map((p) => p.url));
const target = pages.find((t) => /index\.html/i.test(t.url || ''));
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
    const btns = Array.from(document.querySelectorAll('.transport-mv-button'));
    const drawerRoot = document.querySelector('.mv-settings-drawer-root');
    return {
      btnCount: btns.length,
      pressed: btns.map((b) => b.getAttribute('aria-pressed')),
      connected: btns.map((b) => b.isConnected),
      session: sessionStorage.getItem('echo:lyrics:view-mode'),
      viewMode: document.querySelector('.lyrics-page')?.dataset.viewMode ?? null,
      settingsEntry: !!document.querySelector('.lyrics-mv-settings-entry'),
      drawerOpen: drawerRoot?.dataset.open ?? null,
    };
  })()`)));
};

await snap('s0:');

// real click on the same element
console.log('real click:', JSON.stringify(await evalJson(`(() => {
  const b = document.querySelector('.transport-mv-button');
  if (!b) return 'no button';
  const events = [];
  const mark = (type) => (e) => events.push(type + ':defaultPrevented=' + e.defaultPrevented);
  b.addEventListener('click', mark('listener-click'), { once: true });
  b.click();
  return { events, hasOnclick: typeof b.onclick };
})()`)));
await new Promise((r) => setTimeout(r, 800));
await snap('s1 after real click:');

// settings entry click if present
console.log('entry:', JSON.stringify(await evalJson(`(() => {
  const b = document.querySelector('.lyrics-mv-settings-entry');
  if (!b) return 'no entry';
  b.click();
  return 'clicked';
})()`)));
await new Promise((r) => setTimeout(r, 900));
await snap('s2 after entry click:');

try { ws.close(); } catch {}
process.exit(0);
