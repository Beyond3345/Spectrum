import type { Transport } from '@codemirror/lsp-client';

/**
 * The editor's end of one connection to the project's TexLab (the backend's lsp route): what TexLab says comes in
 * through receive, from the event stream, and what the editor says goes up through post, in order. The messages sent
 * in one go (a sync and the request after it) share a POST, and each POST waits for the one before, as two in flight
 * could land the wrong way round. Once closed, sending throws, so the requests of a connection that's gone fail at once.
 */
export function lspTransport(post: (body: string) => Promise<unknown>) {
  const handlers = new Set<(message: string) => void>();
  let batch: string[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  let closed = false;
  const flush = () => {
    const body = `[${batch.join(',')}]`;
    batch = [];
    // a refused POST loses its messages (their requests time out); the ones after it still go
    chain = chain.then(() => post(body)).catch(() => undefined);
  };
  const transport: Transport = {
    send(message) {
      if (closed) throw new Error('TexLab isn’t connected.');
      batch.push(message);
      if (batch.length === 1) queueMicrotask(flush);
    },
    subscribe: (handler) => handlers.add(handler),
    unsubscribe: (handler) => handlers.delete(handler)
  };
  return {
    transport,
    receive(message: string) {
      if (!closed) for (const handler of handlers) handler(message);
    },
    /** Once everything sent so far has reached the backend. */
    async settled() {
      // a few microtask turns, so what the client sends from its own promise callbacks (one turn on) has joined a
      // batch; not a timer, which a background window holds back
      for (let turn = 0; turn < 3; turn += 1) await Promise.resolve();
      await chain;
    },
    close() {
      closed = true;
    }
  };
}
