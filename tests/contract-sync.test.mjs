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
  DEFAULT_CDP_PORT, DEFAULT_LOADER_PORT, DEFAULT_UI_SETTINGS, EXTEND_BLOCKED_SEGMENTS,
  ICON_EXTENSIONS, MANIFEST_NAMES, MAX_PACKAGE_BYTES, MAX_REQUEST_BYTES,
  MIN_EXTEND_VERSION, MIN_PLAYER_VERSION, PACKER_MAX_BYTES, PACKER_MAX_FILES, SAFE_ID_SOURCE,
  classifyEchoWindow, settingsStorageKey, wrapEntryExpression,
} from '../ShinawaseLoader/testing/contract.mjs';

const loaderSource = readFileSync(fileURLToPath(new URL('../ShinawaseLoader/ShinawaseLoader.mjs', import.meta.url)), 'utf8');
const loaderUiSource = readFileSync(fileURLToPath(new URL('../ShinawaseLoader/loader-ui.js', import.meta.url)), 'utf8');
const packerSource = readFileSync(fileURLToPath(new URL('../scripts/pack-echomod.mjs', import.meta.url)), 'utf8');

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

test('player/extend runtime version floors are mirrored', () => {
  const playerMatch = loaderSource.match(/playerVersion < (\d+)/u);
  const extendMatch = loaderSource.match(/extendVersion < (\d+)/u);
  assert.ok(playerMatch && extendMatch, 'runtime version floor markers missing');
  assert.equal(Number(playerMatch[1]), MIN_PLAYER_VERSION, 'player runtime floor diverged');
  assert.equal(Number(extendMatch[1]), MIN_EXTEND_VERSION, 'extend runtime floor diverged');
});

test('manifest names are mirrored verbatim', () => {
  assert.ok(loaderSource.includes("const manifestNames = ['echo.mod.json', 'echo.plugin.json', 'manifest.json']"), 'loader manifestNames changed');
  assert.deepEqual(MANIFEST_NAMES, ['echo.mod.json', 'echo.plugin.json', 'manifest.json']);
});

test('package size cap is mirrored', () => {
  assert.ok(loaderSource.includes('const maxPackageBytes = 512 * 1024 * 1024'), 'loader maxPackageBytes changed');
  assert.equal(MAX_PACKAGE_BYTES, 512 * 1024 * 1024);
});

test('packer limits are mirrored', () => {
  assert.ok(packerSource.includes('const maxFiles = 512'), 'packer maxFiles changed');
  assert.equal(PACKER_MAX_FILES, 512);
  assert.ok(packerSource.includes('const maxBytes = 128 * 1024 * 1024'), 'packer maxBytes changed');
  assert.equal(PACKER_MAX_BYTES, 128 * 1024 * 1024);
});

test('icon extensions match the loader iconMime keys', () => {
  const block = loaderSource.match(/const iconMime = new Map\(\[([\s\S]*?)\]\);/u);
  assert.ok(block, 'iconMime block missing');
  const loaderKeys = [...block[1].matchAll(/\['(\.[a-z0-9]+)',/gu)].map((match) => match[1]);
  assert.deepEqual([...ICON_EXTENSIONS].sort(), [...loaderKeys].sort(), 'iconMime keys diverged');
});

test('extend hook blocked segments are mirrored', () => {
  const literal = "new Set(['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'])";
  assert.ok(loaderSource.includes(literal), 'extend blocked set changed');
  assert.deepEqual(
    [...EXTEND_BLOCKED_SEGMENTS].sort(),
    ['__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__', '__proto__', 'constructor', 'prototype'],
  );
});

test('default UI settings keys and defaults are mirrored', () => {
  const block = loaderSource.match(/const defaultUiSettings = Object\.freeze\(\{([\s\S]*?)\}\);/u);
  assert.ok(block, 'defaultUiSettings block missing');
  const loaderKeys = [...block[1].matchAll(/^\s*([A-Za-z0-9_]+):/gmu)].map((match) => match[1]);
  assert.deepEqual(Object.keys(DEFAULT_UI_SETTINGS).sort(), [...loaderKeys].sort(), 'defaultUiSettings keys diverged');
  for (const [key, value] of Object.entries(DEFAULT_UI_SETTINGS)) {
    const literal = typeof value === 'string' ? `'${value}'` : String(value);
    assert.ok(block[1].includes(`${key}: ${literal}`), `defaultUiSettings.${key} default diverged`);
  }
});
