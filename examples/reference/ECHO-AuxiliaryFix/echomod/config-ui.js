// Minimal custom config page example: one select, saved through the loader footer button.
const { root, schema, config } = echoConfigUi;
const spec = schema?.properties?.locale || {};
const current = ['auto', 'zh-CN', 'en-US'].includes(String(config.locale)) ? String(config.locale) : 'auto';
const chinese = String(document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('zh');

root.innerHTML = `
  <style>
    .aux-cfg { display: grid; gap: 8px; font: 13px/1.5 var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif); color: inherit; }
    .aux-cfg label { font-weight: 600; }
    .aux-cfg small { color: var(--theme-muted-text, #6c7179); }
    .aux-cfg select {
      width: 100%; min-height: 38px; padding: 8px 11px; box-sizing: border-box;
      border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
      border-radius: 9px; background: var(--theme-field-bg, rgba(255,255,255,0.92));
      color: inherit; font: inherit;
    }
  </style>
  <div class="aux-cfg">
    <label data-title></label>
    <small data-hint></small>
    <select data-locale>
      <option value="auto"></option>
      <option value="zh-CN">中文 (zh-CN)</option>
      <option value="en-US">English (en-US)</option>
    </select>
  </div>
`;

root.querySelector('[data-title]').textContent = spec.title || (chinese ? '提示语言' : 'Notice language');
root.querySelector('[data-hint]').textContent = spec.description || '';
root.querySelector('option[value="auto"]').textContent = chinese ? '自动（跟随 ECHO）' : 'Auto (follow ECHO)';
const select = root.querySelector('[data-locale]');
select.value = current;

echoConfigUi.onSave(() => ({ locale: select.value }));

return () => { root.replaceChildren(); };
