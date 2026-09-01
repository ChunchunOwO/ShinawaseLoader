'use strict';

/*
 * Speech bubble ("Say") system:
 *  - manual / event-driven lines (eating, work completion, level up, sleep)
 *  - low food / low drink begging (simplified port of VPet LowText selection:
 *    mode tier Happy+Nomal = "high", PoorCondition+Ill = "low";
 *    severity from remaining percentage)
 *  - occasional random chatter when clicked or idle
 */
(() => {
  const root = (window.EchoClassicPet = window.EchoClassicPet || {});

  const BUBBLE_MS_PER_CHAR = 110;
  const BUBBLE_MIN_MS = 2200;
  const BUBBLE_MAX_MS = 7000;
  const LOW_ASK_INTERVAL_MS = 90000; // at most one begging line per 1.5 minutes
  const RANDOM_SAY_CHANCE = 0.18;    // per idle tick (15s)

  const pick = (list) => (Array.isArray(list) && list.length
    ? list[Math.floor(Math.random() * list.length)]
    : null);

  root.createSay = (engine, ui, elements, phrases) => {
    const bubble = elements.bubble;
    const textEl = elements.bubbleText;
    let hideTimer = null;
    let lastLowAsk = 0;

    const say = (text, options = {}) => {
      if (!text) return;
      textEl.textContent = text;
      bubble.classList.add('is-open');
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      const duration = options.duration
        || Math.min(BUBBLE_MAX_MS, Math.max(BUBBLE_MIN_MS, text.length * BUBBLE_MS_PER_CHAR));
      hideTimer = window.setTimeout(() => {
        hideTimer = null;
        bubble.classList.remove('is-open');
      }, duration);
      if (options.animate !== false) ui.playInteract?.();
    };

    const fill = (template, values) => String(template || '').replace(/\{(\w+)\}/g,
      (match, key) => (values[key] === undefined ? match : String(values[key])));

    // --- low state begging ----------------------------------------------------

    const severityOf = (value, max) => {
      const ratio = value / max;
      if (ratio > 0.60) return null;      // fine, no begging
      if (ratio > 0.40) return 'mild';
      if (ratio > 0.20) return 'medium';
      return 'severe';
    };

    const lowStateTick = () => {
      const now = Date.now();
      if (now - lastLowAsk < LOW_ASK_INTERVAL_MS) return;
      if (engine.save.state === 'sleep') return;
      const tier = (engine.save.mode === 'happy' || engine.save.mode === 'nomal') ? 'high' : 'low';
      const max = engine.strengthMax();

      const foodSeverity = severityOf(engine.save.strengthFood, max);
      const drinkSeverity = severityOf(engine.save.strengthDrink, max);
      let line = null;
      if (foodSeverity && (!drinkSeverity || Math.random() < 0.5)) {
        line = pick(phrases.lowFood?.[tier]?.[foodSeverity]);
      } else if (drinkSeverity) {
        line = pick(phrases.lowDrink?.[tier]?.[drinkSeverity]);
      }
      if (line && Math.random() < 0.5) {
        lastLowAsk = now;
        say(line);
      }
    };

    const randomIdleTick = () => {
      if (engine.save.state !== 'nomal') return;
      if (Math.random() >= RANDOM_SAY_CHANCE) return;
      const pool = ui.isPlaybackActive?.() ? phrases.listening : phrases.click;
      const line = pick(pool);
      if (line) say(line, { animate: false });
    };

    // --- event wiring -----------------------------------------------------------

    // animate: false — pet.js plays the dedicated eat-nom visual for 'eat';
    // the generic interact bounce would out-rank and mask it.
    engine.on('eat', ({ food }) => {
      const line = fill(pick(phrases.eat) || '谢谢主人的{food}！', { food: food.name });
      say(line, { animate: false });
    });

    engine.on('autobuy', ({ food, source }) => {
      const prefix = source === 'autodrink' ? '口渴了，自己买了' : '饿了，自己买了';
      say(`${prefix}「${food.name}」~`);
    });

    // animate: false — the persistent work-pulse state visual applies via the
    // engine 'change' event; an interact bounce would mask it for seconds.
    engine.on('workstart', (work) => {
      const line = fill(pick(phrases.workStart) || '开始{work}啦~', { work: work.name });
      say(line, { animate: false });
    });

    engine.on('workend', (info) => {
      if (!info.work) return;
      if (info.reason === 'timefinish') {
        const template = info.work.type === 'Work' ? phrases.workFinish?.money : phrases.workFinish?.exp;
        say(fill(template || '{work}完成啦', {
          work: info.work.name,
          count: info.count.toFixed(2),
          time: info.spendtime.toFixed(0),
        }), { duration: 6000 });
      } else if (info.reason === 'statefail') {
        say(fill(phrases.workStateFail || '生病了，没法继续{work}……', { work: info.work.name }));
      }
    });

    engine.on('levelup', ({ level }) => {
      say(fill(phrases.levelUp || '升级啦！Lv{level}！', { level }));
    });

    engine.on('sleep', (sleeping) => {
      say(pick(sleeping ? phrases.sleep : phrases.wake), { animate: false });
    });

    engine.on('mode', (before, after) => {
      if (after === 'ill') say(pick(phrases.ill), { animate: false });
    });

    engine.on('tick', () => {
      lowStateTick();
      randomIdleTick();
    });

    const sayOnClick = () => {
      // Small chance of chatter on top of the pat interaction, like ClickText.
      if (Math.random() < 0.25) {
        const pool = ui.isPlaybackActive?.() ? phrases.listening : phrases.click;
        say(pick(pool), { animate: false });
      }
    };

    return { say, sayOnClick };
  };
})();
