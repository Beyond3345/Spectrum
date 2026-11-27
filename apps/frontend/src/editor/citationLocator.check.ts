// Self-check for citations with a locator, as every caller of citationText writes them: LaTeX's postnote in the
// command the main file calls for, Typst's supplement and pandoc's locator; none, or an empty value, leaves the plain
// citation. Run:
// npx esbuild apps/frontend/src/editor/citationLocator.check.ts --bundle --platform=node --log-level=warning | node
import { citationCommand, formatCitation } from './shared';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// ─── LaTeX ───

eq(formatCitation('latex', '\\cite', ['Knuth1997'], { kind: 'page', value: '42' }), '\\cite[p.~42]{Knuth1997}', 'a page');
eq(formatCitation('latex', '\\parencite', ['Cormen2022'], { kind: 'pages', value: '42-45' }), '\\parencite[pp.~42--45]{Cormen2022}', 'pages: an en dash for TeX');
eq(formatCitation('latex', '\\parencite', ['Cormen2022'], { kind: 'pages', value: '42 – 45' }), '\\parencite[pp.~42--45]{Cormen2022}', 'a typed en dash');
eq(formatCitation('latex', '\\parencite', ['Cormen2022'], { kind: 'pages', value: '42--45' }), '\\parencite[pp.~42--45]{Cormen2022}', 'already TeX');
eq(formatCitation('latex', '\\citep', ['A', 'B'], { kind: 'chapter', value: '3' }), '\\citep[Ch.~3]{A,B}', 'a chapter, for the group');
eq(formatCitation('latex', '\\cite', ['A'], { kind: 'section', value: '3.2' }), '\\cite[\\S~3.2]{A}', 'a section');
eq(formatCitation('latex', '\\cite', ['A'], { kind: 'page', value: '42 & 50%' }), '\\cite[p.~42 \\& 50\\%]{A}', 'TeX’s specials escaped');
eq(formatCitation('latex', '\\cite', ['A'], { kind: 'page', value: '  ' }), '\\cite{A}', 'an empty value: no postnote');
eq(formatCitation('latex', '\\cite', ['A'], null), '\\cite{A}', 'no locator');
eq(citationCommand('\\usepackage[style=apa]{biblatex}'), '\\parencite', 'biblatex: \\parencite');

// ─── Typst ───

eq(formatCitation('typst', '', ['Cormen2022'], { kind: 'pages', value: '42-45' }), '#cite(<Cormen2022>, supplement: [pp. 42–45])', 'pages, an en dash');
eq(formatCitation('typst', '', ['A', 'B'], { kind: 'page', value: '7' }), '@A #cite(<B>, supplement: [p. 7])', 'the locator on the last key');
eq(formatCitation('typst', '', ['odd key'], { kind: 'section', value: '2' }), '#cite(label("odd key"), supplement: [§ 2])', 'a key that is no label');
eq(formatCitation('typst', '', ['A'], { kind: 'chapter', value: '#3*' }), '#cite(<A>, supplement: [Ch. \\#3\\*])', 'markup escaped');
eq(formatCitation('typst', '', ['A', 'B'], null), '@A @B', 'no locator');

// ─── Markdown (pandoc) ───

eq(formatCitation('markdown', '', ['Cormen2022'], { kind: 'pages', value: '42–45' }), '[@Cormen2022, pp. 42-45]', 'pages');
eq(formatCitation('markdown', '', ['A', 'B'], { kind: 'chapter', value: '3' }), '[@A; @B, chap. 3]', 'pandoc’s chapter term');
eq(formatCitation('markdown', '', ['A'], { kind: 'section', value: '2.1' }), '[@A, sec. 2.1]', 'pandoc’s section term');
eq(formatCitation('markdown', '', ['A'], undefined), '[@A]', 'no locator');

console.log('citationLocator.check: ok');
