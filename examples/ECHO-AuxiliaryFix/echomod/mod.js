const external = echoExternalMod;
const chinese = String(external.config?.locale || document.documentElement.lang || '').toLowerCase().startsWith('zh');
const copy = chinese
  ? '桌面歌词 / 宠物窗口保护已启用。请重新打开一次桌面歌词或宠物。'
  : 'Desktop lyrics and pet window protection is on. Open desktop lyrics or the pet again.';

if (!window.__echoAuxiliaryFixNotified) {
  window.__echoAuxiliaryFixNotified = true;
  try { external.toast?.(copy); } catch {}
}

return () => {};
