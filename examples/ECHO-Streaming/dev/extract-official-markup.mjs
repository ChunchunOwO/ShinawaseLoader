import { readFileSync, writeFileSync } from 'node:fs';

import { resolveStockAsar } from '../../_echo-stock-asar.mjs';

const asar = resolveStockAsar();
const text = readFileSync(asar).toString('latin1');

const around = (needle, before = 200, after = 1400, count = 2) => {
  const hits = [];
  let from = 0;
  while (hits.length < count) {
    const i = text.indexOf(needle, from);
    if (i < 0) break;
    hits.push(text.slice(Math.max(0, i - before), i + after));
    from = i + needle.length;
  }
  return hits;
};

const blocks = [];
const needles = [
  'className:"album-detail-page album-detail-page--local-only',
  'className:"album-detail-hero album-detail-switch-surface',
  'className:"album-detail-track-console"',
  'className:"album-track-row"',
  'className:"playlist-detail-header"',
  'className:"playlist-detail-hero"',
  'className:"playlist-detail-copy"',
  'className:"playlist-track-row"',
  'className:"playlist-tracks"',
  'className:"playlist-item-row"',
  'className:"playlist-detail-toolbar"',
  'playlist-detail-header',
  'playlist-track-list',
  '.album-detail-page{',
  '.album-detail-cover{',
  '.album-detail-console{',
  '.album-detail-facts{',
  '.album-track-row{',
  '.playlists-page .playlist-detail-header{',
  '.playlists-page .playlist-detail-copy{',
  '.playlists-page .playlist-cover{',
];

for (const needle of needles) {
  const hits = around(needle, 120, 1600, 2);
  blocks.push(`\n\n########## ${needle} (${hits.length}) ##########\n`);
  hits.forEach((hit, index) => {
    blocks.push(`\n----- ${index + 1} -----\n${hit.replace(/\s+/g, ' ').slice(0, 1800)}`);
  });
}

writeFileSync(new URL('./official-markup.txt', import.meta.url), blocks.join('\n'), 'utf8');
console.log('wrote', blocks.length, 'chunks');
