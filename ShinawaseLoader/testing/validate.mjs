// Shinawase Testing SDK - static validation for packages.
//
// Rules mirror ShinawaseLoader.mjs (importPackage, injectionPlan, safeId,
// safeRelative) and scripts/pack-echomod.mjs limits, so packages that pass
// here are accepted by the loader for the same reasons. Archive parsing
// reuses ShinawaseLoader/echomod-archive.mjs, the same side-effect-free
// module the packer uses.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { isZip, readZip } from '../echomod-archive.mjs';
import {
  ICON_EXTENSIONS, MANIFEST_NAMES, MAX_PACKAGE_BYTES, PACKAGE_TYPES, PACKER_MAX_FILES,
  compileConfigUi, compileEntry, isSafeId, packageKind, safeRelative,
} from './contract.mjs';

const issue = (list, code, message, extra = {}) => { list.push({ code, message, ...extra }); };

const tryParseJson = (text) => {
  try { return { value: JSON.parse(String(text).replace(/^﻿/u, '')) }; }
  catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
};

const trySafeRelative = (value) => {
  try { return { value: safeRelative(value) }; }
  catch { return { error: `unsafe package-relative path: ${JSON.stringify(value)}` }; }
};

// Validate an unpacked package directory (or a manifest object plus an
// optional file list). Returns { ok, errors, warnings, notices, ... }.
export const validateManifest = (input) => {
  const errors = [];
  const warnings = [];
  const notices = [];
  let manifest = null;
  let manifestName = null;
  let directory = null;

  if (typeof input === 'string') {
    directory = resolve(input);
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      issue(errors, 'directory_missing', `package directory not found: ${directory}`);
      return { ok: false, errors, warnings, notices, manifest, manifestName, directory };
    }
    manifestName = MANIFEST_NAMES.find((name) => existsSync(join(directory, name)));
    if (!manifestName) {
      issue(errors, 'manifest_missing', `no ${MANIFEST_NAMES.join(' / ')} in ${directory}`);
      return { ok: false, errors, warnings, notices, manifest, manifestName, directory };
    }
    const parsed = tryParseJson(readFileSync(join(directory, manifestName), 'utf8'));
    if (parsed.error) {
      issue(errors, 'manifest_invalid_json', `${manifestName}: ${parsed.error}`);
      return { ok: false, errors, warnings, notices, manifest, manifestName, directory };
    }
    manifest = parsed.value;
  } else if (input && typeof input === 'object') {
    manifest = input.manifest || input;
    manifestName = input.manifestName || 'echo.mod.json';
  } else {
    issue(errors, 'input_invalid', 'validateManifest expects a directory path or a manifest object');
    return { ok: false, errors, warnings, notices, manifest, manifestName, directory };
  }

  const kind = manifestName === 'echo.plugin.json' ? 'plugin' : 'mod';
  if (!isSafeId(manifest.id)) issue(errors, 'id_invalid', 'manifest.id must be 2-64 letters, numbers, dots, underscores, or hyphens (ShinawaseLoader safeId)');
  if (!manifest.name) issue(warnings, 'name_missing', 'manifest.name is empty; the loader falls back to the id');
  if (!manifest.version) issue(warnings, 'version_missing', "manifest.version is empty; the loader assumes '1.0.0'");

  // Official sandboxed ECHO plugins target ECHO's own plugin VM; the loader
  // refuses to execute them (injectionPlan surfaces a notice instead).
  if (kind === 'plugin' && Number(manifest.apiVersion) >= 1 && Array.isArray(manifest.permissions)) {
    issue(notices, 'official_sandboxed_plugin', 'this manifest looks like an official ECHO sandboxed plugin; ShinawaseLoader will not execute its entry. Import the .echo package through ECHO\'s native Plugins page instead.');
  }

  const entryDeclared = manifest.entry || (kind === 'plugin' ? 'plugin.js' : 'mod.js');
  const entryCheck = trySafeRelative(entryDeclared);
  let entryPath = null;
  let entryExists = false;
  if (entryCheck.error) issue(errors, 'entry_path_invalid', entryCheck.error);
  else if (directory) {
    entryPath = join(directory, entryCheck.value);
    entryExists = existsSync(entryPath);
    if (!entryExists) {
      if (manifest.main || manifest.native || manifest.nativeShell) {
        issue(notices, 'native_only_entry', `entry ${entryCheck.value} is absent; the loader injects a native-only stub because main/native is declared`);
      } else {
        issue(errors, 'entry_missing', `manifest entry is missing: ${entryCheck.value}`);
      }
    }
  }

  for (const [field, code] of [['config', 'config'], ['configSchema', 'schema'], ['configUi', 'configui'], ['icon', 'icon']]) {
    const value = manifest[field];
    if (value === undefined || value === null || typeof value === 'object') continue;
    const check = trySafeRelative(value);
    if (check.error) { issue(errors, `${code}_path_invalid`, `${field}: ${check.error}`); continue; }
    if (!directory) continue;
    const filePath = join(directory, check.value);
    if (!existsSync(filePath)) {
      if (field === 'config') issue(warnings, 'config_missing', `${value} is declared but absent; the loader treats the config as {}`);
      else issue(warnings, `${code}_missing`, `${field} file is declared but absent: ${value}`);
      continue;
    }
    if (field === 'config' || field === 'configSchema') {
      const parsed = tryParseJson(readFileSync(filePath, 'utf8'));
      if (parsed.error) issue(errors, `${code}_invalid_json`, `${value}: ${parsed.error}`);
    }
    if (field === 'icon' && !ICON_EXTENSIONS.has(extname(check.value).toLowerCase())) {
      issue(warnings, 'icon_extension_unknown', `${value}: the loader only serves ${[...ICON_EXTENSIONS].join(' ')} icons`);
    }
  }

  if (manifest.native && typeof manifest.native === 'object') {
    for (const module of Array.isArray(manifest.native.modules) ? manifest.native.modules : []) {
      if (!module || !['node-addon', 'host-dll'].includes(module.kind) || trySafeRelative(module.entry).error) {
        issue(errors, 'native_module_invalid', `native.modules entries need kind node-addon|host-dll and a package-relative entry: ${JSON.stringify(module)}`);
      }
    }
  }
  if (manifest.nativeShell !== undefined && typeof manifest.nativeShell === 'string' && trySafeRelative(manifest.nativeShell).error) {
    issue(errors, 'nativeshell_path_invalid', `nativeShell: ${trySafeRelative(manifest.nativeShell).error}`);
  }

  return {
    ok: errors.length === 0,
    errors, warnings, notices,
    manifest, manifestName, directory, kind,
    entry: entryCheck.value || null, entryPath, entryExists,
    entryType: manifest.entryType || (entryCheck.value ? ({ '.html': 'html', '.htm': 'html', '.css': 'css' })[extname(entryCheck.value).toLowerCase()] || 'js' : 'js'),
  };
};

// Compile-only syntax check in the loader wrapper shape (AGENTS.md validation
// strategy #2: injected renderer entries run as async function bodies and may
// contain top-level return/await, so plain `node --check` rejects them).
export const checkEntrySyntax = (input, options = {}) => {
  let source = input;
  let file = options.file || null;
  if (options.fromFile || (typeof input === 'string' && !input.includes('\n') && /\.(?:js|mjs|cjs|html|htm|css)$/iu.test(input) && existsSync(input))) {
    file = input;
    source = readFileSync(input, 'utf8');
  }
  const entryType = options.entryType || (file ? ({ '.html': 'html', '.htm': 'html', '.css': 'css' })[extname(file).toLowerCase()] || 'js' : 'js');
  if (entryType === 'html' || entryType === 'css') return { ok: true, entryType, file, skipped: 'non-script entries are wrapped by the loader, not parsed' };
  try {
    (options.wrapper === 'configUi' ? compileConfigUi : compileEntry)(source);
    return { ok: true, entryType, file };
  } catch (error) {
    return { ok: false, entryType, file, error: { message: error instanceof Error ? error.message : String(error) } };
  }
};

// Validate a packed .echomod/.echo archive (ZIP or JSON payload) against the
// same acceptance rules importPackage applies.
export const validatePackageArchive = (file) => {
  const errors = [];
  const warnings = [];
  const notices = [];
  const summary = { ok: false, errors, warnings, notices, file: resolve(String(file)), type: null, manifest: null, fileCount: 0, totalBytes: 0 };
  let bytes;
  try { bytes = readFileSync(summary.file); }
  catch { issue(errors, 'archive_missing', `cannot read archive: ${summary.file}`); return summary; }
  if (bytes.length > MAX_PACKAGE_BYTES) {
    issue(errors, 'archive_too_large', `archive exceeds the loader limit of ${MAX_PACKAGE_BYTES} bytes`);
    return summary;
  }

  let manifest = null;
  let files = [];
  if (isZip(bytes)) {
    let entries;
    try { entries = readZip(bytes, { maxBytes: MAX_PACKAGE_BYTES }); }
    catch (error) { issue(errors, 'zip_invalid', error instanceof Error ? error.message : String(error)); return summary; }
    const byPath = new Map(entries.map((entry) => [entry.path.replaceAll('\\', '/').toLowerCase(), entry]));
    const manifestEntry = [...MANIFEST_NAMES, 'echo.workshop.json'].map((name) => byPath.get(name)).find(Boolean);
    if (!manifestEntry) { issue(errors, 'manifest_missing', 'archive has no manifest'); return summary; }
    const parsed = tryParseJson(manifestEntry.data.toString('utf8'));
    if (parsed.error) { issue(errors, 'manifest_invalid_json', parsed.error); return summary; }
    manifest = parsed.value;
    summary.type = manifestEntry.path.toLowerCase().endsWith('plugin.json') ? 'echo-plugin-package' : 'echo-external-mod';
    if (manifestEntry.path.toLowerCase().endsWith('workshop.json')) {
      if (manifest.type === 'echo-workshop-item' && manifest.content?.kind === 'native-shell') {
        summary.type = 'echo-workshop-item';
        issue(notices, 'workshop_item', 'native-shell workshop item: the loader projects its manifest at import time');
      } else {
        issue(errors, 'workshop_manifest_invalid', 'echo.workshop.json must declare type echo-workshop-item with content.kind native-shell');
      }
    }
    files = entries.filter((entry) => entry.path !== manifestEntry.path).map((entry) => ({ path: entry.path, size: entry.data.length }));
  } else {
    const parsed = tryParseJson(bytes.toString('utf8'));
    if (parsed.error) { issue(errors, 'payload_invalid_json', parsed.error); return summary; }
    const payload = parsed.value;
    summary.type = payload.type || null;
    if (!PACKAGE_TYPES.has(payload.type)) issue(errors, 'type_unknown', `payload type must be one of: ${[...PACKAGE_TYPES].join(', ')}`);
    manifest = payload.manifest || null;
    files = (Array.isArray(payload.files) ? payload.files : []).map((entry) => ({
      path: entry?.path,
      size: entry?.encoding === 'base64' ? Math.floor(String(entry.content || '').length * 3 / 4) : Buffer.byteLength(String(entry?.content ?? '')),
    }));
  }

  summary.manifest = manifest;
  if (!manifest || !isSafeId(manifest.id)) issue(errors, 'id_invalid', 'manifest.id must satisfy the loader safeId rule');

  const seen = new Set();
  for (const entry of files) {
    const check = trySafeRelative(entry.path);
    if (check.error) { issue(errors, 'file_path_invalid', check.error); continue; }
    const key = check.value.toLowerCase();
    if (seen.has(key)) issue(errors, 'file_duplicate', `duplicate package path (case-insensitive): ${check.value}`);
    seen.add(key);
    summary.totalBytes += Number(entry.size) || 0;
  }
  summary.fileCount = files.length;
  if (summary.fileCount > PACKER_MAX_FILES) issue(warnings, 'file_count_over_packer_limit', `${summary.fileCount} files exceed the packer limit of ${PACKER_MAX_FILES}`);
  if (summary.totalBytes > MAX_PACKAGE_BYTES) issue(errors, 'contents_too_large', `package contents exceed ${MAX_PACKAGE_BYTES} bytes`);

  if (manifest && summary.type !== 'echo-workshop-item') {
    const kind = packageKind(summary.type);
    const entryName = manifest.entry || manifest.main || (kind === 'plugin' ? 'plugin.js' : 'mod.js');
    const entryCheck = trySafeRelative(entryName);
    if (entryCheck.error) issue(errors, 'entry_path_invalid', entryCheck.error);
    else {
      const present = files.some((entry) => {
        const check = trySafeRelative(entry.path);
        return !check.error && check.value.toLowerCase() === entryCheck.value.toLowerCase();
      });
      if (!present) issue(errors, 'entry_missing', `manifest entry is missing from the archive: ${entryCheck.value}`);
    }
  }

  summary.ok = errors.length === 0;
  return summary;
};
