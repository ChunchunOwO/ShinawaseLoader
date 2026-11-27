import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createPage } from '../ShinawaseLoader/zankyo-page.mjs';
import { createMediaRelay } from '../ShinawaseLoader/zankyo-media.mjs';
import { ZankyoProviders } from '../ShinawaseLoader/zankyo-providers.mjs';
import { ZankyoMods } from '../ShinawaseLoader/zankyo-mods.mjs';

const require = createRequire(import.meta.url);
const entry = name => require(`../examples/${name}/echomod/zankyo/mod.cjs`);
const flatten = node => node ? [node, ...(node.children || []).flatMap(flatten)] : [];
const originalFetch = globalThis.fetch;
const track = { sequence: 1, title: 'Test Song', artist: 'Artist', metadata: { album: 'Album' }, durationSeconds: 180,
  mvTrack: { id: 'Local:1', title: 'Test Song', artist: 'Artist', durationSeconds: 180 } };

function fixture(id) {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-port-'));
  let settings = {}, media = structuredClone(track), action, screen;
  const calls = [], providers = new Map(), intervals = new Map(), relays = [];
  const ncm = { cloudsearch: async () => ({ body: { code: 200, result: { songCount: 1, songs: [{
    id: 1, name: 'Test Song', ar: [{ name: 'Artist' }], al: { name: 'Album' }, dt: 180000,
  }] } } }), song_url_v1: async () => ({ body: { data: [{ url: 'https://media.test/audio', type: 'mp3', br: 320000 }] } }) };
  const ctx = {
    id, config: {}, dataRoot: root,
    settings: { get: () => structuredClone(settings), set: patch => structuredClone(settings = { ...settings, ...patch }) },
    timers: { setInterval: callback => { const key = {}; intervals.set(key, callback); return key; },
      clearInterval: key => intervals.delete(key) },
    importDependency: name => {
      assert.equal(name, '@neteasecloudmusicapienhanced/api');
      return ncm;
    },
    zankyo: {
      providers: { plugin: `shinawase.${id}`, register: async (kind, id, _, handlers) => providers.set(`${kind}/${id}`, handlers) },
      media: { createRelay: async () => { const relay = await createMediaRelay(); relays.push(relay); return relay; } },
      settings: { set: async patch => calls.push(['settings.set', patch]) },
      core: async (method, input) => {
        calls.push([method, input]);
        if (method === 'media.current') return structuredClone(media);
        if (method === 'lyrics.search') return providers.get(`lyrics/${input.source.provider}`).lookup({
          track: input.track, signal: AbortSignal.timeout(1000), automatic: false,
        });
        return null;
      },
      call: async (method, input) => { calls.push([method, input]); return { enabled: input?.enabled }; },
      ui: {
        createPage: descriptor => createPage({
          onAction: handler => { action = handler; return () => { action = null; }; },
          page: (_, value) => { screen = value.body; return () => { screen = null; }; },
        }, descriptor),
        choosePath: async () => [join(root, 'sample.mp4')],
        openUrl: async url => calls.push(['openUrl', url]),
      },
    },
  };
  return {
    ctx, root, providers, calls, relays, intervals, ncm,
    action: (name, fields) => action(name, fields), nodes: () => flatten(screen),
    settings: () => settings, media: value => { media = value; },
    close() { for (const relay of relays) relay.close(); rmSync(root, { recursive: true, force: true }); },
  };
}

test('Streaming external entry searches, submits stable queue references and resolves a credentialed relay', async t => {
  const f = fixture('echo.community-streaming');
  let disposed;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const address = new URL(url);
    if (address.hostname === 'media.test') {
      assert.equal(init.headers.Cookie, 'secret-cookie');
      return new Response('audio', { status: 206, headers: { 'Content-Range': 'bytes 0-4/5' } });
    }
    assert.equal(address.hostname, 'music.163.com');
    return new Response(JSON.stringify({ code: 200, songs: [{ id: 1, name: 'Test Song',
      artists: [{ name: 'Artist' }], album: { name: 'Album' }, duration: 180000 }] }));
  });
  try {
    disposed = await entry('ECHO-Streaming').activate(f.ctx);
    assert.equal(f.providers.size >= 8, true);
    await f.action('search', { 'stream-query': 'Test Song' });
    assert.ok(f.nodes().some(node => node.text?.includes('Test Song')));
    await f.action('play/0');
    const queue = f.calls.find(([method]) => method === 'queue.submit')[1];
    assert.equal(queue.tracks[0].source.plugin, 'shinawase.echo.community-streaming');
    assert.equal(queue.tracks[0].track.providerTrackId, '1');
    assert.equal(JSON.stringify(queue).includes('url'), false);
    await f.action('save-account', { 'stream-cookie': 'secret-cookie' });
    assert.equal(f.settings().accounts.netease.cookie, 'secret-cookie');
    assert.equal(JSON.stringify(f.nodes()).includes('secret-cookie'), false);
    const resolved = await f.providers.get('sources/netease').resolve({ providerTrackId: '1', signal: AbortSignal.timeout(2000) });
    assert.equal(resolved.title, 'Test Song');
    assert.equal(resolved.lyricsProvider, 'netease');
    const relayUrl = resolved.url;
    const response = await originalFetch(relayUrl, { headers: { Range: 'bytes=0-4' } });
    assert.equal(await response.text(), 'audio');
    disposed(); disposed = null;
    assert.equal(f.nodes().length, 0);
    assert.equal(f.intervals.size, 0);
    await assert.rejects(originalFetch(relayUrl));
  } finally { disposed?.(); f.close(); }
});

test('MV external session binds a local candidate, serves ranges and retires video on deactivate', async () => {
  const f = fixture('echo.mv');
  let disposed;
  try {
    writeFileSync(join(f.root, 'sample.mp4'), 'video-data');
    disposed = await entry('ECHO-MV').activate(f.ctx);
    await f.action('local');
    const handlers = f.providers.get('mv/network');
    const status = await handlers.status();
    assert.equal(status.video.trackId, 'Local:1');
    assert.match(status.video.url, /^http:\/\/127\.0\.0\.1:\d+\/mv-[a-f0-9]{48}\.mp4$/u);
    assert.equal(await (await originalFetch(status.video.url, { headers: { Range: 'bytes=2-5' } })).text(), 'deo-');
    await assert.rejects(handlers.select({ trackId: 'Local:other', candidateId: 'x' }), /曲目/);
    await handlers.deactivate();
    assert.equal((await handlers.status()).video, null);
    assert.equal((await originalFetch(status.video.url)).status, 404);
    disposed(); disposed = null;
    assert.equal(f.intervals.size, 0);
    assert.equal(f.nodes().length, 0);
  } finally { disposed?.(); f.close(); }
});

test('lyrics external entry retains full preview, applies the captured sequence and remembers choices', async t => {
  const f = fixture('echo.lyrics-match-whitebox');
  let disposed;
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(new URL(url).hostname, 'lrclib.net');
    return new Response(JSON.stringify([{ id: 123, trackName: 'Test Song', artistName: 'Artist', albumName: 'Album',
      duration: 180, syncedLyrics: '[00:01.00]Test lyrics', plainLyrics: 'Test lyrics', instrumental: false }]));
  });
  try {
    disposed = await entry('ECHO-LyricsMatchWhitebox').activate(f.ctx);
    assert.equal(f.providers.size, 5);
    await f.action('source/lrclib');
    await f.action('search', {});
    assert.ok(f.nodes().some(node => node.text?.includes('[00:01.00]Test lyrics')));
    await f.action('remember');
    const apply = f.calls.find(([method]) => method === 'lyrics.applyProvider')[1];
    assert.equal(apply.expectedSequence, 1);
    assert.equal(apply.lyrics.syncedLyrics, '[00:01.00]Test lyrics');
    assert.equal(Object.keys(f.settings().choices).length, 1);
    assert.equal(JSON.stringify(f.settings().choices).includes('Test lyrics'), false);
    f.media({ ...track, sequence: 2, title: 'Other song' });
    await f.action('refresh');
    const before = f.calls.filter(([method]) => method === 'lyrics.applyProvider').length;
    await f.action('apply');
    assert.equal(f.calls.filter(([method]) => method === 'lyrics.applyProvider').length, before);
    assert.ok(f.nodes().some(node => node.tone === 'error'));
    disposed(); disposed = null;
    assert.equal(f.intervals.size, 0);
  } finally { disposed?.(); f.close(); }
});

test('provider callbacks can call Core while the polling loop continues; close aborts pending callbacks', async () => {
  const pending = [];
  let respond;
  const root = mkdtempSync(join(tmpdir(), 'shinawase-provider-'));
  const session = { connected: true, call: async (method, params) => {
    if (method === 'providers.poll') return pending.splice(0);
    if (method === 'core.call') {
      if (params.method === 'outer') return new Promise(resolve => {
        respond = resolve; pending.push({ owner: 'fixture', id: 1, method: 'contribution.search', input: { id: 'test' } });
      });
      return 'nested-core-result';
    }
    if (method === 'providers.reply') { respond(params.result); return null; }
    return [];
  } };
  const mods = new ZankyoMods(session);
  try {
    writeFileSync(join(root, 'entry.js'), "await echoExternalMod.zankyo.providers.register('sources','test',{title:'Test'},{search:async()=>({nested:await echoExternalMod.zankyo.core('inner')})});");
    await mods.sync([{ id: 'fixture', manifest: { zankyo: { entry: 'entry.js' } }, directory: root, config: {}, enabled: true }]);
    const core = session.call('core.call', { method: 'outer' });
    await mods.providerEvents();
    assert.deepEqual(await core, { nested: 'nested-core-result' });
    const providers = new ZankyoProviders(async () => {});
    await providers.register('sources', 'stall', { title: 'Stall' }, { search: async () => new Promise(() => {}) });
    const callback = providers.dispatch({ method: 'contribution.search', input: { id: 'stall' } });
    providers.close();
    await assert.rejects(callback);
  } finally { await mods.close(); rmSync(root, { recursive: true, force: true }); }
});

test('CJS package dependencies reload after edits, including recovery from a failed module', async () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-modules-'));
  const calls = [];
  const mods = new ZankyoMods({ connected: false, call: async (method, params) => { calls.push([method, params]); return []; } });
  const pkg = { id: 'modules', manifest: { zankyo: { entry: 'entry.js' } }, directory: root, config: {}, enabled: true };
  try {
    writeFileSync(join(root, 'entry.js'), "const mod=await echoExternalMod.importModule('child.cjs'); await echoExternalMod.zankyo.core('value',mod);");
    writeFileSync(join(root, 'child.cjs'), 'module.exports={version:1};');
    assert.equal((await mods.sync([pkg]))[0].state, 'loaded');
    writeFileSync(join(root, 'child.cjs'), 'throw new Error("broken module");');
    assert.equal((await mods.sync([pkg]))[0].state, 'error');
    writeFileSync(join(root, 'child.cjs'), 'module.exports={version:2};');
    assert.equal((await mods.sync([pkg]))[0].state, 'loaded');
    assert.equal(calls.filter(([method]) => method === 'core.call').at(-1)[1].input.version, 2);
  } finally { await mods.close(); rmSync(root, { recursive: true, force: true }); }
});

test('active manifests preserve Electron entries and declare separate external Zankyo entries', () => {
  for (const name of ['ECHO-Streaming', 'ECHO-MV', 'ECHO-LyricsMatchWhitebox']) {
    const manifest = JSON.parse(readFileSync(new URL(`../examples/${name}/echomod/echo.mod.json`, import.meta.url)));
    assert.equal(manifest.entry, 'mod.js');
    assert.equal(manifest.zankyo.entry, 'zankyo.js');
    const source = readFileSync(new URL(`../examples/${name}/echomod/zankyo.js`, import.meta.url), 'utf8');
    new (Object.getPrototypeOf(async function () {}).constructor)('echoExternalMod', source);
  }
});

test('MV quality changes work before playback starts and Lyrics survives loading preferences', async () => {
  const mv = fixture('echo.mv');
  mv.media(null);
  let mvDisposed, lyricsDisposed;
  try {
    mvDisposed = await entry('ECHO-MV').activate(mv.ctx);
    await mv.action('quality/1080p');
    const lyrics = fixture('echo.lyrics-match-whitebox');
    let ready = false;
    lyrics.ctx.config = { forceEnable: true };
    lyrics.ctx.zankyo.call = async (method, input) => {
      lyrics.calls.push([method, input]);
      if (method === 'ui.lyricsProvider') {
        if (!ready) throw new Error('lyrics preferences still loading');
        return { enabled: input?.enabled === true, source: input?.source || null };
      }
      return null;
    };
    try {
      lyricsDisposed = await entry('ECHO-LyricsMatchWhitebox').activate(lyrics.ctx);
      assert.ok(lyrics.nodes().some(node => node.text === '启用白盒自动匹配'));
      ready = true;
      await lyrics.action('refresh');
      assert.ok(lyrics.nodes().some(node => node.text === '自动匹配：开'));
    } finally { lyricsDisposed?.(); lyrics.close(); }
  } finally { mvDisposed?.(); mv.close(); }
});
