'use strict';

/*
 * Dependency-free audio tag writer for the ECHO Streaming mod.
 *
 * Supports the two container formats the streaming providers actually serve
 * for direct downloads:
 *   - mp3  -> a fresh ID3v2.3 tag (UTF-16 text frames + APIC cover) replaces
 *             any existing ID3v2 tag at the start of the file.
 *   - flac -> the metadata block chain is rewritten: STREAMINFO and other
 *             structural blocks are kept, old VORBIS_COMMENT / PICTURE /
 *             PADDING blocks are dropped, and new VORBIS_COMMENT + PICTURE
 *             blocks are inserted.
 *
 * Other formats (m4a/ogg/opus/aac/wav) are left untouched — rewriting those
 * containers safely needs a real muxer, which is not worth a heavy dependency
 * for this example mod.
 *
 * The audio payload is streamed from the original file into a temp file and
 * renamed over the original, so memory usage stays flat even for large
 * lossless files.
 */

const { createReadStream, createWriteStream } = require('node:fs');
const { open, rename, rm, stat } = require('node:fs/promises');
const { pipeline } = require('node:stream/promises');

const FLAC_STREAMINFO = 0;
const FLAC_PADDING = 1;
const FLAC_VORBIS_COMMENT = 4;
const FLAC_PICTURE = 6;

const utf16WithBom = (value) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(String(value), 'utf16le')]);

const id3TextFrame = (id, value) => {
  const payload = Buffer.concat([Buffer.from([0x01]), utf16WithBom(value)]);
  const header = Buffer.alloc(10);
  header.write(id, 0, 'ascii');
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
};

const id3ApicFrame = (cover) => {
  const mime = Buffer.from(`${cover.mimeType || 'image/jpeg'}\u0000`, 'latin1');
  // encoding 0x00 (latin1 description), picture type 0x03 (front cover),
  // empty description terminated by a single 0x00.
  const payload = Buffer.concat([Buffer.from([0x00]), mime, Buffer.from([0x03, 0x00]), cover.data]);
  const header = Buffer.alloc(10);
  header.write('APIC', 0, 'ascii');
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
};

const syncsafe = (value) => Buffer.from([(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f]);

const buildId3v2Tag = (tags) => {
  const frames = [];
  if (tags.title) frames.push(id3TextFrame('TIT2', tags.title));
  if (tags.artist) frames.push(id3TextFrame('TPE1', tags.artist));
  if (tags.album) frames.push(id3TextFrame('TALB', tags.album));
  if (tags.albumArtist) frames.push(id3TextFrame('TPE2', tags.albumArtist));
  if (tags.trackNo) frames.push(id3TextFrame('TRCK', String(tags.trackNo)));
  if (tags.cover?.data?.length) frames.push(id3ApicFrame(tags.cover));
  if (!frames.length) return null;
  const body = Buffer.concat(frames);
  return Buffer.concat([Buffer.from('ID3', 'ascii'), Buffer.from([0x03, 0x00, 0x00]), syncsafe(body.length), body]);
};

// Byte length of an existing ID3v2 tag at the start of the file (0 if none).
const existingId3v2Size = (header) => {
  if (header.length < 10 || header.toString('latin1', 0, 3) !== 'ID3') return 0;
  const size = ((header[6] & 0x7f) << 21) | ((header[7] & 0x7f) << 14) | ((header[8] & 0x7f) << 7) | (header[9] & 0x7f);
  const footer = (header[5] & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
};

const writeMp3Tags = async (filePath, tags) => {
  const tag = buildId3v2Tag(tags);
  if (!tag) return { tagged: false, reason: 'no_tag_fields' };
  const handle = await open(filePath, 'r');
  let audioStart = 0;
  try {
    const header = Buffer.alloc(10);
    const { bytesRead } = await handle.read(header, 0, 10, 0);
    audioStart = bytesRead === 10 ? existingId3v2Size(header) : 0;
    const { size } = await handle.stat();
    if (audioStart >= size) audioStart = 0;
  } finally {
    await handle.close();
  }
  const tempPath = `${filePath}.tagtmp`;
  try {
    const output = createWriteStream(tempPath);
    output.write(tag);
    await pipeline(createReadStream(filePath, { start: audioStart }), output);
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return { tagged: true };
};

const u32le = (value) => { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0, 0); return buffer; };
const u32be = (value) => { const buffer = Buffer.alloc(4); buffer.writeUInt32BE(value >>> 0, 0); return buffer; };

const buildVorbisCommentBlock = (tags) => {
  const vendor = Buffer.from('ECHO-Streaming (ShinawaseLoader)', 'utf8');
  const comments = [];
  const add = (name, value) => { if (value) comments.push(Buffer.from(`${name}=${value}`, 'utf8')); };
  add('TITLE', tags.title);
  add('ARTIST', tags.artist);
  add('ALBUM', tags.album);
  add('ALBUMARTIST', tags.albumArtist);
  add('TRACKNUMBER', tags.trackNo ? String(tags.trackNo) : null);
  if (!comments.length) return null;
  const parts = [u32le(vendor.length), vendor, u32le(comments.length)];
  for (const comment of comments) parts.push(u32le(comment.length), comment);
  return Buffer.concat(parts);
};

const buildFlacPictureBlock = (cover) => {
  const mime = Buffer.from(cover.mimeType || 'image/jpeg', 'latin1');
  return Buffer.concat([
    u32be(3), // front cover
    u32be(mime.length), mime,
    u32be(0), // empty description
    u32be(0), u32be(0), u32be(0), u32be(0), // width/height/depth/colors unknown
    u32be(cover.data.length), cover.data,
  ]);
};

const flacBlockHeader = (type, length, last) => Buffer.from([
  (last ? 0x80 : 0x00) | (type & 0x7f),
  (length >> 16) & 0xff,
  (length >> 8) & 0xff,
  length & 0xff,
]);

const writeFlacTags = async (filePath, tags) => {
  const commentBlock = buildVorbisCommentBlock(tags);
  const pictureBlock = tags.cover?.data?.length ? buildFlacPictureBlock(tags.cover) : null;
  if (!commentBlock && !pictureBlock) return { tagged: false, reason: 'no_tag_fields' };

  const { size: fileSize } = await stat(filePath);
  const handle = await open(filePath, 'r');
  const keptBlocks = [];
  let audioStart = 0;
  try {
    const magic = Buffer.alloc(4);
    const { bytesRead } = await handle.read(magic, 0, 4, 0);
    if (bytesRead !== 4 || magic.toString('latin1') !== 'fLaC') return { tagged: false, reason: 'not_flac' };
    let offset = 4;
    for (;;) {
      const header = Buffer.alloc(4);
      const read = await handle.read(header, 0, 4, offset);
      if (read.bytesRead !== 4) return { tagged: false, reason: 'flac_truncated' };
      const last = (header[0] & 0x80) !== 0;
      const type = header[0] & 0x7f;
      const length = (header[1] << 16) | (header[2] << 8) | header[3];
      if (offset + 4 + length > fileSize) return { tagged: false, reason: 'flac_truncated' };
      if (type !== FLAC_VORBIS_COMMENT && type !== FLAC_PICTURE && type !== FLAC_PADDING) {
        const data = Buffer.alloc(length);
        if (length > 0) {
          const blockRead = await handle.read(data, 0, length, offset + 4);
          if (blockRead.bytesRead !== length) return { tagged: false, reason: 'flac_truncated' };
        }
        keptBlocks.push({ type, data });
      }
      offset += 4 + length;
      if (last) { audioStart = offset; break; }
    }
  } finally {
    await handle.close();
  }
  if (!keptBlocks.length || keptBlocks[0].type !== FLAC_STREAMINFO) return { tagged: false, reason: 'flac_missing_streaminfo' };

  const newBlocks = [...keptBlocks];
  if (commentBlock) newBlocks.push({ type: FLAC_VORBIS_COMMENT, data: commentBlock });
  if (pictureBlock) newBlocks.push({ type: FLAC_PICTURE, data: pictureBlock });

  const tempPath = `${filePath}.tagtmp`;
  try {
    const output = createWriteStream(tempPath);
    output.write(Buffer.from('fLaC', 'latin1'));
    newBlocks.forEach((block, index) => {
      output.write(flacBlockHeader(block.type, block.data.length, index === newBlocks.length - 1));
      output.write(block.data);
    });
    await pipeline(createReadStream(filePath, { start: audioStart }), output);
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return { tagged: true };
};

const writeAudioTags = async (filePath, extension, tags) => {
  const format = String(extension || '').toLowerCase();
  if (format === 'mp3') return writeMp3Tags(filePath, tags);
  if (format === 'flac') return writeFlacTags(filePath, tags);
  return { tagged: false, reason: 'unsupported_format' };
};

module.exports = { writeAudioTags };
exports.writeAudioTags = writeAudioTags;
