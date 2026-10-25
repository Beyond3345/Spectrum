import { createContext, useContext } from 'react';
import type { CompileOptions, LLMConfig, TexlabDiagnostic, VersionMeta, VersionReason } from '../api/client';
import type { AppSettings } from '../app/settings';

export interface PendingChange {
  filePath: string;
  original: string;
  proposed: string;
  source?: string;
}

export interface CompileError {
  severity: 'error' | 'warning';
  message: string;
  line?: number;
  file?: string;
  raw?: string;
}

/** Everything the editor page shares with the composer, the sidebar's panels and Tools. */
export interface EditorApi {
  projectId: string;
  projectName: string;
  projectPath: string;
  activePath: string;
  mainFile: string;
  texFiles: string[];
  bibFiles: string[];
  figureFiles: string[];
  /** every file in the tree */
  projectFiles: string[];
  selectionText: string;
  selectionRange: [number, number];
  editorValue: string;
  compileLog: string;
  compileErrors: CompileError[];
  /** the document compiled last, whose log compileLog is, and whether that compile made no PDF */
  compiledDoc: string;
  compileFailed: boolean;
  /** why the last compile stopped before an engine ran (PANDOC_MISSING, PANDOC_OLD, TYPST_VERSION_MISSING), for Logs’ buttons */
  compileNotice: { code?: string; version?: string } | null;
  /** what a Markdown compile generated for its last run, for Logs’ Show generated button */
  compileGenerated: 'latex' | 'typst' | null;
  /** a project compile choice (null: back to the app’s default), saved before it resolves */
  setCompileOption: <K extends keyof CompileOptions>(key: K, value: CompileOptions[K] | null) => Promise<void>;
  pdfPages: number | null;
  settings: AppSettings;
  llm: { main: Partial<LLMConfig>; search: Partial<LLMConfig>; vision: Partial<LLMConfig>; quick: Partial<LLMConfig> };
  notify(message: string, tone?: 'info' | 'success' | 'error'): void;
  /**
   * block: put the text on its own lines. afterSelection: insert after the selection instead of replacing it (used for \cite).
   * focus: move focus to the editor (default true). placedOnly: insert only where the user has put the cursor, inside the
   * document body (for automatic inserts). Returns the line the text went in, or null when nothing was inserted.
   */
  insertAtCursor(text: string, opts?: { block?: boolean; afterSelection?: boolean; focus?: boolean; placedOnly?: boolean }): number | null;
  /** inserts into the open file (or replaces from–to) through the editor, so it can be undone and the cursor moves along */
  editOpenFile(change: { from: number; to?: number; insert: string }): void;
  ensureFileContent(path: string): Promise<string>;
  /** writes + updates cache + editor if open */
  writeProjectFile(path: string, content: string): Promise<void>;
  createBibFile(): Promise<string>;
  refreshTree(): Promise<void>;
  /** after restore: drop caches, reload tree + open file */
  reloadProject(): Promise<void>;
  /** re-read files changed on disk by the backend (e.g. .bib after references add) */
  reloadFiles(paths: string[]): Promise<void>;
  openFile(path: string): Promise<void>;
  jumpTo(file: string, line: number): Promise<void>;
  /** a page of doc's PDF, which takes the open panel's place */
  showPdfPage(doc: string, page: number): void;
  /** where a source line went in doc's PDF (SyncTeX), shown in the open panel's place */
  showLineInPdf(doc: string, file: string, line: number): Promise<void>;
  /** queue for review (replaces same-path entries); open: also show the review sheet */
  proposeChanges(changes: PendingChange[], opts?: { open?: boolean }): void;
  /**
   * Writes reviewed changes after a "Before AI changes" checkpoint. stale: those whose file changed since in a way
   * they can't be merged with, as they would now replace it; they aren't written.
   */
  applyChanges(changes: PendingChange[]): Promise<{ applied: PendingChange[]; stale: PendingChange[]; checkpoint: VersionMeta | null }>;
  /** doc, or the document compiled last; says how it ended ('busy': another compile was running) */
  compile(doc?: string): Promise<'idle' | 'running' | 'ok' | 'failed' | 'stopped' | 'busy'>;
  /** saves the open file */
  save(): Promise<void>;
  /**
   * doc's PDF from its last compile when that couldn't write over the copy on disk, which another program holds
   * (Windows), and when that compile started; null when the copy on disk is the last compile's
   */
  keptPdf(doc: string): { blob: Blob; at: number } | null;
  /** TexLab's diagnostics by project file, once it has the open file's latest text; available is false without TexLab */
  diagnostics(): Promise<{ available: boolean; files: Record<string, TexlabDiagnostic[]> }>;
  prepareAgent(): Promise<void>;
  /** saves the open file first; silent (callers report the outcome). unchanged: nothing new, `version` is the latest one */
  createVersion(reason: VersionReason, label?: string): Promise<{ version: VersionMeta | null; unchanged: boolean }>;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error('useEditor() needs an <EditorContext.Provider>');
  return api;
}
