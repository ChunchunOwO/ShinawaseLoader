// Shinawase Testing SDK - editor hints for harness, validation, live client,
// session, and CLI report shapes. Companion of ShinawaseLoader/TESTING.md;
// the runtime contract mirrored from the loader lives in testing/contract.mjs.

export type ShinawaseTestingRecord = {
  seq: number;
  /** SDK surface: echo, extend, player, sdk, sidebar, loaderSettings, http, assets, ui, console, main, native, configUi. */
  api: string;
  method: string;
  args: unknown[];
  result?: unknown;
};

export type ShinawaseLeak = {
  kind: 'dom' | 'listener' | 'observer' | 'timer' | 'interval' | 'raf';
  detail: string;
};

export type ShinawaseCleanReport = { clean: boolean; leaks: ShinawaseLeak[] };

export type ShinawaseHarnessOptions = {
  /** Unpacked package directory containing echo.mod.json / echo.plugin.json. */
  packageDir?: string;
  /** Inline entry source (top-level return/await allowed, loader wrapper shape). */
  source?: string;
  manifest?: Record<string, unknown>;
  entryName?: string;
  /** Replaces the package config.json for this run. */
  config?: Record<string, unknown>;
  id?: string;
  /** Deep-merged over the default window.echo skeleton (SDK.md namespaces). */
  echo?: Record<string, unknown>;
  appSettings?: Record<string, unknown>;
  playerStatus?: Record<string, unknown>;
  /** Routes sandbox fetch()/fetchJson(); absent means harness_offline errors. */
  fetchHandler?: (url: string, options: Record<string, unknown>) => unknown;
  uploadHandler?: (input: Record<string, unknown>) => unknown;
  mainHandlers?: Record<string, (payload: unknown) => unknown>;
  nativeHandlers?: Record<string, (...args: unknown[]) => unknown>;
  uiSettings?: Record<string, unknown>;
  dom?: { title?: string; route?: string; url?: string; scaffold?: boolean };
  debug?: boolean;
};

export type ShinawaseSidebarPageHandle = {
  root: unknown;
  close(): void;
};

export type ShinawaseConfigUiHandle = {
  configUi: Record<string, unknown>;
  state: { saved: Record<string, unknown>[]; closed: boolean; toasts: { message: string; type: string }[] };
  root: unknown;
  /** Runs the registered onSave handler with loader semantics (object -> save then close). */
  submit(): Promise<unknown>;
  close(): void;
};

export type ShinawaseHarness = {
  id: string;
  manifest: Record<string, unknown>;
  config: Record<string, unknown>;
  window: Record<string, unknown>;
  document: Record<string, unknown>;
  /** The echoExternalMod object handed to the entry. */
  context: Record<string, unknown>;
  records: ShinawaseTestingRecord[];
  toasts: string[];
  consoleRecords: { level: string; values: unknown[] }[];
  controls: {
    rawEcho: Record<string, unknown>;
    appSettings: Record<string, unknown>;
    playerModel: Record<string, unknown>;
    setPlayerState(patch: Record<string, unknown>): void;
    emitUiSettings(patch: Record<string, unknown>): Promise<unknown>;
  };
  query(selector: string): unknown;
  queryAll(selector: string): unknown[];
  inject(): Promise<{ status: 'injected' | 'already'; id?: string }>;
  injected(): boolean;
  dispose(): boolean;
  checkClean(): ShinawaseCleanReport;
  expectClean(): void;
  flushTimers(options?: { maxMs?: number; maxTasks?: number }): Promise<number>;
  flushMicrotasks(): Promise<void>;
  openSidebarPage(pageId?: string): ShinawaseSidebarPageHandle;
  openConfigUi(options?: { script?: string }): Promise<ShinawaseConfigUiHandle>;
};

export type ShinawaseValidationIssue = { code: string; message: string };
export type ShinawaseValidationResult = {
  ok: boolean;
  errors: ShinawaseValidationIssue[];
  warnings: ShinawaseValidationIssue[];
  notices: ShinawaseValidationIssue[];
  manifest: Record<string, unknown> | null;
  manifestName: string | null;
  directory: string | null;
  kind?: 'mod' | 'plugin';
  entry?: string | null;
  entryType?: string;
};

export type ShinawaseArchiveResult = ShinawaseValidationResult & {
  file: string;
  type: string | null;
  fileCount: number;
  totalBytes: number;
};

export type ShinawaseSyntaxResult = {
  ok: boolean;
  entryType: string;
  file: string | null;
  skipped?: string;
  error?: { message: string };
};

export type ShinawaseLoaderClient = {
  baseUrl: string;
  port: number;
  status(): Promise<Record<string, unknown>>;
  mods(): Promise<Record<string, unknown>>;
  sdkInfo(): Promise<Record<string, unknown>>;
  logs(options?: { kind?: 'error'; tail?: number }): Promise<Record<string, unknown>>;
  reinject(): Promise<Record<string, unknown>>;
  enable(id: string): Promise<Record<string, unknown>>;
  disable(id: string): Promise<Record<string, unknown>>;
  remove(id: string): Promise<Record<string, unknown>>;
  getConfig(id: string): Promise<Record<string, unknown>>;
  setConfig(id: string, config: Record<string, unknown>): Promise<Record<string, unknown>>;
  playerStatus(): Promise<Record<string, unknown>>;
  player(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  uiSettings(): Promise<Record<string, unknown>>;
  launch(): Promise<Record<string, unknown>>;
  importPackage(fileOrDir: string, options?: { packerScript?: string }): Promise<Record<string, unknown>>;
  renderer(options?: { debugPort?: number; timeoutMs?: number }): Promise<ShinawaseRendererClient>;
};

export type ShinawaseRendererClient = {
  debugPort: number;
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(method: string, handler: (params: unknown) => void): () => void;
  eval(expression: string, options?: { awaitPromise?: boolean }): Promise<unknown>;
  evalValue(expression: string, options?: { awaitPromise?: boolean }): Promise<unknown>;
  probe(): Promise<Record<string, unknown>>;
  injectedMods(): Promise<Record<string, string>>;
  waitForTrue(expression: string, options?: { timeoutMs?: number; pollMs?: number; label?: string }): Promise<true>;
  waitForSelector(selector: string, options?: { timeoutMs?: number; pollMs?: number }): Promise<true>;
  waitForInjected(id: string, options?: { timeoutMs?: number; pollMs?: number }): Promise<true>;
  waitForReady(options?: { timeoutMs?: number }): Promise<true>;
  expectAbsent(selector: string): Promise<true>;
  click(selector: string, options?: { button?: string; clickCount?: number }): Promise<{ x: number; y: number }>;
  dblclick(selector: string): Promise<{ x: number; y: number }>;
  hover(selector: string): Promise<{ x: number; y: number }>;
  scroll(selector: string, options?: { deltaY?: number; deltaX?: number; steps?: number }): Promise<{ x: number; y: number }>;
  type(text: string, options?: { selector?: string }): Promise<void>;
  press(key: string): Promise<void>;
  navigate(routeId: string): Promise<unknown>;
  screenshot(options?: { path?: string; format?: 'png' | 'jpeg' | 'webp'; quality?: number; clip?: { x: number; y: number; width: number; height: number; scale?: number }; fullPage?: boolean }): Promise<{ path: string | null; bytes: number }>;
  screenshotElement(selector: string, options?: Record<string, unknown>): Promise<{ path: string | null; bytes: number }>;
  setViewportOverride(options: { width: number; height: number; deviceScaleFactor?: number }): Promise<() => Promise<unknown>>;
  clearViewportOverride(): Promise<unknown>;
  startConsoleCapture(): Promise<() => void>;
  stopConsoleCapture(): void;
  consoleRecords(options?: { level?: string }): { kind: string; level: string; text: string; at?: number }[];
  reload(options?: { waitReadyMs?: number }): Promise<void>;
  close(): void;
};

export type ShinawaseSessionReport = {
  loaderOwnership: 'external' | 'session' | null;
  echoOwnership: 'external' | 'session' | null;
  userDataIsolated: boolean;
  storeIsolated: boolean;
  rendererSkipped: string | null;
  /** The live session mounted the temporary automation notice in its renderer. */
  automationNoticeShown: boolean;
  warnings: string[];
};

export type ShinawaseArtifact = {
  path: string;
  label: string;
  via: 'renderer' | 'main-process';
  route: string | null;
  viewport: { width: number; height: number; devicePixelRatio: number } | null;
  at: string;
  privacy: string;
};

export type ShinawaseSession = {
  loader: ShinawaseLoaderClient;
  renderer: ShinawaseRendererClient | null;
  report: ShinawaseSessionReport;
  artifacts: { dir: string; runId: string; items: ShinawaseArtifact[]; nextPath(label: string, extension?: string): string };
  debugPort: number;
  screenshot(label: string, options?: { element?: string; path?: string; allowMainFallback?: boolean }): Promise<ShinawaseArtifact>;
  close(options?: { closeEcho?: boolean }): Promise<{ echoClosed: boolean; loaderStopped: boolean; tempDirsRemoved: string[]; notes: string[] }>;
};

/** accept.steps.mjs contract: export steps() (or default) and optionally cleanupSelectors. */
export type ShinawaseAcceptSteps = {
  steps(context: {
    loader: ShinawaseLoaderClient;
    renderer: ShinawaseRendererClient;
    session: ShinawaseSession;
    screenshot(label: string, options?: Record<string, unknown>): Promise<ShinawaseArtifact>;
    report: ShinawaseCliReport;
  }): Promise<void> | void;
  cleanupSelectors?: string[];
};

export type ShinawaseCliStage = {
  id: string;
  ok: boolean;
  skipped?: boolean;
  code?: string;
  durationMs: number;
  detail?: unknown;
  issues?: string[];
  leaks?: ShinawaseLeak[];
};

export type ShinawaseCliReport = {
  reportVersion: 1;
  tool: 'shinawase-testing';
  sdkVersion: number;
  command: string;
  generatedAt: string;
  node: string;
  ok: boolean;
  /** 0 pass, 1 fail, 2 usage, 3 live environment unavailable. */
  exitCode: number;
  stages: ShinawaseCliStage[];
  package?: { id: string | null; version: string | null; kind?: string; directory?: string };
  environment?: Record<string, unknown>;
  artifacts?: ShinawaseArtifact[];
  console?: { errors: number; total: number };
  suggestions?: string[];
};

export function createHarness(options?: ShinawaseHarnessOptions): ShinawaseHarness;
export function smokeRun(options?: ShinawaseHarnessOptions & { settleMs?: number; strictTimers?: boolean }): Promise<{ ok: boolean; stages: unknown[]; leaks: ShinawaseLeak[]; timerWarnings: ShinawaseLeak[]; error?: string; harness: ShinawaseHarness }>;
export function validateManifest(input: string | Record<string, unknown>): ShinawaseValidationResult;
export function checkEntrySyntax(sourceOrFile: string, options?: { entryType?: string; file?: string; fromFile?: boolean; wrapper?: 'entry' | 'configUi' }): ShinawaseSyntaxResult;
export function validatePackageArchive(file: string): ShinawaseArchiveResult;
export function connectLoader(options?: { port?: number; host?: string; timeoutMs?: number }): Promise<ShinawaseLoaderClient>;
export function openSession(options?: Record<string, unknown>): Promise<ShinawaseSession>;
/** Low-level clients: show a temporary notice, then await the disposer before closing CDP. */
export function startAutomationNotice(renderer: ShinawaseRendererClient): Promise<() => Promise<void>>;
