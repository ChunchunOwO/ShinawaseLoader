import { readFileSync } from 'node:fs';

import { resolveStockAsar } from '../../_echo-stock-asar.mjs';

const asar = resolveStockAsar();
const bytes = readFileSync(asar);
const text = bytes.toString('latin1');
const needles = [
  '.streaming-artist-page',
  '.streaming-artist-hero',
  '.album-detail-page',
  '.album-detail-hero',
  '.page-surface:has(.album-detail-page)',
  '.page-surface:has(.streaming-artist-page)',
];
for (const needle of needles) {
  const hits = [];
  let from = 0;
  while (hits.length < 4) {
    const i = text.indexOf(needle, from);
    if (i < 0) break;
    hits.push(text.slice(i, i + 220).replace(/\s+/g, ' '));
    from = i + needle.length;
  }
  console.log(`\n=== ${needle} (${hits.length}) ===`);
  for (const hit of hits) console.log(hit.slice(0, 200));
}
