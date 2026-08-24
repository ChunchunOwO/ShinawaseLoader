const external = echoExternalMod;
const configured = String(external.config?.locale || 'auto');
const appLanguage = String(document.documentElement.lang || navigator.language || '');
const chinese = configured === 'zh-CN' || (configured !== 'en-US' && appLanguage.toLowerCase().startsWith('zh'));
const copy = chinese
  ? '桌面歌词 / 宠物 / 迷你播放器崩溃修复已生效，可随时在设置中开启这些功能。'
  : 'Desktop lyrics, pet, and mini-player crash fix is active. You can enable these features from settings at any time.';

if (!window.__echoAuxiliaryFixNotified) {
  window.__echoAuxiliaryFixNotified = true;
  try { external.toast?.(copy); } catch {}
}

return () => {};
