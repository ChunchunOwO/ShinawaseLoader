// GPUI owns the installed registry, approval prompt and per-plugin process.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createZip } from './echomod-archive.mjs';
import { DARWIN_APP_NAMES } from './platform.mjs';

const help = `ShinawaseLoader.mjs gpui pack <mod-directory-or-echomod> <new.zip>
ShinawaseLoader.mjs gpui [--echo <binary-or-folder>] install <mod-directory-or-echomod>
ShinawaseLoader.mjs gpui [--echo <binary-or-folder>] test <mod-directory-or-echomod> [command-id]
ShinawaseLoader.mjs gpui [--echo <binary-or-folder>] list
ShinawaseLoader.mjs gpui [--echo <binary-or-folder>] launch
Use ECHO_GPUI_PATH to select the host, or put echo-gpui on PATH.`;

export function gpuiExecutable(target, platform = process.platform) {
  const binary = platform === 'win32' ? 'echo-gpui.exe' : 'echo-gpui';
  if (!target) return binary;
  const path = resolve(target);
  if (statSync(path).isFile()) {
    const payload = join(dirname(path), 'EchoZankyo.exe');
    if (platform === 'win32' && basename(path).toLowerCase() === 'echo.exe'
        && statSync(payload, { throwIfNoEntry: false })?.isFile()) return payload;
    return path;
  }
  const candidates = platform === 'win32' ? ['EchoZankyo.exe', binary, 'ECHO.exe'] : [binary, 'EchoZankyo', 'ECHO'];
  if (platform === 'darwin') {
    for (const bundle of ['', ...DARWIN_APP_NAMES, 'ECHO GPUI.app']) {
      for (const name of ['ECHO', binary, 'EchoZankyo']) {
        candidates.push(join(bundle, 'Contents', 'MacOS', name));
      }
    }
  }
  candidates.push(join('target', 'release', binary), join('target', 'debug', binary));
  for (const candidate of candidates) {
    const file = join(path, candidate);
    if (statSync(file, { throwIfNoEntry: false })?.isFile()) return file;
  }
  throw new Error('找不到 ECHO GPUI 可执行文件。请用 --echo 指定已构建的程序。');
}

function workshopZip({ manifest, files }) {
  if (!manifest?.gpui) {
    throw new Error('这个 Mod 只有旧版入口。请先为它提供原生 GPUI 入口（gpui.entry）。');
  }
  const { gpui, id, version, description } = manifest;
  const title = manifest.name || manifest.title || id;
  if (gpui.protocol !== 1 || typeof gpui.entry !== 'string' ||
      !gpui.entry.startsWith('gpui/') || !gpui.entry.endsWith('.mjs')) {
    throw new Error('需要 gpui.protocol = 1 和位于 gpui/ 中的 .mjs 入口。');
  }
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,63}$/iu.test(id) || typeof version !== 'string' || !version.trim()) {
    throw new Error('Mod 清单需要有效的 id 和 version。');
  }
  // Shared package-root modules are opt-in, so both runtimes ship the same implementation.
  const shared = manifest.gpuiAssets ?? [];
  if (!Array.isArray(shared) || shared.some(name => typeof name !== 'string' ||
      !/^[a-z0-9_-]+\.(?:cjs|mjs|js|json)$/iu.test(name))) {
    throw new Error('gpuiAssets 需要列出包根目录的模块或 JSON 文件名。');
  }
  const assets = files.filter(file => file.path.startsWith('gpui/') || shared.includes(file.path));
  for (const name of shared) {
    if (!assets.some(file => file.path === name)) throw new Error('包中缺少 ' + name);
  }
  if (!assets.some(file => file.path === gpui.entry)) throw new Error('包中缺少 ' + gpui.entry);
  const paths = new Set();
  for (const {path} of assets) {
    const invalid = path.split('/').some(part => !part || part === '.' || part === '..' ||
      part.toLowerCase() === 'echo.workshop.json');
    if (invalid || paths.has(path.toLowerCase())) {
      throw new Error('GPUI 包含冲突的资源路径：' + path);
    }
    paths.add(path.toLowerCase());
  }
  const workshop = { type: 'echo-workshop-item', schemaVersion: 1, id, title,
    version, description, content: { kind: 'plugin-package' }, gpui };
  return createZip([{ path: 'echo.workshop.json', data: JSON.stringify(workshop, null, 2) }, ...assets]);
}

export function runGpui(args, readPackage, spawn = spawnSync) {
  const {values, positionals: [command, ...inputs]} = parseArgs({
    args, allowPositionals: true, options: { echo: {type: 'string'}, help: {type: 'boolean', short: 'h'} },
  });
  if (values.help || !command) { console.log(help); return; }
  if (command === 'pack' && inputs.length === 2) {
    const [source, output] = inputs;
    if (extname(output).toLowerCase() !== '.zip') throw new Error('GPUI 输出文件需要 .zip 扩展名。');
    writeFileSync(output, workshopZip(readPackage(source)), {flag: 'wx'});
    console.log(resolve(output));
    return;
  }
  if (!(['list', 'launch'].includes(command) && !inputs.length || command === 'install' && inputs.length === 1 ||
      command === 'test' && [1, 2].includes(inputs.length))) throw new Error(help);
  const host = gpuiExecutable(values.echo || process.env.ECHO_GPUI_PATH);
  let directory;
  try {
    const argv = command === 'launch' ? [] : ['--workshop', command];
    if (inputs.length) {
      const zip = workshopZip(readPackage(inputs[0]));
      directory = mkdtempSync(join(tmpdir(), 'shinawase-gpui-'));
      const archive = join(directory, 'mod.zip');
      writeFileSync(archive, zip);
      argv.push(archive, ...inputs.slice(1));
    }
    const result = spawn(host, argv, {stdio: 'inherit', windowsHide: command !== 'launch'});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`ECHO GPUI ${command} 失败（${result.signal ?? result.status}）。`);
  } finally {
    if (directory) rmSync(directory, {recursive: true, force: true});
  }
}
