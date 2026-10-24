// A Mermaid PNG embedded in one PDF page at its original CSS size, with malformed inputs refused.
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { pngToPdf } from './pdf';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

(async () => {
  // Four red pixels by two, drawn at 2x CSS resolution.
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEklEQVR4nGP4z8DwHxkzoAsAAA8hD/EEN8afAAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0));
  const bytes = await pngToPdf(png, 2);
  eq(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-', 'PDF file signature');
  const document = await PDFDocument.load(bytes);
  eq(document.getPageCount(), 1, 'one diagram per page');
  eq(document.getPage(0).getSize(), { width: 1.5, height: 0.75 }, 'CSS pixels become PDF points without enlarging the raster');
  eq(document.context.enumerateIndirectObjects().some(([, value]) => value instanceof PDFRawStream && value.dict.get(PDFName.of('Subtype'))?.toString() === '/Image'), true, 'the picture is embedded, not an empty page');
  for (const scale of [0, -1, Infinity, NaN]) {
    let failed = false;
    try { await pngToPdf(png, scale); } catch { failed = true; }
    eq(failed, true, 'invalid raster scale refused');
  }
  let invalidPng = false;
  try { await pngToPdf(new Uint8Array([0]), 3); } catch { invalidPng = true; }
  eq(invalidPng, true, 'damaged PNG refused');
  console.log('mermaid/pdf.check: ok');
})().catch((error) => { setTimeout(() => { throw error; }); });
