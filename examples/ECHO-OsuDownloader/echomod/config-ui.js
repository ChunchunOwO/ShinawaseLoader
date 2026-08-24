const { root, manifest, schema, config } = echoConfigUi;
const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
const defaults = { locale: 'zh-CN', searchLimit: 20, sidebarOrder: 42 };
const draft = { ...defaults, ...(config && typeof config === 'object' ? config : {}) };
const chinese = String(draft.locale || '').toLowerCase().startsWith('zh');
const t = (zh, en) => (chinese ? zh : en);
const specOf = (key) => (props[key] && typeof props[key] === 'object' ? props[key] : {});

root.innerHTML = `
  <style>
    .osu-cfg { --osu-accent: #ec4899; display: grid; gap: 16px; font: 13px/1.5 var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif); color: inherit; }
    .osu-cfg-hero { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: rgba(236,72,153,0.1); border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); }
    .osu-cfg-hero img { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; }
    .osu-cfg-hero strong { display: block; font-size: 14px; }
    .osu-cfg-hero span { display: block; margin-top: 2px; color: var(--theme-muted-text, #6c7179); font-size: 12px; }
    .osu-cfg-sec { display: grid; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); background: var(--theme-panel-bg, transparent); }
    .osu-cfg-field { display: grid; gap: 6px; }
    .osu-cfg-field label { font-weight: 600; }
    .osu-cfg-field small { color: var(--theme-muted-text, #6c7179); }
    .osu-cfg-field select, .osu-cfg-field input[type="number"] {
      width: 100%; min-height: 38px; padding: 8px 11px; box-sizing: border-box;
      border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
      border-radius: 9px; background: var(--theme-field-bg, rgba(255,255,255,0.92));
      color: inherit; font: inherit;
    }
    .osu-cfg-range { display: flex; align-items: center; gap: 10px; }
    .osu-cfg-range input[type="range"] { flex: 1; accent-color: var(--osu-accent); }
    .osu-cfg-range output { min-width: 3.2em; text-align: right; font-variant-numeric: tabular-nums; color: var(--theme-muted-text, #6c7179); }
  </style>
  <div class="osu-cfg">
    <div class="osu-cfg-hero">
      <img data-icon alt="">
      <div>
        <strong data-name></strong>
        <span data-id></span>
      </div>
    </div>
    <section class="osu-cfg-sec" data-sec="main"></section>
  </div>
`;

root.querySelector('[data-icon]').src = echoConfigUi.assetUrl('icon.svg');
root.querySelector('[data-name]').textContent = manifest.name || 'ECHO osu!downloader';
root.querySelector('[data-id]').textContent = manifest.id || echoConfigUi.modId;

const el = (html) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
};

const field = (key, control, extraHint) => {
  const spec = specOf(key);
  const node = el(`<div class="osu-cfg-field"></div>`);
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

const main = root.querySelector('[data-sec="main"]');

const locale = document.createElement('select');
[{ value: 'zh-CN', label: '中文 (zh-CN)' }, { value: 'en-US', label: 'English (en-US)' }].forEach((item) => {
  const option = document.createElement('option');
  option.value = item.value;
  option.textContent = item.label;
  if (String(draft.locale) === item.value) option.selected = true;
  locale.append(option);
});
locale.addEventListener('change', () => { draft.locale = locale.value; });
main.append(field('locale', locale));

const limitWrap = el(`<div class="osu-cfg-range"></div>`);
const limit = document.createElement('input');
limit.type = 'range';
limit.min = '5';
limit.max = '20';
limit.step = '1';
limit.value = String(Math.max(5, Math.min(20, Math.round(Number(draft.searchLimit) || 20))));
const limitOut = document.createElement('output');
limitOut.textContent = limit.value;
limit.addEventListener('input', () => {
  draft.searchLimit = Number(limit.value);
  limitOut.textContent = limit.value;
});
limitWrap.append(limit, limitOut);
main.append(field('searchLimit', limitWrap));

const order = document.createElement('input');
order.type = 'number';
order.min = '1';
order.max = '99';
order.value = String(Math.max(1, Math.min(99, Math.round(Number(draft.sidebarOrder) || 42))));
order.addEventListener('input', () => { draft.sidebarOrder = Number(order.value); });
main.append(field('sidebarOrder', order, t('数值越小，Loader 侧栏分组中的位置越靠前。重新注入后生效。', 'Lower numbers appear earlier in the loader sidebar group. Applies after re-injection.')));

echoConfigUi.onSave(() => ({
  locale: String(draft.locale) === 'en-US' ? 'en-US' : 'zh-CN',
  searchLimit: Math.max(5, Math.min(20, Math.round(Number(draft.searchLimit) || 20))),
  sidebarOrder: Math.max(1, Math.min(99, Math.round(Number(draft.sidebarOrder) || 42))),
}));

return () => { root.replaceChildren(); };
