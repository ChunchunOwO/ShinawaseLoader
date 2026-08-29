const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) {
  console.log(JSON.stringify({ ok: false, error: 'no ECHO page', pages: list.map((t) => ({ type: t.type, url: (t.url || '').slice(0, 80) })) }, null, 2));
  process.exit(0);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && state.pending.has(m.id)) {
    const p = state.pending.get(m.id);
    state.pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
});
const call = (method, params = {}) => new Promise((res, rej) => {
  const id = ++state.id;
  state.pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error(`timeout ${method}`)); } }, 15000);
});
await call('Runtime.enable');
const r = await call('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const page = document.querySelector('.lyrics-page') || document.querySelector('[class*="lyrics"]');
    const summary = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r2 = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        id: el.id || '',
        cls: String(el.className || '').slice(0, 160),
        attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value.slice(0, 80)])),
        rect: [Math.round(r2.width), Math.round(r2.height)],
        pos: cs.position,
        overflow: cs.overflow,
        z: cs.zIndex,
        kids: [...el.children].slice(0, 16).map((c) => ({
          tag: c.tagName,
          cls: String(c.className || '').slice(0, 80),
          attrs: ['data-lyrics-page-style', 'data-view-mode', 'data-background', 'data-mv-enabled', 'data-echo-mv-mod']
            .reduce((acc, name) => { const v = c.getAttribute(name); if (v != null) acc[name] = v; return acc; }, {}),
        })),
      };
    };
    const hits = [...document.querySelectorAll('[class*="stage"], [class*="cinema"], [class*="lyrics"], [data-lyrics-page-style], [data-scene], .workshop-scene, .lyrics-scene')]
      .slice(0, 40)
      .map((el) => ({
        cls: String(el.className || '').slice(0, 100),
        style: el.getAttribute('data-lyrics-page-style'),
        view: el.getAttribute('data-view-mode'),
        scene: el.getAttribute('data-scene'),
      }));
    return {
      href: location.href.slice(-80),
      pageStyle: page?.getAttribute('data-lyrics-page-style') || null,
      viewMode: page?.getAttribute('data-view-mode') || null,
      background: page?.getAttribute('data-background') || null,
      page: summary(page),
      mvBg: summary(document.querySelector('.lyrics-mv-background')),
      mvPanel: summary(document.querySelector('section.lyrics-mv-panel')),
      hits,
    };
  })()`,
});
console.log(JSON.stringify(r.result?.value || r, null, 2));
ws.close();
