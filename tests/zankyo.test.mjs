import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { Cipher, launchZankyo } from '../ShinawaseLoader/zankyo-session.mjs';
import { detectEchoRuntime } from '../ShinawaseLoader/echo-runtime.mjs';
import { ZankyoMods, packageFile } from '../ShinawaseLoader/zankyo-mods.mjs';
import { validateManifest } from '../ShinawaseLoader/testing/validate.mjs';

const fixture = fileURLToPath(new URL('./fixtures/gpui-host.mjs', import.meta.url));

test('Zankyo template validates and malformed native entry declarations fail', () => {
  assert.equal(validateManifest(fileURLToPath(new URL('../ShinawaseLoader/zankyo-template', import.meta.url))).ok, true);
  for (const zankyo of [null, {}, { entry: '../escape.js' }, { entry: 3 }]) {
    assert.equal(validateManifest({ id: 'test.mod', zankyo }).ok, false);
  }
});

test('pure Zankyo packages validate, pack and import without an Electron entry', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-native-package-'));
  try {
    const source = join(root, 'source');
    mkdirSync(source);
    writeFileSync(join(source, 'echo.mod.json'), JSON.stringify({
      id: 'test.native-only', version: '1.0.0', zankyo: { entry: 'zankyo.js' },
    }));
    writeFileSync(join(source, 'zankyo.js'), 'return () => {};');
    assert.equal(validateManifest(source).ok, true);
    const archive = join(root, 'native.echomod');
    const pack = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/pack-echomod.mjs', import.meta.url)), source, archive], { encoding: 'utf8', windowsHide: true });
    assert.equal(pack.status, 0, pack.stderr);
    const home = join(root, 'loader');
    const mods = join(root, 'Mods');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../ShinawaseLoader/ShinawaseLoader.mjs', import.meta.url)), 'import', archive], {
      windowsHide: true, encoding: 'utf8',
      env: { ...process.env, ECHO_GAME_ROOT: root, ECHO_MOD_HOME: home, ECHO_MODS_HOME: mods, ECHO_PLUGINS_HOME: join(root, 'Plugins'), ECHO_SKIP_SELF_UPDATE: '1' },
    });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(join(mods, 'installed/test.native-only/echo.mod.json')));
    assert.equal(manifest.entry, undefined);
    assert.equal(manifest.zankyo.entry, 'zankyo.js');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('AES-GCM rejects wrong keys, direction, tampering and replay', () => {
  const key = Buffer.alloc(32, 7);
  const bytes = new Cipher(key, 'loader').seal(Buffer.from('hello'));
  const receiver = new Cipher(key, 'loader');
  assert.equal(receiver.open(bytes).toString(), 'hello');
  assert.throws(() => receiver.open(bytes));
  assert.throws(() => new Cipher(key, 'host').open(bytes));
  assert.throws(() => new Cipher(Buffer.alloc(32, 8), 'loader').open(bytes));
  const corrupt = Buffer.from(bytes);
  corrupt[0] ^= 1;
  assert.throws(() => new Cipher(key, 'loader').open(corrupt));
  // Shared with the Rust wire test; catches differences in KDF, nonce, AAD or tag.
  assert.equal(bytes.toString('hex'), '3658035366fb0e62756eae24ea0ff345ddc98891e5');
});

test('encrypted session authenticates the launched child, calls and closes cleanly', async () => {
  const session = await launchZankyo(process.execPath, [fixture], {
    spawnChild: (file, args, options) => spawn(file, args, { ...options, windowsHide: true }),
  });
  try {
    const hello = await session.ready;
    assert.equal(hello.pid, session.child.pid);
    assert.equal(session.connected, true);
    assert.deepEqual(await session.call('ui.patch', { value: 3 }), { method: 'ui.patch', params: { value: 3 } });
    session.close();
    await assert.rejects(session.call('ui.views'), /disconnected/);
  } finally {
    session.close();
    session.child.kill();
  }
});

test('runtime detection prioritizes GPUI payload over leftover asar and preserves Electron', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-runtime-'));
  try {
    const electron = join(root, 'ECHO.exe');
    mkdirSync(join(root, 'resources'));
    writeFileSync(electron, '');
    writeFileSync(join(root, 'resources', 'app.asar'), '');
    const probe = () => { throw new Error('must not start Electron for probing'); };
    assert.equal(detectEchoRuntime(electron, { platform: 'win32', probe }).runtime, 'electron');
    const native = join(root, 'EchoZankyo.exe');
    writeFileSync(native, 'ECHO_GPUI_SHINAWASE_API_V1');
    const result = detectEchoRuntime(electron, { platform: 'win32',
      probe: (file, args) => {
        assert.equal(file, native);
        assert.deepEqual(args, ['--shinawase-probe']);
        return { stdout: '{"runtime":"gpui","protocol":1}' };
      } });
    assert.equal(result.runtime, 'gpui');
    assert.equal(result.executable, native);
    assert.throws(() => detectEchoRuntime(native, { platform: 'win32', probe: () => ({ stdout: '{}' }) }), /unsupported/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('runtime detection never starts an unmarked native build and finds a compatible sibling', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-native-upgrade-'));
  try {
    const stock = join(root, 'EchoZankyo.exe');
    writeFileSync(stock, 'old native host without the probe');
    const probe = () => assert.fail('must not start an incompatible native host');
    assert.throws(() => detectEchoRuntime(stock, { platform: 'win32', probe }), /unsupported/);
    const compatible = join(root, 'echo-gpui.exe');
    writeFileSync(compatible, 'ECHO_GPUI_SHINAWASE_API_V1');
    const selected = detectEchoRuntime(stock, { platform: 'win32', probe: (file, args) => {
      assert.equal(file, compatible);
      assert.deepEqual(args, ['--shinawase-probe']);
      return { stdout: '{"runtime":"gpui","protocol":1}' };
    } });
    assert.equal(selected.executable, compatible);
    assert.equal(readFileSync(stock, 'utf8'), 'old native host without the probe');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Zankyo entries hot reload, reject escaping assets and dispose failed/disabled packages', async () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-mod-'));
  const calls = [];
  const session = { connected: false, call: async (method, params) => { calls.push([method, params]); return []; } };
  const mods = new ZankyoMods(session);
  try {
    const file = join(root, 'zankyo.js');
    writeFileSync(file, "await echoExternalMod.zankyo.ui.patch('view', {type:'text',text:'one'}); return () => echoExternalMod.log('cleanup');");
    const pkg = { id: 'demo', directory: root, manifest: { zankyo: { entry: 'zankyo.js' } }, config: {}, enabled: true };
    assert.equal((await mods.sync([pkg]))[0].state, 'loaded');
    const count = calls.filter(([name]) => name === 'ui.patch').length;
    await mods.sync([pkg]);
    assert.equal(calls.filter(([name]) => name === 'ui.patch').length, count, 'unchanged entry is not executed again');
    writeFileSync(file, "await echoExternalMod.zankyo.ui.patch('view', {type:'text',text:'two'});");
    await mods.sync([pkg]);
    assert.equal(calls.filter(([name]) => name === 'ui.patch').length, count + 1);
    await mods.sync([{ ...pkg, enabled: false }]);
    assert.equal(mods.running.size, 0);
    assert.ok(calls.some(([name, params]) => name === 'package.dispose' && params.owner === 'demo'));
    assert.throws(() => packageFile(root, resolve(root, '..')), /invalid_package_path/);
    writeFileSync(file, "await echoExternalMod.zankyo.ui.patch('view', {type:'text'}); throw new Error('broken');");
    assert.equal((await mods.sync([pkg]))[0].state, 'error');
    assert.equal(mods.running.size, 0);
    const failedCalls = calls.length;
    assert.equal((await mods.sync([pkg]))[0].state, 'error');
    assert.equal(calls.length, failedCalls, 'unchanged failing entries are not executed on every poll');
    assert.equal((await mods.sync([{ ...pkg, manifest: {} }]))[0].state, 'electron-only');
    writeFileSync(file, "await echoExternalMod.zankyo.ui.patch('view', {type:'text',text:'recovered'});");
    assert.equal((await mods.sync([pkg]))[0].state, 'loaded');
    assert.equal((await mods.sync([{ ...pkg, manifest: {} }]))[0].state, 'electron-only');
    assert.equal(mods.running.size, 0, 'removing the native entry retires its previous patch');
    await mods.sync([pkg]);
    const gpui = { protocol: 1, entry: 'gpui/plugin.mjs' };
    assert.equal((await mods.sync([{ ...pkg, manifest: { entry: 'mod.js', gpui } }]))[0].state, 'gpui-plugin');
    assert.equal(mods.running.size, 0, 'a standard GPUI plugin retires external patches and is not executed by the Loader');
    assert.equal((await mods.sync([{ ...pkg, manifest: { ...pkg.manifest, gpui } }]))[0].state, 'loaded');
    assert.equal((await mods.sync([{ ...pkg, manifest: { zankyo: { entry: 'missing.js' } } }]))[0].state, 'error');
    assert.equal(mods.running.size, 0, 'a missing entry also retires its previous patch');
  } finally {
    await mods.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('GPUI full-trust transport has no generic HTTP/native RPC proxy or persistent session key', () => {
  const source = readFileSync(new URL('../ShinawaseLoader/ShinawaseLoader.mjs', import.meta.url), 'utf8');
  const routes = source.slice(source.indexOf("url.pathname.startsWith('/api/zankyo')"),
    source.indexOf("request.method === 'GET' && url.pathname === '/'"));
  assert.match(routes, /hasApiToken/);
  assert.doesNotMatch(routes, /readRequest|native\.load|core\.call/);
  const transport = readFileSync(new URL('../ShinawaseLoader/zankyo-session.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(transport, /writeFile|appendFile/);
});

test('native screen actions including toggles use the same UI lifecycle', async () => {
  const events = [{ owner: 'shinawase-loader', action: 'toggle/demo' }];
  const received = [];
  const mods = new ZankyoMods({ connected: true, call: async method => method === 'ui.events' ? events.splice(0) : [] }, {
    onUiEvent: async event => received.push(event.action),
    onToggle: () => assert.fail('must not bypass the UI refresh lifecycle'),
  });
  try {
    await mods.events();
    assert.deepEqual(received, ['toggle/demo']);
  } finally { await mods.close(); }
});
