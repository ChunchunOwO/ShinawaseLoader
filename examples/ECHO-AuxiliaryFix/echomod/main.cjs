'use strict';

const activate = (host) => {
  const { BrowserWindow, ipcMain } = host;
  const remap = (window) => {
    if (!window || window.__echoAuxiliaryFix) return;
    window.__echoAuxiliaryFix = true;
    const original = window.loadFile?.bind(window);
    if (original) {
      window.loadFile = (file, options = {}) => {
        const query = options.query || {};
        if ((query.desktopLyrics === '1' || query.pet === '1') && /index\.html$/i.test(String(file))) {
          file = String(file).replace(/index\.html$/i, 'auxiliary.html');
        }
        return original(file, options);
      };
    }
    window.webContents?.on?.('did-finish-load', () => {
      try {
        const href = window.webContents.getURL();
        if (/[?&](desktopLyrics|pet)=1/i.test(href) && /index\.html/i.test(href)) {
          void window.loadURL(href.replace(/index\.html/i, 'auxiliary.html'));
        }
      } catch {}
    });
    window.webContents?.on?.('render-process-gone', () => {
      try { window.destroy(); } catch {}
    });
  };

  for (const window of BrowserWindow?.getAllWindows?.() || []) remap(window);
  host.app?.on?.('browser-window-created', (_event, window) => remap(window));

  if (ipcMain && !ipcMain.listenerCount?.('pet:show')) {
    const missing = ['pet:show', 'pet:hide', 'pet:get-state', 'pet:move-to', 'pet:reset-bounds', 'pet:set-scale'];
    for (const channel of missing) {
      try {
        host.ipc.handle(channel, async () => {
          throw new Error('pet_unavailable_on_steam_build');
        });
      } catch {}
    }
  }

  host.log('INFO', 'auxiliary window guard installed');
  return () => {};
};

module.exports = activate;
exports.activate = activate;
