import { Worker } from 'worker_threads';

/**
 * A worker thread started on first use that answers { id, ...request } with { id, result | error },
 * after posting { ready: true } once it has loaded. If it fails to start or dies, every waiting call
 * fails with `unavailable` and the next call tries again.
 */
export function workerClient(url, workerData, { unavailable, timeoutMs = 30_000 }) {
  let worker = null;
  let ready = null;
  let failure = '';
  let seq = 0;
  const pending = new Map();

  const stop = (reason) => {
    failure = reason;
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error(reason));
    }
    pending.clear();
    worker = null;
    ready = null;
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
        const call = pending.get(msg.id);
        if (!call) return;
        pending.delete(msg.id);
        clearTimeout(call.timer);
        if (msg.error) call.reject(new Error(msg.error));
        else call.resolve(msg.result);
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
    async call(request) {
      await start();
      return new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${unavailable}: it took too long to answer.`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        worker.postMessage({ id, ...request });
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
