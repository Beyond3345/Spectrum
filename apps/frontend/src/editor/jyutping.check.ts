// Self-check for the Jyutping sheet's options and wrapping. Run:
// npx esbuild apps/frontend/src/editor/jyutping.check.ts --bundle --platform=node --log-level=warning | node
import { cleanOptions, jyutpingWrap, loadsXjyutping } from './jyutping';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

eq(cleanOptions({ ratio: '0.45', vsep: ' 1.2em ', format: '', fancy: false, lazy: 'all', script: 'auto', align: 'centre' }), { vsep: '1.2em', lazy: 'all', align: 'centre' }, 'defaults dropped');

eq(loadsXjyutping('\\usepackage[fancy]{xjyutping}'), true, 'with options');
eq(loadsXjyutping('% \\usepackage{xjyutping}\n'), false, 'commented out');
eq(loadsXjyutping('\\usepackage{ctex,xjyutping}'), true, 'in a list');

const apply = (doc: string, from: number, to: number, kind: 'scope' | 'star') => {
  const w = jyutpingWrap(doc, from, to, kind);
  const out = doc.slice(0, w.from) + w.insert + doc.slice(w.to);
  return `${out.slice(0, w.cursor)}|${out.slice(w.cursor)}`;
};
eq(apply('a 我哋 b', 2, 4, 'star'), 'a \\xjyutping*{我哋}| b', 'star');
eq(apply('a  b', 2, 2, 'star'), 'a \\xjyutping*{|} b', 'empty star');
eq(apply('x\n我哋\ny', 2, 5, 'scope'), 'x\n\\begin{jyutpingscope}\n我哋\n\\end{jyutpingscope}|\ny', 'whole line');
eq(apply('x 我哋 y', 2, 4, 'scope'), 'x \n\\begin{jyutpingscope}\n我哋\n\\end{jyutpingscope}|\n y', 'mid-line');
eq(apply('x\n\n', 2, 2, 'scope'), 'x\n\\begin{jyutpingscope}\n|\n\\end{jyutpingscope}\n', 'empty scope');

console.log('jyutping: ok');
