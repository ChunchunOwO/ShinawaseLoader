import { readStockAsarLatin1 } from '../../_echo-stock-asar.mjs';
const text = readStockAsarLatin1();
for (const needle of ['.playlist-actions{', '.playlist-detail-primary-actions{', '.primary-action{', '.playlists-page .playlist-actions', '.playlist-detail-header{']) {
  const i = text.indexOf(needle);
  console.log('\n====', needle, i, '====');
  console.log(i < 0 ? 'none' : text.slice(i, i + 500).replace(/\s+/g, ' '));
}
