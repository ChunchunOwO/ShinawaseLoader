'use strict';

const { existsSync } = require('node:fs');
const { createServer } = require('node:net');
const { dirname, join } = require('node:path');
const { spawn } = require('node:child_process');

const idleStatus = (officialEnabled = true) => ({
  state: 'idle',
  playing: false,
  title: '',
  artist: '',
  album: '',
  coverUrl: '',
  positionSeconds: 0,
  durationSeconds: 0,
  trackKey: '',
  officialEnabled: officialEnabled !== false,
  lyricsCurrent: '',
  lyricsNext: '',
  lyricsHas: false,
  lyricsInstrumental: false,
});

const windowUrl = (window) => {
  try { return String(window?.webContents?.getURL?.() || ''); }
  catch { return ''; }
};

const windowTitle = (window) => {
  try { return String(window?.getTitle?.() || ''); }
  catch { return ''; }
};

const isOfficialTaskbar = (window) => {
  try {
    if (!window || window.isDestroyed()) return false;
    const title = windowTitle(window);
    if (/ECHO Taskbar Mini Player/i.test(title) || /Taskbar Mini Player/i.test(title)) return true;
    return /[?&]taskbarMiniPlayer=1/i.test(windowUrl(window));
  } catch {
    return false;
  }
};

const isAuxiliaryWindow = (window) => {
  try {
    if (!window || window.isDestroyed()) return true;
    if (isOfficialTaskbar(window)) return true;
    const title = windowTitle(window);
    if (/ECHO Desktop Lyrics/i.test(title) || /^ECHO Pet$/i.test(title)) return true;
    return /[?&](desktopLyrics|pet|miniPlayer|taskbarMiniPlayer)=1/i.test(windowUrl(window));
  } catch {
    return true;
  }
};

const resolveExe = (dir, spec) => {
  const relative = String(spec?.exe || '').replaceAll('\\', '/');
  if (relative && !relative.includes('..')) {
    const file = join(dir, relative);
    if (existsSync(file)) return file;
  }
  return '';
};

const activate = (host, spec = {}) => {
  const dir = host.directory || __dirname;
  const exe = resolveExe(dir, spec);
  const protocolVersion = Number(spec.protocolVersion) === 1 ? 1 : 1;
  let currentConfig = host.config && typeof host.config === 'object' ? { ...host.config } : {};
  let lastStatus = null;
  let lastSentStatus = '';
  let officialEnabled = true;
  let child = null;
  let socket = null;
  let server = null;
  let buf = '';
  let disposing = false;
  let restarts = 0;
  let restartTimer = 0;
  let hostReady = false;
  let killTimer = 0;
  const pipeName = `echo-ns-${String(host.id || 'shell').replace(/[^a-z0-9._-]+/giu, '-')}-${process.pid}`;
  const BrowserWindow = host.BrowserWindow;

  if (!exe) {
    try { host.log('ERROR', `native-shell exe missing (${spec.exe || 'unset'}). Protocol v${protocolVersion}.`); } catch { /* ignore */ }
  }

  const send = (op, payload) => {
    try {
      if (!socket || socket.destroyed || !socket.writable) return false;
      if (socket.writableLength > 256 * 1024) return false;
      socket.write(`${JSON.stringify({ v: 1, op, payload })}\n`, 'utf8');
      return true;
    } catch {
      return false;
    }
  };

  const withOfficial = (payload) => ({
    ...(payload && typeof payload === 'object' ? payload : idleStatus(officialEnabled)),
    officialEnabled: officialEnabled !== false,
  });

  const pushConfig = () => send('config', currentConfig);

  const coverCache = new Map();
  let coverInflight = '';
  let lastCoverKey = '';
  let lastCoverData = '';

  const isDataCover = (url) => typeof url === 'string' && url.startsWith('data:');

  const fetchCoverData = async (url) => {
    if (!url || isDataCover(url)) return url || '';
    if (coverCache.has(url)) return coverCache.get(url);
    const windows = BrowserWindow?.getAllWindows?.() || [];
    const win = windows.find((window) => {
      try { return window && !window.isDestroyed() && window.webContents && !isAuxiliaryWindow(window); }
      catch { return false; }
    }) || windows.find((window) => {
      try { return window && !window.isDestroyed() && window.webContents; }
      catch { return false; }
    });
    const ses = win?.webContents?.session || host.session?.defaultSession;
    const fetchImpl = ses?.fetch || host.electron?.net?.fetch;
    if (typeof fetchImpl !== 'function') return '';
    const response = await fetchImpl(url);
    if (!response || response.ok === false) return '';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 2 * 1024 * 1024) return '';
    let mime = '';
    try { mime = String(response.headers?.get?.('content-type') || ''); } catch { mime = ''; }
    if (!mime || mime.includes('octet-stream')) {
      if (buffer[0] === 0x89) mime = 'image/png';
      else if (buffer[0] === 0xFF) mime = 'image/jpeg';
      else if (buffer[0] === 0x47) mime = 'image/gif';
      else mime = 'image/jpeg';
    }
    const data = `data:${mime.split(';')[0]};base64,${buffer.toString('base64')}`;
    coverCache.set(url, data);
    while (coverCache.size > 12) coverCache.delete(coverCache.keys().next().value);
    return data;
  };

  const rememberCover = (payload) => {
    const next = withOfficial(payload);
    const url = String(next.coverUrl || '');
    const key = String(next.trackKey || '');
    if (isDataCover(url)) {
      lastCoverKey = key;
      lastCoverData = url;
      return next;
    }
    if (url && coverCache.has(url)) {
      next.coverUrl = coverCache.get(url);
      lastCoverKey = key;
      lastCoverData = next.coverUrl;
      return next;
    }
    if (url) {
      next.coverUrl = key && key === lastCoverKey ? lastCoverData : '';
      if (coverInflight !== url) {
        coverInflight = url;
        const trackKey = key;
        void fetchCoverData(url)
          .then((data) => {
            if (coverInflight === url) coverInflight = '';
            if (!data || !lastStatus) return;
            if (String(lastStatus.trackKey || '') !== trackKey) return;
            lastCoverKey = trackKey;
            lastCoverData = data;
            lastStatus = { ...lastStatus, coverUrl: data };
            if (hostReady) pushStatus(lastStatus, true);
          })
          .catch(() => {
            if (coverInflight === url) coverInflight = '';
          });
      }
      return next;
    }
    if (key && key === lastCoverKey) next.coverUrl = lastCoverData;
    return next;
  };

  const pushStatus = (payload, force) => {
    const next = rememberCover(payload);
    const body = JSON.stringify(next);
    if (!force && body === lastSentStatus) return;
    if (send('status', next)) lastSentStatus = body;
  };

  const focusEcho = () => {
    if (!BrowserWindow?.getAllWindows) return { ok: false, error: 'echo_window_missing' };
    const all = BrowserWindow.getAllWindows() || [];
    const candidates = all.filter((window) => {
      try {
        if (!window || window.isDestroyed() || isAuxiliaryWindow(window)) return false;
        const bounds = window.getBounds();
        if (!bounds || bounds.width < 240 || bounds.height < 180) return false;
        if (bounds.x < -10000 || bounds.y < -10000) return false;
        return true;
      } catch {
        return false;
      }
    });
    candidates.sort((a, b) => {
      try {
        const ba = a.getBounds();
        const bb = b.getBounds();
        return (bb.width * bb.height) - (ba.width * ba.height);
      } catch { return 0; }
    });
    const target = candidates[0];
    if (!target) return { ok: false, error: 'echo_window_missing' };
    try { if (target.isMinimized()) target.restore(); } catch { /* ignore */ }
    try { target.show(); } catch { /* ignore */ }
    try { target.focus(); } catch { /* ignore */ }
    try { target.moveTop(); } catch { /* ignore */ }
    try {
      target.setAlwaysOnTop(true);
      setTimeout(() => {
        try { if (!target.isDestroyed()) target.setAlwaysOnTop(false); } catch { /* ignore */ }
      }, 80);
    } catch { /* ignore */ }
    return { ok: true };
  };

  const handleLine = (line) => {
    if (!line) return;
    let msg = null;
    try { msg = JSON.parse(line); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const op = String(msg.op || '');
    if (op === 'ready') {
      hostReady = true;
      restarts = 0;
      pushConfig();
      pushStatus(lastStatus || idleStatus(officialEnabled), true);
      return;
    }
    if (op === 'log') {
      const level = String(msg.payload?.level || 'INFO').toUpperCase();
      const message = String(msg.payload?.message || '');
      if (message) try { host.log(level, message); } catch { /* ignore */ }
      return;
    }
    if (op !== 'command') return;
    const body = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
    const action = String(body.action || '');
    if (action === 'focusEcho') {
      focusEcho();
      return;
    }
    if (action === 'toggle' || action === 'play' || action === 'pause' || action === 'next' || action === 'previous' || action === 'seekRatio' || action === 'openLyrics') {
      try { host.broadcast('command', body); }
      catch (error) { try { host.log('WARN', error instanceof Error ? error.message : String(error)); } catch { /* ignore */ } }
    }
  };

  const attachSocket = (conn) => {
    try { if (socket && socket !== conn) socket.destroy(); } catch { /* ignore */ }
    socket = conn;
    buf = '';
    conn.setEncoding('utf8');
    conn.on('data', (chunk) => {
      try {
        buf += String(chunk || '');
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, '');
          buf = buf.slice(idx + 1);
          handleLine(line);
        }
      } catch { /* ignore */ }
    });
    conn.on('close', () => {
      if (socket === conn) {
        socket = null;
        hostReady = false;
      }
    });
  };

  const ensurePipe = (then) => {
    if (server && server.listening) {
      then();
      return;
    }
    if (!server) {
      server = createServer((conn) => attachSocket(conn));
      server.on('error', (error) => {
        try { host.log('WARN', `native-shell pipe failed ${error instanceof Error ? error.message : error}`); } catch { /* ignore */ }
      });
      server.listen(`\\\\.\\pipe\\${pipeName}`, then);
      return;
    }
    server.once('listening', then);
  };

  const stopChild = (hard) => {
    hostReady = false;
    try { send('quit'); } catch { /* ignore */ }
    const proc = child;
    child = null;
    if (!proc) return;
    if (hard) {
      try { proc.kill(); } catch { /* ignore */ }
      return;
    }
    try { if (killTimer) clearTimeout(killTimer); } catch { /* ignore */ }
    killTimer = setTimeout(() => {
      killTimer = 0;
      try { if (!proc.killed) proc.kill(); } catch { /* ignore */ }
    }, 400);
  };

  const startHost = () => {
    if (disposing || !exe || child) return;
    ensurePipe(() => {
      if (disposing || child) return;
      try {
        hostReady = false;
        lastSentStatus = '';
        child = spawn(exe, ['--pipe', pipeName], {
          cwd: dirname(exe),
          stdio: 'ignore',
          windowsHide: false,
        });
        child.on('error', (error) => {
          if (disposing) return;
          try { host.log('WARN', `native-shell spawn failed ${error instanceof Error ? error.message : error}`); } catch { /* ignore */ }
        });
        child.on('exit', () => {
          child = null;
          hostReady = false;
          if (disposing) return;
          if (restarts >= 3) {
            try { host.log('WARN', 'native-shell stopped restarting'); } catch { /* ignore */ }
            return;
          }
          restarts += 1;
          restartTimer = setTimeout(() => {
            restartTimer = 0;
            startHost();
          }, 1500);
        });
        try { host.log('INFO', `native-shell started ${spec.exe || exe}`); } catch { /* ignore */ }
      } catch (error) {
        child = null;
        try { host.log('WARN', `native-shell start failed ${error instanceof Error ? error.message : error}`); } catch { /* ignore */ }
      }
    });
  };

  try {
    host.handle('status', (payload) => {
      const next = payload && typeof payload === 'object' ? payload : idleStatus(officialEnabled);
      if (typeof next.officialEnabled === 'boolean') officialEnabled = next.officialEnabled;
      lastStatus = withOfficial(next);
      if (hostReady) pushStatus(lastStatus);
      return { ok: true };
    });
    host.handle('configure', (config) => {
      currentConfig = config && typeof config === 'object' ? { ...currentConfig, ...config } : currentConfig;
      if (!exe) return { ok: false, error: 'native_shell_exe_missing' };
      if (hostReady) pushConfig();
      else startHost();
      return { ok: true };
    });
    host.handle('officialEnabled', (payload) => {
      officialEnabled = payload?.enabled !== false;
      lastStatus = withOfficial(lastStatus || idleStatus(officialEnabled));
      if (hostReady) pushStatus(lastStatus, true);
      return { ok: true, enabled: officialEnabled };
    });
    host.handle('rendererGone', () => {
      lastStatus = idleStatus(officialEnabled);
      if (hostReady) pushStatus(lastStatus, true);
      return { ok: true };
    });
  } catch (error) {
    try { host.log('WARN', `native-shell handlers failed ${error instanceof Error ? error.message : String(error)}`); } catch { /* ignore */ }
  }

  startHost();

  return () => {
    disposing = true;
    try { if (restartTimer) clearTimeout(restartTimer); } catch { /* ignore */ }
    restartTimer = 0;
    try { if (killTimer) clearTimeout(killTimer); } catch { /* ignore */ }
    killTimer = 0;
    stopChild(true);
    try { if (socket) socket.destroy(); } catch { /* ignore */ }
    socket = null;
    try { if (server) server.close(); } catch { /* ignore */ }
    server = null;
    lastStatus = null;
  };
};

module.exports = activate;
exports.activate = activate;
