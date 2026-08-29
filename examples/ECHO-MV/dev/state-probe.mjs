// Dev-only: probe live app state (mod injected? button? lyrics page? flags?).
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.log('no page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p(m.result); } });
const call = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evalJson = async (expr) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
  return (r?.result && 'value' in r.result) ? r.result.value : { exception: r?.exceptionDetails?.text };
};

console.log(JSON.stringify(await evalJson(`(() => {
  const page = document.querySelector('.lyrics-page');
  const cs = page ? getComputedStyle(page) : null;
  return {
    modActive: !!window.__echoMvModActive,
    modsInstalled: Object.keys(window.__echoExternalMods || {}),
    transportMvBtn: !!document.querySelector('.transport-mv-button'),
    transportLyricsBtn: !!document.querySelector('button.transport-lyrics-button'),
    lyricsPage: !!page,
    lyricsPageVisible: page ? (typeof page.checkVisibility === 'function' ? page.checkVisibility() : true) : false,
    lyricsPageDataset: page ? { ...page.dataset } : null,
    lyricsScrollVisible: (() => { const s = document.querySelector('.lyrics-page .lyrics-scroll'); return s ? getComputedStyle(s).visibility : 'absent'; })(),
    mvPanel: !!document.querySelector('section.lyrics-mv-panel'),
    mvBackground: !!document.querySelector('.lyrics-mv-background'),
    drawer: !!document.querySelector('.mv-settings-drawer-root'),
    mvCss: !!document.getElementById('echo-mv-mod-css'),
    viewModeSession: sessionStorage.getItem('echo:lyrics:view-mode'),
    bodyLastChildren: [...document.body.children].slice(-4).map((n) => n.tagName.toLowerCase() + '.' + String(n.className).split(' ').slice(0, 2).join('.')),
  };
})()`, null, 2)));

try { ws.close(); } catch {}
process.exit(0);
