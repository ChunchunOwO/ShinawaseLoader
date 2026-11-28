/** Native page lifecycle shared by external Mods. */
export function createPage(ui, { id = 'main', label, render, action }) {
  let closed = false, pending = Promise.resolve(), error = '', previous = '', remove;
  const refresh = () => {
    if (closed) return;
    const body = { kind: 'column', children: [
      ...(error ? [{ kind: 'text', text: error, tone: 'error' }] : []),
      render(),
    ] };
    const next = JSON.stringify(body);
    if (next !== previous) { remove = ui.page(id, { label, body }); previous = next; }
  };
  const stop = ui.onAction((name, fields = {}) => {
    pending = pending.catch(() => {}).then(async () => {
      if (closed) return;
      error = '';
      try { await action(name, fields); }
      catch (failure) { error = String(failure.message || failure).slice(0, 2048); }
      refresh();
    });
    return pending;
  });
  refresh();
  return {
    refresh,
    error(message) { error = String(message); refresh(); },
    close() { closed = true; stop(); remove?.(); },
  };
}
