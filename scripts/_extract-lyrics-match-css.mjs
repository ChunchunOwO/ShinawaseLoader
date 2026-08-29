import { readFileSync, writeFileSync } from 'node:fs';
const asarPath = 'D:/SteamLibrary/steamapps/common/ECHO/ShinawaseLoader/modded-runtime/resources/app.asar';
const bytes = readFileSync(asarPath);
const headerSize = bytes.readUInt32LE(4);
const header = bytes.subarray(8, 8 + headerSize);
const jsonSize = header.readInt32LE(4);
const json = JSON.parse(header.subarray(8, 8 + jsonSize).toString('utf8'));
const files = [];
const walk = (node, prefix = '') => {
  if (!node?.files) {
    if (typeof node?.size === 'number') files.push({ path: prefix, size: node.size, offset: Number(node.offset) });
    return;
  }
  for (const [name, child] of Object.entries(node.files)) walk(child, prefix ? `${prefix}/${name}` : name);
};
walk(json);
const dataOffset = 8 + headerSize;
const target = files.find((f) => /LyricsPage-.*\.css$/i.test(f.path));
const text = bytes.subarray(dataOffset + target.offset, dataOffset + target.offset + target.size).toString('utf8');
const chunks = [];
let depth = 0, start = 0, inStr = null;
for (let i = 0; i < text.length; i += 1) {
  const ch = text[i];
  if (inStr) { if (ch === '\\') { i += 1; continue; } if (ch === inStr) inStr = null; continue; }
  if (ch === '"' || ch === "'") { inStr = ch; continue; }
  if (ch === '{') depth += 1;
  else if (ch === '}') {
    depth -= 1;
    if (depth === 0) {
      const chunk = text.slice(start, i + 1).trim();
      if (/lyrics-match|lyrics-source-quality|lyrics-source-filter|lyrics-candidate/.test(chunk) && !/lyrics-mv/.test(chunk)) chunks.push(chunk);
      start = i + 1;
    }
  }
}
writeFileSync('scripts/_lyrics-match-extract.css', chunks.join('\n\n'));
console.log('chunks', chunks.length, 'bytes', chunks.join('\n\n').length);
console.log(chunks.slice(0, 12).map((c) => c.slice(0, 160)).join('\n---\n'));
