import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import Tabs from '../app/Tabs';
import { documentOutline } from './latexEditor';
import { loadedPackages, scanProject } from './latexEnvs';
import type { PdfHandle, PdfOutlineItem } from './PdfPreview';

export type PdfSidebarTab = 'contents' | 'pages';

type Heading = { file: string; line: number; title: string; level: number };

/**
 * The PDF's sidebar, docked beside the pages. Contents lists the PDF's bookmarks with the section being read
 * marked; a PDF without any (no hyperref) gets the source's headings instead, across the files the document pulls
 * in, which the page finds through SyncTeX. Pages has a thumbnail of each page, drawn as it comes into view, with
 * the current page outlined. Both keep to the PDF: a click goes there.
 */
export default function PdfSidebar({
  tab,
  onTabChange,
  pdf,
  loadedUrl,
  pages,
  page,
  outline,
  section,
  doc,
  files,
  read,
  revision,
  onHeading
}: {
  tab: PdfSidebarTab;
  onTabChange(tab: PdfSidebarTab): void;
  pdf: RefObject<PdfHandle>;
  /** the PDF whose pages are laid out, '' until one is */
  loadedUrl: string;
  pages: number;
  page: number;
  outline: PdfOutlineItem[];
  /** the contents entry being read, -1 for none */
  section: number;
  /** the document whose PDF it is, and the project's files and their text, for the source's headings */
  doc: string;
  files: Set<string>;
  read(path: string): Promise<string>;
  /** changes when the source may have */
  revision: unknown;
  onHeading(file: string, line: number): void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<Heading[] | null>(null);
  // hyperref loaded, but a one-pass compile (draft, from scratch) made no bookmarks yet
  const [hyperref, setHyperref] = useState(false);
  const fromSource = tab === 'contents' && !!loadedUrl && !outline.length;

  useEffect(() => {
    if (!fromSource) return;
    let live = true;
    documentOutline(doc, files, read).then((found) => live && setHeadings(found));
    scanProject(doc, files, read, false).then(({ scans }) => live && setHyperref(loadedPackages(scans).has('hyperref')));
    return () => {
      live = false;
    };
    // read is a fresh function on every editor render; revision says when the text may have changed
  }, [fromSource, doc, files, revision]);

  // the marked row stays in view as the PDF scrolls
  useEffect(() => {
    listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [tab, section, page]);

  const base = Math.min(...(fromSource ? headings || [] : outline).map((h) => h.level), 9);

  return (
    <aside className="pdf-sidebar" aria-label="Document outline">
      <Tabs
        className="pdf-sidebar-tabs"
        value={tab}
        onChange={onTabChange}
        items={[
          { value: 'contents', label: 'Contents' },
          { value: 'pages', label: 'Pages' }
        ]}
      />
      <div className="pdf-sidebar-list" ref={listRef}>
        {tab === 'pages' ? (
          loadedUrl && <Thumbnails key={loadedUrl} pdf={pdf} pages={pages} page={page} root={listRef} />
        ) : !fromSource ? (
          outline.map((item, i) => (
            <button
              key={i}
              className={`pdf-contents-item ${i === section ? 'active' : ''}`}
              aria-current={i === section ? 'location' : undefined}
              style={{ paddingLeft: 8 + (item.level - base) * 12 }}
              disabled={!item.page}
              title={item.title}
              onClick={() => {
                // to the section's own spot, not the top of its page
                if (item.dest) pdf.current?.goTo(item.dest);
                else if (item.page) pdf.current?.scrollToPage(item.page);
              }}
            >
              <span className="pdf-contents-title">{item.title}</span>
              {item.page && <span className="pdf-contents-page">{item.page}</span>}
            </button>
          ))
        ) : (
          <>
            {headings?.map((h) => (
              <button
                key={`${h.file}:${h.line}:${h.title}`}
                className="pdf-contents-item"
                style={{ paddingLeft: 8 + (h.level - base) * 12 }}
                title={`${h.title} (${h.file}, line ${h.line})`}
                onClick={() => onHeading(h.file, h.line)}
              >
                <span className="pdf-contents-title">{h.title}</span>
              </button>
            ))}
            {headings && (
              <div className="sidebar-hint">
                {headings.length ? 'From the source.' : 'No headings yet.'}{' '}
                {hyperref ? 'The PDF’s bookmarks appear after the next full compile.' : <>Add \usepackage{'{hyperref}'} to the preamble for the PDF’s own bookmarks.</>}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

/** Each page as a thumbnail, drawn while near the view and freed once far from it. */
function Thumbnails({ pdf, pages, page, root }: { pdf: RefObject<PdfHandle>; pages: number; page: number; root: RefObject<HTMLDivElement> }) {
  // the first page's shape, for the pages not drawn yet
  const [ratio, setRatio] = useState(Math.SQRT2);

  useEffect(() => {
    const list = root.current;
    if (!list) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const box = entry.target as HTMLElement;
          if (!entry.isIntersecting) {
            box.querySelectorAll('canvas').forEach((canvas) => {
              canvas.width = canvas.height = 0;
              canvas.remove();
            });
            delete box.dataset.drawn;
          } else if (!box.dataset.drawn) {
            box.dataset.drawn = 'yes';
            pdf.current?.renderPage(Number(box.dataset.page), box.clientWidth, Infinity).then((canvas) => {
              // scrolled away meanwhile
              if (!canvas || !box.dataset.drawn) return;
              box.replaceChildren(canvas);
              // drawn at the sidebar's width then, scaled with it as the window or the split narrows
              canvas.style.width = '100%';
              canvas.style.height = 'auto';
              if (box.dataset.page === '1') setRatio(canvas.height / canvas.width);
            });
          }
        }
      },
      { root: list, rootMargin: '100% 0px' }
    );
    list.querySelectorAll('.pdf-thumb-page').forEach((box) => observer.observe(box));
    return () => observer.disconnect();
  }, [pages]);

  return (
    <div className="pdf-thumbs">
      {Array.from({ length: pages }, (_, i) => (
        <button
          key={i}
          className={`pdf-thumb ${i + 1 === page ? 'active' : ''}`}
          aria-label={`Page ${i + 1}`}
          aria-current={i + 1 === page ? 'page' : undefined}
          onClick={() => pdf.current?.scrollToPage(i + 1)}
        >
          <span className="pdf-thumb-page" data-page={i + 1} style={{ '--ratio': ratio } as CSSProperties} />
          <span className="pdf-thumb-number">{i + 1}</span>
        </button>
      ))}
    </div>
  );
}
