// Node boundary for the original ECHO providers. No Electron or database access.
import { AsyncLocalStorage } from 'node:async_hooks';
export const requests = new AsyncLocalStorage<{ signal: AbortSignal }>();
let settings: () => Record<string, any> = () => ({});
export const configure = (read: typeof settings) => { settings = read; };
const record = (provider: string) => settings().accounts?.[provider] || {};
export const getAppSettings = () => settings();
export const getAccountService = () => ({
  getCredentials: record,
  getStatus: (provider: string) => {
    const account = record(provider);
    return { provider, ...account, cookie: undefined, accessToken: undefined, refreshToken: undefined,
      connected: Boolean(account.cookie || account.accessToken || account.browser) && account.authInvalid !== true };
  },
  getSpotifyTokenRecord: () => record('spotify'),
  getTidalTokenRecord: () => record('tidal'),
});
const token = (provider: string) => {
  const value = record(provider);
  if (!value.accessToken || value.expiresAt && Date.parse(value.expiresAt) < Date.now()) throw new Error(`${provider}: sign in again; access token expired`);
  return value.accessToken;
};
export const getSpotifyAuthService = () => ({ getAccessToken: async () => token('spotify') });
export const getTidalAuthService = () => ({ getAccessToken: async () => token('tidal'),
  getCountryCode: () => settings().tidalCountryCode || 'US' });
export const fetchWithNetworkProxy = (url: RequestInfo | URL, init: RequestInit = {}) => fetch(url, {
  ...init, redirect: 'error', signal: AbortSignal.any([
    ...(init.signal ? [init.signal] : []), ...(requests.getStore()?.signal ? [requests.getStore()!.signal] : []),
    AbortSignal.timeout(15000),
  ]),
});
export const assertNetworkAccessAllowed = () => { requests.getStore()?.signal.throwIfAborted(); };
export const trackNetworkChildProcess = (child: any) => {
  const signal = requests.getStore()?.signal;
  const abort = () => child.kill();
  signal?.addEventListener('abort', abort, { once: true });
  child.once('exit', () => signal?.removeEventListener('abort', abort));
  if (signal?.aborted) abort();
  return child;
};
