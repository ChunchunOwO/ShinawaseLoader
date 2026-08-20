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

type EchoExternalMod = {
  id: string;
  manifest: Record<string, unknown>;
  config: Record<string, unknown>;
  echo: Record<string, unknown>;
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
