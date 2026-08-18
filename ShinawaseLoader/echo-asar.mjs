#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const marker = '/* shinawase-loader-bridge-v1 */';
const align4 = (value) => (value + 3) & ~3;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const archiveFor = (root) => join(root, 'resources', 'app.asar');
const loaderFor = (root) => join(root, 'ShinawaseLoader');
const backupFor = (root) => join(loaderFor(root), 'backups', 'app.asar.original');
const stateFor = (root) => join(loaderFor(root), 'backups', 'app.asar.json');

const bridge = `${marker}
(() => {
  const builtin = (name) => process.getBuiltinModule?.(name);
  const fs = builtin('node:fs');
  const path = builtin('node:path');
  const childProcess = builtin('node:child_process');
  if (!fs || !path || !childProcess || typeof app === 'undefined') return;
  const installRoot = path.dirname(process.resourcesPath);
  const loaderRoot = path.join(installRoot, 'ShinawaseLoader');
  const script = path.join(loaderRoot, 'ShinawaseLoader.mjs');
  const configPath = path.join(loaderRoot, 'loader.config.json');
  if (!fs.existsSync(script)) return;
  let config = {};
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
  if (config.autoStart === false || process.argv.includes('--no-mod-loader')) return;
  const port = process.env.ECHO_MOD_PORT || String(config.port || 17862);
  const debugPort = process.env.ECHO_MOD_DEBUG_PORT || String(config.debugPort || 9229);
  const showConsole = process.argv.includes('--mod-loader-console') || config.showConsole === true;
  app.commandLine.appendSwitch('remote-debugging-port', debugPort);
  app.whenReady().then(() => {
    if (globalThis.__shinawaseLoaderProcess) return;
    const node = process.env.ECHO_NODE_PATH || path.join(loaderRoot, process.platform === 'win32' ? 'node.exe' : 'node');
    const child = childProcess.spawn(node, [script, 'attach', '--port', port, '--debug-port', debugPort], {
      cwd: installRoot,
      env: { ...process.env, ECHO_WORKSPACE_ROOT: installRoot, ECHO_MOD_HOME: loaderRoot, ECHO_MODS_HOME: path.join(installRoot, 'Mods') },
      windowsHide: !showConsole,
      stdio: showConsole ? 'inherit' : 'ignore',
    });
    globalThis.__shinawaseLoaderProcess = child;
    child.once('exit', () => { globalThis.__shinawaseLoaderProcess = null; });
  }).catch(() => {});
  app.once('will-quit', () => globalThis.__shinawaseLoaderProcess?.kill());
})();
`;

const readArchive = (file) => {
  const bytes = readFileSync(file);
  if (bytes.length < 12) throw new Error('asar_header_missing');
  const headerSize = bytes.readUInt32LE(4);
  const header = bytes.subarray(8, 8 + headerSize);
  const jsonSize = header.readInt32LE(4);
  const value = JSON.parse(header.subarray(8, 8 + jsonSize).toString('utf8'));
  return { bytes, dataStart: 8 + headerSize, value };
};

const filesIn = (node, prefix = '') => {
  const result = [];
  for (const [name, info] of Object.entries(node.files || {})) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (info.files) result.push(...filesIn(info, relativePath));
    else result.push({ relativePath, info });
  }
  return result;
};

const makeHeader = (value) => {
  const json = Buffer.from(JSON.stringify(value), 'utf8');
  const payloadSize = align4(4 + json.length);
  const header = Buffer.alloc(4 + payloadSize);
  header.writeUInt32LE(payloadSize, 0);
  header.writeInt32LE(json.length, 4);
  json.copy(header, 8);
  const size = Buffer.alloc(8);
  size.writeUInt32LE(4, 0);
  size.writeUInt32LE(header.length, 4);
  return Buffer.concat([size, header]);
};

const writeArchive = (archive, targetContent) => {
  const parsed = readArchive(archive);
  const chunks = [];
  let offset = 0;
  let found = false;
  for (const entry of filesIn(parsed.value)) {
    const { info } = entry;
    if (info.unpacked || info.link) continue;
    const content = entry.relativePath === 'out/main/index.js'
      ? Buffer.from(targetContent, 'utf8')
      : parsed.bytes.subarray(parsed.dataStart + Number(info.offset), parsed.dataStart + Number(info.offset) + Number(info.size));
    if (entry.relativePath === 'out/main/index.js') found = true;
    info.offset = String(offset);
    info.size = content.length;
    if (entry.relativePath === 'out/main/index.js') delete info.integrity;
    chunks.push(content);
    offset += content.length;
  }
  if (!found) throw new Error('asar_main_entry_missing');
  const temporary = `${archive}.${process.pid}.tmp`;
  writeFileSync(temporary, Buffer.concat([makeHeader(parsed.value), ...chunks]));
  rmSync(archive, { force: true });
  renameSync(temporary, archive);
};

const patch = (root) => {
  const archive = archiveFor(root);
  if (!existsSync(archive)) throw new Error(`app.asar_not_found:${archive}`);
  const current = readArchive(archive);
  const main = filesIn(current.value).find((entry) => entry.relativePath === 'out/main/index.js');
  if (!main) throw new Error('asar_main_entry_missing');
  const currentText = current.bytes.subarray(current.dataStart + Number(main.info.offset), current.dataStart + Number(main.info.offset) + Number(main.info.size)).toString('utf8');
  if (currentText.includes(marker) || currentText.includes('external-mod-loader:start:requested')) return { status: 'already-patched' };
  const backup = backupFor(root);
  if (!existsSync(backup)) {
    const backupDir = dirname(backup);
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(archive, backup);
  }
  writeArchive(archive, `${bridge}\n${currentText}`);
  writeFileSync(stateFor(root), `${JSON.stringify({ originalSha256: sha256(readFileSync(backup)), patchedSha256: sha256(readFileSync(archive)), patchedAt: new Date().toISOString() }, null, 2)}\n`);
  return { status: 'patched' };
};

const restore = (root, force = false) => {
  const archive = archiveFor(root);
  const backup = backupFor(root);
  if (!existsSync(backup)) return { status: 'no-backup' };
  const state = existsSync(stateFor(root)) ? JSON.parse(readFileSync(stateFor(root), 'utf8')) : {};
  if (!force && state.patchedSha256 && sha256(readFileSync(archive)) !== state.patchedSha256) throw new Error('app.asar_changed_since_patch');
  copyFileSync(backup, archive);
  return { status: 'restored' };
};

const [action = 'status', root = join(dirname(new URL(import.meta.url).pathname), '..'), flag] = process.argv.slice(2);
try {
  const result = action === 'patch' ? patch(root) : action === 'restore' ? restore(root, flag === '--force') : { status: existsSync(backupFor(root)) ? 'patched-or-backed-up' : 'not-patched' };
  console.log(`ShinawaseLoader app.asar ${result.status}`);
} catch (error) {
  console.error(`ShinawaseLoader app.asar failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
