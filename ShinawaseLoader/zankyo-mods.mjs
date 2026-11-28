import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { electronContext, unsupportedElectron } from './zankyo-compat.mjs';
import { ZankyoProviders } from './zankyo-providers.mjs';
import { createPage } from './zankyo-page.mjs';
import { createMediaRelay } from './zankyo-media.mjs';

const runtimeRequire = createRequire(import.meta.url);

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export function packageFile(directory, file) {
  if (typeof file !== 'string' || !file || isAbsolute(file)) throw new Error('gpui_invalid_package_path');
  const root = realpathSync(directory);
  const target = realpathSync(resolve(root, file));
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('gpui_package_path_escape');
  return target;
}

export class ZankyoMods {
  constructor(session, {
    log = () => {}, onToggle = () => {}, onUiEvent = null, onPage = () => {}, onToast = () => {},
    request = async () => { throw new Error('loader_api_unavailable'); },
    settingsDirectory = null, baseUrl = '',
  } = {}) {
    this.session = session;
    this.log = log;
    this.onToggle = onToggle;
    this.onUiEvent = onUiEvent;
    this.onPage = onPage;
    this.onToast = onToast;
    this.request = request;
    this.settingsDirectory = settingsDirectory;
    this.baseUrl = baseUrl;
    this.settings = new Map();
    this.running = new Map();
    this.failures = new Map();
    this.status = [];
    this.lastPanel = '';
    this.polling = false;
    this.providerPolling = false;
    this.providersSupported = true;
    this.lifecycle = Promise.resolve();
    this.timer = setInterval(() => this.events().catch((error) => log('WARN', error.message)), 250);
    this.timer.unref();
    this.providerTimer = setInterval(() => this.providerEvents().catch(error => log('WARN', error.message)), 75);
    this.providerTimer.unref();
  }
  async providerEvents() {
    if (this.providerPolling || !this.providersSupported || !this.session.connected || ![...this.running.values()].some(mod => mod.providers.handlers.size)) return;
    this.providerPolling = true;
    try {
      const requests = await this.session.call('providers.poll');
      if (!Array.isArray(requests)) return;
      // Do not await a provider here: it may call back into Core itself.
      for (const request of requests) {
        const mod = this.running.get(request.owner);
        if (!mod) continue;
        void mod.providers.dispatch(request).then(
          result => this.session.call('providers.reply', { owner: request.owner, id: request.id, result }),
          error => this.session.call('providers.reply', { owner: request.owner, id: request.id, error: String(error.message).slice(0, 4096) }),
        ).catch(error => this.log('WARN', error.message));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unknown Shinawase UI method providers\.poll/iu.test(message)) {
        this.providersSupported = false;
        this.log('WARN', '当前 ECHO GPUI 客户端不支持 providers.poll，已停止轮询外部提供者请求。');
        return;
      }
      throw error;
    } finally { this.providerPolling = false; }
  }
  async events() {
    if (this.polling || !this.session.connected) return;
    this.polling = true;
    try {
      for (const event of await this.session.call('ui.events')) {
        if (event.owner === 'shinawase-loader' && this.onUiEvent) {
          await this.onUiEvent(event);
          continue;
        }
        if (event.owner === 'shinawase-loader' && event.action.startsWith('toggle/')) {
          await this.onToggle(event.action.slice(7));
          continue;
        }
        const mod = this.running.get(event.owner);
        for (const handler of mod?.handlers || []) {
          try { await handler(event.action, event.fields); } catch (error) { this.log('WARN', `${event.owner}: ${error.message}`); }
        }
      }
      const subscribers = [...this.running.values()].filter(mod => mod.compat?.needsStatus);
      if (subscribers.length) {
        const [state, track] = await Promise.all([
          this.session.call('core.call', { method: 'playback.get', input: {} }),
          this.session.call('core.call', { method: 'playback.getCurrentTrack', input: {} }),
        ]);
        for (const mod of subscribers) await mod.compat.poll(async () => ({ state, track }));
      }
    } finally { this.polling = false; }
  }
  serialize(work) {
    const pending = this.lifecycle.then(work);
    this.lifecycle = pending.catch(() => {});
    return pending;
  }
  uiSettingsChanged(value) {
    for (const mod of this.running.values()) void mod.compat?.uiSettingsChanged(value);
  }
  packageSettings(id) {
    if (!this.settings.has(id)) {
      if (!/^[a-z0-9][a-z0-9._-]{1,63}$/iu.test(id)) throw new Error('invalid_mod_id');
      if (this.settings.size >= 256) {
        const retired = [...this.settings.keys()].find(key => !this.running.has(key) && this.settingsDirectory);
        if (!retired) throw new Error('mod settings cache limit (256)');
        this.settings.delete(retired);
      }
      const path = this.settingsDirectory && resolve(this.settingsDirectory, `${id}.json`);
      let value = {};
      if (path && existsSync(path)) {
        if (statSync(path).size > 65536) throw new Error('mod_settings_too_large');
        value = JSON.parse(readFileSync(path, 'utf8'));
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_mod_settings');
      this.settings.set(id, { path, value });
    }
    const record = this.settings.get(id);
    return {
      get: () => structuredClone(record.value),
      set: patch => {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('invalid_mod_settings');
        const value = { ...record.value, ...patch };
        const json = JSON.stringify(value);
        if (Buffer.byteLength(json) > 65536) throw new Error('mod_settings_too_large');
        if (record.path) {
          mkdirSync(dirname(record.path), { recursive: true });
          const temp = record.path + '.tmp';
          writeFileSync(temp, json, { mode: 0o600 });
          renameSync(temp, record.path);
        }
        record.value = JSON.parse(json);
        return structuredClone(record.value);
      },
    };
  }
  dispose(id) { return this.serialize(() => this.disposeNow(id)); }
  async disposeNow(id) {
    const mod = this.running.get(id);
    this.running.delete(id);
    this.failures.delete(id);
    try {
      if (typeof mod?.cleanup === 'function') await mod.cleanup();
    } finally {
      mod?.revoke();
      mod?.providers.close();
      mod?.compat?.close();
      this.onPage(id, null);
      await this.session.call('package.dispose', { owner: id });
    }
  }
  sync(packages, options) { return this.serialize(() => this.syncNow(packages, options)); }
  async syncNow(packages, { safeMode = false } = {}) {
    const enabled = new Set(packages.filter((p) => p.enabled && !safeMode).map((p) => p.id));
    for (const id of this.running.keys()) if (!enabled.has(id)) await this.disposeNow(id);
    for (const id of this.failures.keys()) if (!enabled.has(id)) this.failures.delete(id);
    this.status = [];
    for (const { id, manifest, directory, config, enabled, kind } of packages) {
      const row = { id, name: manifest.name || id, enabled, state: 'disabled' };
      this.status.push(row);
      if (!enabled || safeMode) { row.state = safeMode ? 'safe-mode' : 'disabled'; continue; }
      const native = Boolean(manifest.zankyo?.entry);
      const legacyEntry = manifest.entry || (kind === 'plugin' ? 'plugin.js' : 'mod.js');
      if (!native && (manifest.gpui?.entry || (!manifest.entry && !existsSync(resolve(directory, legacyEntry))))) {
        if (this.running.has(id)) await this.disposeNow(id);
        row.state = manifest.gpui?.entry ? 'gpui-plugin' : 'electron-only';
        row.runtime = manifest.gpui?.entry ? 'gpui' : 'electron';
        continue;
      }
      row.runtime = native ? 'zankyo' : 'electron-compat';
      let signature, dependencies = new Set();
      try {
        if (!native && (manifest.main || manifest.native || manifest.nativeShell || (kind === 'plugin' && manifest.apiVersion))) {
          throw unsupportedElectron('Electron main/native dependency or sandboxed Plugin VM');
        }
        const entry = packageFile(directory, native ? manifest.zankyo.entry : legacyEntry);
        if (!native && (['html', 'css'].includes(manifest.entryType) || !['.js', '.mjs', '.cjs'].includes(extname(entry).toLowerCase()))) {
          throw unsupportedElectron('HTML/CSS renderer entry');
        }
        const source = readFileSync(entry, 'utf8');
        dependencies = this.running.get(id)?.dependencies || this.failures.get(id)?.dependencies || new Set();
        const fingerprint = () => {
          const hash = createHash('sha256').update(source).update(JSON.stringify([manifest, config]));
          for (const file of [...dependencies].sort()) hash.update(file).update(readFileSync(packageFile(directory, file)));
          return hash.digest('hex');
        };
        signature = fingerprint();
        const failure = this.failures.get(id);
        if (failure?.signature === signature) {
          row.state = failure.state;
          row.error = failure.error;
          continue;
        }
        this.failures.delete(id);
        const previous = this.running.get(id);
        if (previous?.signature === signature) { row.state = 'loaded'; continue; }
        if (previous) await this.disposeNow(id);
        const handlers = new Set();
        let active = true;
        const call = (method, params) => {
          if (!active) throw new Error('mod_disposed');
          return this.session.call(method, params);
        };
        const owned = (method, params = {}) => call(method, { ...params, owner: id });
        const providers = new ZankyoProviders(owned);
        const relays = new Set();
        const require = createRequire(entry);
        const retireModules = () => {
          for (const file of Object.keys(require.cache)) {
            const rel = relative(realpathSync(directory), file);
            if (rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)) delete require.cache[file];
          }
        };
        retireModules();
        const zankyo = {
          providers: {
            register: (...args) => providers.register(...args),
            plugin: `shinawase.${id}`,
          },
          media: {
            createRelay: async () => {
              if (!active || relays.size >= 4) throw new Error('media_relay_limit_or_disposed');
              const relay = await createMediaRelay();
              if (!active) { relay.close(); throw new Error('mod_disposed'); }
              relays.add(relay);
              return relay;
            },
          },
          call: (method, params) => {
            if (['ui.patch', 'ui.remove', 'native.invoke', 'package.dispose'].includes(method)) return owned(method, params);
            if (!['session.describe', 'ui.views', 'ui.action', 'ui.choosePath', 'ui.openUrl', 'ui.openMv', 'ui.lyricsProvider', 'settings.get', 'settings.set', 'core.call'].includes(method)) {
              throw new Error(`gpui_method_not_exposed: ${method}`);
            }
            return call(method, params);
          },
          core: (method, input = {}) => call('core.call', { method, input }),
          ui: {
            views: () => call('ui.views'),
            patch: (view, tree) => owned('ui.patch', { view, tree }),
            remove: (view) => owned('ui.remove', { view }),
            action: (command) => call('ui.action', { command }),
            choosePath: (options = {}) => call('ui.choosePath', options),
            openUrl: url => call('ui.openUrl', { url }),
            onAction: (handler) => {
              if (!active) throw new Error('mod_disposed');
              if (typeof handler !== 'function' || handlers.size >= 128) throw new Error('invalid_action_handler');
              handlers.add(handler); return () => handlers.delete(handler);
            },
            page: (page, descriptor) => {
              if (!active) throw new Error('mod_disposed');
              if (typeof page !== 'string' || !/^[a-z0-9._-]{1,64}$/iu.test(page) ||
                  !descriptor || typeof descriptor.label !== 'string' || !descriptor.body) throw new Error('invalid_native_page');
              this.onPage(id, { ...descriptor, id: page }, async (action, fields) => {
                for (const handler of handlers) await handler(action, fields);
              });
              return () => this.onPage(id, { id: page, remove: true });
            },
          },
          settings: {
            get: () => call('settings.get'),
            set: (patch) => call('settings.set', patch),
          },
          native: {
            load: (file) => owned('native.load', { path: packageFile(directory, file) }),
            invoke: (input) => owned('native.invoke', { input }),
          },
        };
        const compat = electronContext({
          id, directory, packageFile, zankyo, baseUrl: this.baseUrl,
          settings: {
            get: () => this.packageSettings(id).get(),
            set: patch => this.packageSettings(id).set(patch),
          },
          request: (...args) => {
            if (!active) throw new Error('mod_disposed');
            return this.request(...args);
          },
          toast: message => this.onToast(message),
          log: (level, ...args) => this.log(level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO', `[${id}] ${args.join(' ')}`),
        });
        zankyo.ui.createPage = descriptor => createPage(zankyo.ui, descriptor);
        const record = { signature, dependencies, handlers, compat, providers, cleanup: null, revoke: () => {
          active = false; handlers.clear(); retireModules();
          for (const relay of relays) relay.close();
          relays.clear();
        } };
        this.running.set(id, record);
        try {
          if (!native) await compat.initialize();
          record.cleanup = await new AsyncFunction('echoExternalMod', 'console', 'window', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', source)({
            ...compat.context,
            id, manifest, config, runtime: 'gpui', zankyo,
            dataRoot: resolve(this.settingsDirectory || tmpdir(), 'mod-data', id),
            timers: compat.window,
            importDependency: name => {
              if (!active) throw new Error('mod_disposed');
              if (typeof name !== 'string' || !/^(?:node:[a-z_]+|(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/[a-z0-9._-]+)*)$/iu.test(name) || name.split('/').includes('..')) throw new Error('invalid_dependency');
              return runtimeRequire(name);
            },
            importModule: async file => {
              if (!active) throw new Error('mod_disposed');
              const path = packageFile(directory, file);
              if (!['.cjs', '.mjs'].includes(extname(path))) throw new Error('module_requires_cjs_or_mjs');
              dependencies.add(file);
              if (extname(path) === '.mjs') return import(pathToFileURL(path).href + '?revision=' + createHash('sha256').update(readFileSync(path)).digest('hex'));
              let module;
              try { module = require(path); }
              finally {
                for (const loaded of Object.keys(require.cache)) {
                  const rel = relative(realpathSync(directory), loaded);
                  if (rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)) dependencies.add(rel);
                }
              }
              if (dependencies.size > 512) throw new Error('package_module_limit');
              return module;
            },
          }, compat.context.console, compat.window, compat.window.setTimeout, compat.window.setInterval, compat.window.clearTimeout, compat.window.clearInterval);
        } catch (error) {
          await this.disposeNow(id);
          throw error;
        }
        record.signature = fingerprint();
        row.state = 'loaded';
        this.log('INFO', `Zankyo loaded ${id}`);
      } catch (error) {
        if (this.running.has(id)) {
          try { await this.disposeNow(id); } catch (cleanupError) { this.log('WARN', `${id}: ${cleanupError.message}`); }
        }
        const message = String(error instanceof Error ? error.message : error).slice(0, 4096);
        const incompatible = !native && (/electron_mod_requires_port|(?:document|HTMLElement|MutationObserver|localStorage) is not defined/u.test(message));
        row.state = incompatible ? 'incompatible' : 'error';
        row.error = (incompatible && !message.startsWith('electron_mod_requires_port') ? unsupportedElectron(message).message : message).slice(0, 4096);
        if (signature) this.failures.set(id, { signature, dependencies, state: row.state, error: row.error });
        this.log('WARN', `Zankyo ${row.state} ${id}: ${row.error}`);
      }
    }
    const panel = JSON.stringify(this.status);
    if (panel !== this.lastPanel) {
      await this.session.call('loader.state', { packages: this.status.slice(0, 256) });
      this.lastPanel = panel;
    }
    return this.status;
  }
  async close() {
    clearInterval(this.timer);
    clearInterval(this.providerTimer);
    await this.serialize(async () => {
      for (const id of this.running.keys()) {
        try { await this.disposeNow(id); } catch (error) { this.log('WARN', `${id}: ${error.message}`); }
      }
    });
  }
}
