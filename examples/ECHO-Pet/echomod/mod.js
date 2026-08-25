const external = echoExternalMod;
const manifest = external.manifest || {};
const config = external.config || {};

// The pet UI itself lives in pet.html, loaded into the native "ECHO Pet"
// BrowserWindow by main.cjs. This renderer entry announces activation,
// guards the main window against pet-UI leaks, and registers an
// ECHO-styled ShinawaseLoader sidebar page with pet controls and a
// gameplay overview.

// Skip everything if this script was injected into the mod's own pet window.
if (document.body && document.body.dataset.echoClassicPet === '1') {
  return () => {};
}

external.log(`${manifest.name || 'ECHO Classic Pet'} v${manifest.version || ''} active — native pet window now loads the classic pixel pet with the v3 ECHO-theme game UI.`);

// Ensure no duplicate pet UI ever renders inside the main ECHO window.
const disposeCss = external.extend?.css?.(
  'classic-pet-main-window-guard',
  'body:not([data-echo-classic-pet]) .echo-pet-app { display: none !important; }',
);

if (config.showActivationToast !== false && !window.__echoClassicPetNotified) {
  window.__echoClassicPetNotified = true;
  try { external.toast?.('ECHO Classic Pet v3 已启用：经典像素桌宠 + ECHO 主题游戏界面（右键桌宠或悬停出现操作坞）。'); } catch {}
}

// ---------------------------------------------------------------------------
// Sidebar page (ECHO dark glass styling via the host's --theme-* tokens)
// ---------------------------------------------------------------------------

const PAGE_CLASS = 'ecp-page';

const PAGE_STYLE = `
.${PAGE_CLASS} { display: flex; flex-direction: column; gap: 14px; max-width: 760px; padding: 4px 2px 24px; color: var(--theme-page-text, #e2e8f0); font-family: var(--echo-font-family, system-ui, sans-serif); }
.${PAGE_CLASS} .ecp-hero { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 14px; border: 1px solid var(--theme-panel-border, rgba(232,238,247,0.13)); background: linear-gradient(135deg, var(--theme-accent-bg, rgba(100,181,255,0.16)), transparent 55%), var(--theme-panel-bg, rgba(23,29,38,0.86)); box-shadow: var(--theme-shadow-panel, 0 12px 30px rgba(0,0,0,0.3)); }
.${PAGE_CLASS} .ecp-hero-icon { width: 52px; height: 52px; flex: 0 0 auto; image-rendering: pixelated; border-radius: 12px; }
.${PAGE_CLASS} .ecp-hero-title { margin: 0; font-size: 17px; font-weight: 700; color: var(--theme-heading-text, #eef3f9); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.${PAGE_CLASS} .ecp-ver { padding: 1px 8px; font-size: 10px; font-weight: 700; color: var(--theme-accent-text, #9bd4ff); background: var(--theme-accent-bg, rgba(100,181,255,0.16)); border: 1px solid var(--theme-accent-border, rgba(100,181,255,0.3)); border-radius: 999px; }
.${PAGE_CLASS} .ecp-hero-sub { margin: 4px 0 0; font-size: 12px; color: var(--theme-muted-text, #aeb9c8); }
.${PAGE_CLASS} .ecp-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--theme-muted-text, #aeb9c8); }
.${PAGE_CLASS} .ecp-dot { width: 8px; height: 8px; border-radius: 50%; background: #64748b; box-shadow: 0 0 6px rgba(100,116,139,0.6); }
.${PAGE_CLASS} .ecp-dot.is-on { background: #34d399; box-shadow: 0 0 8px rgba(52,211,153,0.8); }
.${PAGE_CLASS} .ecp-section-title { margin: 4px 0 0; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--theme-subtle-text, #8a94a4); }
.${PAGE_CLASS} .ecp-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.${PAGE_CLASS} .ecp-btn { padding: 7px 14px; font-size: 12px; font-weight: 600; color: var(--theme-button-text, #dbe3ee); background: var(--theme-button-bg, rgba(29,37,49,0.9)); border: 1px solid var(--theme-button-border, rgba(232,238,247,0.125)); border-radius: 8px; cursor: pointer; transition: background 130ms ease, border-color 130ms ease; }
.${PAGE_CLASS} .ecp-btn:hover { background: var(--theme-button-bg-hover, rgba(42,53,68,0.97)); border-color: var(--theme-panel-border-strong, rgba(232,238,247,0.22)); }
.${PAGE_CLASS} .ecp-btn--accent { color: var(--theme-on-accent, #fff); background: var(--theme-accent-solid-bg, #2f6da8); border-color: var(--theme-accent-border, rgba(100,181,255,0.3)); }
.${PAGE_CLASS} .ecp-btn--accent:hover { background: var(--theme-accent-solid-bg, #2f6da8); filter: brightness(1.15); }
.${PAGE_CLASS} .ecp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.${PAGE_CLASS} .ecp-card { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--theme-panel-border, rgba(232,238,247,0.13)); background: var(--theme-panel-bg, rgba(23,29,38,0.86)); }
.${PAGE_CLASS} .ecp-card h4 { margin: 0 0 5px; font-size: 13px; color: var(--theme-heading-text, #eef3f9); display: flex; align-items: center; gap: 7px; }
.${PAGE_CLASS} .ecp-card p { margin: 0; font-size: 11.5px; line-height: 1.55; color: var(--theme-muted-text, #aeb9c8); }
.${PAGE_CLASS} .ecp-rows { display: flex; flex-direction: column; gap: 6px; }
.${PAGE_CLASS} .ecp-row { display: flex; gap: 10px; align-items: baseline; padding: 7px 12px; font-size: 12px; border-radius: 8px; border: 1px solid var(--theme-list-row-border, rgba(232,238,247,0.095)); background: var(--theme-list-row-bg, rgba(23,29,38,0.76)); }
.${PAGE_CLASS} .ecp-row b { flex: 0 0 148px; font-weight: 600; color: var(--theme-page-text, #e2e8f0); }
.${PAGE_CLASS} .ecp-row span { color: var(--theme-muted-text, #aeb9c8); }
.${PAGE_CLASS} .ecp-foot { font-size: 11px; color: var(--theme-subtle-text, #8a94a4); }
`;

const petIconMarkup = `
<svg class="ecp-hero-icon" viewBox="0 0 24 24" aria-hidden="true">
  <rect width="24" height="24" rx="6" fill="#0d1420"/>
  <g fill="#cce9ff" shape-rendering="crispEdges">
    <rect x="7" y="3" width="2" height="2"/><rect x="15" y="3" width="2" height="2"/>
    <rect x="6" y="5" width="12" height="2"/><rect x="5" y="7" width="14" height="6"/>
    <rect x="6" y="13" width="12" height="2"/><rect x="7" y="15" width="3" height="2"/>
    <rect x="14" y="15" width="3" height="2"/>
  </g>
  <g fill="#0d1420" shape-rendering="crispEdges">
    <rect x="8" y="8" width="2" height="3"/><rect x="14" y="8" width="2" height="3"/>
  </g>
  <g fill="#5eead4" shape-rendering="crispEdges">
    <rect x="6" y="19" width="2" height="2"/><rect x="9" y="18" width="2" height="3"/>
    <rect x="12" y="19" width="2" height="2"/><rect x="15" y="17" width="2" height="4"/>
  </g>
</svg>`;

const FEATURES = [
  ['🛒', '喂食商店', '60+ ECHO 风味食品：无损兑换券、ASIO 特调、黑胶小食……分类浏览、批量购买、吃腻冷却与自动觅食。'],
  ['💼', '打工日程', '整理曲库、打碟、电台直播、研究频响…… VPet 同款效率公式与完工奖励，独立面板窗口随开随关。'],
  ['📊', '状态面板', '金钱 / 经验 / 等级 / 体力 / 心情 / 饱腹 / 口渴实时仪表，逐 Tick 增减量与好感、健康一览。'],
  ['🎛', '操作坞', '悬停桌宠出现 ECHO 玻璃操作坞：商店、日程、状态、睡觉、跳舞一键直达，另有像素播控（上一首/播放/下一首）。'],
  ['🕺', '动作状态', '呼吸、开心弹跳、工作脉冲、睡觉摇晃、吃饭咀嚼、生病摇摆、跟拍旋转 —— 桌宠随模式与动作切换动画。'],
  ['🎮', 'Steam 状态', '桌宠状态线（正在听 / 打工 / 睡觉）可推送到 Steam Rich Presence，好友列表实时可见。'],
];

const INTERACTIONS = [
  ['点击桌宠', '摸头 / 摸身体：体力 −2、心情 +1，播放互动动画'],
  ['悬停桌宠', '显示操作坞、播控与窗口按钮'],
  ['空闲散步', '桌宠会不时沿屏幕边缘左右散步；拖拽 / 睡觉 / 打工 / 打开面板时自动暂停'],
  ['右键桌宠', 'VPet 式菜单：喂食 / 互动 / 面板 / 系统'],
  ['拖拽桌宠', '移动桌宠窗口'],
  ['拖拽面板标题栏', '自由摆放商店 / 日程 / 状态独立面板窗口'],
  ['Esc', '关闭菜单并收起所有面板窗口'],
];

const disposeSidebar = external.sidebar?.register?.({
  id: 'classic-pet',
  label: manifest.name || 'ECHO Classic Pet',
  icon: '🐾',
  order: 46,
  render(root, context) {
    const cleanups = [];
    const page = document.createElement('div');
    page.className = PAGE_CLASS;

    const style = document.createElement('style');
    style.textContent = PAGE_STYLE;
    page.append(style);

    // --- hero ---
    const hero = document.createElement('header');
    hero.className = 'ecp-hero';
    const heroBody = document.createElement('div');
    heroBody.innerHTML = `
      <h2 class="ecp-hero-title">${manifest.name || 'ECHO Classic Pet'}
        <span class="ecp-ver">v${manifest.version || '3.0.0'}</span>
      </h2>
      <p class="ecp-hero-sub">经典 ECHO 像素桌宠 × VPet 玩法 × ECHO 暗色玻璃界面</p>
      <p class="ecp-status"><span class="ecp-dot" id="ecp-dot"></span><span id="ecp-status-text">正在读取桌宠状态…</span></p>
    `;
    hero.insertAdjacentHTML('afterbegin', petIconMarkup);
    hero.append(heroBody);
    page.append(hero);

    // --- quick actions ---
    const actionsTitle = document.createElement('h3');
    actionsTitle.className = 'ecp-section-title';
    actionsTitle.textContent = '桌宠控制';
    const actions = document.createElement('div');
    actions.className = 'ecp-actions';

    const petApi = context.echo?.pet || external.echo?.pet || null;

    const makeAction = (label, accent, handler) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = accent ? 'ecp-btn ecp-btn--accent' : 'ecp-btn';
      button.textContent = label;
      button.addEventListener('click', async () => {
        try {
          await handler();
        } catch (error) {
          context.toast(`操作失败：${error instanceof Error ? error.message : error}`);
        }
      });
      actions.append(button);
      return button;
    };

    makeAction('显示桌宠', true, async () => {
      if (typeof petApi?.show !== 'function') throw new Error('pet API 不可用');
      await petApi.show();
      context.toast('桌宠已显示');
    });
    makeAction('隐藏桌宠', false, async () => {
      if (typeof petApi?.hide !== 'function') throw new Error('pet API 不可用');
      await petApi.hide();
      context.toast('桌宠已隐藏');
    });
    makeAction('重置位置', false, async () => {
      if (typeof petApi?.resetBounds !== 'function') throw new Error('pet API 不可用');
      await petApi.resetBounds();
      context.toast('桌宠位置已重置');
    });

    page.append(actionsTitle, actions);

    // --- features ---
    const featTitle = document.createElement('h3');
    featTitle.className = 'ecp-section-title';
    featTitle.textContent = '玩法一览';
    const grid = document.createElement('div');
    grid.className = 'ecp-grid';
    for (const [emoji, title, text] of FEATURES) {
      const card = document.createElement('article');
      card.className = 'ecp-card';
      const h = document.createElement('h4');
      h.textContent = `${emoji} ${title}`;
      const p = document.createElement('p');
      p.textContent = text;
      card.append(h, p);
      grid.append(card);
    }
    page.append(featTitle, grid);

    // --- interaction quick reference ---
    const refTitle = document.createElement('h3');
    refTitle.className = 'ecp-section-title';
    refTitle.textContent = '交互速查';
    const rows = document.createElement('div');
    rows.className = 'ecp-rows';
    for (const [key, value] of INTERACTIONS) {
      const row = document.createElement('div');
      row.className = 'ecp-row';
      const b = document.createElement('b');
      b.textContent = key;
      const span = document.createElement('span');
      span.textContent = value;
      row.append(b, span);
      rows.append(row);
    }
    page.append(refTitle, rows);

    // --- config summary ---
    const cfgTitle = document.createElement('h3');
    cfgTitle.className = 'ecp-section-title';
    cfgTitle.textContent = '当前配置';
    const cfgRows = document.createElement('div');
    cfgRows.className = 'ecp-rows';
    const steamModeText = ({
      'native-augment': '原生增强',
      'pet-only': '仅桌宠状态',
      off: '关闭',
    })[config.steamStatusMode] || '原生增强';
    const hiddenParts = [
      ['showActionDock', '操作坞'],
      ['showTransportControls', '播控'],
      ['showWindowControls', '窗口按钮'],
      ['showStatusBar', '状态条'],
      ['showSpeechBubble', '气泡'],
      ['showWorkTimer', '工作计时'],
      ['showContextMenu', '右键菜单'],
    ].filter(([key]) => config[key] === false).map(([, label]) => label);
    const cfgEntries = [
      ['桌宠名字', String(config.petName || 'ECHO')],
      ['Steam 状态推送', config.enableSteamStatus !== false ? '开启' : '关闭'],
      ['Steam 状态模式', config.steamCustomTemplate ? `${steamModeText}（自定义模板）` : steamModeText],
      ['自动觅食', config.autoBuy !== false ? '开启' : '关闭'],
      ['空闲散步', config.enableRoaming !== false ? '开启' : '关闭'],
      ['互动动画时长', `${Number(config.interactDurationMs) || 3600} ms`],
      ['隐藏的界面部件', hiddenParts.length ? hiddenParts.join(' / ') : '无'],
    ];
    for (const [key, value] of cfgEntries) {
      const row = document.createElement('div');
      row.className = 'ecp-row';
      const b = document.createElement('b');
      b.textContent = key;
      const span = document.createElement('span');
      span.textContent = value;
      row.append(b, span);
      cfgRows.append(row);
    }
    page.append(cfgTitle, cfgRows);

    const foot = document.createElement('p');
    foot.className = 'ecp-foot';
    foot.textContent = '游戏存档保存在桌宠窗口的 localStorage（echo.classic-pet.save.v1）。重置存档：右键桌宠 → 面板 → 重置存档。';
    page.append(foot);

    root.append(page);

    // --- live pet window status ---
    const dot = page.querySelector('#ecp-dot');
    const statusText = page.querySelector('#ecp-status-text');
    const renderPetState = (state) => {
      const visible = state && state.visible === true;
      if (dot) dot.classList.toggle('is-on', visible);
      if (statusText) {
        statusText.textContent = visible
          ? `桌宠窗口运行中${state.bounds ? ` · ${state.bounds.width}×${state.bounds.height} @ (${state.bounds.x}, ${state.bounds.y})` : ''}`
          : '桌宠窗口已隐藏（可用上方按钮显示）';
      }
    };

    if (typeof petApi?.getState === 'function') {
      Promise.resolve(petApi.getState()).then(renderPetState).catch(() => {
        if (statusText) statusText.textContent = '无法读取桌宠状态';
      });
    } else if (statusText) {
      statusText.textContent = 'pet API 不可用（请在 ECHO 内启用桌宠）';
    }
    if (typeof petApi?.onStateChanged === 'function') {
      try {
        const unsubscribe = petApi.onStateChanged(renderPetState);
        if (typeof unsubscribe === 'function') cleanups.push(unsubscribe);
      } catch { /* live updates are best-effort */ }
    }

    return () => {
      for (const cleanup of cleanups) {
        try { cleanup(); } catch { /* best effort */ }
      }
      page.remove();
    };
  },
});

return () => {
  disposeCss?.();
  disposeSidebar?.();
};
