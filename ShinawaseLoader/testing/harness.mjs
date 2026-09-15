// Shinawase Testing SDK - offline execution harness.
//
// Runs a package entry inside a node:vm sandbox assembled from the mock DOM
// and the recorded echoExternalMod context, using the exact wrapper shape the
// loader injects over CDP (`(async function(echoExternalMod, console) { ... })`,
// ShinawaseLoader.mjs injectIntoTarget). Signature dedupe, `already` results,
// and dispose ordering (entry cleanup, then sidebar, then extend disposers)
// mirror the loader so lifecycle tests fail for the same reasons they would
// fail live.
//
// The vm sandbox is an engineering convenience, not a security boundary: the
// harness executes the package entry in this process. Only run it against
// packages you are developing or would be willing to inject into ECHO.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setImmediate as hostSetImmediate } from 'node:timers';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { createMockRealm, VirtualClock } from './mock-dom.mjs';
import { createMockConfigUi, createMockContext } from './mock-context.mjs';
import {
  EXTERNAL_MODS_GLOBAL, MANIFEST_NAMES, buildEntrySource, externalContext,
  safeRelative, wrapConfigUiExpression, wrapEntryExpression,
} from './contract.mjs';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/u, ''));

const describeElement = (element) => {
  const classes = element.className ? `.${element.className.split(/\s+/u).join('.')}` : '';
  const idPart = element.id ? `#${element.id}` : '';
  return `<${element.localName}${idPart}${classes}>`;
};

export const createHarness = (options = {}) => {
  // --- resolve package inputs (mirrors injectionPlan defaults) ---
  const packageDir = options.packageDir ? resolve(String(options.packageDir)) : null;
  let manifest = options.manifest ? structuredClone(options.manifest) : null;
  let entrySource = options.source ?? null;
  let entryName = options.entryName || null;
  let config = options.config;
  if (packageDir) {
    const manifestName = MANIFEST_NAMES.find((name) => existsSync(join(packageDir, name)));
    if (!manifestName) throw new Error(`no ${MANIFEST_NAMES.join(' / ')} found in ${packageDir}`);
    if (!manifest) manifest = readJson(join(packageDir, manifestName));
    const kind = manifestName === 'echo.plugin.json' ? 'plugin' : 'mod';
    entryName = entryName || manifest.entry || (kind === 'plugin' ? 'plugin.js' : 'mod.js');
    if (entrySource == null) {
      const entryPath = join(packageDir, safeRelative(entryName));
      if (existsSync(entryPath)) entrySource = readFileSync(entryPath, 'utf8');
      else if (manifest.main || manifest.native || manifest.nativeShell) entrySource = '/* shinawase native-only package */';
      else throw new Error(`manifest entry is missing: ${entryName}`);
    }
    if (config === undefined) {
      const configPath = join(packageDir, safeRelative(manifest.config || 'config.json'));
      config = existsSync(configPath) ? readJson(configPath) : {};
    }
  }
  if (!manifest) manifest = { id: options.id || 'shinawase.testing.mod', name: 'Harness Mod', version: '0.0.0' };
  if (entrySource == null) throw new Error('createHarness needs packageDir or source');
  entryName = entryName || manifest.entry || 'mod.js';
  config = config === undefined ? {} : config;
  const id = String(options.id || manifest.id || 'shinawase.testing.mod');

  // --- realm + context + sandbox ---
  const clock = options.clock || new VirtualClock();
  const realm = createMockRealm({ ...(options.dom || {}), clock });
  const mock = createMockContext({
    realm, id, manifest, config, packageDir,
    echo: options.echo, appSettings: options.appSettings, playerStatus: options.playerStatus,
    fetchHandler: options.fetchHandler, uploadHandler: options.uploadHandler,
    mainHandlers: options.mainHandlers, nativeHandlers: options.nativeHandlers,
    uiSettings: options.uiSettings, debug: options.debug === true,
  });
  const sandbox = realm.window;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.console = mock.modConsole;
  sandbox.queueMicrotask = queueMicrotask;
  sandbox.structuredClone = structuredClone;
  sandbox.URL = URL;
  sandbox.URLSearchParams = URLSearchParams;
  sandbox.TextEncoder = TextEncoder;
  sandbox.TextDecoder = TextDecoder;
  sandbox.atob = atob;
  sandbox.btoa = btoa;
  sandbox.crypto = { randomUUID };
  vm.createContext(sandbox, { name: `shinawase-harness:${id}` });
  sandbox[EXTERNAL_MODS_GLOBAL] = sandbox[EXTERNAL_MODS_GLOBAL] || {};

  const openSurfaces = new Set();
  let snapshot = { auditSeq: realm.audit.seq, clockSeq: clock.seq };

  const harness = {
    id,
    manifest,
    config,
    realm,
    clock,
    window: sandbox,
    document: realm.document,
    context: mock.context,
    records: mock.records,
    toasts: mock.toasts,
    consoleRecords: mock.consoleRecords,
    controls: mock.controls,
    query: (selector) => realm.document.querySelector(selector),
    queryAll: (selector) => realm.document.querySelectorAll(selector),

    // Mirrors injectIntoTarget: signature dedupe, dispose of a previous
    // instance, wrapper execution, registry bookkeeping.
    async inject() {
      const source = buildEntrySource(id, manifest, entryName, entrySource);
      const contextJson = JSON.stringify(externalContext(id, manifest, config, mock.context.baseUrl));
      const signature = createHash('sha256').update(`${source}\n${contextJson}`).digest('hex');
      const registry = sandbox[EXTERNAL_MODS_GLOBAL];
      const previous = registry[id];
      if (previous?.signature === signature) return { status: 'already' };
      try { previous?.dispose?.(); } catch {}
      snapshot = { auditSeq: realm.audit.seq, clockSeq: clock.seq };
      const wrapper = vm.runInContext(wrapEntryExpression(source), sandbox, { filename: `${id}/${entryName}` });
      const returnedDispose = await wrapper(mock.context, mock.modConsole);
      const dispose = () => {
        try {
          if (typeof returnedDispose === 'function') returnedDispose();
        } finally {
          while (mock.sidebarDisposers.length) mock.sidebarDisposers.pop()?.();
          while (mock.extendDisposers.length) mock.extendDisposers.pop()?.();
        }
      };
      registry[id] = { source, signature, dispose };
      return { status: 'injected', id };
    },

    injected() { return Boolean(sandbox[EXTERNAL_MODS_GLOBAL][id]); },

    dispose() {
      for (const surface of [...openSurfaces]) surface.close();
      const registry = sandbox[EXTERNAL_MODS_GLOBAL];
      const entry = registry[id];
      if (!entry) return false;
      try { entry.dispose?.(); } finally { delete registry[id]; }
      return true;
    },

    // Leak audit relative to the last inject(): DOM nodes the entry created
    // that are still connected, listeners still registered, observers still
    // observing, and virtual timers still pending. This is the offline
    // counterpart of the AGENTS.md rule that disabling must not leave stale
    // resources or duplicate handlers.
    checkClean() {
      const leaks = [];
      for (const element of realm.audit.elements) {
        if (element.__seq > snapshot.auditSeq && element.isConnected) {
          leaks.push({ kind: 'dom', detail: describeElement(element) });
        }
      }
      for (const listener of realm.audit.listeners) {
        if (listener.seq > snapshot.auditSeq) leaks.push({ kind: 'listener', detail: `${listener.label} "${listener.type}"` });
      }
      for (const observer of realm.audit.observers) {
        if (observer.__seq > snapshot.auditSeq) leaks.push({ kind: 'observer', detail: 'MutationObserver still connected' });
      }
      for (const task of clock.pending()) {
        if (task.seq > snapshot.clockSeq) {
          const kind = task.kind === 'interval' ? 'interval' : task.kind === 'raf' ? 'raf' : 'timer';
          leaks.push({ kind, detail: `${task.kind} scheduled for t=${task.at}ms` });
        }
      }
      return { clean: leaks.length === 0, leaks };
    },

    expectClean() {
      const result = harness.checkClean();
      if (!result.clean) {
        const lines = result.leaks.map((leak) => `  - [${leak.kind}] ${leak.detail}`).join('\n');
        throw new Error(`entry left ${result.leaks.length} resource(s) after dispose:\n${lines}`);
      }
    },

    flushTimers: (flushOptions) => clock.flush(flushOptions),
    flushMicrotasks: () => new Promise((resolvePromise) => hostSetImmediate(resolvePromise)),

    // Mounts a registered sidebar page the way loader-ui does when the user
    // opens it: render(root, pageContext) with the bridge page context shape.
    openSidebarPage(pageId) {
      const entry = pageId
        ? mock.sidebarEntries.find((candidate) => candidate.pageId === String(pageId))
        : mock.sidebarEntries[0];
      if (!entry) throw new Error(pageId ? `sidebar page not registered: ${pageId}` : 'no sidebar page registered');
      const root = realm.document.createElement('section');
      root.className = 'echo-external-mod-page';
      root.setAttribute('data-harness-page', entry.pageId);
      realm.document.body.append(root);
      let cleanup = null;
      const pageContext = {
        id, manifest, config,
        echo: mock.context.echo,
        assetUrl: mock.context.assetUrl,
        loadAsset: mock.context.loadAsset,
        toast: mock.context.toast,
      };
      if (typeof entry.options.render === 'function') cleanup = entry.options.render(root, pageContext) || null;
      else if (typeof entry.options.html === 'string') root.innerHTML = entry.options.html;
      const handle = {
        root,
        entry,
        close() {
          if (!openSurfaces.has(handle)) return;
          openSurfaces.delete(handle);
          entry.open = null;
          try { cleanup?.(); } finally { root.remove(); }
        },
      };
      entry.open = handle;
      openSurfaces.add(handle);
      return handle;
    },

    // Runs the package configUi script under the echoConfigUi contract
    // (SDK.md "Custom config UI"): submit() mirrors the loader Save button
    // (an object returned from onSave is saved, then the modal closes).
    async openConfigUi(configUiOptions = {}) {
      const scriptPath = configUiOptions.script
        || (packageDir && typeof manifest.configUi === 'string' ? join(packageDir, safeRelative(manifest.configUi)) : null);
      if (!scriptPath || !existsSync(scriptPath)) throw new Error('configUi script not found');
      let schema = null;
      if (manifest.configSchema && typeof manifest.configSchema === 'object') schema = manifest.configSchema;
      else if (packageDir && typeof manifest.configSchema === 'string') {
        const schemaPath = join(packageDir, safeRelative(manifest.configSchema));
        if (existsSync(schemaPath)) schema = readJson(schemaPath);
      }
      const ui = createMockConfigUi({ realm, id, manifest, schema, config, packageDir, records: mock.records });
      const wrapper = vm.runInContext(wrapConfigUiExpression(readFileSync(scriptPath, 'utf8')), sandbox, { filename: `${id}/${manifest.configUi || 'config-ui.js'}` });
      const cleanup = await wrapper(ui.configUi);
      const handle = {
        configUi: ui.configUi,
        state: ui.state,
        root: ui.root,
        async submit() {
          if (typeof ui.state.onSaveHandler !== 'function') throw new Error('configUi did not register onSave');
          const result = await ui.state.onSaveHandler();
          if (result && typeof result === 'object' && !Array.isArray(result)) await ui.configUi.save(result);
          ui.state.closed = true;
          return result;
        },
        close() {
          if (!openSurfaces.has(handle)) return;
          openSurfaces.delete(handle);
          try { if (typeof cleanup === 'function') cleanup(); } finally { ui.root.remove(); }
        },
      };
      openSurfaces.add(handle);
      return handle;
    },
  };
  return harness;
};

// Convenience one-shot: inject, optionally settle timers, dispose, audit.
// Guarded one-shot timeouts (scheduled but never cleared, self-guarded by a
// `disposed` flag) are a common shipped-mod pattern, so pending one-shot
// timers are reported as warnings unless options.strictTimers is true;
// intervals, rAF loops, listeners, DOM nodes, and observers always fail.
export const smokeRun = async (options = {}) => {
  const harness = createHarness(options);
  const stages = [];
  const outcome = { ok: true, stages, harness, leaks: [], timerWarnings: [] };
  try {
    const injectResult = await harness.inject();
    stages.push({ id: 'inject', ok: true, detail: injectResult.status });
    await harness.flushMicrotasks();
    if (options.settleMs !== 0) {
      const fired = await harness.flushTimers({ maxMs: Number(options.settleMs) || 250 });
      stages.push({ id: 'settle', ok: true, detail: `${fired} timer(s) fired` });
    }
    harness.dispose();
    stages.push({ id: 'dispose', ok: true });
    const cleanliness = harness.checkClean();
    const hard = cleanliness.leaks.filter((leak) => leak.kind !== 'timer' || options.strictTimers === true);
    const soft = cleanliness.leaks.filter((leak) => leak.kind === 'timer' && options.strictTimers !== true);
    stages.push({ id: 'cleanup-audit', ok: hard.length === 0, leaks: cleanliness.leaks });
    outcome.ok = hard.length === 0;
    outcome.leaks = hard;
    outcome.timerWarnings = soft;
  } catch (error) {
    stages.push({ id: 'error', ok: false, detail: error instanceof Error ? error.message : String(error) });
    outcome.ok = false;
    outcome.error = error instanceof Error ? error.message : String(error);
  }
  return outcome;
};
