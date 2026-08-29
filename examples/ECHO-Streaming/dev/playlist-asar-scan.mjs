import { readFileSync, existsSync, writeFileSync } from 'node:fs';

import { resolveStockAsar } from '../../_echo-stock-asar.mjs';

const asar = resolveStockAsar();
if (!existsSync(asar)) {
  console.error('asar missing');
  process.exit(1);
}
const bytes = readFileSync(asar);
const headerSize = bytes.readUInt32LE(4);
const header = JSON.parse(bytes.subarray(16, 16 + headerSize).toString('utf8'));
const dataStart = 16 + headerSize;
const files = [];
const walk = (node, prefix = '') => {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) walk(child, prefix ? `${prefix}/${name}` : name);
    return;
  }
  if (node.size != null) files.push({ path: prefix, offset: Number(node.offset), size: Number(node.size) });
};
walk(header);
const hits = files.filter((f) => /Playlist|StreamingSearch|streaming/i.test(f.path) && /\.(js|css)$/u.test(f.path));
const read = (entry) => bytes.subarray(dataStart + entry.offset, dataStart + entry.offset + entry.size).toString('utf8');
const lines = [];
lines.push(hits.map((f) => `${f.path}\t${f.size}`).join('\n'));
for (const name of ['SteamPlaylistsPage', 'PlaylistsPage', 'StreamingSearch']) {
  const entry = files.find((f) => f.path.includes(name) && f.path.endsWith('.js'));
  if (!entry) {
    lines.push(`MISSING ${name}`);
    continue;
  }
  const text = read(entry);
  lines.push(`\n=== ${entry.path} ${text.length} ===`);
  const localFilter = text.match(/\.filter\([^)]{0,120}sourceProvider[^)]{0,80}\)/g);
  lines.push(`filters: ${JSON.stringify(localFilter)}`);
  const patched = !/\.filter\(([A-Za-z_$][\w$]*)=>\1\.sourceProvider==="local"\)/.test(text);
  lines.push(`old local-only filter present: ${!patched}`);
  const classHits = [...text.matchAll(/[A-Za-z0-9_-]*(playlist|Playlist)[A-Za-z0-9_-]*/g)].map((m) => m[0]);
  lines.push(`class-ish: ${[...new Set(classHits)].slice(0, 40).join(', ')}`);
}
writeFileSync(new URL('./playlist-asar-scan.out.txt', import.meta.url), lines.join('\n'));
console.log('wrote playlist-asar-scan.out.txt', lines.join('\n').length);
