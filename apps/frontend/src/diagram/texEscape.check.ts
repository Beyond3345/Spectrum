// Self-check for escapeTex. Run:
// npx esbuild apps/frontend/src/diagram/texEscape.check.ts --bundle --platform=node --log-level=warning | node
import { escapeTex } from './texEscape';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

eq(escapeTex('Percent passing (%) by mass'), 'Percent passing (\\%) by mass', 'a bare %');
eq(escapeTex('20%, 30%'), '20\\%, 30\\%', 'each one');
eq(escapeTex('$20\\%$'), '$20\\%$', 'one already escaped stays');
eq(escapeTex('a\\\\%b'), 'a\\\\\\%b', 'after a line break, still a comment: escaped');
eq(escapeTex('R&D #1 & 5%'), 'R&D #1 & 5\\%', '% alone by default');
eq(escapeTex('R&D #1 \\& 5%', '%&#'), 'R\\&D \\#1 \\& 5\\%', 'and & and # for plain text');
eq(escapeTex('no change'), 'no change', 'nothing to do');

console.log('texEscape.check: ok');
