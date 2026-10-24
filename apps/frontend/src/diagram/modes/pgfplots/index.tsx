import { useContext, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { getFile, getProjectTree } from '../../../api/client';
import Icon from '../../../app/Icon';
import Select from '../../../app/Select';
import { ColourField, ProjectContext, Row } from '../../controls';
import type { DiagramMode } from '../../types';
import { nextId } from '../tikz/code';
import { columnsOf, emptyPlot, newSeries, plotCode } from './code';
import type { LegendPos, PlotModel, Series } from './code';

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
                <div className="segmented small" role="radiogroup" aria-label="Plot">
                  {(['function', 'data'] as const).map((source) => (
                    <button key={source} type="button" role="radio" aria-checked={s.source === source} className={`segment${s.source === source ? ' active' : ''}`} onClick={() => patchSeries(s.id, { source })}>
                      {source === 'function' ? 'Function' : 'Data file'}
                    </button>
                  ))}
                </div>
                <button type="button" className="icon-btn small destructive" title="Remove this series" aria-label="Remove this series" onClick={() => patch({ series: model.series.filter((x) => x.id !== s.id) })}>
                  <Icon name="trash" />
                </button>
              </div>
              {s.source === 'function' ? (
                <>
                  <Row label="y = (in x; sin and cos take radians)">
                    <input className="input mono" spellCheck={false} value={s.expr} onChange={(e) => patchSeries(s.id, { expr: e.target.value })} />
                  </Row>
                  <div className="diagram-row">
                    <span>x from, to, samples</span>
                    <span className="diagram-pair">
                      <input className="input" inputMode="decimal" aria-label="x from" value={s.from} onChange={(e) => patchSeries(s.id, { from: e.target.value })} />
                      <input className="input" inputMode="decimal" aria-label="x to" value={s.to} onChange={(e) => patchSeries(s.id, { to: e.target.value })} />
                      <input className="input" type="number" min={2} max={2000} aria-label="Samples" value={s.samples} onChange={(e) => patchSeries(s.id, { samples: Number(e.target.value) })} />
                    </span>
                  </div>
                </>
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
