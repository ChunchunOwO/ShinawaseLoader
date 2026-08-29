import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createEngine } = require('../echomod/main.cjs');

const main = async () => {
  const echoUserData = mkdtempSync(join(tmpdir(), 'echo-mv-accounts-'));
  const dataDir = mkdtempSync(join(tmpdir(), 'echo-mv-store-'));
  writeFileSync(join(echoUserData, 'accounts.json'), JSON.stringify({
    bilibili: {
      encryptedCookie: `plain:${Buffer.from('SESSDATA=from-streaming; DedeUserID=1; bili_jct=abc', 'utf8').toString('base64')}`,
      authInvalid: false,
    },
  }));

  const engine = createEngine({
    dataDir,
    echoUserData,
    config: { youtubeApiKey: '', bilibiliCookie: '', debugLog: false },
    log: () => {},
  });
  const status = engine.status();
  if (status.bilibiliCookieSource !== 'echo-account') {
    throw new Error(`expected echo-account, got ${status.bilibiliCookieSource}`);
  }

  const override = createEngine({
    dataDir,
    echoUserData,
    config: { youtubeApiKey: '', bilibiliCookie: 'SESSDATA=manual', debugLog: false },
    log: () => {},
  });
  if (override.status().bilibiliCookieSource !== 'config') {
    throw new Error(`expected config override, got ${override.status().bilibiliCookieSource}`);
  }

  engine.dispose();
  override.dispose();
  console.log('account-cookie-test ok');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
