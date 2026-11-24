import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { netease } from '../examples/ECHO-Streaming/echomod/gpui/netease-api.mjs';
import { activate as activateMv } from '../examples/ECHO-MV/echomod/gpui/bilibili.mjs';

const signal = new AbortController().signal;
const song = id => ({id, name: `Track ${id}`, ar:[{name:'Artist'}], al:{name:'Album',picUrl:'http://image.test/cover'},dt:180000});

test('native Streaming maps pages and exact lyrics and refuses preview-only playback', async t => {
  const calls = [];
  let preview = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({url, options});
    assert.equal(url.origin, 'https://music.163.com');
    assert.equal(options.headers.Cookie, 'MUSIC_U=test-session');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    let data;
    switch (url.pathname) {
      case '/api/search/get/web':
        assert.equal(url.searchParams.get('offset'), '2');
        data = {result:{songs:[song(3),song(4)],songCount:5}};
        break;
      case '/api/v6/playlist/detail': data = {playlist:{trackIds:[1,2,3,4,5].map(id => ({id}))}}; break;
      case '/api/v3/song/detail': {
        const ids = JSON.parse(url.searchParams.get('c')).map(row => Number(row.id));
        data = {songs:ids.reverse().map(song)};
        break;
      }
      case '/api/song/enhance/player/url/v1':
        assert.equal(url.searchParams.get('level'), 'lossless');
        data = {data:[{code:200,url:'http://audio.test/song.flac',freeTrialInfo:preview ? {} : null}]};
        break;
      case '/api/song/lyric':
        data = {lrc:{lyric:'[00:01]Lyrics'},tlyric:{lyric:'[00:01]Translation'}};
        break;
      default: throw new Error('Unexpected endpoint: ' + url.pathname);
    }
    return new Response(JSON.stringify({code:200,...data}));
  });
  const api = netease({session:async () => 'test-session',quality:() => 'lossless'});
  const search = await api.search({query:'track',page:2,pageSize:2,signal});
  assert.deepEqual(search.tracks.map(row => row.providerTrackId), ['3','4']);
  assert.equal(search.tracks[0].duration,180);
  assert.equal(search.tracks[0].coverUrl,'https://image.test/cover');
  assert.equal(search.hasMore,true);
  const page = await api.browse({collectionId:'99',page:2,pageSize:2,signal});
  assert.deepEqual(page.tracks.map(row => row.providerTrackId), ['3','4'], 'preserve playlist order after paged details');
  assert.equal(page.hasMore,true);
  const playback = await api.resolve({providerTrackId:'3',signal});
  assert.equal(playback.url,'https://audio.test/song.flac');
  preview = true;
  await assert.rejects(api.resolve({providerTrackId:'3',signal}), /整曲播放/);
  const count = calls.length;
  assert.deepEqual(await api.lyrics({track:{trackId:'3'},exact:false,signal}),[]);
  assert.equal(calls.length,count);
  const lyrics = await api.lyrics({track:{trackId:'3',title:'Track 3'},exact:true,signal});
  assert.equal(lyrics[0].translationLyrics,'[00:01]Translation');
  await assert.rejects(api.resolve({providerTrackId:'../secret',signal}), /无效/);
});

test('native MV registers its provider and rejects invalid or canceled requests before network access', async t => {
  const root = mkdtempSync(join(tmpdir(),'shinawase-gpui-mv-'));
  t.mock.method(globalThis,'fetch',async () => { throw new Error('Unexpected network access'); });
  let handlers;
  try {
    await activateMv({
      dataRoot:root,
      storage:{get:async () => null},
      credentials:{get:async () => null},
      mv:{registerProvider:(id, descriptor, callbacks) => {
        assert.equal(id,'bilibili');
        assert.ok(descriptor.title);
        handlers = callbacks;
      }},
      pages:{registerAction:id => id,register:() => {}},
    });
    assert.equal(typeof handlers.match,'function');
    const track = {id:'local:1',title:'Track',artist:'Artist',durationSeconds:180};
    await assert.rejects(handlers.resolve({track,candidate:{id:'https://invalid.test'},signal}), /无效/);
    const canceled = new AbortController();
    canceled.abort(new Error('test canceled'));
    await assert.rejects(handlers.search({track,query:'Track',signal:canceled.signal}), /test canceled/);
    assert.equal(globalThis.fetch.mock.calls.length,0);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
