/** External capabilities execute in the Loader; GPUI only routes requests. */
export class ZankyoProviders {
  constructor(call) {
    this.call = call;
    this.handlers = new Map();
    this.controllers = new Set();
    this.closed = false;
    this.tail = Promise.resolve();
  }
  register(kind, id, descriptor, handler) {
    if (this.closed) throw new Error('mod_disposed');
    if (!['sources', 'lyrics', 'mv'].includes(kind) || !/^[a-z0-9._-]{1,128}$/iu.test(id) ||
        !descriptor?.title?.trim() || !handler || typeof handler !== 'object') throw new Error('invalid_provider');
    const key = `${kind}/${id}`;
    if (this.handlers.has(key) || this.handlers.size >= 64) throw new Error('duplicate_or_excess_provider');
    this.handlers.set(key, { kind, id, descriptor, handler });
    this.tail = this.tail.then(() => this.publish());
    return this.tail;
  }
  publish() {
    if (this.closed) throw new Error('mod_disposed');
    const contributions = { sources: [], lyrics: [], mv: [] };
    for (const { kind, id, descriptor, handler } of this.handlers.values()) {
      contributions[kind].push({ ...descriptor, id, browse: typeof handler.browse === 'function', session: kind === 'mv' });
    }
    return this.call('providers.register', { contributions });
  }
  async dispatch(request) {
    if (this.closed) throw new Error('mod_disposed');
    if (this.controllers.size >= 32) throw new Error('provider_request_limit');
    const { method, input } = request;
    const kind = method === 'provider.mv' ? 'mv' : method === 'lyrics.lookup' ? 'lyrics' : 'sources';
    const id = input.providerId ?? input.id;
    const record = this.handlers.get(`${kind}/${id}`);
    const operation = kind === 'mv' ? input.operation : kind === 'lyrics' ? 'lookup' : method.split('.').at(-1);
    const handler = record?.handler[operation];
    if (typeof handler !== 'function') throw new Error(`provider_operation_unavailable: ${kind}/${id}/${operation}`);
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]);
    this.controllers.add(controller);
    let abort;
    try {
      const args = kind === 'mv' ? input.args : input;
      return await Promise.race([
        Promise.resolve().then(() => { signal.throwIfAborted(); return handler({ ...args, signal }); }),
        new Promise((_, reject) => {
          abort = () => reject(signal.reason);
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        }),
      ]);
    } finally { signal.removeEventListener('abort', abort); this.controllers.delete(controller); }
  }
  close() {
    this.closed = true;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.handlers.clear();
  }
}
