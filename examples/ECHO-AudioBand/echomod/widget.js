window.__echoAudioBandWidget = true;
(() => {
  const $ = (id) => document.getElementById(id);
  const bar = $('bar');
  const art = $('art');
  const cover = $('cover');
  const meta = $('meta');
  const titleMarquee = $('titleMarquee');
  const artistMarquee = $('artistMarquee');
  const timeEl = $('time');
  const fill = $('fill');
  const progress = $('progress');
  const toggle = $('toggle');

  let config = {
    locale: 'auto',
    showAlbumArt: true,
    showControls: true,
    showProgress: true,
    showTime: false,
    theme: 'auto',
    accentColor: '#4da3ff',
    backgroundOpacity: 88,
    scrollingText: true,
    hoverPreview: true,
    seamless: false,
  };
  let status = null;
  let statusAt = 0;
  let raf = 0;
  let lastMarqueeTitle = null;
  let lastMarqueeArtist = null;
  let lastMarqueeScroll = null;
  let lastRatio = -1;
  let lastTimeText = null;
  let lastTimeHidden = null;

  const hexOk = (value) => typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(value.trim());

  const chinese = () => {
    const locale = String(config.locale || 'auto');
    if (locale === 'zh-CN') return true;
    if (locale === 'en-US') return false;
    return String(navigator.language || '').toLowerCase().startsWith('zh');
  };

  const idleCopy = () => chinese() ? { title: 'ECHO', artist: '未在播放' } : { title: 'ECHO', artist: 'Not playing' };

  const formatTime = (seconds) => {
    const n = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(n / 60);
    const s = n % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const isIdle = (payload) => {
    if (!payload) return true;
    if (payload.state === 'idle') return true;
    if (!payload.title && !payload.artist) return true;
    if (payload.state === 'stopped' && !payload.title) return true;
    return false;
  };

  const displayedPosition = () => {
    if (!status) return 0;
    const base = Number(status.positionSeconds) || 0;
    const dur = Number(status.durationSeconds) || 0;
    if (status.state !== 'playing' || dur <= 0) return Math.min(dur || base, base);
    const elapsed = (performance.now() - statusAt) / 1000;
    return Math.min(dur, Math.max(0, base + elapsed));
  };

  // Runs every animation frame: only touch the DOM when a value changed so
  // idle/paused frames stay free of style and text mutations.
  const applyProgress = () => {
    const dur = Number(status?.durationSeconds) || 0;
    const pos = displayedPosition();
    const ratio = dur > 0 ? Math.min(1, pos / dur) : 0;
    if (ratio !== lastRatio) {
      lastRatio = ratio;
      fill.style.transform = `scaleX(${ratio})`;
    }
    let hidden;
    let text;
    if (config.showTime && !isIdle(status) && dur > 0) {
      hidden = false;
      text = `${formatTime(pos)} / ${formatTime(dur)}`;
    } else {
      hidden = config.showTime !== true || isIdle(status);
      text = '';
    }
    if (hidden !== lastTimeHidden) {
      lastTimeHidden = hidden;
      timeEl.hidden = hidden;
    }
    if (text !== lastTimeText) {
      lastTimeText = text;
      timeEl.textContent = text;
    }
  };

  const loop = () => {
    applyProgress();
    raf = requestAnimationFrame(loop);
  };

  const setMarquee = (root, text, enabled) => {
    const inner = root.querySelector('.marquee-inner');
    inner.replaceChildren();
    const span = document.createElement('span');
    span.textContent = text || '';
    inner.append(span);
    root.classList.remove('is-scrolling');
    inner.style.animationDuration = '';
    requestAnimationFrame(() => {
      const overflow = inner.scrollWidth > root.clientWidth + 1;
      if (enabled && overflow && text) {
        inner.append(span.cloneNode(true));
        root.classList.add('is-scrolling');
        const duration = Math.max(10, Math.round(inner.scrollWidth / 30));
        inner.style.animationDuration = `${duration}s`;
      }
    });
  };

  const hidePreview = () => {
    try { window.audioband?.preview?.(false); } catch {}
  };

  const showPreview = () => {
    try {
      if (config.hoverPreview === false || isIdle(status)) return;
      window.audioband?.preview?.(true);
    } catch {}
  };

  const applyTheme = () => {
    const seamless = config.seamless === true;
    const opacity = seamless ? 1 : Math.min(100, Math.max(0, Number(config.backgroundOpacity) || 0)) / 100;
    const themeName = config.resolvedTheme || config.theme;
    const dark = themeName !== 'light';
    const root = document.documentElement;
    root.style.setProperty('--ab-bg', dark ? `rgba(16,16,16,${opacity})` : `rgba(243,243,243,${opacity})`);
    root.style.setProperty('--ab-fg', dark ? '#f3f3f3' : '#1a1a1a');
    root.style.setProperty('--ab-muted', dark ? 'rgba(243,243,243,0.68)' : 'rgba(26,26,26,0.62)');
    root.style.setProperty('--ab-accent', hexOk(config.accentColor) ? config.accentColor.trim() : '#4da3ff');
    document.body.classList.toggle('is-seamless', seamless);
    bar.classList.toggle('no-art', config.showAlbumArt === false);
    bar.classList.toggle('no-controls', config.showControls === false);
    bar.classList.toggle('no-progress', config.showProgress === false);
    bar.classList.toggle('no-time', config.showTime !== true);
    progress.hidden = config.showProgress === false;
    // Invalidate the applyProgress caches so the next frame rewrites the
    // time/progress DOM under the new config.
    lastRatio = -1;
    lastTimeText = null;
    lastTimeHidden = null;
    document.documentElement.lang = chinese() ? 'zh-CN' : 'en';
    if (config.hoverPreview === false) hidePreview();
  };

  const applyStatus = (payload) => {
    status = payload && typeof payload === 'object' ? payload : null;
    statusAt = performance.now();
    const idle = isIdle(status);
    bar.classList.toggle('is-idle', idle);
    const copy = idleCopy();
    const title = idle ? copy.title : String(status.title || copy.title);
    const artist = idle ? copy.artist : String(status.artist || '');
    const scrollOn = config.scrollingText !== false;
    if (title !== lastMarqueeTitle || scrollOn !== lastMarqueeScroll) {
      setMarquee(titleMarquee, title, scrollOn);
      lastMarqueeTitle = title;
    }
    if (artist !== lastMarqueeArtist || scrollOn !== lastMarqueeScroll) {
      setMarquee(artistMarquee, artist, scrollOn);
      lastMarqueeArtist = artist;
    }
    lastMarqueeScroll = scrollOn;
    const playing = !idle && status.state === 'playing';
    bar.classList.toggle('is-playing', playing);
    toggle.setAttribute('aria-label', playing ? (chinese() ? '暂停' : 'Pause') : (chinese() ? '播放' : 'Play'));
    const url = !idle && status.coverUrl ? String(status.coverUrl) : '';
    if (url) {
      cover.src = url;
      art.classList.add('has-cover');
    } else {
      cover.removeAttribute('src');
      art.classList.remove('has-cover');
    }
    if (idle || config.hoverPreview === false) hidePreview();
    applyProgress();
  };

  const command = (payload) => {
    try { void window.audioband?.command?.(payload); } catch {}
  };

  art.addEventListener('click', () => command({ action: 'focusEcho' }));
  art.addEventListener('mouseenter', () => showPreview());
  art.addEventListener('mouseleave', () => hidePreview());
  meta.addEventListener('click', () => command({ action: 'focusEcho' }));
  cover.addEventListener('error', () => {
    art.classList.remove('has-cover');
    cover.removeAttribute('src');
  });
  document.getElementById('controls').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    event.stopPropagation();
    command({ action: button.getAttribute('data-action') });
  });
  bar.addEventListener('auxclick', (event) => {
    if (event.button !== 1) return;
    if (event.target.closest('button[data-action]')) return;
    event.preventDefault();
    command({ action: 'next' });
  });
  progress.addEventListener('click', (event) => {
    const rect = progress.getBoundingClientRect();
    const width = rect.width || 1;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / width));
    command({ action: 'seekRatio', ratio });
  });
  document.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('resize', () => {
    lastMarqueeTitle = null;
    lastMarqueeArtist = null;
    lastMarqueeScroll = null;
    if (!status) return;
    const idle = isIdle(status);
    const copy = idleCopy();
    const scrollOn = config.scrollingText !== false;
    setMarquee(titleMarquee, idle ? copy.title : String(status.title || copy.title), scrollOn);
    setMarquee(artistMarquee, idle ? copy.artist : String(status.artist || ''), scrollOn);
    lastMarqueeTitle = idle ? copy.title : String(status.title || copy.title);
    lastMarqueeArtist = idle ? copy.artist : String(status.artist || '');
    lastMarqueeScroll = scrollOn;
  });

  const start = () => {
    applyTheme();
    applyStatus(null);
    loop();
    try {
      window.audioband?.onConfig?.((next) => {
        if (!next || typeof next !== 'object') return;
        config = { ...config, ...next };
        lastMarqueeTitle = null;
        lastMarqueeArtist = null;
        lastMarqueeScroll = null;
        applyTheme();
        applyStatus(status);
      });
      window.audioband?.onStatus?.((next) => applyStatus(next));
      window.audioband?.ready?.();
    } catch {}
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
