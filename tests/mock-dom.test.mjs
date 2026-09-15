// Mock DOM behavior the harness and shipped mod entries rely on.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockRealm, MockCustomEvent } from '../ShinawaseLoader/testing/mock-dom.mjs';

const realm = () => createMockRealm({});

test('createElement + append + query by tag/class/id/attribute', () => {
  const { document } = realm();
  const box = document.createElement('div');
  box.className = 'card active';
  box.id = 'card-1';
  box.setAttribute('data-probe', 'yes');
  document.body.append(box);
  assert.equal(document.querySelector('div.card'), box);
  assert.equal(document.querySelector('#card-1'), box);
  assert.equal(document.querySelector('[data-probe="yes"]'), box);
  assert.equal(document.querySelector('.missing'), null);
  assert.equal(document.querySelectorAll('.card').length, 1);
});

test('innerHTML parses nested markup, attributes, and entities', () => {
  const { document } = realm();
  const root = document.createElement('div');
  root.innerHTML = `
    <h2 style="margin:0">Title &amp; more</h2>
    <p class="hint">text</p>
    <button type="button" data-save disabled>Save</button>
    <input value="x&quot;y">
  `;
  assert.equal(root.querySelector('h2').textContent, 'Title & more');
  assert.equal(root.querySelector('p.hint').textContent, 'text');
  const button = root.querySelector('[data-save]');
  assert.ok(button);
  assert.equal(button.disabled, true);
  assert.equal(root.querySelector('input').value, 'x"y');
  assert.ok(root.innerHTML.includes('<h2'));
});

test('selector subset: descendant, child, :not, comma; unsupported throws', () => {
  const { document } = realm();
  const root = document.createElement('section');
  root.innerHTML = '<ul class="list"><li class="a"></li><li class="b" hidden></li></ul>';
  document.body.append(root);
  assert.equal(document.querySelectorAll('section li').length, 2);
  assert.equal(document.querySelectorAll('ul > li').length, 2);
  assert.equal(document.querySelectorAll('li:not([hidden])').length, 1);
  assert.equal(document.querySelectorAll('.a, .b').length, 2);
  assert.throws(() => document.querySelector('li:nth-child(2)'), /unsupported selector/u);
});

test('events: bubbling, once, stopPropagation, inline on* handlers, click()', () => {
  const { document, window } = realm();
  const outer = document.createElement('div');
  const inner = document.createElement('button');
  outer.append(inner);
  document.body.append(outer);
  const order = [];
  inner.onclick = () => order.push('inline');
  inner.addEventListener('click', () => order.push('inner'));
  outer.addEventListener('click', () => order.push('outer'));
  window.addEventListener('click', () => order.push('window'), { once: true });
  inner.click();
  assert.deepEqual(order, ['inline', 'inner', 'outer', 'window']);
  inner.click();
  assert.deepEqual(order.slice(4), ['inline', 'inner', 'outer'], 'once listener must not fire twice');
  const stopped = [];
  const stopper = document.createElement('span');
  document.body.append(stopper);
  stopper.addEventListener('ping', (event) => { stopped.push('target'); event.stopPropagation(); });
  window.addEventListener('ping', () => stopped.push('window'));
  stopper.dispatchEvent(new MockCustomEvent('ping', { bubbles: true }));
  assert.deepEqual(stopped, ['target']);
});

test('MutationObserver childList delivery via microtask and disconnect', async () => {
  const { document, window } = realm();
  const seen = [];
  const observer = new window.MutationObserver((records) => { seen.push(...records.map((record) => record.type)); });
  observer.observe(document.body, { childList: true, subtree: true });
  document.body.append(document.createElement('div'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, ['childList']);
  observer.disconnect();
  document.body.append(document.createElement('div'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(seen.length, 1, 'disconnected observer must not fire');
});

test('localStorage, dataset, classList, hidden, closest, remove', () => {
  const { document, window } = realm();
  window.localStorage.setItem('k', 'v');
  assert.equal(window.localStorage.getItem('k'), 'v');
  const node = document.createElement('div');
  node.dataset.echoExternalMod = 'x.y';
  assert.equal(node.getAttribute('data-echo-external-mod'), 'x.y');
  node.classList.add('one', 'two');
  node.classList.remove('one');
  assert.equal(node.className, 'two');
  node.hidden = true;
  assert.ok(node.hasAttribute('hidden'));
  const parent = document.createElement('section');
  parent.className = 'wrap';
  parent.append(node);
  document.body.append(parent);
  assert.equal(node.closest('.wrap'), parent);
  node.remove();
  assert.equal(parent.children.length, 0);
});

test('virtual clock: ordering, intervals, clear, pending audit', async () => {
  const { clock, window } = createMockRealm({});
  const fired = [];
  window.setTimeout(() => fired.push('b'), 20);
  window.setTimeout(() => fired.push('a'), 10);
  const interval = window.setInterval(() => fired.push('i'), 15);
  await clock.flush({ maxMs: 50 });
  // Deterministic time order: a@10, i@15, b@20, i@30, i@45 (horizon 50).
  assert.deepEqual(fired, ['a', 'i', 'b', 'i', 'i']);
  window.clearInterval(interval);
  assert.equal(clock.pending().length, 0);
});
