'use strict';

/*
 * ECHO Classic Pet — stats engine.
 *
 * Faithful vanilla-JS port of VPet's gameplay core:
 *   - GameSave_VPet.cs   (stats, setters with overflow rules, CalMode, StoreTake, EatFood)
 *   - MainLogic.cs       (FunctionSpend: idle decay, sleep regen, work branch)
 *   - WorkTimer.xaml.cs  (work completion + FinishBonus)
 *   - MainWindow.cs      (TakeItem eat-buff/cooldown, simplified auto-buy)
 *
 * Known VPet quirks are ported as-is and marked with "VPet quirk" comments so
 * the formulas stay identical to the original game.
 */
(() => {
  const root = (window.EchoClassicPet = window.EchoClassicPet || {});

  const TICK_INTERVAL_MS = 15000; // VPet EventTimer = 15s
  const TIME_PASS = 0.05;         // VPet FunctionSpend(0.05) per tick

  const MODES = ['happy', 'nomal', 'poorcondition', 'ill'];

  // C# Function.Rnd.Next(min, maxExclusive)
  const rndNext = (min, maxExclusive) =>
    Math.floor(Math.random() * (maxExclusive - min)) + min;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const createEmitter = () => {
    const listeners = new Map();
    return {
      on(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
        return () => listeners.get(name).delete(fn);
      },
      emit(name, ...args) {
        const set = listeners.get(name);
        if (!set) return;
        for (const fn of [...set]) {
          try { fn(...args); } catch (error) { console.error('[classic-pet]', name, error); }
        }
      },
    };
  };

  const defaultSave = (name) => ({
    version: 1,
    name: name || 'ECHO',
    // GameSave_VPet new-game constructor
    money: 100,
    exp: 0,
    level: 1,
    levelMax: 0,
    likabilityMax: 100,
    strength: 100,
    storeStrength: 0,
    strengthFood: 100,
    storeStrengthFood: 0,
    strengthDrink: 100,
    storeStrengthDrink: 0,
    feeling: 60,
    health: 100,
    likability: 0,
    mode: 'nomal',
    state: 'nomal', // 'nomal' | 'work' | 'sleep'
    nowWork: null,  // { id, startTime, getCount }
    buyTimes: {},   // food name -> "bored of it until" timestamp (ms)
    lastInteractionTime: Date.now(),
    createdAt: Date.now(),
    savedAt: 0,
    stats: { touches: 0, eats: 0, worksFinished: 0, autoBuys: 0 },
  });

  const createEngine = ({ save, works, foods, config }) => {
    const emitter = createEmitter();
    const s = save;

    // Per-round change tracking (VPet Change* fields, halved each tick).
    const change = { strength: 0, feeling: 0, strengthFood: 0, strengthDrink: 0 };

    // --- Level formulas (GameSave_VPet) -----------------------------------

    const strengthMax = () => 100 + Math.trunc(Math.pow(s.level * (1 + s.levelMax), 0.75) * 4);
    const feelingMax = () => 100 + Math.trunc(Math.pow(s.level * (1 + s.levelMax), 0.75) * 2);
    const levelUpNeed = () => 200 * s.level - 100;

    // --- Property setters with VPet overflow rules ------------------------

    const setHealth = (value) => { s.health = clamp(value, 0, 100); };

    const setStrength = (value) => { s.strength = clamp(value, 0, strengthMax()); };

    const setStrengthFood = (value) => {
      value = Math.min(strengthMax(), value);
      if (value <= 0) {
        setHealth(s.health + value); // starving damages health
        s.strengthFood = 0;
      } else {
        s.strengthFood = value;
      }
    };

    const setStrengthDrink = (value) => {
      value = Math.min(strengthMax(), value);
      if (value <= 0) {
        setHealth(s.health + value);
        s.strengthDrink = 0;
      } else {
        s.strengthDrink = value;
      }
    };

    const setFeeling = (value) => {
      value = Math.min(feelingMax(), value);
      if (value <= 0) {
        setHealth(s.health + value / 2);
        setLikability(s.likability + value / 2);
        s.feeling = 0;
      } else {
        s.feeling = value;
      }
    };

    const setLikability = (value) => {
      const max = s.likabilityMax;
      value = Math.max(0, value);
      if (value > max) {
        s.likability = max;
        setHealth(s.health + (value - max)); // overflow converts to health
      } else {
        s.likability = value;
      }
    };

    const addExp = (value) => {
      let exp = s.exp + value;
      let lun = levelUpNeed();
      let leveledUp = false;
      let levelMaxUp = false;
      while (exp >= lun) {
        leveledUp = true;
        exp -= lun;
        s.likabilityMax += 10;
        if (++s.level > 1000 + s.levelMax * 100) {
          s.levelMax += 1;
          levelMaxUp = true;
          s.level = 100 * s.levelMax;
        }
        lun = levelUpNeed();
      }
      s.exp = exp;
      if (leveledUp) emitter.emit('levelup', { level: s.level, levelMaxUp });
    };

    // --- Change-tracked mutators (GameSave_VPet *Change methods) ----------

    const strengthChange = (value) => { change.strength += value; setStrength(s.strength + value); };
    const strengthChangeFood = (value) => { change.strengthFood += value; setStrengthFood(s.strengthFood + value); };
    const strengthChangeDrink = (value) => { change.strengthDrink += value; setStrengthDrink(s.strengthDrink + value); };
    const feelingChange = (value) => { change.feeling += value; setFeeling(s.feeling + value); };

    const cleanChange = () => {
      change.strength /= 2;
      change.feeling /= 2;
      change.strengthDrink /= 2;
      change.strengthFood /= 2;
    };

    // --- StoreTake: buffered stats drip back over time --------------------

    const storeTake = () => {
      const t = 10;

      let part = s.storeStrength / t;
      s.storeStrength -= part;
      if (Math.abs(s.storeStrength) < 1) s.storeStrength = 0;
      else strengthChange(part);

      part = s.storeStrengthDrink / t;
      s.storeStrengthDrink -= part;
      if (Math.abs(s.storeStrengthDrink) < 1) s.storeStrengthDrink = 0;
      else strengthChangeDrink(part);

      part = s.storeStrengthFood / t;
      s.storeStrengthFood -= part;
      if (Math.abs(s.storeStrengthFood) < 1) s.storeStrengthFood = 0;
      else strengthChangeFood(part);
    };

    // --- CalMode (GameSave_VPet.CalMode) -----------------------------------

    const calMode = () => {
      // VPet quirk: "Feeling / FeelingMax >= 80" compares a 0..1 ratio with 80,
      // so this bonus effectively never applies. Ported as-is.
      const realhel = 60
        - (s.feeling / feelingMax() >= 80 ? 12 : 0)
        - (s.likability >= 80 ? 12 : (s.likability >= 40 ? 6 : 0));
      if (s.health <= realhel) {
        return s.health <= Math.trunc(realhel / 2) ? 'ill' : 'poorcondition';
      }
      const realfel = 0.90 - (s.likability >= 80 ? 0.20 : (s.likability >= 40 ? 0.10 : 0));
      const felps = s.feeling / feelingMax();
      if (felps >= realfel) return 'happy';
      if (felps <= realfel / 2) return 'poorcondition';
      return 'nomal';
    };

    const refreshMode = () => {
      const next = calMode();
      if (s.mode !== next) {
        const before = s.mode;
        s.mode = next;
        emitter.emit('mode', before, next);
      }
      return next;
    };

    // --- Work --------------------------------------------------------------

    const findWork = (id) => works.find((w) => w.id === id) || null;
    const currentWork = () => (s.nowWork ? findWork(s.nowWork.id) : null);

    const startWork = (work) => {
      if (!work) return { ok: false, reason: 'unknown' };
      if (s.mode === 'ill') {
        return { ok: false, reason: 'ill', message: `${s.name} 生病啦，没法进行${work.name}` };
      }
      if (s.level < work.levelLimit) {
        return {
          ok: false,
          reason: 'level',
          message: `等级不足 ${s.level}/${work.levelLimit}，无法进行${work.name}`,
        };
      }
      if (s.state === 'work' && s.nowWork && s.nowWork.id === work.id) {
        stopWork('manualstop');
        return { ok: true, stopped: true };
      }
      s.state = 'work';
      s.nowWork = { id: work.id, startTime: Date.now(), getCount: 0 };
      emitter.emit('workstart', work);
      emitter.emit('change');
      return { ok: true };
    };

    // WorkTimer.Stop + FinishWorkInfo: count = GetCount * (1 + FinishBonus),
    // and on TimeFinish the bonus part (GetCount * FinishBonus) is granted.
    const stopWork = (reason) => {
      if (s.state !== 'work' || !s.nowWork) return null;
      const work = currentWork();
      const getCount = s.nowWork.getCount;
      const spentMinutes = (Date.now() - s.nowWork.startTime) / 60000;
      const info = {
        work,
        reason,
        count: work ? getCount * (1 + work.finishBonus) : getCount,
        spendtime: reason === 'timefinish' && work ? work.time : spentMinutes,
      };
      if (reason === 'timefinish' && work) {
        if (work.type === 'Work') s.money += getCount * work.finishBonus;
        else addExp(getCount * work.finishBonus);
        s.stats.worksFinished += 1;
      }
      s.state = 'nomal';
      s.nowWork = null;
      emitter.emit('workend', info);
      emitter.emit('change');
      return info;
    };

    const checkWorkFinish = () => {
      if (s.state !== 'work' || !s.nowWork) return;
      const work = currentWork();
      if (!work) { stopWork('other'); return; }
      if ((Date.now() - s.nowWork.startTime) / 60000 > work.time) {
        stopWork('timefinish');
      }
    };

    // --- Sleep ---------------------------------------------------------------

    const toggleSleep = () => {
      if (s.state === 'sleep') {
        s.state = 'nomal';
        s.lastInteractionTime = Date.now();
        emitter.emit('sleep', false);
      } else {
        if (s.state === 'work') stopWork('manualstop');
        s.state = 'sleep';
        emitter.emit('sleep', true);
      }
      emitter.emit('change');
      return s.state === 'sleep';
    };

    // --- FunctionSpend (MainLogic.FunctionSpend, TimePass = 0.05) -----------

    const functionSpend = (timePass) => {
      cleanChange();
      storeTake();

      let freedrop = (Date.now() - s.lastInteractionTime) / 60000;
      if (freedrop < 1) freedrop = 0;
      else freedrop = Math.min(Math.sqrt(freedrop) * timePass / 4, feelingMax() / 800);

      const sMax = strengthMax();
      const sm25 = sMax * 0.25;
      const sm50 = sMax * 0.5;
      const sm60 = sMax * 0.6;
      const sm75 = sMax * 0.75;

      let addhealth;

      if (s.state === 'sleep') {
        // Sleep: slowly restores everything (feeling stays put but never drops).
        strengthChange(timePass * 2);
        strengthChangeFood(timePass);
        if (s.strengthFood <= sm25) {
          strengthChangeFood(timePass); // low state recovers twice as fast
        } else if (s.strengthFood >= sm75) {
          setHealth(s.health + timePass * 2);
        }
        strengthChangeDrink(timePass);
        // VPet quirk: the drink branch tests ">= sm25" (food uses "<= sm25"),
        // making the ">= sm75" health bonus unreachable. Ported as-is.
        if (s.strengthDrink >= sm25) {
          strengthChangeDrink(timePass);
        } else if (s.strengthDrink >= sm75) {
          setHealth(s.health + timePass * 2);
        }
        s.lastInteractionTime = Date.now();
      } else if (s.state === 'work' && s.nowWork) {
        const work = currentWork();
        if (work) {
          let needfood = timePass * work.strengthFood;
          let needdrink = timePass * work.strengthDrink;

          let efficiency = 0;
          addhealth = -2;

          const nsfood = needfood * 0.3;
          const nsdrink = needdrink * 0.3;
          if (s.strength > sm25 + nsfood + nsdrink) {
            // Spend stamina to offset food/drink costs and boost efficiency.
            strengthChange(-nsfood - nsdrink);
            efficiency += 0.1;
            needfood -= nsfood;
            needdrink -= nsdrink;
          }

          if (s.strengthFood <= sm25) {
            strengthChangeFood(-needfood / 2); // starving: half cost, low output
            efficiency += 0.2;
            if (s.strength >= needfood) {
              strengthChange(-needfood);
              efficiency += 0.1;
            }
            addhealth -= 2;
          } else {
            strengthChangeFood(-needfood);
            efficiency += 0.4;
            if (s.strengthFood >= sm60) {
              addhealth += rndNext(1, 3);
              efficiency += 0.1;
            }
          }

          if (s.strengthDrink <= sm25) {
            strengthChangeDrink(-needdrink / 2);
            efficiency += 0.2;
            if (s.strength >= needdrink) {
              strengthChange(-needdrink);
              efficiency += 0.1;
            }
            addhealth -= 2;
          } else {
            strengthChangeDrink(-needdrink);
            efficiency += 0.4;
            if (s.strengthDrink >= sm60) {
              addhealth += rndNext(1, 3);
              efficiency += 0.1;
            }
          }

          if (addhealth > 0) setHealth(s.health + addhealth * timePass);

          const addmoney = Math.max(0, timePass * work.moneyBase * (2 * efficiency - 0.5));
          if (work.type === 'Work') s.money += addmoney;
          else addExp(addmoney);
          s.nowWork.getCount += addmoney;

          if (work.type === 'Play') {
            s.lastInteractionTime = Date.now();
            feelingChange(-work.feeling * timePass);
          } else {
            feelingChange(-freedrop * (0.5 + work.feeling / 2));
          }
        }
      } else {
        // Default idle decay.
        addhealth = -2;
        if (s.strengthFood >= sm50) {
          strengthChangeFood(-timePass);
          strengthChange(timePass);
          if (s.strengthFood >= sm75) addhealth += rndNext(1, 3);
        } else if (s.strengthFood <= sm25) {
          setHealth(s.health - Math.random() * timePass);
          addhealth -= 2;
        }
        if (s.strengthDrink >= sm50) {
          strengthChangeDrink(-timePass);
          strengthChange(timePass);
          if (s.strengthDrink >= sm75) addhealth += rndNext(1, 3);
        } else if (s.strengthDrink <= sm25) {
          setHealth(s.health - Math.random() * timePass);
          addhealth -= 2;
        }
        if (addhealth > 0) setHealth(s.health + addhealth * timePass);
        strengthChangeFood(-timePass);
        strengthChangeDrink(-timePass);
        feelingChange(-freedrop);
      }

      // Common tail: passive exp, likability from good mood, thirst penalties.
      addExp(timePass);
      if (s.feeling >= feelingMax() * 0.75) {
        if (s.feeling >= feelingMax() * 0.90) {
          setLikability(s.likability + timePass);
        }
        addExp(timePass * 2);
        setHealth(s.health + timePass);
      } else if (s.feeling <= 25) {
        setLikability(s.likability - timePass);
        addExp(-timePass);
      }
      if (s.strengthDrink <= sm25) {
        // VPet quirk: Rnd.Next(0,1) is always 0 in C#, so only the exp penalty
        // actually applies. Ported as-is.
        setHealth(s.health - rndNext(0, 1) * timePass);
        addExp(-timePass);
      } else if (s.strengthDrink >= sm75) {
        setHealth(s.health + rndNext(0, 1) * timePass);
      }

      // Deadlock guard (not in VPet): an ill pet cannot work, and without
      // money it cannot buy healing food either — auto-buy also stops below
      // 20 money — so it would stay ill forever. When ill and broke, recover
      // health fast enough to outpace worst-case idle decay (~0.21/tick from
      // starvation + zero feeling) so the pet eventually gets back on its feet.
      if (s.mode === 'ill' && s.money < 20) {
        setHealth(s.health + timePass * 10);
      }

      const newMode = refreshMode();
      if (newMode === 'ill' && s.state === 'work') {
        const info = stopWork('statefail');
        if (info) emitter.emit('workstatefail', info);
      }
    };

    // --- EatFood (MainWindow.TakeItem + ExtensionFunction.EatFood) ---------

    const eatBuff = (food) => {
      const now = Date.now();
      const boredUntil = s.buyTimes[food.name] || now;
      const eattimes = boredUntil > now ? (boredUntil - now) / 3600000 : 0;
      // Non-gift formula (our food data has no Gift type).
      return { eattimes, buff: Math.max(0.5, 1 - eattimes * eattimes * 0.02) };
    };

    const eatFood = (food) => {
      s.lastInteractionTime = Date.now();
      const { eattimes, buff } = eatBuff(food);

      addExp(food.exp * buff);
      let tmp = food.strength / 2 * buff;
      strengthChange(tmp);
      s.storeStrength += tmp;
      tmp = food.strengthFood / 2 * buff;
      strengthChangeFood(tmp);
      s.storeStrengthFood += tmp;
      tmp = food.strengthDrink / 2 * buff;
      strengthChangeDrink(tmp);
      s.storeStrengthDrink += tmp;
      feelingChange(food.feeling * buff);
      setHealth(s.health + food.health * buff);
      setLikability(s.likability + food.likability * buff);

      // Boredom cooldown grows 0.5h..4h per serving.
      const grow = Math.max(0.5, Math.min(4, 2 - (food.likability + food.feeling / 2) / 5));
      s.buyTimes[food.name] = Date.now() + (eattimes + grow) * 3600000;
      s.stats.eats += 1;

      refreshMode();
      emitter.emit('eat', { food, buff });
      emitter.emit('change');
      return buff;
    };

    const buyFood = (food, quantity) => {
      const qty = Math.max(1, Math.trunc(quantity || 1));
      const cost = food.price * qty;
      if (s.money < cost) return { ok: false, reason: 'money' };
      s.money -= cost;
      let buff = 1;
      for (let i = 0; i < qty; i += 1) buff = eatFood(food);
      return { ok: true, cost, buff };
    };

    // --- Auto-buy (simplified VPet autofood/autodrink) ----------------------

    const autoBuyTick = () => {
      if (!config.autoBuy || s.money < 20) return;
      const sMax = strengthMax();
      const budget = s.money * 0.8;
      const edible = foods.filter((f) =>
        f.price >= 2 && f.health >= -5 && f.exp >= -10 && f.likability >= 0 && f.price < budget);

      let pool = null;
      let source = null;
      if (s.strengthFood + s.storeStrengthFood < sMax * 0.25) {
        pool = edible.filter((f) => f.type === 'Meal' && f.strengthFood > Math.min(sMax * 0.2, 100));
        source = 'autofood';
      } else if (s.strengthDrink + s.storeStrengthDrink < sMax * 0.25) {
        pool = edible.filter((f) => f.type === 'Drink' && f.strengthDrink > Math.min(sMax * 0.2, 50));
        source = 'autodrink';
      }
      if (!pool || pool.length === 0) return;

      const item = pool.reduce((a, b) => (b.price < a.price ? b : a));
      const cost = item.price * 1.2; // auto-buy pays a 20% convenience fee, like VPet
      if (s.money < cost) return;
      s.money -= cost;
      eatFood(item);
      s.stats.autoBuys += 1;
      emitter.emit('autobuy', { food: item, source, cost });
    };

    // --- Touch (MainDisplay.DisplayToTouchHead / DisplayToTouchBody) --------

    const touch = (zone) => {
      s.lastInteractionTime = Date.now();
      s.stats.touches += 1;
      if (s.strength >= 10 && s.feeling < feelingMax()) {
        strengthChange(-2);
        feelingChange(1);
        refreshMode();
        emitter.emit('touch', { zone, applied: true, label: '体力-2 心情+1' });
        emitter.emit('change');
        return true;
      }
      emitter.emit('touch', { zone, applied: false, label: null });
      return false;
    };

    // --- Tick loop -----------------------------------------------------------

    let tickTimer = null;
    let fastTimer = null;

    const tick = () => {
      functionSpend(TIME_PASS);
      autoBuyTick();
      emitter.emit('tick');
      emitter.emit('change');
    };

    const start = () => {
      if (tickTimer !== null) return;
      s.mode = calMode();
      tickTimer = window.setInterval(tick, TICK_INTERVAL_MS);
      fastTimer = window.setInterval(checkWorkFinish, 1000);
      emitter.emit('change');
    };

    const stop = () => {
      if (tickTimer !== null) { window.clearInterval(tickTimer); tickTimer = null; }
      if (fastTimer !== null) { window.clearInterval(fastTimer); fastTimer = null; }
    };

    return {
      save: s,
      change,
      works,
      foods,
      config,
      on: emitter.on,
      emit: emitter.emit,
      strengthMax,
      feelingMax,
      levelUpNeed,
      calMode,
      refreshMode,
      functionSpend,
      eatFood,
      eatBuff,
      buyFood,
      startWork,
      stopWork,
      checkWorkFinish,
      currentWork,
      findWork,
      toggleSleep,
      touch,
      tick,
      start,
      stopTimers: stop,
      markInteraction: () => { s.lastInteractionTime = Date.now(); },
    };
  };

  root.MODES = MODES;
  root.TICK_INTERVAL_MS = TICK_INTERVAL_MS;
  root.TIME_PASS = TIME_PASS;
  root.defaultSave = defaultSave;
  root.createEngine = createEngine;
})();
