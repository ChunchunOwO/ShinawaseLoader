// Dev-only: list all CSS rules matching .lyrics-backdrop (background-related).
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 25000); });

await call('DOM.enable');
await call('CSS.enable');
const doc = await call('DOM.getDocument', { depth: -1 });
const q = await call('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '.lyrics-page .lyrics-backdrop' });
if (!q.nodeId) { console.log('backdrop not found'); process.exit(1); }
const matched = await call('CSS.getMatchedStylesForNode', { nodeId: q.nodeId });
const rules = (matched.matchedCSSRules || []).map((m) => m.rule);
for (const rule of rules) {
  const bgProps = (rule.style?.cssProperties || []).filter((p) => /^background/.test(p.name) && p.value);
  if (!bgProps.length) continue;
  console.log('---');
  console.log('selector:', rule.selectorList?.text?.slice(0, 200));
  console.log('origin:', rule.origin, '| styleSheetId:', rule.styleSheetId);
  for (const p of bgProps) console.log(`  ${p.name}: ${p.value.slice(0, 120)}${p.important ? ' !important' : ''}`);
}

try { ws.close(); } catch {}
process.exit(0);
