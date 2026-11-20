import { useEffect, useMemo, useState } from 'react';
import { searchProjectText } from '../api/client';
import type { TextMatch, TextSearchOptions } from '../api/client';
import Icon from '../app/Icon';
import { fileIcon } from './FileTree';
import { byFile, excerpt, searchPattern } from './textMatches';

type Found = { matches: TextMatch[]; more?: string; error?: string };

const OPTIONS: [keyof TextSearchOptions, string, string][] = [
  ['caseSensitive', 'Aa', 'Match case'],
  ['wholeWord', 'ab', 'Whole words'],
  ['regex', '.*', 'Regular expression']
];

/**
 * Search in the sidebar's Files tab, under the file names: the lines of the project's text that hold the search, by
 * file. A click opens the file at the line with the match selected. beforeSearch saves the open file, as the search
 * reads what is on disk.
 */
export default function TextSearch({ projectId, query, beforeSearch, onOpen }: {
  projectId: string;
  query: string;
  beforeSearch: () => Promise<unknown>;
  onOpen: (file: string, line: number, pattern: RegExp) => void;
}) {
  const [options, setOptions] = useState<TextSearchOptions>({ caseSensitive: false, wholeWord: false, regex: false });
  const [found, setFound] = useState<Found | null>(null);
  const term = query.trim();
  const pattern = useMemo(() => searchPattern(term, options), [term, options]);

  useEffect(() => {
    setFound(null);
    if (!term) return;
    const abort = new AbortController();
    // at a pause in the typing
    const timer = setTimeout(async () => {
      try {
        await beforeSearch().catch(() => undefined);
        const res = await searchProjectText(projectId, term, options, abort.signal);
        setFound(res.ok ? { matches: res.matches ?? [], more: res.more } : { matches: [], error: res.error });
      } catch (err) {
        if (!abort.signal.aborted) setFound({ matches: [], error: err instanceof Error ? err.message : String(err) });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
    // beforeSearch is a fresh function each render
  }, [projectId, term, options]);

  if (!term) return null;
  const groups = found ? byFile(found.matches) : [];
  return (
    <section className="text-search" aria-label="In text">
      <div className="text-search-head">
        <span>
          In text{found && !found.error && <span className="text-search-count"> · {found.matches.length}{found.more ? '+' : ''}</span>}
        </span>
        <span className="text-search-options">
          {OPTIONS.map(([key, label, title]) => (
            <button
              key={key}
              className={`text-search-option ${options[key] ? 'active' : ''}`}
              title={title}
              aria-label={title}
              aria-pressed={options[key]}
              onClick={() => setOptions((o) => ({ ...o, [key]: !o[key] }))}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      {!found ? (
        <div className="tree-empty">Searching…</div>
      ) : found.error ? (
        <div className="tree-empty">{found.error}</div>
      ) : !groups.length ? (
        <div className="tree-empty">No matches in the text</div>
      ) : (
        groups.map(([file, lines]) => (
          <div key={file} className="text-search-file">
            <div className="text-search-name" title={file}>
              <Icon name={fileIcon(file)} className="tree-icon" />
              <span className="tree-name">{file.split('/').pop()}</span>
              {file.includes('/') && <span className="text-search-folder">{file.slice(0, file.lastIndexOf('/'))}</span>}
            </div>
            {lines.map((m) => {
              const [before, match, after] = excerpt(m.text, pattern);
              return (
                <button key={m.line} className="text-search-line" title={`${file}, line ${m.line}`} onClick={() => pattern && onOpen(file, m.line, pattern)}>
                  <span className="text-search-number">{m.line}</span>
                  <span className="text-search-text">
                    {before}
                    {match && <mark>{match}</mark>}
                    {after}
                  </span>
                </button>
              );
            })}
          </div>
        ))
      )}
      {found?.more && <div className="tree-empty">Only the first 100 matches are listed. Type more to narrow the search.</div>}
    </section>
  );
}
