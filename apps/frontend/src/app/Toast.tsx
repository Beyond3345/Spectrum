import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export type ToastTone = 'info' | 'success' | 'error';

type ToastAction = { label: string; onClick: () => void };

type ToastItem = { id: number; message: string; tone: ToastTone; action?: ToastAction };

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const timers = new Map<number, number>();
const deadlines = new Map<number, number>();
/** time a held toast had left when the pointer or focus arrived */
const held = new Map<number, number>();

function dismiss(id: number) {
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  deadlines.delete(id);
  held.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function schedule(id: number, ms: number) {
  window.clearTimeout(timers.get(id));
  timers.set(id, window.setTimeout(() => dismiss(id), ms));
  deadlines.set(id, Date.now() + ms);
  held.delete(id);
}

/** Hover or focus holds a toast; leaving gives back the time it had left, and at least 3 s to finish reading. */
function hold(id: number) {
  window.clearTimeout(timers.get(id));
  if (!held.has(id)) held.set(id, (deadlines.get(id) ?? 0) - Date.now());
}
const resume = (id: number) => schedule(id, Math.max(3000, held.get(id) ?? 0));

/** Short-lived status message in the bottom-centre of the window. Errors, and toasts with an action, stay longer. */
export function toast(message: string, opts: { tone?: ToastTone; duration?: number; action?: ToastAction } = {}) {
  const tone = opts.tone || 'info';
  const id = nextId++;
  // the same message twice in a row replaces the old one instead of stacking
  toasts = [...toasts.filter((t) => t.message !== message).slice(-3), { id, message, tone, action: opts.action }];
  emit();
  schedule(id, opts.duration ?? (tone === 'error' ? 7000 : opts.action ? 6000 : 3500));
}

const ICONS: Record<ToastTone, string> = {
  info: 'info.circle',
  success: 'checkmark.circle.fill',
  error: 'exclamationmark.triangle.fill'
};

export function ToastHost() {
  const items = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => toasts
  );
  const render = (t: ToastItem) => (
    // the timer waits while the toast is pointed at or its button has focus, so there's time to reach the action
    <div
      key={t.id}
      className={`toast ${t.tone}`}
      onClick={() => dismiss(t.id)}
      onMouseEnter={() => hold(t.id)}
      onFocus={() => hold(t.id)}
      onMouseLeave={(e) => e.currentTarget.matches(':focus-within') || resume(t.id)}
      onBlur={(e) => e.currentTarget.matches(':hover') || resume(t.id)}
    >
      <Icon name={ICONS[t.tone]} className="toast-icon" />
      <span>{t.message}</span>
      {/* the click bubbles to the toast, which dismisses it */}
      {t.action && (
        <button className="toast-action" onClick={t.action.onClick}>
          {t.action.label}
        </button>
      )}
    </div>
  );
  // the live regions stay mounted even when empty: VoiceOver skips regions that arrive with their first message
  return createPortal(
    <div className="toast-stack">
      <div className="toast-region" role="status" aria-live="polite">
        {items.filter((t) => t.tone !== 'error').map(render)}
      </div>
      <div className="toast-region" role="alert">
        {items.filter((t) => t.tone === 'error').map(render)}
      </div>
    </div>,
    document.body
  );
}
