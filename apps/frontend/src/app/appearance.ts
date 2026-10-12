import { useSyncExternalStore } from 'react';
import { IS_DESKTOP, setNativeGlass } from './desktop';
import { SETTINGS_CHANGE_EVENT, loadSettings } from './settings';
import type { Accent, AppSettings, PdfPageDark, PdfPageLight, Theme } from './settings';

/** macOS-like accents that read on light and dark surfaces alike */
export const ACCENTS: [Accent, string, string][] = [
  ['system', 'Follow macOS', ''],
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

export const PDF_PAGES_LIGHT: [PdfPageLight, string][] = [
  ['white', 'White'],
  ['cream', 'Cream'],
  ['sepia', 'Sepia'],
  ['grey', 'Grey']
];

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
export function accentInk(hex: string, dark: boolean) {
  // the lightest surface accent text sits on in each mode: white, and the dark sheets and menus
  const [surface, towards] = dark ? ['#2a2a2a', '#ffffff'] : ['#ffffff', '#000000'];
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
    // a browser has nothing behind the page to show, so glass is the app's alone
    const glass = IS_DESKTOP && settings.glass;
    root.classList.toggle('glass', glass);
    for (const [name, value] of Object.entries(glassMix(settings.glassClarity))) root.style.setProperty(name, value);
    setNativeGlass(glass);
    root.dataset.pdfPage = isDark(settings.theme) ? settings.pdfPageDark : settings.pdfPageLight;
  };
  apply();
  onAppearanceChange(apply);
}
