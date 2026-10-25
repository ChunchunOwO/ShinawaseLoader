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
  'Object.assign(globalThis, { boxWithin, drawerFrame, drawerSettlesOpen });',
].join('\n'), context);
const { boxWithin, drawerFrame, drawerSettlesOpen } = context;
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

test('the wheel never moves the drawer sheet', () => {
  assert.ok(!/drawerPull|createPullToClose/u.test(source), 'wheel pull-to-close is gone');
  const handler = /const onDrawerWheel = \(event\) => \{([\s\S]*?)\r?\n\};/u.exec(source);
  assert.ok(handler, 'wheel handler present');
  assert.ok(!/closeDrawer|animateDrawer|setDrawerProgress/u.test(handler[1]), 'the wheel handler only blocks scroll chaining');
  const target = {};
  const onWheel = vm.runInNewContext(`(event) => {${handler[1]}}`, { drawerBody: { contains: (node) => node === target } });
  for (const deltaY of [-1000, -1, 1, 1000]) {
    let blocked = 0;
    onWheel({ target, deltaY, preventDefault: () => { blocked += 1; } });
    assert.equal(blocked, 0, 'body scrolling remains available');
    onWheel({ target: {}, deltaY, preventDefault: () => { blocked += 1; } });
    assert.equal(blocked, 1, 'chrome scrolling cannot chain to the host');
    onWheel({ target: {}, deltaY, ctrlKey: true, preventDefault: () => { blocked += 1; } });
    assert.equal(blocked, 1, 'Ctrl-wheel retains browser zoom behavior');
  }
});

test('boxes are measured in the sidebar positioning space', () => {
  const aside = { offsetParent: null };
  const groups = { offsetTop: 54, offsetLeft: 10, offsetWidth: 200, offsetHeight: 700, offsetParent: aside };
  const nested = { offsetTop: 600, offsetLeft: 0, offsetWidth: 200, offsetHeight: 38, offsetParent: groups };
  assert.deepEqual(plain(boxWithin(groups, aside)), { top: 54, left: 10, width: 200, height: 700 });
  assert.deepEqual(plain(boxWithin(nested, aside)), { top: 654, left: 10, width: 200, height: 38 });
  assert.equal(boxWithin(nested, { offsetParent: null }), null, 'not positioned inside that root');
});

test('the sheet keeps its overlay when the host restyles every .sidebar child', () => {
  // ECHO lifts its own rail children above the wallpaper/theme scrim with a
  // blanket ".sidebar > * { position: relative; z-index: 1 }" (visual
  // protection with a custom background on, and the childrenDoodle preset).
  // That selector outranks the sheet's single class, and an in-flow sheet drops
  // under the dock and leaves the bare scrim where its own list should be.
  const start = source.indexOf('\n  .shl-drawer {');
  assert.ok(start > 0, 'the sheet rule is present');
  const rule = source.slice(start, source.indexOf('\n  }', start));
  assert.match(rule, /position:\s*absolute\s*!important/u, 'the sheet stays out of the aside flex flow');
  assert.match(rule, /z-index:\s*3\s*!important/u, 'the sheet keeps its paint order over ECHO blocks');
});
