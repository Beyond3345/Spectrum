import crypto from 'node:crypto';

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

/** The cookie a window of the desktop app presents on every request: this launch's secret. */
export const SESSION_COOKIE = 'spectrum_session';

/**
 * This launch's secret, or '' when there is none and the API is open to this computer as before (npm run dev,
 * npm start, the tests). The desktop shell writes it as the first line of our stdin (SPECTRUM_SESSION_STDIN=1), never
 * in the environment, which a process of the same user can read even from inside an agent's isolation; a server
 * started by hand may name one in SPECTRUM_SESSION_SECRET, which is taken out of the environment at once so that no
 * compiler, agent or other child inherits it. A shell that promised a secret and sent none stops the server.
 */
export async function readSessionSecret(env = process.env, stdin = process.stdin) {
  let secret = env.SPECTRUM_SESSION_SECRET || '';
  delete env.SPECTRUM_SESSION_SECRET;
  if (env.SPECTRUM_SESSION_STDIN !== '1') return secret;
  secret = await new Promise((resolve) => {
    let text = '';
    const done = () => {
      stdin.off('data', read);
      stdin.off('end', done);
      stdin.pause();
      resolve(text.split('\n')[0].trim());
    };
    const read = (chunk) => {
      text += chunk;
      if (text.includes('\n')) done();
    };
    stdin.on('data', read);
    stdin.on('end', done);
  });
  if (secret.length < 32) throw new Error('The desktop shell sent no session secret.');
  return secret;
}

const digest = (value) => crypto.createHash('sha256').update(String(value ?? '')).digest();
/** Whether two secrets are the same, in a time that says nothing about where they differ. */
export const sameSecret = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

/** Whether the request carries this launch's secret in its session cookie. */
export function hasSession(req, secret) {
  const cookies = String(req.headers?.cookie || '').split(';').map((part) => part.trim());
  const mine = cookies.find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return !!mine && sameSecret(mine.slice(SESSION_COOKIE.length + 1), secret);
}

/** A window's first request: the secret in `t` becomes its cookie, and the window goes on to the page in `next`. */
export function openSession(req, reply, secret) {
  const { t, next } = req.query || {};
  if (sameSecret(t, secret)) reply.header('Set-Cookie', `${SESSION_COOKIE}=${secret}; Path=/; HttpOnly; SameSite=Strict`);
  // only ever a page of the app; without the cookie the page says what is wrong (main.tsx)
  const base = 'http://app.invalid';
  const page = typeof next === 'string' && next.startsWith('/') && URL.canParse(next, base) ? new URL(next, base) : null;
  return reply.redirect(page?.origin === base ? page.pathname + page.search : '/projects');
}
