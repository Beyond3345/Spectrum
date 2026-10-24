import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import Icon from '../app/Icon';
import { FIND_NEXT, FIND_PREVIOUS, formatShortcut, matchesShortcut } from '../app/shortcuts';
import { MAX_MATCHES } from './PdfPreview';
import type { PdfHandle } from './PdfPreview';

/**
 * Find in the PDF, over the top of the pages: the matches are marked as you type, ↩ and ⇧↩ step through them
 * and Esc closes it. `focusSignal` changes when ⌘F is pressed again, to pick the search box once more; `loadedUrl`
 * when another PDF is laid out, whose matches the pages mark themselves and which are counted again here.
 */
export default function PdfFindBar({ pdf, loadedUrl, focusSignal, onClose }: { pdf: RefObject<PdfHandle>; loadedUrl: string; focusSignal: number; onClose(): void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  // null while searching
  const [count, setCount] = useState<number | null>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // only the newest search's answer counts
  const askedRef = useRef(0);

  const run = (text: string, at: number) => {
    const asked = ++askedRef.current;
    pdf.current?.find(text, at).then((n) => asked === askedRef.current && setCount(n));
  };

  // a moment after typing stops, from the first match
  useEffect(() => {
    if (!query.trim()) {
      run('', 0);
      setCount(0);
      return;
    }
    setCount(null);
    const timer = window.setTimeout(() => run(query, 0), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  // closing takes the marks away
  useEffect(() => () => void pdf.current?.find('', 0), []);

  useEffect(() => {
    if (query.trim()) run(query, index);
  }, [loadedUrl]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  const step = (by: number) => {
    if (!count) return;
    const next = (((index + by) % count) + count) % count;
    setIndex(next);
    run(query, next);
  };

  const label = count === null ? 'Searching…' : !query.trim() ? '' : count ? `${(index % count) + 1} of ${count}${count >= MAX_MATCHES ? '+' : ''}` : 'No matches';

  return (
    <div className="pdf-find" role="search">
      <Icon name="magnifyingglass" />
      <input
        ref={inputRef}
        value={query}
        placeholder="Find in PDF"
        aria-label="Find in PDF"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={(e) => {
          // only the keys Find has: the app's own shortcuts (⌘S, ⌘↩) still work from here
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) step(e.shiftKey ? -1 : 1);
          else if (e.key === 'Escape') onClose();
          else if (matchesShortcut('Mod-f', e.nativeEvent)) e.currentTarget.select();
          // the system's find next and previous, as the editor has them
          else if (matchesShortcut(FIND_NEXT, e.nativeEvent)) step(1);
          else if (matchesShortcut(FIND_PREVIOUS, e.nativeEvent)) step(-1);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      <span className="pdf-find-count" aria-live="polite">
        {label}
      </span>
      <button className="icon-btn small" title={`Previous match (${formatShortcut('Shift-Enter')})`} aria-label="Previous match" disabled={!count} onClick={() => step(-1)}>
        <Icon name="chevron.up" />
      </button>
      <button className="icon-btn small" title={`Next match (${formatShortcut('Enter')})`} aria-label="Next match" disabled={!count} onClick={() => step(1)}>
        <Icon name="chevron.down" />
      </button>
      <button className="icon-btn small" title={`Close (${formatShortcut('Escape')})`} aria-label="Close Find" onClick={onClose}>
        <Icon name="xmark" />
      </button>
    </div>
  );
}
