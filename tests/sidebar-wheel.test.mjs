import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../ShinawaseLoader/loader-ui.js', import.meta.url), 'utf8');

const extractFunction = (name) => {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, name);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, source.indexOf(';', i) + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
};

const context = { getComputedStyle: (element) => ({ overflowY: element.overflowY }) };
vm.createContext(context);
vm.runInContext([
  extractFunction('loaderGroupWheelTarget'),
  extractFunction('onLoaderGroupWheel'),
  'globalThis.__wheelTarget = loaderGroupWheelTarget;',
  'globalThis.__wheel = onLoaderGroupWheel;',
].join('\n'), context);

const box = (overflowY, scrollHeight, clientHeight, scrollTop = 0) => ({
  nodeType: 1,
  overflowY,
  scrollHeight,
  clientHeight,
  scrollTop,
  parentElement: null,
  contains(other) {
    let node = other;
    while (node) {
      if (node === this) return true;
      node = node.parentElement;
    }
    return false;
  },
});

const link = (parent, child) => {
  child.parentElement = parent;
  return child;
};

const groupedSidebar = () => {
  const sidebar = box('auto', 400, 400);
  const groups = link(sidebar, box('auto', 800, 400));
  const main = link(groups, box('visible', 0, 0));
  const loader = link(groups, box('hidden', 180, 180));
  const nav = link(loader, box('auto', 80, 160));
  const button = link(nav, box('visible', 32, 32));
  loader.closest = () => sidebar;
  sidebar.querySelector = (selector) => selector === '.sidebar-main-groups' ? main : null;
  return { sidebar, groups, main, loader, nav, button };
};

const wheel = (currentTarget, target, deltaY, extra = {}) => {
  const event = {
    currentTarget,
    target,
    deltaY,
    deltaMode: extra.deltaMode || 0,
    ctrlKey: extra.ctrlKey === true,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
  context.__wheel(event);
  return event;
};

test('wheel over a short Shinawase Loader list scrolls the sidebar groups', () => {
  const { groups, loader, button } = groupedSidebar();
  const event = wheel(loader, button, 48);
  assert.equal(event.defaultPrevented, true);
  assert.equal(groups.scrollTop, 48);
});

test('an overflowing loader list keeps the wheel until it hits the edge', () => {
  const { groups, loader, nav, button } = groupedSidebar();
  nav.scrollHeight = 400;
  nav.clientHeight = 200;
  nav.scrollTop = 0;
  const event = wheel(loader, button, 30);
  assert.equal(event.defaultPrevented, false);
  assert.equal(groups.scrollTop, 0);
  assert.equal(nav.scrollTop, 0);
});

test('a loader list at its end hands the wheel back to the sidebar', () => {
  const { groups, loader, nav, button } = groupedSidebar();
  nav.scrollHeight = 400;
  nav.clientHeight = 200;
  nav.scrollTop = 200;
  const event = wheel(loader, button, 30);
  assert.equal(event.defaultPrevented, true);
  assert.equal(groups.scrollTop, 30);
  assert.equal(nav.scrollTop, 200);
});

test('when the groups cannot scroll, the wheel moves the playlist scrollport', () => {
  const { groups, main, loader, button } = groupedSidebar();
  groups.scrollHeight = 400;
  groups.clientHeight = 400;
  main.overflowY = 'auto';
  main.scrollHeight = 900;
  main.clientHeight = 300;
  const event = wheel(loader, button, 40);
  assert.equal(event.defaultPrevented, true);
  assert.equal(main.scrollTop, 40);
  assert.equal(groups.scrollTop, 0);
});

test('wheel up at the top of every scrollport is left alone', () => {
  const { groups, loader, button } = groupedSidebar();
  const event = wheel(loader, button, -20);
  assert.equal(event.defaultPrevented, false);
  assert.equal(groups.scrollTop, 0);
});

test('wheel up scrolls the sidebar when it is not already at the top', () => {
  const { groups, loader, button } = groupedSidebar();
  groups.scrollTop = 50;
  const event = wheel(loader, button, -20);
  assert.equal(event.defaultPrevented, true);
  assert.equal(groups.scrollTop, 30);
});

test('line-mode wheel deltas are converted to pixels', () => {
  const { groups, loader, button } = groupedSidebar();
  wheel(loader, button, 2, { deltaMode: 1 });
  assert.equal(groups.scrollTop, 32);
});

test('ctrl-wheel is not treated as sidebar scrolling', () => {
  const { groups, loader, button } = groupedSidebar();
  const event = wheel(loader, button, 40, { ctrlKey: true });
  assert.equal(event.defaultPrevented, false);
  assert.equal(groups.scrollTop, 0);
});

test('a flat sidebar scrolls its own aside when that is the scrollport', () => {
  const sidebar = box('auto', 900, 400);
  const loader = link(sidebar, box('hidden', 180, 180));
  const nav = link(loader, box('auto', 80, 160));
  const button = link(nav, box('visible', 32, 32));
  loader.closest = () => sidebar;
  sidebar.querySelector = () => null;
  const event = wheel(loader, button, 25);
  assert.equal(event.defaultPrevented, true);
  assert.equal(sidebar.scrollTop, 25);
});
