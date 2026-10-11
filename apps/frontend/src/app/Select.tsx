import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

type Option = [value: string, label: ReactNode];

/**
 * Pop-up button showing the chosen option. The menu is portalled to <body> so
 * it is never clipped by scrolling panels.
 */
export default function Select({
  value,
  options,
  onChange,
  placeholder = '—',
  className = '',
  title,
  disabled,
  labelId
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: ReactNode;
  className?: string;
  title?: string;
  disabled?: boolean;
  /** id of the visible <label>, so the pop-up is announced as “Label, value” */
  labelId?: string;
}) {
  const valueId = useId();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; minWidth: number; maxHeight: number } | null>(null);
  const [active, setActive] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find(([v]) => v === value);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const wanted = Math.min(320, options.length * 30 + 12);
    const flip = below < wanted && above > below;
    setRect({
      top: flip ? Math.max(8, r.top - 6 - Math.min(wanted, above)) : r.bottom + 6,
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8),
      minWidth: r.width,
      maxHeight: Math.max(120, flip ? above : below)
    });
    setActive(options.findIndex(([v]) => v === value));
  }, [open, options, value]);

  const choose = (next: string) => {
    setOpen(false);
    if (next !== value) onChange(next);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    // keys go to the document, not the trigger: WebKit doesn't focus a clicked <button>,
    // and an Escape that reached a surrounding Sheet would close the whole sheet
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        setActive((i) => Math.min(options.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && options[active]) {
        choose(options[active][0]);
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
    };
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`popup-button ${open ? 'open' : ''} ${className}`}
        title={title}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId ? `${labelId} ${valueId}` : undefined}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="popup-label" id={valueId}>{current ? current[1] : placeholder}</span>
        <Icon name="chevron.up.chevron.down" className="popup-chevron" />
      </button>
      {open && rect &&
        createPortal(
          <div
            ref={menuRef}
            className="menu"
            role="listbox"
            style={{ top: rect.top, left: rect.left, minWidth: rect.minWidth, maxHeight: rect.maxHeight }}
          >
            {options.length === 0 && <div className="menu-item disabled">{placeholder}</div>}
            {options.map(([v, label], idx) => (
              <div
                key={v}
                role="option"
                aria-selected={v === value}
                className={`menu-item ${v === value ? 'selected' : ''} ${idx === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(idx)}
                onClick={() => choose(v)}
              >
                <span className="menu-check">{v === value && <Icon name="checkmark" />}</span>
                <span className="menu-label">{label}</span>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
