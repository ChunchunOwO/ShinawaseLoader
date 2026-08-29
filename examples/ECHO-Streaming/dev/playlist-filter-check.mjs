import { readFileSync } from 'node:fs';

import { resolveStockAsar } from '../../_echo-stock-asar.mjs';

const asar = resolveStockAsar();
const bytes = readFileSync(asar);
const text = bytes.toString('utf8');
const old = /\.filter\(([A-Za-z_$][\w$]*)=>\1\.sourceProvider==="local"\)/g;
const oldHits = [...text.matchAll(old)].map((m) => m[0]);
const loose = [...text.matchAll(/sourceProvider==="local"/g)].map((m, i, arr) => {
  const at = m.index;
  return text.slice(Math.max(0, at - 30), at + 50);
});
const pages = [...text.matchAll(/SteamPlaylistsPage-[A-Za-z0-9_-]+/g)].map((m) => m[0]);
console.log(JSON.stringify({
  oldFilterHits: oldHits,
  localSnippets: [...new Set(loose)].slice(0, 8),
  steamPages: [...new Set(pages)].slice(0, 8),
}, null, 2));
