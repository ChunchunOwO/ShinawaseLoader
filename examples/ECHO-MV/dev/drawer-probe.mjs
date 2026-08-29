// Dev-only: diagnose why the MV settings drawer ignores mouse input.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p(m.result?.result?.value ?? m.result?.exceptionDetails?.text); } });
const call = (expr) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); });

// open the drawer
await call(`document.querySelector('.transport-mv-button')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
await new Promise((r) => setTimeout(r, 800));

console.log(JSON.stringify(await call(`(() => {
  const root = document.querySelector('.mv-settings-drawer-root');
  if (!root) return { error: 'no drawer root' };
  const scrim = root.querySelector('.audio-drawer-scrim');
  const aside = root.querySelector('.audio-drawer');
  const scroll = root.querySelector('.audio-drawer-scroll');
  const info = (node) => {
    if (!node) return null;
    const cs = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      pointerEvents: cs.pointerEvents,
      zIndex: cs.zIndex,
      position: cs.position,
      opacity: cs.opacity,
      visibility: cs.visibility,
      display: cs.display,
      appRegion: cs.webkitAppRegion ?? cs.appRegion ?? 'n/a',
      transform: cs.transform.slice(0, 60),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      inert: node.hasAttribute('inert'),
      ariaHidden: node.getAttribute('aria-hidden'),
    };
  };
  const asideRect = aside?.getBoundingClientRect();
  const cx = asideRect ? Math.round(asideRect.x + asideRect.width / 2) : 0;
  const cy = asideRect ? Math.round(asideRect.y + Math.min(120, asideRect.height / 2)) : 0;
  const stack = asideRect ? document.elementsFromPoint(cx, cy).slice(0, 6).map((n) => n.tagName.toLowerCase() + '.' + String(n.className).split(' ').slice(0, 2).join('.')) : [];
  const scrollable = scroll ? { scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight, overflowY: getComputedStyle(scroll).overflowY } : null;
  return {
    open: root.dataset.open,
    root: info(root),
    scrim: info(scrim),
    aside: info(aside),
    scroll: scrollable,
    probePoint: { cx, cy },
    stackAtAsideCenter: stack,
  };
})()`, null, 2)));

try { ws.close(); } catch {}
process.exit(0);
