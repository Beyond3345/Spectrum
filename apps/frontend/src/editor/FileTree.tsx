import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { ApiError, createFolder, deleteFile, renamePath, revealProject, updateFileOrder, uploadFiles, writeFile } from '../api/client';
import type { FileItem, FileOrderMap } from '../api/client';
import Icon from '../app/Icon';
import { ContextMenu } from '../app/Menu';
import type { MenuItems } from '../app/Menu';
import { confirmDialog } from '../app/Dialogs';
import { IS_DESKTOP } from '../app/desktop';
import { FILE_MANAGER } from '../app/platform';
import { errorText } from './shared';

type TreeNode = { name: string; path: string; type: 'file' | 'dir'; children: TreeNode[] };
type InlineEdit = { kind: 'file' | 'folder'; parent: string; value: string } | { kind: 'rename'; path: string; value: string };
type Drop = { path: string; mode: 'into' | 'before' };
export type FileTreeHandle = { beginCreate(kind: 'file' | 'folder'): void; upload(kind: 'files' | 'folder'): void };

const DRAG_TYPE = 'application/x-spectrum-path';
export const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const isTex = (p: string) => /\.tex$/i.test(p);

function fileIcon(path: string) {
  const ext = path.toLowerCase().split('.').pop() || '';
  if (ext === 'tex') return 'doc.text';
  if (ext === 'bib') return 'books.vertical';
  if (ext === 'pdf') return 'doc.richtext';
  if (['png', 'jpg', 'jpeg', 'svg', 'eps', 'gif'].includes(ext)) return 'photo';
  if (['cls', 'sty', 'bst'].includes(ext)) return 'curlybraces';
  return 'doc';
}

/** Nested nodes, each folder's children in the saved order (unordered ones after, folders first, by name). */
function buildTree(items: FileItem[], order: FileOrderMap) {
  const root: TreeNode = { name: '', path: '', type: 'dir', children: [] };
  const nodes = new Map<string, TreeNode>([['', root]]);
  for (const item of [...items].sort((a, b) => a.path.localeCompare(b.path))) {
    let parent = root;
    item.path.split('/').forEach((part, i, parts) => {
      const path = parts.slice(0, i + 1).join('/');
      let node = nodes.get(path);
      if (!node) {
        node = { name: part, path, type: i === parts.length - 1 && item.type === 'file' ? 'file' : 'dir', children: [] };
        nodes.set(path, node);
        parent.children.push(node);
      }
      parent = node;
    });
  }
  const sort = (node: TreeNode) => {
    const saved = order[node.path] || [];
    const rank = (n: TreeNode) => (saved.includes(n.name) ? saved.indexOf(n.name) : Infinity);
    node.children.sort(
      (a, b) => rank(a) - rank(b) || (a.type === b.type ? 0 : a.type === 'dir' ? -1 : 1) || a.name.localeCompare(b.name, 'en-AU', { numeric: true })
    );
    node.children.forEach(sort);
  };
  sort(root);
  return { root, nodes };
}

/** Files dropped from Finder, folders included (walked with the entries API). */
async function droppedFiles(dt: DataTransfer): Promise<File[]> {
  // entries must be taken while the drop event is still running
  const entries = [...dt.items].map((item) => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [...dt.files];
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      if (file.name !== '.DS_Store') out.push(prefix ? new File([file], `${prefix}${file.name}`, { type: file.type }) : file);
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
    }
  };
  for (const entry of entries) await walk(entry, '');
  return out;
}

const isExternal = (e: DragEvent) => e.dataTransfer.types.includes('Files');

/** Project files: folders, drag to reorder or move, drop from Finder to upload, inline create/rename, right-click menu. */
const FileTree = forwardRef<
  FileTreeHandle,
  {
    projectId: string;
    items: FileItem[];
    fileOrder: FileOrderMap;
    filter: string;
    activePath: string;
    mainFile: string;
    /** a sync app's conflict copies, each with its original's path */
    conflicts?: Record<string, string>;
    onOpen(path: string): void;
    onRefresh(): Promise<void>;
    /** saves the open file, so a pending autosave can't land on top of an upload */
    beforeUpload(): Promise<void>;
    /** project paths an upload wrote (some may have replaced files that are open or cached) */
    onUploaded(paths: string[]): Promise<void>;
    onMoved(from: string, to: string): void;
    onDeleted(path: string): void;
    onSetMain(path: string): void;
    onNewBib(): void;
    notify(message: string, tone?: 'info' | 'success' | 'error'): void;
  }
>(function FileTree(props, ref) {
  const { projectId, items, fileOrder, filter, activePath, mainFile, onOpen, onRefresh, onMoved, onDeleted, notify } = props;
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState('');
  const [inline, setInline] = useState<InlineEdit | null>(null);
  const [dragging, setDragging] = useState('');
  const [drop, setDrop] = useState<Drop | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; path: string | null } | null>(null);
  const inlineRef = useRef(inline);
  inlineRef.current = inline;
  const busy = useRef(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef('');

  const term = filter.trim().toLowerCase();
  const full = useMemo(() => buildTree(items, fileOrder), [items, fileOrder]);
  const shown = useMemo(
    () => (term ? buildTree(items.filter((i) => i.type === 'file' && i.path.toLowerCase().includes(term)), fileOrder).root : full.root),
    [items, fileOrder, term, full]
  );
  const exists = (path: string) => full.nodes.has(path);

  // reveal the open file
  useEffect(() => {
    const parts = activePath.split('/').slice(0, -1);
    if (!parts.length) return;
    setOpenFolders((prev) => ({ ...prev, ...Object.fromEntries(parts.map((_, i) => [parts.slice(0, i + 1).join('/'), true])) }));
  }, [activePath]);

  const run = (task: () => Promise<unknown>, failure: string) =>
    task().catch((err) => notify(`${failure}: ${errorText(err)}`, 'error'));

  const isOpen = (path: string, depth: number) => !!term || (openFolders[path] ?? depth < 1);

  const targetFolder = (path = selected || activePath) => (full.nodes.get(path)?.type === 'dir' ? path : parentOf(path));

  const beginCreate = (kind: 'file' | 'folder', parent = targetFolder()) => {
    if (parent) setOpenFolders((prev) => ({ ...prev, [parent]: true }));
    setInline({ kind, parent, value: '' });
  };

  const pick = (kind: 'files' | 'folder', folder = targetFolder()) => {
    uploadTarget.current = folder;
    (kind === 'files' ? filesInput : folderInput).current?.click();
  };

  useImperativeHandle(ref, () => ({ beginCreate: (kind) => beginCreate(kind), upload: (kind) => pick(kind) }));

  const upload = async (files: File[], folder: string) => {
    if (!files.length) return;
    // the upload overwrites files with the same name, and no version is kept of them
    const taken = files.map((f) => join(folder, (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)).filter(exists);
    if (taken.length) {
      const ok = await confirmDialog({
        title: taken.length === 1 ? `Replace “${nameOf(taken[0])}”?` : `Replace ${taken.length} files?`,
        message: `${taken.length === 1 ? 'A file with this name is' : `${taken.slice(0, 5).join(', ')}${taken.length > 5 ? ' and others are' : ' are'}`} already in the project. Replacing can’t be undone.`,
        confirmLabel: 'Replace',
        destructive: true
      });
      if (!ok) return;
    }
    await props.beforeUpload();
    const res = await uploadFiles(projectId, files, folder || undefined);
    await props.onUploaded(res.files || []);
    await onRefresh();
    const n = res.files?.length ?? files.length;
    notify(`Uploaded ${n} ${n === 1 ? 'file' : 'files'}${folder ? ` to ${folder}` : ''}`, 'success');
  };

  /** Saved order entries follow a renamed or moved folder. */
  const moveOrderKeys = async (from: string, to: string) => {
    for (const [key, order] of Object.entries(fileOrder)) {
      if (key !== from && !key.startsWith(`${from}/`)) continue;
      await updateFileOrder(projectId, to + key.slice(from.length), order);
    }
  };

  const move = async (from: string, folder: string, before?: string) => {
    const name = nameOf(from);
    const to = join(folder, name);
    if (folder === from || folder.startsWith(`${from}/`) || before === name) return;
    if (to !== from) {
      if (exists(to)) {
        notify(`“${name}” is already in ${folder || 'the project folder'}.`, 'error');
        return;
      }
      await renamePath(projectId, from, to);
      onMoved(from, to);
      const oldParent = parentOf(from);
      if (fileOrder[oldParent]) await updateFileOrder(projectId, oldParent, fileOrder[oldParent].filter((n) => n !== name));
      if (full.nodes.get(from)?.type === 'dir') await moveOrderKeys(from, to);
    } else if (!before) {
      return;
    }
    // the folder's current order with the moved item placed before `before` (or last)
    const names = (full.nodes.get(folder)?.children || []).map((c) => c.name).filter((n) => n !== name);
    names.splice(before && names.includes(before) ? names.indexOf(before) : names.length, 0, name);
    await updateFileOrder(projectId, folder, names);
    if (folder) setOpenFolders((prev) => ({ ...prev, [folder]: true }));
    await onRefresh();
  };

  const commit = async () => {
    const edit = inlineRef.current;
    if (!edit || busy.current) return;
    const value = edit.value.trim().replace(/^\/+|\/+$/g, '');
    if (!value || (edit.kind === 'rename' && value === nameOf(edit.path))) {
      setInline(null);
      return;
    }
    const target = join(edit.kind === 'rename' ? parentOf(edit.path) : edit.parent, value);
    if (exists(target)) {
      notify(`“${value}” already exists.`, 'error');
      return;
    }
    busy.current = true;
    try {
      if (edit.kind === 'rename') {
        await renamePath(projectId, edit.path, target);
        onMoved(edit.path, target);
        const parent = parentOf(edit.path);
        if (fileOrder[parent]) await updateFileOrder(projectId, parent, fileOrder[parent].map((n) => (n === nameOf(edit.path) ? value : n)));
        if (full.nodes.get(edit.path)?.type === 'dir') await moveOrderKeys(edit.path, target);
        setSelected(target);
      } else {
        if (edit.kind === 'folder') await createFolder(projectId, target);
        else await writeFile(projectId, target, '', { create: true, typed: true });
        if (fileOrder[edit.parent]) await updateFileOrder(projectId, edit.parent, [...fileOrder[edit.parent], value]);
      }
      setInline(null);
      await onRefresh();
      if (edit.kind === 'file') onOpen(target);
    } catch (err) {
      // the tree can miss a file made outside the app, or one differing only in letter case
      if (edit.kind === 'file' && err instanceof ApiError && err.status === 409) notify(`“${value}” already exists. Names that differ only in letter case count as the same.`, 'error');
      else notify(`Couldn’t ${edit.kind === 'rename' ? 'rename' : 'create'} “${value}”: ${errorText(err)}`, 'error');
    } finally {
      busy.current = false;
    }
  };

  const remove = async (path: string) => {
    const isDir = full.nodes.get(path)?.type === 'dir';
    const ok = await confirmDialog({
      title: `Delete “${nameOf(path)}”?`,
      message: isDir ? 'The folder and everything in it will be deleted. This can’t be undone.' : 'This can’t be undone.',
      confirmLabel: 'Delete',
      destructive: true
    });
    if (!ok) return;
    const res = await deleteFile(projectId, path);
    if (!res.ok) throw new Error(res.error || 'Delete failed.');
    onDeleted(path);
    setSelected('');
    await onRefresh();
  };

  const setAll = (open: boolean) =>
    setOpenFolders(Object.fromEntries([...full.nodes.values()].filter((n) => n.type === 'dir' && n.path).map((n) => [n.path, open])));

  const menuItems = (path: string | null): MenuItems => {
    const folder = path ? targetFolder(path) : '';
    return [
      { label: 'New file…', icon: 'doc.badge.plus', onSelect: () => beginCreate('file', folder) },
      { label: 'New folder…', icon: 'folder.badge.plus', onSelect: () => beginCreate('folder', folder) },
      { label: 'New .bib', icon: 'books.vertical', onSelect: props.onNewBib },
      { separator: true },
      { label: 'Upload files…', icon: 'square.and.arrow.up', onSelect: () => pick('files', folder) },
      { label: 'Upload folder…', icon: 'tray.and.arrow.down', onSelect: () => pick('folder', folder) },
      { separator: true },
      !!path && isTex(path) && { label: 'Set as main file', icon: 'checkmark.seal', disabled: path === mainFile, onSelect: () => props.onSetMain(path) },
      !!path && { label: 'Rename…', icon: 'pencil', onSelect: () => setInline({ kind: 'rename', path, value: nameOf(path) }) },
      IS_DESKTOP && { label: `Show in ${FILE_MANAGER}`, icon: 'folder', onSelect: () => run(() => revealProject(projectId, path || undefined), `Couldn’t show it in ${FILE_MANAGER}`) },
      !!path && { label: 'Delete…', icon: 'trash', destructive: true, onSelect: () => run(() => remove(path), 'Couldn’t delete') },
      !!path && { separator: true },
      { label: 'Expand all', icon: 'chevron.down', onSelect: () => setAll(true) },
      { label: 'Collapse all', icon: 'chevron.right', onSelect: () => setAll(false) },
      { label: 'Refresh', icon: 'arrow.clockwise', onSelect: () => run(onRefresh, 'Couldn’t refresh') }
    ];
  };

  const onDrop = (e: DragEvent, folder: string, before?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDrop(null);
    setDragging('');
    if (isExternal(e)) {
      const files = droppedFiles(e.dataTransfer);
      run(async () => upload(await files, folder), 'Upload failed');
      return;
    }
    const from = e.dataTransfer.getData(DRAG_TYPE);
    if (!from) return;
    if (term) {
      notify('Clear the search to move files.');
      return;
    }
    run(() => move(from, folder, before), 'Couldn’t move it');
  };

  const input = (edit: InlineEdit) => (
    <input
      className="tree-input"
      autoFocus
      value={edit.value}
      placeholder={edit.kind === 'folder' ? 'Folder name' : edit.kind === 'file' ? 'File name, e.g. intro.tex' : ''}
      spellCheck={false}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => {
        // select the name without its extension, like Finder
        const dot = e.target.value.lastIndexOf('.');
        e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
      }}
      onChange={(e) => setInline({ ...edit, value: e.target.value })}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setInline(null);
      }}
      onBlur={commit}
    />
  );

  const createRow = (parent: string, depth: number) =>
    inline && inline.kind !== 'rename' && inline.parent === parent ? (
      <div className="tree-row editing" style={{ paddingLeft: 10 + depth * 14 }}>
        <span className="tree-chevron" />
        <Icon name={inline.kind === 'folder' ? 'folder' : 'doc'} className="tree-icon" />
        {input(inline)}
      </div>
    ) : null;

  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      const isDir = node.type === 'dir';
      const open = isDir && isOpen(node.path, depth);
      const renaming = inline?.kind === 'rename' && inline.path === node.path;
      const className = [
        'tree-row',
        isDir ? 'folder' : 'file',
        node.path === activePath && 'active',
        node.path === selected && 'selected',
        drop?.path === node.path && `drop-${drop.mode}`,
        dragging === node.path && 'dragging'
      ]
        .filter(Boolean)
        .join(' ');
      return (
        <div key={node.path} role="none">
          <div
            role="treeitem"
            aria-expanded={isDir ? open : undefined}
            aria-selected={node.path === activePath}
            tabIndex={0}
            className={className}
            style={{ paddingLeft: 10 + depth * 14 }}
            title={node.path}
            draggable={!renaming}
            onClick={() => {
              setSelected(node.path);
              if (isDir) setOpenFolders((prev) => ({ ...prev, [node.path]: !open }));
              else onOpen(node.path);
            }}
            onKeyDown={(e) => {
              if (renaming) return;
              if (e.key === 'Enter') e.currentTarget.click();
              // the keyboard way to the file menu (rename, delete, set as main file)
              else if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setSelected(node.path);
                setMenu({ x: r.left + 24, y: r.bottom, path: node.path });
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelected(node.path);
              setMenu({ x: e.clientX, y: e.clientY, path: node.path });
            }}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, node.path);
              e.dataTransfer.effectAllowed = 'move';
              setDragging(node.path);
            }}
            onDragEnd={() => {
              setDragging('');
              setDrop(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const next: Drop = isDir ? { path: node.path, mode: 'into' } : isExternal(e) ? { path: parentOf(node.path), mode: 'into' } : { path: node.path, mode: 'before' };
              if (drop?.path !== next.path || drop.mode !== next.mode) setDrop(next);
            }}
            onDrop={(e) => (isDir ? onDrop(e, node.path) : onDrop(e, parentOf(node.path), isExternal(e) ? undefined : node.name))}
          >
            {isDir ? <Icon name="chevron.right" className={`tree-chevron ${open ? 'open' : ''}`} /> : <span className="tree-chevron" />}
            <Icon name={isDir ? 'folder' : fileIcon(node.path)} className="tree-icon" />
            {renaming ? input(inline) : <span className="tree-name">{node.name}</span>}
            {node.path === mainFile && <span className="tree-badge">Main</span>}
            {props.conflicts?.[node.path] && (
              <span className="tree-badge conflict" title={`Your sync app kept this copy of ${props.conflicts[node.path]} when both changed`}>
                Conflict
              </span>
            )}
          </div>
          {open && (
            <div role="group">
              {createRow(node.path, depth + 1)}
              {renderNodes(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });

  return (
    <div
      className={`file-tree ${drop?.path === '' ? 'drop-root' : ''}`}
      role="tree"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, path: null });
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (drop?.path !== '') setDrop({ path: '', mode: 'into' });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
      }}
      onDrop={(e) => onDrop(e, '')}
    >
      {createRow('', 0)}
      {renderNodes(shown.children, 0)}
      {!shown.children.length && !inline && <div className="tree-empty">{term ? 'No matching files' : 'No files yet'}</div>}
      <input
        ref={filesInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files || [])];
          e.target.value = '';
          run(() => upload(files, uploadTarget.current), 'Upload failed');
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={(e) => {
          const files = [...(e.target.files || [])].filter((f) => f.name !== '.DS_Store');
          e.target.value = '';
          run(() => upload(files, uploadTarget.current), 'Upload failed');
        }}
      />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.path)} onClose={() => setMenu(null)} />}
    </div>
  );
});

export default FileTree;
