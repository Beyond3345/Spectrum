import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, HTMLAttributes, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { ProjectMeta } from '../api/client';
import { cameFrom, childFolders, folderPath, projectCounts } from './folders';
import type { FolderColour, ProjectFolder, ProjectFolders } from './folders';
import { MenuButton } from './Menu';
import type { MenuItems } from './Menu';
import Icon from './Icon';

// Home: the folders as big tiles or a list, opened in place, then the projects in none. The Projects page (ProjectPage)
// keeps the header, the sidebar and what a project's card or row looks like; Home lays them out and adds selecting,
// the keyboard and dragging several at once.

const relative = new Intl.RelativeTimeFormat('en-AU', { numeric: 'always' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 3600],
  ['day', 86400],
  ['week', 604800],
  ['month', 2629800],
  ['year', 31557600]
];

export function timeAgo(iso: string) {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(secs)) return '';
  if (secs < 60) return 'Just now';
  const [unit, size] = UNITS.filter(([, s]) => secs >= s).pop()!;
  return relative.format(-Math.floor(secs / size), unit);
}

const fullDate = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const formatFull = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : fullDate.format(d);
};

/** a project card or row, or several things from Home, on their way to a folder: 'p:<id>' and 'f:<id>', a line each */
export const DRAG_TYPE = 'application/x-spectrum-project';

export const FOLDER_TINTS: Record<FolderColour, string> = { blue: 'Blue', purple: 'Purple', red: 'Red', orange: 'Orange', green: 'Green', grey: 'Grey' };

/** How a folder on Home shows (per folder; '' is Home itself). */
export type HomeSort = 'name' | 'updatedAt' | 'createdAt';
export type HomeView = { layout: 'list' | 'grid'; sort: HomeSort };
export const HOME_VIEW: HomeView = { layout: 'grid', sort: 'name' };
export const HOME_SORTS: [HomeSort, string][] = [
  ['name', 'Name'],
  ['updatedAt', 'Date changed'],
  ['createdAt', 'Date created']
];

/** What Home adds to a project's card or row: its handlers, whether it's selected and, while searching, where it is. */
export type HomeItem = {
  props: HTMLAttributes<HTMLDivElement> & { 'data-item': string };
  selected: boolean;
  where?: string;
  date: 'updatedAt' | 'createdAt';
};

/** A folder, in its colour (none is blue). */
export function FolderShape({ colour }: { colour?: FolderColour }) {
  return (
    <svg className={`folder-shape folder-colour ${colour ?? 'blue'}`} viewBox="0 0 120 92" aria-hidden="true">
      <path className="back" d="M8 4h30c2.4 0 4.6 1 6.2 2.8L50 13h62a8 8 0 0 1 8 8v63a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8V12a8 8 0 0 1 8-8z" />
      <path className="front" d="M0 30a8 8 0 0 1 8-8h104a8 8 0 0 1 8 8v54a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8z" />
    </svg>
  );
}

const count = (n: number) => `${n} ${n === 1 ? 'project' : 'projects'}`;
const byName = (a: string, b: string) => a.localeCompare(b, 'en-AU', { numeric: true, sensitivity: 'base' });
const time = (iso?: string) => (iso && Date.parse(iso)) || 0;

type Item = { key: string; folder?: ProjectFolder; project?: ProjectMeta };

export default function Home({
  projects,
  found,
  query,
  tree,
  at,
  view,
  title,
  empty,
  dropTarget,
  onGo,
  onOpen,
  onSort,
  onMenu,
  onMove,
  folderMenu,
  projectMenu,
  dropProps,
  card,
  row
}: {
  /** the projects not archived */
  projects: ProjectMeta[];
  /** while searching, the projects found in every folder */
  found: ProjectMeta[] | null;
  query: string;
  tree: ProjectFolders;
  /** the folder open (null: Home itself) */
  at: string | null;
  view: HomeView;
  title: string;
  empty: ReactNode;
  dropTarget: string | null;
  onGo: (folderId: string) => void;
  onOpen: (p: ProjectMeta) => void;
  onSort: (sort: HomeSort) => void;
  onMenu: (x: number, y: number, items: MenuItems) => void;
  /** Move to folder…, for items ('p:<id>' and 'f:<id>') */
  onMove: (items: string[]) => void;
  /** move: what their Move to folder… does */
  folderMenu: (f: ProjectFolder, move: () => void) => MenuItems;
  projectMenu: (p: ProjectMeta, move: () => void) => MenuItems;
  /** a folder things can be dropped into; key tells it from the same folder elsewhere on the page */
  dropProps: (folderId: string, key: string) => HTMLAttributes<HTMLElement>;
  card: (p: ProjectMeta, home: HomeItem) => ReactNode;
  row: (p: ProjectMeta, home: HomeItem) => ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** a folder opened from the keyboard: the focus goes to the first thing in it */
  const focusFirst = useRef(false);
  /** the folder open before, whose tile takes the focus on the way up */
  const before = useRef(at);
  const searching = found !== null;
  const date = view.sort === 'createdAt' ? 'createdAt' : 'updatedAt';

  useEffect(() => {
    setSelected(new Set());
    anchor.current = null;
    const from = cameFrom(tree, before.current, at);
    before.current = at;
    if (focusFirst.current) listRef.current?.querySelector<HTMLElement>('[data-item]')?.focus();
    // gone with the folder left, or the path's part clicked
    else if (from && (!document.activeElement || document.activeElement === document.body)) listRef.current?.querySelector<HTMLElement>(`[data-item="f:${from}"]`)?.focus();
    focusFirst.current = false;
  }, [at, searching]);

  // each folder's count and its newest project's date, with the folders inside it
  const { counts, newest } = useMemo(() => {
    const newest = new Map<string, string>();
    for (const p of projects) {
      for (const f of folderPath(tree, tree.placement[p.id] ?? null)) if (time(p[date]) > time(newest.get(f.id))) newest.set(f.id, p[date]);
    }
    return { counts: projectCounts(tree, projects.map((p) => p.id)), newest };
  }, [projects, tree, date]);

  const items = useMemo((): Item[] => {
    const q = searching ? query.trim().toLowerCase() : '';
    const folders = searching ? tree.folders.filter((f) => f.name.toLowerCase().includes(q)) : childFolders(tree, at);
    const list = found ?? projects.filter((p) => (tree.placement[p.id] ?? null) === at);
    const sortedFolders = view.sort === 'name' ? [...folders].sort((a, b) => byName(a.name, b.name)) : [...folders].sort((a, b) => time(newest.get(b.id)) - time(newest.get(a.id)));
    const sortedProjects = view.sort === 'name' ? [...list].sort((a, b) => byName(a.name, b.name)) : [...list].sort((a, b) => time(b[date]) - time(a[date]));
    return [...sortedFolders.map((f) => ({ key: `f:${f.id}`, folder: f })), ...sortedProjects.map((p) => ({ key: `p:${p.id}`, project: p }))];
  }, [projects, found, searching, query, tree, at, view.sort, date, newest]);

  if (!items.length) return <>{empty}</>;

  /** while searching, the path of the folder it's in */
  const where = (folderId: string | null) => (searching ? ['Home', ...folderPath(tree, folderId).map((f) => f.name)].join(' › ') : undefined);

  const open = (item: Item) => (item.folder ? onGo(item.folder.id) : onOpen(item.project!));

  const toggle = (key: string) => {
    anchor.current = key;
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const click = (e: ReactMouseEvent, item: Item) => {
    // not the ··· button, a tag, or a menu portalled out of the card
    if (!e.currentTarget.contains(e.target as Node) || (e.target as Element).closest('button')) return;
    // ⇧ with nothing to start from selects like ⌘
    if (e.metaKey || e.ctrlKey || (e.shiftKey && !anchor.current)) toggle(item.key);
    else if (e.shiftKey && anchor.current) {
      const keys = items.map((i) => i.key);
      const [a, b] = [keys.indexOf(anchor.current), keys.indexOf(item.key)].sort((x, y) => x - y);
      setSelected(new Set(a < 0 ? [item.key] : keys.slice(a, b + 1)));
    } else {
      setSelected(new Set());
      open(item);
    }
  };

  // Move to folder… takes the selection along, as dragging does
  const menuOf = (item: Item) => {
    const move = () => onMove(selected.has(item.key) ? items.filter((i) => selected.has(i.key)).map((i) => i.key) : [item.key]);
    return item.folder ? folderMenu(item.folder, move) : projectMenu(item.project!, move);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const el = e.target as HTMLElement;
    const item = items.find((i) => i.key === el.dataset.item);
    if (!item) return;
    const els = [...listRef.current!.querySelectorAll<HTMLElement>('[data-item]')];
    const columns = view.layout === 'grid' ? els.filter((x) => x.offsetTop === els[0].offsetTop).length : 1;
    const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns } as Record<string, number>)[e.key];
    const mod = e.metaKey || e.ctrlKey;
    if (step !== undefined && !mod && !e.altKey) {
      e.preventDefault();
      els[Math.min(els.length - 1, Math.max(0, els.indexOf(el) + step))]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      focusFirst.current = !!item.folder;
      open(item);
    } else if (e.key === ' ') {
      e.preventDefault();
      toggle(item.key);
    } else if (e.key === 'Escape' && selected.size) {
      setSelected(new Set());
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected(new Set(items.map((i) => i.key)));
    } else if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      onMenu(r.left + 24, r.bottom, menuOf(item));
    }
  };

  // what Home puts on every tile and row: a dragged one that's selected takes the others along
  const itemProps = (item: Item, label: string) => ({
    'data-item': item.key,
    role: 'option',
    'aria-selected': selected.has(item.key),
    'aria-label': label,
    tabIndex: 0,
    draggable: true,
    onClick: (e: ReactMouseEvent) => click(e, item),
    onDoubleClick: undefined,
    onKeyDown: undefined,
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault();
      onMenu(e.clientX, e.clientY, menuOf(item));
    },
    onDragStart: (e: ReactDragEvent) => {
      const keys = selected.has(item.key) ? items.filter((i) => selected.has(i.key)).map((i) => i.key) : [item.key];
      e.dataTransfer.setData(DRAG_TYPE, keys.join('\n'));
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  const folderLabel = (f: ProjectFolder) => `${f.name}, folder, ${count(counts.get(f.id) || 0)}${searching ? `, in ${where(f.parent)}` : ''}`;
  const projectItem = (item: Item): HomeItem => {
    const p = item.project!;
    return {
      props: itemProps(item, `${p.name}, project, ${date === 'createdAt' ? 'created' : 'changed'} ${timeAgo(p[date]).toLowerCase()}${searching ? `, in ${where(tree.placement[p.id] ?? null)}` : ''}`),
      selected: selected.has(item.key),
      where: where(tree.placement[p.id] ?? null),
      date
    };
  };

  const folderDate = (f: ProjectFolder) => newest.get(f.id);
  const listProps = { ref: listRef, role: 'listbox', 'aria-multiselectable': true, 'aria-label': title, onKeyDown };

  if (view.layout === 'grid') {
    return (
      <div className="project-grid home-grid" {...listProps}>
        {items.map((item) => {
          if (item.project) return card(item.project, projectItem(item));
          const f = item.folder!;
          const changed = folderDate(f);
          return (
            <div
              key={item.key}
              className={`project-card folder-tile ${selected.has(item.key) ? 'selected' : ''} ${dropTarget === `tile:${f.id}` ? 'drop-into' : ''}`}
              {...itemProps(item, folderLabel(f))}
              {...dropProps(f.id, `tile:${f.id}`)}
            >
              <div className={`card-thumb folder-art folder-colour ${f.colour ?? 'blue'}`}>
                <FolderShape colour={f.colour} />
                <span className="folder-count" aria-hidden="true">{counts.get(f.id) || 0}</span>
                <span className="card-menu">
                  <MenuButton icon="ellipsis" title="More" className="icon-btn small" align="end" items={menuOf(item)} />
                </span>
              </div>
              <div className="card-name" title={f.name}>{f.name}</div>
              <div className="card-meta" title={changed && formatFull(changed)}>
                {count(counts.get(f.id) || 0)}
                {changed && ` · ${timeAgo(changed).replace(/^Just now$/, 'just now')}`}
              </div>
              {searching && <div className="card-meta">{where(f.parent)}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  const dateLabel = HOME_SORTS.find(([s]) => s === date)![1];
  return (
    <div className="project-list home-list">
      <div className="project-row list-header" role="row">
        <span className="col-thumb" />
        <span className="col-name">
          <button className={`sort-btn ${view.sort === 'name' ? 'active' : ''}`} onClick={() => onSort('name')}>
            Name
            {view.sort === 'name' && <Icon name="chevron.up" />}
          </button>
        </span>
        <span className="col-kind">Kind</span>
        <span className="col-count">Projects</span>
        <span className="col-date">
          <MenuButton
            label={dateLabel}
            className={`sort-btn ${view.sort !== 'name' ? 'active' : ''}`}
            align="end"
            items={HOME_SORTS.slice(1).map(([sort, label]) => ({ label, checked: view.sort === sort, onSelect: () => onSort(sort) }))}
          />
        </span>
        <span className="col-actions" />
      </div>
      <div {...listProps}>
        {items.map((item) => {
          if (item.project) return row(item.project, projectItem(item));
          const f = item.folder!;
          const changed = folderDate(f);
          return (
            <div
              key={item.key}
              className={`project-row ${selected.has(item.key) ? 'selected' : ''} ${dropTarget === `tile:${f.id}` ? 'drop-into' : ''}`}
              {...itemProps(item, folderLabel(f))}
              {...dropProps(f.id, `tile:${f.id}`)}
            >
              <span className="col-thumb"><FolderShape colour={f.colour} /></span>
              <span className="col-name">
                <span className="project-name-line"><span className="project-name">{f.name}</span></span>
                {searching && <span className="project-path">{where(f.parent)}</span>}
              </span>
              <span className="col-kind">Folder</span>
              <span className="col-count">{counts.get(f.id) || 0}</span>
              <span className="col-date" title={changed && formatFull(changed)}>{changed ? timeAgo(changed) : '—'}</span>
              <span className="col-actions">
                <MenuButton icon="ellipsis" title="More" align="end" items={menuOf(item)} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
