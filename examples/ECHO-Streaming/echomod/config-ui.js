const { root, manifest, schema, config } = echoConfigUi;
const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
const defaults = {
  locale: 'zh-CN',
  defaultProvider: 'netease',
  defaultQuality: 'lossless',
  pageSize: 30,
  hideUnavailable: false,
  showDisabledProviders: true,
};
const draft = { ...defaults, ...(config && typeof config === 'object' ? config : {}) };
const chinese = String(draft.locale || '').toLowerCase().startsWith('zh');
const t = (zh, en) => (chinese ? zh : en);
const specOf = (key) => (props[key] && typeof props[key] === 'object' ? props[key] : {});

const providers = [
  { value: 'netease', label: t('网易云音乐', 'NetEase Cloud Music') },
  { value: 'qqmusic', label: t('QQ 音乐', 'QQ Music') },
  { value: 'soundcloud', label: 'SoundCloud' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'spotify', label: 'Spotify' },
  { value: 'tidal', label: 'TIDAL' },
  { value: 'qobuz', label: 'Qobuz' },
  { value: 'bilibili', label: 'Bilibili' },
];
const qualities = [
  { value: 'lossless', label: t('无损（优先 FLAC）', 'Lossless (prefer FLAC)') },
  { value: 'high', label: t('高音质（优先 320kbps）', 'High (prefer 320kbps)') },
  { value: 'standard', label: t('标准（优先兼容性）', 'Standard (prefer compatibility)') },
  { value: 'hires', label: t('Hi-Res（平台支持时）', 'Hi-Res (when supported)') },
];

root.innerHTML = `
  <style>
    .st-cfg { display: grid; gap: 16px; font: 13px/1.5 var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif); color: inherit; }
    .st-cfg-hero { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--theme-accent-bg, rgba(75,85,232,0.1)); border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); }
    .st-cfg-hero img { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; }
    .st-cfg-hero strong { display: block; font-size: 14px; }
    .st-cfg-hero span { display: block; margin-top: 2px; color: var(--theme-muted-text, #6c7179); font-size: 12px; }
    .st-cfg-sec { display: grid; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); background: var(--theme-panel-bg, transparent); }
    .st-cfg-field { display: grid; gap: 6px; }
    .st-cfg-field label { font-weight: 600; }
    .st-cfg-field small { color: var(--theme-muted-text, #6c7179); }
    .st-cfg-field select {
      width: 100%; min-height: 38px; padding: 8px 11px; box-sizing: border-box;
      border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
      border-radius: 9px; background: var(--theme-field-bg, rgba(255,255,255,0.92));
      color: inherit; font: inherit;
    }
    .st-cfg-range { display: flex; align-items: center; gap: 10px; }
    .st-cfg-range input[type="range"] { flex: 1; accent-color: var(--theme-accent, var(--color-accent, #4b55e8)); }
    .st-cfg-range output { min-width: 3.2em; text-align: right; font-variant-numeric: tabular-nums; color: var(--theme-muted-text, #6c7179); }
    .st-cfg-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .st-cfg-switch { position: relative; width: 42px; height: 24px; flex: none; }
    .st-cfg-switch input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
    .st-cfg-switch i { display: block; width: 100%; height: 100%; border-radius: 999px; background: var(--theme-field-border, rgba(0,0,0,0.18)); }
    .st-cfg-switch i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(16,19,24,0.2); }
    .st-cfg-switch input:checked + i { background: var(--theme-accent, var(--color-accent, #4b55e8)); }
    .st-cfg-switch input:checked + i::after { transform: translateX(18px); }
  </style>
  <div class="st-cfg">
    <div class="st-cfg-hero">
      <img data-icon alt="">
      <div>
        <strong data-name></strong>
        <span data-id></span>
      </div>
    </div>
    <section class="st-cfg-sec" data-sec="search"></section>
    <section class="st-cfg-sec" data-sec="display"></section>
  </div>
`;

root.querySelector('[data-icon]').src = echoConfigUi.assetUrl('icon.svg');
root.querySelector('[data-name]').textContent = manifest.name || 'ECHO Streaming';
root.querySelector('[data-id]').textContent = manifest.id || echoConfigUi.modId;

const el = (html) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
};

const field = (key, control, extraHint) => {
  const spec = specOf(key);
  const node = el(`<div class="st-cfg-field"></div>`);
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

const select = (key, options) => {
  const node = document.createElement('select');
  options.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    if (String(draft[key]) === String(item.value)) option.selected = true;
    node.append(option);
  });
  node.addEventListener('change', () => { draft[key] = node.value; });
  return node;
};

const range = (key, min, max, step) => {
  const wrap = el(`<div class="st-cfg-range"></div>`);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step || 1);
  input.value = String(Math.max(min, Math.min(max, Number(draft[key]) || min)));
  const out = document.createElement('output');
  out.textContent = input.value;
  input.addEventListener('input', () => {
    draft[key] = Number(input.value);
    out.textContent = input.value;
  });
  wrap.append(input, out);
  return wrap;
};

const toggle = (key, extraHint) => {
  const spec = specOf(key);
  const wrap = el(`<div class="st-cfg-field"></div>`);
  const row = el(`<div class="st-cfg-row"><div><label></label></div><span class="st-cfg-switch"><input type="checkbox"><i></i></span></div>`);
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

const search = root.querySelector('[data-sec="search"]');
search.append(field('locale', select('locale', [
  { value: 'zh-CN', label: '中文 (zh-CN)' },
  { value: 'en-US', label: 'English (en-US)' },
])));
search.append(field('defaultProvider', select('defaultProvider', providers),
  t('首次打开流媒体页时的默认平台。', 'Platform selected when the streaming page first opens.')));
search.append(field('defaultQuality', select('defaultQuality', qualities)));
search.append(field('pageSize', range('pageSize', 10, 50, 5),
  t('单次搜索返回的结果数量。', 'Number of results fetched per search page.')));

const display = root.querySelector('[data-sec="display"]');
display.append(toggle('hideUnavailable',
  t('隐藏当前不可播放的歌曲行。重新注入后生效。', 'Hide track rows that are currently unplayable. Applies after re-injection.')));
display.append(toggle('showDisabledProviders',
  t('在平台栏中显示已被禁用的平台。', 'Keep disabled platforms visible in the provider rail.')));

echoConfigUi.onSave(() => ({
  locale: String(draft.locale) === 'en-US' ? 'en-US' : 'zh-CN',
  defaultProvider: providers.some((item) => item.value === draft.defaultProvider) ? String(draft.defaultProvider) : 'netease',
  defaultQuality: qualities.some((item) => item.value === draft.defaultQuality) ? String(draft.defaultQuality) : 'lossless',
  pageSize: Math.max(10, Math.min(50, Math.round(Number(draft.pageSize) || 30))),
  hideUnavailable: draft.hideUnavailable === true,
  showDisabledProviders: draft.showDisabledProviders === true,
}));

return () => { root.replaceChildren(); };
