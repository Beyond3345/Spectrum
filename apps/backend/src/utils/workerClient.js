import { Worker } from 'worker_threads';

/**
 * A worker thread started on first use that answers { id, ...request } with { id, result | error },
 * after posting { ready: true } once it has loaded. If it fails to start or dies, every waiting call
 * fails with `unavailable` and the next call tries again. Requests go to it one at a time: a call's
 * timeout counts from when the worker starts on it (and replaces a worker that runs over), and a call
 * whose signal aborts while it waits is dropped.
 */
export function workerClient(url, workerData, { unavailable, timeoutMs = 30_000 }) {
  let worker = null;
  let ready = null;
  let failure = '';
  let seq = 0;
  const queue = [];
  // the call the worker is on
  let current = null;

  const stop = (reason) => {
    failure = reason;
    for (const call of [current, ...queue]) {
      if (!call) continue;
      clearTimeout(call.timer);
      call.reject(new Error(reason));
    }
    current = null;
    queue.length = 0;
    worker = null;
    ready = null;
  };

  const next = () => {
    if (current || !worker || !queue.length) return;
    current = queue.shift();
    const { id, request, reject } = current;
    current.timer = setTimeout(() => {
      // a worker stuck on one call is replaced, so the calls waiting behind it still run
      const w = worker;
      worker = null;
      ready = null;
      current = null;
      reject(new Error(`${unavailable}: it took too long to answer.`));
      void w.terminate();
      if (queue.length) start().then(next, () => undefined);
    }, timeoutMs);
    worker.postMessage({ id, ...request });
  };

  const start = () => {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      let w;
      try {
        w = new Worker(url, { workerData });
      } catch (err) {
        stop(`${unavailable}: ${err.message}`);
        return reject(new Error(failure));
      }
      worker = w;
      w.on('message', (msg) => {
        if (msg.ready) {
          failure = '';
          return resolve();
        }
        const call = current;
        if (call?.id !== msg.id) return;
        current = null;
        clearTimeout(call.timer);
        if (msg.error) call.reject(new Error(msg.error));
        else call.resolve(msg.result);
        next();
      });
      w.on('error', (err) => {
        stop(`${unavailable}: ${err.message}`);
        reject(new Error(failure));
      });
      w.on('exit', (code) => {
        if (worker === w) stop(`${unavailable} (it stopped with code ${code}).`);
      });
      // never keeps the backend from quitting
      w.unref();
    });
    // a failed start is reported by the caller; this keeps it from also counting as unhandled
    ready.catch(() => undefined);
    return ready;
  };

  return {
    async call(request, signal) {
      signal?.throwIfAborted();
      await start();
      signal?.throwIfAborted();
      return new Promise((resolve, reject) => {
        const call = { id: ++seq, request, resolve, reject, timer: null };
        signal?.addEventListener('abort', () => {
          const at = queue.indexOf(call);
          if (at < 0) return;
          queue.splice(at, 1);
          reject(signal.reason);
        }, { once: true });
        queue.push(call);
        next();
      });
    },
    /** Whether it has been started (and not stopped since), without starting it. */
    running: () => worker !== null,
    async status() {
      try {
        await start();
        return { available: true };
      } catch {
        return { available: false, error: failure };
      }
    },
    terminate() {
      const w = worker;
      stop(`${unavailable} (stopped).`);
      return w?.terminate();
    }
  };
}
