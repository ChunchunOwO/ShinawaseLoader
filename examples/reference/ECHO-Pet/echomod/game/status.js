'use strict';

/*
 * Status line: VPet Steam rich-presence strings fused with ECHO's
 * "正在听" listening copy.
 *
 *   listening: {petName}正在{幸福地|一般地|可怜地|病恹恹地}听 {title} · {artist}
 *   working:   {petName}正在{adv}{workName}
 *   sleeping:  {petName}在{adv}睡大觉
 *   idle:      {petName}在{adv}{发呆|闲逛|乱爬}   (ill: {petName}生病了)
 *
 * Polls window.echo.playback.getStatus() every 2s, shows the line in the
 * pet status bar and mirrors it into document.title. Whenever the composed
 * status actually changes it notifies main.cjs over the console bridge
 * ({type:'statusPush'}) so the pet line can augment ECHO's native Steam
 * Rich Presence — the main process never polls this window.
 *
 * Besides the full status text, a track-free `petLine` (e.g. "ECHO幸福地陪听中")
 * is sent along: main.cjs slots it into the %details% parameter of ECHO's
 * steam_display tokens, where the track title/artist are already rendered
 * natively by ECHO.
 *
 * The Steam side is configurable: steamStatusMode picks what gets pushed
 * ('native-augment' = full fused line, 'pet-only' = pet doings without the
 * track, 'off' = nothing), steamShowTrackInPetLine drops the track from the
 * pushed status text, and steamCustomTemplate replaces the whole Steam line
 * with a user template ({petName}/{mode}/{state}/{track}/{artist}/{petLine}).
 * The on-pet status chip always shows the full composed line regardless.
 */
(() => {
  const root = (window.EchoClassicPet = window.EchoClassicPet || {});

  const POLL_INTERVAL_MS = 2000;
  const STEAM_MODES = ['native-augment', 'pet-only', 'off'];

  // VPet mode adverbs (RichPresence.vdf %mode%), ECHO-flavoured.
  const MODE_ADVERBS = {
    happy: '幸福地',
    nomal: '一般地',
    poorcondition: '可怜地',
    ill: '病恹恹地',
  };

  // VPet idle activities (乱爬 / 发呆 / 闲逛), rotated every 5 minutes.
  const IDLE_ACTIVITIES = ['发呆', '闲逛', '乱爬'];

  const UNKNOWN_TRACK = '未知曲目'; // matches ECHO SteamRichPresenceCopy zh-CN

  const basename = (filePath) => {
    const name = String(filePath || '').split(/[\\/]/).pop() || '';
    return name.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  };

  root.createStatus = (engine, ui, elements, config = {}) => {
    const statusBar = elements.statusBar;
    const sendBridge = typeof elements.sendBridge === 'function' ? elements.sendBridge : null;
    const steamMode = STEAM_MODES.includes(config.steamStatusMode)
      ? config.steamStatusMode
      : 'native-augment';
    const steamTemplate = typeof config.steamCustomTemplate === 'string'
      ? config.steamCustomTemplate.trim()
      : '';
    const steamShowTrack = config.steamShowTrackInPetLine !== false;
    const trackCache = new Map(); // trackId -> { title, artist }
    let lastPlayback = { state: 'idle', title: null, artist: null };
    let pollTimer = null;
    let lookupPending = false;
    let lastBridgeSignature = null;

    const resolveTrackMeta = async (playback) => {
      const trackId = playback.currentTrackId;
      if (trackId && trackCache.has(trackId)) return trackCache.get(trackId);
      let meta = null;
      if (trackId && window.echo?.library?.getTrack && !lookupPending) {
        lookupPending = true;
        try {
          const track = await window.echo.library.getTrack(trackId);
          if (track) {
            meta = {
              title: track.title || basename(track.path) || UNKNOWN_TRACK,
              artist: track.artist || null,
            };
            trackCache.set(trackId, meta);
          }
        } catch { /* library lookup is best-effort */ }
        lookupPending = false;
      }
      if (!meta) {
        const fallbackTitle = basename(playback.filePath);
        meta = { title: fallbackTitle || UNKNOWN_TRACK, artist: null };
      }
      return meta;
    };

    const idleActivity = () => {
      const bucket = Math.floor(Date.now() / 300000); // rotate every 5 min
      return IDLE_ACTIVITIES[bucket % IDLE_ACTIVITIES.length];
    };

    // Returns { text, petLine }: `text` is the full VPet-style line, while
    // `petLine` is the gameplay part without track info — main.cjs feeds it
    // into the %details% slot of ECHO's native steam_display tokens (which
    // already render the track title/artist themselves). includeTrack=false
    // skips the listening branch entirely (pet-only Steam mode).
    const composeStatus = ({ includeTrack = true } = {}) => {
      const petName = engine.save.name;
      const adverb = MODE_ADVERBS[engine.save.mode] || MODE_ADVERBS.nomal;
      const work = engine.save.state === 'work' ? engine.currentWork() : null;

      if (engine.save.state === 'sleep') {
        const line = `${petName}在${adverb}睡大觉`;
        return { text: line, petLine: line };
      }
      if (work) {
        const line = `${petName}正在${adverb}${work.name}`;
        return { text: line, petLine: line };
      }
      if (includeTrack && lastPlayback.state === 'playing' && lastPlayback.title) {
        const trackPart = lastPlayback.artist
          ? `${lastPlayback.title} · ${lastPlayback.artist}`
          : lastPlayback.title;
        return {
          text: `${petName}正在${adverb}听 ${trackPart}`,
          petLine: `${petName}${adverb}陪听中`,
        };
      }
      if (engine.save.mode === 'ill') {
        const line = `${petName}生病了`;
        return { text: line, petLine: line };
      }
      const line = `${petName}在${adverb}${idleActivity()}`;
      return { text: line, petLine: line };
    };

    // {placeholder} substitution (same shape as say.js): unknown keys are
    // left verbatim so a typo in the user template stays visible.
    const fillTemplate = (template, values) => String(template || '').replace(/\{(\w+)\}/g,
      (match, key) => (values[key] === undefined ? match : String(values[key])));

    // What the bridge pushes to Steam (null = push nothing), shaped by the
    // customization config. `composed` is the full fused line already shown
    // in the pet status bar.
    const composeSteamPush = (composed) => {
      if (steamMode === 'off') return null;
      if (steamTemplate) {
        const playing = lastPlayback.state === 'playing';
        const line = fillTemplate(steamTemplate, {
          petName: engine.save.name,
          mode: engine.save.mode,
          state: engine.save.state,
          track: playing && lastPlayback.title ? lastPlayback.title : '',
          artist: playing && lastPlayback.artist ? lastPlayback.artist : '',
          // {petLine} = the fused line (track dropped per steamShowTrackInPetLine)
          petLine: steamShowTrack ? composed.text : composeStatus({ includeTrack: false }).text,
        });
        return { text: line, petLine: line };
      }
      if (steamMode === 'pet-only') return composeStatus({ includeTrack: false });
      // native-augment: the status field carries the full fused line (track
      // included unless steamShowTrackInPetLine turned it off); petLine stays
      // track-free because ECHO's steam_display renders the track natively.
      return {
        text: steamShowTrack ? composed.text : composeStatus({ includeTrack: false }).text,
        petLine: composed.petLine,
      };
    };

    // Event-driven Steam push: only notify main.cjs when the composed status
    // actually changed (engine change/mode events and the playback poll all
    // funnel through here, but identical lines never cross the bridge).
    const notifyBridge = (push) => {
      if (!sendBridge || !push) return;
      const signature = `${push.text}\u0000${push.petLine}`;
      if (signature === lastBridgeSignature) return;
      lastBridgeSignature = signature;
      sendBridge({
        type: 'statusPush',
        status: {
          text: push.text.slice(0, 200),
          petLine: push.petLine.slice(0, 200),
          mode: engine.save.mode,
          state: engine.save.state,
        },
      });
    };

    const publish = () => {
      const composed = composeStatus();
      if (statusBar) statusBar.textContent = composed.text;
      document.title = composed.text;
      notifyBridge(composeSteamPush(composed));
    };

    const poll = async () => {
      const getStatus = window.echo?.playback?.getStatus;
      if (typeof getStatus !== 'function') {
        lastPlayback = { state: 'idle', title: null, artist: null };
        publish();
        return;
      }
      try {
        const playback = await getStatus();
        const meta = playback && (playback.state === 'playing' || playback.state === 'paused' || playback.state === 'loading')
          ? await resolveTrackMeta(playback)
          : { title: null, artist: null };
        lastPlayback = {
          state: playback?.state || 'idle',
          title: meta.title,
          artist: meta.artist,
        };
      } catch {
        lastPlayback = { state: 'idle', title: null, artist: null };
      }
      publish();
    };

    const start = () => {
      if (pollTimer !== null) return;
      void poll();
      pollTimer = window.setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    };

    const stop = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    engine.on('change', publish);
    engine.on('mode', publish);

    return {
      start,
      stop,
      publish,
      isPlaybackActive: () => lastPlayback.state === 'playing',
    };
  };
})();
