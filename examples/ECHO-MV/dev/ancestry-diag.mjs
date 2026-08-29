// Dev-only: count lyrics pages and walk the video's ancestor chain for any
// paint-killing property (opacity/visibility/display/filter/mask/clip/etc).
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 25000); });
const evalJson = async (expr, awaitPromise = false) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  return (r.result && 'value' in r.result) ? r.result.value : { exception: r.exceptionDetails?.text || r.exceptionDetails?.exception?.description };
};
await call('Runtime.enable');

console.log(JSON.stringify(await evalJson(`(() => {
  const pages = [...document.querySelectorAll('.lyrics-page')];
  const video = document.querySelector('.lyrics-mv-background-video');
  const videoPage = video?.closest('.lyrics-page') ?? null;
  const centerEl = document.elementsFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2)).find((n) => n.classList?.contains('lyrics-scroll'));
  const visiblePage = centerEl?.closest('.lyrics-page') ?? null;
  const chain = [];
  let node = video;
  while (node && node !== document.documentElement) {
    const cs = getComputedStyle(node);
    const entry = {
      el: node.tagName.toLowerCase() + (node.className ? '.' + String(node.className).split(' ').slice(0, 2).join('.') : ''),
    };
    const bad = {};
    if (cs.opacity !== '1') bad.opacity = cs.opacity;
    if (cs.visibility !== 'visible') bad.visibility = cs.visibility;
    if (cs.display === 'none') bad.display = cs.display;
    if (cs.filter !== 'none') bad.filter = cs.filter.slice(0, 80);
    if (cs.backdropFilter && cs.backdropFilter !== 'none') bad.backdropFilter = cs.backdropFilter.slice(0, 60);
    if (cs.maskImage && cs.maskImage !== 'none') bad.mask = cs.maskImage.slice(0, 60);
    if (cs.clipPath !== 'none') bad.clipPath = cs.clipPath.slice(0, 60);
    if (cs.clip !== 'auto') bad.clip = cs.clip;
    if (cs.contentVisibility && cs.contentVisibility !== 'visible') bad.contentVisibility = cs.contentVisibility;
    if (cs.transform !== 'none') bad.transform = cs.transform.slice(0, 60);
    if (cs.perspective !== 'none') bad.perspective = cs.perspective;
    if (cs.mixBlendMode !== 'normal') bad.blend = cs.mixBlendMode;
    if (cs.isolation !== 'auto') bad.isolation = cs.isolation;
    if (cs.contain !== 'none') bad.contain = cs.contain;
    if (cs.overflow !== 'visible') bad.overflow = cs.overflow;
    if (Object.keys(bad).length) entry.props = bad;
    const rect = node.getBoundingClientRect();
    entry.rect = Math.round(rect.x) + ',' + Math.round(rect.y) + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height);
    chain.push(entry);
    node = node.parentElement;
  }
  return {
    pageCount: pages.length,
    videoInPageIndex: videoPage ? pages.indexOf(videoPage) : -1,
    visiblePageIndex: visiblePage ? pages.indexOf(visiblePage) : -1,
    samePage: videoPage === visiblePage,
    chain,
  };
})()`), null, 2));

try { ws.close(); } catch {}
process.exit(0);
