/// <reference path="./native-ui.d.ts" />
/** Use this declaration for zankyo.entry, separately from the Electron SDK. */
type ShinawaseNativeNode = {
  type: 'original' | 'row' | 'column' | 'text' | 'button';
  text?: string;
  children?: ShinawaseNativeNode[];
  onClick?: string;
  /** RGB integers, e.g. 0x3b82f6. */
  color?: number;
  background?: number;
  padding?: number;
  gap?: number;
  size?: number;
  width?: number;
  height?: number;
  /** Fill the view's available width and height. */
  fill?: boolean;
};
type ShinawaseZankyo = {
  call(method: string, params?: unknown): Promise<unknown>;
  core(method: string, input?: unknown): Promise<unknown>;
  providers: {
    /** Stable provider identity in source queue references and native selectors. */
    readonly plugin: string;
    register(kind: 'sources' | 'lyrics' | 'mv', id: string, descriptor: { title: string },
      handlers: Record<string, (input: Record<string, any> & { signal: AbortSignal }) => unknown | Promise<unknown>>): Promise<unknown>;
  };
  media: {
    /** At most four relays per package, eight current/queued streams per relay. */
    createRelay(): Promise<{
      publish(url: string, headers?: Record<string, string>): string;
      publishFile(absolutePath: string): Promise<string>;
      clear(): void;
      close(): void;
    }>;
  };
  ui: {
    views(): Promise<string[]>;
    patch(view: string, tree: ShinawaseNativeNode): Promise<void>;
    remove(view?: string): Promise<void>;
    action(command: string): Promise<void>;
    onAction(handler: (action: string, fields?: Record<string, string>) => void | Promise<void>): () => void;
    /** Registers or replaces a native page in the fixed Shinawase sidebar drawer. */
    page(id: string, descriptor: { label: string; body: ShinawasePageNode }): () => void;
    createPage(descriptor: { id?: string; label: string; render(): ShinawasePageNode;
      action(name: string, fields: Record<string, string>): unknown | Promise<unknown> }): {
        refresh(): void; error(message: string): void; close(): void;
      };
    choosePath(options?: { directory?: boolean; multiple?: boolean }): Promise<string[] | null>;
    openUrl(url: string): Promise<void>;
  };
  settings: {
    get(): Promise<Record<string, unknown>>;
    /** Validated top-level preference keys; changes persist through ECHO. */
    set(patch: Record<string, unknown>): Promise<void>;
  };
  native: {
    /** Full-trust in-process extension, built for this exact ECHO nativeBuild. */
    load(packageRelativePath: string): Promise<void>;
    invoke(input?: unknown): Promise<void>;
  };
};
declare const echoExternalMod: {
  id: string;
  runtime: 'gpui';
  baseUrl: string;
  manifest: Record<string, unknown>;
  config: Record<string, unknown>;
  /** Package-owned persistent data, separate from ECHO's library and Electron data. */
  dataRoot: string;
  /** Package-scoped timers are retired automatically on failed startup or disable. */
  timers: Pick<Window, 'setTimeout' | 'setInterval' | 'clearTimeout' | 'clearInterval'>;
  /** Package-relative CJS/MJS modules, validated against real paths and watched for reload. */
  importModule(path: string): Promise<any>;
  /** Installed Loader dependencies or Node built-ins. No package-path traversal. */
  importDependency(name: string): any;
  zankyo: ShinawaseZankyo;
  /** Supported Electron API subset; discover methods with sdk.list(). */
  echo: {
    app: {
      getSettings(): Promise<Record<string, unknown>>;
      setSettings(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
    playback: {
      getStatus(): Promise<Record<string, unknown>>;
      play(): Promise<unknown>;
      pause(): Promise<unknown>;
      stop(): Promise<unknown>;
      seek(seconds: number): Promise<unknown>;
      setRepeatMode(mode: 'off' | 'one' | 'all'): Promise<unknown>;
      onStatus(handler: (status: Record<string, unknown>) => void | Promise<void>): () => void;
    };
  };
  settings: {
    get(): Record<string, unknown>;
    set(patch: Record<string, unknown>): Record<string, unknown>;
  };
  player: {
    status(): Promise<Record<string, unknown>>;
    playback(): Record<string, unknown>;
    /** Bounded native snapshot; not the mutable Electron renderer queue VM. */
    queue(): Record<string, unknown> | null;
    play(): Promise<unknown>;
    pause(): Promise<unknown>;
    stop(): Promise<unknown>;
    seek(seconds: number): Promise<unknown>;
    next(): Promise<unknown>;
    previous(): Promise<unknown>;
    setRepeat(mode: 'off' | 'one' | 'all'): Promise<unknown>;
    playTrack(item: Record<string, unknown>, options?: { index?: number; startSeconds?: number }): Promise<unknown>;
    playMedia(item: Record<string, unknown>, options?: { startSeconds?: number }): Promise<unknown>;
    append(item: Record<string, unknown>): Promise<unknown>;
    replaceQueue(items: Record<string, unknown>[], options?: { index?: number; startSeconds?: number }): Promise<unknown>;
    clearQueue(): Promise<void>;
    command(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  sdk: {
    version: 1;
    mode: 'zankyo-compat';
    getEcho(): Record<string, unknown>;
    list(path?: string): string[];
    get(path: string): unknown;
    call(path: string, ...args: unknown[]): unknown;
    status(): Promise<Record<string, unknown>>;
  };
  sidebar: {
    register(page: { id?: string; label: string; native: ShinawasePageNode }): () => void;
  };
  loaderSettings: {
    get(): Promise<Record<string, unknown>>;
    set(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
    onChange(handler: (settings: Record<string, unknown>) => void | Promise<void>): () => void;
  };
  toast(message: string): void;
  assetUrl(path: string): string;
  loadAsset(path: string, options?: { binary?: boolean }): Promise<string | ArrayBuffer>;
  fetchJson(url: string, options?: Record<string, unknown>): Promise<unknown>;
  uploadFile(input: Record<string, unknown>): Promise<unknown>;
  log(...values: unknown[]): void;
};
