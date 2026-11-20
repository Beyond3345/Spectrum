// Whether a newer Spectrum is out: a notice only, never a download. Asked of one fixed address, the release page's
// "latest" link, which answers with a redirect to the newest release's tag; nothing about the user, the computer or a
// project goes with it, and the answer is kept for a day, so the address is asked at most once a day however often
// the projects page opens or Spectrum starts. Only asked when the projects page asks, which it does only while
// Settings › System › "Tell me when a newer Spectrum is out" is on.
import path from 'path';
import { APP_VERSION, DATA_DIR } from '../config/constants.js';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';

export const RELEASES = 'https://github.com/Beyond3345/Spectrum/releases';
// the tests' local server stands in for it
const LATEST = process.env.SPECTRUM_UPDATE_URL || `${RELEASES}/latest`;
const FILE = path.join(DATA_DIR, 'update-check.json');
const DAY = 24 * 60 * 60 * 1000;

const parts = (version) => String(version).split('.').map((n) => Number.parseInt(n, 10) || 0);
/** a is a later x.y.z than b. */
export function newer(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

/** The newest release's version from the redirect's target (…/releases/tag/v2.7.0), or ''. */
const tagged = (location) => location?.match(/\/releases\/tag\/v?(\d+\.\d+\.\d+)\/?$/)?.[1] ?? '';

let asking = null;
// the last answer, for a data folder that can't be written
let last = null;
/**
 * { available, version?, url? }: the newest release when it is later than this one, with its page. The address is
 * asked only when the last answer (or failure: offline counts as the day's ask) is a day old or from the future.
 */
export async function updateNotice(now = Date.now()) {
  let saved = (await readJson(FILE).catch(() => null)) ?? last;
  const fresh = Number.isFinite(saved?.checkedAt) && saved.checkedAt <= now && now - saved.checkedAt < DAY;
  if (!fresh) {
    asking ??= (async () => {
      let version = '';
      try {
        // HEAD, no cookies, no credentials, and the redirect not followed: its Location names the release
        const res = await fetch(LATEST, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
        version = tagged(res.headers.get('location'));
      } catch {
        // offline: asked again tomorrow
      }
      const next = (last = { checkedAt: now, version });
      await writeJsonAtomic(FILE, next).catch(() => {});
      return next;
    })().finally(() => (asking = null));
    saved = await asking;
  }
  const version = typeof saved?.version === 'string' ? saved.version : '';
  return version && newer(version, APP_VERSION) ? { available: true, version, url: `${RELEASES}/tag/v${version}` } : { available: false };
}
