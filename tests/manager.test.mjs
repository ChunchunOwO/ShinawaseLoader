// Shinawase Manager (ShinawaseLoader/manager): the Node helper's archive
// extraction, drift alarms between the C# sources and the loader / PowerShell
// installer they mirror, and (on Windows with the in-box .NET Framework
// compiler) a real build plus the Steam launch-option round trip against a
// synthetic Steam folder. Nothing here touches the real Steam config, ECHO or
// the network: SHINAWASE_STEAM_ROOT and LOCALAPPDATA point at temp folders.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_UPDATE_MIRRORS, UPDATE_PACKAGES, UPDATE_REPO } from '../ShinawaseLoader/update-net.mjs';
import { extractLoaderTree, githubSources, loaderVersionOf } from '../ShinawaseLoader/manager/manager-helper.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(repo, rel), 'utf8');
const netCs = read('ShinawaseLoader/manager/Net.cs');
const engineCs = read('ShinawaseLoader/manager/Engine.cs');
const setupPs1 = read('scripts/setup-modloader.ps1');
const buildPs1 = read('scripts/build-manager.ps1');
const loaderSource = read('ShinawaseLoader/ShinawaseLoader.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'shinawase-manager-'));
const entry = (path, text) => ({ path, data: Buffer.from(text) });

test('extractLoaderTree keeps only the ShinawaseLoader subtree and refuses traversal', () => {
  const dest = tmp();
  try {
    const count = extractLoaderTree([
      entry('ShinawaseLoader-main/ShinawaseLoader/ShinawaseLoader.mjs', 'loader'),
      entry('ShinawaseLoader-main/ShinawaseLoader/manager/App.cs', 'app'),
      entry('ShinawaseLoader-main/ShinawaseLoader/', ''),
      entry('ShinawaseLoader-main/README.md', 'outside'),
      entry('ShinawaseLoader-main/ShinawaseLoader/../evil.txt', 'x'),
      entry('ShinawaseLoader-main/ShinawaseLoader/a/../../evil2.txt', 'x'),
      entry('ShinawaseLoader-main\\ShinawaseLoader\\win.txt', 'backslashes'),
    ], dest);
    assert.equal(count, 3);
    assert.equal(readFileSync(join(dest, 'ShinawaseLoader.mjs'), 'utf8'), 'loader');
    assert.equal(readFileSync(join(dest, 'manager', 'App.cs'), 'utf8'), 'app');
    assert.ok(existsSync(join(dest, 'win.txt')));
    assert.ok(!existsSync(join(dest, '..', 'evil.txt')));
    assert.ok(!existsSync(join(dest, 'README.md')));
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('loaderVersionOf reads the archived loader-version.json', () => {
  assert.equal(loaderVersionOf([entry('x/ShinawaseLoader/loader-version.json', '{"version":"9.9.9"}')]), '9.9.9');
  assert.equal(loaderVersionOf([entry('x/ShinawaseLoader/loader-version.json', 'not json')]), null);
  assert.equal(loaderVersionOf([]), null);
});

test('helper GitHub sources match the loader self-updater', () => {
  for (const source of githubSources(false)) {
    assert.ok(loaderSource.includes(source.raw.replace(UPDATE_REPO, '${UPDATE_REPO}')), `loader no longer uses ${source.raw}`);
  }
  assert.deepEqual(githubSources(true).map((s) => s.id), ['github']);
});

test('manager mirror and repository literals match update-net.mjs', () => {
  const list = /DefaultShinawaseMirrors = \{ ([^}]*) \}/u.exec(netCs);
  assert.ok(list, 'DefaultShinawaseMirrors literal not found');
  const mirrors = [...list[1].matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
  assert.deepEqual(mirrors, DEFAULT_UPDATE_MIRRORS);
  assert.ok(netCs.includes(`Repo = "${UPDATE_REPO}"`), 'Net.Repo drifted from UPDATE_REPO');
  const ps1 = /\$script:DefaultMirrors = @\(([^)]*)\)/u.exec(setupPs1);
  assert.deepEqual([...ps1[1].matchAll(/'([^']+)'/gu)].map((m) => m[1]), DEFAULT_UPDATE_MIRRORS);
});

test('manager Node mirrors match the PowerShell installer', () => {
  const fromPs1 = [...setupPs1.matchAll(/Id = '(\w+)';[^}]*BaseUrl = '([^']+)'/gu)].map((m) => [m[1], m[2]]);
  const fromCs = [...netCs.matchAll(/Id = "(\w+)", Kind = "node", BaseUrl = "([^"]+)"/gu)].map((m) => [m[1], m[2]]);
  assert.equal(fromCs.length, 4);
  assert.deepEqual(fromCs, fromPs1);
});

test('bundled packages are known update packages', () => {
  const bundled = [...engineCs.matchAll(/Id = "([^"]+)", Name = "[^"]+", DescKey = "[^"]+", FileName = "([^"]+)"/gu)].map((m) => [m[1], m[2]]);
  assert.equal(bundled.length, 3);
  for (const [id, file] of bundled) {
    const known = UPDATE_PACKAGES.find((item) => item.id === id);
    assert.ok(known, `${id} is not in UPDATE_PACKAGES`);
    assert.equal(basename(known.file), file);
    assert.ok(existsSync(join(repo, known.file)), `${known.file} is missing`);
    assert.ok(setupPs1.includes(`Folder = '${basename(file, '.echomod')}'`), `${file} is not offered by Windows setup`);
    assert.ok(read('scripts/setup-modloader-macos.mjs').includes(`'${file}'`), `${file} is not offered by macOS / Linux setup`);
  }
});

test('build script and self-rebuild use the same references', () => {
  const block = /ReferenceNames =\s*\{([^}]*)\}/u.exec(engineCs);
  const fromCs = [...block[1].matchAll(/@?"([^"]+)"/gu)].map((m) => m[1].replaceAll('\\\\', '\\'));
  const psBlock = /foreach \(\$reference in @\(([^)]*)\)\)/u.exec(buildPs1);
  const fromPs = [...psBlock[1].matchAll(/'([^']+)'/gu)].map((m) => m[1]);
  assert.deepEqual(fromCs, fromPs);
});

// ---- Windows: real build ------------------------------------------------------
const windir = process.env.WINDIR || 'C:\\Windows';
const csc = [join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'), join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')].find((p) => existsSync(p));
const canBuild = process.platform === 'win32' && Boolean(csc);
let built = null;
const buildOnce = () => {
  if (built) return built;
  const dir = tmp();
  const exe = join(dir, 'ShinawaseManager.exe');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(repo, 'scripts', 'build-manager.ps1'), '-OutFile', exe, '-Force'], { encoding: 'utf8', timeout: 240000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(existsSync(exe));
  built = { dir, exe };
  return built;
};
const headless = (exe, args, env) => {
  const result = spawnSync(exe, ['--headless', ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, ...env } });
  const lines = String(result.stdout || '').split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  return { status: result.status, lines };
};

test('manager builds and reports the source hash it was built from', { skip: !canBuild && 'needs Windows and the .NET Framework compiler', timeout: 300000 }, () => {
  const { exe, dir } = buildOnce();
  const { status, lines } = headless(exe, ['hash', '--dir', join(repo, 'ShinawaseLoader', 'manager')], { LOCALAPPDATA: dir });
  assert.equal(status, 0);
  assert.equal(lines[0].hash, lines[0].built, 'build-manager.ps1 and ManagerBuild.SourceHash disagree');
});

test('Install all selects the three bundled mods and ignores clicks outside idle options', { skip: !canBuild && 'needs Windows and the .NET Framework compiler' }, () => {
  const { exe, dir } = buildOnce();
  const probe = join(dir, 'install-all.ps1');
  writeFileSync(probe, `param([string]$ExePath)
$ErrorActionPreference = 'Stop'
Add-Type -Path $ExePath
$type = [Shinawase.Manager.MainController]
$flags = [Reflection.BindingFlags]'Instance,NonPublic'
$controller = [Runtime.Serialization.FormatterServices]::GetUninitializedObject($type)
$packages = [Shinawase.Manager.Packages]::Bundled()
$type.GetField('wizardPackages', $flags).SetValue($controller, $packages)
$type.GetField('targets', $flags).SetValue($controller, (New-Object 'System.Collections.Generic.List[Shinawase.Manager.EchoTarget]'))
$method = $type.GetMethod('InstallAllPackages', $flags)
foreach ($state in @('working', 'progress', 'options')) {
  foreach ($package in $packages) { $package.IsSelected = $false }
  $type.GetField('installing', $flags).SetValue($controller, $state -eq 'working')
  $type.GetField('sheetView', $flags).SetValue($controller, $(if ($state -eq 'progress') { 'progress' } else { 'options' }))
  # No target is selected: StartInstall returns before any filesystem or process work.
  $method.Invoke($controller, @())
  @{ state = $state; selected = @($packages | Where-Object IsSelected | ForEach-Object Id) } | ConvertTo-Json -Compress
}
`);
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probe, '-ExePath', exe], { encoding: 'utf8', timeout: 15000, env: { ...process.env, LOCALAPPDATA: dir } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const states = result.stdout.trim().split(/\r?\n/u).map(line => JSON.parse(line));
  assert.deepEqual(states.slice(0, 2).map(state => state.selected), [[], []]);
  assert.deepEqual(states[2].selected.sort(), ['echo.community-streaming', 'echo.lyrics-match-whitebox', 'echo.mv']);
});

const vdf = (text) => text.replace(/^\n/u, '').replaceAll('    ', '\t');
const fixture = (root) => {
  const write = (rel, text) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), vdf(text)); };
  write('config/loginusers.vdf', `
"users"
{
    "76561198000000001"
    {
        "AccountName"        "alice"
        "PersonaName"        "Alice"
        "MostRecent"        "1"
    }
    "76561198000000002"
    {
        "AccountName"        "bob"
        "MostRecent"        "0"
    }
    "76561198000000003"
    {
        "AccountName"        "carol"
        "MostRecent"        "0"
    }
}
`);
  const config = (app) => `
"UserLocalConfigStore"
{
    "Software"
    {
        "Valve"
        {
            "Steam"
            {
                "apps"
                {
                    "730"
                    {
                        "LaunchOptions"        "-novid"
                    }
${app}                }
            }
        }
    }
}
`;
  write('userdata/39734273/config/localconfig.vdf', config('                    "5105090"\n                    {\n                        "LastPlayed"        "1"\n                    }\n'));
  write('userdata/39734274/config/localconfig.vdf', config('                    "5105090"\n                    {\n                        "LaunchOptions"        "-fullscreen"\n                    }\n'));
  write('userdata/39734275/config/localconfig.vdf', config(''));
  write('steamapps/libraryfolders.vdf', `
"libraryfolders"
{
    "0"
    {
        "path"        "${root.replaceAll('\\', '\\\\')}"
    }
}
`);
  write('steamapps/appmanifest_5105090.acf', `
"AppState"
{
    "appid"        "5105090"
    "name"        "ECHO"
    "installdir"        "ECHO"
}
`);
  mkdirSync(join(root, 'steamapps', 'common', 'ECHO'), { recursive: true });
  writeFileSync(join(root, 'steamapps', 'common', 'ECHO', 'ECHO.exe'), 'not a real executable');
};

test('Steam launch options: apply edits one line, keeps user args, restores byte-for-byte', { skip: !canBuild && 'needs Windows and the .NET Framework compiler', timeout: 300000 }, () => {
  const { exe } = buildOnce();
  const root = tmp();
  try {
    fixture(root);
    const env = { SHINAWASE_STEAM_ROOT: root, LOCALAPPDATA: join(root, 'appdata') };
    const echo = join(root, 'steamapps', 'common', 'ECHO');
    const configOf = (id) => join(root, 'userdata', id, 'config', 'localconfig.vdf');
    const before = Object.fromEntries(['39734273', '39734274', '39734275'].map((id) => [id, readFileSync(configOf(id))]));

    const status = headless(exe, ['steam-status', '--echo', echo], env);
    assert.equal(status.status, 0);
    assert.equal(status.lines[0].appId, '5105090');
    const relevant = status.lines.filter((line) => line.account && line.relevant).map((line) => line.account).sort();
    assert.deepEqual(relevant, ['39734273', '39734274'], 'only accounts with the app (or the last sign-in) are touched');

    const applied = headless(exe, ['steam-apply', '--echo', echo], env);
    assert.equal(applied.status, 0);
    const ours = `\\"${echo.replaceAll('\\', '\\\\')}\\\\ECHO.modded.exe\\" %command%`;
    const alice = readFileSync(configOf('39734273'), 'utf8');
    const bob = readFileSync(configOf('39734274'), 'utf8');
    assert.ok(alice.includes(`"LaunchOptions"\t\t"${ours}"`), alice);
    assert.ok(alice.includes('"LaunchOptions"\t\t"-novid"'), 'other games keep their options');
    assert.ok(bob.includes(`"LaunchOptions"\t\t"${ours} -fullscreen"`), bob);
    assert.deepEqual(readFileSync(configOf('39734275')), before['39734275']);
    const added = alice.split('\n').filter((line) => !before['39734273'].toString('utf8').split('\n').includes(line));
    assert.equal(added.length, 1, 'exactly one line is added');
    assert.ok(existsSync(`${configOf('39734273')}.shinawase.bak`));

    headless(exe, ['steam-apply', '--echo', echo], env);
    assert.equal(readFileSync(configOf('39734273'), 'utf8'), alice, 'a second apply is a no-op');

    const restored = headless(exe, ['steam-apply', '--echo', echo, '--restore'], env);
    assert.equal(restored.status, 0);
    for (const id of Object.keys(before)) assert.deepEqual(readFileSync(configOf(id)), before[id], `account ${id} restored`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ShinawaseSetup installs the app layout without node_modules or local state, then uninstalls', { skip: !canBuild && 'needs Windows and the .NET Framework compiler', timeout: 300000 }, () => {
  const dir = tmp();
  try {
    const setup = join(dir, 'ShinawaseSetup.exe');
    const build = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(repo, 'scripts', 'build-setup.ps1'), '-OutFile', setup], { encoding: 'utf8', timeout: 240000 });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    // No Start menu entry, desktop shortcut or registry key: the test stays inside temp.
    const env = { LOCALAPPDATA: join(dir, 'appdata') };
    const app = join(dir, 'app');
    const occupied = join(dir, 'occupied');
    mkdirSync(join(occupied, 'ShinawaseLoader'), { recursive: true });
    writeFileSync(join(occupied, 'ShinawaseLoader', 'keep.txt'), 'existing user data');
    const refused = headless(setup, ['app-install', '--dir', occupied, '--no-start-menu', '--no-register'], env);
    assert.notEqual(refused.status, 0, 'an unmarked nonempty folder must not be replaced');
    assert.equal(readFileSync(join(occupied, 'ShinawaseLoader', 'keep.txt'), 'utf8'), 'existing user data');
    assert.ok(!existsSync(join(occupied, 'ShinawaseManager.exe')));
    const installed = headless(setup, ['app-install', '--dir', app, '--no-start-menu', '--no-register'], env);
    assert.equal(installed.status, 0, JSON.stringify(installed.lines.at(-1)));
    const result = installed.lines.at(-1);
    const version = JSON.parse(readFileSync(join(repo, 'ShinawaseLoader', 'loader-version.json'), 'utf8')).version;
    assert.equal(result.version, version);
    for (const rel of ['ShinawaseManager.exe', 'shinawase-app.json', 'ShinawaseLoader/ShinawaseLoader.mjs', 'ShinawaseLoader/manager/manager-helper.mjs', 'examples/packages/ECHO-Streaming.echomod', 'examples/packages/ECHO-MV.echomod', 'examples/packages/ECHO-LyricsMatchWhitebox.echomod']) {
      assert.ok(existsSync(join(app, rel)), `${rel} missing from the app folder`);
    }
    for (const rel of ['ShinawaseLoader/node_modules', 'ShinawaseLoader/native/build', 'ShinawaseLoader/loader-state.json', 'ShinawaseLoader/.api-token', 'ShinawaseLoader/modded-runtime', 'ShinawaseLoader/Logs']) {
      assert.ok(!existsSync(join(app, rel)), `${rel} must not ship in the setup payload`);
    }
    // The installed copy runs as the manager (loader tree beside it), built from the same sources.
    const hash = headless(join(app, 'ShinawaseManager.exe'), ['hash'], env);
    assert.equal(hash.lines[0].hash, hash.lines[0].built);
    const reinstalled = headless(setup, ['app-install', '--dir', app, '--no-start-menu', '--no-register'], env);
    assert.equal(reinstalled.status, 0, JSON.stringify(reinstalled.lines.at(-1)));
    const removed = headless(setup, ['app-uninstall', '--dir', app], env);
    assert.equal(removed.status, 0, JSON.stringify(removed.lines.at(-1)));
    assert.ok(!existsSync(app), 'app folder removed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Zankyo installers keep npm deps enabled and handle native executables', () => {
  assert.ok(!engineCs.includes('target.IsZankyo ? Task.FromResult(StepState.Skipped) : InstallDeps'), 'Engine.cs must not skip InstallDeps for Zankyo');
  assert.ok(engineCs.includes('"EchoZankyo", "echo-gpui"'), 'Lifecycle.EchoProcesses must track EchoZankyo and echo-gpui');
  assert.ok(!setupPs1.includes("if ($runtime.runtime -ne 'gpui') { Install-StreamingBridgeDeps"), 'setup-modloader.ps1 must not skip streaming deps for Zankyo');
  assert.ok(setupPs1.includes("'EchoZankyo.exe'") && setupPs1.includes("'echo-gpui.exe'"), 'Stop-EchoInRoot must include Zankyo binaries');
  assert.ok(!read('scripts/setup-modloader-macos.mjs').includes("deps && runtime.runtime !== 'gpui'"), 'macOS setup must not skip deps for Zankyo');
  assert.ok(!read('scripts/setup-modloader-linux.mjs').includes("streamingDeps && runtime.runtime !== 'gpui'"), 'Linux setup must not skip deps for Zankyo');
});

test('headless manager installs and uninstalls cleanly on a Zankyo (GPUI) target', { skip: !canBuild && 'needs Windows and the .NET Framework compiler', timeout: 180000 }, async () => {
  const { exe, dir } = buildOnce();
  const root = tmp();
  const { createHash } = await import('node:crypto');
  try {
    const echo = join(root, 'echo-zankyo');
    const localAppData = join(root, 'appdata');
    const steam = join(root, 'steam');
    mkdirSync(echo, { recursive: true });
    mkdirSync(localAppData, { recursive: true });
    mkdirSync(steam, { recursive: true });
    const markerFile = join(root, 'marker.txt');
    const stubCs = join(root, 'EchoZankyo.cs');
    const stubExe = join(echo, 'EchoZankyo.exe');
    writeFileSync(markerFile, 'ECHO_GPUI_SHINAWASE_API_V1', 'ascii');
    writeFileSync(stubCs, [
      'using System;',
      'class Program {',
      '  static int Main(string[] args) {',
      '    foreach (var a in args) {',
      '      if (a == "--shinawase-probe") { Console.WriteLine("{\\"runtime\\":\\"gpui\\",\\"protocol\\":1,\\"version\\":\\"0.2.0\\"}"); return 0; }',
      '    }',
      '    return 0;',
      '  }',
      '}',
    ].join('\n'));
    const stubBuild = spawnSync(csc, ['/nologo', '/target:exe', `/resource:${markerFile}`, `/out:${stubExe}`, stubCs], { encoding: 'utf8' });
    assert.equal(stubBuild.status, 0, stubBuild.stderr || stubBuild.stdout);

    // Pre-seed the @neteasecloudmusicapienhanced/api lock stamp so InstallDeps completes offline as Done (not Skipped).
    const loaderDest = join(echo, 'ShinawaseLoader');
    const lockPath = join(repo, 'ShinawaseLoader', 'package-lock.json');
    const lockHash = createHash('sha256').update(readFileSync(lockPath)).digest('hex').toUpperCase();
    mkdirSync(join(loaderDest, 'node_modules', '@neteasecloudmusicapienhanced', 'api'), { recursive: true });
    writeFileSync(join(loaderDest, 'node_modules', '@neteasecloudmusicapienhanced', 'api', 'package.json'), '{"name":"@neteasecloudmusicapienhanced/api","version":"0.0.0-test"}\n');
    writeFileSync(join(loaderDest, 'node_modules', '.shinawase-deps-lock.sha256'), lockHash);

    const env = { LOCALAPPDATA: localAppData, SHINAWASE_STEAM_ROOT: steam };
    const installed = headless(exe, ['install', '--echo', echo, '--source', join(repo, 'ShinawaseLoader'), '--no-probe', '--packages', 'echo.community-streaming,echo.mv,echo.lyrics-match-whitebox'], env);
    assert.equal(installed.status, 0, JSON.stringify(installed.lines));
    const depsStep = installed.lines.filter((line) => line.event === 'step' && line.step === 'deps').at(-1);
    assert.equal(depsStep?.state, 'Done', 'Zankyo install must run deps instead of skipping it');
    const result = installed.lines.find((line) => line.event === 'result');
    assert.equal(result?.ok, true, JSON.stringify(result));
    assert.equal(result?.packages, 3, JSON.stringify(result));
    for (const id of ['echo.community-streaming', 'echo.mv', 'echo.lyrics-match-whitebox']) {
      assert.ok(existsSync(join(echo, 'Mods', 'installed', id, 'echo.mod.json')), `${id} must be installed`);
    }
    assert.ok(existsSync(join(echo, 'ECHO.modded.exe')), 'ECHO.modded.exe must be generated');
    assert.ok(existsSync(join(loaderDest, 'start-echo-with-mods.cmd')), 'start-echo-with-mods.cmd must be generated');
    const cfg = JSON.parse(readFileSync(join(loaderDest, 'loader.config.json'), 'utf8'));
    assert.equal(cfg.autoStart, false);
    assert.equal(cfg.autoStartMode, 'manual');

    const workshop = headless(exe, ['install', '--echo', echo, '--source', join(repo, 'ShinawaseLoader'), '--edition', 'workshop', '--zip', join(repo, 'ShinawaseLoader', 'loader-version.json'), '--no-probe'], env);
    assert.notEqual(workshop.status, 0);
    const wsResult = workshop.lines.find((line) => line.event === 'result');
    assert.match(String(wsResult?.error || ''), /Zankyo|GPUI/u);

    const removed = headless(exe, ['uninstall', '--echo', echo], env);
    assert.equal(removed.status, 0, JSON.stringify(removed.lines));
    const rmResult = removed.lines.find((line) => line.event === 'result');
    assert.equal(rmResult?.loaderExists, false);
    assert.equal(rmResult?.hostExists, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.after(() => {
  if (built) rmSync(built.dir, { recursive: true, force: true });
});

test('manager sources stay C# 5 compatible', () => {
  const dir = join(repo, 'ShinawaseLoader', 'manager');
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.cs'))) {
    const code = readFileSync(join(dir, name), 'utf8')
      .replace(/@"(?:[^"]|"")*"/gu, '""')
      .replace(/"(?:[^"\\\n]|\\.)*"/gu, '""')
      .replace(/'(?:[^'\\\n]|\\.)+'/gu, "''")
      .replace(/\/\/.*$/gmu, '');
    assert.ok(!/\$"/u.test(code), `${name}: string interpolation needs C# 6`);
    assert.ok(!/\?\.[A-Za-z]/u.test(code), `${name}: ?. needs C# 6`);
    assert.ok(!/\bnameof\(/u.test(code), `${name}: nameof needs C# 6`);
  }
});
