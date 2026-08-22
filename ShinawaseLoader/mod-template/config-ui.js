const { root, manifest, schema, config, save, close, toast, assetUrl } = echoConfigUi;
const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
const draft = { ...config };

const specOf = (key) => props[key] && typeof props[key] === 'object' ? props[key] : {};
const titleOf = (key, fallback) => specOf(key).title || fallback || key;
const descOf = (key) => specOf(key).description || '';

root.innerHTML = `
  <style>
    .echo-cfgex { display: grid; gap: 16px; font: 13px/1.45 var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif); color: inherit; }
    .echo-cfgex-hero {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px; border-radius: 12px;
      background: var(--theme-accent-bg, rgba(75,85,232,0.08));
      border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08));
    }
    .echo-cfgex-hero img { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; }
    .echo-cfgex-hero strong { display: block; font-size: 14px; }
    .echo-cfgex-hero span { display: block; margin-top: 2px; color: var(--theme-muted-text, #6c7179); font-size: 12px; }
    .echo-cfgex-field { display: grid; gap: 6px; }
    .echo-cfgex-field label { font-weight: 600; }
    .echo-cfgex-field small { color: var(--theme-muted-text, #6c7179); }
    .echo-cfgex-field input, .echo-cfgex-field select {
      width: 100%; min-height: 38px; padding: 8px 11px; box-sizing: border-box;
      border: 1px solid var(--theme-field-border, rgba(0,0,0,0.14));
      border-radius: 9px; background: var(--theme-field-bg, rgba(255,255,255,0.92));
      color: inherit; font: inherit;
    }
    .echo-cfgex-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .echo-cfgex-switch { position: relative; width: 42px; height: 24px; flex: none; }
    .echo-cfgex-switch input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
    .echo-cfgex-switch i {
      display: block; width: 100%; height: 100%; border-radius: 999px;
      background: var(--theme-field-border, rgba(0,0,0,0.18));
    }
    .echo-cfgex-switch i::after {
      content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 4px rgba(16,19,24,0.2);
    }
    .echo-cfgex-switch input:checked + i { background: var(--theme-accent, #4b55e8); }
    .echo-cfgex-switch input:checked + i::after { transform: translateX(18px); }
    .echo-cfgex-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
    .echo-cfgex-actions button {
      min-height: 34px; padding: 0 12px; border-radius: 8px; cursor: pointer; font: 600 13px inherit;
      border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.12));
      background: var(--theme-panel-bg, #fff); color: inherit;
    }
    .echo-cfgex-actions [data-save] {
      border-color: transparent; background: var(--theme-accent, #4b55e8); color: #fff;
    }
  </style>
  <div class="echo-cfgex">
    <div class="echo-cfgex-hero">
      <img data-icon alt="">
      <div>
        <strong></strong>
        <span></span>
      </div>
    </div>
    <div class="echo-cfgex-field">
      <div class="echo-cfgex-row">
        <div>
          <label data-enabled-title></label>
          <small data-enabled-desc></small>
        </div>
        <span class="echo-cfgex-switch">
          <input type="checkbox" data-enabled>
          <i></i>
        </span>
      </div>
    </div>
    <div class="echo-cfgex-field">
      <label data-message-title></label>
      <small data-message-desc></small>
      <input data-message type="text">
    </div>
    <div class="echo-cfgex-field">
      <label data-accent-title></label>
      <small data-accent-desc></small>
      <select data-accent></select>
    </div>
    <div class="echo-cfgex-actions">
      <button type="button" data-close></button>
      <button type="button" data-save></button>
    </div>
  </div>
`;

root.querySelector('.echo-cfgex-hero img').src = assetUrl('icon.svg');
root.querySelector('.echo-cfgex-hero strong').textContent = manifest.name || manifest.id || echoConfigUi.modId;
root.querySelector('.echo-cfgex-hero span').textContent = manifest.id || echoConfigUi.modId;
root.querySelector('[data-enabled-title]').textContent = titleOf('enabledFeature', 'Enabled feature');
root.querySelector('[data-enabled-desc]').textContent = descOf('enabledFeature');
root.querySelector('[data-message-title]').textContent = titleOf('message', 'Message');
root.querySelector('[data-message-desc]').textContent = descOf('message');
root.querySelector('[data-accent-title]').textContent = titleOf('accent', 'Accent');
root.querySelector('[data-accent-desc]').textContent = descOf('accent');
root.querySelector('[data-close]').textContent = 'Close';
root.querySelector('[data-save]').textContent = 'Save';

const enabledInput = root.querySelector('[data-enabled]');
const messageInput = root.querySelector('[data-message]');
const accentSelect = root.querySelector('[data-accent]');
enabledInput.checked = draft.enabledFeature === true;
messageInput.value = draft.message == null ? '' : String(draft.message);
const accentValues = Array.isArray(specOf('accent').enum) ? specOf('accent').enum : ['auto', 'violet', 'teal'];
accentValues.forEach((value) => {
  const option = document.createElement('option');
  option.value = String(value);
  option.textContent = String(value);
  if (String(draft.accent ?? specOf('accent').default ?? accentValues[0]) === String(value)) option.selected = true;
  accentSelect.append(option);
});

const readDraft = () => ({
  ...draft,
  enabledFeature: enabledInput.checked,
  message: messageInput.value,
  accent: accentSelect.value,
});

// save() PUTs config and keeps the modal open. close() dismisses it.
root.querySelector('[data-save]').onclick = async () => {
  const saved = await save(readDraft());
  Object.assign(draft, saved);
  toast(manifest.name || echoConfigUi.modId, 'success');
};
root.querySelector('[data-close]').onclick = () => close();

// Optional: echoConfigUi.onSave(() => readDraft()) would show the loader Save button and close after PUT.
// Optional: await echoConfigUi.loadAsset('icon.svg') for packaged text/binary files.

return () => { root.replaceChildren(); };
