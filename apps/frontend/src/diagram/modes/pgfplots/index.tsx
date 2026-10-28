import { useContext, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { getFile, getProjectTree } from '../../../api/client';
import Icon from '../../../app/Icon';
import Select from '../../../app/Select';
import { ColourField, ProjectContext, Row } from '../../controls';
import type { DiagramMode } from '../../types';
import { nextId } from '../tikz/code';
import { columnsOf, emptyPlot, newSeries, plotCode } from './code';
import type { Annotation, AnnotationKind, LegendPos, Piece, PlotModel, Series, SeriesSource, Signal } from './code';

// Plots: the form that writes the axis, previewed below it

const DATA_FILE = /\.(csv|tsv|dat|txt)$/i;
const LINES: [Series['line'], string][] = [
  ['solid', 'Solid'],
  ['dashed', 'Dashed'],
  ['dotted', 'Dotted']
];
const GRIDS: [PlotModel['grid'], string][] = [
  ['none', 'None'],
  ['major', 'Major lines'],
  ['both', 'Major and minor lines']
];
const LEGEND_PLACES: [LegendPos, string][] = [
  ['north west', 'Top left'],
  ['north east', 'Top right'],
  ['south west', 'Bottom left'],
  ['south east', 'Bottom right'],
  ['outer north east', 'Outside, top right']
];
const SOURCES: [SeriesSource, string][] = [
  ['function', 'Function y = f(x)'],
  ['data', 'Data file'],
  ['parametric', 'Parametric (x(t), y(t))'],
  ['polar', 'Polar r = f(t)'],
  ['piecewise', 'Piecewise function'],
  ['signal', 'Signal'],
  ['quiver', 'Vector field']
];
const SIGNALS: [Signal, string][] = [
  ['sine', 'Sine'],
  ['square', 'Square'],
  ['triangle', 'Triangle'],
  ['sawtooth', 'Sawtooth'],
  ['pulse', 'Pulse train'],
  ['rectified', 'Rectified sine'],
  ['step', 'Step']
];
const AXES: [string, string][] = [
  ['box', 'Box'],
  ['centre', 'Through the origin'],
  ['sketch', 'Sketch: arrows, no ticks']
];
const SCALES: [string, string][] = [
  ['linear', 'Linear'],
  ['log', 'Logarithmic']
];
const KINDS: [AnnotationKind, string][] = [
  ['point', 'Point with drop lines'],
  ['tangent', 'Tangent'],
  ['secant', 'Secant'],
  ['line', 'Reference line'],
  ['area', 'Shaded area'],
  ['label', 'Label on the curve']
];
const PLACES: [string, string][] = [
  ['above', 'Above'],
  ['below', 'Below'],
  ['left', 'Left'],
  ['right', 'Right']
];

/** Two inputs side by side in a row. */
function Pair({ label, values, labels, placeholder, onChange }: { label: string; values: string[]; labels: string[]; placeholder?: string; onChange(i: number, value: string): void }) {
  return (
    <div className="diagram-row">
      <span>{label}</span>
      <span className="diagram-pair">
        {values.map((value, i) => (
          <input key={labels[i]} className="input" inputMode="decimal" spellCheck={false} placeholder={placeholder} aria-label={labels[i]} value={value} onChange={(e) => onChange(i, e.target.value)} />
        ))}
      </span>
    </div>
  );
}

/** The fields of a series of each kind but data, whose file and columns the form shows itself. */
function SeriesFields({ s, patch }: { s: Series; patch(next: Partial<Series>): void }) {
  const samples = (
    <input className="input" type="number" min={2} max={2000} aria-label="Samples" value={s.samples} onChange={(e) => patch({ samples: Number(e.target.value) })} />
  );
  switch (s.source) {
    case 'function':
      return (
        <>
          <Row label="y = (in x; sin and cos take radians)">
            <input className="input mono" spellCheck={false} value={s.expr} onChange={(e) => patch({ expr: e.target.value })} />
          </Row>
          <div className="diagram-row">
            <span>x from, to, samples</span>
            <span className="diagram-pair">
              <input className="input" inputMode="decimal" aria-label="x from" value={s.from} onChange={(e) => patch({ from: e.target.value })} />
              <input className="input" inputMode="decimal" aria-label="x to" value={s.to} onChange={(e) => patch({ to: e.target.value })} />
              {samples}
            </span>
          </div>
        </>
      );
    case 'parametric':
    case 'polar':
      return (
        <>
          {s.source === 'parametric' && (
            <Row label="x = (in t)">
              <input className="input mono" spellCheck={false} value={s.exprX ?? ''} onChange={(e) => patch({ exprX: e.target.value })} />
            </Row>
          )}
          <Row label={s.source === 'polar' ? 'r = (in t, radians)' : 'y = (in t)'}>
            <input className="input mono" spellCheck={false} value={s.expr} onChange={(e) => patch({ expr: e.target.value })} />
          </Row>
          <div className="diagram-row">
            <span>t from, to, samples</span>
            <span className="diagram-pair">
              <input className="input" spellCheck={false} aria-label="t from" value={s.from} onChange={(e) => patch({ from: e.target.value })} />
              <input className="input" spellCheck={false} aria-label="t to" placeholder="2*pi" value={s.to} onChange={(e) => patch({ to: e.target.value })} />
              {samples}
            </span>
          </div>
        </>
      );
    case 'piecewise': {
      const pieces = s.pieces ?? [];
      const set = (i: number, next: Partial<Piece>) => patch({ pieces: pieces.map((p, j) => (j === i ? { ...p, ...next } : p)) });
      return (
        <>
          {pieces.map((p, i) => (
            <div key={i} className="diagram-row">
              <span>Piece {i + 1}: y =, x from, to</span>
              <span className="diagram-pair">
                <input className="input mono" spellCheck={false} aria-label={`Piece ${i + 1}, y =`} value={p.expr} onChange={(e) => set(i, { expr: e.target.value })} />
                <input className="input" inputMode="decimal" aria-label={`Piece ${i + 1}, x from`} value={p.from} onChange={(e) => set(i, { from: e.target.value })} />
                <input className="input" inputMode="decimal" aria-label={`Piece ${i + 1}, x to`} value={p.to} onChange={(e) => set(i, { to: e.target.value })} />
                <button type="button" className="icon-btn small destructive" title="Remove this piece" aria-label={`Remove piece ${i + 1}`} onClick={() => patch({ pieces: pieces.filter((_, j) => j !== i) })}>
                  <Icon name="trash" />
                </button>
              </span>
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => patch({ pieces: [...pieces, { expr: 'x', from: pieces[pieces.length - 1]?.to ?? '0', to: String(Number(pieces[pieces.length - 1]?.to ?? 0) + 1) }] })}>
            <Icon name="plus" /> Add a piece
          </button>
          <div className="diagram-row">
            <span>Samples per piece</span>
            {samples}
          </div>
        </>
      );
    }
    case 'signal':
      return (
        <>
          <Row label="Waveform">
            <Select value={s.signal ?? 'square'} options={SIGNALS} onChange={(signal) => patch({ signal: signal as Signal })} />
          </Row>
          <Pair
            label={s.signal === 'step' ? 'Height, steps at t =' : 'Amplitude, period'}
            values={[s.amplitude ?? '1', s.period ?? '1']}
            labels={['Amplitude', s.signal === 'step' ? 'Step time' : 'Period']}
            onChange={(i, value) => patch(i ? { period: value } : { amplitude: value })}
          />
          {s.signal === 'pulse' && <Pair label="Fraction of each period high" values={[s.duty ?? '0.5']} labels={['Duty cycle']} onChange={(_, duty) => patch({ duty })} />}
          <Pair label="t from, to" values={[s.from, s.to]} labels={['t from', 't to']} onChange={(i, value) => patch(i ? { to: value } : { from: value })} />
        </>
      );
    case 'quiver':
      return (
        <>
          <Row label="Arrow across, u = (in x and y)">
            <input className="input mono" spellCheck={false} value={s.exprX ?? ''} onChange={(e) => patch({ exprX: e.target.value })} />
          </Row>
          <Row label="Arrow up, v = (in x and y)">
            <input className="input mono" spellCheck={false} value={s.expr} onChange={(e) => patch({ expr: e.target.value })} />
          </Row>
          <div className="diagram-row">
            <span>x and y from, to, arrows a side</span>
            <span className="diagram-pair">
              <input className="input" inputMode="decimal" aria-label="From" value={s.from} onChange={(e) => patch({ from: e.target.value })} />
              <input className="input" inputMode="decimal" aria-label="To" value={s.to} onChange={(e) => patch({ to: e.target.value })} />
              <input className="input" type="number" min={2} max={40} aria-label="Arrows a side" value={s.samples} onChange={(e) => patch({ samples: Number(e.target.value) })} />
            </span>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" role="switch" checked={!!s.normalise} onChange={(e) => patch({ normalise: e.target.checked || undefined })} />
            <span>
              Arrows of one length
              <span className="field-hint">For a slope field, with u = 1 and v = dy/dx.</span>
            </span>
          </label>
        </>
      );
    default:
      return null;
  }
}

/** A new series of a kind, keeping what the kinds share. */
function asKind(s: Series, source: SeriesSource): Partial<Series> {
  switch (source) {
    case 'parametric':
      return { source, exprX: s.exprX || 'cos(t)', expr: 'sin(t)', from: '0', to: '2*pi' };
    case 'polar':
      return { source, expr: '1+cos(t)', from: '0', to: '2*pi' };
    case 'piecewise':
      return { source, pieces: s.pieces?.length ? s.pieces : [{ expr: '-x', from: '-2', to: '0' }, { expr: 'x^2', from: '0', to: '2' }] };
    case 'signal':
      return { source, signal: s.signal ?? 'square', amplitude: s.amplitude ?? '1', period: s.period ?? '2', duty: s.duty ?? '0.5', from: '0', to: '6' };
    case 'quiver':
      return { source, exprX: '1', expr: 'x - y', from: '-2', to: '2', samples: 15, normalise: true };
    case 'function':
      return { source, expr: 'x^2', from: '-2', to: '2', samples: 100 };
    default:
      return { source };
  }
}

/** An annotation's fields: the curve it's on, where, and its text. */
function AnnotationFields({ a, functions, patch }: { a: Annotation; functions: [string, string][]; patch(next: Partial<Annotation>): void }) {
  const curve = (label: string, key: 'series' | 'series2', none?: string) => (
    <Row label={label}>
      <Select value={a[key] ?? ''} options={none ? [['', none], ...functions] : functions} placeholder={functions.length ? 'Choose a function' : 'Add a function series first'} onChange={(id) => patch({ [key]: id || undefined })} />
    </Row>
  );
  const text = (label: string) => (
    <Row label={label}>
      <input className="input" spellCheck={false} value={a.text ?? ''} onChange={(e) => patch({ text: e.target.value })} />
    </Row>
  );
  const at = (label: string) => <Pair label={label} values={[a.at]} labels={[label]} onChange={(_, value) => patch({ at: value })} />;
  switch (a.kind) {
    case 'line':
      return (
        <>
          <Row label="Line">
            <Select value={a.axis ?? 'x'} options={[['x', 'Up and down, at x ='], ['y', 'Across, at y =']]} onChange={(axis) => patch({ axis: axis as 'x' | 'y' })} />
          </Row>
          {at(a.axis === 'y' ? 'y =' : 'x =')}
          {text('Label (LaTeX)')}
        </>
      );
    case 'secant':
    case 'area':
      return (
        <>
          {curve('On', 'series')}
          {a.kind === 'area' && curve('Down to', 'series2', 'The x axis (y = 0)')}
          <Pair label="x from, to" values={[a.at, a.to ?? '']} labels={['x from', 'x to']} onChange={(i, value) => patch(i ? { to: value } : { at: value })} />
        </>
      );
    default:
      return (
        <>
          {curve('On', 'series')}
          {at('At x =')}
          {(a.kind === 'point' || a.kind === 'label') && text('Label (LaTeX)')}
          {(a.kind === 'point' || a.kind === 'label') && (
            <Row label="Label goes">
              <Select value={a.place ?? (a.kind === 'point' ? 'above right' : 'above')} options={a.kind === 'point' ? [['above right', 'Above right'], ...PLACES] : PLACES} onChange={(place) => patch({ place: place as Annotation['place'] })} />
            </Row>
          )}
        </>
      );
  }
}

/** The project's data files, and each one's columns once asked for. */
function useDataFiles(projectId: string, wanted: string[]) {
  const [files, setFiles] = useState<string[]>([]);
  const [columns, setColumns] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!projectId) return;
    getProjectTree(projectId)
      .then(({ items }) => setFiles(items.filter((i) => i.type === 'file' && DATA_FILE.test(i.path)).map((i) => i.path)))
      .catch(() => setFiles([]));
  }, [projectId]);
  const missing = wanted.filter((file) => file && !(file in columns));
  useEffect(() => {
    for (const file of missing) {
      getFile(projectId, file)
        .then(({ content }) => setColumns((prev) => ({ ...prev, [file]: columnsOf(file, content.slice(0, 64 * 1024)) })))
        .catch(() => setColumns((prev) => ({ ...prev, [file]: [] })));
    }
  }, [missing.join('\n')]);
  return { files, columns };
}

type CanvasProps = ComponentProps<DiagramMode<PlotModel>['Canvas']>;

function Canvas({ model, onChange, readOnly }: CanvasProps) {
  const projectId = useContext(ProjectContext);
  const { files, columns } = useDataFiles(projectId, model.series.map((s) => (s.source === 'data' ? s.file : '')));
  const patch = (next: Partial<PlotModel>) => onChange({ ...model, ...next });
  const patchSeries = (id: string, next: Partial<Series>) => patch({ series: model.series.map((s) => (s.id === id ? { ...s, ...next } : s)) });
  const patchAnnotation = (id: string, next: Partial<Annotation>) => patch({ annotations: model.annotations?.map((a) => (a.id === id ? { ...a, ...next } : a)) });
  // the function series an annotation can be on, by their place in the list
  const functions: [string, string][] = model.series.flatMap((s, i): [string, string][] => (s.source === 'function' ? [[s.id, `Series ${i + 1}: y = ${s.expr}`]] : []));
  const text = (key: 'title' | 'xlabel' | 'ylabel', label: string) => (
    <Row label={label}>
      <input className="input" spellCheck={false} value={model[key]} onChange={(e) => patch({ [key]: e.target.value })} />
    </Row>
  );
  const range = (axis: 'x' | 'y') => (
    <div className="diagram-row">
      <span>{axis === 'x' ? 'x from, to' : 'y from, to'}</span>
      <span className="diagram-pair">
        {(['min', 'max'] as const).map((end) => (
          <input
            key={end}
            className="input"
            inputMode="decimal"
            placeholder="Auto"
            aria-label={`${axis} ${end === 'min' ? 'from' : 'to'}`}
            value={model[`${axis}${end}`]}
            onChange={(e) => patch({ [`${axis}${end}`]: e.target.value })}
          />
        ))}
      </span>
    </div>
  );

  return (
    <fieldset className="plot-form" disabled={readOnly}>
      <section>
        <h3 className="form-section-title">Series</h3>
        {model.series.map((s, i) => {
          const cols: [string, string][] = (columns[s.file] ?? []).map((c) => [c, c]);
          return (
            <div key={s.id} className="plot-series">
              <div className="plot-series-head">
                <span className="plot-series-name">Series {i + 1}</span>
                <Select value={s.source} options={SOURCES} onChange={(source) => patchSeries(s.id, asKind(s, source as SeriesSource))} />
                <button type="button" className="icon-btn small destructive" title="Remove this series" aria-label="Remove this series" onClick={() => patch({ series: model.series.filter((x) => x.id !== s.id) })}>
                  <Icon name="trash" />
                </button>
              </div>
              {s.source !== 'data' ? (
                <SeriesFields s={s} patch={(next) => patchSeries(s.id, next)} />
              ) : (
                <>
                  <Row label="File">
                    <Select
                      value={s.file}
                      options={files.map((f): [string, string] => [f, f])}
                      placeholder={files.length ? 'Choose a file' : 'No .csv, .tsv or .dat files in the project'}
                      onChange={(file) => patchSeries(s.id, { file, x: '', y: '' })}
                    />
                  </Row>
                  <div className="diagram-row">
                    <span>x and y columns</span>
                    <span className="diagram-pair">
                      <Select value={s.x} options={cols} placeholder="x" onChange={(x) => patchSeries(s.id, { x })} />
                      <Select value={s.y} options={cols} placeholder="y" onChange={(y) => patchSeries(s.id, { y })} />
                    </span>
                  </div>
                </>
              )}
              <Row label="Legend (LaTeX)">
                <input className="input" spellCheck={false} value={s.legend} onChange={(e) => patchSeries(s.id, { legend: e.target.value })} />
              </Row>
              <div className="diagram-row">
                <span>Line</span>
                <span className="diagram-pair">
                  <Select value={s.line} options={LINES} onChange={(line) => patchSeries(s.id, { line: line as Series['line'] })} />
                  <label className="checkbox-row align-end">
                    <input type="checkbox" checked={s.marks} onChange={(e) => patchSeries(s.id, { marks: e.target.checked })} />
                    <span>Marks</span>
                  </label>
                  {(s.source === 'function' || s.source === 'data') && (
                    <label className="checkbox-row align-end">
                      <input type="checkbox" checked={!!s.stem} onChange={(e) => patchSeries(s.id, { stem: e.target.checked || undefined })} />
                      <span>Stems</span>
                    </label>
                  )}
                </span>
              </div>
              <ColourField label="Colour" value={s.colour} fallback="Auto" onChange={(colour) => patchSeries(s.id, { colour })} />
            </div>
          );
        })}
        <button type="button" className="btn small" onClick={() => patch({ series: [...model.series, newSeries(nextId('s', model.series.map((s) => s.id)))] })}>
          <Icon name="plus" /> Add a series
        </button>
      </section>
      <section>
        <h3 className="form-section-title">Axes</h3>
        {text('title', 'Title (LaTeX)')}
        {text('xlabel', 'x label (LaTeX)')}
        {text('ylabel', 'y label (LaTeX)')}
        {range('x')}
        {range('y')}
        <Row label="Grid">
          <Select value={model.grid} options={GRIDS} onChange={(grid) => patch({ grid: grid as PlotModel['grid'] })} />
        </Row>
        <Row label="Legend">
          <Select value={model.legendPos} options={LEGEND_PLACES} onChange={(legendPos) => patch({ legendPos: legendPos as LegendPos })} />
        </Row>
        <Row label="Width in cm">
          <input className="input" inputMode="decimal" placeholder="Auto" value={model.width} onChange={(e) => patch({ width: e.target.value })} />
        </Row>
        <Row label="Axes">
          <Select value={model.axes ?? 'box'} options={AXES} onChange={(axes) => patch({ axes: axes === 'box' ? undefined : (axes as PlotModel['axes']) })} />
        </Row>
        <div className="diagram-row">
          <span>x and y scales</span>
          <span className="diagram-pair">
            {(['xmode', 'ymode'] as const).map((key) => (
              <Select key={key} value={model[key] ?? 'linear'} options={SCALES} onChange={(mode) => patch({ [key]: mode === 'log' ? 'log' : undefined })} />
            ))}
          </span>
        </div>
        {(['xticks', 'yticks'] as const).map((key) => (
          <div className="diagram-row" key={key}>
            <label htmlFor={`plot-${key}`}>{key === 'xticks' ? 'x ticks' : 'y ticks'}</label>
            <input id={`plot-${key}`} className="input mono" spellCheck={false} placeholder="Auto" value={model[key] ?? ''} onChange={(e) => patch({ [key]: e.target.value || undefined })} />
            {key === 'yticks' && <div className="field-hint">{'Positions, each with a label if you like, separated by semicolons: pi/2 = $\\frac{\\pi}{2}$; pi = $\\pi$'}</div>}
          </div>
        ))}
      </section>
      <section>
        <h3 className="form-section-title">Annotations</h3>
        {(model.annotations ?? []).map((a, i) => (
          <div key={a.id} className="plot-series">
            <div className="plot-series-head">
              <span className="plot-series-name">Annotation {i + 1}</span>
              <Select value={a.kind} options={KINDS} onChange={(kind) => patchAnnotation(a.id, { kind: kind as AnnotationKind })} />
              <button type="button" className="icon-btn small destructive" title="Remove this annotation" aria-label="Remove this annotation" onClick={() => patch({ annotations: model.annotations?.filter((x) => x.id !== a.id) })}>
                <Icon name="trash" />
              </button>
            </div>
            <AnnotationFields a={a} functions={functions} patch={(next) => patchAnnotation(a.id, next)} />
            <ColourField label="Colour" value={a.colour} fallback="Auto" onChange={(colour) => patchAnnotation(a.id, { colour })} />
          </div>
        ))}
        {!functions.length && <div className="field-hint">Points, tangents, secants, areas and labels go on a function series.</div>}
        <button
          type="button"
          className="btn small"
          onClick={() => {
            const id = nextId('a', (model.annotations ?? []).map((a) => a.id));
            patch({ annotations: [...(model.annotations ?? []), { id, kind: functions.length ? 'point' : 'line', series: functions[0]?.[0] ?? '', at: '1', to: '2', axis: 'x' }] });
          }}
        >
          <Icon name="plus" /> Add an annotation
        </button>
      </section>
    </fieldset>
  );
}

const plotMode: DiagramMode<PlotModel> = {
  id: 'pgfplots',
  label: 'Plot (pgfplots)',
  language: 'tikz',
  emptyModel: emptyPlot,
  toCode: (model) => plotCode(model),
  Canvas
};

export default plotMode;
