// The live preview's reading of a pandoc Markdown document, for react-markdown (GitHub Markdown) to draw: line for
// line the same text, so each block keeps its source line, with what GitHub Markdown lacks made plain first. Pure;
// checked in previewText.check.ts.
//
// - the front matter becomes blank lines, its title, authors and date read apart;
// - maths ($…$, $$…$$) becomes code marked MATHS, which the preview draws with KaTeX;
// - @fig:x, @tbl:x, @eq:x and @sec:x become "Figure 1" and the like, numbered as crossref.lua numbers them;
// - [@key] citations become code marked CITE, drawn as a chip; ^[a note] becomes code marked NOTE;
// - {#…} attributes go, a numbered heading gets its number, and a Table: caption line is marked CAPTION.

export const MARK = '';
export const MATHS = MARK + 'm';
export const DISPLAY = MARK + 'M';
export const CITE = MARK + 'c';
export const NOTE = MARK + 'n';
export const CAPTION = MARK + 't';

type Label = { word: string; number?: string; title?: string };
export type Prepared = {
  markdown: string;
  meta: { title: string; authors: string[]; date: string };
  /** figures by their source line: the number and caption a picture or Mermaid block is shown with */
  figures: Map<number, { number: string; caption: string }>;
  labels: Map<string, Label>;
};

const KIND = /^(fig|tbl|tab|eq|sec)[:-]/;
const WORDS: Record<string, string> = { fig: 'Figure', tbl: 'Table', tab: 'Table', eq: 'Equation', sec: 'Section' };
const REF = /(?<![\w@.])(-?)@((?:fig|tbl|tab|eq|sec)[:-][\w:.-]*\w)/g;
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
const unquote = (v: string) => v.trim().replace(/^(["'])(.*)\1$/, '$2');

/** inline code holding `text`, with a fence longer than any run of backticks in it */
function codeSpan(text: string) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence} ${text} ${fence}`;
}

/** The front matter's line count and its title, authors and date (one level of YAML, as the backend reads it). */
function frontMatter(lines: string[]) {
  const meta = { title: '', authors: [] as string[], date: '', numbered: false };
  if (lines[0]?.trim() !== '---') return { end: 0, meta };
  const end = lines.findIndex((line, i) => i > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
  if (end === -1) return { end: 0, meta };
  let field = '';
  for (const line of lines.slice(1, end)) {
    const item = /^\s*-\s+(?:name:\s*)?(.*)$/.exec(line);
    if (item && field === 'author') meta.authors.push(unquote(item[1]));
    const pair = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    field = pair[1];
    const value = unquote(pair[2].replace(/\s+#.*$/, ''));
    if (field === 'title') meta.title = value;
    else if (field === 'date') meta.date = value;
    else if (field === 'author' && value) meta.authors.push(...value.replace(/^\[|\]$/g, '').split(/\s*[,;]\s*|\s+and\s+/).map(unquote).filter(Boolean));
    else if ((field === 'numbersections' || field === 'number-sections') && /^(?:true|yes)$/i.test(value)) meta.numbered = true;
  }
  return { end: end + 1, meta };
}

/** The lines inside fenced code (true), which nothing below reads. */
function inCode(lines: string[]) {
  const code = lines.map(() => false);
  for (let i = 0; i < lines.length; i += 1) {
    const open = FENCE.exec(lines[i]);
    if (!open) continue;
    const close = new RegExp(`^\\s*${open[1][0] === '`' ? '`' : '~'}{${open[1].length},}\\s*$`);
    let end = i + 1;
    while (end < lines.length && !close.test(lines[end])) end += 1;
    for (let k = i + 1; k < end; k += 1) code[k] = true;
    i = end;
  }
  return code;
}

const attributeId = (attrs: string) => /#([^\s}]+)/.exec(attrs)?.[1] ?? '';

/** The text outside inline code on a line, changed by `change`; code spans stay as they are. */
const outsideCode = (line: string, change: (text: string) => string) => line.split(/(`+[^`]*?`+)/).map((part, i) => (i % 2 ? part : change(part))).join('');

export function prepareMarkdown(source: string): Prepared {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const { end, meta } = frontMatter(lines);
  const code = inCode(lines);
  const labels = new Map<string, Label>();
  const figures = new Map<number, { number: string; caption: string }>();
  const counts: Record<string, number> = {};
  const next = (word: string) => String((counts[word] = (counts[word] ?? 0) + 1));
  const label = (id: string, value: Label) => {
    if (KIND.test(id) && !labels.has(id)) labels.set(id, value);
  };
  for (let i = 0; i < end; i += 1) lines[i] = '';

  // labels and numbers, in the order of the text
  const sections: number[] = [];
  for (let i = end; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = !code[i] && FENCE.exec(line);
    if (fence) {
      // a captioned Mermaid block is a figure
      const info = fence[2];
      const caption = /\.mermaid\b/.test(info) && /caption\s*=\s*"([^"]*)"/.exec(info)?.[1];
      if (caption) {
        const number = next('Figure');
        figures.set(i + 1, { number, caption });
        label(attributeId(info), { word: 'Figure', number });
      }
      if (/^\s*\{[^}]*\.mermaid\b/.test(info)) lines[i] = line.replace(/^(\s*[`~]+).*$/, '$1mermaid');
      continue;
    }
    if (code[i]) continue;
    const heading = /^(#{1,6})\s+(.*?)\s*(?:\{([^}]*)\})?\s*$/.exec(line);
    if (heading) {
      const attrs = heading[3] ?? '';
      const level = heading[1].length;
      const unnumbered = /(?:^|\s)(?:\.unnumbered|-)(?:\s|$)/.test(attrs);
      let number: string | undefined;
      if (!unnumbered) {
        sections[level - 1] = (sections[level - 1] ?? 0) + 1;
        sections.length = level;
        number = meta.numbered ? Array.from(sections, (n) => n ?? 0).join('.') : undefined;
      }
      label(attributeId(attrs), { word: 'Section', number, title: heading[2] });
      lines[i] = `${heading[1]} ${number ? number + ' ' : ''}${heading[2]}`;
      continue;
    }
    // a picture alone in its paragraph, with a caption, is a figure
    const image = /^\s*!\[([^\]]+)\]\(([^)]*)\)(\{[^}]*\})?\s*$/.exec(line);
    if (image && !lines[i - 1]?.trim() && !lines[i + 1]?.trim()) {
      const number = next('Figure');
      figures.set(i + 1, { number, caption: image[1] });
      label(attributeId(image[3] ?? ''), { word: 'Figure', number });
    }
    const caption = /^\s*(?:Table)?:\s+(.*?)\s*(?:\{([^}]*)\})?\s*$/.exec(line);
    if (caption && (/^\s*\|/.test(lines[i - 2] ?? '') || /^\s*\|/.test(lines[i - 1] ?? '') || /^\s*\|/.test(lines[i + 1] ?? '') || /^\s*\|/.test(lines[i + 2] ?? ''))) {
      const number = next('Table');
      label(attributeId(caption[2] ?? ''), { word: 'Table', number });
      // a quote, which ends a table it touches; the preview draws it as the caption
      lines[i] = `> ${CAPTION}Table ${number}: ${caption[1]}`;
      continue;
    }
  }
  // labelled equations, $$ … $$ {#eq:x} on one line or several, outside code
  const text = lines.join('\n');
  const lineAt = (at: number) => text.slice(0, at).split('\n').length - 1;
  const DISPLAY_MATHS = /\$\$([\s\S]+?)\$\$(?:[ \t]*\{#([^}\s]+)\})?/g;
  for (const m of text.matchAll(DISPLAY_MATHS)) if (m[2] && !code[lineAt(m.index!)]) label(m[2], { word: 'Equation', number: next('Equation') });

  const word = (l: Label) => (l.word === 'Section' && !l.number ? l.title ?? '' : `${l.word} ${l.word === 'Equation' ? `(${l.number})` : l.number}`);
  const refs = (group: string) => {
    const items = [...group.matchAll(/(-?)@([\w:.-]*\w)/g)];
    const found = items.map(([, minus, id]) => ({ minus, label: labels.get(id) }));
    const same = found.length > 1 && found.every((f) => f.label && f.label.word === found[0].label?.word && f.label.number);
    const parts = found.map(({ minus, label: l }) => (!l ? '??' : minus || same ? (l.word === 'Equation' ? `(${l.number})` : l.number ?? l.title ?? '') : word(l)));
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    return same ? `${found[0].label!.word}s ${joined}` : joined;
  };

  // the text, maths, references, citations, notes and attributes made plain (a display equation keeps its lines)
  let out = text.replace(DISPLAY_MATHS, (whole, maths: string, id: string | undefined, at: number) => {
    if (code[lineAt(at)]) return whole;
    const number = id ? labels.get(id)?.number : undefined;
    return codeSpan(`${DISPLAY}${number ?? ''}|${maths.trim()}`) + '\n'.repeat(whole.split('\n').length - 1);
  });
  const outLines = out.split('\n');
  for (let i = end; i < outLines.length; i += 1) {
    if (code[i] || FENCE.test(outLines[i])) continue;
    outLines[i] = outsideCode(outLines[i], (part) =>
      part
        .replace(/(?<![\\$\w])\$(?![\s$])((?:[^$\\\n]|\\.)+?)(?<![\s\\])\$(?!\d)/g, (_m, maths: string) => codeSpan(MATHS + maths))
        .replace(/\[([^\[\]]*@[^\[\]]*)\]/g, (whole, inner: string) => {
          const ids = [...inner.matchAll(/@([\w:.-]*\w)/g)].map((m) => m[1]);
          if (ids.every((id) => KIND.test(id))) return inner.replace(/(?:-?@[\w:.-]*\w(?:;\s*)?)+/, (group) => refs(group));
          return codeSpan(CITE + inner);
        })
        .replace(REF, (whole) => refs(whole))
        .replace(/\^\[([^\]]*)\]/g, (_m, note: string) => codeSpan(NOTE + note))
        .replace(/(!\[[^\]]*\]\([^)]*\))\{[^}]*\}/g, '$1')
    );
  }
  out = outLines.join('\n');
  return { markdown: out, meta: { title: meta.title, authors: meta.authors, date: meta.date }, figures, labels };
}
