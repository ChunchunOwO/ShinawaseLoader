import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const roots = [
  'D:/SteamLibrary/steamapps/common/ECHO/ShinawaseLoader/modded-runtime/resources/app.asar',
  'D:/SteamLibrary/steamapps/common/ECHO/resources/app.asar',
];
const asarPath = roots.find((p) => existsSync(p));
if (!asarPath) {
  console.log('no asar');
  process.exit(0);
}

const bytes = readFileSync(asarPath);
const headerSize = bytes.readUInt32LE(4);
const header = bytes.subarray(8, 8 + headerSize);
const jsonSize = header.readInt32LE(4);
const json = JSON.parse(header.subarray(8, 8 + jsonSize).toString('utf8'));

const files = [];
const walk = (node, prefix = '') => {
  if (!node || typeof node !== 'object') return;
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) walk(child, prefix ? `${prefix}/${name}` : name);
    return;
  }
  if (typeof node.size === 'number') files.push({ path: prefix, size: node.size, offset: Number(node.offset) });
};
walk(json);

const hits = files.filter((f) => /cinema|cover-stage|cover_stage|lyrics-stage|folded|kinetic|cut-board/i.test(f.path));
console.log(JSON.stringify({ asarPath, hits: hits.slice(0, 80) }, null, 2));

const dataOffset = 8 + headerSize;
const pick = hits.find((f) => /cinema/i.test(f.path)) || hits.find((f) => /cover-stage/i.test(f.path));
if (pick) {
  const start = dataOffset + pick.offset;
  const text = bytes.subarray(start, start + pick.size).toString('utf8');
  console.log('\n=== FILE', pick.path, 'bytes', pick.size, '===');
  console.log(text.slice(0, 8000));
}
