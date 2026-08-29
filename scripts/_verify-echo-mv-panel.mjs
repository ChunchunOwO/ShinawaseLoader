const CDP_PORT = 9229;
const attach = async () => {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
  if (!target) throw new Error('no page');
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
    setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 15000);
  });
  const evalJson = async (expression, awaitPromise = false) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception?.description || '').slice(0, 300) };
    return r.result?.value;
  };
  await call('Runtime.enable');
  return { ws, call, evalJson };
};

let { ws, call, evalJson } = await attach();
try { await call('Page.enable'); await call('Page.reload', { ignoreCache: true }); } catch {}
try { ws.close(); } catch {}
await new Promise((r) => setTimeout(r, 8000));
({ ws, call, evalJson } = await attach());
for (let i = 0; i < 20; i += 1) {
  if (await evalJson('Boolean(window.__echoMvModActive)') === true) { console.log('mod', i); break; }
  await new Promise((r) => setTimeout(r, 400));
}
await evalJson(`(() => {
  document.querySelector('button.transport-lyrics-button')?.click();
  const btn = document.querySelector('.transport-mv-button');
  if (btn && !btn.classList.contains('is-soft-active')) btn.click();
  return true;
})()`);
await new Promise((r) => setTimeout(r, 1500));
const snap = await evalJson(`(() => {
  const page = document.querySelector('.lyrics-page');
  const hud = document.querySelector('aside.echo-mv-panel');
  const official = [...document.querySelectorAll('section.lyrics-mv-panel')].map((n) => ({
    hidden: n.hidden || getComputedStyle(n).display === 'none',
    stub: n.dataset.echoMvStub || null,
    w: Math.round(n.getBoundingClientRect().width),
  }));
  const btn = document.querySelector('.transport-mv-button');
  return {
    viewMode: page?.getAttribute('data-view-mode'),
    echoMv: page?.getAttribute('data-echo-mv'),
    style: page?.getAttribute('data-lyrics-page-style'),
    hasEntry: Boolean(btn),
    entryPressed: btn?.getAttribute('aria-pressed') || null,
    hasHud: Boolean(hud),
    hudText: hud?.innerText?.replace(/\\s+/g, ' ').slice(0, 180) || null,
    hudSize: hud ? [Math.round(hud.getBoundingClientRect().width), Math.round(hud.getBoundingClientRect().height)] : null,
    official,
    settingsEntry: Boolean(document.querySelector('.lyrics-mv-settings-entry')),
  };
})()`);
console.log(JSON.stringify(snap, null, 2));
ws.close();
