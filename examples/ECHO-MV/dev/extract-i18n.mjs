import fs from 'node:fs';
import path from 'node:path';

const locales = {
  zh: 'C:/Users/RR/Desktop/Codex-Projects/ECHOSteam-main/src/renderer/i18n/locales/zhCN.ts',
  en: 'C:/Users/RR/Desktop/Codex-Projects/ECHOSteam-main/src/renderer/i18n/locales/enUS.ts',
};
const keyRe = /^  '((?:mvPanel|mvSettings|route\.mvSettings|playerTransport\.action\.mv)[^']*)': '((?:\\'|[^'])*)',?$/gm;
const out = { zh: {}, en: {} };
for (const [lang, file] of Object.entries(locales)) {
  const text = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = keyRe.exec(text))) {
    out[lang][match[1]] = match[2].replace(/\\'/g, "'");
  }
}
const dest = path.resolve('examples/ECHO-MV/dev/i18n.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log('zh', Object.keys(out.zh).length, 'en', Object.keys(out.en).length);
