import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ZankyoUi, nativeMarkdown } from '../ShinawaseLoader/zankyo-ui.mjs';

const flatten = node => node ? [node, ...(node.children || []).flatMap(flatten)] : [];
test('native README retains the original headings, paragraph, list and fenced-code behavior', () => {
  assert.deepEqual(nativeMarkdown('# Title\n\nfirst\nsecond\n\n- item\n\n```js\nconst n = 1;\n```').children.map(({ kind, text }) => [kind, text]), [
    ['heading', 'Title'], ['text', 'first second'], ['text', '• item'], ['code', 'const n = 1;'],
  ]);
});

test('a dual-runtime package remains visible under each of its supported runtime filters', async () => {
  const { ui, event, screens } = fixture();
  try {
    await ui.start();
    await event('navigate/mods');
    ui.mods = [{ id: 'both', name: 'Both', version: '1', electron: true, zankyo: true, gpui: true }];
    for (const runtime of ['electron', 'gpui', 'zankyo']) {
      await event('runtime/' + runtime);
      assert.equal(flatten(screens.at(-1).body).filter(node => node.kind === 'mod-card').length, 1);
    }
    await ui.event({ owner: 'shinawase-loader', action: 'field', id: 'search', value: 'Both' });
    await event('navigate/loader');
    await event('navigate/mods');
    assert.equal(flatten(screens.at(-1).body).find(node => node.id === 'search').value, 'Both');
  } finally { ui.close(); }
});
test('package cards distinguish declared targets from the executor selected on this host', () => {
  const { ui } = fixture();
  try {
    ui.packages = () => [{ id: 'dual', runtime: 'electron-compat', state: 'loaded' }];
    const nodes = flatten(ui.modCard({ id: 'dual', name: 'Dual', version: '1', electron: true, zankyo: true }));
    assert.ok(nodes.some(node => node.text.includes('electron / zankyo')));
    assert.ok(nodes.some(node => node.text === 'Electron · 兼容运行'));
  } finally { ui.close(); }
});
test('native screens suppress the startup card on older matching hosts even with a saved opt-in', async () => {
  const { ui, preferences, screens } = fixture();
  try {
    preferences.startupSplash = true;
    await ui.start();
    assert.equal(screens.at(-1).preferences.startupSplash, false);
  } finally { ui.close(); }
});
function fixture() {
  const calls = [];
  const screens = [];
  const preferences = { animations: true, cardLayout: 'list', density: 'comfortable', showModIds: true };
  const mods = [
    { id: 'demo.native', name: 'Native Mod', version: '1.0', enabled: true, zankyo: true },
    { id: 'demo.electron', name: 'Electron Mod', version: '1.0', enabled: false },
    { id: 'demo.gpui', name: 'GPUI plugin', version: '1.0', enabled: false, gpui: true },
  ];
  const ui = new ZankyoUi({ connected: true, call: async (method, value) => {
    assert.equal(method, 'loader.ui');
    screens.push(value);
  } }, { version: '1.0', packages: () => [{ id: 'demo.native', state: 'loaded' }],
    request: async (path, method = 'GET', body) => {
      calls.push({ path, method, body });
      switch (path) {
        case '/api/status': return { locale: 'zh', stats: { injects: 4 }, port: 17862 };
        case '/api/ui-settings':
          if (method === 'PUT') Object.assign(preferences, body.ui);
          return { ui: { ...preferences } };
        case '/api/mods': return { mods: structuredClone(mods) };
        case '/api/logs?tail=100': return { text: '[INFO] online' };
        case '/api/market': case '/api/market?force=1':
          return { mods: [{ id: 'market.demo', name: 'Market Mod', version: '2.0', tags: ['tools'] }] };
        case '/api/market/me': return { user: null };
        case '/api/settings/export': return { version: 1, ui: preferences };
        case '/api/mod/demo.native/config':
          return { id: 'demo.native', config: { count: 2 }, schema: { properties: { count: { type: 'integer', title: 'Count' } } } };
        default: return { ok: true };
      }
    } });
  const event = (action, fields) => ui.event({ owner: 'shinawase-loader', action, fields });
  return { ui, calls, screens, event, preferences };
}

test('native Loader exposes original pages, settings and real operations', async () => {
  const { ui, calls, screens, event, preferences } = fixture();
  await ui.start();
  assert.deepEqual(screens.at(-1).navigation.map(nav => nav.id), ['loader', 'market', 'mods']);
  assert.ok(flatten(screens.at(-1).body).some(node => node.text === 'Loader'));
  await event('pref/animations');
  assert.equal(preferences.animations, false);
  await event('navigate/mods');
  const cards = () => flatten(screens.at(-1).body).filter(node => node.kind === 'mod-card');
  assert.equal(cards().length, 3);
  await event('runtime/zankyo');
  assert.equal(cards().length, 1);
  await event('toggle/demo.native');
  assert.ok(calls.some(call => call.path === '/api/mod/demo.native/disable' && call.method === 'POST'));
  await event('config/demo.native');
  assert.ok(flatten(screens.at(-1).modal).some(node => node.id === 'cfg/count'));
  await event('config-save', { 'cfg/count': '6' });
  assert.deepEqual(calls.findLast(call => call.method === 'PUT' && call.path.endsWith('/config')).body, { config: { count: 6 } });
  await event('remove/demo.native');
  assert.ok(screens.at(-1).modal);
  assert.equal(calls.some(call => call.method === 'DELETE'), false, 'uninstall requires its confirmation');
  await event('confirm-delete');
  assert.ok(calls.some(call => call.path === '/api/mod/demo.native' && call.method === 'DELETE'));
  await event('navigate/market');
  assert.ok(flatten(screens.at(-1).body).some(node => node.text === 'Market Mod'));
  await event('install/market.demo');
  assert.ok(calls.some(call => call.path === '/api/market/install' && call.body.id === 'market.demo'));
  ui.close();
});

test('native import and settings export use chosen files and surface API errors', async () => {
  const { ui, calls, screens } = fixture();
  const root = await mkdtemp(join(tmpdir(), 'shinawase-native-ui-'));
  try {
    await ui.start();
    const archive = join(root, 'demo.echomod');
    await writeFile(archive, 'package');
    await ui.event({ owner: 'shinawase-loader', action: 'files', purpose: 'import', paths: [archive] });
    assert.equal(calls.find(call => call.path === '/api/import').body.data, Buffer.from('package').toString('base64'));
    const output = join(root, 'settings.json');
    await ui.event({ owner: 'shinawase-loader', action: 'files', purpose: 'export', paths: [output] });
    assert.equal(JSON.parse(await readFile(output, 'utf8')).version, 1);
    await ui.event({ owner: 'shinawase-loader', action: 'files', purpose: 'export', paths: [output] });
    assert.equal(screens.at(-1).tone, 'error', 'does not overwrite an existing settings file');
    const before = calls.length;
    await ui.event({ owner: 'untrusted-owner', action: 'navigate/market' });
    assert.equal(calls.length, before);
    ui.request = async () => { throw new Error('market offline'); };
    await ui.event({ owner: 'shinawase-loader', action: 'navigate/market' });
    assert.equal(screens.at(-1).notice, 'market offline');
    assert.equal(screens.at(-1).busy, false);
  } finally { ui.close(); await rm(root, { recursive: true, force: true }); }
});

test('Mod pages appear in the same drawer and retire with their owner', async () => {
  const { ui, screens, event } = fixture();
  await ui.start();
  const actions = [];
  ui.registerPage('demo.native', { id: 'tools', label: 'Native Tools',
    body: { kind: 'button', text: 'Do work', action: 'run' } }, async action => actions.push(action));
  await event('navigate/demo.native/tools');
  assert.ok(screens.at(-1).navigation.some(nav => nav.label === 'Native Tools'));
  await event('page-action/other/run');
  assert.deepEqual(actions, []);
  await event('page-action/demo.native/run');
  assert.deepEqual(actions, ['run']);
  ui.registerPage('demo.native', null);
  await ui.publish();
  assert.equal(screens.at(-1).page, 'mods');
  assert.equal(screens.at(-1).navigation.some(nav => nav.label === 'Native Tools'), false);
  ui.close();
});

test('a slow market request does not trap navigation or replace the newer page', async () => {
  const { ui, event, screens } = fixture();
  const request = ui.request;
  let release;
  let started;
  const waiting = new Promise(resolve => { started = resolve; });
  ui.request = async (path, ...args) => {
    if (path !== '/api/market') return request(path, ...args);
    started();
    return new Promise(resolve => { release = resolve; });
  };
  try {
    await ui.start();
    const pending = event('navigate/market');
    await waiting;
    await event('navigate/loader');
    assert.equal(screens.at(-1).page, 'loader');
    assert.equal(screens.at(-1).busy, false);
    release({ mods: [] });
    await pending;
    assert.equal(screens.at(-1).page, 'loader');
  } finally { ui.close(); }
});

test('an outdated background refresh cannot clear a newer operation or overwrite its state', async () => {
  const { ui, event, screens } = fixture();
  const request = ui.request;
  let releaseRefresh, releaseMarket;
  try {
    await ui.start();
    ui.visible = true;
    ui.request = (path, ...args) => {
      if (path === '/api/status') return new Promise(resolve => { releaseRefresh = resolve; });
      if (path === '/api/market') return new Promise(resolve => { releaseMarket = resolve; });
      return request(path, ...args);
    };
    const refresh = ui.poll();
    const navigation = event('navigate/market');
    while (!releaseMarket) await new Promise(resolve => setImmediate(resolve));
    releaseRefresh({ locale: 'en', stats: { injects: 999 } });
    await refresh;
    assert.equal(ui.busy, true, 'the foreground request still owns the busy state');
    assert.equal(ui.locale, 'zh', 'the stale refresh did not overwrite current state');
    releaseMarket({ mods: [] });
    await navigation;
    assert.equal(screens.at(-1).page, 'market');
    assert.equal(screens.at(-1).busy, false);
    const count = screens.length;
    ui.close();
    await ui.poll();
    assert.equal(screens.length, count);
  } finally { ui.close(); }
});

test('notice identities survive refreshes and distinguish repeated actions', async () => {
  const { ui, event, screens } = fixture();
  try {
    await ui.start();
    ui.message('Saved');
    await ui.publish();
    const first = screens.at(-1).noticeId;
    await ui.publish();
    assert.equal(screens.at(-1).noticeId, first);
    await event('navigate/mods');
    ui.message('Saved');
    await ui.publish();
    assert.equal(screens.at(-1).noticeId, first + 1);
  } finally { ui.close(); }
});

test('a late config response cannot open a drawer over a newer page', async () => {
  const { ui, event, screens } = fixture();
  const request = ui.request;
  let release;
  try {
    await ui.start();
    await event('navigate/mods');
    ui.request = (path, ...args) => path.endsWith('/config')
      ? new Promise(resolve => { release = resolve; }) : request(path, ...args);
    const opening = event('config/demo.native');
    while (!release) await new Promise(resolve => setImmediate(resolve));
    await event('navigate/loader');
    release({ id: 'demo.native', config: {} });
    await opening;
    assert.equal(screens.at(-1).page, 'loader');
    assert.equal(ui.modal, null);
  } finally { ui.close(); }
});

test('last native page survives a fresh UI instance and rapid navigation saves in order', async () => {
  const { ui, event, preferences } = fixture();
  let restarted;
  try {
    await ui.start();
    await Promise.all([event('navigate/mods'), event('navigate/market')]);
    assert.equal(ui.page, 'market');
    assert.equal(preferences.lastShinawasePage, 'market');
    ui.close();
    restarted = new ZankyoUi(ui.session, { request: ui.request, version: '1.0' });
    await restarted.start();
    assert.equal(restarted.ui.lastShinawasePage, 'market');
  } finally { ui.close(); restarted?.close(); }
});

test('native config validates integers and replaces schema-less JSON without retaining removed keys', async () => {
  const { ui, calls, screens, event } = fixture();
  try {
    await ui.start();
    await event('navigate/mods');
    await event('config/demo.native');
    await event('config-save', { 'cfg/count': '1.5' });
    assert.match(screens.at(-1).notice, /integer/);
    assert.equal(calls.some(call => call.method === 'PUT' && call.path.endsWith('/config')), false);
    ui.modal = { kind: 'config', id: 'demo.native', config: { removed: true, keep: 1 } };
    await ui.publish();
    await event('config-save', { 'config-json': '{"keep":2}' });
    assert.deepEqual(calls.findLast(call => call.path.endsWith('/config') && call.method === 'PUT').body, { config: { keep: 2 } });
  } finally { ui.close(); }
});

test('original first-use consent persists only the exact phrase and prevents navigation around it', async () => {
  const { ui, calls, screens, event } = fixture();
  const request = ui.request;
  ui.request = async (path, ...args) => path === '/api/disclaimer' && !args.length
    ? { accepted: false, phrase: '我同意' } : request(path, ...args);
  try {
    await ui.start();
    assert.ok(flatten(screens.at(-1).modal).some(node => node.id === 'consent'));
    await event('navigate/mods');
    assert.equal(screens.at(-1).page, 'loader');
    await event('consent-submit', { consent: 'wrong' });
    assert.equal(calls.some(call => call.path === '/api/disclaimer'), false);
    await event('consent-submit', { consent: '我同意' });
    assert.ok(calls.some(call => call.path === '/api/disclaimer' && call.body.consent === '我同意'));
    assert.equal(screens.at(-1).modal, null);
  } finally { ui.close(); }
});
