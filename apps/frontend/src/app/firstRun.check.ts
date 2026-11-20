// Self-check for Get started's rows. Run:
// npx esbuild apps/frontend/src/app/firstRun.check.ts --bundle --platform=node --format=esm --log-level=warning --outfile=<scratch>/firstRun.mjs && node <scratch>/firstRun.mjs
import { hasModel, texName } from './firstRun';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

eq(texName({ pdflatex: '/usr/local/texlive/2026/bin/universal-darwin/pdflatex' }), 'TeX Live 2026', 'TeX Live on a Mac');
eq(texName({ pdflatex: null, latexmk: 'C:\\texlive\\2025\\bin\\windows\\latexmk.exe' }), 'TeX Live 2025', 'TeX Live on Windows');
eq(texName({ pdflatex: 'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe' }), 'MiKTeX', 'MiKTeX');
eq(texName({ pdflatex: '/Library/TeX/texbin/pdflatex' }), 'TeX Live', 'MacTeX’s texbin');
eq(texName({ pdflatex: '/Library/TeX/texbin/pdflatex' }, '/usr/local/texlive/2026/bin/universal-darwin/pdflatex'), 'TeX Live 2026', 'its link followed');
eq(texName({ pdflatex: '/opt/tex/bin/pdflatex' }), 'the TeX on this computer', 'another TeX');
eq(texName({ pdflatex: null, tectonic: '/usr/bin/tectonic' }), null, 'no TeX: Tectonic compiles');

eq(hasModel({ llmProvider: '', llmApiKey: '' }), false, 'nothing set');
eq(hasModel({ llmProvider: 'ollama', llmApiKey: '' }), true, 'a model on this computer needs no key');
eq(hasModel({ llmProvider: '', llmApiKey: 'sk-test' }), true, 'a key');

console.log('firstRun: all checks passed');
