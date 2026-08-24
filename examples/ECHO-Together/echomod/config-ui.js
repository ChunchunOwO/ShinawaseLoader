const { root, manifest, schema, config, toast } = echoConfigUi;
const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
const knownServers = ['https://echo.shiinasuki.com/echo-together', 'https://47-243-198-176.sslip.io'];
const defaults = {
  serverUrl: knownServers[0],
  displayName: 'ECHO User',
  syncIntervalMs: 250,
  maxMembers: 2,
  opusEnabled: true,
  autoSync: true,
};
const draft = { ...defaults, ...(config && typeof config === 'object' ? config : {}) };
const chinese = String(document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('zh');
const t = (zh, en) => (chinese ? zh : en);
const specOf = (key) => (props[key] && typeof props[key] === 'object' ? props[key] : {});
const normalizeServer = (value) => String(value || '').trim().replace(/\/+$/u, '').replace(/\/v1$/u, '');

root.innerHTML = `
  <style>
    .tg-cfg { display: grid; gap: 16px; font: 13px/1.5 var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif); color: inherit; }
    .tg-cfg-hero { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--theme-accent-bg, rgba(75,85,232,0.1)); border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); }
    .tg-cfg-hero img { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; }
    .tg-cfg-hero strong { display: block; font-size: 14px; }
    .tg-cfg-hero span { display: block; margin-top: 2px; color: var(--theme-muted-text, #6c7179); font-size: 12px; }
    .tg-cfg-note { padding: 10px 12px; border-radius: 10px; font-size: 12px; color: var(--theme-muted-text, #6c7179); background: var(--theme-panel-bg-muted, rgba(127,127,127,0.06)); border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); }
    .tg-cfg-sec { display: grid; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); background: var(--theme-panel-bg, transparent); }
    .tg-cfg-field { display: grid; gap: 6px; }
    .tg-cfg-field label { font-weight: 600; }
    .tg-cfg-field small { color: var(--theme-muted-text, #6c7179); }
    .tg-cfg-field input[type="text"], .tg-cfg-field input[type="number"] {
      width: 100%; min-height: 38px; padding: 8px 11px; box-sizing: border-box;
      border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
      border-radius: 9px; background: var(--theme-field-bg, rgba(255,255,255,0.92));
      color: inherit; font: inherit;
    }
    .tg-cfg-server { display: flex; gap: 8px; }
    .tg-cfg-server input { flex: 1; min-width: 0; }
    .tg-cfg-server button {
      flex: none; min-width: 84px; padding: 0 12px; border-radius: 9px; cursor: pointer;
      border: 1px solid var(--theme-button-border, rgba(38,40,46,0.12));
      background: var(--theme-button-bg, rgba(255,255,255,0.72)); color: inherit; font: inherit;
    }
    .tg-cfg-server button:disabled { opacity: .6; cursor: default; }
    .tg-cfg-ping { font-size: 12px; min-height: 1.4em; }
    .tg-cfg-ping[data-state="ok"] { color: var(--theme-success-text, #1a7f37); }
    .tg-cfg-ping[data-state="error"] { color: var(--theme-danger-text, #c0392b); }
    .tg-cfg-range { display: flex; align-items: center; gap: 10px; }
    .tg-cfg-range input[type="range"] { flex: 1; accent-color: var(--theme-accent, var(--color-accent, #4b55e8)); }
    .tg-cfg-range output { min-width: 4.5em; text-align: right; font-variant-numeric: tabular-nums; color: var(--theme-muted-text, #6c7179); }
    .tg-cfg-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .tg-cfg-switch { position: relative; width: 42px; height: 24px; flex: none; }
    .tg-cfg-switch input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
    .tg-cfg-switch i { display: block; width: 100%; height: 100%; border-radius: 999px; background: var(--theme-field-border, rgba(0,0,0,0.18)); }
    .tg-cfg-switch i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(16,19,24,0.2); }
    .tg-cfg-switch input:checked + i { background: var(--theme-accent, var(--color-accent, #4b55e8)); }
    .tg-cfg-switch input:checked + i::after { transform: translateX(18px); }
  </style>
  <div class="tg-cfg">
    <div class="tg-cfg-hero">
      <img data-icon alt="">
      <div>
        <strong data-name></strong>
        <span data-id></span>
      </div>
    </div>
    <div class="tg-cfg-note" data-note></div>
    <section class="tg-cfg-sec" data-sec="server"></section>
    <section class="tg-cfg-sec" data-sec="sync"></section>
  </div>
`;

root.querySelector('[data-icon]').src = echoConfigUi.assetUrl('icon.svg');
root.querySelector('[data-name]').textContent = manifest.name || 'ECHO Together';
root.querySelector('[data-id]').textContent = manifest.id || echoConfigUi.modId;
root.querySelector('[data-note]').textContent = t(
  '这里保存的是默认值。进入 Together 页并修改房间设置后，页面内的设置（保存在浏览器存储）优先生效。',
  'These are defaults. Once you change room settings inside the Together page, the in-page values (kept in browser storage) take precedence.',
);

const el = (html) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
};

const field = (key, control, extraHint) => {
  const spec = specOf(key);
  const node = el(`<div class="tg-cfg-field"></div>`);
  const title = el(`<label></label>`);
  title.textContent = spec.title || key;
  node.append(title);
  const hintText = extraHint || spec.description;
  if (hintText) {
    const hint = el(`<small></small>`);
    hint.textContent = hintText;
    node.append(hint);
  }
  node.append(control);
  return node;
};

const server = root.querySelector('[data-sec="server"]');
const serverRow = el(`<div class="tg-cfg-server"></div>`);
const serverInput = document.createElement('input');
serverInput.type = 'text';
serverInput.spellcheck = false;
serverInput.setAttribute('list', 'tg-cfg-server-presets');
serverInput.value = String(draft.serverUrl || knownServers[0]);
serverInput.addEventListener('input', () => { draft.serverUrl = serverInput.value; });
const presets = document.createElement('datalist');
presets.id = 'tg-cfg-server-presets';
knownServers.forEach((url) => {
  const option = document.createElement('option');
  option.value = url;
  presets.append(option);
});
const testButton = document.createElement('button');
testButton.type = 'button';
testButton.textContent = t('测试连接', 'Test');
serverRow.append(serverInput, testButton, presets);
const ping = el(`<div class="tg-cfg-ping" data-state=""></div>`);
testButton.addEventListener('click', async () => {
  const base = normalizeServer(serverInput.value);
  if (!base) return;
  testButton.disabled = true;
  ping.dataset.state = '';
  ping.textContent = t('连接中...', 'Connecting...');
  const t0 = Date.now();
  try {
    const response = await fetch(`${base}/v1/health`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`http_${response.status}`);
    ping.dataset.state = 'ok';
    ping.textContent = t(`服务器在线 · ${Date.now() - t0}ms`, `Server online · ${Date.now() - t0}ms`);
  } catch (error) {
    ping.dataset.state = 'error';
    ping.textContent = t('无法连接服务器：', 'Cannot reach server: ') + (error instanceof Error ? error.message : String(error));
  } finally {
    testButton.disabled = false;
  }
});
server.append(field('serverUrl', serverRow), ping);

const nameInput = document.createElement('input');
nameInput.type = 'text';
nameInput.maxLength = 32;
nameInput.value = String(draft.displayName || '');
nameInput.addEventListener('input', () => { draft.displayName = nameInput.value; });
server.append(field('displayName', nameInput));

const membersInput = document.createElement('input');
membersInput.type = 'number';
membersInput.min = '2';
membersInput.max = '8';
membersInput.value = String(Math.max(2, Math.min(8, Math.round(Number(draft.maxMembers) || 2))));
membersInput.addEventListener('input', () => { draft.maxMembers = Number(membersInput.value); });
server.append(field('maxMembers', membersInput));

const sync = root.querySelector('[data-sec="sync"]');
const intervalWrap = el(`<div class="tg-cfg-range"></div>`);
const interval = document.createElement('input');
interval.type = 'range';
interval.min = '100';
interval.max = '5000';
interval.step = '50';
interval.value = String(Math.max(100, Math.min(5000, Math.round(Number(draft.syncIntervalMs) || 250))));
const intervalOut = document.createElement('output');
intervalOut.textContent = `${interval.value} ms`;
interval.addEventListener('input', () => {
  draft.syncIntervalMs = Number(interval.value);
  intervalOut.textContent = `${interval.value} ms`;
});
intervalWrap.append(interval, intervalOut);
sync.append(field('syncIntervalMs', intervalWrap,
  t('数值越小同步越紧，网络请求也越频繁。', 'Lower values sync tighter but poll the server more often.')));

const toggle = (key, extraHint) => {
  const spec = specOf(key);
  const wrap = el(`<div class="tg-cfg-field"></div>`);
  const row = el(`<div class="tg-cfg-row"><div><label></label></div><span class="tg-cfg-switch"><input type="checkbox"><i></i></span></div>`);
  row.querySelector('label').textContent = spec.title || key;
  const input = row.querySelector('input');
  input.checked = draft[key] === true;
  input.addEventListener('change', () => { draft[key] = input.checked; });
  wrap.append(row);
  const hintText = extraHint || spec.description;
  if (hintText) {
    const hint = el(`<small></small>`);
    hint.textContent = hintText;
    wrap.append(hint);
  }
  return wrap;
};

sync.append(toggle('opusEnabled', t('分享本地文件时使用 Opus 压缩以减小体积。', 'Compress shared local files with Opus to reduce upload size.')));
sync.append(toggle('autoSync', t('自动跟随房主的播放进度。', 'Automatically follow the host playback position.')));

echoConfigUi.onSave(() => {
  let serverUrl = normalizeServer(draft.serverUrl) || knownServers[0];
  if (!/^https?:\/\//iu.test(serverUrl)) {
    serverUrl = `https://${serverUrl}`;
    toast(t('已自动补全 https:// 前缀。', 'Added the https:// prefix automatically.'), 'warn');
  }
  return {
    serverUrl,
    displayName: String(draft.displayName || '').replace(/\s+/gu, ' ').trim().slice(0, 32) || 'ECHO User',
    syncIntervalMs: Math.max(100, Math.min(5000, Math.round(Number(draft.syncIntervalMs) || 250))),
    maxMembers: Math.max(2, Math.min(8, Math.round(Number(draft.maxMembers) || 2))),
    opusEnabled: draft.opusEnabled === true,
    autoSync: draft.autoSync === true,
  };
});

return () => { root.replaceChildren(); };
