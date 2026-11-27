import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { gpuiExecutable, runGpui } from '../ShinawaseLoader/gpui-host.mjs';
import { readZip } from '../ShinawaseLoader/echomod-archive.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const payload = () => ({
  manifest: { id: 'test.native', name: 'Native test', version: '1.0.0',
    gpui: { protocol: 1, entry: 'gpui/plugin.mjs' }, gpuiAssets: ['shared.cjs'] },
  files: [
    { path: 'mod.js', data: 'Electron entry' },
    { path: 'gpui/plugin.mjs', data: 'export function activate() {}' },
    { path: 'shared.cjs', data: 'module.exports = {};' },
  ],
});
const contents = file => new Map(readZip(readFileSync(file)).map(({path, data}) => [path,
  createHash('sha256').update(/\.(?:mjs|cjs|js|json)$/u.test(path) ? data.toString('utf8').replaceAll('\r\n', '\n') : data).digest('hex')]));

test('GPUI resolves macOS bundles and bypasses the Windows Steam shim', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-gpui-path-'));
  try {
    const mac = join(root, 'ECHO.app', 'Contents', 'MacOS', 'ECHO');
    mkdirSync(dirname(mac), { recursive: true });
    writeFileSync(mac, '');
    assert.equal(gpuiExecutable(dirname(dirname(dirname(mac))), 'darwin'), mac);
    assert.equal(gpuiExecutable(root, 'darwin'), mac);
    const shim = join(root, 'ECHO.exe');
    const native = join(root, 'EchoZankyo.exe');
    writeFileSync(shim, '');
    writeFileSync(native, '');
    assert.equal(gpuiExecutable(root, 'win32'), native);
    assert.equal(gpuiExecutable(shim, 'win32'), native);
    assert.throws(() => gpuiExecutable(join(root, 'ECHO.app', 'Contents'), 'linux'), /找不到/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GPUI launch stays visible and installation retires its temporary archive', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-gpui-launch-'));
  try {
    const host = join(root, 'host');
    writeFileSync(host, '');
    let archive;
    runGpui(['launch', '--echo', host], payload, (file, argv, options) => {
      assert.equal(file, host);
      assert.deepEqual(argv, []);
      assert.equal(options.windowsHide, false);
      return { status: 0 };
    });
    assert.throws(() => runGpui(['install', 'test', '--echo', host], payload, (_, argv, options) => {
      assert.deepEqual(argv.slice(0, 2), ['--workshop', 'install']);
      archive = argv[2];
      assert.ok(existsSync(archive));
      assert.equal(options.windowsHide, true);
      return { status: 1 };
    }), /失败/);
    assert.equal(existsSync(archive), false);
    runGpui(['test', 'pkg', 'cmd.run', '{"ok":true}', '--echo', host], payload, (_, argv, options) => {
      assert.deepEqual(argv.slice(0, 2), ['--workshop', 'test']);
      archive = argv[2];
      assert.ok(existsSync(archive));
      assert.deepEqual(argv.slice(3), ['cmd.run', '{"ok":true}']);
      assert.equal(options.windowsHide, true);
      return { status: 0 };
    });
    assert.equal(existsSync(archive), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GPUI packaging retains selected assets and rejects conflicts and overwrites', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-gpui-pack-'));
  try {
    const output = join(root, 'native.zip');
    runGpui(['pack', 'test', output], payload);
    const files = contents(output);
    assert.deepEqual([...files.keys()].sort(), ['echo.workshop.json', 'gpui/plugin.mjs', 'shared.cjs']);
    const manifest = JSON.parse(readZip(readFileSync(output)).find(file => file.path === 'echo.workshop.json').data);
    assert.equal(manifest.gpui.entry, 'gpui/plugin.mjs');
    assert.throws(() => runGpui(['pack', 'test', output], payload), /EEXIST/);
    for (const change of [
      value => { value.manifest.gpui = undefined; },
      value => { value.files = value.files.filter(file => file.path !== 'shared.cjs'); },
      value => { value.files.push({path: 'gpui/../escape.mjs', data: ''}); },
      value => { value.files.push({path: 'gpui/PLUGIN.MJS', data: ''}); },
    ]) {
      const value = payload();
      change(value);
      assert.throws(() => runGpui(['pack', 'test', join(root, 'bad.zip')], () => value));
      assert.equal(existsSync(join(root, 'bad.zip')), false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('distributed MV and Streaming GPUI archives match both package sources', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-gpui-artifacts-'));
  try {
    for (const name of ['ECHO-MV', 'ECHO-Streaming']) {
      const shipped = contents(join(project, 'examples', 'packages', name + '-GPUI.zip'));
      for (const [index, source] of [
        join(project, 'examples', name, 'echomod'),
        join(project, 'examples', 'packages', name + '.echomod'),
      ].entries()) {
        const output = join(root, `${name}-${index}.zip`);
        const result = spawnSync(process.execPath, [join(project, 'ShinawaseLoader', 'ShinawaseLoader.mjs'),
          'gpui', 'pack', source, output], { encoding: 'utf8', windowsHide: true });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(contents(output), shipped);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
