#!/usr/bin/env node
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const loaderRoot = join(projectRoot, 'ShinawaseLoader');
const source = join(loaderRoot, 'streaming-bridge.ts');
const output = join(loaderRoot, 'streaming-bridge.cjs');
const echoRoot = resolve(process.argv[2] || process.env.ECHOSTEAM_ROOT || join(projectRoot, '..', 'ECHOSteam-main'));
const marker = 'ECHOSTEAM_ROOT';
const echoRequire = createRequire(join(echoRoot, 'package.json'));
const { build } = echoRequire('esbuild');

if (!existsSync(source)) throw new Error(`bridge source not found: ${source}`);
if (!existsSync(join(echoRoot, 'src', 'main', 'ipc', 'streamingIpc.ts'))) {
  throw new Error(`ECHOSteam source not found: ${echoRoot}`);
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

const sourceText = readFileSync(source, 'utf8').replaceAll(marker, echoRoot.replaceAll('\\', '/'));
const temporary = join(loaderRoot, `.streaming-bridge-${process.pid}.ts`);
writeFileSync(temporary, sourceText, 'utf8');
try {
  await build({
    entryPoints: [temporary],
    outfile: output,
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

writeFileSync(output, patchWasmLoader(readFileSync(output, 'utf8')), 'utf8');
const bytes = statSync(output).size;
const wasmBytes = statSync(wasmOutput).size;
console.log(`Streaming bridge ready: ${output} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Streaming wasm copied: ${wasmOutput} (${(wasmBytes / 1024).toFixed(1)} KB)`);
