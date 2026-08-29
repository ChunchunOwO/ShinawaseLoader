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
const target = files.find((f) => /LyricsPage-.*\.css$/i.test(f.path));
const text = bytes.subarray(dataOffset + target.offset, dataOffset + target.offset + target.size).toString('utf8');

const chunks = [];
let depth = 0;
let start = 0;
let inStr = null;
for (let i = 0; i < text.length; i += 1) {
  const ch = text[i];
  if (inStr) {
    if (ch === '\\') { i += 1; continue; }
    if (ch === inStr) inStr = null;
    continue;
  }
  if (ch === '"' || ch === "'") { inStr = ch; continue; }
  if (ch === '{') depth += 1;
  else if (ch === '}') {
    depth -= 1;
    if (depth === 0) {
      const chunk = text.slice(start, i + 1).trim();
      if (/lyrics-mv|view-mode=mv|data-mv-enabled=true|data-immersive/i.test(chunk) && /cinemaStage|coverStage|folded|kinetic|cutBoard|roseVinyl/i.test(chunk)) {
        chunks.push(chunk.slice(0, 400));
      }
      start = i + 1;
    }
  }
}
writeFileSync('scripts/_mv-stage-css-headers.txt', chunks.join('\n\n'));
console.log('chunks', chunks.length);
console.log(chunks.slice(0, 40).join('\n---\n'));
