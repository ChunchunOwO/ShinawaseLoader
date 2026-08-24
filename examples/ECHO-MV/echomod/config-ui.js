const { root, manifest, schema, config } = echoConfigUi;
const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
const defaults = { youtubeApiKey: '', bilibiliCookie: '', debugLog: false };
const draft = { ...defaults, ...(config && typeof config === 'object' ? config : {}) };
const chinese = String(document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('zh');
const t = (zh, en) => (chinese ? zh : en);
const specOf = (key) => (props[key] && typeof props[key] === 'object' ? props[key] : {});

root.innerHTML = `
  <style>
    .mv-cfg { display: grid; gap: 16px; font: 13px/1.5 var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif); color: inherit; }
    .mv-cfg-hero { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--theme-accent-bg, rgba(75,85,232,0.1)); border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); }
    .mv-cfg-hero img { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; }
    .mv-cfg-hero strong { display: block; font-size: 14px; }
    .mv-cfg-hero span { display: block; margin-top: 2px; color: var(--theme-muted-text, #6c7179); font-size: 12px; }
    .mv-cfg-sec { display: grid; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); background: var(--theme-panel-bg, transparent); }
    .mv-cfg-field { display: grid; gap: 6px; }
    .mv-cfg-field label { font-weight: 600; }
    .mv-cfg-field small { color: var(--theme-muted-text, #6c7179); }
    .mv-cfg-secret { display: flex; gap: 8px; }
    .mv-cfg-secret input {
      flex: 1; min-width: 0; min-height: 38px; padding: 8px 11px; box-sizing: border-box;
      border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
      border-radius: 9px; background: var(--theme-field-bg, rgba(255,255,255,0.92));
      color: inherit; font: inherit;
    }
    .mv-cfg-secret button {
      flex: none; min-width: 64px; padding: 0 12px; border-radius: 9px; cursor: pointer;
      border: 1px solid var(--theme-button-border, rgba(38,40,46,0.12));
      background: var(--theme-button-bg, rgba(255,255,255,0.72)); color: inherit; font: inherit;
    }
    .mv-cfg-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .mv-cfg-switch { position: relative; width: 42px; height: 24px; flex: none; }
    .mv-cfg-switch input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
    .mv-cfg-switch i { display: block; width: 100%; height: 100%; border-radius: 999px; background: var(--theme-field-border, rgba(0,0,0,0.18)); }
    .mv-cfg-switch i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(16,19,24,0.2); }
    .mv-cfg-switch input:checked + i { background: var(--theme-accent, var(--color-accent, #4b55e8)); }
    .mv-cfg-switch input:checked + i::after { transform: translateX(18px); }
  </style>
  <div class="mv-cfg">
    <div class="mv-cfg-hero">
      <img data-icon alt="">
      <div>
        <strong data-name></strong>
        <span data-id></span>
      </div>
    </div>
    <section class="mv-cfg-sec" data-sec="keys"></section>
    <section class="mv-cfg-sec" data-sec="debug"></section>
  </div>
`;

root.querySelector('[data-icon]').src = echoConfigUi.assetUrl('icon.svg');
root.querySelector('[data-name]').textContent = manifest.name || 'ECHO MV';
root.querySelector('[data-id]').textContent = manifest.id || echoConfigUi.modId;

const el = (html) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
};

// Secret-style field: masked by default with an explicit reveal toggle,
// mirroring the `secret` setting type of ECHO's built-in plugin settings.
const secretField = (key, placeholder) => {
  const spec = specOf(key);
  const node = el(`<div class="mv-cfg-field"></div>`);
  const title = el(`<label></label>`);
  title.textContent = spec.title || key;
  node.append(title);
  if (spec.description) {
    const hint = el(`<small></small>`);
    hint.textContent = spec.description;
    node.append(hint);
  }
  const row = el(`<div class="mv-cfg-secret"></div>`);
  const input = document.createElement('input');
  input.type = 'password';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = placeholder || '';
  input.value = typeof draft[key] === 'string' ? draft[key] : '';
  input.addEventListener('input', () => { draft[key] = input.value; });
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.textContent = t('显示', 'Show');
  reveal.addEventListener('click', () => {
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    reveal.textContent = hidden ? t('隐藏', 'Hide') : t('显示', 'Show');
  });
  row.append(input, reveal);
  node.append(row);
  return node;
};

const toggle = (key) => {
  const spec = specOf(key);
  const wrap = el(`<div class="mv-cfg-field"></div>`);
  const row = el(`<div class="mv-cfg-row"><div><label></label></div><span class="mv-cfg-switch"><input type="checkbox"><i></i></span></div>`);
  row.querySelector('label').textContent = spec.title || key;
  const input = row.querySelector('input');
  input.checked = draft[key] === true;
  input.addEventListener('change', () => { draft[key] = input.checked; });
  wrap.append(row);
  if (spec.description) {
    const hint = el(`<small></small>`);
    hint.textContent = spec.description;
    wrap.append(hint);
  }
  return wrap;
};

const keys = root.querySelector('[data-sec="keys"]');
keys.append(secretField('youtubeApiKey', 'AIza...'));
keys.append(secretField('bilibiliCookie', 'SESSDATA=...'));

const debug = root.querySelector('[data-sec="debug"]');
debug.append(toggle('debugLog'));

echoConfigUi.onSave(() => ({
  youtubeApiKey: typeof draft.youtubeApiKey === 'string' ? draft.youtubeApiKey.trim() : '',
  bilibiliCookie: typeof draft.bilibiliCookie === 'string' ? draft.bilibiliCookie.trim() : '',
  debugLog: draft.debugLog === true,
}));

return () => { root.replaceChildren(); };
