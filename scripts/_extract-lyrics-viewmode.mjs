import { readFileSync, writeFileSync } from 'node:fs';

const asarPath = 'D:/SteamLibrary/steamapps/common/ECHO/ShinawaseLoader/modded-runtime/resources/app.asar';
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
const dataOffset = 8 + headerSize;
const target = files.find((f) => /LyricsPage-.*\.js$/i.test(f.path));
const text = bytes.subarray(dataOffset + target.offset, dataOffset + target.offset + target.size).toString('utf8');
writeFileSync('scripts/_lyrics-page.js.txt', text);

const needles = ['view-mode', 'viewMode', 'cinemaStage', 'coverStage', 'mvEnabled', 'lyrics-cinema', 'lyrics-cover-stage', 'data-mv-enabled'];
for (const needle of needles) {
  let idx = 0;
  let n = 0;
  while ((idx = text.indexOf(needle, idx)) >= 0 && n < 6) {
    console.log(`\n===== ${needle} @ ${idx} =====`);
    console.log(text.slice(Math.max(0, idx - 180), idx + 220).replace(/\n/g, ' '));
    idx += needle.length;
    n += 1;
  }
}
console.log('\nfile', target.path, text.length);
