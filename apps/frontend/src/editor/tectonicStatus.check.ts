// Self-check for the status line over a running Tectonic compile. Run:
// npx esbuild apps/frontend/src/editor/tectonicStatus.check.ts --bundle --platform=node --log-level=warning --outfile=<scratch>/tectonicStatus.cjs && node <scratch>/tectonicStatus.cjs
import { tectonicStatus } from './tectonicStatus';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

eq(tectonicStatus(''), 'Starting…', 'nothing yet');
eq(tectonicStatus('note: downloading tectonic-format-latex.tex\n'), 'Downloading tectonic-format-latex.tex… (1 file so far)', 'one download');
eq(
  tectonicStatus('note: downloading xelatex.ini\r\nnote: downloading latex.ltx\r\nsome TeX output\r\nnote: downloading article.cls'),
  'Downloading article.cls… (3 files so far)',
  'downloads counted, Windows line ends'
);
eq(tectonicStatus('note: downloading a.tex\nnote: Running TeX ...\n(./main.tex'), 'Running TeX', 'TeX');
eq(tectonicStatus('note: Rerunning TeX because "main.aux" changed ...\n'), 'Running TeX again', 'rerun');
eq(tectonicStatus('note: Running external tool biber ...\n'), 'Running Biber', 'Biber');
eq(tectonicStatus('note: Running external tool bibtex ...\n'), 'Running BibTeX', 'BibTeX');
eq(tectonicStatus('note: Writing `main.pdf` (5.47 KiB)\n'), 'Writing the PDF', 'writing');
eq(tectonicStatus('note: connecting to https://relay.fullyjustified.net\n'), 'Connecting to https://relay.fullyjustified.net', 'any other note');
eq(tectonicStatus('a line that mentions note: downloading x\n'), 'Starting…', 'only notes at a line’s start');

console.log('tectonicStatus: ok');
