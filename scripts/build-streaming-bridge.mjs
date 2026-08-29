#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const loaderRoot = join(projectRoot, 'ShinawaseLoader');
const source = join(loaderRoot, 'streaming-bridge.ts');
const output = join(loaderRoot, 'streaming-bridge.cjs');
const buildOutput = join(loaderRoot, `.streaming-bridge.build-${process.pid}.cjs`);
const marker = 'ECHOSTEAM_ROOT';

const unique = (paths) => {
  const seen = new Set();
  const next = [];
  for (const path of paths) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    next.push(path);
  }
  return next;
};

const isEchoSource = (root) => existsSync(join(root, 'src', 'main', 'ipc', 'streamingIpc.ts'));

const echoRootCandidates = unique([
  process.argv[2] ? resolve(process.argv[2]) : '',
  process.env.ECHOSTEAM_ROOT ? resolve(process.env.ECHOSTEAM_ROOT) : '',
  resolve(projectRoot, '..', 'ECHOSteam-main'),
  resolve(homedir(), 'Desktop', 'ECHOSteam-main'),
  resolve(homedir(), 'Desktop', 'ECHOSteam'),
  resolve(homedir(), 'Desktop', 'Codex-Projects', 'ECHOSteam-main'),
  resolve(projectRoot, '..', 'ECHOSteam'),
]);

const echoRoot = echoRootCandidates.find((root) => isEchoSource(root));
if (!existsSync(source)) throw new Error(`bridge source not found: ${source}`);
if (!echoRoot) {
  throw new Error(`ECHOSteam source not found. Tried: ${echoRootCandidates.join(' | ')}. Asar has no src/; cannot invent StreamingService from stock IPC names.`);
}

const echoRequire = createRequire(join(echoRoot, 'package.json'));
const { build } = echoRequire('esbuild');
const echoPackage = JSON.parse(readFileSync(join(echoRoot, 'package.json'), 'utf8'));

const extractIpcValues = (text) => {
  const values = new Set();
  const re = /:\s*["']((?:streaming|account|downloads|qobuz|spotify):[^"']+)["']/g;
  let match;
  while ((match = re.exec(text))) values.add(match[1]);
  return values;
};

const readAsarFile = (asarPath, relativePath) => {
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
  const entry = files.find((file) => file.path === relativePath)
    || files.find((file) => file.path.startsWith('out/preload/ipcChannels-') && file.path.endsWith('.mjs'));
  if (!entry) return null;
  const dataOffset = 8 + headerSize;
  return bytes.subarray(dataOffset + entry.offset, dataOffset + entry.offset + entry.size).toString('utf8');
};

const requiredBridgeChannels = [
  'streaming:search',
  'streaming:getTrack',
  'streaming:resolvePlayback',
  'streaming:resolveLive',
  'streaming:listAccountPlaylists',
  'streaming:importPlaylistFromUrl',
  'streaming:syncLikedSongs',
  'streaming:setTrackLiked',
  'account:get-statuses',
  'account:save-cookie',
  'account:start-netease-qr-login',
];

const sourceIpcText = readFileSync(join(echoRoot, 'src', 'shared', 'constants', 'ipcChannels.ts'), 'utf8');
const sourceBridgeChannels = extractIpcValues(sourceIpcText);
const missingInSource = requiredBridgeChannels.filter((channel) => !sourceBridgeChannels.has(channel));
if (missingInSource.length) {
  throw new Error(`ECHOSteam source IPC missing required bridge channels: ${missingInSource.join(', ')}`);
}

const asarCandidates = unique([
  process.env.ECHO_STEAM_ASAR ? resolve(process.env.ECHO_STEAM_ASAR) : '',
  resolve('D:/SteamLibrary/steamapps/common/ECHO/resources/app.asar'),
  resolve('C:/Program Files (x86)/Steam/steamapps/common/ECHO/resources/app.asar'),
]);
const asarPath = asarCandidates.find((path) => existsSync(path));
if (asarPath) {
  const asarBytes = readFileSync(asarPath);
  const asarSha = createHash('sha256').update(asarBytes).digest('hex');
  const expectedSha = 'c59648731aea7f109317c26a9181bb6626b9c9e7f130998c2577a99e9ccae2c0';
  if (asarSha !== expectedSha) {
    console.warn(`Stock asar SHA256 ${asarSha} != 26.8.28 ${expectedSha}; still validating IPC names.`);
  }
  const asarIpc = readAsarFile(asarPath, 'out/preload/ipcChannels-CKJHta3q.mjs');
  if (!asarIpc) throw new Error(`26.8.28 ipcChannels not found in ${asarPath}`);
  const asarBridgeChannels = extractIpcValues(asarIpc);
  const missingInAsar = [...sourceBridgeChannels].filter((channel) => !asarBridgeChannels.has(channel));
  const extraInAsar = [...asarBridgeChannels].filter((channel) => !sourceBridgeChannels.has(channel));
  if (missingInAsar.length || extraInAsar.length) {
    throw new Error(
      `streaming/account/downloads/qobuz/spotify IPC drifted vs ${asarPath}. missingInAsar=${missingInAsar.join(',') || '-'} extraInAsar=${extraInAsar.join(',') || '-'}`,
    );
  }
  const ipcValueCount = [...asarIpc.matchAll(/:\s*['"][^'"]+['"]/g)].length;
  console.log(`IPC aligned with 26.8.28 asar (${asarPath}): ${asarBridgeChannels.size} bridge-prefix channels match source ${echoPackage.version}; ${ipcValueCount} ipc values; sha256=${asarSha}`);
} else {
  console.warn('Stock EchoSteam asar not found; skipped 26.8.28 IPC validation.');
}

const findCryptoWasm = () => {
  const name = 'um_wasm_bg.wasm';
  const candidates = [];
  try {
    candidates.push(join(dirname(echoRequire.resolve('@clamber_l/crypto/package.json')), 'dist', name));
  } catch {}
  candidates.push(join(echoRoot, 'node_modules', '@clamber_l', 'crypto', 'dist', name));
  const match = candidates.find((file) => existsSync(file));
  if (!match) throw new Error(`crypto wasm not found: ${candidates.join(' | ')}`);
  return match;
};

const patchWasmLoader = (js) => {
  const helper = '__shinawaseReadWasm("um_wasm_bg.wasm")';
  let next = js.replaceAll(
    'module_or_path = new URL("um_wasm_bg.wasm", __shinawaseBridgeUrl);',
    `module_or_path = ${helper};`,
  );
  next = next.replace(
    /function loader\(\) \{\s*\{[\s\S]*?return __wbg_init\(\{ module_or_path: [\s\S]*?\}\)\.then\(\(\) => \(initPanicHook\(\), true\)\);\s*\}\s*\}/,
    `function loader() {\n  return __wbg_init({ module_or_path: ${helper} }).then(() => (initPanicHook(), true));\n}`,
  );
  if (!next.includes(helper)) {
    throw new Error('failed to patch wasm-bindgen loader to use __shinawaseReadWasm');
  }
  if (next.includes('new URL("um_wasm_bg.wasm", __shinawaseBridgeUrl)')) {
    throw new Error('wasm-bindgen still resolves um_wasm_bg.wasm via import.meta.url');
  }
  return next;
};

const wasmSource = findCryptoWasm();
const wasmOutput = join(loaderRoot, 'um_wasm_bg.wasm');
copyFileSync(wasmSource, wasmOutput);

console.log(`Building streaming bridge from ${echoRoot} (${echoPackage.name}@${echoPackage.version})`);
const sourceText = readFileSync(source, 'utf8').replaceAll(marker, echoRoot.replaceAll('\\', '/'));
const temporary = join(loaderRoot, `.streaming-bridge-${process.pid}.ts`);
writeFileSync(temporary, sourceText, 'utf8');
try {
  await build({
    entryPoints: [temporary],
    outfile: buildOutput,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    define: {
      'import.meta.url': '__shinawaseBridgeUrl',
      'import.meta.dirname': '__dirname',
    },
    packages: 'bundle',
    external: ['electron', 'better-sqlite3', 'sharp', 'taglib-wasm'],
    alias: {
      '#echo-private-overlay-runtime': join(echoRoot, 'src', 'main', 'plugins', 'privateOverlayRuntime.ts'),
    },
    banner: {
      js: [
        "const __shinawaseModule = require('node:module');",
        "const __shinawasePath = require('node:path');",
        "const __shinawaseFs = require('node:fs');",
        "const __shinawaseBridgeUrl = require('node:url').pathToFileURL(__shinawasePath.join(__dirname, 'streaming-bridge.cjs')).href;",
        "const __shinawaseReadWasm = (fileName) => {",
        "  const dirs = [__dirname, process.env.ECHO_MOD_HOME, __shinawasePath.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', '@clamber_l', 'crypto', 'dist')].filter(Boolean);",
        "  const seen = new Set();",
        "  for (const dir of dirs) {",
        "    const file = __shinawasePath.join(dir, fileName);",
        "    if (seen.has(file)) continue;",
        "    seen.add(file);",
        "    if (__shinawaseFs.existsSync(file)) return __shinawaseFs.readFileSync(file);",
        "  }",
        "  throw new Error('[ShinawaseLoader] wasm not found: ' + fileName + ' searched ' + [...seen].join(' | '));",
        "};",
        "process.env.NODE_PATH = [process.env.NODE_PATH, __shinawasePath.join(process.resourcesPath || '', 'app.asar', 'node_modules'), __shinawasePath.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules')].filter(Boolean).join(__shinawasePath.delimiter);",
        '__shinawaseModule.Module._initPaths();',
      ].join('\n'),
    },
    logLevel: 'info',
    legalComments: 'none',
  });
} finally {
  rmSync(temporary, { force: true });
}

const bundled = patchWasmLoader(readFileSync(buildOutput, 'utf8'));
const missingInBundle = requiredBridgeChannels.filter((channel) => !bundled.includes(channel));
if (missingInBundle.length) {
  rmSync(buildOutput, { force: true });
  throw new Error(`bundled bridge missing IPC strings: ${missingInBundle.join(', ')}`);
}
if (!bundled.includes('registerShinawaseStreamingBridge') || !bundled.includes('__shinawaseResolveStreamingPlayback')) {
  rmSync(buildOutput, { force: true });
  throw new Error('bundled bridge missing registerShinawaseStreamingBridge exports');
}
writeFileSync(buildOutput, bundled, 'utf8');

const isLockError = (error) => {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN'
    || String(error).includes('user-mapped section');
};

const replaceOutput = () => {
  try {
    writeFileSync(output, bundled, 'utf8');
    rmSync(buildOutput, { force: true });
    return true;
  } catch (error) {
    if (!isLockError(error)) throw error;
    try {
      copyFileSync(buildOutput, output);
      rmSync(buildOutput, { force: true });
      return true;
    } catch (copyError) {
      if (!isLockError(copyError)) throw copyError;
      try {
        const parked = `${output}.locked-${Date.now()}`;
        renameSync(output, parked);
        writeFileSync(output, bundled, 'utf8');
        rmSync(buildOutput, { force: true });
        try { rmSync(parked, { force: true }); } catch {}
        return true;
      } catch (renameError) {
        if (!isLockError(renameError)) throw renameError;
        return false;
      }
    }
  }
};

let replaced = replaceOutput();
for (let attempt = 0; !replaced && attempt < 4; attempt += 1) {
  await new Promise((resolveWait) => setTimeout(resolveWait, 500 * (attempt + 1)));
  replaced = replaceOutput();
}
if (!replaced) {
  throw new Error(`Could not replace locked ${output}. Close ECHO and rebuild; staged file: ${buildOutput}`);
}

const bytes = statSync(output).size;
const wasmBytes = statSync(wasmOutput).size;
console.log(`Streaming bridge ready: ${output} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Streaming wasm copied: ${wasmOutput} (${(wasmBytes / 1024).toFixed(1)} KB)`);
