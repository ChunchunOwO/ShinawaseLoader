import { readFileSync } from 'node:fs';
const text = readFileSync('scripts/_lyrics-page.js.txt', 'utf8');
let idx = 0;
let n = 0;
while ((idx = text.indexOf('zs(', idx)) >= 0 && n < 20) {
  const slice = text.slice(idx, idx + 40);
  if (/zs\([`'"]mv|zs\(\w/.test(slice) || slice.startsWith('zs(')) {
    console.log(`\n===== zs( @ ${idx} =====`);
    console.log(text.slice(Math.max(0, idx - 200), idx + 80));
    n += 1;
  }
  idx += 3;
}
console.log('count', n);
