import type { PdfBox } from '../api/client';

// Find in the PDF: a page's text as pdf.js gives it, where a search matches in it, and the boxes a match covers on
// the page. No DOM here, so the check runs in Node.

/** A run of text as pdf.js's getTextContent gives it; transform is [a, b, c, d, e, f], (e, f) the start of its baseline */
export type TextRun = { str: string; transform: number[]; width: number; hasEOL?: boolean; fontName?: string };

/** The page's text, its runs joined (a line's end is a line break), and where each run starts in it. */
export function pageText(runs: TextRun[]) {
  let text = '';
  const starts: number[] = [];
  for (const run of runs) {
    starts.push(text.length);
    text += run.str;
    if (run.hasEOL) text += '\n';
  }
  return { text, starts };
}

/** Where `query` is in `text`, ignoring case; any spaces in it match any others, a line break too. */
export function findAll(text: string, query: string): [number, number][] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'gi');
  return [...text.matchAll(pattern)].map((m) => [m.index!, m.index! + m[0].length]);
}

/**
 * The boxes a match covers, one for each run it touches, in PDF points from the page's top-left as PdfBox is.
 * toView turns the PDF's own coordinates into those (pdf.js's viewport at scale 1). widthOf measures text in a
 * font like the run's, so a match part-way along a run starts about where its letters do.
 * ponytail: unrotated text only, and the run's width is shared out by a stand-in font, so a box can sit a
 * letter or so off in a long run; the text layer's own spans would be exact
 */
export function matchBoxes(
  runs: TextRun[],
  starts: number[],
  [from, to]: [number, number],
  page: number,
  toView: (x: number, y: number) => number[],
  widthOf: (text: string, run: TextRun) => number
): PdfBox[] {
  const boxes: PdfBox[] = [];
  runs.forEach((run, i) => {
    const a = Math.max(from, starts[i]) - starts[i];
    const b = Math.min(to, starts[i] + run.str.length) - starts[i];
    if (b <= a) return;
    const whole = widthOf(run.str, run);
    const share = (n: number) => (whole ? widthOf(run.str.slice(0, n), run) / whole : n / run.str.length);
    const [x, y] = toView(run.transform[4], run.transform[5]);
    const size = Math.hypot(run.transform[2], run.transform[3]);
    const left = x + run.width * share(a);
    // a hundredth of a point is plenty; about a letter's height above the baseline and a descender's below
    const round = (n: number) => Math.round(n * 100) / 100;
    boxes.push({ page, x: round(left), y: round(y - size * 0.8), width: round(x + run.width * share(b) - left), height: round(size) });
  });
  return boxes;
}
