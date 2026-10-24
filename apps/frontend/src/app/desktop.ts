import type { DiagramLanguage } from '../diagram/types';
import { promptDialog } from './Dialogs';
import { IS_WINDOWS } from './platform';

type TauriInternals = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  metadata?: { currentWindow?: { label?: string } };
};

/** True inside the desktop app (Tauri injects this into every page it loads). */
export const IS_DESKTOP = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const tauri = () => (window as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__;

/** The window this page is in (main.rs): 'main', or 'diagram' for the diagram composer's. */
export const WINDOW_LABEL = (IS_DESKTOP && tauri().metadata?.currentWindow?.label) || 'main';

/** Native folder picker in the app; in a browser, ask for an absolute path instead. */
export async function pickFolder(opts: { title?: string; defaultPath?: string } = {}): Promise<string | null> {
  if (IS_DESKTOP) {
    const picked = await tauri().invoke('plugin:dialog|open', {
      options: { directory: true, multiple: false, title: opts.title, defaultPath: opts.defaultPath || undefined }
    });
    return typeof picked === 'string' ? picked : null;
  }
  const typed = await promptDialog({
    title: opts.title || 'Choose a folder',
    message: `Enter the full path of a folder on this ${IS_WINDOWS ? 'PC' : 'Mac'}.`,
    placeholder: IS_WINDOWS ? 'C:\\Users\\…\\Documents\\Spectrum' : '/Users/…/Documents/Spectrum',
    defaultValue: opts.defaultPath,
    confirmLabel: 'Choose'
  });
  return typed?.trim() || null;
}

const invoke = (cmd: string, args: Record<string, unknown>) => tauri().invoke(cmd, args).catch(() => undefined);

/** macOS app: makes Spectrum the default for .tex, .ltx and .bib files (main.rs). Rejects with macOS's reason. */
export const claimDefaultHandler = () => tauri().invoke('claim_default_handler');

/**
 * The diagram composer, in a window of its own beside this one, at a diagram of the project (its project-relative file)
 * or at its chooser, which `lang` can start in. Only one is open: asking again brings it forward at this diagram.
 */
export async function openDiagram(projectId: string, file?: string, lang?: DiagramLanguage) {
  if (IS_DESKTOP) {
    await tauri().invoke('open_diagram', { project: projectId, file, language: lang });
    return;
  }
  const query = new URLSearchParams({ project: projectId, ...(file && { file }), ...(lang && { lang }) });
  if (!window.open(`/diagram?${query}`, 'spectrum-diagram')) throw new Error('The browser blocked its window. Allow pop-ups for Spectrum and try again.');
}

/** Brings this window to the front: the document's, when the composer hands it a diagram to insert. */
export function focusWindow() {
  if (IS_DESKTOP) invoke('plugin:window|set_focus', { label: WINDOW_LABEL });
  else window.focus();
}

/** Removes the System listener of the last `setNativeTheme` call. */
let stopFollowingSystem = () => {};
/** Paints the window background again for the current theme (set by `setNativeTheme`). */
let repaint: () => Promise<unknown> = () => Promise.resolve();
let glassOn = false;

/**
 * Keep the native window chrome (traffic lights, vibrancy) and the background
 * shown while resizing (matches --bg-app) in step with the app theme.
 */
export function setNativeTheme(theme: 'system' | 'light' | 'dark') {
  if (!IS_DESKTOP) return;
  stopFollowingSystem();
  stopFollowingSystem = () => {};
  invoke('plugin:window|set_theme', { label: WINDOW_LABEL, value: theme === 'system' ? null : theme });
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const paint = () => {
    const dark = theme === 'system' ? system.matches : theme === 'dark';
    // see-through: nothing behind the page but the glass
    const value = glassOn ? [0, 0, 0, 0] : dark ? [24, 24, 24, 255] : [247, 247, 248, 255];
    return Promise.all([
      invoke('plugin:window|set_background_color', { label: WINDOW_LABEL, value }),
      invoke('plugin:webview|set_webview_background_color', { label: WINDOW_LABEL, value })
    ]);
  };
  repaint = paint;
  paint();
  // also repaints once leaving a forced theme takes effect (the query follows the window)
  if (theme === 'system') {
    system.addEventListener('change', paint);
    stopFollowingSystem = () => system.removeEventListener('change', paint);
  }
}

/**
 * Puts macOS glass behind the window (Liquid Glass on macOS 26 and later, vibrancy before) or
 * takes it away. Only when it turns on or off: each set_effects rebuilds the native view.
 */
export function setNativeGlass(on: boolean) {
  if (!IS_DESKTOP || on === glassOn) return;
  glassOn = on;
  const apply = () =>
    Promise.all([
      invoke('plugin:window|set_effects', {
        label: WINDOW_LABEL,
        value: on ? { effects: ['liquidGlassRegular', 'underWindowBackground'], state: 'active' } : null
      }),
      repaint()
    ]);
  // main.rs keeps the window opaque unless glass is on. An opaque window with a clear background
  // shows black, so it turns see-through before the clear paint and opaque after the solid one;
  // a step a later call has overtaken is skipped
  const glass = () => invoke('plugin:event|emit', { event: 'glass', payload: on });
  if (on) {
    glass().then(() => {
      if (glassOn) apply();
    });
  } else {
    apply().then(() => {
      if (!glassOn) glass();
    });
  }
}

/** Takes the window into full screen or out of it (presentation mode); in a browser, the page. */
export function setFullscreen(on: boolean) {
  if (IS_DESKTOP) invoke('plugin:window|set_fullscreen', { label: WINDOW_LABEL, value: on });
  else if (on) document.documentElement.requestFullscreen?.().catch(() => undefined);
  else if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
}

/**
 * Marks <html> with .fullscreen if the page loads in macOS full screen. There are no traffic
 * lights there, so the stylesheets drop the room kept for them. Later changes are set by the
 * shell (main.rs) as macOS starts each change, so the page moves along with it.
 */
export function followFullscreen() {
  if (!IS_DESKTOP) return;
  tauri()
    .invoke('plugin:window|is_fullscreen', { label: WINDOW_LABEL })
    .then((full) => document.documentElement.classList.toggle('fullscreen', full === true))
    .catch(() => undefined);
}
