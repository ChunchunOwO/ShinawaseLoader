const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'examples/ECHO-LyricsMatchWhitebox/echomod/mod.js'), 'utf8');

const assert = (cond, message) => { if (!cond) throw new Error(message); };

const createDom = () => {
  const listeners = new Map();
  const makeEl = (tag) => {
    const el = {
      tagName: String(tag).toUpperCase(),
      className: '',
      style: { cssText: '' },
      checked: false,
      disabled: false,
      type: '',
      parentElement: null,
      children: [],
      attrs: Object.create(null),
      listeners: Object.create(null),
      textContent: '',
      firstChild: null,
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name] ?? null; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      append(...nodes) {
        for (const node of nodes) {
          node.parentElement = this;
          this.children.push(node);
          if (!this.firstChild) this.firstChild = node;
        }
      },
      appendChild(node) {
        this.append(node);
        return node;
      },
      insertBefore(node, ref) {
        node.parentElement = this;
        if (!ref) { this.children.push(node); }
        else {
          const idx = this.children.indexOf(ref);
          this.children.splice(idx < 0 ? this.children.length : idx, 0, node);
        }
        this.firstChild = this.children[0] || null;
      },
      remove() {
        const parent = this.parentElement;
        if (!parent) return;
        parent.children = parent.children.filter((c) => c !== this);
        parent.firstChild = parent.children[0] || null;
        this.parentElement = null;
      },
      insertAdjacentElement(position, node) {
        if (position !== 'afterend' || !this.parentElement) throw new Error('unsupported insert');
        const parent = this.parentElement;
        const index = parent.children.indexOf(this);
        node.parentElement = parent;
        parent.children.splice(index + 1, 0, node);
        parent.firstChild = parent.children[0] || null;
      },
      querySelector(sel) { return querySelector(this, sel); },
      querySelectorAll(sel) { return querySelectorAll(this, sel); },
      closest(sel) {
        let node = this;
        while (node) {
          if (matches(node, sel)) return node;
          node = node.parentElement;
        }
        return null;
      },
      click() { for (const fn of this.listeners.click || []) fn(); },
      clickChange() { for (const fn of this.listeners.change || []) fn(); },
    };
    return el;
  };

  const matches = (el, selector) => {
    if (selector.includes(',')) return selector.split(',').some((part) => matches(el, part.trim()));
    if (selector.startsWith('.')) {
      const className = selector.slice(1).split(/[\s\[]/)[0];
      return String(el.className).split(/\s+/).includes(className);
    }
    if (selector.startsWith('#')) return el.attrs.id === selector.slice(1);
    if (selector.startsWith('[') && selector.endsWith(']')) {
      const body = selector.slice(1, -1);
      const eq = body.indexOf('=');
      if (eq < 0) return Object.prototype.hasOwnProperty.call(el.attrs, body);
      const key = body.slice(0, eq);
      const raw = body.slice(eq + 1).replace(/^["']|["']$/g, '');
      return el.attrs[key] === raw;
    }
    if (selector.includes('[')) {
      const m = selector.match(/^(.*?)(\[.+\])$/);
      if (!m) return false;
      return matches(el, m[1] || '*') && matches(el, m[2]);
    }
    if (selector === '*') return true;
    return el.tagName === selector.toUpperCase();
  };

  const walk = (node, visit) => { visit(node); for (const child of node.children || []) walk(child, visit); };
  const querySelectorAll = (rootNode, selector) => {
    const parts = selector.split(',').map((p) => p.trim()).filter(Boolean);
    const out = [];
    walk(rootNode, (node) => {
      if (node === rootNode && rootNode !== documentElement) return;
      for (const part of parts) {
        const tokens = part.split(/\s+/).filter(Boolean);
        if (tokens.length === 1) {
          if (matches(node, tokens[0])) out.push(node);
          continue;
        }
        if (!matches(node, tokens[tokens.length - 1])) continue;
        let cursor = node.parentElement;
        let ok = true;
        for (let i = tokens.length - 2; i >= 0; i -= 1) {
          let found = false;
          while (cursor) {
            if (matches(cursor, tokens[i])) { found = true; cursor = cursor.parentElement; break; }
            cursor = cursor.parentElement;
          }
          if (!found) { ok = false; break; }
        }
        if (ok) out.push(node);
      }
    });
    return out;
  };
  const querySelector = (rootNode, selector) => querySelectorAll(rootNode, selector)[0] || null;

  const documentElement = makeEl('html');
  const body = makeEl('body');
  body.parentElement = documentElement;
  documentElement.children.push(body);
  const document = {
    documentElement,
    body,
    createElement: (tag) => makeEl(tag),
    createElementNS: (_ns, tag) => makeEl(tag),
    querySelector: (sel) => querySelector(documentElement, sel),
    querySelectorAll: (sel) => querySelectorAll(documentElement, sel),
  };
  const windowObj = {
    echo: null,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter((item) => item !== fn)); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); return true; },
  };
  return { document, window: windowObj, body, makeEl, listeners };
};

const mountMod = async (config, initialSettings = {}) => {
  const dom = createDom();
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true });
  const observers = [];
  globalThis.MutationObserver = class {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe() { this._armed = true; }
    disconnect() { this._armed = false; }
    kick() { if (this._armed) this.cb([], this); }
  };

  let settings = { lyricsCandidatePanelAutoOpenEnabled: false, ...initialSettings };
  const calls = [];
  const app = {
    getSettings: async () => ({ ...settings }),
    setSettings: async (patch) => { calls.push({ ...patch }); settings = { ...settings, ...patch }; return { ...settings }; },
  };
  dom.window.echo = { app };
  const toasts = [];
  const events = [];
  const origDispatch = dom.window.dispatchEvent.bind(dom.window);
  dom.window.dispatchEvent = (event) => { events.push(event.type); return origDispatch(event); };

  const bridge = { config, echo: { app }, toast: (m) => toasts.push(m), log: { warn: () => {} } };
  const cleanup = await (async function (echoExternalMod, console) {
    return eval(`(async () => {\n${source}\n})()`);
  })(bridge, console);
  await new Promise((r) => setTimeout(r, 30));
  return { dom, settings: () => settings, calls, toasts, events, cleanup, observers, setSettingsState: (n) => { settings = { ...settings, ...n }; } };
};

(async () => {
  console.log('lyrics-match-whitebox smoke');

  {
    const ctx = await mountMod(
      { forceEnable: false, disableAutoOpenOnBoot: true, injectToggle: false, injectRematch: false, injectCornerIcon: false, notify: true, locale: 'zh-CN' },
      { lyricsCandidatePanelAutoOpenEnabled: true },
    );
    await new Promise((r) => setTimeout(r, 80));
    assert(ctx.calls.some((c) => c.lyricsCandidatePanelAutoOpenEnabled === false), 'boot disable auto-open');
    assert(ctx.settings().lyricsCandidatePanelAutoOpenEnabled === false, 'setting cleared');
    assert(ctx.toasts.some((t) => /右上角|top-right|不再自动|no auto/i.test(t)), 'disable toast');
    ctx.cleanup();
    console.log('  OK  disables auto-open on boot by default');
  }

  {
    const ctx = await mountMod({ forceEnable: true, keepForced: false, injectToggle: false, injectRematch: false, injectCornerIcon: false, notify: true, locale: 'zh-CN' });
    assert(ctx.calls.some((c) => c.lyricsCandidatePanelAutoOpenEnabled === true), 'boot enable');
    assert(ctx.toasts.length === 1, 'toast once');
    ctx.cleanup();
    console.log('  OK  enables setting on boot when forceEnable');
  }

  {
    const ctx = await mountMod({
      forceEnable: false,
      disableAutoOpenOnBoot: false,
      injectToggle: false,
      injectRematch: false,
      injectCornerIcon: true,
      notify: false,
      locale: 'zh-CN',
    });
    const page = ctx.dom.makeEl('div');
    page.className = 'lyrics-page';
    ctx.dom.body.append(page);
    const leftover = ctx.dom.makeEl('button');
    leftover.setAttribute('data-echo-lmwb-corner', '1');
    leftover.setAttribute('aria-label', '歌词设置');
    ctx.dom.body.append(leftover);
    for (const obs of ctx.observers) obs.kick();
    await new Promise((r) => setTimeout(r, 250));
    assert(!ctx.dom.document.querySelector('button[data-echo-lmwb-corner]'), 'leftover circular corner icon should be removed');
    ctx.cleanup();
    console.log('  OK  leftover circular corner icon is stripped');
  }

  {
    const ctx = await mountMod({ forceEnable: true, keepForced: false, injectToggle: true, injectRematch: true, injectCornerIcon: false, closeDrawerOnRematch: false, notify: true, locale: 'zh-CN' });
    const section = ctx.dom.makeEl('section');
    section.className = 'lyrics-current-track-section';
    const actions = ctx.dom.makeEl('div');
    actions.className = 'lyrics-current-track-actions';
    const remove = ctx.dom.makeEl('button');
    remove.className = 'audio-device-pill';
    actions.append(remove);
    section.append(actions);
    ctx.dom.body.append(section);
    for (const obs of ctx.observers) obs.kick();
    await new Promise((r) => setTimeout(r, 250));

    const rematch = ctx.dom.document.querySelector('button[data-echo-lmwb-rematch]');
    assert(rematch, 'rematch button missing');
    assert(actions.firstChild === rematch, 'rematch should be first action');
    assert(actions.children.length === 2, 'expected rematch + remove');

    const beforeEvents = ctx.events.length;
    rematch.click();
    await new Promise((r) => setTimeout(r, 50));
    assert(ctx.events.slice(beforeEvents).includes('lyrics:rematch-requested'), 'rematch event not fired');
    assert(ctx.toasts.some((t) => /重新匹配|Rematch|候选/.test(t)), 'rematch toast missing');

    // no duplicate on second inject
    for (const obs of ctx.observers) obs.kick();
    await new Promise((r) => setTimeout(r, 250));
    assert(ctx.dom.document.querySelectorAll('button[data-echo-lmwb-rematch]').length === 1, 'duplicate rematch');

    ctx.cleanup();
    assert(ctx.dom.document.querySelectorAll('button[data-echo-lmwb-rematch]').length === 0, 'cleanup rematch');
    console.log('  OK  rematch button inject + click + cleanup');
  }

  {
    const ctx = await mountMod({ forceEnable: true, keepForced: true, injectToggle: false, injectRematch: false, injectCornerIcon: false, notify: false, locale: 'en-US' });
    await new Promise((r) => setTimeout(r, 30));
    assert(ctx.settings().lyricsCandidatePanelAutoOpenEnabled === true, 'boot');
    ctx.setSettingsState({ lyricsCandidatePanelAutoOpenEnabled: false });
    ctx.dom.window.dispatchEvent(new CustomEvent('settings:changed', { detail: { lyricsCandidatePanelAutoOpenEnabled: false } }));
    await new Promise((r) => setTimeout(r, 30));
    assert(ctx.settings().lyricsCandidatePanelAutoOpenEnabled === true, 'keepForced');
    ctx.cleanup();
    console.log('  OK  keepForced re-enables after foreign off');
  }

  console.log('all smoke checks passed');
})().catch((error) => { console.error('FAILED', error); process.exitCode = 1; });
