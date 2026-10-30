import http from 'node:http';
import https from 'node:https';

/**
 * GETs url with Node's own http(s), following redirects, and answers the response stream for the caller to check and
 * read. Large downloads use this rather than fetch: Node 24's fetch can crash the whole process (undici's
 * `assert(!this.paused)`) when a server closes the connection while a slow reader has paused the body, which
 * SourceForge's mirrors do. signal stops the request at any point, the body included.
 */
export function get(url, { signal, headers } = {}, redirects = 5) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const target = new URL(url);
    const req = (target.protocol === 'http:' ? http : https).get(target, { headers }, (res) => {
      const { statusCode = 0, headers: { location } } = res;
      if (statusCode >= 300 && statusCode < 400 && location) {
        res.resume();
        signal?.removeEventListener('abort', abort);
        if (redirects <= 0) return reject(new Error('Too many redirects'));
        return resolve(get(new URL(location, target).href, { signal, headers }, redirects - 1));
      }
      res.on('close', () => signal?.removeEventListener('abort', abort));
      resolve(res);
    });
    const abort = () => req.destroy(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    req.on('error', reject);
  });
}

/** True for a 2xx status. */
export const ok = (res) => res.statusCode >= 200 && res.statusCode < 300;
