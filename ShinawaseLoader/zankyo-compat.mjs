import { readFile, stat } from 'node:fs/promises';

export function unsupportedElectron(surface) {
  return new Error(`electron_mod_requires_port: ${surface}; use zankyo.entry and native GPUI controls`);
}

// Only real host operations are exposed. There is no simulated DOM or Electron.
// shortcut: API-only compatibility; add mappings when a legacy API has a native host equivalent.
export function electronContext({ id, directory, packageFile, zankyo, request, settings, toast, log, baseUrl }) {
  let playback;
  let current;
  let hostState;
  let queue = null;
  let closed = false;
  const listeners = new Set();
  const settingsListeners = new Set();
  const disposers = new Set();
  const timers = new Set();
  const assertOpen = () => { if (closed) throw new Error('mod_disposed'); };
  const track = dispose => { disposers.add(dispose); return () => { disposers.delete(dispose); dispose(); }; };
  const snapshot = async () => {
    const [state, track] = await Promise.all([zankyo.core('playback.get'), zankyo.core('playback.getCurrentTrack')]);
    return { state, track };
  };
  const status = ({ state, track }) => ({
    state: state.status === 'starting' ? 'loading' : state.status,
    currentTrackId: track?.catalog?.id ?? track?.reference?.track?.providerTrackId ?? null,
    positionMs: Math.round(state.position * 1000),
    durationMs: Math.round(state.duration * 1000),
    volume: state.volume,
    playbackGeneration: track?.sequence,
    filePath: null,
  });
  const acceptSnapshot = async value => {
    const { state, track } = value;
    if (!queue || queue.queueId !== state.queueId) queue = await zankyo.core('queue.get', { limit: 256 });
    hostState = state;
    current = track;
    playback = status(value);
    queue.position = state.queuePosition;
  };
  const getStatus = async () => {
    assertOpen();
    await acceptSnapshot(await snapshot());
    return structuredClone(playback);
  };
  const control = async (action, input = {}) => {
    assertOpen();
    await zankyo.core('playback.control', { ...input, action });
    return getStatus();
  };
  const queueItem = item => {
    if (item?.kind === 'catalog' || item?.kind === 'source' || item?.kind === 'stream') return item;
    const url = item?.url || item?.source?.url;
    if (url) return {
      kind: 'stream', id: String(item.id || item.trackId || url), title: item.title,
      artist: item.artist || '', album: item.album || '', duration: item.durationSeconds ?? item.duration ?? 0,
      url, ...(item.coverUrl ? { cover: item.coverUrl } : {}),
    };
    const key = item?.trackId || item?.id;
    if (key && (!item.mediaType || item.mediaType === 'local')) return { kind: 'catalog', source: 'Local', id: String(key) };
    throw unsupportedElectron('unresolved media; resolve it in the Loader or register a GPUI source');
  };
  const submit = async (tracks, mode, options = {}) => {
    assertOpen();
    if (!Array.isArray(tracks) || !tracks.length || tracks.length > 500) throw new Error('invalid_compat_queue');
    for (const key of Object.keys(options)) {
      if (!['index', 'startSeconds'].includes(key)) throw unsupportedElectron(`playback option ${key}`);
    }
    if (options.startSeconds !== undefined && (!Number.isFinite(options.startSeconds) || options.startSeconds < 0)) throw new Error('invalid_seek');
    await zankyo.core('queue.submit', { mode, tracks: tracks.map(queueItem), index: options.index || 0 });
    queue = null;
    if (options.startSeconds) await control('seek', { seconds: options.startSeconds });
    return getStatus();
  };
  const echo = {
    app: {
      getSettings: () => { assertOpen(); return zankyo.settings.get(); },
      setSettings: async patch => { assertOpen(); await zankyo.settings.set(patch); return zankyo.settings.get(); },
    },
    playback: {
      getStatus,
      play: () => control('resume'),
      pause: () => control('pause'),
      stop: () => control('stop'),
      seek: seconds => control('seek', { seconds }),
      setRepeatMode: mode => control('setRepeat', { mode }),
      playMediaItem: ({ item, ...options }) => submit([item], 'play', options),
      playLocalFile: ({ trackId, ...options }) => submit([{ trackId }], 'play', options),
      onStatus: handler => {
        assertOpen();
        if (typeof handler !== 'function' || listeners.size >= 128) throw new Error('invalid_status_listener');
        listeners.add(handler);
        return track(() => listeners.delete(handler));
      },
    },
  };
  const publicPath = path => {
    const parts = String(path || '').split('.');
    if (parts.some(part => !/^[a-z_$][\w$]*$/iu.test(part) || ['__proto__', 'prototype', 'constructor'].includes(part))) throw new Error('echo_sdk_path_invalid');
    let owner = echo, value = echo;
    for (const part of parts) { owner = value; value = Object.hasOwn(value || {}, part) ? value[part] : undefined; }
    return { owner, value };
  };
  const player = {
    version: 1, mode: 'zankyo-compat',
    playback: () => echo.playback,
    queue: () => queue && structuredClone(queue),
    status: async () => {
      await getStatus();
      return {
        connected: true, queueBound: true, state: playback.state,
        currentTrackId: playback.currentTrackId || '', currentFilePath: playback.filePath || '',
        positionSeconds: playback.positionMs / 1000, durationSeconds: playback.durationMs / 1000,
        title: current?.title || hostState.title || '', artist: current?.artist || hostState.artist || '',
        album: current?.reference?.track?.album || '',
        mediaType: current?.catalog ? 'local' : current?.reference?.kind === 'source' ? 'streaming' : null,
        provider: current?.reference?.source?.provider || null,
        canGoNext: hostState.queuePosition + 1 < hostState.queueLength,
        canGoPrevious: hostState.queuePosition > 0, queueCount: hostState.queueLength,
        currentTrack: current && {
          id: playback.currentTrackId, title: current.title, artist: current.artist,
          duration: hostState.duration, album: current.reference?.track?.album || '',
        },
      };
    },
    play: echo.playback.play, pause: echo.playback.pause, stop: echo.playback.stop,
    seek: echo.playback.seek, setRepeat: echo.playback.setRepeatMode,
    next: () => control('next'), previous: () => control('previous'),
    playTrack: (item, options) => submit([item], 'play', options),
    playMedia: (item, options) => submit([item], 'play', options),
    playLocal: echo.playback.playLocalFile,
    append: (item, source) => {
      if (source !== undefined) throw unsupportedElectron('queue source metadata');
      return submit([item], 'append');
    },
    replaceQueue: (items, options) => submit(items, 'play', options),
    clearQueue: async () => {
      assertOpen();
      const currentQueue = await zankyo.core('queue.get', { limit: 1 });
      await zankyo.core('queue.edit', { queueId: currentQueue.queueId, edit: { action: 'clear' } });
      queue = null;
    },
    command: async payload => {
      const { action } = payload || {};
      if (action === 'status') return player.status();
      if (['play', 'pause', 'stop', 'next', 'previous'].includes(action)) await player[action]();
      else if (action === 'seek') await player.seek(payload.positionSeconds);
      else if (action === 'setRepeat') await player.setRepeat(payload.mode);
      else if (action === 'playTrack') await player.playTrack(payload.track || payload.item, payload.options);
      else if (action === 'append') await player.append(payload.track || payload.item, payload.source);
      else if (action === 'replaceQueue') await player.replaceQueue(payload.tracks, payload.options);
      else if (action === 'clearQueue') await player.clearQueue();
      else throw unsupportedElectron(`player command ${action}`);
      return player.status();
    },
  };
  const timer = repeat => (handler, delay, ...args) => {
    assertOpen();
    if (typeof handler !== 'function' || timers.size >= 128) throw new Error('invalid_mod_timer');
    const fire = () => {
      if (!repeat) timers.delete(handle);
      if (!closed) {
        try { Promise.resolve(handler(...args)).catch(error => log('timer', error.message)); }
        catch (error) { log('timer', error.message); }
      }
    };
    const handle = (repeat ? setInterval : setTimeout)(fire, Math.max(repeat ? 16 : 0, Number(delay) || 0));
    timers.add(handle);
    handle.unref();
    return handle;
  };
  const clear = handle => { clearTimeout(handle); clearInterval(handle); timers.delete(handle); };
  const modConsole = Object.fromEntries(['debug', 'info', 'log', 'warn', 'error'].map(level => [level, (...values) => log(level, ...values)]));
  const context = {
    baseUrl,
    echo, player, extend: null, console: modConsole,
    log: modConsole.log,
    settings: {
      get: () => { assertOpen(); return settings.get(); },
      set: patch => { assertOpen(); return settings.set(patch); },
    },
    sdk: {
      version: 1, mode: 'zankyo-compat',
      getEcho: () => echo,
      list: (path = '') => Object.keys(path ? publicPath(path).value || {} : echo).sort(),
      get: path => publicPath(path).value,
      call: (path, ...args) => {
        assertOpen();
        const { owner, value } = publicPath(path);
        if (typeof value !== 'function') throw unsupportedElectron(`window.echo.${path}`);
        return value.apply(owner, args);
      },
      status: () => request('/api/status'),
    },
    loaderSettings: {
      get: async () => (await request('/api/ui-settings')).ui,
      set: async patch => (await request('/api/ui-settings', 'PUT', { ui: patch })).ui,
      onChange: handler => {
        assertOpen();
        if (typeof handler !== 'function' || settingsListeners.size >= 128) throw new Error('invalid_settings_listener');
        settingsListeners.add(handler);
        return track(() => settingsListeners.delete(handler));
      },
    },
    assetUrl: file => { packageFile(directory, file); return `${baseUrl}/api/mod/${encodeURIComponent(id)}/file/${encodeURIComponent(file)}`; },
    loadAsset: async (file, options = {}) => {
      assertOpen();
      const path = packageFile(directory, file);
      if ((await stat(path)).size > 8 * 1024 * 1024) throw new Error('mod_asset_too_large');
      const bytes = await readFile(path);
      return options.binary ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes.toString('utf8');
    },
    fetchJson: (url, options = {}) => request('/api/proxy', 'POST', { ...options, url }),
    uploadFile: input => request('/api/upload', 'POST', input),
    toast: message => { assertOpen(); toast(String(message).slice(0, 65536)); },
    sidebar: {
      register: page => {
        assertOpen();
        if (!page?.native) throw unsupportedElectron('sidebar HTML/render; supply a native page descriptor');
        const remove = zankyo.ui.page(page.id || 'main', { label: page.label, body: page.native });
        return track(remove);
      },
    },
    main: { invoke: () => { throw unsupportedElectron('Electron main-process IPC'); } },
    native: { invoke: () => { throw unsupportedElectron('Electron native ABI; use zankyo.native'); } },
  };
  const window = { echo, console: modConsole, setTimeout: timer(false), setInterval: timer(true), clearTimeout: clear, clearInterval: clear };
  window.window = window;
  return {
    context, window,
    get needsStatus() { return !closed && listeners.size > 0; },
    async poll(read = snapshot) {
      if (!this.needsStatus) return;
      const value = await read();
      const next = status(value);
      if (closed) return;
      const changed = JSON.stringify(next) !== JSON.stringify(playback);
      await acceptSnapshot(value);
      if (!changed) return;
      for (const listener of [...listeners]) {
        try { await listener(structuredClone(next)); } catch (error) { log('status listener', error.message); }
      }
    },
    async initialize() {
      await getStatus();
    },
    async uiSettingsChanged(value) {
      if (closed) return;
      for (const listener of [...settingsListeners]) {
        try { await listener(structuredClone(value)); } catch (error) { log('settings listener', error.message); }
      }
    },
    close() {
      closed = true;
      for (const handle of timers) clear(handle);
      for (const dispose of disposers) {
        try { dispose(); } catch (error) { log('cleanup', error.message); }
      }
      disposers.clear();
      listeners.clear();
      settingsListeners.clear();
    },
  };
}
