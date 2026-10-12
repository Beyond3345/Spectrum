import type { PdfBox } from '../api/client';
import type { AppSettings } from '../app/settings';

// Double-click jumps between the source and the PDF (SyncTeX): where a click on a page is in PDF points,
// where a box goes on its page, and the highlight's colour and lifetime. No DOM here, so the check runs in Node.

type Rect = { left: number; top: number; width: number; height: number };
/** a page's size in PDF points: pdf.js's viewport at scale 1 */
type Size = { width: number; height: number };

/**
 * A click as PDF points from the page's top-left corner. `rect` is the page as drawn (getBoundingClientRect,
 * so a pinch's stretch and two-page view count); it and the click are CSS pixels, so the zoom and the
 * device pixel ratio drop out. Pages are taken as unrotated; a hundredth of a point is plenty.
 */
export function pdfPoint(clientX: number, clientY: number, rect: Rect, page: Size) {
  const at = (offset: number, drawn: number, size: number) => Math.round((offset / drawn) * size * 100) / 100;
  return { x: at(clientX - rect.left, rect.width, page.width), y: at(clientY - rect.top, rect.height, page.height) };
}

/** Where a box goes on its page, in percent of the page, so it stays in place through zoom and redraws. */
export function overlayStyle(box: PdfBox, page: Size) {
  const pct = (value: number, of: number) => `${(value / of) * 100}%`;
  return { left: pct(box.x, page.width), top: pct(box.y, page.height), width: pct(box.width, page.width), height: pct(box.height, page.height) };
}

// Apple's system colours, light and dark
const HIGHLIGHTS = { yellow: ['#ffcc00', '#ffd60a'], green: ['#34c759', '#30d158'], pink: ['#ff2d55', '#ff375f'], blue: ['#007aff', '#0a84ff'] };

/** The highlight colour as CSS: the accent follows Settings → Appearance (and macOS). */
export function highlightColour(settings: Pick<AppSettings, 'syncHighlightColour' | 'syncHighlightCustom'>, dark: boolean) {
  const colour = settings.syncHighlightColour;
  if (colour === 'accent') return 'var(--accent)';
  if (colour === 'custom') return settings.syncHighlightCustom;
  return HIGHLIGHTS[colour][dark ? 1 : 0];
}

/** fade() after `seconds`, clear() when the fade (half a second, editor.css) is over; returns a cancel. */
export function linger(seconds: number, fade: () => void, clear: () => void) {
  const timers = [window.setTimeout(fade, seconds * 1000), window.setTimeout(clear, seconds * 1000 + 500)];
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}
