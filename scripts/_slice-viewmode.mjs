import { readFileSync } from 'node:fs';
const text = readFileSync('scripts/_lyrics-page.js.txt', 'utf8');
const needles = ['echo:lyrics:view-mode', 'sessionStorage', 'setViewMode', 'viewMode', 'Ae==="lyrics"', 'rememberViewMode'];
for (const needle of ['getItem(Ni)', 'setItem(Ni)', 'sessionStorage.getItem', 'sessionStorage.setItem', 'Ae==="lyrics"', 'Ae==="mv"']) {
  let idx = 0;
  let n = 0;
  while ((idx = text.indexOf(needle, idx)) >= 0 && n < 8) {
    console.log(`\n===== ${needle} @ ${idx} =====`);
    console.log(text.slice(Math.max(0, idx - 220), idx + 280));
    idx += needle.length;
    n += 1;
  }
}
