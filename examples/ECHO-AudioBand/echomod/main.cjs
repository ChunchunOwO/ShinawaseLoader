'use strict';

const { join } = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULTS = {
  locale: 'auto',
  widgetWidth: 360,
  alignment: 'right',
  offsetX: 180,
  offsetY: 0,
  monitor: 'primary',
  customHeight: 48,
  showAlbumArt: true,
  showControls: true,
  showProgress: true,
  showTime: false,
  theme: 'auto',
  accentColor: '#4da3ff',
  backgroundOpacity: 88,
  scrollingText: true,
  autoHideWhenStopped: false,
  pollIntervalMs: 1000,
  autoAvoidTray: true,
  seamlessMode: false,
  hoverPreview: true,
};

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const normalizeConfig = (input) => {
  const raw = input && typeof input === 'object' ? input : {};
  const alignment = ['left', 'center', 'right'].includes(raw.alignment) ? raw.alignment : DEFAULTS.alignment;
  const theme = ['auto', 'dark', 'light'].includes(raw.theme) ? raw.theme : DEFAULTS.theme;
  const locale = ['auto', 'zh-CN', 'en-US'].includes(raw.locale) ? raw.locale : 'auto';
  const accent = typeof raw.accentColor === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(raw.accentColor.trim())
    ? raw.accentColor.trim()
    : DEFAULTS.accentColor;
  let monitor = raw.monitor == null || raw.monitor === '' ? 'primary' : raw.monitor;
  if (monitor !== 'primary') {
    const index = Number(monitor);
    monitor = Number.isInteger(index) && index >= 0 ? String(index) : 'primary';
  }
  return {
    locale,
    widgetWidth: clamp(raw.widgetWidth, 200, 800, DEFAULTS.widgetWidth),
    alignment,
    offsetX: clamp(raw.offsetX, 0, 600, DEFAULTS.offsetX),
    offsetY: clamp(raw.offsetY, -80, 80, DEFAULTS.offsetY),
    monitor,
    customHeight: clamp(raw.customHeight, 28, 80, DEFAULTS.customHeight),
    showAlbumArt: raw.showAlbumArt !== false,
    showControls: raw.showControls !== false,
    showProgress: raw.showProgress !== false,
    showTime: raw.showTime === true,
    theme,
    accentColor: accent,
    backgroundOpacity: clamp(raw.backgroundOpacity, 0, 100, DEFAULTS.backgroundOpacity),
    scrollingText: raw.scrollingText !== false,
    autoHideWhenStopped: raw.autoHideWhenStopped === true,
    pollIntervalMs: clamp(raw.pollIntervalMs, 250, 5000, DEFAULTS.pollIntervalMs),
    autoAvoidTray: raw.autoAvoidTray !== false,
    seamlessMode: raw.seamlessMode === true,
    hoverPreview: raw.hoverPreview !== false,
  };
};

const idleStatus = () => ({
  state: 'idle',
  playing: false,
  title: '',
  artist: '',
  album: '',
  coverUrl: '',
  positionSeconds: 0,
  durationSeconds: 0,
  trackKey: '',
});

const rectOk = (value) => value && typeof value === 'object' && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y));

const activate = (host) => {
  if (!host?.BrowserWindow) {
    try { host?.log?.('WARN', 'BrowserWindow unavailable'); } catch {}
    return () => {};
  }

  const BrowserWindow = host.BrowserWindow;
  const screen = host.electron?.screen;
  const dir = host.directory || __dirname;
  let win = null;
  let preview = null;
  let currentConfig = normalizeConfig(host.config);
  let lastStatus = null;
  let readyToShow = false;
  let stoppedSince = 0;
  let pollTimer = 0;
  let disposing = false;
  let lastLightTheme = false;
  let lastNotify = null;
  let helper = null;
  let helperBuf = '';
  let helperReqId = 0;
  const helperPending = new Map();
  let helperRestarts = 0;
  let helperUnavailable = false;
  let helperRestartTimer = 0;
  let previewHideTimer = 0;
  let previewReady = false;
  let previewPendingShow = false;

  const widgetAlive = () => {
    try { return Boolean(win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()); }
    catch { return false; }
  };

  const previewAlive = () => {
    try { return Boolean(preview && !preview.isDestroyed() && preview.webContents && !preview.webContents.isDestroyed()); }
    catch { return false; }
  };

  const helperReady = () => {
    try { return Boolean(!helperUnavailable && helper && helper.stdin && !helper.killed); }
    catch { return false; }
  };

  const rejectHelperPending = (reason) => {
    for (const [, pending] of helperPending) {
      try { clearTimeout(pending.timer); } catch {}
      try { pending.resolve({ ok: false, error: reason }); } catch {}
    }
    helperPending.clear();
  };

  const helperRequest = (op, extra) => new Promise((resolve) => {
    if (!helperReady()) {
      resolve({ ok: false, error: 'unavailable' });
      return;
    }
    const id = ++helperReqId;
    const timer = setTimeout(() => {
      helperPending.delete(id);
      resolve({ ok: false, error: 'timeout' });
    }, 3000);
    helperPending.set(id, { resolve, timer });
    try {
      helper.stdin.write(`${JSON.stringify({ id, op, ...(extra && typeof extra === 'object' ? extra : {}) })}\n`, 'utf8');
    } catch {
      try { clearTimeout(timer); } catch {}
      helperPending.delete(id);
      resolve({ ok: false, error: 'write_failed' });
    }
  });

  const startHelper = () => {
    if (disposing || helperUnavailable || helper) return;
    try {
      helperBuf = '';
      helper = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(host.directory || dir, 'taskbar-helper.ps1'),
      ], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
      try { helper.stdout.setEncoding('utf8'); } catch {}
      helper.stdout.on('data', (chunk) => {
        try {
          helperBuf += String(chunk || '');
          let idx;
          while ((idx = helperBuf.indexOf('\n')) >= 0) {
            const line = helperBuf.slice(0, idx).replace(/\r$/, '');
            helperBuf = helperBuf.slice(idx + 1);
            if (!line.trim()) continue;
            let msg = null;
            try { msg = JSON.parse(line); } catch { continue; }
            const pending = helperPending.get(msg.id) || helperPending.get(Number(msg.id));
            if (!pending) continue;
            try { clearTimeout(pending.timer); } catch {}
            helperPending.delete(msg.id);
            helperPending.delete(Number(msg.id));
            pending.resolve(msg);
          }
        } catch {}
      });
      helper.on('error', (error) => {
        if (disposing) return;
        try { host.log('WARN', `taskbar helper spawn failed ${error instanceof Error ? error.message : error}`); } catch {}
        helperUnavailable = true;
      });
      helper.on('exit', () => {
        helper = null;
        helperBuf = '';
        rejectHelperPending('exited');
        if (disposing || helperUnavailable) return;
        if (helperRestarts >= 3) {
          helperUnavailable = true;
          lastNotify = null;
          return;
        }
        helperRestarts += 1;
        helperRestartTimer = setTimeout(() => {
          helperRestartTimer = 0;
          startHelper();
        }, 2000);
      });
    } catch (error) {
      helper = null;
      helperUnavailable = true;
      try { host.log('WARN', `taskbar helper spawn failed ${error instanceof Error ? error.message : error}`); } catch {}
    }
  };

  const publicConfig = () => ({
    ...currentConfig,
    resolvedTheme: currentConfig.theme === 'auto' ? (lastLightTheme ? 'light' : 'dark') : currentConfig.theme,
    seamless: currentConfig.seamlessMode === true,
  });

  const sendTo = (target, channel, payload) => {
    try {
      if (!target || target.isDestroyed() || !target.webContents || target.webContents.isDestroyed()) return;
      target.webContents.send(channel, payload);
    } catch {}
  };

  const sendAll = (channel, payload) => {
    sendTo(win, channel, payload);
    sendTo(preview, channel, payload);
  };

  const pushConfig = () => {
    sendAll('echo.audioband:config', publicConfig());
  };

  const pickDisplay = () => {
    const displays = screen?.getAllDisplays?.() || [];
    if (currentConfig.monitor !== 'primary') {
      const index = Number(currentConfig.monitor);
      if (Number.isInteger(index) && displays[index]) return displays[index];
    }
    try { return screen.getPrimaryDisplay() || displays[0] || null; }
    catch { return displays[0] || null; }
  };

  const inspectTaskbar = () => {
    const display = pickDisplay();
    const width = currentConfig.widgetWidth;
    if (!display) {
      return {
        display: null,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        work: { x: 0, y: 0, width: 1920, height: 1080 },
        edge: 'bottom',
        thickness: 0,
        vertical: false,
        floating: true,
        height: currentConfig.customHeight,
        width,
      };
    }
    const bounds = display.bounds;
    const work = display.workArea || bounds;
    const left = Math.max(0, work.x - bounds.x);
    const top = Math.max(0, work.y - bounds.y);
    const right = Math.max(0, (bounds.x + bounds.width) - (work.x + work.width));
    const bottom = Math.max(0, (bounds.y + bounds.height) - (work.y + work.height));
    let edge = 'bottom';
    let thickness = bottom;
    if (top > thickness) { edge = 'top'; thickness = top; }
    if (left > thickness) { edge = 'left'; thickness = left; }
    if (right > thickness) { edge = 'right'; thickness = right; }
    const vertical = edge === 'left' || edge === 'right';
    const floating = vertical || thickness < 8;
    const height = floating ? currentConfig.customHeight : Math.min(80, Math.max(28, Math.round(thickness)));
    return { display, bounds, work, edge, thickness, vertical, floating, height, width };
  };

  const notifyCenterInDisplay = (display) => {
    if (!rectOk(lastNotify) || !display) return false;
    const cx = Number(lastNotify.x) + (Number(lastNotify.w) || 0) / 2;
    const cy = Number(lastNotify.y) + (Number(lastNotify.h) || 0) / 2;
    const b = display.bounds;
    return cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height;
  };

  const computeGeometry = () => {
    try {
      const info = inspectTaskbar();
      const { bounds, work, edge, thickness, floating, height, width } = info;
      const offsetX = currentConfig.offsetX;
      const offsetY = currentConfig.offsetY;
      const align = currentConfig.alignment;
      let x = 0;
      let y = 0;
      if (!floating) {
        const stripY = edge === 'top' ? bounds.y : bounds.y + bounds.height - thickness;
        const stripX = bounds.x;
        const stripW = bounds.width;
        y = stripY + offsetY;
        if (align === 'left') x = stripX + offsetX;
        else if (align === 'center') x = stripX + Math.round((stripW - width) / 2);
        else if (
          currentConfig.autoAvoidTray
          && helperReady()
          && rectOk(lastNotify)
          && notifyCenterInDisplay(info.display)
        ) {
          x = Number(lastNotify.x) - width - 8;
        } else {
          x = stripX + stripW - width - offsetX;
        }
      } else {
        const margin = 10;
        y = work.y + work.height - height - margin + offsetY;
        if (align === 'left') x = work.x + margin;
        else if (align === 'center') x = work.x + Math.round((work.width - width) / 2);
        else x = work.x + work.width - width - margin;
      }
      x = Math.round(Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - width)));
      y = Math.round(Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - height)));
      return { x, y, width: Math.round(width), height: Math.round(height) };
    } catch (error) {
      try { host.log('WARN', `geometry failed ${error instanceof Error ? error.message : error}`); } catch {}
      return { x: 80, y: 80, width: currentConfig.widgetWidth, height: currentConfig.customHeight };
    }
  };

  const assertTopmost = () => {
    try {
      if (!widgetAlive()) return;
      win.setAlwaysOnTop(true, 'screen-saver');
    } catch {}
  };

  const showWidget = () => {
    try {
      if (!widgetAlive() || !readyToShow) return;
      if (!win.isVisible()) win.showInactive();
      assertTopmost();
    } catch {}
  };

  const hideWidget = () => {
    try { if (widgetAlive() && win.isVisible()) win.hide(); } catch {}
  };

  const isLiveStatus = (payload) => {
    const state = payload?.state;
    const titled = Boolean(payload?.title);
    return (state === 'playing' || state === 'paused') && titled;
  };

  const isIdleStatus = (payload) => {
    if (!payload) return true;
    if (payload.state === 'idle' || payload.state === 'stopped') return true;
    return !payload.title;
  };

  const considerAutoHide = () => {
    try {
      if (!currentConfig.autoHideWhenStopped) {
        stoppedSince = 0;
        showWidget();
        return;
      }
      if (isLiveStatus(lastStatus)) {
        stoppedSince = 0;
        showWidget();
        return;
      }
      if (!isIdleStatus(lastStatus)) {
        stoppedSince = 0;
        showWidget();
        return;
      }
      if (!stoppedSince) stoppedSince = Date.now();
      if (Date.now() - stoppedSince >= 8000) hideWidget();
    } catch {}
  };

  const applyGeometry = () => {
    try {
      if (!widgetAlive()) return;
      win.setBounds(computeGeometry());
      assertTopmost();
    } catch (error) {
      try { host.log('WARN', `resize failed ${error instanceof Error ? error.message : error}`); } catch {}
    }
  };

  const refreshHelper = async () => {
    if (!helperReady()) return;
    const res = await helperRequest('query');
    if (!res?.ok) return;
    lastNotify = rectOk(res.notify) ? res.notify : null;
    const nextLight = res.lightTheme === true;
    const flipped = nextLight !== lastLightTheme;
    lastLightTheme = nextLight;
    if (flipped) pushConfig();
  };

  const ensurePreview = () => {
    if (previewAlive()) return preview;
    try {
      previewReady = false;
      preview = new BrowserWindow({
        width: 264,
        height: 324,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        focusable: false,
        skipTaskbar: true,
        hasShadow: false,
        alwaysOnTop: true,
        type: 'toolbar',
        show: false,
        backgroundColor: '#00000000',
        webPreferences: {
          preload: join(dir, 'widget-preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          backgroundThrottling: false,
        },
      });
      try { preview.setMenu(null); } catch {}
      try { preview.setAlwaysOnTop(true, 'screen-saver'); } catch {}
      try { preview.setIgnoreMouseEvents(true); } catch {}
      preview.once('ready-to-show', () => {
        previewReady = true;
        if (previewPendingShow) {
          previewPendingShow = false;
          try { placePreview(); if (previewAlive()) preview.showInactive(); } catch {}
        }
      });
      preview.on('closed', () => { preview = null; });
      preview.loadFile(join(dir, 'preview.html')).catch((error) => {
        try { host.log('WARN', `preview load failed ${error instanceof Error ? error.message : error}`); } catch {}
      });
    } catch (error) {
      try { host.log('WARN', `preview create failed ${error instanceof Error ? error.message : error}`); } catch {}
      preview = null;
    }
    return preview;
  };

  const placePreview = () => {
    if (!previewAlive()) return;
    try {
      const display = pickDisplay();
      const work = display?.workArea || display?.bounds;
      const w = 264;
      const h = 324;
      let x = 80;
      let y = 80;
      if (widgetAlive()) {
        const b = win.getBounds();
        x = b.x;
        y = b.y - h - 8;
        if (work && y < work.y) y = b.y + b.height + 8;
      }
      if (work) {
        x = Math.max(work.x, Math.min(x, work.x + work.width - w));
        y = Math.max(work.y, Math.min(y, work.y + work.height - h));
      }
      preview.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
    } catch {}
  };

  const showPreview = () => {
    try {
      if (currentConfig.hoverPreview === false) return;
      if (previewHideTimer) {
        clearTimeout(previewHideTimer);
        previewHideTimer = 0;
      }
      ensurePreview();
      if (!previewReady) {
        previewPendingShow = true;
        if (previewAlive()) {
          sendTo(preview, 'echo.audioband:config', publicConfig());
          if (lastStatus) sendTo(preview, 'echo.audioband:status', lastStatus);
        }
        return;
      }
      placePreview();
      if (previewAlive()) {
        sendTo(preview, 'echo.audioband:config', publicConfig());
        if (lastStatus) sendTo(preview, 'echo.audioband:status', lastStatus);
        preview.showInactive();
      }
    } catch {}
  };

  const hidePreview = () => {
    try {
      previewPendingShow = false;
      if (previewHideTimer) clearTimeout(previewHideTimer);
      previewHideTimer = setTimeout(() => {
        previewHideTimer = 0;
        try { if (previewAlive() && preview.isVisible()) preview.hide(); } catch {}
      }, 200);
    } catch {}
  };

  const onDisplayChange = () => {
    try { applyGeometry(); } catch {}
  };

  const focusEcho = () => {
    const all = BrowserWindow.getAllWindows?.() || [];
    const skip = new Set();
    try { if (win) skip.add(win.id); } catch {}
    try { if (preview) skip.add(preview.id); } catch {}
    const candidates = all.filter((w) => {
      try { return w && !w.isDestroyed() && !skip.has(w.id); }
      catch { return false; }
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
    try { if (target.isMinimized()) target.restore(); } catch {}
    try { target.show(); } catch {}
    try { target.focus(); } catch {}
    return { ok: true };
  };

  try { startHelper(); } catch {}

  const geo = computeGeometry();
  try {
    win = new BrowserWindow({
      width: geo.width,
      height: geo.height,
      x: geo.x,
      y: geo.y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      type: 'toolbar',
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(dir, 'widget-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    try { win.setMenu(null); } catch {}
    assertTopmost();
    try { win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: false }); } catch {}
    win.once('ready-to-show', () => {
      readyToShow = true;
      considerAutoHide();
      if (!currentConfig.autoHideWhenStopped || isLiveStatus(lastStatus) || !isIdleStatus(lastStatus) || !stoppedSince) {
        showWidget();
      }
    });
    win.on('closed', () => { win = null; });
    win.loadFile(join(dir, 'widget.html')).catch((error) => {
      try { host.log('WARN', `widget load failed ${error instanceof Error ? error.message : error}`); } catch {}
    });
    try { host.log('INFO', 'widget window created'); } catch {}
  } catch (error) {
    try { host.log('WARN', `widget create failed ${error instanceof Error ? error.message : error}`); } catch {}
    win = null;
  }

  try {
    screen?.on?.('display-metrics-changed', onDisplayChange);
    screen?.on?.('display-added', onDisplayChange);
    screen?.on?.('display-removed', onDisplayChange);
  } catch (error) {
    try { host.log('WARN', `screen listeners failed ${error instanceof Error ? error.message : error}`); } catch {}
  }

  void refreshHelper().then(() => applyGeometry());

  pollTimer = setInterval(() => {
    void (async () => {
      try {
        await refreshHelper();
        applyGeometry();
        considerAutoHide();
      } catch {}
    })();
  }, 5000);

  try {
    host.handle('status', (payload) => {
      try {
        lastStatus = payload && typeof payload === 'object' ? payload : idleStatus();
        sendAll('echo.audioband:status', lastStatus);
        considerAutoHide();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    host.handle('configure', (config) => {
      try {
        currentConfig = normalizeConfig({ ...currentConfig, ...(config && typeof config === 'object' ? config : {}) });
        applyGeometry();
        pushConfig();
        considerAutoHide();
        if (currentConfig.hoverPreview === false) hidePreview();
        return { ok: true };
      } catch (error) {
        try { host.log('WARN', `configure failed ${error instanceof Error ? error.message : error}`); } catch {}
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    host.handle('rendererGone', () => {
      try {
        lastStatus = idleStatus();
        sendAll('echo.audioband:status', lastStatus);
        considerAutoHide();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
  } catch (error) {
    try { host.log('WARN', `handlers failed ${error instanceof Error ? error.message : error}`); } catch {}
  }

  try {
    host.ipc.handle('echo.audioband:command', (_event, payload) => {
      try {
        const body = payload && typeof payload === 'object' ? payload : {};
        const action = String(body.action || '');
        try { host.log('INFO', `widget command ${action || 'empty'}`); } catch {}
        if (action === 'focusEcho') return focusEcho();
        if (action === 'toggle' || action === 'play' || action === 'pause' || action === 'next' || action === 'previous' || action === 'seekRatio') {
          try { host.broadcast('command', body); } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) };
          }
          return { ok: true };
        }
        return { ok: false, error: 'unknown_action' };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    host.ipc.on('echo.audioband:ready', () => {
      try {
        sendAll('echo.audioband:config', publicConfig());
        if (lastStatus) sendAll('echo.audioband:status', lastStatus);
      } catch {}
    });
    host.ipc.on('echo.audioband:preview', (_event, payload) => {
      try {
        if (payload && payload.show === true) showPreview();
        else hidePreview();
      } catch {}
    });
  } catch (error) {
    try { host.log('WARN', `ipc failed ${error instanceof Error ? error.message : error}`); } catch {}
  }

  return () => {
    disposing = true;
    try { if (pollTimer) clearInterval(pollTimer); } catch {}
    pollTimer = 0;
    try { if (helperRestartTimer) clearTimeout(helperRestartTimer); } catch {}
    helperRestartTimer = 0;
    try { if (previewHideTimer) clearTimeout(previewHideTimer); } catch {}
    previewHideTimer = 0;
    try { screen?.removeListener?.('display-metrics-changed', onDisplayChange); } catch {}
    try { screen?.removeListener?.('display-added', onDisplayChange); } catch {}
    try { screen?.removeListener?.('display-removed', onDisplayChange); } catch {}
    try { screen?.off?.('display-metrics-changed', onDisplayChange); } catch {}
    try { screen?.off?.('display-added', onDisplayChange); } catch {}
    try { screen?.off?.('display-removed', onDisplayChange); } catch {}
    try {
      if (preview && !preview.isDestroyed()) {
        try { preview.hide(); } catch {}
        try { preview.close(); } catch {}
        try { if (!preview.isDestroyed()) preview.destroy(); } catch {}
      }
    } catch {}
    preview = null;
    try {
      if (win && !win.isDestroyed()) {
        try { win.hide(); } catch {}
        try { win.close(); } catch {}
        try { if (!win.isDestroyed()) win.destroy(); } catch {}
      }
    } catch {}
    win = null;
    lastStatus = null;
    try { rejectHelperPending('disposed'); } catch {}
    try { if (helper) helper.kill(); } catch {}
    helper = null;
  };
};

module.exports = activate;
exports.activate = activate;
