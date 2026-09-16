// Package archive acceptance rules (AGENTS.md validation strategy #3): valid
// ZIP and JSON packages pass, while missing entries, unsafe paths, and
// duplicates fail. Archives are built with the same echomod-archive module
// the packer uses; everything stays in the OS temp directory.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createZip } from '../ShinawaseLoader/echomod-archive.mjs';
import { validatePackageArchive } from '../ShinawaseLoader/testing/validate.mjs';

const temp = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'shinawase-archive-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

const zipArchive = (t, entries) => {
  const file = join(temp(t), 'package.echomod');
  writeFileSync(file, createZip(entries.map((entry) => ({ path: entry.path, data: Buffer.from(entry.content ?? '') }))));
  return file;
};

const manifestJson = (extra = {}) => JSON.stringify({ id: 'test.archive', name: 'Archive', version: '1.0.0', entry: 'mod.js', ...extra });

test('valid ZIP archive passes', (t) => {
  const file = zipArchive(t, [
    { path: 'echo.mod.json', content: manifestJson() },
    { path: 'mod.js', content: 'return () => {};' },
    { path: 'assets/icon.svg', content: '<svg/>' },
  ]);
  const result = validatePackageArchive(file);
  assert.equal(result.ok, true);
  assert.equal(result.type, 'echo-external-mod');
  assert.equal(result.fileCount, 2);
});

test('missing entry in a ZIP archive fails', (t) => {
  const file = zipArchive(t, [
    { path: 'echo.mod.json', content: manifestJson() },
    { path: 'other.js', content: '' },
  ]);
  const result = validatePackageArchive(file);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'entry_missing'));
});

test('unsafe paths and case-insensitive duplicates fail', (t) => {
  const traversal = validatePackageArchive(zipArchive(t, [
    { path: 'echo.mod.json', content: manifestJson() },
    { path: 'mod.js', content: '' },
    { path: '../evil.js', content: '' },
  ]));
  assert.ok(traversal.errors.some((entry) => entry.code === 'file_path_invalid'));

  const duplicate = validatePackageArchive(zipArchive(t, [
    { path: 'echo.mod.json', content: manifestJson() },
    { path: 'mod.js', content: '' },
    { path: 'MOD.JS', content: '' },
  ]));
  assert.ok(duplicate.errors.some((entry) => entry.code === 'file_duplicate'));
  assert.equal(duplicate.errors.filter((entry) => entry.code === 'file_duplicate').length, 1, 'collision reported once');
});

// Regression: a case-variant second manifest slipped past the duplicate check
// (only the selected manifest path was excluded from the file list), letting
// a Windows import overwrite the manifest the loader just wrote.
test('case-variant duplicate manifests fail', (t) => {
  const result = validatePackageArchive(zipArchive(t, [
    { path: 'echo.mod.json', content: manifestJson() },
    { path: 'ECHO.MOD.JSON', content: manifestJson({ version: '9.9.9' }) },
    { path: 'mod.js', content: '' },
  ]));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'file_duplicate'));
});

// Regression: JSON `null` payloads/manifests crashed with a TypeError instead
// of returning a structured validation result.
test('null archive payloads and manifests fail as validation errors', (t) => {
  const dir = temp(t);
  const nullPayload = join(dir, 'null-payload.echomod');
  writeFileSync(nullPayload, 'null');
  const payloadResult = validatePackageArchive(nullPayload);
  assert.equal(payloadResult.ok, false);
  assert.ok(payloadResult.errors.some((entry) => entry.code === 'payload_not_object'));

  const nullManifest = validatePackageArchive(zipArchive(t, [
    { path: 'echo.mod.json', content: 'null' },
    { path: 'mod.js', content: '' },
  ]));
  assert.equal(nullManifest.ok, false);
  assert.ok(nullManifest.errors.some((entry) => entry.code === 'manifest_not_object'));

  const nonObjectManifest = join(dir, 'bad-manifest.echomod');
  writeFileSync(nonObjectManifest, JSON.stringify({ type: 'echo-external-mod', manifest: [], files: [] }));
  assert.ok(validatePackageArchive(nonObjectManifest).errors.some((entry) => entry.code === 'manifest_not_object'));
});

test('valid JSON payload passes; unknown type and bad id fail', (t) => {
  const dir = temp(t);
  const good = join(dir, 'good.echomod');
  writeFileSync(good, JSON.stringify({
    type: 'echo-external-mod', version: 1,
    manifest: { id: 'test.json-payload', entry: 'mod.js' },
    files: [{ path: 'mod.js', content: 'return () => {};' }],
  }));
  assert.equal(validatePackageArchive(good).ok, true);

  const badType = join(dir, 'bad-type.echomod');
  writeFileSync(badType, JSON.stringify({ type: 'not-a-package', manifest: { id: 'x.y' }, files: [] }));
  assert.ok(validatePackageArchive(badType).errors.some((entry) => entry.code === 'type_unknown'));

  const badId = join(dir, 'bad-id.echomod');
  writeFileSync(badId, JSON.stringify({ type: 'echo-external-mod', manifest: { id: 'bad id' }, files: [{ path: 'mod.js', content: '' }] }));
  assert.ok(validatePackageArchive(badId).errors.some((entry) => entry.code === 'id_invalid'));
});

test('shipped example packages still satisfy the import rules', () => {
  for (const name of ['ECHO-MV.echomod', 'ECHO-Streaming.echomod']) {
    const result = validatePackageArchive(fileURLToPath(new URL(`../examples/packages/${name}`, import.meta.url)));
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result.errors)}`);
  }
});
