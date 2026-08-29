const external = echoExternalMod;
const manifest = external.manifest || {};
const config = external.config && typeof external.config === 'object' ? external.config : {};
const configured = String(config.locale || 'auto');
const appLanguage = String(document.documentElement.lang || navigator.language || '');
const chinese = configured === 'zh-CN' || (configured !== 'en-US' && appLanguage.toLowerCase().startsWith('zh'));
const t = (zh, en) => (chinese ? zh : en);

const BOARDS = [
  { id: 'listening-time', apiName: 'ECHO_LISTENING_SECONDS_V1', labelZh: '聆听时长（秒）', labelEn: 'Listening time (seconds)', scoreField: 'totalPlayedSeconds' },
  { id: 'completed-tracks', apiName: 'ECHO_COMPLETED_TRACKS_V1', labelZh: '完成曲目数', labelEn: 'Completed tracks', scoreField: 'completedUniqueTracks' },
  { id: 'listening-streak', apiName: 'ECHO_LONGEST_STREAK_DAYS_V1', labelZh: '最长连续天数', labelEn: 'Longest streak (days)', scoreField: 'longestCompletionStreakDays' },
  { id: 'deep-session', apiName: 'ECHO_LONGEST_SESSION_SECONDS_V1', labelZh: '最长会话（秒）', labelEn: 'Longest session (seconds)', scoreField: 'longestListeningSessionSeconds' },
  { id: 'rediscovered-tracks', apiName: 'ECHO_REDISCOVERED_TRACKS_V1', labelZh: '重遇曲目数', labelEn: 'Rediscovered tracks', scoreField: 'rediscoveredTrackCount' },
];

const STAT_FIELDS = [
  { key: 'totalPlayedSeconds', zh: '总聆听秒数', en: 'Total played seconds' },
  { key: 'completedUniqueTracks', zh: '完成的独立曲目', en: 'Completed unique tracks' },
  { key: 'listeningSessionCount', zh: '聆听会话数', en: 'Listening sessions' },
  { key: 'longestListeningSessionSeconds', zh: '最长会话秒数', en: 'Longest session seconds' },
  { key: 'longestCompletionStreakDays', zh: '最长连续完成天数', en: 'Longest completion streak days' },
  { key: 'nightPlayedSeconds', zh: '夜间聆听秒数', en: 'Night played seconds' },
  { key: 'rediscoveredTrackCount', zh: '重遇曲目数', en: 'Rediscovered tracks' },
  { key: 'completedShortUniqueTracks', zh: '完成的短曲目', en: 'Completed short unique tracks' },
  { key: 'qualifiedCompletedPlayCount', zh: '合格完成次数', en: 'Qualified completed plays' },
  { key: 'completedUniqueAlbums', zh: '完成的独立专辑', en: 'Completed unique albums' },
];

const DETAIL_FIELDS = [
  'completedUniqueTracks',
  'listeningSessionCount',
  'longestListeningSessionSeconds',
  'longestCompletionStreakDays',
  'nightPlayedSeconds',
  'rediscoveredTrackCount',
  'completedShortUniqueTracks',
];

const SCOPES = [
  { id: 'global', zh: '全球', en: 'Global' },
  { id: 'around-user', zh: '附近', en: 'Around user' },
  { id: 'friends', zh: '好友', en: 'Friends' },
];

const unwrap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (!Object.prototype.hasOwnProperty.call(value, 'result')) return value;
  const keys = Object.keys(value);
  const envelope = keys.every((key) => key === 'ok' || key === 'result' || key === 'error');
  if (envelope && (value.ok === true || value.ok === undefined)) return value.result;
  return value;
};

const RELATED_NATIVE = /ECHO(?:\.modded|\s+.+)?\.exe$|electron\.exe$|steam_api64\.dll|echo-steam-leaderboards|steamworksjs/iu;

const modulesOf = (value) => {
  const inner = unwrap(value);
  if (Array.isArray(inner)) return inner;
  if (Array.isArray(inner?.modules)) return inner.modules;
  if (Array.isArray(value?.modules)) return value.modules;
  return [];
};

const nativeHostMissingText = (error) => {
  const text = String(error || '');
  return /native_host_unavailable|ECONNREFUSED|fetch failed|Failed to fetch|native host|loader launch/iu.test(text);
};

const basenameHint = (value) => {
  const text = String(value || '');
  const parts = text.split(/[/\\]/);
  return parts[parts.length - 1] || text;
};

const invoke = async (method, payload) => {
  if (typeof external.main?.invoke !== 'function') {
    throw new Error(t('需要 native host / 加载器启动（不是未找到进程）。', 'Native host / loader launch is required (this is not “process not found”).'));
  }
  return unwrap(await external.main.invoke(method, payload || {}));
};

const boardLabel = (board) => `${chinese ? board.labelZh : board.labelEn} (${board.id})`;

const formatValue = (value) => {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
};

const nowStamp = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

if (typeof external.main?.invoke !== 'function') {
  try {
    external.toast?.(t(
      'ECHO Steam Listen Board 需要 native host（main.cjs）。请用 ShinawaseLoader / Mod Loader 启动 ECHO，不要用 Steam 快捷方式。',
      'ECHO Steam Listen Board needs native host (main.cjs). Launch Echo via ShinawaseLoader / the Mod Loader, not the raw Steam shortcut.',
    ));
  } catch {}
}

const pageCss = `
  .slb-page { display: grid; gap: 16px; padding: 24px 28px 40px; font: 13px/1.5 var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif); color: var(--theme-page-text, inherit); }
  .slb-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .slb-head h1 { margin: 0; font-size: 20px; color: var(--theme-heading-text, inherit); }
  .slb-kicker { display: block; margin-bottom: 4px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--theme-muted-text, #6c7179); }
  .slb-head p { margin: 6px 0 0; max-width: 52em; color: var(--theme-muted-text, #6c7179); }
  .slb-status { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1)); background: var(--theme-panel-bg, rgba(127,127,127,0.05)); font-size: 12px; }
  .slb-status i { width: 8px; height: 8px; border-radius: 50%; background: var(--theme-danger-text, #c0392b); }
  .slb-status[data-ok="true"] i { background: var(--theme-success-text, #1a7f37); }
  .slb-warn { padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(180, 83, 9, 0.35); background: rgba(180, 83, 9, 0.1); color: inherit; }
  .slb-warn strong { display: block; margin-bottom: 4px; }
  .slb-card { display: grid; gap: 12px; padding: 16px 18px; border-radius: 14px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1)); background: var(--theme-panel-bg, rgba(127,127,127,0.04)); }
  .slb-card h2 { margin: 0; font-size: 14px; color: var(--theme-heading-text, inherit); }
  .slb-card .slb-hint { margin: 0; color: var(--theme-subtle-text, #a0a4aa); font-size: 12px; }
  .slb-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .slb-page button { min-height: 34px; padding: 0 12px; border-radius: 9px; cursor: pointer; border: 1px solid var(--theme-button-border, rgba(38,40,46,0.12)); background: var(--theme-button-bg, rgba(255,255,255,0.08)); color: inherit; font: 600 12px inherit; }
  .slb-page button.slb-primary { background: var(--theme-accent-solid-bg, var(--theme-accent, #0f766e)); color: #fff; border-color: transparent; }
  .slb-page button:disabled { opacity: .55; cursor: default; }
  .slb-facts { display: flex; gap: 8px; flex-wrap: wrap; }
  .slb-facts span { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1)); background: var(--theme-panel-bg-muted, rgba(127,127,127,0.05)); font-size: 11px; color: var(--theme-muted-text, #6c7179); }
  .slb-facts span.slb-chip-warn { border-color: rgba(180, 83, 9, 0.45); background: rgba(180, 83, 9, 0.12); color: inherit; }
  .slb-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .slb-field { display: grid; gap: 4px; }
  .slb-field label { font-size: 11px; color: var(--theme-muted-text, #6c7179); }
  .slb-page input[type="number"], .slb-page input[type="text"], .slb-page select {
    width: 100%; min-height: 34px; padding: 6px 10px; box-sizing: border-box;
    border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
    border-radius: 9px; background: var(--theme-field-bg, rgba(255,255,255,0.06));
    color: inherit; font: inherit;
  }
  .slb-check { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--theme-muted-text, #6c7179); }
  .slb-table-wrap { overflow: auto; border-radius: 10px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.1)); }
  .slb-page table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .slb-page th, .slb-page td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); }
  .slb-page th { font-size: 11px; color: var(--theme-muted-text, #6c7179); font-weight: 600; }
  .slb-page tr[data-you="true"] td { color: var(--theme-accent-solid-bg, var(--theme-accent, #0f766e)); font-weight: 650; }
  .slb-log { margin: 0; min-height: 9em; max-height: 18em; overflow: auto; padding: 12px; border-radius: 10px; background: rgba(0,0,0,.35); color: #d7dde6; white-space: pre-wrap; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .slb-pre { margin: 0; max-height: 16em; overflow: auto; padding: 12px; border-radius: 10px; background: var(--theme-panel-bg-muted, rgba(127,127,127,0.06)); white-space: pre-wrap; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .slb-error { color: var(--theme-danger-text, #c0392b); font-size: 12px; }
`;

const renderMissingHost = (root) => {
  root.innerHTML = `
    <style>${pageCss}</style>
    <div class="slb-page">
      <div class="slb-head">
        <div>
          <span class="slb-kicker">${t('官方加载器测试', 'Official loader test')}</span>
          <h1>${t('Steam 聆听排行榜测试', 'Steam LB Test')}</h1>
          <p>${t(
            '需要 native host（main.cjs）。请用 ShinawaseLoader / Mod Loader 启动 ECHO，不要使用 Steam 快捷方式。这不是“未找到进程”。',
            'Native host (main.cjs) is required. Launch Echo via ShinawaseLoader / the Mod Loader, not the raw Steam shortcut. This is not “process not found”.',
          )}</p>
        </div>
      </div>
    </div>
  `;
};

const renderPage = (root) => {
  if (typeof external.main?.invoke !== 'function') {
    renderMissingHost(root);
    return () => { root.replaceChildren(); };
  }

  const defaultBoard = BOARDS.some((board) => board.id === config.defaultBoard) ? config.defaultBoard : 'listening-time';
  const defaultScope = SCOPES.some((scope) => scope.id === config.defaultScope) ? config.defaultScope : 'global';
  const allowCustom = config.allowCustomScores !== false;

  root.innerHTML = `
    <style>${pageCss}</style>
    <div class="slb-page">
      <div class="slb-head">
        <div>
          <span class="slb-kicker">${t('官方加载器测试 · App 5105150', 'Official loader test · App 5105150')}</span>
          <h1>${t('Steam 聆听排行榜测试', 'Steam LB Test')}</h1>
          <p>${t(
            '只检查当前 ECHO 进程内已经初始化的 Steam 运行时，并把聆听排行榜数据写到线上 Steam。不会 OpenProcess 其他进程，也不会再次 steamworks.init。',
            'Inspects the in-process ECHO Steam runtime and uploads listening leaderboard data to live Steam. Does not OpenProcess other PIDs or call steamworks.init again.',
          )}</p>
        </div>
        <span class="slb-status" data-runtime><i></i><em data-runtime-text>${t('未检查', 'Not checked')}</em></span>
      </div>
      <div class="slb-warn" data-appid-banner hidden>
        <strong data-appid-banner-title></strong>
        <span data-appid-banner-body></span>
      </div>
      <div class="slb-warn">
        <strong>${t('会写入线上 Steam 排行榜', 'Writes to live Steam leaderboards')}</strong>
        ${t('KeepBest：通常不会把更高分改低，但仍是对 App 5105150 的真实写入。Steam ID 仅显示本地玩家。', 'KeepBest will not usually lower a higher score, but this still writes to live app 5105150 boards. Steam ID is local identity only.')}
      </div>

      <section class="slb-card" data-sec="inspect">
        <h2>1. ${t('检查 ECHO 进程', 'Inspect ECHO process')}</h2>
        <p class="slb-hint">${t('pid、App ID、echo-steam-leaderboards / steamworksjs / steam_api64.dll 是否已在本进程加载。', 'pid, App ID, and whether echo-steam-leaderboards / steamworksjs / steam_api64.dll are loaded in this process.')}</p>
        <div class="slb-row">
          <button type="button" class="slb-primary" data-act="inspect">${t('检查进程', 'Inspect process')}</button>
        </div>
        <div class="slb-facts" data-inspect-facts></div>
        <pre class="slb-pre" data-inspect-json hidden></pre>
      </section>

      <section class="slb-card" data-sec="status">
        <h2>2. ${t('Steam 状态', 'Steam status')}</h2>
        <p class="slb-hint">${t('Steam ID 只读，来自 localplayer.getSteamId()。', 'Steam ID is read-only from localplayer.getSteamId().')}</p>
        <div class="slb-row">
          <button type="button" data-act="status">${t('刷新状态', 'Refresh status')}</button>
        </div>
        <div class="slb-facts" data-status-facts></div>
      </section>

      <section class="slb-card" data-sec="stats">
        <h2>3. ${t('本地聆听统计', 'Local listening stats')}</h2>
        <p class="slb-hint">${t('优先 LibraryService.getSteamLeaderboardHistoryStats()，否则 steam:listening-stats / library:get-playback-stats-dashboard；仍没有则显示可编辑的 0。', 'Prefers LibraryService.getSteamLeaderboardHistoryStats(), then steam:listening-stats / library:get-playback-stats-dashboard; otherwise editable zeros.')}</p>
        <div class="slb-row">
          <button type="button" data-act="load-stats">${t('读取本地统计', 'Load local stats')}</button>
          <span class="slb-hint" data-stats-source></span>
        </div>
        <div class="slb-grid" data-stats-fields></div>
      </section>

      <section class="slb-card" data-sec="enable">
        <h2>4. ${t('启用排行榜 / 统计', 'Enable leaderboards / stats')}</h2>
        <p class="slb-hint">${t('ECHO 默认 steamLeaderboardsEnabled = false，steamListeningStatsEnabled = true。优先 steam:leaderboard:set-enabled / steam:listening-stats:set-enabled，否则 app:set-settings。', 'ECHO defaults: steamLeaderboardsEnabled false, steamListeningStatsEnabled true. Prefers steam:leaderboard:set-enabled / steam:listening-stats:set-enabled, else app:set-settings.')}</p>
        <div class="slb-row">
          <label class="slb-check"><input type="checkbox" data-enable-lb> ${t('排行榜 steamLeaderboardsEnabled', 'Leaderboards steamLeaderboardsEnabled')}</label>
          <label class="slb-check"><input type="checkbox" data-enable-stats checked> ${t('用户统计 steamListeningStatsEnabled', 'User stats steamListeningStatsEnabled')}</label>
          <button type="button" class="slb-primary" data-act="enable">${t('应用启用状态', 'Apply enablement')}</button>
        </div>
      </section>

      <section class="slb-card" data-sec="sync">
        <h2>5. ${t('官方同步', 'Official sync')}</h2>
        <p class="slb-hint">${t('使用上方本地（可编辑）统计调用 SteamLeaderboardService.sync(stats, true)。若排行榜未启用会返回明确错误。', 'Calls SteamLeaderboardService.sync(stats, true) with the stats above. Returns a clear error if leaderboards are disabled.')}</p>
        <div class="slb-row">
          <label class="slb-check"><input type="checkbox" data-sync-force> ${t('若未启用则先启用', 'Enable first if disabled')}</label>
          <label class="slb-check"><input type="checkbox" data-sync-stats ${config.alsoSyncUserStats === true ? 'checked' : ''}> ${t('同时同步用户统计', 'Also sync user stats')}</label>
          <button type="button" class="slb-primary" data-act="sync">${t('官方同步', 'Official sync')}</button>
          <button type="button" data-act="sync-stats">${t('仅同步用户统计', 'User stats only')}</button>
        </div>
      </section>

      <section class="slb-card" data-sec="upload" ${allowCustom ? '' : 'hidden'}>
        <h2>6. ${t('自定义上传', 'Custom upload')}</h2>
        <p class="slb-hint">${t('仅允许 5 个官方 apiName。主进程拒绝未知榜单。details 默认取本地统计，固定 7 个 int32。', 'Allowlisted official api names only. Main refuses unknown boards. Details default to local stats (7 int32s).')}</p>
        <div class="slb-grid">
          <div class="slb-field">
            <label>${t('排行榜', 'Board')}</label>
            <select data-upload-board></select>
          </div>
          <div class="slb-field">
            <label>${t('分数（空则用本地字段）', 'Score (empty = local field)')}</label>
            <input type="number" min="0" max="2147483647" step="1" data-upload-score value="${Number(config.defaultScore) > 0 ? Number(config.defaultScore) : ''}">
          </div>
        </div>
        <div class="slb-grid" data-upload-details></div>
        <div class="slb-row">
          <label class="slb-check"><input type="checkbox" data-upload-dry> ${t('演练（不实际上传）', 'Dry run (do not upload)')}</label>
          <button type="button" class="slb-primary" data-act="upload">${t('上传', 'Upload')}</button>
        </div>
      </section>

      <section class="slb-card" data-sec="entries">
        <h2>7. ${t('下载条目', 'Download entries')}</h2>
        <div class="slb-row">
          <select data-entries-board></select>
          <select data-entries-scope></select>
          <button type="button" class="slb-primary" data-act="entries">${t('下载', 'Download')}</button>
        </div>
        <div class="slb-table-wrap">
          <table>
            <thead>
              <tr>
                <th>${t('名次', 'Rank')}</th>
                <th>${t('玩家', 'Player')}</th>
                <th>${t('分数', 'Score')}</th>
                <th>${t('当前用户', 'You')}</th>
              </tr>
            </thead>
            <tbody data-entries-body>
              <tr><td colspan="4">${t('尚未下载。', 'Not downloaded yet.')}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="slb-card" data-sec="log">
        <h2>8. ${t('日志', 'Log')}</h2>
        <div class="slb-row">
          <button type="button" data-act="clear-log">${t('清空', 'Clear')}</button>
        </div>
        <pre class="slb-log" data-log></pre>
      </section>
    </div>
  `;

  const page = root.querySelector('.slb-page');
  const logEl = page.querySelector('[data-log]');
  const inspectFacts = page.querySelector('[data-inspect-facts]');
  const inspectJson = page.querySelector('[data-inspect-json]');
  const statusFacts = page.querySelector('[data-status-facts]');
  const statsFields = page.querySelector('[data-stats-fields]');
  const statsSource = page.querySelector('[data-stats-source]');
  const enableLb = page.querySelector('[data-enable-lb]');
  const enableStats = page.querySelector('[data-enable-stats]');
  const runtimeBadge = page.querySelector('[data-runtime]');
  const runtimeText = page.querySelector('[data-runtime-text]');
  const uploadBoard = page.querySelector('[data-upload-board]');
  const uploadScore = page.querySelector('[data-upload-score]');
  const uploadDetails = page.querySelector('[data-upload-details]');
  const uploadDry = page.querySelector('[data-upload-dry]');
  const entriesBoard = page.querySelector('[data-entries-board]');
  const entriesScope = page.querySelector('[data-entries-scope]');
  const entriesBody = page.querySelector('[data-entries-body]');
  const syncForce = page.querySelector('[data-sync-force]');
  const syncStats = page.querySelector('[data-sync-stats]');
  let lastSteamId = null;

  const appendOption = (select, value, label, selected) => {
    if (!select) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = Boolean(selected);
    select.append(option);
  };

  for (const board of BOARDS) {
    appendOption(uploadBoard, board.id, boardLabel(board), board.id === defaultBoard);
    appendOption(entriesBoard, board.id, boardLabel(board), board.id === defaultBoard);
  }
  for (const scope of SCOPES) {
    appendOption(entriesScope, scope.id, chinese ? scope.zh : scope.en, scope.id === defaultScope);
  }

  const fieldInputs = new Map();
  for (const field of STAT_FIELDS) {
    const wrap = document.createElement('div');
    wrap.className = 'slb-field';
    const label = document.createElement('label');
    label.textContent = chinese ? field.zh : field.en;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '2147483647';
    input.step = '1';
    input.value = '0';
    input.dataset.stat = field.key;
    wrap.append(label, input);
    statsFields.append(wrap);
    fieldInputs.set(field.key, input);
  }

  const detailInputs = [];
  if (uploadDetails) {
    DETAIL_FIELDS.forEach((key, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'slb-field';
      const label = document.createElement('label');
      const meta = STAT_FIELDS.find((item) => item.key === key);
      label.textContent = `details[${index}] ${meta ? (chinese ? meta.zh : meta.en) : key}`;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '2147483647';
      input.step = '1';
      input.placeholder = t('空 = 本地统计', 'empty = local stats');
      wrap.append(label, input);
      uploadDetails.append(wrap);
      detailInputs.push(input);
    });
  }

  const logLine = (message, extra) => {
    const line = extra !== undefined ? `${nowStamp()}  ${message} ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : `${nowStamp()}  ${message}`;
    logEl.textContent = logEl.textContent ? `${logEl.textContent}\n${line}` : line;
    logEl.scrollTop = logEl.scrollHeight;
    try { external.log?.(message, extra); } catch {}
  };

  const setBusy = (busy) => {
    page.querySelectorAll('button[data-act]').forEach((button) => {
      if (button.dataset.act === 'clear-log') return;
      button.disabled = busy;
    });
  };

  const chips = (node, items) => {
    node.replaceChildren();
    for (const item of items.filter(Boolean)) {
      const span = document.createElement('span');
      if (item && typeof item === 'object') {
        span.textContent = item.text;
        if (item.warn) span.classList.add('slb-chip-warn');
      } else {
        span.textContent = item;
      }
      node.append(span);
    }
  };

  const appIdBanner = page.querySelector('[data-appid-banner]');
  const appIdBannerTitle = page.querySelector('[data-appid-banner-title]');
  const appIdBannerBody = page.querySelector('[data-appid-banner-body]');

  const showAppIdBanner = (guard, extra) => {
    if (!appIdBanner) return;
    const mismatch = guard?.appIdMismatch === true;
    const unknown = guard?.appIdUnknown === true || (guard?.processOk && !guard?.appId && !mismatch);
    if (!mismatch && !unknown && !extra) {
      appIdBanner.hidden = true;
      return;
    }
    appIdBanner.hidden = false;
    if (mismatch) {
      appIdBannerTitle.textContent = t('App ID 警告', 'App ID warning');
      appIdBannerBody.textContent = t(
        `当前 App ID ${guard.appId}，与官方 5105150 不一致。检查 / 状态 / 本地统计 / 启用 / 下载条目仍可用；上传与同步已阻止。`,
        `App ID is ${guard.appId}, not official 5105150. Inspect / status / local stats / enable / download entries still work; uploads and sync are blocked.`,
      );
      return;
    }
    appIdBannerTitle.textContent = t('App ID 未从环境读到', 'App ID not read from the environment');
    appIdBannerBody.textContent = extra || t(
      '已按 ECHO 进程继续；上传仍走当前 Steam 会话。空 / 0 / 未设置不会当成外部 App ID。',
      'Continuing as the ECHO process. Uploads use the current Steam session. Empty / 0 / unset is not treated as a foreign App ID.',
    );
  };

  const readStats = () => {
    const stats = {};
    for (const [key, input] of fieldInputs) stats[key] = Number(input.value || 0);
    return stats;
  };

  const writeStats = (stats) => {
    const raw = stats && typeof stats === 'object' ? stats : {};
    for (const [key, input] of fieldInputs) {
      const value = Number(raw[key]);
      input.value = String(Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
    }
  };

  const errorTextOf = (result) => {
    const code = result && typeof result === 'object' ? result.error : null;
    const mapped = {
      not_echo_process: t('当前进程不是 ECHO。本测试只检查加载器注入的当前进程，不会去找别的 PID。', 'This process is not ECHO. This test only inspects the current in-process runtime; it does not search for another PID.'),
      steam_app_id_mismatch: t('Steam App ID 不是 5105150，已阻止上传 / 同步。本地读取仍可用。', 'Steam App ID is not 5105150; uploads/sync are blocked. Local reads still work.'),
      steam_app_id_unknown: t('App ID 未从环境读到，已按 ECHO 进程继续。', 'App ID was not read from the environment; continuing as the ECHO process.'),
      steam_modules_not_loaded: t('ECHO 进程已识别，但 Steam 模块尚未加载。', 'ECHO process identified, but Steam modules are not loaded yet.'),
      native_host_unavailable: t('需要通过 ShinawaseLoader / Mod Loader 启动 ECHO（native host）。这不是“未找到进程”。', 'Launch Echo via ShinawaseLoader / the Mod Loader (native host). This is not “process not found”.'),
      refused_foreign_process: t('当前进程不是 ECHO。', 'This process is not ECHO.'),
      empty_enable_payload: t('没有要应用的启用项。', 'Nothing to enable.'),
      enable_path_unavailable: t('无法写入 ECHO 设置。请在 ECHO 设置中打开 Steam 排行榜，或确认用加载器启动。', 'Could not write ECHO settings. Enable Steam leaderboards in ECHO settings, or launch via the loader.'),
      leaderboards_enable_failed: t('无法启用 Steam 排行榜。', 'Could not enable Steam leaderboards.'),
      steam_leaderboards_disabled: t('steamLeaderboardsEnabled 为 false。请先在本页第 4 步启用排行榜。', 'steamLeaderboardsEnabled is false. Enable leaderboards in step 4 first.'),
      custom_scores_disabled: t('已关闭自定义分数。', 'Custom scores are disabled.'),
      unknown_board: t('不是官方 5 个聆听榜之一。', 'Board is not one of the 5 official listening boards.'),
      binding_unavailable: t('echo-steam-leaderboards 尚未加载。请先启用排行榜，让 ECHO 自己初始化绑定。', 'echo-steam-leaderboards is not loaded. Enable leaderboards first so ECHO initializes the binding.'),
      invalid_board_or_scope: t('请使用官方榜单和 global / around-user / friends。', 'Use an official board and scope global / around-user / friends.'),
      stats_client_unavailable: t('Steam 用户统计客户端不可用。', 'Steam user-stats client is unavailable.'),
      stats_not_published: t('用户统计尚未在 Steam 后台发布。', 'User stats are not published on the Steam backend.'),
      write_failed: t('写入 Steam 用户统计失败。', 'Failed to write Steam user stats.'),
      store_failed: t('Steam stats.store() 失败。', 'Steam stats.store() failed.'),
    };
    if (code && mapped[code]) return mapped[code];
    if (result && typeof result === 'object') return result.message || result.error || t('调用失败', 'Call failed');
    return result instanceof Error ? result.message : String(result || t('调用失败', 'Call failed'));
  };

  const showError = (error) => {
    const message = error?.payload ? errorTextOf(error.payload) : (error instanceof Error ? error.message : String(error));
    logLine(t('错误', 'Error'), message);
    try { external.toast?.(message); } catch {}
  };

  const call = async (method, payload) => {
    const result = await invoke(method, payload);
    if (result && result.ok === false) {
      const err = new Error(errorTextOf(result));
      err.payload = result;
      throw err;
    }
    return result;
  };

  const applyStatus = (data) => {
    lastSteamId = data?.steamId != null ? String(data.steamId) : lastSteamId;
    const present = data?.steamRuntimePresent === true;
    const processOk = data?.guard?.processOk === true || data?.guard?.echoProcess === true;
    runtimeBadge.dataset.ok = String(processOk);
    runtimeText.textContent = present
      ? (data?.personaName || t('Steam 运行时在线', 'Steam runtime present'))
      : (processOk ? t('ECHO 已识别，Steam 运行时未就绪', 'ECHO identified; Steam runtime not ready') : t('Steam 运行时未就绪', 'Steam runtime not ready'));
    showAppIdBanner(data?.guard, data?.appIdWarning);
    chips(statusFacts, [
      `${t('运行时', 'Runtime')}: ${present ? 'yes' : 'no'}`,
      `${t('排行榜启用', 'Leaderboards')}: ${data?.leaderboardsEnabled ? 'on' : 'off'}`,
      `${t('统计启用', 'Stats')}: ${data?.statsEnabled ? 'on' : 'off'}`,
      data?.steamId ? `Steam ID: ${data.steamId}` : t('Steam ID: （无）', 'Steam ID: (none)'),
      data?.personaName ? `${t('名称', 'Name')}: ${data.personaName}` : null,
      data?.appId ? `App ID: ${data.appId}` : { text: t('App ID: 未从环境读到', 'App ID: not read from env'), warn: true },
      data?.guard?.verdict === 'not_echo' ? t('当前进程不是 ECHO（不是未找到进程）', 'This process is not ECHO (not “process not found”)') : null,
      data?.guard?.appIdMismatch
        ? { text: t(`App ID ${data.guard.appId} ≠ 5105150（上传已阻止）`, `App ID ${data.guard.appId} ≠ 5105150 (uploads blocked)`), warn: true }
        : null,
      data?.guard?.appIdUnknown
        ? { text: t('App ID 未从环境读到，已按 ECHO 进程继续；上传仍走当前 Steam 会话', 'App ID not read from env; continuing as ECHO. Uploads use the current Steam session.'), warn: true }
        : null,
      data?.guard?.verdict === 'steam_modules_not_loaded' ? t('ECHO 已识别，Steam 模块尚未加载', 'ECHO identified; Steam modules not loaded') : null,
    ]);
    if (typeof data?.leaderboardsEnabled === 'boolean') enableLb.checked = data.leaderboardsEnabled;
    if (typeof data?.statsEnabled === 'boolean') enableStats.checked = data.statsEnabled;
  };

  const inspectVerdictText = (data) => {
    const verdict = data?.guard?.verdict || data?.verdict || (data?.refused ? 'not_echo' : 'echo');
    if (verdict === 'not_echo') {
      return t('当前进程不是 ECHO（已检查本进程 pid，不是未找到进程）', 'This process is not ECHO (the current pid was inspected; this is not “process not found”).');
    }
    if (verdict === 'app_id_mismatch') {
      return t(`App ID 警告：当前 ${data?.guard?.appId ?? '—'}，官方为 5105150（本地读取仍可用）`, `App ID warning: got ${data?.guard?.appId ?? '—'}, official is 5105150 (local reads still work)`);
    }
    if (verdict === 'app_id_unknown') {
      return t('ECHO 进程已识别，App ID 未从环境读到（本地读取仍可用）', 'ECHO process identified; App ID was not read from the environment (local reads still work)');
    }
    if (verdict === 'steam_modules_not_loaded') {
      return t('ECHO 进程已识别，但 Steam 模块尚未加载', 'ECHO process identified, but Steam modules are not loaded yet');
    }
    return t('进程检查通过', 'Process check passed');
  };

  const applyInspect = (data, rendererNative) => {
    const files = data?.files || {};
    const rendererError = rendererNative?.error
      || (rendererNative && rendererNative.ok === false ? (rendererNative.error || rendererNative.message || 'native_host_unavailable') : null);
    const nativeResult = rendererError ? { error: rendererError } : rendererNative;
    const rendererModules = modulesOf(nativeResult).filter((item) => RELATED_NATIVE.test(String(item?.name || item?.path || '')));
    const relatedCount = (data?.nativeModules || []).length;
    const verdict = inspectVerdictText(data);
    const processOk = data?.guard?.processOk === true || data?.guard?.echoProcess === true;
    runtimeBadge.dataset.ok = String(processOk);
    runtimeText.textContent = verdict;
    showAppIdBanner(data?.guard, data?.appIdWarning);
    chips(inspectFacts, [
      `pid ${data?.pid ?? '—'}`,
      data?.ppid != null ? `ppid ${data.ppid}` : null,
      data?.guard?.image || data?.execPath ? basenameHint(data?.guard?.image || data?.execPath) : null,
      data?.guard?.appId != null ? `App ID ${data.guard.appId}` : { text: t('App ID 未从环境读到', 'App ID not read from env'), warn: true },
      processOk ? t('当前进程: ECHO', 'Current process: ECHO') : t('当前进程: 非 ECHO', 'Current process: not ECHO'),
      files.leaderboardAddon?.exists ? 'echo-steam-leaderboards.node' : t('缺少 leaderboards.node', 'leaderboards.node missing'),
      files.steamApiDll?.exists ? 'steam_api64.dll' : t('缺少 steam_api64.dll', 'steam_api64.dll missing'),
      `${t('cache 命中', 'cache hits')}: ${(data?.requireCacheHits || []).length}`,
      relatedCount
        ? `${t('相关模块', 'modules')}: ${relatedCount}`
        : t('当前进程无匹配 Steam/ECHO 模块（进程本身已找到）', 'No matching Steam/ECHO modules in this process (the process itself was found)'),
      `${t('当前进程 native.modules', 'current-process native.modules')}: ${nativeResult?.error ? t('失败', 'failed') : rendererModules.length}`,
      verdict,
      data?.guard?.appIdUnknown
        ? { text: t('App ID 未从环境读到，已按 ECHO 进程继续；上传仍走当前 Steam 会话', 'App ID not read from env; continuing as ECHO. Uploads use the current Steam session.'), warn: true }
        : null,
      data?.guard?.appIdMismatch
        ? { text: t(`App ID ${data.guard.appId} ≠ 5105150（本地读取仍可用，上传已阻止）`, `App ID ${data.guard.appId} ≠ 5105150 (local reads still work; uploads blocked)`), warn: true }
        : null,
      processOk && data?.guard?.steamModulesLoaded === false && data?.guard?.verdict !== 'steam_modules_not_loaded'
        ? t('Steam 模块尚未加载', 'Steam modules not loaded yet')
        : null,
      nativeResult?.error
        ? (nativeHostMissingText(nativeResult.error)
          ? t('native.modules 需要加载器启动，不是未找到进程', 'native.modules needs loader launch, not “process not found”')
          : `${t('native.modules 失败', 'native.modules failed')}: ${nativeResult.error}`)
        : null,
    ]);
    inspectJson.hidden = false;
    inspectJson.textContent = JSON.stringify({
      inspect: data,
      rendererNativeError: nativeResult?.error || null,
      rendererModuleCount: modulesOf(rendererNative).length,
      rendererSteamModules: rendererModules,
    }, null, 2);
  };

  const applyEntries = (data) => {
    const list = Array.isArray(data?.entries) ? data.entries : (Array.isArray(data?.result?.entries) ? data.result.entries : []);
    entriesBody.replaceChildren();
    if (!list.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = t('没有条目。', 'No entries.');
      row.append(cell);
      entriesBody.append(row);
      return;
    }
    for (const entry of list) {
      const row = document.createElement('tr');
      const isYou = entry?.isCurrentUser === true || (lastSteamId && entry?.steamId != null && String(entry.steamId) === lastSteamId);
      row.dataset.you = String(isYou);
      const cells = [entry?.rank, entry?.playerName || entry?.steamId || '—', entry?.score, isYou ? t('是', 'yes') : ''];
      for (const value of cells) {
        const cell = document.createElement('td');
        cell.textContent = formatValue(value);
        row.append(cell);
      }
      entriesBody.append(row);
    }
  };

  const onInspect = async () => {
    const data = await call('inspect');
    let rendererNative = null;
    try {
      rendererNative = typeof external.native?.modules === 'function'
        ? await external.native.modules()
        : { error: 'native_host_unavailable' };
    } catch (error) {
      rendererNative = { error: error instanceof Error ? error.message : String(error) };
    }
    applyInspect(data, rendererNative);
    logLine(t('已检查进程', 'Inspected process'), {
      pid: data?.pid,
      appId: data?.guard?.appId,
      verdict: data?.guard?.verdict || data?.verdict,
      refused: data?.refused,
    });
  };

  const onStatus = async () => {
    const data = await call('status');
    applyStatus(data);
    logLine(t('已刷新 Steam 状态', 'Refreshed Steam status'), {
      steamId: data?.steamId,
      leaderboardsEnabled: data?.leaderboardsEnabled,
      present: data?.steamRuntimePresent,
    });
  };

  const onLoadStats = async () => {
    const data = await call('localStats');
    writeStats(data?.stats);
    const source = data?.source || 'unavailable';
    statsSource.textContent = `${t('来源', 'Source')}: ${source}${data?.note ? ` · ${data.note}` : ''}`;
    logLine(t('已读取本地统计', 'Loaded local stats'), source);
  };

  const onEnable = async () => {
    const data = await call('enable', {
      leaderboards: enableLb.checked,
      stats: enableStats.checked,
    });
    if (data?.status) applyStatus(data.status);
    logLine(t('已应用启用状态', 'Applied enablement'), data?.path || data?.patch);
    try { external.toast?.(t('已请求启用 Steam 排行榜 / 统计', 'Requested Steam leaderboard / stats enablement')); } catch {}
  };

  const onSync = async () => {
    if (config.confirmBeforeUpload !== false) {
      const ok = window.confirm(t(
        '确定把当前本地聆听统计写到线上 Steam 排行榜（App 5105150，KeepBest）？此操作不可当作本地演练。',
        'Upload the current local listening stats to live Steam leaderboards (app 5105150, KeepBest)? This is not a local dry run.',
      ));
      if (!ok) {
        logLine(t('已取消官方同步', 'Official sync cancelled'));
        return;
      }
    }
    const data = await call('sync', {
      stats: readStats(),
      force: syncForce.checked,
      alsoSyncUserStats: syncStats.checked,
    });
    logLine(t('官方同步完成', 'Official sync finished'), { path: data?.path, result: data?.result || data?.uploaded });
    try { external.toast?.(t('官方同步已提交', 'Official sync submitted')); } catch {}
    await onStatus().catch(() => {});
  };

  const onSyncStats = async () => {
    if (config.confirmBeforeUpload !== false) {
      const ok = window.confirm(t(
        '确定按只增策略把 ECHO_STAT_* 用户统计写到线上 Steam？',
        'Store ECHO_STAT_* user stats on live Steam using max(remote, local)?',
      ));
      if (!ok) {
        logLine(t('已取消用户统计同步', 'User stats sync cancelled'));
        return;
      }
    }
    const data = await call('syncStats', { stats: readStats() });
    logLine(t('用户统计同步完成', 'User stats sync finished'), data);
    try { external.toast?.(t('用户统计已同步（只增）', 'User stats synced (max only)')); } catch {}
  };

  const onUpload = async () => {
    const board = BOARDS.find((item) => item.id === uploadBoard.value) || BOARDS[0];
    const scoreText = String(uploadScore.value || '').trim();
    const details = detailInputs.some((input) => String(input.value || '').trim() !== '')
      ? detailInputs.map((input, index) => {
        const text = String(input.value || '').trim();
        if (!text) return readStats()[DETAIL_FIELDS[index]] || 0;
        return Number(text);
      })
      : undefined;
    const dryRun = uploadDry.checked;
    if (!dryRun && config.confirmBeforeUpload !== false) {
      const ok = window.confirm(t(
        `确定把分数写到线上 Steam 榜 ${board.apiName}（App 5105150）？此操作不可当作本地演练。`,
        `Upload a score to live Steam board ${board.apiName} (app 5105150)? This is not a local dry run.`,
      ));
      if (!ok) {
        logLine(t('已取消上传', 'Upload cancelled'));
        return;
      }
    }
    const data = await call('upload', {
      boardId: board.id,
      score: scoreText === '' ? undefined : Number(scoreText),
      details,
      dryRun,
    });
    logLine(dryRun ? t('演练上传', 'Upload dry run') : t('已上传', 'Uploaded'), data);
    try {
      external.toast?.(dryRun
        ? t('演练完成，未写入 Steam', 'Dry run complete; nothing written to Steam')
        : t('已上传到 Steam 排行榜', 'Uploaded to Steam leaderboard'));
    } catch {}
  };

  const onEntries = async () => {
    const data = await call('entries', { boardId: entriesBoard.value, scope: entriesScope.value });
    applyEntries(data);
    if (data?.note) logLine(t('条目提示', 'Entries note'), data.note);
    logLine(t('已下载条目', 'Downloaded entries'), { boardId: data?.boardId || entriesBoard.value, scope: data?.scope || entriesScope.value, count: (data?.entries || data?.result?.entries || []).length });
  };

  page.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const act = button.dataset.act;
    const run = async () => {
      if (act === 'clear-log') { logEl.textContent = ''; return; }
      setBusy(true);
      try {
        if (act === 'inspect') await onInspect();
        else if (act === 'status') await onStatus();
        else if (act === 'load-stats') await onLoadStats();
        else if (act === 'enable') await onEnable();
        else if (act === 'sync') await onSync();
        else if (act === 'sync-stats') await onSyncStats();
        else if (act === 'upload') await onUpload();
        else if (act === 'entries') await onEntries();
      } catch (error) {
        if (error?.payload) logLine(t('调用失败', 'Call failed'), error.payload);
        showError(error);
      } finally {
        setBusy(false);
      }
    };
    void run();
  });

  logLine(t('官方 Steam 聆听排行榜测试页已打开。', 'Official Steam listen-board test page opened.'));
  void onStatus().catch((error) => logLine(t('初始状态失败', 'Initial status failed'), error instanceof Error ? error.message : String(error)));
  void onLoadStats().catch((error) => logLine(t('初始统计失败', 'Initial stats failed'), error instanceof Error ? error.message : String(error)));

  return () => { root.replaceChildren(); };
};

const unregister = external.sidebar?.register?.({
  id: 'steam-listen-board',
  label: t('Steam 聆听排行榜测试', 'Steam LB Test'),
  icon: '♛',
  order: Number(manifest.sidebarOrder) || 85,
  render: renderPage,
});

return () => {
  try { unregister?.(); } catch {}
};
