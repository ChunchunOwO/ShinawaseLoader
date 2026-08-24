const { root, manifest, schema, config } = echoConfigUi;
const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
const defaults = { bridgeUrl: 'http://127.0.0.1:47668', barCount: 32, applyCssVariables: false, accentColor: '' };
const draft = { ...defaults, ...(config && typeof config === 'object' ? config : {}) };
const chinese = String(document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('zh');
const t = (zh, en) => (chinese ? zh : en);
const specOf = (key) => (props[key] && typeof props[key] === 'object' ? props[key] : {});
const normalizeBase = (value) => String(value || '').trim().replace(/\/+$/u, '');

root.innerHTML = `
  <style>
    .wb-cfg { display: grid; gap: 16px; font: 13px/1.5 var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif); color: inherit; }
    .wb-cfg-hero { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--theme-accent-bg, rgba(75,85,232,0.1)); border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); }
    .wb-cfg-hero img { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; }
    .wb-cfg-hero strong { display: block; font-size: 14px; }
    .wb-cfg-hero span { display: block; margin-top: 2px; color: var(--theme-muted-text, #6c7179); font-size: 12px; }
    .wb-cfg-sec { display: grid; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); background: var(--theme-panel-bg, transparent); }
    .wb-cfg-field { display: grid; gap: 6px; }
    .wb-cfg-field label { font-weight: 600; }
    .wb-cfg-field small { color: var(--theme-muted-text, #6c7179); }
    .wb-cfg-server { display: flex; gap: 8px; }
    .wb-cfg-server input {
      flex: 1; min-width: 0; min-height: 38px; padding: 8px 11px; box-sizing: border-box;
      border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
      border-radius: 9px; background: var(--theme-field-bg, rgba(255,255,255,0.92));
      color: inherit; font: inherit;
    }
    .wb-cfg-server button {
      flex: none; min-width: 84px; padding: 0 12px; border-radius: 9px; cursor: pointer;
      border: 1px solid var(--theme-button-border, rgba(38,40,46,0.12));
      background: var(--theme-button-bg, rgba(255,255,255,0.72)); color: inherit; font: inherit;
    }
    .wb-cfg-server button:disabled { opacity: .6; cursor: default; }
    .wb-cfg-ping { font-size: 12px; min-height: 1.4em; }
    .wb-cfg-ping[data-state="ok"] { color: var(--theme-success-text, #1a7f37); }
    .wb-cfg-ping[data-state="error"] { color: var(--theme-danger-text, #c0392b); }
    .wb-cfg-range { display: flex; align-items: center; gap: 10px; }
    .wb-cfg-range input[type="range"] { flex: 1; accent-color: var(--theme-accent, var(--color-accent, #4b55e8)); }
    .wb-cfg-range output { min-width: 3.2em; text-align: right; font-variant-numeric: tabular-nums; color: var(--theme-muted-text, #6c7179); }
    .wb-cfg-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .wb-cfg-switch { position: relative; width: 42px; height: 24px; flex: none; }
    .wb-cfg-switch input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
    .wb-cfg-switch i { display: block; width: 100%; height: 100%; border-radius: 999px; background: var(--theme-field-border, rgba(0,0,0,0.18)); }
    .wb-cfg-switch i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(16,19,24,0.2); }
    .wb-cfg-switch input:checked + i { background: var(--theme-accent, var(--color-accent, #4b55e8)); }
    .wb-cfg-switch input:checked + i::after { transform: translateX(18px); }
    .wb-cfg-color { display: flex; gap: 8px; align-items: center; }
    .wb-cfg-color input[type="color"] { width: 46px; height: 38px; padding: 4px; border-radius: 9px; border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14)); background: var(--theme-field-bg, rgba(255,255,255,0.92)); cursor: pointer; }
    .wb-cfg-color input[type="text"] { flex: 1; min-width: 0; min-height: 38px; padding: 8px 11px; box-sizing: border-box; border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14)); border-radius: 9px; background: var(--theme-field-bg, rgba(255,255,255,0.92)); color: inherit; font: inherit; }
  </style>
  <div class="wb-cfg">
    <div class="wb-cfg-hero">
      <img data-icon alt="">
      <div>
        <strong data-name></strong>
        <span data-id></span>
      </div>
    </div>
    <section class="wb-cfg-sec" data-sec="bridge"></section>
    <section class="wb-cfg-sec" data-sec="look"></section>
  </div>
`;

root.querySelector('[data-icon]').src = echoConfigUi.assetUrl('icon.svg');
root.querySelector('[data-name]').textContent = manifest.name || 'ECHO Wallpaper Bridge';
root.querySelector('[data-id]').textContent = manifest.id || echoConfigUi.modId;

const el = (html) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
};

const field = (key, control, extraHint) => {
  const spec = specOf(key);
  const node = el(`<div class="wb-cfg-field"></div>`);
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

const bridge = root.querySelector('[data-sec="bridge"]');
const serverRow = el(`<div class="wb-cfg-server"></div>`);
const serverInput = document.createElement('input');
serverInput.type = 'text';
serverInput.spellcheck = false;
serverInput.value = String(draft.bridgeUrl || defaults.bridgeUrl);
serverInput.addEventListener('input', () => { draft.bridgeUrl = serverInput.value; });
const testButton = document.createElement('button');
testButton.type = 'button';
testButton.textContent = t('测试连接', 'Test');
serverRow.append(serverInput, testButton);
const ping = el(`<div class="wb-cfg-ping" data-state=""></div>`);
testButton.addEventListener('click', async () => {
  const base = normalizeBase(serverInput.value) || defaults.bridgeUrl;
  testButton.disabled = true;
  ping.dataset.state = '';
  ping.textContent = t('连接中...', 'Connecting...');
  try {
    const response = await fetch(`${base}/health`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`http_${response.status}`);
    const value = await response.json();
    ping.dataset.state = 'ok';
    ping.textContent = t(
      `桥接在线 · ${Number(value.eventClients) || 0} 个客户端`,
      `Bridge online · ${Number(value.eventClients) || 0} client(s)`,
    );
  } catch (error) {
    ping.dataset.state = 'error';
    ping.textContent = t('无法连接桥接：', 'Cannot reach bridge: ') + (error instanceof Error ? error.message : String(error));
  } finally {
    testButton.disabled = false;
  }
});
bridge.append(field('bridgeUrl', serverRow), ping);

const look = root.querySelector('[data-sec="look"]');
const barsWrap = el(`<div class="wb-cfg-range"></div>`);
const bars = document.createElement('input');
bars.type = 'range';
bars.min = '8';
bars.max = '32';
bars.step = '4';
bars.value = String(Math.max(8, Math.min(32, Math.round(Number(draft.barCount) || 32))));
const barsOut = document.createElement('output');
barsOut.textContent = bars.value;
bars.addEventListener('input', () => {
  draft.barCount = Number(bars.value);
  barsOut.textContent = bars.value;
});
barsWrap.append(bars, barsOut);
look.append(field('barCount', barsWrap));

const colorWrap = el(`<div class="wb-cfg-color"></div>`);
const color = document.createElement('input');
color.type = 'color';
const colorText = document.createElement('input');
colorText.type = 'text';
colorText.spellcheck = false;
colorText.placeholder = t('留空跟随主题', 'Empty follows the theme');
const initial = String(draft.accentColor || '');
color.value = /^#[0-9a-f]{6}$/iu.test(initial) ? initial : '#4b55e8';
colorText.value = initial;
color.addEventListener('input', () => { draft.accentColor = color.value; colorText.value = color.value; });
colorText.addEventListener('input', () => {
  draft.accentColor = colorText.value;
  if (/^#[0-9a-f]{6}$/iu.test(colorText.value)) color.value = colorText.value;
});
colorWrap.append(color, colorText);
look.append(field('accentColor', colorWrap));

const cssVars = el(`<div class="wb-cfg-field"></div>`);
const cssRow = el(`<div class="wb-cfg-row"><div><label></label></div><span class="wb-cfg-switch"><input type="checkbox"><i></i></span></div>`);
cssRow.querySelector('label').textContent = specOf('applyCssVariables').title || 'applyCssVariables';
const cssInput = cssRow.querySelector('input');
cssInput.checked = draft.applyCssVariables === true;
cssInput.addEventListener('change', () => { draft.applyCssVariables = cssInput.checked; });
cssVars.append(cssRow);
if (specOf('applyCssVariables').description) {
  const hint = el(`<small></small>`);
  hint.textContent = specOf('applyCssVariables').description;
  cssVars.append(hint);
}
look.append(cssVars);

echoConfigUi.onSave(() => ({
  bridgeUrl: normalizeBase(draft.bridgeUrl) || defaults.bridgeUrl,
  barCount: Math.max(8, Math.min(32, Math.round(Number(draft.barCount) || 32))),
  applyCssVariables: draft.applyCssVariables === true,
  accentColor: /^#[0-9a-f]{6}$/iu.test(String(draft.accentColor || '')) ? String(draft.accentColor) : '',
}));

return () => { root.replaceChildren(); };
