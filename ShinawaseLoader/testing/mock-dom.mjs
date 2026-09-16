// Shinawase Testing SDK - dependency-free mini DOM for the offline harness.
//
// This intentionally implements only the subset of the DOM that ShinawaseLoader
// package entries commonly use (see TESTING.md "Supported DOM subset").
// Like scripts/_smoke-lyrics-whitebox.cjs, it does not validate real ECHO
// layout; it exists so entry lifecycle, cleanup, and SDK usage can be checked
// without a running ECHO. Unsupported selectors and pseudo-classes throw
// instead of silently matching nothing.

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

const decodeEntities = (text) => String(text)
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'").replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&');
const escapeText = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeAttr = (text) => escapeText(text).replaceAll('"', '&quot;');
const kebabCase = (name) => String(name).replaceAll(/[A-Z]/gu, (ch) => `-${ch.toLowerCase()}`);
const camelCase = (name) => String(name).replaceAll(/-([a-z])/gu, (_, ch) => ch.toUpperCase());

export class MockEvent {
  constructor(type, init = {}) {
    this.type = String(type);
    this.bubbles = init.bubbles === true;
    this.cancelable = init.cancelable === true;
    this.detail = init.detail;
    this.target = null;
    this.currentTarget = null;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    this.immediateStopped = false;
    this.isTrusted = false;
    this.timeStamp = 0;
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
  stopImmediatePropagation() { this.propagationStopped = true; this.immediateStopped = true; }
}
export class MockCustomEvent extends MockEvent {}
export class MockMouseEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.clientX = Number(init.clientX) || 0;
    this.clientY = Number(init.clientY) || 0;
    this.button = Number(init.button) || 0;
  }
}
export class MockKeyboardEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.key = String(init.key || '');
    this.code = String(init.code || '');
  }
}

// Shared event-target behavior. Every live listener is tracked in the realm
// audit registry so the harness can diff "listeners added by the entry but
// still registered after dispose" (leak check).
const eventTargetMixin = (target, realm, label) => {
  const listeners = new Map();
  target.__listeners = listeners;
  target.addEventListener = (type, handler, options = {}) => {
    if (typeof handler !== 'function' && typeof handler?.handleEvent !== 'function') return;
    const once = options === true ? false : options?.once === true;
    const record = { seq: ++realm.audit.seq, target, label, type: String(type), handler, once };
    if (!listeners.has(record.type)) listeners.set(record.type, []);
    listeners.get(record.type).push(record);
    realm.audit.listeners.add(record);
  };
  target.removeEventListener = (type, handler) => {
    const list = listeners.get(String(type));
    if (!list) return;
    const index = list.findIndex((record) => record.handler === handler);
    if (index >= 0) {
      realm.audit.listeners.delete(list[index]);
      list.splice(index, 1);
    }
  };
  target.__invokeListeners = (event) => {
    const inline = target[`on${event.type}`];
    if (typeof inline === 'function') inline.call(target, event);
    for (const record of [...(listeners.get(event.type) || [])]) {
      if (event.immediateStopped) break;
      if (record.once) target.removeEventListener(event.type, record.handler);
      const fn = typeof record.handler === 'function' ? record.handler : record.handler.handleEvent.bind(record.handler);
      fn.call(target, event);
    }
  };
  target.dispatchEvent = (event) => {
    event.target = event.target || target;
    const path = [target];
    let node = target.parentElement;
    while (node) { path.push(node); node = node.parentElement; }
    if (target !== realm.window) {
      if (realm.document && !path.includes(realm.document)) path.push(realm.document);
      path.push(realm.window);
    }
    for (const node of event.bubbles ? path : [target]) {
      if (event.propagationStopped) break;
      event.currentTarget = node;
      node.__invokeListeners?.(event);
    }
    event.currentTarget = null;
    return !event.defaultPrevented;
  };
};

const createStyle = () => {
  const store = new Map();
  const api = {
    setProperty: (name, value) => { store.set(String(name), String(value)); },
    removeProperty: (name) => { const key = String(name); const old = store.get(key) || ''; store.delete(key); return old; },
    getPropertyValue: (name) => store.get(String(name)) || '',
  };
  Object.defineProperty(api, 'cssText', {
    get: () => [...store.entries()].map(([key, value]) => `${key}: ${value};`).join(' '),
    set: (text) => {
      store.clear();
      for (const part of String(text).split(';')) {
        const at = part.indexOf(':');
        if (at > 0) store.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
      }
    },
  });
  return new Proxy(api, {
    get: (target, prop) => {
      if (prop in target || typeof prop === 'symbol') return target[prop];
      return store.get(kebabCase(prop)) ?? '';
    },
    set: (target, prop, value) => {
      if (typeof prop === 'symbol' || prop === 'cssText') { target[prop] = value; return true; }
      if (value === '' || value === null || value === undefined) store.delete(kebabCase(prop));
      else store.set(kebabCase(prop), String(value));
      return true;
    },
  });
};

class MockTextNode {
  constructor(text, realm) {
    this.nodeType = 3;
    this.textContent = String(text);
    this.parentElement = null;
    this.__realm = realm;
  }
  remove() {
    if (this.parentElement) this.parentElement.removeChild(this);
  }
}

export class MockElement {
  constructor(tagName, realm) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.localName = String(tagName).toLowerCase();
    this.parentElement = null;
    this.childNodes = [];
    this.attributes = new Map();
    this.style = createStyle();
    this.__realm = realm;
    this.__seq = ++realm.audit.seq;
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.type = '';
    this.scrollTop = 0;
    this.scrollLeft = 0;
    realm.audit.elements.add(this);
    eventTargetMixin(this, realm, `<${this.localName}>`);
    this.dataset = new Proxy({}, {
      get: (_, prop) => (typeof prop === 'string' ? this.getAttribute(`data-${kebabCase(prop)}`) ?? undefined : undefined),
      set: (_, prop, value) => { this.setAttribute(`data-${kebabCase(prop)}`, String(value)); return true; },
      deleteProperty: (_, prop) => { this.removeAttribute(`data-${kebabCase(prop)}`); return true; },
      has: (_, prop) => this.hasAttribute(`data-${kebabCase(prop)}`),
      ownKeys: () => [...this.attributes.keys()].filter((key) => key.startsWith('data-')).map((key) => camelCase(key.slice(5))),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
    this.classList = {
      add: (...names) => { const set = this.__classSet(); for (const name of names) set.add(String(name)); this.__writeClasses(set); },
      remove: (...names) => { const set = this.__classSet(); for (const name of names) set.delete(String(name)); this.__writeClasses(set); },
      toggle: (name, force) => {
        const set = this.__classSet();
        const next = force === undefined ? !set.has(String(name)) : Boolean(force);
        next ? set.add(String(name)) : set.delete(String(name));
        this.__writeClasses(set);
        return next;
      },
      contains: (name) => this.__classSet().has(String(name)),
    };
  }
  __classSet() { return new Set((this.getAttribute('class') || '').split(/\s+/u).filter(Boolean)); }
  __writeClasses(set) { this.setAttribute('class', [...set].join(' ')); }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', String(value)); }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', String(value)); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { value ? this.setAttribute('hidden', '') : this.removeAttribute('hidden'); }
  get children() { return this.childNodes.filter((node) => node.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get isConnected() {
    let node = this;
    while (node.parentElement) node = node.parentElement;
    return node === this.__realm.document.documentElement;
  }
  setAttribute(name, value) {
    this.attributes.set(String(name).toLowerCase(), String(value));
    this.__realm.notifyMutation(this, { type: 'attributes', target: this, attributeName: String(name).toLowerCase() });
  }
  getAttribute(name) { return this.attributes.has(String(name).toLowerCase()) ? this.attributes.get(String(name).toLowerCase()) : null; }
  hasAttribute(name) { return this.attributes.has(String(name).toLowerCase()); }
  removeAttribute(name) {
    if (!this.attributes.delete(String(name).toLowerCase())) return;
    this.__realm.notifyMutation(this, { type: 'attributes', target: this, attributeName: String(name).toLowerCase() });
  }
  __adopt(node) {
    if (typeof node === 'string' || typeof node === 'number') return new MockTextNode(node, this.__realm);
    if (node.parentElement) node.parentElement.removeChild(node);
    return node;
  }
  append(...nodes) {
    const added = nodes.map((node) => this.__adopt(node));
    for (const node of added) { node.parentElement = this; this.childNodes.push(node); }
    if (added.length) this.__realm.notifyMutation(this, { type: 'childList', target: this, addedNodes: added, removedNodes: [] });
  }
  appendChild(node) { this.append(node); return node; }
  prepend(...nodes) {
    const added = nodes.map((node) => this.__adopt(node));
    for (const node of [...added].reverse()) { node.parentElement = this; this.childNodes.unshift(node); }
    if (added.length) this.__realm.notifyMutation(this, { type: 'childList', target: this, addedNodes: added, removedNodes: [] });
  }
  insertBefore(node, reference) {
    const added = this.__adopt(node);
    const index = reference ? this.childNodes.indexOf(reference) : -1;
    added.parentElement = this;
    if (index < 0) this.childNodes.push(added); else this.childNodes.splice(index, 0, added);
    this.__realm.notifyMutation(this, { type: 'childList', target: this, addedNodes: [added], removedNodes: [] });
    return added;
  }
  insertAdjacentElement(position, node) {
    if (position === 'beforeend') { this.append(node); return node; }
    if (position === 'afterbegin') { this.prepend(node); return node; }
    const parent = this.parentElement;
    if (!parent) throw new Error(`insertAdjacentElement(${position}) requires a parent`);
    if (position === 'beforebegin') return parent.insertBefore(node, this);
    if (position === 'afterend') {
      const index = parent.childNodes.indexOf(this);
      return parent.insertBefore(node, parent.childNodes[index + 1] || null);
    }
    throw new Error(`unsupported insertAdjacentElement position: ${position}`);
  }
  insertAdjacentHTML(position, html) {
    for (const node of parseFragment(html, this.__realm)) this.insertAdjacentElement(position, node);
  }
  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index < 0) return node;
    this.childNodes.splice(index, 1);
    node.parentElement = null;
    this.__realm.notifyMutation(this, { type: 'childList', target: this, addedNodes: [], removedNodes: [node] });
    return node;
  }
  remove() { this.parentElement?.removeChild(this); }
  replaceChildren(...nodes) {
    const removed = [...this.childNodes];
    for (const node of removed) node.parentElement = null;
    this.childNodes = [];
    if (removed.length) this.__realm.notifyMutation(this, { type: 'childList', target: this, addedNodes: [], removedNodes: removed });
    this.append(...nodes);
  }
  contains(node) {
    let current = node;
    while (current) { if (current === this) return true; current = current.parentElement; }
    return false;
  }
  get textContent() {
    return this.childNodes.map((node) => node.textContent).join('');
  }
  set textContent(value) { this.replaceChildren(new MockTextNode(value, this.__realm)); }
  get innerHTML() { return this.childNodes.map((node) => serializeNode(node)).join(''); }
  set innerHTML(value) { this.replaceChildren(...parseFragment(value, this.__realm)); }
  get outerHTML() { return serializeNode(this); }
  matches(selector) { return matchesSelector(this, selector); }
  closest(selector) {
    let node = this;
    while (node && node.nodeType === 1) {
      if (matchesSelector(node, selector)) return node;
      node = node.parentElement;
    }
    return null;
  }
  querySelector(selector) { return queryAll(this, selector, true)[0] || null; }
  querySelectorAll(selector) { return queryAll(this, selector, false); }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  click() {
    if (this.disabled) return;
    this.dispatchEvent(new this.__realm.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  }
  focus() { this.__realm.document.activeElement = this; }
  blur() { if (this.__realm.document.activeElement === this) this.__realm.document.activeElement = null; }
}

// --- HTML parsing / serialization (subset) ---

export const parseFragment = (html, realm) => {
  const text = String(html ?? '');
  const root = [];
  const stack = [];
  const current = () => stack[stack.length - 1];
  const push = (node) => (current() ? current().append(node) : root.push(node));
  let index = 0;
  while (index < text.length) {
    const lt = text.indexOf('<', index);
    if (lt < 0 || lt > index) {
      const raw = text.slice(index, lt < 0 ? text.length : lt);
      if (raw.trim() || raw.includes(' ')) push(new MockTextNode(decodeEntities(raw), realm));
      if (lt < 0) break;
      index = lt;
    }
    if (text.startsWith('<!--', index)) {
      const end = text.indexOf('-->', index);
      index = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text[index + 1] === '/') {
      const end = text.indexOf('>', index);
      const name = text.slice(index + 2, end < 0 ? text.length : end).trim().toLowerCase();
      for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
        if (stack[depth].localName === name) { stack.length = depth; break; }
      }
      index = end < 0 ? text.length : end + 1;
      continue;
    }
    const tagMatch = /^<([a-zA-Z][\w-]*)/u.exec(text.slice(index));
    if (!tagMatch) { push(new MockTextNode('<', realm)); index += 1; continue; }
    const name = tagMatch[1].toLowerCase();
    let cursor = index + tagMatch[0].length;
    const element = new MockElement(name, realm);
    const tagEnd = text.indexOf('>', cursor);
    const attrText = text.slice(cursor, tagEnd < 0 ? text.length : tagEnd);
    for (const match of attrText.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu)) {
      const attrName = match[1];
      if (attrName === '/') continue;
      element.setAttribute(attrName, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''));
    }
    if (element.hasAttribute('value')) element.value = element.getAttribute('value');
    if (element.hasAttribute('checked')) element.checked = true;
    if (element.hasAttribute('disabled')) element.disabled = true;
    if (element.hasAttribute('style')) element.style.cssText = element.getAttribute('style');
    element.type = element.getAttribute('type') || '';
    push(element);
    const selfClosed = /\/\s*$/u.test(attrText) || VOID_TAGS.has(name);
    index = tagEnd < 0 ? text.length : tagEnd + 1;
    if (RAW_TEXT_TAGS.has(name) && !selfClosed) {
      const close = text.toLowerCase().indexOf(`</${name}`, index);
      const raw = text.slice(index, close < 0 ? text.length : close);
      if (raw) element.append(new MockTextNode(raw, realm));
      const closeEnd = close < 0 ? text.length : text.indexOf('>', close);
      index = closeEnd < 0 ? text.length : closeEnd + 1;
      continue;
    }
    if (!selfClosed) stack.push(element);
  }
  return root;
};

const serializeNode = (node) => {
  if (node.nodeType === 3) return escapeText(node.textContent);
  const attrs = [...node.attributes.entries()].map(([key, value]) => value === '' ? ` ${key}` : ` ${key}="${escapeAttr(value)}"`).join('');
  if (VOID_TAGS.has(node.localName)) return `<${node.localName}${attrs}>`;
  return `<${node.localName}${attrs}>${node.childNodes.map(serializeNode).join('')}</${node.localName}>`;
};

// --- Selector engine (subset) ---

const parseCompound = (compound) => {
  const parts = [];
  let rest = compound;
  const tag = /^(?:\*|[a-zA-Z][\w-]*)/u.exec(rest);
  if (tag) { parts.push({ kind: 'tag', name: tag[0].toLowerCase() }); rest = rest.slice(tag[0].length); }
  while (rest.length) {
    let match;
    if ((match = /^\.([\w-]+)/u.exec(rest))) parts.push({ kind: 'class', name: match[1] });
    else if ((match = /^#([\w-]+)/u.exec(rest))) parts.push({ kind: 'id', name: match[1] });
    else if ((match = /^\[\s*([\w-]+)\s*(?:([~^$*|]?=)\s*("([^"]*)"|'([^']*)'|[^\]\s]+)\s*)?\]/u.exec(rest))) {
      const raw = match[3];
      const value = match[4] ?? match[5] ?? raw;
      parts.push({ kind: 'attr', name: match[1].toLowerCase(), op: match[2] || null, value: match[2] ? String(value) : null });
    } else if ((match = /^:not\(([^)]*)\)/u.exec(rest))) parts.push({ kind: 'not', inner: parseCompound(match[1].trim()) });
    else throw new Error(`unsupported selector fragment: "${rest}" (mock DOM supports tag/.class/#id/[attr]/:not plus space and > combinators)`);
    rest = rest.slice(match[0].length);
  }
  return parts;
};

const matchesCompound = (element, parts) => parts.every((part) => {
  if (part.kind === 'tag') return part.name === '*' || element.localName === part.name;
  if (part.kind === 'class') return element.classList.contains(part.name);
  if (part.kind === 'id') return element.id === part.name;
  if (part.kind === 'not') return !matchesCompound(element, part.inner);
  const value = element.getAttribute(part.name);
  if (part.op === null) return value !== null;
  if (value === null) return false;
  if (part.op === '=') return value === part.value;
  if (part.op === '^=') return value.startsWith(part.value);
  if (part.op === '$=') return value.endsWith(part.value);
  if (part.op === '*=') return value.includes(part.value);
  if (part.op === '~=') return value.split(/\s+/u).includes(part.value);
  throw new Error(`unsupported attribute operator: ${part.op}`);
});

const parseSelector = (selector) => String(selector).split(',').map((branch) => {
  const tokens = branch.trim().replaceAll(/\s*>\s*/gu, ' > ').split(/\s+/u).filter(Boolean);
  const chain = [];
  let combinator = ' ';
  for (const token of tokens) {
    if (token === '>') { combinator = '>'; continue; }
    chain.push({ combinator, parts: parseCompound(token) });
    combinator = ' ';
  }
  if (!chain.length) throw new Error(`empty selector: "${selector}"`);
  return chain;
});

const matchesChain = (element, chain) => {
  if (!matchesCompound(element, chain[chain.length - 1].parts)) return false;
  let node = element;
  for (let index = chain.length - 2; index >= 0; index -= 1) {
    const { parts } = chain[index];
    const combinator = chain[index + 1].combinator;
    if (combinator === '>') {
      node = node.parentElement;
      if (!node || node.nodeType !== 1 || !matchesCompound(node, parts)) return false;
    } else {
      node = node.parentElement;
      while (node && node.nodeType === 1 && !matchesCompound(node, parts)) node = node.parentElement;
      if (!node || node.nodeType !== 1) return false;
    }
  }
  return true;
};

export const matchesSelector = (element, selector) => parseSelector(selector).some((chain) => matchesChain(element, chain));

const queryAll = (root, selector, firstOnly) => {
  const chains = parseSelector(selector);
  const results = [];
  const visit = (node) => {
    for (const child of node.children) {
      if (chains.some((chain) => matchesChain(child, chain))) {
        results.push(child);
        if (firstOnly) return true;
      }
      if (visit(child)) return true;
    }
    return false;
  };
  visit(root);
  return results;
};

// --- MutationObserver ---

class MockMutationObserver {
  constructor(callback, realm) {
    this.__callback = callback;
    this.__realm = realm;
    this.__targets = [];
    this.__queue = [];
    this.__scheduled = false;
    this.__seq = ++realm.audit.seq;
  }
  observe(target, options = {}) {
    this.__targets.push({ target, options });
    this.__realm.audit.observers.add(this);
    this.__realm.observers.add(this);
  }
  disconnect() {
    this.__targets = [];
    this.__realm.audit.observers.delete(this);
    this.__realm.observers.delete(this);
  }
  takeRecords() {
    const records = this.__queue;
    this.__queue = [];
    return records;
  }
  __consider(origin, record) {
    for (const { target, options } of this.__targets) {
      const scoped = target === origin || (options.subtree === true && target.contains?.(origin));
      if (!scoped) continue;
      if (record.type === 'childList' && options.childList !== true) continue;
      if (record.type === 'attributes' && options.attributes !== true) continue;
      this.__queue.push(record);
      if (!this.__scheduled) {
        this.__scheduled = true;
        queueMicrotask(() => {
          this.__scheduled = false;
          const records = this.takeRecords();
          if (records.length) this.__callback(records, this);
        });
      }
      return;
    }
  }
}

// --- Virtual clock ---

export class VirtualClock {
  constructor() {
    this.now = 0;
    this.tasks = new Map();
    this.__nextId = 0;
    this.seq = 0;
  }
  __schedule(fn, delay, repeat, kind, args) {
    if (typeof fn !== 'function') return 0;
    const id = ++this.__nextId;
    this.tasks.set(id, { id, seq: ++this.seq, at: this.now + Math.max(0, Number(delay) || 0), every: repeat ? Math.max(1, Number(delay) || 1) : 0, fn, kind, args });
    return id;
  }
  setTimeout(fn, delay, ...args) { return this.__schedule(fn, delay, false, 'timeout', args); }
  setInterval(fn, delay, ...args) { return this.__schedule(fn, delay, true, 'interval', args); }
  requestAnimationFrame(fn) { return this.__schedule(() => fn(this.now), 16, false, 'raf', []); }
  clearTimeout(id) { this.tasks.delete(Number(id)); }
  clearInterval(id) { this.tasks.delete(Number(id)); }
  cancelAnimationFrame(id) { this.tasks.delete(Number(id)); }
  pending() { return [...this.tasks.values()].map((task) => ({ id: task.id, seq: task.seq, kind: task.kind, at: task.at, every: task.every })); }
  async flush({ maxMs = 1000, maxTasks = 1000 } = {}) {
    const horizon = this.now + Math.max(0, maxMs);
    const errors = [];
    let fired = 0;
    const { setImmediate: hostSetImmediate } = await import('node:timers');
    while (fired < maxTasks) {
      const due = [...this.tasks.values()].filter((task) => task.at <= horizon).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.now = Math.max(this.now, due.at);
      if (due.every > 0) due.at = this.now + due.every;
      else this.tasks.delete(due.id);
      fired += 1;
      try { due.fn(...due.args); } catch (error) { errors.push(error); }
      // Macrotask boundary so promise chains started by the callback settle
      // before the next virtual task fires.
      await new Promise((resolve) => hostSetImmediate(resolve));
    }
    this.now = Math.max(this.now, horizon);
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'mock timer callbacks threw');
    return fired;
  }
}

// --- Realm assembly ---

export const createMockRealm = (options = {}) => {
  const realm = {
    observers: new Set(),
    audit: { seq: 0, listeners: new Set(), observers: new Set(), elements: new Set() },
    clock: options.clock || new VirtualClock(),
  };
  // Environment scaffolding created while an entry runs (for example fake
  // native route surfaces) is exempted from the leak audit.
  realm.audit.exempt = (element) => { realm.audit.elements.delete(element); };
  realm.notifyMutation = (origin, record) => {
    for (const observer of realm.observers) observer.__consider(origin, record);
  };

  const document = {
    nodeType: 9,
    title: String(options.title ?? 'ECHO'),
    activeElement: null,
    __realm: realm,
    createElement: (tag) => new MockElement(tag, realm),
    createTextNode: (text) => new MockTextNode(text, realm),
    // Direct tree walk: ids may contain characters the subset selector
    // engine would misparse (for example dots read as class selectors).
    getElementById: (id) => {
      const target = String(id);
      const walk = (element) => {
        if (element.id === target) return element;
        for (const child of element.children) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(document.documentElement);
    },
    querySelector: (selector) => document.documentElement.matches?.(selector) && matchesSelector(document.documentElement, selector) ? document.documentElement : document.documentElement.querySelector(selector),
    querySelectorAll: (selector) => document.documentElement.querySelectorAll(selector),
    contains: (node) => document.documentElement.contains(node),
  };
  realm.document = document;

  const window = {
    MockDom: true,
    document,
    navigator: { userAgent: 'ShinawaseTestingHarness', language: 'zh-CN' },
    innerWidth: Number(options.innerWidth) || 1280,
    innerHeight: Number(options.innerHeight) || 800,
    devicePixelRatio: 1,
    Event: MockEvent,
    CustomEvent: MockCustomEvent,
    MouseEvent: MockMouseEvent,
    KeyboardEvent: MockKeyboardEvent,
    MutationObserver: function MutationObserver(callback) { return new MockMutationObserver(callback, realm); },
    getComputedStyle: (element) => new Proxy({
      getPropertyValue: (name) => element.style.getPropertyValue(name) || '',
    }, {
      get: (target, prop) => {
        if (prop in target || typeof prop === 'symbol') return target[prop];
        if (prop === 'display') return element.style.display || (element.hidden ? 'none' : 'block');
        if (prop === 'position') return element.style.position || 'static';
        return element.style[prop] ?? '';
      },
    }),
    matchMedia: (media) => ({ media: String(media), matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }),
    requestAnimationFrame: (fn) => realm.clock.requestAnimationFrame(fn),
    cancelAnimationFrame: (id) => realm.clock.cancelAnimationFrame(id),
    setTimeout: (fn, delay, ...args) => realm.clock.setTimeout(fn, delay, ...args),
    clearTimeout: (id) => realm.clock.clearTimeout(id),
    setInterval: (fn, delay, ...args) => realm.clock.setInterval(fn, delay, ...args),
    clearInterval: (id) => realm.clock.clearInterval(id),
    performance: { now: () => realm.clock.now },
  };
  realm.window = window;
  eventTargetMixin(window, realm, 'window');
  eventTargetMixin(document, realm, 'document');

  const storage = new Map();
  window.localStorage = {
    getItem: (key) => storage.has(String(key)) ? storage.get(String(key)) : null,
    setItem: (key, value) => { storage.set(String(key), String(value)); },
    removeItem: (key) => { storage.delete(String(key)); },
    clear: () => storage.clear(),
    key: (index) => [...storage.keys()][index] ?? null,
    get length() { return storage.size; },
  };
  const url = String(options.url ?? 'app://echo/renderer/index.html');
  window.location = { href: url, hash: '', pathname: '/renderer/index.html', search: '', reload: () => {}, assign: () => {} };
  Object.defineProperty(document, 'location', { get: () => window.location });

  // Default scaffold mirrors the loader readiness contract
  // (targetProbeExpression checks `.app-shell` and no pending startup splash).
  const html = document.createElement('html');
  const head = document.createElement('head');
  const body = document.createElement('body');
  html.append(head, body);
  html.dataset.echoStartup = 'ready';
  document.documentElement = html;
  document.head = head;
  document.body = body;
  if (options.scaffold !== false) {
    const shell = document.createElement('div');
    shell.className = 'app-shell';
    const surface = document.createElement('section');
    surface.className = 'page-surface';
    surface.setAttribute('data-route-id', String(options.route ?? 'home'));
    shell.append(surface);
    body.append(shell);
  }
  // Scaffold nodes are part of the environment, not entry leaks.
  realm.audit.elements.clear();
  realm.audit.baseSeq = realm.audit.seq;
  return realm;
};
