// Units as siunitx 3 writes them, for the modes that write values: a unit typed the way people type it (kN/m, kN·m,
// N/mm², kΩ, µF) read into siunitx's macros, a value with its unit written as \qty{10}{\kilo\newton} and a unit alone
// as \unit{\kilo\newton\metre}. A unit it doesn't know is written literally, which siunitx 3 accepts (\qty{3}{kip/ft}).
// With the drawing's “Write units with siunitx” off, each writes the text as the modes wrote it before.

const PREFIXES: Record<string, string> = { G: 'giga', M: 'mega', k: 'kilo', c: 'centi', m: 'milli', u: 'micro', 'µ': 'micro', 'μ': 'micro', n: 'nano', p: 'pico' };
const BASES: Record<string, string> = {
  N: 'newton', Pa: 'pascal', 'Ω': 'ohm', ohm: 'ohm', F: 'farad', H: 'henry', V: 'volt', A: 'ampere', Hz: 'hertz', m: 'metre', s: 'second',
  W: 'watt', J: 'joule', g: 'gram', '°': 'degree', '°C': 'degreeCelsius', K: 'kelvin', C: 'coulomb', rad: 'radian', S: 'siemens', T: 'tesla'
};
const POWERS: Record<string, string> = { '2': '\\squared', '3': '\\cubed' };

/** One unit with its prefix and power, kN, mm², s^-1, as siunitx macros; null when it isn't one. */
function token(text: string): string | null {
  const [, name, power] = /^([^\d^²³-]+)(?:\^\{?(-?\d)\}?|([²³]))?$/.exec(text) ?? [];
  if (!name) return null;
  const sup = power ?? (text.endsWith('²') ? '2' : text.endsWith('³') ? '3' : '');
  const base = BASES[name] ? `\\${BASES[name]}` : PREFIXES[name[0]] && BASES[name.slice(1)] ? `\\${PREFIXES[name[0]]}\\${BASES[name.slice(1)]}` : null;
  if (!base) return null;
  return `${base}${sup ? POWERS[sup] ?? `\\tothe{${sup}}` : ''}`;
}

/**
 * A unit as siunitx's macros: kN/m → \kilo\newton\per\metre, kN m, kN·m and kN\,m → \kilo\newton\metre,
 * N/mm² → \newton\per\square… (as \milli\metre\squared), \kilo\ohm as typed. Null when any part of it is unknown.
 */
export function siUnit(typed: string): string | null {
  const text = typed.replace(/\$/g, '').replace(/\u2126/g, 'Ω').trim();
  if (!text) return null;
  if (/^(?:\\[a-z]+(?:\{[^{}]*\})?\s*)+$/.test(text)) return text.replace(/\s+/g, '');
  const parts = text.split(/(\/)|\\[,;]|\\cdot|[\s·⋅*]+|(?<=[A-Za-zΩ°])\.(?=[A-Za-zΩµμ°])/).filter((p) => p !== undefined && p !== '');
  let out = '';
  let per = false;
  for (const part of parts) {
    if (part === '/') {
      if (per || !out) return null;
      per = true;
      out += '\\per';
      continue;
    }
    const macros = token(part);
    if (!macros) return null;
    out += macros;
  }
  // a / with nothing after it
  return out.endsWith('\\per') ? null : out || null;
}

/** A unit siunitx can take literally: plain letters, digits and / . ^, the TeX spacing written as siunitx's product. */
const literal = (typed: string) => {
  const text = typed.replace(/\$/g, '').replace(/\\[,;]|\s+/g, '.').trim();
  return /^[A-Za-z%][A-Za-z0-9%/.^{}-]*$/.test(text) ? text : null;
};

/** A number as typed, with a typographic minus made plain. */
const NUMBER = /^\s*([-+−]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][-+−]?\d+)?)\s*/;

/**
 * What a mode writes its values and units with. `used` turns true once siunitx is written, for the mode to add it to
 * its packages (Insert adds it to the document through documentLoads, like any other package). Off, every method
 * writes what the modes wrote before siunitx, so a drawing without the switch exports exactly as it did.
 */
export function unitWriter(on: boolean) {
  const writer = {
    on,
    used: false,
    /** \qty{10}{\kilo\newton}; off, $10$\,kN */
    qty(value: string, unit: string) {
      if (!on) return `$${value}$\\,${unit}`;
      writer.used = true;
      return `\\qty{${value}}{${siUnit(unit) ?? literal(unit) ?? unit}}`;
    },
    /** maths, then a value: $R_{Ay} = \qty{10}{\kilo\newton}$; off, $R_{Ay} = 10$\,kN */
    equals(maths: string, value: string, unit: string) {
      if (!on) return `$${maths} = ${value}$\\,${unit}`;
      return `$${maths} = ${writer.qty(value, unit)}$`;
    },
    /** a unit alone, as in an axis title: \unit{\kilo\newton\metre}; off, as given */
    unit(unit: string) {
      if (!on) return unit;
      writer.used = true;
      return `\\unit{${siUnit(unit) ?? literal(unit) ?? unit}}`;
    },
    /** a number alone: \num{-24.1}; off, $-24.1$ */
    num(value: string) {
      if (!on) return `$${value}$`;
      writer.used = true;
      return `\\num{${value}}`;
    },
    /**
     * Text a user typed that reads as a number and a unit (10 kΩ, 4.7 µF, 4.7<\kilo\ohm>), as \qty; null when it
     * doesn't, or when off, so the mode writes it as before.
     */
    typed(text: string): string | null {
      if (!on) return null;
      const number = NUMBER.exec(text);
      if (!number) return null;
      const rest = text.slice(number[0].length).trim();
      const unit = /^<([^<>]+)>$/.exec(rest)?.[1].trim() ?? rest;
      const macros = unit && (siUnit(unit) ?? literal(unit));
      if (!macros) return null;
      writer.used = true;
      return `\\qty{${number[1].replace(/−/g, '-')}}{${macros}}`;
    },
    /** An axis title ending in a unit in brackets, Load (kN) or σ [MPa], with the unit as \unit when it's a known one. */
    title(text: string) {
      if (!on) return text;
      return text.replace(/([([])\s*([^()[\]]+?)\s*([)\]])\s*$/, (whole, open: string, unit: string, close: string) => {
        const macros = siUnit(unit);
        if (!macros) return whole;
        writer.used = true;
        return `${open}\\unit{${macros}}${close}`;
      });
    }
  };
  return writer;
}

export type UnitWriter = ReturnType<typeof unitWriter>;

/** The siunitx macros above as the text they print, so a label's width is guessed from what it shows. */
export function unitsAsText(tex: string) {
  const names = new Map<string, string>([
    ...Object.entries(PREFIXES).filter(([k]) => k !== 'u' && k !== 'μ').map(([k, v]) => [v, k] as [string, string]),
    ...Object.entries(BASES).filter(([k]) => k !== 'ohm').map(([k, v]) => [v, k] as [string, string]),
    ['per', '/'],
    ['squared', '²'],
    ['cubed', '³']
  ]);
  return tex
    .replace(/\\(?:qty|SI)\{([^{}]*)\}\{([^{}]*)\}/g, '$1 $2')
    .replace(/\\(?:unit|si|num)\{([^{}]*)\}/g, '$1')
    .replace(/\\([a-zA-Z]+)/g, (whole, name: string) => names.get(name) ?? whole);
}
