import { readFileSync } from 'node:fs';

const file = 'D:/SteamLibrary/steamapps/common/ECHO/resources/app.asar';
const bytes = readFileSync(file);
const headerSize = bytes.readUInt32LE(4);
const header = bytes.subarray(8, 8 + headerSize);
const jsonSize = header.readInt32LE(4);
const value = JSON.parse(header.subarray(8, 8 + jsonSize).toString('utf8'));
const dataStart = 8 + headerSize;

const filesIn = (node, prefix = '') => {
  const result = [];
  for (const [name, info] of Object.entries(node.files || {})) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (info.files) result.push(...filesIn(info, relativePath));
    else result.push({ relativePath, info });
  }
  return result;
};

const needles = [
  '需要支持',
  'MP4/WEBM',
  'MP4 / WEBM',
  'mp4/webm',
  'video/mp4',
  'echo-mv',
  'echo-video',
  'playableInApp',
  'unsupportedFormat',
  'supportedFormats',
];

const hits = [];
for (const entry of filesIn(value)) {
  if (!/\.(js|mjs|json|html|css)$/u.test(entry.relativePath)) continue;
  const text = bytes.subarray(dataStart + Number(entry.info.offset), dataStart + Number(entry.info.offset) + Number(entry.info.size)).toString('utf8');
  const found = needles.filter((needle) => text.includes(needle));
  if (found.length) hits.push({ file: entry.relativePath, found });
}
console.log(JSON.stringify(hits, null, 2));
