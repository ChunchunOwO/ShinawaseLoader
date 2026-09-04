const external = echoExternalMod;
const log = (...values) => { try { external.log?.(...values); } catch {} };
const toast = (message) => { try { external.toast?.(String(message || '')); } catch {} };

const LYRICS_VIEW_MODE_KEY = 'echo:lyrics:view-mode';
const MV_VIEW_MODE_KEY = 'echo.mv.view-mode';
const DIAGNOSTICS_KEY = 'echo:mv:show-diagnostics-report';
const IMMERSIVE_CONTROLS_KEY = 'echo.mv.immersive-controls-open';
const LOCALE_KEY = 'echo.locale';
const CSS_ID = 'echo-mv-mod-css';
const OPEN_MV_SETTINGS_EVENT = 'app:open-mv-settings';
const SETTINGS_CHANGED_EVENT = 'settings:changed';
const MV_CHANGED_EVENT = 'mv:changed';
const MV_CANDIDATES_EVENT = 'mv:candidatesChanged';
const PLAYBACK_SEEKED_EVENT = 'playback:seeked';
const MV_ENDED_EVENT = 'mv:ended-before-audio';
const DIAGNOSTICS_EVENT = 'mv:diagnostics-preference-changed';
const IMMERSIVE_WHEEL_EVENT = 'lyrics:mv-immersive-background-scale-wheel';
const SMART_READABLE_EVENT = 'lyrics:smart-readable-video-sample';
const NAV_LYRICS_EVENT = 'app:navigate:lyrics';

const MV_OFFSET_MIN = -600000;
const MV_OFFSET_MAX = 600000;
const MV_OFFSET_STEP = 100;
const OFFSET_STEP_OPTIONS = [100, 500, 1000, 5000, 10000];
const NETWORK_PROVIDERS = ['bilibili', 'youtube'];
const QUALITY_CAPS = ['720p', '1080p', '1440p', '2160p', 'max'];
const SYNC_MODES = ['stable', 'balanced', 'precise'];
const MV_SETTINGS_KEYS = ['enabled', 'autoSearch', 'autoPreload', 'autoApplyThreshold', 'titleOnlySearch', 'preferHighestViewCount', 'immersiveBackground', 'immersiveBackgroundAutoScale', 'immersiveBackgroundScalePercent', 'immersiveBackgroundOffsetXPercent', 'immersiveBackgroundOffsetYPercent', 'immersiveBackgroundBlurPx', 'immersiveBackgroundBrightnessPercent', 'immersiveBackgroundOverlayOpacityPercent', 'lyricsReadabilityEnhanced', 'hideLyrics', 'restartAudioOnLoad', 'syncMode', 'replayAudioOnChange', 'enabledProviders', 'providerOrder', 'maxQuality', 'allow60fps'];
const RELOAD_SETTINGS_KEYS = ['enabled', 'autoSearch', 'autoPreload', 'titleOnlySearch', 'preferHighestViewCount', 'enabledProviders', 'providerOrder', 'maxQuality', 'allow60fps'];
const SYNC_PROFILES = {
  stable: { toleranceSeconds: 1.2, hardSeekSeconds: 4, maxRateDelta: 0.06 },
  balanced: { toleranceSeconds: 0.45, hardSeekSeconds: 2, maxRateDelta: 0.12 },
  precise: { toleranceSeconds: 0.2, hardSeekSeconds: 0.9, maxRateDelta: 0.18 },
};
const SYNC_INTERVALS = { stable: 750, balanced: 400, precise: 250 };
const DIRECT_BILI_SYNC = { toleranceSeconds: 0.18, hardSeekSeconds: 0.75, maxRateDelta: 0.18 };
const DRAW_EXIT_MS = 480;
const SCALE_MIN = 70;
const SCALE_MAX = 220;
const SCALE_WHEEL_STEP = 5;
const SCALE_SAVE_MS = 360;
const NOTICE_DISMISS_MS = 3000;
const SYNC_COOLDOWN_MS = 1000;

const fallbackSettings = {
  enabled: true,
  autoSearch: true,
  autoPreload: true,
  autoApplyThreshold: 0.7,
  titleOnlySearch: false,
  preferHighestViewCount: true,
  immersiveBackground: true,
  immersiveBackgroundAutoScale: true,
  immersiveBackgroundScalePercent: 115,
  immersiveBackgroundOffsetXPercent: 50,
  immersiveBackgroundOffsetYPercent: 50,
  immersiveBackgroundBlurPx: 0,
  immersiveBackgroundBrightnessPercent: 100,
  immersiveBackgroundOverlayOpacityPercent: 0,
  lyricsReadabilityEnhanced: false,
  hideLyrics: false,
  restartAudioOnLoad: false,
  syncMode: 'balanced',
  replayAudioOnChange: true,
  enabledProviders: ['bilibili', 'youtube'],
  providerOrder: ['bilibili', 'youtube'],
  maxQuality: 'max',
  allow60fps: true,
};
const immersiveDefaults = {
  immersiveBackgroundAutoScale: true,
  immersiveBackgroundScalePercent: 115,
  immersiveBackgroundOffsetXPercent: 50,
  immersiveBackgroundOffsetYPercent: 50,
  immersiveBackgroundBlurPx: 0,
  immersiveBackgroundBrightnessPercent: 100,
  immersiveBackgroundOverlayOpacityPercent: 0,
};

const ICONS = {
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  music2: '<circle cx="8" cy="18" r="4"/><path d="M12 18V2l7 1v15"/><circle cx="19" cy="16" r="4"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  clapperboard: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><rect width="20" height="14" x="2" y="8" rx="2"/>',
  monitorPlay: '<path d="M10 7.75a.75.75 0 0 1 1.142-.638l3.664 2.249a.75.75 0 0 1 0 1.276l-3.664 2.25A.75.75 0 0 1 10 12.25z"/><path d="M12 17v4"/><path d="M8 21h8"/><rect width="20" height="14" x="2" y="3" rx="2"/>',
  shieldCheck: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  folder: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  fileVideo: '<path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><rect width="8" height="6" x="2" y="12" rx="1"/><path d="m10 15.5 4 2.5v-6l-4 2.5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  minus: '<path d="M5 12h14"/>',
  rewind: '<path d="M12 6 6.5 10.5 12 15"/><path d="M6 6v12"/><path d="m18 6-5.5 4.5L18 15"/><path d="M12 6v12"/>',
  fastForward: '<path d="M12 6v12"/><path d="m6 6 5.5 4.5L6 15"/><path d="M18 6v12"/><path d="m12 6 5.5 4.5L12 15"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
};

let localeId = 'en';
const interpolate = (text, options) => {
  if (!options) return text;
  return Object.keys(options).reduce((current, key) => current.split('{' + key + '}').join(String(options[key])), text);
};
const t = (key, options) => {
  const table = I18N[localeId] || I18N.en || {};
  return interpolate(table[key] || I18N.en?.[key] || I18N.zh?.[key] || key, options);
};
const detectLocale = () => {
  const candidates = [];
  try { candidates.push(window.localStorage.getItem(LOCALE_KEY)); } catch {}
  candidates.push(document.documentElement.lang, navigator.language, navigator.userLanguage);
  for (const value of candidates) {
    const lang = String(value || '').toLowerCase();
    if (!lang) continue;
    if (lang.startsWith('zh')) return 'zh';
    if (lang.startsWith('en')) return 'en';
  }
  return 'en';
};
localeId = detectLocale();

const echoApi = () => window.echo || external.echo || {};
const playerApi = () => external.player || window.__echoExternalPlayer || null;
const unwrap = (value) => {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'result') && (value.ok === true || value.ok === undefined)) {
    return value.result;
  }
  return value;
};
const invoke = async (method, payload) => {
  if (typeof external.main?.invoke !== 'function') throw new Error('ECHO-MV main bridge unavailable');
  return unwrap(await external.main.invoke(method, payload || {}));
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clampOffset = (value) => clamp(Math.round(Number(value) || 0), MV_OFFSET_MIN, MV_OFFSET_MAX);
const clampScale = (value) => Math.round(clamp(Number(value) || 115, SCALE_MIN, SCALE_MAX));
const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const textOf = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};
const numOf = (...values) => {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
};
const svgIcon = (name, size = 16) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('width', String(size));
  node.setAttribute('height', String(size));
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', size >= 20 ? '1.9' : '1.8');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = ICONS[name] || '';
  return node;
};
const el = (tag, className, attrs, children) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs && typeof attrs === 'object') {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;
      if (key === 'on') continue;
      if (key.startsWith('aria-') && typeof value === 'boolean') {
        node.setAttribute(key, value ? 'true' : 'false');
        continue;
      }
      if (key === 'checked' || key === 'disabled' || key === 'readOnly' || key === 'draggable') {
        node[key] = Boolean(value);
        continue;
      }
      if (value === false && key !== 'value') continue;
      if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
        continue;
      }
      if (key === 'dataset' && value && typeof value === 'object') {
        for (const [dataKey, dataValue] of Object.entries(value)) {
          if (dataValue !== undefined && dataValue !== null) node.dataset[dataKey] = String(dataValue);
        }
        continue;
      }
      if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, String(value));
    }
  }
  const list = children === undefined ? [] : Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === undefined || child === null || child === false) continue;
    if (child instanceof Node) node.append(child);
    else node.append(String(child));
  }
  return node;
};
const btn = (className, attrs, children) => el('button', className, { type: 'button', ...attrs }, children);
const formatScore = (score) => `${Math.round((Number(score) || 0) * 100)}%`;
const formatThreshold = (threshold) => `${Math.round((threshold ?? 0.7) * 100)}%`;
const thresholdFromPercent = (value) => clamp(Math.round(Number(value) || 70), 30, 100) / 100;
const formatDuration = (seconds) => {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '';
  const total = Math.round(n);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
const formatOffsetMagnitude = (offsetMs) => {
  const abs = Math.abs(offsetMs);
  if (abs > 0 && abs < 1000) return `${abs}ms`;
  const seconds = abs / 1000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
};
const formatOffset = (offsetMs) => (offsetMs === 0 ? '0s' : `${offsetMs > 0 ? '+' : '-'}${formatOffsetMagnitude(offsetMs)}`);
const formatSecondsInput = (seconds) => seconds.toFixed(1).replace(/\.0$/, '');
const providerLabel = (provider) => {
  if (provider === 'local') return t('mvSettings.provider.local');
  if (provider === 'bilibili') return 'Bilibili';
  if (provider === 'youtube') return 'YouTube';
  return provider || t('mvSettings.status.none');
};
const qualityCapLabel = (quality) => (quality === '2160p' ? '4K' : quality === 'max' ? t('mvSettings.quality.max') : quality);
const isResolutionQualityLabel = (label) => /^(?:8K|4K|\d{3,4}p)(?:\s*\/?\s*\d{2,3}fps|\s+\d{2,3}fps)?$/i.test(String(label || '').trim());
const heightFromQualityLabel = (label) => {
  const normalized = String(label || '').trim();
  if (/^8K\b/i.test(normalized)) return 4320;
  if (/^4K\b/i.test(normalized)) return 2160;
  const match = normalized.match(/^(\d{3,4})p\b/i);
  return match ? Number(match[1]) : null;
};
const formatVideoQuality = (video, emptyLabel) => {
  if (!video) return emptyLabel;
  const resolutionLabel = video.height
    ? video.height >= 4320 ? '8K' : video.height >= 2160 ? '4K' : `${video.height}p`
    : video.width ? `${video.width}px` : null;
  const qualityLabel = video.qualityLabel?.trim() || null;
  const qualityHeight = qualityLabel && isResolutionQualityLabel(qualityLabel) ? heightFromQualityLabel(qualityLabel) : null;
  const canTrust = qualityLabel !== null && (!isResolutionQualityLabel(qualityLabel) || !video.height || !qualityHeight || qualityHeight <= video.height || video.height >= qualityHeight * 0.7);
  const baseLabel = canTrust ? qualityLabel : resolutionLabel ?? qualityLabel;
  if (!baseLabel) return emptyLabel;
  if (!video.fps || video.fps < 55) return baseLabel;
  const fpsLabel = `${Math.round(video.fps)}fps`;
  return new RegExp(`\\b${fpsLabel.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i').test(baseLabel) ? baseLabel : `${baseLabel} / ${fpsLabel}`;
};
const formatVideoTitle = (video, emptyLabel) => video ? (textOf(video.title, video.sourceId) || emptyLabel) : emptyLabel;
const rawRecord = (value) => asObject(value);
const isReceiverTrackId = (value) => Boolean(value && (String(value).startsWith('dlna-receiver:') || String(value).startsWith('airplay-receiver:')));
const isStreamingTrack = (track) => Boolean(track?.mediaType === 'streaming' && track.provider && track.providerTrackId);
const streamingTrackKey = (track) => textOf(track?.stableKey) || (track?.provider && track?.providerTrackId ? `streaming:${track.provider}:${track.providerTrackId}` : '');
const snapshotTrackIdFor = (track, fallbackId) => {
  if (track?.mediaType === 'streaming') {
    const key = streamingTrackKey(track);
    if (key) return key;
  }
  return track?.id || fallbackId;
};
const shouldUseSnapshotSearch = (track, trackId) => Boolean(isReceiverTrackId(trackId) || track?.isTemporary || track?.mediaType === 'remote' || track?.mediaType === 'streaming');
const isPlayableVideo = (video) => Boolean(video?.playableInApp && video.mediaUrl);
const isUnplayableSearchCandidate = (video) => Boolean(video && video.sourceType === 'search_candidate' && (!video.playableInApp || !video.mediaUrl));
const isAdaptiveStream = (video) => Boolean(video?.mimeType && (String(video.mimeType).includes('mpegurl') || String(video.mimeType).includes('dash') || String(video.mimeType).includes('application/vnd.apple.mpegurl')));
const isEchoLive = (video) => rawRecord(video?.rawProviderJson)?.echoLiveStream === true;
const isBilibiliBlocked = (video) => video?.provider === 'bilibili' && rawRecord(video?.rawProviderJson)?.unavailableReason === 'bilibili-playurl-blocked';
const isMutedVideoOnly = (video) => rawRecord(video?.rawProviderJson)?.mutedVideoOnly === true || video?.provider === 'bilibili';
const isMvDatabaseError = (error) => /MV database is temporarily unavailable|database disk image is malformed|DatabaseHealthError|SQLITE_CORRUPT|file is not a database|MV 数据库/i.test(error instanceof Error ? error.message : String(error || ''));
const isDirectBili = (video, target) => {
  if (!video || video.provider !== 'bilibili' || !target) return false;
  const id = biliIdFromTarget(target);
  return Boolean(id && video.sourceId === id);
};
const shouldFollowMusic = (settings, video, target) => settings.restartAudioOnLoad === true || isDirectBili(video, target);
const videoToCandidate = (video) => ({
  id: video.id,
  provider: video.provider,
  sourceType: video.sourceType,
  title: video.title ?? video.sourceId ?? video.id,
  artist: video.artist,
  filePath: video.filePath,
  url: video.url,
  providerUrl: video.providerUrl,
  thumbnailUrl: video.thumbnailUrl,
  uploader: null,
  viewCount: typeof rawRecord(video.rawProviderJson)?.viewCount === 'number' ? rawRecord(video.rawProviderJson).viewCount : null,
  availableQualities: [],
  durationSeconds: video.durationSeconds,
  score: video.score,
  playableInApp: video.playableInApp,
  reasons: [],
});
const youtubeIdFromValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{11}$/u.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || null;
    if (parsed.hostname.endsWith('youtube.com')) return parsed.searchParams.get('v') || parsed.pathname.match(/\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/u)?.[1] || null;
  } catch {
    return raw.match(/[?&]v=([A-Za-z0-9_-]{11})/u)?.[1] || raw.match(/youtu\.be\/([A-Za-z0-9_-]{11})/u)?.[1] || null;
  }
  return null;
};
const biliIdFromTarget = (target) => {
  if (target?.provider !== 'bilibili') return null;
  const rawId = String(target.providerTrackId || '').trim();
  if (!rawId) return null;
  if (/^https?:\/\//iu.test(rawId)) {
    try { return new URL(rawId).pathname.match(/\/video\/((?:BV[A-Za-z0-9]+)|(?:av\d+))/iu)?.[1] || null; } catch { return null; }
  }
  return rawId.match(/^BV[A-Za-z0-9]+$/iu)?.[0] || rawId.match(/^av\d+$/iu)?.[0] || null;
};
const youtubeEmbedUrl = (video, options) => {
  if (!video || video.provider !== 'youtube' || video.sourceType !== 'manual') return null;
  const videoId = youtubeIdFromValue(video.providerUrl || video.url || video.sourceId);
  if (!videoId) return null;
  const url = new URL(`https://www.youtube.com/embed/${videoId}`);
  url.searchParams.set('autoplay', options.autoplay ? '1' : '0');
  url.searchParams.set('mute', '1');
  url.searchParams.set('controls', options.controls === false ? '0' : '1');
  url.searchParams.set('rel', '0');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('iv_load_policy', '3');
  if (options.controls === false) {
    url.searchParams.set('disablekb', '1');
    url.searchParams.set('fs', '0');
    url.searchParams.set('modestbranding', '1');
  }
  if (options.loop) {
    url.searchParams.set('loop', '1');
    url.searchParams.set('playlist', videoId);
  }
  return url.toString();
};

const HOST_LYRICS_STYLES = new Set(['editorial', 'folded', 'roseVinyl', 'cinemaStage', 'kineticPoster', 'coverStage', 'cutBoard']);
const STAGE_LYRICS_STYLES = new Set(['cinemaStage', 'coverStage']);
const lyricsPageStyle = (page = lyricsPageEl()) => String(page?.getAttribute('data-lyrics-page-style') || '');
const isHostLyricsStyle = (page) => HOST_LYRICS_STYLES.has(lyricsPageStyle(page));
const isLyricsStageStyle = (page) => STAGE_LYRICS_STYLES.has(lyricsPageStyle(page));
const rememberViewMode = (mode) => {
  try { window.sessionStorage.setItem(MV_VIEW_MODE_KEY, mode); } catch {}
  try { window.sessionStorage.setItem(LYRICS_VIEW_MODE_KEY, 'lyrics'); } catch {}
};
const readViewMode = () => {
  try {
    const ours = window.sessionStorage.getItem(MV_VIEW_MODE_KEY);
    if (ours === 'mv' || ours === 'lyrics') return ours;
    return window.sessionStorage.getItem(LYRICS_VIEW_MODE_KEY) === 'mv' ? 'mv' : 'lyrics';
  } catch {
    return 'lyrics';
  }
};
const readDiagnostics = () => {
  try { return window.localStorage.getItem(DIAGNOSTICS_KEY) === 'true'; } catch { return false; }
};
const writeDiagnostics = (enabled) => {
  try {
    if (enabled) window.localStorage.setItem(DIAGNOSTICS_KEY, 'true');
    else window.localStorage.removeItem(DIAGNOSTICS_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent(DIAGNOSTICS_EVENT, { detail: { enabled } }));
};
const readImmersiveOpen = () => {
  try { return window.localStorage.getItem(IMMERSIVE_CONTROLS_KEY) === 'true'; } catch { return false; }
};
const writeImmersiveOpen = (enabled) => {
  try { window.localStorage.setItem(IMMERSIVE_CONTROLS_KEY, enabled ? 'true' : 'false'); } catch {}
};

const dispatchSettingsChanged = (patch) => {
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: patch }));
};
const notifyMvChanged = (trackId) => {
  window.dispatchEvent(new CustomEvent(MV_CHANGED_EVENT, { detail: { trackId } }));
};

const normalizeClock = (clock) => ({
  positionSeconds: Number.isFinite(clock?.positionSeconds) && clock.positionSeconds > 0 ? clock.positionSeconds : 0,
  updatedAtMs: Number.isFinite(clock?.updatedAtMs) ? clock.updatedAtMs : performance.now(),
  playbackRate: Number.isFinite(Number(clock?.playbackRate)) ? clamp(Number(clock.playbackRate), 0.5, 2) : 1,
  durationSeconds: clock?.durationSeconds && Number.isFinite(clock.durationSeconds) && clock.durationSeconds > 0 ? clock.durationSeconds : null,
  state: clock?.state || 'idle',
});
const estimateClockPosition = (clock, nowMs = performance.now()) => {
  const normalized = normalizeClock(clock);
  const elapsed = normalized.state === 'playing' ? Math.max(0, (nowMs - normalized.updatedAtMs) / 1000) * normalized.playbackRate : 0;
  const position = normalized.positionSeconds + elapsed;
  return normalized.durationSeconds ? Math.min(position, normalized.durationSeconds) : position;
};
const targetVideoTime = (video, clock, offsetMs) => {
  const position = Math.max(0, estimateClockPosition(clock) + (Number(offsetMs) || 0) / 1000);
  const duration = Number(video.duration);
  if (video.loop && Number.isFinite(duration) && duration > 0) return position % duration;
  return position;
};
const signedDrift = (video, targetTime) => {
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  let drift = targetTime - current;
  const duration = Number(video.duration);
  if (video.loop && Number.isFinite(duration) && duration > 0) {
    if (drift > duration / 2) drift -= duration;
    else if (drift < -duration / 2) drift += duration;
  }
  return drift;
};
const playVideo = (video) => {
  try {
    const result = video.play();
    if (result && typeof result.catch === 'function') void result.catch(() => undefined);
  } catch {}
};
const releaseVideo = (video) => {
  if (!video) return;
  try { video.pause(); } catch {}
  try {
    video.removeAttribute('src');
    video.load();
  } catch {}
};

const currentQueueTrack = () => {
  try {
    const queue = playerApi()?.queue?.();
    return asObject(queue?.currentTrack) || asObject(queue?.current) || asObject(queue?.nowPlaying) || null;
  } catch {
    return null;
  }
};

const snapshotFromTrack = (track, trackId, extras = {}) => {
  const audioClock = extras.audioClock || state.audioClock;
  const title = textOf(track?.title, extras.title, 'Unknown Title');
  const artist = textOf(track?.artist, track?.albumArtist, extras.artist, 'Unknown Artist');
  return {
    trackId: snapshotTrackIdFor(track, trackId),
    title,
    artist,
    album: textOf(track?.album) || null,
    albumArtist: textOf(track?.albumArtist) || null,
    durationSeconds: numOf(track?.duration, track?.durationSeconds, extras.durationSeconds, audioClock.durationSeconds),
    coverThumb: track?.coverThumb || extras.coverThumb || extras.coverUrl || null,
    mediaType: track?.mediaType || extras.mediaType || 'local',
    path: textOf(track?.path, extras.path) || undefined,
    query: extras.query || undefined,
    autoSelect: extras.autoSelect === true ? true : undefined,
  };
};

const enrichSnapshot = async (trackId, extras = {}) => {
  if (!trackId) throw new Error('trackId required');
  let track = asObject(extras.track) || (state.trackId === trackId ? state.currentTrack : null);
  if (!track) {
    try { track = asObject(await echoApi().library?.getTrack?.(trackId)); } catch {}
  }
  if (!track) {
    const queued = currentQueueTrack();
    if (queued && (queued.id === trackId || queued.stableKey === trackId || queued.path === trackId || streamingTrackKey(queued) === trackId)) {
      track = queued;
    }
  }
  if (!track) {
    const status = state.playbackStatus || {};
    const audio = state.audioStatus || {};
    if ((status.currentTrackId === trackId || audio.currentTrackId === trackId) || extras.allowPlaybackFallback !== false) {
      track = {
        id: trackId,
        title: textOf(audio.currentTrackTitle, extras.title),
        artist: textOf(audio.currentTrackArtist, extras.artist),
        album: textOf(audio.currentTrackAlbum),
        albumArtist: textOf(audio.currentTrackAlbumArtist),
        duration: numOf(audio.durationSeconds, status.durationMs ? status.durationMs / 1000 : null) || 0,
        coverThumb: audio.currentTrackCoverUrl || null,
        mediaType: extras.mediaType || (status.filePath ? 'local' : 'streaming'),
        path: textOf(status.filePath, audio.currentFilePath),
      };
    }
  }
  return snapshotFromTrack(track, trackId, extras);
};

const mvApi = {
  getSelected: (trackId) => invoke('mv.getSelected', { trackId }),
  getSettings: () => invoke('mv.getSettings', {}),
  setSettings: (patch) => invoke('mv.setSettings', { patch }),
  findLocalCandidates: async (trackId) => invoke('mv.findLocalCandidates', { snapshot: await enrichSnapshot(trackId) }),
  searchNetworkCandidates: async (trackId, query) => invoke('mv.searchNetworkCandidates', { snapshot: await enrichSnapshot(trackId, { query, autoSelect: true }), query, autoSelect: true }),
  searchNetworkCandidatesForSnapshot: (request) => invoke('mv.searchNetworkCandidatesForSnapshot', { snapshot: request }),
  getTemporaryPlayableForSnapshot: (request) => invoke('mv.getTemporaryPlayableForSnapshot', { snapshot: request }),
  getCandidates: (trackId) => invoke('mv.getCandidates', { trackId }),
  resolveStreams: (videoId) => invoke('mv.resolveStreams', { videoId }),
  setQuality: (videoId, qualityId) => invoke('mv.setQuality', { videoId, qualityId }),
  setOffset: (trackId, offsetMs) => invoke('mv.setOffset', { trackId, offsetMs }),
  chooseLocalVideo: (trackId) => invoke('mv.chooseLocalVideo', { trackId }),
  bindLocalVideo: (trackId, filePath) => invoke('mv.bindLocalVideo', { trackId, filePath }),
  bindUrl: (trackId, url) => invoke('mv.bindUrl', { trackId, url }),
  selectVideo: (trackId, videoId) => invoke('mv.selectVideo', { trackId, videoId }),
  clearSelected: (trackId) => invoke('mv.clearSelected', { trackId }),
  openExternal: (videoId) => invoke('mv.openExternal', { videoId }),
};

const installMvApi = () => {
  const extra = (window.__echoShinawaseStreaming ||= {});
  extra.mv = mvApi;
  const echo = window.echo;
  if (!echo) {
    window.echo = { mv: mvApi };
    return;
  }
  try { echo.mv = mvApi; } catch {}
  if (echo.mv === mvApi || typeof echo.mv?.getSettings === 'function') return;
  try {
    Object.defineProperty(echo, 'mv', { value: mvApi, configurable: true, writable: true });
  } catch {}
  if (echo.mv === mvApi || typeof echo.mv?.getSettings === 'function') return;
  if (window.__echoShinawaseEchoPatched) return;
  try {
    const base = echo;
    const table = (window.__echoShinawaseStreaming ||= {});
    table.mv = mvApi;
    window.echo = new Proxy(base, {
      get(target, prop) {
        const value = Reflect.get(target, prop);
        if ((value === null || value === undefined) && table[prop]) return table[prop];
        return value;
      },
    });
    window.__echoShinawaseEchoPatched = true;
  } catch {}
};

const uninstallMvApi = () => {
  try {
    if (window.__echoShinawaseStreaming?.mv === mvApi) delete window.__echoShinawaseStreaming.mv;
  } catch {}
  try {
    if (window.echo?.mv === mvApi) {
      try { delete window.echo.mv; } catch {
        try { window.echo.mv = undefined; } catch {}
      }
    }
  } catch {}
};

installMvApi();

const state = {
  settings: { ...fallbackSettings },
  hasLoadedSettings: false,
  selectedVideo: null,
  candidates: [],
  variants: [],
  trackId: null,
  currentTrack: null,
  streamingTarget: null,
  title: '',
  artist: '',
  coverUrl: null,
  isLoading: false,
  error: null,
  videoError: false,
  noticeDismissed: false,
  copiedDiagnostics: false,
  diagnosticsEnabled: readDiagnostics(),
  viewMode: readViewMode(),
  isAudioPlaying: false,
  audioClock: normalizeClock({ positionSeconds: 0, updatedAtMs: performance.now(), playbackRate: 1, durationSeconds: null, state: 'idle' }),
  playbackStatus: null,
  audioStatus: null,
  requestId: 0,
  preloadAttempt: null,
  lastSyncAt: 0,
  seeking: false,
  failedCovers: new Set(),
  failedThumbs: new Set(),
  immersiveBounds: null,
  immersiveVideoSize: null,
  drawerOpen: false,
  drawerRender: false,
  drawerMotion: false,
  sheetCollapsed: false,
  sheetIgnoreCloseUntil: 0,
  busy: false,
  busyCandidateId: null,
  networkError: null,
  networkNotice: null,
  searchQuery: '',
  useCurrentSong: true,
  customUrl: '',
  maxQualityOpen: false,
  networkOpen: true,
  immersiveOpen: readImmersiveOpen(),
  offsetOpen: false,
  offsetSaving: false,
  offsetStep: 500,
  draggedProvider: null,
  dragOverProvider: null,
  originalPanelHtml: null,
  originalEnabled: null,
  originalViewMode: null,
};
const refs = {
  panel: null,
  lyricsPage: null,
  background: null,
  foregroundVideo: null,
  backgroundVideo: null,
  notice: null,
  diagnostics: null,
  settingsBtn: null,
  drawerRoot: null,
  transportBtn: null,
};
const timers = {
  poll: 0,
  sync: 0,
  notice: 0,
  scaleSave: 0,
  drawerExit: 0,
  copyReset: 0,
  render: 0,
};
const disposers = [];
let disposed = false;
let lastVideoKey = '';
let lastBgKey = '';
let lastPanelSignature = '';
let lastDrawerSignature = '';
let pendingDrawerRender = false;
let scalePending = null;
let resizeObserver = null;

const isLyricsPageVisible = () => {
  const page = document.querySelector('.lyrics-page, .app-shell--lyrics');
  if (!page) return false;
  if (page.hidden) return false;
  const style = getComputedStyle(page);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const rect = page.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
};
const lyricsPageEl = () => document.querySelector('.lyrics-page');
const isDrawerDomOpen = () => Boolean(refs.drawerRoot?.isConnected && state.drawerOpen && state.drawerRender);
const hideOfficialMvChrome = (page) => {
  page?.querySelectorAll('section.lyrics-mv-panel').forEach((node) => {
    node.dataset.echoMvStub = 'true';
    node.hidden = true;
  });
};
const ownedPanelEl = () => document.querySelector('aside.echo-mv-panel');
const ensureOwnedPanel = (page) => {
  hideOfficialMvChrome(page);
  page?.querySelectorAll('section.lyrics-mv-panel[data-echo-mv-mod="true"]').forEach((node) => node.remove());
  let panel = ownedPanelEl();
  if (!panel) {
    panel = el('aside', 'echo-mv-panel', { 'aria-label': t('mvPanel.title') });
    page.append(panel);
  } else if (panel.parentElement !== page) {
    page.append(panel);
  }
  return panel;
};
const teardownOwnedPanel = () => {
  ownedPanelEl()?.remove();
  lastPanelSignature = '';
  lastVideoKey = '';
  refs.panel = null;
  refs.foregroundVideo = null;
};
const shouldAutoSearch = () => {
  if (!state.trackId || state.settings.autoSearch === false) return false;
  return state.isAudioPlaying || isReceiverTrackId(state.trackId) || (state.settings.autoPreload !== false && shouldUseSnapshotSearch(state.currentTrack, state.trackId));
};
const panelActive = () => state.settings.enabled !== false;
const lyricsVisible = () => isLyricsPageVisible() && !document.hidden;

const applyLocaleFromApp = async () => {
  try {
    const settings = await echoApi().app?.getSettings?.();
    const locale = String(settings?.locale || '');
    if (locale.toLowerCase().startsWith('zh')) localeId = 'zh';
    else if (locale.toLowerCase().startsWith('en')) localeId = 'en';
  } catch {}
};

const loadSettings = async () => {
  try {
    const next = await mvApi.getSettings();
    if (next && typeof next === 'object') state.settings = { ...fallbackSettings, ...next };
    else state.settings = { ...fallbackSettings };
  } catch {
    state.settings = { ...fallbackSettings };
  }
  state.hasLoadedSettings = true;
  return state.settings;
};

const patchSettings = async (patch) => {
  state.settings = { ...state.settings, ...patch };
  scheduleRender();
  try {
    const next = await mvApi.setSettings(patch);
    if (next && typeof next === 'object') state.settings = { ...fallbackSettings, ...next };
    dispatchSettingsChanged(patch);
    applyPageFlags();
    scheduleRender();
    if (typeof patch.enabled === 'boolean') {
      try {
        const app = echoApi().app;
        if (app?.getSettings && app.setSettings) {
          const appSettings = await app.getSettings();
          if (appSettings.lyricsMvAutoShowTrackInfoDisabled !== false) {
            const lyricsPatch = { lyricsHeaderHidden: patch.enabled };
            await app.setSettings(lyricsPatch);
            dispatchSettingsChanged(lyricsPatch);
          }
        }
      } catch {}
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
    await loadSettings();
    scheduleRender();
  }
};

const summarizeLoadError = (message) => {
  if (/MV database is temporarily unavailable|database disk image is malformed|DatabaseHealthError|SQLITE_CORRUPT|file is not a database/i.test(message)) return t('mvPanel.status.databaseUnread');
  if (/bilibili|playurl|blocked|forbidden|403|412|credential|cookie|SESSDATA/i.test(message)) return t('mvPanel.status.bilibiliBlocked');
  if (/network|fetch|timeout|timed out|AbortError|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)) return t('mvPanel.status.networkFailed');
  if (/MEDIA_ERR|decode|demux|unsupported|format|source|ERR_FILE_NOT_FOUND|404/i.test(message)) return t('mvPanel.status.videoFailed');
  return String(message || '').trim() || t('mvPanel.status.loadFailed');
};
const summarizeActionError = (error) => {
  const message = error instanceof Error ? error.message : String(error || '');
  if (isMvDatabaseError(error)) return t('mvSettings.error.databaseUnavailable');
  if (/bilibili|playurl|blocked|forbidden|403|412|credential|cookie|SESSDATA/iu.test(message)) return t('mvSettings.error.bilibiliBlocked', { reason: message || t('mvSettings.error.actionFailed') });
  if (/network|fetch|timeout|timed out|AbortError|ECONN|ENOTFOUND|EAI_AGAIN/iu.test(message)) return t('mvSettings.error.networkFailed', { reason: message || t('mvSettings.error.actionFailed') });
  return message.trim() || t('mvSettings.error.actionFailed');
};

const resolveNetworkVideo = async (video) => {
  if (!video || video.temporary || video.provider === 'local') return video;
  try {
    const resolved = await mvApi.resolveStreams(video.id);
    if (resolved?.variants) state.variants = resolved.variants;
    const next = resolved?.video || resolved;
    return isPlayableVideo(video) && !isPlayableVideo(next) ? video : next;
  } catch (error) {
    if (isMvDatabaseError(error)) throw error;
    return video;
  }
};

const snapshotForActive = (options = {}) => snapshotFromTrack(state.currentTrack, state.trackId, {
  title: state.title,
  artist: state.artist,
  coverUrl: state.coverUrl,
  audioClock: state.audioClock,
  mediaType: options.forceSnapshot ? 'local' : (state.currentTrack?.mediaType || 'remote'),
  autoSelect: options.autoSelect,
  query: options.query,
});

const searchCandidatesForActive = async (options = {}) => {
  if (!state.trackId) return null;
  if ((options.forceSnapshot || shouldUseSnapshotSearch(state.currentTrack, state.trackId))) {
    const request = { ...snapshotForActive(options), autoSelect: true };
    await mvApi.searchNetworkCandidatesForSnapshot(request);
    return mvApi.getSelected(request.trackId);
  }
  try { await mvApi.findLocalCandidates(state.trackId); } catch {}
  const afterLocal = await mvApi.getSelected(state.trackId);
  if (isPlayableVideo(afterLocal)) return afterLocal;
  await mvApi.searchNetworkCandidates(state.trackId, options.query);
  return mvApi.getSelected(state.trackId);
};

const loadSelected = async (options = {}) => {
  if (!lyricsVisible()) return;
  if (!panelActive() && !shouldAutoSearch()) return;
  const requestId = ++state.requestId;
  if (!options.preserveCurrent) state.selectedVideo = null;
  state.isLoading = Boolean(state.trackId);
  state.error = null;
  state.videoError = false;
  if (!state.trackId) {
    state.isLoading = false;
    scheduleRender();
    return;
  }
  try {
    const nextSettings = await loadSettings();
    if (state.requestId !== requestId) return;
    if (nextSettings.enabled === false) {
      state.selectedVideo = null;
      state.isLoading = false;
      scheduleRender();
      return;
    }
    const effectiveId = snapshotTrackIdFor(state.currentTrack, state.trackId) || state.trackId;
    let video = await mvApi.getSelected(effectiveId);
    if (state.streamingTarget) {
      const biliId = biliIdFromTarget(state.streamingTarget);
      const rawBili = String(state.streamingTarget.providerTrackId || '').trim();
      const biliUrl = state.streamingTarget.provider === 'bilibili'
        ? (/^https?:\/\//i.test(rawBili) ? rawBili : (biliId ? `https://www.bilibili.com/video/${encodeURIComponent(biliId)}` : null))
        : null;
      const ytId = state.streamingTarget.provider === 'youtube' ? youtubeIdFromValue(state.streamingTarget.providerTrackId) : null;
      const ytUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : null;
      if (biliUrl && (!video || video.provider !== 'bilibili' || video.sourceId !== biliId)) {
        try { video = await mvApi.bindUrl(effectiveId, biliUrl); } catch {}
      }
      if (ytUrl && (!video || video.provider !== 'youtube' || video.sourceId !== ytId)) {
        try { video = await mvApi.bindUrl(effectiveId, ytUrl); } catch {}
      }
    }
    const canSearch = shouldAutoSearch() && (panelActive() || nextSettings.autoSearch !== false);
    if (!video && canSearch && state.preloadAttempt !== state.trackId) {
      state.preloadAttempt = state.trackId;
        video = (await searchCandidatesForActive()) || (await mvApi.getSelected(effectiveId));
    }
    let resolved = await resolveNetworkVideo(video);
    if (isUnplayableSearchCandidate(resolved) && canSearch && state.preloadAttempt !== state.trackId) {
      state.preloadAttempt = state.trackId;
      video = (await searchCandidatesForActive()) || (await mvApi.getSelected(effectiveId));
      resolved = await resolveNetworkVideo(video);
    }
    if (state.requestId !== requestId) return;
    state.selectedVideo = resolved;
  } catch (error) {
    if (state.requestId !== requestId) return;
    if (isMvDatabaseError(error)) {
      try {
        const fallback = await mvApi.getTemporaryPlayableForSnapshot({ ...snapshotForActive({ forceSnapshot: true }) });
        const resolved = await resolveNetworkVideo(fallback);
        if (state.requestId === requestId && resolved?.playableInApp && resolved.mediaUrl) {
          state.selectedVideo = resolved;
          state.error = null;
          state.isLoading = false;
          scheduleRender();
          return;
        }
      } catch {}
    }
    state.error = error instanceof Error ? error.message : String(error);
    state.selectedVideo = null;
    toast(summarizeLoadError(state.error));
  } finally {
    if (state.requestId === requestId) {
      state.isLoading = false;
      scheduleRender();
    }
  }
};

const refreshPlayback = async () => {
  const echo = echoApi();
  let playback = null;
  let audio = null;
  try { playback = await echo.playback?.getStatus?.(); } catch {}
  try { audio = await echo.audio?.getStatus?.(); } catch {}
  state.playbackStatus = playback;
  state.audioStatus = audio;
  const queued = currentQueueTrack();
  const trackId = audio?.currentTrackId || playback?.currentTrackId || queued?.id || queued?.stableKey || null;
  const playing = audio?.state === 'playing' || playback?.state === 'playing';
  const positionSeconds = numOf(audio?.positionSeconds, playback?.positionMs != null ? playback.positionMs / 1000 : null) || 0;
  const durationSeconds = numOf(audio?.durationSeconds, playback?.durationMs != null ? playback.durationMs / 1000 : queued?.duration) || null;
  const playbackRate = numOf(audio?.playbackRate) || 1;
  const audioState = audio?.state || playback?.state || 'idle';
  const prevTrackId = state.trackId;
  const wasPlaying = state.isAudioPlaying;
  state.audioClock = normalizeClock({
    positionSeconds,
    updatedAtMs: performance.now(),
    playbackRate,
    durationSeconds,
    state: audioState,
  });
  state.isAudioPlaying = playing;
  if (trackId && trackId !== state.trackId) {
    state.trackId = trackId;
    state.currentTrack = queued && (queued.id === trackId || queued.stableKey === trackId || streamingTrackKey(queued) === trackId) ? queued : state.currentTrack;
    if (!state.currentTrack || (state.currentTrack.id !== trackId && state.currentTrack.stableKey !== trackId)) {
      try { state.currentTrack = asObject(await echo.library?.getTrack?.(trackId)) || queued; } catch { state.currentTrack = queued; }
    }
    state.title = textOf(state.currentTrack?.title, audio?.currentTrackTitle);
    state.artist = textOf(state.currentTrack?.artist, state.currentTrack?.albumArtist, audio?.currentTrackArtist);
    state.coverUrl = state.currentTrack?.coverThumb || audio?.currentTrackCoverUrl || null;
    if (isStreamingTrack(state.currentTrack)) {
      state.streamingTarget = { provider: state.currentTrack.provider, providerTrackId: state.currentTrack.providerTrackId };
    } else {
      state.streamingTarget = null;
    }
    state.preloadAttempt = null;
    state.lastSyncAt = 0;
    state.seeking = false;
    state.noticeDismissed = false;
    if (lyricsVisible() && (panelActive() || shouldAutoSearch())) void loadSelected();
  } else {
    if (!state.title) state.title = textOf(queued?.title, audio?.currentTrackTitle);
    if (!state.artist) state.artist = textOf(queued?.artist, audio?.currentTrackArtist);
    if (!state.coverUrl) state.coverUrl = queued?.coverThumb || audio?.currentTrackCoverUrl || null;
    if (!wasPlaying && playing && !state.selectedVideo && state.trackId && lyricsVisible() && shouldAutoSearch()) {
      void loadSelected();
    }
  }
  if (prevTrackId && trackId !== prevTrackId) scheduleRender();
  if (panelActive()) syncVideos({ bypassCooldown: Math.abs(positionSeconds - (state.audioClock.positionSeconds || 0)) > 2 });
};

const applyRate = (video) => {
  if (!video) return;
  try { video.playbackRate = state.audioClock.playbackRate; } catch {}
};
const syncOne = (video, options = {}) => {
  const follow = shouldFollowMusic(state.settings, state.selectedVideo, state.streamingTarget);
  if (!video || isEchoLive(state.selectedVideo) || state.seeking || (!follow && !options.force)) return false;
  const target = targetVideoTime(video, state.audioClock, state.selectedVideo?.offsetMs || 0);
  const driftSigned = signedDrift(video, target);
  const drift = Math.abs(driftSigned);
  const profile = isDirectBili(state.selectedVideo, state.streamingTarget) ? DIRECT_BILI_SYNC : (SYNC_PROFILES[state.settings.syncMode || 'balanced'] || SYNC_PROFILES.balanced);
  const cooldown = isDirectBili(state.selectedVideo, state.streamingTarget) ? 150 : SYNC_COOLDOWN_MS;
  const now = Date.now();
  if (!options.force && drift <= profile.toleranceSeconds) {
    applyRate(video);
    return false;
  }
  if (!options.force && drift < profile.hardSeekSeconds) {
    const correction = clamp(driftSigned / profile.hardSeekSeconds, -profile.maxRateDelta, profile.maxRateDelta);
    try {
      video.playbackRate = state.audioClock.playbackRate * (1 + correction);
      return true;
    } catch {
      return false;
    }
  }
  if (!options.force && !options.bypassCooldown && now - state.lastSyncAt < cooldown) return false;
  try {
    video.currentTime = target;
    applyRate(video);
    if (options.recordCooldown !== false) state.lastSyncAt = now;
    return true;
  } catch {
    return false;
  }
};
const syncVideos = (options = {}) => {
  if (!panelActive() || document.hidden) return false;
  const a = syncOne(refs.foregroundVideo, options);
  const b = syncOne(refs.backgroundVideo, { ...options, recordCooldown: false });
  return a || b;
};

const unavailableReason = () => {
  const video = state.selectedVideo;
  const showVideo = Boolean(state.settings.enabled !== false && video?.playableInApp && video.mediaUrl && !state.videoError);
  const yt = youtubeEmbedUrl(video, { autoplay: state.isAudioPlaying, controls: false });
  if (showVideo || yt) return showVideo && video?.temporary && !isEchoLive(video) ? t('mvPanel.status.temporaryPlayback') : null;
  if (state.error) return summarizeLoadError(state.error);
  if (state.isLoading) return t('mvPanel.status.loading');
  if (!video) return t('mvPanel.status.notFound');
  if (isBilibiliBlocked(video)) return t('mvPanel.status.bilibiliBlocked');
  if (state.videoError) return t('mvPanel.status.videoFailed');
  if (!video.playableInApp) return video.provider === 'local' ? t('mvPanel.status.localUnsupported') : t('mvPanel.status.externalRequired');
  if (!video.mediaUrl) return t('mvPanel.status.missingUrl');
  return t('mvPanel.status.inAppUnavailable');
};

const applyPageFlags = () => {
  const page = lyricsPageEl();
  const mvOn = panelActive();
  if (page) {
    if (page.dataset.viewMode === 'mv') page.dataset.viewMode = 'lyrics';
    page.dataset.echoMv = mvOn ? 'on' : 'off';
    if (isHostLyricsStyle(page)) page.dataset.echoMvHostStyle = 'true';
    else delete page.dataset.echoMvHostStyle;
    if (isLyricsStageStyle(page)) page.dataset.echoMvStage = 'true';
    else delete page.dataset.echoMvStage;
    if (mvOn && state.settings.hideLyrics === true) page.setAttribute('data-mv-lyrics-hidden', 'true');
    else page.removeAttribute('data-mv-lyrics-hidden');
  }
  hideOfficialMvChrome(page);
  page?.querySelectorAll('aside.echo-mv-panel').forEach((node) => node.remove());
  if (refs.transportBtn) {
    const open = isDrawerDomOpen();
    refs.transportBtn.classList.toggle('is-soft-active', open);
    refs.transportBtn.setAttribute('aria-pressed', String(open));
  }
};

const bindVideoEvents = (video, kind) => {
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.addEventListener('error', () => {
    state.videoError = true;
    scheduleRender();
  });
  video.addEventListener('seeking', () => { state.seeking = true; });
  video.addEventListener('seeked', () => { state.seeking = false; });
  video.addEventListener('loadedmetadata', () => {
    if (kind === 'background') {
      const width = Math.round(video.videoWidth || state.selectedVideo?.width || 0);
      const height = Math.round(video.videoHeight || state.selectedVideo?.height || 0);
      if (width > 0 && height > 0) state.immersiveVideoSize = { width, height };
    }
    applyRate(video);
    syncVideos({ force: true, bypassCooldown: true });
    if (state.isAudioPlaying) playVideo(video);
    else video.pause();
    scheduleRender();
  });
  if (kind === 'foreground') {
    video.addEventListener('ended', () => {
      if (state.isAudioPlaying) window.dispatchEvent(new CustomEvent(MV_ENDED_EVENT, { detail: { trackId: state.trackId } }));
    });
  }
};

const ensureBackground = (page, mediaUrl, adaptive, youtubeUrl) => {
  let background = page.querySelector(':scope > .lyrics-mv-background');
  if (!background) {
    background = el('div', 'lyrics-mv-background', { 'aria-hidden': 'true' });
    page.prepend(background);
  }
  refs.background = background;
  const scale = ((state.settings.immersiveBackgroundScalePercent ?? 115) / 100);
  const autoScale = state.settings.immersiveBackgroundAutoScale === false ? 1 : (() => {
    const bounds = state.immersiveBounds;
    const size = state.immersiveVideoSize;
    if (!bounds || !size || bounds.width <= 0 || bounds.height <= 0 || size.width <= 0 || size.height <= 0) return 1;
    const cover = Math.max(bounds.width / size.width, bounds.height / size.height);
    const contain = Math.min(bounds.width / size.width, bounds.height / size.height);
    if (!Number.isFinite(cover) || !Number.isFinite(contain) || contain <= 0) return 1;
    return clamp(cover / contain, 1, 3.5);
  })();
  background.style.setProperty('--mv-immersive-scale', (scale * autoScale).toFixed(2));
  background.style.setProperty('--mv-immersive-auto-scale', autoScale.toFixed(2));
  background.style.setProperty('--mv-immersive-position-x', `${state.settings.immersiveBackgroundOffsetXPercent ?? 50}%`);
  background.style.setProperty('--mv-immersive-position-y', `${state.settings.immersiveBackgroundOffsetYPercent ?? 50}%`);
  background.style.setProperty('--mv-immersive-blur', `${state.settings.immersiveBackgroundBlurPx ?? 0}px`);
  background.style.setProperty('--mv-immersive-brightness', `${state.settings.immersiveBackgroundBrightnessPercent ?? 100}%`);
  background.style.setProperty('--mv-immersive-overlay-opacity', ((state.settings.immersiveBackgroundOverlayOpacityPercent ?? 0) / 100).toFixed(2));
  background.dataset.autoScale = state.settings.immersiveBackgroundAutoScale === false ? 'false' : 'true';
  if (state.settings.lyricsReadabilityEnhanced === true) background.dataset.lyricsReadability = 'true';
  else delete background.dataset.lyricsReadability;
  if (youtubeUrl) background.dataset.provider = 'youtube';
  else delete background.dataset.provider;
  if (!background.dataset.echoMvDragBound) {
    background.dataset.echoMvDragBound = 'true';
    let drag = null;
    background.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      background.setPointerCapture(event.pointerId);
      drag = {
        startX: event.clientX,
        startY: event.clientY,
        offsetX: state.settings.immersiveBackgroundOffsetXPercent ?? 50,
        offsetY: state.settings.immersiveBackgroundOffsetYPercent ?? 50,
      };
      background.dataset.dragging = 'true';
    });
    background.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const rect = background.getBoundingClientRect();
      const nextX = clamp(Math.round(drag.offsetX + ((event.clientX - drag.startX) / Math.max(1, rect.width)) * 100), 0, 100);
      const nextY = clamp(Math.round(drag.offsetY + ((event.clientY - drag.startY) / Math.max(1, rect.height)) * 100), 0, 100);
      state.settings.immersiveBackgroundOffsetXPercent = nextX;
      state.settings.immersiveBackgroundOffsetYPercent = nextY;
      background.style.setProperty('--mv-immersive-position-x', `${nextX}%`);
      background.style.setProperty('--mv-immersive-position-y', `${nextY}%`);
    });
    const endDrag = (event, persist) => {
      if (!drag) return;
      const rect = background.getBoundingClientRect();
      const nextX = clamp(Math.round(drag.offsetX + ((event.clientX - drag.startX) / Math.max(1, rect.width)) * 100), 0, 100);
      const nextY = clamp(Math.round(drag.offsetY + ((event.clientY - drag.startY) / Math.max(1, rect.height)) * 100), 0, 100);
      drag = null;
      background.dataset.dragging = 'false';
      try { background.releasePointerCapture(event.pointerId); } catch {}
      if (persist) void patchSettings({ immersiveBackgroundOffsetXPercent: nextX, immersiveBackgroundOffsetYPercent: nextY });
    };
    background.addEventListener('pointerup', (event) => endDrag(event, true));
    background.addEventListener('pointercancel', (event) => endDrag(event, false));
    background.addEventListener('wheel', (event) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY < 0 ? 1 : -1;
      const next = clampScale((state.settings.immersiveBackgroundScalePercent ?? 115) + direction * SCALE_WHEEL_STEP);
      state.settings.immersiveBackgroundScalePercent = next;
      background.style.setProperty('--mv-immersive-scale', ((next / 100) * autoScale).toFixed(2));
      scalePending = next;
      window.clearTimeout(timers.scaleSave);
      timers.scaleSave = window.setTimeout(() => {
        timers.scaleSave = 0;
        if (scalePending !== null) void patchSettings({ immersiveBackgroundScalePercent: scalePending });
        scalePending = null;
      }, SCALE_SAVE_MS);
    }, { passive: false });
  }
  if (youtubeUrl) {
    lastBgKey = `yt:${youtubeUrl}`;
    background.replaceChildren(el('iframe', 'lyrics-mv-background-video lyrics-mv-background-video--youtube', {
      src: youtubeUrl,
      allow: 'autoplay; encrypted-media; picture-in-picture',
      referrerpolicy: 'strict-origin-when-cross-origin',
      tabindex: '-1',
      title: '',
    }));
    refs.backgroundVideo = null;
    return;
  }
  const key = `bg:${state.selectedVideo?.id || 'unknown'}:${mediaUrl || 'none'}`;
  let video = background.querySelector('video.lyrics-mv-background-video');
  if (!video || lastBgKey !== key) {
    releaseVideo(video);
    video = el('video', 'lyrics-mv-background-video', { loop: true });
    bindVideoEvents(video, 'background');
    background.replaceChildren(video);
    lastBgKey = key;
  }
  refs.backgroundVideo = video;
  if (!adaptive && video.getAttribute('src') !== mediaUrl) video.src = mediaUrl || '';
  video.muted = true;
  video.loop = true;
};

const removeBackground = (page) => {
  page?.querySelectorAll(':scope > .lyrics-mv-background').forEach((node) => {
    node.querySelectorAll('video').forEach(releaseVideo);
    node.remove();
  });
  refs.background = null;
  refs.backgroundVideo = null;
  lastBgKey = '';
};

const renderPanel = () => {
  const page = lyricsPageEl();
  if (!page) return;
  refs.lyricsPage = page;
  hideOfficialMvChrome(page);
  page.querySelectorAll(':scope > aside.echo-mv-panel, :scope > .lyrics-mv-unavailable-reason, :scope > .lyrics-mv-diagnostics-report, :scope > .lyrics-mv-settings-entry, :scope > section.lyrics-mv-panel[data-echo-mv-mod="true"]').forEach((node) => node.remove());
  refs.panel = null;
  const enabled = panelActive();
  applyPageFlags();
  if (!enabled) {
    removeBackground(page);
    releaseVideo(refs.foregroundVideo);
    lastPanelSignature = '';
    return;
  }
  const video = state.selectedVideo;
  const mediaUrl = video?.playableInApp && video.mediaUrl && !state.videoError ? video.mediaUrl : null;
  const yt = youtubeEmbedUrl(video, { autoplay: state.isAudioPlaying, controls: false });
  const ytBg = youtubeEmbedUrl(video, { autoplay: state.isAudioPlaying, controls: false, loop: true });
  const showVideo = Boolean(mediaUrl);
  const live = isEchoLive(video);
  const immersive = Boolean(!live && ((state.settings.immersiveBackground !== false && showVideo) || (yt && ytBg)));
  const signature = [enabled, mediaUrl || '', yt || '', immersive, video?.id || '', lyricsPageStyle(page)].join('\0');
  if (signature === lastPanelSignature) {
    if (immersive && (mediaUrl || ytBg)) ensureBackground(page, mediaUrl, isAdaptiveStream(video), yt ? ytBg : null);
    return;
  }
  lastPanelSignature = signature;
  if (immersive && (mediaUrl || ytBg)) ensureBackground(page, mediaUrl, isAdaptiveStream(video), yt ? ytBg : null);
  else removeBackground(page);
  refs.foregroundVideo = null;
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (immersive && refs.background && window.ResizeObserver) {
    const updateBounds = () => {
      const rect = refs.background.getBoundingClientRect();
      state.immersiveBounds = { width: Math.round(rect.width || window.innerWidth), height: Math.round(rect.height || window.innerHeight) };
    };
    updateBounds();
    resizeObserver = new ResizeObserver(updateBounds);
    resizeObserver.observe(refs.background);
  }
};

const replayCurrent = async () => {
  if (state.settings.replayAudioOnChange === false) return;
  const track = state.currentTrack;
  if (!track) return;
  try {
    const player = playerApi();
    if (player?.playTrack) await player.playTrack(track);
    else if (echoApi().playback?.play) await echoApi().playback.play();
  } catch {}
};

const runBusy = async (work) => {
  state.busy = true;
  state.error = null;
  state.networkError = null;
  state.networkNotice = null;
  scheduleRender();
  try {
    await work();
  } catch (error) {
    const message = summarizeActionError(error);
    state.error = message;
    toast(message);
  } finally {
    state.busy = false;
    scheduleRender();
  }
};

const bestAutoCandidate = (candidates) => {
  const threshold = state.settings.autoApplyThreshold ?? 0.7;
  return [...(candidates || [])]
    .filter((item) => Number(item.score) >= threshold)
    .sort((left, right) => (Number(right.score) || 0) - (Number(left.score) || 0))[0] || null;
};

const searchNetwork = () => runBusy(async () => {
  if (!state.trackId) throw new Error(t('mvSettings.error.noActiveTrackNetworkSearch'));
  const query = state.searchQuery;
  const track = state.currentTrack;
  const effectiveId = snapshotTrackIdFor(track, state.trackId);
  const autoSelect = state.settings.autoSearch !== false;
  const next = track && shouldUseSnapshotSearch(track, effectiveId)
    ? await mvApi.searchNetworkCandidatesForSnapshot(snapshotFromTrack(track, effectiveId, { query, title: state.title, artist: state.artist, coverUrl: state.coverUrl, autoSelect }))
    : await mvApi.searchNetworkCandidates(effectiveId, query);
  state.candidates = Array.isArray(next) ? next : [];
  state.networkNotice = state.candidates.length === 0 ? t('mvSettings.error.noNetworkCandidates') : null;
  let selected = await resolveNetworkVideo(await mvApi.getSelected(effectiveId));
  if (autoSelect && !isPlayableVideo(selected)) {
    const best = bestAutoCandidate(state.candidates);
    if (best?.id) {
      try {
        selected = await resolveNetworkVideo(await mvApi.selectVideo(effectiveId, best.id));
      } catch {}
    }
  }
  state.selectedVideo = selected;
  if (selected) notifyMvChanged(effectiveId);
});

const findLocal = () => runBusy(async () => {
  if (!state.trackId) throw new Error(t('mvSettings.error.noActiveTrackMatching'));
  const next = await mvApi.findLocalCandidates(state.trackId);
  state.candidates = Array.isArray(next) ? next : [];
  state.networkNotice = state.candidates.length === 0 ? t('mvSettings.error.noLocalCandidates') : null;
});

const chooseLocal = () => runBusy(async () => {
  if (!state.trackId) throw new Error(t('mvSettings.error.noActiveTrackBinding'));
  const video = await mvApi.chooseLocalVideo(state.trackId);
  if (video) {
    state.selectedVideo = video;
    state.candidates = [];
    notifyMvChanged(state.trackId);
    await replayCurrent();
  }
});

const bindCustom = () => runBusy(async () => {
  if (!state.trackId) throw new Error(t('mvSettings.error.noActiveTrackBinding'));
  const video = await mvApi.bindUrl(state.trackId, state.customUrl);
  state.selectedVideo = await resolveNetworkVideo(video);
  state.candidates = [];
  notifyMvChanged(state.trackId);
  await replayCurrent();
});

const selectCandidate = (candidateId) => runBusy(async () => {
  if (!state.trackId) throw new Error(t('mvSettings.error.noActiveTrackBinding'));
  state.busyCandidateId = candidateId;
  const effectiveId = snapshotTrackIdFor(state.currentTrack, state.trackId);
  const video = await mvApi.selectVideo(effectiveId, candidateId);
  state.selectedVideo = await resolveNetworkVideo(video);
  state.candidates = [];
  state.busyCandidateId = null;
  notifyMvChanged(effectiveId);
  await replayCurrent();
});

const clearSelected = () => runBusy(async () => {
  if (!state.trackId) return;
  await mvApi.clearSelected(state.trackId);
  state.selectedVideo = null;
  notifyMvChanged(state.trackId);
});

const openExternal = async () => {
  if (!state.selectedVideo) return;
  try { await mvApi.openExternal(state.selectedVideo.id); }
  catch (error) { state.error = summarizeActionError(error); toast(state.error); scheduleRender(); }
};

const changeOffset = async (nextOffsetMs) => {
  if (!state.trackId || !state.selectedVideo) return;
  const clamped = clampOffset(nextOffsetMs);
  state.selectedVideo = { ...state.selectedVideo, offsetMs: clamped };
  state.offsetSaving = true;
  scheduleRender();
  try {
    const next = await mvApi.setOffset(state.trackId, clamped);
    if (next) state.selectedVideo = await resolveNetworkVideo(next);
    notifyMvChanged(state.trackId);
    syncVideos({ force: true, bypassCooldown: true });
  } catch (error) {
    state.error = summarizeActionError(error);
  } finally {
    state.offsetSaving = false;
    scheduleRender();
  }
};

const switchRow = (pressed, title, description, onClick, extraClass = 'mv-auto-apply-toggle') => btn(`mv-source-toggle ${extraClass}`, { 'aria-pressed': pressed, onclick: onClick }, [
  el('span', 'mv-switch-track', { 'aria-hidden': 'true' }, [el('span')]),
  el('span', 'mv-toggle-copy', null, [el('strong', '', null, title), el('em', '', null, description)]),
]);

const sliderRow = (title, hint, attrs, display) => {
  const label = el('label', 'mv-threshold-control');
  label.append(
    el('span', 'mv-threshold-copy', null, [el('strong', '', null, title), el('em', '', null, hint)]),
    el('span', 'mv-threshold-slider', null, [
      el('input', '', { type: 'range', ...attrs }),
      el('strong', '', null, display),
    ]),
  );
  return label;
};

const renderOffset = () => {
  if (!state.trackId || !state.selectedVideo) return null;
  const offset = clampOffset(state.selectedVideo.offsetMs || 0);
  const step = state.offsetStep;
  const section = el('section', 'mv-drawer-offset', { 'aria-label': t('mvSettings.offset.aria') });
  const startCard = el('div', 'mv-offset-start-card');
  const startInput = el('input', '', {
    type: 'number',
    min: '0',
    max: String(MV_OFFSET_MAX / 1000),
    step: '0.1',
    value: formatSecondsInput(Math.max(0, offset) / 1000),
    'aria-label': t('mvSettings.offset.startInput'),
    disabled: Boolean(state.error && isMvDatabaseError(state.error)),
  });
  startInput.addEventListener('change', () => {
    const next = Number(startInput.value);
    if (Number.isFinite(next)) void changeOffset(Math.max(0, next) * 1000);
  });
  startCard.append(
    el('span', '', null, [el('strong', '', null, t('mvSettings.offset.startTitle')), el('em', '', null, t('mvSettings.offset.startDescription'))]),
    el('label', '', null, [startInput, el('em', '', null, 's')]),
    btn('mv-offset-replay-button', {
      'aria-label': t('mvSettings.offset.replayTitle'),
      title: t('mvSettings.offset.replayTitle'),
      disabled: state.busy || !state.currentTrack,
      onclick: () => { notifyMvChanged(state.trackId); void replayCurrent(); },
    }, [svgIcon('play', 14), el('span', '', null, t('mvSettings.offset.replay'))]),
  );
  const collapse = btn('mv-offset-collapse-toggle', {
    'aria-expanded': state.offsetOpen,
    onclick: () => { state.offsetOpen = !state.offsetOpen; scheduleRender(); },
  }, [
    el('span', '', null, [state.offsetOpen ? svgIcon('chevronDown', 14) : svgIcon('chevronRight', 14), t('mvSettings.offset.title')]),
    el('strong', '', null, formatOffset(offset)),
  ]);
  section.append(startCard, collapse);
  if (state.offsetOpen) {
    const advanced = el('div', 'mv-offset-advanced');
    const slider = el('input', '', {
      type: 'range',
      min: String(MV_OFFSET_MIN),
      max: String(MV_OFFSET_MAX),
      step: String(MV_OFFSET_STEP),
      value: String(offset),
      'aria-label': t('mvSettings.offset.slider'),
    });
    slider.addEventListener('change', () => void changeOffset(Number(slider.value)));
    const number = el('input', '', {
      type: 'number',
      min: String(MV_OFFSET_MIN / 1000),
      max: String(MV_OFFSET_MAX / 1000),
      step: '0.1',
      value: String(offset / 1000),
      'aria-label': t('mvSettings.offset.input'),
    });
    number.addEventListener('change', () => void changeOffset(Number(number.value) * 1000));
    const steps = el('div', 'mv-offset-step-row', { role: 'group', 'aria-label': t('mvSettings.offset.step') });
    steps.append(el('span', '', null, t('mvSettings.offset.step')));
    OFFSET_STEP_OPTIONS.forEach((item) => {
      steps.append(btn('', {
        'aria-pressed': state.offsetStep === item,
        onclick: () => { state.offsetStep = item; scheduleRender(); },
      }, formatOffsetMagnitude(item)));
    });
    const later = clampOffset(offset - step);
    const earlier = clampOffset(offset + step);
    const actions = el('div', 'mv-offset-actions');
    actions.append(
      btn('', { disabled: state.offsetSaving || later === offset, title: t('mvSettings.offset.later', { value: formatOffsetMagnitude(step) }), onclick: () => void changeOffset(later) }, [svgIcon('rewind', 15), el('span', '', null, t('mvSettings.offset.laterShort', { value: formatOffsetMagnitude(step) }))]),
      btn('', { disabled: state.offsetSaving || earlier === offset, title: t('mvSettings.offset.earlier', { value: formatOffsetMagnitude(step) }), onclick: () => void changeOffset(earlier) }, [svgIcon('fastForward', 15), el('span', '', null, t('mvSettings.offset.earlierShort', { value: formatOffsetMagnitude(step) }))]),
      btn('', { disabled: state.offsetSaving || offset === 0, title: t('mvSettings.offset.reset'), onclick: () => void changeOffset(0) }, [svgIcon('rotate', 14), el('span', '', null, t('mvSettings.offset.resetShort'))]),
    );
    advanced.append(
      el('p', '', null, t('mvSettings.offset.description')),
      el('div', 'mv-offset-slider-row', null, [el('span', '', null, formatOffset(MV_OFFSET_MIN)), slider, el('span', '', null, formatOffset(MV_OFFSET_MAX))]),
      el('label', 'mv-offset-number', null, [el('span', '', null, t('mvSettings.offset.input')), number, el('em', '', null, 's')]),
      steps,
      actions,
    );
    section.append(advanced);
  }
  return section;
};

const setSelectedQuality = (qualityId) => {
  const selected = state.selectedVideo;
  if (!selected) return;
  void (async () => {
    try {
      const next = await mvApi.setQuality(selected.id, qualityId);
      state.selectedVideo = next;
      notifyMvChanged(state.trackId);
      scheduleRender();
    } catch (error) {
      toast(summarizeActionError(error));
    }
  })();
};

const renderQualityChips = () => {
  const settings = state.settings;
  const selected = state.selectedVideo;
  const row = el('div', 'echo-mv-quality', { role: 'group', 'aria-label': t('mvSettings.aria.maxQualityOptions') });
  QUALITY_CAPS.forEach((qualityId) => {
    row.append(btn('echo-mv-quality-item', {
      'aria-pressed': settings.maxQuality === qualityId,
      dataset: { active: settings.maxQuality === qualityId },
      onclick: () => { state.maxQualityOpen = false; void patchSettings({ maxQuality: qualityId }); },
    }, [
      el('strong', '', null, qualityCapLabel(qualityId)),
      el('small', '', null, t('mvSettings.network.maxQuality')),
    ]));
  });
  row.append(btn('echo-mv-quality-item', {
    'aria-pressed': settings.allow60fps !== false,
    dataset: { active: settings.allow60fps !== false },
    onclick: () => void patchSettings({ allow60fps: settings.allow60fps === false }),
  }, [el('strong', '', null, '60fps'), el('small', '', null, t('mvSettings.network.allow60fps'))]));
  if (state.variants.length && selected) {
    state.variants.forEach((variant) => {
      row.append(btn('echo-mv-quality-item', {
        'aria-pressed': variant.id === selected.selectedQualityId,
        dataset: { active: variant.id === selected.selectedQualityId },
        onclick: () => setSelectedQuality(variant.id),
      }, [
        el('strong', '', null, variant.label || variant.id),
        el('small', '', null, t('mvSettings.engine.quality')),
      ]));
    });
  }
  return row;
};

const sheetSignature = () => {
  const selected = state.selectedVideo;
  const settings = state.settings;
  return [
    state.drawerRender,
    state.drawerMotion,
    state.sheetCollapsed,
    localeId,
    state.busy,
    state.busyCandidateId,
    state.trackId,
    state.title,
    state.artist,
    state.searchQuery,
    state.useCurrentSong,
    state.customUrl,
    state.networkOpen,
    state.maxQualityOpen,
    state.offsetOpen,
    state.offsetStep,
    state.offsetSaving,
    state.immersiveOpen,
    state.error,
    state.networkNotice,
    state.networkError,
    state.diagnosticsEnabled,
    state.draggedProvider,
    state.dragOverProvider,
    state.isLoading,
    settings.enabled,
    settings.maxQuality,
    settings.allow60fps,
    settings.autoSearch,
    settings.autoPreload,
    settings.autoApplyThreshold,
    settings.titleOnlySearch,
    settings.preferHighestViewCount,
    settings.restartAudioOnLoad,
    settings.syncMode,
    settings.replayAudioOnChange,
    settings.immersiveBackground,
    settings.hideLyrics,
    settings.lyricsReadabilityEnhanced,
    settings.immersiveBackgroundAutoScale,
    settings.immersiveBackgroundScalePercent,
    settings.immersiveBackgroundOffsetXPercent,
    settings.immersiveBackgroundOffsetYPercent,
    settings.immersiveBackgroundBlurPx,
    settings.immersiveBackgroundBrightnessPercent,
    settings.immersiveBackgroundOverlayOpacityPercent,
    (settings.enabledProviders || []).join(','),
    (settings.providerOrder || []).join(','),
    selected?.id,
    selected?.offsetMs,
    selected?.qualityLabel,
    selected?.selectedQualityId,
    selected?.mediaUrl,
    selected?.title,
    state.candidates.map((item) => item.id).join(','),
    state.variants.map((item) => item.id).join(','),
  ].join('\0');
};

const sheetIsBusy = (root) => Boolean(root?.querySelector(':active'));
const sheetFocusKey = (node) => [node?.tagName, node?.type, node?.getAttribute?.('aria-label'), node?.className].filter(Boolean).join('|');

const renderDrawer = () => {
  if (!state.drawerRender) {
    refs.drawerRoot?.remove();
    refs.drawerRoot = null;
    lastDrawerSignature = '';
    pendingDrawerRender = false;
    return;
  }
  if (refs.drawerRoot && !refs.drawerRoot.isConnected) {
    refs.drawerRoot = null;
    lastDrawerSignature = '';
  }
  const settings = state.settings;
  const enabled = settings.enabled !== false;
  const selected = state.selectedVideo;
  const collapsed = state.sheetCollapsed;
  const signature = sheetSignature();
  const root = refs.drawerRoot && refs.drawerRoot.isConnected
    ? refs.drawerRoot
    : el('div', 'echo-mv-root no-drag', { role: 'presentation' });
  refs.drawerRoot = root;
  root.dataset.open = state.drawerMotion ? 'true' : 'false';
  root.dataset.collapsed = collapsed ? 'true' : 'false';
  if (signature === lastDrawerSignature && root.isConnected && root.querySelector('.echo-mv-sheet')) return;
  if (sheetIsBusy(root) && root.querySelector('.echo-mv-sheet')) {
    pendingDrawerRender = true;
    return;
  }
  lastDrawerSignature = signature;
  pendingDrawerRender = false;
  const activeTitle = state.currentTrack ? `${state.currentTrack.title} - ${state.currentTrack.artist || state.currentTrack.albumArtist || ''}` : (state.trackId || t('mvSettings.status.noActiveTrack'));
  const reason = unavailableReason();
  const scrim = btn('echo-mv-scrim', { 'aria-label': t('mvSettings.action.close'), onclick: onSheetScrimClick });
  const sheet = el('aside', 'echo-mv-sheet', { 'aria-label': t('mvSettings.aria.drawer') });
  const enable = el('label', 'echo-mv-enable');
  const enableInput = el('input', '', { type: 'checkbox', checked: enabled });
  enableInput.addEventListener('change', () => void patchSettings({ enabled: enableInput.checked }));
  enable.append(enableInput, el('span', '', null, t('mvSettings.general.enabled')));
  const bar = el('div', 'echo-mv-sheet-bar');
  bar.append(
    el('strong', '', null, t('mvPanel.title')),
    el('div', 'echo-mv-sheet-actions', null, [
      enable,
      btn('echo-mv-icon-btn', {
        'aria-label': collapsed ? t('mvPanel.action.expand') : t('mvPanel.action.hide'),
        title: collapsed ? t('mvPanel.action.expand') : t('mvPanel.action.hide'),
        onclick: () => { state.sheetCollapsed = !state.sheetCollapsed; scheduleRender(); },
      }, [svgIcon(collapsed ? 'chevronDown' : 'minus', 16)]),
      btn('echo-mv-icon-btn', {
        'aria-label': t('mvPanel.action.close'),
        title: t('mvSettings.action.close'),
        onclick: () => openDrawer(false),
      }, [svgIcon('x', 16)]),
    ]),
  );
  const status = el('p', 'echo-mv-status', { 'aria-live': 'polite' }, reason || selected?.title || (state.isLoading ? t('mvPanel.status.loading') : t('mvSettings.engine.title')));
  const current = el('div', 'echo-mv-current');
  current.append(
    el('span', '', null, [el('small', '', null, t('mvSettings.engine.title')), el('strong', '', null, activeTitle)]),
    el('span', '', null, [el('small', '', null, t('mvSettings.engine.mvTitle')), el('strong', '', null, formatVideoTitle(selected, t('mvSettings.status.none')))]),
    el('span', '', null, [el('small', '', null, t('mvSettings.engine.quality')), el('strong', '', null, formatVideoQuality(selected, t('mvSettings.status.none')))]),
  );
  const body = el('div', 'echo-mv-sheet-body');
  const binding = el('section', 'echo-mv-section');
  binding.append(
    el('div', 'echo-mv-section-title', null, [svgIcon('database', 17), el('h3', '', null, t('mvSettings.binding.title'))]),
    el('div', 'mv-settings-actions', null, [
      btn('', { disabled: state.busy || !enabled, onclick: () => void searchNetwork() }, [svgIcon('globe', 15), t('mvSettings.action.searchNetwork')]),
      btn('', { disabled: state.busy, onclick: () => void findLocal() }, [svgIcon('search', 15), t('mvSettings.action.findLocal')]),
      btn('', { disabled: state.busy, onclick: () => void chooseLocal() }, [svgIcon('folder', 15), t('mvSettings.action.chooseFile')]),
      btn('', { disabled: state.busy, onclick: () => void loadSelected({ preserveCurrent: true }) }, [svgIcon('rotate', 15), t('mvSettings.action.refresh')]),
    ]),
  );
  if (selected) {
    const card = el('div', 'mv-selected-card');
    card.append(
      el('span', '', null, [
        el('strong', '', null, selected.title || t('mvSettings.binding.selectedMv')),
        el('em', '', null, `${providerLabel(selected.provider)}${formatVideoQuality(selected, '') ? ` / ${formatVideoQuality(selected, '')}` : ''}`),
      ]),
      el('div', '', null, [
        (!selected.playableInApp || selected.provider !== 'local') ? btn('', { 'aria-label': t('mvSettings.action.openExternal'), title: t('mvSettings.action.openExternal'), onclick: () => void openExternal() }, [svgIcon('external', 15)]) : null,
        btn('', { 'aria-label': t('mvSettings.action.removeSelected'), title: t('mvSettings.action.removeSelected'), onclick: () => void clearSelected() }, [svgIcon('x', 15)]),
      ]),
    );
    binding.append(card);
  }
  const offset = renderOffset();
  if (offset) binding.append(offset);
  const custom = el('form', 'mv-custom-card');
  custom.addEventListener('submit', (event) => { event.preventDefault(); void bindCustom(); });
  const customInput = el('input', '', {
    value: state.customUrl,
    'aria-label': t('mvSettings.custom.input'),
    placeholder: t('mvSettings.custom.placeholder'),
  });
  customInput.addEventListener('input', () => { state.customUrl = customInput.value; });
  custom.append(
    el('div', 'mv-custom-heading', null, [
      el('span', '', null, [svgIcon('link', 15), el('strong', '', null, t('mvSettings.custom.title'))]),
      el('em', '', null, t('mvSettings.custom.description')),
    ]),
    el('div', 'mv-custom-controls', null, [
      el('label', 'mv-custom-input', null, [customInput]),
      btn('', { type: 'submit', 'aria-label': t('mvSettings.custom.apply'), title: t('mvSettings.custom.apply'), disabled: state.busy || !state.customUrl.trim() }, [svgIcon('play', 17)]),
    ]),
  );
  if (selected?.providerUrl) {
    const link = el('a', '', { href: selected.providerUrl, target: '_blank', rel: 'noreferrer' }, [
      t('mvSettings.custom.playing', { provider: providerLabel(selected.provider), sourceId: selected.sourceId || selected.id }),
      svgIcon('external', 12),
    ]);
    link.addEventListener('click', (event) => { event.preventDefault(); void openExternal(); });
    custom.append(el('div', 'mv-custom-status', null, [
      link,
      el('span', '', null, t('mvSettings.custom.videoTitle', { title: selected.title || t('mvSettings.binding.selectedMv') })),
      el('span', 'mv-custom-badges', null, [
        el('em', '', null, selected.playableInApp ? t('mvSettings.custom.directDash') : t('mvSettings.candidate.external')),
        el('strong', '', null, formatVideoQuality(selected, t('mvSettings.status.none'))),
      ]),
    ]));
  }
  binding.append(custom);
  const search = el('form', 'mv-search-controls');
  search.addEventListener('submit', (event) => { event.preventDefault(); void searchNetwork(); });
  const searchInput = el('input', '', {
    value: state.searchQuery,
    'aria-label': t('mvSettings.search.input'),
    placeholder: t('mvSettings.search.placeholder'),
  });
  searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value;
    if (state.useCurrentSong) state.useCurrentSong = false;
  });
  search.append(
    el('label', 'mv-search-input', null, [svgIcon('search', 15), searchInput]),
    btn('', { type: 'submit', disabled: state.busy || !enabled || !state.searchQuery.trim() }, [svgIcon('search', 15), t('mvSettings.action.searchNetwork')]),
    switchRow(state.useCurrentSong, t('mvSettings.search.useCurrentSong'), state.useCurrentSong ? t('mvSettings.status.on') : t('mvSettings.status.off'), () => {
      state.useCurrentSong = !state.useCurrentSong;
      if (state.useCurrentSong) state.searchQuery = [state.title, state.artist].filter(Boolean).join(' ');
      scheduleRender();
    }, 'mv-current-song-toggle'),
  );
  binding.append(search);
  if (state.candidates.length) {
    const list = el('div', 'echo-mv-candidate-list', { 'aria-label': t('mvSettings.aria.candidates') });
    state.candidates.forEach((candidate) => {
      const item = btn('echo-mv-candidate', {
        disabled: state.busy || state.busyCandidateId !== null,
        title: candidate.title,
        onclick: () => void selectCandidate(candidate.id),
      });
      const thumb = el('span', 'echo-mv-candidate-thumb');
      if (candidate.thumbnailUrl && !state.failedThumbs.has(candidate.id)) {
        const img = el('img', '', { alt: candidate.title, draggable: 'false', referrerpolicy: 'no-referrer', src: candidate.thumbnailUrl });
        img.addEventListener('error', () => { state.failedThumbs.add(candidate.id); scheduleRender(); });
        thumb.append(img);
      } else {
        thumb.append(el('span', 'echo-mv-candidate-thumb-fallback', { 'aria-label': candidate.title }, [svgIcon('fileVideo', 15)]));
      }
      const badges = el('span', 'echo-mv-candidate-badges');
      badges.append(
        el('small', '', null, providerLabel(candidate.provider)),
        el('small', '', null, formatScore(candidate.score)),
        formatDuration(candidate.durationSeconds) ? el('small', '', null, formatDuration(candidate.durationSeconds)) : null,
        el('small', '', null, candidate.playableInApp ? t('mvSettings.candidate.inApp') : t('mvSettings.candidate.external')),
      );
      item.append(
        thumb,
        el('span', 'echo-mv-candidate-copy', null, [
          el('strong', '', null, candidate.title),
          el('em', '', null, candidate.uploader || (candidate.reasons || []).slice(0, 3).join(' / ') || providerLabel(candidate.provider)),
        ]),
        badges,
      );
      list.append(item);
    });
    binding.append(list);
  } else if (state.networkNotice) {
    binding.append(el('p', 'mv-settings-search-empty', { role: 'status' }, state.networkNotice));
  } else if (state.networkError) {
    binding.append(el('p', 'mv-settings-search-error', { role: 'alert' }, state.networkError));
  }

  const network = el('section', `echo-mv-section mv-network-section${state.networkOpen ? ' mv-network-section--open' : ''}${state.maxQualityOpen ? ' mv-section-menu-open' : ''}`);
  network.append(el('div', 'echo-mv-section-title', null, [
    el('span', '', null, [svgIcon('globe', 17), el('h3', '', null, t('mvSettings.network.title'))]),
    btn('mv-section-collapse', {
      'aria-expanded': state.networkOpen,
      'aria-label': state.networkOpen ? t('mvSettings.action.collapseNetwork') : t('mvSettings.action.expandNetwork'),
      title: state.networkOpen ? t('mvSettings.action.collapseNetwork') : t('mvSettings.action.expandNetwork'),
      onclick: () => { state.networkOpen = !state.networkOpen; scheduleRender(); },
    }, [svgIcon('chevronDown', 16)]),
  ]));
  if (state.networkOpen) {
    const enabledProviders = new Set(settings.enabledProviders || []);
    network.append(
      switchRow(settings.autoSearch, t('mvSettings.network.autoApply'), settings.autoSearch ? t('mvSettings.status.on') : t('mvSettings.status.off'), () => {
        void (async () => {
          await patchSettings({ autoSearch: !settings.autoSearch });
          if (state.settings.autoSearch) void searchNetwork();
        })();
      }),
      sliderRow(t('mvSettings.network.autoApplyThreshold'), t('mvSettings.network.autoApplyThresholdDescription', { threshold: formatThreshold(settings.autoApplyThreshold) }), {
        min: '30', max: '100', step: '1', value: String(Math.round((settings.autoApplyThreshold ?? 0.7) * 100)),
        'aria-label': t('mvSettings.network.autoApplyThreshold'),
        onchange: (event) => void patchSettings({ autoApplyThreshold: thresholdFromPercent(event.currentTarget.value) }),
      }, formatThreshold(settings.autoApplyThreshold)),
      switchRow(settings.autoPreload, t('mvSettings.network.autoPreload'), t('mvSettings.network.autoPreloadDescription'), () => void patchSettings({ autoPreload: !settings.autoPreload })),
      switchRow(settings.titleOnlySearch !== false, t('mvSettings.network.titleOnlySearch'), t('mvSettings.network.titleOnlySearchDescription'), () => void patchSettings({ titleOnlySearch: settings.titleOnlySearch === false })),
      switchRow(state.diagnosticsEnabled, t('mvSettings.network.diagnosticsReport'), t('mvSettings.network.diagnosticsReportDescription'), () => {
        state.diagnosticsEnabled = !state.diagnosticsEnabled;
        writeDiagnostics(state.diagnosticsEnabled);
        scheduleRender();
      }),
      switchRow(settings.preferHighestViewCount !== false, t('mvSettings.network.preferHighestViewCount'), t('mvSettings.network.preferHighestViewCountDescription'), () => void patchSettings({ preferHighestViewCount: !(settings.preferHighestViewCount !== false) })),
      switchRow(settings.restartAudioOnLoad, t('mvSettings.network.restartAudioOnLoad'), t('mvSettings.network.restartAudioOnLoadDescription'), () => void patchSettings({ restartAudioOnLoad: !settings.restartAudioOnLoad })),
    );
    if (settings.restartAudioOnLoad) {
      const modes = el('div', 'mv-sync-mode-control');
      const group = el('div', 'mv-sync-mode-buttons', { role: 'group', 'aria-label': t('mvSettings.network.syncMode') });
      SYNC_MODES.forEach((mode) => {
        group.append(btn('', {
          'aria-pressed': (settings.syncMode || 'balanced') === mode,
          onclick: () => void patchSettings({ syncMode: mode }),
        }, t(`mvSettings.network.syncMode.${mode}`)));
      });
      modes.append(el('span', 'mv-threshold-copy', null, [el('strong', '', null, t('mvSettings.network.syncMode')), el('em', '', null, t('mvSettings.network.syncModeDescription'))]), group);
      network.append(modes);
    }
    network.append(
      switchRow(settings.replayAudioOnChange !== false, t('mvSettings.network.replayAudioOnChange'), t('mvSettings.network.replayAudioOnChangeDescription'), () => void patchSettings({ replayAudioOnChange: settings.replayAudioOnChange === false })),
      switchRow(settings.immersiveBackground !== false, t('mvSettings.immersive.title'), t('mvSettings.immersive.description'), () => void patchSettings({ immersiveBackground: settings.immersiveBackground === false })),
      switchRow(settings.hideLyrics === true, t('mvSettings.immersive.hideLyrics'), t('mvSettings.immersive.hideLyricsDescription'), () => void patchSettings({ hideLyrics: !settings.hideLyrics })),
      switchRow(settings.lyricsReadabilityEnhanced === true, t('mvSettings.immersive.lyricsReadability'), t('mvSettings.immersive.lyricsReadabilityDescription'), () => void patchSettings({ lyricsReadabilityEnhanced: !settings.lyricsReadabilityEnhanced })),
    );
    if (settings.immersiveBackground !== false) {
      const immersive = el('div', `mv-immersive-controls${state.immersiveOpen ? ' mv-immersive-controls--open' : ''}`);
      immersive.append(btn('mv-immersive-collapse', {
        'aria-expanded': state.immersiveOpen,
        onclick: () => {
          state.immersiveOpen = !state.immersiveOpen;
          writeImmersiveOpen(state.immersiveOpen);
          scheduleRender();
        },
      }, [
        el('span', '', null, [svgIcon('monitorPlay', 15), el('strong', '', null, t('mvSettings.immersive.tuning')), el('em', '', null, t('mvSettings.immersive.visualHint'))]),
        svgIcon('chevronDown', 16),
      ]));
      if (state.immersiveOpen) {
        const body = el('div', 'mv-immersive-controls-body');
        body.append(
          btn('mv-immersive-reset', { onclick: () => void patchSettings(immersiveDefaults) }, [svgIcon('rotate', 15), t('mvSettings.immersive.reset')]),
          switchRow(settings.immersiveBackgroundAutoScale !== false, t('mvSettings.immersive.autoScale'), t('mvSettings.immersive.autoScaleDescription'), () => void patchSettings({ immersiveBackgroundAutoScale: settings.immersiveBackgroundAutoScale === false })),
          sliderRow(t('mvSettings.immersive.zoom'), `${settings.immersiveBackgroundScalePercent ?? 115}%`, {
            min: '70', max: '220', step: '1', value: String(settings.immersiveBackgroundScalePercent ?? 115),
            'aria-label': t('mvSettings.immersive.zoom'),
            onchange: (event) => void patchSettings({ immersiveBackgroundScalePercent: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundScalePercent ?? 115}%`),
          sliderRow(t('mvSettings.immersive.positionX'), t('mvSettings.immersive.dragHint'), {
            min: '0', max: '100', step: '1', value: String(settings.immersiveBackgroundOffsetXPercent ?? 50),
            'aria-label': t('mvSettings.immersive.positionX'),
            onchange: (event) => void patchSettings({ immersiveBackgroundOffsetXPercent: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundOffsetXPercent ?? 50}%`),
          sliderRow(t('mvSettings.immersive.positionY'), t('mvSettings.immersive.dragHint'), {
            min: '0', max: '100', step: '1', value: String(settings.immersiveBackgroundOffsetYPercent ?? 50),
            'aria-label': t('mvSettings.immersive.positionY'),
            onchange: (event) => void patchSettings({ immersiveBackgroundOffsetYPercent: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundOffsetYPercent ?? 50}%`),
          sliderRow(t('mvSettings.immersive.blur'), t('mvSettings.immersive.visualHint'), {
            min: '0', max: '32', step: '1', value: String(settings.immersiveBackgroundBlurPx ?? 0),
            'aria-label': t('mvSettings.immersive.blur'),
            onchange: (event) => void patchSettings({ immersiveBackgroundBlurPx: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundBlurPx ?? 0}px`),
          sliderRow(t('mvSettings.immersive.brightness'), t('mvSettings.immersive.visualHint'), {
            min: '60', max: '140', step: '1', value: String(settings.immersiveBackgroundBrightnessPercent ?? 100),
            'aria-label': t('mvSettings.immersive.brightness'),
            onchange: (event) => void patchSettings({ immersiveBackgroundBrightnessPercent: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundBrightnessPercent ?? 100}%`),
          sliderRow(t('mvSettings.immersive.overlay'), t('mvSettings.immersive.overlayHint'), {
            min: '0', max: '100', step: '1', value: String(settings.immersiveBackgroundOverlayOpacityPercent ?? 0),
            'aria-label': t('mvSettings.immersive.overlay'),
            onchange: (event) => void patchSettings({ immersiveBackgroundOverlayOpacityPercent: Number(event.currentTarget.value) }),
          }, `${settings.immersiveBackgroundOverlayOpacityPercent ?? 0}%`),
        );
        immersive.append(body);
      }
      network.append(immersive);
    }
    const quality = el('div', 'mv-quality-controls');
    const menu = el('div', 'mv-quality-menu');
    menu.append(el('span', 'mv-field-label', null, t('mvSettings.network.maxQuality')));
    menu.append(btn('mv-quality-trigger', {
      'aria-expanded': state.maxQualityOpen,
      'aria-label': t('mvSettings.aria.maxQuality', { quality: qualityCapLabel(settings.maxQuality) }),
      onclick: () => { state.maxQualityOpen = !state.maxQualityOpen; scheduleRender(); },
    }, [el('span', '', null, qualityCapLabel(settings.maxQuality)), svgIcon('chevronDown', 15)]));
    if (state.maxQualityOpen) {
      const pop = el('div', 'mv-quality-popover', { role: 'menu', 'aria-label': t('mvSettings.aria.maxQualityOptions') });
      QUALITY_CAPS.forEach((qualityId) => {
        pop.append(btn('', {
          role: 'menuitem',
          dataset: { selected: settings.maxQuality === qualityId },
          onclick: () => { state.maxQualityOpen = false; void patchSettings({ maxQuality: qualityId }); },
        }, [el('span', '', null, qualityCapLabel(qualityId)), settings.maxQuality === qualityId ? svgIcon('check', 13) : null]));
      });
      menu.append(pop);
    }
    quality.append(menu);
    network.append(quality);
    network.append(switchRow(settings.allow60fps !== false, t('mvSettings.network.allow60fps'), t('mvSettings.network.allow60fpsDescription'), () => void patchSettings({ allow60fps: settings.allow60fps === false })));
    if (state.variants.length && selected) {
      const selectedMenu = el('div', 'mv-quality-menu');
      selectedMenu.append(el('span', 'mv-field-label', null, t('mvSettings.aria.selectedQuality', { quality: selected.qualityLabel || formatVideoQuality(selected, t('mvSettings.status.none')) })));
      const select = el('select', 'mv-quality-trigger');
      state.variants.forEach((variant) => {
        const option = el('option', '', { value: variant.id }, variant.label || variant.id);
        if (variant.id === selected.selectedQualityId) option.selected = true;
        select.append(option);
      });
      select.addEventListener('change', () => {
        void (async () => {
          try {
            const next = await mvApi.setQuality(selected.id, select.value);
            state.selectedVideo = next;
            notifyMvChanged(state.trackId);
            scheduleRender();
          } catch (error) {
            toast(summarizeActionError(error));
          }
        })();
      });
      selectedMenu.append(select);
      network.append(selectedMenu);
    }
    const sources = el('div', 'mv-source-list', { role: 'list', 'aria-label': t('mvSettings.aria.networkSources') });
    (settings.providerOrder || NETWORK_PROVIDERS).forEach((provider, index) => {
      const row = el('div', 'mv-source-row', {
        role: 'listitem',
        dataset: {
          dragging: state.draggedProvider === provider,
          dropTarget: state.draggedProvider && state.draggedProvider !== provider && state.dragOverProvider === provider,
        },
      });
      row.addEventListener('dragover', (event) => {
        if (!state.draggedProvider || state.draggedProvider === provider) return;
        event.preventDefault();
        state.dragOverProvider = provider;
        scheduleRender();
      });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const from = state.draggedProvider || event.dataTransfer.getData('text/plain');
        state.draggedProvider = null;
        state.dragOverProvider = null;
        const order = [...(state.settings.providerOrder || NETWORK_PROVIDERS)];
        const fromIndex = order.indexOf(from);
        const toIndex = order.indexOf(provider);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
        const [item] = order.splice(fromIndex, 1);
        order.splice(toIndex, 0, item);
        void patchSettings({ providerOrder: order });
      });
      const handle = el('span', 'mv-source-drag-handle', {
        draggable: true,
        role: 'button',
        tabindex: '0',
        'aria-label': t('mvSettings.action.dragSource', { provider: providerLabel(provider) }),
        title: t('mvSettings.action.dragReorder'),
      }, [svgIcon('grip', 16), el('small', '', null, String(index + 1))]);
      handle.addEventListener('dragstart', (event) => {
        state.draggedProvider = provider;
        state.dragOverProvider = provider;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', provider);
      });
      handle.addEventListener('dragend', () => { state.draggedProvider = null; state.dragOverProvider = null; scheduleRender(); });
      row.append(
        handle,
        btn('mv-source-toggle', { 'aria-pressed': enabledProviders.has(provider), onclick: () => {
          const next = enabledProviders.has(provider)
            ? (settings.enabledProviders || []).filter((item) => item !== provider)
            : [...(settings.enabledProviders || []), provider];
          void patchSettings({ enabledProviders: next });
        } }, [
          el('span', 'mv-switch-track', { 'aria-hidden': 'true' }, [el('span')]),
          providerLabel(provider),
        ]),
      );
      sources.append(row);
    });
    network.append(sources);
  }
  body.append(binding, network);
  if (state.error && state.error !== state.networkError) body.append(el('p', 'echo-mv-error', null, state.error));
  sheet.append(bar);
  if (!collapsed) sheet.append(status, current, renderQualityChips(), body);
  const active = document.activeElement;
  const restore = root.contains(active) ? {
    key: sheetFocusKey(active),
    value: active.value,
    start: active.selectionStart,
    end: active.selectionEnd,
  } : null;
  root.replaceChildren(scrim, sheet);
  if (!root.isConnected) document.body.append(root);
  if (restore?.key) {
    const next = [...root.querySelectorAll('input, textarea, button, select')].find((node) => sheetFocusKey(node) === restore.key);
    if (next) {
      next.focus();
      if (restore.value != null && 'value' in next) {
        try {
          next.value = restore.value;
          if (typeof restore.start === 'number') next.setSelectionRange(restore.start, restore.end ?? restore.start);
        } catch {}
      }
    }
  }
};

const scheduleRender = () => {
  if (disposed) return;
  if (timers.render) return;
  timers.render = window.requestAnimationFrame(() => {
    timers.render = 0;
    if (disposed) return;
    applyPageFlags();
    if (isLyricsPageVisible()) renderPanel();
    renderDrawer();
    if (pendingDrawerRender && !sheetIsBusy(refs.drawerRoot)) {
      pendingDrawerRender = false;
      lastDrawerSignature = '';
      renderDrawer();
    }
  });
};

const onSheetScrimClick = (event) => {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (performance.now() < state.sheetIgnoreCloseUntil) return;
  openDrawer(false);
};

const openDrawer = (open) => {
  if (state.drawerOpen === open && state.drawerRender === open) return;
  state.drawerOpen = open;
  window.clearTimeout(timers.drawerExit);
  if (open) {
    state.sheetIgnoreCloseUntil = performance.now() + 360;
    state.sheetCollapsed = false;
    state.drawerRender = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        state.drawerMotion = true;
        scheduleRender();
      });
    });
    void loadSettings();
    if (state.useCurrentSong) state.searchQuery = [state.title, state.artist].filter(Boolean).join(' ');
    if (state.trackId) {
      void (async () => {
        try {
          const video = await mvApi.getSelected(state.trackId);
          state.selectedVideo = await resolveNetworkVideo(video);
          const saved = await mvApi.getCandidates(state.trackId);
          if (Array.isArray(saved)) state.candidates = saved.filter((item) => !item.selected).map((item) => item.title ? item : videoToCandidate(item));
          scheduleRender();
        } catch (error) {
          state.error = summarizeActionError(error);
          scheduleRender();
        }
      })();
    }
  } else {
    state.drawerMotion = false;
    state.maxQualityOpen = false;
    scheduleRender();
    timers.drawerExit = window.setTimeout(() => {
      state.drawerRender = false;
      scheduleRender();
    }, DRAW_EXIT_MS);
  }
  scheduleRender();
};

const setViewMode = (mode, navigate) => {
  state.viewMode = mode;
  rememberViewMode(mode);
  applyPageFlags();
  if (mode === 'mv' && isLyricsPageVisible()) {
    void loadSelected({ preserveCurrent: true });
  }
  if (navigate && !isLyricsPageVisible()) {
    window.dispatchEvent(new CustomEvent(NAV_LYRICS_EVENT, { detail: { mode } }));
  }
  scheduleRender();
};

let lastEntryToggleAt = 0;
const reconcileDrawerState = () => {
  // DOM can be removed by route remounts / tooling while state still says open.
  // Without this, the next MV click only runs the close path and looks dead.
  if ((state.drawerOpen || state.drawerRender) && !refs.drawerRoot?.isConnected) {
    state.drawerOpen = false;
    state.drawerMotion = false;
    state.drawerRender = false;
    state.sheetCollapsed = false;
    refs.drawerRoot = null;
    lastDrawerSignature = '';
  }
};
const onMvButtonClick = (event) => {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const now = performance.now();
  if (now - lastEntryToggleAt < 250) return;
  lastEntryToggleAt = now;
  reconcileDrawerState();
  const shouldOpen = !isDrawerDomOpen();
  if (shouldOpen && !isLyricsPageVisible()) {
    window.dispatchEvent(new CustomEvent(NAV_LYRICS_EVENT, { detail: { mode: 'lyrics' } }));
  }
  openDrawer(shouldOpen);
};

const bindTransportButton = (button) => {
  if (button.dataset.echoMvBound === 'true') {
    refs.transportBtn = button;
    applyPageFlags();
    return;
  }
  button.dataset.echoMvBound = 'true';
  button.onclick = null;
  button.addEventListener('click', onMvButtonClick);
  refs.transportBtn = button;
  applyPageFlags();
};

const mountTransportButton = (lyricsButton) => {
  if (!lyricsButton?.parentElement) return;
  const existing = lyricsButton.parentElement.querySelector(':scope > .transport-mv-button');
  if (existing?.dataset.echoMvBound === 'true') {
    bindTransportButton(existing);
    return;
  }
  existing?.remove();
  const label = t('playerTransport.action.mv');
  const button = btn('icon-button transport-media-button transport-mv-button', {
    'data-workshop-icon': 'transport-mv',
    'aria-label': label,
    title: label,
  }, [svgIcon('film', 18)]);
  lyricsButton.parentElement.insertBefore(button, lyricsButton);
  bindTransportButton(button);
};

const restorePanel = () => {
  const page = lyricsPageEl();
  removeBackground(page);
  page?.querySelectorAll(':scope > .lyrics-mv-unavailable-reason, :scope > .lyrics-mv-diagnostics-report, :scope > .lyrics-mv-settings-entry').forEach((node) => node.remove());
  releaseVideo(refs.foregroundVideo);
  releaseVideo(refs.backgroundVideo);
  teardownOwnedPanel();
  hideOfficialMvChrome(page);
  page?.removeAttribute('data-mv-lyrics-hidden');
  if (page && page.dataset.viewMode === 'mv') page.dataset.viewMode = 'lyrics';
};

const onKeyDown = (event) => {
  if (event.key === 'Escape' && state.drawerOpen) {
    event.stopImmediatePropagation();
    openDrawer(false);
  }
};

const onSettingsChanged = (event) => {
  const patch = event instanceof CustomEvent ? event.detail : null;
  if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
    const keys = Object.keys(patch);
    if (keys.some((key) => MV_SETTINGS_KEYS.includes(key))) {
      state.settings = { ...state.settings, ...patch };
      applyPageFlags();
      if (keys.some((key) => RELOAD_SETTINGS_KEYS.includes(key))) void loadSelected({ preserveCurrent: true });
      else scheduleRender();
      return;
    }
  }
  void loadSettings().then(() => { applyPageFlags(); scheduleRender(); });
};

const onMvChanged = (event) => {
  const trackId = event instanceof CustomEvent ? event.detail?.trackId : null;
  if (!trackId || trackId === state.trackId) void loadSelected({ preserveCurrent: true });
};

const onCandidatesChanged = (event) => {
  const detail = event instanceof CustomEvent ? event.detail : null;
  if (!detail?.trackId || detail.trackId !== snapshotTrackIdFor(state.currentTrack, state.trackId) || !Array.isArray(detail.candidates)) return;
  state.candidates = detail.candidates;
  state.networkNotice = detail.candidates.length === 0 ? t('mvSettings.error.noNetworkCandidates') : null;
  scheduleRender();
};

const onSeeked = (event) => {
  const detail = event instanceof CustomEvent ? event.detail : null;
  const eventTrackId = typeof detail?.trackId === 'string' ? detail.trackId : null;
  if (eventTrackId && eventTrackId !== state.trackId) return;
  const position = Number(detail?.positionSeconds);
  if (!Number.isFinite(position)) return;
  state.audioClock = normalizeClock({ ...state.audioClock, positionSeconds: Math.max(0, position), updatedAtMs: performance.now() });
  syncVideos({ force: true, bypassCooldown: true });
};

const onNavigateLyrics = (event) => {
  const mode = event instanceof CustomEvent ? event.detail?.mode : null;
  if (mode === 'mv') openDrawer(true);
  else applyPageFlags();
};

const startTimers = () => {
  const tick = () => {
    if (disposed) return;
    void refreshPlayback();
    if (panelActive() && state.isAudioPlaying && shouldFollowMusic(state.settings, state.selectedVideo, state.streamingTarget)) {
      syncVideos();
    }
  };
  timers.poll = window.setInterval(tick, 250);
  void tick();
};

const observeDom = () => {
  const scan = () => {
    const lyricsButton = document.querySelector('button.transport-lyrics-button');
    if (lyricsButton) mountTransportButton(lyricsButton);
    applyPageFlags();
    if (!isLyricsPageVisible()) return;
    if (ownedPanelEl()) ownedPanelEl().remove();
    if (panelActive() && !refs.background) renderPanel();
  };
  scan();
  let scanTimer = 0;
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => { scanTimer = 0; if (!disposed) scan(); }, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  disposers.push(() => {
    observer.disconnect();
    window.clearTimeout(scanTimer);
  });
  if (external.extend?.observe) {
    disposers.push(external.extend.observe('button.transport-lyrics-button', (node) => mountTransportButton(node)));
  }
};

const injectCss = async () => {
  let cssText = EMBEDDED_CSS;
  try {
    const loaded = await external.loadAsset?.('mv.css');
    if (typeof loaded === 'string' && loaded.trim()) cssText = loaded;
  } catch {}
  if (external.extend?.css) {
    disposers.push(external.extend.css(CSS_ID, cssText));
    return;
  }
  const style = el('style', '', { id: CSS_ID });
  style.textContent = cssText;
  document.head.append(style);
  disposers.push(() => style.remove());
};

const onVisibility = () => {
  if (document.hidden) {
    refs.foregroundVideo?.pause();
    refs.backgroundVideo?.pause();
  } else if (state.isAudioPlaying && panelActive()) {
    if (refs.foregroundVideo) playVideo(refs.foregroundVideo);
    if (refs.backgroundVideo) playVideo(refs.backgroundVideo);
    syncVideos({ force: true, bypassCooldown: true });
  }
};

const addWin = (type, handler, options) => {
  window.addEventListener(type, handler, options);
  disposers.push(() => window.removeEventListener(type, handler, options));
};

addWin('keydown', onKeyDown, true);
addWin(SETTINGS_CHANGED_EVENT, onSettingsChanged);
addWin(MV_CHANGED_EVENT, onMvChanged);
addWin(MV_CANDIDATES_EVENT, onCandidatesChanged);
addWin(PLAYBACK_SEEKED_EVENT, onSeeked);
addWin(NAV_LYRICS_EVENT, onNavigateLyrics);
addWin(OPEN_MV_SETTINGS_EVENT, () => openDrawer(true));
addWin(DIAGNOSTICS_EVENT, (event) => {
  const enabled = event instanceof CustomEvent ? event.detail?.enabled : readDiagnostics();
  state.diagnosticsEnabled = enabled === true;
  scheduleRender();
});
addWin(IMMERSIVE_WHEEL_EVENT, (event) => {
  const deltaY = Number(event instanceof CustomEvent ? event.detail?.deltaY : 0);
  if (!deltaY || !refs.background) return;
  const direction = deltaY < 0 ? 1 : -1;
  void patchSettings({ immersiveBackgroundScalePercent: clampScale((state.settings.immersiveBackgroundScalePercent ?? 115) + direction * SCALE_WHEEL_STEP) });
});
document.addEventListener('visibilitychange', onVisibility);
disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));
const flushSheetRender = () => {
  if (!pendingDrawerRender) return;
  scheduleRender();
};
document.addEventListener('pointerup', flushSheetRender, true);
document.addEventListener('pointercancel', flushSheetRender, true);
disposers.push(() => {
  document.removeEventListener('pointerup', flushSheetRender, true);
  document.removeEventListener('pointercancel', flushSheetRender, true);
});

try {
  const off = echoApi().audio?.onStatus?.((status) => {
    state.audioStatus = status;
    if (!lyricsVisible() && !panelActive()) return;
    void refreshPlayback();
  });
  if (typeof off === 'function') disposers.push(off);
} catch {}

void injectCss();
rememberViewMode(state.viewMode);
void applyLocaleFromApp().then(() => scheduleRender());
void loadSettings().then(() => {
  rememberViewMode(state.viewMode);
  applyPageFlags();
  if (lyricsVisible() && (panelActive() || shouldAutoSearch())) void loadSelected();
  scheduleRender();
});
observeDom();
startTimers();
log('ECHO-MV renderer ready');

const dispose = () => {
  if (disposed) return;
  disposed = true;
  window.__echoMvModActive = false;
  Object.values(timers).forEach((id) => {
    window.clearTimeout(id);
    window.clearInterval(id);
    window.cancelAnimationFrame(id);
  });
  resizeObserver?.disconnect();
  refs.transportBtn?.remove();
  refs.drawerRoot?.remove();
  restorePanel();
  uninstallMvApi();
  while (disposers.length) {
    try { disposers.pop()?.(); } catch {}
  }
};

return dispose;
