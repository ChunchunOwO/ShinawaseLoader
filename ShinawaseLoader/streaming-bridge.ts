import { ipcMain } from 'electron';
import { createRequire } from 'node:module';
import { IpcChannels } from 'ECHOSTEAM_ROOT/src/shared/constants/ipcChannels';
import { getAccountService } from 'ECHOSTEAM_ROOT/src/main/accounts/AccountService';
import { registerAccountIpc } from 'ECHOSTEAM_ROOT/src/main/ipc/accountIpc';
import { registerDownloadsIpc } from 'ECHOSTEAM_ROOT/src/main/ipc/downloadsIpc';
import { registerQobuzIpc } from 'ECHOSTEAM_ROOT/src/main/ipc/qobuzIpc';
import { registerStreamingIpc } from 'ECHOSTEAM_ROOT/src/main/ipc/streamingIpc';
import { getStreamingService } from 'ECHOSTEAM_ROOT/src/main/streaming/StreamingService';

let registered = false;

const removeHandlers = (channels: string[]): void => {
  for (const channel of channels) {
    try { ipcMain.removeHandler(channel); } catch {}
  }
};

export const registerShinawaseStreamingBridge = (): void => {
  if (registered) return;
  registered = true;
  removeHandlers(Object.values(IpcChannels).filter((channel) => /^(streaming:|account:|downloads:|qobuz:|spotify:)/u.test(channel)));
  registerStreamingIpc();
  registerAccountIpc();
  registerDownloadsIpc();
  registerQobuzIpc();
  (globalThis as typeof globalThis & {
    __shinawaseResolveStreamingPlayback?: (request: unknown) => Promise<unknown>;
  }).__shinawaseResolveStreamingPlayback = (request) => {
    const service = getStreamingService();
    const payload = request && typeof request === 'object' ? request as Record<string, unknown> : {};
    if (payload.forceRefresh === true) {
      try { service.invalidatePlayback(payload as never); } catch {}
    }
    return service.resolvePlayback(payload as never);
  };
  // Main-process mods (e.g. the Streaming example's download bridge) need the
  // same account session ECHO's own providers use — NetEase private 歌单
  // enumeration, VIP quality probes and cover fetches all require the login
  // cookie, and the renderer-facing IPC deliberately never exposes it. This
  // getter reads the decrypted per-provider cookie from AccountService.
  (globalThis as typeof globalThis & {
    __shinawaseStreamingAccountCookie?: (provider: unknown) => string | null;
  }).__shinawaseStreamingAccountCookie = (providerName) => {
    try {
      const cookie = getAccountService().getCredentials(String(providerName ?? '').trim() as never).cookie;
      return typeof cookie === 'string' && cookie.trim() ? cookie.trim() : null;
    } catch {
      return null;
    }
  };
  try {
    require('./playback-shim.cjs').installStreamingPlaybackShim();
  } catch {}
  // The netease provider only uses the NCM enhanced client when it is already
  // in the require cache ("hot"); its raw-HTTP fallback endpoints are rejected
  // by netease nowadays (404 on search and player/url). Pay the cold-load cost
  // once here, off the playback hot path, so every later resolve goes through
  // the encrypted NCM client. The package lives in node_modules next to the
  // bundled bridge (see ShinawaseLoader/package.json).
  //
  // generateConfig() performs the xeapi public-key handshake and anonymous
  // registration, persisting both under os.tmpdir(). Without it every xeapi
  // request throws "xeapi public key is missing" and playback resolves fail.
  // When offline it keeps whatever key file a previous run left behind.
  setTimeout(() => {
    void (async () => {
      try {
        const loadNcm = createRequire(import.meta.url);
        const entryPath = loadNcm.resolve('@neteasecloudmusicapienhanced/api');
        loadNcm(entryPath);
        const { dirname, join } = loadNcm('node:path') as typeof import('node:path');
        const generateConfig = loadNcm(join(dirname(entryPath), 'generateConfig.js')) as () => Promise<void>;
        await generateConfig();
        console.log('[ShinawaseBridge] NCM enhanced client ready (xeapi key provisioned)');
      } catch (error) {
        console.warn('[ShinawaseBridge] NCM warm-up failed:', error instanceof Error ? error.message : String(error));
      }
    })();
  }, 4000);
};
