// Self-check for the unit writer: typed units read as siunitx's macros, values and units written on and off. Run:
// npx esbuild apps/frontend/src/diagram/units.check.ts --bundle --platform=node --log-level=warning | node
import { siUnit, unitWriter, unitsAsText } from './units';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const UNITS: [string, string | null][] = [
  ['kN', '\\kilo\\newton'],
  ['kN/m', '\\kilo\\newton\\per\\metre'],
  ['kN·m', '\\kilo\\newton\\metre'],
  ['kN m', '\\kilo\\newton\\metre'],
  ['kN\\,m', '\\kilo\\newton\\metre'],
  ['kN.m', '\\kilo\\newton\\metre'],
  ['N/mm²', '\\newton\\per\\milli\\metre\\squared'],
  ['N/mm^2', '\\newton\\per\\milli\\metre\\squared'],
  ['kN/m$^2$', '\\kilo\\newton\\per\\metre\\squared'],
  ['MPa', '\\mega\\pascal'],
  ['kPa', '\\kilo\\pascal'],
  ['kΩ', '\\kilo\\ohm'],
  ['k\u2126', '\\kilo\\ohm'],
  ['Ω', '\\ohm'],
  ['µF', '\\micro\\farad'],
  ['μF', '\\micro\\farad'],
  ['uF', '\\micro\\farad'],
  ['nF', '\\nano\\farad'],
  ['mH', '\\milli\\henry'],
  ['V', '\\volt'],
  ['mV', '\\milli\\volt'],
  ['A', '\\ampere'],
  ['mA', '\\milli\\ampere'],
  ['Hz', '\\hertz'],
  ['kHz', '\\kilo\\hertz'],
  ['mm', '\\milli\\metre'],
  ['m', '\\metre'],
  ['cm', '\\centi\\metre'],
  ['°', '\\degree'],
  ['s', '\\second'],
  ['ms', '\\milli\\second'],
  ['W', '\\watt'],
  ['kW', '\\kilo\\watt'],
  ['J', '\\joule'],
  ['s^-1', '\\second\\tothe{-1}'],
  ['\\kilo\\ohm', '\\kilo\\ohm'],
  ['kip', null],
  ['kip/ft', null],
  ['kN/', null],
  ['', null]
];
for (const [typed, macros] of UNITS) eq(siUnit(typed), macros, `${typed} as siunitx`);

const on = unitWriter(true);
eq(on.used, false, 'nothing written yet');
eq(on.qty('10', 'kN'), '\\qty{10}{\\kilo\\newton}', 'a force');
eq(on.used, true, 'siunitx once written');
eq(on.qty('3', 'kip/ft'), '\\qty{3}{kip/ft}', 'an unknown unit literally');
eq(on.qty('3', 'kip\\,ft'), '\\qty{3}{kip.ft}', 'TeX spacing as siunitx’s product');
eq(on.equals('R_{Ay}', '13.4', 'kN'), '$R_{Ay} = \\qty{13.4}{\\kilo\\newton}$', 'a named value');
eq(on.unit('kN\\,m'), '\\unit{\\kilo\\newton\\metre}', 'a unit alone');
eq(on.num('-24.1'), '\\num{-24.1}', 'a number alone');
eq(on.typed('10 kΩ'), '\\qty{10}{\\kilo\\ohm}', 'a typed value');
eq(on.typed('4.7µF'), '\\qty{4.7}{\\micro\\farad}', 'without a space');
eq(on.typed('4.7<\\kilo\\ohm>'), '\\qty{4.7}{\\kilo\\ohm}', 'circuitikz’s own way');
eq(on.typed('−5 V'), '\\qty{-5}{\\volt}', 'a typographic minus');
eq(on.typed('3 kip/ft'), '\\qty{3}{kip/ft}', 'an unknown unit');
eq([on.typed('R_1'), on.typed('10'), on.typed('5 V_{rms}'), on.typed('10 \\Omega')], [null, null, null, null], 'not a value and unit: as before');
eq(on.title('Load (kN)'), 'Load (\\unit{\\kilo\\newton})', 'an axis title’s unit');
eq(on.title('$\\sigma$ [MPa]'), '$\\sigma$ [\\unit{\\mega\\pascal}]', 'in square brackets');
eq(on.title('Case (a)'), 'Case (a)', 'brackets that aren’t a unit');

// in a document that loads physics: \SI, siunitx 3's older name for \qty
const physics = unitWriter(true, true);
eq([physics.qty('10', 'kN'), physics.typed('4.7 µF'), physics.unit('kN'), physics.num('2')], ['\\SI{10}{\\kilo\\newton}', '\\SI{4.7}{\\micro\\farad}', '\\unit{\\kilo\\newton}', '\\num{2}'], 'physics: \\SI');

// a thousands comma, which siunitx would read as a decimal one
eq([on.typed('2,200 µF'), on.typed('1,000,000 Ω'), on.typed('4,7 µF'), on.typed('2,20 µF')], ['\\qty{2200}{\\micro\\farad}', null, '\\qty{4,7}{\\micro\\farad}', '\\qty{2,20}{\\micro\\farad}'], 'commas');
// a bracket straight after a name is maths, not a unit
eq([on.title('G(s)'), on.title('Gain G(s) (V)'), on.title('(kN)')], ['G(s)', 'Gain G(s) (\\unit{\\volt})', '(\\unit{\\kilo\\newton})'], 'G(s)');
// % as siunitx's \percent, never a TeX comment
eq([on.typed('50 %'), on.typed('50%'), on.unit('%')], ['\\qty{50}{\\percent}', '\\qty{50}{\\percent}', '\\unit{\\percent}'], 'percent');

const off = unitWriter(false);
eq([off.qty('10', 'kN'), off.equals('R_{Ay}', '13.4', 'kN'), off.unit('kN\\,m'), off.num('-24.1'), off.typed('10 kΩ'), off.title('Load (kN)')], ['$10$\\,kN', '$R_{Ay} = 13.4$\\,kN', 'kN\\,m', '$-24.1$', null, 'Load (kN)'], 'off: as before');
eq(off.used, false, 'off never writes siunitx');

// as siunitx prints it, a negative power after \per
eq(
  ['\\qty{10}{\\kilo\\newton\\per\\metre}', '\\unit{\\kilo\\newton\\metre}', '\\SI{5}{\\newton\\per\\milli\\metre\\squared}', '\\qty{3}{kip/ft}', '\\num{-24.1}', '\\qty{2}{\\degreeCelsius}'].map(unitsAsText),
  ['10 kN m⁻¹', 'kN m', '5 N mm⁻²', '3 kip/ft', '-24.1', '2 °C'],
  'shown as its text'
);
console.log('units.check: ok');
