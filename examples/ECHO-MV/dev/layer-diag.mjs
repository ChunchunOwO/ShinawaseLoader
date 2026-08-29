// Dev-only: find which layer hides the MV background video.
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
  const bg = document.querySelector('.lyrics-mv-background');
  const video = document.querySelector('.lyrics-mv-background-video');
  const page = document.querySelector('.lyrics-page');
  const out = { bgExists: !!bg, videoExists: !!video };
  if (video) {
    const cs = getComputedStyle(video);
    const r = video.getBoundingClientRect();
    out.video = {
      ready: video.readyState, paused: video.paused, t: Math.round(video.currentTime * 10) / 10,
      w: video.videoWidth, h: video.videoHeight,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      css: { opacity: cs.opacity, visibility: cs.visibility, display: cs.display, zIndex: cs.zIndex },
    };
  }
  if (bg) {
    const cs = getComputedStyle(bg);
    const r = bg.getBoundingClientRect();
    out.bg = {
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      css: { opacity: cs.opacity, visibility: cs.visibility, display: cs.display, zIndex: cs.zIndex, position: cs.position },
      parent: bg.parentElement ? bg.parentElement.tagName.toLowerCase() + '.' + String(bg.parentElement.className).split(' ').slice(0, 2).join('.') : null,
      prevSibling: bg.previousElementSibling ? String(bg.previousElementSibling.className).slice(0, 40) : null,
      nextSibling: bg.nextElementSibling ? String(bg.nextElementSibling.className).slice(0, 40) : null,
    };
  }
  // what paints at the center of the page (top 10 in stack)?
  const cx = Math.round(innerWidth / 2), cy = Math.round(innerHeight / 2);
  out.stack = document.elementsFromPoint(cx, cy).slice(0, 10).map((n) => {
    const cs = getComputedStyle(n);
    return n.tagName.toLowerCase() + '.' + String(n.className?.baseVal ?? n.className).split(' ').slice(0, 2).join('.') + ' [z:' + cs.zIndex + ' op:' + cs.opacity + ' bg:' + (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? 'yes' : 'no') + ']';
  });
  // page backdrop layers
  out.backdropLayers = [...document.querySelectorAll('.lyrics-page .lyrics-backdrop, .lyrics-page .lyrics-backdrop-atmosphere, .lyrics-page [class*="backdrop"]')].slice(0, 6).map((n) => {
    const cs = getComputedStyle(n);
    return { cls: String(n.className).slice(0, 50), z: cs.zIndex, opacity: cs.opacity, bgColor: cs.backgroundColor, bgImage: cs.backgroundImage.slice(0, 60) };
  });
  out.pageDataset = page ? { viewMode: page.dataset.viewMode, background: page.dataset.background } : null;
  return out;
})()`), null, 2));

try { ws.close(); } catch {}
process.exit(0);
