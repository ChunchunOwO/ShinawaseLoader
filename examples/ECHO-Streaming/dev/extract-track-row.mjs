import { readFileSync } from 'node:fs';

import { resolveStockAsar } from '../../_echo-stock-asar.mjs';

const asar = resolveStockAsar();
const text = readFileSync(asar).toString('latin1');

const dump = (needle, before = 60, after = 1100, count = 2) => {
  console.log(`\n===== ${needle} =====`);
  let from = 0;
  let n = 0;
  while (n < count) {
    const i = text.indexOf(needle, from);
    if (i < 0) {
      console.log('(none)');
      return;
    }
    console.log(`\n--- ${n + 1} ---\n${text.slice(Math.max(0, i - before), i + after).replace(/\s+/g, ' ').slice(0, 1300)}`);
    from = i + needle.length;
    n += 1;
  }
};

[
  'className:"track-row"',
  'className:"track-cover"',
  'className:"track-title"',
  '.playlist-detail-panel{',
  '.playlist-detail{',
  '.playlists-page.playlists-page--home{',
  '.track-row{',
  'className:"playlist-track-section"',
  'className:"playlist-list"',
  'virtualizer',
].forEach((needle) => dump(needle));
