import { readFile, writeFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { copy } from './i18n.mjs';

const node = (kind, text = '', extra = {}) => ({ kind, text: String(text ?? ''), ...extra });
const group = (kind, children, extra = {}) => node(kind, '', { children: children.filter(Boolean), ...extra });
const text = (value, tone) => node('text', value, { tone });
const button = (label, action, extra) => node('button', label, { action, ...extra });
const row = (...children) => group('row', children);
const section = (title, ...children) => group('section', [node('heading', title), ...children]);
const field = (id, label, value = '', extra = {}) => node('field', label, { id, value: String(value ?? ''), ...extra });
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
const image = source => {
  const match = /^data:image\/(svg\+xml|png|jpeg|webp);base64,([a-z0-9+/=]+)$/iu.exec(source || '');
  if (!match || match[2].length > 48000) return undefined;
  return { format: match[1] === 'svg+xml' ? 'svg' : match[1], bytes: [...Buffer.from(match[2], 'base64')] };
};
// Same headings, fenced blocks, lists and paragraph joining as loader-ui.js.
export function nativeMarkdown(source) {
  const lines = String(source || '').replaceAll('\r\n', '\n').split('\n');
  const result = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) result.push(text(paragraph.join(' ')));
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith('```')) {
      flush();
      const code = [];
      while (++index < lines.length && !lines[index].startsWith('```')) code.push(lines[index]);
      result.push(node('code', code.join('\n')));
    } else if (/^(#{1,3})\s+/u.test(line)) {
      flush();
      result.push(node('heading', line.replace(/^#{1,3}\s+/u, '')));
    } else if (/^\s*[-*]\s+/u.test(line)) {
      flush();
      result.push(text('• ' + line.replace(/^\s*[-*]\s+/u, '')));
    } else if (!line.trim()) flush();
    else paragraph.push(line.trim());
  }
  flush();
  return group('column', result);
}

// Native presentation of loader-ui.js. All business operations reuse the
// Loader API; the launch secret and HTTP token never enter a UI document.
export class ZankyoUi {
  constructor(session, { request, version, packages = () => [] }) {
    this.session = session;
    this.request = request;
    this.version = version;
    this.packages = packages;
    this.page = 'loader';
    this.locale = 'zh';
    this.ui = {};
    this.status = {};
    this.mods = [];
    this.market = [];
    this.recommended = [];
    this.random = [];
    this.recommendation = 0;
    this.user = null;
    this.filter = 'all';
    this.marketFilter = 'all';
    this.runtime = 'all';
    this.sort = 'name';
    this.query = '';
    this.offset = 0;
    this.tag = '';
    this.modal = null;
    this.notice = '';
    this.noticeId = 0;
    this.reportedNotice = '';
    this.tone = 'info';
    this.busy = false;
    this.operation = 0;
    this.revision = 0;
    this.actions = new Map();
    this.inputs = {};
    this.pages = new Map();
    this.pageState = new Map();
    this.logs = '';
    this.closed = false;
    this.visible = false;
  }
  get t() { return copy[this.locale] || copy.zh; }
  act(label, key, callback, extra) {
    this.actions.set(key, callback);
    return button(label, key, extra);
  }
  async start() {
    await this.refresh();
    const disclaimer = await this.request('/api/disclaimer');
    if (disclaimer.accepted === false) this.modal = { kind: 'consent', phrase: disclaimer.phrase };
    else if (this.ui.steamLaunchReminder) this.modal = { kind: 'steam' };
    await this.publish();
    if (this.closed) return;
    this.timer = setInterval(() => void this.poll(), 5000);
    this.timer.unref();
  }
  close() { this.closed = true; ++this.operation; clearTimeout(this.searchTimer); clearInterval(this.timer); this.pages.clear(); this.inputs = {}; }
  async poll() {
    if (!this.visible || this.busy || this.closed || this.pages.has(this.page)) return;
    const operation = ++this.operation;
    this.busy = true;
    try { await this.refresh(operation); } catch {}
    finally {
      if (operation === this.operation && !this.closed) {
        this.busy = false;
        await this.publish();
      }
    }
  }
  async refresh(operation = this.operation) {
    const [status, settings, mods] = await Promise.all([
      this.request('/api/status'), this.request('/api/ui-settings'), this.request('/api/mods'),
    ]);
    if (operation !== this.operation || this.closed) return;
    this.status = status;
    this.locale = status.locale || this.locale;
    this.ui = settings.ui;
    this.mods = mods.mods || [];
    if (!this.initialized) {
      this.filter = this.ui.rememberFilters === false ? 'all' : this.ui.modFilter || 'all';
      this.sort = this.ui.rememberFilters === false ? 'name' : this.ui.modSort || 'name';
      this.initialized = true;
    }
    if (this.page === 'loader') {
      try {
        const logs = await this.request('/api/logs?tail=100');
        if (operation === this.operation && !this.closed) this.logs = (logs.text || '').slice(-32000);
      } catch {}
    }
  }
  async marketRefresh(force = false) {
    const operation = this.operation;
    const result = await this.request('/api/market' + (force ? '?force=1' : ''));
    if (operation !== this.operation || this.closed) return;
    if (result.ok === false) throw new Error(result.error || this.t.marketOffline);
    const user = (await this.request('/api/market/me')).user;
    if (operation !== this.operation || this.closed) return;
    this.market = result.mods || [];
    this.recommended = result.recommended || this.market.filter(item => item.featured || item.channel === 'official');
    if (force || !this.random.length) this.shuffle();
    this.user = user;
  }
  async navigate(page) {
    if (this.modal?.kind === 'consent') return;
    if (!['loader', 'mods', 'market', ...this.pages.keys()].includes(page)) return;
    this.pageState.set(this.page, { query: this.query, offset: this.offset });
    this.page = page;
    this.visible = true;
    this.modal = null;
    this.query = this.pageState.get(page)?.query || '';
    this.offset = this.pageState.get(page)?.offset || 0;
    this.inputs = { search: this.query };
    const operation = this.operation;
    this.navigationSave = (this.navigationSave || Promise.resolve()).catch(() => {}).then(
      () => this.closed ? undefined : this.request('/api/ui-settings', 'PUT', { ui: { lastShinawasePage: page } }),
    );
    const settings = await this.navigationSave;
    if (operation !== this.operation || this.closed) return;
    this.ui = settings.ui;
    if (page === 'market') await this.marketRefresh();
    else await this.refresh();
  }
  async preference(patch) {
    this.ui = (await this.request('/api/ui-settings', 'PUT', { ui: patch })).ui;
  }
  async loadModal(load) {
    const operation = this.operation;
    const modal = await load();
    if (operation === this.operation && !this.closed) this.modal = modal;
  }
  async event(event) {
    if (this.closed || event?.owner !== 'shinawase-loader') return;
    const action = event.action;
    if (action === 'hidden') { this.visible = false; return; }
    if (action === 'field') {
      if (typeof event.id !== 'string' || typeof event.value !== 'string' || event.value.length > 65536) return;
      this.inputs[event.id] = event.value;
      if (event.id === 'search') {
        this.query = event.value;
        this.offset = 0;
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => void this.publish(), 150);
      }
      if (event.id === 'consent') await this.publish();
      return;
    }
    if (this.busy && !action?.startsWith('navigate/') && action !== 'modal-close') return;
    const pageAction = /^page-action\/([^/]+)\/(.+)$/u.exec(action || '');
    const nativePage = this.pages.get(this.page);
    const work = pageAction && nativePage?.owner === pageAction[1] ? () => nativePage.onAction(pageAction[2], this.inputs)
      : action?.startsWith('navigate/') ? () => this.navigate(action.slice(9))
      : action === 'files' ? () => this.files(event.purpose, event.paths)
      : this.actions.get(action);
    if (!work) return;
    const operation = ++this.operation;
    this.inputs = { ...this.inputs, ...event.fields };
    this.busy = true;
    this.notice = '';
    try {
      await this.publish();
      await work();
    } catch (error) {
      if (operation === this.operation) {
        this.notice = error.message;
        this.tone = 'error';
      }
    } finally {
      if (operation === this.operation) {
        this.busy = false;
        if (!this.closed) await this.publish();
      }
    }
  }
  async files(purpose, paths) {
    if (!Array.isArray(paths) || paths.length > 32 || paths.some(path => typeof path !== 'string')) throw new Error('Invalid file selection');
    if (!paths.length) return;
    if (purpose === 'export') {
      await writeFile(paths[0], JSON.stringify(await this.request('/api/settings/export'), null, 2), { flag: 'wx' });
    } else {
      for (const path of paths) {
        const size = (await stat(path)).size;
        const limit = purpose === 'settings' ? 1024 * 1024 : 32 * 1024 * 1024;
        if (size > limit) throw new Error(`Selected file exceeds ${limit / 1024 / 1024} MiB`);
        if (purpose === 'settings') {
          const result = await this.request('/api/settings/import', 'POST', JSON.parse(await readFile(path, 'utf8')));
          if (result.requiresRestart) this.notice = this.t.restartRequired || 'Restart required';
        } else {
          if (!['.echomod', '.echo', '.json', '.zip'].includes(extname(path).toLowerCase())) throw new Error('Unsupported package extension');
          const data = (await readFile(path)).toString('base64');
          const result = await this.request(purpose === 'upload' ? '/api/market/upload' : '/api/import', 'POST', { name: basename(path), data });
          if (result.editKey) this.modal = { kind: 'key', value: result.editKey };
        }
      }
      if (purpose === 'upload') await this.marketRefresh(true);
      else await this.refresh();
    }
    this.notice ||= this.t.saved || 'Saved';
    this.tone = 'success';
  }
  pick(label, purpose) { return button(label, 'pick/' + purpose); }
  switch(label, key, value, callback) {
    return this.act(label, key, callback, { kind: 'switch', selected: value === true });
  }
  choices(label, key, value, options, callback) {
    return group('setting', [text(label), group('segments', options.map(([id, title]) =>
      this.act(title, key + '/' + id, () => callback(id), { selected: value === id })))]);
  }
  message(label, tone = 'success') { this.notice = label; this.tone = tone; }
  shuffle() {
    const items = this.market.filter(mod => !mod.unlisted);
    for (let index = items.length - 1; index > 0; index--) {
      const next = Math.floor(Math.random() * (index + 1));
      [items[index], items[next]] = [items[next], items[index]];
    }
    this.random = items.slice(0, 3);
  }
  async details(mod) {
    const result = await this.request('/api/market/mod/' + encodeURIComponent(mod.id));
    return { ...mod, ...result.mod, readme: result.readme || '', canManage: result.canManage || mod.canManage };
  }
  registerPage(owner, descriptor, onAction) {
    if (!descriptor) {
      for (const [id, page] of this.pages) if (page.owner === owner) this.pages.delete(id);
    } else {
      const id = owner + '/' + descriptor.id;
      if (descriptor.remove) this.pages.delete(id);
      else {
        if (this.pages.size >= 64 && !this.pages.has(id)) throw new Error('Native page limit (64)');
        const body = structuredClone(descriptor.body);
        const bind = node => {
          if (node.kind === 'markdown') Object.assign(node, nativeMarkdown(node.text), { text: '' });
          if (node.action) node.action = `page-action/${owner}/${node.action}`;
          if (node.submit) node.submit = `page-action/${owner}/${node.submit}`;
          for (const child of node.children || []) bind(child);
        };
        bind(body);
        this.pages.set(id, { id, owner, label: descriptor.label, body, onAction });
      }
    }
    if (!['loader', 'mods', 'market', ...this.pages.keys()].includes(this.page)) this.page = 'mods';
    void this.publish().catch(error => console.warn('[Shinawase UI]', error.message));
  }
  mast(kicker, title, description, actions = [], aside = null) {
    const content = group('column', [node('kicker', kicker), node('title', title), text(description, 'muted'), group('row', actions)]);
    return group('mast', [aside ? group('mast-content', [content, aside]) : content]);
  }
  loader() {
    const t = this.t;
    const s = this.status;
    const steam = `"${String(s.gameRoot || '').replaceAll('/', '\\')}\\ECHO.modded.exe" %command%`;
    const toggle = (key, label) => this.switch(label, 'pref/' + key, this.ui[key], async () => {
      await this.preference({ [key]: !this.ui[key] });
      if (key === 'steamLaunchReminder' && this.ui[key]) this.modal = { kind: 'steam' };
    });
    return [
      this.mast(t.loaderKicker, t.loaderTitle, t.loaderHint, [
        this.act(t.changeLanguage, 'locale', async () => {
          await this.request('/api/locale', 'POST', { locale: this.locale === 'zh' ? 'en' : 'zh' });
          await this.refresh();
        }),
        this.act(t.exportPerf, 'perf', async () => {
          const result = await this.request('/api/perf', 'POST');
          this.message((t.perfReady || 'Performance report') + ' · ' + result.file);
        }),
        this.act(s.debugMode ? t.debugOn : t.debugOff, 'debug', async () => {
          await this.request('/api/debug', 'POST', { enabled: !s.debugMode }); await this.refresh();
        }),
      ], node('connection', t.connected + ' · GPUI · native')),
      section(t.status, group('stats', [
        node('stat', 'GPUI', { value: t.runtime || 'Runtime' }),
        node('stat', String(this.mods.length), { value: t.packages }),
        node('stat', String(this.packages().filter(pkg => pkg.state === 'loaded').length), { value: t.modsActiveLabel }),
        node('stat', String(s.port || ''), { value: 'Loader API' }),
      ])),
      group('columns', [
        section(t.steamLaunchSection, text(t.steamLaunchBody, 'muted'), node('code', steam),
          button(t.consoleCopy, 'copy/' + steam), toggle('steamLaunchReminder', t.steamLaunchReminderToggle)),
        section(t.autoUpdateSection, text(t.autoUpdateHint, 'muted'),
          this.switch(t.autoUpdateToggle, 'auto-update', s.autoUpdate !== false, async () => {
            await this.request('/api/settings/auto-update', 'POST', { enabled: s.autoUpdate === false }); await this.refresh();
          }),
          this.act(t.updateLoader, 'update', async () => {
            const result = await this.request('/api/update', 'POST');
            if (!result.ok) throw new Error(result.error || t.updateFailed);
            this.message(result.updated ? t.updateApplied : t.updateCurrent);
          }, { tone: 'primary' })),
      ]),
      section(t.appearance, text(t.appearanceHint, 'muted'),
        toggle('showTitlebarBrand', t.showTitlebarBrand),
        this.choices(t.density, 'density', this.ui.density, [['comfortable', t.densityComfortable], ['compact', t.densityCompact]], value => this.preference({ density: value })),
        this.choices(t.cardLayout, 'layout', this.ui.cardLayout, [['list', t.layoutList], ['grid', t.layoutGrid]], value => this.preference({ cardLayout: value })),
        group('setting', [text(t.accentColor), group('row', ['', '#7c5cff', '#4b55e8', '#0ea5a4', '#e77c52', '#e85d91'].map(color =>
          this.act(color || t.accentReset, 'accent/' + color, () => this.preference({ accentColor: color }), { kind: color ? 'swatch' : 'button', selected: this.ui.accentColor === color, color })))]),
        toggle('animations', t.animations),
        toggle('showModDescriptions', t.showDescriptions), toggle('showModVersions', t.showVersions),
        toggle('showModIds', t.showIds), toggle('rememberFilters', t.rememberFilters),
        row(this.pick(t.exportSettings, 'export'), this.pick(t.importSettings, 'settings'))),
      section(t.debugConsole,
        row(text(t.consoleHint, 'muted'), button(t.consoleCopy, 'copy/' + this.logs), this.act(t.consoleClear, 'clear', async () => {
          await this.request('/api/logs', 'POST'); this.logs = '';
        }), this.act(t.refreshMarket, 'logs', () => this.refresh())),
        node('code', this.logs || '› help'),
        field('command', t.consoleHint, '', { submit: 'console' }),
        this.act(t.console || 'Run', 'console', async () => {
          const result = await this.request('/api/console', 'POST', { command: this.inputs.command });
          await this.refresh(); this.logs += '\n› ' + result.output;
        })),
    ];
  }
  runtimeOf(mod) { return mod.zankyo ? 'zankyo' : mod.gpui ? 'gpui' : 'electron'; }
  supports(mod, runtime) {
    return runtime === 'all' || (runtime === 'electron' ? mod.electron ?? (!mod.gpui && !mod.zankyo) : Boolean(mod[runtime]));
  }
  async filterPreference() {
    this.offset = 0;
    if (this.ui.rememberFilters !== false) await this.preference({ modFilter: this.filter, modSort: this.sort });
  }
  modCard(mod) {
    const t = this.t;
    const state = this.packages().find(p => p.id === mod.id);
    return group('mod-card', [
      node('avatar', mod.name, { image: image(mod.iconDataUrl) }), group('column', [
        row(node('heading', mod.name), node('badge', (this.ui.showModVersions !== false ? 'v' + mod.version + ' · ' : '') +
          ['electron', 'gpui', 'zankyo'].filter(target => this.supports(mod, target)).join(' / '), { tone: 'muted' })),
        this.ui.showModIds !== false && text(mod.id, 'muted'),
        this.ui.showModDescriptions !== false && text(mod.description, 'muted'),
        state?.runtime && node('badge', ({
          zankyo: 'Zankyo · native',
          gpui: 'GPUI · plugin',
          'electron-compat': state.state === 'loaded'
            ? (this.locale === 'en' ? 'Electron · compatibility active' : 'Electron · 兼容运行')
            : (this.locale === 'en' ? 'Electron · requires port' : 'Electron · 需要移植'),
          electron: 'Electron',
        })[state.runtime], { tone: 'muted' }),
        text(state?.error || state?.state || (mod.enabled ? t.enabled : t.disabled), state?.error ? 'error' : 'muted'),
      ]),
      row(this.switch(mod.enabled ? t.enabled : t.disabled, 'toggle/' + mod.id, mod.enabled, async () => {
        await this.request('/api/mod/' + encodeURIComponent(mod.id) + (mod.enabled ? '/disable' : '/enable'), 'POST');
        await this.refresh();
      }), this.act(t.config || 'Config', 'config/' + mod.id, () => this.loadModal(async () => ({
        kind: 'config', ...await this.request('/api/mod/' + encodeURIComponent(mod.id) + '/config'),
      }))), this.act(t.remove || '卸载', 'remove/' + mod.id, () => { this.modal = { kind: 'remove', mod }; }, { tone: 'error' })),
    ]);
  }
  modsPage() {
    const t = this.t;
    const active = this.mods.filter(mod => mod.enabled).length;
    const matches = this.mods.filter(mod =>
      (!this.query || [mod.name, mod.id, mod.description].join(' ').toLowerCase().includes(this.query.toLowerCase())) &&
      (this.filter === 'all' || mod.enabled === (this.filter === 'active')) &&
      this.supports(mod, this.runtime));
    matches.sort((a, b) => this.sort === 'recent' ? String(b.importedAt).localeCompare(String(a.importedAt))
      : this.sort === 'enabled' ? Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
    return [
      this.mast(t.modsKicker, t.modsTitle, t.modsHint, [
        this.pick(t.importMod, 'import'), this.act(t.reload, 'reinject', async () => {
          await this.request('/api/reinject', 'POST'); await this.refresh(); this.message(t.reload);
        }, { tone: 'primary' }),
      ]),
      group('rack', [
        node('stat', `${String(active).padStart(2, '0')} / ${this.mods.length}`, { value: t.modsActiveLabel }),
        group('row', this.mods.slice(0, 64).map(mod => this.act(mod.name, 'rack/' + mod.id, () => {
          this.query = mod.name; this.inputs.search = mod.name; this.offset = 0;
        }, { kind: 'tile', selected: mod.enabled }))), text(t.modsRailHint, 'muted'),
      ]),
      field('search', t.searchMods, this.query, { change: true }),
      row(...[['all', t.filterAll], ['active', `${t.filterOn} ${active}`], ['inactive', `${t.filterOff} ${this.mods.length - active}`]].map(([id, label]) =>
        this.act(label, 'filter/' + id, async () => { this.filter = id; await this.filterPreference(); }, { selected: this.filter === id }))),
      row(
        this.choices(t.sortMods, 'sort', this.sort, [['name', t.sortName], ['recent', t.sortRecent], ['enabled', t.sortEnabled]], async id => { this.sort = id; await this.filterPreference(); }),
        this.choices('Runtime', 'runtime', this.runtime, [['all', t.filterAll], ['electron', 'Electron'], ['gpui', 'GPUI plugin'], ['zankyo', 'Zankyo']], id => { this.runtime = id; this.offset = 0; }),
        this.choices(t.cardLayout, 'layout', this.ui.cardLayout, [['list', t.layoutList], ['grid', t.layoutGrid]], id => this.preference({ cardLayout: id })),
      ),
      group('drop', [this.pick(t.dropHint, 'import')]),
      ...this.pagedCards(matches, mod => this.modCard(mod)),
    ];
  }
  pagedCards(items, render) {
    const slice = items.slice(this.offset, this.offset + 24);
    return [
      ...(!slice.length ? [section(this.t.marketEmptySearch, text(this.t.marketEmptySearchHint, 'muted'))] :
        chunk(slice, this.ui.cardLayout === 'grid' ? 2 : 1).map(rows => group('columns', rows.map(render)))),
      row(
        this.offset > 0 && this.act('←', 'previous', () => { this.offset = Math.max(0, this.offset - 24); }),
        text(`${Math.floor(this.offset / 24) + 1} / ${Math.max(1, Math.ceil(items.length / 24))}`, 'muted'),
        this.offset + 24 < items.length && this.act('→', 'next', () => { this.offset += 24; }),
      ),
    ];
  }
  marketCard(mod) {
    const t = this.t;
    const installed = this.mods.find(p => p.id === mod.id);
    return group('card', [
      group('identity', [node('avatar', mod.name, { image: image(mod.iconDataUrl) }), group('column', [node('heading', mod.nameZh && this.locale === 'zh' ? mod.nameZh : mod.name),
        text([mod.author, mod.version].filter(Boolean).join(' · '), 'muted')]), mod.channel === 'official' && node('badge', t.marketOfficial)]),
      text(this.locale === 'zh' && mod.descriptionZh ? mod.descriptionZh : mod.description, 'muted'),
      text((mod.tags || []).join(' · '), 'muted'),
      row(this.act(t.marketDetails, 'detail/' + mod.id, () => this.loadModal(async () => ({
        kind: 'detail', mod: await this.details(mod),
      }))), this.act(installed ? (mod.updateAvailable ? t.updateMarket : t.installedMarket) : t.installMarket, 'install/' + mod.id, async () => {
        await this.request('/api/market/install', 'POST', { id: mod.id, enable: true });
        await this.refresh(); await this.marketRefresh(); this.message(t.marketInstalledToast.replace('{name}', mod.name));
      }, { tone: 'primary', disabled: Boolean(installed && !mod.updateAvailable) })),
    ]);
  }
  marketPage() {
    const t = this.t;
    const matches = this.market.filter(mod =>
      (!this.query || [mod.name, mod.nameZh, mod.id, mod.description, mod.author, ...(mod.tags || [])].join(' ').toLowerCase().includes(this.query.toLowerCase())) &&
      !mod.unlisted && (!this.tag || (mod.tags || []).includes(this.tag)) &&
      (this.marketFilter === 'all' || (this.marketFilter === 'updates' ? mod.updateAvailable
        : Boolean(this.mods.find(p => p.id === mod.id)) === (this.marketFilter === 'installed'))));
    return [
      this.mast(t.marketKicker, t.marketTitle, t.marketHint, [
        this.user ? this.act(`${this.user.displayName || this.user.username || this.user.name} · ${t.marketLogout}`, 'logout', async () => {
          await this.request('/api/market/logout', 'POST'); this.user = null;
        }) : this.act(t.marketLogin, 'login', () => { this.modal = { kind: 'login' }; }, { tone: 'primary' }),
        this.user && this.pick(t.marketUpload, 'upload'),
        this.user && this.act(t.marketManage, 'manage', () => { this.modal = { kind: 'manage' }; }),
        this.act(t.refreshMarket, 'market-refresh', () => this.marketRefresh(true)),
      ]),
      this.recommended.length > 0 && section(t.marketRecommend, text(t.marketRecommendHint, 'muted'),
        group('columns', this.recommended.slice(this.recommendation, this.recommendation + 2).map(mod => this.marketCard(mod))),
        this.recommended.length > 2 && row(this.act('←', 'recommend-previous', () => {
          this.recommendation = Math.max(0, this.recommendation - 2);
        }), this.act('→', 'recommend-next', () => {
          this.recommendation = this.recommendation + 2 >= this.recommended.length ? 0 : this.recommendation + 2;
        }))),
      this.random.length > 0 && section(t.marketRandom,
        this.act(t.marketRandomOnce, 'market-shuffle', () => this.shuffle()),
        group('columns', this.random.map(mod => this.marketCard(mod)))),
      field('search', t.searchMarket, this.query, { change: true }),
      row(...[['all', t.filterAll], ['updates', t.filterUpdates], ['installed', t.filterInstalled], ['available', t.filterAvailable]].map(([id, label]) =>
        this.act(label, 'market-filter/' + id, () => { this.marketFilter = id; this.offset = 0; }, { selected: this.marketFilter === id }))),
      row(...['', ...new Set(this.market.flatMap(mod => mod.tags || []))].slice(0, 14).map(tag =>
        this.act(tag || t.marketAllTags, 'tag/' + tag, () => { this.tag = tag; this.offset = 0; }, { selected: this.tag === tag }))),
      ...this.pagedCards(matches, mod => this.marketCard(mod)),
    ];
  }
  modalBody() {
    const modal = this.modal;
    if (!modal) return null;
    const t = this.t;
    const close = this.act(t.close, 'modal-close', () => {
      if (this.modal?.kind === 'consent') return;
      this.modal = null; this.inputs = { search: this.query };
    });
    let body = [];
    if (modal.kind === 'consent') {
      body = [node('kicker', t.disclaimerKicker), node('heading', t.disclaimerTitle),
        text(t.disclaimerIntro), ...(t.disclaimerRules || []).map((rule, index) => text(`${index + 1}. ${rule}`)),
        text(t.disclaimerHint, 'muted'), field('consent', t.disclaimerPlaceholder, '', { change: true, submit: 'consent-submit' }),
        this.act(t.disclaimerConfirm, 'consent-submit', async () => {
          const consent = this.inputs.consent?.trim();
          if (consent !== modal.phrase) throw new Error(t.disclaimerMismatch);
          await this.request('/api/disclaimer', 'POST', { consent });
          this.modal = this.ui.steamLaunchReminder ? { kind: 'steam' } : null;
          delete this.inputs.consent;
        }, { tone: 'primary', disabled: this.inputs.consent?.trim() !== modal.phrase })];
    } else if (modal.kind === 'remove' || modal.kind === 'market-delete') {
      body = [node('heading', modal.kind === 'remove' ? t.confirmRemove : t.marketDeleteConfirm.replace('{name}', modal.mod.name)),
        text(modal.mod.name),
        modal.mod.channel === 'official' && text(t.marketOfficialDeleteConfirm.replace('{name}', modal.mod.name), 'error'),
        row(close, this.act(t.confirmRemove, 'confirm-delete', async () => {
          await this.request(modal.kind === 'remove' ? '/api/mod/' + encodeURIComponent(modal.mod.id) : '/api/market/delete',
            modal.kind === 'remove' ? 'DELETE' : 'POST', { id: modal.mod.id });
          if (this.modal === modal) this.modal = null;
          await this.refresh();
          if (this.page === 'market') await this.marketRefresh(true);
        }, { tone: 'error' }))];
    } else if (modal.kind === 'login') {
      body = [node('heading', t.marketLogin), text(t.marketLoginHint, 'muted'),
        field('login-id', t.marketLoginUser), field('login-password', t.marketLoginPass, '', { secret: true }),
        row(close, button(t.marketRegister, 'url/https://echo.shiinasuki.com/register'),
          this.act(t.marketLogin, 'login-submit', async () => {
            const result = await this.request('/api/market/login', 'POST', { identification: this.inputs['login-id'], password: this.inputs['login-password'] });
            delete this.inputs['login-password']; this.user = result.user;
            if (this.modal === modal) this.modal = null;
          }, { tone: 'primary' }))];
    } else if (modal.kind === 'config') {
      const properties = modal.schema?.properties;
      const entries = Object.entries(properties || {});
      body = [node('heading', modal.manifest?.name || modal.id), text(t.config, 'muted'),
        ...entries.map(([key, spec]) => {
          const value = modal.config[key] ?? spec.default;
          if (spec.type === 'boolean') return this.switch(spec.title || key, 'cfg/' + key, value, () => { modal.config[key] = !value; });
          if (Array.isArray(spec.enum)) return this.choices(spec.title || key, 'cfg/' + key, String(value), spec.enum.map(v => [String(v), String(v)]), id => { modal.config[key] = spec.enum.find(v => String(v) === id); });
          return field('cfg/' + key, spec.title || key, typeof value === 'object' ? JSON.stringify(value, null, 2) : value,
            { description: spec.description, multiline: ['object', 'array'].includes(spec.type) });
        }),
        !entries.length && field('config-json', 'JSON', JSON.stringify(modal.config, null, 2), { multiline: true }),
        row(close, this.act(t.save, 'config-save', async () => {
          let config = { ...modal.config };
          if (!entries.length) {
            config = JSON.parse(this.inputs['config-json'] || JSON.stringify(config));
            if (!config || Array.isArray(config) || typeof config !== 'object') throw new Error('Configuration must be a JSON object');
          }
          else for (const [key, spec] of entries) {
            if (spec.type === 'boolean' || spec.enum) continue;
            const value = this.inputs['cfg/' + key] ?? config[key];
            if (value === undefined) continue;
            config[key] = ['number', 'integer'].includes(spec.type) ? Number(value)
              : ['object', 'array'].includes(spec.type) ? JSON.parse(value) : value;
            if (typeof config[key] === 'number' && !Number.isFinite(config[key])) throw new Error('Invalid number: ' + key);
            if (spec.type === 'integer' && !Number.isInteger(config[key])) throw new Error('Expected integer: ' + key);
            if (spec.minimum !== undefined && config[key] < spec.minimum || spec.maximum !== undefined && config[key] > spec.maximum) throw new Error('Number out of range: ' + key);
            if (spec.type === 'array' && !Array.isArray(config[key])) throw new Error('Expected array: ' + key);
            if (spec.type === 'object' && (!config[key] || Array.isArray(config[key]) || typeof config[key] !== 'object')) throw new Error('Expected object: ' + key);
          }
          await this.request('/api/mod/' + encodeURIComponent(modal.id) + '/config', 'PUT', { config });
          if (this.modal === modal) this.modal = null;
          this.message(t.saved || 'Saved');
        }, { tone: 'primary' }))];
    } else if (modal.kind === 'detail') {
      const mod = modal.mod;
      body = [node('heading', mod.name), text([mod.author, mod.version].filter(Boolean).join(' · '), 'muted'),
        text(mod.descriptionZh && this.locale === 'zh' ? mod.descriptionZh : mod.description),
        text(this.locale === 'zh' ? mod.introZh || mod.intro || '' : mod.intro || ''),
        group('stats', [[mod.downloads, t.marketDownloads], [mod.views, t.marketViews], [mod.installs, t.marketInstalls]]
          .map(([value, label]) => node('stat', String(value || 0), { value: label }))),
        nativeMarkdown(mod.readme || t.marketNoReadme),
        row(close, mod.homepage && button(t.marketRepo || 'Homepage', 'url/' + mod.homepage),
          this.act(t.installMarket, 'detail-install', async () => {
            await this.request('/api/market/install', 'POST', { id: mod.id, enable: true }); await this.refresh();
            if (this.modal === modal) this.modal = null;
          }, { tone: 'primary' }),
          this.act(t.marketEditPage, 'edit-page', () => { this.modal = { kind: 'edit', mod }; }))];
    } else if (modal.kind === 'edit') {
      const mod = modal.mod;
      body = [node('heading', t.marketEditPage), field('intro', t.marketIntro, mod.intro || '', { multiline: true }),
        field('readme', 'README.md', mod.readme || '', { multiline: true }), field('edit-key', t.marketEditKey, '', { secret: true }),
        row(close, this.act(t.marketSavePage, 'page-save', async () => {
          await this.request('/api/market/page', 'POST', { id: mod.id, intro: this.inputs.intro, introZh: this.inputs.intro, readme: this.inputs.readme, editKey: this.inputs['edit-key'] });
          delete this.inputs['edit-key'];
          if (this.modal === modal) this.modal = null;
          this.message(t.marketPageSaved);
        }, { tone: 'primary' }))];
    } else if (modal.kind === 'manage') {
      const items = this.market.filter(mod => this.user?.isAdmin || (this.user && String(mod.authorId) === String(this.user.id)));
      body = [node('heading', t.marketManage), text(t.marketManageHint, 'muted'), ...items.map(mod => section(mod.name,
        row(this.act(t.marketEdit, 'manage-edit/' + mod.id, () => this.loadModal(async () => ({ kind: 'edit', mod: await this.details(mod) }))),
          this.act(mod.unlisted ? t.marketRelist : t.marketUnlist, 'unlist/' + mod.id, async () => {
            await this.request('/api/market/unlist', 'POST', { id: mod.id, unlisted: !mod.unlisted }); await this.marketRefresh(true);
          }), this.act(t.marketDelete, 'market-delete/' + mod.id, () => { this.modal = { kind: 'market-delete', mod }; }, { tone: 'error' })))),
        !items.length && text(t.marketNoManaged, 'muted'), close];
    } else if (modal.kind === 'steam') {
      const steam = `"${String(this.status.gameRoot || '').replaceAll('/', '\\')}\\ECHO.modded.exe" %command%`;
      body = [node('heading', t.steamLaunchTitle), text(t.steamLaunchBody, 'muted'), text(t.steamLaunchHint, 'muted'),
        node('code', steam), button(t.consoleCopy, 'copy/' + steam),
        row(this.act(t.steamLaunchDisableDefault, 'steam-disable', async () => {
          await this.preference({ steamLaunchReminder: false });
          if (this.modal === modal) this.modal = null;
        }), this.act(t.steamLaunchDismiss, 'modal-close', () => { this.modal = null; }, { tone: 'primary' }))];
    } else if (modal.kind === 'key') {
      body = [node('heading', t.marketKeyTitle), text(t.marketKeyBody, 'muted'), node('code', modal.value), row(close, button(t.consoleCopy, 'copy/' + modal.value))];
    }
    const consent = modal.kind === 'consent';
    return group('modal', [
      group('modal-head', [group('column', body.slice(0, consent ? 2 : 1)), !consent && close]),
      group('modal-content', body.slice(consent ? 2 : 1, -1)),
      group('modal-foot', [body.at(-1)]),
    ], { id: modal.kind });
  }
  async publish() {
    if (this.closed || !this.session.connected) return;
    if (this.notice && this.notice !== this.reportedNotice) ++this.noticeId;
    this.reportedNotice = this.notice;
    this.actions.clear();
    const body = this.pages.has(this.page) ? this.pages.get(this.page).body :
      this.page === 'mods' ? this.modsPage() : this.page === 'market' ? this.marketPage() : this.loader();
    const screen = {
      version: this.version, locale: this.locale, page: this.page, busy: this.busy, revision: ++this.revision,
      // Older matching hosts still implement the card; suppress it on the wire.
      preferences: { ...this.ui, startupSplash: false }, notice: this.notice, noticeId: this.noticeId, tone: this.tone,
      navigation: [
        { id: 'loader', label: this.t.loader, icon: 'loader' },
        { id: 'market', label: this.t.market, icon: 'market' },
        { id: 'mods', label: this.t.mods, icon: 'mods' },
        ...[...this.pages.values()].map(({ id, label }) => ({ id, label, icon: 'page' })),
      ],
      body: group('column', Array.isArray(body) ? body : [body]), modal: this.modalBody(),
    };
    await this.session.call('loader.ui', screen);
  }
}
