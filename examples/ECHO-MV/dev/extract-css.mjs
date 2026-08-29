import fs from 'node:fs';
import path from 'node:path';

const echoRoot = 'C:/Users/RR/Desktop/Codex-Projects/ECHOSteam-main/src/renderer/styles';
const files = [
  'lyrics.css',
  'app.css',
  'layout.css',
  'theme-presets.css',
  'scrollbars.css',
  'lyrics-folded.css',
  'lyrics-cover-stage.css',
  'lyrics-cinema-stage.css',
  'lyrics-cut-board.css',
  'lyrics-kinetic-poster.css',
  'ui-polish.css',
];

const keepRe = /lyrics-mv|mv-settings|transport-mv|\[data-mv-|data-mv-enabled="true"|data-immersive-active|--mv-immersive|\.mv-source|\.mv-custom|\.mv-search|\.mv-offset|\.mv-engine|\.mv-immersive|\.mv-quality|\.mv-threshold|\.mv-sync|\.mv-selected|\.mv-switch|\.mv-toggle|\.mv-master|\.mv-network|\.mv-candidate|\.mv-field|\.mv-drawer|\.mv-section|\.mv-auto|\.mv-current|\.mv-offset|\.mv-source-|\.mv-settings-|\.mv-engine-|\.mv-network-|\.mv-quality-|\.mv-immersive-|\.mv-candidate-|\.mv-custom-|\.mv-search-|\.mv-offset-|\.mv-switch-|\.mv-toggle-|\.mv-section-|\.mv-threshold-|\.mv-sync-|\.mv-selected-|\.mv-master-|\.mv-field-|\.mv-drawer-/i;

const skipFalseOnlyLayout = (selector) => {
  if (!/data-mv-enabled\s*=\s*["']false["']/.test(selector)) return false;
  if (/data-mv-enabled\s*=\s*["']true["']/.test(selector)) return false;
  const withoutHas = selector.replace(/:has\((?:[^()]|\([^()]*\))*\)/g, '');
  return !/\.lyrics-mv[\w-]*|\.mv-[\w-]*/.test(withoutHas);
};

const splitTopLevel = (css) => {
  const parts = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    while (i < n && /\s/.test(css[i])) i += 1;
    if (i >= n) break;
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    let start = i;
    let depth = 0;
    let inStr = null;
    for (; i < n; i += 1) {
      const ch = css[i];
      if (inStr) {
        if (ch === '\\') {
          i += 1;
          continue;
        }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          parts.push(css.slice(start, i).trim());
          break;
        }
      }
    }
    if (i === start) break;
  }
  return parts;
};

const filterChunk = (chunk) => {
  const open = chunk.indexOf('{');
  if (open < 0) return null;
  const header = chunk.slice(0, open);
  if (header.trim().startsWith('@')) {
    const last = chunk.lastIndexOf('}');
    const inner = chunk.slice(open + 1, last);
    const nested = splitTopLevel(inner).map(filterChunk).filter(Boolean);
    if (!nested.length) return null;
    return `${header.trim()} {\n${nested.join('\n')}\n}`;
  }
  if (!keepRe.test(header) && !keepRe.test(chunk)) return null;
  if (skipFalseOnlyLayout(header)) return null;
  return chunk;
};

const extraCss = `
.lyrics-page[data-mv-lyrics-hidden="true"] .lyrics-scroll,
.lyrics-page[data-mv-lyrics-hidden="true"] .lyrics-empty {
  visibility: hidden;
  pointer-events: none;
}

.transport-mv-button.is-soft-active {
  color: var(--theme-accent-text-strong, currentColor);
}

section.lyrics-mv-panel,
.lyrics-mv-settings-entry {
  display: none !important;
}

.lyrics-page[data-echo-mv-stage="true"]:has(.lyrics-mv-background) .lyrics-mv-background {
  z-index: 0;
  background: #020407;
}

.lyrics-page[data-lyrics-page-style="cinemaStage"] .lyrics-mv-settings-entry {
  top: clamp(56px, 8vh, 78px);
}
`;

const chunks = [];
for (const file of files) {
  const full = path.join(echoRoot, file);
  if (!fs.existsSync(full)) continue;
  const css = fs.readFileSync(full, 'utf8');
  const kept = splitTopLevel(css).map(filterChunk).filter(Boolean);
  if (kept.length) {
    chunks.push(`/* === ${file} === */`, ...kept, '');
  }
}
chunks.push('/* === echo-mv extras === */', extraCss.trim(), '');

const outDir = path.resolve('examples/ECHO-MV/echomod');
fs.mkdirSync(outDir, { recursive: true });
const cssText = chunks.join('\n');
fs.writeFileSync(path.join(outDir, 'mv.css'), cssText);
console.log('css_bytes', Buffer.byteLength(cssText), 'chunks', chunks.length);
