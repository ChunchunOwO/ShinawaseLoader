// Regression: the preload bridge used to anchor on `const echoApi = {` plus the
// first key inside it. ECHO 26.10.3 inserted `quickSearch` as the new first key,
// the anchor stopped matching, runtime sync silently produced an unpatched
// isolated runtime ("copied-unpatched") and the installer aborted at 70%.
// Fixtures are synthetic stand-ins for the observed build shapes, not ECHO code.

import test from 'node:test';
import assert from 'node:assert/strict';
import { patchPreload } from '../ShinawaseLoader/echo-asar.mjs';

const SHINAWASE_KEYS = ['streaming', 'downloads', 'qobuz', 'accounts'];

// The bridge is prepended after the first line, so every fixture starts with a
// banner line the patcher keeps on top.
const preload = (body) => `// preload entry\n${body}\n`;

const stubShape = preload([
  'contextBridge.exposeInMainWorld("echo", {',
  '  streaming: null,',
  '  downloads: null,',
  '  accounts: null,',
  '  listening: createListeningApi(ipcRenderer),',
  '});',
].join('\n'));

const echoApi26102 = preload([
  '  const echoApi = {',
  '    listening: createListeningApi(ipcRenderer),',
  '    app: createAppApi(ipcRenderer, IpcChannels, process.platform),',
  '  };',
  'contextBridge.exposeInMainWorld("echo", echoApi);',
].join('\n'));

const echoApi26103 = preload([
  '  const echoApi = {',
  '    quickSearch: createQuickSearchApi(ipcRenderer),',
  '    listening: createListeningApi(ipcRenderer),',
  '    ...createDistributionPlatformApi(ipcRenderer, IpcChannels, webUtils),',
  '  };',
  'contextBridge.exposeInMainWorld("echo", echoApi);',
].join('\n'));

const injectedKeys = (text) => SHINAWASE_KEYS
  .filter((key) => text.includes(`${key}: createShinawase`));

test('26.9.16+ echoApi shape patches even when ECHO adds a key before listening', () => {
  const patched = patchPreload(echoApi26103);
  assert.deepEqual(injectedKeys(patched), SHINAWASE_KEYS);
  assert.ok(!patched.includes('asar_preload_entry_missing'), 'anchor kept on 26.10.3');
});

test('the 26.10.2 shape still patches', () => {
  const patched = patchPreload(echoApi26102);
  assert.deepEqual(injectedKeys(patched), SHINAWASE_KEYS);
});

test('injected keys land inside the echoApi literal and keep ECHO keys', () => {
  const patched = patchPreload(echoApi26103);
  const open = patched.indexOf('const echoApi = {');
  const close = patched.indexOf('};', open);
  const firstInjected = patched.indexOf('streaming: createShinawase');
  assert.ok(firstInjected > open && firstInjected < close, 'insertion is inside the object');
  for (const key of ['quickSearch: createQuickSearchApi', 'listening: createListeningApi', '...createDistributionPlatformApi']) {
    assert.ok(patched.includes(key), `ECHO key preserved: ${key}`);
  }
});

test('insertion follows the indentation of the declaration line', () => {
  const deeper = preload(['    const echoApi = {', '      listening: createListeningApi(ipcRenderer),', '    };'].join('\n'));
  const patched = patchPreload(deeper);
  assert.ok(patched.includes('\n      streaming: createShinawase'), 'uses six spaces under a four-space declaration');
  assert.ok(!patched.includes('\n  streaming: createShinawase'), 'does not assume two-space output');
});

test('the pre-26.9.16 stub triple keeps patching', () => {
  const patched = patchPreload(stubShape);
  assert.deepEqual(injectedKeys(patched), SHINAWASE_KEYS);
  assert.ok(!patched.includes('streaming: null,'), 'stubs replaced');
});

test('patching twice is a no-op', () => {
  const once = patchPreload(echoApi26103);
  assert.equal(patchPreload(once), once);
});

test('a preload with no known insertion point still fails loudly', () => {
  const foreign = preload('contextBridge.exposeInMainWorld("echo", { app: createAppApi(ipcRenderer) });');
  assert.throws(() => patchPreload(foreign), /asar_preload_entry_missing:streaming/u);
});
