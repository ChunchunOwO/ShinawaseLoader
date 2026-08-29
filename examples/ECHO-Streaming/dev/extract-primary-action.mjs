import { readStockAsarLatin1 } from '../../_echo-stock-asar.mjs';
const text = readStockAsarLatin1();
const dump = (needle, n = 4, width = 700) => {
  console.log('\n====', needle, '====');
  let from = 0;
  for (let i = 0; i < n; i += 1) {
    const at = text.indexOf(needle, from);
    if (at < 0) return;
    console.log('\n---', i + 1, '---\n', text.slice(at, at + width).replace(/\s+/g, ' '));
    from = at + needle.length;
  }
};
dump('.primary-action,');
dump('.primary-action{');
dump('button.primary-action');
dump('.playlist-detail-header .primary-action');
dump('.playlists-page .primary-action');
dump('.playlist-actions button');
