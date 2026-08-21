const dispose = echoExternalMod.sidebar.register({
  id: 'native',
  label: echoExternalMod.manifest.name || 'Native',
  icon: '⚙',
  order: 40,
  async render(root) {
    root.innerHTML = `
      <h2 style="margin:0 0 8px">Native host</h2>
      <p style="margin:0 0 12px;color:#94a3b8">This page talks to the in-process Shinawase native host.</p>
      <pre data-out style="white-space:pre-wrap;background:rgba(0,0,0,.35);padding:12px;border-radius:8px;min-height:8em"></pre>
      <button type="button" data-ping>Ping main</button>
      <button type="button" data-modules>List modules</button>
    `;
    const out = root.querySelector('[data-out]');
    const write = (value) => { out.textContent = JSON.stringify(value, null, 2); };
    root.querySelector('[data-ping]').onclick = async () => {
      write(await echoExternalMod.main.invoke('ping'));
    };
    root.querySelector('[data-modules]').onclick = async () => {
      write(await echoExternalMod.native.modules());
    };
    try { write(await echoExternalMod.native.status()); } catch (error) { write({ error: error.message }); }
  },
});

return () => dispose?.();
