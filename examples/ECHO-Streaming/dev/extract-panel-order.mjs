import { readStockAsarLatin1 } from '../../_echo-stock-asar.mjs';
const text = readStockAsarLatin1();
const i = text.indexOf('streaming-playlist-panel');
console.log(text.slice(Math.max(0, i - 200), i + 1600).replace(/\s+/g, ' '));
