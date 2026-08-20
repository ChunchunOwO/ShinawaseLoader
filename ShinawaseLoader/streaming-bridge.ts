import { ipcMain } from 'electron';
import { IpcChannels } from 'ECHOSTEAM_ROOT/src/shared/constants/ipcChannels';
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
  }).__shinawaseResolveStreamingPlayback = (request) => getStreamingService().resolvePlayback(request as never);
};
