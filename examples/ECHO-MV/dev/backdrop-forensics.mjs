// Dev-only: inspect inline styles + full computed backgrounds of the backdrop
// stack, and check whether the mod CSS rules are present and winning.
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
  const page = document.querySelector('.lyrics-page');
  const backdrop = page?.querySelector('.lyrics-backdrop');
  if (!backdrop) return { error: 'no backdrop' };
  const report = (node) => {
    const cs = getComputedStyle(node);
    return {
      cls: String(node.className).slice(0, 48),
      inlineStyle: (node.getAttribute('style') || '').slice(0, 400),
      computedBgImage: cs.backgroundImage.slice(0, 400),
      computedBgColor: cs.backgroundColor,
      opacity: cs.opacity,
    };
  };
  const kids = [...backdrop.children].map(report);
  // pseudo elements of backdrop
  const before = getComputedStyle(backdrop, '::before');
  const after = getComputedStyle(backdrop, '::after');
  // is our mod css present?
  const styles = [...document.querySelectorAll('style')];
  const oursIdx = styles.findIndex((s) => s.textContent.includes('.lyrics-page:has(.lyrics-mv-background) .lyrics-backdrop'));
  const matches = page ? page.matches('.lyrics-page:has(.lyrics-mv-background)') : false;
  return {
    backdrop: report(backdrop),
    backdropBefore: { bg: before.backgroundImage.slice(0, 120), bgC: before.backgroundColor, op: before.opacity, content: before.content },
    backdropAfter: { bg: after.backgroundImage.slice(0, 120), bgC: after.backgroundColor, op: after.opacity, content: after.content },
    children: kids,
    modCssPresent: oursIdx >= 0,
    modCssIndex: oursIdx,
    totalStyleTags: styles.length,
    hasSelectorMatches: matches,
  };
})()`), null, 2));

try { ws.close(); } catch {}
process.exit(0);
