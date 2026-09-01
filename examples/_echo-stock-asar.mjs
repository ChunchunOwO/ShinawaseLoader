import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Stock Steam install. Reads resources/app.asar — the
// original archive, not ShinawaseLoader's isolated modded-runtime copy.
export const DEFAULT_ECHO_ROOT = 'D:/SteamLibrary/steamapps/common/ECHO';

export const resolveEchoRoot = () => {
  const fromExe = process.env.ECHO_EXE && existsSync(process.env.ECHO_EXE)
    ? dirname(process.env.ECHO_EXE)
    : '';
  return process.env.ECHO_ROOT || fromExe || DEFAULT_ECHO_ROOT;
};

export const resolveStockAsar = () => {
  const root = resolveEchoRoot();
  const stock = join(root, 'resources', 'app.asar');
  if (!existsSync(stock)) {
    throw new Error(`stock app.asar not found: ${stock} (set ECHO_ROOT or ECHO_EXE)`);
  }
  return stock;
};

export const readStockAsarLatin1 = () => readFileSync(resolveStockAsar()).toString('latin1');
