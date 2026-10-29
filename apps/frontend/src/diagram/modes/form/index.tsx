import { useEffect, useId, useState } from 'react';
import type { ComponentProps } from 'react';
import Select from '../../../app/Select';
import { UnitsSwitch } from '../../controls';
import type { DiagramMode } from '../../types';
import { formCode, formStyle, newFormModel, presetFor, valuesOf, PRESETS } from './presets';
import type { FormField, FormModel, FormValue } from './presets';

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
  return (
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
          if (e.target.value.trim() && Number.isFinite(next) && next >= (field.min ?? -Infinity) && next <= (field.max ?? Infinity)) onChange(next);
        }}
        onBlur={() => setText(String(value))}
      />
      {field.unit && <span className="muted">{field.unit}</span>}
    </span>
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

function Canvas({ model, onChange, readOnly }: CanvasProps) {
  const preset = presetFor(model.preset);
  if (!preset) return <div className="diagram-hint form-frame">This build of Spectrum has no form called {model.preset}.</div>;
  const values = valuesOf(preset, model.values ?? {});
  return (
    <div className="form-frame">
      <h2>{preset.label}</h2>
      <div className="diagram-inspector-fields">
        {preset.fields.filter((field) => field.shown?.(values) ?? true).map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={values[field.key]}
            readOnly={readOnly}
            onChange={(value) => onChange({ ...model, values: { ...model.values, [field.key]: value } })}
          />
        ))}
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
