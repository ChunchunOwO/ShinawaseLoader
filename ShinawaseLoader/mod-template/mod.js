const config = echoExternalMod.config || {};
const manifest = echoExternalMod.manifest || {};

const badge = document.createElement('div');
badge.id = 'echo-sample-mod-badge';
badge.style.cssText = `
  position: fixed; right: 24px; bottom: 24px; z-index: 2147483000;
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 12px;
  background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f1f5f9; font: 600 12px -apple-system, system-ui, sans-serif;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
`;

badge.innerHTML = `
  <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399"></span>
  <span>${config.message || manifest.name || 'External ECHO Mod'}</span>
`;

badge.onmouseenter = () => {
  badge.style.transform = 'translateY(-2px) scale(1.02)';
  badge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
};
badge.onmouseleave = () => {
  badge.style.transform = 'none';
  badge.style.borderColor = 'rgba(255, 255, 255, 0.12)';
};
badge.onclick = () => {
  if (typeof echoExternalMod.toast === 'function') {
    echoExternalMod.toast(`✨ ${manifest.name || 'Mod'} 运行中！当前配置: ${JSON.stringify(config)}`);
  }
};

document.body.append(badge);

const disposeSidebar = echoExternalMod.sidebar?.register({
  id: 'main',
  label: manifest.name || 'External Mod',
  icon: '◆',
  order: 50,
  render(root, context) {
    root.innerHTML = `
      <h2 style="margin:0 0 8px;font:650 18px -apple-system,system-ui,sans-serif">${manifest.name || 'External Mod'}</h2>
      <p style="margin:0 0 16px;color:var(--theme-muted-text,#64748b);font:13px -apple-system,system-ui,sans-serif">${config.message || 'External Mod page'}</p>
      <button type="button" style="padding:7px 12px;border:0;border-radius:6px;background:var(--theme-accent-solid-bg,#4b55e8);color:#fff;cursor:pointer">Test notification</button>
    `;
    root.querySelector('button').onclick = () => context.toast(manifest.name || 'External Mod');
  },
});

return () => {
  disposeSidebar?.();
  badge.remove();
};
