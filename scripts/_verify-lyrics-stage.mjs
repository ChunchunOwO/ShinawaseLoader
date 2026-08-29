const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) throw new Error('no page');
const connect = async () => {
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
    setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error(`timeout ${method}`)); } }, 20000);
  });
  const evalJson = async (expression, awaitPromise = false) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result?.value;
  };
  await call('Runtime.enable');
  return { ws, call, evalJson };
};

let { ws, call, evalJson } = await connect();
console.log('reloading renderer...');
try { await call('Page.enable'); await call('Page.reload', { ignoreCache: true }); } catch (error) { console.log('reload err', error.message); }
try { ws.close(); } catch {}
await new Promise((r) => setTimeout(r, 8000));

const list2 = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target2 = list2.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const page = await connect.call(null) || null;
void page;
({ ws, call, evalJson } = await (async () => {
  const ws2 = new WebSocket(target2.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws2.addEventListener('open', res, { once: true }); ws2.addEventListener('error', rej, { once: true }); });
  const state = { id: 0, pending: new Map() };
  ws2.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && state.pending.has(m.id)) {
      const p = state.pending.get(m.id);
      state.pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  });
  const call2 = (method, params = {}) => new Promise((res, rej) => {
    const id = ++state.id;
    state.pending.set(id, { res, rej });
    ws2.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error(`timeout ${method}`)); } }, 20000);
  });
  const evalJson2 = async (expression, awaitPromise = false) => {
    const r = await call2('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result?.value;
  };
  await call2('Runtime.enable');
  return { ws: ws2, call: call2, evalJson: evalJson2 };
})());

for (let i = 0; i < 20; i += 1) {
  const active = await evalJson('Boolean(window.__echoMvModActive)');
  if (active === true) { console.log('mod ready', i); break; }
  await new Promise((r) => setTimeout(r, 500));
}

const switched = await evalJson(`(async () => {
  const app = window.echo?.app;
  if (!app?.setSettings) return { ok: false, reason: 'no setSettings' };
  const prev = (await app.getSettings?.())?.lyricsPageStyle || 'folded';
  await app.setSettings({ lyricsPageStyle: 'cinemaStage' });
  window.dispatchEvent(new CustomEvent('app:navigate:lyrics', { detail: { mode: 'lyrics' } }));
  return { ok: true, prev };
})()`, true);
console.log('switch', JSON.stringify(switched));
await new Promise((r) => setTimeout(r, 1800));

const snap = await evalJson(`(() => {
  const page = document.querySelector('.lyrics-page');
  const chrome = document.querySelector('.lyrics-cinema-stage-chrome');
  const artwork = document.querySelector('.lyrics-cover-stage-artwork');
  const bg = document.querySelector('.lyrics-mv-background');
  const video = document.querySelector('video.lyrics-mv-background-video');
  return {
    style: page?.getAttribute('data-lyrics-page-style'),
    viewMode: page?.getAttribute('data-view-mode'),
    echoMv: page?.getAttribute('data-echo-mv'),
    echoStage: page?.getAttribute('data-echo-mv-stage'),
    echoHost: page?.getAttribute('data-echo-mv-host-style'),
    session: (() => { try { return sessionStorage.getItem('echo:lyrics:view-mode'); } catch { return null; } })(),
    hasCinemaChrome: Boolean(chrome),
    chromeRect: chrome ? Math.round(chrome.getBoundingClientRect().height) : 0,
    hasCoverArt: Boolean(artwork),
    hasMvBg: Boolean(bg),
    videoPaused: video ? video.paused : null,
    videoSize: video ? [Math.round(video.getBoundingClientRect().width), Math.round(video.getBoundingClientRect().height)] : null,
  };
})()`);
console.log(JSON.stringify(snap, null, 2));
try {
  await call('Page.enable');
  const shot = await call('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync('examples/ECHO-MV/dev/mv-cinema-stage.png', Buffer.from(shot.data, 'base64'));
  console.log('screenshot examples/ECHO-MV/dev/mv-cinema-stage.png');
} catch (error) { console.log('shot err', error.message); }
if (switched?.prev && switched.prev !== 'cinemaStage') {
  const restored = await evalJson(`(async () => {
    await window.echo?.app?.setSettings?.({ lyricsPageStyle: ${JSON.stringify(switched.prev)} });
    return true;
  })()`, true);
  console.log('restored', switched.prev, restored);
}
try { ws.close(); } catch {}
