// Synthetic LyricsPage lifecycle; no extracted host source or user data.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { patchLyricsPage } from '../ShinawaseLoader/echo-asar.mjs';

// The streaming target is already stable, as in Loader 1.8.1.2. The remaining
// snapshot -> getLyrics callback -> loading effect chain must also stay stable.
const page = `
globalThis.render=(track,disabled=false,fallbackDuration=0)=>{
  hooks.begin();
  const target=react.useMemo(()=>track?.mediaType==="streaming"?{provider:track.provider,providerTrackId:track.providerTrackId}:null,[track?.mediaType,track?.provider,track?.providerTrackId]);
  const snapshot=react.useMemo(()=>{if(disabled||!track)return null;const title=track.title||"Untitled";return{trackId:track.id,title:title,artist:track.artist,album:track.album,albumArtist:track.albumArtist,durationSeconds:track.duration||fallbackDuration,mediaType:track.mediaType,sourceId:track.sourceId||track.providerTrackId,stableKey:track.stableKey}},[track,disabled,fallbackDuration]);
  const getLyrics=react.useCallback(()=>snapshot,[snapshot]);
  const load=react.useCallback(()=>hooks.load(getLyrics(),target),[getLyrics,target]);
  react.useEffect(load,[load]);
  return snapshot;
};`;

const mount = (source = patchLyricsPage(page)) => {
  const slots = [];
  let slot = 0, loads = 0;
  const equal = (a, b) => a?.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const useMemo = (factory, deps) => {
    const previous = slots[slot];
    const value = previous && equal(previous.deps, deps) ? previous.value : factory();
    slots[slot++] = { value, deps };
    return value;
  };
  const react = {
    useMemo,
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useRef(value) {
      const ref = slots[slot] || { current: value };
      slots[slot++] = ref;
      return ref;
    },
    useEffect(effect, deps) {
      const previous = slots[slot];
      slots[slot++] = { deps };
      if (!previous || !equal(previous.deps, deps)) effect();
    },
  };
  const context = { react, hooks: { begin: () => { slot = 0; }, load: () => { loads++; } } };
  vm.runInNewContext(source, context);
  return { render: context.render, loads: () => loads };
};

const track = () => ({
  id: 'streaming:example:1', mediaType: 'streaming', provider: 'example',
  providerTrackId: '1', stableKey: 'example:1', title: 'Song', artist: 'Artist',
  album: 'Album', albumArtist: 'Album artist', duration: 180,
});

test('queue progress republishes no longer restart the lyrics loading effect', () => {
  const before = mount(page);
  const after = mount();
  const snapshot = after.render(track());
  for (let i = 0; i < 4; i++) {
    before.render(track());
    assert.equal(after.render(track()), snapshot, 'equal cloned tracks retain the snapshot reference');
  }
  assert.equal(before.loads(), 4, 'a stable streaming target alone still reloads the lyrics');
  assert.equal(after.loads(), 1, 'the Provider is not cleared and reloaded on queue republishes');
  assert.equal(patchLyricsPage(patchLyricsPage(page)), patchLyricsPage(page), 'idempotent');
});

test('song identity, lyric metadata, fallback duration and disabled state still invalidate lyrics', () => {
  for (const [field, value] of Object.entries({
    id: 'streaming:example:2', providerTrackId: '2', provider: 'other',
    stableKey: 'example:2', title: 'New title', artist: 'New artist',
    album: 'New album', albumArtist: 'New album artist', duration: 200,
    mediaType: 'remote', sourceId: 'remote-source',
  })) {
    const view = mount();
    view.render(track());
    view.render({ ...track(), [field]: value });
    assert.equal(view.loads(), 2, `${field} changes reload the lyrics`);
  }
  const view = mount();
  const withoutDuration = { ...track(), duration: 0 };
  view.render(withoutDuration, false, 100);
  view.render({ ...withoutDuration }, false, 120);
  assert.equal(view.loads(), 2, 'a changed effective fallback duration reloads');
  assert.equal(view.render(withoutDuration, true, 120), null);
  view.render(withoutDuration, false, 120);
  assert.equal(view.loads(), 4, 'disable/re-enable still reloads');
  assert.equal(view.render(null), null);
  assert.equal(view.loads(), 5, 'clearing the track still clears lyrics');
});

test('snapshot references belong to each mounted lyrics page', () => {
  const first = mount(), second = mount();
  assert.notEqual(first.render(track()), second.render(track()));
  second.render({ ...track(), title: 'Another window' });
  const previous = first.render(track());
  assert.equal(first.render(track()), previous);
  assert.equal(first.loads(), 1);
});

test('unrelated memo objects are not rewritten', () => {
  const unrelated = 'const x=react.useMemo(()=>{return{trackId:track.id,stableKey:track.stableKey}},[track]);';
  assert.equal(patchLyricsPage(unrelated), unrelated);
});
