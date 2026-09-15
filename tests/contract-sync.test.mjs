// Drift alarm: the testing SDK mirrors a small set of loader behaviors in
// ShinawaseLoader/testing/contract.mjs instead of importing ShinawaseLoader.mjs
// (which has import-time side effects). These assertions check that the
// mirrored literals still exist in the loader source, so a loader change that
// invalidates the mirror fails the suite instead of silently desyncing.
// If one of these fails: update testing/contract.mjs (and TESTING.md) to match
// the loader, then update the literal here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_CDP_PORT, DEFAULT_LOADER_PORT, MAX_REQUEST_BYTES, SAFE_ID_SOURCE,
  classifyEchoWindow, settingsStorageKey, wrapEntryExpression,
} from '../ShinawaseLoader/testing/contract.mjs';

const loaderSource = readFileSync(fileURLToPath(new URL('../ShinawaseLoader/ShinawaseLoader.mjs', import.meta.url)), 'utf8');
const loaderUiSource = readFileSync(fileURLToPath(new URL('../ShinawaseLoader/loader-ui.js', import.meta.url)), 'utf8');

test('safeId regex is mirrored verbatim', () => {
  assert.equal(SAFE_ID_SOURCE, '^[a-z0-9][a-z0-9._-]{1,63}$');
  assert.ok(loaderSource.includes('/^[a-z0-9][a-z0-9._-]{1,63}$/iu'), 'loader safeId literal changed');
});

test('entry wrapper shape matches injectIntoTarget', () => {
  assert.ok(loaderSource.includes('async function(echoExternalMod, console)'), 'loader wrapper shape changed');
  assert.ok(wrapEntryExpression('return 1;').startsWith('(async function(echoExternalMod, console)'));
});

test('renderer registry and probe expressions still exist', () => {
  assert.ok(loaderSource.includes('window.__echoExternalMods'), 'injected-mod registry renamed');
  assert.ok(loaderSource.includes("document.querySelector('.app-shell')"), 'readiness selector changed');
  assert.ok(loaderSource.includes('.echo-startup-shell'), 'startup splash selector changed');
  assert.ok(loaderSource.includes("String(value?.signature || '').slice(0, 64)"), 'probe signature shape changed');
});

test('window classification fragments are mirrored', () => {
  for (const fragment of ['[?&]desktopLyrics=1', '[?&]miniPlayer=1', '[?&]taskbarMiniPlayer=1', '[?&]pet=1', 'auxiliary\\.html']) {
    assert.ok(loaderSource.includes(fragment), `classifyEchoWindow fragment missing: ${fragment}`);
  }
  assert.equal(classifyEchoWindow('app://echo/renderer/index.html?miniPlayer=1', ''), 'MiniPlayer');
  assert.equal(classifyEchoWindow('app://echo/renderer/index.html', 'ECHO'), 'Main');
});

test('per-package settings key prefix is mirrored', () => {
  assert.ok(loaderSource.includes("'echo.external-mod.' + id"), 'settings storage key changed');
  assert.equal(settingsStorageKey('a.b'), 'echo.external-mod.a.b');
});

test('asset route shape is mirrored', () => {
  assert.ok(loaderSource.includes("'/api/mod/' + encodeURIComponent(id) + '/file/'"), 'asset route changed');
});

test('HTTP body cap and default ports are mirrored', () => {
  assert.ok(loaderSource.includes('64 * 1024 * 1024'), 'readRequest cap changed');
  assert.equal(MAX_REQUEST_BYTES, 64 * 1024 * 1024);
  assert.ok(loaderSource.includes('17862'), 'default loader port changed');
  assert.equal(DEFAULT_LOADER_PORT, 17862);
  assert.ok(loaderSource.includes('9229'), 'default CDP port changed');
  assert.equal(DEFAULT_CDP_PORT, 9229);
});

test('loader-ui runtime version floor still matches the injection cycle', () => {
  const cycleMatch = loaderSource.match(/uiVersion < (\d+)/u);
  const uiMatch = loaderUiSource.match(/version: (\d+)/u);
  assert.ok(cycleMatch && uiMatch, 'ui version markers missing');
  assert.equal(cycleMatch[1], uiMatch[1], 'loader-ui version and injection floor diverged');
});
