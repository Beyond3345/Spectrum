// siunitx's quantities and the typed units of TYPST_STYLE.md: \qty{4.7}{\kilo\ohm} is 4.7~kΩ, \num{7790} is 7,790 and
// \ang{22.5} is 22.5°. Each unit is its macro and its symbol, so a quantity reads the same in both languages.

export const PREFIXES = {
  quecto: 'q', ronto: 'r', yocto: 'y', zepto: 'z', atto: 'a', femto: 'f', pico: 'p', nano: 'n', micro: 'µ', milli: 'm',
  centi: 'c', deci: 'd', deca: 'da', deka: 'da', hecto: 'h', kilo: 'k', mega: 'M', giga: 'G', tera: 'T', peta: 'P',
  exa: 'E', zetta: 'Z', yotta: 'Y', ronna: 'R', quetta: 'Q', kibi: 'Ki', mebi: 'Mi', gibi: 'Gi', tebi: 'Ti'
};

export const UNITS = {
  ampere: 'A', candela: 'cd', kelvin: 'K', kilogram: 'kg', gram: 'g', metre: 'm', meter: 'm', mole: 'mol', second: 's',
  becquerel: 'Bq', degreeCelsius: '°C', coulomb: 'C', farad: 'F', gray: 'Gy', hertz: 'Hz', henry: 'H', joule: 'J',
  katal: 'kat', lumen: 'lm', lux: 'lx', newton: 'N', ohm: 'Ω', pascal: 'Pa', radian: 'rad', siemens: 'S', sievert: 'Sv',
  steradian: 'sr', tesla: 'T', volt: 'V', watt: 'W', weber: 'Wb', astronomicalunit: 'au', bel: 'B', dalton: 'Da', day: 'd',
  decibel: 'dB', degree: '°', electronvolt: 'eV', hectare: 'ha', hour: 'h', litre: 'L', liter: 'L', arcminute: '′',
  minute: 'min', arcsecond: '″', neper: 'Np', tonne: 't', percent: '%', angstrom: 'Å', bar: 'bar', barn: 'b', knot: 'kn',
  mmHg: 'mmHg', atomicmassunit: 'u', bit: 'bit', byte: 'B'
};

// a unit written straight after its number, as siunitx sets them: 22.5°, not 22.5 °
const NO_SPACE = new Set(['°', '′', '″']);
const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
const superscript = (power) => [...String(power)].map((ch) => SUPERSCRIPT[ch] ?? '').join('');

/** 7790 as 7,790: commas between groups of three from four digits on, in the whole part only. */
export function groupDigits(number) {
  const [whole, ...rest] = number.split('.');
  const grouped = whole.length >= 4 ? whole.replace(/\B(?=(\d{3})+$)/g, ',') : whole;
  return [grouped, ...rest].join('.');
}

/**
 * A siunitx number as typed text: { text, maths } where maths says it needs Typst maths (a power of ten), or null when
 * it isn't one siunitx would read. \pm 15 is ±15, 1.2 \pm 0.1 is 1.2~±~0.1 and 47e3 is 47 times 10^3.
 */
export function siNumber(source) {
  const text = String(source).replace(/\\pm\b|\+-/g, '±').replace(/\\mp\b/g, '∓').replace(/\\,|~|\s+/g, ' ').trim();
  const m = /^([-+±∓]?)\s*(\d*[.,]?\d+)(?:\s*([±∓])\s*(\d*[.,]?\d+))?(?:\s*(?:[eE]|\\times\s*10\^)\s*\{?\s*([-+]?\d+)\s*\}?)?$/.exec(text);
  if (!m) return null;
  const [, sign, mantissa, pm, uncertainty, exponent] = m;
  const digits = (n) => groupDigits(n.replace(',', '.').replace(/^\./, '0.'));
  let out = sign + digits(mantissa) + (pm ? '~' + pm + '~' + digits(uncertainty) : '');
  if (exponent !== undefined) {
    const power = String(Number(exponent));
    return { text: '$' + out.replace(/~/g, ' ') + ' times 10^' + (power.length > 1 ? '(' + power + ')' : power) + '$', maths: true, uncertain: !!pm };
  }
  return { text: out, maths: false, uncertain: !!pm };
}

/**
 * The symbol of a siunitx unit: \kilo\watt\hour is kWh, \volt\per\micro\second is V/µs and \per\kelvin K⁻¹. Units
 * written as letters (kg.m/s) stay as they are. null when a macro isn't one siunitx has.
 */
export function siUnit(source) {
  const text = String(source).trim();
  if (!text.includes('\\')) return text.replace(/\s+|~/g, '').replace(/\./g, '·') || null;
  const above = [];
  const below = [];
  let prefix = '';
  let pending = 0;
  let per = false;
  let last = null;
  for (const [, name, arg, other] of text.matchAll(/\\([A-Za-z]+)\s*(?:\{([^{}]*)\})?|(\S)/g)) {
    if (other) return null;
    if (name === 'per') per = true;
    else if (name === 'square' || name === 'cubic' || name === 'raiseto') pending = name === 'square' ? 2 : name === 'cubic' ? 3 : Number(arg);
    else if (name in PREFIXES) prefix += PREFIXES[name];
    else if (name in UNITS) {
      last = { symbol: prefix + UNITS[name], power: pending || 1 };
      (per ? below : above).push(last);
      [prefix, pending, per] = ['', 0, false];
    } else if (['squared', 'cubed', 'tothe'].includes(name) && last) {
      last.power = name === 'squared' ? 2 : name === 'cubed' ? 3 : Number(arg);
    } else return null;
    if (!Number.isInteger(pending) || (last && !Number.isInteger(last.power))) return null;
  }
  if (prefix || !above.length && !below.length) return null;
  const write = ({ symbol, power }, sign = 1) => symbol + (power * sign === 1 ? '' : superscript(power * sign));
  if (!above.length) return below.map((unit) => write(unit, -1)).join('');
  const top = above.map((unit) => write(unit)).join('');
  if (!below.length) return top;
  return top + '/' + (below.length === 1 ? write(below[0]) : '(' + below.map((unit) => write(unit)).join('·') + ')');
}

/** A quantity as typed text: 4.7~kΩ, ±15~V, (1.2~±~0.1)~m, 22.5°. null when either part isn't siunitx's. */
export function siQuantity(number, unit) {
  const n = siNumber(number);
  const u = siUnit(unit);
  if (!n || !u) return null;
  const value = n.uncertain && !n.maths ? '(' + n.text + ')' : n.text;
  return value + (NO_SPACE.has(u) ? '' : '~') + u;
}

/** \ang's argument as typed text: 22.5° or 1°2′3″. */
export function siAngle(source) {
  const parts = String(source).split(';').map((part) => part.trim());
  if (parts.length > 3 || parts.some((part) => part && !siNumber(part))) return null;
  return parts.map((part, i) => (part ? siNumber(part).text + ['°', '′', '″'][i] : '')).join('');
}
