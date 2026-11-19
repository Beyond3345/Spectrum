import { useEffect, useId, useState } from 'react';
import type { ComponentProps } from 'react';
import Select from '../../../app/Select';
import { More, UnitsSwitch } from '../../controls';
import { plain } from '../../sketch';
import type { DiagramMode } from '../../types';
import { formCode, formStyle, newFormModel, presetFor, valuesOf, PRESETS } from './presets';
import type { FormField, FormModel, FormValue, FormValues } from './presets';
import { vennRegions } from './venn';

// Form: one frame for drawings worked out from a few fields. The preset's fields fill the canvas's place; the
// composer's preview below compiles its code as they change.

type CanvasProps = ComponentProps<DiagramMode<FormModel>['Canvas']>;

/** A number typed freely, kept in the drawing once it's a number in range. */
function NumberInput({ id, field, value, readOnly, onChange }: { id: string; field: Extract<FormField, { kind: 'number' }>; value: number; readOnly?: boolean; onChange(v: number): void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // only when the value changes from elsewhere (undo)
  }, [value]);
  // a number out of range isn't kept: the field says what it takes, until the next number typed
  const [out, setOut] = useState(false);
  const [min, max] = [field.min ?? -Infinity, field.max ?? Infinity];
  const unit = field.unit ? ` ${field.unit}` : '';
  const n = (x: number) => x.toLocaleString('en-AU', { maximumFractionDigits: 6 });
  return (
    <>
      <span className="diagram-pair form-number">
        <input
          id={id}
          className="input"
          type="number"
          inputMode="decimal"
          min={field.min}
          max={field.max}
          step={field.step ?? 'any'}
          value={text}
          readOnly={readOnly}
          onChange={(e) => {
            setText(e.target.value);
            const next = Number(e.target.value);
            const number = e.target.value.trim() !== '' && Number.isFinite(next);
            setOut(number && (next < min || next > max));
            if (number && next >= min && next <= max) onChange(next);
          }}
          onBlur={() => setText(String(value))}
          aria-invalid={out || undefined}
        />
        {field.unit && <span className="muted">{field.unit}</span>}
      </span>
      {out && (
        <div className="field-hint error" role="status">
          {max === Infinity ? `Takes ${n(min)}${unit} or more.` : min === -Infinity ? `Takes up to ${n(max)}${unit}.` : `Takes ${n(min)} to ${n(max)}${unit}.`}
        </div>
      )}
    </>
  );
}

function FieldRow({ field, value, readOnly, onChange }: { field: FormField; value: FormValue; readOnly?: boolean; onChange(v: FormValue): void }) {
  const id = useId();
  if (field.kind === 'switch') {
    return (
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={value === true} disabled={readOnly} onChange={(e) => onChange(e.target.checked)} />
        <span>
          {field.label}
          {field.hint && <span className="field-hint">{field.hint}</span>}
        </span>
      </label>
    );
  }
  return (
    <div className="diagram-row">
      <span id={`${id}-label`}>
        <label htmlFor={id}>{field.label}</label>
      </span>
      {field.kind === 'number' ? (
        <NumberInput id={id} field={field} value={Number(value)} readOnly={readOnly} onChange={onChange} />
      ) : field.kind === 'choice' ? (
        <Select labelId={`${id}-label`} value={String(value)} options={field.options} onChange={onChange} disabled={readOnly} />
      ) : (
        <input id={id} className="input" value={String(value)} readOnly={readOnly} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.hint && <div className="field-hint">{field.hint}</div>}
    </div>
  );
}

/** Venn's regions as one table, a row each named by its sets' names, instead of a shade and a text row each. */
function VennTable({ values, readOnly, set }: { values: FormValues; readOnly?: boolean; set(key: string, value: FormValue): void }) {
  return (
    <table className="form-table">
      <thead>
        <tr>
          <th>Region</th>
          <th>Shade</th>
          <th>Count or text</th>
        </tr>
      </thead>
      <tbody>
        {vennRegions(values, plain).map(([mask, name]) => (
          <tr key={mask}>
            <td>{name}</td>
            <td>
              <input type="checkbox" aria-label={`Shade ${name}`} checked={values[`shade${mask}`] === true} disabled={readOnly} onChange={(e) => set(`shade${mask}`, e.target.checked)} />
            </td>
            <td>
              <input className="input" aria-label={`Count or text in ${name}`} spellCheck={false} value={String(values[`text${mask}`])} readOnly={readOnly} onChange={(e) => set(`text${mask}`, e.target.value)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The fields in runs: each grouped field with the fields of its group next to it, each other field alone. */
const folded = (fields: FormField[]) =>
  fields.reduce<FormField[][]>((runs, field) => {
    const last = runs[runs.length - 1];
    if (field.group && last?.[0].group === field.group) last.push(field);
    else runs.push([field]);
    return runs;
  }, []);

function Canvas({ model, onChange, readOnly }: CanvasProps) {
  const preset = presetFor(model.preset);
  if (!preset) return <div className="diagram-hint form-frame">This build of Spectrum has no form called {model.preset}.</div>;
  const values = valuesOf(preset, model.values ?? {});
  const set = (key: string, value: FormValue) => onChange({ ...model, values: { ...model.values, [key]: value } });
  // Venn's region fields are its table's rows
  const venn = model.preset === 'venn';
  return (
    <div className="form-frame">
      <h2>{preset.label}</h2>
      <div className="diagram-inspector-fields">
        {folded(preset.fields.filter((field) => (field.shown?.(values) ?? true) && !(venn && /^(shade|text)\d$/.test(field.key)))).map((run) => {
          const rows = run.map((field) => <FieldRow key={field.key} field={field} value={values[field.key]} readOnly={readOnly} onChange={(value) => set(field.key, value)} />);
          const group = run[0].group;
          // folded, and open by itself while one of them differs from the preset's own
          return group ? (
            <More key={`${model.preset}:${group}`} summary={group} open={run.some((field) => values[field.key] !== preset.values[field.key])}>
              {rows}
            </More>
          ) : (
            rows
          );
        })}
        {venn && <VennTable values={values} readOnly={readOnly} set={set} />}
      </div>
    </div>
  );
}

const CONVENTIONS: Record<string, [string, [string, string][]]> = {
  moments: ['Bending moment diagrams', [['tension', 'Tension side (sagging below)'], ['positive', 'Positive up']]],
  mohrShear: ['Shear axis', [['down', 'τ positive downward'], ['clockwise-above', 'Clockwise shear plotted above'], ['up', 'τ positive upward']]]
};

/** The conventions the drawing was made with (its preset's, copied from Settings › Composer), changed for it alone. */
function StyleMenu({ style, onChange, model }: { style: Record<string, unknown>; onChange(s: Record<string, unknown>): void; model?: FormModel }) {
  const keys = Object.keys(CONVENTIONS).filter((key) => key in style);
  // a drawing from before the switch has no siUnits key, and writes units as typed until it's turned on
  const units = !!model && !!presetFor(model.preset)?.conventions?.includes('siUnits');
  if (!keys.length && !units) return <div className="diagram-hint">This form has no style to change.</div>;
  return (
    <div className="diagram-inspector-fields">
      {keys.map((key) => (
        <div className="diagram-row" key={key}>
          <span>{CONVENTIONS[key][0]}</span>
          <Select value={String(style[key])} options={CONVENTIONS[key][1]} onChange={(value) => onChange({ ...style, [key]: value })} />
        </div>
      ))}
      {units && <UnitsSwitch checked={style.siUnits === true} onChange={(siUnits) => onChange({ ...style, siUnits })} />}
    </div>
  );
}

const form: DiagramMode<FormModel> = {
  id: 'form',
  label: 'Form',
  language: 'tikz',
  emptyModel: () => newFormModel(PRESETS[0].id),
  newStyle: formStyle,
  toCode: (model, style) => formCode(model, style),
  Canvas,
  StyleMenu
};

export default form;
