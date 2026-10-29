// The circuit mode's panels: the parts rail, the inspector for what's selected, and the style menu.
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import Icon from '../../../app/Icon';
import Segmented from '../../../app/Segmented';
import Select from '../../../app/Select';
import { IS_WINDOWS } from '../../../app/platform';
import { DEFAULT_LENGTH, readStyle } from './code';
import type { CircuitStyle } from './code';
import { flip, remove, rotate } from './edit';
import { CATALOGUE, PARTS, asCircuit, variantKey } from './model';
import type { CircuitModel, Element, Mark, NodePart, PathPart, Pole, Route, Wire } from './model';
import { setSelection, setTool, shapeOfNow, tidy, useCircuitUi } from './store';
import { UnitsSwitch } from '../../controls';
import { setFor } from '../../sets';
import { useSymbols } from './symbols';

const GROUPS = [...new Set(CATALOGUE.map((part) => part.group))];

// ─── rail ───

/** sets: the other symbol sets the drawing has, each shown as its own groups after circuitikz's */
export function CircuitRail({ onPick, tool, sets = [] }: { onPick(tool: string): void; tool: string; sets?: string[] }) {
  const ui = useCircuitUi();
  const [filter, setFilter] = useState('');
  const { symbol: symbolFor } = useSymbols(ui.ctikz, [], sets);
  // the frame's choice wins when it changes; the canvas can also go back to Select on Escape
  useEffect(() => setTool(tool), [tool]);
  const pick = (next: string) => {
    setTool(next);
    onPick(next);
  };
  const shown = CATALOGUE.filter((part) => (!part.set || sets.includes(part.set)) && part.label.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <div className="ckt-rail">
      <Segmented
        label="Tool"
        className="ckt-rail-tools"
        value={ui.tool}
        options={[
          ['select', 'Select'],
          ['wire', 'Wire']
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
                      <span className="ckt-rail-thumb">{symbol ? <img className="ckt-glyph" src={symbol.image} alt="" /> : <span className="ckt-rail-blank" />}</span>
                      <span className="ckt-rail-label">{part.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
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

const SIDES: [string, string][] = [
  ['', 'Default side'],
  ['^', 'Above'],
  ['_', 'Below']
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

/** TikZ node names: letters, digits, - and _ */
const cleanName = (text: string) => text.replace(/[^A-Za-z0-9_-]/g, '');

function MarkFields({ label, mark, onChange, hint }: { label: string; mark: Mark | undefined; onChange: (m: Mark | undefined) => void; hint?: string }) {
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
            <Select value={m.side || ''} options={SIDES} onChange={(side) => set({ side: (side || undefined) as Mark['side'] })} title={`${label}: side`} />
            <Select value={m.dir || ''} options={DIRS} onChange={(dir) => set({ dir: (dir || undefined) as Mark['dir'] })} title={`${label}: direction`} />
          </div>
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
        <p className="field-hint">Select something to edit it here. R turns it, X and Y flip it, {IS_WINDOWS ? 'Ctrl+D' : '⌘D'} duplicates and Delete removes it.</p>
      </div>
    );
  }
  if (picked.length > 1) {
    return (
      <div className="ckt-inspector">
        <div className="ckt-inspector-title">{picked.length} items selected</div>
        {actions}
      </div>
    );
  }

  const el = picked[0];
  if (el.kind === 'wire') return <WireInspector el={el} update={update} actions={actions} />;
  const part = PARTS.get(el.type);
  return (
    <div className="ckt-inspector">
      <div className="ckt-inspector-title">{part?.label || el.type}</div>
      {part?.text && (
        <Field label="Text" hint={el.kind === 'path' ? 'Written inside the symbol. Type $…$ for maths.' : 'TeX, as typed: $…$ for maths.'}>
          {(id) => <input id={id} className="input mono" value={el.text || ''} onChange={(e) => update({ ...el, text: e.target.value || undefined })} spellCheck={false} />}
        </Field>
      )}
      {el.kind === 'path' ? (
        <>
          <Field label="Label" hint="Maths unless you type your own $…$.">
            {(id) => (
              <div className="ckt-row">
                <input id={id} className="input mono" value={el.label?.text || ''} onChange={(e) => update({ ...el, label: e.target.value ? { ...el.label, text: e.target.value } : undefined })} spellCheck={false} />
                <Select
                  value={el.label?.side === '_' ? '_' : ''}
                  options={[
                    ['', 'Above'],
                    ['_', 'Below']
                  ]}
                  onChange={(side) => el.label && update({ ...el, label: side ? { text: el.label.text, side: '_' } : { text: el.label.text } })}
                  title="Label side"
                />
              </div>
            )}
          </Field>
          <Field label="Value" hint="Written opposite the label. With siunitx on in Style, 10 kΩ becomes \qty{10}{\kilo\ohm}.">
            {(id) => <input id={id} className="input mono" value={el.value || ''} onChange={(e) => update({ ...el, value: e.target.value || undefined })} spellCheck={false} />}
          </Field>
          <MarkFields label="Voltage" mark={el.voltage} onChange={(voltage) => update({ ...el, voltage })} />
          <MarkFields label="Current" mark={el.current} onChange={(current) => update({ ...el, current })} />
          <MarkFields label="Flow" mark={el.flow} onChange={(flow) => update({ ...el, flow })} hint="An arrow beside the part, for power or heat flow." />
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
        </>
      )}
      <OptionFields el={el} onChange={(options) => update({ ...el, options: options.length ? options : undefined })} />
      {actions}
    </div>
  );
}

function WireInspector({ el, update, actions }: { el: Wire; update: (el: Element) => void; actions: ReactNode }) {
  return (
    <div className="ckt-inspector">
      <div className="ckt-inspector-title">Wire</div>
      {el.routes.map((route, i) => (
        <Field key={i} label={el.routes.length > 1 ? `Segment ${i + 1}` : 'Route'}>
          {() => <Select value={route} options={ROUTES} onChange={(value) => update({ ...el, routes: el.routes.map((r, j) => (j === i ? (value as Route) : r)) })} />}
        </Field>
      ))}
      <Field label="Arrowheads">
        {() => <Select value={el.arrows || ''} options={ARROWS} onChange={(value) => update({ ...el, arrows: (value || undefined) as Wire['arrows'] })} />}
      </Field>
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
