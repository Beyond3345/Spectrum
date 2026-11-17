// Compile with page colour gives the PDF the colours the viewer paints its pages with, which editor.css holds: the two
// must stay the same. Run from the repository root:
// npx esbuild apps/frontend/src/app/pageColour.check.ts --bundle --platform=node --format=esm --outfile=/tmp/x.mjs --loader:.svg=text --loader:.css=empty && node /tmp/x.mjs
// the frontend has no Node types
// @ts-expect-error
import { readFileSync } from 'node:fs';
import { PDF_PAGE_FILLS, PDF_PAGES_LIGHT } from './appearance';

const css = readFileSync('apps/frontend/src/styles/editor.css', 'utf8');
for (const [value, label] of PDF_PAGES_LIGHT) {
  if (value === 'white') continue;
  const painted = css.match(new RegExp(`\\[data-pdf-page='${value}'\\] \\.pdf-page \\{\\s*background: (#[0-9a-f]{6});`))?.[1];
  if (painted !== PDF_PAGE_FILLS[value]) throw new Error(`${label} pages: editor.css paints ${painted}, the compile gives ${PDF_PAGE_FILLS[value]}`);
}
if (PDF_PAGE_FILLS.white !== '#ffffff') throw new Error('White pages are white');
console.log('pageColour: the compile’s page colours match the viewer’s');
