import { useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import Icon from '../app/Icon';
import type { CompileError } from '../editor/EditorContext';

GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Page 1 of a PDF drawn on white, `scaleFor` its size in points times as big, for the preview and Export PNG; with the
 * page's size in points.
 */
export async function pdfPageCanvas(pdf: Uint8Array, scaleFor: (width: number, height: number) => number) {
  // pdf.js takes the bytes it's given over, so it gets a copy
  const task = getDocument({ data: pdf.slice() });
  try {
    const page = await (await task.promise).getPage(1);
    const { width, height } = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: scaleFor(width, height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) throw new Error('No canvas');
    await page.render({ canvas, canvasContext, viewport }).promise;
    return { canvas, width, height };
  } finally {
    task.destroy();
  }
}

export type PreviewState = { state: 'idle' | 'compiling' | 'ok' | 'failed'; pdf?: Uint8Array; errors: CompileError[]; log: string; failure?: string; source?: string };

/**
 * The compiled diagram at the bottom of the window: the PDF's page fitted to the pane, or why it didn't compile, with
 * Fix with AI. The last good picture stays while a new compile runs.
 */
export default function Preview({ preview, stale, fixing, onFix, onJump }: { preview: PreviewState; stale: boolean; fixing: boolean; onFix(): void; onJump(line: number): void }) {
  const paneRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<{ url: string; width: number; height: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const observer = new ResizeObserver(() => setSize({ width: pane.clientWidth, height: pane.clientHeight }));
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  // drawn at the pane's size (sharp on a Retina screen), no bigger than three times its own
  useEffect(() => {
    if (!preview.pdf || !size.width || !size.height) return;
    let live = true;
    const fit = (width: number, height: number) => Math.max(0.1, Math.min((size.width - 24) / width, (size.height - 24) / height, 3));
    pdfPageCanvas(preview.pdf, (width, height) => fit(width, height) * window.devicePixelRatio).then(
      ({ canvas, width, height }) => live && setImage({ url: canvas.toDataURL('image/png'), width: width * fit(width, height), height: height * fit(width, height) }),
      () => live && setImage(null)
    );
    return () => {
      live = false;
    };
  }, [preview.pdf, size.width, size.height]);

  const errors = preview.errors.filter((e) => e.severity === 'error');
  const failed = preview.state === 'failed';
  // TeX carries on past most errors, so a PDF can come with some
  const troubled = failed || (preview.state === 'ok' && errors.length > 0);

  return (
    <div className="diagram-preview">
      <div className="diagram-preview-head">
        <span className="diagram-preview-title">Preview</span>
        <span className={`diagram-preview-status${troubled ? ' failed' : ''}`} role="status">
          {preview.state === 'compiling' && (
            <>
              <span className="spinner" /> Compiling…
            </>
          )}
          {failed ? 'Couldn’t compile' : troubled && `Compiled with ${errors.length === 1 ? 'an error' : `${errors.length} errors`}`}
          {preview.state === 'ok' && !troubled && stale && 'Source changed'}
        </span>
        <span className="grow" />
        {troubled && (
          <button type="button" className="btn small" disabled={fixing} onClick={onFix}>
            {fixing ? <span className="spinner" /> : <Icon name="sparkles" />} Fix with AI
          </button>
        )}
        {preview.log && (
          <button type="button" className="btn ghost small" aria-expanded={logOpen} onClick={() => setLogOpen((v) => !v)}>
            {logOpen ? 'Hide the log' : 'Show the log'}
          </button>
        )}
      </div>
      <div className="diagram-preview-body">
        {(troubled || logOpen) && (
          <div className="diagram-preview-errors">
            {failed && !errors.length && <div className="diagram-error-card">{preview.failure || 'No PDF was produced.'}</div>}
            {troubled &&
              errors.map((error, i) => (
                <div key={i} className="diagram-error-card">
                  <Icon name="xmark.octagon.fill" className="log-icon" />
                  <span className="grow">{error.message}</span>
                  {error.line !== undefined && (
                    <button type="button" className="log-location" onClick={() => onJump(error.line!)}>
                      line {error.line}
                    </button>
                  )}
                </div>
              ))}
            {logOpen && <pre className="log-raw">{preview.log}</pre>}
          </div>
        )}
        <div className="diagram-preview-page" ref={paneRef}>
          {image ? (
            <img src={image.url} alt="The compiled diagram" style={{ width: image.width, height: image.height }} className={preview.state === 'compiling' || failed || stale ? 'stale' : ''} />
          ) : (
            preview.state !== 'compiling' && !failed && <span className="diagram-hint">The compiled diagram shows here.</span>
          )}
        </div>
      </div>
    </div>
  );
}
