import type { ReactNode } from 'react';
import Icon from './Icon';

export type TabItem<T extends string> = { value: T; label: ReactNode; icon?: string; badge?: ReactNode };

/** Underlined text tabs ("Files | Chats", the Tools tabs). */
export default function Tabs<T extends string>({
  value,
  onChange,
  items,
  className = ''
}: {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  className?: string;
}) {
  return (
    <div
      className={`tabs ${className}`}
      role="tablist"
      // a mouse wheel scrolls a strip wider than its panel, whose scroll bar is hidden
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          className={`tab ${item.value === value ? 'active' : ''}`}
          onClick={() => onChange(item.value)}
        >
          {item.icon && <Icon name={item.icon} />}
          <span>{item.label}</span>
          {item.badge !== undefined && item.badge !== null && item.badge !== false && <span className="tab-badge">{item.badge}</span>}
        </button>
      ))}
    </div>
  );
}
