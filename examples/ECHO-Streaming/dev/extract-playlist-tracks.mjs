import { readFileSync } from 'node:fs';

import { resolveStockAsar } from '../../_echo-stock-asar.mjs';

const asar = resolveStockAsar();
const text = readFileSync(asar).toString('latin1');

const dump = (needle, before = 80, after = 900, count = 3) => {
  console.log(`\n===== ${needle} =====`);
  let from = 0;
  let n = 0;
  while (n < count) {
    const i = text.indexOf(needle, from);
    if (i < 0) break;
    console.log(`\n--- ${n + 1} ---\n${text.slice(Math.max(0, i - before), i + after).replace(/\s+/g, ' ').slice(0, 1100)}`);
    from = i + needle.length;
    n += 1;
  }
};

[
  'playlist-detail-panel',
  'playlist-detail-body',
  'playlist-items',
  'playlist-track-list',
  'collection-track-row',
  'playlist-song-row',
  'className:"playlist-row"',
  'playlists-page--collection',
  'playlist-workspace',
  'data-playing',
  '.playlists-page .playlist-row',
  '.playlists-page .track-row',
  'playlist-item-list',
].forEach((needle) => dump(needle));
