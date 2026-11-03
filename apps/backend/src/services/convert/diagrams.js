// The diagram composer's flowcharts across the converter: a TikZ drawing and a fletcher one share one model, so a
// flowchart is written again in the other language from the model its file keeps, rather than shown as a PDF. The
// file format is the composer's (apps/frontend/src/diagram/fileFormat.ts): the drawing's text, then a last line
//   % spectrum-diagram v1 <base64 of the drawing as JSON> <sha256 of the text above, its first 16 hex digits>
// with // in Typst. A text that no longer matches its hash was edited by hand, so its model is not what it shows.
import { createHash } from 'node:crypto';
import { MATHS_SHAPES, fletcherCode, tikzCode, tikzDocument } from '../../latex/flowchart.js';

const MARK_LINE = /^(?:%%?|\/\/) spectrum-diagram v1 ([A-Za-z0-9+/=]+) ([0-9a-f]{16})[ \t]*\r?$/gm;
const hashOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The flowchart a composer file keeps, when it is one and its text is still what the drawing wrote; else null. */
export function flowchartOf(text) {
  const last = [...String(text).matchAll(MARK_LINE)].at(-1);
  if (!last) return null;
  const above = text.slice(0, last.index) + text.slice(last.index + last[0].length).replace(/^\n/, '');
  let diagram;
  try {
    diagram = JSON.parse(Buffer.from(last[1], 'base64').toString('utf8'));
  } catch {
    return null;
  }
  const flowchart = (diagram?.language === 'typst' || (diagram?.language === 'tikz' && diagram.pkg === 'tikz')) && Array.isArray(diagram.model?.boxes) && Array.isArray(diagram.model?.links);
  return flowchart && hashOf(above) === last[2] ? diagram : null;
}

/** A flowchart's file in language ('tikz' or 'typst'), from its model, as the composer would save it. */
export function flowchartFile(diagram, language) {
  const { language: _language, pkg: _pkg, ...rest } = diagram;
  const kept = language === 'typst' ? { language: 'typst', ...rest } : { language: 'tikz', pkg: 'tikz', ...rest };
  const drawn = language === 'typst' ? fletcherCode(diagram.model).body.trimEnd() + '\n' : tikzDocument(tikzCode(diagram.model));
  return drawn + (language === 'typst' ? '//' : '%') + ' spectrum-diagram v1 ' + Buffer.from(JSON.stringify(kept)).toString('base64') + ' ' + hashOf(drawn) + '\n';
}

// maths that reads the same in TeX and Typst: single letters, digits, sub- and superscripts and simple operators
const SHARED_MATHS = /^(?:[0-9+\-=(),. ]|[A-Za-z](?![A-Za-z])|[_^](?:[0-9]+|[A-Za-z](?![A-Za-z])))*$/;

/**
 * A flowchart's drawing for language ('typst' or 'tikz'), its texts as that language reads them: a maths box's maths
 * and a container's ×N through maths (TeX to Typst; null when it can't) for Typst, as they are for TikZ when they read
 * the same in both; any other text as it is when it is plain words. Null when a text needs more than that, so the
 * picture stays a PDF.
 */
export function flowchartFor(diagram, language, maths) {
  if (diagram.language === (language === 'typst' ? 'typst' : 'tikz')) return diagram;
  let ok = true;
  const text = (value, isMaths) => {
    if (!value) return value;
    const out = !isMaths ? value : language === 'typst' ? maths(value) : SHARED_MATHS.test(value) ? value : null;
    ok &&= out !== null && (isMaths || !(language === 'typst' ? /[\\$]/ : /[\\{}$&%#_^~]/).test(value));
    return out;
  };
  const model = {
    ...diagram.model,
    boxes: diagram.model.boxes.map((b) => ({ ...b, text: text(b.text, MATHS_SHAPES.includes(b.shape)), ...(b.repeat ? { repeat: text(b.repeat, true) } : {}) })),
    links: diagram.model.links.map((l) => (l.label ? { ...l, label: text(l.label, false) } : l))
  };
  const { pkg: _pkg, ...rest } = diagram;
  return ok ? (language === 'typst' ? { ...rest, language: 'typst', model } : { ...rest, language: 'tikz', pkg: 'tikz', model }) : null;
}

/** The two drawings are of the same flowchart. */
export const sameFlowchart = (a, b) => !!a && !!b && JSON.stringify(a.model) === JSON.stringify(b.model);
