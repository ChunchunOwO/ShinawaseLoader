import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ZankyoMods } from '../ShinawaseLoader/zankyo-mods.mjs';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'shinawase-compat-'));
  const calls = [], messages = [], pages = new Map(), events = [];
  const state = { status: 'playing', position: 12.5, duration: 120, volume: 70, queueId: 1, queuePosition: 0, queueLength: 2, title: 'Song', artist: 'Artist' };
  const track = {
    sequence: 1, title: 'Song', artist: 'Artist', catalog: { source: 'Local', id: 'local:1' },
    reference: { kind: 'catalog', source: 'Local', id: 'local:1' },
  };
  const session = { connected: false, call: async (method, params) => {
    calls.push({ method, params });
    if (method === 'ui.events') return events.splice(0);
    if (method !== 'core.call') return [];
    const { method: command, input } = params;
    if (command === 'playback.get') return structuredClone(state);
    if (command === 'playback.getCurrentTrack') return structuredClone(track);
    if (command === 'queue.get') {
      const items = [1, 2].slice(0, input.limit).map(occurrence => ({
        title: track.title, artist: track.artist, catalog: track.catalog,
        reference: track.reference, occurrenceId: String(occurrence),
      }));
      return { queueId: state.queueId, position: state.queuePosition, offset: 0, total: 2, hasNext: items.length < 2, items };
    }
    if (command === 'playback.control') {
      if (input.action === 'pause') state.status = 'paused';
      if (input.action === 'seek') state.position = input.seconds;
    }
    return null;
  } };
  const options = {
    settingsDirectory: join(directory, 'settings'),
    onToast: value => messages.push(value),
    onPage: (owner, page, onAction) => {
      if (!page) { for (const key of pages.keys()) if (key.startsWith(owner + '/')) pages.delete(key); }
      else if (page.remove) pages.delete(owner + '/' + page.id);
      else pages.set(owner + '/' + page.id, { ...page, onAction });
    },
    request: async path => {
      if (path === '/api/ui-settings') return { ui: { animations: true } };
      return { connected: true };
    },
  };
  const mods = new ZankyoMods(session, options);
  const pkg = (id, source, extra = {}) => {
    const root = join(directory, id);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'mod.js'), source);
    writeFileSync(join(root, 'asset.txt'), 'packaged content');
    return { id, directory: root, enabled: true, config: {}, manifest: { id, entry: 'mod.js', ...extra } };
  };
  return { directory, calls, messages, pages, events, session, state, mods, pkg, options,
    close: async () => { await mods.close(); rmSync(directory, { force: true, recursive: true }); } };
}

test('an unchanged Electron API entry executes on GPUI, persists settings and maps playback units', async () => {
  const f = fixture();
  let restarted;
  try {
    const legacy = f.pkg('legacy.api', `
      const visits = (echoExternalMod.settings.get().visits || 0) + 1;
      echoExternalMod.settings.set({ visits });
      const status = await window.echo.playback.getStatus();
      if (status.positionMs !== 12500 || status.filePath !== null) throw new Error('wrong playback status');
      const player = await echoExternalMod.player.status();
      if (player.positionSeconds !== 12.5 || player.title !== 'Song') throw new Error('wrong player snapshot');
      if (echoExternalMod.player.playback() !== window.echo.playback) throw new Error('wrong playback API');
      if (echoExternalMod.sdk.list('playback').indexOf('pause') < 0) throw new Error('missing SDK discovery');
      if (await echoExternalMod.loadAsset('asset.txt') !== 'packaged content') throw new Error('wrong asset');
      await echoExternalMod.sdk.call('playback.pause');
      echoExternalMod.toast('loaded ' + visits);
      return () => echoExternalMod.log('disposed');
    `);
    assert.equal((await f.mods.sync([legacy]))[0].runtime, 'electron-compat');
    assert.equal(f.mods.status[0].state, 'loaded');
    assert.equal(f.state.status, 'paused');
    assert.deepEqual(f.messages, ['loaded 1']);
    assert.deepEqual(JSON.parse(readFileSync(join(f.directory, 'settings', 'legacy.api.json'))), { visits: 1 });
    await f.mods.sync([legacy]);
    assert.deepEqual(f.messages, ['loaded 1'], 'unchanged entries are not executed twice');
    await f.mods.sync([{ ...legacy, enabled: false }]);
    f.state.status = 'playing';
    restarted = new ZankyoMods(f.session, f.options);
    assert.equal((await restarted.sync([legacy]))[0].state, 'loaded');
    assert.deepEqual(f.messages, ['loaded 1', 'loaded 2'], 'settings survive a fresh executor');
  } finally { await restarted?.close(); await f.close(); }
});

test('a dual UI descriptor uses native controls, action fields and existing audio commands', async () => {
  const f = fixture();
  try {
    const legacy = f.pkg('legacy.page', `
      echoExternalMod.sidebar.register({
        id: 'audio', label: 'Audio tools', html: '<p>Electron view</p>',
        native: { kind: 'section', children: [{ kind: 'button', text: 'Apply', action: 'apply' }] }
      });
      echoExternalMod.zankyo.ui.onAction(async (action, fields) => {
        if (action === 'apply') {
          await echoExternalMod.zankyo.core('audio.output.setOutput', { target: { kind: 'device', id: fields.device } });
          echoExternalMod.toast('applied');
        }
      });
    `);
    assert.equal((await f.mods.sync([legacy]))[0].state, 'loaded');
    await f.pages.get('legacy.page/audio').onAction('apply', { device: 'device-1' });
    assert.ok(f.calls.some(call => call.params?.method === 'audio.output.setOutput' && call.params.input.target.id === 'device-1'));
    assert.deepEqual(f.messages, ['applied']);
    await f.mods.sync([]);
    assert.equal(f.pages.size, 0);
  } finally { await f.close(); }
});

test('the external plugin template shares one script between the Electron renderer and native sidebar', async () => {
  const f = fixture();
  try {
    const directory = new URL('../ShinawaseLoader/plugin-template/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('echo.plugin.json', directory), 'utf8'));
    const config = JSON.parse(readFileSync(new URL('config.json', directory), 'utf8'));
    const pkg = { id: manifest.id, directory: fileURLToPath(directory), manifest, config, kind: 'plugin', enabled: true };
    const status = (await f.mods.sync([pkg]))[0];
    assert.equal(status.state, 'loaded', status.error);
    assert.equal(status.runtime, 'electron-compat');
    assert.equal(f.pages.get(manifest.id + '/main').body.children[1].text, config.message);
    await f.mods.sync([]);
    assert.equal(f.pages.size, 0);
  } finally { await f.close(); }
});

test('package settings have a bounded cache and never discard unsaved in-memory values', async () => {
  const mods = new ZankyoMods({ connected: false, call: async () => [] });
  try {
    for (let index = 0; index < 256; index++) mods.packageSettings('cache.' + index).set({ index });
    assert.throws(() => mods.packageSettings('overflow'), /cache limit/);
    assert.deepEqual(mods.packageSettings('cache.0').get(), { index: 0 });
    assert.throws(() => mods.packageSettings('../escape'), /invalid_mod_id/);
  } finally { await mods.close(); }
});

test('subscribed legacy Mods share a playback read and stop listeners and timers when disabled', async () => {
  const f = fixture();
  try {
    const source = `
      echoExternalMod.echo.playback.onStatus(s => echoExternalMod.toast(s.state));
      echoExternalMod.loaderSettings.onChange(s => echoExternalMod.toast('motion:' + s.animations));
      setTimeout(() => echoExternalMod.toast('leaked timer'), 60);
    `;
    const first = f.pkg('first', source), second = f.pkg('second', source);
    await f.mods.sync([first, second]);
    f.state.status = 'paused';
    f.session.connected = true;
    f.calls.length = 0;
    await f.mods.events();
    f.session.connected = false;
    assert.deepEqual(f.messages, ['paused', 'paused']);
    assert.equal(f.calls.filter(call => call.params?.method === 'playback.get').length, 1);
    f.mods.uiSettingsChanged({ animations: false });
    assert.deepEqual(f.messages.slice(2), ['motion:false', 'motion:false']);
    const retired = f.mods.running.get('first').compat.context;
    await f.mods.sync([]);
    f.mods.uiSettingsChanged({ animations: true });
    await new Promise(resolve => setTimeout(resolve, 85));
    assert.equal(f.messages.length, 4, 'no disposed callbacks or timers fire');
    assert.throws(() => retired.settings.set({ stale: true }), /mod_disposed/);
    await assert.rejects(retired.echo.playback.pause(), /mod_disposed/);
  } finally { await f.close(); }
});

test('incompatible DOM/main/CSS packages are classified and a failed entry releases its resources', async () => {
  const f = fixture();
  try {
    for (const [id, source, extra] of [
      ['dom', 'document.createElement("div");', {}],
      ['main', 'throw new Error("must not execute");', { main: 'main.cjs' }],
      ['css', 'throw new Error("must not execute");', { entryType: 'css' }],
    ]) {
      const result = (await f.mods.sync([f.pkg(id, source, extra)]))[0];
      assert.equal(result.state, 'incompatible', result.error);
      assert.match(result.error, /electron_mod_requires_port/);
    }
    const failed = f.pkg('failed', `
      setTimeout(() => echoExternalMod.toast('leak'), 20);
      echoExternalMod.sidebar.register({ label: 'Temporary', native: { kind: 'text', text: 'Hello' } });
      throw new Error('init failed');
    `);
    assert.equal((await f.mods.sync([failed]))[0].state, 'error');
    assert.equal(f.pages.size, 0);
    const count = f.calls.length;
    await f.mods.sync([failed]);
    assert.equal(f.calls.length, count, 'unchanged failing entries are cached');
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(f.messages, []);
    const stringError = (await f.mods.sync([f.pkg('string.error', "throw 'string failure';")]))[0];
    assert.equal(stringError.state, 'error');
    assert.equal(stringError.error, 'string failure');
  } finally { await f.close(); }
});

test('compatibility keeps package paths and SDK paths bounded and forwards only indexed/resolved media', async () => {
  const f = fixture();
  try {
    const legacy = f.pkg('guarded', `
      let rejected = 0;
      try { await echoExternalMod.loadAsset('../asset.txt'); } catch { rejected++; }
      try { echoExternalMod.sdk.get('app.__proto__.constructor'); } catch { rejected++; }
      try { echoExternalMod.settings.set({ text: 'x'.repeat(65536) }); } catch { rejected++; }
      if (rejected !== 3) throw new Error('guard missing');
      await echoExternalMod.player.playTrack({ id: 'local:1' });
      await echoExternalMod.player.playMedia({ id: 'online:1', title: 'Online', url: 'https://example.com/audio.flac' });
      await echoExternalMod.player.command({ action: 'clearQueue' });
    `);
    assert.equal((await f.mods.sync([legacy]))[0].state, 'loaded');
    const submissions = f.calls.filter(call => call.params?.method === 'queue.submit');
    assert.deepEqual(submissions[0].params.input.tracks, [{ kind: 'catalog', source: 'Local', id: 'local:1' }]);
    assert.equal(submissions[1].params.input.tracks[0].kind, 'stream');
    assert.ok(f.calls.some(call => call.params?.method === 'queue.edit' && call.params.input.edit.action === 'clear'));
  } finally { await f.close(); }
});

test('the shipped native example builds its audio page and forwards device, analysis and DSP actions', async () => {
  const f = fixture();
  try {
    const original = f.session.call;
    f.session.call = async (method, params) => {
      const result = await original(method, params);
      if (params?.method === 'audio.output.listDevices') return [{ id: 'output-1', name: 'Output one' }];
      if (params?.method === 'audio.output.getStatus') return { route: 'local', status: 'playing' };
      if (params?.method === 'audio.dsp.getGraph') return { revision: 'graph-1', filters: [], sequence: [], procedural: {} };
      if (params?.method === 'audio.getAnalysis') return { spectrum: [0.1], peakDbfs: -3 };
      return result;
    };
    const source = readFileSync(new URL('../ShinawaseLoader/zankyo-template/zankyo.js', import.meta.url), 'utf8');
    const pkg = f.pkg('audio.example', source, { zankyo: { entry: 'mod.js' } });
    const status = (await f.mods.sync([pkg]))[0];
    assert.equal(status.state, 'loaded', status.error);
    for (const [action, fields] of [
      ['audio-device/0', {}], ['audio-default', {}], ['audio-analysis', {}], ['audio-dsp-read', {}],
      ['audio-dsp-apply', { dspGraph: '{"revision":"graph-1","filters":[],"sequence":[],"procedural":{}}' }],
    ]) await f.pages.get('audio.example/audio').onAction(action, fields);
    const inputs = f.calls.filter(call => call.params?.method === 'audio.output.setOutput').map(call => call.params.input);
    assert.deepEqual(inputs, [{ target: { kind: 'device', id: 'output-1' } }, { target: { kind: 'systemDefault' } }]);
    assert.ok(f.calls.some(call => call.params?.method === 'audio.dsp.applyGraph' && call.params.input.revision === 'graph-1'));
    await f.mods.sync([]);
    assert.equal(f.pages.size, 0);
  } finally { await f.close(); }
});
