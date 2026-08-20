import { deflateRawSync, inflateRawSync } from 'node:zlib';

const localSignature = 0x04034b50;
const centralSignature = 0x02014b50;
const endSignature = 0x06054b50;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[i] = value >>> 0;
  }
  return table;
})();

export const crc32 = (input) => {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const dosDate = () => {
  const now = new Date();
  return { date: ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(), time: (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2) };
};

export const createZip = (entries) => {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(String(entry.path).replaceAll('\\', '/'), 'utf8');
    const source = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = deflateRawSync(source, { level: 6 });
    const { date, time } = dosDate();
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(localSignature, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc32(source), 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26); name.copy(local, 30);
    locals.push(local, compressed);
    const record = Buffer.alloc(46 + name.length);
    record.writeUInt32LE(centralSignature, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(8, 10); record.writeUInt16LE(time, 12); record.writeUInt16LE(date, 14);
    record.writeUInt32LE(crc32(source), 16); record.writeUInt32LE(compressed.length, 20); record.writeUInt32LE(source.length, 24);
    record.writeUInt16LE(name.length, 28); name.copy(record, 46); record.writeUInt32LE(offset, 42);
    central.push(record); offset += local.length + compressed.length;
  }
  const centralData = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(endSignature, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralData, end]);
};

export const readZip = (archive, limits = {}) => {
  const bytes = Buffer.isBuffer(archive) ? archive : Buffer.from(archive);
  const maxEntries = limits.maxEntries ?? 512;
  const maxBytes = limits.maxBytes ?? 128 * 1024 * 1024;
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index--) {
    if (bytes.readUInt32LE(index) === endSignature) { end = index; break; }
  }
  if (end < 0) throw new Error('echomod_zip_end_missing');
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  const directoryOffset = bytes.readUInt32LE(end + 16);
  if (count > maxEntries || directoryOffset + directorySize > bytes.length) throw new Error('echomod_zip_directory_invalid');
  const files = [];
  let cursor = directoryOffset;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (bytes.readUInt32LE(cursor) !== centralSignature) throw new Error('echomod_zip_entry_invalid');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString((flags & 0x800) ? 'utf8' : 'latin1');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith('/') || size > maxBytes || total + size > maxBytes) throw new Error('echomod_zip_size_invalid');
    if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== localSignature) throw new Error('echomod_zip_local_invalid');
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error('echomod_zip_data_invalid');
    const compressed = bytes.subarray(dataStart, dataEnd);
    const data = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : (() => { throw new Error('echomod_zip_method_unsupported'); })();
    if (data.length !== size || crc32(data) !== expectedCrc) throw new Error('echomod_zip_crc_invalid');
    total += data.length;
    files.push({ path: name, data });
  }
  return files;
};

export const isZip = (value) => Buffer.isBuffer(value) && value.length >= 4 && value.readUInt32LE(0) === localSignature;
