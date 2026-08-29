import { writeFileSync } from 'node:fs';
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
    setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error(`timeout ${method}`)); } }, 20000);
  });
  const evalJson = async (expression, awaitPromise = false) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 400) };
    return r.result?.value;
  };
  await call('Runtime.enable');
  return { ws, call, evalJson };
};

const snapExpr = `(() => {
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
    session: (() => { try { return sessionStorage.getItem('echo:lyrics:view-mode'); } catch { return null; } })(),
    ours: (() => { try { return sessionStorage.getItem('echo.mv.view-mode'); } catch { return null; } })(),
    hasCinemaChrome: Boolean(chrome),
    hasCoverArt: Boolean(artwork),
    label: document.querySelector('.lyrics-cinema-stage-label')?.textContent || null,
    hasMvBg: Boolean(bg),
    videoPaused: video ? video.paused : null,
    videoSize: video ? [Math.round(video.getBoundingClientRect().width), Math.round(video.getBoundingClientRect().height)] : null,
  };
})()`;

let { ws, call, evalJson } = await attach();
const prev = await evalJson(`(async () => (await window.echo?.app?.getSettings?.())?.lyricsPageStyle || 'folded')()`, true);
console.log('prev', prev);
try { await call('Page.enable'); await call('Page.reload', { ignoreCache: true }); } catch {}
try { ws.close(); } catch {}
await new Promise((r) => setTimeout(r, 8000));
({ ws, call, evalJson } = await attach());
for (let i = 0; i < 20; i += 1) {
  if (await evalJson('Boolean(window.__echoMvModActive)') === true) { console.log('mod', i); break; }
  await new Promise((r) => setTimeout(r, 400));
}

await evalJson(`(async () => {
  document.querySelector('button.transport-lyrics-button')?.click();
  window.dispatchEvent(new CustomEvent('app:navigate:lyrics', { detail: { mode: 'lyrics' } }));
  await window.echo?.app?.setSettings?.({ lyricsPageStyle: 'cinemaStage' });
  const btn = document.querySelector('.transport-mv-button');
  if (btn && !btn.classList.contains('is-soft-active')) btn.click();
  return true;
})()`, true);

let cinema = null;
for (let i = 0; i < 20; i += 1) {
  cinema = await evalJson(snapExpr);
  if (cinema?.hasCinemaChrome && cinema.viewMode === 'lyrics' && cinema.hasMvBg) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log('cinema', JSON.stringify(cinema));
await call('Page.enable');
const shot1 = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-cinema-stage.png', Buffer.from(shot1.data, 'base64'));

await evalJson(`(async () => { await window.echo?.app?.setSettings?.({ lyricsPageStyle: 'coverStage' }); return true; })()`, true);
await new Promise((r) => setTimeout(r, 1500));
const cover = await evalJson(snapExpr);
console.log('cover', JSON.stringify(cover));
const shot2 = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync('examples/ECHO-MV/dev/mv-cover-stage.png', Buffer.from(shot2.data, 'base64'));

if (prev) {
  await evalJson(`(async () => { await window.echo?.app?.setSettings?.({ lyricsPageStyle: ${JSON.stringify(prev)} }); return true; })()`, true);
  console.log('restored', prev);
}
ws.close();
