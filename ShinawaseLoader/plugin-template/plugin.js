const manifest = echoExternalMod.manifest || {};
const config = echoExternalMod.config || {};

const disposePage = echoExternalMod.sidebar.register({
  id: 'main',
  label: manifest.name || 'External Plugin',
  order: 60,
  render(root, context) {
    root.innerHTML = '<h2 style="margin:0 0 8px">' + (manifest.name || 'External Plugin') + '</h2><p style="margin:0">' + (config.message || 'Plugin active') + '</p>';
    context.echo?.playback?.getStatus?.().catch?.(() => undefined);
  },
});

return () => disposePage?.();
