#!/usr/bin/env node
// Publish official mods to the Shinawase Mod Market through the restricted
// deploy key (see README.md here). Builds the catalog entries from
// scripts/mod-market.json and examples/packages, streams them to the server's
// forced command, then checks the public index.json.
//
//   node scripts/mod-market-deploy/deploy.mjs --server root@<host> [--port 22] [--key <file>] [--id echo.community-streaming ...]
//   node scripts/mod-market-deploy/deploy.mjs --server root@<host> status
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const many = (name) => args.flatMap((value, index) => (args[index - 1] === name ? [value] : []));
const server = option('--server');
const port = option('--port', '22');
const key = option('--key', join(homedir(), '.ssh', 'shinawase_market'));
const catalogUrl = option('--catalog', 'https://echo.shiinasuki.com/mod-market/index.json');
const command = args.includes('status') ? 'status' : 'apply';
if (!server) {
  console.error('usage: deploy.mjs --server <user@host> [--port <n>] [--key <file>] [--id <mod id> ...] [status]');
  process.exit(2);
}

const ssh = (input) => spawnSync('ssh', ['-i', key, '-p', String(port), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'ConnectTimeout=15', server, command], {
  input, encoding: input ? 'buffer' : 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000,
});
const report = (result) => {
  const out = Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : String(result.stdout || '');
  const err = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr || '');
  if (err.trim()) console.error(err.trim());
  console.log(out.trim());
  return out;
};

if (command === 'status') {
  const result = ssh(null);
  report(result);
  process.exit(result.status ?? 1);
}

const ids = many('--id');
const selected = ids.length ? ids : ['echo.community-streaming'];
const work = mkdtempSync(join(tmpdir(), 'shinawase-market-'));
try {
  const built = join(work, 'catalog');
  const build = spawnSync(process.execPath, [join(repo, 'scripts', 'build-mod-market.mjs'), built], { cwd: repo, encoding: 'utf8' });
  if (build.status !== 0) throw new Error(`build-mod-market failed:\n${build.stderr || build.stdout}`);
  const seed = JSON.parse(readFileSync(join(built, 'seed.json'), 'utf8'));
  const stage = join(work, 'stage');
  mkdirSync(join(stage, 'packages'), { recursive: true });
  mkdirSync(join(stage, 'icons'), { recursive: true });
  const entries = selected.map((id) => {
    const entry = seed.mods.find((item) => item.id === id);
    if (!entry) throw new Error(`${id} is not an official mod in scripts/mod-market.json`);
    copyFileSync(join(built, entry.file), join(stage, entry.file));
    if (entry.icon && existsSync(join(built, entry.icon))) copyFileSync(join(built, entry.icon), join(stage, entry.icon));
    for (const field of ['downloads', 'views', 'installs', 'iconDataUrl']) delete entry[field];
    return entry;
  });
  writeFileSync(join(stage, 'entries.json'), `${JSON.stringify(entries, null, 2)}\n`);
  const tarFile = join(work, 'market.tar');
  const tar = spawnSync('tar', ['-cf', tarFile, '-C', stage, 'entries.json', 'packages', 'icons'], { encoding: 'utf8' });
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`);
  console.log(`publishing ${entries.map((entry) => `${entry.id}@${entry.version}`).join(', ')} to ${server}`);
  const result = ssh(readFileSync(tarFile));
  report(result);
  if (result.status !== 0) process.exit(result.status ?? 1);
  const live = await (await fetch(catalogUrl, { cache: 'no-store' })).json();
  let ok = true;
  for (const entry of entries) {
    const row = live.mods.find((item) => item.id === entry.id);
    const match = row?.version === entry.version && row?.sha256 === entry.sha256;
    ok &&= match;
    console.log(`${match ? 'ok  ' : 'FAIL'} ${entry.id} public=${row?.version ?? '-'} expected=${entry.version}`);
  }
  console.log(`public catalog: ${live.mods.length} mods`);
  process.exit(ok ? 0 : 1);
} finally {
  rmSync(work, { recursive: true, force: true });
}
