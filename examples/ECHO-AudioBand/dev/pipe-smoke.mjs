import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exe = join(root, 'echomod', 'host', 'EchoAudioBand.exe');
const pipe = `echo-audioband-smoke-${process.pid}`;
const seen = [];
let child;

const server = createServer((sock) => {
  sock.setEncoding('utf8');
  let buf = '';
  sock.on('data', (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      seen.push(msg.op);
      console.log('host>', msg.op, JSON.stringify(msg.payload || {}));
      if (msg.op === 'ready') {
        sock.write(`${JSON.stringify({ v: 1, op: 'config', payload: { alignment: 'right', autoAvoidTray: true, widgetWidth: 360 } })}\n`);
        sock.write(`${JSON.stringify({
          v: 1,
          op: 'status',
          payload: {
            state: 'playing',
            title: 'Smoke',
            artist: 'AudioBand',
            album: 'Test',
            officialEnabled: true,
            lyricsCurrent: 'line one',
            lyricsNext: 'line two',
            lyricsHas: true,
          },
        })}\n`);
        setTimeout(() => sock.write(`${JSON.stringify({ v: 1, op: 'quit' })}\n`), 800);
      }
    }
  });
});

server.listen(`\\\\.\\pipe\\${pipe}`, () => {
  child = spawn(exe, ['--pipe', pipe], { cwd: dirname(exe), stdio: 'ignore', windowsHide: false });
  child.on('exit', (code) => {
    console.log('exit', code, 'ops', seen.join(','));
    server.close();
    process.exit(seen.includes('hello') && seen.includes('ready') && code === 0 ? 0 : 2);
  });
});

setTimeout(() => {
  console.error('timeout', seen);
  try { child?.kill(); } catch {}
  process.exit(4);
}, 12000);
