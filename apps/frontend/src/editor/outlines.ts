import type { OutlineItem } from './latexEditor';

// Outlines for the documents that are not LaTeX: Typst's = headings and Markdown's ATX headings, with their positions
// and lines as parseOutline gives them. Raw and code blocks, front matter and comments hold no headings.

/** The text of a line without Typst's comments (line, and block ones carried over from a previous line). */
function typstComment(line: string, state: { block: boolean }): string {
  let out = '';
  for (let i = 0; i < line.length;) {
    if (state.block) {
      const end = line.indexOf('*/', i);
      if (end === -1) return out;
      state.block = false;
      i = end + 2;
      continue;
    }
    const block = line.indexOf('/*', i);
    const lineComment = line.indexOf('//', i);
    if (lineComment !== -1 && (block === -1 || lineComment < block)) return out + line.slice(i, lineComment);
    if (block === -1) return out + line.slice(i);
    out += line.slice(i, block);
    const end = line.indexOf('*/', block + 2);
    if (end === -1) {
      state.block = true;
      return out;
    }
    i = end + 2;
  }
  return out;
}

/** Typst's = headings (level: one = is 0 as a chapter is), outside raw blocks and comments. */
export function parseTypstOutline(text: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let offset = 0;
  let fence = false;
  const state = { block: false };
  for (const [index, line] of text.split('\n').entries()) {
    if (/^\s*```/.test(line)) {
      fence = !fence;
      offset += line.length + 1;
      continue;
    }
    if (!fence) {
      const heading = /^(=+)\s+(.*)$/.exec(typstComment(line, state));
      if (heading) {
        const title = heading[2].replace(/\s*<[^>]*>\s*$/, '').trim() || '(untitled)';
        items.push({ title, level: heading[1].length - 1, pos: offset, line: index + 1 });
      }
    }
    offset += line.length + 1;
  }
  return items;
}

/** Markdown's # to #### headings, outside fenced code and the front matter. */
export function parseMarkdownOutline(text: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = text.split('\n');
  let offset = 0;
  let fence = '';
  let front = lines[0]?.trim() === '---';
  for (const [index, line] of lines.entries()) {
    if (front) {
      if (index > 0 && /^(?:---|\.\.\.)\s*$/.test(line)) front = false;
      offset += line.length + 1;
      continue;
    }
    const marker = /^\s*(```|~~~)/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker === fence) fence = '';
      offset += line.length + 1;
      continue;
    }
    if (!fence) {
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) {
        const title = heading[2].replace(/\s+#+\s*$/, '').replace(/\s*\{[^}]*\}\s*$/, '').trim() || '(untitled)';
        items.push({ title, level: heading[1].length - 1, pos: offset, line: index + 1 });
      }
    }
    offset += line.length + 1;
  }
  return items;
}

/** A path written in an include, from the file that writes it (or from the project's root for one starting with /), as the project spells it. */
export function includedPath(from: string, target: string): string {
  const parts = target.startsWith('/') ? target.split('/') : [...from.split('/').slice(0, -1), ...target.split('/')];
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

// ─── Typst's whole document: headings and figures across its includes, numbered from the last compile ───

/** Where the bracket or parenthesis at `at` closes, skipping strings in code and only counting [ ] in content; -1 if never. */
export function closing(text: string, at: number) {
  const stack = [text[at]];
  for (let i = at + 1; i < text.length; i += 1) {
    const c = text[i];
    if (stack[stack.length - 1] === '[') {
      if (c === '\\') i += 1;
      else if (c === '[') stack.push(c);
      else if (c === ']' && (stack.pop(), !stack.length)) return i;
      continue;
    }
    if (c === '"') {
      for (i += 1; i < text.length && text[i] !== '"'; i += 1) if (text[i] === '\\') i += 1;
    } else if ('([{'.includes(c)) stack.push(c);
    else if (')]}'.includes(c) && (stack.pop(), !stack.length)) return i;
  }
  return -1;
}

/**
 * The arguments of the call whose ( is at `open`, each to its comma at that depth: { name, value } with name '' for a
 * positional one; a trailing content block after the ) is the last. null when it never closes.
 */
export function typstArgs(text: string, open: number): { name: string; value: string }[] | null {
  const end = closing(text, open);
  if (end === -1) return null;
  const args: { name: string; value: string }[] = [];
  for (let i = open + 1; i < end; i += 1) {
    if (/[\s,]/.test(text[i])) continue;
    const named = /^([A-Za-z][\w-]*)\s*:\s*/.exec(text.slice(i, i + 40));
    const start = named ? i + named[0].length : i;
    let j = start;
    for (; j < end && text[j] !== ','; j += 1) {
      if ('([{'.includes(text[j])) j = closing(text, j);
      else if (text[j] === '"') j = text.indexOf('"', j + 1);
      if (j === -1) return null;
    }
    args.push({ name: named?.[1] ?? '', value: text.slice(start, j).trim() });
    i = j;
  }
  for (let at = end + 1; text[at] === '['; ) {
    const close = closing(text, at);
    if (close === -1) break;
    args.push({ name: '', value: text.slice(at, close + 1) });
    at = close + 1;
  }
  return args;
}

const SUPPLEMENT: Record<string, string> = { image: 'Figure', table: 'Table', raw: 'Listing' };
/** Content as it reads: markup, labels and function names gone. */
export const readable = (content: string) =>
  content
    .replace(/<[\w:.-]+>/g, '')
    .replace(/#[\w.-]+/g, '')
    .replace(/[*_`$[\]"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** A #figure( at `at` (its #): its kind's supplement and its caption as it reads, or null for one without a caption. */
export function typstFigure(text: string, at: number): { supplement: string; caption: string } | null {
  const open = text.indexOf('(', at);
  if (open === -1) return null;
  // its own arguments, not those of a figure inside it
  let caption = '';
  let kind = '';
  let body = '';
  const args = typstArgs(text, open);
  if (!args) return null;
  for (const { name, value } of args) {
    if (!name) body ||= value;
    else if (name === 'caption' && value.startsWith('[')) caption = value.slice(1, -1);
    else if (name === 'kind') kind = value.replace(/"/g, '');
  }
  if (!readable(caption)) return null;
  // Typst's kind: what the body is, else the first table, image or raw block in it
  const found = kind || (/^(table|image)\(/.exec(body)?.[1] ?? /^`/.exec(body)?.[0]) || /(?:#|\b)(table|image)\(|```/.exec(body)?.[0] || 'image';
  const named = /table/.test(found) ? 'table' : /`/.test(found) ? 'raw' : /image/.test(found) ? 'image' : found;
  return { supplement: SUPPLEMENT[named] ?? named.charAt(0).toUpperCase() + named.slice(1), caption: readable(caption) };
}

/**
 * A Typst document's headings and captioned figures in reading order, into the files it #includes however deep (each
 * read once); a figure a level below the heading before it, as the LaTeX outline has its floats. seen gets the files read.
 */
export async function typstDocumentOutline(root: string, files: Set<string>, read: (path: string) => Promise<string>, seen = new Set<string>()) {
  const items: (OutlineItem & { file: string })[] = [];
  let level = 0;
  const walk = async (path: string) => {
    seen.add(path);
    const text = await read(path).catch(() => '');
    const headings = parseTypstOutline(text);
    const marks: ({ at: number; heading: OutlineItem } | { at: number; include: string } | { at: number; figure: number })[] = headings.map((heading) => ({ at: heading.pos, heading }));
    let offset = 0;
    let fence = false;
    const state = { block: false };
    for (const line of text.split('\n')) {
      if (/^\s*```/.test(line)) fence = !fence;
      const code = fence ? '' : typstComment(line, state);
      for (const m of code.matchAll(/#include\s+"([^"]+)"/g)) marks.push({ at: offset + line.indexOf(m[0]), include: includedPath(path, m[1]) });
      for (const m of code.matchAll(/#figure\s*\(/g)) marks.push({ at: offset + line.indexOf(m[0]), figure: offset + line.indexOf(m[0]) });
      offset += line.length + 1;
    }
    marks.sort((a, b) => a.at - b.at);
    for (const mark of marks) {
      if ('heading' in mark) {
        level = mark.heading.level;
        items.push({ ...mark.heading, file: path });
      } else if ('include' in mark) {
        if (files.has(mark.include) && !seen.has(mark.include)) await walk(mark.include);
      } else {
        const figure = typstFigure(text, mark.figure);
        if (figure) items.push({ title: `${figure.supplement}: ${figure.caption}`, level: level + 1, pos: mark.at, line: text.slice(0, mark.at).split('\n').length, file: path, float: true });
      }
    }
  };
  if (files.has(root)) await walk(root);
  return items;
}

/** What Typst's eval says of the compiled document (the stats route's headings and figures), in its order. */
export type TypstNumbers = { headings?: { number: string; title?: string }[]; figures?: { supplement: string; number: string; caption: string }[] };

const same = (a: string) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * The outline with the last compile's numbers: "3.1 Method", "Table 3.1: …". Each heading and figure takes the next of
 * Typst's with the same text, so one a template or a package makes (Contents, References) is passed over, and one whose
 * text Typst reads otherwise (markup, a function's output) goes without.
 */
export function numberTypstOutline<T extends OutlineItem>(items: T[], numbers: TypstNumbers | null): T[] {
  if (!numbers) return items;
  const cursor = { heading: 0, figure: 0 };
  return items.map((item) => {
    if (item.float) {
      const [supplement, ...rest] = item.title.split(': ');
      const figures = numbers.figures ?? [];
      const at = figures.findIndex((f, i) => i >= cursor.figure && same(f.caption) === same(rest.join(': ')));
      if (at === -1) return item;
      cursor.figure = at + 1;
      const { number } = figures[at];
      return { ...item, title: `${figures[at].supplement || supplement}${number ? ` ${number}` : ''}: ${rest.join(': ')}` };
    }
    const headings = numbers.headings ?? [];
    const at = headings.findIndex((h, i) => i >= cursor.heading && same(h.title ?? '') === same(item.title));
    if (at === -1) return item;
    cursor.heading = at + 1;
    return headings[at].number ? { ...item, title: `${headings[at].number} ${item.title}` } : item;
  });
}
