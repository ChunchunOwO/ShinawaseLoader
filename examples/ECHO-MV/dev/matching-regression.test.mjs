import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const { createEngine } = createRequire(import.meta.url)('../echomod/main.cjs');
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const song = { trackId: 'fixture:track', title: '(LTD) Give It to dem (Marathon)', artist: 'Various Artists', durationSeconds: 247, autoSelect: true };
const hit = (bvid, title, author = 'Uploader') => ({ bvid, title, author, mid: bvid, duration: '4:07', play: 100 });

function engineFixture(t, results, options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'mv-regression-'));
  const calls = [];
  const engine = createEngine({ dataDir, fetchImpl: async (input) => {
    const url = new URL(input);
    calls.push(url);
    let data = {};
    if (url.pathname.endsWith('/search/type')) {
      await options.searchGate?.promise;
      data = { result: typeof results === 'function' ? results() : results };
    } else if (url.pathname.endsWith('/view')) {
      if (url.searchParams.get('bvid') === options.blocked) return Response.json({ code: -404, data: {} });
      await options.resolveGate?.promise;
      data = { cid: 123 };
    } else if (url.pathname.endsWith('/playurl')) {
      data = { quality: 80, dash: { video: [{ id: 80, baseUrl: 'https://fixture.bilivideo.com/video.m4s', codecs: 'avc1.640028', width: 1920, height: 1080, frame_rate: '30' }] } };
    }
    return Response.json({ code: 0, data });
  } });
  t.after(() => { engine.dispose(); rmSync(dataDir, { recursive: true, force: true }); });
  return { engine, calls };
}

test('noisy library title auto-selects matching video without Various Artists in search', async (t) => {
  const { engine, calls } = engineFixture(t, [hit('BVfixture1', 'Give it to dem ~Delta~ (Marathon) 95.16%')]);
  const candidates = await engine.searchNetworkCandidatesForSnapshot({ snapshot: song });
  assert.ok(candidates[0].score >= 0.7);
  assert.equal(engine.getSelected({ trackId: song.trackId }).selectionOrigin, 'auto');
  assert.equal(calls.find((url) => url.pathname.endsWith('/search/type')).searchParams.get('keyword'), 'Give It to dem MV');
});

test('CJK text without spaces matches; conflicting cover stays unselected', async (t) => {
  const { engine } = engineFixture(t, [hit('BVfixture2', '周杰伦晴天官方MV', '周杰伦'), hit('BVfixture3', '周杰伦晴天钢琴翻唱')]);
  const candidates = await engine.searchNetworkCandidatesForSnapshot({ snapshot: { ...song, title: '晴天', artist: '周杰伦' } });
  assert.equal(candidates[0].autoEligible, true);
  assert.equal(candidates[1].autoEligible, false);
  assert.equal(engine.getSelected({ trackId: song.trackId }).sourceId, 'BVfixture2');
});

test('failed first candidate falls through to another uploader and searches are reused', async (t) => {
  const gate = deferred();
  const { engine, calls } = engineFixture(t, [hit('BVbad', 'Give It to dem Official MV', 'First'), hit('BVgood', 'Give It to dem Official MV', 'Second')], { blocked: 'BVbad', searchGate: gate });
  const first = engine.searchNetworkCandidatesForSnapshot({ snapshot: song });
  const second = engine.searchNetworkCandidatesForSnapshot({ snapshot: song });
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(engine.getSelected({ trackId: song.trackId }).sourceId, 'BVgood');
  await engine.searchNetworkCandidatesForSnapshot({ snapshot: song });
  assert.equal(calls.filter((url) => url.pathname.endsWith('/search/type')).length, 1);
});

test('clear selection during resolution prevents late automatic commit', async (t) => {
  const gate = deferred();
  const { engine, calls } = engineFixture(t, [hit('BVfixture4', 'Give It to dem Official MV')], { resolveGate: gate });
  const pending = engine.searchNetworkCandidatesForSnapshot({ snapshot: song });
  while (!calls.some((url) => url.pathname.endsWith('/view'))) await new Promise(setImmediate);
  engine.clearSelected({ trackId: song.trackId });
  gate.resolve();
  await pending;
  assert.equal(engine.getSelected({ trackId: song.trackId }), null);
});

test('transient empty searches are not cached', async (t) => {
  let rows = [];
  const { engine } = engineFixture(t, () => rows);
  await engine.searchNetworkCandidatesForSnapshot({ snapshot: song });
  rows = [hit('BVfixture5', 'Give It to dem Official MV')];
  await engine.searchNetworkCandidatesForSnapshot({ snapshot: song });
  assert.equal(engine.getSelected({ trackId: song.trackId }).sourceId, 'BVfixture5');
});

function rendererFixture(overrides = {}) {
  const source = readFileSync(new URL('./mod.logic.js', import.meta.url), 'utf8');
  const state = { trackId: 'a', currentTrack: { id: 'a' }, title: 'Track A', artist: 'Artist', settings: { enabled: true, autoSearch: true }, requestId: 0, isAudioPlaying: false };
  const calls = [];
  const context = {
    state, disposed: false, Date, Promise,
    lyricsVisible: () => true, panelActive: () => true, shouldAutoSearch: () => true,
    loadSettings: async () => state.settings, scheduleRender() {}, toast() {},
    snapshotTrackIdFor: (_track, id) => id,
    snapshotFromTrack: (_track, id, extras) => ({ trackId: id, ...extras }),
    shouldUseSnapshotSearch: () => true,
    isMvDatabaseError: () => false, youtubeEmbedUrl: () => null,
    isPlayableVideo: (v) => Boolean(v?.playableInApp && v.mediaUrl),
    isUnplayableSearchCandidate: (v) => Boolean(v && v.sourceType === 'search_candidate' && !v.playableInApp),
    summarizeLoadError: String,
    mvApi: { getSelected: async () => null, resolveStreams: async () => null,
      searchNetworkCandidatesForSnapshot: async (snapshot) => { calls.push(snapshot.trackId); return []; }, ...overrides },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const resolveNetworkVideo ='), source.indexOf('let playbackRefresh =')) + '\nglobalThis.load = loadSelected;', context);
  return { state, calls, load: context.load };
}

test('renderer coalesces navigation loads and retries after a transient miss', async () => {
  const { state, calls, load } = rendererFixture();
  const first = load();
  assert.equal(load(), first);
  await first;
  assert.deepEqual(calls, ['a']);
  state.lastSearchAt = Date.now() - 13000;
  await load({ preserveCurrent: true });
  assert.deepEqual(calls, ['a', 'a']);
  assert.equal(state.isLoading, false);
});

test('late selection lookup from the previous track cannot search or replace the current track', async () => {
  const gate = deferred();
  const { state, calls, load } = rendererFixture({ getSelected: () => gate.promise });
  const pending = load();
  await Promise.resolve();
  state.trackId = 'b';
  state.requestId += 1;
  state.selectedVideo = { id: 'current' };
  gate.resolve({ id: 'old', provider: 'local', playableInApp: true, mediaUrl: 'old.mp4' });
  await pending;
  assert.equal(state.selectedVideo.id, 'current');
  assert.deepEqual(calls, []);
});
