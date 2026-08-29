import { writeFileSync } from 'node:fs';

const CDP_PORT = 9229;
const listTargets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json());
const connect = async () => {
  const list = await listTargets();
  const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
  if (!target) throw new Error('no ECHO page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  const pending = new Map();
  let seq = 0;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  });
  const call = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 30000);
  });
  const evalJson = async (expr, awaitPromise = false) => {
    const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
    return (r.result && 'value' in r.result) ? r.result.value : { exception: r.exceptionDetails?.text || r.exceptionDetails?.exception?.description };
  };
  await call('Runtime.enable');
  return { ws, call, evalJson };
};

const snap = `(() => {
  const page = document.querySelector('.lyrics-page');
  const sheet = document.querySelector('.echo-mv-sheet');
  const root = document.querySelector('.echo-mv-root');
  const official = document.querySelector('section.lyrics-mv-panel');
  const entry = document.querySelector('.transport-mv-button');
  const rect = sheet?.getBoundingClientRect();
  return {
    lyrics: !!page,
    viewMode: page?.dataset.viewMode || null,
    echoMv: page?.dataset.echoMv || null,
    officialHidden: official ? official.hidden || getComputedStyle(official).display === 'none' : 'missing',
    oldHud: !!document.querySelector('aside.echo-mv-panel'),
    oldDrawer: !!document.querySelector('.mv-settings-drawer, .mv-settings-drawer-root, .audio-drawer.mv-settings-drawer'),
    sheet: !!sheet,
    open: root?.dataset.open || null,
    collapsed: root?.dataset.collapsed || null,
    enable: document.querySelector('.echo-mv-enable input')?.checked ?? null,
    quality: document.querySelectorAll('.echo-mv-quality-item').length,
    hide: !!document.querySelector('.echo-mv-icon-btn[aria-label="隐藏"], .echo-mv-icon-btn[aria-label="Hide"]'),
    close: !!document.querySelector('.echo-mv-icon-btn[aria-label="关闭"], .echo-mv-icon-btn[aria-label="Close"]'),
    pressed: entry?.getAttribute('aria-pressed') || null,
    size: rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : null,
  };
})()`;

let { ws, call, evalJson } = await connect();
console.log('reloading renderer...');
try { await call('Page.enable'); await call('Page.reload', { ignoreCache: true }); } catch {}
try { ws.close(); } catch {}
await new Promise((r) => setTimeout(r, 8000));

({ ws, call, evalJson } = await connect());
for (let i = 0; i < 25; i += 1) {
  if (await evalJson('Boolean(window.__echoMvModActive)') === true) {
    console.log('mod ready', i);
    break;
  }
  await new Promise((r) => setTimeout(r, 400));
}

const before = await evalJson(snap);
console.log('before click', JSON.stringify(before));

await evalJson(`(() => {
  const lyrics = document.querySelector('.transport-lyrics-button');
  if (!document.querySelector('.lyrics-page') && lyrics) lyrics.click();
  return true;
})()`);
await new Promise((r) => setTimeout(r, 1200));
await evalJson(`document.querySelector('.transport-mv-button')?.click?.()`);
await new Promise((r) => setTimeout(r, 900));
const opened = await evalJson(snap);
console.log('after open', JSON.stringify(opened));
await new Promise((r) => setTimeout(r, 700));
const stayed = await evalJson(snap);
console.log('stayed open', JSON.stringify(stayed));

await evalJson(`document.querySelector('.echo-mv-icon-btn[aria-label="隐藏"], .echo-mv-icon-btn[aria-label="Hide"]')?.click()`);
await new Promise((r) => setTimeout(r, 400));
const hidden = await evalJson(snap);
console.log('after hide', JSON.stringify(hidden));

await evalJson(`document.querySelector('.echo-mv-icon-btn[aria-label="展开"], .echo-mv-icon-btn[aria-label="Expand"]')?.click()`);
await new Promise((r) => setTimeout(r, 400));
const expanded = await evalJson(snap);
console.log('after expand', JSON.stringify(expanded));

const enableBefore = opened.enable;
await evalJson(`(() => {
  const input = document.querySelector('.echo-mv-enable input');
  if (!input) return false;
  input.click();
  return true;
})()`);
await new Promise((r) => setTimeout(r, 700));
const toggled = await evalJson(snap);
console.log('after enable toggle', JSON.stringify(toggled));
if (enableBefore != null) {
  await evalJson(`(() => {
    const input = document.querySelector('.echo-mv-enable input');
    if (input && input.checked !== ${enableBefore}) input.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 500));
}

await evalJson(`document.querySelector('.echo-mv-icon-btn[aria-label="关闭"], .echo-mv-icon-btn[aria-label="Close"]')?.click()`);
await new Promise((r) => setTimeout(r, 700));
const closed = await evalJson(snap);
console.log('after close', JSON.stringify(closed));

await evalJson(`document.querySelector('.transport-mv-button')?.click?.()`);
await new Promise((r) => setTimeout(r, 700));
const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-sheet.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot examples/ECHO-MV/dev/mv-sheet.png');

const ok = opened.sheet && stayed.sheet && !opened.oldHud && !opened.oldDrawer && opened.viewMode === 'lyrics' && opened.quality > 0 && opened.enable != null && hidden.collapsed === 'true' && expanded.collapsed === 'false' && !closed.sheet;
console.log('ok', ok);
try { ws.close(); } catch {}
process.exit(ok ? 0 : 2);
