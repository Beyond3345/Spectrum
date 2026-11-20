import { useEffect, useRef, useState } from 'react';
import { deleteTodo, getFile, listTodos, saveTodo } from '../api/client';
import type { Todo, TodoLink } from '../api/client';
import Icon from '../app/Icon';
import Segmented from '../app/Segmented';
import { toast } from '../app/Toast';
import { PROJECT_DATA_CHANGED, errorText } from './shared';
import { MAX_NOTE, emptyText, findLine, scanTodos, sortTodos, todoCounts, todoMatches, withNote } from './todos';
import type { SourceTodo } from './todos';

const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export type TodosState = ReturnType<typeof useTodos>;

/**
 * The project's to-dos: the user's own (one file each in .spectrum/todos) and the marks in the source. Both load
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
      .then((res) => changes === changesRef.current && setMine(res.todos || []))
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

  /** A new to-do, optionally linked to a line, a PDF page or a reference. */
  const add = (text: string, link?: TodoLink) => {
    const now = new Date().toISOString();
    return save({ id: crypto.randomUUID(), text, done: false, createdAt: now, updatedAt: now, ...(link && { link }) });
  };

  /** The line a line link is on now, found again by its text as the link itself is when opened. */
  const lineOf = (link: { file: string; line: number; snippet?: string }) => {
    const text = latest.current.loaded(link.file) ?? readRef.current.get(link.file);
    return text === undefined ? link.line : findLine(text, link.line, link.snippet);
  };

  // the open ones: yours not ticked, and every mark still in the source
  const { open } = todoCounts(mine || [], source);
  return { mine, source, open, reload, save, remove, add, lineOf };
}

/** A link of a kind this version knows; a later version's other kinds are kept but not shown. */
const knownLink = (link?: TodoLink): link is TodoLink => !!link && ('file' in link || 'doc' in link || 'key' in link);


type Show = 'open' | 'done' | 'all';
type Group = 'mine' | 'source';

/**
 * The sidebar's To-dos tab: an add box with +, Open, Done and All with their counts, then your own to-dos (tick,
 * edit, a note, delete, and the line, page or reference each links to) and the ones in the source, which go to their
 * line. Each group folds away. A source to-do is done once its mark is taken out of the source.
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
  const [folded, setFolded] = useState<Partial<Record<Group, boolean>>>({});
  // the to-do being edited, and whether its note was asked for
  const [editing, setEditing] = useState<{ id: string; note: boolean } | null>(null);
  // the notes shown in full
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const { mine, source, reload, save, remove, add, lineOf } = todos;

  // opening the tab reads them again
  useEffect(reload, []);

  const linkLabel = (link: TodoLink) =>
    'file' in link
      ? `${nameOf(link.file)}:${lineOf(link)}`
      : 'doc' in link
        ? link.doc === mainFile
          ? `Page ${link.page}`
          : `${nameOf(link.doc).replace(/\.tex$/i, '')}, page ${link.page}`
        : link.key;
  const linkTitle = (link: TodoLink) =>
    'file' in link ? `${link.file}, line ${lineOf(link)}` : 'doc' in link ? `${link.doc.replace(/\.tex$/i, '.pdf')}, page ${link.page}` : `Go to ${link.key}`;

  const needle = filter.trim().toLowerCase();
  const counts = todoCounts(mine || [], source);
  const shownMine = sortTodos(
    (mine || []).filter((t) => (show === 'all' || t.done === (show === 'done')) && todoMatches(needle, t, knownLink(t.link) ? linkLabel(t.link) : ''))
  );
  const shownSource = show === 'done' ? [] : source.filter((t) => todoMatches(needle, t, t.file));
  const shownDone = shownMine.filter((t) => t.done);

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
    setFolded((f) => ({ ...f, mine: false }));
    setAdded((n) => n + 1);
    // what was typed comes back when it couldn't be saved
    add(text).then((saved) => saved || setDraft((d) => d || text));
  };

  /** Ends an edit: saves what changed; from the keyboard, the focus goes back to the to-do's tick box. */
  const finish = (todo: Todo, next: Todo | null, keyboard: boolean) => {
    setEditing(null);
    if (next) save(next);
    if (keyboard) requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-todo="${todo.id}"] input[type='checkbox']`)?.focus());
  };

  const groupTitle = (group: Group, label: string, count: number) => (
    <button
      className="sidebar-section-title todo-group-head"
      aria-expanded={!folded[group]}
      onClick={() => setFolded((f) => ({ ...f, [group]: !f[group] }))}
    >
      <span>
        {label} <span className="todo-count">{count}</span>
      </span>
      <Icon name="chevron.right" className={`disclosure ${folded[group] ? '' : 'open'}`} />
    </button>
  );

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
            placeholder="Add a to-do"
            aria-label="Add a to-do"
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && draft && (e.stopPropagation(), setDraft(''))}
          />
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
        {shownMine.length > 0 && (
          <div className="todo-group">
            {groupTitle('mine', 'Mine', shownMine.length)}
            {!folded.mine && (
              <>
                <div role="list" aria-label="Mine" className="todo-list">
                  {shownMine.map((todo) => {
                    const edit = editing?.id === todo.id;
                    const full = opened.has(todo.id);
                    return (
                      <div key={todo.id} role="listitem" data-todo={todo.id} className={`todo-row ${todo.done ? 'done' : ''}`}>
                        <input
                          type="checkbox"
                          checked={todo.done}
                          aria-label={todo.done ? `Mark “${todo.text}” as not done` : `Mark “${todo.text}” as done`}
                          onChange={() => save({ ...todo, done: !todo.done, updatedAt: new Date().toISOString() })}
                        />
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
                            <button className="todo-link" title={linkTitle(todo.link)} onClick={() => onOpen(todo.link!)}>
                              <Icon name={'file' in todo.link ? 'doc.text' : 'doc' in todo.link ? 'doc.richtext' : 'tag'} />
                              <span>{linkLabel(todo.link)}</span>
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
                  })}
                </div>
                {shownDone.length > 0 && (
                  <button className="btn small ghost todo-clear" onClick={() => remove(shownDone)}>
                    Clear done
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {shownSource.length > 0 && (
          <div className="todo-group">
            {groupTitle('source', 'In the source', shownSource.length)}
            {!folded.source &&
              shownSource.map((todo) => (
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
          </div>
        )}

        {!shownMine.length && !shownSource.length && mine && (
          <div className="sidebar-hint todo-empty">{emptyText({ total: counts.all, show, search: filter.trim() })}</div>
        )}
      </div>
    </div>
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
