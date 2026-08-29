// Dev-only: bisect the invisible-MV problem. Paint the bg container red,
// screenshot, and enumerate lyrics-page children paint properties.
import { writeFileSync } from 'node:fs';
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

// paint container red
console.log('red on:', JSON.stringify(await evalJson(`(() => {
  const bg = document.querySelector('.lyrics-mv-background');
  if (!bg) return 'no bg';
  bg.style.setProperty('background', '#ff2020', 'important');
  return 'ok';
})()`)));
await new Promise((r) => setTimeout(r, 700));
const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-red.png', Buffer.from(shot.data, 'base64'));
await evalJson(`document.querySelector('.lyrics-mv-background')?.style.removeProperty('background')`);
console.log('red screenshot saved');

// enumerate lyrics-page children (paint-relevant properties, DOM order)
console.log(JSON.stringify(await evalJson(`(() => {
  const page = document.querySelector('.lyrics-page');
  if (!page) return { error: 'no page' };
  const info = [];
  for (const child of page.children) {
    const cs = getComputedStyle(child);
    const rect = child.getBoundingClientRect();
    const opaqueMedia = child.querySelector('img, canvas, video');
    info.push({
      cls: String(child.className).split(' ').slice(0, 3).join(' ').slice(0, 56),
      z: cs.zIndex, pos: cs.position, op: cs.opacity, disp: cs.display, vis: cs.visibility,
      bgC: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : null,
      bgI: cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0, 44) : null,
      blend: cs.mixBlendMode !== 'normal' ? cs.mixBlendMode : null,
      bf: cs.backdropFilter && cs.backdropFilter !== 'none' ? cs.backdropFilter.slice(0, 40) : null,
      contain: cs.contain !== 'none' ? cs.contain : null,
      cv: cs.contentVisibility && cs.contentVisibility !== 'visible' ? cs.contentVisibility : null,
      clip: cs.clipPath !== 'none' ? cs.clipPath.slice(0, 40) : null,
      size: Math.round(rect.width) + 'x' + Math.round(rect.height),
      media: opaqueMedia ? (opaqueMedia.tagName.toLowerCase() + ':' + Math.round(opaqueMedia.getBoundingClientRect().width) + 'x' + Math.round(opaqueMedia.getBoundingClientRect().height) + ' op:' + getComputedStyle(opaqueMedia).opacity) : null,
    });
  }
  const pageCs = getComputedStyle(page);
  return { pageBg: pageCs.backgroundColor, pageBgImage: pageCs.backgroundImage.slice(0, 60), pageIsolation: pageCs.isolation, children: info };
})()`), null, 2));

try { ws.close(); } catch {}
process.exit(0);
