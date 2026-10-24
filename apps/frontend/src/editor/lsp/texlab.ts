import { Compartment, Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { LSPClient, LSPPlugin, Workspace, hoverTooltips, jumpToDefinition, serverDiagnostics } from '@codemirror/lsp-client';
import type { WorkspaceFile } from '@codemirror/lsp-client';
import type * as lsp from 'vscode-languageserver-protocol';
import { getDiagnostics } from '../../api/client';
import { IS_MAC, IS_WINDOWS } from '../../app/platform';
import type { TexlabSymbol } from './outline';
import { lspTransport } from './transport';

// The editor's side of the project's TexLab (the backend's lsp route): squiggles, hovers, Go to definition (F12 or
// ⌘/Ctrl-click) and Find references (⇧F12) in the open file, and the requests behind F2's rename, the outline and the
// syntax check. TexLab's completion is left out, so Spectrum's own stays. Without TexLab nothing here shows.

/** What the editor does for TexLab: show a project file (the view, once it shows it), read one, list references, rename. */
export type TexlabHost = {
  open: (path: string) => Promise<EditorView | null>;
  read: (path: string) => Promise<string>;
  showReferences: (references: Reference[]) => void;
  rename: () => void;
};

/** A place a label, citation key or command is used: line and column from 1, and that line's text. */
export type Reference = { path: string; line: number; col: number; text: string };

/** The open file's TexLab extensions go here: none without TexLab, or for a file it doesn't read. */
export const texlabSlot = new Compartment();

const languageOf = (path: string) => (/\.bib$/i.test(path) ? 'bibtex' : /\.(tex|ltx|sty|cls|dtx)$/i.test(path) ? 'latex' : null);

/**
 * Hovers as plain text only: the bridge asks TexLab for plain text, which comes here escaped with line breaks, and a
 * citation's hover quotes the .bib, which could hold HTML. Anything else is shown as the text it holds.
 */
function plainOnly(html: string) {
  if (/^(?:[^<]|<br>)*$/.test(html)) return html;
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  return text.replace(/[\n<&]/g, (ch) => (ch === '\n' ? '<br>' : ch === '<' ? '&lt;' : '&amp;'));
}

class ProjectFile implements WorkspaceFile {
  constructor(
    public uri: string,
    public languageId: string,
    public version: number,
    public doc: WorkspaceFile['doc'],
    public view: EditorView
  ) {}
  getView() {
    return this.view;
  }
}

/** The files open in the editor, by URI as TexLab gives it or as Spectrum made it; jumps to another file open it there. */
class ProjectWorkspace extends Workspace {
  files: ProjectFile[] = [];
  private versions = new Map<string, number>();
  constructor(
    client: LSPClient,
    private texlab: Texlab
  ) {
    super(client);
  }
  private nextVersion(uri: string) {
    const version = (this.versions.get(uri) ?? -1) + 1;
    this.versions.set(uri, version);
    return version;
  }
  getFile(uri: string) {
    const path = this.texlab.pathOf(uri);
    return this.files.find((f) => f.uri === uri || (path !== null && this.texlab.pathOf(f.uri) === path)) ?? null;
  }
  syncFiles() {
    const updates: ReturnType<Workspace['syncFiles']>[number][] = [];
    for (const file of this.files) {
      const plugin = LSPPlugin.get(file.view);
      if (!plugin || plugin.unsyncedChanges.empty) continue;
      updates.push({ file, prevDoc: file.doc, changes: plugin.unsyncedChanges });
      file.doc = file.view.state.doc;
      file.version = this.nextVersion(file.uri);
      plugin.clear();
    }
    return updates;
  }
  openFile(uri: string, languageId: string, view: EditorView) {
    const known = this.getFile(uri);
    if (known) {
      known.view = view;
      return;
    }
    const file = new ProjectFile(uri, languageId, this.nextVersion(uri), view.state.doc, view);
    this.files.push(file);
    this.client.didOpen(file);
  }
  closeFile(uri: string, view: EditorView) {
    const file = this.getFile(uri);
    if (!file || file.view !== view) return;
    this.files = this.files.filter((f) => f !== file);
    this.client.didClose(file.uri);
  }
  async displayFile(uri: string) {
    const path = this.texlab.pathOf(uri);
    return path === null ? null : this.texlab.host.open(path);
  }
}

/**
 * One project's line to its TexLab, from the editor's first look until close(). The backend's event stream says
 * hello with this editor's id and the project's root; when TexLab stops, the stream ends and EventSource connects again
 * (to a new TexLab), and a 503 (no TexLab) ends it for good. onAvailable hears each change.
 */
export class Texlab {
  readonly client: LSPClient;
  available = false;
  private rootUri = '';
  private connection: ReturnType<typeof lspTransport> | null = null;
  private events: EventSource;
  private extensions = new Map<string, Extension>();

  constructor(
    private projectId: string,
    readonly host: TexlabHost,
    private onAvailable: (available: boolean) => void
  ) {
    this.client = new LSPClient({
      // TexLab's first answers can wait for it to read the project
      timeout: 15_000,
      workspace: (client) => new ProjectWorkspace(client, this),
      sanitizeHTML: plainOnly,
      extensions: [serverDiagnostics(), hoverTooltips(), this.keys()]
    });
    this.events = new EventSource(`/api/projects/${projectId}/lsp`);
    this.events.addEventListener('hello', (e) => this.hello(JSON.parse((e as MessageEvent<string>).data)));
    this.events.onmessage = (e) => this.connection?.receive(e.data);
    this.events.onerror = () => this.lost();
  }

  private hello({ client, rootUri }: { client: string; rootUri: string }) {
    this.lost();
    const connection = lspTransport((body) =>
      fetch(`/api/projects/${this.projectId}/lsp?client=${encodeURIComponent(client)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).then((res) => {
        if (!res.ok) throw new Error(`TexLab’s line answered ${res.status}.`);
      })
    );
    this.connection = connection;
    this.rootUri = rootUri.replace(/\/$/, '');
    this.client.connect(connection.transport);
    this.client.initializing.then(
      () => this.connection === connection && this.setAvailable(true),
      () => undefined
    );
  }

  private lost() {
    if (!this.connection) return;
    this.connection.close();
    this.connection = null;
    this.client.disconnect();
    this.setAvailable(false);
  }

  private setAvailable(available: boolean) {
    if (available === this.available) return;
    this.available = available;
    this.onAvailable(available);
  }

  close() {
    this.events.close();
    this.lost();
  }

  /** A project path's URI, encoded by the URL rules TexLab's own URIs follow, so a file TexLab finds is the same file. */
  uriOf(path: string) {
    return new URL(`${this.rootUri}/${path.replace(/[%#?]/g, encodeURIComponent)}`).href;
  }

  /** A URI's project path, '/'-separated; null for one outside the project. */
  pathOf(uri: string) {
    const decode = (text: string) => {
      try {
        return decodeURIComponent(text);
      } catch {
        return text;
      }
    };
    const root = decode(this.rootUri);
    const full = decode(uri);
    const fold = (text: string) => (IS_WINDOWS ? text.toLowerCase() : text);
    if (!this.rootUri || !fold(full).startsWith(`${fold(root)}/`)) return null;
    return full.slice(root.length + 1) || null;
  }

  /** The extensions for a file the editor shows, the same object each time for the same file (none without TexLab). */
  extensionFor(path: string): Extension {
    const languageId = this.available && path ? languageOf(path) : null;
    if (!languageId) return [];
    const uri = this.uriOf(path);
    let extension = this.extensions.get(uri);
    if (!extension) {
      extension = this.client.plugin(uri, languageId);
      this.extensions.set(uri, extension);
    }
    return extension;
  }

  private keys() {
    const definitionAt = EditorView.domEventHandlers({
      mousedown: (e, view) => {
        if (e.button !== 0 || !(IS_MAC ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos == null) return false;
        e.preventDefault();
        view.dispatch({ selection: { anchor: pos }, userEvent: 'select.pointer' });
        jumpToDefinition(view);
        return true;
      }
    });
    return [
      definitionAt,
      Prec.high(
        keymap.of([
          { key: 'F12', run: jumpToDefinition, preventDefault: true },
          { key: 'Shift-F12', run: (view) => this.findReferences(view), preventDefault: true },
          { key: 'F2', run: () => (this.host.rename(), true), preventDefault: true }
        ])
      )
    ];
  }

  /** ⇧F12: where the label, citation key or command at the cursor is used, for the editor to list. */
  private findReferences(view: EditorView) {
    const plugin = LSPPlugin.get(view);
    if (!plugin) return false;
    plugin.client.sync();
    const params = { textDocument: { uri: plugin.uri }, position: plugin.toPosition(view.state.selection.main.head), context: { includeDeclaration: true } };
    plugin.client.request<lsp.ReferenceParams, lsp.Location[] | null>('textDocument/references', params).then(
      async (locations) => {
        const lines = new Map<string, string[]>();
        const found: Reference[] = [];
        for (const { uri, range } of locations ?? []) {
          const path = this.pathOf(uri);
          if (path === null) continue;
          if (!lines.has(path)) lines.set(path, (await this.host.read(path).catch(() => '')).split('\n'));
          found.push({ path, line: range.start.line + 1, col: range.start.character + 1, text: (lines.get(path)?.[range.start.line] ?? '').trim() });
        }
        this.host.showReferences(found);
      },
      (err) => plugin.reportError('Couldn’t find the references', err)
    );
    return true;
  }

  private ready() {
    if (!this.available) throw new Error('TexLab isn’t running.');
    this.client.sync();
  }

  /**
   * What F2 would rename at pos (a label, citation key or command), as the text shows it, and whether it's a command's
   * name (TexLab's range leaves its backslash out); null when there's nothing.
   */
  async renameTarget(view: EditorView, pos: number) {
    const plugin = LSPPlugin.get(view);
    if (!plugin) return null;
    this.ready();
    const found = await this.client.request<lsp.PrepareRenameParams, lsp.PrepareRenameResult | null>('textDocument/prepareRename', {
      textDocument: { uri: plugin.uri },
      position: plugin.toPosition(pos)
    });
    if (!found) return null;
    const { placeholder, range = found as lsp.Range } = found as { placeholder?: string; range?: lsp.Range };
    // { defaultBehavior }: left to the editor, which has nothing to go on
    if (!range.start) return null;
    const from = plugin.fromPosition(range.start);
    const text = placeholder ?? view.state.sliceDoc(from, plugin.fromPosition(range.end));
    return { text, command: from > 0 && view.state.sliceDoc(from - 1, from) === '\\' };
  }

  /** TexLab's edits for renaming what's at pos. */
  async renameEdits(view: EditorView, pos: number, newName: string) {
    const plugin = LSPPlugin.get(view);
    if (!plugin) return null;
    this.ready();
    return this.client.request<lsp.RenameParams, lsp.WorkspaceEdit | null>('textDocument/rename', { textDocument: { uri: plugin.uri }, position: plugin.toPosition(pos), newName });
  }

  /** TexLab's LaTeX symbols across the project (the query matches every one's "latex" tag, which leaves out .bib entries). */
  async symbols(): Promise<TexlabSymbol[]> {
    this.ready();
    const found = await this.client.request<lsp.WorkspaceSymbolParams, lsp.SymbolInformation[] | null>('workspace/symbol', { query: 'latex' });
    return (found ?? []).flatMap(({ name, kind, location }) => {
      const path = this.pathOf(location.uri);
      return path === null ? [] : [{ path, line: location.range.start.line, character: location.range.start.character, name, kind }];
    });
  }

  /** TexLab's latest diagnostics for the project, once it has the open file's latest text. */
  async diagnostics() {
    this.ready();
    await this.connection?.settled();
    return getDiagnostics(this.projectId);
  }
}
