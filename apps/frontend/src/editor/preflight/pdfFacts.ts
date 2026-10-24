import { OPS, getDocument } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { StructTreeNode } from 'pdfjs-dist/types/src/display/api';
import type { PdfFacts, PdfPage } from './run';

// What Preflight reads from a PDF with pdf.js: page sizes, text and where it sits, fonts, properties, bookmarks and
// tags. The screen reader view shows the text it collects. Its caller sets pdf.js's worker (ReviewTab.tsx), so
// pdfFacts.check.ts runs this in Node.

/**
 * Text set smaller than 6pt counts as small: TeX's 6pt is 5.978 of the PDF's points (6 × 72/72.27), so text set at
 * exactly that, such as slides' footnotes and review line numbers, doesn't count.
 */
const SMALL = (6 * 72) / 72.27 - 0.01;
/** How long a font pdf.js is still loading gets before the font check says it couldn't look. */
const FONT_WAIT_MS = 5000;

type Font = { name?: string; loadedName?: string; missingFile?: boolean; isType3Font?: boolean };

const figuresWithoutAlt = (node: StructTreeNode | null): number =>
  !node
    ? 0
    : (node.role === 'Figure' && !(node as { alt?: string }).alt ? 1 : 0) +
      node.children.reduce((n, child) => n + ('role' in child ? figuresWithoutAlt(child) : 0), 0);

/** The facts of the PDF at url, page by page; aborting signal stops between pages. */
export async function pdfFacts(url: string, signal?: AbortSignal): Promise<PdfFacts> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Couldn’t read the PDF (${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const version = /%PDF-(\d\.\d)/.exec(new TextDecoder('latin1').decode(bytes.subarray(0, 1024)))?.[1] ?? '';
  const empty: PdfFacts = { version, encrypted: false, title: '', author: '', lang: '', outline: false, tagged: false, figuresWithoutAlt: 0, fonts: null, pages: [] };
  // fonts aren't installed in the page, and are kept with their names
  const task = getDocument({ data: bytes, disableFontFace: true, fontExtraProperties: true });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    if ((err as Error)?.name === 'PasswordException') return { ...empty, encrypted: true };
    throw err;
  }
  try {
    const [{ info, metadata }, outline, mark] = await Promise.all([doc.getMetadata(), doc.getOutline(), doc.getMarkInfo()]);
    const props = info as Record<string, unknown>;
    const field = (key: string) => (typeof props[key] === 'string' ? (props[key] as string) : '');
    const facts: PdfFacts = {
      ...empty,
      version: version || field('PDFFormatVersion'),
      encrypted: Boolean(props.EncryptFilterName),
      title: field('Title') || String(metadata?.get('dc:title') ?? ''),
      author: field('Author') || String(metadata?.get('dc:creator') ?? ''),
      lang: field('Language'),
      outline: Boolean(outline?.length),
      // a Map from pdf.js 6 on, although its types still say an object
      tagged: ((mark as unknown) instanceof Map ? (mark as unknown as Map<string, unknown>).get('Marked') : mark?.Marked) === true
    };
    const pages: PdfPage[] = [];
    const fontIds = new Set<string>();
    let fontsReadable = true;
    let commonObjs: PDFPageProxy['commonObjs'] | null = null;
    for (let n = 1; n <= doc.numPages; n += 1) {
      signal?.throwIfAborted();
      const page = await doc.getPage(n);
      commonObjs ??= page.commonObjs;
      const [x0, y0, x1, y1] = page.view;
      const { width, height } = page.getViewport({ scale: 1 });
      const counts = { chars: 0, smallChars: 0, outside: false };
      let text = '';
      for (const item of (await page.getTextContent()).items) {
        if (!('str' in item)) continue;
        text += item.str + (item.hasEOL ? '\n' : '');
        const visible = item.str.replace(/\s/g, '').length;
        if (!visible) continue;
        counts.chars += visible;
        const [, b, c, d, e, f] = item.transform as number[];
        if (Math.hypot(c, d) < SMALL) counts.smallChars += visible;
        // ponytail: upright runs only; a rotated one would need its box turned first
        if (!b && !c && (e < x0 - 1 || e + item.width > x1 + 1 || f < y0 - 1 || f + item.height > y1 + 1)) counts.outside = true;
      }
      pages.push({ width, height, ...counts, text: text.trim() });
      if (facts.tagged) facts.figuresWithoutAlt += figuresWithoutAlt(await page.getStructTree().catch(() => null));
      try {
        const ops = await page.getOperatorList();
        ops.fnArray.forEach((fn, i) => fn === OPS.setFont && fontIds.add(String(ops.argsArray[i][0])));
      } catch {
        fontsReadable = false;
      }
      page.cleanup();
    }
    facts.pages = pages;
    if (fontsReadable && commonObjs) {
      const objs = commonObjs;
      const fonts = await Promise.all(
        [...fontIds].map((id) => Promise.race([new Promise<unknown>((resolve) => objs.get(id, resolve)), new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS, null))]))
      );
      if (fonts.every((f) => f && typeof f === 'object'))
        facts.fonts = (fonts as Font[]).map((f) => ({ name: f.name || f.loadedName || '', embedded: !f.missingFile, type3: Boolean(f.isType3Font) }));
    }
    return facts;
  } finally {
    await task.destroy();
  }
}
