// The shipped templates are the canonical harness examples: real manifests,
// real entries, full lifecycle (inject -> interact -> dispose -> audit).
// Mod authors copy this pattern; keep tests outside the package directory
// (this file lives in tests/, not inside the template).

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHarness } from '../ShinawaseLoader/testing/harness.mjs';
import { validateManifest } from '../ShinawaseLoader/testing/validate.mjs';

const templateDir = (name) => fileURLToPath(new URL(`../ShinawaseLoader/${name}`, import.meta.url));

test('mod-template: validate, inject, badge, sidebar page, settings watch, clean dispose', async () => {
  const packageDir = templateDir('mod-template');
  assert.equal(validateManifest(packageDir).ok, true);

  const harness = createHarness({ packageDir, config: { message: 'Hello harness' } });
  assert.equal((await harness.inject()).status, 'injected');

  const badge = harness.query('#echo-sample-mod-badge');
  assert.ok(badge, 'badge mounted');
  assert.ok(badge.textContent.includes('Hello harness'));

  badge.click();
  assert.equal(harness.toasts.length, 1, 'badge click toasts');

  const page = harness.openSidebarPage('main');
  assert.ok(page.root.querySelector('h2'));
  page.root.querySelector('button').click();
  assert.equal(harness.toasts.length, 2, 'page button toasts');
  page.close();

  await harness.controls.emitUiSettings({ accentColor: '#22c55e' });
  assert.equal(badge.style.outline, '1px solid #22c55e', 'loaderSettings.onChange applied');

  harness.dispose();
  harness.expectClean();
  assert.equal(harness.query('#echo-sample-mod-badge'), null, 'badge removed on dispose');
});

test('mod-template: custom config UI script works under echoConfigUi', async () => {
  const harness = createHarness({ packageDir: templateDir('mod-template'), config: { message: 'before' } });
  const ui = await harness.openConfigUi();
  assert.ok(ui.root.childNodes.length > 0, 'config UI rendered');
  const saved = await ui.submit();
  assert.ok(saved && typeof saved === 'object', 'onSave returned a config object');
  assert.equal(ui.state.saved.length, 1, 'save recorded');
  assert.equal(ui.state.closed, true);
  ui.close();
  harness.dispose();
});

test('plugin-template: inject, page render with echo access, clean dispose', async () => {
  const packageDir = templateDir('plugin-template');
  assert.equal(validateManifest(packageDir).ok, true);
  const harness = createHarness({ packageDir, config: { message: 'Plugin says hi' } });
  assert.equal((await harness.inject()).status, 'injected');
  const page = harness.openSidebarPage();
  assert.ok(page.root.querySelector('h2').textContent.includes('Example ECHO Plugin'));
  assert.ok(page.root.querySelector('p').textContent.includes('Plugin says hi'));
  const echoCalls = harness.records.filter((record) => record.api === 'echo' && record.method === 'playback.getStatus');
  assert.equal(echoCalls.length, 1, 'render touched playback.getStatus through the recorded echo proxy');
  page.close();
  harness.dispose();
  harness.expectClean();
});
