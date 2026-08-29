import { readFileSync } from 'node:fs';
const text = readFileSync('scripts/_lyrics-page.js.txt', 'utf8');
for (const needle of ['useState(Kl', 'useState(zi', 'setAe', 'Ae,set', 'Kl()', 'Gl(', 'readRememberedLyricsViewMode', 'rememberLyricsViewMode', '[Ae,']) {
  let idx = 0;
  let n = 0;
  while ((idx = text.indexOf(needle, idx)) >= 0 && n < 6) {
    console.log(`\n===== ${needle} @ ${idx} =====`);
    console.log(text.slice(Math.max(0, idx - 160), idx + 220));
    idx += needle.length;
    n += 1;
  }
}
