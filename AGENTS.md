# AGENTS.md

**Document language:** en-US

These instructions apply to the repository root and all descendant directories; follow any more specific `AGENTS.md` in the area being changed. They describe development practice for upstream contributions. Keep examples portable: use quoted placeholders such as `"<ECHO_ROOT>"` and never commit personal paths, account data, or assumptions about sibling repositories or unrelated projects.

## Project overview

ShinawaseLoader is a community external ModLoader for ECHO Steam, separate from ECHO's built-in sandboxed Plugin VM. The default `external-cdp` mode injects enabled packages into the main renderer over a local Chrome DevTools Protocol (CDP) connection. Main-process support uses Node inspector bootstrap or an asar bridge, with extra preload code and an in-process native host. The installer creates an independent `ECHO.modded.exe` launcher and an isolated runtime that follows updates to the installed `app.asar` and executable. On macOS the same role is filled by `ECHO.modded.command` and a copied `ECHO.app`; do not retarget the Windows launcher, PowerShell installer, or `modded-host.cs` when adding Darwin behavior. Preserve the original Steam executable and archive; apply runtime patches to the isolated copies.

There is no root `package.json` or repository-wide formatter. Repository self-tests live in `tests/` and run offline with `node --test "tests/*.test.mjs"` (pass the glob; this Node line does not expand a bare directory argument). The Shinawase Testing SDK under `ShinawaseLoader/testing/` is the standard entry point for package validation and acceptance. The root batch files are Windows entry points, while Node dependencies live under `ShinawaseLoader/`. Start with `git status --short` and the tracked file list to distinguish source from installed packages and runtime output. Read `README.md`, `ShinawaseLoader/SDK.md`, `ShinawaseLoader/TESTING.md`, and the relevant module or template before changing behavior; the README, SDK, and TESTING documents are the public user, Mod-author, and testing contracts.

## Repository map

- `ShinawaseLoader/ShinawaseLoader.mjs`: Loader CLI, local HTTP API, package lifecycle, CDP injection, configuration, and self-update logic.
- `ShinawaseLoader/loader-ui.js` and `ShinawaseLoader/i18n.mjs`: injected Mods, Market, configuration, and Loader pages, plus shared localization. The CLI assembles the renderer script from these files.
- `ShinawaseLoader/SDK.md` and `ShinawaseLoader/echo-external-mod.d.ts`: public runtime objects, APIs, and types for external Mods and Plugins.
- `ShinawaseLoader/testing/` and `ShinawaseLoader/TESTING.md`: the Shinawase Testing SDK — offline harness (`harness.mjs`, `mock-dom.mjs`, `mock-context.mjs`), static validation (`validate.mjs`), live attach-only clients and sessions (`client.mjs`, `session.mjs`), CLI (`cli.mjs`), and editor types. `testing/contract.mjs` mirrors the loader literals the SDK depends on, and `tests/contract-sync.test.mjs` fails when that mirror drifts. The SDK never imports `ShinawaseLoader.mjs` and adds no loader HTTP endpoints; it ships with the loader tree so package authors get it too.
- `ShinawaseLoader/main-bootstrap.cjs`, `ShinawaseLoader/streaming-bridge.ts`, `ShinawaseLoader/streaming-preload.cjs`, and `ShinawaseLoader/playback-shim.cjs`: main-process bootstrap, streaming/account integration, renderer exposure, and playback compatibility.
- `ShinawaseLoader/native-host.cjs` and `ShinawaseLoader/native/`: package main-script lifecycle, in-process native extensions, and the C addon/host-DLL interface. `ShinawaseLoader/native-shell-host.cjs` instead manages separate native-shell executables over a pipe protocol.
- `ShinawaseLoader/auxiliary-remap.cjs`, `ShinawaseLoader/auxiliary-guard-preload.cjs`, and `ShinawaseLoader/auxiliary-page-boot.js`: auxiliary-window routing and startup compatibility.
- `ShinawaseLoader/runtime-sync.mjs`, `ShinawaseLoader/echo-asar.mjs`, and `ShinawaseLoader/modded-host.cs`: runtime fingerprinting/copying, asar bridge patching, and the independent Windows launcher. `ShinawaseLoader/platform.mjs` holds path and executable classification; `ShinawaseLoader/echo-modded-host.mjs` is the macOS isolated-runtime host.
- `ShinawaseLoader/echomod-archive.mjs` and `scripts/pack-echomod.mjs`: ZIP archive handling and Mod/Plugin packaging; package import and manifest normalization also live in the Loader CLI.
- `ShinawaseLoader/loader.config.json` and `ShinawaseLoader/loader-version.json`: distributable configuration defaults and release/Node runtime metadata. Keep local test settings out of these tracked defaults.
- `ShinawaseLoader/mod-template/`, `ShinawaseLoader/plugin-template/`, and `ShinawaseLoader/native-plugin-template/`: starting points for external Mods, Plugins, and native extensions. Keep manifests and cleanup patterns aligned with the SDK.
- `scripts/setup-modloader.ps1`, `scripts/dev-with-latest-mods.ps1`, and `scripts/build-release.ps1`: Windows installation, example development, and release assembly. `setup-modloader.sh` and `scripts/setup-modloader-macos.mjs` install against an `ECHO.app` content root. Other scripts cover bridge builds, runtime verification, and diagnostics.
- `scripts/mod-market.json`, `scripts/build-mod-market.mjs`, and `scripts/mod-market-web/`: catalog inputs, catalog generation, and the standalone market website. `scripts/mod-market-server.py` provides the Python API; `scripts/echo-hub-mod-market.js` integrates with the Hub.
- `examples/ECHO-MV/`, `examples/ECHO-Streaming/`, and `examples/ECHO-LyricsMatchWhitebox/`: example sources under each `echomod/` directory. Only MV and Streaming are installer optional packages; LyricsMatchWhitebox is an extra package. See `examples/README.md`.
- `examples/reference/`: archived reference Mods and their separate packages under `examples/reference/packages/`; these are not installer defaults.
- `examples/packages/`: distributable packages generated from the active example sources.
- `tests/`: offline repository self-tests for the loader contract and the testing SDK (`node --test "tests/*.test.mjs"`): contract sync, mock DOM, harness lifecycle, validation and package-archive rules, template acceptance, live-client degradation, and macOS path/runtime fixtures (`platform-macos.test.mjs`). They need no ECHO, no network, and no dependency install, and are not copied into releases.
- Root `*.bat` files: Windows wrappers for setup, local development, packaging, testing (`test-mod.bat`), and release scripts. `setup-modloader.sh` is the macOS installer entry and `start-mac.command` finds `ECHO.app`, installs, and launches. Neither replaces those wrappers.
- Root `index.js`: a large Electron host bundle, not the Loader entry point. Unless a task explicitly targets it, do not hand-edit, reformat, or replace it. If it must change, preserve `/* shinawase-loader-bridge-v1 */` and document provenance and the generation process.

## Source and generated files

- Edit `ShinawaseLoader/streaming-bridge.ts` and its build script, not the generated `ShinawaseLoader/streaming-bridge.cjs`. The same build copies `ShinawaseLoader/um_wasm_bg.wasm` from a dependency in the supplied ECHO source tree. Review provenance and licenses before including either output.
- `examples/ECHO-MV/echomod/mod.js` is generated from `dev/mod.logic.js`, `dev/i18n.json`, and `echomod/mv.css` within that example. Use `examples/ECHO-MV/dev/build-modjs.mjs` after changing those inputs; review the generated diff before packaging.
- Rebuild an example `.echomod` only when its packaged content changes. Changes to external development scripts or unrelated documentation do not by themselves require package regeneration. Keep packages beside the corresponding active or reference collection.
- Do not include `release/`, `dist/`, `node_modules/`, native build directories, logs, Loader state, isolated runtimes, backups, temporary diagnostics, or locally installed `Mods/` and `Plugins/` in a patch. The tracked bridge outputs and example packages above are explicit exceptions to the generated-file rule. Check the actual diff even when `.gitignore` exists.
- Scripts prefixed with `_` and files under example `dev/` directories include one-off extraction and live diagnostic tools as well as useful checks. Read their inputs, output paths, and side effects before running them; their presence does not make them portable public APIs.

## Legal and DMCA-aware contribution rules

This project integrates with ECHO and third-party services. Keep contributions suitable for redistribution by the upstream repository:

- Do not add copyrighted ECHO binaries, extracted `app.asar` contents, application artwork, music, video, fonts, or proprietary source unless the source and the new file have documented redistribution permission. Permission to run or inject a Mod does not by itself grant permission to redistribute host code or assets.
- Do not vendor code from a private or locally available ECHO checkout into a tracked source file without recording its provenance and redistribution rights. The streaming bridge build may consume a contributor-supplied source tree at build time; verify that generated output is redistributable before committing it, and prefer source adapters or documented public interfaces when possible.
- Do not implement or document DRM removal, license-check bypasses, anti-cheat evasion, unauthorized account access, credential harvesting, or circumvention of access controls. A feature that only uses the user's running ECHO instance and its documented/public APIs must remain within that boundary.
- Do not ship credentials, cookies, tokens, private API keys, personal data, or captured user content in code, fixtures, screenshots, logs, packages, or generated catalogs. Redact diagnostic output before committing it.
- Keep third-party notices and licenses when redistributing code or assets. Do not remove attribution or change a license header merely to make a bundle smaller.
- If a proposed change depends on material with unclear redistribution rights, stop before adding it and ask the maintainer to resolve provenance or licensing. Respect valid copyright notices and repository takedown requests; remove or replace affected generated artifacts through the normal review process.
- If a copyright or DMCA concern is reported, do not re-upload the material, switch mirrors, or bypass a takedown. Preserve enough metadata to identify the affected file and route the report to the maintainer for review.

Keep this guide and new contributor-facing documentation in en-US. Preserve the language of existing documentation and keep runtime localization resources and localized Mod fields consistent with their surrounding content.

## Environment and dependencies

- Windows remains the PowerShell target. The installer and development wrappers use Windows PowerShell; the development script requires PowerShell 5.1 or later. macOS support is additive: `./setup-modloader.sh --echo "<ECHO_ROOT>"` expects a directory that contains `ECHO.app` (or the bundle or `Contents/MacOS/ECHO` path) and does not run `setup-modloader.ps1` or compile `modded-host.cs`. The optional market server uses Python 3 and the standard library; it is not required for Loader or Mod development.
- `ShinawaseLoader/package.json` currently requires Node `>=22.23.2`; `ShinawaseLoader/loader-version.json` selects the installer runtime. Use the checked-in lockfile for dependencies, and update it with the manifest when dependencies change. From the repository root:

  ```powershell
  npm --prefix .\ShinawaseLoader ci
  ```

- Building the streaming bridge requires a separately supplied, compatible ECHO source tree with its own build dependencies installed, including `esbuild` and the crypto WASM dependency. Installing this repository's dependencies alone does not provide them. Pass the source explicitly or set `ECHOSTEAM_ROOT`; do not rely on sibling-directory or home-directory discovery:

  ```powershell
  npm --prefix .\ShinawaseLoader run build:streaming-bridge -- "<ECHOSTEAM_SOURCE>"
  ```

- The bridge builder can validate IPC against a supplied installation's archive through `ECHO_STEAM_ASAR`. Set that variable to an explicit `app.asar` path when doing this validation; otherwise the script probes default locations and may skip validation if no archive exists. Neither the source tree nor an installed ECHO is needed for documentation-only work.
- Building the Electron native host uses `node-gyp`, Python, and a compatible C/C++ toolchain; it may download tooling and Electron headers. The application version is not the Electron ABI. Pass the target installation and verify the resolved Electron version, since the script falls back to a fixed version when detection fails:

  ```powershell
  npm --prefix .\ShinawaseLoader run build:native-host -- -EchoRoot "<ECHO_ROOT>"
  ```

- The native Plugin template's example DLL uses CMake, separately from the Loader addon build. The installer also compiles `ShinawaseLoader/modded-host.cs` for the launcher. Do not make native builds a prerequisite for JavaScript, documentation, or packaging changes that do not affect them.

## Common workflows

Run commands from the repository root unless stated otherwise. Replace quoted placeholders before running them: `<ECHO_ROOT>` is an explicitly selected ECHO installation, `<LOADER_ROOT>` is the Loader directory to operate on, and `<ECHOSTEAM_SOURCE>` is a separately supplied ECHO source tree. Batch wrappers may pause; call their underlying Node or PowerShell scripts directly for unattended checks.

### Validate and accept a package with the testing SDK

Offline validation needs no ECHO and no dependency install. From the repository root:

```powershell
node .\ShinawaseLoader\testing\cli.mjs check "<PACKAGE_DIR>" --json
node --test "tests/*.test.mjs"
```

`check` validates the manifest against the loader import rules, compiles the entry (and any `configUi` script) in the exact injected wrapper, and runs an offline harness smoke with a leak audit. Keep package tests outside the package payload directory (the `echomod/` vs `dev/` layout); `tests/templates.test.mjs` is the canonical harness example, and `ShinawaseLoader/TESTING.md` documents the harness, client, and report contracts.

Live acceptance attaches to an already-running loader and renderer; it does not start or stop anything unless asked:

```powershell
node .\ShinawaseLoader\testing\cli.mjs doctor --json
node .\ShinawaseLoader\testing\cli.mjs accept "<PACKAGE_DIR>" --json
```

`accept` imports into the target loader's real package store (snapshotting and restoring the enabled state, and refusing an installed id without `--allow-overwrite`), so point it at a disposable or deliberately chosen loader. `--launch-loader` / `--launch-echo` / `--close-echo` are explicit opt-ins with session ownership tracking; `--isolated-user-data` and `--isolated-store` create a clean-room profile and package store for session-spawned loaders. Screenshots and JSON reports land in a temporary artifacts directory, never in the repository; treat captured images as potentially personal data and keep them out of patches.

Keep the visible automation notice ("This instance is being used for automated testing") mounted for the entire time an agent-driven check is attached to a live renderer. `openSession()`-based flows — CLI `accept` and `shot` included — show it automatically and remove it on `session.close()`. When driving a renderer through low-level `connectLoader()` / `RendererClient` access instead, call `startAutomationNotice(renderer)` from `ShinawaseLoader/testing/automation-notice.mjs` before the first automated interaction and `await` the returned disposer in a `finally` block before disconnecting; do not interleave automated renderer interactions outside the notice's lifetime. The notice is session-scoped and heartbeat-leased, so a crashed runner cannot leave it behind; `ShinawaseLoader/TESTING.md` ("Visible automation notice") is the authoritative contract.

### Install or update a local target

This is an installation operation, not a test: it can download Node and release files, create or replace `ECHO.modded.exe` and `ShinawaseLoader/modded-runtime`, and import optional packages. Select the target explicitly and use a disposable or deliberately chosen installation:

```powershell
.\setup-modloader.bat -Action install -EchoRoot "<ECHO_ROOT>"
```

Use `-Action update` for updates. Installation includes interactive package selection and a launch prompt. `-Action check` reports local, installed, and remote versions, so it also contacts the network. These workflows are not offline validation; select checks from the validation section when installation is outside the task.

macOS installation is separate and still writes into the selected ECHO content root:

```bash
./setup-modloader.sh --echo "<ECHO_ROOT>" --no-packages
./start-mac.command
```

`<ECHO_ROOT>` is the directory containing `ECHO.app`. Omit `--echo` (or double-click `start-mac.command`) to search Steam `libraryfolders.vdf`, `/Applications`, `~/Applications`, the saved selection, and Spotlight for `app.echo.steam`. Playtest is not auto-selected. `start-mac.command` also launches `ECHO.modded.command`. Omit `--no-packages` to import the bundled Streaming and MV packages. The script refuses to run on Windows.

### Package a Mod or Plugin

The package directory must contain `echo.mod.json`, `echo.plugin.json`, or a compatible `manifest.json`; the declared or default entry must exist. Keep entries and assets relative to the package. The packer checks paths, symbolic links, file counts, and content size, and excludes a specific set of runtime files. Inspect package contents rather than assuming every local artifact is excluded. Place output outside the input directory so a later build cannot include an earlier archive.

```powershell
.\pack-mod.bat "<PACKAGE_DIR>" "<OUTPUT_FILE>.echomod" --zip
```

Call the Node script directly when the batch wrapper's pause behavior is undesirable:

```powershell
node .\scripts\pack-echomod.mjs "<PACKAGE_DIR>" "<OUTPUT_FILE>.echomod" --zip
```

For MV renderer changes, regenerate and check the entry before packaging:

```powershell
node .\examples\ECHO-MV\dev\build-modjs.mjs
node .\examples\ECHO-MV\dev\check-modjs.mjs
```

When rebuilding an example package, check the packaged manifest version, entry, icon, configuration files, and README against the source. Build market metadata only after the corresponding archive is up to date.

### Build a release

```powershell
.\build-release.bat
```

The release script reads `ShinawaseLoader/loader-version.json` and produces `release/ShinawaseLoader-<version>` plus a ZIP. `scripts/build-release.ps1` accepts `-OutputRoot` and `-NoZip` and replaces the same-version output directory. It copies the Loader tree with a limited exclusion list, so build from a clean source tree and inspect the output for dependencies, runtime copies, native build directories, and other unintended files. Fix sources and rebuild rather than editing a release copy.

### Build the Mod Market catalog

```powershell
node .\scripts\build-mod-market.mjs
node .\scripts\_smoke-mod-market.mjs
```

The builder reads `scripts/mod-market.json`, existing example packages, source manifests, icons, and READMEs. It generates `dist/mod-market/`; it does not rebuild packages or verify that their contents match the source manifests. An optional output-directory argument is supported, but the builder recursively deletes that directory first: use only a disposable output directory, never source or a deployed market data directory. The local smoke check reads the default `dist/mod-market/index.json` and checks catalog fields; it does not compare local archive hashes. When package content changes, verify the packaged version and SHA-256 against the catalog. Web-only changes do not require repacking Mods.

### Develop against a local ECHO installation

This flow requires a Loader already installed at the explicit target. It packs, imports, and enables example Mods using that installed Loader; it does not deploy changes to Loader source or run the MV source generator. Do not rely on automatic installation discovery:

```powershell
.\dev-with-latest-mods.bat -EchoRoot "<ECHO_ROOT>" -NoLaunch
```

`-NoLaunch` skips quitting and launching ECHO but still changes installed packages and enablement state. `-Watch` repeats package import and can request reinjection from a running Loader. Without `-NoLaunch`, the relaunch path stops processes by name as well as path, so even an explicit `-EchoRoot` does not confine termination to one installation. `-KeepRunning` can still enter that relaunch path if no Loader API responds. Use these flows only when their process and installation side effects are part of the intended check.

Runtime synchronization also writes files. Select both the source installation and the Loader directory explicitly and disable its automatic updater:

```powershell
node .\ShinawaseLoader\runtime-sync.mjs --echo "<ECHO_ROOT>" --loader "<LOADER_ROOT>" --skip-update
node .\scripts\verify-echo-runtime.mjs --echo "<ECHO_ROOT>"
```

`verify-echo-runtime.mjs` reads installation metadata and attempts a live UI check that clicks the Mods navigation item. Its CDP probe and `scripts/cdp-eval.mjs` use port `9229` and select a renderer independently of `--echo`; confirm that endpoint belongs to the intended instance. A skipped UI probe is not an integration pass. Keep CDP, inspector, and Loader endpoints on loopback.

An isolated runtime protects installation files, not user data: ECHO normally shares its application data with the regular installation. Use `ECHO_USER_DATA_PATH_OVERRIDE` when a check needs separate test data. Do not enable self-update or external downloads in reproducible tests unless they are under test; launchers can update automatically even when called by a development script. Use temporary directories for test packages and remove them after the check.

## Validation strategy

Choose checks that match the change. Avoid scripts that terminate user processes or contact external services when a static check is sufficient.

1. **Documentation:** verify referenced paths, script parameters, working directories, and generated-file instructions against source. Documentation-only changes do not require ECHO, dependency installation, or runtime builds. Check whitespace with `git diff --check`; include new files in the review.
2. **Syntax:** run `node --check "<FILE>"` for changed standalone `.js`, `.mjs`, and `.cjs` files. Injected renderer entries run as async function bodies and may contain top-level `return` or `await`; validate those in the matching wrapper without executing them — `node .\ShinawaseLoader\testing\cli.mjs check "<PACKAGE_DIR>"` does exactly that for entries and `configUi` scripts, and MV additionally provides `examples/ECHO-MV/dev/check-modjs.mjs`. For PowerShell, parse without executing and inspect parameters, quoting, path handling, and native-command exit codes; use PSScriptAnalyzer when available. For Python market changes, run `python -m py_compile .\scripts\mod-market-server.py` with a Python 3 interpreter.
3. **Package behavior:** for archive, manifest, or import changes, build temporary packages and verify that valid ZIP and JSON packages succeed while missing entries and unsafe paths fail. `tests/package-archive.test.mjs` automates these cases through `testing/validate.mjs`, which mirrors the import rules. Keep temporary output outside source and installed-package directories.
4. **Offline smoke checks:** `node .\ShinawaseLoader\testing\cli.mjs check "<PACKAGE_DIR>"` runs an offline harness smoke (inject, dispose, leak audit) against a mock DOM, and `node --test "tests/*.test.mjs"` runs the repository suite; run the suite for any change under `ShinawaseLoader/testing/` or `tests/`, and for loader changes that touch mirrored contract literals. `node .\scripts\_smoke-lyrics-whitebox.cjs` exercises the lyrics Mod with its own simulated DOM. None of these validate real ECHO layout. The market build/smoke commands above check a generated local catalog. Run only checks relevant to the changed behavior.
5. **Network checks:** `examples/ECHO-MV/dev/test-engine.mjs` uses live provider requests and writes temporary data. The market smoke script's `--live` flag contacts the public market and downloads a package. Neither is an offline unit test; use only when those integrations are in scope, and do not expose credentials or captured user content.
6. **Build checks:** for bridge, native-host, or release changes, run the relevant build when its prerequisites are available. Check for locked outputs, leftover temporary files, unintended files, and redistribution rights. If prerequisites are unavailable, report exactly which build was not run.
7. **Integration:** for CDP injection, main-process behavior, native loading, synchronization, or UI changes, verify with an explicitly selected ECHO installation and renderer. `node .\ShinawaseLoader\testing\cli.mjs doctor --json` reports loader/CDP/inspector availability; `node .\ShinawaseLoader\testing\cli.mjs accept "<PACKAGE_DIR>" --json` runs the attach-only acceptance pipeline (import, enable, probe, screenshot, disable, renderer cleanup verification) and captures the ECHO build, loader mode, session ownership, and isolation fields the report below asks for. Exit code 3 means the live environment was unavailable: report the check as skipped, never as passed. Launching or closing ECHO is opt-in (`--launch-echo`, `--close-echo`), ownership-tracked, and always graceful; the SDK never terminates processes by name, and acceptance refuses to overwrite an installed package id without `--allow-overwrite`. Check disable/re-enable and reinjection cleanup where applicable. Report the ECHO build, Loader mode, isolated-runtime usage, test-data isolation, and key errors without personal paths or secrets. Do not run real-ECHO checks in CI without an environment configured for them.

Existing JavaScript generally uses two-space indentation, semicolons, and single quotes; follow the surrounding file rather than reformatting large bundles or generated output. Add tests for observable behavior and meaningful regressions, not for implementation details alone; changes to the loader's public contract or to `ShinawaseLoader/testing/` should extend `tests/` in the same patch.

## Implementation conventions

- Read the target module and its template/SDK before changing callers. Keep public manifest fields, HTTP routes, event names, and SDK methods backward compatible. If a breaking change is necessary, update the SDK, templates, examples, and migration notes in the same patch.
- Renderer entries that create DOM nodes, timers, observers, event listeners, or sidebar pages must return a cleanup function. Also clean up resources owned by custom config UIs and main-process scripts through their respective lifecycle hooks. Disabling, closing, or reinjecting must not leave stale resources or duplicate handlers.
- Custom configuration scripts receive `echoConfigUi`, not `echoExternalMod`. Preserve the `config.schema.json` fallback when `configUi` is missing or fails, and keep SDK types and the configuration template aligned with changes.
- Prefer ECHO's public `window.echo` surface and the Loader's `echoExternalMod` context. Do not mix the official sandboxed Plugin VM API with the Loader SDK or copy private implementation details into a Mod.
- Use main-process and native extensions only when required, following the lifecycle and failure isolation in `ShinawaseLoader/main-bootstrap.cjs` and `ShinawaseLoader/native-host.cjs`. Preserve safe-mode and native-host disable behavior. Keep application version, Electron ABI, and audio-backend contract version separate.
- Preserve normalization, allowlists, size limits, and loopback binding checks for package paths, manifest paths, market URLs, proxy URLs, and archive entries. Do not relax traversal, arbitrary-protocol, arbitrary-file-read, or cross-process-write protections for convenience.
- Logs and errors should be actionable without exposing cookies, tokens, passwords, media contents, or unnecessary local paths. Redact new diagnostics and state their data scope.
- For ECHO build differences, prefer capability detection, version gates, and safe fallback behavior. Do not depend on one minified variable name, one DOM position, or one contributor's absolute path.
- When changing Loader/SDK versions, ECHO compatibility floors, bridge IPC, or manifest fields, review `ShinawaseLoader/loader-version.json`, `README.md`, `ShinawaseLoader/SDK.md`, `ShinawaseLoader/echo-external-mod.d.ts`, templates, and affected examples together. Take release versions from metadata and compatibility requirements from the relevant manifests; do not freeze a contributor's installed build into this guide.

## Before opening a pull request

- Review `git status --short` and both staged and unstaged diffs, including new files. Include only source, documentation, and required generated artifacts for the task; preserve unrelated work.
- No `node_modules`, logs, state files, runtime copies, temporary diagnostics, user-installed packages, release output, credentials, or proprietary game assets are included.
- Appropriate syntax, smoke, build, or integration checks were run; unavailable prerequisites and skipped real-ECHO checks are called out in the PR.
- Commands in documentation run from the repository root and use portable placeholders rather than a personal machine path.
- The PR description explains the behavior change, compatibility impact, validation commands, provenance/licensing considerations for generated content, and known limitations.
