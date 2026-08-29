import { readFileSync, writeFileSync } from 'node:fs';
import { resolveStockAsar } from '../../_echo-stock-asar.mjs';

const asar = resolveStockAsar();
const bytes = readFileSync(asar);
const text = bytes.toString('latin1');

const dump = (label, needle, count = 6, width = 420) => {
  const hits = [];
  let from = 0;
  while (hits.length < count) {
    const i = text.indexOf(needle, from);
    if (i < 0) break;
    hits.push(text.slice(Math.max(0, i - 80), i + width).replace(/\s+/g, ' '));
    from = i + needle.length;
  }
  console.log(`\n===== ${label} (${hits.length}) =====`);
  hits.forEach((hit, index) => console.log(`\n--- ${index + 1} ---\n${hit}`));
  return hits;
};

const classNeedles = [
  'playlist-detail-page',
  'playlist-detail-hero',
  'playlist-detail-cover',
  'playlists-page',
  'playlist-hero',
  'album-detail-page',
  'album-detail-hero',
  'album-detail-console',
  'album-detail-track-console',
  'album-track-row',
  'album-back-button',
  'page-surface:has(.album-detail-page)',
  'page-surface:has(.playlist-detail-page)',
  'page-surface:has(.playlists-page)',
];

for (const needle of classNeedles) dump(needle, needle, 4, 360);

const jsNeedles = [
  'className:"album-detail-page"',
  'className:"playlist-detail-page"',
  '"album-detail-page"',
  '"playlist-detail-page"',
  'album-detail-track-console',
  'playlist-detail-track',
];
for (const needle of jsNeedles) dump(`JS ${needle}`, needle, 3, 500);

const cssChunks = [];
for (const needle of ['.album-detail-page{', '.album-detail-hero{', '.playlist-detail-page{', '.playlist-detail-hero{', '.playlists-page{']) {
  let from = 0;
  for (let n = 0; n < 3; n += 1) {
    const i = text.indexOf(needle, from);
    if (i < 0) break;
    cssChunks.push(`\n/* ${needle} #${n + 1} */\n${text.slice(i, i + 1800)}`);
    from = i + needle.length;
  }
}
writeFileSync(new URL('./official-detail-css.txt', import.meta.url), cssChunks.join('\n\n'), 'utf8');
console.log('\nwrote official-detail-css.txt', cssChunks.length);
