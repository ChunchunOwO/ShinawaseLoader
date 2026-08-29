// Dev-only: end-to-end diagnosis of the MV playback chain.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 30000); });
const evalJson = async (expr, awaitPromise = false) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  return (r.result && 'value' in r.result) ? r.result.value : { exception: r.exceptionDetails?.text || r.exceptionDetails?.exception?.description };
};
await call('Runtime.enable');

// 1) playback + mod state
console.log('== app state ==');
console.log(JSON.stringify(await evalJson(`(async () => {
  const audio = await window.echo?.audio?.getStatus?.().catch(() => null);
  const mvApi = window.echo?.mv;
  return {
    modActive: !!window.__echoMvModActive,
    hasMvApi: !!mvApi,
    audioState: audio?.state ?? null,
    trackId: audio?.currentTrackId ?? null,
    trackTitle: audio?.currentTrackTitle ?? null,
    trackArtist: audio?.currentTrackArtist ?? null,
  };
})()`, true)));

// 2) mv settings + selected + candidates via the mod's own API
console.log('== mv api ==');
console.log(JSON.stringify(await evalJson(`(async () => {
  const mv = window.echo?.mv;
  if (!mv) return { error: 'no mv api' };
  const settings = await mv.getSettings().catch((e) => ({ err: String(e) }));
  const audio = await window.echo?.audio?.getStatus?.().catch(() => null);
  const trackId = audio?.currentTrackId || null;
  let selected = null; let candidates = null; let status = null;
  if (trackId) {
    selected = await mv.getSelected(trackId).catch((e) => ({ err: String(e) }));
    candidates = await mv.getCandidates(trackId).catch((e) => ({ err: String(e) }));
  }
  try { status = await mv.status?.(); } catch (e) { status = { err: String(e) }; }
  return {
    enabled: settings?.enabled,
    autoSearch: settings?.autoSearch,
    enabledProviders: settings?.enabledProviders,
    providerOrder: settings?.providerOrder,
    maxQuality: settings?.maxQuality,
    trackId,
    selected: selected ? { id: selected.id, provider: selected.provider, title: selected.title, playableInApp: selected.playableInApp, hasMediaUrl: !!selected.mediaUrl, mediaUrlPrefix: String(selected.mediaUrl || '').slice(0, 60), sourceType: selected.sourceType, err: selected.err } : null,
    candidateCount: Array.isArray(candidates) ? candidates.length : candidates,
    status,
  };
})()`, true)));

// 3) panel DOM state
console.log('== panel dom ==');
console.log(JSON.stringify(await evalJson(`(() => {
  const page = document.querySelector('.lyrics-page');
  const panel = document.querySelector('section.lyrics-mv-panel[data-echo-mv-mod="true"]');
  const stub = [...document.querySelectorAll('section.lyrics-mv-panel')].find((n) => n.dataset.echoMvMod !== 'true');
  const video = document.querySelector('video.lyrics-mv-video, .lyrics-mv-background-video');
  const card = document.querySelector('.lyrics-mv-card');
  const reasonEl = document.querySelector('.lyrics-mv-unavailable-reason');
  return {
    lyricsVisible: page ? (typeof page.checkVisibility === 'function' ? page.checkVisibility() : true) : false,
    pageViewMode: page?.dataset.viewMode ?? null,
    ownedPanel: !!panel,
    panelMvEnabled: (panel || stub)?.dataset.mvEnabled ?? null,
    hasVideo: !!video,
    videoSrc: video ? String(video.src || video.getAttribute('src') || '').slice(0, 80) : null,
    videoReadyState: video?.readyState ?? null,
    videoPaused: video?.paused ?? null,
    videoError: video?.error ? { code: video.error.code, message: video.error.message } : null,
    fallbackCard: card ? (card.querySelector('span')?.textContent || 'card') : null,
    unavailableReason: reasonEl?.textContent ?? null,
    background: !!document.querySelector('.lyrics-mv-background'),
  };
})()`)));

try { ws.close(); } catch {}
process.exit(0);
