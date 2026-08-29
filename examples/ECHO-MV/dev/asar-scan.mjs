// Dev-only: scan the shipped app.asar for protocol handler registrations.
import { readStockAsarLatin1 } from '../../_echo-stock-asar.mjs';
const s = readStockAsarLatin1();
const pats = [
  'handle("echo-mv"',
  'handle("echo-video"',
  'handle("echo-image"',
  'handle("echo-audio"',
  'handle("echo-cover"',
  'handle("echo-wallpaper"',
  'unhandle("echo-mv"',
  'echo-mv://',
  'registerStreamProtocol',
  'interceptStreamProtocol',
];
for (const pat of pats) {
  let idx = -1; const at = [];
  while ((idx = s.indexOf(pat, idx + 1)) >= 0 && at.length < 8) at.push(idx);
  console.log(pat, '->', at.length, at.join(','));
}
const ctx = (pos, before = 150, after = 250) => JSON.stringify(s.slice(pos - before, pos + after));
let i = s.indexOf('handle("echo-mv"');
if (i >= 0) { console.log('--- handle("echo-mv") context:'); console.log(ctx(i)); }
i = s.indexOf('handle("echo-video"');
if (i >= 0) { console.log('--- handle("echo-video") context:'); console.log(ctx(i)); }
