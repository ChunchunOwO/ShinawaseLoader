const { root, manifest, schema, config } = echoConfigUi;
const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
const defaults = {
  locale: 'auto',
  widgetWidth: 360,
  alignment: 'right',
  offsetX: 180,
  offsetY: 0,
  monitor: 'primary',
  customHeight: 48,
  showAlbumArt: true,
  showControls: true,
  showProgress: true,
  showTime: false,
  theme: 'auto',
  accentColor: '#4da3ff',
  backgroundOpacity: 88,
  scrollingText: true,
  autoHideWhenStopped: false,
  pollIntervalMs: 1000,
  autoAvoidTray: true,
  seamlessMode: false,
  hoverPreview: true,
};
const draft = { ...defaults, ...(config && typeof config === 'object' ? config : {}) };
const specOf = (key) => props[key] && typeof props[key] === 'object' ? props[key] : {};
const navZh = String(navigator.language || '').toLowerCase().startsWith('zh');
const chinese = draft.locale === 'zh-CN' || (draft.locale !== 'en-US' && navZh);

root.innerHTML = `
  <style>
    .ab-cfg { display: grid; gap: 18px; font: 13px/1.45 var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif); color: inherit; }
    .ab-cfg-hero { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--theme-accent-bg, rgba(77,163,255,0.1)); border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); }
    .ab-cfg-hero img { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; }
    .ab-cfg-hero strong { display: block; font-size: 14px; }
    .ab-cfg-hero span { display: block; margin-top: 2px; color: var(--theme-muted-text, #6c7179); font-size: 12px; }
    .ab-cfg-sec { display: grid; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); background: var(--theme-panel-bg, transparent); }
    .ab-cfg-sec h3 { margin: 0; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--theme-muted-text, #6c7179); }
    .ab-cfg-field { display: grid; gap: 6px; }
    .ab-cfg-field label { font-weight: 600; }
    .ab-cfg-field small { color: var(--theme-muted-text, #6c7179); }
    .ab-cfg-field input[type="number"], .ab-cfg-field input[type="text"], .ab-cfg-field select {
      width: 100%; min-height: 38px; padding: 8px 11px; box-sizing: border-box;
      border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
      border-radius: 9px; background: var(--theme-field-bg, rgba(255,255,255,0.92));
      color: inherit; font: inherit;
    }
    .ab-cfg-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .ab-cfg-switch { position: relative; width: 42px; height: 24px; flex: none; }
    .ab-cfg-switch input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
    .ab-cfg-switch i { display: block; width: 100%; height: 100%; border-radius: 999px; background: var(--theme-field-border, rgba(0,0,0,0.18)); }
    .ab-cfg-switch i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(16,19,24,0.2); }
    .ab-cfg-switch input:checked + i { background: var(--theme-accent, #4da3ff); }
    .ab-cfg-switch input:checked + i::after { transform: translateX(18px); }
    .ab-cfg-color { display: flex; gap: 8px; align-items: center; }
    .ab-cfg-color input[type="color"] { width: 46px; height: 38px; padding: 4px; border-radius: 9px; border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14)); background: var(--theme-field-bg, rgba(255,255,255,0.92)); cursor: pointer; }
    .ab-cfg-range { display: flex; align-items: center; gap: 10px; }
    .ab-cfg-range input[type="range"] { flex: 1; }
    .ab-cfg-range output { min-width: 3.2em; text-align: right; font-variant-numeric: tabular-nums; color: var(--theme-muted-text, #6c7179); }
    .ab-cfg-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
    @media (max-width: 640px) { .ab-cfg-grid { grid-template-columns: 1fr; } }
  </style>
  <div class="ab-cfg">
    <div class="ab-cfg-hero">
      <img data-icon alt="">
      <div>
        <strong data-name></strong>
        <span data-id></span>
      </div>
    </div>
    <section class="ab-cfg-sec" data-sec="layout"></section>
    <section class="ab-cfg-sec" data-sec="look"></section>
    <section class="ab-cfg-sec" data-sec="behavior"></section>
  </div>
`;

const label = (zh, en) => chinese ? `${zh} / ${en}` : `${en} / ${zh}`;
root.querySelector('[data-icon]').src = echoConfigUi.assetUrl('icon.svg');
root.querySelector('[data-name]').textContent = manifest.name || 'ECHO AudioBand';
root.querySelector('[data-id]').textContent = manifest.id || echoConfigUi.modId;

const el = (html) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
};

const field = (key, control) => {
  const spec = specOf(key);
  const node = el(`<div class="ab-cfg-field"></div>`);
  const title = el(`<label></label>`);
  title.textContent = spec.title || key;
  node.append(title);
  if (spec.description) {
    const hint = el(`<small></small>`);
    hint.textContent = spec.description;
    node.append(hint);
  }
  node.append(control);
  return node;
};

const select = (key, options) => {
  const node = document.createElement('select');
  node.dataset.key = key;
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

const number = (key, min, max, step) => {
  const node = document.createElement('input');
  node.type = 'number';
  node.dataset.key = key;
  node.min = String(min);
  node.max = String(max);
  if (step != null) node.step = String(step);
  node.value = String(draft[key] ?? '');
  node.addEventListener('input', () => {
    const n = Number(node.value);
    draft[key] = Number.isFinite(n) ? n : defaults[key];
  });
  return node;
};

const toggle = (key) => {
  const row = el(`<div class="ab-cfg-row"><div><label></label></div><span class="ab-cfg-switch"><input type="checkbox"><i></i></span></div>`);
  row.querySelector('label').textContent = specOf(key).title || key;
  const input = row.querySelector('input');
  input.checked = draft[key] === true;
  input.addEventListener('change', () => { draft[key] = input.checked; });
  const wrap = el(`<div class="ab-cfg-field"></div>`);
  wrap.append(row);
  if (specOf(key).description) {
    const hint = el(`<small></small>`);
    hint.textContent = specOf(key).description;
    wrap.append(hint);
  }
  return wrap;
};

const layout = root.querySelector('[data-sec="layout"]');
layout.append(el(`<h3></h3>`));
layout.querySelector('h3').textContent = label('布局', 'Layout');
layout.append(field('widgetWidth', number('widgetWidth', 200, 800, 1)));
layout.append(field('alignment', select('alignment', [
  { value: 'left', label: label('靠左', 'Left') },
  { value: 'center', label: label('居中', 'Center') },
  { value: 'right', label: label('靠右', 'Right') },
])));
const offsets = el(`<div class="ab-cfg-grid"></div>`);
offsets.append(field('offsetX', number('offsetX', 0, 600, 1)));
offsets.append(field('offsetY', number('offsetY', -80, 80, 1)));
layout.append(offsets);
layout.append(field('monitor', select('monitor', [
  { value: 'primary', label: label('主屏', 'Primary') },
  { value: '0', label: label('显示器 0', 'Display 0') },
  { value: '1', label: label('显示器 1', 'Display 1') },
  { value: '2', label: label('显示器 2', 'Display 2') },
  { value: '3', label: label('显示器 3', 'Display 3') },
])));
layout.append(field('customHeight', number('customHeight', 28, 80, 1)));

const look = root.querySelector('[data-sec="look"]');
look.append(el(`<h3></h3>`));
look.querySelector('h3').textContent = label('外观', 'Appearance');
look.append(field('theme', select('theme', [
  { value: 'auto', label: label('自动', 'Auto') },
  { value: 'dark', label: label('深色', 'Dark') },
  { value: 'light', label: label('浅色', 'Light') },
])));
const colorWrap = el(`<div class="ab-cfg-color"></div>`);
const color = document.createElement('input');
color.type = 'color';
const colorText = document.createElement('input');
colorText.type = 'text';
colorText.spellcheck = false;
const accent = String(draft.accentColor || '#4da3ff');
color.value = /^#[0-9a-f]{6}$/iu.test(accent) ? accent : '#4da3ff';
colorText.value = accent;
color.addEventListener('input', () => { draft.accentColor = color.value; colorText.value = color.value; });
colorText.addEventListener('input', () => {
  draft.accentColor = colorText.value;
  if (/^#[0-9a-f]{6}$/iu.test(colorText.value)) color.value = colorText.value;
});
colorWrap.append(color, colorText);
look.append(field('accentColor', colorWrap));
const rangeWrap = el(`<div class="ab-cfg-range"></div>`);
const range = document.createElement('input');
range.type = 'range';
range.min = '0';
range.max = '100';
range.value = String(draft.backgroundOpacity ?? 88);
const rangeOut = document.createElement('output');
rangeOut.textContent = `${range.value}%`;
range.addEventListener('input', () => {
  draft.backgroundOpacity = Number(range.value);
  rangeOut.textContent = `${range.value}%`;
});
rangeWrap.append(range, rangeOut);
look.append(field('backgroundOpacity', rangeWrap));
['showAlbumArt', 'showControls', 'showProgress', 'showTime', 'scrollingText', 'seamlessMode'].forEach((key) => look.append(toggle(key)));

const behavior = root.querySelector('[data-sec="behavior"]');
behavior.append(el(`<h3></h3>`));
behavior.querySelector('h3').textContent = label('行为', 'Behavior');
behavior.append(field('locale', select('locale', [
  { value: 'auto', label: 'Auto' },
  { value: 'zh-CN', label: '中文 (zh-CN)' },
  { value: 'en-US', label: 'English (en-US)' },
])));
behavior.append(toggle('autoAvoidTray'));
behavior.append(toggle('hoverPreview'));
behavior.append(toggle('autoHideWhenStopped'));
behavior.append(field('pollIntervalMs', number('pollIntervalMs', 250, 5000, 50)));

const readDraft = () => ({
  locale: String(draft.locale || 'auto'),
  widgetWidth: Number(draft.widgetWidth),
  alignment: String(draft.alignment || 'right'),
  offsetX: Number(draft.offsetX),
  offsetY: Number(draft.offsetY),
  monitor: String(draft.monitor || 'primary'),
  customHeight: Number(draft.customHeight),
  showAlbumArt: draft.showAlbumArt === true,
  showControls: draft.showControls === true,
  showProgress: draft.showProgress === true,
  showTime: draft.showTime === true,
  theme: ['auto', 'dark', 'light'].includes(String(draft.theme)) ? String(draft.theme) : 'auto',
  accentColor: String(draft.accentColor || '#4da3ff'),
  backgroundOpacity: Number(draft.backgroundOpacity),
  scrollingText: draft.scrollingText === true,
  autoHideWhenStopped: draft.autoHideWhenStopped === true,
  pollIntervalMs: Number(draft.pollIntervalMs),
  autoAvoidTray: draft.autoAvoidTray === true,
  seamlessMode: draft.seamlessMode === true,
  hoverPreview: draft.hoverPreview === true,
});

echoConfigUi.onSave(() => readDraft());

return () => { root.replaceChildren(); };
