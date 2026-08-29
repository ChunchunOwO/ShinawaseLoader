// Dev-only: check why Escape doesn't close the MV settings drawer.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p(m.result?.result?.value); } });
const call = (expr) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); });

console.log('open drawer via right-click:', JSON.stringify(await call(`(() => {
  const b = document.querySelector('.transport-mv-button');
  b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  return 'ok';
})()`)));
await new Promise((r) => setTimeout(r, 700));

console.log('arm probe:', JSON.stringify(await call(`(() => {
  window.__escSeen = 0;
  window.addEventListener('keydown', () => { window.__escSeen += 1; }, true);
  return 'armed';
})()`)));

console.log('dispatch Escape:', JSON.stringify(await call(`(window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })), 'sent')`)));
await new Promise((r) => setTimeout(r, 800));

console.log('result:', JSON.stringify(await call(`({
  escSeen: window.__escSeen,
  drawerOpen: document.querySelector('.mv-settings-drawer-root')?.dataset.open ?? null,
  lyricsVisible: (() => { const p = document.querySelector('.lyrics-page'); return p ? (p.checkVisibility ? p.checkVisibility() : true) : false; })(),
  viewMode: document.querySelector('.lyrics-page')?.dataset.viewMode ?? null,
})`)));

// cleanup: close drawer via scrim if still open
await call(`document.querySelector('.mv-settings-drawer-root .audio-drawer-scrim')?.click()`);
try { ws.close(); } catch {}
process.exit(0);
