import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('examples/ECHO-MV');
const parsed = JSON.parse(fs.readFileSync(path.join(root, 'dev/i18n.json'), 'utf8'));
parsed.zh['mvSettings.network.allow60fps'] = '允许 60fps';
parsed.zh['mvSettings.network.allow60fpsDescription'] = '允许选择 60fps 画质。';
parsed.en['mvSettings.network.allow60fps'] = 'Allow 60fps';
parsed.en['mvSettings.network.allow60fpsDescription'] = 'Allow 60fps quality when available.';
const css = fs.readFileSync(path.join(root, 'echomod/mv.css'), 'utf8');
const logic = fs.readFileSync(path.join(root, 'dev/mod.logic.js'), 'utf8');
const out = `if (window.__echoMvModActive) return () => {};
window.__echoMvModActive = true;

const I18N = ${JSON.stringify(parsed)};
const EMBEDDED_CSS = ${JSON.stringify(css)};

${logic}
`;
const dest = path.join(root, 'echomod/mod.js');
fs.writeFileSync(dest, out);
console.log('wrote', dest, 'lines', out.split(/\r?\n/).length, 'bytes', Buffer.byteLength(out));
