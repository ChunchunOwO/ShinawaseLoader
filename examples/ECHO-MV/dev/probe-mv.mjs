// Dev-only: verify ECHO-MV mod inside a running ECHO (loader CDP on 9229).
// Usage: node examples/ECHO-MV/dev/probe-mv.mjs [step]
//   step = api | button | panel | search | screenshot | all (default: all)

const CDP_PORT = 9229;

const attach = async () => {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
  if (!target) throw new Error('ECHO main page target not found on CDP 9229');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  const state = { id: 0, pending: new Map() };
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  });
  const call = (method, params = {}) => new Promise((res, rej) => {
    const id = ++state.id; state.pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error(`timeout: ${method}`)); } }, 30000);
  });
  await call('Runtime.enable');
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception?.description || 'evaluation error').slice(0, 1200) };
    return { value: r.result?.value };
  };
  return { ws, call, evaluate };
};

const step = process.argv[2] || 'all';
const page = await attach();
const out = (label, data) => console.log(`\n=== ${label} ===\n${typeof data === 'string' ? data : JSON.stringify(data, null, 1)}`);

if (step === 'api' || step === 'all') {
  const api = await page.evaluate(`(() => {
    const mv = window.echo?.mv;
    return {
      echoMvType: mv === null ? 'null' : typeof mv,
      methods: mv ? Object.keys(mv).filter((k) => typeof mv[k] === 'function') : [],
      bridgeMv: typeof window.__echoShinawaseStreaming?.mv,
      proxied: window.__echoShinawaseEchoPatched === true,
    };
  })()`);
  out('window.echo.mv', api.value ?? api.error);

  const settings = await page.evaluate(`window.echo?.mv?.getSettings?.().catch((e) => ({ __error: String(e && e.message || e) }))`);
  out('mv.getSettings()', settings.value ?? settings.error);
}

if (step === 'button' || step === 'all') {
  const button = await page.evaluate(`(() => {
    const btn = document.querySelector('.transport-mv-button');
    const lyricsBtn = document.querySelector('.transport-lyrics-button');
    return {
      exists: !!btn,
      className: btn ? String(btn.className) : null,
      title: btn?.getAttribute('title') || null,
      ariaLabel: btn?.getAttribute('aria-label') || null,
      hasSvg: !!btn?.querySelector('svg'),
      siblingOfLyrics: !!(btn && lyricsBtn && btn.parentElement === lyricsBtn.parentElement),
    };
  })()`);
  out('MV entry button', button.value ?? button.error);
}

if (step === 'panel' || step === 'all') {
  const panel = await page.evaluate(`(() => {
    const section = document.querySelector('.lyrics-mv-panel');
    if (!section) return { exists: false, note: 'lyrics page not open?' };
    return {
      exists: true,
      mvEnabled: section.getAttribute('data-mv-enabled'),
      viewMode: section.getAttribute('data-view-mode'),
      childClasses: [...section.children].map((c) => String(c.className).split(' ').slice(0, 3).join(' ')),
      hasVideo: !!section.querySelector('video'),
      drawer: !!document.querySelector('.mv-settings-drawer'),
    };
  })()`);
  out('MV panel', panel.value ?? panel.error);
}

if (step === 'search' || step === 'all') {
  const search = await page.evaluate(`(async () => {
    const mv = window.echo?.mv;
    if (!mv) return { error: 'mv api missing' };
    try {
      const candidates = await mv.searchNetworkCandidatesForSnapshot({
        trackId: 'probe-test-track',
        title: 'アイドル',
        artist: 'YOASOBI',
        durationSeconds: 214,
        mediaType: 'streaming',
        autoSelect: false,
      });
      return {
        count: candidates.length,
        top: candidates.slice(0, 3).map((c) => ({ provider: c.provider, title: (c.title || '').slice(0, 50), score: c.score, playable: c.playableInApp })),
      };
    } catch (e) { return { error: String(e && e.message || e) }; }
  })()`);
  out('network search (YOASOBI アイドル)', search.value ?? search.error);
}

if (step === 'screenshot' || step === 'all') {
  const shot = await page.call('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  const file = new URL(`./probe-mv-${Date.now()}.png`, import.meta.url);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  out('screenshot', file.pathname);
}

try { page.ws.close(); } catch {}
process.exit(0);
