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

/** A path written in an include, from the file that writes it, as the project spells it. */
export function includedPath(from: string, target: string): string {
  const parts = [...from.split('/').slice(0, -1), ...target.split('/')];
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}
