import type * as lsp from 'vscode-languageserver-protocol';

/**
 * A rename's edits by project path, from TexLab's answer (changes, or documentChanges with text edits only). Throws for
 * an edit to a file outside the project, or one that would make, move or delete a file: Spectrum writes neither.
 */
export function renameEdits(edit: lsp.WorkspaceEdit | null | undefined, pathOf: (uri: string) => string | null) {
  const byPath = new Map<string, lsp.TextEdit[]>();
  const add = (uri: string, edits: lsp.TextEdit[]) => {
    const path = pathOf(uri);
    if (!path) throw new Error('TexLab would change a file outside the project.');
    if (edits.length) byPath.set(path, [...(byPath.get(path) ?? []), ...edits]);
  };
  for (const [uri, edits] of Object.entries(edit?.changes ?? {})) add(uri, edits);
  for (const change of edit?.documentChanges ?? []) {
    if (!('textDocument' in change)) throw new Error('TexLab would make, move or delete a file.');
    add(change.textDocument.uri, change.edits);
  }
  return byPath;
}

/** text with LSP edits made (lines and UTF-16 columns from 0, as JavaScript counts); throws when two overlap. */
export function applyEdits(text: string, edits: lsp.TextEdit[]) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  const offset = ({ line, character }: lsp.Position) => {
    if (line >= starts.length) return text.length;
    const end = line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
    return Math.min(starts[line] + character, end);
  };
  const spans = edits.map((e) => ({ from: offset(e.range.start), to: offset(e.range.end), text: e.newText })).sort((a, b) => a.from - b.from || a.to - b.to);
  let out = '';
  let at = 0;
  for (const span of spans) {
    if (span.from < at) throw new Error('TexLab’s edits overlap.');
    out += text.slice(at, span.from) + span.text;
    at = span.to;
  }
  return out + text.slice(at);
}
