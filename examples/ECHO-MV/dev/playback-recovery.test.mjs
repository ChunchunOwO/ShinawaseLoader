import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./mod.logic.js', import.meta.url), 'utf8');
function fixture() {
  let now = 10000;
  const reloads = [];
  const context = {
    Date: { now: () => now }, Promise, console,
    state: { selectedVideo: { id: 'mv', provider: 'bilibili' }, settings: {}, audioClock: { playbackRate: 1, positionSeconds: 30 }, isAudioPlaying: true },
    refs: {}, lastBgKey: 'old', SYNC_COOLDOWN_MS: 1000,
    SYNC_PROFILES: { balanced: { toleranceSeconds: 0.45, hardSeekSeconds: 2, maxRateDelta: 0.12 } },
    DIRECT_BILI_SYNC: { toleranceSeconds: 0.18, hardSeekSeconds: 0.75, maxRateDelta: 0.18 },
    silenceVideo() {}, shouldFollowMusic: () => true, isEchoLive: () => false,
    isDirectBili: () => false, panelActive: () => true, lyricsVisible: () => true,
    targetVideoTime: (_video, clock) => clock.positionSeconds,
    signedDrift: (video, target) => target - video.currentTime,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    syncYoutube() {}, scheduleRender() {}, loadSelected: (options) => { reloads.push(options); },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const videoRuntime ='), source.indexOf('const currentQueueTrack ='))
    + source.slice(source.indexOf('const applyRate ='), source.indexOf('const unavailableReason ='))
    + '\nglobalThis.api = { syncOne, syncVideos, maintainVideoPlayback, runtimeForVideo, releaseVideo };', context);
  const video = {
    isConnected: true, readyState: 4, seeking: false, paused: false, currentTime: 0, plays: 0,
    play() { this.plays++; this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; }, removeAttribute() {}, load() {},
  };
  context.refs.backgroundVideo = video;
  return { context, video, reloads, advance: (ms) => { now += ms; }, ...context.api };
}

test('background-only playback observes seek cooldown and an in-flight seek', () => {
  const f = fixture();
  assert.equal(f.syncOne(f.video), true);
  f.video.currentTime = 0;
  f.advance(250);
  assert.equal(f.syncOne(f.video), false);
  f.advance(1000);
  f.video.seeking = true;
  assert.equal(f.syncOne(f.video), false);
  f.video.seeking = false;
  assert.equal(f.syncOne(f.video), true);
});

test('seeking on one element cannot block another, and user seeks bypass cooldown', () => {
  const f = fixture();
  f.context.state.seeking = true; // obsolete global flag must have no effect
  assert.equal(f.syncOne(f.video), true);
  f.video.currentTime = 0;
  f.video.seeking = true;
  assert.equal(f.syncOne(f.video, { force: true }), true);
  assert.equal(f.syncOne({ ...f.video, seeking: false, currentTime: 0 }), true);
});

test('audio pause/resume restarts an existing video without rebuilding it', async () => {
  const f = fixture();
  f.context.state.isAudioPlaying = false;
  f.syncVideos();
  assert.equal(f.video.paused, true);
  f.context.state.isAudioPlaying = true;
  f.syncVideos();
  f.syncVideos();
  await Promise.resolve();
  assert.equal(f.video.paused, false);
  assert.equal(f.video.plays, 1);
  assert.equal(f.reloads.length, 0);
});

test('stalled seek gets one refresh, persistent failure exposes an error', () => {
  const f = fixture();
  f.video.seeking = true;
  f.video.readyState = 1;
  for (let i = 0; i < 49; i++) { f.maintainVideoPlayback(f.video); f.advance(250); }
  assert.equal(f.reloads.length, 1);
  assert.equal(f.reloads[0].forceRefresh, true);
  for (let i = 0; i < 49; i++) { f.maintainVideoPlayback(f.video); f.advance(250); }
  assert.equal(f.reloads.length, 1);
  assert.equal(f.context.state.videoError, true);
});

test('paused, hidden, detached, and normally advancing video do not trigger recovery', () => {
  const f = fixture();
  for (let i = 0; i < 60; i++) {
    f.video.currentTime += 0.25;
    f.maintainVideoPlayback(f.video);
    f.advance(250);
  }
  f.context.state.isAudioPlaying = false;
  for (let i = 0; i < 60; i++) { f.maintainVideoPlayback(f.video); f.advance(250); }
  f.context.lyricsVisible = () => false;
  f.context.state.isAudioPlaying = true;
  f.advance(60000);
  f.syncVideos();
  f.context.lyricsVisible = () => true;
  f.maintainVideoPlayback(f.video);
  f.video.isConnected = false;
  f.advance(60000);
  f.maintainVideoPlayback(f.video);
  assert.equal(f.reloads.length, 0);
});

test('metadata must be ready before writing currentTime', () => {
  const f = fixture();
  f.video.readyState = 0;
  assert.equal(f.syncOne(f.video, { force: true }), false);
  assert.equal(f.video.currentTime, 0);
});
