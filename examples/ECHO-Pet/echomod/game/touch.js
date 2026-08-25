'use strict';

/*
 * Touch interactions (port of VPet DisplayToTouchHead / DisplayToTouchBody):
 *  - tap upper 45% of the pet  -> head pat  (Strength -2, Feeling +1)
 *  - tap lower part            -> body pat  (same stat effect)
 *  - simplified "wave" detect  -> waving the cursor across the pet also pats
 * Every applied pat shows a floating "体力-2 心情+1" label.
 */
(() => {
  const root = (window.EchoClassicPet = window.EchoClassicPet || {});

  const HEAD_ZONE_RATIO = 0.45;
  const WAVE_WINDOW_MS = 1200;
  const WAVE_REVERSALS_NEEDED = 4;
  const WAVE_MIN_DELTA_PX = 6;
  const WAVE_COOLDOWN_MS = 2500;

  root.createTouch = (engine, ui, elements) => {
    const { stage, trigger } = elements;

    const classify = (event) => {
      const rect = trigger.getBoundingClientRect();
      if (rect.height <= 0) return 'body';
      const ratio = (event.clientY - rect.top) / rect.height;
      return ratio <= HEAD_ZONE_RATIO ? 'head' : 'body';
    };

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const showFloatingLabel = (text, clientX, clientY) => {
      const rect = stage.getBoundingClientRect();
      const label = document.createElement('span');
      label.className = 'cp-float-label';
      label.textContent = text;
      label.style.left = `${Math.round(clamp(clientX - rect.left, 8, rect.width - 8))}px`;
      label.style.top = `${Math.round(clamp(clientY - rect.top, 8, rect.height - 8))}px`;
      stage.append(label);
      window.setTimeout(() => label.remove(), 1500);
    };

    const tap = (event) => {
      const zone = classify(event);
      const applied = engine.touch(zone);
      if (applied) {
        showFloatingLabel('体力-2 心情+1', event.clientX, event.clientY);
      }
      return zone;
    };

    // --- simplified wave detection ------------------------------------------

    let waveEvents = [];
    let waveLastDirection = 0;
    let waveLastX = null;
    let waveBlockedUntil = 0;

    const onWaveMove = (event) => {
      const now = Date.now();
      if (now < waveBlockedUntil) return;
      if (waveLastX === null) {
        waveLastX = event.clientX;
        return;
      }
      const delta = event.clientX - waveLastX;
      if (Math.abs(delta) < WAVE_MIN_DELTA_PX) return;
      const direction = delta > 0 ? 1 : -1;
      waveLastX = event.clientX;
      if (waveLastDirection !== 0 && direction !== waveLastDirection) {
        waveEvents.push(now);
        waveEvents = waveEvents.filter((t) => now - t <= WAVE_WINDOW_MS);
        if (waveEvents.length >= WAVE_REVERSALS_NEEDED) {
          waveEvents = [];
          waveBlockedUntil = now + WAVE_COOLDOWN_MS;
          const applied = engine.touch(classify(event));
          if (applied) showFloatingLabel('体力-2 心情+1', event.clientX, event.clientY);
          ui.onWave?.();
        }
      }
      waveLastDirection = direction;
    };

    const onWaveLeave = () => {
      waveEvents = [];
      waveLastDirection = 0;
      waveLastX = null;
    };

    trigger.addEventListener('pointermove', onWaveMove);
    trigger.addEventListener('pointerleave', onWaveLeave);

    return { tap, classify, showFloatingLabel };
  };
})();
