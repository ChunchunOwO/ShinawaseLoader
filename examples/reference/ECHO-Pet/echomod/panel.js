'use strict';

/*
 * ECHO Classic Pet — panel window renderer (shop / work / stats).
 *
 * Runs inside a dedicated frameless BrowserWindow opened by main.cjs as
 * panel.html?panel=<name>. The game engine lives exclusively in the pet
 * window; this page is a pure view + action-dispatch layer:
 *
 *  - static game data (foods / works / config) arrives as
 *    window.__echoClassicPetData ('echo-classic-pet-data' event, injected by
 *    main.cjs, with a fetch/XHR fallback to data/*.json),
 *  - live engine snapshots arrive as window.__echoClassicPetPanelState
 *    ('echo-classic-pet-panel-state' event, pushed by the pet window through
 *    main.cjs),
 *  - user actions (buy food, start/stop work) go back through the tagged
 *    console-message bridge as panelAction messages, which main.cjs relays
 *    to the pet window for the engine to execute,
 *  - the titlebar close button (and Esc) asks main.cjs to close this window.
 */
(() => {
  // Renderer -> main bridge marker (main.cjs listens on console-message).
  const BRIDGE_TAG = '[echo-classic-pet:bridge]';
  const DATA_WAIT_TIMEOUT_MS = 8000;

  // Engine tick constants, mirrored for the advertised per-minute job rates.
  // Keep in sync with game/engine.js (the engine only runs in the pet window).
  const TICK_INTERVAL_MS = 15000;
  const TIME_PASS = 0.05;

  const MODE_LABELS = { happy: '开心', nomal: '普通', poorcondition: '低落', ill: '生病' };

  const PANEL_META = {
    shop: { title: '商店', icon: 'icon-shop' },
    work: { title: '安排日程', icon: 'icon-work' },
    stats: { title: '状态', icon: 'icon-stats' },
  };

  const panelName = new URLSearchParams(window.location.search).get('panel') || '';
  const meta = PANEL_META[panelName] || null;

  // ---------------------------------------------------------------------
  // Bridge helpers
  // ---------------------------------------------------------------------

  const sendBridge = (payload) => {
    try {
      console.info(`${BRIDGE_TAG} ${JSON.stringify(payload)}`);
    } catch { /* bridge is best-effort */ }
  };

  const sendAction = (action) => sendBridge({ type: 'panelAction', action });
  const closeSelf = () => sendBridge({ type: 'closePanel', name: panelName });

  // ---------------------------------------------------------------------
  // DOM helpers + inline SVG sprites
  // ---------------------------------------------------------------------

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };

  const svgIcon = (name, className = 'cp-icon') => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${name}`);
    svg.append(use);
    return svg;
  };

  const fetchText = async (path) => {
    // fetch() may reject file:// URLs depending on the Chromium build, so
    // fall back to XHR which Electron allows for same-directory files.
    try {
      const response = await fetch(path);
      if (response.ok) return await response.text();
    } catch { /* fall through to XHR */ }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', path);
      xhr.responseType = 'text';
      xhr.onload = () => resolve(xhr.responseText);
      xhr.onerror = () => reject(new Error(`load failed: ${path}`));
      xhr.send();
    });
  };

  const injectSprites = async () => {
    const container = document.getElementById('cp-sprites');
    if (!container) return;
    try {
      container.innerHTML = await fetchText('assets/ui-icons.svg');
    } catch (error) {
      console.warn('[classic-pet:panel] sprite load failed', error);
    }
  };

  void injectSprites();

  // ---------------------------------------------------------------------
  // Chrome (titlebar, close, Esc)
  // ---------------------------------------------------------------------

  const titleEl = document.getElementById('panel-title');
  const iconEl = document.getElementById('panel-icon');
  const auxEl = document.getElementById('panel-aux');
  const bodyEl = document.getElementById('panel-body');

  document.getElementById('panel-close').addEventListener('click', closeSelf);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSelf();
  });

  if (!meta) {
    titleEl.textContent = 'ECHO 桌宠面板';
    bodyEl.append(el('p', 'cp-panel-wait', `未知面板类型：${panelName || '(空)'}`));
    return;
  }

  document.title = `${meta.title} · ECHO 桌宠面板`; // never exactly "ECHO Pet"
  iconEl.append(svgIcon(meta.icon));
  titleEl.textContent = meta.title;

  // ---------------------------------------------------------------------
  // Data / state plumbing
  // ---------------------------------------------------------------------

  let state = window.__echoClassicPetPanelState || null; // latest engine snapshot
  let view = null;         // { update(), focus?(tab) } once built
  let pendingTab = null;   // focus request that arrived before the view

  const waitForInjectedData = () => new Promise((resolve) => {
    if (window.__echoClassicPetData) {
      resolve(window.__echoClassicPetData);
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('echo-classic-pet-data', onEvent);
      window.clearInterval(pollTimer);
      window.clearTimeout(timeout);
      resolve(value);
    };
    const onEvent = () => finish(window.__echoClassicPetData || null);
    const pollTimer = window.setInterval(() => {
      if (window.__echoClassicPetData) finish(window.__echoClassicPetData);
    }, 200);
    const timeout = window.setTimeout(() => finish(null), DATA_WAIT_TIMEOUT_MS);
    window.addEventListener('echo-classic-pet-data', onEvent);
  });

  const fetchJson = async (path) => JSON.parse(await fetchText(path));

  const loadGameData = async () => {
    const injected = await waitForInjectedData();
    if (injected && Array.isArray(injected.foods) && Array.isArray(injected.works)) {
      return injected;
    }
    const [foods, works] = await Promise.all([
      fetchJson('data/foods.json'),
      fetchJson('data/works.json'),
    ]);
    return { foods, works, config: injected?.config || {} };
  };

  window.addEventListener('echo-classic-pet-panel-state', () => {
    const next = window.__echoClassicPetPanelState;
    if (!next || typeof next !== 'object' || !next.save) return;
    state = next;
    view?.update();
  });

  window.addEventListener('echo-classic-pet-panel-focus', () => {
    const focus = window.__echoClassicPetPanelFocus;
    const tab = focus && typeof focus.tab === 'string' ? focus.tab : null;
    if (!tab) return;
    if (view?.focus) view.focus(tab);
    else pendingTab = tab;
  });

  // ---------------------------------------------------------------------
  // Shop view (adapted from the former game/food.js floating panel)
  // ---------------------------------------------------------------------

  const statChips = (food) => {
    const chips = [];
    if (food.strengthFood) chips.push(`饱${food.strengthFood > 0 ? '+' : ''}${food.strengthFood}`);
    if (food.strengthDrink) chips.push(`水${food.strengthDrink > 0 ? '+' : ''}${food.strengthDrink}`);
    if (food.strength) chips.push(`体${food.strength > 0 ? '+' : ''}${food.strength}`);
    if (food.feeling) chips.push(`心${food.feeling > 0 ? '+' : ''}${food.feeling}`);
    if (food.exp) chips.push(`经${food.exp > 0 ? '+' : ''}${food.exp}`);
    if (food.health) chips.push(`健${food.health > 0 ? '+' : ''}${food.health}`);
    return chips.join(' ');
  };

  const buildShop = (data) => {
    const CATEGORIES = [
      { id: 'all', label: '全部' },
      { id: 'Meal', label: '正餐' },
      { id: 'Snack', label: '零食' },
      { id: 'Drink', label: '饮料' },
      { id: 'Functional', label: '功能' },
    ];
    const QUANTITIES = [1, 5, 10];
    let category = 'all';
    let quantity = 1;

    const money = el('span', 'cp-money-chip');
    money.append(svgIcon('icon-coin'));
    const moneyText = el('span', null, '—');
    money.append(moneyText);
    auxEl.append(money);

    const tabs = el('nav', 'cp-shop-tabs');
    const tabButtons = new Map();
    for (const cat of CATEGORIES) {
      const button = el('button', 'ec-chip', cat.label);
      button.type = 'button';
      button.addEventListener('click', () => {
        category = cat.id;
        render();
      });
      tabButtons.set(cat.id, button);
      tabs.append(button);
    }

    const qtyBar = el('div', 'cp-shop-qty');
    qtyBar.append(el('span', 'cp-shop-qty-label', '数量'));
    const qtyButtons = new Map();
    for (const qty of QUANTITIES) {
      const button = el('button', 'ec-chip cp-qty', `×${qty}`);
      button.type = 'button';
      button.addEventListener('click', () => {
        quantity = qty;
        render();
      });
      qtyButtons.set(qty, button);
      qtyBar.append(button);
    }

    const list = el('div', 'cp-shop-list ec-scroll');
    bodyEl.append(tabs, qtyBar, list);

    // Incremental refresh for state pushes: updates money, affordability and
    // the boredom chips in place so the list keeps its DOM (and scrollTop).
    let rowUpdaters = [];

    const update = () => {
      moneyText.textContent = state ? state.save.money.toFixed(2) : '—';
      for (const fn of rowUpdaters) fn();
    };

    // Full rebuild: only on category/quantity change.
    const render = () => {
      for (const [id, button] of tabButtons) button.classList.toggle('is-active', id === category);
      for (const [qty, button] of qtyButtons) button.classList.toggle('is-active', qty === quantity);

      list.textContent = '';
      rowUpdaters = [];
      const foods = data.foods.filter((f) => category === 'all' || f.type === category);
      for (const food of foods) {
        const row = el('article', 'cp-shop-item ec-row');
        const info = el('div', 'cp-shop-item-info');
        const nameRow = el('div', 'cp-shop-item-name');
        nameRow.append(el('strong', null, food.name), el('span', 'cp-shop-item-price', `💰${food.price.toFixed(1)}`));
        const bored = el('span', 'cp-shop-item-bored');
        bored.title = '短时间内重复食用，效果降低';
        bored.hidden = true;
        nameRow.append(bored);
        info.append(nameRow, el('div', 'cp-shop-item-stats', statChips(food)));
        info.title = food.desc || food.name;

        const cost = food.price * quantity;
        const buyButton = el('button', 'cp-buy ec-btn ec-btn--accent', quantity > 1 ? `买×${quantity}` : '购买');
        buyButton.type = 'button';
        buyButton.title = `花费 ${cost.toFixed(2)} 金钱`;
        buyButton.disabled = true;
        buyButton.addEventListener('click', () => {
          sendAction({ kind: 'buyFood', name: food.name, quantity });
        });

        rowUpdaters.push(() => {
          const buff = state && state.buffs ? state.buffs[food.name] : undefined;
          if (typeof buff === 'number' && buff < 1) {
            bored.textContent = `吃腻 ${(buff * 100).toFixed(0)}%`;
            bored.hidden = false;
          } else {
            bored.hidden = true;
          }
          buyButton.disabled = !state || state.save.money < cost;
        });

        row.append(info, buyButton);
        list.append(row);
      }
      if (foods.length === 0) {
        list.append(el('p', 'cp-empty', '这个分类暂时没有商品'));
      }
      update();
    };

    render();
    return { update };
  };

  // ---------------------------------------------------------------------
  // Work view (adapted from the former game/work.js floating panel;
  // the running work timer card stays on the pet stage)
  // ---------------------------------------------------------------------

  // engine.js pays timePass(=TIME_PASS) × moneyBase per 15s tick (times an
  // efficiency factor), so the advertised per-minute rate is
  // moneyBase × TIME_PASS × ticks-per-minute — not the raw moneyBase.
  const ratePerMinute = (moneyBase) => moneyBase * TIME_PASS * (60000 / TICK_INTERVAL_MS);
  const formatRate = (value) => String(parseFloat(value.toFixed(2)));

  const buildWork = (data) => {
    const WORK_TABS = [
      { id: 'Work', label: '工作' },
      { id: 'Study', label: '学习' },
      { id: 'Play', label: '玩耍' },
    ];
    let tab = 'Work';

    const tabs = el('nav', 'cp-shop-tabs');
    const tabButtons = new Map();
    for (const t of WORK_TABS) {
      const button = el('button', 'ec-chip', t.label);
      button.type = 'button';
      button.addEventListener('click', () => {
        tab = t.id;
        render();
      });
      tabButtons.set(t.id, button);
      tabs.append(button);
    }

    const list = el('div', 'cp-work-list ec-scroll');
    bodyEl.append(tabs, list);

    // Incremental refresh for state pushes: updates each row's start/stop
    // button state in place so the list keeps its DOM (and scrollTop).
    let rowUpdaters = [];

    const update = () => {
      for (const fn of rowUpdaters) fn();
    };

    // Full rebuild: only on tab change.
    const render = () => {
      for (const [id, button] of tabButtons) button.classList.toggle('is-active', id === tab);
      list.textContent = '';
      rowUpdaters = [];
      for (const work of data.works.filter((w) => w.type === tab)) {
        const row = el('article', 'cp-work-item ec-row');
        row.style.setProperty('--work-bg', work.background);
        row.style.setProperty('--work-fg', work.foreground);
        row.style.setProperty('--work-accent', work.accent);

        const info = el('div', 'cp-work-item-info');
        const nameRow = el('div', 'cp-work-item-name');
        nameRow.append(el('strong', null, work.name));
        if (work.levelLimit > 0) nameRow.append(el('span', 'cp-work-item-lv', `Lv${work.levelLimit}`));
        const unit = work.type === 'Work' ? '钱' : '经验';
        const stats = el('div', 'cp-work-item-stats',
          `约${formatRate(ratePerMinute(work.moneyBase))}${unit}/分 · ${work.time}分钟 · 饱-${work.strengthFood} 水-${work.strengthDrink}`);
        stats.title = `引擎每${(TICK_INTERVAL_MS / 1000).toFixed(0)}秒结算一次，实际收益随效率浮动`;
        info.append(nameRow, stats);

        const startButton = el('button', 'cp-buy ec-btn ec-btn--accent', '开始');
        startButton.type = 'button';
        startButton.disabled = true;
        startButton.addEventListener('click', () => {
          // The engine toggles: starting the already-running job stops it.
          sendAction({ kind: 'startWork', id: work.id });
        });

        rowUpdaters.push(() => {
          const save = state ? state.save : null;
          const isActive = Boolean(save && save.state === 'work'
            && save.nowWork && save.nowWork.id === work.id);
          const locked = !save || save.level < work.levelLimit;
          startButton.className = isActive ? 'cp-buy ec-btn ec-btn--danger' : 'cp-buy ec-btn ec-btn--accent';
          startButton.textContent = isActive ? '停止' : '开始';
          startButton.disabled = !save || locked || save.mode === 'ill';
          if (!save) startButton.title = '等待桌宠数据…';
          else if (locked) startButton.title = `需要等级 Lv${work.levelLimit}`;
          else if (save.mode === 'ill') startButton.title = '生病中无法安排日程';
          else startButton.removeAttribute('title');
        });

        row.append(info, startButton);
        list.append(row);
      }
      update();
    };

    const focus = (tabId) => {
      if (WORK_TABS.some((t) => t.id === tabId)) {
        tab = tabId;
        render();
      }
    };

    render();
    return { update, focus };
  };

  // ---------------------------------------------------------------------
  // Stats view (adapted from the former pet.js buildStatsPanel; every value
  // comes from the pushed snapshot, nothing is computed engine-side here)
  // ---------------------------------------------------------------------

  const buildStats = () => {
    const list = el('div', 'cp-stats-body ec-scroll');

    const waiting = el('p', 'cp-panel-wait', '等待桌宠数据…');

    const idRow = el('div', 'cp-stats-idrow');
    const nameEl = el('span', 'cp-stats-name');
    const levelEl = el('span', 'cp-stats-level');
    const modeEl = el('span', 'cp-stats-mode');
    idRow.append(nameEl, levelEl, modeEl);

    const moneyEl = el('div', 'cp-money-chip');
    moneyEl.append(svgIcon('icon-coin'));
    const moneyText = el('span');
    moneyEl.append(moneyText);

    const makeMeter = (label, meterClass) => {
      const row = el('div', 'cp-stat-row');
      const labelRow = el('div', 'cp-stat-label');
      const name = el('span', null, label);
      const delta = el('span', 'cp-stat-delta');
      const value = el('span', 'cp-stat-value');
      labelRow.append(name, delta, value);
      const bar = el('div', `ec-meter ${meterClass}`);
      const fill = el('div', 'ec-meter-fill');
      bar.append(fill);
      row.append(labelRow, bar);
      return { row, delta, value, bar, fill };
    };

    const expBar = makeMeter('经验 EXP', 'cp-meter--exp');
    const strengthBar = makeMeter('体力', 'cp-meter--strength');
    const feelingBar = makeMeter('心情', 'cp-meter--feeling');
    const foodBar = makeMeter('饱腹', 'cp-meter--food');
    const drinkBar = makeMeter('口渴', 'cp-meter--drink');

    const footer = el('div', 'cp-stats-footer');

    list.append(idRow, moneyEl, expBar.row, strengthBar.row, feelingBar.row, foodBar.row, drinkBar.row, footer);
    list.hidden = true;
    bodyEl.append(waiting, list);

    const setDelta = (barParts, changeValue) => {
      const rounded = Math.round(changeValue * 100) / 100;
      if (Math.abs(rounded) < 0.01) {
        barParts.delta.textContent = '';
        barParts.delta.removeAttribute('data-sign');
      } else {
        barParts.delta.textContent = `(${rounded > 0 ? '+' : ''}${rounded})`;
        barParts.delta.dataset.sign = rounded > 0 ? 'up' : 'down';
      }
    };

    const setBar = (barParts, value, max, lowRatio = 0.25) => {
      barParts.value.textContent = `${value.toFixed(0)}/${max.toFixed(0)}`;
      barParts.fill.style.width = `${Math.min(100, Math.max(0, (value / max) * 100)).toFixed(1)}%`;
      barParts.bar.classList.toggle('cp-meter--low', value / max <= lowRatio);
    };

    const update = () => {
      if (!state) return;
      waiting.remove();
      list.hidden = false;

      const s = state.save;
      const d = state.derived;
      const change = d.change || {};
      nameEl.textContent = s.name;
      levelEl.textContent = `Lv${s.level}${s.levelMax > 0 ? ` (Max${s.levelMax})` : ''}`;
      modeEl.textContent = MODE_LABELS[s.mode] || s.mode;
      modeEl.dataset.mode = s.mode;
      moneyText.textContent = `金钱 ${s.money.toFixed(2)}`;

      setBar(expBar, s.exp, d.levelUpNeed, -1);
      setDelta(expBar, 0);
      setBar(strengthBar, s.strength, d.strengthMax);
      setDelta(strengthBar, change.strength || 0);
      setBar(feelingBar, s.feeling, d.feelingMax);
      setDelta(feelingBar, change.feeling || 0);
      setBar(foodBar, s.strengthFood, d.strengthMax);
      setDelta(foodBar, change.strengthFood || 0);
      setBar(drinkBar, s.strengthDrink, d.strengthMax);
      setDelta(drinkBar, change.strengthDrink || 0);

      footer.textContent =
        `好感 ${s.likability.toFixed(0)}/${s.likabilityMax.toFixed(0)} · 健康 ${s.health.toFixed(0)}/100 · 摸头${s.stats.touches} 吃饭${s.stats.eats} 打工${s.stats.worksFinished}`;
    };

    update();
    return { update };
  };

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  loadGameData()
    .then((data) => {
      if (panelName === 'shop') view = buildShop(data);
      else if (panelName === 'work') view = buildWork(data);
      else view = buildStats();
      if (state) view.update();
      if (pendingTab && view.focus) {
        view.focus(pendingTab);
        pendingTab = null;
      }
    })
    .catch((error) => {
      console.error('[classic-pet:panel] game data failed to load', error);
      bodyEl.textContent = '';
      bodyEl.append(el('p', 'cp-panel-wait', '面板数据加载失败'));
    });
})();
