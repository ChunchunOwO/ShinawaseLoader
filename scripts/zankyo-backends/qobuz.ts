import { QobuzApiClient } from 'echo-source:src/main/qobuz/QobuzApiClient.ts';
import { getAppSettings } from './boundary';
const api = new QobuzApiClient();
export class QobuzAuthService {
  static getInstance() { return new QobuzAuthService(); }
  getApiClient() {
    const config = getAppSettings();
    api.setAppId(config.qobuzAppId || '');
    api.setActiveSecret(config.qobuzAppSecret || '');
    api.setUserAuthToken(config.accounts?.qobuz?.accessToken || '');
    return api;
  }
  getState() { const valid = Boolean(getAppSettings().accounts?.qobuz?.accessToken); return { loggedIn: valid, valid }; }
  async ensureValid() { if (!this.getState().loggedIn) throw new Error('Qobuz: sign in first'); }
}
