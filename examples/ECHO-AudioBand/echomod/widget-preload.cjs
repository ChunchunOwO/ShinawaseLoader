'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('audioband', {
  ready: () => ipcRenderer.send('echo.audioband:ready'),
  command: (payload) => ipcRenderer.invoke('echo.audioband:command', payload),
  preview: (show) => ipcRenderer.send('echo.audioband:preview', { show: Boolean(show) }),
  onStatus: (fn) => { ipcRenderer.on('echo.audioband:status', (_e, p) => fn(p)); },
  onConfig: (fn) => { ipcRenderer.on('echo.audioband:config', (_e, p) => fn(p)); },
});
