// Regressions from aligning the asar patches with echo-steam 26.10.22-26.10.25,
// the first builds bundled by Vite 8 / rolldown: tab indentation, braces
// dropped from single-statement branches, multi-line object literals, no
// comments, module-level `var` helpers, a code-split main process and
// `(0,c.useMemo)(...)` hook calls in the renderer. Synthetic bundle shapes
// only; no extracted ECHO source.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAuxiliaryWindowCrashFix, applyRepeatOneIdentityFix, patch, patchLyricsPage, patchPlayback, verifyAnchors } from '../ShinawaseLoader/echo-asar.mjs';

const tabs = (lines) => lines.join('\n');

const mediaModule = tabs([
  'var isWorkshopSourceReference = (value) => value.startsWith("echo-workshop-source:");',
  'var resolveWorkshopPlaybackSource = async (value) => `https://workshop.example/${value}`;',
  'var decodeM3u8ProviderTrackId = (value) => value;',
  'var createProbeHintForMediaItem = () => ({});',
  'var resolvePodcastPlaybackSource = async (path) => path;',
  'globalThis.validate = (input) => {',
  '\tconst mediaType = input.mediaType;',
  '\tif (mediaType === "streaming") {',
  '\t\tconst provider = input.provider;',
  '\t\tconst providerTrackId = input.providerTrackId;',
  '\t\tconst radioUrl = provider === "m3u8" ? decodeM3u8ProviderTrackId(providerTrackId).trim() : "";',
  '\t\tif (provider !== "m3u8" || !isWorkshopSourceReference(radioUrl) && !/^https?:\\/\\/\\S+$/iu.test(radioUrl)) throw new Error("Music streaming playback is not available in the Steam distribution.");',
  '\t\treturn {',
  '\t\t\tmediaType,',
  '\t\t\tprovider,',
  '\t\t\tproviderTrackId,',
  '\t\t\tquality: "standard",',
  '\t\t\tstableKey: input.stableKey',
  '\t\t};',
  '\t}',
  '\treturn { mediaType };',
  '};',
  'globalThis.resolve = async (item, durationSeconds) => {',
  '\tlet filePath;',
  '\tlet probe = createProbeHintForMediaItem(item, durationSeconds ? { durationSeconds } : void 0);',
  '\tif (item.mediaType === "remote") filePath = "remote";',
  '\telse if (item.mediaType === "streaming") {',
  '\t\tconst source = decodeM3u8ProviderTrackId(item.providerTrackId).trim();',
  '\t\tfilePath = isWorkshopSourceReference(source) ? await resolveWorkshopPlaybackSource(source) : source;',
  '\t} else filePath = item.trackId.startsWith("podcast:") ? await resolvePodcastPlaybackSource(item.path) : item.path;',
  '\treturn {',
  '\t\tfilePath,',
  '\t\tmimeType: null,',
  '\t\tprobe,',
  '\t\tdurationSeconds',
  '\t};',
  '};',
]);

test('streaming playback patch covers the rolldown media resolver', async () => {
  const patched = patchPlayback(mediaModule);
  assert.notEqual(patched, mediaModule);
  assert.equal(patchPlayback(patched), patched, 'idempotent');
  const context = { __shinawaseResolveStreamingPlayback: async ({ provider, providerTrackId, quality }) => ({ url: `https://cdn.example/${provider}/${providerTrackId}.flac?q=${quality}`, headers: { A: '1' }, sampleRate: 96000, mimeType: 'audio/flac' }) };
  vm.runInNewContext(patched, context);
  const request = context.validate({ mediaType: 'streaming', provider: 'netease', providerTrackId: '1', stableKey: 'k', quality: 'lossless' });
  assert.equal(request.quality, 'lossless', 'the requested quality is passed through');
  assert.throws(() => context.validate({ mediaType: 'streaming', provider: 'm3u8', providerTrackId: 'not a url' }), /must be valid/u);
  assert.equal(context.validate({ mediaType: 'streaming', provider: 'm3u8', providerTrackId: 'echo-workshop-source:abc' }).provider, 'm3u8');
  const netease = await context.resolve({ mediaType: 'streaming', provider: 'netease', providerTrackId: '1', quality: 'lossless' }, 200);
  assert.equal(netease.filePath, 'https://cdn.example/netease/1.flac?q=lossless');
  assert.deepEqual({ ...netease.inputHeaders }, { A: '1' });
  assert.equal(netease.mimeType, 'audio/flac');
  assert.equal(netease.probe.fileSampleRate, 96000);
  const radio = await context.resolve({ mediaType: 'streaming', provider: 'm3u8', providerTrackId: 'https://radio.example/live.m3u8' }, null);
  assert.equal(radio.filePath, 'https://radio.example/live.m3u8');
  assert.equal(radio.mimeType, null);
  const workshop = await context.resolve({ mediaType: 'streaming', provider: 'm3u8', providerTrackId: 'echo-workshop-source:abc' }, null);
  assert.equal(workshop.filePath, 'https://workshop.example/echo-workshop-source:abc');
  const local = await context.resolve({ mediaType: 'local', trackId: 'local:1', path: 'D:/a.flac' }, null);
  assert.equal(local.filePath, 'D:/a.flac', 'the branch after the streaming one is untouched');
});

test('a brace-less single-statement streaming branch is patched too', async () => {
  const bare = mediaModule
    .replace('\telse if (item.mediaType === "streaming") {\n\t\tconst source = decodeM3u8ProviderTrackId(item.providerTrackId).trim();\n\t\tfilePath = isWorkshopSourceReference(source) ? await resolveWorkshopPlaybackSource(source) : source;\n\t} else', '\telse if (item.mediaType === "streaming") filePath = decodeM3u8ProviderTrackId(item.providerTrackId).trim();\n\telse');
  assert.notEqual(bare, mediaModule);
  const context = { __shinawaseResolveStreamingPlayback: async () => ({ url: 'https://cdn.example/x.flac' }) };
  vm.runInNewContext(patchPlayback(bare), context);
  assert.equal((await context.resolve({ mediaType: 'streaming', provider: 'qq', providerTrackId: '1' }, 1)).filePath, 'https://cdn.example/x.flac');
  assert.equal((await context.resolve({ mediaType: 'streaming', provider: 'm3u8', providerTrackId: 'https://r.example/a.m3u8' }, 1)).filePath, 'https://r.example/a.m3u8');
  assert.equal((await context.resolve({ mediaType: 'local', trackId: 'local:1', path: 'D:/a.flac' }, 1)).filePath, 'D:/a.flac');
});

const audioSessionModule = tabs([
  'var isRemoteQueueTrack = (id) => /^remote:/u.test(id);',
  'var isHttp = (path) => /^https?:\\/\\//u.test(path);',
  'var prepareDaemonQueue = async (snapshot, resolveRemote, isCurrent, currentSource) => {',
  '\tif (!snapshot.items.some((item) => isRemoteQueueTrack(item.trackId) || isHttp(item.filePath))) return snapshot;',
  '\treturn snapshot;',
  '};',
  'globalThis.prepare = prepareDaemonQueue;',
  'globalThis.AudioSession = class AudioSession {',
  '\temit(name, value) {',
  '\t\tthis.events.push(value.nextTrackId);',
  '\t}',
  '\tgetStatus() {',
  '\t\treturn {};',
  '\t}',
  '\tonAdvance(params) {',
  '\t\tif (params?.queueAdvance === true) this.handleQueueAdvance(params);',
  '\t}',
  '\thandleQueueAdvance(params) {',
  '\t\tthis.nativeQueueAdvanceSerial += 1;',
  '\t\tthis.emit("track-advance", {',
  '\t\t\tstatus: this.getStatus(),',
  '\t\t\tnextTrackId: typeof params.nextTrackId === "string" ? params.nextTrackId : null',
  '\t\t});',
  '\t\tthis.currentTrackId = typeof params.nextTrackId === "string" ? params.nextTrackId : null;',
  '\t\tthis.currentQueueItemId = typeof params.nextItemId === "string" ? params.nextItemId : null;',
  '\t}',
  '};',
]);

test('repeat-one identity and the daemon queue guard reach the 26.10.25 AudioSession', async () => {
  const patched = applyRepeatOneIdentityFix(audioSessionModule);
  assert.equal(applyRepeatOneIdentityFix(patched), patched, 'idempotent');
  assert.equal((patched.match(/shinawase-repeat-one-identity-v1/gu) || []).length, 1, 'the call site is not mistaken for the method');
  const context = {};
  vm.runInNewContext(patched, context);
  const audio = Object.assign(new context.AudioSession(), { events: [], nativeQueueAdvanceSerial: 0, queueSnapshot: { repeatMode: 'one' }, currentTrackId: 'streaming:netease:1', currentQueueItemId: 'q1', currentTrackMetadata: null });
  audio.onAdvance({ queueAdvance: true, nextFilePath: 'https://cdn.example/1.flac' });
  assert.equal(audio.currentTrackId, 'streaming:netease:1');
  assert.equal(audio.nativeQueueAdvanceSerial, 1, 'ECHO\'s own bookkeeping still runs');
  assert.deepEqual([...audio.events], ['streaming:netease:1']);
  const current = { kind: 'http', uri: 'https://cdn.example/1.flac' };
  const queue = await context.prepare({ currentItemId: 'q1', repeatMode: 'one', items: [{ itemId: 'q1', trackId: 'streaming:netease:1', filePath: 'streaming:netease:1' }] }, null, () => true, current);
  assert.deepEqual(JSON.parse(JSON.stringify(queue.items)), [{ itemId: 'q1', trackId: 'streaming:netease:1', filePath: 'streaming:netease:1', source: current }]);
});

const windowModule = tabs([
  'var miniPlayerMenuOpen = false;',
  'var miniPlayerWindowsTopmostLevel = "pop-up-menu";',
  'var isMiniPlayerForcedTopmost = () => true;',
  'var linuxOverlayBrowserWindowOptions = () => ({});',
  'var applyOverlayAlwaysOnTop = (window) => {',
  '\twindow.raised.push("overlay");',
  '};',
  'var applyMiniPlayerAlwaysOnTop = (window) => {',
  '\tif (window.isDestroyed() || miniPlayerMenuOpen) return;',
  '\tif (process.platform === "win32") {',
  '\t\twindow.setAlwaysOnTop(true, miniPlayerWindowsTopmostLevel);',
  '\t\treturn;',
  '\t}',
  '\tapplyOverlayAlwaysOnTop(window);',
  '};',
  'var applyDesktopLyricsAlwaysOnTop = (window) => {',
  '\twindow.setAlwaysOnTop(true, miniPlayerWindowsTopmostLevel);',
  '};',
  'var applyPetAlwaysOnTop = (window, platform = process.platform) => {',
  '\tif (platform === "win32") {',
  '\t\twindow.setAlwaysOnTop(true);',
  '\t\treturn;',
  '\t}',
  '\tapplyOverlayAlwaysOnTop(window, platform);',
  '};',
  'globalThis.options = {',
  '\tskipTaskbar: true,',
  '\tshow: false,',
  '\talwaysOnTop: isMiniPlayerForcedTopmost(),',
  '\t...linuxOverlayBrowserWindowOptions(),',
  '\twebPreferences: {}',
  '};',
  'globalThis.helpers = { applyMiniPlayerAlwaysOnTop, applyDesktopLyricsAlwaysOnTop, applyPetAlwaysOnTop };',
]);

test('var-declared topmost helpers and the comment-free constructor are deferred', () => {
  const patched = applyAuxiliaryWindowCrashFix(windowModule);
  assert.equal((patched.match(/shinawase-defer-topmost/gu) || []).length, 3);
  assert.equal(applyAuxiliaryWindowCrashFix(patched), patched, 'idempotent');
  assert.match(patched, /^var applyPetAlwaysOnTop = \/\* shinawase-defer-topmost \*\//mu, 'the declaration keyword is kept');
  let now = 1000;
  const timers = [];
  const context = { process: { platform: 'win32' }, Date: { now: () => now }, setTimeout: (fn, ms) => timers.push({ fn, ms }), WeakMap, Math };
  vm.runInNewContext(patched, context);
  assert.equal(context.options.alwaysOnTop, false, 'constructed non-topmost');
  const window = { raised: [], isDestroyed: () => false, setAlwaysOnTop(...args) { this.raised.push(args); } };
  context.helpers.applyMiniPlayerAlwaysOnTop(window);
  assert.deepEqual(window.raised, []);
  assert.equal(timers[0].ms, 600);
  now += 700;
  timers.shift().fn();
  assert.deepEqual(window.raised, [[true, 'pop-up-menu']]);
});

test('lyrics memos called as (0,c.useMemo) are stabilized', () => {
  // A neighbouring memo with its own `return{trackId:...}` must not be
  // swallowed into the snapshot match.
  const page = [
    'const memo=[];let slot=0;',
    'const c={useRef(value){const prev=memo[slot];const ref=prev||{current:value};memo[slot]=ref;slot+=1;return ref;},useMemo(fn,deps){const prev=memo[slot];let value;if(prev&&prev.deps&&prev.deps.length===deps.length&&prev.deps.every((d,i)=>Object.is(d,deps[i])))value=prev.value;else{value=fn();memo[slot]={deps,value};}slot+=1;return value;}};',
    'const di=e=>e?.mediaType==="streaming";',
    'globalThis.render=(j,E)=>{slot=0;const o=(0,c.useMemo)(()=>{if(!j)return null;return{trackId:E,lines:[]}},[j,E]),he=(0,c.useMemo)(()=>di(j)&&!j.isLiveStream?{provider:j.provider,providerTrackId:j.providerTrackId}:null,[j]),Le=(0,c.useMemo)(()=>{if(!E)return null;const p=j?.id??E;return{trackId:p,title:j.title,artist:j.artist,album:j.album,albumArtist:j.albumArtist,durationSeconds:j.duration,mediaType:j.mediaType,sourceId:j.providerTrackId,stableKey:j.stableKey}},[j,E]);return{o,he,Le};};',
  ].join('\n');
  const patched = patchLyricsPage(page);
  assert.equal(patchLyricsPage(patched), patched, 'idempotent');
  assert.equal((patched.match(/Le__shinawaseLyricsSnapshot=c\.useRef\(null\)/gu) || []).length, 1);
  assert.ok(!patched.includes('o__shinawaseLyricsSnapshot'), 'the neighbouring memo is left alone');
  const context = {};
  vm.runInNewContext(patched, context);
  const track = () => ({ id: 'streaming:netease:1', mediaType: 'streaming', provider: 'netease', providerTrackId: '1', stableKey: 'k', title: 'T', artist: 'A', album: 'B', albumArtist: 'A', duration: 100 });
  const first = context.render(track(), 'streaming:netease:1');
  const second = context.render(track(), 'streaming:netease:1');
  assert.equal(second.he, first.he, 'streaming target keeps its identity');
  assert.equal(second.Le, first.Le, 'lyrics snapshot keeps its identity');
  assert.notEqual(context.render({ ...track(), title: 'New' }, 'streaming:netease:1').Le, first.Le);
});

// Minimal asar writer: pickle header, then the file bytes, with Electron's
// per-file integrity so the stock archive looks like a release build.
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const writeAsar = (file, entries) => {
  const tree = { files: {} };
  const blobs = [];
  let offset = 0;
  for (const [path, text] of Object.entries(entries)) {
    const content = Buffer.from(text, 'utf8');
    const parts = path.split('/');
    let node = tree;
    for (const part of parts.slice(0, -1)) node = (node.files[part] ||= { files: {} });
    node.files[parts.at(-1)] = { size: content.length, offset: String(offset), integrity: { algorithm: 'SHA256', hash: sha256(content), blockSize: 4194304, blocks: [sha256(content)] } };
    blobs.push(content);
    offset += content.length;
  }
  const json = Buffer.from(JSON.stringify(tree), 'utf8');
  const payload = Math.ceil((4 + json.length) / 4) * 4;
  const header = Buffer.alloc(4 + payload);
  header.writeUInt32LE(payload, 0);
  header.writeInt32LE(json.length, 4);
  json.copy(header, 8);
  const size = Buffer.alloc(8);
  size.writeUInt32LE(4, 0);
  size.writeUInt32LE(header.length, 4);
  writeFileSync(file, Buffer.concat([size, header, ...blobs]));
};
const readAsar = (file) => {
  const bytes = readFileSync(file);
  const headerSize = bytes.readUInt32LE(4);
  const tree = JSON.parse(bytes.subarray(16, 16 + bytes.readInt32LE(12)).toString('utf8'));
  const result = {};
  const walk = (node, prefix) => {
    for (const [name, info] of Object.entries(node.files)) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (info.files) walk(info, path);
      else result[path] = { text: bytes.subarray(8 + headerSize + Number(info.offset), 8 + headerSize + Number(info.offset) + Number(info.size)).toString('utf8'), integrity: info.integrity };
    }
  };
  walk(tree, '');
  return result;
};

test('a code-split main process gets each fix in the chunk that carries its anchor', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinawase-rolldown-'));
  try {
    mkdirSync(join(root, 'resources'));
    const archive = join(root, 'resources', 'app.asar');
    const ipc = 'export var IpcChannels = { PlaybackPlayMediaItem: "playback:play-media-item", PlaybackResolveMediaItem: "playback:resolve-media-item", PlaybackPrepareMediaItem: "playback:prepare-media-item" };';
    const stock = {
      'package.json': '{"main":"out/main/index.js"}',
      'out/main/index.js': `import { IpcChannels } from "./ipcChannels-a1.js";\n${mediaModule}`,
      'out/main/ipcChannels-a1.js': ipc,
      'out/main/AudioSession-b2.js': audioSessionModule,
      'out/main/createMainWindow-c3.js': windowModule,
      'out/main/unrelated-d4.js': 'export var unrelated = 1;',
      'out/preload/index.mjs': 'import { ipcRenderer } from "electron";\nvar expose = () => {\n\tconst echoApi = {\n\t\tlisten: () => 1\n\t};\n\treturn echoApi;\n};',
      'out/renderer/assets/LyricsPage-e5.js': 'const he=(0,c.useMemo)(()=>di(j)&&!j.isLiveStream?{provider:j.provider,providerTrackId:j.providerTrackId}:null,[j]);',
      'out/renderer/assets/Playlists-f6.js': 'const x=y.filter(i=>i.sourceProvider==="local");',
    };
    writeAsar(archive, stock);
    const before = verifyAnchors(root);
    assert.deepEqual(Object.entries(before.hits).filter(([, ok]) => !ok).map(([name]) => name), [], 'every anchor is found across the chunks');
    const result = patch(root);
    assert.equal(result.status, 'patched');
    assert.equal(result.playbackWarning, undefined);
    assert.equal(patch(root).status, 'already-patched', 'idempotent');
    const files = readAsar(archive);
    assert.match(files['out/main/index.js'].text, /shinawase-loader-bridge-v1/u);
    assert.match(files['out/main/index.js'].text, /shinawase-loader-streaming-playback-v2/u);
    assert.match(files['out/main/AudioSession-b2.js'].text, /shinawase-repeat-one-identity-v1/u);
    assert.match(files['out/main/AudioSession-b2.js'].text, /shinawase-streaming-daemon-queue-v1/u);
    assert.equal((files['out/main/createMainWindow-c3.js'].text.match(/shinawase-defer-topmost/gu) || []).length, 3);
    assert.equal(files['out/main/unrelated-d4.js'].text, stock['out/main/unrelated-d4.js'], 'chunks without anchors are untouched');
    assert.match(files['out/preload/index.mjs'].text, /streaming: createShinawaseStreamingApi/u);
    assert.match(files['out/renderer/assets/LyricsPage-e5.js'].text, /\[di\(j\)&&!j\.isLiveStream,j\?\.provider,j\?\.providerTrackId\]/u);
    for (const path of ['out/main/index.js', 'out/main/AudioSession-b2.js', 'out/main/createMainWindow-c3.js']) {
      assert.equal(files[path].integrity.hash, sha256(Buffer.from(files[path].text, 'utf8')), `${path} integrity follows its new content`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
