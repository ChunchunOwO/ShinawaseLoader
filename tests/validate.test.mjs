// Static validation rules (mirroring importPackage/injectionPlan/safeId).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkEntrySyntax, validateManifest } from '../ShinawaseLoader/testing/validate.mjs';

const fixture = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'shinawase-validate-'));
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(dir, name);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
  return dir;
};

test('valid minimal mod passes', (t) => {
  const dir = fixture({
    'echo.mod.json': { id: 'test.valid', name: 'Valid', version: '1.0.0', entry: 'mod.js' },
    'mod.js': 'return () => {};',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = validateManifest(dir);
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'mod');
  assert.equal(result.entry, 'mod.js');
});

test('invalid id fails with the safeId rule', (t) => {
  const dir = fixture({ 'echo.mod.json': { id: 'bad id!', entry: 'mod.js' }, 'mod.js': '' });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = validateManifest(dir);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'id_invalid'));
});

test('missing entry fails unless the package declares main/native', (t) => {
  const missing = fixture({ 'echo.mod.json': { id: 'test.noentry', entry: 'mod.js' } });
  t.after(() => rmSync(missing, { recursive: true, force: true }));
  const failed = validateManifest(missing);
  assert.ok(failed.errors.some((entry) => entry.code === 'entry_missing'));

  const nativeOnly = fixture({ 'echo.mod.json': { id: 'test.native', entry: 'mod.js', main: 'main.cjs' }, 'main.cjs': '' });
  t.after(() => rmSync(nativeOnly, { recursive: true, force: true }));
  const passed = validateManifest(nativeOnly);
  assert.equal(passed.ok, true);
  assert.ok(passed.notices.some((entry) => entry.code === 'native_only_entry'));
});

test('path traversal in manifest fields is rejected', (t) => {
  const dir = fixture({ 'echo.mod.json': { id: 'test.traversal', entry: '../evil.js' } });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = validateManifest(dir);
  assert.ok(result.errors.some((entry) => entry.code === 'entry_path_invalid'));
});

test('declared-but-missing config warns; broken schema JSON errors', (t) => {
  const dir = fixture({
    'echo.mod.json': { id: 'test.cfg', entry: 'mod.js', config: 'config.json', configSchema: 'schema.json' },
    'mod.js': '',
    'schema.json': '{ broken',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = validateManifest(dir);
  assert.ok(result.warnings.some((entry) => entry.code === 'config_missing'));
  assert.ok(result.errors.some((entry) => entry.code === 'schema_invalid_json'));
});

test('official sandboxed plugin manifests are flagged, not executed', (t) => {
  const dir = fixture({
    'echo.plugin.json': { id: 'test.sandboxed', apiVersion: 1, permissions: ['net'], entry: 'plugin.js' },
    'plugin.js': '',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = validateManifest(dir);
  assert.ok(result.notices.some((entry) => entry.code === 'official_sandboxed_plugin'));
});

test('entry syntax: loader wrapper accepts top-level return/await, rejects invalid code', () => {
  assert.equal(checkEntrySyntax('const x = await Promise.resolve(1);\nreturn () => x;').ok, true);
  assert.equal(checkEntrySyntax('return () => {').ok, false);
  assert.equal(checkEntrySyntax('body { color: red; }', { entryType: 'css' }).ok, true, 'css entries are wrapped, not parsed');
  assert.equal(checkEntrySyntax('const { root } = echoConfigUi;\nreturn () => {};', { wrapper: 'configUi' }).ok, true);
});
