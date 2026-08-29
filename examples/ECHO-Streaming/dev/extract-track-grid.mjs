import { readStockAsarLatin1 } from '../../_echo-stock-asar.mjs';
const text = readStockAsarLatin1();
for (const needle of ['.track-row{', '.track-main{', '.track-title-row{', '.playlist-actions{', '.playlist-detail-copy{', '.playlist-cover{']) {
  const i = text.indexOf(needle);
  console.log('\n====', needle, '====');
  console.log(i < 0 ? 'none' : text.slice(i, i + 700).replace(/\s+/g, ' '));
}
