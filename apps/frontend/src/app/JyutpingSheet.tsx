import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { jyutpingInfo, jyutpingPreview } from '../api/client';
import type { CompileEngine, JyutpingInfo, JyutpingOptions, JyutpingSettings } from '../api/client';
import { pdfPageCanvas } from '../diagram/Preview';
import { JYUTPING_DEFAULTS, cleanOptions } from '../editor/jyutping';
import { errorText } from '../editor/shared';
import Segmented from './Segmented';
import Select from './Select';
import Sheet from './Sheet';

const SAMPLE = '我哋去銀行，行路返屋企。校長喺學校長大。';
const OTHER = 'other';

type Mode = JyutpingSettings['mode'];
type TextKey = 'ratio' | 'vsep' | 'hsep' | 'font' | 'format' | 'multiple';
type SwitchKey = 'fancy' | 'linebreak' | 'debug';

/** The option's friendly name with the package's key after it. */
const named = (label: string, key: string): ReactNode => (
  <>
    {label} <span className="optional">{key}</span>
  </>
);

/** The engine the project's compiles use for xjyutping, which needs XeLaTeX or LuaLaTeX. */
export const jyutpingEngineLine = (engine: CompileEngine) =>
  engine === 'lualatex' ? 'Compiles with LuaLaTeX' : engine === 'xelatex' ? 'Compiles with XeLaTeX' : 'Compiles with XeLaTeX (or the built-in Tectonic)';

/**
 * The toolbar's 粵: Jyutping over the Chinese text with xjyutping, added as the project compiles or written into the
 * preamble, its options and Chinese font, and a preview of a line. Changes are saved to the project as they're made.
 * Closing it after a change, with the package in the preamble, brings the preamble up to date.
 */
export default function JyutpingSheet({
  initial,
  engine,
  folder,
  hasPackage,
  canWrap,
  hasSelection,
  onSave,
  onPreamble,
  onWrap,
  onClose
}: {
  initial: JyutpingSettings | null;
  engine: CompileEngine;
  /** Settings › Engines › LaTeX's xjyutping folder */
  folder: string;
  /** the document loads xjyutping already */
  hasPackage: boolean;
  /** the open file is a .tex */
  canWrap: boolean;
  hasSelection: boolean;
  onSave: (next: JyutpingSettings | null) => void;
  /** whether the document loads xjyutping afterwards; null when it couldn't be changed */
  onPreamble: (settings: JyutpingSettings, remove: boolean) => Promise<boolean | null>;
  onWrap: (kind: 'scope' | 'star' | 'insert') => void;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<JyutpingInfo | null>(null);
  const [infoError, setInfoError] = useState('');
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'off');
  const [options, setOptions] = useState<JyutpingOptions>(initial?.options ?? {});
  // null: the default font for the script, which follows a change of script
  const [fontChoice, setFontChoice] = useState<string | null>(initial?.cjkFont || null);
  const [other, setOther] = useState(!!initial?.cjkFont && !initial.cjkFont.startsWith('bundled:'));
  const [sample, setSample] = useState(SAMPLE);
  const [loaded, setLoaded] = useState(hasPackage);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState<{ state: 'idle' | 'compiling' | 'ok' | 'failed'; image?: { url: string; width: number; height: number }; error?: string; log?: string }>({ state: 'idle' });
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    jyutpingInfo(folder || undefined).then(
      (got) => {
        if (!live) return;
        setInfo(got);
        // a stored font that is a default is the default, so it follows the script again
        if (initial?.cjkFont && [got.defaultFont.tc, got.defaultFont.sc].map(bundled).includes(initial.cjkFont)) setFontChoice(null);
      },
      (err) => live && setInfoError(errorText(err))
    );
    return () => {
      live = false;
    };
  }, [folder]);

  const defaultFont = info ? bundled(options.script === 'simplified' ? info.defaultFont.sc : info.defaultFont.tc) : '';
  const font = (other ? fontChoice?.trim() : fontChoice) || defaultFont;
  const clean = cleanOptions(options);
  const current: JyutpingSettings = { mode, options: clean, cjkFont: font };
  const stored = mode === 'off' && !Object.keys(clean).length && fontChoice === null ? null : current;
  const storedKey = JSON.stringify(stored);

  // saved as it changes, after a pause in typing; the last change goes as the sheet closes
  const savedRef = useRef(JSON.stringify(initial ?? null));
  const latest = useRef({ stored, storedKey, current });
  latest.current = { stored, storedKey, current };
  const save = () => {
    if (latest.current.storedKey === savedRef.current || !info) return;
    savedRef.current = latest.current.storedKey;
    onSave(latest.current.stored);
  };
  useEffect(() => {
    const timer = window.setTimeout(save, 500);
    return () => window.clearTimeout(timer);
  }, [storedKey, info]);

  const close = () => {
    const changed = latest.current.storedKey !== JSON.stringify(initial ?? null);
    save();
    // no stale font or options left in the preamble
    if (changed && info && mode === 'manual' && loaded) void onPreamble(latest.current.current, false);
    onClose();
  };

  // the preview, after a pause; a newer change cancels the request before it
  const previewKey = JSON.stringify([clean, font, sample, engine, folder]);
  useEffect(() => {
    if (!info && !infoError) return;
    const ctl = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreview((was) => ({ ...was, state: 'compiling' }));
      try {
        const res = await jyutpingPreview({ options: clean, cjkFont: font, engine, text: sample, folder: folder || undefined }, ctl.signal);
        if (ctl.signal.aborted) return;
        if (!res.ok) {
          setPreview((was) => ({ ...was, state: 'failed', error: res.error, log: res.log }));
          return;
        }
        const room = pageRef.current?.clientWidth || 480;
        const fit = (w: number, h: number) => Math.min(room / w, 220 / h);
        const { canvas, width, height } = await pdfPageCanvas(res.pdf, (w, h) => fit(w, h) * window.devicePixelRatio);
        if (ctl.signal.aborted) return;
        setPreview({ state: 'ok', image: { url: canvas.toDataURL('image/png'), width: width * fit(width, height), height: height * fit(width, height) } });
      } catch (err) {
        if (!ctl.signal.aborted) setPreview((was) => ({ ...was, state: 'failed', error: errorText(err), log: '' }));
      }
    }, 600);
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [previewKey, !!info || !!infoError]);

  const set = (patch: JyutpingOptions) => setOptions((was) => ({ ...was, ...patch }));

  const preamble = async (remove: boolean) => {
    setBusy(remove ? 'remove' : 'add');
    const now = await onPreamble(current, remove);
    if (now !== null) setLoaded(now);
    setBusy('');
  };

  const text = (key: TextKey, label: ReactNode, hint: string, type = 'text') => (
    <div className="field">
      <label htmlFor={`jyut-${key}`}>{label}</label>
      <input
        id={`jyut-${key}`}
        className="input"
        type={type}
        step={type === 'number' ? 0.05 : undefined}
        min={type === 'number' ? 0.1 : undefined}
        spellCheck={false}
        placeholder={JYUTPING_DEFAULTS[key] || (key === 'format' ? '\\color{gray}' : key === 'multiple' ? '\\color{red}' : '')}
        value={options[key] ?? ''}
        onChange={(e) => set({ [key]: e.target.value })}
      />
      <span className="field-hint">{hint}</span>
    </div>
  );
  const toggle = (key: SwitchKey, label: ReactNode, hint: string) => (
    <label className="checkbox-row">
      <input type="checkbox" role="switch" checked={!!options[key]} onChange={(e) => set({ [key]: e.target.checked })} />
      <span>
        <span>{label}</span>
        <span className="field-hint">{hint}</span>
      </span>
    </label>
  );
  const choice = <T extends string>(id: string, label: ReactNode, value: T, choices: readonly (readonly [T, string])[], onChange: (v: T) => void, hint: string, extra?: ReactNode) => (
    <div className="field">
      <span className="field-label" id={`jyut-${id}`}>{label}</span>
      <Segmented className="fill" labelledBy={`jyut-${id}`} value={value} options={choices} onChange={onChange} />
      {extra}
      <span className="field-hint">{hint}</span>
    </div>
  );

  const width = !options.width || options.width === 'auto' ? 'auto' : options.width === 'natural' ? 'natural' : 'length';
  const fonts = info ? [...info.fonts].sort((a, b) => (a.script === b.script ? 0 : a.script === 'tc' ? -1 : 1)) : [];

  return (
    <Sheet
      title="Jyutping"
      width={580}
      onClose={close}
      actions={
        <>
          <button className="btn" disabled={!Object.keys(clean).length && fontChoice === null} onClick={() => {
            setOptions({});
            setFontChoice(null);
            setOther(false);
          }}>
            Reset to defaults
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={close}>Done</button>
        </>
      }
    >
      <Segmented
        className="fill"
        label="Jyutping"
        value={mode}
        options={[['off', 'Off'], ['auto', 'Apply when compiling'], ['manual', 'In the .tex file']] as const}
        onChange={setMode}
      />
      {mode === 'off' && <p className="field-hint">Spectrum doesn’t add Jyutping to this project.</p>}
      {mode === 'auto' && <p className="field-hint">Spectrum adds Jyutping to the Chinese text each time it compiles. Your .tex files don’t change.</p>}
      {mode === 'manual' && (
        <>
          <p className="field-hint">
            The package goes in your preamble with these options and font. Put the Chinese text in a <code>jyutpingscope</code> or <code>\xjyutping*{'{…}'}</code>.
          </p>
          <div className="jyut-actions">
            <button className="btn" disabled={!!busy || !info} onClick={() => preamble(false)}>
              {busy === 'add' && <span className="spinner" />} {loaded ? 'Update preamble' : 'Add to preamble'}
            </button>
            {loaded && (
              <button className="btn" disabled={!!busy} onClick={() => preamble(true)}>
                {busy === 'remove' && <span className="spinner" />} Remove from preamble
              </button>
            )}
            <button className="btn" disabled={!canWrap || !hasSelection} onClick={() => wrapAndClose('scope')}>Wrap selection in scope</button>
            <button className="btn" disabled={!canWrap || !hasSelection} onClick={() => wrapAndClose('star')}>Wrap selection in \xjyutping*</button>
            <button className="btn" disabled={!canWrap} onClick={() => wrapAndClose('insert')}>Insert scope at cursor</button>
          </div>
        </>
      )}

      <div className="field">
        <span className="field-label" id="jyut-cjk-font">Chinese font</span>
        <Select
          labelId="jyut-cjk-font"
          value={other ? OTHER : font}
          placeholder={infoError ? 'Couldn’t list the fonts' : 'Loading…'}
          options={[
            ...fonts.map((f): [string, ReactNode] => [
              bundled(f.id),
              <>
                {f.name}
                {f.nameZh && ` ${f.nameZh}`} <span className="optional">{f.script === 'tc' ? 'Traditional' : 'Simplified'}</span>
              </>
            ]),
            [OTHER, 'Other font installed on this computer…']
          ]}
          onChange={(v) => {
            if (v === OTHER) {
              setOther(true);
              setFontChoice(fontChoice && !fontChoice.startsWith('bundled:') ? fontChoice : '');
            } else {
              setOther(false);
              setFontChoice(v === defaultFont ? null : v);
            }
          }}
        />
        {other && (
          <input
            className="input"
            aria-label="Font name"
            placeholder={'Font name, such as Songti TC'}
            spellCheck={false}
            autoFocus
            value={fontChoice ?? ''}
            onChange={(e) => setFontChoice(e.target.value)}
          />
        )}
        <span className="field-hint">Spectrum’s fonts are open source and load by themselves. CJK support turns on as the document needs it.</span>
      </div>

      <div className="field">
        <label htmlFor="jyut-sample">Preview</label>
        <input id="jyut-sample" className="input" value={sample} onChange={(e) => setSample(e.target.value)} />
        <div className="jyut-preview" ref={pageRef} aria-live="polite">
          {preview.image ? (
            <img src={preview.image.url} alt={`The line with Jyutping: ${sample}`} style={{ width: preview.image.width, height: preview.image.height }} className={preview.state === 'ok' ? '' : 'stale'} />
          ) : (
            preview.state !== 'failed' && <span className="field-hint">{preview.state === 'compiling' ? 'Compiling…' : 'The line shows here with its Jyutping.'}</span>
          )}
          {preview.state === 'compiling' && preview.image && <span className="spinner" />}
        </div>
        {preview.state === 'failed' && (
          <>
            <span className="field-hint error">Couldn’t compile the preview: {preview.error}</span>
            {preview.log && (
              <details className="agent-advanced">
                <summary>Show the log</summary>
                <pre className="log-box">{preview.log}</pre>
              </details>
            )}
          </>
        )}
      </div>

      <h3 className="form-section-title">Options</h3>
      <div className="jyut-grid">
        {text('ratio', named('Size', 'ratio'), 'Size of the Jyutping next to the text.', 'number')}
        {text('vsep', named('Height', 'vsep'), 'Height of the Jyutping above the character.')}
        {text('hsep', named('Spacing', 'hsep'), 'Space between characters. The stretch lets lines justify.')}
        {text('font', named('Jyutping font', 'font'), 'Font of the Jyutping.')}
        {text('format', named('Format', 'format'), 'Extra formatting, such as \\color{gray}.')}
        {text('multiple', named('Guessed readings', 'multiple'), 'Formatting for guessed readings, to proofread them.')}
      </div>
      {choice(
        'width',
        named('Cell width', 'width'),
        width,
        [['auto', 'Auto'], ['natural', 'Natural'], ['length', 'Fixed']] as const,
        (v) => set({ width: v === 'length' ? (width === 'length' ? options.width : '1.8em') : v }),
        'Auto fits the longest Jyutping in the block, Natural makes each cell as wide as it needs and Fixed gives a grid.',
        width === 'length' && <input className="input" aria-label="Cell width" spellCheck={false} placeholder="1.8em" value={options.width ?? ''} onChange={(e) => set({ width: e.target.value })} />
      )}
      {choice(
        'script',
        named('Script', 'script'),
        options.script ?? 'auto',
        [['auto', 'Auto'], ['simplified', 'Simplified'], ['traditional', 'Traditional']] as const,
        (v) => set({ script: v }),
        'Auto judges each paragraph. Simplified suits a document in simplified characters throughout.'
      )}
      {choice(
        'lazy',
        named('Lazy sounds (懶音)', 'lazy'),
        options.lazy === 'all' ? 'all' : options.lazy ? 'on' : 'off',
        [['off', 'Off'], ['on', 'On'], ['all', 'All']] as const,
        (v) => set({ lazy: v === 'all' ? 'all' : v === 'on' }),
        'On turns n- into l- and drops ng- (你 lei5, 我 o5). All also turns -ng into -n and -k into -t.'
      )}
      {choice(
        'align',
        named('Alignment', 'align'),
        options.align ?? 'justify',
        [['justify', 'Justify'], ['left', 'Left'], ['centre', 'Centre'], ['right', 'Right']] as const,
        (v) => set({ align: v }),
        'How the lines of a scope are set.'
      )}
      {toggle('fancy', named('Fancy tones', 'fancy'), 'Tones drawn as pitch strokes, as in Visual Jyutping.')}
      {toggle('linebreak', named('Keep line breaks', 'linebreak'), 'Keeps the lines of the source, for verse and lyrics.')}
      {toggle('debug', named('Debug', 'debug'), 'Logs how each run of text was read.')}

      <p className="field-hint">
        {info ? `xjyutping ${info.version}, ${info.source === 'folder' ? 'from your folder' : 'built in'}. ` : ''}
        {jyutpingEngineLine(engine)}.
      </p>
      {info?.folderProblem && <p className="field-hint error">{info.folderProblem}</p>}
      {infoError && <p className="field-hint error">Couldn’t find the xjyutping package: {infoError}</p>}
    </Sheet>
  );

  // wrapped first, so a preamble brought up to date on closing starts from the wrapped text
  function wrapAndClose(kind: 'scope' | 'star' | 'insert') {
    onWrap(kind);
    close();
  }
}

const bundled = (id: string) => (id.startsWith('bundled:') ? id : `bundled:${id}`);
