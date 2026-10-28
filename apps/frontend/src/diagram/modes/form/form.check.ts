// Self-check for the Form mode's presets and frame. Run:
// npx esbuild apps/frontend/src/diagram/modes/form/form.check.ts --bundle --platform=node --log-level=warning | node
import { PRESETS, formCode, formStyle, newFormModel, presetFor, valuesOf } from './presets';
import type { FormPreset } from './presets';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const test = presetFor('test')!;
eq(newFormModel('test'), { preset: 'test', values: { radius: 1, label: 'Circle', line: 'solid', filled: false } }, 'a new drawing takes the preset’s values');
eq(formCode(newFormModel('test'), {}).body.split('\n'), ['\\begin{tikzpicture}', '\\draw (0,0) circle (1cm);', '\\node at (0,0) {Circle};', '\\end{tikzpicture}', ''], 'the picture');
eq(formCode({ preset: 'test', values: { radius: 2.5, label: '$r$', line: 'dashed', filled: true } }, {}).body.split('\n')[1], '\\draw[dashed, fill=black!10] (0,0) circle (2.5cm);', 'each field reaches the code');
// a value out of range, of the wrong kind or missing falls back to the preset's own
eq(valuesOf(test, { radius: 99, label: 7, line: 'wavy', filled: 'yes' } as never), test.values, 'bad values fall back');
eq(valuesOf(test, { radius: 0.5 }), { ...test.values, radius: 0.5 }, 'missing values fall back');
eq(formCode({ preset: 'test' } as never, {}).packages, ['tikz'], 'no values at all');
let threw = false;
try {
  formCode({ preset: 'mohr', values: {} }, {});
} catch {
  threw = true;
}
eq(threw, true, 'a preset this build doesn’t have throws, so the file opens as code');

// a preset's conventions are copied from Settings › Composer into a new drawing's style; others aren't
const defaults = { moments: 'positive', mohrShear: 'up' } as const;
eq(formStyle(defaults, newFormModel('test')), {}, 'the test preset uses none');
const conventions: FormPreset = { ...test, id: 'conventions', conventions: ['mohrShear'] };
PRESETS.push(conventions);
eq(formStyle(defaults, newFormModel('conventions')), { mohrShear: 'up' }, 'a preset’s own conventions only');
eq(formStyle({ moments: 'tension', mohrShear: 'down' }, newFormModel('conventions')), { mohrShear: 'down' }, 'as the settings have them now');
PRESETS.pop();

console.log('form.check: ok');
