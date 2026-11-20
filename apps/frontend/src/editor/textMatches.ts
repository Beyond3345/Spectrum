import type { TextMatch, TextSearchOptions } from '../api/client';

// Search in the sidebar's In text: the backend finds the lines (searchText in mcp/tools.js); this finds the match in a
// line again, the same way, to show it in the list and select it in the editor.

/** The search as the backend reads it, or null for an expression that isn't one (the backend says why). */
export function searchPattern(query: string, { caseSensitive, wholeWord, regex }: TextSearchOptions): RegExp | null {
  if (!query) return null;
  const source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])` : source, caseSensitive ? 'u' : 'iu');
  } catch {
    return null;
  }
}

/** Where the first match is in a line, as [from, to], or null (the line changed since the search). */
export function matchRange(text: string, pattern: RegExp): [number, number] | null {
  const m = pattern.exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}

/** A line cut to show its match: what comes before (shortened at the start when long), the match and the rest. */
export function excerpt(text: string, pattern: RegExp | null, lead = 12): [string, string, string] {
  const range = pattern && matchRange(text, pattern);
  if (!range) return [text, '', ''];
  const [from, to] = range;
  // from the start of a word some way before the match (a line of one long word shows from its start)
  const start = from > lead ? text.lastIndexOf(' ', from - lead) + 1 : 0;
  return [(start ? '…' : '') + text.slice(start, from), text.slice(from, to), text.slice(to)];
}

/** The matches by file, in the order the backend found them. */
export function byFile(matches: TextMatch[]) {
  const groups = new Map<string, TextMatch[]>();
  for (const m of matches) groups.set(m.file, [...(groups.get(m.file) ?? []), m]);
  return [...groups];
}
