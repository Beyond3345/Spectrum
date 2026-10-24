// Self-check for pdfFacts on a real PDF read by pdf.js, here a small tagged one made below. Bundle it first:
// `npx esbuild apps/frontend/src/editor/preflight/pdfFacts.check.ts --bundle --platform=node --log-level=warning --outfile=<file>.js`, then `node <file>.js`
// @ts-expect-error: the worker module comes without types
import * as worker from 'pdfjs-dist/build/pdf.worker.mjs';
import { pdfFacts } from './pdfFacts.ts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// pdf.js runs its worker in this thread when it finds it here
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;

/** A one-page PDF: its catalog's extra entries, and text at 10pt, at TeX's 6pt (5.978) and at 5pt. */
function pdf(catalog: string) {
  const content = 'BT /F1 10 Tf 20 150 Td (Body text here) Tj ET BT /F1 5.978 Tf 20 100 Td (Six) Tj ET BT /F1 5 Tf 20 50 Td (Five) Tj ET';
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${catalog} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> /StructParents 0 >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /StructTreeRoot /K 7 0 R /ParentTree 8 0 R >>',
    '<< /Type /StructElem /S /Document /P 6 0 R /K [9 0 R] >>',
    '<< /Nums [0 [9 0 R]] >>',
    '<< /Type /StructElem /S /Figure /P 7 0 R /Pg 3 0 R /K 0 >>'
  ];
  let out = '%PDF-1.7\n';
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info << /Title (Tagged) /Author (Ada) >> >>\nstartxref\n${xref}\n%%EOF\n`;
  return `data:application/pdf;base64,${btoa(out)}`;
}

async function main() {
  // pdf.js 6 gives the MarkInfo as a Map
  const tagged = await pdfFacts(pdf('/MarkInfo << /Marked true >> /Lang (en-GB) /StructTreeRoot 6 0 R'));
  eq([tagged.version, tagged.title, tagged.author, tagged.lang, tagged.tagged, tagged.figuresWithoutAlt], ['1.7', 'Tagged', 'Ada', 'en-GB', true, 1], 'a tagged PDF');
  // only the 5pt text is small: TeX's 6pt is 5.978 of the PDF's points
  eq([tagged.pages[0].chars, tagged.pages[0].smallChars], [19, 4], 'small text');
  const plain = await pdfFacts(pdf('/MarkInfo << /Marked false >>'));
  eq([plain.tagged, plain.figuresWithoutAlt, plain.lang], [false, 0, ''], 'an untagged PDF');
  console.log('pdfFacts.check: ok');
}

// a failure rejects, which ends Node with an error
main();
