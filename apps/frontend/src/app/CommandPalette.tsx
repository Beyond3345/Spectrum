import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { ranked } from './commands';
import type { Command } from './commands';

// how many lines show: the rest are found by typing more
const SHOWN = 60;

/**
 * The command palette (⇧⌘P) and Go to a file or heading (⌘P), one box: text that starts with > finds a command by its
 * name, anything else a file or heading of the project. start: what the box opens with. The lists are built when it
 * opens. Choosing closes it first, then runs the command; Escape, a click outside or Tab put the focus back.
 */
export default function CommandPalette({ start, commands, places, onClose }: { start: string; commands: Command[]; places: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState(start);
  const [active, setActive] = useState(0);
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const before = useRef(document.activeElement as HTMLElement | null);
  const forCommands = query.startsWith('>');
  const typed = forCommands ? query.slice(1) : query;
  const found = ranked(typed, forCommands ? commands : places, (c) => [c.label, `${c.section} ${c.label}`]).slice(0, SHOWN);
  const hasChecks = found.some((c) => c.checked !== undefined);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const close = () => {
    onClose();
    before.current?.focus({ preventScroll: true });
  };
  const choose = (command: Command | undefined) => {
    if (!command || command.disabled) return;
    close();
    command.run();
  };

  return createPortal(
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label={forCommands ? 'Find a command' : 'Go to a file or heading'}>
        <label className="search-field palette-field">
          <Icon name={forCommands ? 'chevron.right' : 'magnifyingglass'} />
          <input
            autoFocus
            value={query}
            placeholder={forCommands ? 'Type a command' : 'Type a file or heading, or > for a command'}
            role="combobox"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-activedescendant={found[active] ? `${id}-${active}` : undefined}
            aria-autocomplete="list"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape' || e.key === 'Tab') {
                e.preventDefault();
                close();
              } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (found.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(found[active]);
              }
            }}
          />
        </label>
        <div ref={listRef} id={`${id}-list`} className="palette-list" role="listbox" aria-label={forCommands ? 'Commands' : 'Files and headings'}>
          {!found.length && <div className="palette-empty">{forCommands ? 'No command has that name' : 'No file or heading has that name'}</div>}
          {found.map((c, i) => (
            <div
              key={`${c.section}-${c.label}-${i}`}
              id={`${id}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              aria-disabled={c.disabled || undefined}
              className={`menu-item${i === active ? ' active' : ''}${c.disabled ? ' disabled' : ''}`}
              onMouseMove={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c)}
            >
              {hasChecks && <span className="menu-check">{c.checked && <Icon name="checkmark" />}</span>}
              <span className="menu-label">{c.label}</span>
              <span className="palette-section">{c.section}</span>
              {c.shortcut && <span className="menu-shortcut">{c.shortcut}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
