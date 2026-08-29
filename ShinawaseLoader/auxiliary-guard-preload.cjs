'use strict';

// Fallback preload that injects auxiliary-page-boot.js into aux windows
// (DesktopLyrics / MiniPlayer / Pet / TaskbarMiniPlayer). Not used for Main,
// Cli, or DevConsole.

try {
  const { webFrame } = require('electron');
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const boot = readFileSync(join(__dirname, 'auxiliary-page-boot.js'), 'utf8');
  webFrame.executeJavaScript(boot, true).catch(() => undefined);
} catch {}
