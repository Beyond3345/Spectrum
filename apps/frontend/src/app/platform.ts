// Which system the page is on, for icons, wording and shortcuts. No imports, so anything can use it.
// navigator.platform, as shortcuts.ts always used: Node reports it too, so the checks see the real system.
const platform = typeof navigator === 'undefined' ? '' : navigator.platform;

/** Outside the app, ?platform=windows shows the Windows UI (for a look from a Mac) until the tab closes; ?platform= ends it. */
function preview() {
  if (typeof window === 'undefined' || '__TAURI_INTERNALS__' in window) return false;
  try {
    const asked = new URLSearchParams(window.location.search).get('platform');
    if (asked === 'windows') sessionStorage.setItem('spectrum-platform', asked);
    else if (asked !== null) sessionStorage.removeItem('spectrum-platform');
    return sessionStorage.getItem('spectrum-platform') === 'windows';
  } catch {
    return false;
  }
}

export const IS_WINDOWS = preview() || /^Win/.test(platform);
export const IS_MAC = !IS_WINDOWS && /Mac|iPhone|iPad/.test(platform);

/** What the system calls these. */
export const OS_NAME = IS_WINDOWS ? 'Windows' : 'macOS';
export const FILE_MANAGER = IS_WINDOWS ? 'File Explorer' : 'Finder';
export const BIN = IS_WINDOWS ? 'Recycle Bin' : 'Bin';
