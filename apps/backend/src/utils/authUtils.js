const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLocalAddress(ip) {
  return !!ip && LOOPBACK.has(String(ip).trim());
}

function isLoopbackHostname(value) {
  if (!value) return false;
  const host = String(value).toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || LOOPBACK.has(host);
}

function originHostname(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return '';
  }
}

/**
 * A request is local only if it came over loopback, was not forwarded by a proxy
 * from somewhere else, targets a loopback Host (blocks DNS rebinding) and,
 * when a browser sends an Origin, that origin is the app's own: loopback (blocks other websites)
 * and the address the request was sent to (blocks a page of another program on this computer, a
 * dev server or a notebook on another port). The Vite dev proxy sends its own name on as
 * X-Forwarded-Host, a header a page elsewhere can only add after a preflight, which is refused.
 */
export function isLocalRequest(req) {
  const headers = req.headers || {};
  if (!isLocalAddress(req.socket?.remoteAddress ?? req.ip)) return false;
  const forwarded = headers['x-forwarded-for'];
  if (forwarded && !String(forwarded).split(',').every((part) => isLocalAddress(part))) return false;
  if (headers['cf-connecting-ip'] || headers['forwarded']) return false;
  if (headers.host && !isLoopbackHostname(headers.host)) return false;
  const origin = headers.origin;
  // "null" comes from sandboxed iframes, data: URLs and file:// pages, i.e. anyone
  if (origin && !isLoopbackHostname(originHostname(origin))) return false;
  const own = [headers.host, headers['x-forwarded-host']].filter(Boolean).map((host) => String(host).toLowerCase());
  if (origin && own.length && !own.includes(originHostname(origin).toLowerCase())) return false;
  return true;
}
