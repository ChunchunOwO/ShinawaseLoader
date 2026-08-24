const external = echoExternalMod;
const configured = String(external.config?.locale || 'auto');
const appLanguage = String(document.documentElement.lang || navigator.language || '');
const chinese = configured === 'zh-CN' || (configured !== 'en-US' && appLanguage.toLowerCase().startsWith('zh'));

if (!window.__echoAuxiliaryFixNotified) {
  window.__echoAuxiliaryFixNotified = true;
  (async () => {
    // The loader (>= 1.6.0) installs the auxiliary remap itself, so only an
    // affirmative failure report from this package's main script means the fix
    // is missing. Any transport error (native host off, handler not yet
    // registered) keeps the success notice.
    let failed = false;
    try { failed = (await external.main.invoke('status'))?.result?.ok === false; } catch {}
    const copy = failed
      ? (chinese
        ? '辅助窗口修复未能安装（找不到 auxiliary-remap.cjs），桌面歌词 / 宠物 / 迷你播放器可能仍会崩溃。'
        : 'Auxiliary window fix could not be installed (auxiliary-remap.cjs missing). Desktop lyrics, pet, and mini-player may still crash.')
      : (chinese
        ? '桌面歌词 / 宠物 / 迷你播放器崩溃修复已生效，可随时在设置中开启这些功能。'
        : 'Desktop lyrics, pet, and mini-player crash fix is active. You can enable these features from settings at any time.');
    try { external.toast?.(copy); } catch {}
  })();
}

return () => {};
