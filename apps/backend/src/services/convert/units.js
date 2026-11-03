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
 * A siunitx number as typed text and as Typst maths: { text, maths, power, uncertain }, power saying the text needs maths
 * itself (a power of ten); null when it isn't one siunitx would read. \pm 15 is ±15, 1.2 \pm 0.1 is 1.2~±~0.1 and 47e3
 * is $47 times 10^3$. In maths a number of four or more digits keeps its commas as text, where maths would space them.
 */
export function siNumber(source) {
  const text = String(source).replace(/\\pm\b|\+-/g, '±').replace(/\\mp\b/g, '∓').replace(/\\,|~|\s+/g, ' ').trim();
  const m = /^([-+±∓]?)\s*(\d*[.,]?\d+)(?:\s*([±∓])\s*(\d*[.,]?\d+))?(?:\s*(?:[eE]|\\times\s*10\^)\s*\{?\s*([-+]?\d+)\s*\}?)?$/.exec(text);
  if (!m) return null;
  const [, sign, mantissa, pm, uncertainty, exponent] = m;
  const digits = (n) => groupDigits(n.replace(',', '.').replace(/^\./, '0.'));
  const inMaths = (n) => (digits(n).includes(',') ? '#[' + digits(n) + ']' : digits(n));
  const out = sign + digits(mantissa) + (pm ? '~' + pm + '~' + digits(uncertainty) : '');
  const maths = { '±': 'plus.minus ', '∓': 'minus.plus ' }[sign] ?? sign;
  let inside = maths + inMaths(mantissa) + (pm ? ' ' + (pm === '±' ? 'plus.minus' : 'minus.plus') + ' ' + inMaths(uncertainty) : '');
  if (exponent !== undefined) {
    const power = String(Number(exponent));
    inside = (pm ? '(' + inside + ')' : inside) + ' times 10^' + (power.length > 1 ? '(' + power + ')' : power);
    return { text: '$' + inside + '$', maths: inside, power: true, uncertain: !!pm };
  }
  return { text: out, maths: inside, power: false, uncertain: !!pm };
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

/**
 * A quantity as typed text and as Typst maths: { text: '4.7~kΩ', maths: '4.7 thin "kΩ"' }, as TYPST_STYLE.md writes one
 * in prose and in an equation; ±15~V, (1.2~±~0.1)~m and 22.5° too. null when either part isn't siunitx's.
 */
export function siQuantity(number, unit) {
  const n = siNumber(number);
  const u = siUnit(unit);
  if (!n || !u) return null;
  const value = n.uncertain && !n.power ? '(' + n.text + ')' : n.text;
  const inside = n.uncertain && !n.power ? '(' + n.maths + ')' : n.maths;
  return { text: value + (NO_SPACE.has(u) ? '' : '~') + u, maths: inside + (NO_SPACE.has(u) ? '' : ' thin ') + JSON.stringify(u) };
}

/** \ang's argument as typed text: 22.5° or 1°2′3″ (in maths too, as text). */
export function siAngle(source) {
  const parts = String(source).split(';').map((part) => part.trim());
  if (parts.length > 3 || parts.some((part) => part && !siNumber(part))) return null;
  return parts.map((part, i) => (part ? siNumber(part).text + ['°', '′', '″'][i] : '')).join('');
}

// ─── Typed units back to siunitx ───

// each symbol's macro, the first spelling winning (metre, not meter); B is a byte, which a bel alone seldom is
const symbolTable = (table, skip = []) => [...new Map(Object.entries(table).filter(([name]) => !skip.includes(name)).map(([name, symbol]) => [symbol, name]))].sort((a, b) => b[0].length - a[0].length);
const UNIT_SYMBOLS = symbolTable(UNITS, ['meter', 'liter', 'bel', 'degree', 'arcminute', 'arcsecond']);
const PREFIX_SYMBOLS = [...symbolTable(PREFIXES, ['deka']), ['μ', 'micro']];
const POWER = /^(⁻)?([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/;
const DIGIT = Object.fromEntries([...'⁰¹²³⁴⁵⁶⁷⁸⁹'].map((d, i) => [d, String(i)]));

/** A run of unit symbols (kWh, µs², K⁻¹) as [{ prefix, unit, power }] by longest match, whole symbols first; null if one doesn't read. */
function symbolRun(run) {
  const out = [];
  for (let i = 0; i < run.length; ) {
    if (run[i] === '·' || run[i] === '⋅') {
      i += 1;
      continue;
    }
    let best = null;
    for (const [symbol, unit] of UNIT_SYMBOLS) if (run.startsWith(symbol, i) && (!best || symbol.length > best.len)) best = { len: symbol.length, prefix: '', unit };
    for (const [psymbol, prefix] of PREFIX_SYMBOLS) {
      if (!run.startsWith(psymbol, i)) continue;
      for (const [symbol, unit] of UNIT_SYMBOLS) {
        const len = psymbol.length + symbol.length;
        if (run.startsWith(symbol, i + psymbol.length) && (!best || len > best.len)) best = { len, prefix, unit };
      }
    }
    if (!best) return null;
    i += best.len;
    const power = POWER.exec(run.slice(i));
    if (power) i += power[0].length;
    out.push({ prefix: best.prefix, unit: best.unit, power: (power?.[1] ? -1 : 1) * (power ? Number([...power[2]].map((d) => DIGIT[d]).join('')) : 1) });
  }
  return out.length ? out : null;
}

/** A typed unit (kΩ, V/µs, m/s², J/(kg·K), K⁻¹) as siunitx macros, or null when it isn't one. */
export function typedUnit(text) {
  const [top, bottom = '', ...more] = String(text).split('/');
  if (more.length) return null;
  const above = top ? symbolRun(top) : [];
  const below = bottom ? symbolRun(bottom.replace(/^\((.*)\)$/, '$1')) : [];
  if (!above || !below || (!above.length && !below.length)) return null;
  const write = ({ prefix, unit, power }, per) => {
    const p = Math.abs(power);
    return (per || power < 0 ? '\\per' : '') + (prefix ? '\\' + prefix : '') + '\\' + unit + (p === 2 ? '\\squared' : p === 3 ? '\\cubed' : p === 1 ? '' : '\\tothe{' + p + '}');
  };
  return [...above.map((u) => write(u, false)), ...below.map((u) => write(u, true))].join('');
}

/** A typed number (4.7, -5.4, ±15, 7,790, 1.2~±~0.1, 47 times 10^3) as siunitx reads one, or null. */
export function typedNumber(text) {
  const t = String(text).replace(/[−–]/g, '-').replace(/~|\s+|thin/g, ' ').trim();
  const m = /^\(?\s*([-+±∓])?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:\s*(±|plus\.minus)\s*(\d+(?:\.\d+)?))?\s*\)?(?:\s*(?:times|×)\s*10\s*\^\s*\(?\s*([-−]?\d+)\s*\)?)?$/.exec(t);
  if (!m) return null;
  const [, sign = '', whole, decimals = '', pm, uncertainty, exponent] = m;
  const signText = sign === '±' ? '\\pm ' : sign === '∓' ? '\\mp ' : sign;
  return signText + whole.replace(/,/g, '') + decimals + (pm ? ' \\pm ' + uncertainty : '') + (exponent !== undefined ? 'e' + exponent.replace('−', '-') : '');
}
