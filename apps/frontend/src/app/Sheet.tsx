import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Visible, enabled controls inside root, in tab order. */
export const focusables = (root: Element) =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);

/** onKeyDown for a modal: Tab and Shift+Tab wrap around instead of leaving it. */
export function trapTab(e: ReactKeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab' || e.defaultPrevented) return;
  const items = focusables(e.currentTarget);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey ? document.activeElement === first || document.activeElement === e.currentTarget : document.activeElement === last) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}

/** Modal card centred over the window. Escape or a click outside closes it. */
export default function Sheet({
  title,
  onClose,
  actions,
  width,
  className = '',
  children
}: {
  title: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  width?: number;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // read while rendering: by the time effects run, an autoFocus field inside already has focus
  const [opener] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // an alert or pop-up menu on top of the sheet handles its own Escape
      if (e.key === 'Escape' && !document.querySelector('.alert, .menu')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // move focus into the sheet (unless an autoFocus field already has it) and give it back on close
  useEffect(() => {
    const sheet = ref.current;
    if (sheet && !sheet.contains(document.activeElement)) {
      const body = sheet.querySelector('.sheet-body');
      ((body && focusables(body)[0]) || sheet).focus({ preventScroll: true });
    }
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  return createPortal(
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={width ? { width } : undefined}
        onKeyDown={trapTab}
      >
        <div className="sheet-header">
          <div className="sheet-title" id={titleId}>{title}</div>
          <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
            <Icon name="xmark" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {actions && <div className="sheet-actions">{actions}</div>}
      </div>
    </div>,
    document.body
  );
}
