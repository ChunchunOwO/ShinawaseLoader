#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const loaderRoot = join(projectRoot, 'ShinawaseLoader');
const source = join(loaderRoot, 'streaming-bridge.ts');
const output = join(loaderRoot, 'streaming-bridge.cjs');
const echoRoot = resolve(process.argv[2] || process.env.ECHOSTEAM_ROOT || join(projectRoot, '..', 'ECHOSteam-main'));
const marker = 'ECHOSTEAM_ROOT';
const { build } = createRequire(join(echoRoot, 'package.json'))('esbuild');

if (!existsSync(source)) throw new Error(`bridge source not found: ${source}`);
if (!existsSync(join(echoRoot, 'src', 'main', 'ipc', 'streamingIpc.ts'))) {
  throw new Error(`ECHOSteam source not found: ${echoRoot}`);
}

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
        "const __shinawaseBridgeUrl = require('node:url').pathToFileURL(__shinawasePath.join(process.env.ECHO_MOD_HOME || __dirname, 'streaming-bridge.cjs')).href;",
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
const bytes = statSync(output).size;
console.log(`Streaming bridge ready: ${output} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
