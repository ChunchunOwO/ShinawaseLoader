import { readStockAsarLatin1 } from '../../_echo-stock-asar.mjs';
const text = readStockAsarLatin1();
const dump = (needle, n = 3, width = 900) => {
  console.log(`\n==== ${needle} ====`);
  let from = 0;
  let found = 0;
  while (found < n) {
    const i = text.indexOf(needle, from);
    if (i < 0) {
      if (!found) console.log('(none)');
      return;
    }
    console.log(`\n--- ${found + 1} ---\n${text.slice(i, i + width).replace(/\s+/g, ' ')}`);
    from = i + needle.length;
    found += 1;
  }
};
[
  '.streaming-playlist-import{',
  '.streaming-playlist-import ',
  '.streaming-playlist-panel{',
  '.streaming-playlist-card{',
  '.streaming-discovery-card{',
  '.streaming-discovery-list{',
  '.streaming-cover{',
  '.streaming-playlist-import-copy{',
  '.streaming-account-playlist-sync{',
  'streaming-playlist-import',
].forEach((needle) => dump(needle));
