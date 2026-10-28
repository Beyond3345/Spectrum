// The Form mode's presets: drawings Spectrum works out from what's typed in a few fields (Mohr's circle, a Venn
// diagram). A preset brings its fields, the values a new drawing starts with and the code those values write; the
// frame (index.tsx) shows the fields, and the composer's preview compiles the code as they change.
import type { DiagramCode } from '../../fileFormat';
import type { ComposerDefaults } from '../../types';
import { num } from '../shared';

export type FormValue = string | number | boolean;
export type FormValues = Record<string, FormValue>;

type FieldBase = { key: string; label: string; hint?: string };
export type FormField =
  | (FieldBase & { kind: 'number'; unit?: string; min?: number; max?: number; step?: number })
  | (FieldBase & { kind: 'text' })
  | (FieldBase & { kind: 'choice'; options: [string, string][] })
  | (FieldBase & { kind: 'switch' });

export interface FormPreset {
  id: string;
  label: string;
  fields: FormField[];
  /** what a new drawing starts with, and what stands in for a value the model lacks */
  values: FormValues;
  /** the Settings › Composer conventions it uses, copied into a new drawing's style */
  conventions?: (keyof ComposerDefaults)[];
  /** the picture; values are the preset's own with the drawing's over them, each of its field's kind */
  toCode(values: FormValues, style: Record<string, unknown>): DiagramCode;
}

export type FormModel = { preset: string; values: FormValues };

/** A circle with a label: the frame's test, which shows a field of each kind reaching the code. */
const test: FormPreset = {
  id: 'test',
  label: 'Labelled circle (test)',
  fields: [
    { key: 'radius', label: 'Radius', kind: 'number', unit: 'cm', min: 0.2, max: 5, step: 0.1 },
    { key: 'label', label: 'Label', kind: 'text', hint: 'LaTeX, as in the document: $r$ for maths.' },
    { key: 'line', label: 'Line', kind: 'choice', options: [['solid', 'Solid'], ['dashed', 'Dashed']] },
    { key: 'filled', label: 'Shaded', kind: 'switch' }
  ],
  values: { radius: 1, label: 'Circle', line: 'solid', filled: false },
  toCode: (values) => {
    const options = [values.line === 'dashed' && 'dashed', values.filled && 'fill=black!10'].filter(Boolean);
    return {
      body: [
        '\\begin{tikzpicture}',
        `\\draw${options.length ? `[${options.join(', ')}]` : ''} (0,0) circle (${num(Number(values.radius))}cm);`,
        `\\node at (0,0) {${String(values.label)}};`,
        '\\end{tikzpicture}',
        ''
      ].join('\n'),
      packages: ['tikz'],
      libraries: []
    };
  }
};

export const PRESETS: FormPreset[] = [test];

export const presetFor = (id: string) => PRESETS.find((preset) => preset.id === id);

export const newFormModel = (id: string): FormModel => ({ preset: id, values: { ...presetFor(id)?.values } });

/** A value kept as its field's kind: a number in range, a choice it offers; anything else, the preset's own. */
function valueFor(field: FormField, value: unknown, fallback: FormValue): FormValue {
  switch (field.kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && value >= (field.min ?? -Infinity) && value <= (field.max ?? Infinity) ? value : fallback;
    case 'text':
      return typeof value === 'string' ? value : fallback;
    case 'choice':
      return field.options.some(([option]) => option === value) ? (value as string) : fallback;
    case 'switch':
      return typeof value === 'boolean' ? value : fallback;
  }
}

/** The values a drawing's code is written from: each field's, checked, over the preset's own. */
export const valuesOf = (preset: FormPreset, values: FormValues): FormValues =>
  Object.fromEntries(preset.fields.map((field) => [field.key, valueFor(field, values[field.key], preset.values[field.key])]));

/** A form's picture. A model whose preset this build doesn't have throws, so the file opens as code. */
export function formCode(model: FormModel, style: Record<string, unknown>): DiagramCode {
  const preset = presetFor(model?.preset);
  if (!preset) throw new Error(`No form called ${model?.preset}`);
  return preset.toCode(valuesOf(preset, model.values ?? {}), style);
}

/** A new form drawing's style: the conventions its preset uses, as Settings › Composer has them now. */
export const formStyle = (defaults: ComposerDefaults, model: FormModel): Record<string, unknown> =>
  Object.fromEntries((presetFor(model.preset)?.conventions ?? []).map((key) => [key, defaults[key]]));
