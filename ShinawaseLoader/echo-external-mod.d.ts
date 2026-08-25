type EchoExternalSidebarPage = {
  id?: string;
  label: string;
  icon?: string;
  order?: number;
  html?: string;
  render?: (root: HTMLElement, context: EchoExternalModPageContext) => void | (() => void);
};

type EchoExternalModPageContext = {
  id: string;
  manifest: Record<string, unknown>;
  config: Record<string, unknown>;
  echo: Record<string, unknown>;
  assetUrl(path: string): string;
  loadAsset(path: string, options?: { binary?: boolean }): Promise<string | ArrayBuffer>;
  toast(message: string): void;
};

type EchoLoaderUiSettings = {
  /** Loader UI spacing. */
  density: 'comfortable' | 'compact';
  /** `#rrggbb` accent override for loader-owned surfaces, or `''` for the ECHO theme accent. */
  accentColor: string;
  /** Loader UI animations and transitions. */
  animations: boolean;
  /** Mods page layout. */
  cardLayout: 'list' | 'grid';
  /** Show mod descriptions on cards. */
  showModDescriptions: boolean;
  /** Show the version badge on cards. */
  showModVersions: boolean;
  /** Show the package-id badge on cards. */
  showModIds: boolean;
  /** Persist Mods page filter and sort across sessions. */
  rememberFilters: boolean;
  /** Mods page sort order. */
  modSort: 'name' | 'recent' | 'enabled';
  /** Mods page filter chip. */
  modFilter: 'all' | 'active' | 'inactive';
};

type EchoExternalConfigUiFormHandle = {
  /** Detached element containing the rendered fields. Append it anywhere inside `root`. */
  element: HTMLElement;
  /** Read the current values as a config object. */
  read(): Record<string, unknown>;
};

type EchoExternalConfigUiFieldHandle = {
  /** Detached element containing the rendered field. */
  element: HTMLElement;
  /** Read the current field value. */
  read(): unknown;
};

type EchoExternalConfigUiHelpers = {
  /**
   * Render the loader's schema auto-form (switches, enum menus, numeric limits, JSON fallback).
   * Defaults to the package `configSchema` and current config when called without arguments.
   */
  form(schema?: Record<string, unknown> | null, config?: Record<string, unknown>): EchoExternalConfigUiFormHandle;
  /** Render one loader-styled field from a JSON-schema property spec. */
  field(key: string, spec?: Record<string, unknown>, value?: unknown): EchoExternalConfigUiFieldHandle;
};

type EchoExternalConfigUiContext = {
  /** Modal body element. The custom page may take over this node completely. */
  root: HTMLElement;
  /** Installed package id. */
  modId: string;
  /** Package manifest (`echo.mod.json`). */
  manifest: Record<string, unknown>;
  /** Parsed `configSchema`, or `null` when the package has none. */
  schema: Record<string, unknown> | null;
  /** Deep-cloned current `config.json` object. */
  config: Record<string, unknown>;
  /** PUT `/api/mod/:id/config`. Toasts on success and returns the saved config. Does not close the modal. */
  save(next: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Close the configuration modal. */
  close(): void;
  /** Show a loader toast. `type` may be `info`, `success`, `error`, or `warn`. */
  toast(message: string, type?: string): void;
  /** Register a footer Save handler. A returned plain object is PUT then the modal closes; a void/null return only closes. */
  onSave(handler: () => Record<string, unknown> | void | Promise<Record<string, unknown> | void>): void;
  /** Package-relative asset URL served by `GET /api/mod/:id/file/:path`. */
  assetUrl(path: string): string;
  /** Fetch a packaged asset as text, or as `ArrayBuffer` when `options.binary` is true. */
  loadAsset(path: string, options?: { binary?: boolean }): Promise<string | ArrayBuffer>;
  /** Object built from the `default` values in `configSchema` properties. */
  defaults(): Record<string, unknown>;
  /** Snapshot of the loader's appearance settings (accent, density, layout, ...). */
  loaderSettings(): EchoLoaderUiSettings;
  /** Loader-styled form builders that reuse the schema auto-form. */
  ui: EchoExternalConfigUiHelpers;
};

declare const echoConfigUi: EchoExternalConfigUiContext;

type EchoExternalModSdk = {
  version: 1;
  mode: 'external-cdp';
  getEcho(): Record<string, unknown>;
  list(path?: string): string[];
  get(path: string): unknown;
  call(path: string, ...args: unknown[]): unknown;
  status(): Promise<Record<string, unknown>>;
};

type EchoExternalPlayer = {
  version: 1;
  mode: 'external-cdp';
  queue(): Record<string, unknown> | null;
  playback(): Record<string, unknown> | undefined;
  status(): Promise<Record<string, unknown>>;
  play(): Promise<unknown>;
  pause(): Promise<unknown>;
  stop(): Promise<unknown>;
  seek(positionSeconds: number): Promise<unknown>;
  next(): Promise<unknown>;
  previous(): Promise<unknown>;
  playTrack(track: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  playMedia(item: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  playLocal(request: Record<string, unknown>): Promise<unknown>;
  prepare(track: Record<string, unknown>): Promise<unknown>;
  append(track: Record<string, unknown>, source?: Record<string, unknown>): unknown;
  replaceQueue(tracks: Array<Record<string, unknown>>, options?: Record<string, unknown>): unknown;
  clearQueue(): unknown;
  setRepeat(mode: 'off' | 'one' | 'all'): Promise<unknown>;
  command(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
};

type EchoExternalExtend = {
  version: 1;
  mode: 'external-cdp';
  css(id: string, cssText: string): () => void;
  removeCss(id: string): void;
  hook(path: string, wrapper: (original: (...args: unknown[]) => unknown, ...args: unknown[]) => unknown): () => void;
  unhook(path: string): void;
  on(type: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): () => void;
  navigate(routeId: string): void;
  currentRoute(): string | null;
  replaceRoute(routeId: string, options?: { html?: string; render?: (root: HTMLElement) => void | (() => void) }): () => void;
  restoreRoute(routeId: string): void;
  /**
   * Hide a native sidebar route.
   *
   * Legacy ECHO builds are hidden via CSS (`[data-workshop-icon="nav-<id>"]`).
   * ECHO Next removed that hook, so the loader additionally patches the
   * `sidebarHiddenRouteIds` app setting through `window.echo.app.setSettings`.
   * The settings patch persists until `showNav` (or the returned cleanup) runs;
   * routes the user hid themselves are never restored by `showNav`.
   * ECHO Next route ids include `home`, `songs`, `downloads`, `osu-downloader`,
   * `albums`, `artists`, `folders`, `audio-cd`, `remote`, `connect`, `dsp`,
   * `streaming`, `queue`, `history`, `playlists`, `inbox`, `plugins`, `liked`
   * and `settings`.
   */
  hideNav(routeId: string): () => void;
  showNav(routeId: string): void;
  hide(selector: string): () => void;
  show(selector: string): void;
  observe(selector: string, callback: (node: Element) => void): () => void;
};

type EchoNativeModuleInfo = {
  name: string;
  base: string;
  size: number;
};

type EchoNativeScanMatch = {
  address: string;
  offset: number;
};

type EchoExternalNative = {
  version: 1;
  mode: 'in-process-asar-bridge';
  status(): Promise<Record<string, unknown>>;
  modules(): Promise<{ modules?: EchoNativeModuleInfo[] } & Record<string, unknown>>;
  moduleInfo(name?: string): Promise<EchoNativeModuleInfo | null>;
  scan(input: { module?: string; pattern?: string; limit?: number }): Promise<{ matches?: EchoNativeScanMatch[] } & Record<string, unknown>>;
  invoke(method: string, payload?: unknown): Promise<unknown>;
  read(input: { module: string; offset: number; size: number }): Promise<{ data: string; size: number }>;
  write(input: { module: string; offset: number; data: string }): Promise<{ written: number }>;
  protect(input: { module: string; offset: number; size: number; prot: number }): Promise<{ oldProt: number }>;
  readBytes(module: string, offset: number, size: number): Promise<Uint8Array>;
  readInt32(module: string, offset: number): Promise<number>;
  readUInt32(module: string, offset: number): Promise<number>;
  readFloat(module: string, offset: number): Promise<number>;
  readDouble(module: string, offset: number): Promise<number>;
  readBigInt64(module: string, offset: number): Promise<string>;
  readBigUint64(module: string, offset: number): Promise<string>;
  readPointer(module: string, offset: number): Promise<string>;
  readString(module: string, offset: number, size: number): Promise<string>;
  writeBytes(module: string, offset: number, bytes: Uint8Array | ArrayLike<number>): Promise<{ written: number }>;
  writeInt32(module: string, offset: number, value: number): Promise<{ written: number }>;
  writeUInt32(module: string, offset: number, value: number): Promise<{ written: number }>;
  writeFloat(module: string, offset: number, value: number): Promise<{ written: number }>;
  writeDouble(module: string, offset: number, value: number): Promise<{ written: number }>;
  writeBigInt64(module: string, offset: number, value: bigint | string | number): Promise<{ written: number }>;
};

type EchoExternalMain = {
  version: 1;
  mode: 'in-process-asar-bridge';
  invoke(method: string, payload?: unknown): Promise<unknown>;
};

type EchoExternalMod = {
  id: string;
  manifest: Record<string, unknown>;
  config: Record<string, unknown>;
  /**
   * The renderer `window.echo` preload API. On ECHO Next this exposes typed
   * namespaces such as `app`, `playback`, `library`, `libraryLab`, `streaming`,
   * `lyrics`, `mv`, `plugins`, `accounts`, `downloads`, `audio`, `eq`,
   * `diagnostics`, `connect`, `remoteSources`, `desktopLyrics`, `miniPlayer`,
   * `taskbarMiniPlayer`, `hqPlayer`, `spotify`, `smtc`, `audioCd`,
   * `sleepTimer`, `lastfm`, `discordPresence` and `stageBridge`.
   * Prefer `sdk.list()` / `sdk.get()` to discover the exact surface at runtime.
   */
  echo: Record<string, unknown>;
  player: EchoExternalPlayer | null;
  extend: EchoExternalExtend | null;
  native: EchoExternalNative;
  main: EchoExternalMain;
  sdk: EchoExternalModSdk;
  settings: { get(): Record<string, unknown>; set(patch: Record<string, unknown>): Record<string, unknown> };
  loaderSettings: {
    /** GET `/api/ui-settings`. */
    get(): Promise<EchoLoaderUiSettings>;
    /** PUT `/api/ui-settings`. Applies live when the loader UI is mounted. */
    set(patch: Partial<EchoLoaderUiSettings>): Promise<EchoLoaderUiSettings>;
    /** Listen for `shinawase:ui-settings`. The disposer runs automatically when the package is disabled. */
    onChange(handler: (settings: EchoLoaderUiSettings) => void): () => void;
  };
  assetUrl(path: string): string;
  loadAsset(path: string, options?: { binary?: boolean }): Promise<string | ArrayBuffer>;
  sidebar: { register(page: EchoExternalSidebarPage): () => void };
  fetchJson(url: string, options?: Record<string, unknown>): Promise<unknown>;
  uploadFile(input: Record<string, unknown>): Promise<unknown>;
  toast(message: string): void;
  log(...values: unknown[]): void;
  console: Pick<Console, 'debug' | 'info' | 'log' | 'warn' | 'error'>;
};

declare const echoExternalMod: EchoExternalMod;
