// Dev-only: check video track decode stats for the MV background video.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /renderer\/index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 30000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(async () => {
  const v = document.querySelector('video.lyrics-mv-background-video');
  if (!v) return { err: 'no video' };
  const q = typeof v.getVideoPlaybackQuality === 'function' ? v.getVideoPlaybackQuality() : null;
  const out = {
    videoWidth: v.videoWidth,
    videoHeight: v.videoHeight,
    readyState: v.readyState,
    paused: v.paused,
    currentTime: v.currentTime,
    quality: q ? { total: q.totalVideoFrames, dropped: q.droppedVideoFrames } : null,
    tracks: { video: v.videoTracks ? v.videoTracks.length : 'n/a', audio: v.audioTracks ? v.audioTracks.length : 'n/a' },
    style: v.getAttribute('style'),
    cssFilter: getComputedStyle(v).filter,
    cssTransform: getComputedStyle(v).transform,
    cssObjectFit: getComputedStyle(v).objectFit,
    mediaCaps: null,
  };
  try {
    out.mediaCaps = (await navigator.mediaCapabilities.decodingInfo({
      type: 'file',
      video: { contentType: 'video/mp4; codecs=av01.0.05M.08', width: 852, height: 480, bitrate: 500000, framerate: 30 },
    })).supported;
  } catch (e) { out.mediaCaps = 'err:' + (e && e.message); }
  return out;
})()`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
