import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createEngine } = require('../echomod/main.cjs');

const future = new Date(Date.now() + 45 * 60 * 1000).toISOString();
const videoId = '11111111-1111-4111-8111-111111111111';
const playableStream = (variantId, qn) => ({
  variantId,
  provider: 'bilibili',
  label: `${qn}p`,
  qualityTier: '720p',
  width: 852,
  height: 480,
  fps: 30,
  codec: 'avc1.640033',
  container: 'mp4',
  mimeType: 'video/mp4',
  protocol: 'direct',
  url: `https://example.invalid/${variantId}.mp4`,
  headers: { Referer: 'https://www.bilibili.com/' },
  playableInApp: true,
  requiresAccount: false,
  expiresAt: future,
  rawProviderJson: {
    provider: 'bilibili',
    resolver: 'bilibili-dash-video-v4',
    source: 'dash-video',
    qn,
    qualityRank: qn,
    mutedVideoOnly: true,
  },
});

const writeStore = (dataDir, streams) => {
  writeFileSync(join(dataDir, 'store.json'), JSON.stringify({
    version: 1,
    settings: {},
    tracks: {
      'track:test': {
        videos: [{
          id: videoId,
          trackId: 'track:test',
          provider: 'bilibili',
          sourceId: 'BV1TEST',
          title: 'test',
          selected: true,
          selectedQualityId: 'auto',
          createdAt: future,
          updatedAt: future,
        }],
      },
    },
    streams: { [videoId]: streams },
  }));
};

const main = async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'echo-mv-proto-'));
  const engine = createEngine({ dataDir, log: () => {} });
  writeStore(dataDir, [playableStream('bilibili-dash-qn-16-avc', 16)]);

  const reloaded = await engine.getStreamVariantForProtocol(videoId, 'bilibili-dash-qn-16-avc');
  if (!reloaded?.url?.includes('bilibili-dash-qn-16-avc')) {
    throw new Error(`disk reload missed playable variant: ${JSON.stringify(reloaded)}`);
  }

  const fallback = await engine.getStreamVariantForProtocol(videoId, 'bilibili-dash-qn-32-avc');
  if (!fallback?.url?.includes('bilibili-dash-qn-16-avc')) {
    throw new Error(`missing requested variant did not fall back: ${JSON.stringify(fallback)}`);
  }

  engine.dispose();
  console.log('protocol-lookup-test ok');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
