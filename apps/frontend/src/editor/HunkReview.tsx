import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MutableRefObject } from 'react';
import { base64Bytes, previewReview } from '../api/client';
import type { EditorApi } from './EditorContext';
import PdfPreview from './PdfPreview';
import { errorText } from './shared';
import SplitDiffView, { DiffCount } from './SplitDiffView';
import { countOf, editText, editedLines, sections, target, where } from './reviewHunks';
import type { Choice, Hunk, Review } from './reviewHunks';

/** A review's keys, handled by the file in view; the review's container calls it from its own onKeyDown. */
export type ReviewKeys = MutableRefObject<((e: KeyboardEvent) => void) | null>;

const typing = (el: EventTarget) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** The keys a review takes, under its diff. */
function KeysHint({ apply }: { apply: string }) {
  return (
    <div className="hunk-hint">
      <kbd>J</kbd> <kbd>K</kbd> next and previous change <kbd>A</kbd> {apply.toLowerCase()} <kbd>R</kbd> reject <kbd>E</kbd> edit
    </div>
  );
}

/**
 * One file's change as its separate changes, side by side with the file as it is: each with Apply, Reject and Edit,
 * and where the user changed the same lines, their version beside the agent's with a choice between them. onChoice
 * says what to do with a choice (reviewHunks' settle turns it into text); without it the changes are only shown.
 */
export default function HunkList({
  path,
  review: r,
  leftLabel,
  rightLabel,
  busy,
  keys,
  applyLabel = 'Apply',
  onChoice,
  onPast
}: {
  path: string;
  review: Review;
  leftLabel: string;
  rightLabel: string;
  busy: boolean;
  keys: ReviewKeys;
  applyLabel?: string;
  onChoice?: (choice: Choice) => void;
  /** J past the last change (1) or K before the first (-1) */
  onPast?: (direction: 1 | -1) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(0);
  const [editing, setEditing] = useState<{ hunk: Hunk; text: string } | null>(null);
  const mine = useMemo(() => r.mine.join(''), [r]);
  const after = useMemo(() => target(r), [r]);
  const titles = useMemo(() => sections(path, r), [path, r]);
  const sectioned = new Set(titles).size > 1;
  const at = Math.min(focus, r.hunks.length - 1);
  const edit = editing && r.hunks.includes(editing.hunk) ? editing : null;

  const show = (index: number) => {
    setFocus(index);
    requestAnimationFrame(() => root.current?.querySelector(`[data-hunk="${index}"]`)?.scrollIntoView({ block: 'nearest' }));
  };
  // an overlap's editor starts from both versions, the user's first, so nothing of theirs is lost while they edit
  const startEdit = (h: Hunk) => setEditing({ hunk: h, text: editText(h.base ? { ...h, lines: [...r.mine.slice(h.start, h.end), ...h.lines] } : h) });
  const applyEdit = () => {
    if (!edit || busy) return;
    onChoice?.({ apply: [edit.hunk], lines: new Map([[edit.hunk, editedLines(r, edit.hunk, edit.text)]]) });
    setEditing(null);
  };

  const onKey: ReviewKeys['current'] = onChoice
    ? (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing || typing(e.target)) return;
        const key = e.key.toLowerCase();
        const h = r.hunks[at];
        if (key === 'j' || key === 'k') {
          const next = at + (key === 'j' ? 1 : -1);
          if (next < 0 || next >= r.hunks.length) onPast?.(key === 'j' ? 1 : -1);
          else show(next);
        } else if (!h || busy) return;
        else if (key === 'a') onChoice({ apply: [h] });
        else if (key === 'r') onChoice({ reject: [h] });
        else if (key === 'e') startEdit(h);
        else return;
        e.preventDefault();
      }
    : null;
  // this file's keys while it is the one in view: the file shown before lets go of its own, never of this one's
  useEffect(() => {
    keys.current = onKey;
    return () => {
      if (keys.current === onKey) keys.current = null;
    };
  });

  const sectionCount = (i: number) => {
    let n = 1;
    while (titles[i + n] === titles[i] && i + n < titles.length) n++;
    return n;
  };

  return (
    <div className="hunk-list" ref={root}>
      {r.eol && onChoice && (
        <div className="hunk-bar hunk-note">
          <span className="grow">
            The agent also changed this file’s line endings, from {r.eol.from === '\n' ? 'LF' : 'CRLF'} to {r.eol.to === '\n' ? 'LF' : 'CRLF'}.
          </span>
          <button className="btn small" disabled={busy} onClick={() => onChoice({ eol: 'reject' })}>Keep mine</button>
          <button className="btn small" disabled={busy} onClick={() => onChoice({ eol: 'apply' })}>{applyLabel}</button>
        </div>
      )}
      <SplitDiffView
        original={mine}
        proposed={after}
        hunks={r.hunks}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
        resetKey={path}
        hunk={
          onChoice &&
          ((i, rows) => {
            const h = r.hunks[i];
            return (
              <div key={`hunk-${h.start}:${h.end}`} className={`hunk ${i === at ? 'focused' : ''} ${h.base ? 'overlap' : ''}`} data-hunk={i} onMouseDown={() => setFocus(i)}>
                {sectioned && titles[i] !== titles[i - 1] && (
                  <div className="hunk-section">
                    <span className="truncate">{titles[i] || 'Before the first heading'}</span>
                    <span>
                      {sectionCount(i)} {sectionCount(i) === 1 ? 'change' : 'changes'}
                    </span>
                  </div>
                )}
                <div className="hunk-bar">
                  <span className="hunk-where">{where(h)}</span>
                  <DiffCount {...countOf([h])} />
                  {h.base && <span className="badge warning">You changed these lines too</span>}
                  <span className="grow" />
                  {h.base ? (
                    <>
                      <button className="btn small" disabled={busy} onClick={() => startEdit(h)}>Edit</button>
                      <button className="btn small" disabled={busy} title="Leave your lines as they are" onClick={() => onChoice({ reject: [h] })}>Keep mine</button>
                      <button className="btn small" disabled={busy} title="Your lines, then the agent’s" onClick={() => onChoice({ apply: [h], lines: new Map([[h, [...r.mine.slice(h.start, h.end), ...h.lines]]]) })}>
                        Take both
                      </button>
                      <button className={`btn small ${i === at ? 'primary' : ''}`} disabled={busy} title="Replace your lines with the agent’s" onClick={() => onChoice({ apply: [h] })}>
                        Use the agent’s
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn small" disabled={busy} onClick={() => startEdit(h)}>Edit</button>
                      <button className="btn small" disabled={busy} onClick={() => onChoice({ reject: [h] })}>Reject</button>
                      <button className={`btn small ${i === at ? 'primary' : ''}`} disabled={busy} onClick={() => onChoice({ apply: [h] })}>{applyLabel}</button>
                    </>
                  )}
                </div>
                {rows}
                {edit?.hunk === h && (
                  <div className="hunk-edit">
                    <textarea
                      autoFocus
                      spellCheck={false}
                      aria-label="The text this change puts in"
                      rows={Math.min(14, Math.max(3, edit.text.split('\n').length + 1))}
                      value={edit.text}
                      onChange={(e) => setEditing({ hunk: h, text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === 'Escape') {
                          // the editor closes, not the sheet around it
                          e.stopPropagation();
                          setEditing(null);
                        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) applyEdit();
                      }}
                    />
                    <div className="row">
                      <span className="field-hint grow">
                        {h.base ? 'Your lines, then the agent’s: edit them into what the file should say.' : 'What you apply is written in place of the lines on the left.'}
                      </span>
                      <button className="btn small" onClick={() => setEditing(null)}>Cancel</button>
                      <button className="btn small primary" disabled={busy} onClick={applyEdit}>{applyLabel} edited</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        }
      />
      {onChoice && r.hunks.length > 0 && <KeysHint apply={applyLabel} />}
    </div>
  );
}

// ─── The PDF before and after ───

export type Pdf = { pdf: string | null; log: string };

function Preview({ load, pageKey, busyText, failText }: { load(): Promise<Pdf>; pageKey: string; busyText: string; failText: string }) {
  const [state, setState] = useState<{ url?: string; log?: string; error?: string } | null>(null);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    let live = true;
    let url = '';
    setState(null);
    load().then(
      (res) => {
        if (!live) return;
        if (res.pdf) url = URL.createObjectURL(new Blob([base64Bytes(res.pdf)], { type: 'application/pdf' }));
        setState(url ? { url } : { log: res.log || 'No PDF was made.' });
      },
      (err) => live && setState({ error: errorText(err) })
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [asked]);
  const none = () => undefined;
  if (!state) return <div className="agent-empty"><span className="spinner" /> {busyText}</div>;
  if (!state.url)
    return (
      <div className="agent-preview-log">
        <div className="row">
          <span className="grow">{state.error ? `Couldn’t make the preview: ${state.error}` : failText}</span>
          <button className="btn small" onClick={() => setAsked((n) => n + 1)}>Try again</button>
        </div>
        {state.log && <pre className="agent-output">{state.log.slice(0, 20000)}</pre>}
      </div>
    );
  return (
    <div className="pdf-body">
      <PdfPreview url={state.url} pageKey={pageKey} zoom="width" spread={false} annotateMode={false} annotations={[]} onAddAnnotation={none} onDoubleClick={none} onPageMenu={none} onLoad={none} onScale={none} onZoom={none} onPage={none} onSection={none} onFileLink={none} />
    </div>
  );
}

/**
 * The PDF before and after the changes in review, side by side (one above the other in a narrow pane): the project as
 * it is, and with every pending change applied, each compiled on a copy in isolation. version: what the two were
 * compiled from, so a change applied or rejected compiles them again.
 * ponytail: two whole documents, each scrolled by itself; the changed pages alone, scrolled together, if this is used much.
 */
export function PdfCompare({ version, before, after }: { version: string; before(): Promise<Pdf>; after(): Promise<Pdf> }) {
  return (
    <div className="agent-compare">
      <div className="agent-compare-side">
        <div className="agent-compare-label">Before</div>
        <Preview key={version} load={before} pageKey="review-before" busyText="Compiling the project as it is…" failText="The project as it is didn’t compile." />
      </div>
      <div className="agent-compare-side">
        <div className="agent-compare-label">After</div>
        <Preview key={version} load={after} pageKey="review-after" busyText="Compiling it with the changes…" failText="The project with the changes didn’t compile." />
      </div>
    </div>
  );
}

/** The PDFs of a project's review that no session made: the project as it is, and with `files` laid over a copy. */
export function reviewPdfs(api: Pick<EditorApi, 'projectId' | 'settings' | 'save'>, files: () => { path: string; content: string | null }[]) {
  const { typstVersion, markdownEngine } = api.settings.compileDefaults;
  const load = (which: 'before' | 'after') => () => api.save().then(() => previewReview(api.projectId, { which, files: which === 'after' ? files() : [], compile: { typstVersion, markdownEngine } }));
  return { before: load('before'), after: load('after') };
}
