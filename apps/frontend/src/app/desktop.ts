import { promptDialog } from './Dialogs';

type TauriInternals = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };

/** True inside the macOS app (Tauri injects this into every page it loads). */
export const IS_DESKTOP = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const tauri = () => (window as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__;

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
    message: 'Enter the full path of a folder on this Mac.',
    placeholder: '/Users/…/Documents/Spectrum',
    defaultValue: opts.defaultPath,
    confirmLabel: 'Choose'
  });
  return typed?.trim() || null;
}

/** Removes the System listener of the last `setNativeTheme` call. */
let stopFollowingSystem = () => {};

/**
 * Keep the native window chrome (traffic lights, vibrancy) and the background
 * shown while resizing (matches --bg-app) in step with the app theme.
 */
export function setNativeTheme(theme: 'system' | 'light' | 'dark') {
  if (!IS_DESKTOP) return;
  stopFollowingSystem();
  stopFollowingSystem = () => {};
  const invoke = (cmd: string, args: Record<string, unknown>) => tauri().invoke(cmd, args).catch(() => undefined);
  invoke('plugin:window|set_theme', { label: 'main', value: theme === 'system' ? null : theme });
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const paint = () => {
    const dark = theme === 'system' ? system.matches : theme === 'dark';
    const value = dark ? [24, 24, 24, 255] : [247, 247, 248, 255];
    invoke('plugin:window|set_background_color', { label: 'main', value });
    invoke('plugin:webview|set_webview_background_color', { label: 'main', value });
  };
  paint();
  // also repaints once leaving a forced theme takes effect (the query follows the window)
  if (theme === 'system') {
    system.addEventListener('change', paint);
    stopFollowingSystem = () => system.removeEventListener('change', paint);
  }
}
