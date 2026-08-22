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
  echo: Record<string, unknown>;
  player: EchoExternalPlayer | null;
  extend: EchoExternalExtend | null;
  native: EchoExternalNative;
  main: EchoExternalMain;
  sdk: EchoExternalModSdk;
  settings: { get(): Record<string, unknown>; set(patch: Record<string, unknown>): Record<string, unknown> };
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
