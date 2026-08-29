// Dev-only: list all CDP targets and probe mod state in each page.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
for (const t of list) {
  console.log(`- [${t.type}] ${t.title?.slice(0, 40) ?? ''} :: ${t.url}`);
}
const pages = list.filter((t) => t.type === 'page');
for (const t of pages) {
  try {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
    const result = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('timeout')), 8000);
      ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id === 1) { clearTimeout(timer); res(m.result); } });
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `({ href: location.href.slice(-60), ready: document.readyState, mod: !!window.__echoMvModActive, mods: Object.keys(window.__echoExternalMods || {}), btn: !!document.querySelector('.transport-mv-button') })`, returnByValue: true } }));
    });
    console.log('  probe:', JSON.stringify(result?.result?.value));
    ws.close();
  } catch (error) {
    console.log('  probe failed:', String(error?.message || error));
  }
}
process.exit(0);
