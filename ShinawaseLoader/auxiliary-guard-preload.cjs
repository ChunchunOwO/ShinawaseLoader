'use strict';

try {
  const { webFrame } = require('electron');
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const boot = readFileSync(join(__dirname, 'auxiliary-page-boot.js'), 'utf8');
  webFrame.executeJavaScript(boot, true).catch(() => undefined);
} catch {}
