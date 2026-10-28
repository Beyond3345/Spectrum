// Self-check for the pieces spelling sends. Run (it imports CodeMirror, so bundle it first):
// npx esbuild apps/frontend/src/editor/spellcheck.check.ts --bundle --platform=node --log-level=warning | node
import { maskLatex } from '../../../backend/src/latex/mask.js';
import { languageMarkup, prosePieces } from '../../../backend/src/language/markup.js';
import { piecesNear } from './spellcheck';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// paragraphs, cut again where markup gives a language
const tex = 'The colour.\n\n研究結果顯示。\n\nSee \\foreignlanguage{french}{la couleur} here.';
const prose = maskLatex(tex);
const pieces = prosePieces(prose, languageMarkup(tex, 'latex').ranges);
eq(pieces.map((p) => [prose.slice(p.from, p.to).trim(), p.lang ?? '']), [['The colour.', ''], ['研究結果顯示。', ''], ['See', ''], ['la couleur', 'fr'], ['here.', '']], 'pieces');

// the pieces near the view, and up to 20 before them so an undecided one can inherit
const many = Array.from({ length: 100 }, (_, i) => ({ from: i * 5000, to: i * 5000 + 100 }));
const near = piecesNear(many, [{ from: 250_000, to: 251_000 }]);
eq([near[0].from, near[near.length - 1].from, near.length], [30 * 5000, 50 * 5000, 21], 'near the view, with 20 before');
eq(piecesNear(many, [{ from: 0, to: 10 }]).length, 1, 'none before the first');
eq(piecesNear([], [{ from: 0, to: 10 }]), [], 'no pieces');

// a paragraph too long to send: skipped before the view, cut to the stretch around the view when it's in sight
const long = [{ from: 0, to: 250_000 }, { from: 260_000, to: 260_100 }, { from: 260_102, to: 700_000, lang: 'de' }];
eq(piecesNear(long, [{ from: 260_050, to: 260_060 }]), [{ from: 260_000, to: 260_100 }, { from: 260_102, to: 262_060, lang: 'de' }], 'long ones skipped or cut');
eq(piecesNear(long, [{ from: 500_000, to: 501_000 }]), [{ from: 260_000, to: 260_100 }, { from: 498_000, to: 503_000, lang: 'de' }], 'cut around the view');

console.log('spellcheck.check: ok');
