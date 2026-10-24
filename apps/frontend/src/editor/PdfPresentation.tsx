import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { IS_DESKTOP, setFullscreen } from '../app/desktop';
import type { PdfHandle } from './PdfPreview';

/**
 * Presentation mode, for slides: one page at a time as large as the screen allows, in full screen. →, ↓, Space,
 * Page Down and a click go on; ←, ↑ and Page Up go back; Home and End go to the first and last page; Esc ends it,
 * and the PDF behind is left at the page reached.
 */
export default function PdfPresentation({
  pdf,
  loadedUrl,
  pages,
  start,
  onClose
}: {
  pdf: RefObject<PdfHandle>;
  /** the PDF laid out; a recompile draws the page again */
  loadedUrl: string;
  pages: number;
  start: number;
  onClose(page: number): void;
}) {
  const [page, setPage] = useState(Math.min(pages, Math.max(1, start)));
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const stageRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const go = (to: number) => setPage(Math.min(pages, Math.max(1, to)));

  // A recompile can remove the slide being shown.
  useEffect(() => setPage((current) => Math.min(pages, Math.max(1, current))), [pages]);

  // full screen while presenting, unless the window was already
  useEffect(() => {
    const was = document.documentElement.classList.contains('fullscreen') || !!document.fullscreenElement;
    if (!was) setFullscreen(true);
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    // a browser's own Esc leaves full screen without the page hearing the key
    const onChange = () => !document.fullscreenElement && closeRef.current(pageRef.current);
    window.addEventListener('resize', onResize);
    if (!IS_DESKTOP && !was) document.addEventListener('fullscreenchange', onChange);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onChange);
      if (!was) setFullscreen(false);
    };
  }, []);

  // the keys work the slides, not the editor or PDF behind them
  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current(pageRef.current);
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) go(pageRef.current + 1);
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) go(pageRef.current - 1);
      else if (e.key === 'Home') go(1);
      else if (e.key === 'End') go(pages);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pages]);

  // the page drawn to fit; the one before stays until it's ready, so moving on never flashes
  useEffect(() => {
    let live = true;
    pdf.current
      ?.renderPage(page, size.width, size.height)
      .then((canvas) => {
        if (live && canvas) stageRef.current?.replaceChildren(canvas);
      })
      // a new PDF cancels what the old one was drawing
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [page, size, loadedUrl]);

  return createPortal(
    <div className="pdf-presentation" role="dialog" aria-label={`Presentation, page ${page} of ${pages}`} onClick={() => go(page + 1)}>
      <div className="pdf-presentation-page" ref={stageRef} />
      <div className="pdf-presentation-count">
        {page} / {pages}
      </div>
    </div>,
    document.body
  );
}
