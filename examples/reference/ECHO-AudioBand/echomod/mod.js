if (window.__echoAudioBandWidget) return () => {};
if (window.__echoAudioBandActive) return () => {};

const activateAudioBand = () => {
  try {
    const external = echoExternalMod;
    const config = external.config && typeof external.config === 'object' ? external.config : {};
    const locale = String(config.locale || 'auto');
    const chinese = locale === 'zh-CN' || (locale === 'auto' && String(document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('zh'));
    const log = (...values) => { try { external.log?.(...values); } catch {} };
    const sdk = external.sdk;

    if (typeof external.main?.invoke !== 'function') {
      try {
        external.toast?.(chinese
          ? 'AudioBand 需要 native host（main.cjs + WinUI 进程）。请确认加载器已启用主进程桥接，并已运行 build-winui.ps1。'
          : 'AudioBand needs the native host (main.cjs + WinUI process). Enable the main-process bridge and run build-winui.ps1.');
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
    const lyricsCache = new Map();
    let lastKnown = null;
    let artKey = '';
    let artUrl = '';
    let artFetchKey = '';
    let lyricsKey = '';
    let lyricsInflight = '';
    let lyricsLogged = false;
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

    const isWinUiCover = (url) =>
      typeof url === 'string' && (url.startsWith('data:') || /^(https?:|file:)/iu.test(url));

    const imageToDataUrl = (url) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const max = 512;
          const scale = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          const width = Math.max(1, Math.round((img.naturalWidth || max) * scale));
          const height = Math.max(1, Math.round((img.naturalHeight || max) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.92));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('cover_image_failed'));
      img.src = url;
    });

    const fetchCover = async (url) => {
      const controller = new AbortController();
      const watchdog = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`cover_http_${response.status}`);
        const blob = await response.blob();
        if (blob.size > 0 && blob.size <= 400000) return blobToDataUrl(blob);
        if (typeof createImageBitmap !== 'function') return blobToDataUrl(blob);
        const bitmap = await createImageBitmap(blob);
        const max = 512;
        const scale = Math.min(1, max / Math.max(bitmap.width || 1, bitmap.height || 1));
        const width = Math.max(1, Math.round((bitmap.width || max) * scale));
        const height = Math.max(1, Math.round((bitmap.height || max) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
        try { bitmap.close?.(); } catch {}
        return canvas.toDataURL('image/jpeg', 0.92);
      } finally {
        clearTimeout(watchdog);
      }
    };

    const coverToDataUrl = async (url) => {
      try { return await fetchCover(url); }
      catch { return imageToDataUrl(url); }
    };

    const walkCover = (...objects) => {
      for (const value of objects) {
        if (!value) continue;
        if (typeof value === 'string' && value.trim()) {
          return value.trim().replace(/echo-cover:\/\/thumb\//i, 'echo-cover://original/');
        }
        if (typeof value !== 'object' || Array.isArray(value)) continue;
        const url = textOf(
          value.coverUrl,
          value.currentTrackCoverUrl,
          value.artwork,
          value.albumArt,
          value.albumCover,
          value.image,
          typeof value.cover === 'string' ? value.cover : '',
          value.cover?.url,
          value.cover?.src,
          value.artworkUrl,
          value.coverThumb,
          value.cover?.thumb,
          value.thumbnail,
          value.thumb,
        );
        if (url) return String(url).replace(/echo-cover:\/\/thumb\//i, 'echo-cover://original/');
        const coverId = textOf(value.coverId, value.cover_id, value.currentTrackCoverId);
        if (coverId) return `echo-cover://original/${encodeURIComponent(coverId)}`;
      }
      return '';
    };

    const resolveArt = (trackKey, coverUrl) => {
      if (trackKey !== artKey) {
        artKey = trackKey;
        artUrl = '';
      }
      if (artCache.has(trackKey)) {
        artUrl = artCache.get(trackKey);
        return artUrl;
      }
      if (isWinUiCover(artUrl)) return artUrl;
      if (!coverUrl) return artUrl || '';
      if (coverUrl.startsWith('data:')) {
        artUrl = coverUrl;
        artCache.set(trackKey, coverUrl);
        return artUrl;
      }
      if (artFetchKey !== trackKey) {
        artFetchKey = trackKey;
        void coverToDataUrl(coverUrl)
          .then((resolved) => (isWinUiCover(resolved) ? resolved : ''))
          .catch(() => '')
          .then((resolved) => {
            if (disposed) return;
            if (artFetchKey === trackKey) artFetchKey = '';
            if (artKey !== trackKey) return;
            if (!resolved) return;
            artCache.set(trackKey, resolved);
            while (artCache.size > 8) artCache.delete(artCache.keys().next().value);
            artUrl = resolved;
            if (lastKnown && lastKnown.trackKey === trackKey && lastKnown.coverUrl !== resolved) {
              lastKnown = { ...lastKnown, coverUrl: resolved };
              void sendStatus(lastKnown);
            }
          });
      }
      return artUrl || coverUrl;
    };

    const listSdk = (path) => {
      try { return sdk?.list?.(path) || []; }
      catch { return []; }
    };

    const callSdk = (path, ...args) => {
      try { return sdk?.call?.(path, ...args); }
      catch { return undefined; }
    };

    const discoverLyrics = () => {
      const names = {
        lyrics: listSdk('lyrics'),
        desktopLyrics: listSdk('desktopLyrics'),
        streaming: listSdk('streaming'),
        playback: listSdk('playback'),
        app: listSdk('app'),
      };
      if (!lyricsLogged) {
        lyricsLogged = true;
        log('sdk.list lyrics/desktopLyrics/streaming/playback/app', names);
      }
      return names;
    };

    const parseTimestamp = (value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value >= 1000 ? value : value * 1000;
      if (typeof value !== 'string') return 0;
      const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/);
      if (!match) return 0;
      const ms = match[3] ? Number(match[3].padEnd(3, '0').slice(0, 3)) : 0;
      return (Number(match[1]) * 60 + Number(match[2])) * 1000 + ms;
    };

    const cleanLyric = (value) => String(value || '').replace(/\s+/g, ' ').trim();

    const parseLrc = (text) => {
      const lines = [];
      for (const raw of String(text || '').split(/\r?\n/)) {
        const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
        if (!stamps.length) continue;
        const body = cleanLyric(raw.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, ''));
        if (!body) continue;
        for (const stamp of stamps) {
          const ms = stamp[3] ? Number(stamp[3].padEnd(3, '0').slice(0, 3)) : 0;
          lines.push({ timeMs: (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000 + ms, text: body });
        }
      }
      lines.sort((a, b) => a.timeMs - b.timeMs);
      return lines;
    };

    const collectLines = (input, into) => {
      if (!input) return;
      if (typeof input === 'string') {
        const parsed = parseLrc(input);
        if (parsed.length) {
          into.push(...parsed);
          return;
        }
        for (const line of input.split(/\r?\n/)) {
          const text = cleanLyric(line);
          if (text) into.push({ timeMs: into.length * 4000, text });
        }
        return;
      }
      if (Array.isArray(input)) {
        for (const item of input) {
          if (typeof item === 'string') {
            const text = cleanLyric(item);
            if (text) into.push({ timeMs: into.length ? into[into.length - 1].timeMs + 4000 : 0, text });
            continue;
          }
          const row = asTrack(item);
          if (!row) continue;
          const text = cleanLyric(row.text || row.line || row.content || row.lyric || row.value);
          if (!text) continue;
          const timeMs = numOf(row.timeMs, row.startMs, row.startTimeMs, parseTimestamp(row.time), parseTimestamp(row.startTime), row.time, row.start, row.offset);
          into.push({ timeMs, text });
        }
      }
    };

    const emptyLyrics = () => ({ lines: [], instrumental: false, has: false });

    const normalizeLyrics = (value) => {
      if (value == null) return emptyLyrics();
      if (typeof value === 'string') {
        const lines = parseLrc(value);
        if (!lines.length) collectLines(value, lines);
        return { lines, instrumental: false, has: lines.length > 0 };
      }
      const row = asTrack(value);
      if (!row) return emptyLyrics();
      if (row.instrumental === true || row.isInstrumental === true || row.status === 'instrumental') {
        return { lines: [], instrumental: true, has: true };
      }
      if (row.status === 'missing' || row.status === 'error') return emptyLyrics();
      const lines = [];
      collectLines(row.lines || row.syncedLines || row.karaokeLines || row.currentLines, lines);
      if (!lines.length) {
        collectLines(row.karaokeLyrics || row.syncedLyrics || row.lrc || row.lyric || row.lyrics, lines);
      }
      if (!lines.length) collectLines(row.plainLyrics || row.plain || row.text, lines);
      if (!lines.length) {
        const current = cleanLyric(row.current || row.currentLine || row.line);
        const next = cleanLyric(row.next || row.nextLine);
        if (current) lines.push({ timeMs: 0, text: current });
        if (next) lines.push({ timeMs: 1, text: next });
      }
      lines.sort((a, b) => a.timeMs - b.timeMs);
      return { lines, instrumental: false, has: lines.length > 0 };
    };

    const READ_OK = /^(get|current|status|lyrics|load|fetch|lookup|resolve|read)/iu;
    const READ_SKIP = /^(set|clear|hide|show|open|close|toggle|enable|disable|save|write|delete|remove|create|update|apply|search|import|export)/iu;

    const tryCall = async (path, argsList) => {
      for (const args of argsList) {
        try {
          const result = await callSdk(path, ...args);
          const parsed = normalizeLyrics(result);
          if (parsed.has) return parsed;
        } catch {}
      }
      return null;
    };

    const fetchLyrics = async (track, status) => {
      const names = discoverLyrics();
      const snapshot = {
        title: textOf(status?.title, track?.title),
        artist: textOf(status?.artist, track?.artist),
        album: textOf(status?.album, track?.album),
        durationSeconds: numOf(status?.durationSeconds, track?.duration),
        id: textOf(track?.id, track?.trackId, status?.currentTrackId),
        trackId: textOf(track?.id, track?.trackId, status?.currentTrackId),
        provider: textOf(track?.provider, status?.provider),
        providerTrackId: textOf(track?.providerTrackId, track?.id),
        mediaType: textOf(track?.mediaType, status?.mediaType),
        path: textOf(track?.path, track?.filePath, status?.currentFilePath),
      };
      const argLists = [[], [snapshot], [snapshot.id], [snapshot.trackId], [snapshot]];

      for (const ns of ['lyrics', 'desktopLyrics', 'playback']) {
        for (const name of names[ns] || []) {
          if (READ_SKIP.test(name) && !READ_OK.test(name)) continue;
          if (!READ_OK.test(name) && !/lyric/i.test(name)) continue;
          const parsed = await tryCall(`${ns}.${name}`, argLists);
          if (parsed) return parsed;
        }
      }

      if ((names.streaming || []).includes('getLyrics') && snapshot.provider && snapshot.providerTrackId) {
        const parsed = await tryCall('streaming.getLyrics', [[{
          provider: snapshot.provider,
          providerTrackId: snapshot.providerTrackId,
        }]]);
        if (parsed) return parsed;
      }

      return emptyLyrics();
    };

    const pickLyrics = (pack, positionSeconds) => {
      if (!pack || pack.instrumental) {
        return { current: '', next: '', has: Boolean(pack?.has), instrumental: Boolean(pack?.instrumental) };
      }
      const lines = pack.lines || [];
      if (!lines.length) return { current: '', next: '', has: false, instrumental: false };
      const t = Math.max(0, Number(positionSeconds) || 0) * 1000;
      let index = 0;
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].timeMs <= t) index = i;
        else break;
      }
      if (t < lines[0].timeMs) index = 0;
      const current = lines[index]?.text || '';
      let next = lines[index + 1]?.text || '';
      if (!next) {
        for (let i = index + 1; i < lines.length; i += 1) {
          if (lines[i]?.text && lines[i].text !== current) {
            next = lines[i].text;
            break;
          }
        }
      }
      return {
        current,
        next,
        has: true,
        instrumental: false,
      };
    };

    const ensureLyrics = (track, status, trackKey) => {
      if (!trackKey) return emptyLyrics();
      if (lyricsCache.has(trackKey)) return lyricsCache.get(trackKey);
      if (lyricsInflight === trackKey) return emptyLyrics();
      lyricsInflight = trackKey;
      lyricsKey = trackKey;
      void fetchLyrics(track, status)
        .catch(() => emptyLyrics())
        .then((pack) => {
          if (disposed) return;
          lyricsCache.set(trackKey, pack);
          while (lyricsCache.size > 12) lyricsCache.delete(lyricsCache.keys().next().value);
          if (lyricsInflight === trackKey) lyricsInflight = '';
          if (lyricsKey !== trackKey || !lastKnown || lastKnown.trackKey !== trackKey) return;
          const picked = pickLyrics(pack, lastKnown.positionSeconds);
          lastKnown = {
            ...lastKnown,
            lyricsCurrent: picked.current,
            lyricsNext: picked.next,
            lyricsHas: picked.has,
            lyricsInstrumental: picked.instrumental,
          };
          void sendStatus(lastKnown);
        });
      return emptyLyrics();
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
        let current = asTrack(status.currentTrack);
        if (!current) {
          let queue = null;
          try { queue = player?.queue?.() || null; } catch { queue = null; }
          current = currentFromQueue(queue);
        }
        let playbackStatus = null;
        let audioStatus = null;
        try { playbackStatus = await window.echo?.playback?.getStatus?.(); } catch {}
        try { audioStatus = await window.echo?.audio?.getStatus?.(); } catch {}
        const state = String(status.state || playbackStatus?.state || audioStatus?.state || 'stopped');
        const title = textOf(status.title, status.currentTrackTitle, current?.title, playbackStatus?.currentTrackTitle, audioStatus?.currentTrackTitle);
        const artist = textOf(status.artist, status.currentTrackArtist, current?.artist, playbackStatus?.currentTrackArtist, audioStatus?.currentTrackArtist);
        let album = textOf(
          status.album,
          status.currentTrackAlbum,
          current?.album,
          current?.albumTitle,
          current?.albumName,
          playbackStatus?.currentTrackAlbum,
          audioStatus?.currentTrackAlbum,
        );
        let rawCover = walkCover(current, status, playbackStatus, audioStatus);
        const trackId = textOf(current?.id, current?.trackId, status.currentTrackId, playbackStatus?.currentTrackId);
        if (trackId && (!rawCover || !album)) {
          let libraryTrack = null;
          try { libraryTrack = await window.echo?.library?.getTrack?.(trackId); } catch {}
          if (!rawCover) rawCover = walkCover(libraryTrack);
          if (!album) album = textOf(libraryTrack?.album, libraryTrack?.albumTitle, libraryTrack?.albumName);
        }
        const trackKey = String(
          current?.id || current?.trackId || current?.stableKey || status.currentTrackId || status.currentFilePath || current?.path || current?.filePath || `${title}|${artist}|${album}`,
        );
        const positionSeconds = numOf(status.positionSeconds, Number(status.positionMs || 0) / 1000);
        const pack = lyricsCache.get(trackKey) || ensureLyrics(current, { ...status, title, artist, album }, trackKey);
        const picked = pickLyrics(pack, positionSeconds);
        const payload = {
          state,
          playing: state === 'playing',
          title,
          artist,
          album,
          coverUrl: resolveArt(trackKey, rawCover),
          positionSeconds,
          durationSeconds: numOf(status.durationSeconds, Number(status.durationMs || 0) / 1000, current?.duration),
          trackKey,
          officialEnabled: true,
          lyricsCurrent: picked.current,
          lyricsNext: picked.next,
          lyricsHas: picked.has,
          lyricsInstrumental: picked.instrumental,
        };
        lastKnown = payload;
        const body = JSON.stringify(payload);
        if (body !== lastSentBody || Date.now() - lastSentAt >= 10000) await sendStatus(payload, body);
      } catch (error) {
        log('poll failed', error);
      }
    };

    const handleCommand = async (payload) => {
      const player = external.player;
      const action = String(payload?.action || '');
      if (action === 'openLyrics') {
        try { external.extend?.navigate?.('lyrics'); } catch {}
        try { window.dispatchEvent(new CustomEvent('app:navigate:lyrics')); } catch {}
        return;
      }
      if (!player) return;
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
                ? 'AudioBand 无法连接 WinUI host。请运行 examples/reference/ECHO-AudioBand/build-winui.ps1 后，用加载器重启 ECHO。'
                : 'AudioBand could not reach its WinUI host. Run examples/reference/ECHO-AudioBand/build-winui.ps1 and restart ECHO via the Loader.');
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
