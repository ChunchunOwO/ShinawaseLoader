import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./mod.logic.js', import.meta.url), 'utf8');
function fixture({ visible = true, enabled = true } = {}) {
  const loads = [];
  const calls = [];
  const waits = [];
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
  const context = {
    CustomEvent, disposed: false, lastPanelSignature: '',
    state: { settings: { enabled, autoSearch: true, autoPreload: true }, viewMode: 'lyrics', viewRequestId: 0, requestId: 0, trackId: 'song', isAudioPlaying: true },
    refs: { youtubeIframe: {}, foregroundVideo: {} },
    NAV_LYRICS_EVENT: 'app:navigate:lyrics', performance: { now: () => 1000 },
    document: { hidden: false },
    isLyricsPageVisible: () => visible,
    lyricsPageEl: () => ({}),
    rememberViewMode: (mode) => calls.push(['remember', mode]),
    applyPageFlags() {}, scheduleRender() {},
    loadSelected: async () => { loads.push(context.state.viewMode); },
    commandYoutube: (_iframe, command) => calls.push(['youtube', command]),
    removeBackground: () => calls.push(['removeBackground']),
    releaseVideo: () => calls.push(['releaseVideo']),
    patchSettings: async (patch) => Object.assign(context.state.settings, patch),
    waitForLyricsPage: () => new Promise((resolve) => waits.push(resolve)),
    window: { dispatchEvent: (event) => context.api.onNavigateLyrics(event) },
  };
  vm.createContext(context);
  vm.runInContext(
    source.slice(source.indexOf('const shouldAutoSearch ='), source.indexOf('const applyLocaleFromApp ='))
    + source.slice(source.indexOf('const setViewMode ='), source.indexOf('const onSettingsButtonClick ='))
    + source.slice(source.indexOf('const onNavigateLyrics ='), source.indexOf('const startTimers ='))
    + '\nglobalThis.api = { panelActive, setViewMode, onNavigateLyrics, onMvButtonClick, onLyricsEntryClick };', context);
  return { context, loads, calls, waits, ...context.api,
    navigate: (detail) => context.api.onNavigateLyrics(new CustomEvent(context.NAV_LYRICS_EVENT, { detail })),
    show: () => { visible = true; },
  };
}

test('enabled MV does not activate on normal lyrics navigation', () => {
  const f = fixture();
  f.navigate({ mode: 'lyrics' });
  assert.equal(f.panelActive(), false);
  assert.equal(f.context.state.settings.enabled, true);
  assert.deepEqual(f.loads, []);
});

test('MV entry activates playback; native lyrics button immediately releases it', () => {
  const f = fixture();
  f.onMvButtonClick({});
  assert.equal(f.panelActive(), true);
  assert.ok(f.loads.length > 0);
  const event = { target: { closest: (selector) => selector === 'button.transport-lyrics-button' ? {} : null } };
  f.onLyricsEntryClick(event);
  assert.equal(f.panelActive(), false);
  assert.ok(f.calls.some(([kind, command]) => kind === 'youtube' && command === 'pauseVideo'));
  assert.ok(f.calls.some(([kind]) => kind === 'removeBackground'));
  assert.equal(f.context.refs.foregroundVideo, null);
  assert.equal(f.context.state.settings.enabled, true);
});

test('explicit MV intent survives host lyrics routing, but later lyrics navigation wins', async () => {
  const f = fixture({ visible: false });
  f.onMvButtonClick({});
  assert.equal(f.panelActive(), true);
  assert.equal(f.context.state.viewMode, 'mv');
  f.navigate({ mode: 'lyrics' });
  f.show();
  for (const resolve of f.waits) resolve(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.panelActive(), false);
  assert.deepEqual(f.loads, []);
});

test('navigation without MV intent resets the view; unrelated clicks do not', () => {
  const f = fixture();
  f.navigate({ mode: 'mv' });
  f.onLyricsEntryClick({ target: { closest: () => null } });
  assert.equal(f.panelActive(), true);
  f.navigate(undefined);
  assert.equal(f.panelActive(), false);
});

test('pending play and iframe callbacks cannot start playback in lyrics mode', () => {
  const f = fixture();
  const commands = [];
  f.context.commandYoutube = (_iframe, command) => commands.push(command);
  f.context.silenceVideo = () => {};
  f.context.Date = Date;
  vm.runInContext(source.slice(source.indexOf('const syncYoutube ='), source.indexOf('const silenceVideo ='))
    + source.slice(source.indexOf('const videoRuntime ='), source.indexOf('const currentQueueTrack ='))
    + '\nglobalThis.play = playVideo; globalThis.syncIframe = syncYoutube;', f.context);
  let played = 0;
  f.context.play({ isConnected: true, play: () => { played++; } });
  f.context.syncIframe({});
  assert.equal(played, 0);
  assert.ok(commands.includes('pauseVideo'));
  assert.equal(commands.includes('playVideo'), false);
});
