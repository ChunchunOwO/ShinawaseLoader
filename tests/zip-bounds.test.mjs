// Regression: readZip compared the central directory's declared size against its
// limits but inflated without a cap, so an entry that understated its size could
// expand far past maxBytes before the length check ran.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip, readZip } from '../ShinawaseLoader/echomod-archive.mjs';

const centralSizeOffset = (zip) => {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  return zip.readUInt32LE(end + 16) + 24;
};

test('an entry that inflates past its declared size is rejected', () => {
  const zip = createZip([{ path: 'big.bin', data: Buffer.alloc(8 * 1024 * 1024) }]);
  zip.writeUInt32LE(16, centralSizeOffset(zip));
  assert.throws(() => readZip(zip, { maxBytes: 1024 }), /echomod_zip_crc_invalid/u);
});

test('honest archives still round-trip', () => {
  const payload = Buffer.from('console.log("ok");\n'.repeat(500));
  const files = readZip(createZip([{ path: 'a/mod.js', data: payload }, { path: 'empty.txt', data: Buffer.alloc(0) }]));
  assert.equal(files.length, 2);
  assert.ok(files[0].data.equals(payload));
  assert.equal(files[1].data.length, 0);
});
