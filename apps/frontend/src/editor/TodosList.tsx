import { useEffect, useRef, useState } from 'react';
import { deleteTodo, getFile, listTodos, saveTodo } from '../api/client';
import type { Todo, TodoLink } from '../api/client';
import Icon from '../app/Icon';
import { toast } from '../app/Toast';
import { errorText } from './shared';
import { scanTodos } from './todos';
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
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => scan(false).catch(() => undefined), 400);
    return () => window.clearTimeout(timer);
  }, [sources, revision]);

  /** Saves a new or changed to-do, showing it at once; a failed save puts the list back. Resolves to whether it saved. */
  const save = async (todo: Todo) => {
    const before = mine;
    changesRef.current += 1;
    setMine((prev) => [...(prev || []).filter((t) => t.id !== todo.id), todo]);
    try {
      await saveTodo(projectId, todo);
      return true;
    } catch (err) {
      setMine(before);
      notify(`Couldn’t save the to-do: ${errorText(err)}`, 'error');
      return false;
    }
  };

  const remove = async (todo: Todo) => {
    changesRef.current += 1;
    setMine((prev) => (prev || []).filter((t) => t.id !== todo.id));
    try {
      await deleteTodo(projectId, todo.id);
      toast('Deleted the to-do', { action: { label: 'Undo', onClick: () => save(todo) } });
    } catch (err) {
      setMine((prev) => [...(prev || []), todo]);
      notify(`Couldn’t delete the to-do: ${errorText(err)}`, 'error');
    }
  };

  /** A new to-do, optionally linked to a line, a PDF page or a reference. */
  const add = (text: string, link?: TodoLink) => {
    const now = new Date().toISOString();
    return save({ id: crypto.randomUUID(), text, done: false, createdAt: now, updatedAt: now, ...(link && { link }) });
  };

  // the open ones: yours not ticked, and every mark still in the source
  const open = (mine || []).filter((t) => !t.done).length + source.length;
  return { mine, source, open, reload, save, remove, add };
}

type Show = 'open' | 'done' | 'all';
type Whose = 'all' | 'mine' | 'source';

/**
 * The sidebar's To-dos tab: an add box, the filters, then your own to-dos (tick, edit, delete, and the line, page
 * or reference each links to) and the ones in the source, which go to their line. A source to-do is done once
 * its mark is taken out of the source.
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
  const [whose, setWhose] = useState<Whose>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const { mine, source, reload, save, remove, add } = todos;

  // opening the tab reads them again
  useEffect(reload, []);

  const linkLabel = (link: TodoLink) =>
    'file' in link ? `${nameOf(link.file)}:${link.line}` : 'doc' in link ? `${link.doc === mainFile ? '' : `${nameOf(link.doc).replace(/\.tex$/i, '')} `}p. ${link.page}` : link.key;
  const linkTitle = (link: TodoLink) =>
    'file' in link ? `${link.file}, line ${link.line}` : 'doc' in link ? `${link.doc.replace(/\.tex$/i, '.pdf')}, page ${link.page}` : `Go to ${link.key}`;

  const needle = filter.trim().toLowerCase();
  const matches = (...texts: string[]) => !needle || texts.some((t) => t.toLowerCase().includes(needle));
  const shownMine =
    whose === 'source'
      ? []
      : (mine || [])
          .filter((t) => (show === 'all' || t.done === (show === 'done')) && matches(t.text, t.link ? linkLabel(t.link) : ''))
          .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt.localeCompare(b.createdAt));
  const shownSource = whose === 'mine' || show === 'done' ? [] : source.filter((t) => matches(t.text, t.file));

  const commit = (todo: Todo, text: string) => {
    setEditing(null);
    const trimmed = text.trim();
    if (trimmed && trimmed !== todo.text) save({ ...todo, text: trimmed, updatedAt: new Date().toISOString() });
  };

  return (
    <div className="todos">
      <input
        className="input todo-add"
        value={draft}
        placeholder="Add a to-do"
        aria-label="Add a to-do"
        maxLength={2000}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !draft.trim()) return;
          add(draft.trim());
          setDraft('');
        }}
      />
      <div className="todo-filters">
        <Segments<Show> label="Show" value={show} onChange={setShow} items={[['open', 'Open'], ['done', 'Done'], ['all', 'All']]} />
        <Segments<Whose> label="Whose" value={whose} onChange={setWhose} items={[['all', 'All'], ['mine', 'Mine'], ['source', 'Source']]} />
      </div>

      {shownMine.length > 0 && (
        <div className="todo-group" role="list" aria-label="Mine">
          <div className="todo-group-title">Mine</div>
          {shownMine.map((todo) => (
            <div key={todo.id} role="listitem" className={`todo-row ${todo.done ? 'done' : ''}`}>
              <input
                type="checkbox"
                checked={todo.done}
                aria-label={todo.done ? `Mark “${todo.text}” as not done` : `Mark “${todo.text}” as done`}
                onChange={() => save({ ...todo, done: !todo.done, updatedAt: new Date().toISOString() })}
              />
              <div className="todo-body">
                {editing === todo.id ? (
                  <input
                    className="input todo-edit"
                    autoFocus
                    defaultValue={todo.text}
                    aria-label="To-do"
                    maxLength={2000}
                    onBlur={(e) => commit(todo, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit(todo, e.currentTarget.value);
                      else if (e.key === 'Escape') setEditing(null);
                    }}
                  />
                ) : (
                  <span className="todo-text" onDoubleClick={() => setEditing(todo.id)}>
                    {todo.text}
                  </span>
                )}
                {todo.link && (
                  <button className="todo-link" title={linkTitle(todo.link)} onClick={() => onOpen(todo.link!)}>
                    <Icon name={'file' in todo.link ? 'doc.text' : 'doc' in todo.link ? 'doc.richtext' : 'tag'} />
                    <span>{linkLabel(todo.link)}</span>
                  </button>
                )}
              </div>
              <button className="icon-btn small todo-action" title="Edit" aria-label="Edit to-do" onClick={() => setEditing(todo.id)}>
                <Icon name="pencil" />
              </button>
              <button className="icon-btn small todo-action destructive" title="Delete" aria-label="Delete to-do" onClick={() => remove(todo)}>
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
      )}

      {shownSource.length > 0 && (
        <div className="todo-group">
          <div className="todo-group-title">In the source</div>
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
        </div>
      )}

      {!shownMine.length && !shownSource.length && mine && (
        <div className="sidebar-hint todo-empty">
          {mine.length || source.length ? 'No matching to-dos' : 'Nothing to do yet. Add one above, or right-click a line in the editor or a page of the PDF.'}
        </div>
      )}
    </div>
  );
}

function Segments<T extends string>({ label, value, onChange, items }: { label: string; value: T; onChange(value: T): void; items: [T, string][] }) {
  return (
    <div className="segmented small" role="radiogroup" aria-label={label}>
      {items.map(([v, text]) => (
        <button key={v} className={`segment ${v === value ? 'active' : ''}`} role="radio" aria-checked={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}
