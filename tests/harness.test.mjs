// Harness lifecycle semantics: loader-wrapper parity, signature dedupe,
// dispose ordering, leak audit, virtual clock, extend auto-dispose,
// sidebar pages, settings, and loaderSettings change events.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, smokeRun } from '../ShinawaseLoader/testing/harness.mjs';

const inline = (source, extra = {}) => createHarness({
  manifest: { id: 'shinawase.testing.inline', name: 'Inline', version: '0.0.1' },
  source,
  ...extra,
});

test('inject/already/re-inject signature semantics mirror the loader', async () => {
  const harness = inline('return () => {};');
  assert.equal((await harness.inject()).status, 'injected');
  assert.equal((await harness.inject()).status, 'already');
  harness.dispose();
  assert.equal((await harness.inject()).status, 'injected');
  harness.dispose();
});

test('entry gets echoExternalMod with config; top-level return/await work', async () => {
  const harness = inline(`
    const value = await Promise.resolve(echoExternalMod.config.answer);
    echoExternalMod.toast('value=' + value);
    if (echoExternalMod.id !== 'shinawase.testing.inline') throw new Error('wrong id');
    return () => {};
  `, { config: { answer: 42 } });
  await harness.inject();
  assert.deepEqual(harness.toasts, ['value=42']);
  harness.dispose();
  harness.expectClean();
});

test('clean entry passes the leak audit; leaky entry reports each kind', async () => {
  const clean = inline(`
    const node = document.createElement('div');
    node.id = 'probe';
    document.body.append(node);
    const off = () => {};
    window.addEventListener('resize', off);
    const timer = setInterval(() => {}, 1000);
    return () => { node.remove(); window.removeEventListener('resize', off); clearInterval(timer); };
  `);
  await clean.inject();
  clean.dispose();
  clean.expectClean();

  const leaky = inline(`
    document.body.append(document.createElement('div'));
    window.addEventListener('resize', () => {});
    setInterval(() => {}, 1000);
    new MutationObserver(() => {}).observe(document.body, { childList: true });
    return () => {};
  `);
  await leaky.inject();
  leaky.dispose();
  const report = leaky.checkClean();
  assert.equal(report.clean, false);
  const kinds = new Set(report.leaks.map((leak) => leak.kind));
  assert.deepEqual([...kinds].sort(), ['dom', 'interval', 'listener', 'observer']);
  assert.throws(() => leaky.expectClean(), /resource/u);
});

test('entry without a cleanup function leaves its DOM behind (detected)', async () => {
  const harness = inline("document.body.append(document.createElement('aside'));");
  await harness.inject();
  harness.dispose();
  assert.equal(harness.checkClean().clean, false);
});

test('virtual clock drives entry timers deterministically', async () => {
  const harness = inline(`
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; echoExternalMod.log('tick', ticks); }, 100);
    return () => clearInterval(timer);
  `);
  await harness.inject();
  await harness.flushTimers({ maxMs: 350 });
  const ticks = harness.consoleRecords.filter((record) => record.values[0] === 'tick');
  assert.equal(ticks.length, 3);
  harness.dispose();
  harness.expectClean();
});

test('extend css/hook/on are functional and auto-disposed like the loader', async () => {
  const harness = inline(`
    echoExternalMod.extend.css('theme', '.x { color: red; }');
    echoExternalMod.extend.on('custom:event', () => echoExternalMod.toast('heard'));
    echoExternalMod.extend.hook('playback.getStatus', async (original) => {
      const status = await original();
      return { ...status, hooked: true };
    });
    return () => {};
  `);
  await harness.inject();
  assert.ok(harness.query('style[data-echo-external-extend="shinawase.testing.inline:theme"]'), 'css style mounted');
  harness.window.dispatchEvent(new harness.window.CustomEvent('custom:event', { bubbles: false }));
  assert.deepEqual(harness.toasts, ['heard']);
  const hooked = await harness.controls.rawEcho.playback.getStatus();
  assert.equal(hooked.hooked, true);
  harness.dispose();
  harness.expectClean();
  const restored = await harness.controls.rawEcho.playback.getStatus();
  assert.equal(restored.hooked, undefined, 'hook must be restored on dispose');
  assert.equal(harness.query('style[data-echo-external-extend="shinawase.testing.inline:theme"]'), null);
});

test('extend.navigate + replaceRoute mount and restore route surfaces', async () => {
  const harness = inline(`
    echoExternalMod.extend.replaceRoute('community', {
      render(root) {
        root.innerHTML = '<h1>Replaced</h1>';
        return () => { root.dataset.cleaned = 'yes'; };
      },
    });
    echoExternalMod.extend.navigate('community');
    return () => {};
  `);
  await harness.inject();
  assert.equal(harness.context.extend.currentRoute(), 'community');
  const page = harness.query('[data-echo-external-replace="community"]');
  assert.ok(page && !page.hidden, 'replacement page visible on its route');
  assert.equal(page.querySelector('h1').textContent, 'Replaced');
  harness.dispose();
  assert.equal(harness.query('[data-echo-external-replace="community"]'), null);
  harness.expectClean();
});

// Regression: the loader unhooks an existing hook at the same path before
// installing a new one; the mock used to overwrite the map entry, so reverse
// -order disposal left the first wrapper installed.
test('re-hooking the same path replaces the previous wrapper (loader parity)', async () => {
  const harness = inline(`
    echoExternalMod.extend.hook('playback.getStatus', async (original) => ({ ...(await original()), first: true }));
    echoExternalMod.extend.hook('playback.getStatus', async (original) => ({ ...(await original()), second: true }));
    return () => {};
  `);
  await harness.inject();
  const hooked = await harness.controls.rawEcho.playback.getStatus();
  assert.equal(hooked.second, true);
  assert.equal(hooked.first, undefined, 'second hook replaces the first instead of stacking on it');
  harness.dispose();
  harness.expectClean();
  const restored = await harness.controls.rawEcho.playback.getStatus();
  assert.equal(restored.first, undefined, 'no wrapper left after dispose');
  assert.equal(restored.second, undefined, 'no wrapper left after dispose');
});

// Regression: the loader restores an existing replacement before installing a
// new one for the same route; the mock used to leak the first page element.
test('replacing the same route twice keeps a single replacement page', async () => {
  const harness = inline(`
    echoExternalMod.extend.replaceRoute('community', { render(root) { root.innerHTML = '<h1>One</h1>'; return () => {}; } });
    echoExternalMod.extend.replaceRoute('community', { render(root) { root.innerHTML = '<h1>Two</h1>'; } });
    echoExternalMod.extend.navigate('community');
    return () => {};
  `);
  await harness.inject();
  const pages = harness.window.document.querySelectorAll('[data-echo-external-replace="community"]');
  assert.equal(pages.length, 1, 'only the latest replacement page exists');
  assert.equal(pages[0].querySelector('h1').textContent, 'Two');
  harness.dispose();
  assert.equal(harness.query('[data-echo-external-replace="community"]'), null);
  harness.expectClean();
});

test('sidebar register + openSidebarPage render/cleanup', async () => {
  const harness = inline(`
    const dispose = echoExternalMod.sidebar.register({
      id: 'main', label: 'Page', order: 10,
      render(root, context) {
        root.innerHTML = '<button type="button">hi</button>';
        root.querySelector('button').onclick = () => context.toast('clicked');
        return () => { root.dataset.done = '1'; };
      },
    });
    return () => dispose();
  `);
  await harness.inject();
  const page = harness.openSidebarPage('main');
  page.root.querySelector('button').click();
  assert.deepEqual(harness.toasts, ['clicked']);
  page.close();
  harness.dispose();
  harness.expectClean();
});

test('settings persist per package; loaderSettings.onChange fires and auto-disposes', async () => {
  const harness = inline(`
    echoExternalMod.settings.set({ seen: true });
    echoExternalMod.loaderSettings.onChange((next) => echoExternalMod.toast('accent:' + next.accentColor));
    return () => {};
  `);
  await harness.inject();
  assert.equal(JSON.parse(harness.window.localStorage.getItem('echo.external-mod.shinawase.testing.inline')).seen, true);
  await harness.controls.emitUiSettings({ accentColor: '#123456' });
  assert.deepEqual(harness.toasts, ['accent:#123456']);
  harness.dispose();
  harness.expectClean();
  await harness.controls.emitUiSettings({ accentColor: '#654321' });
  assert.equal(harness.toasts.length, 1, 'listener must be gone after dispose');
});

test('css entryType wraps into a style element with automatic cleanup', async () => {
  const harness = createHarness({
    manifest: { id: 'shinawase.testing.css', name: 'CSS', entry: 'style.css', entryType: 'css' },
    entryName: 'style.css',
    source: '.player-bar { opacity: 0.5; }',
  });
  await harness.inject();
  const style = harness.query('style[data-echo-external-mod="shinawase.testing.css"]');
  assert.ok(style);
  assert.ok(style.textContent.includes('player-bar'));
  harness.dispose();
  harness.expectClean();
});

test('offline fetch is blocked by default and scriptable via fetchHandler', async () => {
  const blocked = inline(`
    try { await echoExternalMod.fetchJson('https://example.com/api'); return () => {}; }
    catch (error) { echoExternalMod.toast('blocked:' + /harness_offline/.test(String(error.message))); return () => {}; }
  `);
  await blocked.inject();
  assert.deepEqual(blocked.toasts, ['blocked:true']);
  blocked.dispose();

  const scripted = inline(`
    const value = await echoExternalMod.fetchJson('https://example.com/api');
    echoExternalMod.toast('got:' + value.answer);
    return () => {};
  `, { fetchHandler: async () => ({ answer: 7 }) });
  await scripted.inject();
  assert.deepEqual(scripted.toasts, ['got:7']);
  scripted.dispose();
});

test('native/main default to native_host_unavailable and are scriptable', async () => {
  const harness = inline(`
    const status = await echoExternalMod.native.status();
    let mainError = '';
    try { await echoExternalMod.main.invoke('ping'); } catch (error) { mainError = String(error.message); }
    const pong = await echoExternalMod.main.invoke('pong');
    echoExternalMod.toast([status.error, mainError, pong].join('|'));
    return () => {};
  `, { mainHandlers: { pong: () => 'ok' } });
  await harness.inject();
  assert.deepEqual(harness.toasts, ['native_host_unavailable|native_host_unavailable|ok']);
  harness.dispose();
});

test('records capture sdk/echo/player calls with paths', async () => {
  const harness = inline(`
    echoExternalMod.sdk.list('playback');
    await echoExternalMod.sdk.call('playback.getStatus');
    await echoExternalMod.player.play();
    return () => {};
  `);
  await harness.inject();
  const apis = harness.records.map((record) => `${record.api}:${record.method}`);
  assert.ok(apis.includes('sdk:list'));
  assert.ok(apis.includes('sdk:call'));
  assert.ok(apis.includes('echo:playback.getStatus'));
  assert.ok(apis.includes('player:play'));
  harness.dispose();
});

test('smokeRun downgrades guarded one-shot timeouts unless strictTimers', async () => {
  const options = {
    manifest: { id: 'shinawase.testing.timers', name: 'Timers' },
    source: `
      let disposed = false;
      setTimeout(() => { if (!disposed) { /* guarded */ } }, 60000);
      return () => { disposed = true; };
    `,
    settleMs: 0,
  };
  const soft = await smokeRun(options);
  assert.equal(soft.ok, true);
  assert.equal(soft.timerWarnings.length, 1);
  const strict = await smokeRun({ ...options, strictTimers: true });
  assert.equal(strict.ok, false);
});
