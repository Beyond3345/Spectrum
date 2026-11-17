import { useSyncExternalStore } from 'react';
import { IS_DESKTOP, WINDOW_LABEL, setNativeGlass } from './desktop';
import { IS_WINDOWS, OS_NAME } from './platform';
import { SETTINGS_CHANGE_EVENT, loadSettings } from './settings';
import type { Accent, AppSettings, PdfPageDark, PdfPageLight, TagColour, Theme } from './settings';
import PALETTE from './palette.json';

/** The app's areas, one per handbook chapter, each with its colour in palette.json */
export type Area = keyof typeof PALETTE;
const AREAS = Object.entries(PALETTE) as [Area, (typeof PALETTE)[Area]][];

/** macOS-like accents that read on light and dark surfaces alike */
export const ACCENTS: [Accent, string, string][] = [
  ['system', `Follow ${OS_NAME}`, ''],
  // the palette's Flow blue: a blue reads as neither a warning (orange, the Editor's colour) nor an error. Compile and
  // the progress bar take the whole spectrum (spectrum.css)
  ['spectrum', 'Spectrum', PALETTE.flow.band],
  ['blue', 'Blue', '#0a84ff'],
  ['purple', 'Purple', '#a550a7'],
  ['pink', 'Pink', '#f74f9e'],
  ['red', 'Red', '#e0383e'],
  ['orange', 'Orange', '#f7821b'],
  ['yellow', 'Yellow', '#ffc600'],
  ['green', 'Green', '#62ba46'],
  ['graphite', 'Graphite', '#8c8c8c'],
  ['custom', 'Custom', '']
];

/** each tag (and persona) colour's name and CSS colour */
export const TAG_COLOURS: Record<TagColour, [string, string]> = {
  blue: ['Blue', 'var(--accent)'],
  green: ['Green', 'var(--green)'],
  orange: ['Orange', 'var(--orange)'],
  red: ['Red', 'var(--red)'],
  yellow: ['Yellow', 'var(--yellow)'],
  purple: ['Purple', 'color-mix(in srgb, var(--accent) 55%, var(--red))'],
  teal: ['Teal', 'color-mix(in srgb, var(--green) 55%, var(--accent))']
};

export const PDF_PAGES_LIGHT: [PdfPageLight, string][] = [
  ['white', 'White'],
  ['cream', 'Cream'],
  ['sepia', 'Sepia'],
  ['grey', 'Grey']
];

/** Each light page colour as editor.css paints the page, which Compile with page colour gives the PDF */
export const PDF_PAGE_FILLS: Record<PdfPageLight, string> = { white: '#ffffff', cream: '#f8f1e1', sepia: '#efe0c2', grey: '#e3e3e5' };

export const PDF_PAGES_DARK: [PdfPageDark, string][] = [
  ['dark', 'Dark'],
  ['black', 'Black'],
  ['dimmed', 'Dimmed'],
  ['white', 'White']
];

/** '#rrggbb' for the chosen accent, or '' to follow macOS */
export function accentColour(settings: Pick<AppSettings, 'accent' | 'accentCustom'>) {
  if (settings.accent === 'custom') return settings.accentCustom;
  return ACCENTS.find(([value]) => value === settings.accent)?.[2] || '';
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** WCAG relative luminance of '#rrggbb', 0 (black) to 1 (white) */
function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two '#rrggbb' colours, 1 to 21 */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text on the accent: dark on light colours (yellow, orange, green, pastels), white on the rest as
 * macOS does. White stays at 3:1 or better up to the cut-off.
 */
export function accentText(hex: string) {
  return luminance(hex) > 0.3 ? '#0d0d0d' : '#ffffff';
}

/**
 * The accent as text (--accent-ink): mixed towards black for light mode, or white for dark, until
 * it reads at 4.5:1 (WCAG AA) on the panel (#ffffff or #212121). One that already does stays as it is.
 */
export function accentInk(hex: string, dark: boolean, on?: string) {
  // the lightest surface accent text sits on in each mode: white, and the dark sheets and menus
  const [surface, towards] = dark ? [on ?? '#2a2a2a', '#ffffff'] : [on ?? '#ffffff', '#000000'];
  const [from, to] = [channels(hex), channels(towards)];
  for (let t = 0; t < 1; t += 0.02) {
    const ink = `#${from.map((v, i) => Math.round(v + (to[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
    if (contrast(ink, surface) >= 4.5) return ink;
  }
  return towards;
}

/**
 * How solid each surface is for a clarity of 0 (least see-through) to 100 (clearest). The window
 * and sidebar clear the most; the editor and PDF never drop below 55% so text stays legible.
 */
export function glassMix(clarity: number) {
  const t = Math.min(100, Math.max(0, clarity)) / 100;
  const pct = (from: number, to: number) => `${Math.round(from + (to - from) * t)}%`;
  return { '--glass-chrome': pct(80, 15), '--glass-panel': pct(88, 40), '--glass-reading': pct(94, 55) };
}

/**
 * The Spectrum colour style's stylesheet, from palette.json: each .area-<name> sets --area (icons and marks), --area-text
 * (text, at 4.5:1 on the window's grey too), --area-band (fills and tints) and --area-on-band (text on the fill: white
 * at 3:1 or better, else near-black), for light and dark. Only :root[data-colour-style='spectrum'] has them, so the
 * Simple style never sees any. --spectrum-ink and --spectrum-band run through the hues, for the Spectrum accent.
 */
export function paletteCss() {
  const on = "[data-colour-style='spectrum']";
  const hues = AREAS.filter(([, c]) => c.hue !== null);
  const rules = (dark: boolean, root: string) =>
    AREAS.map(([area, c]) => {
      const tokens = dark
        ? `--area: ${c.dark}; --area-text: ${c.dark};`
        : `--area: ${c.light}; --area-text: ${accentInk(c.light, false, '#f7f7f8')}; --area-band: ${c.band}; --area-on-band: ${accentText(c.band)};`;
      return `${root} .area-${area} { ${tokens} }`;
    }).join('\n');
  return [
    `:root { --spectrum-ink: linear-gradient(90deg, ${hues.map(([, c]) => c.light).join(', ')}); --spectrum-band: linear-gradient(90deg, ${hues.map(([, c]) => c.band).join(', ')}); --spectrum-wheel: conic-gradient(${hues.map(([, c], i) => `${c.band} ${(i * 360) / hues.length}deg ${((i + 1) * 360) / hues.length}deg`).join(', ')}); }`,
    rules(false, `:root${on}`),
    rules(true, `:root${on}[data-theme='dark']`),
    `@media (prefers-color-scheme: dark) {\n${rules(true, `:root${on}:not([data-theme='light'])`)}\n}`
  ].join('\n');
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

const isDark = (theme: Theme) => (theme === 'system' ? darkQuery().matches : theme === 'dark');

/** Calls back on every settings change and when macOS switches between light and dark. */
function onAppearanceChange(callback: () => void) {
  const query = darkQuery();
  window.addEventListener(SETTINGS_CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  query.addEventListener('change', callback);
  return () => {
    window.removeEventListener(SETTINGS_CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
    query.removeEventListener('change', callback);
  };
}

/** True while the dark appearance shows (forced, or System with macOS in dark mode). */
export const useDarkMode = () => useSyncExternalStore(onAppearanceChange, () => isDark(loadSettings().theme));

/** index.html applies this before the first paint */
const ACCENT_KEY = 'spectrum-accent';

/** Applies the accent, the see-through window and the PDF page colour now and whenever they change. */
export function followAppearance() {
  const style = document.createElement('style');
  style.textContent = paletteCss();
  document.head.append(style);
  const apply = () => {
    const settings = loadSettings();
    const root = document.documentElement;
    const accent = accentColour(settings);
    // inline, so it beats the macOS accent in tokens.css; the derived tokens follow it, and
    // tokens.css picks the ink for the mode showing. '' removes each, back to macOS's accent.
    const tokens = {
      '--accent': accent,
      '--accent-text': accent && accentText(accent),
      '--accent-ink-light': accent && accentInk(accent, false),
      '--accent-ink-dark': accent && accentInk(accent, true)
    };
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
    try {
      window.localStorage.setItem(ACCENT_KEY, accent && `${accent} ${accentText(accent)}`);
    } catch {
      // storage unavailable: the accent is applied a moment later instead
    }
    // a browser has nothing behind the page to show, so glass is the Mac app's alone, and its main window's: the
    // diagram composer's is built opaque (main.rs)
    const glass = IS_DESKTOP && !IS_WINDOWS && WINDOW_LABEL === 'main' && settings.glass;
    root.classList.toggle('glass', glass);
    for (const [name, value] of Object.entries(glassMix(settings.glassClarity))) root.style.setProperty(name, value);
    setNativeGlass(glass);
    root.dataset.colourStyle = settings.colourStyle;
    root.classList.toggle('spectrum-accent', settings.accent === 'spectrum');
    root.dataset.pdfPage = isDark(settings.theme) ? settings.pdfPageDark : settings.pdfPageLight;
  };
  apply();
  onAppearanceChange(apply);
}
