// Builds the directory a self-hosted update mirror serves (any static web server).
//
//   node scripts/build-update-mirror.mjs "<OUT_DIR>" [--key "<PRIVATE_KEY.pem>"] [--with-node] [--node-source "<URL>"]
//   node scripts/build-update-mirror.mjs --generate-key "<PRIVATE_KEY.pem>"
//
// Output (everything is built from git HEAD so the files always agree):
//   ShinawaseLoader-main.zip   the ShinawaseLoader/ tree only (a few MB, not the whole repo)
//   examples/packages/*.echomod  the bundled example packages
//   mirror-manifest.json       versions + SHA-256 of every file above
//   mirror-manifest.sig        Ed25519 signature of mirror-manifest.json (base64)
//   node/v<ver>/node-v<ver>-win-x64.zip   with --with-node: the Node runtime the installer
//                              downloads, checked against nodeSha256 in loader-version.json
// The npm registry proxy (<base>/npm/) is nginx config, not a file: see
// scripts/update-mirror/README.md.
//
// The loader only trusts a mirror whose manifest verifies against the public key
// embedded in ShinawaseLoader/update-net.mjs, so the mirror can be plain HTTP.
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { UPDATE_PACKAGES, UPDATE_PUBLIC_KEY, createDeadline, downloadResumable, sha256Hex, verifyDetached } from '../ShinawaseLoader/update-net.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };

if (args.includes('--generate-key')) {
  const target = resolve(flag('--generate-key') || '');
  if (!flag('--generate-key')) throw new Error('--generate-key needs an output path');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(target, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  console.log(`private key written to ${target} (keep it secret, never commit it)`);
  console.log('replace UPDATE_PUBLIC_KEY in ShinawaseLoader/update-net.mjs with:\n');
  console.log(publicKey.export({ type: 'spki', format: 'pem' }));
  process.exit(0);
}

const valueFlags = new Set([flag('--key'), flag('--node-source')].filter(Boolean));
const positional = args.find((arg) => !arg.startsWith('--') && !valueFlags.has(arg));
const outDir = resolve(positional || '');
if (!positional) throw new Error('usage: build-update-mirror.mjs "<OUT_DIR>" [--key "<PRIVATE_KEY.pem>"]');
const keyPath = resolve(flag('--key') || join(repo, '.update-signing-key.pem'));

const git = (gitArgs, options = {}) => {
  const result = spawnSync('git', gitArgs, { cwd: repo, maxBuffer: 256 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`git ${gitArgs.join(' ')} failed: ${String(result.stderr || '')}`);
  return result.stdout;
};

const dirty = String(git(['status', '--porcelain', '--', 'ShinawaseLoader', 'examples/packages'])).trim();
if (dirty) console.warn('warning: uncommitted changes are NOT included (the mirror is built from git HEAD):\n' + dirty);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const loaderVersion = JSON.parse(String(git(['show', 'HEAD:ShinawaseLoader/loader-version.json']))).version;
const archiveName = 'ShinawaseLoader-main.zip';
git(['archive', '--format=zip', '--prefix=ShinawaseLoader-main/', '-o', join(outDir, archiveName), 'HEAD', 'ShinawaseLoader']);
const archive = readFileSync(join(outDir, archiveName));

if (args.includes('--with-node')) {
  const info = JSON.parse(String(git(['show', 'HEAD:ShinawaseLoader/loader-version.json'])));
  if (!/^\d+\.\d+\.\d+$/u.test(info.nodeVersion) || !/^[0-9a-f]{64}$/iu.test(info.nodeSha256 || '')) throw new Error('loader-version.json needs nodeVersion and nodeSha256');
  const file = `node-v${info.nodeVersion}-win-x64.zip`;
  const source = (flag('--node-source') || 'https://nodejs.org/dist').replace(/\/+$/u, '');
  const target = join(outDir, 'node', `v${info.nodeVersion}`, file);
  mkdirSync(dirname(target), { recursive: true });
  console.log(`downloading ${source}/v${info.nodeVersion}/${file} ...`);
  const bytes = await downloadResumable(`${source}/v${info.nodeVersion}/${file}`, join(outDir, '.node-download'), { headersMs: 20000, stallMs: 30000, deadline: createDeadline(20 * 60 * 1000), expectedSha256: info.nodeSha256.toLowerCase() });
  writeFileSync(target, bytes);
  console.log(`  node ${info.nodeVersion}  ${(bytes.length / 1048576).toFixed(1)} MB  sha256 verified`);
}

const packages = [];
for (const item of UPDATE_PACKAGES) {
  const version = JSON.parse(String(git(['show', `HEAD:${item.manifest}`]))).version;
  const bytes = git(['show', `HEAD:${item.file}`]);
  const target = join(outDir, item.file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  packages.push({ id: item.id, version: String(version), file: item.file, sha256: sha256Hex(bytes), size: bytes.length });
}

const manifest = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  loader: { version: String(loaderVersion), archive: archiveName, sha256: sha256Hex(archive), size: archive.length },
  packages,
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
const signature = sign(null, manifestBytes, createPrivateKey(readFileSync(keyPath))).toString('base64');
if (!verifyDetached(manifestBytes, signature, UPDATE_PUBLIC_KEY)) {
  throw new Error('the signing key does not match UPDATE_PUBLIC_KEY in ShinawaseLoader/update-net.mjs; loaders would reject this mirror');
}
writeFileSync(join(outDir, 'mirror-manifest.json'), manifestBytes);
writeFileSync(join(outDir, 'mirror-manifest.sig'), `${signature}\n`);

console.log(`mirror built in ${outDir}`);
console.log(`  loader ${manifest.loader.version}  ${(archive.length / 1048576).toFixed(2)} MB  sha256 ${manifest.loader.sha256.slice(0, 16)}...`);
for (const item of packages) console.log(`  ${item.id} ${item.version}  ${item.file}`);
console.log('Upload the contents of that folder to the mirror base URL (default https://mirror.shiinasuki.com/shinawase/, IP fallback http://43.248.10.82/shinawase/).');
