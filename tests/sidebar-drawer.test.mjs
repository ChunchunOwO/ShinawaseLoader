import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../ShinawaseLoader/loader-ui.js', import.meta.url), 'utf8');

// Pull one `const name = ...;` statement out of loader-ui.js: scan to the
// first semicolon outside brackets, strings and line comments.
const extractConst = (name) => {
  const start = source.indexOf(`const ${name} = `);
  assert.ok(start >= 0, name);
  let depth = 0;
  let quote = '';
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === ';' && depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
};

const context = {};
vm.createContext(context);
vm.runInContext([
  extractConst('boxWithin'),
  extractConst('drawerFrame'),
  extractConst('drawerSettlesOpen'),
  extractConst('createPullToClose'),
  'Object.assign(globalThis, { boxWithin, drawerFrame, drawerSettlesOpen, createPullToClose });',
].join('\n'), context);
const { boxWithin, drawerFrame, drawerSettlesOpen, createPullToClose } = context;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('the drawer covers every native block from the top of the groups down to the dock', () => {
  const groups = { top: 52, left: 10, width: 200, height: 640 };
  const dock = { top: 600, left: 10, width: 200, height: 38 };
  assert.deepEqual(plain(drawerFrame(groups, dock, false, 6)), { top: 52, left: 10, width: 200, height: 542 });
});

test('in the narrow bottom bar the drawer runs across to the dock', () => {
  const bar = { top: 8, left: 8, width: 900, height: 50 };
  const dock = { top: 8, left: 520, width: 52, height: 50 };
  assert.deepEqual(plain(drawerFrame(bar, dock, true, 7)), { top: 8, left: 8, width: 505, height: 50 });
});

test('a dock that ends up above the groups never yields a negative frame', () => {
  const frame = drawerFrame({ top: 300, left: 0, width: 200, height: 10 }, { top: 100, left: 0, width: 200, height: 38 }, false, 6);
  assert.equal(frame.height, 0);
  const across = drawerFrame({ top: 0, left: 400, width: 10, height: 50 }, { top: 0, left: 100, width: 52, height: 50 }, true, 6);
  assert.equal(across.width, 0);
});

test('a flick decides where a released drag settles', () => {
  assert.equal(drawerSettlesOpen(0.1, 0.6, false), true, 'flick up from the dock opens');
  assert.equal(drawerSettlesOpen(0.95, -0.6, true), false, 'flick down from the head closes');
  assert.equal(drawerSettlesOpen(0.9, 0.5, true), true);
});

test('a slow release has to travel 30% away from where it started', () => {
  assert.equal(drawerSettlesOpen(0.75, 0.1, true), true, 'a short pull on the head snaps back open');
  assert.equal(drawerSettlesOpen(0.65, 0, true), false);
  assert.equal(drawerSettlesOpen(0.25, -0.1, false), false, 'a short drag up from the dock falls back');
  assert.equal(drawerSettlesOpen(0.35, 0, false), true);
});

test('pulling down at the top of the drawer closes it once the threshold is reached', () => {
  const pull = createPullToClose({ threshold: 150, settleMs: 260 });
  assert.deepEqual(plain(pull.wheel(-100, true, 1000)), { progress: 100 / 150, close: false });
  assert.deepEqual(plain(pull.wheel(-100, true, 1080)), { progress: 1, close: true });
});

test('the fling that scrolls the list back to the top does not close the drawer', () => {
  const pull = createPullToClose({ threshold: 150, settleMs: 260 });
  pull.scrolled(1000);
  assert.equal(pull.wheel(-100, true, 1050).progress, 0);
  assert.equal(pull.wheel(-100, true, 1200).progress, 0, 'still the same gesture');
  assert.equal(pull.wheel(-100, true, 1500).close, false);
  assert.equal(pull.wheel(-100, true, 1560).close, true, 'a new pull after the list settled');
});

test('pulls separated by a pause, downward wheels and scrolled lists start over', () => {
  const pull = createPullToClose({ threshold: 150, settleMs: 260 });
  pull.wheel(-100, true, 1000);
  assert.equal(pull.wheel(-100, true, 1400).close, false, 'the earlier pull has relaxed');
  pull.wheel(-100, true, 2000);
  assert.equal(pull.wheel(40, true, 2050).progress, 0);
  assert.equal(pull.wheel(-100, true, 2100).close, false);
  assert.equal(pull.wheel(-100, false, 2150).progress, 0, 'not at the top: the list scrolls instead');
  pull.wheel(-100, true, 3000);
  pull.reset();
  assert.equal(pull.wheel(-100, true, 3050).close, false);
});

test('boxes are measured in the sidebar positioning space', () => {
  const aside = { offsetParent: null };
  const groups = { offsetTop: 54, offsetLeft: 10, offsetWidth: 200, offsetHeight: 700, offsetParent: aside };
  const nested = { offsetTop: 600, offsetLeft: 0, offsetWidth: 200, offsetHeight: 38, offsetParent: groups };
  assert.deepEqual(plain(boxWithin(groups, aside)), { top: 54, left: 10, width: 200, height: 700 });
  assert.deepEqual(plain(boxWithin(nested, aside)), { top: 654, left: 10, width: 200, height: 38 });
  assert.equal(boxWithin(nested, { offsetParent: null }), null, 'not positioned inside that root');
});
