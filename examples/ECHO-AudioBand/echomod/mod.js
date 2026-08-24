if (window.__echoAudioBandWidget) return () => {};
if (window.__echoAudioBandActive) return () => {};

const activateAudioBand = () => {
  try {
    const external = echoExternalMod;
    const config = external.config && typeof external.config === 'object' ? external.config : {};
    const locale = String(config.locale || 'auto');
    const chinese = locale === 'zh-CN' || (locale === 'auto' && String(document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('zh'));
    const log = (...values) => { try { external.log?.(...values); } catch {} };

    if (typeof external.main?.invoke !== 'function') {
      try {
        external.toast?.(chinese
          ? 'AudioBand 需要 native host (main.cjs) 支持，请确认 ShinawaseLoader 已启用主进程桥接。'
          : 'AudioBand needs native host (main.cjs) support. Enable ShinawaseLoader\'s main-process bridge.');
      } catch {}
      return () => {};
    }

    window.__echoAudioBandActive = true;

    const clamp = (value, min, max, fallback) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, Math.round(n)));
    };
    const pollMs = clamp(config.pollIntervalMs, 250, 5000, 1000);
    const artCache = new Map();
    let lastKnown = null;
    let artKey = '';
    let artUrl = '';
    let artFetchKey = '';
    let sendBlockedUntil = 0;
    let sendFailures = 0;
    let lastSentBody = '';
    let lastSentAt = 0;
    let timer = 0;
    let disposed = false;

    const textOf = (...values) => {
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value != null && typeof value !== 'object' && String(value).trim()) return String(value).trim();
      }
      return '';
    };

    const numOf = (...values) => {
      for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) return n;
      }
      return 0;
    };

    const asTrack = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

    const tracksOf = (queue) => {
      if (!queue || typeof queue !== 'object') return [];
      for (const key of ['items', 'tracks', 'queue', 'list']) {
        if (Array.isArray(queue[key])) return queue[key];
      }
      return [];
    };

    const currentFromQueue = (queue) => {
      if (!queue || typeof queue !== 'object') return null;
      const direct = asTrack(queue.currentTrack) || asTrack(queue.current) || asTrack(queue.nowPlaying) || asTrack(queue.track);
      if (direct) return direct;
      const tracks = tracksOf(queue);
      let index = null;
      if (typeof queue.current === 'number') index = queue.current;
      else if (Number.isInteger(Number(queue.currentIndex))) index = Number(queue.currentIndex);
      else if (Number.isInteger(Number(queue.index))) index = Number(queue.index);
      if (Number.isInteger(index) && tracks[index]) return asTrack(tracks[index]);
      return null;
    };

    const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read_failed'));
      reader.readAsDataURL(blob);
    });

    const coverToDataUrl = async (url) => {
      const controller = new AbortController();
      const watchdog = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`cover_http_${response.status}`);
        const blob = await response.blob();
        if (blob.size > 0 && blob.size <= 80000) return blobToDataUrl(blob);
        if (typeof createImageBitmap !== 'function') return blobToDataUrl(blob);
        const bitmap = await createImageBitmap(blob);
        const max = 300;
        const scale = Math.min(1, max / Math.max(bitmap.width || 1, bitmap.height || 1));
        const width = Math.max(1, Math.round((bitmap.width || max) * scale));
        const height = Math.max(1, Math.round((bitmap.height || max) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
        try { bitmap.close?.(); } catch {}
        return canvas.toDataURL('image/jpeg', 0.85);
      } finally {
        clearTimeout(watchdog);
      }
    };

    // Resolves cover art without blocking the status pipeline: cached art is
    // returned synchronously, remote art is fetched once per track (no
    // duplicate in-flight fetches) and pushed as a follow-up status update.
    const resolveArt = (trackKey, coverUrl) => {
      if (trackKey !== artKey) {
        artKey = trackKey;
        artUrl = '';
      }
      if (!coverUrl) {
        artUrl = '';
        return '';
      }
      if (artUrl) return artUrl;
      if (coverUrl.startsWith('data:')) {
        artUrl = coverUrl;
        return artUrl;
      }
      if (artCache.has(trackKey)) {
        artUrl = artCache.get(trackKey);
        return artUrl;
      }
      const fetchable = /^(https?:|app:|echo:|[a-z][a-z0-9+.-]*:)/iu.test(coverUrl);
      if (!fetchable) {
        artUrl = coverUrl;
        return artUrl;
      }
      if (artFetchKey !== trackKey) {
        artFetchKey = trackKey;
        void coverToDataUrl(coverUrl)
          .catch(() => coverUrl)
          .then((resolved) => {
            if (disposed) return;
            artCache.set(trackKey, resolved);
            while (artCache.size > 8) artCache.delete(artCache.keys().next().value);
            if (artFetchKey === trackKey) artFetchKey = '';
            if (artKey !== trackKey) return;
            artUrl = resolved;
            if (lastKnown && lastKnown.trackKey === trackKey && lastKnown.coverUrl !== resolved) {
              lastKnown = { ...lastKnown, coverUrl: resolved };
              void sendStatus(lastKnown);
            }
          });
      }
      return artUrl;
    };

    const sendStatus = async (payload, body) => {
      if (Date.now() < sendBlockedUntil) return;
      try {
        await external.main.invoke('status', payload);
        sendFailures = 0;
        lastSentBody = body ?? JSON.stringify(payload);
        lastSentAt = Date.now();
      } catch (error) {
        sendFailures += 1;
        const backoff = Math.min(60000, 5000 * (2 ** Math.min(4, sendFailures - 1)));
        sendBlockedUntil = Date.now() + backoff;
        log(`status invoke failed, backing off ${Math.round(backoff / 1000)}s`, error);
      }
    };

    const tick = async () => {
      if (disposed) return;
      if (!window.echo?.playback) return;
      try {
        const player = external.player;
        let status = {};
        try { status = (await player?.status?.()) || {}; } catch { status = {}; }
        // player.status() already walks the React tree for the queue and
        // returns its currentTrack; only fall back to a second queue() walk
        // when the snapshot lacks it (older loader runtimes).
        let current = asTrack(status.currentTrack);
        if (!current) {
          let queue = null;
          try { queue = player?.queue?.() || null; } catch { queue = null; }
          current = currentFromQueue(queue);
        }
        const state = String(status.state || 'stopped');
        const title = textOf(status.title, status.currentTrackTitle, current?.title);
        const artist = textOf(status.artist, status.currentTrackArtist, current?.artist);
        const album = textOf(status.album, status.currentTrackAlbum, current?.album);
        const rawCover = textOf(
          status.coverUrl,
          status.currentTrackCoverUrl,
          current?.coverThumb,
          current?.coverUrl,
          current?.artwork,
          current?.albumArt,
        );
        const trackKey = String(
          current?.id || current?.trackId || current?.stableKey || status.currentTrackId || status.currentFilePath || current?.path || current?.filePath || `${title}|${artist}|${album}`,
        );
        const payload = {
          state,
          playing: state === 'playing',
          title,
          artist,
          album,
          coverUrl: resolveArt(trackKey, rawCover),
          positionSeconds: numOf(status.positionSeconds, Number(status.positionMs || 0) / 1000),
          durationSeconds: numOf(status.durationSeconds, Number(status.durationMs || 0) / 1000, current?.duration),
          trackKey,
        };
        lastKnown = payload;
        // Skip sends when nothing changed (e.g. paused), but re-send at least
        // every 10s so a restarted native host resyncs its cached status.
        const body = JSON.stringify(payload);
        if (body !== lastSentBody || Date.now() - lastSentAt >= 10000) await sendStatus(payload, body);
      } catch (error) {
        log('poll failed', error);
      }
    };

    const handleCommand = async (payload) => {
      const player = external.player;
      if (!player) return;
      const action = String(payload?.action || '');
      if (action === 'toggle') {
        let state = lastKnown?.state;
        if (!state || state === 'idle') {
          try { state = (await player.status?.())?.state; } catch {}
        }
        if (state === 'playing') await player.pause?.();
        else await player.play?.();
        return;
      }
      if (action === 'play') { await player.play?.(); return; }
      if (action === 'pause') { await player.pause?.(); return; }
      if (action === 'next') { await player.next?.(); return; }
      if (action === 'previous') { await player.previous?.(); return; }
      if (action === 'seekRatio') {
        const duration = Number(lastKnown?.durationSeconds);
        const ratio = Number(payload.ratio);
        if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(ratio)) return;
        await player.seek?.(Math.max(0, Math.min(duration, ratio * duration)));
      }
    };

    const onNative = (event) => {
      try {
        const detail = event?.detail || {};
        if (detail.id !== external.id || detail.name !== 'command') return;
        void handleCommand(detail.payload || {}).catch((error) => log('command failed', error));
      } catch (error) {
        log('command listener failed', error);
      }
    };

    // Retry configure a few times before reporting: the in-process native host
    // may activate this package slightly after the renderer injection.
    const pushConfigure = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (disposed) return;
        try {
          await external.main.invoke('configure', config);
          return;
        } catch (error) {
          if (attempt === 2) {
            log('configure failed', error);
            try {
              external.toast?.(chinese
                ? 'AudioBand 无法连接 native host（main.cjs）。请在 Loader 中启用主进程桥接后重启 ECHO。'
                : 'AudioBand could not reach its native host (main.cjs). Enable the main-process bridge in the Loader and restart ECHO.');
            } catch {}
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    };
    void pushConfigure();
    window.addEventListener('echo-native', onNative);
    void tick();
    timer = window.setInterval(() => { void tick(); }, pollMs);

    return () => {
      disposed = true;
      try { window.clearInterval(timer); } catch {}
      try { window.removeEventListener('echo-native', onNative); } catch {}
      try { external.main?.invoke?.('rendererGone')?.catch?.(() => {}); } catch {}
      window.__echoAudioBandActive = false;
    };
  } catch (error) {
    try { echoExternalMod.log?.('ECHO AudioBand failed', error); } catch {}
    window.__echoAudioBandActive = false;
    return () => {};
  }
};

try {
  if (window.echo?.playback) return activateAudioBand();
  let tries = 0;
  let retryTimer = 0;
  let innerDispose = null;
  let stopped = false;
  retryTimer = window.setInterval(() => {
    if (stopped || innerDispose) return;
    if (window.__echoAudioBandWidget) {
      stopped = true;
      try { window.clearInterval(retryTimer); } catch {}
      retryTimer = 0;
      return;
    }
    if (window.echo?.playback) {
      try { window.clearInterval(retryTimer); } catch {}
      retryTimer = 0;
      innerDispose = activateAudioBand();
      return;
    }
    tries += 1;
    if (tries >= 150) {
      stopped = true;
      try { window.clearInterval(retryTimer); } catch {}
      retryTimer = 0;
    }
  }, 2000);
  return () => {
    stopped = true;
    try { window.clearInterval(retryTimer); } catch {}
    retryTimer = 0;
    try { innerDispose?.(); } catch {}
  };
} catch (error) {
  try { echoExternalMod.log?.('ECHO AudioBand failed', error); } catch {}
  window.__echoAudioBandActive = false;
  return () => {};
}
