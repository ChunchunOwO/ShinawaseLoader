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
  host.log('INFO', result?.ok === false
    ? `auxiliary remap failed ${result.error || ''}`.trim()
    : 'auxiliary window remap active');
  return () => {};
};

module.exports = activate;
exports.activate = activate;
