/* Wallpaper Bridge page. Consumes ECHO's Wallpaper Engine SSE bridge (see ECHO examples/wallpaper-engine). */
const external = echoExternalMod;
const config = external.config && typeof external.config === 'object' ? external.config : {};
const chinese = String(document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('zh');
const t = (zh, en) => (chinese ? zh : en);

const normalizeBase = (value) => {
  const raw = String(value || '').trim().replace(/\/+$/u, '');
  if (!raw) return '';
  // Without a scheme the URL would resolve relative to the app origin.
  return /^[a-z][a-z0-9+.-]*:\/\//iu.test(raw) ? raw : `http://${raw}`;
};
const bridgeUrl = normalizeBase(config.bridgeUrl) || 'http://127.0.0.1:47668';
const barCount = Math.max(8, Math.min(32, Math.round(Number(config.barCount) || 32)));
const applyCssVariables = config.applyCssVariables === true;
const accentOverride = /^#[0-9a-f]{6}$/iu.test(String(config.accentColor || '')) ? String(config.accentColor) : '';

let source = null;
let snapshot = null;
let connected = false;
let disposed = false;
let dataVersion = 0;
const pageDisposers = new Set();

const clamp01 = (value) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);
const formatTime = (seconds) => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};
// The loader's Appearance accent override is applied per loader surface (not on
// :root), so resolve tokens against the mounted page when available. Cached with
// a short TTL because this runs inside the canvas draw loop.
let accentHost = null;
let accentCache = '';
let accentCacheAt = 0;
const accentColor = () => {
  if (accentOverride) return accentOverride;
  const now = Date.now();
  if (accentCache && now - accentCacheAt < 1000) return accentCache;
  const styles = getComputedStyle(accentHost?.isConnected ? accentHost : document.documentElement);
  accentCache = styles.getPropertyValue('--theme-accent-solid-bg').trim()
    || styles.getPropertyValue('--theme-accent').trim()
    || styles.getPropertyValue('--color-accent').trim()
    || '#4b55e8';
  accentCacheAt = now;
  return accentCache;
};

// Mirrors the official helper script served at <bridge>/echo-wallpaper-engine.js,
// so themes and other mods can consume the same variable names.
const sceneVarNames = ['energy', 'transient', 'bass', 'mid', 'treble', 'pressure', 'headroom-db', 'clipping-risk'];
const applySceneCssVars = (value) => {
  const scene = value?.scene;
  if (!scene) return;
  const rootStyle = document.documentElement.style;
  const rootDataset = document.documentElement.dataset;
  if (rootDataset.echoWallpaperBridge !== 'connected') rootDataset.echoWallpaperBridge = 'connected';
  const mode = scene.mode || 'idle';
  if (rootDataset.echoWallpaperMode !== mode) rootDataset.echoWallpaperMode = mode;
  rootStyle.setProperty('--echo-wallpaper-energy', clamp01(scene.energy).toFixed(3));
  rootStyle.setProperty('--echo-wallpaper-transient', clamp01(scene.transient).toFixed(3));
  rootStyle.setProperty('--echo-wallpaper-bass', clamp01(scene.bass).toFixed(3));
  rootStyle.setProperty('--echo-wallpaper-mid', clamp01(scene.mid).toFixed(3));
  rootStyle.setProperty('--echo-wallpaper-treble', clamp01(scene.treble).toFixed(3));
  rootStyle.setProperty('--echo-wallpaper-pressure', clamp01(scene.pressure).toFixed(3));
  rootStyle.setProperty('--echo-wallpaper-headroom-db', Number.isFinite(scene.headroomDb) ? scene.headroomDb.toFixed(1) : '0');
  rootStyle.setProperty('--echo-wallpaper-clipping-risk', scene.clippingRisk ? '1' : '0');
  (Array.isArray(scene.bands) ? scene.bands : []).slice(0, 12).forEach((band, index) => {
    rootStyle.setProperty(`--echo-wallpaper-band-${index}`, clamp01(band).toFixed(3));
  });
};
const clearSceneCssVars = () => {
  const rootStyle = document.documentElement.style;
  delete document.documentElement.dataset.echoWallpaperBridge;
  delete document.documentElement.dataset.echoWallpaperMode;
  sceneVarNames.forEach((name) => rootStyle.removeProperty(`--echo-wallpaper-${name}`));
  for (let index = 0; index < 12; index += 1) rootStyle.removeProperty(`--echo-wallpaper-band-${index}`);
};

const statusListeners = new Set();
const notifyStatus = () => statusListeners.forEach((listener) => { try { listener(); } catch {} });

let reconnectTimer = 0;
const scheduleReconnect = () => {
  if (disposed || reconnectTimer) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    if (disposed) return;
    if (source && source.readyState !== EventSource.CLOSED) return;
    if (source) { try { source.close(); } catch {} source = null; }
    connect();
  }, 5000);
};
const connect = () => {
  if (disposed || source) return;
  let stream;
  try {
    stream = new EventSource(`${bridgeUrl}/events`);
  } catch {
    connected = false;
    notifyStatus();
    scheduleReconnect();
    return;
  }
  source = stream;
  stream.addEventListener('open', () => {
    if (stream !== source) return;
    connected = true;
    notifyStatus();
  });
  stream.addEventListener('snapshot', (event) => {
    if (stream !== source) return;
    try {
      snapshot = JSON.parse(event.data);
      connected = true;
      dataVersion += 1;
      if (applyCssVariables) applySceneCssVars(snapshot);
      notifyStatus();
    } catch {}
  });
  stream.addEventListener('error', () => {
    if (stream !== source) return;
    connected = false;
    if (applyCssVariables && document.documentElement.dataset.echoWallpaperBridge === 'connected') {
      document.documentElement.dataset.echoWallpaperBridge = 'disconnected';
    }
    notifyStatus();
    // EventSource retries transient drops on its own, but a fatal response
    // (non-200, wrong content type) leaves it CLOSED with no retry.
    if (stream.readyState === EventSource.CLOSED) scheduleReconnect();
  });
};
const disconnect = () => {
  if (reconnectTimer) { window.clearTimeout(reconnectTimer); reconnectTimer = 0; }
  if (source) { try { source.close(); } catch {} source = null; }
  connected = false;
};
// Only hold a background SSE connection when the CSS variables need it;
// otherwise connect lazily when the page is first opened.
if (applyCssVariables) connect();

const renderPage = (root) => {
  root.innerHTML = `
    <style>
      .wpb-page { display: grid; gap: 16px; padding: 24px 28px; font: 13px/1.5 var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif); color: var(--theme-page-text, inherit); }
      .wpb-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .wpb-head h1 { margin: 0; font-size: 20px; color: var(--theme-heading-text, inherit); }
      .wpb-status { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1)); background: var(--theme-panel-bg, rgba(127,127,127,0.05)); font-size: 12px; }
      .wpb-status i { width: 8px; height: 8px; border-radius: 50%; background: var(--theme-danger-text, #c0392b); }
      .wpb-status[data-connected="true"] i { background: var(--theme-success-text, #1a7f37); }
      .wpb-card { display: grid; gap: 14px; padding: 16px 18px; border-radius: 14px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1)); background: var(--theme-panel-bg, rgba(127,127,127,0.04)); }
      .wpb-track { display: flex; align-items: center; gap: 14px; min-height: 64px; }
      .wpb-track img { width: 64px; height: 64px; border-radius: 12px; object-fit: cover; background: var(--theme-panel-bg-muted, rgba(127,127,127,0.1)); }
      .wpb-track strong { display: block; font-size: 15px; color: var(--theme-heading-text, inherit); }
      .wpb-track span { display: block; margin-top: 2px; color: var(--theme-muted-text, #6c7179); font-size: 12px; }
      .wpb-track small { display: block; margin-top: 4px; color: var(--theme-subtle-text, #a0a4aa); font-variant-numeric: tabular-nums; }
      .wpb-canvas { width: 100%; height: 160px; border-radius: 10px; background: var(--theme-panel-bg-muted, rgba(127,127,127,0.06)); }
      .wpb-meters { display: grid; gap: 8px; }
      .wpb-meter { display: grid; grid-template-columns: 84px 1fr 3.2em; align-items: center; gap: 10px; font-size: 12px; color: var(--theme-muted-text, #6c7179); }
      .wpb-meter-track { height: 6px; border-radius: 999px; background: var(--theme-panel-bg-muted, rgba(127,127,127,0.12)); overflow: hidden; }
      .wpb-meter-track i { display: block; height: 100%; width: 0; border-radius: 999px; background: var(--wpb-accent, #4b55e8); transition: width .12s linear; }
      .wpb-meter output { text-align: right; font-variant-numeric: tabular-nums; }
      .wpb-facts { display: flex; gap: 8px; flex-wrap: wrap; }
      .wpb-facts span { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1)); background: var(--theme-panel-bg-muted, rgba(127,127,127,0.05)); font-size: 11px; color: var(--theme-muted-text, #6c7179); }
      .wpb-offline { display: grid; gap: 8px; justify-items: start; padding: 14px 16px; border-radius: 12px; border: 1px dashed var(--theme-panel-border, rgba(38,40,46,0.16)); color: var(--theme-muted-text, #6c7179); }
      .wpb-offline button { padding: 7px 14px; border-radius: 9px; cursor: pointer; border: 1px solid var(--theme-button-border, rgba(38,40,46,0.12)); background: var(--theme-button-bg, rgba(255,255,255,0.72)); color: inherit; font: inherit; }
      .wpb-hint { color: var(--theme-subtle-text, #a0a4aa); font-size: 12px; }
    </style>
    <div class="wpb-page">
      <div class="wpb-head">
        <h1></h1>
        <span class="wpb-status"><i></i><em data-status-text></em></span>
      </div>
      <div class="wpb-offline" hidden>
        <span data-offline-text></span>
        <button type="button" data-retry></button>
      </div>
      <section class="wpb-card">
        <div class="wpb-track">
          <img data-cover alt="" hidden>
          <div>
            <strong data-title></strong>
            <span data-artist></span>
            <small data-time></small>
          </div>
        </div>
        <canvas class="wpb-canvas" data-canvas></canvas>
        <div class="wpb-meters">
          <div class="wpb-meter"><label data-energy-label></label><span class="wpb-meter-track"><i data-energy></i></span><output data-energy-out>0%</output></div>
          <div class="wpb-meter"><label data-transient-label></label><span class="wpb-meter-track"><i data-transient></i></span><output data-transient-out>0%</output></div>
        </div>
        <div class="wpb-facts" data-facts></div>
      </section>
      <p class="wpb-hint" data-hint></p>
    </div>
  `;

  const page = root.querySelector('.wpb-page');
  accentHost = page;
  const applyAccent = () => {
    accentCacheAt = 0;
    dataVersion += 1;
    page.style.setProperty('--wpb-accent', accentColor());
  };
  applyAccent();
  // Follow the loader Appearance accent (and any live changes to it).
  const disposeAccentWatch = external.loaderSettings?.onChange?.(() => applyAccent()) || null;
  connect();
  root.querySelector('h1').textContent = t('壁纸桥接', 'Wallpaper Bridge');
  root.querySelector('[data-retry]').textContent = t('重新连接', 'Reconnect');
  root.querySelector('[data-energy-label]').textContent = t('能量', 'Energy');
  root.querySelector('[data-transient-label]').textContent = t('瞬态', 'Transient');
  root.querySelector('[data-hint]').textContent = t(
    `与 Wallpaper Engine 网页壁纸共用同一数据源：${bridgeUrl}/events（另有 /snapshot 与 /echo-wallpaper-engine.js）。`,
    `Shares the same data source as Wallpaper Engine web wallpapers: ${bridgeUrl}/events (plus /snapshot and /echo-wallpaper-engine.js).`,
  );
  root.querySelector('[data-offline-text]').textContent = t(
    '未连接到桥接服务。请确认正在运行支持 Wallpaper Engine 桥接的 ECHO 版本，且地址配置正确。',
    'Bridge is unreachable. Make sure this ECHO build ships the Wallpaper Engine bridge and the configured URL is correct.',
  );
  root.querySelector('[data-retry]').addEventListener('click', () => { disconnect(); connect(); });

  const statusBadge = root.querySelector('.wpb-status');
  const statusText = root.querySelector('[data-status-text]');
  const offline = root.querySelector('.wpb-offline');
  const cover = root.querySelector('[data-cover]');
  const title = root.querySelector('[data-title]');
  const artist = root.querySelector('[data-artist]');
  const time = root.querySelector('[data-time]');
  const energyFill = root.querySelector('[data-energy]');
  const energyOut = root.querySelector('[data-energy-out]');
  const transientFill = root.querySelector('[data-transient]');
  const transientOut = root.querySelector('[data-transient-out]');
  const facts = root.querySelector('[data-facts]');
  const canvas = root.querySelector('[data-canvas]');
  const context = canvas.getContext('2d');

  let raf = 0;
  let idleTimer = 0;
  let factsKey = '';
  let coverUrl = '';
  cover.addEventListener('error', () => { cover.hidden = true; });

  const updateInfo = () => {
    statusBadge.dataset.connected = String(connected);
    statusText.textContent = connected ? t('已连接', 'Connected') : t('未连接', 'Disconnected');
    offline.hidden = connected;
    const track = snapshot?.track || {};
    title.textContent = track.title || t('暂无播放', 'Nothing playing');
    artist.textContent = [track.artist, track.album].filter(Boolean).join(' · ');
    time.textContent = track.durationSeconds ? `${formatTime(track.positionSeconds)} / ${formatTime(track.durationSeconds)}` : '';
    const nextCover = track.coverUrl || '';
    if (nextCover !== coverUrl) {
      coverUrl = nextCover;
      if (nextCover) { cover.hidden = false; cover.src = nextCover; }
      else { cover.hidden = true; cover.removeAttribute('src'); }
    }
    const audio = snapshot?.audio || {};
    const energy = clamp01(audio.visualEnergy);
    const transient = clamp01(audio.visualTransient);
    energyFill.style.width = `${Math.round(energy * 100)}%`;
    energyOut.textContent = `${Math.round(energy * 100)}%`;
    transientFill.style.width = `${Math.round(transient * 100)}%`;
    transientOut.textContent = `${Math.round(transient * 100)}%`;
    const parts = [
      snapshot?.state ? `${t('状态', 'State')}: ${snapshot.state}` : null,
      snapshot?.outputMode ? `${t('输出', 'Output')}: ${snapshot.outputMode}` : null,
      audio.visualTelemetryState ? `${t('遥测', 'Telemetry')}: ${audio.visualTelemetryState}` : null,
      snapshot?.scene?.mode ? `${t('场景', 'Scene')}: ${snapshot.scene.mode}` : null,
    ].filter(Boolean);
    const key = parts.join('\n');
    if (key !== factsKey) {
      factsKey = key;
      facts.replaceChildren(...parts.map((text) => {
        const chip = document.createElement('span');
        chip.textContent = text;
        return chip;
      }));
    }
    // Fresh data while the draw loop idles: resume the fast path right away.
    if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = 0; raf = requestAnimationFrame(draw); }
  };
  statusListeners.add(updateInfo);
  updateInfo();

  const displayed = new Array(barCount).fill(0);
  let paintedVersion = -1;
  const scheduleDraw = (slow) => {
    if (slow) idleTimer = window.setTimeout(() => { idleTimer = 0; raf = requestAnimationFrame(draw); }, 250);
    else raf = requestAnimationFrame(draw);
  };
  const draw = () => {
    raf = 0;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // Hidden page (loader keeps it mounted): poll cheaply instead of spinning rAF.
    if (!width || !height) { scheduleDraw(true); return; }
    const scale = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      paintedVersion = -1;
    }
    const spectrum = Array.isArray(snapshot?.audio?.visualSpectrum) ? snapshot.audio.visualSpectrum : [];
    const stride = spectrum.length ? spectrum.length / barCount : 0;
    let moving = false;
    for (let index = 0; index < barCount; index += 1) {
      const target = stride ? clamp01(spectrum[Math.min(spectrum.length - 1, Math.floor(index * stride))]) : 0;
      const next = displayed[index] + (target - displayed[index]) * 0.35;
      if (Math.abs(next - displayed[index]) > 0.0015) moving = true;
      displayed[index] = next;
    }
    // Bars settled and no new snapshot/accent: skip repainting a static frame.
    if (!moving && paintedVersion === dataVersion) { scheduleDraw(true); return; }
    paintedVersion = dataVersion;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    const gap = 3;
    const barWidth = (width - gap * (barCount - 1)) / barCount;
    context.fillStyle = accentColor();
    for (let index = 0; index < barCount; index += 1) {
      const barHeight = Math.max(2, displayed[index] * (height - 8));
      const x = index * (barWidth + gap);
      const y = height - barHeight;
      context.beginPath();
      context.roundRect(x, y, barWidth, barHeight, Math.min(4, barWidth / 2));
      context.fill();
    }
    scheduleDraw(false);
  };
  raf = requestAnimationFrame(draw);

  const dispose = () => {
    cancelAnimationFrame(raf);
    if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = 0; }
    disposeAccentWatch?.();
    if (accentHost === page) accentHost = null;
    statusListeners.delete(updateInfo);
    pageDisposers.delete(dispose);
    root.replaceChildren();
  };
  pageDisposers.add(dispose);
  return dispose;
};

const unregister = external.sidebar.register({
  id: 'wallpaper-bridge',
  label: t('壁纸桥接', 'Wallpaper Bridge'),
  icon: '∿',
  order: Number(external.manifest?.sidebarOrder) || 70,
  render: renderPage,
});

return () => {
  disposed = true;
  [...pageDisposers].forEach((dispose) => { try { dispose(); } catch {} });
  disconnect();
  if (applyCssVariables) clearSceneCssVars();
  try { unregister(); } catch {}
};
