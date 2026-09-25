import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { createOnsetDetector, detectAudioOnset, findFfmpeg } = require('../echomod/audio-onset.cjs');
const { createEngine } = require('../echomod/main.cjs');
function pcm(seconds, start = 0, stop = seconds) {
  const bytes = Buffer.alloc(Math.round(seconds * 8000) * 2);
  for (let i = Math.round(start * 8000); i < Math.round(stop * 8000); i++) bytes.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * 440 * i / 8000)), i * 2);
  return bytes;
}
function wav(data) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(data.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24); header.writeUInt32LE(16000, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), 'mv-onset-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('finds leading silence across odd chunk boundaries and preserves a short lead-in', () => {
  const detector = createOnsetDetector();
  const bytes = pcm(2, 1.5);
  let start = null;
  for (let i = 0; i < bytes.length; i += 317) start = detector.push(bytes.subarray(i, i + 317));
  assert.equal(start, 1480);
});
test('sound from frame zero is zero, silence and isolated clicks are not onsets', () => {
  assert.equal(createOnsetDetector().push(pcm(0.2)), 0);
  assert.equal(createOnsetDetector().push(Buffer.alloc(16000)), null);
  assert.equal(createOnsetDetector().push(pcm(1, 0.2, 0.22)), null);
});

test('real FFmpeg decodes a short synthetic sample and reports missing tool/cancellation', async (t) => {
  const ffmpegPath = findFfmpeg();
  if (spawnSync(ffmpegPath, ['-version'], { windowsHide: true, timeout: 3000, stdio: 'ignore' }).status !== 0) return t.skip('FFmpeg is not installed');
  const dir = temporary(t);
  const input = join(dir, 'leading-silence.wav');
  writeFileSync(input, wav(pcm(2, 1.5)));
  const result = await detectAudioOnset({ input, ffmpegPath, timeoutMs: 3000 });
  assert.equal(result.startMs, 1480);
  writeFileSync(input, wav(Buffer.alloc(16000)));
  await assert.rejects(detectAudioOnset({ input, ffmpegPath, timeoutMs: 3000 }), /mv_audio_start_silent/);
  await assert.rejects(detectAudioOnset({ input, ffmpegPath: join(dir, 'missing-ffmpeg') }), /mv_audio_start_ffmpeg_missing/);
  await assert.rejects(detectAudioOnset({ input, signal: AbortSignal.abort() }), /mv_audio_start_cancelled/);
});

test('engine saves an explicit alignment, persists it, and rejects changed selection/offset', async (t) => {
  const dir = temporary(t);
  const input = join(dir, 'fixture.mp4');
  writeFileSync(input, 'fixture');
  let analyses = 0;
  const engine = createEngine({ dataDir: dir, detectAudioOnset: async ({ input: source }) => {
    assert.equal(source, input); analyses++; return { startMs: 1480 };
  } });
  t.after(() => engine.dispose());
  const video = engine.bindLocalVideo({ trackId: 'song', filePath: input });
  engine.setOffset({ trackId: 'song', offsetMs: 500 });
  const result = await engine.detectAudioStart({ videoId: video.id });
  assert.equal(analyses, 1);
  assert.equal(engine.getSelected({ trackId: 'song' }).offsetMs, 500, 'detection alone must not apply');
  const next = engine.applyAudioStart({ trackId: 'song', videoId: video.id, startMs: result.startMs, expectedOffsetMs: 500 });
  assert.equal(next.offsetMs, 1480);
  assert.equal(next.audioStartMs, 1480);
  engine.flush();
  const reloaded = createEngine({ dataDir: dir });
  assert.equal(reloaded.getSelected({ trackId: 'song' }).offsetMs, 1480);
  reloaded.dispose();
  assert.throws(() => engine.applyAudioStart({ trackId: 'song', videoId: video.id, startMs: 1000, expectedOffsetMs: 500 }), /selection_changed/);
  engine.clearSelected({ trackId: 'song' });
  assert.throws(() => engine.applyAudioStart({ trackId: 'song', videoId: video.id, startMs: 1000 }), /selection_changed/);
});

test('Bilibili analysis uses the independent audio stream, not the muted video stream', async (t) => {
  const engine = createEngine({ dataDir: temporary(t), fetchImpl: async (input) => {
    const url = new URL(input);
    let data = {};
    if (url.pathname.endsWith('/view')) data = { cid: 1 };
    if (url.pathname.endsWith('/playurl')) data = { quality: 80, dash: {
      video: [{ id: 80, height: 1080, codecs: 'avc1.640028', baseUrl: 'https://fixture.bilivideo.com/video.m4s' }],
      audio: [{ bandwidth: 64000, codecs: 'mp4a.40.2', baseUrl: 'https://fixture.bilivideo.com/audio.m4s' }],
    } };
    return Response.json({ code: 0, data });
  }, detectAudioOnset: async ({ input }) => {
    assert.equal(input, 'https://fixture.bilivideo.com/audio.m4s');
    return { startMs: 2400 };
  } });
  t.after(() => engine.dispose());
  const video = engine.bindUrl({ trackId: 'song', url: 'https://www.bilibili.com/video/BVfixture' });
  assert.equal((await engine.detectAudioStart({ videoId: video.id })).startMs, 2400);
});

test('renderer ignores an analysis result after switching tracks', async () => {
  let complete;
  const applied = [];
  const context = { disposed: false, state: { trackId: 'old', selectedVideo: { id: 'video', offsetMs: 0 }, audioStartToken: 0 },
    snapshotTrackIdFor: (_track, id) => id, scheduleRender() {},
    mvApi: { detectAudioStart: () => new Promise((r) => { complete = r; }), applyAudioStart: (...args) => applied.push(args) },
  };
  const source = readFileSync(new URL('./mod.logic.js', import.meta.url), 'utf8');
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const cancelAudioStartDetection ='), source.indexOf('const changeOffset =')) + '\nglobalThis.align = alignAudioStart;', context);
  const pending = context.align();
  context.state.trackId = 'new';
  complete({ startMs: 5000 });
  await pending;
  assert.deepEqual(applied, []);
});
