# Shinawase Testing SDK

Automated testing SDK for ShinawaseLoader packages, designed for automated
tooling and AI agents as well as humans. It layers offline simulation, static
validation, and live attach-only acceptance so a Mod can be developed and
accepted without guessing at loader internals.

Everything is dependency-free (Node >= 22, the loader's own runtime floor) and
lives in `ShinawaseLoader/testing/`. Editor types are in
`testing/shinawase-testing.d.ts`. The SDK never imports `ShinawaseLoader.mjs`
(which has import-time side effects); the few loader behaviors it must agree
with are mirrored in `testing/contract.mjs` with provenance notes, and
`tests/contract-sync.test.mjs` fails when the mirror drifts from the loader
source.

| Layer | Module | Needs | Purpose |
| --- | --- | --- | --- |
| Offline harness | `testing/harness.mjs` (+ `mock-dom.mjs`, `mock-context.mjs`) | nothing | Run a package entry in the loader's exact wrapper against a recorded mock `echoExternalMod`; audit lifecycle and leaks deterministically. |
| Static validation | `testing/validate.mjs` | nothing | Manifest / entry-wrapper syntax / archive rules mirroring `importPackage` and the packer. |
| Live client | `testing/client.mjs` | running loader + ECHO | Loader HTTP API plus renderer CDP: probes, trusted input, screenshots, console capture. |
| Session driving | `testing/session.mjs` | opt-in | Ownership-tracked launch/attach/close, isolation switches, artifact runs. |

## Quick start (agents)

```powershell
node .\ShinawaseLoader\testing\cli.mjs doctor --json          # what is available?
node .\ShinawaseLoader\testing\cli.mjs check <PACKAGE_DIR> --json
node --test "tests/*.test.mjs"                                # repository self-tests
node .\ShinawaseLoader\testing\cli.mjs accept <PACKAGE_DIR> --json
```

Exit codes everywhere: `0` pass, `1` failure, `2` usage error, `3` live
environment unavailable. `--json` prints exactly one `reportVersion: 1`
document to stdout (progress goes to stderr). `accept` without `--allow-skip`
exits `3` when no loader/ECHO is reachable, so a missing live environment is
reported as *skipped*, never as a false pass — matching the AGENTS.md rule
that skipped real-ECHO checks must be called out.

`test-mod.bat` at the repository root wraps the CLI for interactive use (it
pauses, like `pack-mod.bat`); call the Node script directly for unattended
runs.

## Offline harness

```js
import { createHarness } from './ShinawaseLoader/testing/harness.mjs';

const harness = createHarness({
  packageDir: 'ShinawaseLoader/mod-template',
  config: { message: 'Hello harness' },          // replaces config.json for the run
  echo: { library: { list: async () => [] } },   // deep-merged over the default skeleton
});
const result = await harness.inject();           // { status: 'injected' | 'already' }
harness.query('#echo-sample-mod-badge').click();
await harness.flushTimers({ maxMs: 500 });       // virtual clock: deterministic, no sleeps
harness.dispose();                               // entry cleanup -> sidebar -> extend disposers
harness.expectClean();                           // throws listing leaked DOM/listeners/timers/observers
```

Parity with the loader (`ShinawaseLoader.mjs injectIntoTarget`): entries run as
`(async function(echoExternalMod, console) { ... })`, so top-level `return` and
`await` behave exactly as injected; html/css entries are converted the same way
`modEntrySource` does; re-injecting identical source returns `already` via the
same sha256 signature; `dispose()` runs the returned cleanup, then sidebar,
then extend disposers in loader order.

Key surfaces:

- `harness.records` — every SDK call the entry makes (`echo.*` paths, `sdk`,
  `player`, `extend`, `sidebar`, `loaderSettings`, `fetchJson`, `toast`,
  `main`, `native`, console) as `{ api, method, args }` entries.
- `harness.controls` — scripting knobs: `rawEcho` (hook targets),
  `setPlayerState(patch)`, `emitUiSettings(patch)` (fires
  `shinawase:ui-settings` like the loader), `appSettings`.
- `harness.openSidebarPage(id?)` — mounts a registered sidebar page with the
  bridge page context; `close()` runs its cleanup.
- `harness.openConfigUi()` — runs `configUi` scripts under the `echoConfigUi`
  contract; `submit()` mirrors the loader Save button semantics.
- `checkClean()` / `expectClean()` — leak audit after dispose: connected DOM
  nodes the entry created, listeners still registered on
  window/document/elements, connected MutationObservers, pending virtual
  timers. This is the offline enforcement of the AGENTS.md rule that disabling
  must not leave stale resources or duplicate handlers.
- Timers: the sandbox `setTimeout`/`setInterval`/`requestAnimationFrame` run on
  a virtual clock; `flushTimers({ maxMs })` advances it deterministically.
  Guarded one-shot timeouts that are never cleared (a common shipped-mod
  pattern: `setTimeout(() => { if (!disposed) ... })`) are downgraded to
  warnings by `smokeRun`/`cli check`; pass `--strict-timers` (or
  `strictTimers: true`) to fail on them. `checkClean()` itself always reports
  them.
- Networking: sandbox `fetch`/`fetchJson`/`uploadFile` throw `harness_offline`
  unless you pass `fetchHandler`/`uploadHandler`; `main`/`native` reject with
  `native_host_unavailable` unless scripted via `mainHandlers`/
  `nativeHandlers`. Offline tests can therefore never contact the network by
  accident.

### Supported DOM subset

The mock DOM (like `scripts/_smoke-lyrics-whitebox.cjs` before it) does **not**
validate real ECHO layout; it exists for lifecycle, cleanup, and SDK-usage
checks. Supported: `createElement`, tree ops (`append`/`prepend`/
`insertBefore`/`insertAdjacent*`/`remove`/`replaceChildren`), `innerHTML`
parsing/serialization (nested tags, attributes, entities, raw-text
`style`/`script`), `textContent`, `classList`, `dataset`, `style` (+
`cssText`), attributes, `hidden`, `closest`/`matches`/`contains`, events with
bubbling/`once`/`stopPropagation` and inline `on*` handlers, `click()`,
`MutationObserver` (microtask delivery), `localStorage`, `getComputedStyle`
(inline styles only), `matchMedia` stub, `location` (hash), virtual
timers/rAF. Selectors: `tag`, `*`, `.class`, `#id`, `[attr]`,
`[attr= / ^= / $= / *= / ~=]`, `:not(...)`, descendant and `>` combinators,
comma lists. Unsupported selector syntax **throws** instead of silently
matching nothing. Layout APIs (`getBoundingClientRect`) return zero boxes.
Anything beyond this subset belongs in a live check.

### Trust model

`node:vm` is an engineering convenience, not a security boundary: the harness
executes package code in your Node process. Only run it against packages you
are developing or would inject into ECHO anyway.

## Static validation

```js
import { validateManifest, checkEntrySyntax, validatePackageArchive } from './ShinawaseLoader/testing/validate.mjs';
```

- `validateManifest(dir | manifest)` — safeId, `safeRelative` path rules for
  entry/config/configSchema/configUi/icon/nativeShell, JSON parses, packer
  limits, `native.modules` shapes. Notices flag native-only entries and
  official ECHO sandboxed plugins (which the loader refuses to execute, same
  as `injectionPlan`).
- `checkEntrySyntax(sourceOrFile)` — compile-only check in the loader's async
  wrapper (AGENTS.md validation #2: entries may contain top-level
  `return`/`await`, so `node --check` is the wrong tool). `wrapper: 'configUi'`
  checks config-UI scripts.
- `validatePackageArchive(file)` — ZIP or JSON payload against
  `importPackage` acceptance: manifest presence, safe paths, case-insensitive
  duplicates, entry presence, size caps. Parsing reuses
  `ShinawaseLoader/echomod-archive.mjs`.

## Live client (attach-only)

```js
import { connectLoader } from './ShinawaseLoader/testing/client.mjs';

const loader = await connectLoader();            // throws code 'loader_unreachable' (skipped) if absent
const renderer = await loader.renderer();        // CDP Main window, debugPort discovered from /api/status
await loader.importPackage('path/to/package');   // packs dirs via scripts/pack-echomod.mjs
await loader.enable(id); await loader.reinject();
await renderer.waitForInjected(id, { timeoutMs: 20000 });
await renderer.click('.my-mod-button');          // trusted CDP Input events
await renderer.screenshot({ path: 'out.png' });
await loader.disable(id);
await renderer.expectAbsent('.my-mod-root');
```

- Only documented public surfaces are used: the loader HTTP API on `17862`
  (the same one the injected UI calls) and the CDP/inspector ports the loader
  already opens. **No new loader endpoints exist for testing** — see the
  design note at the end.
- Loopback only; non-loopback hosts are refused (`host_not_loopback`).
- `importPackage` checks the loader's 64 MB request-body cap up front and
  fails with guidance instead of a cryptic HTTP error.
- Input driving uses `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` /
  `Input.insertText` — trusted synthetic events into the renderer (no OS-global
  input, no focus stealing). Prefer API-level assertions (`loader.player`,
  `renderer.navigate(routeId)`, `sdk` paths) for business outcomes; use input
  driving to verify real UI wiring.
- `startConsoleCapture()` subscribes read-only to `Runtime.consoleAPICalled` /
  `Runtime.exceptionThrown`; `accept` fails on renderer errors during steps
  unless `--allow-console-errors`.
- Multiple CDP clients coexist safely with the loader's own injection cycle
  (short-lived, signature-idempotent), as the `examples/*/dev` scripts have
  long demonstrated.
- `reload()` is disruptive but recoverable (the loader watch or an explicit
  reinject restores packages); it is never called implicitly.

## Sessions, launching, and ownership

`openSession(options)` implements a strict probe-first policy:

1. A loader on the target port -> **attach**; a second loader is never started.
2. No loader and `launchLoader: true` -> spawn `node ShinawaseLoader.mjs serve`
   as a child of the session (repo checkout layout: package store and state
   live next to the checkout, not the game).
3. An ECHO already on the CDP port -> `echoOwnership: 'external'`; the session
   will never close it. No ECHO and `launchEcho: true` -> `POST /api/launch`
   (the loader's own selection, runtime sync, and flags; the testing path does
   not trigger self-update) -> `echoOwnership: 'session'`.
4. `close({ closeEcho })` only ever closes a session-owned ECHO, gracefully via
   CDP `Browser.close` on the one connected instance — equivalent to the user
   closing the window. If graceful close fails, ECHO is left running and the
   report says so. The SDK never kills processes by name (the side effect
   AGENTS.md warns about in the dev relaunch flow).

Isolation (session-spawned loaders only; ignored with a warning when
attaching):

- `isolatedUserData: true | dir` sets `ECHO_USER_DATA_PATH_OVERRIDE` for the
  launched ECHO (AGENTS.md test-data isolation). Trade-off: a clean room has
  no account/login state.
- `isolatedStore: true` points `ECHO_MODS_HOME`/`ECHO_PLUGINS_HOME` at a
  temporary store so acceptance imports never touch an installed loader's
  packages.

Temporary directories are only removed when nothing can still be using them;
otherwise they are kept and reported.

### Visible automation notice

Every `openSession()` with a connected renderer, including CLI `accept` and
`shot`, mounts a temporary notice at the top of ECHO's main window before
returning control to the caller: **This instance is being used for automated
testing** (Chinese: **本实例正在用于自动化测试**). The language follows the
document language, falling back to `navigator.language`. Both attached and
session-launched instances show it. `session.report.automationNoticeShown` records
successful setup; initial notice setup failure fails the session.

The notice is a fixed overlay with pointer events disabled. It does not take
focus or change page layout, but can cover content at the top and appears in
screenshots. Keep it in visual baselines. It is owned by
`testing/automation-notice.mjs`, injected only over the session's renderer CDP
connection; ordinary Loader startup, offline checks, and `doctor` do not load
it. No Loader HTTP routes, persistent configuration, or ECHO files are changed
to implement the notice. Its presence does not imply user-data/store isolation.

Always `await session.close()` in a `finally` block. Closing removes the
session's notice before disconnecting CDP, including after failed acceptance
steps or screenshots. Concurrent sessions share one notice; it remains until
the last session ends. A heartbeat every two seconds restores it after page
reloads. If the runner crashes or loses its connection, the renderer expires
its lease about ten seconds after the last heartbeat and removes the notice
and its timer. A suspended renderer or throttled timers may delay that cleanup.
No script is registered to persist across future document loads.

Low-level `connectLoader()` / `RendererClient` callers manage their own
lifecycle. To show the same notice without `openSession()`, import
`startAutomationNotice` from `testing/automation-notice.mjs`, call
`const stopNotice = await startAutomationNotice(renderer)`, and
`await stopNotice()` in `finally` before `renderer.close()`.

## Screenshots and vision-model workflow

- `session.screenshot(label)` writes `NNN-label.png` into a per-run artifacts
  directory under the OS temp dir (`--artifacts-dir` overrides) — never into
  the repository or package directory — and records
  `{ path, route, viewport, devicePixelRatio, at, via }` metadata in the JSON
  report so a vision-capable model can read the files with context.
- Capture is renderer-compositor based (`Page.captureScreenshot`), so the
  image can only ever contain ECHO's own page — physically never the desktop
  or other applications. When the window is occluded/minimized the session
  falls back to the whitelisted main-process `webContents.capturePage()`
  (mirroring `examples/ECHO-MV/dev/capture-main.mjs`), available when ECHO was
  started with the loader's `--inspect` port.
- `--viewport WxH` (accept) applies `Emulation.setDeviceMetricsOverride` for
  reproducible geometry and always restores it afterwards; the real window
  bounds are never touched.
- `renderer.screenshotElement(selector)` clips to one element.
- Privacy: screenshots may contain account names, library contents, or chat.
  Artifacts stay local; each entry carries a privacy note; never commit
  captured user content (AGENTS.md legal rules).

The main-process inspector (`9230`) has full Node/Electron privileges, so the
SDK exposes **no generic main-process eval** — only the two fixed operations
above (capture, window geometry). Packages that need main-process behavior use
the SDK `main.cjs` / `main.invoke` surface.

## CLI reference

```text
check <packageDir> [--json] [--no-smoke] [--pack] [--strict-timers] [--settle-ms <ms>]
test [dir] [--reporter <name>]              # discovers test/, tests/, dev/tests
accept <packageDir> [--json] [--allow-skip] [--allow-overwrite] [--keep] [--keep-enabled]
       [--launch-loader] [--launch-echo] [--close-echo] [--echo <root>]
       [--isolated-user-data [dir]] [--isolated-store] [--steps <file>]
       [--timeout <ms>] [--artifacts-dir <dir>] [--viewport WxH]
       [--allow-console-errors] [--port <n>] [--id <modId>]
       [--no-smoke] [--strict-timers] [--settle-ms <ms>] [--no-failure-screenshot]
doctor [--json] [--port <n>]
shot [--json] [--element <selector>] [--label <name>] [--out <file>] [--port <n>]
```

`accept` pipeline: offline checks -> session -> state snapshot (refuses to
overwrite an installed package id without `--allow-overwrite`; records the
prior enabled state) -> pack + import -> enable + reinject -> wait injected ->
optional steps module -> final screenshot -> console-error gate -> disable +
renderer cleanup verification (`window.__echoExternalMods`, plus
`cleanupSelectors`) -> restore (fixture removed, or prior enabled state
restored; note an overwritten install keeps the newly imported files — only
the enabled state is restorable) -> session close. On failure it captures a
failure screenshot and still disables/removes the fixture. `--keep` leaves the
package installed after the run (re-enabled only if it was enabled before, or
always with `--keep-enabled`); `--no-smoke`, `--strict-timers`, and
`--settle-ms <ms>` tune the offline stage exactly as they do for `check`.

Acceptance steps module (`accept.steps.mjs` next to the package directory, or
`--steps <file>`):

```js
export const cleanupSelectors = ['#my-mod-badge'];
export async function steps({ loader, renderer, session, screenshot }) {
  await renderer.waitForSelector('#my-mod-badge');
  await renderer.click('#my-mod-badge');
  await screenshot('after-click');
  const status = await loader.playerStatus();
  if (!status.ok) throw new Error('player status unavailable');
}
```

UI driving on a shared (non-isolated) profile acts on the user's real account
exactly like a human click. Apart from mounting the automation notice, the
default `accept` pipeline performs no UI interactions; only your steps do.
Keep account/market/social surfaces out of automated steps, or run with
`--isolated-user-data`.

Report schema (`reportVersion: 1`): `ok`, `exitCode`, `stages[]`
(`{ id, ok, skipped?, durationMs, detail }`), `package`, `environment`
(loader version/mode, ECHO product/version/electron/runtime status, session
ownership + isolation — the AGENTS.md integration reporting fields),
`artifacts[]`, `console`, `suggestions`.

## Conventions

- Keep tests **outside** the package payload directory (the packer archives
  everything next to the manifest). Follow the `echomod/` vs `dev/` layout the
  examples use; `tests/templates.test.mjs` is the canonical harness example
  for the shipped templates.
- Repository self-tests: `node --test "tests/*.test.mjs"` from the repo root
  (pass the glob — this Node release does not expand a bare directory
  argument). The suite is fully offline: no ECHO, no network, no dependency
  install.
- Fixture ids for live acceptance use the reserved `shinawase.testing.*`
  namespace.

## Boundaries this SDK keeps

- No new loader HTTP endpoints. The loader API responds with
  `access-control-allow-origin: *` (required by the injected UI), which makes
  it reachable from web pages on the machine; adding evaluation/test routes
  there would expose renderer code execution to any local web page. CDP
  already provides equivalent power without that exposure, so test capability
  lives entirely in this client-side SDK.
- No npm dependencies; no OS-global input; no desktop capture; no process
  kills by name; no generic main-process eval; no use of `native.*` memory
  APIs; no data leaves the machine (no telemetry, no market calls, no
  uploads).
- Existing loader protections (safeId, safeRelative, size caps, loopback
  binding) are mirrored, never relaxed.
- Residual risks stated plainly: CDP/inspector ports are open to local
  processes (loader status quo, unchanged by this SDK); driving UI on a shared
  profile acts on the real account; the harness executes trusted package code
  in-process.
