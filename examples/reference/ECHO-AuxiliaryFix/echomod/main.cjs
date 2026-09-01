'use strict';

const { join } = require('node:path');

const activate = (host) => {
  const root = host.loaderRoot || process.env.ECHO_MOD_HOME || join(__dirname);
  let installAuxiliaryRemap = null;
  try {
    ({ installAuxiliaryRemap } = require(join(root, 'auxiliary-remap.cjs')));
  } catch {
    try { ({ installAuxiliaryRemap } = require(join(root, 'ShinawaseLoader', 'auxiliary-remap.cjs'))); } catch {}
  }
  const result = typeof installAuxiliaryRemap === 'function'
    ? installAuxiliaryRemap({
      app: host.app,
      BrowserWindow: host.BrowserWindow,
      session: host.session,
      log: (message) => host.log('INFO', message),
    })
    : { ok: false, error: 'auxiliary_remap_missing' };
  const failed = result?.ok === false;
  host.log(failed ? 'ERROR' : 'INFO', failed
    ? `auxiliary remap failed ${result.error || ''}`.trim()
    : 'auxiliary window remap active');
  host.handle?.('status', () => ({ ok: !failed, ...(failed ? { error: result?.error || 'auxiliary_remap_failed' } : {}) }));
  return () => {};
};

module.exports = activate;
module.exports.activate = activate;
