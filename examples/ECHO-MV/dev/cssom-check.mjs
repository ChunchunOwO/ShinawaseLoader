// Dev-only: inspect parsed CSSOM rules for the backdrop selector.
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
  const found = [];
  const sheets = [...document.styleSheets];
  sheets.forEach((sheet, sheetIdx) => {
    let rules;
    try { rules = sheet.cssRules; } catch { return; }
    for (const rule of rules) {
      if (rule.selectorText && rule.selectorText.includes(':has(.lyrics-mv-background)') && rule.selectorText.includes('lyrics-backdrop')) {
        found.push({
          sheetIdx,
          ownerTag: sheet.ownerNode ? sheet.ownerNode.tagName + (sheet.ownerNode.id ? '#' + sheet.ownerNode.id : '') : null,
          disabled: sheet.disabled,
          selector: rule.selectorText.slice(0, 110),
          cssText: rule.style ? rule.style.cssText.slice(0, 160) : null,
          bgPriority: rule.style ? rule.style.getPropertyPriority('background-color') : null,
        });
      }
    }
  });
  const bd = document.querySelector('.lyrics-backdrop');
  return {
    totalSheets: sheets.length,
    matches: found,
    computedNow: bd ? getComputedStyle(bd).backgroundImage.slice(0, 60) : null,
    pageStillHasBg: !!document.querySelector('.lyrics-page .lyrics-mv-background'),
  };
})()`), null, 2));

try { ws.close(); } catch {}
process.exit(0);
