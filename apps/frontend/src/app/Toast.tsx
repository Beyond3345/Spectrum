import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export type ToastTone = 'info' | 'success' | 'error';

type ToastItem = { id: number; message: string; tone: ToastTone };

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Short-lived status message in the bottom-centre of the window. Errors stay longer. */
export function toast(message: string, opts: { tone?: ToastTone; duration?: number } = {}) {
  const tone = opts.tone || 'info';
  const id = nextId++;
  // the same message twice in a row replaces the old one instead of stacking
  toasts = [...toasts.filter((t) => t.message !== message).slice(-3), { id, message, tone }];
  emit();
  window.setTimeout(() => dismiss(id), opts.duration ?? (tone === 'error' ? 7000 : 3500));
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
    <div key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}>
      <Icon name={ICONS[t.tone]} className="toast-icon" />
      <span>{t.message}</span>
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
