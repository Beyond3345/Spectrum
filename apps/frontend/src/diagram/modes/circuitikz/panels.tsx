// The circuit mode's panels: the parts rail, the inspector for what's selected, and the style menu.
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import Icon from '../../../app/Icon';
import Segmented from '../../../app/Segmented';
import Select from '../../../app/Select';
import { IS_WINDOWS } from '../../../app/platform';
import { ColourField, More } from '../../controls';
import { useToolTitle } from '../../toolKeys';
import { ANNOTATION_COLOURS, MATERIALS, PATTERNS, PRESETS } from './annotate';
import { DEFAULT_LENGTH, readStyle } from './code';
import type { CircuitStyle } from './code';
import { flip, remove, rotate } from './edit';
import { plusAtStart, sideName } from './labels';
import { CATALOGUE, PARTS, asCircuit, railParts, locator, pathFrame, variantKey, wirePath, withLaterSets } from './model';
import type { Annotation, CircuitModel, Element, FontSize, Mark, NodePart, PathPart, Pole, Pt, Route, Wire } from './model';
import { setSelection, setTool, shapeOfNow, tidy, useCircuitUi } from './store';
import { UnitsSwitch } from '../../controls';
import { setFor } from '../../sets';
import { useSymbols } from './symbols';
import { useSettings } from '../../../app/settings';

const GROUPS = [...new Set(CATALOGUE.map((part) => part.group))];

// ─── rail ───

const PRESET_THUMBS: Record<string, ReactNode> = {
  resistance: <><path d="M14,5 L22,13 M14,13 L22,5" strokeWidth={2} /><path d="M18,24 L18,16 L40,16" markerEnd="url(#ckt-rail-head)" /></>,
  current: <><path d="M10,18 L44,18" markerEnd="url(#ckt-rail-head)" /><text x={27} y={12} textAnchor="middle">i</text></>,
  loop: <><circle cx={28} cy={14} r={10} /><path d="M38,12 L38,17" markerEnd="url(#ckt-rail-head)" /><text x={28} y={18} textAnchor="middle">i₁</text></>,
  mesh: <><rect x={18} y={2} width={20} height={24} rx={5} className="ckt-rail-tint" /><path d="M38,11 L38,17" markerEnd="url(#ckt-rail-head)" /><circle cx={28} cy={14} r={4.5} /></>,
  frame: <><rect x={8} y={9} width={40} height={17} strokeDasharray="4 3" /><text x={28} y={7} textAnchor="middle" fontStyle="normal">Frame</text></>,
  highlight: <ellipse cx={28} cy={14} rx={14} ry={9} className="ckt-rail-red" />,
  ...Object.fromEntries(['C', 'CP', 'G', 'B', 'M'].map((letter) => [letter, <><circle cx={22} cy={14} r={2.2} className="ckt-rail-ink" /><text x={27} y={18}>{letter}</text></>]))
};

/** Annotate's tools and presets, each with its thumbnail (a 56 × 28 sketch) and how it's used */
const ANNOTATE: [string, string, string, ReactNode][] = [
  ['annotate:line', 'Line or arrow', 'click each point, then double-click or press Return', <path d="M8,20 L8,9 L46,9" markerEnd="url(#ckt-rail-head)" />],
  ['annotate:rect', 'Rectangle', 'drag from corner to corner, or click', <rect x={10} y={5} width={36} height={18} rx={2} strokeDasharray="4 3" />],
  ['annotate:ellipse', 'Ellipse', 'drag from corner to corner, or click', <ellipse cx={28} cy={14} rx={18} ry={9} />],
  ['annotate:cross', 'Cross', 'click to place', <path d="M22,8 L34,20 M22,20 L34,8" strokeWidth={2.2} />],
  // the fluid mechanics and materials courses' tools
  ['annotate:polygon', 'Liquid or solid', 'click each corner, then the first again, or press Return', <path d="M8,9 L48,9 L48,24 L8,24 Z" className="ckt-rail-tint" strokeWidth={0} />],
  ['annotate:boundary', 'Hatched boundary', 'click each point, then double-click or press Return', <><path d="M8,10 L48,10" strokeWidth={2} /><path d="M14,10 l-5,6 M22,10 l-5,6 M30,10 l-5,6 M38,10 l-5,6 M46,10 l-5,6" strokeWidth={0.9} /></>],
  ['annotate:dimension', 'Dimension', 'drag from one end to the other, then move its line with the third handle', <><path d="M10,6 L10,24 M46,6 L46,24" strokeWidth={0.8} /><path d="M12,16 L44,16" markerEnd="url(#ckt-rail-head)" markerStart="url(#ckt-rail-head)" strokeWidth={0.9} /><text x={28} y={13} textAnchor="middle">h</text></>],
  ['annotate:surface', 'Free surface', 'click on the surface', <><path d="M8,20 L48,20" strokeWidth={0.9} /><path d="M28,20 L23,11 L33,11 Z M23,23 L33,23 M25.5,26 L30.5,26" strokeWidth={0.9} /></>],
  ['annotate:mark', 'Point', 'click to place, then type its letter', <><circle cx={22} cy={14} r={2.2} className="ckt-rail-ink" /><text x={27} y={18}>A</text></>],
  ['annotate:leader', 'Leader', 'click where the words go, then the point, then double-click or press Return', <><path d="M28,12 L44,22" markerEnd="url(#ckt-rail-head)" strokeWidth={0.9} /><text x={16} y={14} textAnchor="middle" fontStyle="normal">Text</text></>],
  ...PRESETS.map(([id, label]): [string, string, string, ReactNode] => [`preset:${id}`, label, /^[A-Z]+$/.test(id) ? 'click to place' : 'click to place, then edit its parts', PRESET_THUMBS[id]])
];

/** sets: the other symbol sets the drawing has, each shown as its own groups after circuitikz's */
export function CircuitRail({ onPick, tool, sets: chosen = [] }: { onPick(tool: string): void; tool: string; sets?: string[] }) {
  const sets = withLaterSets(chosen);
  const ui = useCircuitUi();
  const [filter, setFilter] = useState('');
  const { symbol: symbolFor } = useSymbols(ui.ctikz, [], sets);
  // the frame's choice wins when it changes; the canvas can also go back to Select on Escape
  useEffect(() => setTool(tool), [tool]);
  const pick = (next: string) => {
    setTool(next);
    onPick(next);
  };
  const [settings] = useSettings();
  const shown = railParts(filter, sets, settings.composerStylesOff);
  const title = useToolTitle();
  return (
    <div className="ckt-rail">
      <Segmented
        label="Tool"
        className="ckt-rail-tools"
        value={ui.tool}
        options={[
          ['select', 'Select'],
          ['wire', 'Wire', undefined, title('Wire', 'diagramWire')]
        ]}
        onChange={pick}
      />
      <input className="input ckt-rail-filter" type="search" placeholder="Find a part" aria-label="Find a part" value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
      <div className="ckt-rail-groups">
        {GROUPS.map((group) => {
          const parts = shown.filter((part) => part.group === group);
          if (!parts.length) return null;
          return (
            <section key={group} className="ckt-rail-group">
              <h3>
                {group}
                {parts[0].set && <span className="ckt-rail-set"> · {setFor(parts[0].set)?.label ?? parts[0].set}</span>}
              </h3>
              <div className="ckt-rail-parts">
                {parts.map((part) => {
                  const symbol = symbolFor(variantKey(part.id, []));
                  const value = `part:${part.id}`;
                  return (
                    <button
                      key={part.id}
                      type="button"
                      className={`ckt-rail-part ${ui.tool === value ? 'active' : ''}`}
                      aria-pressed={ui.tool === value}
                      title={part.kind === 'path' ? `${part.label}: click to place, or drag to set its length` : `${part.label}: click to place`}
                      onClick={() => pick(ui.tool === value ? 'select' : value)}
                    >
                      <span className="ckt-rail-thumb">
                        {/* circuitikz's open draws nothing, so its thumbnail is what it marks */}
                        {part.tikz === 'open' ? <span className="ckt-rail-open">+ v −</span> : symbol ? <img className="ckt-glyph" src={symbol.image} alt="" /> : <span className="ckt-rail-blank" />}
                      </span>
                      <span className="ckt-rail-label">{part.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {/* drawn over the circuit, never connected to it (annotate.ts) */}
        {ANNOTATE.some(([, label]) => label.toLowerCase().includes(filter.trim().toLowerCase())) && (
          <section className="ckt-rail-group">
            <h3>Annotate</h3>
            <div className="ckt-rail-parts">
              {ANNOTATE.filter(([, label]) => label.toLowerCase().includes(filter.trim().toLowerCase())).map(([value, label, how, thumb]) => (
                <button key={value} type="button" className={`ckt-rail-part ${ui.tool === value ? 'active' : ''}`} aria-pressed={ui.tool === value} title={`${label}: ${how}`} onClick={() => pick(ui.tool === value ? 'select' : value)}>
                  <span className="ckt-rail-thumb">
                    <svg className="ckt-rail-sketch" viewBox="0 0 56 28" width="56" height="28" aria-hidden="true">
                      <defs>
                        <marker id="ckt-rail-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                          <path d="M0,1 L10,5 L0,9 z" />
                        </marker>
                      </defs>
                      {thumb}
                    </svg>
                  </span>
                  <span className="ckt-rail-label">{label}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── inspector ───

function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

/** circuitikz's ^ and _ sides, named as the part runs now: above and below, or left and right once it's upright */
const sidesOf = (u: Pt): [string, string][] => [
  ['', 'Default side'],
  ['^', sideName(u, 1)],
  ['_', sideName(u, -1)]
];
const DIRS: [string, string][] = [
  ['', 'Default direction'],
  ['>', 'Forwards'],
  ['<', 'Backwards']
];
const POLES: [Pole, string][] = [
  ['', 'None'],
  ['*', 'Filled dot'],
  ['o', 'Open dot']
];
const ROUTES: [Route, string][] = [
  ['--', 'Straight'],
  ['-|', 'Across, then up or down'],
  ['|-', 'Up or down, then across']
];
const ARROWS: [string, string][] = [
  ['', 'None'],
  ['->', 'At the end'],
  ['<-', 'At the start'],
  ['<->', 'At both ends']
];
const HEADS: [string, string][] = [
  ['', 'Latex'],
  ['stealth', 'Stealth'],
  ['triangle', 'Open triangle'],
  ['to', 'Plain']
];
const HEAD_SIZES: [string, string][] = [
  ['small', 'Small'],
  ['', 'Medium'],
  ['large', 'Large']
];
const DASHES: [string, string][] = [
  ['', 'Solid'],
  ['dashed', 'Dashed'],
  ['dotted', 'Dotted'],
  ['dash dot', 'Dash dot']
];
const WIDTHS: [string, string][] = [
  ['', 'Thin, as the circuit'],
  ['semithick', 'Semithick'],
  ['thick', 'Thick'],
  ['very thick', 'Very thick']
];
const FONTS: [string, string][] = [
  ['scriptsize', 'Script'],
  ['footnotesize', 'Footnote'],
  ['small', 'Small'],
  ['', 'Normal'],
  ['large', 'Large']
];

/** TikZ node names: letters, digits, - and _ */
const cleanName = (text: string) => text.replace(/[^A-Za-z0-9_-]/g, '');

function MarkFields({ label, mark, onChange, hint, u, voltage }: { label: string; mark: Mark | undefined; onChange: (m: Mark | undefined) => void; hint?: string; u: Pt; voltage?: boolean }) {
  const { voltageDir } = useCircuitUi();
  const m = mark || { text: '' };
  const set = (patch: Partial<Mark>) => {
    const next = { ...m, ...patch };
    onChange(next.text || next.side || next.dir ? (Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as unknown as Mark) : undefined);
  };
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <>
          <input id={id} className="input mono" value={m.text} onChange={(e) => set({ text: e.target.value })} spellCheck={false} />
          <div className="ckt-row">
            <Select value={m.side || ''} options={sidesOf(u)} onChange={(side) => set({ side: (side || undefined) as Mark['side'] })} title={`${label}: side`} />
            {!voltage && <Select value={m.dir || ''} options={DIRS} onChange={(dir) => set({ dir: (dir || undefined) as Mark['dir'] })} title={`${label}: direction`} />}
          </div>
          {voltage && (
            <label className="checkbox-row">
              <input type="checkbox" checked={!plusAtStart(voltageDir, m.dir)} onChange={(e) => set({ dir: e.target.checked ? (voltageDir === 'RP' ? '>' : '<') : undefined })} />
              <span>Flip polarity</span>
            </label>
          )}
        </>
      )}
    </Field>
  );
}

function OptionFields({ el, onChange }: { el: PathPart | NodePart; onChange: (options: string[]) => void }) {
  const part = PARTS.get(el.type);
  const options = el.options || [];
  if (!part?.options?.length && !part?.enumOptions?.length) return null;
  const toggle = (name: string, on: boolean) => onChange(on ? [...options, name] : options.filter((o) => o !== name));
  return (
    <>
      {part.enumOptions?.map((group) => {
        const names = group.values.map((v) => v.name);
        const current = options.find((o) => names.includes(o)) || '';
        return (
          <Field key={group.label} label={group.label}>
            {() => (
              <Select
                value={current}
                options={[['', 'Style default'], ...group.values.map((v): [string, string] => [v.name, v.label])]}
                onChange={(value) => onChange([...options.filter((o) => !names.includes(o)), ...(value ? [value] : [])])}
              />
            )}
          </Field>
        );
      })}
      {part.options?.map((option) => (
        <label key={option.name} className="checkbox-row">
          <input type="checkbox" checked={options.includes(option.name)} onChange={(e) => toggle(option.name, e.target.checked)} />
          <span>{option.label}</span>
        </label>
      ))}
    </>
  );
}

export function CircuitInspector({ model: raw, onChange }: { model: CircuitModel; onChange(m: CircuitModel): void }) {
  const model = asCircuit(raw);
  const { selection } = useCircuitUi();
  const picked = model.elements.filter((el) => selection.includes(el.id));
  const ids = new Set(picked.map((el) => el.id));
  const commit = (next: CircuitModel) => onChange(tidy(next));
  const update = (el: Element) => commit({ ...model, elements: model.elements.map((x) => (x.id === el.id ? el : x)) });
  /** one change to every picked annotation, and the colour to picked Text too */
  const restyle = (patch: Partial<Annotation>) =>
    commit({
      ...model,
      elements: model.elements.map((x) => (!ids.has(x.id) ? x : x.kind === 'annotation' ? { ...x, ...patch } : 'colour' in patch && isText(x) ? { ...x, colour: patch.colour } : x))
    });
  const annotations = picked.filter((el): el is Annotation => el.kind === 'annotation');
  const actions = (
    <div className="ckt-row">
      {picked.some((el) => el.kind !== 'wire') && (
        <>
          <button type="button" className="btn small" title="Turn a quarter anticlockwise (R)" onClick={() => commit(rotate(model, ids, 90, shapeOfNow()))}>
            <Icon name="arrow.counterclockwise" /> Turn
          </button>
          <button type="button" className="btn small" title="Flip left to right (X)" onClick={() => commit(flip(model, ids, 'x'))}>
            <Icon name="arrow.left.and.right" /> Flip
          </button>
        </>
      )}
      <button
        type="button"
        className="btn small destructive"
        title="Delete (⌫)"
        onClick={() => {
          commit(remove(model, ids, shapeOfNow()));
          setSelection([]);
        }}
      >
        <Icon name="trash" /> Delete
      </button>
    </div>
  );

  if (!picked.length) {
    return (
      <div className="ckt-inspector">
        <p className="field-hint">
          Pick a part on the left, then click the canvas to place it; drag to set a two-terminal part’s length. Wire draws connections that hold on to pins: click to bend, and finish on a pin, with a double-click or with Return.
        </p>
        <p className="field-hint">Annotate draws arrows, frames, highlights, liquids, hatched walls, dimensions and marks over the drawing. They never connect to it.</p>
        <p className="field-hint">Select something to edit it here. R turns it, X and Y flip it, {IS_WINDOWS ? 'Ctrl+D' : '⌘D'} duplicates and Delete removes it.</p>
      </div>
    );
  }
  if (picked.length > 1) {
    return (
      <div className="ckt-inspector">
        <div className="ckt-inspector-title">{picked.length} items selected</div>
        {(annotations.length > 0 || picked.some(isText)) && <LookFields els={annotations} texts={picked.filter(isText)} set={restyle} />}
        {actions}
      </div>
    );
  }

  const el = picked[0];
  if (el.kind === 'wire') {
    // which way each segment's first leg runs, so a mark's sides are named as they look
    const { pos } = locator(model, shapeOfNow());
    const ends = el.points.map((p) => pos(p));
    const legs = ends.slice(1).map((to, i) => wirePath([ends[i], to], [el.routes[i] || '--'])).map((leg) => pathFrame(leg[0], leg[1]).u);
    return <WireInspector el={el} update={update} actions={actions} legs={legs} />;
  }
  if (el.kind === 'annotation') return <AnnotationInspector el={el} update={update} actions={actions} restyle={restyle} />;
  const part = PARTS.get(el.type);
  // which way a path part runs now, so its sides are named as they look
  const { pos } = locator(model, shapeOfNow());
  const u = el.kind === 'path' ? pathFrame(pos(el.a), pos(el.b)).u : { x: 1, y: 0 };
  const pinLetters = Object.keys(part?.pinLabels || {}).map((pin) => (pin === 'bulk' ? 'B' : pin));
  return (
    <div className="ckt-inspector">
      <div className="ckt-inspector-title">{part?.label || el.type}</div>
      {part?.text && (
        <Field label="Text" hint={el.kind === 'path' ? 'Written inside the symbol. Type $…$ for maths.' : 'TeX, as typed: $…$ for maths.'}>
          {(id) => <input id={id} className="input mono" value={el.text || ''} onChange={(e) => update({ ...el, text: e.target.value || undefined })} spellCheck={false} />}
        </Field>
      )}
      {isText(el) && (
        <>
          <ColourField label="Colour" value={el.colour} fallback="Black" swatches={ANNOTATION_COLOURS} onChange={(colour) => update({ ...el, colour })} />
          <div className="ckt-row">
            <label className="checkbox-row">
              <input type="checkbox" checked={!!el.bold} onChange={(e) => update({ ...el, bold: e.target.checked || undefined })} />
              <span>Bold</span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={!!el.italic} onChange={(e) => update({ ...el, italic: e.target.checked || undefined })} />
              <span>Italic</span>
            </label>
          </div>
          <Field label="Size">{() => <Select value={el.font || ''} options={FONTS} onChange={(font) => update({ ...el, font: (font || undefined) as FontSize | undefined })} />}</Field>
        </>
      )}
      {el.kind === 'path' ? (
        <>
          <Field label="Label" hint="Maths unless you type your own $…$.">
            {(id) => (
              <div className="ckt-row">
                <input id={id} className="input mono" value={el.label?.text || ''} onChange={(e) => update({ ...el, label: e.target.value || el.label?.side ? { ...el.label, text: e.target.value } : undefined })} spellCheck={false} />
                <Select
                  value={el.label?.side === '_' ? '_' : ''}
                  options={[
                    ['', sideName(u, 1)],
                    ['_', sideName(u, -1)]
                  ]}
                  onChange={(side) => update({ ...el, label: side ? { text: el.label?.text ?? '', side: '_' } : el.label?.text ? { text: el.label.text } : undefined })}
                  title="Label side"
                />
              </div>
            )}
          </Field>
          <Field label="Value" hint="Written opposite the label, or under it when the voltage is on that side. With siunitx on in Style, 10 kΩ becomes \qty{10}{\kilo\ohm}.">
            {(id) => <input id={id} className="input mono" value={el.value || ''} onChange={(e) => update({ ...el, value: e.target.value || undefined })} spellCheck={false} />}
          </Field>
          <More key={el.id} summary="Voltage, current and more" open={!!(el.voltage || el.current || el.flow || el.poles || el.mirror || el.invert || el.size || el.name)}>
            <MarkFields
              label="Voltage"
              mark={el.voltage}
              onChange={(voltage) => update({ ...el, voltage })}
              u={u}
              voltage
              hint={part?.tikz === 'open' ? 'Marked between the two ends: + and − at the ends, the name between them.' : 'Marked across the part: + and − at its ends, the name beside it. The label, value, current and flow keep to the other side.'}
            />
            <MarkFields label="Current" mark={el.current} onChange={(current) => update({ ...el, current })} u={u} />
            <MarkFields label="Flow" mark={el.flow} onChange={(flow) => update({ ...el, flow })} hint="An arrow beside the part, for power or heat flow." u={u} />
            <Field label="Poles">
              {() => (
                <div className="ckt-row">
                  {[0, 1].map((i) => (
                    <Select
                      key={i}
                      value={(el.poles || ['', ''])[i]}
                      options={POLES.map(([value, label]) => [value, `${i ? 'End' : 'Start'}: ${label}`])}
                      onChange={(value) => {
                        const poles = [...(el.poles || ['', ''])] as [Pole, Pole];
                        poles[i] = value as Pole;
                        update({ ...el, poles: poles[0] || poles[1] ? poles : undefined });
                      }}
                      title={i ? 'Pole at the end' : 'Pole at the start'}
                    />
                  ))}
                </div>
              )}
            </Field>
            <label className="checkbox-row">
              <input type="checkbox" checked={!!el.mirror} onChange={(e) => update({ ...el, mirror: e.target.checked || undefined })} />
              <span>Mirror (flip across the wire)</span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={!!el.invert} onChange={(e) => update({ ...el, invert: e.target.checked || undefined })} />
              <span>Invert (turn end for end)</span>
            </label>
            <Field label={`Size: ${Math.round((el.size || 1) * 100)}%`}>
              {(id) => <input id={id} type="range" min={0.5} max={2} step={0.05} value={el.size || 1} onChange={(e) => update({ ...el, size: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })} />}
            </Field>
            <Field label="Name" hint="Optional: lets other drawings reach its anchors.">
              {(id) => <input id={id} className="input mono" value={el.name || ''} onChange={(e) => update({ ...el, name: cleanName(e.target.value) || undefined })} spellCheck={false} />}
            </Field>
          </More>
        </>
      ) : (
        <>
          <Field label="Name" hint="Wires reach its pins through this name.">
            {(id) => <input id={id} className="input mono" value={el.name || ''} onChange={(e) => update({ ...el, name: cleanName(e.target.value) || undefined })} spellCheck={false} />}
          </Field>
          <Field label={`Rotation: ${el.rotate || 0}°`}>
            {() => (
              <div className="ckt-row">
                <button type="button" className="btn small" onClick={() => commit(rotate(model, ids, 45, shapeOfNow()))}>
                  <Icon name="arrow.counterclockwise" /> 45°
                </button>
                <button type="button" className="btn small" onClick={() => commit(rotate(model, ids, -45, shapeOfNow()))}>
                  <Icon name="arrow.clockwise" /> 45°
                </button>
              </div>
            )}
          </Field>
          <label className="checkbox-row">
            <input type="checkbox" checked={!!el.flipX} onChange={(e) => update({ ...el, flipX: e.target.checked || undefined })} />
            <span>Flip left to right</span>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={!!el.flipY} onChange={(e) => update({ ...el, flipY: e.target.checked || undefined })} />
            <span>Flip top to bottom</span>
          </label>
          {pinLetters.length > 0 && (
            <label className="checkbox-row">
              <input type="checkbox" checked={!!el.pinLabels} onChange={(e) => update({ ...el, pinLabels: e.target.checked || undefined })} />
              <span>Label pins ({pinLetters.join(', ')})</span>
            </label>
          )}
        </>
      )}
      <OptionFields el={el} onChange={(options) => update({ ...el, options: options.length ? options : undefined })} />
      {actions}
    </div>
  );
}

/** Text: the catalogue's part that is only its words */
const isText = (el: Element): el is NodePart => el.kind === 'node' && PARTS.has(el.type) && !PARTS.get(el.type)!.tikz;

function WireInspector({ el, update, actions, legs }: { el: Wire; update: (el: Element) => void; actions: ReactNode; legs: Pt[] }) {
  // a segment's current or flow, kept one place per segment, the list dropped when it has none
  const setMark = (key: 'currents' | 'flows', i: number, m: Mark | undefined) => {
    const list = el.routes.map((_, j) => (j === i ? m ?? null : el[key]?.[j] ?? null));
    update({ ...el, [key]: list.some(Boolean) ? list : undefined });
  };
  return (
    <div className="ckt-inspector">
      <div className="ckt-inspector-title">Wire</div>
      {el.routes.map((route, i) => (
        <div key={i} className="ckt-segment">
          <Field label={el.routes.length > 1 ? `Segment ${i + 1}` : 'Route'}>
            {() => <Select value={route} options={ROUTES} onChange={(value) => update({ ...el, routes: el.routes.map((r, j) => (j === i ? (value as Route) : r)) })} />}
          </Field>
          <More key={`${el.id}-${i}`} summary="Current and flow" open={!!(el.currents?.[i] || el.flows?.[i])}>
            <MarkFields label="Current" mark={el.currents?.[i] ?? undefined} onChange={(m) => setMark('currents', i, m)} u={legs[i] || { x: 1, y: 0 }} hint={route === '--' ? undefined : 'On the first leg of the bend.'} />
            <MarkFields label="Flow" mark={el.flows?.[i] ?? undefined} onChange={(m) => setMark('flows', i, m)} u={legs[i] || { x: 1, y: 0 }} />
          </More>
        </div>
      ))}
      <Field label="Arrowheads">
        {() => <Select value={el.arrows || ''} options={ARROWS} onChange={(value) => update({ ...el, arrows: (value || undefined) as Wire['arrows'] })} />}
      </Field>
      {actions}
    </div>
  );
}

/** Colour, line style and width: one annotation's, or every picked one's (and the colour of picked Text). */
function LookFields({ els, texts = [], set }: { els: Annotation[]; texts?: NodePart[]; set: (patch: Partial<Annotation>) => void }) {
  const shared = <K extends keyof Annotation>(key: K) => (els.every((el) => el[key] === els[0][key]) ? els[0]?.[key] : undefined);
  const colours = [...els.map((el) => el.colour), ...texts.map((el) => el.colour)];
  return (
    <>
      <ColourField label="Colour" value={colours.every((c) => c === colours[0]) ? colours[0] : undefined} fallback="Black" swatches={ANNOTATION_COLOURS} onChange={(colour) => set({ colour })} />
      {els.some((el) => !UNDASHED.includes(el.shape)) && (
        <Field label="Line">
          {() => <Select value={shared('dash') || ''} options={DASHES} onChange={(dash) => set({ dash: (dash || undefined) as Annotation['dash'] })} title="Line style" />}
        </Field>
      )}
      {els.length > 0 && (
        <Field label="Width">
          {() => <Select value={shared('width') || ''} options={WIDTHS} onChange={(width) => set({ width: (width || undefined) as Annotation['width'] })} />}
        </Field>
      )}
    </>
  );
}

/** what never takes a dash: a cross, a dimension, the ▽ mark and a point mark */
const UNDASHED: Annotation['shape'][] = ['cross', 'dimension', 'surface', 'mark'];
const SHAPE_NAMES = { line: 'Line', rect: 'Rectangle', ellipse: 'Ellipse', cross: 'Cross', polygon: 'Liquid or solid', boundary: 'Hatched boundary', dimension: 'Dimension', surface: 'Free surface', mark: 'Point', leader: 'Leader' };
const MATERIAL_OPTIONS: [string, string][] = [['', 'None'], ...Object.entries(MATERIALS).map(([id, [label]]): [string, string] => [id, label])];
const DRAWN_AS: [string, string][] = [['', 'Tint, as the slides'], ...Object.entries(PATTERNS).map(([id, { label }]): [string, string] => [id, label])];
const PLACE_OPTIONS: [string, string][] = [['', 'Right'], ['left', 'Left'], ['above', 'Above'], ['below', 'Below']];

function AnnotationInspector({ el, update, actions, restyle }: { el: Annotation; update: (el: Element) => void; actions: ReactNode; restyle: (patch: Partial<Annotation>) => void }) {
  const set = (patch: Partial<Annotation>) => update(Object.fromEntries(Object.entries({ ...el, ...patch }).filter(([, v]) => v !== undefined)) as unknown as Annotation);
  const lined = el.shape === 'line' || el.shape === 'leader';
  const closed = el.shape === 'rect' || el.shape === 'ellipse' || el.shape === 'polygon';
  const heads = lined ? !!el.arrows : el.shape === 'dimension' || !!el.loop;
  const textField = (label: string, hint: string) => (
    <Field label={label} hint={hint}>
      {(id) => <input id={id} className="input mono" value={el.text || ''} onChange={(e) => set({ text: e.target.value || undefined })} spellCheck={false} />}
    </Field>
  );
  return (
    <div className="ckt-inspector">
      <div className="ckt-inspector-title">{el.shape === 'line' && el.arrows ? 'Arrow' : SHAPE_NAMES[el.shape]}</div>
      {el.shape === 'dimension' && textField('Text', 'Maths unless it has a space or its own $…$: h, y_p, 2 m.')}
      {el.shape === 'mark' && textField('Letter', 'Maths unless it has a space or its own $…$: G, CP, x_c.')}
      {el.shape === 'leader' && textField('Words', 'TeX, as typed: $…$ for maths.')}
      <LookFields els={[el]} set={restyle} />
      {lined && (
        <>
          <Field label="Arrowheads">{() => <Select value={el.arrows || ''} options={ARROWS} onChange={(arrows) => set({ arrows: (arrows || undefined) as Annotation['arrows'] })} />}</Field>
          <Field label={`Bend: ${el.bend ? `${Math.abs(el.bend)}° ${el.bend > 0 ? 'left' : 'right'}` : 'none'}`} hint="TikZ’s bend left or right, on every segment.">
            {(id) => <input id={id} type="range" min={-90} max={90} step={15} value={el.bend || 0} onChange={(e) => set({ bend: Number(e.target.value) || undefined })} />}
          </Field>
        </>
      )}
      {closed && (
        <>
          <Field label="Fill" hint="A liquid or solid, behind the parts drawn in it.">
            {() => <Select value={el.material || ''} options={MATERIAL_OPTIONS} onChange={(material) => set({ material: (material || undefined) as Annotation['material'], ...(material ? null : { pattern: undefined, noOutline: undefined }) })} />}
          </Field>
          {el.material && (
            <>
              <Field label="Drawn as" hint={el.pattern ? 'As the exam papers draw it, in the line colour.' : undefined}>
                {() => <Select value={el.pattern || ''} options={DRAWN_AS} onChange={(pattern) => set({ pattern: (pattern || undefined) as Annotation['pattern'] })} />}
              </Field>
              <label className="checkbox-row">
                <input type="checkbox" checked={!el.noOutline} onChange={(e) => set({ noOutline: e.target.checked ? undefined : true })} />
                <span>Outline</span>
              </label>
            </>
          )}
          {el.shape !== 'polygon' && (
            <More key={el.id} summary="Corners, light fill and loop arrow" open={!!(el.rounded || el.fill || el.loop)}>
              {el.shape === 'rect' && (
                <label className="checkbox-row">
                  <input type="checkbox" checked={!!el.rounded} onChange={(e) => set({ rounded: e.target.checked || undefined })} />
                  <span>Rounded corners</span>
                </label>
              )}
              {!el.material && <ColourField label="Light fill" value={el.fill} fallback="None" swatches={ANNOTATION_COLOURS} onChange={(fill) => set({ fill })} />}
              <Field label="Loop arrow" hint="One arrowhead on the right side, for a loop or mesh current.">
                {() => (
                  <Select
                    value={el.loop || ''}
                    options={[
                      ['', 'None'],
                      ['cw', 'Clockwise'],
                      ['ccw', 'Anticlockwise']
                    ]}
                    onChange={(loop) => set({ loop: (loop || undefined) as Annotation['loop'] })}
                  />
                )}
              </Field>
            </More>
          )}
        </>
      )}
      {el.shape === 'boundary' && (
        <label className="checkbox-row">
          <input type="checkbox" checked={el.hatch === 'left'} onChange={(e) => set({ hatch: e.target.checked ? 'left' : undefined })} />
          <span>Hatching on the other side</span>
        </label>
      )}
      {el.shape === 'dimension' && (
        <>
          <Field label="Measures" hint="Drag the third handle to move the line out.">
            {() => (
              <Select
                value={el.along || ''}
                options={[
                  ['', 'Along the line between its ends'],
                  ['x', 'Across'],
                  ['y', 'Up and down']
                ]}
                onChange={(along) => set({ along: (along || undefined) as Annotation['along'] })}
              />
            )}
          </Field>
          <Field label="Text">
            {() => (
              <Segmented
                label="Text"
                value={el.textAt || 'beside'}
                options={[
                  ['beside', 'Beside the line'],
                  ['gap', 'In a gap']
                ]}
                onChange={(textAt) => set({ textAt: textAt === 'gap' ? 'gap' : undefined })}
              />
            )}
          </Field>
        </>
      )}
      {el.shape === 'mark' && (
        <div className="ckt-row">
          <Segmented
            label="Mark"
            value={el.cross ? 'cross' : 'dot'}
            options={[
              ['dot', 'Dot'],
              ['cross', 'Cross']
            ]}
            onChange={(mark) => set({ cross: mark === 'cross' || undefined })}
          />
          <Select value={el.place || ''} options={PLACE_OPTIONS} onChange={(place) => set({ place: (place || undefined) as Annotation['place'] })} title="Letter side" />
        </div>
      )}
      {heads && (
        <Field label="Arrowhead">
          {() => (
            <div className="ckt-row">
              <Select value={el.head || ''} options={HEADS} onChange={(head) => set({ head: (head || undefined) as Annotation['head'] })} title="Arrowhead style" />
              <Select value={el.headSize || ''} options={HEAD_SIZES} onChange={(headSize) => set({ headSize: (headSize || undefined) as Annotation['headSize'] })} title="Arrowhead size" />
            </div>
          )}
        </Field>
      )}
      {el.shape === 'cross' && (
        <Field label={`Size: ${((el.size ?? 0.5) * 0.5).toFixed(2)} cm`}>
          {(id) => <input id={id} type="range" min={0.25} max={2} step={0.25} value={el.size ?? 0.5} onChange={(e) => set({ size: Number(e.target.value) === 0.5 ? undefined : Number(e.target.value) })} />}
        </Field>
      )}
      {actions}
    </div>
  );
}

// ─── style ───

export function CircuitStyleMenu({ style: raw, onChange }: { style: Record<string, unknown>; onChange(s: Record<string, unknown>): void }) {
  const style = readStyle(raw);
  const set = (patch: Partial<Record<keyof CircuitStyle, unknown>>) => onChange({ ...readStyle({ ...style, ...patch }) });
  return (
    <div className="ckt-style">
      <Field label="Symbols">
        {() => (
          <Segmented
            label="Symbols"
            value={style.preset}
            options={[
              ['american', 'American'],
              ['european', 'European']
            ]}
            onChange={(preset) => set({ preset })}
          />
        )}
      </Field>
      <Field label="Logic gates" hint={style.logic === 'ieee' ? 'IEEE gates are larger than the others, and need circuitikz 1.1 (TeX Live 2020) or later.' : undefined}>
        {() => (
          <Select
            value={style.logic || ''}
            options={[
              ['', 'As the symbols'],
              ['american', 'American'],
              ['european', 'European (IEC)'],
              ['ieee', 'IEEE']
            ]}
            onChange={(logic) => set({ logic: logic || undefined })}
          />
        )}
      </Field>
      {(style.logic || style.preset) === 'european' && (
        <Field label="NOT output" hint="How a European NOT, NAND, NOR or XNOR gate marks its inverted output.">
          {() => (
            <Segmented
              label="NOT output"
              value={style.notSymbol || 'triangle'}
              options={[
                ['triangle', 'Triangle'],
                ['circle', 'Circle']
              ]}
              onChange={(notSymbol) => set({ notSymbol: notSymbol === 'circle' ? 'circle' : undefined })}
            />
          )}
        </Field>
      )}
      <Field label="Inductors">
        {() => (
          <Select
            value={style.inductors || ''}
            options={[
              ['', 'As the symbols'],
              ['cute', 'Cute (looped)'],
              ['american', 'American (bumps)'],
              ['european', 'European (filled box)']
            ]}
            onChange={(inductors) => set({ inductors: inductors || undefined })}
          />
        )}
      </Field>
      <Field label="Resistors">
        {() => (
          <Select
            value={style.resistors || ''}
            options={[
              ['', 'As the symbols'],
              ['american', 'American (zigzag)'],
              ['european', 'European (box)']
            ]}
            onChange={(resistors) => set({ resistors: resistors || undefined })}
          />
        )}
      </Field>
      <Field label="Voltages">
        {() => (
          <Select
            value={style.voltages || ''}
            options={[
              ['', 'As the symbols'],
              ['american', '+ and − (American)'],
              ['european', 'Curved arrow (European)'],
              ['straight', 'Straight arrow'],
              ['raised', '+ and −, raised']
            ]}
            onChange={(voltages) => set({ voltages: voltages || undefined })}
          />
        )}
      </Field>
      <Field label="Voltage direction" hint="Which way a voltage arrow, or + and −, points by default.">
        {() => (
          <Select
            value={style.voltageDir || 'noold'}
            options={[
              ['noold', 'circuitikz’s default'],
              ['RP', 'Rising potential (RP)'],
              ['EF', 'Electric field (EF)']
            ]}
            onChange={(voltageDir) => set({ voltageDir })}
          />
        )}
      </Field>
      <Field label="Diodes">
        {() => (
          <Select
            value={style.diodes || 'empty'}
            options={[
              ['empty', 'Empty'],
              ['full', 'Filled'],
              ['stroke', 'Outlined with a bar']
            ]}
            onChange={(diodes) => set({ diodes })}
          />
        )}
      </Field>
      <Field label="Labels">
        {() => (
          <Select
            value={style.labels || 'smart'}
            options={[
              ['smart', 'Upright unless nearly along the part'],
              ['straight', 'Always upright'],
              ['rotate', 'Along the part']
            ]}
            onChange={(labels) => set({ labels })}
          />
        )}
      </Field>
      {/* a drawing from before the switch with siunitx values on shows it on; changing it leaves \SI behind */}
      <UnitsSwitch
        checked={!!(style.siUnits || style.siunitx)}
        onChange={(siUnits) => set({ siUnits, siunitx: undefined })}
        hint={'A value such as 10 kΩ or 4.7 µF is written as \\qty{10}{\\kilo\\ohm}, and the document loads siunitx.'}
      />
      <Field label={`Size: ${(style.length || DEFAULT_LENGTH).toFixed(1)} cm per part`}>
        {(id) => <input id={id} type="range" min={0.8} max={2.4} step={0.1} value={style.length || DEFAULT_LENGTH} onChange={(e) => set({ length: Number(e.target.value) })} />}
      </Field>
    </div>
  );
}
