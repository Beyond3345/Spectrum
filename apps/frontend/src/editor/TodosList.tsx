import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { changeTodoGroups, deleteTodo, getFile, listTodos, saveTodo } from '../api/client';
import type { LineLink, Todo, TodoGroup, TodoGroups, TodoLink } from '../api/client';
import Icon from '../app/Icon';
import { MenuButton } from '../app/Menu';
import type { MenuItems } from '../app/Menu';
import Segmented from '../app/Segmented';
import { toast } from '../app/Toast';
import { PROJECT_DATA_CHANGED, errorText } from './shared';
import { loadSettings } from '../app/settings';
import { MAX_GROUP_NAME, MAX_NOTE, STARTER_GROUPS, TODO_HUES, dropGroup, dropIndex, emptyText, newOrder, placeAt, findLine, findRange, groupHues, groupNamed, groupOf, isRange, looseHues, PICKER_HUES, moveGroup, newGroup, orderedGroups, placeOf, rangeLabel, scanTodos, sortTodos, todoCounts, todoHues, todoMatches, withNote } from './todos';
import { liveRange } from './todoHighlights';
import { useEditor } from './EditorContext';
import { sendLocated } from './agent/handoff';
import type { Located } from './agent/handoff';
import type { SourceTodo } from './todos';

const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export type TodosState = ReturnType<typeof useTodos>;

/**
 * The project's to-dos: the user's own (one file each in .spectrum/todos), their groups (in the project's settings)
 * and the marks in the source. They load
 * with the project and again when the window comes back; the source is scanned again a moment after the files
 * change, from the open files' own text and the others as last read.
 */
export function useTodos({
  projectId,
  sources,
  loaded,
  revision,
  notify
}: {
  projectId: string;
  /** the files the source to-dos are looked for in */
  sources: string[];
  /** a file's text when the editor has it */
  loaded(path: string): string | undefined;
  /** changes when the files may have */
  revision: unknown;
  notify(message: string, tone?: 'info' | 'success' | 'error'): void;
}) {
  const [mine, setMine] = useState<Todo[] | null>(null);
  const [source, setSource] = useState<SourceTodo[]>([]);
  const [groups, setGroups] = useState<TodoGroups>({});
  // the files that aren't open, as last read from disk
  const readRef = useRef(new Map<string, string>());
  // counts changes made here, so a list asked for before one can't put back what it changed
  const changesRef = useRef(0);
  const latest = useRef({ sources, loaded, notify });
  latest.current = { sources, loaded, notify };

  const scan = async (fresh: boolean) => {
    const read = readRef.current;
    if (fresh) read.clear();
    const files = await Promise.all(
      latest.current.sources.map(async (path) => {
        const text =
          latest.current.loaded(path) ??
          read.get(path) ??
          (await getFile(projectId, path).then(
            (res) => (read.set(path, res.content), res.content),
            () => ''
          ));
        return { path, text };
      })
    );
    setSource(scanTodos(files));
  };

  const reload = () => {
    const changes = changesRef.current;
    listTodos(projectId)
      .then((res) => {
        if (changes !== changesRef.current) return;
        setMine(res.todos || []);
        setGroups(res.groups || {});
      })
      .catch((err) => {
        setMine((prev) => prev ?? []);
        latest.current.notify(`Couldn’t load your to-dos: ${errorText(err)}`, 'error');
      });
    scan(true).catch(() => undefined);
  };

  useEffect(() => {
    reload();
    // and after a pull from GitHub brought other ones
    window.addEventListener('focus', reload);
    window.addEventListener(PROJECT_DATA_CHANGED, reload);
    return () => {
      window.removeEventListener('focus', reload);
      window.removeEventListener(PROJECT_DATA_CHANGED, reload);
    };
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => scan(false).catch(() => undefined), 400);
    return () => window.clearTimeout(timer);
  }, [sources, revision]);

  /** Saves a new or changed to-do, showing it at once; a failed save puts that one back. Resolves to whether it saved. */
  const save = async (todo: Todo) => {
    const before = mine;
    changesRef.current += 1;
    setMine((prev) => [...(prev || []).filter((t) => t.id !== todo.id), todo]);
    try {
      await saveTodo(projectId, todo);
      return true;
    } catch (err) {
      // only this one: another save since may have gone through
      setMine((prev) => {
        const old = before?.find((t) => t.id === todo.id);
        const rest = (prev || []).filter((t) => t.id !== todo.id);
        return old ? [...rest, old] : rest;
      });
      notify(`Couldn’t save the to-do: ${errorText(err)}`, 'error');
      return false;
    }
  };

  /** Deletes to-dos (one, or every done one), with Undo; a failed delete puts that one back. */
  const remove = async (gone: Todo[]) => {
    changesRef.current += 1;
    const ids = new Set(gone.map((t) => t.id));
    setMine((prev) => (prev || []).filter((t) => !ids.has(t.id)));
    const results = await Promise.allSettled(gone.map((t) => deleteTodo(projectId, t.id)));
    const kept = gone.filter((_, i) => results[i].status === 'rejected');
    const deleted = gone.filter((_, i) => results[i].status === 'fulfilled');
    if (deleted.length) toast(deleted.length === 1 ? 'Deleted the to-do' : `Deleted ${deleted.length} to-dos`, { action: { label: 'Undo', onClick: () => deleted.forEach(save) } });
    if (kept.length) {
      setMine((prev) => [...(prev || []), ...kept]);
      const err = (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason;
      notify(`Couldn’t delete ${kept.length === 1 ? 'the to-do' : `${kept.length} to-dos`}: ${errorText(err)}`, 'error');
    }
  };

  /** A new to-do, optionally linked to a line, a PDF page or a reference, and in a group (its id), else in its own colour. */
  const add = (text: string, link?: TodoLink, group?: string) => {
    const now = new Date().toISOString();
    // its place: after the others in its list, or among the same file's by line (Settings › Editor › New to-dos go)
    const order = newOrder((mine || []).filter((t) => groupOf(t, groups) === groupOf({ group }, groups)), link, loadSettings().todoPlacement, Date.parse(now));
    return save({ id: crypto.randomUUID(), text, done: false, createdAt: now, updatedAt: now, order, ...(link && { link }), ...(group && { group }) });
  };

  /** Adds, changes or deletes (null) the groups given, showing it at once; a failed change puts them back. Resolves to whether it saved. */
  const changeGroups = async (changes: Record<string, TodoGroup | null>) => {
    changesRef.current += 1;
    const before = groups;
    const next = { ...groups };
    for (const [id, g] of Object.entries(changes)) {
      if (g) next[id] = g;
      else delete next[id];
    }
    setGroups(next);
    try {
      const res = await changeTodoGroups(projectId, changes);
      setGroups(res.groups);
      return true;
    } catch (err) {
      setGroups(before);
      latest.current.notify(`Couldn’t change the to-do groups: ${errorText(err)}`, 'error');
      return false;
    }
  };

  /** The id of the group with this name, made when there is none (a group an agent suggested); '' when it couldn't be. */
  const groupFor = async (name: string) => {
    const found = groupNamed(groups, name);
    if (found || !name.trim()) return found;
    const id = crypto.randomUUID();
    return (await changeGroups({ [id]: newGroup(groups, name, looseHues(mine || [], groups)) })) ? id : '';
  };

  /** The line a line link is on now, found again by its text as the link itself is when opened. */
  const lineOf = (link: { file: string; line: number; snippet?: string }) => {
    const text = latest.current.loaded(link.file) ?? readRef.current.get(link.file);
    return text === undefined ? link.line : findLine(text, link.line, link.snippet);
  };

  /**
   * Where a to-do's line link points now: its line, and for a range its last line too and whether its words are still
   * there (in the open editor as edits moved them, else in the file's text as last read).
   */
  const whereIs = (link: LineLink, id: string): { line: number; endLine?: number; found: boolean } => {
    if (!isRange(link)) return { line: lineOf(link), found: true };
    const live = liveRange(id, link.file);
    if (live) return { line: live.line, endLine: live.endLine, found: live.found };
    const text = latest.current.loaded(link.file) ?? readRef.current.get(link.file);
    if (text === undefined) return { line: link.line, endLine: link.endLine, found: true };
    const at = findRange(text, link);
    if (!at) return { line: findLine(text, link.line, link.snippet), found: false };
    const place = placeOf(text, at.from, at.to);
    return { line: place.line, endLine: place.endLine, found: true };
  };

  // the open ones: yours not ticked, and every mark still in the source
  const { open } = todoCounts(mine || [], source);
  return { mine, source, groups, open, reload, save, remove, add, lineOf, whereIs, changeGroups, groupFor };
}

/** A link of a kind this version knows; a later version's other kinds are kept but not shown. */
const knownLink = (link?: TodoLink): link is TodoLink => !!link && ('file' in link || 'doc' in link || 'key' in link);


type Show = 'open' | 'done' | 'all';
// how far the pointer moves before a row drags, so a click or a shaky double click never moves a to-do
const DRAG_THRESHOLD = 5;
// what folds: a group by its id, and the marks found in the files (an id never has a colon)
const SOURCE = ':source';

/**
 * The sidebar's To-dos tab: an add box with + (and the group to add to, once there are groups), Open, Done and All
 * with their counts, then your own to-dos (tick, edit, a note, move to a group, delete, and the line, page or reference
 * each links to): those in no group first, then each group under its title, which folds and has its own menu. Then
 * the marks found in the files' comments, which go to their line and are done once the mark is taken out.
 */
export default function TodosList({
  todos,
  filter,
  mainFile,
  onOpen
}: {
  todos: TodosState;
  /** the sidebar's search */
  filter: string;
  mainFile: string;
  onOpen(link: TodoLink): void;
}) {
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState<Show>('open');
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  // the to-do being edited, and whether its note was asked for
  const [editing, setEditing] = useState<{ id: string; note: boolean } | null>(null);
  // the notes shown in full
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState(0);
  // the group new to-dos go in ('' none), and the group being named: '' a new one, else the one being renamed
  const [addTo, setAddTo] = useState('');
  const [naming, setNaming] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const { mine, source, groups, reload, save, remove, add, whereIs, changeGroups } = todos;
  // dragging a to-do onto a group: which one, where the pointer is, and the zone under it ('' the top, a group's id)
  const [drag, setDrag] = useState<{ id: string; text: string; x: number; y: number; zone: string | null; over: string | null; after: boolean } | null>(null);
  const api = useEditor();
  /** A to-do for the agent, at the line or the page it links to. */
  const located = (todo: Todo): Located => {
    const link = knownLink(todo.link) ? todo.link : null;
    // its note, which says more of what is to be done
    const text = `${todo.text}${link && 'key' in link ? ` (the reference ${link.key})` : ''}${todo.note ? `\nNote: ${todo.note}` : ''}`;
    if (link && 'file' in link) return { kind: 'To-do', text, file: link.file, line: whereIs(link, todo.id).line };
    if (link && 'doc' in link) return { kind: 'To-do', text, doc: link.doc, page: link.page };
    return { kind: 'To-do', text };
  };

  /** Opens what a to-do links to; words in the open editor as edits have moved them, before they are written back. */
  const openLink = (id: string, link: TodoLink) => {
    const live = 'file' in link ? liveRange(id, link.file) : null;
    if (!live?.found) return onOpen(link);
    const { found: _found, ...moved } = live;
    onOpen(moved);
  };

  // opening the tab reads them again
  useEffect(reload, []);

  const linkLabel = (link: TodoLink, id: string) =>
    'file' in link
      ? rangeLabel(nameOf(link.file), link, whereIs(link, id))
      : 'doc' in link
        ? link.doc === mainFile
          ? `Page ${link.page}`
          : `${nameOf(link.doc).replace(/\.tex$/i, '')}, page ${link.page}`
        : link.key;
  const linkTitle = (link: TodoLink, id: string) =>
    'file' in link ? `${link.file}, line ${whereIs(link, id).line}${isRange(link) ? `: ${link.text.slice(0, 200)}` : ''}` : 'doc' in link ? `${link.doc.replace(/\.tex$/i, '.pdf')}, page ${link.page}` : `Go to ${link.key}`;

  const ordered = orderedGroups(groups);
  const hues = todoHues(mine || [], groups);
  const byGroup = groupHues(groups);
  const target = groupOf({ group: addTo }, groups);
  const needle = filter.trim().toLowerCase();
  const counts = todoCounts(mine || [], source);
  const shownMine = sortTodos(
    (mine || []).filter(
      (t) => (show === 'all' || t.done === (show === 'done')) && todoMatches(needle, t, knownLink(t.link) ? linkLabel(t.link, t.id) : '', groups[groupOf(t, groups)]?.name ?? '')
    )
  );
  const shownSource = show === 'done' ? [] : source.filter((t) => todoMatches(needle, t, t.file));
  const shownDone = shownMine.filter((t) => t.done);
  const ungrouped = shownMine.filter((t) => !groupOf(t, groups));
  // a group shows with its to-dos, and empty too while nothing narrows the list, so a new one is seen
  const shownGroups = ordered
    .map((g) => ({ ...g, todos: shownMine.filter((t) => groupOf(t, groups) === g.id) }))
    .filter((g) => g.todos.length || (!needle && show !== 'done'));

  // a new one is scrolled to, at the end of the open ones
  useEffect(() => {
    const newest = shownMine.filter((t) => !t.done).reduce<Todo | null>((a, t) => (!a || t.createdAt > a.createdAt ? t : a), null);
    if (added && newest) list.current?.querySelector(`[data-todo="${newest.id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [added]);

  const submit = () => {
    const text = draft.trim();
    field.current?.focus();
    if (!text) return;
    setDraft('');
    if (show === 'done') setShow('open');
    setFolded((f) => ({ ...f, [target]: false }));
    setAdded((n) => n + 1);
    // what was typed comes back when it couldn't be saved
    add(text, undefined, target).then((saved) => saved || setDraft((d) => d || text));
  };

  /** Ends an edit: saves what changed; from the keyboard, the focus goes back to the to-do's tick box. */
  const finish = (todo: Todo, next: Todo | null, keyboard: boolean) => {
    setEditing(null);
    if (next) save(next);
    if (keyboard) requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-todo="${todo.id}"] input[type='checkbox']`)?.focus());
  };

  /** A list's to-dos of one kind (open or done) in their order, without the one given. */
  const listOf = (group: string, done: boolean, except = '') => sortTodos((mine || []).filter((t) => groupOf(t, groups) === group && t.done === done && t.id !== except));

  /**
   * Puts a to-do in a group, or in none (''), at a place among its kind (open or done) there, by default the end. In
   * no group it takes back its own colour (or the next in turn). Only its own order changes, unless its neighbours are
   * too close to split. The toast says where it went, which a screen reader reads out, with Undo.
   */
  const moveTo = (todo: Todo, group: string, index?: number) => {
    const list = listOf(group, todo.done, todo.id);
    const at = index ?? list.length;
    const orders = placeAt(list, at, todo.id);
    const now = new Date().toISOString();
    for (const t of list) if (orders[t.id] !== undefined) void save({ ...t, order: orders[t.id], updatedAt: now });
    const { group: _old, ...rest } = todo;
    const name = group ? groups[group]?.name : 'no group';
    const said = group === groupOf(todo, groups) ? `Moved “${todo.text}” to place ${at + 1} of ${list.length + 1}${group ? ` in ${name}` : ''}` : `Moved “${todo.text}” to ${name}`;
    save({ ...rest, ...(group && { group }), order: orders[todo.id], updatedAt: now }).then((saved) => saved && toast(said, { action: { label: 'Undo', onClick: () => void save(todo) } }));
  };

  /**
   * A row drags by its body (not its tick box, buttons or fields) once the pointer has moved a few pixels, so a click
   * ticks and a double click edits as before. Over a row it lands before or after it (a line shows where), over a
   * group's title at the end of that group, over the top in no group.
   */
  const startDrag = (todo: Todo, e: ReactPointerEvent) => {
    if (e.button !== 0 || editing?.id === todo.id || (e.target as Element).closest('input, button, textarea, select, a')) return;
    const start = { x: e.clientX, y: e.clientY };
    const spot = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      const zone = el?.closest('[data-drop]')?.getAttribute('data-drop') ?? null;
      const row = el?.closest<HTMLElement>('[data-todo]');
      const box = row?.getBoundingClientRect();
      return { zone, over: row && zone !== null ? row.dataset.todo! : null, after: !!box && y > box.top + box.height / 2 };
    };
    let moving = false;
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('keydown', key, true);
      setDrag(null);
    };
    const move = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
      if (!moving) window.getSelection()?.removeAllRanges();
      moving = true;
      ev.preventDefault();
      setDrag({ id: todo.id, text: todo.text, x: ev.clientX, y: ev.clientY, ...spot(ev.clientX, ev.clientY) });
    };
    const up = (ev: PointerEvent) => {
      end();
      if (!moving) return;
      // the click that ends a drag ticks nothing
      const swallow = (c: MouseEvent) => (c.stopPropagation(), c.preventDefault());
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      const { zone, over, after } = spot(ev.clientX, ev.clientY);
      const current = groupOf(todo, groups);
      const to = zone === current ? current : dropGroup(zone, current, groups);
      if (to === null) return;
      const ids = listOf(to, todo.done, todo.id).map((t) => t.id);
      // over a row of the other kind (a done one, for an open one) is the end of its own kind, or the start
      const overKind = mine?.find((t) => t.id === over);
      const index = overKind && overKind.done !== todo.done ? (todo.done ? 0 : ids.length) : dropIndex(ids, over, after);
      if (to === current && over === todo.id) return;
      const was = listOf(current, todo.done).findIndex((t) => t.id === todo.id);
      if (to === current && index === was) return;
      moveTo(todo, to, index);
    };
    // Esc puts it back
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && moving && (ev.stopPropagation(), end());
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', end);
    window.addEventListener('keydown', key, true);
  };
  /** The zone the pointer is over while dragging, lit; a row there shows a line where the to-do would go. */
  const dropClass = (zone: string) => (drag && drag.zone === zone ? 'drop-target' : '');
  const lineAt = (id: string) => (drag && drag.over === id && drag.id !== id ? (drag.after ? 'drop-after' : 'drop-before') : '');
  /** A group made from a name, or the one being renamed renamed; a name another group has is refused. Resolves to whether it was. */
  const nameGroup = async (name: string, id = '') => {
    const clean = name.replace(/\s+/g, ' ').trim();
    const other = groupNamed(groups, clean);
    if (!clean || (id && groups[id]?.name === clean)) return true;
    if (other && other !== id) {
      toast(`There’s a group called “${groups[other].name}” already`, { tone: 'error' });
      return false;
    }
    if (id) return changeGroups({ [id]: { ...groups[id], name: clean } });
    return changeGroups({ [crypto.randomUUID()]: newGroup(groups, clean, looseHues(mine || [], groups)) });
  };

  /** Deletes a group, with Undo; its to-dos keep its id, so they show in no group until it comes back. */
  const deleteGroup = async (id: string) => {
    const old = groups[id];
    if (await changeGroups({ [id]: null })) toast(`Deleted the group “${old.name}”. Its to-dos have no group now.`, { action: { label: 'Undo', onClick: () => void changeGroups({ [id]: old }) } });
  };

  /** One of your own to-dos: tick, text, note, link, and its buttons while it is pointed at or in focus. */
  const row = (todo: Todo) => {
    const edit = editing?.id === todo.id;
    const full = opened.has(todo.id);
    const current = groupOf(todo, groups);
    const kind = listOf(current, todo.done);
    const place = kind.findIndex((t) => t.id === todo.id);
    const moves: MenuItems = [
      { label: 'Move up', icon: 'chevron.up', disabled: place <= 0, onSelect: () => moveTo(todo, current, place - 1) },
      { label: 'Move down', icon: 'chevron.down', disabled: place >= kind.length - 1, onSelect: () => moveTo(todo, current, place + 1) },
      ordered.length > 0 && { separator: true },
      ordered.length > 0 && { label: 'Move to', heading: true },
      ordered.length > 0 && { label: 'No group', checked: !current, onSelect: () => current && moveTo(todo, '') },
      ...ordered.map((g) => ({ label: g.name, checked: current === g.id, onSelect: () => current !== g.id && moveTo(todo, g.id) }))
    ];
    const link = knownLink(todo.link) ? todo.link : null;
    const dot = `todo-dot todo-hue-${hues.get(todo.id) ?? 0}`;
    return (
      <div
        key={todo.id}
        role="listitem"
        data-todo={todo.id}
        className={`todo-row ${todo.done ? 'done' : ''} ${drag?.id === todo.id ? 'dragging' : ''} ${lineAt(todo.id)}`}
        onPointerDown={(e) => startDrag(todo, e)}
      >
        <input
          type="checkbox"
          checked={todo.done}
          aria-label={todo.done ? `Mark “${todo.text}” as not done` : `Mark “${todo.text}” as done`}
          onChange={() => save({ ...todo, done: !todo.done, updatedAt: new Date().toISOString() })}
        />
        {link && 'file' in link ? (
          <button className={dot} title={isRange(link) ? 'Select the highlighted words' : 'Go to the line'} aria-label={`Go to “${todo.text}” in ${nameOf(link.file)}`} onClick={() => openLink(todo.id, link)} />
        ) : (
          <span className={dot} aria-hidden="true" />
        )}
        <div className="todo-body">
          {edit ? (
            <TodoEditor todo={todo} note={editing.note} onClose={(next, keyboard) => finish(todo, next, keyboard)} />
          ) : (
            <>
              <span className="todo-text" onDoubleClick={() => setEditing({ id: todo.id, note: false })}>
                {todo.text}
              </span>
              {todo.note && (
                <button
                  className={`todo-note ${full ? 'open' : ''}`}
                  aria-expanded={full}
                  title={full ? 'Show less' : 'Show the whole note'}
                  onClick={() => setOpened((o) => (o.has(todo.id) ? new Set([...o].filter((id) => id !== todo.id)) : new Set([...o, todo.id])))}
                  onDoubleClick={() => setEditing({ id: todo.id, note: true })}
                >
                  <span>{todo.note}</span>
                </button>
              )}
            </>
          )}
          {knownLink(todo.link) && (
            <button className="todo-link" title={linkTitle(todo.link, todo.id)} onClick={() => openLink(todo.id, todo.link!)}>
              <Icon name={'file' in todo.link ? 'doc.text' : 'doc' in todo.link ? 'doc.richtext' : 'tag'} />
              <span>{linkLabel(todo.link, todo.id)}</span>
            </button>
          )}
        </div>
        {!edit && (
          <div className="todo-actions">
            {!todo.note && (
              <button className="icon-btn small" title="Add a note" aria-label={`Add a note to “${todo.text}”`} onClick={() => setEditing({ id: todo.id, note: true })}>
                <Icon name="note.text.badge.plus" />
              </button>
            )}
            <MenuButton icon="chevron.up.chevron.down" className="icon-btn small" title={ordered.length ? `Move “${todo.text}” up, down or to a group` : `Move “${todo.text}” up or down`} items={moves} align="end" />
            <button className="icon-btn small" title="Send to agent" aria-label={`Send “${todo.text}” to the agent`} onClick={() => void sendLocated([located(todo)], api.ensureFileContent)}>
              <Icon name="paperplane" />
            </button>
            <button className="icon-btn small" title="Edit" aria-label={`Edit “${todo.text}”`} onClick={() => setEditing({ id: todo.id, note: false })}>
              <Icon name="pencil" />
            </button>
            <button className="icon-btn small destructive" title="Delete" aria-label={`Delete “${todo.text}”`} onClick={() => remove([todo])}>
              <Icon name="trash" />
            </button>
          </div>
        )}
      </div>
    );
  };

  /** A title that folds what is under it away, with its count. */
  const foldTitle = (key: string, label: string, count: number, hue?: number) => (
    <button className="sidebar-section-title todo-group-head" aria-expanded={!folded[key]} onClick={() => setFolded((f) => ({ ...f, [key]: !f[key] }))}>
      <span>
        {hue !== undefined && <span className={`todo-dot todo-hue-${hue}`} aria-hidden="true" />}
        {label} <span className="todo-count">{count}</span>
      </span>
      <Icon name="chevron.right" className={`disclosure ${folded[key] ? '' : 'open'}`} />
    </button>
  );

  // the starter groups not made yet: offered until a group of the user's own is made, then while naming one
  const starters = STARTER_GROUPS.filter((name) => !groupNamed(groups, name));
  const offer = naming === '' || ordered.every((g) => STARTER_GROUPS.includes(g.name));

  return (
    <div className="todos">
      <div className="todos-head">
        <form
          className="todo-add"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={field}
            value={draft}
            placeholder={target ? `Add a to-do to ${groups[target].name}` : 'Add a to-do'}
            aria-label={target ? `Add a to-do to ${groups[target].name}` : 'Add a to-do'}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && draft && (e.stopPropagation(), setDraft(''))}
          />
          {ordered.length > 0 && (
            <MenuButton
              icon="folder"
              className={`icon-btn small ${target ? 'ready' : ''}`}
              title={target ? `New to-dos go in ${groups[target].name}` : 'Choose a group for new to-dos'}
              align="end"
              items={[
                { label: 'Add to', heading: true },
                { label: 'No group', checked: !target, onSelect: () => setAddTo('') },
                ...ordered.map((g) => ({ label: g.name, checked: target === g.id, onSelect: () => setAddTo(g.id) }))
              ]}
            />
          )}
          <button type="submit" className={`icon-btn small ${draft.trim() ? 'ready' : ''}`} title="Add to-do (Return)" aria-label="Add to-do">
            <Icon name="plus" />
          </button>
        </form>
        <Segmented<Show>
          label="Show"
          className="fill"
          value={show}
          onChange={setShow}
          options={(
            [
              ['open', 'Open', counts.open],
              ['done', 'Done', counts.done],
              ['all', 'All', counts.all]
            ] as const
          ).map(([value, label, n]) => [
            value,
            <>
              {label} <span className="todo-count">{n}</span>
            </>,
            `${label}, ${n}`
          ])}
        />
      </div>

      <div className="todo-items" ref={list}>
        {!shownMine.length && !shownSource.length && mine && (
          <div className="sidebar-hint todo-empty">{emptyText({ total: counts.all, show, search: filter.trim() })}</div>
        )}

        {(ungrouped.length > 0 || (drag && groupOf(mine?.find((t) => t.id === drag.id) ?? {}, groups))) && (
          <div role="list" aria-label={ordered.length ? 'To-dos in no group' : 'Your to-dos'} className={`todo-list ${dropClass('')}`} data-drop="">
            {ungrouped.map(row)}
            {!ungrouped.length && <div className="sidebar-hint todo-drop-hint">Drop here for no group</div>}
          </div>
        )}

        {shownGroups.map((g) => (
          <div key={g.id} className={`todo-group ${dropClass(g.id)}`} data-drop={g.id}>
            {naming === g.id ? (
              <GroupNameField name={g.name} label={`Rename the group “${g.name}”`} onDone={(name) => (name === null ? (setNaming(null), true) : nameGroup(name, g.id).then((ok) => (ok && setNaming(null), ok)))} />
            ) : (
              <div className="todo-group-bar">
                {foldTitle(g.id, g.name, g.todos.length, byGroup[g.id])}
                <MenuButton
                  icon="ellipsis"
                  className="icon-btn small"
                  title={`Rename, move or delete “${g.name}”`}
                  align="end"
                  items={[
                    { label: 'Rename…', icon: 'pencil', onSelect: () => setNaming(g.id) },
                    { label: 'Move up', icon: 'chevron.up', disabled: ordered[0].id === g.id, onSelect: () => void changeGroups(moveGroup(groups, g.id, -1)) },
                    { label: 'Move down', icon: 'chevron.down', disabled: ordered[ordered.length - 1].id === g.id, onSelect: () => void changeGroups(moveGroup(groups, g.id, 1)) },
                    { separator: true },
                    { label: 'Colour', heading: true },
                    ...PICKER_HUES.map((i) => ({
                      label: TODO_HUES[i].label,
                      icon: <span className={`todo-dot todo-hue-${i}`} />,
                      checked: byGroup[g.id] === i,
                      onSelect: () => void changeGroups({ [g.id]: { ...groups[g.id], hue: i } })
                    })),
                    { separator: true },
                    { label: 'Delete group', icon: 'trash', destructive: true, onSelect: () => void deleteGroup(g.id) }
                  ]}
                />
              </div>
            )}
            {!folded[g.id] &&
              (g.todos.length ? (
                <div role="list" aria-label={g.name} className="todo-list">
                  {g.todos.map(row)}
                </div>
              ) : (
                <div className="sidebar-hint todo-group-empty">
                  {(mine || []).some((t) => groupOf(t, groups) === g.id) ? 'Nothing open here.' : 'Nothing here yet. Drag a to-do here to move it.'}
                </div>
              ))}
          </div>
        ))}

        {shownDone.length > 0 && (
          <button className="btn small ghost todo-clear" onClick={() => remove(shownDone)}>
            Clear done
          </button>
        )}

        {!needle && mine && (
          <div className="todo-new-group">
            {naming === '' ? (
              <GroupNameField name="" label="New group" onDone={(name) => (name === null ? (setNaming(null), true) : nameGroup(name).then((ok) => (ok && setNaming(null), ok)))} />
            ) : (
              <button className="btn small ghost" onClick={() => setNaming('')}>
                <Icon name="folder.badge.plus" />
                New group
              </button>
            )}
            {offer && starters.length > 0 && (
              <div className="chip-row" role="group" aria-label="Suggested groups">
                {starters.map((name) => (
                  <button key={name} type="button" className="chip" title={`Make a group called ${name}`} onMouseDown={(e) => e.preventDefault()} onClick={() => void nameGroup(name).then((ok) => ok && setNaming(null))}>
                    <Icon name="plus" />
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {shownSource.length > 0 && (
          <div className="todo-group">
            {foldTitle(SOURCE, 'From comments in your files', shownSource.length)}
            {!folded[SOURCE] && (
              <>
                <p className="sidebar-hint todo-source-hint">
                  From <code>% TODO</code> and <code>\todo</code> in LaTeX, <code>// TODO</code> in Typst and <code>&lt;!-- TODO --&gt;</code> in Markdown. Delete
                  the comment to tick it off.
                </p>
                {shownSource.map((todo) => (
                  <button
                    key={`${todo.file}:${todo.line}:${todo.text}`}
                    className="todo-row source"
                    title={`${todo.kind === todo.kind.toUpperCase() ? todo.kind : `\\${todo.kind}`} in ${todo.file}, line ${todo.line}`}
                    onClick={() => onOpen({ file: todo.file, line: todo.line })}
                  >
                    <span className="todo-mark" />
                    <span className="todo-body">
                      <span className="todo-text">{todo.text}</span>
                      <span className="todo-where">
                        {nameOf(todo.file)}:{todo.line}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      {drag && (
        <div className="todo-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }} aria-hidden="true">
          {drag.text}
        </div>
      )}
    </div>
  );
}

/**
 * A group's name being typed: Return or clicking away keeps it (onDone with the name, which resolves to whether it was
 * taken), Esc leaves it as it was (onDone with null).
 */
function GroupNameField({ name, label, onDone }: { name: string; label: string; onDone(name: string | null): boolean | Promise<boolean> }) {
  const [value, setValue] = useState(name);
  const busy = useRef(false);
  const done = async (next: string | null) => {
    if (busy.current) return;
    busy.current = true;
    // a name refused leaves the field open to change it
    if (!(await onDone(next))) busy.current = false;
  };
  return (
    <input
      className="input todo-group-name"
      autoFocus
      // a name being changed is selected, to type over
      onFocus={(e) => e.currentTarget.select()}
      value={value}
      placeholder="Group name"
      aria-label={label}
      maxLength={MAX_GROUP_NAME}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void done(value.trim() ? value : null)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          void done(value.trim() ? value : null);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          void done(null);
        }
      }}
    />
  );
}


/**
 * A to-do's text, and its note when it has one or one was asked for. Return in the text, or ⌘ or Ctrl Return in the
 * note, saves; Esc puts both back; clicking away saves.
 */
function TodoEditor({ todo, note, onClose }: { todo: Todo; note: boolean; onClose(next: Todo | null, keyboard: boolean): void }) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const closed = useRef(false);

  useEffect(() => {
    const el = (note ? noteRef : textRef).current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const close = (keep: boolean, keyboard: boolean) => {
    if (closed.current) return;
    closed.current = true;
    // a to-do is one line; emptied, it keeps what it was
    const text = textRef.current!.value.replace(/\s+/g, ' ').trim() || todo.text;
    const next = withNote({ ...todo, text }, noteRef.current?.value ?? todo.note ?? '');
    const changed = keep && (next.text !== todo.text || next.note !== todo.note);
    onClose(changed ? { ...next, updatedAt: new Date().toISOString() } : null, keyboard);
  };

  return (
    <div
      className="todo-editor"
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && close(true, false)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close(false, true);
        } else if (e.key === 'Enter' && (e.target === textRef.current || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          close(true, true);
        }
      }}
    >
      <textarea ref={textRef} className="input todo-edit" rows={1} defaultValue={todo.text} aria-label="To-do" maxLength={2000} />
      {(note || todo.note) && (
        <textarea ref={noteRef} className="input todo-note-edit" rows={2} defaultValue={todo.note} placeholder="Note" aria-label="Note" maxLength={MAX_NOTE} />
      )}
    </div>
  );
}
