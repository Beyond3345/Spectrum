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

console.log('spellcheck.check: ok');
