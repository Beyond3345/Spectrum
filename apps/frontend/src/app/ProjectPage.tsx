import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  archiveProject,
  binProject,
  copyProject,
  createProject,
  getProjectTree,
  importArxivSSE,
  importZip,
  listProjects,
  listTemplates,
  openFolder,
  relocateProject,
  removeProject,
  renameProject,
  revealProject,
  setProjectMainFile,
  systemCheck,
  thumbnailUrl,
  updateProjectTags,
  uploadTemplate,
  writeFile
} from '../api/client';
import type { ProjectMeta, TemplateCategory, TemplateMeta } from '../api/client';
import Icon from './Icon';
import { ContextMenu, MenuButton } from './Menu';
import type { MenuItems } from './Menu';
import Select from './Select';
import Sheet from './Sheet';
import SettingsSheet from './SettingsSheet';
import TransferPanel, { transferStatusLabel } from './TransferPanel';
import type { TransferJob } from './TransferPanel';
import { confirmDialog, promptDialog } from './Dialogs';
import { toast } from './Toast';
import { IS_DESKTOP, pickFolder } from './desktop';
import { useSettings } from './settings';
import { matchesShortcut, shortcutKey, withShortcut } from './shortcuts';

// ─── helpers ───

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Throws on `{ ok: false }` answers so callers can use one catch. */
function ensureOk<T extends { ok?: boolean; error?: string }>(res: T, fallback: string): T {
  if (res.ok === false) throw new Error(res.error || fallback);
  return res;
}

const relative = new Intl.RelativeTimeFormat('en-AU', { numeric: 'always' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 3600],
  ['day', 86400],
  ['week', 604800],
  ['month', 2629800],
  ['year', 31557600]
];

function timeAgo(iso: string) {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(secs)) return '';
  if (secs < 60) return 'Just now';
  const [unit, size] = UNITS.filter(([, s]) => secs >= s).pop()!;
  return relative.format(-Math.floor(secs / size), unit);
}

const fullDate = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const formatFull = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : fullDate.format(d);
};

const tildify = (p: string) => p.replace(/^\/Users\/[^/]+/, '~');

const TAG_COLOURS = [
  'var(--accent)',
  'var(--green)',
  'var(--orange)',
  'var(--red)',
  'var(--yellow)',
  'color-mix(in srgb, var(--accent) 55%, var(--red))',
  'color-mix(in srgb, var(--green) 55%, var(--accent))'
];
const tagColour = (tag: string) => TAG_COLOURS[[...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TAG_COLOURS.length];

const texEscape = (s: string) => s.replace(/[\\~^]/g, '').replace(/[&%$#_{}]/g, '\\$&');
const blankTex = (name: string) => `\\documentclass[11pt]{article}

\\title{${texEscape(name)}}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}


\\end{document}
`;

// ─── view preferences (per browser; nothing important) ───

type Prefs = {
  layout: 'list' | 'grid';
  sortKey: 'name' | 'date';
  dateField: 'updatedAt' | 'createdAt';
  sortDir: 'asc' | 'desc';
  sidebarCollapsed: boolean;
  tagsOpen: boolean;
};
const PREFS_KEY = 'spectrum-projects-view';
const DEFAULT_PREFS: Prefs = { layout: 'list', sortKey: 'date', dateField: 'updatedAt', sortDir: 'desc', sidebarCollapsed: false, tagsOpen: true };

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

type SheetState =
  | { kind: 'new'; template: string }
  | { kind: 'gallery' }
  | { kind: 'arxiv' }
  | { kind: 'tags'; id: string }
  | { kind: 'transfer'; id: string }
  | { kind: 'settings' }
  | null;

type ActiveJob = TransferJob & { sourceName: string };

// ─── page ───

export default function ProjectPage() {
  const navigate = useNavigate();
  const [settings] = useSettings();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [defaultDir, setDefaultDir] = useState('');
  const [view, setView] = useState('all'); // 'all' | 'archived' | 'tag:<name>'
  const [query, setQuery] = useState('');
  const [prefs, setPrefs] = useState(loadPrefs);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; project: ProjectMeta } | null>(null);
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [busy, setBusy] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const updatePrefs = (patch: Partial<Prefs> | ((prev: Prefs) => Partial<Prefs>)) =>
    setPrefs((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // per-browser convenience only
      }
      return next;
    });

  const reload = useCallback(async () => {
    try {
      const res = await listProjects();
      setProjects((res.projects || []).map((p) => ({ ...p, tags: p.tags || [] })));
      setLoadError('');
    } catch (err) {
      setLoadError(errorText(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  const reloadTemplates = useCallback(async () => {
    const res = await listTemplates();
    setTemplates(res.templates || []);
    setCategories(res.categories || []);
  }, []);

  useEffect(() => {
    reload();
    reloadTemplates().catch((err) => toast(`Couldn’t load templates: ${errorText(err)}`, { tone: 'error' }));
    systemCheck().then((res) => setDefaultDir(res.projectsDir || '')).catch(() => undefined);
  }, [reload, reloadTemplates]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchesShortcut(shortcutKey(settings.shortcuts, 'sidebar'), e)) {
        e.preventDefault();
        updatePrefs((prev) => ({ sidebarCollapsed: !prev.sidebarCollapsed }));
      } else if (matchesShortcut('Mod-,', e)) {
        e.preventDefault();
        setSheet({ kind: 'settings' });
      } else if (matchesShortcut('Mod-f', e) && !sheet) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // updatePrefs only uses the functional setState form, so a stale copy is fine
  }, [sheet, settings.shortcuts]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((p) => p.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, 'en-AU', { sensitivity: 'base' }));
  }, [projects]);

  const activeTag = view.startsWith('tag:') ? view.slice(4) : null;

  // a tag view whose last project lost the tag falls back to All projects
  useEffect(() => {
    if (activeTag && loaded && !allTags.some(([tag]) => tag === activeTag)) setView('all');
  }, [activeTag, allTags, loaded]);

  const counts = useMemo(
    () => ({ all: projects.filter((p) => !p.archived).length, archived: projects.filter((p) => p.archived).length }),
    [projects]
  );

  const visible = useMemo(() => {
    let list = activeTag
      ? projects.filter((p) => p.tags.includes(activeTag))
      : projects.filter((p) => (view === 'archived' ? p.archived : !p.archived));
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          // the folder's own name only: every path shares ~/Documents/Spectrum
          (p.path.split('/').pop() || '').toLowerCase().includes(q) ||
          p.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    const dir = prefs.sortDir === 'asc' ? 1 : -1;
    const time = (p: ProjectMeta) => new Date(p[prefs.dateField] || p.createdAt).getTime() || 0;
    return [...list].sort((a, b) =>
      prefs.sortKey === 'name'
        ? dir * a.name.localeCompare(b.name, 'en-AU', { numeric: true, sensitivity: 'base' })
        : dir * (time(a) - time(b))
    );
  }, [projects, view, activeTag, query, prefs.sortKey, prefs.sortDir, prefs.dateField]);

  const title = activeTag ?? (view === 'archived' ? 'Archived' : 'All projects');
  const parentDir = settings.projectsDir || undefined;

  // ─── actions ───

  const open = (p: ProjectMeta) => {
    if (p.missing) locate(p);
    else navigate(`/editor/${p.id}`);
  };

  const attempt = async (fn: () => Promise<unknown>, failure: string) => {
    try {
      await fn();
    } catch (err) {
      toast(`${failure}: ${errorText(err)}`, { tone: 'error' });
    }
    await reload();
  };

  const rename = async (p: ProjectMeta) => {
    const name = (await promptDialog({ title: 'Rename project', defaultValue: p.name, confirmLabel: 'Rename' }))?.trim();
    if (!name || name === p.name) return;
    await attempt(async () => ensureOk(await renameProject(p.id, name), 'Rename failed'), 'Couldn’t rename the project');
  };

  const duplicate = (p: ProjectMeta) =>
    attempt(async () => {
      const res = ensureOk(await copyProject(p.id), 'Copy failed');
      toast(`Duplicated as “${res.project?.name || `${p.name} copy`}”.`, { tone: 'success' });
    }, 'Couldn’t duplicate the project');

  const setTags = async (id: string, tags: string[]) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, tags } : p)));
    try {
      await updateProjectTags(id, tags);
    } catch (err) {
      toast(`Couldn’t update tags: ${errorText(err)}`, { tone: 'error' });
      await reload();
    }
  };

  const toggleArchive = (p: ProjectMeta) =>
    attempt(async () => {
      await archiveProject(p.id, !p.archived);
      toast(p.archived ? `“${p.name}” is back in All projects.` : `Archived “${p.name}”.`);
    }, 'Couldn’t change the project');

  const remove = async (p: ProjectMeta) => {
    const ok = await confirmDialog({
      title: `Remove “${p.name}” from the list?`,
      message: 'The folder stays where it is on disk. Add it again any time with Import › Open existing folder…',
      confirmLabel: 'Remove'
    });
    if (ok) await attempt(() => removeProject(p.id), 'Couldn’t remove the project');
  };

  const moveToBin = async (p: ProjectMeta) => {
    const ok = await confirmDialog({
      title: `Move “${p.name}” to the Bin?`,
      message: `The project folder and everything in it will be moved to the Bin:\n${tildify(p.path)}`,
      confirmLabel: 'Move to Bin',
      destructive: true
    });
    if (!ok) return;
    await attempt(async () => {
      ensureOk(await binProject(p.id), 'Moving to the Bin failed');
      toast(`Moved “${p.name}” to the Bin.`);
    }, 'Couldn’t move the project to the Bin');
  };

  const locate = async (p: ProjectMeta) => {
    const path = await pickFolder({ title: `Locate the folder for “${p.name}”` });
    if (!path) return;
    await attempt(async () => {
      ensureOk(await relocateProject(p.id, path), 'That folder couldn’t be used');
      toast(`Found “${p.name}”.`, { tone: 'success' });
    }, 'Couldn’t relocate the project');
  };

  const reveal = (p: ProjectMeta) => revealProject(p.id).catch((err) => toast(errorText(err), { tone: 'error' }));

  const openExisting = async () => {
    // no defaultPath: accepting the projects folder itself would make every project in it one project
    const path = await pickFolder({ title: 'Open an existing folder as a project' });
    if (!path) return;
    try {
      const project = await openFolder(path);
      navigate(`/editor/${project.id}`);
    } catch (err) {
      toast(`Couldn’t open the folder: ${errorText(err)}`, { tone: 'error' });
    }
  };

  const handleZip = async (file: File) => {
    setBusy(true);
    toast(`Importing ${file.name}…`);
    try {
      const res = ensureOk(await importZip({ file, projectName: file.name.replace(/\.zip$/i, ''), parentDir }), 'Import failed');
      if (!res.project) throw new Error('Import failed');
      navigate(`/editor/${res.project.id}`);
    } catch (err) {
      toast(`Couldn’t import the .zip: ${errorText(err)}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const menuFor = (p: ProjectMeta): MenuItems =>
    p.missing
      ? [
          { label: 'Locate…', icon: 'folder.badge.questionmark', onSelect: () => locate(p) },
          { separator: true },
          { label: 'Remove from list', icon: 'minus.circle', onSelect: () => remove(p) }
        ]
      : [
          { label: 'Open', icon: 'doc.text', onSelect: () => open(p) },
          { separator: true },
          { label: 'Rename…', icon: 'pencil', onSelect: () => rename(p) },
          { label: 'Duplicate', icon: 'plus.square.on.square', onSelect: () => duplicate(p) },
          { label: 'Tags…', icon: 'tag', onSelect: () => setSheet({ kind: 'tags', id: p.id }) },
          { label: 'Change template…', icon: 'arrow.triangle.2.circlepath', onSelect: () => setSheet({ kind: 'transfer', id: p.id }) },
          IS_DESKTOP && { label: 'Show in Finder', icon: 'folder', onSelect: () => reveal(p) },
          { separator: true },
          { label: p.archived ? 'Unarchive' : 'Archive', icon: 'archivebox', onSelect: () => toggleArchive(p) },
          { label: 'Remove from list', icon: 'minus.circle', onSelect: () => remove(p) },
          { label: 'Move to Bin…', icon: 'trash', destructive: true, onSelect: () => moveToBin(p) }
        ];

  const rowProps = (p: ProjectMeta) => ({
    tabIndex: 0,
    onDoubleClick: () => open(p),
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' && e.target === e.currentTarget) open(p);
    },
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault();
      setCtx({ x: e.clientX, y: e.clientY, project: p });
    }
  });

  const tagChips = (p: ProjectMeta) =>
    p.tags.map((tag) => (
      <button
        key={tag}
        className="chip tag-chip"
        title={`Show projects tagged “${tag}”`}
        onClick={(e) => {
          e.stopPropagation();
          setView(`tag:${tag}`);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <span className="tag-dot" style={{ background: tagColour(tag) }} />
        {tag}
      </button>
    ));

  const sortByName = () =>
    updatePrefs(prefs.sortKey === 'name' ? { sortDir: prefs.sortDir === 'asc' ? 'desc' : 'asc' } : { sortKey: 'name', sortDir: 'asc' });

  const dateLabel = prefs.dateField === 'updatedAt' ? 'Modified' : 'Created';
  const dateMenu: MenuItems = [
    { label: 'Modified', checked: prefs.dateField === 'updatedAt', onSelect: () => updatePrefs({ dateField: 'updatedAt', sortKey: 'date', sortDir: 'desc' }) },
    { label: 'Created', checked: prefs.dateField === 'createdAt', onSelect: () => updatePrefs({ dateField: 'createdAt', sortKey: 'date', sortDir: 'desc' }) },
    { separator: true },
    { label: 'Newest first', checked: prefs.sortKey === 'date' && prefs.sortDir === 'desc', onSelect: () => updatePrefs({ sortKey: 'date', sortDir: 'desc' }) },
    { label: 'Oldest first', checked: prefs.sortKey === 'date' && prefs.sortDir === 'asc', onSelect: () => updatePrefs({ sortKey: 'date', sortDir: 'asc' }) }
  ];

  const sheetProject = sheet && (sheet.kind === 'tags' || sheet.kind === 'transfer') ? projects.find((p) => p.id === sheet.id) : undefined;

  // ─── render ───

  const emptyState = () => {
    if (!loaded) return <div className="empty-state"><span className="spinner" /></div>;
    if (loadError) {
      return (
        <div className="empty-state">
          <Icon name="exclamationmark.triangle" size={36} />
          <div className="empty-title">Couldn’t load projects</div>
          <div className="empty-text">{loadError}</div>
          <button className="btn" onClick={reload}><Icon name="arrow.clockwise" /> Try again</button>
        </div>
      );
    }
    if (query.trim()) {
      return (
        <div className="empty-state">
          <Icon name="magnifyingglass" size={36} />
          <div className="empty-title">No results for “{query.trim()}”</div>
          <button className="btn" onClick={() => setQuery('')}>Clear search</button>
        </div>
      );
    }
    if (view === 'archived') {
      return (
        <div className="empty-state">
          <Icon name="archivebox" size={36} />
          <div className="empty-title">No archived projects</div>
          <div className="empty-text">Archive a project from its ··· menu to tidy it away without deleting anything.</div>
        </div>
      );
    }
    return (
      <div className="empty-state">
        <Icon name="doc.text" size={40} />
        <div className="empty-title">{projects.length ? 'Everything here is archived' : 'No projects yet'}</div>
        <div className="empty-text">Start a new paper, or open a folder that already holds your LaTeX files.</div>
        <div className="empty-actions">
          <button className="btn inverse" onClick={() => setSheet({ kind: 'new', template: '' })}><Icon name="plus" /> New project…</button>
          <button className="btn" onClick={openExisting}><Icon name="folder" /> Open existing folder…</button>
        </div>
      </div>
    );
  };

  return (
    <div className={`app-shell projects-page ${prefs.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {!prefs.sidebarCollapsed && (
        <aside className="app-sidebar">
          <div className="sidebar-top" data-tauri-drag-region>
            <img className="app-icon" src="/app-icon.png" alt="Spectrum" draggable={false} data-tauri-drag-region />
            <button className="icon-btn" title={withShortcut(settings.shortcuts, 'Hide sidebar', 'sidebar')} aria-label="Hide sidebar" onClick={() => updatePrefs({ sidebarCollapsed: true })}>
              <Icon name="sidebar.left" />
            </button>
          </div>

          <nav className="sidebar-scroll">
            <button className={`nav-row ${view === 'all' ? 'active' : ''}`} onClick={() => setView('all')}>
              <Icon name="tray.full" />
              <span className="nav-label">All projects</span>
              <span className="nav-count">{counts.all}</span>
            </button>
            <button className={`nav-row ${view === 'archived' ? 'active' : ''}`} onClick={() => setView('archived')}>
              <Icon name="archivebox" />
              <span className="nav-label">Archived</span>
              <span className="nav-count">{counts.archived}</span>
            </button>

            <button className="sidebar-section-title" aria-expanded={prefs.tagsOpen} onClick={() => updatePrefs({ tagsOpen: !prefs.tagsOpen })}>
              <span>Tags</span>
              <Icon name="chevron.right" className={`disclosure ${prefs.tagsOpen ? 'open' : ''}`} />
            </button>
            {prefs.tagsOpen && (
              <>
                {allTags.map(([tag, count]) => (
                  <button key={tag} className={`nav-row ${activeTag === tag ? 'active' : ''}`} onClick={() => setView(`tag:${tag}`)}>
                    <span className="tag-dot" style={{ background: tagColour(tag) }} />
                    <span className="nav-label">{tag}</span>
                    <span className="nav-count">{count}</span>
                  </button>
                ))}
                {allTags.length === 0 && <div className="sidebar-hint">Tag projects from their ··· menu to group them here.</div>}
              </>
            )}
          </nav>

          <div className="sidebar-bottom">
            <button className="nav-row" onClick={() => setSheet({ kind: 'settings' })} title="Settings (⌘,)">
              <Icon name="gearshape" />
              <span className="nav-label">Settings</span>
            </button>
          </div>
        </aside>
      )}

      <main className="main-panel">
        <header className="panel-header" data-tauri-drag-region>
          {prefs.sidebarCollapsed && (
            <button className="icon-btn" title={withShortcut(settings.shortcuts, 'Show sidebar', 'sidebar')} aria-label="Show sidebar" onClick={() => updatePrefs({ sidebarCollapsed: false })}>
              <Icon name="sidebar.left" />
            </button>
          )}
          <h1 className="panel-title" data-tauri-drag-region>
            {activeTag && <span className="tag-dot large" style={{ background: tagColour(activeTag) }} />}
            {title}
          </h1>
          <div className="panel-header-tools">
            <label className="search-field">
              <Icon name="magnifyingglass" />
              <input
                ref={searchRef}
                value={query}
                placeholder="Search"
                aria-label="Search projects"
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              />
              {query && (
                <button className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
                  <Icon name="xmark.circle.fill" />
                </button>
              )}
            </label>
            <div className="segmented icon-segmented" role="radiogroup" aria-label="View">
              <button
                className={`segment ${prefs.layout === 'list' ? 'active' : ''}`}
                role="radio"
                aria-checked={prefs.layout === 'list'}
                title="List"
                onClick={() => updatePrefs({ layout: 'list' })}
              >
                <Icon name="list.bullet" />
              </button>
              <button
                className={`segment ${prefs.layout === 'grid' ? 'active' : ''}`}
                role="radio"
                aria-checked={prefs.layout === 'grid'}
                title="Grid"
                onClick={() => updatePrefs({ layout: 'grid' })}
              >
                <Icon name="square.grid.2x2" />
              </button>
            </div>
            <MenuButton
              label="Import"
              disabled={busy}
              items={[
                { label: 'Upload a .zip…', icon: 'doc.zipper', onSelect: () => zipInputRef.current?.click() },
                { label: 'From arXiv…', icon: 'graduationcap', onSelect: () => setSheet({ kind: 'arxiv' }) },
                { separator: true },
                { label: 'Open existing folder…', icon: 'folder', onSelect: openExisting }
              ]}
            />
            <MenuButton
              label="New"
              icon="plus"
              className="btn inverse"
              align="end"
              items={[
                { label: 'Blank project…', icon: 'doc.badge.plus', onSelect: () => setSheet({ kind: 'new', template: '' }) },
                { label: 'From template…', icon: 'square.grid.2x2', onSelect: () => setSheet({ kind: 'gallery' }) }
              ]}
            />
          </div>
        </header>

        <div className="panel-body">
          {visible.length === 0 ? (
            emptyState()
          ) : prefs.layout === 'list' ? (
            <div className="project-list" role="table" aria-label={title}>
              <div className="project-row list-header" role="row">
                <span className="col-thumb" />
                <span className="col-name">
                  <button className={`sort-btn ${prefs.sortKey === 'name' ? 'active' : ''}`} onClick={sortByName}>
                    Name
                    <Icon name={prefs.sortKey !== 'name' ? 'chevron.up.chevron.down' : prefs.sortDir === 'asc' ? 'chevron.up' : 'chevron.down'} />
                  </button>
                </span>
                <span className="col-tags" />
                <span className="col-date">
                  <MenuButton label={dateLabel} className={`sort-btn ${prefs.sortKey === 'date' ? 'active' : ''}`} align="end" items={dateMenu} />
                </span>
                <span className="col-actions" />
              </div>
              {visible.map((p) => (
                <div key={p.id} role="row" className={`project-row ${p.missing ? 'missing' : ''}`} {...rowProps(p)}>
                  <span className="col-thumb"><Thumb project={p} /></span>
                  <span className="col-name">
                    <span className="project-name-line">
                      <span className="project-name">{p.name}</span>
                      {p.missing && <span className="badge warning">Folder missing</span>}
                      {p.archived && view !== 'archived' && <span className="badge">Archived</span>}
                    </span>
                    <span className="project-path" title={p.path}>{tildify(p.path)}</span>
                  </span>
                  <span className="col-tags">{tagChips(p)}</span>
                  <span className="col-date" title={formatFull(p[prefs.dateField])}>{timeAgo(p[prefs.dateField])}</span>
                  <span className="col-actions">
                    <MenuButton icon="ellipsis" title="More" align="end" items={menuFor(p)} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="project-grid">
              {visible.map((p) => (
                <div key={p.id} className={`project-card ${p.missing ? 'missing' : ''}`} {...rowProps(p)}>
                  <div className="card-thumb">
                    <Thumb project={p} />
                    {p.missing && <span className="badge warning card-badge">Folder missing</span>}
                    <span className="card-menu">
                      <MenuButton icon="ellipsis" title="More" className="icon-btn small" align="end" items={menuFor(p)} />
                    </span>
                  </div>
                  <div className="card-name" title={p.name}>{p.name}</div>
                  <div className="card-meta" title={formatFull(p[prefs.dateField])}>
                    {dateLabel} {timeAgo(p[prefs.dateField]).replace(/^Just now$/, 'just now')}
                  </div>
                  {p.tags.length > 0 && <div className="card-tags">{tagChips(p)}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <input
        ref={zipInputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleZip(file);
        }}
      />

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={menuFor(ctx.project)} onClose={() => setCtx(null)} />}

      {sheet?.kind === 'new' && (
        <NewProjectSheet
          templates={templates}
          initialTemplate={sheet.template}
          defaultDir={settings.projectsDir || defaultDir}
          onClose={() => setSheet(null)}
          onBrowse={() => setSheet({ kind: 'gallery' })}
          onCreated={(id) => navigate(`/editor/${id}`)}
        />
      )}

      {sheet?.kind === 'gallery' && (
        <TemplateGallerySheet
          templates={templates}
          categories={categories}
          onClose={() => setSheet(null)}
          onPick={(id) => setSheet({ kind: 'new', template: id })}
          onUploaded={reloadTemplates}
        />
      )}

      {sheet?.kind === 'arxiv' && (
        <ArxivSheet parentDir={parentDir} location={settings.projectsDir || defaultDir} onClose={() => setSheet(null)} onImported={(id) => navigate(`/editor/${id}`)} />
      )}

      {sheet?.kind === 'tags' && sheetProject && (
        <TagsSheet
          project={sheetProject}
          allTags={allTags.map(([tag]) => tag)}
          onChange={(tags) => setTags(sheetProject.id, tags)}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'transfer' && sheetProject && (
        <Sheet title={`Change template · ${sheetProject.name}`} width={640} onClose={() => setSheet(null)}>
          <TransferPanel
            projectId={sheetProject.id}
            onJobUpdate={(update) => {
              setJob({ ...update, sourceName: sheetProject.name });
              // 'failed' keeps the new project; 'error' removes it
              if (update.status === 'success' || update.status === 'failed' || update.status === 'error') reload();
            }}
            onSwitched={reload}
            onOpenProject={(id) => navigate(`/editor/${id}`)}
          />
        </Sheet>
      )}

      {sheet?.kind === 'settings' && <SettingsSheet onClose={() => setSheet(null)} />}

      {job && sheet?.kind !== 'transfer' && (
        <div className="transfer-widget" role="status">
          <div className="transfer-widget-header">
            <Icon name="arrow.triangle.2.circlepath" />
            <span className="truncate">Change template · {job.sourceName}</span>
            <button className="icon-btn small" title="Close" aria-label="Close" onClick={() => setJob(null)}><Icon name="xmark" /></button>
          </div>
          <div className={`transfer-status ${job.status}`}>
            {job.status === 'success' ? (
              <Icon name="checkmark.circle.fill" />
            ) : job.status === 'failed' || job.status === 'error' ? (
              <Icon name="xmark.octagon.fill" />
            ) : (
              <span className="spinner" />
            )}
            <span>{transferStatusLabel(job.status)}</span>
          </div>
          {job.error && <div className="field-hint error">{job.error}</div>}
          {job.progressLog.length > 0 && (
            <div className="log-box">
              {job.progressLog.slice(-8).map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
          {(job.status === 'success' || job.status === 'failed') && job.newProjectId && (
            <button className="btn primary small" onClick={() => navigate(`/editor/${job.newProjectId}`)}>Open new project</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── pieces ───

function Thumb({ project }: { project: ProjectMeta }) {
  const src = thumbnailUrl(project);
  // remembers which URL failed, so a newer thumbnail gets another try
  const [failedSrc, setFailedSrc] = useState('');
  if (project.hasThumbnail && !project.missing && failedSrc !== src) {
    return <img className="thumb" src={src} alt="" loading="lazy" draggable={false} onError={() => setFailedSrc(src)} />;
  }
  return (
    <span className="thumb placeholder" aria-hidden="true">
      <i /><i /><i /><i /><i /><i />
    </span>
  );
}

function NewProjectSheet({
  templates,
  initialTemplate,
  defaultDir,
  onClose,
  onBrowse,
  onCreated
}: {
  templates: TemplateMeta[];
  initialTemplate: string;
  defaultDir: string;
  onClose: () => void;
  onBrowse: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState(initialTemplate);
  const [dir, setDir] = useState('');
  const [creating, setCreating] = useState(false);
  const location = dir || defaultDir;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const project = await createProject({ name: trimmed, template: template || undefined, parentDir: location || undefined });
      if (!template) {
        // a blank project still needs something to compile
        const tree = await getProjectTree(project.id);
        if (!tree.items.some((item) => item.type === 'file' && item.path.endsWith('.tex'))) {
          await writeFile(project.id, 'main.tex', blankTex(trimmed));
          await setProjectMainFile(project.id, 'main.tex').catch(() => undefined);
        }
      }
      onCreated(project.id);
    } catch (err) {
      toast(`Couldn’t create the project: ${errorText(err)}`, { tone: 'error' });
      setCreating(false);
    }
  };

  return (
    <Sheet
      title="New project"
      width={520}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!name.trim() || creating} onClick={create}>
            {creating ? <><span className="spinner" /> Creating…</> : 'Create'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="new-project-name">Name</label>
        <input
          id="new-project-name"
          className="input"
          autoFocus
          value={name}
          placeholder="My paper"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && create()}
        />
      </div>
      <div className="field">
        <label id="new-project-template">Template</label>
        <div className="row">
          <Select
            className="grow"
            labelId="new-project-template"
            value={template}
            options={[['', 'Blank'], ...templates.map((t): [string, string] => [t.id, t.label])]}
            onChange={setTemplate}
          />
          <button className="btn" onClick={onBrowse}><Icon name="square.grid.2x2" /> Browse…</button>
        </div>
      </div>
      <div className="field">
        <label id="new-project-location">Location</label>
        <div className="path-row" role="group" aria-labelledby="new-project-location">
          <Icon name="folder" />
          <span className="path-text" title={location}>{location ? tildify(location) : 'Default projects folder'}</span>
          <button
            className="btn small"
            onClick={async () => {
              const picked = await pickFolder({ title: 'Choose where to create the project', defaultPath: location });
              if (picked) setDir(picked);
            }}
          >
            Change…
          </button>
        </div>
        <div className="field-hint">A new folder named after the project is created here.</div>
      </div>
    </Sheet>
  );
}

function TemplateGallerySheet({
  templates,
  categories,
  onClose,
  onPick,
  onUploaded
}: {
  templates: TemplateMeta[];
  categories: TemplateCategory[];
  onClose: () => void;
  onPick: (id: string) => void;
  onUploaded: () => Promise<void>;
}) {
  const [category, setCategory] = useState('all');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter(
      (t) =>
        (category === 'all' || t.category === category) &&
        (!featuredOnly || t.featured) &&
        (!q || [t.label, t.description, ...(t.tags || [])].some((s) => (s || '').toLowerCase().includes(q)))
    );
  }, [templates, category, featuredOnly, search]);

  const upload = async (file: File) => {
    const base = file.name.replace(/\.zip$/i, '');
    setUploading(true);
    try {
      ensureOk(await uploadTemplate(base.toLowerCase().replace(/[^a-z0-9_-]/g, '_'), base, file), 'Upload failed');
      await onUploaded();
      toast(`Added the “${base}” template.`, { tone: 'success' });
    } catch (err) {
      toast(`Couldn’t add the template: ${errorText(err)}`, { tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet title="Choose a template" width={880} className="gallery-sheet" onClose={onClose}>
      <div className="gallery-toolbar">
        <div className="chip-row">
          {[{ id: 'all', label: 'All' }, ...categories.filter((c) => c.id !== 'all')].map((c) => (
            <button key={c.id} className={`chip ${category === c.id ? 'active' : ''}`} onClick={() => setCategory(c.id)}>
              {c.label}
            </button>
          ))}
          <button className={`chip ${featuredOnly ? 'active' : ''}`} onClick={() => setFeaturedOnly(!featuredOnly)} aria-pressed={featuredOnly}>
            <Icon name={featuredOnly ? 'star.fill' : 'star'} /> Featured
          </button>
        </div>
        <div className="row">
          <label className="search-field">
            <Icon name="magnifyingglass" />
            <input value={search} placeholder="Search templates" spellCheck={false} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) upload(file);
            }}
          />
          <button className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <span className="spinner" /> : <Icon name="square.and.arrow.up" />} Upload template…
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="empty-state compact">
          <div className="empty-title">No matching templates</div>
          <div className="empty-text">Try another search or category, or upload a template.</div>
          <div className="empty-actions">
            <button
              className="btn"
              onClick={() => {
                setCategory('all');
                setFeaturedOnly(false);
                setSearch('');
              }}
            >
              Show all
            </button>
          </div>
        </div>
      ) : (
        <div className="template-grid">
          {shown.map((t) => (
            <button key={t.id} className="template-card" onClick={() => onPick(t.id)}>
              <span className="template-paper" aria-hidden="true">
                <span className="paper-title">{t.label.replace(/\s*\(.*\)\s*$/, '')}</span>
                <span className="paper-lines"><i /><i /><i /><i /><i /><i /><i /></span>
                {t.featured && <span className="template-star"><Icon name="star.fill" /></span>}
              </span>
              <span className="template-body">
                <span className="template-title">{t.label}</span>
                {t.description && <span className="template-desc">{t.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function ArxivSheet({
  parentDir,
  location,
  onClose,
  onImported
}: {
  parentDir?: string;
  location: string;
  onClose: () => void;
  onImported: (id: string) => void;
}) {
  const [input, setInput] = useState('');
  const [progress, setProgress] = useState<{ phase: string; percent: number } | null>(null);
  const [error, setError] = useState('');
  const importing = progress !== null;
  const abortRef = useRef<AbortController | null>(null);

  // closing the sheet (Cancel, Escape, ×, backdrop) cancels a running import
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    const id = input.trim();
    if (!id || importing) return;
    setError('');
    setProgress({ phase: 'download', percent: -1 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await importArxivSSE({ arxivIdOrUrl: id, parentDir }, (p) => setProgress(p), controller.signal);
      if (!res.ok || !res.project) throw new Error(res.error || 'Import failed');
      onImported(res.project.id);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(errorText(err));
      setProgress(null);
    }
  };

  const label = !progress
    ? ''
    : progress.phase === 'download'
      ? progress.percent >= 0
        ? `Downloading… ${progress.percent}%`
        : 'Downloading…'
      : 'Extracting…';

  return (
    <Sheet
      title="Import from arXiv"
      width={520}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{importing ? 'Cancel import' : 'Cancel'}</button>
          <button className="btn primary" disabled={!input.trim() || importing} onClick={start}>Import</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="arxiv-input">arXiv ID or link</label>
        <input
          id="arxiv-input"
          className="input"
          autoFocus
          value={input}
          placeholder="e.g. 1706.03762 or https://arxiv.org/abs/1706.03762"
          spellCheck={false}
          disabled={importing}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && start()}
        />
        <div className="field-hint">The LaTeX source is downloaded into a new project{location ? ` in ${tildify(location)}` : ''}.</div>
      </div>
      {progress && (
        <div className="field">
          <div className="progress-label">{label}</div>
          <div className={`progress ${progress.percent < 0 ? 'indeterminate' : ''}`}>
            <div style={{ width: progress.percent >= 0 ? `${progress.percent}%` : undefined }} />
          </div>
        </div>
      )}
      {error && <div className="field-hint error">{error}</div>}
    </Sheet>
  );
}

function TagsSheet({
  project,
  allTags,
  onChange,
  onClose
}: {
  project: ProjectMeta;
  allTags: string[];
  onChange: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const add = (raw: string) => {
    const tag = raw.trim();
    setInput('');
    if (tag && !project.tags.includes(tag)) onChange([...project.tags, tag]);
  };
  const suggestions = allTags.filter((tag) => !project.tags.includes(tag));

  return (
    <Sheet title={`Tags · ${project.name}`} width={460} onClose={onClose} actions={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="chip-row">
        {project.tags.length === 0 && <span className="field-hint">No tags yet.</span>}
        {project.tags.map((tag) => (
          <span key={tag} className="chip tag-chip">
            <span className="tag-dot" style={{ background: tagColour(tag) }} />
            {tag}
            <button className="chip-remove" aria-label={`Remove ${tag}`} onClick={() => onChange(project.tags.filter((t) => t !== tag))}>
              <Icon name="xmark" />
            </button>
          </span>
        ))}
      </div>
      <div className="row">
        <input
          className="input grow"
          autoFocus
          value={input}
          placeholder="New tag"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add(input);
            }
          }}
        />
        <button className="btn" disabled={!input.trim()} onClick={() => add(input)}>Add</button>
      </div>
      {suggestions.length > 0 && (
        <div className="field">
          <label id="existing-tags">Existing tags</label>
          <div className="chip-row" role="group" aria-labelledby="existing-tags">
            {suggestions.map((tag) => (
              <button key={tag} className="chip tag-chip" onClick={() => add(tag)}>
                <span className="tag-dot" style={{ background: tagColour(tag) }} />
                {tag}
                <Icon name="plus" />
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
