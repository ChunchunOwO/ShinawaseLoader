// Custom config page for the Mods-page Config button.
// Runs with `echoConfigUi`; see SDK.md ("Custom config UI").
const { root, manifest, schema, config, save, close, toast, assetUrl, ui, defaults, onSave } = echoConfigUi;

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
    .echo-cfgex-actions { display: flex; justify-content: flex-end; }
    .echo-cfgex-actions button {
      min-height: 30px; padding: 0 10px; border-radius: 8px; cursor: pointer; font: 600 12px inherit;
      border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.12));
      background: var(--theme-panel-bg, #fff); color: var(--theme-muted-text, #6c7179);
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
    <div data-form></div>
    <div data-extra></div>
    <div class="echo-cfgex-actions">
      <button type="button" data-reset>Reset to defaults</button>
    </div>
  </div>
`;
root.querySelector('[data-icon]').src = assetUrl('icon.svg');
root.querySelector('.echo-cfgex-hero strong').textContent = manifest.name || manifest.id || echoConfigUi.modId;
root.querySelector('.echo-cfgex-hero span').textContent = manifest.id || echoConfigUi.modId;

// 1. `ui.form()` renders the loader's schema auto-form (switches, enum menus,
//    numeric limits, JSON fallback) for `config.schema.json` + the current config.
let form = ui.form(schema, config);
root.querySelector('[data-form]').append(form.element);

// 2. `ui.field()` renders one extra loader-styled field the schema does not declare.
const nickname = ui.field('nickname', {
  type: 'string',
  title: 'Nickname',
  description: 'Extra field stored next to the schema values.',
}, config.nickname);
root.querySelector('[data-extra]').append(nickname.element);

// 3. `defaults()` builds a config object from the schema `default` values.
root.querySelector('[data-reset]').onclick = () => {
  const fresh = ui.form(schema, { ...config, ...defaults() });
  form.element.replaceWith(fresh.element);
  form = fresh;
  toast('Defaults restored (not saved yet)', 'info');
};

// 4. `onSave` shows the loader Save button; the returned object is PUT, then the modal closes.
onSave(() => ({ ...config, ...form.read(), nickname: nickname.read() }));

// Alternative: call `save(next)` yourself to PUT without closing, and `close()` to dismiss.
return () => { root.replaceChildren(); };
