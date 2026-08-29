import { readFileSync } from 'node:fs';
const text = readFileSync('scripts/_lyrics-page.js.txt', 'utf8');
for (const needle of ['zs("mv"', "zs('mv'", 'zs("lyrics"', 'zs(r', 'navigate:lyrics', 'app:navigate:lyrics', 'commitLyricsViewMode']) {
  let idx = 0;
  let n = 0;
  while ((idx = text.indexOf(needle, idx)) >= 0 && n < 8) {
    console.log(`\n===== ${needle} @ ${idx} =====`);
    console.log(text.slice(Math.max(0, idx - 180), idx + 240));
    idx += needle.length;
    n += 1;
  }
}
