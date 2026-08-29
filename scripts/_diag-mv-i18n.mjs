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
const readEntry = (path) => {
  const entry = filesIn(value).find((item) => item.relativePath === path);
  return bytes.subarray(dataStart + Number(entry.info.offset), dataStart + Number(entry.info.offset) + Number(entry.info.size)).toString('utf8');
};

const around = (text, needle, pad = 180) => {
  const hits = [];
  let idx = 0;
  while ((idx = text.indexOf(needle, idx)) !== -1 && hits.length < 8) {
    hits.push(text.slice(Math.max(0, idx - pad), idx + needle.length + pad));
    idx += needle.length;
  }
  return hits;
};

const i18n = readEntry('out/renderer/assets/I18nProvider-DMMvid7i.js');
const main = readEntry('out/main/index.js');
const en = readEntry('out/renderer/assets/enUS-6nu4TQaD.js');

console.log(JSON.stringify({
  i18n: around(i18n, 'mp4/webm'),
  en: around(en, 'mp4/webm'),
  mainEchoMv: around(main, 'echo-mv'),
  mainEchoVideo: around(main, 'echo-video').slice(0, 4),
  mainMp4: around(main, 'video/mp4').slice(0, 4),
}, null, 2));
