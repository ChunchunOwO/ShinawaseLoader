import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DARWIN_APP_NAMES, resourcesDirForExecutable } from './platform.mjs';

const cache = new Map();
const marker = Buffer.from('ECHO_GPUI_SHINAWASE_API_V1');
function nativeMarker(file) {
  const fd = openSync(file, 'r');
  const chunk = Buffer.alloc(1024 * 1024 + marker.length);
  let carry = 0;
  try {
    for (;;) {
      const size = readSync(fd, chunk, carry, 1024 * 1024, null);
      if (!size) return false;
      const length = carry + size;
      if (chunk.subarray(0, length).includes(marker)) return true;
      carry = Math.min(marker.length - 1, length);
      chunk.copy(chunk, 0, length - carry, length);
    }
  } finally { closeSync(fd); }
}
export const nativeExecutableNames = process.platform === 'win32'
  ? ['EchoZankyo.exe', 'echo-gpui.exe'] : ['EchoZankyo', 'echo-gpui'];

export function executableIn(root, platform = process.platform) {
  const files = platform === 'darwin'
    ? DARWIN_APP_NAMES.map((name) => join(root, name, 'Contents', 'MacOS', 'ECHO'))
    : [...nativeExecutableNames, platform === 'win32' ? 'ECHO.exe' : 'ECHO'].map((name) => join(root, name));
  return files.find(existsSync);
}

// Probe the actual native payload first: the Windows ECHO.exe Steam shim exits
// before its child and may coexist with an Electron archive left by Steam.
export function detectEchoRuntime(executable, { probe = spawnSync, platform = process.platform } = {}) {
  const selected = resolve(executable);
  const directory = dirname(selected);
  const names = platform === 'win32' ? ['EchoZankyo.exe', 'echo-gpui.exe'] : ['EchoZankyo', 'echo-gpui'];
  const candidates = [...new Set([
    ...names.map((name) => join(directory, name)).filter(existsSync),
    selected,
  ])];
  for (const candidate of candidates) {
    const stamp = statSync(candidate, { throwIfNoEntry: false });
    if (!stamp?.isFile()) continue;
    const token = `${stamp.size}:${stamp.mtimeMs}`;
    let result = cache.get(candidate);
    if (result?.token !== token || probe !== spawnSync) {
      // Only marked hosts promise a side-effect-free probe; older native builds
      // also open the real app when given an unknown flag.
      const nativeName = /^(?:EchoZankyo|echo-gpui)(?:\.exe)?$/iu.test(basename(candidate));
      const asar = join(resourcesDirForExecutable(candidate, platform), 'app.asar');
      const marked = nativeMarker(candidate);
      if (!marked) {
        result = { token, value: !nativeName && existsSync(asar)
          ? { runtime: 'electron', executable: candidate } : null };
      } else {
        const output = probe(candidate, ['--shinawase-probe'], {
          encoding: 'utf8', timeout: 5000, windowsHide: true,
          env: { ...process.env, SHINAWASE_ENDPOINT: '', SHINAWASE_KEY: '' },
        });
        let description;
        try { description = JSON.parse(String(output.stdout || '').trim()); } catch {}
        result = { token, value: description?.runtime === 'gpui' && description.protocol === 1
          ? { ...description, executable: candidate } : null };
      }
      cache.set(candidate, result);
      while (cache.size > 32) cache.delete(cache.keys().next().value);
    }
    if (result.value) return result.value;
  }
  throw new Error('echo_runtime_unsupported: update Zankyo to a build with the Shinawase interface');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const file = process.argv[2];
    console.log(JSON.stringify(detectEchoRuntime(file)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
