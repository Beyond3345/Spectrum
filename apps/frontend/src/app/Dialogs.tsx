import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { trapTab } from './Sheet';

// Promise-based alerts. window.confirm/prompt are unreliable inside a desktop
// webview (and look out of place), so the app uses these instead.

type Request = {
  kind: 'confirm' | 'prompt' | 'alert';
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  placeholder?: string;
  defaultValue?: string;
  resolve: (value: unknown) => void;
};

let queue: Request[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function open<T>(request: Omit<Request, 'resolve'>) {
  return new Promise<T>((resolve) => {
    queue = [...queue, { ...request, resolve: resolve as (value: unknown) => void }];
    emit();
  });
}

export const confirmDialog = (opts: { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean }) =>
  open<boolean>({ kind: 'confirm', ...opts });

export const promptDialog = (opts: { title: string; message?: string; placeholder?: string; defaultValue?: string; confirmLabel?: string }) =>
  open<string | null>({ kind: 'prompt', ...opts });

export const alertDialog = (title: string, message?: string) => open<void>({ kind: 'alert', title, message });

export function DialogHost() {
  const current = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => queue[0]
  );
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // where focus was before the first queued dialog opened; it goes back there afterwards
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!current) return;
    openerRef.current ??= document.activeElement as HTMLElement | null;
    setValue(current.defaultValue || '');
    // a destructive confirm starts on Cancel, like a macOS alert
    window.setTimeout(() => (current.kind === 'prompt' ? inputRef.current?.select() : (current.destructive ? cancelRef : confirmRef).current?.focus()), 0);
  }, [current]);

  if (!current) return null;

  const finish = (ok: boolean) => {
    const answer = current.kind === 'prompt' ? (ok ? value : null) : current.kind === 'confirm' ? ok : undefined;
    queue = queue.slice(1);
    if (!queue.length) {
      if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
      openerRef.current = null;
    }
    current.resolve(answer);
    emit();
  };

  return createPortal(
    <div className="backdrop alert-backdrop" onMouseDown={() => finish(false)}>
      <div
        className="alert"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        aria-describedby={current.message ? 'alert-message' : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          trapTab(e);
          if (e.key === 'Escape') {
            e.stopPropagation();
            finish(false);
          }
          // a focused button activates itself; Return confirms from the text field (or nothing focused)
          if (
            e.key === 'Enter' &&
            !e.nativeEvent.isComposing &&
            current.kind !== 'alert' &&
            !current.destructive &&
            !(e.target instanceof HTMLButtonElement)
          ) {
            e.preventDefault();
            finish(true);
          }
        }}
      >
        <div className="alert-title" id="alert-title">{current.title}</div>
        {current.message && <div className="alert-message" id="alert-message">{current.message}</div>}
        {current.kind === 'prompt' && (
          <input
            ref={inputRef}
            className="input"
            value={value}
            placeholder={current.placeholder}
            spellCheck={false}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <div className="alert-actions">
          {current.kind !== 'alert' && (
            <button ref={cancelRef} className="btn" onClick={() => finish(false)}>{current.cancelLabel || 'Cancel'}</button>
          )}
          <button
            ref={confirmRef}
            className={`btn ${current.destructive ? 'destructive' : 'primary'}`}
            onClick={() => finish(true)}
          >
            {current.confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
