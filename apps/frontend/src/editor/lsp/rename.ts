import type * as lsp from 'vscode-languageserver-protocol';

/**
 * A rename's edits by project path, from TexLab's answer (changes, or documentChanges with text edits only). Throws for
 * an edit to a file outside the project, or one that would make, move or delete a file: Spectrum writes neither.
 */
export function renameEdits(edit: lsp.WorkspaceEdit | null | undefined, pathOf: (uri: string) => string | null) {
  const byPath = new Map<string, lsp.TextEdit[]>();
  const same = (a: lsp.TextEdit, b: lsp.TextEdit) => JSON.stringify([a.range, a.newText]) === JSON.stringify([b.range, b.newText]);
  const add = (uri: string, edits: lsp.TextEdit[]) => {
    const path = pathOf(uri);
    if (!path) throw new Error('TexLab would change a file outside the project.');
    // one file under two URIs (its name in another case, on a disk that ignores case) can bring the same edit twice
    const known = byPath.get(path) ?? [];
    const fresh = edits.filter((e) => !known.some((k) => same(k, e)));
    if (fresh.length) byPath.set(path, [...known, ...fresh]);
  };
  for (const [uri, edits] of Object.entries(edit?.changes ?? {})) add(uri, edits);
  for (const change of edit?.documentChanges ?? []) {
    if (!('textDocument' in change)) throw new Error('TexLab would make, move or delete a file.');
    add(change.textDocument.uri, change.edits);
  }
  return byPath;
}

/**
 * The name F2 was given, as TexLab takes it: trimmed, and a command's without the backslash typed before it (TexLab
 * renames what follows the backslash). Throws for one that would break its uses, as TexLab writes any name it's given:
 * a command's holds letters only, and a label's or key's no space, comma, brace, %, #, ~ or backslash.
 */
export function newName(typed: string, command: boolean) {
  const name = typed.trim().replace(/^\\(?=[A-Za-z@])/, '');
  if (!name) return '';
  if (command && !/^[A-Za-z@]+$/.test(name)) throw new Error('A command’s name can hold only letters.');
  if (/[\s,{}%#~\\]/.test(name)) throw new Error('A name can’t hold spaces, commas, braces, %, #, ~ or a backslash.');
  return name;
}

/** Whether a .bib's text names key in an entry's crossref, xref, xdata or related field, which TexLab doesn't rename. */
export const crossReferred = (bib: string, key: string) =>
  new RegExp(String.raw`\b(?:crossref|xref|xdata|related)\s*=\s*[{"](?:[^}"]*[\s,])?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\s,}"])`, 'i').test(bib);

/**
 * text with LSP edits made (lines and UTF-16 columns from 0, as JavaScript counts). Each edit replaces expected, the
 * name being renamed: one that doesn't, or that falls past the end of its line, was planned against other text (TexLab
 * hasn't read the file's latest yet, or holds an old copy under another spelling of its name), so this throws rather
 * than write it. Throws when two overlap too.
 */
export function applyEdits(text: string, edits: lsp.TextEdit[], expected: string) {
  const stale = () => new Error('TexLab’s copy of this file is out of date. Try again in a moment.');
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  const offset = ({ line, character }: lsp.Position) => {
    const end = line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
    if (line >= starts.length || starts[line] + character > end) throw stale();
    return starts[line] + character;
  };
  const spans = edits.map((e) => ({ from: offset(e.range.start), to: offset(e.range.end), text: e.newText })).sort((a, b) => a.from - b.from || a.to - b.to);
  let out = '';
  let at = 0;
  for (const span of spans) {
    if (span.from < at) throw new Error('TexLab’s edits overlap.');
    if (text.slice(span.from, span.to) !== expected) throw stale();
    out += text.slice(at, span.from) + span.text;
    at = span.to;
  }
  return out + text.slice(at);
}
