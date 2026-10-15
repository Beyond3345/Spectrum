import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export type MenuItem = {
  label?: ReactNode;
  icon?: string;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** true/false shows a checkmark column; undefined leaves it out */
  checked?: boolean;
  /** a divider line; the other fields are ignored */
  separator?: boolean;
  /** a section's name above its items, as macOS menus have; only the label is used */
  heading?: boolean;
  /** right-aligned hint such as a keyboard shortcut */
  shortcut?: string;
};

/** falsy entries are skipped, so items can be written as `cond && { … }` */
export type MenuItems = (MenuItem | false | null | undefined)[];

type Anchor = { left: number; right: number; top: number; bottom: number };

/**
 * A pop-up menu portalled to <body> at an anchor rectangle (a button, or the
 * pointer for context menus). Arrow keys, Enter, Escape and outside clicks work.
 */
export function MenuList({
  items,
  anchor,
  align = 'start',
  onClose,
  className = '',
  highlightFirst = false
}: {
  items: MenuItems;
  anchor: Anchor;
  align?: 'start' | 'end';
  onClose: () => void;
  className?: string;
  /** start with the first item highlighted (menus opened from the keyboard) */
  highlightFirst?: boolean;
}) {
  const list = items.filter(Boolean) as MenuItem[];
  const ref = useRef<HTMLDivElement>(null);
  const idPrefix = useId();
  const selectable = (i: number) => !!list[i] && !list[i].separator && !list[i].heading && !list[i].disabled;
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [active, setActive] = useState(() => (highlightFirst ? list.findIndex((_, i) => selectable(i)) : -1));
  const hasChecks = list.some((item) => item.checked !== undefined);
  const hasIcons = list.some((item) => item.icon);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    let left = align === 'end' ? anchor.right - width : anchor.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const below = window.innerHeight - anchor.bottom - 6 - margin;
    const above = anchor.top - 6 - margin;
    const flip = height > below && above > below;
    const maxHeight = Math.max(120, flip ? above : below);
    const top = flip ? Math.max(margin, anchor.top - 6 - Math.min(height, maxHeight)) : anchor.bottom + 6;
    setPos({ top, left, maxHeight });
    el.focus({ preventScroll: true });
    // anchor is a fresh object on every render; position once per opening
  }, []);

  useEffect(() => {
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('scroll', outside, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('scroll', outside, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  const choose = (item: MenuItem) => {
    if (item.disabled || item.separator) return;
    onClose();
    item.onSelect?.();
  };

  const step = (dir: 1 | -1) => {
    const from = active >= 0 ? active : dir === 1 ? -1 : list.length;
    for (let n = 1; n <= list.length; n += 1) {
      const i = (from + dir * n + list.length * 2) % list.length;
      if (selectable(i)) {
        setActive(i);
        return;
      }
    }
  };

  return createPortal(
    <div
      ref={ref}
      className={`menu ${className}`}
      role="menu"
      tabIndex={-1}
      aria-activedescendant={active >= 0 ? `${idPrefix}-${active}` : undefined}
      // the measuring pass uses opacity, not visibility: a visibility:hidden menu can't take focus
      style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0, opacity: 0 }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault();
          onClose();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          step(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          step(-1);
        } else if ((e.key === 'Enter' || e.key === ' ') && selectable(active)) {
          e.preventDefault();
          choose(list[active]);
        }
      }}
    >
      {list.map((item, i) =>
        item.separator ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : item.heading ? (
          // text, not an item: never announced as a dimmed one, and the arrow keys pass over it
          <div key={i} className="menu-heading" role="presentation">
            {hasChecks && <span className="menu-check" />}
            {hasIcons && <span className="menu-icon" />}
            {item.label}
          </div>
        ) : (
          <div
            key={i}
            id={`${idPrefix}-${i}`}
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            aria-disabled={item.disabled || undefined}
            className={`menu-item${i === active ? ' active' : ''}${item.disabled ? ' disabled' : ''}${item.destructive ? ' destructive' : ''}`}
            onMouseEnter={() => setActive(selectable(i) ? i : -1)}
            onMouseLeave={() => setActive(-1)}
            onClick={() => choose(item)}
          >
            {hasChecks && <span className="menu-check">{item.checked && <Icon name="checkmark" />}</span>}
            {hasIcons && <span className="menu-icon">{item.icon && <Icon name={item.icon} />}</span>}
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
          </div>
        )
      )}
    </div>,
    document.body
  );
}

/** A button that opens a menu: `<MenuButton label="Import" items={[…]} />` or `icon="ellipsis"`. */
export function MenuButton({
  label,
  icon,
  items,
  className,
  title,
  align = 'start',
  chevron,
  disabled
}: {
  label?: ReactNode;
  icon?: string;
  items: MenuItems;
  className?: string;
  title?: string;
  align?: 'start' | 'end';
  /** defaults to true when there is a label */
  chevron?: boolean;
  disabled?: boolean;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [fromKeyboard, setFromKeyboard] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const showChevron = chevron ?? !!label;

  const close = () => {
    setAnchor(null);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${className ?? (label ? 'btn' : 'icon-btn')}${anchor ? ' open' : ''}`}
        title={title}
        aria-label={title}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        // mousedown opens so an outside-click close on the same button doesn't reopen it
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          setFromKeyboard(false);
          if (anchor) setAnchor(null);
          else setAnchor(e.currentTarget.getBoundingClientRect());
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (['Enter', ' ', 'ArrowDown'].includes(e.key) && !anchor) {
            e.preventDefault();
            setFromKeyboard(true);
            setAnchor(e.currentTarget.getBoundingClientRect());
          }
        }}
      >
        {icon && <Icon name={icon} />}
        {label && <span className="btn-label">{label}</span>}
        {showChevron && <Icon name="chevron.down" className="btn-chevron" />}
      </button>
      {anchor && <MenuList items={items} anchor={anchor} align={align} onClose={close} highlightFirst={fromKeyboard} />}
    </>
  );
}

/** Right-click menu at the pointer: render while open, e.g. `{ctx && <ContextMenu x={ctx.x} y={ctx.y} … />}`. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItems; onClose: () => void }) {
  return <MenuList items={items} anchor={{ left: x, right: x, top: y, bottom: y }} onClose={onClose} />;
}
