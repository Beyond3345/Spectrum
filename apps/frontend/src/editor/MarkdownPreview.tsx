// The live preview of a Markdown document, in the PDF's place: drawn from the text as it is typed, with maths by KaTeX,
// Mermaid by the composer's Mermaid, references numbered and the project's pictures; it follows the editor's scroll,
// and a double click goes to the line. The PDF stays the document; this is for writing.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './markdownPreview.css';
import type { EditorView } from '@codemirror/view';
import { blobUrl } from '../api/client';
import { CAPTION, CITE, DISPLAY, MATHS, NOTE, prepareMarkdown } from './previewText';
import { errorText } from './shared';

type HastNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; position?: { start: { line: number } }; children?: HastNode[] };

/** Each element's source line as data-line, from the parser's positions. */
const withLines = () => (tree: HastNode) => {
  const walk = (node: HastNode) => {
    if (node.type === 'element' && node.position && node.properties) node.properties['data-line'] = node.position.start.line;
    node.children?.forEach(walk);
  };
  walk(tree);
};

const textOf = (node?: HastNode): string => (node?.type === 'text' ? node.value ?? '' : (node?.children ?? []).map(textOf).join(''));
const lineOf = (node?: HastNode) => node?.position?.start.line ?? 0;

const maths = (tex: string, displayMode: boolean) => katex.renderToString(tex, { displayMode, throwOnError: false, strict: 'ignore', trust: false });

/** A picture's path in the project, from the .md's folder, or '' for one outside it or on the web (never fetched). */
function projectPath(src: string, doc: string) {
  if (!src || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(src)) return '';
  const parts = [...doc.split('/').slice(0, -1), ...decodeURI(src).split('/')];
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      if (!out.length) return '';
      out.pop();
    } else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

function Mermaid({ code, dark }: { code: string; dark: boolean }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      import('../diagram/modes/mermaid/render')
        .then(({ renderMermaid }) => renderMermaid(code, dark))
        .then(
          (next) => live && (setSvg(next), setError('')),
          (err) => live && setError(errorText(err))
        );
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [code, dark]);
  if (error) return <div className="md-preview-error">Mermaid couldn’t draw this diagram: {error}</div>;
  // the composer's settings: Mermaid's strict level, no HTML labels and no diagram CSS
  return <div className="md-preview-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function MarkdownPreview({ projectId, doc, text, dark, view }: { projectId: string; doc: string; text: string; dark: boolean; view: () => EditorView | null }) {
  const deferred = useDeferredValue(text);
  const prepared = useMemo(() => prepareMarkdown(deferred), [deferred]);
  const boxRef = useRef<HTMLDivElement>(null);
  const { meta, figures } = prepared;

  // the preview follows the editor: the block at the editor's top line comes to the top
  useEffect(() => {
    const editor = view();
    const box = boxRef.current;
    if (!editor || !box) return;
    const follow = () => {
      const line = editor.state.doc.lineAt(editor.lineBlockAtHeight(editor.scrollDOM.scrollTop).from).number;
      let target: HTMLElement | null = null;
      for (const el of box.querySelectorAll<HTMLElement>('[data-line]')) {
        if (Number(el.dataset.line) > line) break;
        target = el;
      }
      box.scrollTop = line <= 1 || !target ? 0 : target.offsetTop - 12;
    };
    editor.scrollDOM.addEventListener('scroll', follow, { passive: true });
    return () => editor.scrollDOM.removeEventListener('scroll', follow);
  }, [view, prepared]);

  const jump = (target: EventTarget) => {
    const line = Number((target as HTMLElement).closest<HTMLElement>('[data-line]')?.dataset.line);
    const editor = view();
    if (!editor || !line || line > editor.state.doc.lines) return;
    editor.dispatch({ selection: { anchor: editor.state.doc.line(line).from }, scrollIntoView: true });
    editor.focus();
  };

  const figure = (line: number, picture: ReactNode) => {
    const fig = figures.get(line);
    return fig ? (
      <figure data-line={line}>
        {picture}
        <figcaption>
          Figure {fig.number}: {fig.caption}
        </figcaption>
      </figure>
    ) : (
      picture
    );
  };

  return (
    <div className="md-preview" ref={boxRef} onDoubleClick={(e) => jump(e.target)}>
      <article className={`md md-preview-page${dark ? ' dark' : ''}`}>
        {(meta.title || meta.authors.length > 0 || meta.date) && (
          <header className="md-preview-title" data-line={1}>
            {meta.title && <h1>{meta.title}</h1>}
            {meta.authors.length > 0 && <div>{meta.authors.join(', ')}</div>}
            {meta.date && <div>{meta.date}</div>}
          </header>
        )}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[withLines]}
          components={{
            a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
            img: ({ node: _node, src, alt }) => {
              const file = projectPath(String(src ?? ''), doc);
              return file ? <img src={blobUrl(projectId, file)} alt={alt} /> : <span className="md-preview-missing">{alt || String(src ?? '')}</span>;
            },
            p: ({ node, children }) => {
              const line = lineOf(node as HastNode);
              return figures.has(line) ? figure(line, <span className="md-preview-picture">{children}</span>) : <p data-line={line}>{children}</p>;
            },
            pre: ({ node, children }) => {
              const code = (node as HastNode | undefined)?.children?.[0];
              const classes = (code?.properties?.className as string[] | undefined) ?? [];
              if (!classes.includes('language-mermaid')) return <pre data-line={lineOf(node as HastNode)}>{children}</pre>;
              const line = lineOf(node as HastNode);
              return <div data-line={line}>{figure(line, <Mermaid code={textOf(code).replace(/\n$/, '')} dark={dark} />)}</div>;
            },
            blockquote: ({ node, children }) => {
              const content = textOf(node as HastNode).trim();
              return content.startsWith(CAPTION) ? <p className="md-preview-caption" data-line={lineOf(node as HastNode)}>{content.slice(CAPTION.length)}</p> : <blockquote data-line={lineOf(node as HastNode)}>{children}</blockquote>;
            },
            code: ({ node: _node, className, children }) => {
              const value = String(children ?? '');
              if (value.startsWith(MATHS)) return <span dangerouslySetInnerHTML={{ __html: maths(value.slice(MATHS.length), false) }} />;
              if (value.startsWith(DISPLAY)) {
                const [number, ...tex] = value.slice(DISPLAY.length).split('|');
                return (
                  <span className="md-preview-display">
                    <span dangerouslySetInnerHTML={{ __html: maths(tex.join('|'), true) }} />
                    {number && <span className="md-preview-number">({number})</span>}
                  </span>
                );
              }
              if (value.startsWith(CITE)) return <span className="md-preview-cite">{value.slice(CITE.length)}</span>;
              if (value.startsWith(NOTE)) return <sup className="md-preview-note" title={value.slice(NOTE.length)}>note</sup>;
              return <code className={className}>{children}</code>;
            }
          }}
        >
          {prepared.markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
