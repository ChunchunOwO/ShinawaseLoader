import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Package-owned, bounded relay. Credentials never enter the native queue. */
export async function createMediaRelay() {
  const streams = new Map();
  let closed = false;
  const retire = stream => { for (const read of stream.reads) read.abort(); };
  const server = createServer((request, response) => {
    const stream = streams.get(request.url);
    const range = request.headers.range;
    if (!stream || !['GET', 'HEAD'].includes(request.method) || stream.reads.size >= 4 ||
        range && !/^bytes=\d{1,15}-\d{0,15}$/u.test(range)) {
      response.writeHead(404).end(); return;
    }
    const controller = new AbortController();
    stream.reads.add(controller);
    response.once('close', () => controller.abort());
    response.setTimeout(45000, () => response.destroy());
    void (async () => {
      if (stream.file) {
        const { size } = await stat(stream.file);
        const [, first, last] = /^bytes=(\d+)-(\d*)$/u.exec(range || '') || [];
        const start = first ? Number(first) : 0, end = last ? Number(last) : size - 1;
        if (start > end || end >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
        response.writeHead(range ? 206 : 200, { 'Content-Type': 'application/octet-stream',
          'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
          ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
        if (request.method === 'HEAD') response.end();
        else await pipeline(createReadStream(stream.file, { start, end }), response, { signal: controller.signal });
        return;
      }
      const timeout = setTimeout(() => controller.abort(), 10000);
      const upstream = await fetch(stream.url, { method: request.method,
        headers: { ...stream.headers, ...(range ? { Range: range } : {}) },
        redirect: 'error', signal: controller.signal }).finally(() => clearTimeout(timeout));
      if (![200, 206, 416].includes(upstream.status)) {
        await upstream.body?.cancel();
        response.writeHead(upstream.status === 403 ? 403 : 502).end(); return;
      }
      const headers = { 'Cache-Control': 'no-store' };
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(name);
        if (value) headers[name] = value;
      }
      response.writeHead(upstream.status, headers);
      if (request.method === 'HEAD' || !upstream.body) response.end();
      else await pipeline(Readable.fromWeb(upstream.body), response);
    })().catch(() => {
      if (!response.headersSent && !response.destroyed) response.writeHead(502).end();
      else response.destroy();
    }).finally(() => stream.reads.delete(controller));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  server.unref();
  const publish = stream => {
    if (closed) throw new Error('mod_disposed');
    if (streams.size >= 8) {
      const [key, oldest] = streams.entries().next().value;
      retire(oldest); streams.delete(key);
    }
    const path = `/mv-${randomBytes(24).toString('hex')}.mp4`;
    streams.set(path, { ...stream, reads: new Set() });
    return `http://127.0.0.1:${server.address().port}${path}`;
  };
  return {
    publish(url, headers = {}) {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid_media_url');
      const forwarded = {};
      for (const [key, value] of Object.entries(headers)) {
        if (!['referer', 'origin', 'user-agent', 'cookie', 'authorization', 'accept'].includes(key.toLowerCase()) ||
            typeof value !== 'string' || /[\r\n]/u.test(value) || value.length > 16384) throw new Error('invalid_media_header');
        forwarded[key] = value;
      }
      return publish({ url: parsed, headers: forwarded });
    },
    async publishFile(file) {
      if (typeof file !== 'string' || !isAbsolute(file) || !(await stat(file)).isFile()) throw new Error('absolute_media_file_required');
      return publish({ file });
    },
    clear() { for (const stream of streams.values()) retire(stream); streams.clear(); },
    close() { closed = true; this.clear(); server.close(); server.closeAllConnections(); },
  };
}
