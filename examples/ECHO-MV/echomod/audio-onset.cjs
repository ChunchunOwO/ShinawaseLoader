'use strict';

const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const SAMPLE_RATE = 8000;
const WINDOW_SAMPLES = 160; // 20 ms; require 80 ms of sustained sound.
const THRESHOLD = 10 ** (-45 / 20);
const MAX_SECONDS = 120;

function findFfmpeg(resourcesPath) {
  const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  if (resourcesPath) {
    const candidates = [
      join(resourcesPath, executable),
      join(resourcesPath, 'ffmpeg', executable),
      join(resourcesPath, 'bin', executable),
      join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', executable),
    ];
    const bundled = candidates.find((path) => existsSync(path));
    if (bundled) return bundled;
  }
  return executable;
}

function createOnsetDetector() {
  let pending = Buffer.alloc(0);
  let windows = 0;
  let loudWindows = 0;
  let detectedMs = null;
  return {
    push(chunk) {
      if (detectedMs !== null) return detectedMs;
      pending = Buffer.concat([pending, chunk]);
      let offset = 0;
      while (pending.length - offset >= WINDOW_SAMPLES * 2) {
        let squares = 0;
        for (let index = 0; index < WINDOW_SAMPLES; index += 1) {
          const sample = pending.readInt16LE(offset + index * 2) / 32768;
          squares += sample * sample;
        }
        loudWindows = Math.sqrt(squares / WINDOW_SAMPLES) >= THRESHOLD ? loudWindows + 1 : 0;
        windows += 1;
        offset += WINDOW_SAMPLES * 2;
        if (loudWindows >= 4) {
          // Keep a small lead-in so the first attack is not clipped.
          detectedMs = Math.max(0, (windows - loudWindows) * 20 - 20);
          break;
        }
      }
      pending = pending.subarray(offset);
      return detectedMs;
    },
  };
}

function detectAudioOnset({ input, headers = {}, ffmpegPath, signal, timeoutMs = 25000 }) {
  if (signal?.aborted) return Promise.reject(new Error('mv_audio_start_cancelled'));
  return new Promise((resolve, reject) => {
    const remote = /^https:\/\//i.test(input);
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    if (remote) {
      // Only service-generated media URLs and headers reach this function.
      args.push('-rw_timeout', '8000000', '-protocol_whitelist', 'https,tls,tcp');
      const allowed = ['User-Agent', 'Referer', 'Cookie'];
      const headerText = allowed.filter((key) => headers[key]).map((key) => `${key}: ${String(headers[key]).replace(/[\r\n]/g, '')}\r\n`).join('');
      if (headerText) args.push('-headers', headerText);
    } else {
      args.push('-protocol_whitelist', 'file,pipe');
    }
    args.push('-i', input, '-map', '0:a:0', '-vn', '-sn', '-dn', '-t', String(MAX_SECONDS),
      '-af', 'aresample=async=1:first_pts=0', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1');
    const child = spawn(ffmpegPath || findFfmpeg(process.resourcesPath), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const detector = createOnsetDetector();
    let finished = false;
    let bytes = 0;
    let stderr = '';
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (child.exitCode === null) child.kill();
      if (error) reject(error);
      else resolve(value);
    };
    const onAbort = () => finish(new Error('mv_audio_start_cancelled'));
    const timer = setTimeout(() => finish(new Error('mv_audio_start_timeout')), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (error) => finish(new Error(error.code === 'ENOENT' ? 'mv_audio_start_ffmpeg_missing' : 'mv_audio_start_failed')));
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-4096); });
    child.stdout.on('data', (chunk) => {
      if (finished) return;
      bytes += chunk.length;
      const startMs = detector.push(chunk);
      if (startMs !== null) finish(null, { startMs, scannedSeconds: bytes / (SAMPLE_RATE * 2) });
    });
    child.on('close', (code) => {
      if (finished) return;
      const missingAudio = /matches no streams|does not contain any stream/i.test(stderr);
      finish(new Error(missingAudio ? 'mv_audio_start_no_audio' : code !== 0 ? 'mv_audio_start_failed' : 'mv_audio_start_silent'));
    });
    if (signal?.aborted) onAbort();
  });
}

module.exports = { createOnsetDetector, detectAudioOnset, findFfmpeg };
