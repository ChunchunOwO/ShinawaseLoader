#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { createZip } from '../ShinawaseLoader/echomod-archive.mjs';

const colors = {
  reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m', gray: '\x1b[90m', white: '\x1b[97m',
};
const textExtensions = new Set(['.js', '.mjs', '.cjs', '.html', '.htm', '.css', '.json', '.md', '.txt', '.sig', '.svg', '.xml', '.yaml', '.yml', '.toml']);
const ignoredNames = new Set(['node_modules', '.git', '.processed', 'plugin-storage.json', 'plugin-state.json', '.ds_store']);
const maxFiles = 512;
const maxBytes = 128 * 1024 * 1024;
const formatBytes = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
const fail = (message, code = 1) => { console.error(`${colors.red}Error:${colors.reset} ${message}`); process.exit(code); };
const safePackagePath = (value) => {
  const path = String(value || '').replaceAll('\\', '/');
  if (!path || path.startsWith('/') || /^[a-z]:/iu.test(path) || path.split('/').includes('..')) throw new Error(`invalid package path: ${value}`);
  return path;
};
const isText = (path, data) => textExtensions.has(extname(path).toLowerCase()) && !data.subarray(0, Math.min(data.length, 4096)).includes(0);
const parseArgs = () => {
  const values = process.argv.slice(2);
  const flags = new Set(values.filter((value) => value.startsWith('--')));
  const positional = values.filter((value) => !value.startsWith('--'));
  return { source: positional[0], output: positional[1], zip: flags.has('--zip'), json: flags.has('--json') };
};
const findManifest = (root) => {
  for (const name of ['echo.mod.json', 'echo.plugin.json', 'manifest.json']) {
    const candidate = join(root, name);
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) return { name, path: candidate };
  }
  throw new Error('echo.mod.json, echo.plugin.json, or manifest.json is required');
};
const collectFiles = (root, manifestName) => {
  const files = [];
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignoredNames.has(entry.name.toLowerCase()) || entry.name.endsWith('.log')) continue;
      const fullPath = join(directory, entry.name);
      const packagePath = safePackagePath(prefix ? `${prefix}/${entry.name}` : entry.name);
      if (entry.isDirectory()) visit(fullPath, packagePath);
      else if (entry.isFile() && packagePath !== manifestName) files.push({ path: packagePath, data: readFileSync(fullPath) });
      else if (entry.isSymbolicLink()) throw new Error(`symbolic links are not allowed: ${packagePath}`);
      if (files.length > maxFiles) throw new Error(`too many files (limit ${maxFiles})`);
    }
  };
  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
};
const main = () => {
  const args = parseArgs();
  if (!args.source || args.source === '--help' || args.source === '-h') {
    console.log('Usage: pack-echomod.mjs <mod-directory> [output.echomod] [--zip|--json]');
    return;
  }
  if (args.zip && args.json) throw new Error('--zip and --json cannot be used together');
  const root = resolve(args.source);
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`mod directory not found: ${root}`);
  const manifestInfo = findManifest(root);
  const manifest = JSON.parse(readFileSync(manifestInfo.path, 'utf8'));
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/iu.test(String(manifest.id || ''))) throw new Error('manifest.id must contain 2-64 letters, numbers, dots, underscores, or hyphens');
  const files = collectFiles(root, manifestInfo.name);
  const entry = safePackagePath(manifest.entry || (manifestInfo.name === 'echo.plugin.json' ? 'plugin.js' : 'mod.js'));
  if (!files.some((file) => file.path === entry)) throw new Error(`manifest entry is missing: ${entry}`);
  const totalBytes = files.reduce((total, file) => total + file.data.length, 0);
  if (totalBytes > maxBytes) throw new Error(`package is too large (limit ${formatBytes(maxBytes)})`);
  const output = resolve(args.output || `${manifest.id}-${manifest.version || '1.0.0'}.echomod`);
  console.log(`\n${colors.cyan}${colors.bold}ShinawaseLoader package${colors.reset}`);
  console.log(`${colors.gray}${root}${colors.reset}`);
  for (const file of files) console.log(`  ${colors.green}OK${colors.reset} ${file.path} ${colors.gray}${formatBytes(file.data.length)}${colors.reset}`);
  const type = manifestInfo.name === 'echo.plugin.json' ? 'echo-plugin-package' : 'echo-external-mod';
  let outputData;
  if (args.zip) {
    outputData = createZip([
      { path: manifestInfo.name, data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') },
      ...files,
    ]);
  } else {
    outputData = Buffer.from(JSON.stringify({
      type,
      version: 1,
      exportedAt: new Date().toISOString(),
      manifest,
      files: files.map((file) => ({ path: file.path, ...(isText(file.path, file.data) ? { content: file.data.toString('utf8') } : { encoding: 'base64', content: file.data.toString('base64') }) })),
    }, null, 2) + '\n');
  }
  writeFileSync(output, outputData);
  const size = statSync(output).size;
  console.log(`\n${colors.green}${colors.bold}Package ready${colors.reset}`);
  console.log(`  Mod       ${colors.white}${manifest.name || manifest.id}${colors.reset}`);
  console.log(`  Files     ${files.length}`);
  console.log(`  Contents  ${formatBytes(totalBytes)}`);
  console.log(`  Archive   ${formatBytes(size)} ${args.zip ? '(ZIP)' : '(JSON)'}`);
  console.log(`  Output    ${output}\n`);
};

try { main(); } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
