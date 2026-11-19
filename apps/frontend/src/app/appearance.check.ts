// Self-check for the accent and glass maths. Run:
// npx esbuild apps/frontend/src/app/appearance.check.ts --bundle --platform=node --log-level=warning | node
import { ACCENTS, ICON_COLOURS, ICON_SURFACES, accentColour, accentInk, accentText, contrast, glassMix, mixHex, paletteCss } from './appearance';
import PALETTE from './palette.json';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const WHITE = '#ffffff';
const DARK = '#0d0d0d';
eq(accentText('#ffc600'), DARK, 'yellow takes dark text');
eq(accentText('#ffffff'), DARK, 'white takes dark text');
eq(accentText('#a0e0ff'), DARK, 'a pastel takes dark text');
eq(accentText('#000000'), WHITE, 'black takes white text');
eq(accentText('#34c759'), DARK, 'a pale custom green takes dark text');
for (const [value, label, colour] of ACCENTS) {
  if (!colour) continue;
  const light = ['yellow', 'orange', 'green'].includes(value);
  eq(accentText(colour), light ? DARK : WHITE, `${label} takes ${light ? 'dark text' : 'white text, as in macOS'}`);
  if (contrast(accentText(colour), colour) < 3) throw new Error(`${label}'s text is below 3:1`);
}

// accent text reads at 4.5:1 on the panel in both modes, and an accent that already does is kept
eq(contrast('#ffffff', '#000000'), 21, 'white on black is 21:1');
eq(accentInk('#a550a7', false), '#a550a7', 'purple already reads on white');
eq(accentInk('#ffc600', true), '#ffc600', 'yellow already reads on dark grey');
for (const colour of [...ACCENTS.map(([, , c]) => c).filter(Boolean), '#ffffff', '#000000', '#34c759', '#123456']) {
  const [light, dark] = [accentInk(colour, false), accentInk(colour, true)];
  if (contrast(light, '#ffffff') < 4.5) throw new Error(`${colour} as text in light mode is ${contrast(light, '#ffffff')}:1`);
  if (contrast(dark, '#2a2a2a') < 4.5) throw new Error(`${colour} as text in dark mode is ${contrast(dark, '#2a2a2a')}:1`);
}
if (contrast(accentInk('#ffc600', false), '#ffffff') > 5) throw new Error('yellow is darkened only as far as it needs');
eq(accentColour({ accent: 'system', accentCustom: '#123456' }), '', 'Follow macOS sets nothing');
eq(accentColour({ accent: 'purple', accentCustom: '#123456' }), '#a550a7', 'a named accent');
eq(accentColour({ accent: 'custom', accentCustom: '#123456' }), '#123456', 'Custom uses its colour');

eq(glassMix(0), { '--glass-chrome': '80%', '--glass-panel': '88%', '--glass-reading': '94%' }, 'least see-through');
eq(glassMix(100), { '--glass-chrome': '15%', '--glass-panel': '40%', '--glass-reading': '55%' }, 'clearest');
eq(glassMix(50), { '--glass-chrome': '48%', '--glass-panel': '64%', '--glass-reading': '75%' }, 'halfway');
eq(glassMix(250), glassMix(100), 'clarity above 100 is 100');
eq(glassMix(-5), glassMix(0), 'clarity below 0 is 0');
for (let clarity = 0; clarity <= 100; clarity += 5) {
  const mix = glassMix(clarity);
  const [chrome, panel, reading] = [mix['--glass-chrome'], mix['--glass-panel'], mix['--glass-reading']].map(parseFloat);
  if (!(chrome < panel && panel < reading)) throw new Error(`at ${clarity} the chrome should be clearest, then the panel, then the text`);
  if (reading < 55) throw new Error(`at ${clarity} the editor and PDF drop below 55%`);
}

// the Spectrum colour style's stylesheet: every area in light and dark, and nothing for Simple
const css = paletteCss();
const rule = (selector: string) => css.split('\n').find((line) => line.includes(selector))?.match(/\{(.*)\}/)?.[1] ?? '';
const token = (body: string, name: string) => body.match(new RegExp(`${name}: (#[0-9a-f]{6})`))?.[1] ?? '';
for (const [area, c] of Object.entries(PALETTE)) {
  const light = rule(`:root[data-colour-style='spectrum'] .area-${area} `);
  const dark = rule(`[data-theme='dark'] .area-${area} `);
  eq([token(light, '--area'), token(light, '--area-band'), token(dark, '--area'), token(dark, '--area-text')], [c.light, c.band, c.dark, c.dark], `${area}'s colours`);
  if (contrast(token(light, '--area-text'), '#f7f7f8') < 4.5) throw new Error(`${area}'s text is below 4.5:1 on the window's grey`);
  if (contrast(token(light, '--area-text'), c.light) > 1.2) throw new Error(`${area}'s text is darkened further than it needs`);
  const onBand = token(light, '--area-on-band');
  eq(onBand, ['assistant', 'references'].includes(area) ? DARK : WHITE, `${area}'s fill takes ${onBand} text`);
  if (contrast(onBand, c.band) < 3) throw new Error(`${area}'s text on its fill is below 3:1`);
}
eq(css.split('\n').filter((line) => line.includes('.area-') && !line.includes("[data-colour-style='spectrum']")), [], 'the areas are coloured in Spectrum alone');
eq(accentColour({ accent: 'spectrum', accentCustom: '#123456' }), PALETTE.flow.band, 'the Spectrum accent is the palette’s blue elsewhere');
for (const c of Object.values(PALETTE)) if (contrast('#ffffff', c.light) < 4.5) throw new Error(`Compile’s white words on ${c.light}`);

// every icon colour reads at 3:1 (WCAG 1.4.11) on the surfaces it sits on, and a light one darkened for it keeps the
// hue of Apple's; dark mode is Apple's own
const APPLE = {
  red: ['#ff3b30', '#ff453a'], orange: ['#ff9500', '#ff9f0a'], yellow: ['#ffcc00', '#ffd60a'], green: ['#34c759', '#30d158'],
  mint: ['#00c7be', '#63e6e2'], teal: ['#30b0c7', '#40c8e0'], cyan: ['#32ade6', '#64d2ff'], blue: ['#007aff', '#0a84ff'],
  indigo: ['#5856d6', '#5e5ce6'], purple: ['#af52de', '#bf5af2'], pink: ['#ff2d55', '#ff375f'], brown: ['#a2845e', '#ac8e68'],
  gray: ['#8e8e93', '#98989d'], github: ['#1f2328', '#f0f6fc'], zotero: ['#cc2936', '#e5484d']
};
// the OKLCH hue in degrees
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt);
  return (Math.atan2(0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s) * 180) / Math.PI;
};
eq(Object.keys(ICON_COLOURS), Object.keys(APPLE), 'every icon colour has Apple’s beside it');
for (const [name, [light, dark]] of Object.entries(ICON_COLOURS)) {
  const [appleLight, appleDark] = APPLE[name as keyof typeof APPLE];
  eq(dark, appleDark, `${name} is Apple’s in dark mode`);
  for (const surface of ICON_SURFACES.light(light)) if (contrast(light, surface) < 3) throw new Error(`${name} (${light}) is ${contrast(light, surface).toFixed(2)}:1 on ${surface}`);
  for (const surface of ICON_SURFACES.dark) if (contrast(dark, surface) < 3) throw new Error(`${name} (${dark}) is ${contrast(dark, surface).toFixed(2)}:1 on ${surface}`);
  if (light !== appleLight) {
    const drift = Math.abs(((hue(light) - hue(appleLight) + 540) % 360) - 180);
    if (drift > 3) throw new Error(`${name} moved ${drift.toFixed(1)}° from Apple’s hue`);
    // darkened only as far as it needs: a third of the way back to Apple’s falls under 3:1 somewhere
    const lighter = mixHex(light, appleLight, 0.3);
    if (ICON_SURFACES.light(lighter).every((surface) => contrast(lighter, surface) >= 3)) throw new Error(`${name} is darker than it needs`);
  } else if (ICON_SURFACES.light(light).some((surface) => contrast(light, surface) < 3)) throw new Error(`${name} needs darkening`);
}
const newFill = css.match(/--new-fill: (#[0-9a-f]{6})/)?.[1] ?? '';
if (contrast('#ffffff', newFill) < 4.5) throw new Error(`New’s white label is ${contrast('#ffffff', newFill).toFixed(2)}:1`);
if (contrast('#ffffff', newFill) > 5) throw new Error('New’s blue is darkened only as far as it needs');

console.log('appearance.check: ok');
