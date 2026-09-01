const { root, manifest, schema, config, ui, onSave, assetUrl } = echoConfigUi;
const navZh = String(document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('zh');
const locale = String(config?.locale || 'auto');
const chinese = locale === 'zh-CN' || (locale !== 'en-US' && navZh);
const t = (zh, en) => (chinese ? zh : en);

root.innerHTML = `
  <style>
    .slb-cfg { display: grid; gap: 16px; font: 13px/1.5 var(--echo-font-family, Outfit, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif); color: inherit; }
    .slb-cfg-hero { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--theme-accent-bg, rgba(15,118,110,0.12)); border: 1px solid var(--theme-panel-border, rgba(38,40,46,0.08)); }
    .slb-cfg-hero img { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; }
    .slb-cfg-hero strong { display: block; font-size: 14px; }
    .slb-cfg-hero span { display: block; margin-top: 2px; color: var(--theme-muted-text, #6c7179); font-size: 12px; }
    .slb-cfg-warn { padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(180, 83, 9, 0.35); background: rgba(180, 83, 9, 0.1); color: inherit; }
    .slb-cfg-warn strong { display: block; margin-bottom: 4px; }
    .slb-cfg-warn p { margin: 0; color: var(--theme-muted-text, #6c7179); }
  </style>
  <div class="slb-cfg">
    <div class="slb-cfg-hero">
      <img data-icon alt="">
      <div>
        <strong data-name></strong>
        <span data-id></span>
      </div>
    </div>
    <div class="slb-cfg-warn">
      <strong data-warn-title></strong>
      <p data-warn-body></p>
    </div>
    <div data-form></div>
  </div>
`;

root.querySelector('[data-icon]').src = assetUrl('icon.svg');
root.querySelector('[data-name]').textContent = manifest.name || 'ECHO Steam Listen Board';
root.querySelector('[data-id]').textContent = t(
  '官方加载器 Steam 聆听排行榜测试（不随安装器分发）',
  'Official loader Steam leaderboard test (not bundled in setup)',
);
root.querySelector('[data-warn-title]').textContent = t('会写入线上 Steam 排行榜', 'Writes to live Steam leaderboards');
root.querySelector('[data-warn-body]').textContent = t(
  '上传会写到 Steam App 5105150 的官方聆听榜（KeepBest）。请只在授权的加载器测试中使用。必须通过 Mod Loader 启动 ECHO，Steam 快捷方式不会加载 main.cjs。',
  'Uploads write to the official listening boards for Steam app 5105150 (KeepBest). Use only for authorized loader testing. Launch Echo via the Mod Loader; the raw Steam shortcut will not load main.cjs.',
);

let form = null;
if (ui && typeof ui.form === 'function') {
  form = ui.form(schema, config);
  root.querySelector('[data-form]').append(form.element);
} else {
  const fallback = document.createElement('p');
  fallback.style.color = 'var(--theme-muted-text, #6c7179)';
  fallback.textContent = t('当前加载器不支持自定义配置表单，请更新 ShinawaseLoader。', 'This loader build cannot render the schema form. Update ShinawaseLoader.');
  root.querySelector('[data-form]').append(fallback);
}

onSave(() => {
  if (!form) return;
  const next = form.read();
  return next && typeof next === 'object' ? next : { ...config };
});

return () => { root.replaceChildren(); };
