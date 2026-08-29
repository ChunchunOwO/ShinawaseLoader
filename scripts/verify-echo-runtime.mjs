import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loaderRoot = join(repoRoot, 'ShinawaseLoader');
const echoFileName = (name) => /^ECHO(?:\s+(?:NEXT|Playtest|Steam))?\.exe$/iu.test(name);
const echoExeNames = ['ECHO.exe', 'ECHO Steam.exe', 'ECHO NEXT.exe', 'ECHO Playtest.exe'];
const isPlaytest = (value) => {
  const normalized = String(value || '').replaceAll('/', '\\');
  const name = basename(normalized);
  const parent = basename(dirname(normalized));
  return /^ECHO Playtest\.exe$/iu.test(name) || /ECHO Playtest/i.test(parent) || /\\ECHO Playtest\\/i.test(normalized);
};
const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/u, '')); } catch { return null; }
};
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
};
const rankEcho = (exePath) => {
  const normalized = String(exePath || '').replaceAll('/', '\\');
  const name = basename(normalized);
  const parent = basename(dirname(normalized));
  if (isPlaytest(normalized)) return 80;
  if (/\bNEXT\b/i.test(name) || /^ECHO NEXT$/i.test(parent)) return 70;
  if (/\\common\\ECHO\\ECHO\.exe$/i.test(normalized)) return 0;
  if (/^ECHO Steam\.exe$/iu.test(name)) return 10;
  if (/^ECHO\.exe$/iu.test(name)) return 20;
  return 40;
};
const resolveHint = (hint) => {
  if (!hint) return null;
  const path = resolve(String(hint).trim());
  try {
    if (!existsSync(path)) return null;
    if (statSync(path).isFile()) return echoFileName(basename(path)) ? path : null;
    if (!statSync(path).isDirectory()) return null;
    const direct = echoExeNames.map((name) => join(path, name)).filter((file) => existsSync(file) && statSync(file).isFile());
    if (!direct.length) return null;
    return direct.sort((left, right) => rankEcho(left) - rankEcho(right) || left.localeCompare(right))[0];
  } catch {
    return null;
  }
};
const readAsarJson = (archive, relativePath) => {
  let fd;
  try {
    const stat = statSync(archive);
    fd = openSync(archive, 'r');
    const prefix = Buffer.alloc(16);
    if (readSync(fd, prefix, 0, 16, 0) < 16) return null;
    const headerSize = prefix.readUInt32LE(4);
    if (headerSize <= 8 || headerSize > stat.size) return null;
    const header = Buffer.alloc(headerSize);
    if (readSync(fd, header, 0, headerSize, 8) < headerSize) return null;
    const jsonSize = header.readInt32LE(4);
    const tree = JSON.parse(header.subarray(8, 8 + jsonSize).toString('utf8'));
    let node = tree;
    for (const part of String(relativePath || '').replaceAll('\\', '/').split('/').filter(Boolean)) {
      node = node?.files?.[part];
      if (!node) return null;
    }
    if (node.files || node.unpacked || node.link) return null;
    const size = Number(node.size);
    const text = Buffer.alloc(size);
    if (readSync(fd, text, 0, size, 8 + headerSize + Number(node.offset)) < size) return null;
    return JSON.parse(text.toString('utf8').replace(/^\uFEFF/u, ''));
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch {}
  }
};
const readExeFileVersion = (exePath) => {
  if (process.platform !== 'win32' || !exePath) return null;
  try {
    const escaped = String(exePath).replaceAll("'", "''");
    const text = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `(Get-Item -LiteralPath '${escaped}').VersionInfo.FileVersion`,
    ], { encoding: 'utf8', windowsHide: true, timeout: 8000 }).trim();
    return text || null;
  } catch {
    return null;
  }
};
const selectionPath = join(process.env.LOCALAPPDATA || process.env.APPDATA || homedir(), 'ShinawaseLoader', 'selection.json');
const loaderVersion = readJson(join(loaderRoot, 'loader-version.json'));
const selection = readJson(selectionPath) || {};
const persisted = [selection.echoExe, selection.echoRoot].find((value) => value && !isPlaytest(value));
const hint = option('--echo')
  || process.env.ECHO_EXE
  || process.env.ECHO_ROOT
  || process.env.ECHO_INSTALL_ROOT
  || persisted
  || 'D:\\SteamLibrary\\steamapps\\common\\ECHO';
const exe = resolveHint(hint);
if (!exe) {
  console.log(JSON.stringify({
    ok: false,
    error: 'echo_executable_not_found',
    hint,
    loader: loaderVersion,
  }, null, 2));
  process.exitCode = 1;
} else {
  const dir = dirname(exe);
  const asarPackage = readAsarJson(join(dir, 'resources', 'app.asar'), 'package.json');
  let electronVersion = null;
  try {
    const text = readFileSync(join(dir, 'version'), 'utf8').trim();
    if (/^\d+\.\d+\.\d+/.test(text)) electronVersion = text.split(/\s/u)[0];
  } catch {}
  const fileVersion = readExeFileVersion(exe);
  const echo = {
    path: exe,
    product: asarPackage?.name || null,
    version: asarPackage?.version || fileVersion || null,
    electron: electronVersion,
    fileVersion,
    edition: isPlaytest(exe) ? 'playtest' : (/^ECHO NEXT\.exe$/iu.test(basename(exe)) || /^ECHO NEXT$/i.test(basename(dir))) ? 'next' : 'echo-steam',
    userData: join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'ECHO Steam'),
    source: asarPackage ? 'asar-package.json' : (fileVersion ? 'exe-fileversion' : (electronVersion ? 'version-file' : 'path')),
  };

  let ui = null;
  try {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json();
    const target = targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
    if (target) {
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
      let sequence = 0;
      const evaluate = (expression) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const onMessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (message.id !== id) return;
          socket.removeEventListener('message', onMessage);
          if (message.error) reject(new Error(message.error.message));
          else resolve(message.result?.result?.value);
        };
        socket.addEventListener('message', onMessage);
        socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
      });
      const before = await evaluate(`JSON.stringify({
        nav: Boolean(document.querySelector('[data-echo-external-mods]')),
        navText: document.querySelector('[data-echo-external-mods]')?.textContent?.trim() || null,
        panel: Boolean(document.querySelector('.echo-external-mod-panel')),
        hash: location.hash,
      })`);
      await evaluate("document.querySelector('[data-echo-external-mods]')?.click();");
      await delay(500);
      const after = await evaluate(`JSON.stringify({
        nav: Boolean(document.querySelector('[data-echo-external-mods]')),
        panel: Boolean(document.querySelector('.echo-external-mod-panel')),
        parent: document.querySelector('.echo-external-mod-panel')?.parentElement?.className || null,
        position: document.querySelector('.echo-external-mod-panel') ? getComputedStyle(document.querySelector('.echo-external-mod-panel')).position : null,
        gridColumn: document.querySelector('.echo-external-mod-panel') ? getComputedStyle(document.querySelector('.echo-external-mod-panel')).gridColumn : null,
      })`);
      ui = { before: JSON.parse(before), after: JSON.parse(after) };
      socket.close();
    }
  } catch (error) {
    ui = { skipped: true, error: error instanceof Error ? error.message : String(error) };
  }

  console.log(JSON.stringify({
    ok: Boolean(echo.product || echo.version),
    loader: loaderVersion,
    echo,
    ui,
  }, null, 2));
  if (!echo.product && !echo.version) process.exitCode = 1;
}
