import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../echomod/mod.js');
const source = fs.readFileSync(sourcePath, 'utf8');
new Function('echoExternalMod', source);
console.log('ok lines=' + source.split(/\r?\n/).length);
