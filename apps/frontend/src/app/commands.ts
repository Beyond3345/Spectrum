import type { MenuItems } from './Menu';
import { SHORTCUTS, formatShortcut, shortcutKey } from './shortcuts';
import type { Shortcut } from './shortcuts';

// What the command palette (CommandPalette.tsx) lists, from what the app already has: the shortcuts and the menus' own
// items, so a command added to either is found by its name with nothing more to keep up to date.

/** A line of the palette: its name, where in the app it lives, its shortcut, and what choosing it does. */
export type Command = { label: string; section: string; shortcut?: string; checked?: boolean; disabled?: boolean; run: () => void };

/** The shortcuts as commands, each with its key as Settings has it; run does one. The composer's tool keys stay out. */
export function shortcutCommands(overrides: Record<string, string>, run: (shortcut: Shortcut) => void): Command[] {
  return SHORTCUTS.filter((s) => s.group !== 'Diagram' && s.id !== 'commandPalette' && s.id !== 'quickOpen').map((s) => ({
    label: s.label,
    section: s.group,
    shortcut: formatShortcut(shortcutKey(overrides, s.id)) || undefined,
    run: () => run(s)
  }));
}

/**
 * A menu's items as commands: an item under a heading is named after it ("Compiler (this project): XeLaTeX"), and
 * what isn't a command (a separator, a heading, a folder that opens in place) is left out.
 */
export function menuCommands(section: string, items: MenuItems): Command[] {
  let heading = '';
  return items.flatMap((item) => {
    if (!item) return [];
    if (item.separator || item.heading) {
      heading = item.heading ? String(item.label) : '';
      return [];
    }
    if (typeof item.label !== 'string' || item.keepOpen || !item.onSelect) return [];
    const label = heading ? `${heading}: ${item.label}` : item.label;
    return [{ label, section, shortcut: item.shortcut, checked: item.checked, disabled: item.disabled, run: item.onSelect }];
  });
}

// a character that starts a word: what comes after it scores more
const WORD_START = /[\s/._:\-\\(]/;

/**
 * How well text matches what was typed: every typed character in turn, in any case (spaces aside), scoring more at the
 * start of a word and in a run; null when it doesn't match.
 * ponytail: the first place each character fits, not the best one; good enough for names of a few words.
 */
export function matchScore(query: string, text: string): number | null {
  const typed = query.toLowerCase().replace(/\s+/g, '');
  const t = text.toLowerCase();
  let score = 0;
  let at = -1;
  let run = 0;
  for (const ch of typed) {
    const i = t.indexOf(ch, at + 1);
    if (i < 0) return null;
    run = i === at + 1 ? run + 1 : 0;
    score += 1 + run * 2 + (i === 0 || WORD_START.test(t[i - 1]) ? 3 : 0);
    at = i;
  }
  // of two that match as well, the shorter
  return score - t.length / 100;
}

/** The entries that match one of their names, best first (the order they came in for nothing typed). */
export function ranked<T>(query: string, entries: T[], names: (entry: T) => string[]): T[] {
  if (!query.trim()) return entries;
  const best = (entry: T) => names(entry).reduce<number | null>((top, name) => {
    const score = matchScore(query, name);
    return score === null || (top !== null && top >= score) ? top : score;
  }, null);
  return entries
    .map((entry, i) => ({ entry, i, score: best(entry) }))
    .filter((e): e is { entry: T; i: number; score: number } => e.score !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((e) => e.entry);
}
