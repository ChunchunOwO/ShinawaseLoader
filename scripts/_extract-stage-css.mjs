import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
const lyricsCss = files.filter((f) => /LyricsPage|lyrics-cinema|lyrics-cover|LyricsVisual/i.test(f.path));
console.log(lyricsCss.map((f) => `${f.path} ${f.size}`).join('\n'));

const target = files.find((f) => /LyricsPage-.*\.css$/i.test(f.path));
if (!target) process.exit(0);
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
      if (/cinemaStage|coverStage|lyrics-cinema|lyrics-cover-stage|cinema-stage|cover-stage/i.test(chunk)) chunks.push(chunk);
      start = i + 1;
    }
  }
}
writeFileSync('scripts/_stage-css-extract.css', chunks.join('\n\n'));
console.log('chunks', chunks.length, 'bytes', chunks.join('\n\n').length);
console.log('sample_headers', chunks.slice(0, 20).map((c) => c.slice(0, 140)));
