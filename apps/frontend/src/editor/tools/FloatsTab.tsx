import { useEffect, useId, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent, KeyboardEvent } from 'react';
import { blobUrl, getFile, getProjectSettings, getProjectTree, plotFromTable, uploadFiles, visionToLatex, writeFile } from '../../api/client';
import Choice from '../../app/Segmented';
import Icon from '../../app/Icon';
import { effectiveCompile, loadSettings } from '../../app/settings';
import Select from '../../app/Select';
import Sheet from '../../app/Sheet';
import { openDiagram } from '../../app/desktop';
import { IS_WINDOWS } from '../../app/platform';
import { forPhysics } from '../../diagram/fileFormat';
import { clashesWith } from '../../diagram/sets';
import type { Clash } from '../../diagram/sets';
import type { DiagramLanguage } from '../../diagram/types';
import { useEditor } from '../EditorContext';
import type { EditorApi } from '../EditorContext';
import { VISION_HINTS, VISION_MODES, docKind, errorText, figureSnippet, isDocument } from '../shared';
import type { VisionMode } from '../shared';
import { PLACEMENT_LETTERS, blockAt, defaultAlign, diagramImageLatex, diagramLatex, extOf, figureKind, figureLabel, figureLatex, figureMarkdown, figureSetLabel, figureSetLatex, figureSetPackages, figureSetTypst, figureTypst, figureTypstInclude, fitMerges, fitPartRules, jpegOrientation, mergeAt, parseDelimited, pasteCells, placementOf, safeFileName, tableEdges, tableLabel, tableLatex, tableMarkdown, tablePackages, tableRules, tableTypst, uniqueName, withMerge } from '../floats';
import type { FigureSet, FigureSize, TableEnv, TableLines, TableMerge, TableModel, TablePartRule } from '../floats';
import { addLibraries, addPackages, changeBetween, loadedLibraries, projectPackages } from '../preamble';

const IMAGE_EXTS = /\.(png|jpe?g|gif|svg|webp)$/i;

/** The cards for one kind of float; the others stay mounted but hidden, so what was typed in them stays. */
export default function FloatsTab({ show }: { show: 'figure' | 'table' | 'diagram' }) {
  return (
    <div className="tool-page">
      <div className="float-group" hidden={show !== 'figure'}>
        <InsertFigure />
        <ProjectFigures />
        <ImageToLatex />
      </div>
      <div className="float-group" hidden={show !== 'diagram'}>
        <InsertDiagram />
      </div>
      <div className="float-group" hidden={show !== 'table'}>
        <InsertTable />
        <TableToChart />
      </div>
    </div>
  );
}

// ─── handing an image to Insert figure ───

/** a dropped or pasted file to save in figures/, or the path of a figure already in the project */
type Handed = File | string;
let handed: Handed | null = null;
const handedEvents = new EventTarget();

/** Loads an image into the Insert figure card, which takes it now, or when it mounts if the tab hasn't been opened yet. */
export function showFigure(item: Handed) {
  handed = item;
  handedEvents.dispatchEvent(new Event('figure'));
}

/** The first file a drop or paste carries that Insert figure can use. */
export function figureFile(data: DataTransfer | null) {
  const files = [...Array.from(data?.files || []), ...Array.from(data?.items || []).map((item) => (item.kind === 'file' ? item.getAsFile() : null))];
  return files.find((file): file is File => !!file && !!figureKind(file.name, file.type));
}

/** What the diagram composer's Insert as figure sends (EditorPage passes it on): the diagram's file and what its picture needs. */
export type HandedDiagram = { path: string; language: DiagramLanguage; packages: string[]; libraries: string[] };
let handedDiagram: HandedDiagram | null = null;

/** Loads a diagram into the Insert diagram card, as showFigure does an image. */
export function showDiagram(diagram: HandedDiagram) {
  handedDiagram = diagram;
  handedEvents.dispatchEvent(new Event('diagram'));
}

// ─── shared by Insert figure and Insert table ───

/**
 * Placement letters as toggles that combine (h, t, b, p and !), or H on its own, each explained in its
 * tooltip and in the key underneath. Span both columns makes it figure* or table*, which only takes t, p and !.
 */
function PlacementField({ value, onChange, span, onSpan, kind }: { value: string; onChange: (value: string) => void; span: boolean; onSpan: (span: boolean) => void; kind: 'figure' | 'table' }) {
  const id = useId();
  const letters = value === 'H' ? '' : value;
  const toggle = (letter: string) =>
    onChange(letter === 'H' ? (value === 'H' ? '' : 'H') : placementOf(letters.includes(letter) ? letters.replace(letter, '') : letters + letter));
  const usable = (letter: string) => !span || '!tp'.includes(letter);
  return (
    <div className="field">
      <span className="field-label" id={id}>
        Placement
      </span>
      <div className="segmented small placement-toggles" role="group" aria-labelledby={id}>
        {PLACEMENT_LETTERS.map(([letter, name, meaning]) => {
          const on = usable(letter) && (letter === 'H' ? value === 'H' : letters.includes(letter));
          return (
            <button
              key={letter}
              type="button"
              aria-pressed={on}
              aria-label={`${name} (${letter})`}
              title={`${letter}: ${meaning}`}
              className={`segment ${on ? 'active' : ''}`}
              disabled={!usable(letter)}
              onClick={() => toggle(letter)}
            >
              {letter}
            </button>
          );
        })}
      </div>
      <dl className="placement-key">
        {PLACEMENT_LETTERS.map(([letter, , meaning]) => (
          <div key={letter}>
            <dt>{letter}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
      <div className="field-hint">
        With no letter chosen, LaTeX uses tbp. The letters allow places rather than order them, so [ht] means here or else the top of a page.
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={span} onChange={(e) => onSpan(e.target.checked)} />
        <span>
          Span both columns
          <span className="field-hint">
            For two-column papers: {kind}* runs across both columns and only goes at the top of a page or on a page of floats, so H, h and b don’t apply.
          </span>
        </span>
      </label>
    </div>
  );
}

/** value null lights no segment */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T | null; options: [T, string, string?][]; onChange: (value: T) => void }) {
  const id = useId();
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {label}
      </span>
      <Choice labelledBy={id} value={value} options={options} onChange={onChange} />
    </div>
  );
}

/** "\usepackage{a}, \usepackage{b} and \usetikzlibrary{c}" */
const listed = (lines: string[]) => (lines.length < 2 ? lines.join('') : `${lines.slice(0, -1).join(', ')} and ${lines[lines.length - 1]}`);
const usepackage = (name: string) => `\\usepackage{${name}}`;
const usetikzlibrary = (names: string[]) => (names.length ? [`\\usetikzlibrary{${names.join(',')}}`] : []);

/**
 * Adds the packages a snippet needs to the main file, unless it or a file it \input's loads them already: first ones
 * straight after \documentclass, then the rest, then the TikZ libraries. Returns what to tell the user ('' when nothing
 * changed), and warn when the user has to add them.
 */
async function ensurePackages(latest: () => EditorApi, wanted: string[], { first = [], libraries = [] }: { first?: string[]; libraries?: string[] } = {}): Promise<{ text: string; warn?: boolean }> {
  const { mainFile, projectId, texFiles } = latest();
  if (!mainFile || !(wanted.length || first.length || libraries.length)) return { text: '' };
  // the open file as it is in the editor; the rest from disk, so they don't fill the editor's cache
  const read = async (path: string) => {
    const api = latest();
    return path === api.activePath ? api.editorValue : (await getFile(projectId, path)).content;
  };
  try {
    const files = new Set(texFiles);
    const loaded = await projectPackages(mainFile, files, read);
    const loadedLibs = libraries.length ? await projectPackages(mainFile, files, read, loadedLibraries) : new Set<string>();
    const missingFirst = first.filter((name) => !loaded.has(name));
    const missing = wanted.filter((name) => !loaded.has(name));
    const missingLibs = libraries.filter((name) => !loadedLibs.has(name));
    if (!(missingFirst.length || missing.length || missingLibs.length)) return { text: '' };
    const api = latest();
    const open = api.activePath === mainFile;
    const before = open ? api.editorValue : await read(mainFile);
    const early = addPackages(before, missingFirst, { first: true });
    const packed = addPackages(early.source, missing);
    const libbed = addLibraries(packed.source, missingLibs);
    if (early.noDocument || packed.noDocument || libbed.noDocument) {
      const lines = [...missingFirst, ...missing].map(usepackage).concat(usetikzlibrary(missingLibs));
      return { text: `${mainFile} has no \\begin{document}, so add ${listed(lines)} yourself.`, warn: true };
    }
    const added = [...early.added, ...packed.added].map(usepackage).concat(usetikzlibrary(libbed.added));
    if (!added.length) return { text: '' };
    // the open file changes through the editor, in one change, so one undo takes it back
    if (open) api.editOpenFile(changeBetween(before, libbed.source));
    else await api.writeProjectFile(mainFile, libbed.source);
    return { text: `Added ${listed(added)} to ${mainFile}.` };
  } catch (err) {
    return { text: `Couldn’t check the packages in ${mainFile}: ${errorText(err)}`, warn: true };
  }
}

/** Puts a block at the cursor on lines of its own, at the indent of the cursor's line. */
function insertBlock(api: EditorApi, text: string) {
  const [from, to] = api.selectionRange;
  return api.insertAtCursor(blockAt(api.editorValue, from, to, text));
}

const NOT_TEX = 'Open a document in the editor to insert into it.';

// ─── Insert figure ───

const ACCEPT = '.png,.jpg,.jpeg,.pdf,.eps,.gif,.webp,.heic,.heif,.bmp,.tif,.tiff,.svg,image/*';

type FigureSource = { kind: 'file'; blob: Blob; ext: string; url: string; note: string } | { kind: 'project'; path: string };

type WidthChoice = '1' | '0.75' | '0.5' | '0.33' | 'custom';
const WIDTHS: [WidthChoice, string, string?][] = [
  ['1', 'Full', 'Full width'],
  ['0.75', '¾', 'Three quarters'],
  ['0.5', 'Half'],
  ['0.33', 'Third'],
  ['custom', 'Custom']
];

type Layout = 'single' | 'row' | 'grid';
type SizeMode = FigureSize['mode'];
type FigurePrefs = {
  width: WidthChoice;
  custom: number;
  placement: string;
  span: boolean;
  layout: Layout;
  columns: number;
  labels: FigureSet['labels'];
  align: FigureSet['align'];
  sizeMode: SizeMode;
  /** each image's share of its panel, in a row or grid */
  panelShare: WidthChoice;
  sizeW: number;
  sizeH: number;
  scale: number;
  crop: boolean;
  trim: [number, number, number, number];
};
const PREFS_KEY = 'spectrum-figure-options';
const DEFAULT_PREFS: FigurePrefs = {
  width: '0.75',
  custom: 60,
  placement: 'H',
  span: false,
  layout: 'single',
  columns: 2,
  labels: 'sub',
  align: 'bottom',
  sizeMode: 'line',
  panelShare: '1',
  sizeW: 80,
  sizeH: 60,
  scale: 0.5,
  crop: false,
  trim: [0, 0, 0, 0]
};

const LAYOUTS: [Layout, string, string?][] = [
  ['single', 'Single', 'One image'],
  ['row', 'Side by side', 'Side by side in one row'],
  ['grid', 'Grid']
];
const LABELLING: [FigureSet['labels'], string, string?][] = [
  ['sub', '(a), (b)', 'Sub-figures (a), (b) under one caption'],
  ['separate', 'Separate', 'A figure each, with its own number'],
  ['none', 'One caption', 'One caption, no sub-labels']
];
const ALIGNS: [FigureSet['align'], string, string?][] = [
  ['top', 'Tops'],
  ['centre', 'Centres'],
  ['bottom', 'Bottoms']
];
const SIZE_MODES: [SizeMode, string, string?][] = [
  ['line', 'Share', 'A share of the line'],
  ['width', 'Width'],
  ['height', 'Height'],
  ['box', 'Fit in box', 'Fit in a box'],
  ['scale', 'Scale']
];

function loadPrefs(): FigurePrefs {
  try {
    const saved = { ...DEFAULT_PREFS, ...JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') };
    const one = <T,>(value: T, options: [T, ...unknown[]][]) => options.some(([o]) => o === value);
    const valid =
      one(saved.width, WIDTHS) &&
      one(saved.panelShare, WIDTHS) &&
      one(saved.layout, LAYOUTS) &&
      one(saved.labels, LABELLING) &&
      one(saved.align, ALIGNS) &&
      one(saved.sizeMode, SIZE_MODES) &&
      typeof saved.placement === 'string' &&
      placementOf(saved.placement) === saved.placement &&
      typeof saved.span === 'boolean' &&
      typeof saved.crop === 'boolean' &&
      [saved.custom, saved.columns, saved.sizeW, saved.sizeH, saved.scale].every((n) => typeof n === 'number') &&
      Array.isArray(saved.trim) &&
      saved.trim.length === 4 &&
      saved.trim.every((n: unknown) => typeof n === 'number');
    return valid ? saved : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

const shareOf = (choice: WidthChoice, custom: number) => (choice === 'custom' ? Math.min(100, Math.max(1, custom || DEFAULT_PREFS.custom)) / 100 : Number(choice));
const widthOf = (prefs: FigurePrefs) => shareOf(prefs.width, prefs.custom);

/**
 * Draws an image LaTeX can't read (GIF, WebP, HEIC, BMP, TIFF, SVG), or a turned JPEG upright, into a PNG or
 * JPEG. Throws when the browser can't decode it.
 */
async function drawAs(file: File, type: 'image/png' | 'image/jpeg') {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { naturalWidth: w, naturalHeight: h } = img;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!w || !h || !context) throw new Error('The image has no size.');
    // vector art is drawn big enough to stay sharp in print
    const scale = extOf(file.name) === 'svg' || file.type === 'image/svg+xml' ? Math.max(1, 2400 / Math.max(w, h)) : 1;
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image.'))), type, 0.92));
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Panel = { key: number; source: FigureSource; name: string; caption: string; /** null: follows the file name */ label: string | null };
let panelKeys = 0;

const panelPath = (panel: Panel) => (panel.source.kind === 'project' ? panel.source.path : `figures/${safeFileName(panel.name, panel.source.ext)}`);
const panelPreview = (projectId: string, panel: Panel) =>
  panel.source.kind === 'file' ? panel.source.url : IMAGE_EXTS.test(panel.source.path) ? blobUrl(projectId, panel.source.path) : '';
const forget = (panel: Panel) => panel.source.kind === 'file' && panel.source.url && URL.revokeObjectURL(panel.source.url);

/** A number field with its unit; empty or out of range falls back to min when it loses focus. */
function NumberField({ id, label, unit, value, min, max, step = 1, onChange }: { id: string; label: string; unit: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <div className="figure-custom-width">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input number"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value || ''}
        onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
        onBlur={() => value < min && onChange(min)}
      />
      <span>{unit}</span>
    </div>
  );
}

function InsertFigure() {
  const api = useEditor();
  const apiRef = useRef(api);
  apiRef.current = api;
  const id = useId();
  const [panels, setPanels] = useState<Panel[]>([]);
  const [caption, setCaption] = useState('');
  /** null: follows the file name, or the caption for several images */
  const [label, setLabel] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'reading' | 'inserting'>('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const docOpen = isDocument(api.activePath);
  const kind = docKind(api.activePath);
  // Markdown takes one image a figure
  const layout: Layout = kind === 'markdown' ? 'single' : prefs.layout;
  const several = layout !== 'single';
  const first = panels[0];
  const set = (change: Partial<FigurePrefs>) => setPrefs((prev) => ({ ...prev, ...change }));
  const setPanel = (key: number, change: Partial<Panel>) => setPanels((prev) => prev.map((p) => (p.key === key ? { ...p, ...change } : p)));
  const size: FigureSize = {
    mode: prefs.sizeMode,
    fraction: several ? shareOf(prefs.panelShare, prefs.custom) : widthOf(prefs),
    width: prefs.sizeW,
    height: prefs.sizeH,
    scale: prefs.scale,
    trim: prefs.crop ? prefs.trim : null
  };
  const mainLabel = label ?? (several ? figureSetLabel(caption, first ? panelPath(first) : '') : first ? figureLabel(panelPath(first)) : '');

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // storage unavailable: the choices just aren't remembered
    }
  }, [prefs]);

  // the previews' object URLs go with the card
  useEffect(() => () => panelsRef.current.forEach(forget), []);

  // a new image asks for its caption
  const count = panels.length;
  useEffect(() => {
    if (!count) return;
    cardRef.current?.scrollIntoView({ block: 'nearest' });
    if (count === 1) captionRef.current?.focus({ preventScroll: true });
  }, [count]);

  const add = (source: FigureSource, name = '') => {
    const panel: Panel = { key: (panelKeys += 1), source, name, caption: '', label: null };
    setPanels((prev) => {
      if (several) return [...prev, panel];
      prev.forEach(forget);
      return [panel];
    });
    if (!several) setLabel(null);
  };

  const load = async (item: Handed): Promise<void> => {
    setError('');
    if (typeof item === 'string') {
      // an SVG from the project is converted like a dropped one: pdfLaTeX can't read it
      if (figureKind(item, '') === 'convert') {
        const blob = await fetch(blobUrl(api.projectId, item))
          .then((res) => (res.ok ? res.blob() : null))
          .catch(() => null);
        if (blob) return load(new File([blob], item.slice(item.lastIndexOf('/') + 1), { type: blob.type }));
        setError(`Couldn’t read ${item}.`);
        return;
      }
      add({ kind: 'project', path: item });
      return;
    }
    const fileKind = figureKind(item.name, item.type);
    if (!fileKind) {
      setError(`${item.name} isn’t an image. Use PNG, JPEG, PDF, EPS, GIF, WebP, HEIC, BMP, TIFF or SVG.`);
      return;
    }
    setBusy('reading');
    try {
      const original = extOf(item.name);
      const jpeg = /^jpe?g$/.test(original);
      // photos stay JPEG: as PNG they'd be many times the size, and slow every compile
      const photo = jpeg || /^hei[cf]$/.test(original) || /hei[cf]/.test(item.type);
      const turned = jpeg && jpegOrientation(await item.slice(0, 65536).arrayBuffer()) > 1;
      const convert = fileKind === 'convert' || turned;
      const blob = convert ? await drawAs(item, photo ? 'image/jpeg' : 'image/png') : item;
      const ext = convert ? (photo ? 'jpg' : 'png') : original;
      const from = original.toUpperCase();
      const mainDir = api.mainFile.slice(0, Math.max(0, api.mainFile.lastIndexOf('/')));
      const note = turned
        ? 'Turned upright as it shows here: pdfLaTeX ignores the camera’s rotation tag.'
        : convert
          ? `Converted ${from ? `from ${from} ` : ''}to ${photo ? 'JPEG' : 'PNG'}, which LaTeX can read.`
          : ext === 'eps'
            ? mainDir
              ? `EPS won’t compile from figures/ while the main file is in ${mainDir}/: save it as PDF or PNG first.`
              : 'EPS goes in as it is: pdfLaTeX converts it with epstopdf when it compiles.'
            : '';
      add({ kind: 'file', blob, ext, url: ext === 'pdf' || ext === 'eps' ? '' : URL.createObjectURL(blob), note }, safeFileName(item.name.replace(/\.[^.]*$/, ''), ext));
    } catch {
      setError(`Couldn’t read ${item.name || 'that image'}. Save it as PNG or JPEG and try again.`);
    } finally {
      setBusy('');
    }
  };

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const take = () => {
      const item = handed;
      handed = null;
      if (item !== null) loadRef.current(item);
    };
    take();
    handedEvents.addEventListener('figure', take);
    return () => handedEvents.removeEventListener('figure', take);
  }, []);

  // the panel being dragged to a new place in the order, and the one it's over
  const [moving, setMoving] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  /** Puts the panel with key at index to, in reading order. */
  const move = (key: number, to: number) =>
    setPanels((prev) => {
      const from = prev.findIndex((p) => p.key === key);
      if (from === -1 || to < 0 || to >= prev.length || to === from) return prev;
      const next = prev.slice();
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });

  const remove = (key: number) =>
    setPanels((prev) => {
      prev.filter((p) => p.key === key).forEach(forget);
      return prev.filter((p) => p.key !== key);
    });

  const clear = () => {
    panels.forEach(forget);
    setPanels([]);
    setLabel(null);
    setError('');
  };

  const loadAll = async (files: File[]) => {
    for (const file of several ? files : files.slice(0, 1)) await loadRef.current(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files].filter((file) => figureKind(file.name, file.type));
    if (files.length) loadAll(files);
    else {
      const file = figureFile(e.dataTransfer);
      if (file) load(file);
      else if (e.dataTransfer.files.length) setError(`${e.dataTransfer.files[0].name} isn’t an image.`);
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    // text pasted into the fields stays text
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    const file = figureFile(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    load(file);
  };

  const insert = async () => {
    const used = several ? panels : panels.slice(0, 1);
    if (!used.length) return;
    setBusy('inserting');
    try {
      // never over an existing file: the upload replaces one with the same name, and two new images can't share one either
      const uploads = used.filter((p) => p.source.kind === 'file');
      const taken = uploads.length ? (await getProjectTree(api.projectId)).items.map((item) => item.path) : [];
      const saved: string[] = [];
      for (const panel of used) {
        if (panel.source.kind !== 'file') {
          saved.push(panel.source.path);
          continue;
        }
        const unique = uniqueName(safeFileName(panel.name, panel.source.ext), taken);
        taken.push(`figures/${unique}`);
        const res = await uploadFiles(api.projectId, [new File([panel.source.blob], unique, { type: panel.source.blob.type })], 'figures');
        saved.push(res.files?.[0] || `figures/${unique}`);
      }
      const docKindNow = docKind(apiRef.current.activePath);
      const placement = { placement: prefs.placement, span: prefs.span };
      let text: string;
      let wanted = ['graphicx'];
      if (several) {
        const figureSet: FigureSet = {
          panels: used.map((p, i) => ({ path: saved[i], caption: p.caption, label: p.label ?? figureLabel(saved[i]) })),
          layout,
          columns: prefs.columns,
          labels: prefs.labels,
          align: prefs.align,
          size,
          caption,
          label: label ?? figureSetLabel(caption, saved[0]),
          ...placement
        };
        text = docKindNow === 'typst' ? figureSetTypst(figureSet) : figureSetLatex(figureSet);
        wanted = figureSetPackages(figureSet);
      } else {
        // an automatic label follows the name the file was saved under
        const figure = { path: saved[0], width: widthOf(prefs), caption, label: label ?? figureLabel(saved[0]), size };
        text = docKindNow === 'typst' ? figureTypst(figure) : docKindNow === 'markdown' ? figureMarkdown(figure) : figureLatex({ ...figure, ...placement });
      }
      const added =
        docKindNow === 'latex' ? await ensurePackages(() => apiRef.current, [...wanted, ...(placementOf(prefs.placement, prefs.span) === 'H' ? ['float'] : [])]) : { text: '', warn: false };
      insertBlock(apiRef.current, text);
      if (uploads.length) await api.refreshTree();
      const what = uploads.length ? `Saved ${uploads.length === 1 ? saved[used.indexOf(uploads[0])] : `${uploads.length} images in figures/`} and inserted the figure.` : `Inserted ${saved.length === 1 ? saved[0] : `${saved.length} images`} as a figure.`;
      api.notify([what, added.text].filter(Boolean).join(' '), added.warn ? 'error' : 'success');
      clear();
      setCaption('');
    } catch (err) {
      api.notify(`Couldn’t add the figure: ${errorText(err)}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const latex = kind !== 'typst' && kind !== 'markdown';
  const showDrop = !first || several;

  return (
    <section className="tool-card" data-card="figure" ref={cardRef} onPaste={onPaste}>
      <div className="tool-card-title">
        <Icon name="photo.badge.plus" /> Insert figure
      </div>
      <div className="tool-card-desc">
        Saves the image in figures/ and inserts it as a figure. PNG, JPEG, PDF and EPS go in as they are; HEIC photos are converted to JPEG, and GIF, WebP, BMP, TIFF and SVG to PNG.
      </div>
      {kind !== 'markdown' && (
        <Segmented
          label="Layout"
          value={prefs.layout}
          options={LAYOUTS}
          onChange={(next) => {
            set({ layout: next });
            setLabel(null);
          }}
        />
      )}
      {several && layout === 'grid' && (
        <NumberField id={`${id}-columns`} label="Columns" unit="images a row" value={prefs.columns} min={2} max={4} onChange={(columns) => set({ columns })} />
      )}
      {!several && first ? (
        <div className="drop-zone has-file" ref={dropRef} tabIndex={-1} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <div className="drop-preview">
            {panelPreview(api.projectId, first) ? <img src={panelPreview(api.projectId, first)} alt="" /> : <Icon name="doc.richtext" size={28} />}
            <span className="drop-name">{first.source.kind === 'file' ? safeFileName(first.name, first.source.ext) : first.source.path}</span>
            <button
              className="icon-btn"
              title="Remove image"
              aria-label="Remove image"
              onClick={() => {
                clear();
                // the button goes with the image; focus stays in the card
                dropRef.current?.focus();
              }}
            >
              <Icon name="xmark.circle.fill" />
            </button>
          </div>
        </div>
      ) : null}
      {several &&
        panels.map((panel, i) => (
          <div
            className={`figure-panel ${moving === panel.key ? 'moving' : ''} ${over === panel.key && moving !== panel.key ? 'over' : ''}`}
            key={panel.key}
            // dragged by its head, so text in its fields can still be selected
            onDragOver={(e) => {
              if (moving === null) return;
              e.preventDefault();
              setOver(panel.key);
            }}
            onDrop={(e) => {
              if (moving === null) return;
              e.preventDefault();
              move(moving, i);
              setMoving(null);
              setOver(null);
            }}
          >
            <div
              className="figure-panel-head"
              draggable
              title="Drag to reorder"
              onDragStart={(e) => {
                setMoving(panel.key);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', panelPath(panel));
              }}
              onDragEnd={() => {
                setMoving(null);
                setOver(null);
              }}
            >
              {panelPreview(api.projectId, panel) ? <img src={panelPreview(api.projectId, panel)} alt="" /> : <Icon name="doc.richtext" size={22} />}
              <span className="drop-name">
                {prefs.labels === 'sub' ? `(${String.fromCharCode(97 + i)}) ` : ''}
                {panelPath(panel)}
              </span>
              <button className="icon-btn" title="Move earlier" aria-label={`Move image ${i + 1} earlier`} disabled={i === 0} onClick={() => move(panel.key, i - 1)}>
                <Icon name="chevron.left" />
              </button>
              <button className="icon-btn" title="Move later" aria-label={`Move image ${i + 1} later`} disabled={i === panels.length - 1} onClick={() => move(panel.key, i + 1)}>
                <Icon name="chevron.right" />
              </button>
              <button className="icon-btn" title="Remove image" aria-label={`Remove image ${i + 1}`} onClick={() => remove(panel.key)}>
                <Icon name="xmark.circle.fill" />
              </button>
            </div>
            {panel.source.kind === 'file' && (
              <input
                className="input"
                aria-label={`Image ${i + 1} file name`}
                value={panel.name}
                onChange={(e) => setPanel(panel.key, { name: e.target.value })}
                onBlur={() => panel.source.kind === 'file' && setPanel(panel.key, { name: safeFileName(panel.name, panel.source.ext) })}
                spellCheck={false}
              />
            )}
            {prefs.labels !== 'none' && (
              <>
                <input className="input" aria-label={`Image ${i + 1} caption`} placeholder={prefs.labels === 'sub' ? 'Sub-caption' : 'Caption'} value={panel.caption} onChange={(e) => setPanel(panel.key, { caption: e.target.value })} />
                <input
                  className="input mono"
                  aria-label={`Image ${i + 1} label`}
                  value={panel.label ?? figureLabel(panelPath(panel))}
                  onChange={(e) => setPanel(panel.key, { label: e.target.value })}
                  spellCheck={false}
                />
              </>
            )}
          </div>
        ))}
      {showDrop && (
        <div
          ref={dropRef}
          className={`drop-zone ${dragging ? 'dragging' : ''} ${several && first ? 'compact' : ''}`}
          tabIndex={0}
          role="button"
          aria-label={several ? 'Add images' : 'Choose an image'}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key !== 'Enter' && e.key !== ' ') || e.target !== e.currentTarget) return;
            // Space would scroll the tools too
            e.preventDefault();
            inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {busy === 'reading' ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <>
              <Icon name="photo.badge.plus" size={several && first ? 20 : 28} />
              <span>{several ? (first ? 'Add another image' : 'Click to choose or drag in images') : 'Click to choose or drag in an image'}</span>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple={several}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          loadAll(files);
        }}
      />
      {/* always there, so VoiceOver reads what arrives in it */}
      <div className={`field-hint ${error ? 'error' : ''}`} role="status">
        {error || (busy === 'reading' ? 'Reading the image…' : !several && first?.source.kind === 'file' ? first.source.note : '')}
      </div>
      {first && (
        <>
          {!several && first.source.kind === 'file' && (
            <div className="field">
              <label htmlFor={`${id}-name`}>File name</label>
              <input
                id={`${id}-name`}
                className="input"
                value={first.name}
                onChange={(e) => setPanel(first.key, { name: e.target.value })}
                onBlur={() => first.source.kind === 'file' && setPanel(first.key, { name: safeFileName(first.name, first.source.ext) })}
                spellCheck={false}
              />
              <div className="field-hint">Goes in {panelPath(first)} when you insert it, or with -2 added if that name’s taken.</div>
            </div>
          )}
          {several && (
            <>
              <Segmented label="Labelling" value={prefs.labels} options={LABELLING} onChange={(labels) => set({ labels })} />
              <div className="field-hint">
                {prefs.labels === 'sub'
                  ? `Each image is a sub-figure, (a), (b) and so on, under one caption and one figure number${latex ? '. Uses the subcaption package, which is added' : ''}. Refer to one image by its own label.`
                  : prefs.labels === 'separate'
                    ? 'Each image is a figure of its own, with its own number, caption and label, side by side.'
                    : 'The images share the one caption and label, with no (a) or (b).'}
              </div>
              <Segmented label="Line up" value={prefs.align} options={ALIGNS} onChange={(align) => set({ align })} />
            </>
          )}
          {!(several && prefs.labels === 'separate') && (
            <>
              <div className="field">
                <label htmlFor={`${id}-caption`}>Caption</label>
                <textarea
                  ref={captionRef}
                  id={`${id}-caption`}
                  className="input"
                  rows={2}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Leave empty to write it later"
                />
              </div>
              <div className="field">
                <label htmlFor={`${id}-label`}>Label</label>
                <input id={`${id}-label`} className="input" value={mainLabel} onChange={(e) => setLabel(e.target.value)} spellCheck={false} />
              </div>
            </>
          )}
          <Segmented label="Size by" value={prefs.sizeMode} options={SIZE_MODES} onChange={(sizeMode) => set({ sizeMode })} />
          {prefs.sizeMode === 'line' && (
            <>
              <Segmented
                label={several ? 'Width in its panel' : 'Width'}
                value={several ? prefs.panelShare : prefs.width}
                options={WIDTHS}
                onChange={(choice) => set(several ? { panelShare: choice } : { width: choice })}
              />
              {(several ? prefs.panelShare : prefs.width) === 'custom' && (
                <NumberField id={`${id}-custom`} label="Custom" unit={several ? '% of the panel’s width' : '% of the line width'} value={prefs.custom} min={1} max={100} onChange={(custom) => set({ custom })} />
              )}
            </>
          )}
          {(prefs.sizeMode === 'width' || prefs.sizeMode === 'box') && (
            <NumberField id={`${id}-w`} label="Width" unit="mm" value={prefs.sizeW} min={1} max={400} onChange={(sizeW) => set({ sizeW })} />
          )}
          {(prefs.sizeMode === 'height' || prefs.sizeMode === 'box') && (
            <NumberField id={`${id}-h`} label="Height" unit="mm" value={prefs.sizeH} min={1} max={400} onChange={(sizeH) => set({ sizeH })} />
          )}
          {prefs.sizeMode === 'scale' && <NumberField id={`${id}-scale`} label="Scale" unit="× its own size" value={prefs.scale} min={0.05} max={5} step={0.05} onChange={(scale) => set({ scale })} />}
          <div className="field-hint">
            {
              {
                line: several ? 'Each image takes this share of its panel; the panels share the line between them.' : 'A share of the line width. A tall image is kept within the page.',
                width: 'Every image is this wide, and as tall as its shape makes it.',
                height: 'Every image is this tall, and as wide as its shape makes it. Good for images of different shapes side by side.',
                box: 'Each image is made as big as fits in this box without stretching it.',
                scale: kind === 'markdown' ? 'Markdown can’t scale an image, so it goes in at the line share.' : 'A scale of the image’s own size, as saved: 0.5 is half.'
              }[prefs.sizeMode]
            }
          </div>
          {kind !== 'markdown' && (
            <label className="checkbox-row">
              <input type="checkbox" checked={prefs.crop} onChange={(e) => set({ crop: e.target.checked })} />
              <span>
                Crop edges
                <span className="field-hint">{kind === 'typst' ? 'Typst can’t crop an image, so this is left out of Typst documents.' : `Trims the edges of ${several ? 'every image' : 'the image'} with trim and clip.`}</span>
              </span>
            </label>
          )}
          {prefs.crop && latex && (
            <div className="figure-trim">
              {(['Left', 'Bottom', 'Right', 'Top'] as const).map((side, i) => (
                <NumberField
                  key={side}
                  id={`${id}-trim-${i}`}
                  label={side}
                  unit="mm"
                  value={prefs.trim[i]}
                  min={0}
                  max={200}
                  onChange={(n) => set({ trim: Object.assign([...prefs.trim], { [i]: n }) as FigurePrefs['trim'] })}
                />
              ))}
            </div>
          )}
          {kind !== 'typst' && kind !== 'markdown' && (
            <PlacementField kind="figure" value={prefs.placement} onChange={(placement) => set({ placement })} span={prefs.span} onSpan={(span) => set({ span })} />
          )}
          <button className="btn primary full" onClick={insert} disabled={!!busy || !docOpen}>
            {busy === 'inserting' ? <span className="spinner" /> : <Icon name="plus" />} Insert figure
          </button>
          {!docOpen && <div className="field-hint">{NOT_TEX}</div>}
        </>
      )}
      <FigureHelp />
    </section>
  );
}

/** What each layout, size and package does, for the figure card. */
function FigureHelp() {
  return (
    <details className="tool-help">
      <summary>What these options mean</summary>
      <dl>
        <dt>Single, side by side and grid</dt>
        <dd>
          Single puts one image in a figure. Side by side puts all the images in one row, sharing the line equally; a grid puts them in rows of the chosen number of columns, as a 2 × 2 square of
          four.
        </dd>
        <dt>(a), (b): sub-figures</dt>
        <dd>
          One figure with one number and caption, whose images are lettered (a), (b) with a short caption each. Uses the <code>subcaption</code> package, the current and maintained way to make
          sub-figures; the older <code>subfig</code> and <code>subfigure</code> packages are out of date and clash with it. With cleveref, <code>\cref</code> on an image’s label prints
          “Figure 2a”.
        </dd>
        <dt>Separate figures</dt>
        <dd>Each image is a full figure with its own number (Figure 2, Figure 3), caption and label, placed side by side in one float. No extra package.</dd>
        <dt>One caption</dt>
        <dd>The images sit together under a single caption and label, with no letters. Use it when the images only make sense together.</dd>
        <dt>Line up</dt>
        <dd>How images of different heights line up in a row: along their tops, their centres or their bottoms. Bottoms keeps the captions under them level.</dd>
        <dt>Size by</dt>
        <dd>
          <b>Share</b> sets the width as a part of the line, or of the image’s panel in a row; it keeps the layout when the margins or columns change. <b>Width</b> and <b>Height</b> set an
          exact size in millimetres and keep the shape. <b>Fit in box</b> makes the image as big as fits in a width and height without stretching it (<code>keepaspectratio</code>).{' '}
          <b>Scale</b> multiplies the image’s own size, so 0.5 is half; it depends on how big the file was saved.
        </dd>
        <dt>Crop edges</dt>
        <dd>
          Cuts millimetres off each edge with <code>trim</code> and <code>clip</code>, for white space or a border in a screenshot. The file itself is not changed.
        </dd>
        <dt>Placement</dt>
        <dd>
          Where LaTeX may put the figure. Exactly here (<code>[H]</code>) stops it floating and uses the <code>float</code> package, which is added. Across both columns uses{' '}
          <code>figure*</code> in a two-column document.
        </dd>
        <dt>graphicx</dt>
        <dd>The standard package for <code>\includegraphics</code>, added to every LaTeX document a figure goes into.</dd>
      </dl>
    </details>
  );
}

// ─── Insert diagram ───

type DiagramWidth = 'natural' | WidthChoice;
const DIAGRAM_WIDTHS: [DiagramWidth, string, string?][] = [['natural', 'Natural', 'Natural size'], ...WIDTHS];

/** The image a diagram that isn't TikZ goes in as: the PDF or PNG saved beside it (or the image it is), '' when there's none. */
const imageOf = (path: string, figures: string[]) =>
  figureKind(path, '') === 'keep' ? path : ['pdf', 'png'].map((ext) => path.replace(/\.[^./]+$/, `.${ext}`)).find((p) => figures.includes(p)) || '';

/** Whether a Typst version can show PDF images (0.14 and later). */
const atLeastVersion = (version: string, minimum: string) => {
  const left = version.split('.').map(Number);
  const right = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return true;
};

/** What the project's preamble loads that clashes with a TikZ diagram's packages (sets.ts); none when it can't tell. */
async function diagramClashes(api: EditorApi, diagram: HandedDiagram): Promise<Clash[]> {
  if (!api.mainFile) return [];
  const read = async (path: string) => (path === api.activePath ? api.editorValue : (await getFile(api.projectId, path)).content);
  try {
    const files = new Set(api.texFiles);
    const packages = await projectPackages(api.mainFile, files, read);
    const libraries = await projectPackages(api.mainFile, files, read, loadedLibraries);
    return clashesWith(diagram, { packages, libraries });
  } catch {
    return [];
  }
}

/**
 * The diagram the composer's Insert as figure handed over, as a figure: a TikZ diagram through \includestandalone, at
 * its own size by default, with standalone, its packages and its TikZ libraries added to the preamble, or as the PDF
 * its preview compiled when its packages clash with the document's (Insert as image); any other (Mermaid) as its
 * exported image. Without one, it opens the composer.
 */
function InsertDiagram() {
  const api = useEditor();
  const apiRef = useRef(api);
  apiRef.current = api;
  const id = useId();
  const [diagram, setDiagram] = useState<HandedDiagram | null>(null);
  const [caption, setCaption] = useState('');
  /** null: follows the file name */
  const [label, setLabel] = useState<string | null>(null);
  // the figure card's placement and custom width, not remembered from here
  const [prefs, setPrefs] = useState(loadPrefs);
  const [width, setWidth] = useState<DiagramWidth>('natural');
  const [busy, setBusy] = useState(false);
  /** a TikZ diagram's clashes with the preamble, and whether it goes in as its PDF */
  const [clashes, setClashes] = useState<Clash[]>([]);
  const [asImage, setAsImage] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const docOpen = isDocument(api.activePath);
  const kind = docKind(api.activePath);
  const typst = diagram?.language === 'typst' || /\.typ$/i.test(diagram?.path ?? '');
  const tikz = diagram?.language === 'tikz' && !typst;
  const image = diagram && !tikz && !typst ? imageOf(diagram.path, api.figureFiles) : '';
  const canInsert = !!diagram && (typst ? kind === 'typst' : kind === 'typst' || tikz || !!image);
  const showWidth = !!diagram && !typst;

  useEffect(() => {
    const take = () => {
      const next = handedDiagram;
      handedDiagram = null;
      if (!next) return;
      setDiagram(next);
      setCaption('');
      setLabel(null);
      // an image can't keep a size of its own in the document; a TikZ picture can
      setWidth(next.language === 'tikz' ? 'natural' : loadPrefs().width);
    };
    take();
    handedEvents.addEventListener('diagram', take);
    return () => handedEvents.removeEventListener('diagram', take);
  }, []);

  // a new diagram asks for its caption
  useEffect(() => {
    if (!diagram) return;
    cardRef.current?.scrollIntoView({ block: 'nearest' });
    captionRef.current?.focus({ preventScroll: true });
  }, [diagram]);

  // a TikZ diagram whose packages clash with the preamble's goes in as an image unless you choose otherwise
  useEffect(() => {
    setClashes([]);
    setAsImage(false);
    if (!diagram || diagram.language !== 'tikz' || kind !== 'latex') return;
    let live = true;
    diagramClashes(apiRef.current, diagram).then((found) => {
      if (!live) return;
      setClashes(found);
      setAsImage(found.some((clash) => !clash.fixed));
    });
    return () => {
      live = false;
    };
  }, [diagram, kind]);

  const draw = () => openDiagram(api.projectId, undefined, docKind(api.activePath) === 'typst' ? 'typst' : undefined).catch((err) => api.notify(`Couldn’t open the diagram composer: ${errorText(err)}`, 'error'));

  const insert = async () => {
    if (!diagram) return;
    const a = apiRef.current;
    const target = docKind(a.activePath);
    const captionLabel = label ?? figureLabel(diagram.path);
    const fraction = width === 'natural' ? null : widthOf({ ...prefs, width });
    setBusy(true);
    try {
      if (typst) {
        if (target !== 'typst') {
          a.notify('A Typst diagram goes into Typst documents only.', 'error');
          return;
        }
        insertBlock(a, figureTypstInclude({ path: diagram.path, caption, label: captionLabel }));
        a.notify(`Inserted ${diagram.path} as a figure.`, 'success');
      } else if (target === 'typst') {
        if (!tikz) {
          // a Mermaid diagram goes in as its exported image
          const source = imageOf(diagram.path, a.figureFiles);
          if (!source) {
            a.notify('Export the diagram as a PDF or PNG in the composer first.', 'error');
            return;
          }
          insertBlock(a, figureTypst({ path: source, width: fraction ?? widthOf(prefs), caption, label: captionLabel }));
          a.notify(`Inserted ${source} as a figure.`, 'success');
        } else {
          // a TikZ picture goes in as the PDF the composer's preview made, from Typst 0.14 (the project's pin, else the
          // app's default)
          const project = (await getProjectSettings(a.projectId).catch(() => null))?.settings;
          const version = (project && effectiveCompile(project.compile, loadSettings().compileDefaults).typstVersion) || '';
          if (version && !atLeastVersion(version, '0.14')) {
            a.notify(`Typst ${version} can’t show PDF images. Choose Typst 0.14 or later in the compile menu.`, 'error');
            return;
          }
          const pdf = diagram.path.replace(/\.tex$/i, '.pdf');
          if (!a.projectFiles.includes(pdf)) {
            a.notify('Compile the diagram in the composer first, so its PDF is there.', 'error');
            return;
          }
          insertBlock(a, figureTypst({ path: pdf, width: fraction ?? widthOf(prefs), caption, label: captionLabel }));
          a.notify(`Inserted ${pdf} as a figure.`, 'success');
        }
      } else if (target === 'markdown') {
        // a TikZ picture goes in as the PDF the composer's preview made, which isn't among the figures (it's x.tex's)
        const pdf = tikz ? diagram.path.replace(/\.tex$/i, '.pdf') : '';
        const source = tikz ? (a.projectFiles.includes(pdf) ? pdf : '') : imageOf(diagram.path, a.figureFiles);
        if (!source) {
          a.notify(tikz ? 'Compile the diagram in the composer first, so its PDF is there.' : 'Export the diagram as a PDF or PNG in the composer first.', 'error');
          return;
        }
        insertBlock(a, figureMarkdown({ path: source, width: fraction ?? widthOf(prefs), caption, label: captionLabel }));
        a.notify(`Inserted ${source} as a figure.`, 'success');
      } else {
        const float = { caption, label: captionLabel, placement: prefs.placement, span: prefs.span };
        const exactly = placementOf(prefs.placement, prefs.span) === 'H' ? ['float'] : [];
        if (tikz && asImage) {
          const pdf = diagram.path.replace(/\.tex$/i, '.pdf');
          if (!a.projectFiles.includes(pdf)) {
            a.notify('Compile the diagram in the composer first, so its PDF is there.', 'error');
            return;
          }
          const added = await ensurePackages(() => apiRef.current, ['graphicx', ...exactly]);
          insertBlock(apiRef.current, diagramImageLatex({ ...float, path: pdf, width: fraction }));
          a.notify([`Inserted ${pdf} as a figure.`, added.text].filter(Boolean).join(' '), added.warn ? 'error' : 'success');
          setDiagram(null);
          setCaption('');
          return;
        }
        // physics's \qty would take the figure's values: they become \SI, in the file and its drawing
        let note = '';
        if (tikz && clashes.some((clash) => clash.with === 'physics')) {
          const { content, hash } = await getFile(a.projectId, diagram.path);
          const fixed = await forPhysics(content);
          if (fixed) {
            await writeFile(a.projectId, diagram.path, fixed, { base: hash });
            note = 'Its values are written with \\SI, as physics has its own \\qty.';
          }
        }
        // standalone loads before the rest, and the libraries after the packages that bring TikZ
        const added = tikz
          ? await ensurePackages(() => apiRef.current, [...diagram.packages, ...exactly], { first: ['standalone'], libraries: diagram.libraries })
          : await ensurePackages(() => apiRef.current, ['graphicx', ...exactly]);
        insertBlock(
          apiRef.current,
          tikz ? diagramLatex({ ...float, path: diagram.path, width: fraction }) : figureLatex({ ...float, path: image, width: fraction ?? widthOf(prefs) })
        );
        a.notify([`Inserted ${diagram.path} as a figure.`, note, added.text].filter(Boolean).join(' '), added.warn ? 'error' : 'success');
      }
      setDiagram(null);
      setCaption('');
    } catch (err) {
      a.notify(`Couldn’t add the diagram: ${errorText(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tool-card" data-card="diagram" ref={cardRef}>
      <div className="tool-card-title">
        <Icon name="pencil" /> Insert diagram
      </div>
      <div className="tool-card-desc">
        Diagrams drawn in the composer go in as figures. A TikZ diagram goes in with \includestandalone, so its labels take the document’s fonts, and the packages it needs are added to the preamble.
      </div>
      {!diagram ? (
        <button className="btn full" onClick={draw}>
          <Icon name="pencil" /> Draw a diagram…
        </button>
      ) : (
        <>
          <div className="drop-zone has-file">
            <div className="drop-preview">
              <Icon name="doc.richtext" size={28} />
              <span className="drop-name">{diagram.path}</span>
              <button className="icon-btn" title="Remove diagram" aria-label="Remove diagram" onClick={() => setDiagram(null)}>
                <Icon name="xmark.circle.fill" />
              </button>
            </div>
          </div>
          {!tikz && !typst && !image && <div className="field-hint error">Export the diagram as a PNG from the composer first, then insert it again.</div>}
          {typst && kind !== 'typst' && <div className="field-hint error">A Typst diagram goes into Typst documents only.</div>}
          {clashes.map((clash) => (
            <div key={clash.with} className={`field-hint ${clash.fixed ? '' : 'error'}`}>
              {clash.message}
            </div>
          ))}
          {tikz && kind === 'latex' && (
            <label className="checkbox-row">
              <input type="checkbox" role="switch" checked={asImage} onChange={(e) => setAsImage(e.target.checked)} />
              <span>
                Insert as image
                <span className="field-hint">As the PDF the composer compiled, so none of its packages reach your document. It keeps its own fonts.</span>
              </span>
            </label>
          )}
          <div className="field">
            <label htmlFor={`${id}-caption`}>Caption</label>
            <textarea
              ref={captionRef}
              id={`${id}-caption`}
              className="input"
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Leave empty to write it later"
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-label`}>Label</label>
            <input id={`${id}-label`} className="input" value={label ?? figureLabel(diagram.path)} onChange={(e) => setLabel(e.target.value)} spellCheck={false} />
          </div>
          {showWidth && <Segmented label="Width" value={width} options={tikz ? DIAGRAM_WIDTHS : WIDTHS} onChange={setWidth} />}
          {showWidth && width === 'natural' && <div className="field-hint">At its natural size, its lines and labels keep the sizes they were drawn at.</div>}
          {showWidth && width === 'custom' && (
            <div className="figure-custom-width">
              <input
                id={`${id}-custom`}
                className="input number"
                type="number"
                min={1}
                max={100}
                value={prefs.custom || ''}
                onChange={(e) => setPrefs({ ...prefs, custom: Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
                onBlur={() => !prefs.custom && setPrefs({ ...prefs, custom: DEFAULT_PREFS.custom })}
              />
              <label htmlFor={`${id}-custom`}>% of the line width</label>
            </div>
          )}
          {!typst && (
            <PlacementField
              kind="figure"
              value={prefs.placement}
              onChange={(placement) => setPrefs({ ...prefs, placement })}
              span={prefs.span}
              onSpan={(span) => setPrefs({ ...prefs, span })}
            />
          )}
          <button className="btn primary full" onClick={insert} disabled={busy || !docOpen || !canInsert}>
            {busy ? <span className="spinner" /> : <Icon name="plus" />} Insert diagram
          </button>
          {!docOpen && <div className="field-hint">{NOT_TEX}</div>}
        </>
      )}
    </section>
  );
}

// ─── Insert table ───

const ALIGN: [string, string][] = [
  ['l', 'Left'],
  ['c', 'Centre'],
  ['r', 'Right']
];
const ALIGN_X: [string, string][] = [...ALIGN, ['X', 'Fill (X)']];
/** siunitx's S column, for LaTeX only */
const NUMBERS: [string, string] = ['S', 'Numbers (S)'];

const ENVS: [TableEnv, string, string?][] = [
  ['tabular', 'tabular'],
  ['tabularx', 'tabularx'],
  ['xltabular', 'xltabular', 'xltabular: breaks across pages']
];

const LINES: [TableLines, string][] = [
  ['booktabs', 'Booktabs'],
  ['grid', 'Grid'],
  ['minimal', 'Minimal'],
  ['none', 'None']
];

const blankGrid = (rows: number, cols: number) => Array.from({ length: rows }, () => Array<string>(cols).fill(''));

function InsertTable() {
  const api = useEditor();
  const apiRef = useRef(api);
  apiRef.current = api;
  const id = useId();
  const [cells, setCells] = useState(() => blankGrid(3, 3));
  const [env, setEnv] = useState<TableEnv>('tabular');
  /** chosen alignments; a column without one gets the environment's default */
  const [chosen, setChosen] = useState<string[]>([]);
  const [lines, setLines] = useState<TableLines>('booktabs');
  /** edges whose line was turned on or off by hand, against the preset */
  const [toggled, setToggled] = useState<string[]>([]);
  /** the cell that last had focus, whose lines “Lines at row and column” changes */
  const [at, setAt] = useState<[number, number]>([0, 0]);
  const [header, setHeader] = useState(true);
  const [float, setFloat] = useState(true);
  const [placement, setPlacement] = useState('H');
  const [span, setSpan] = useState(false);
  const [caption, setCaption] = useState('');
  /** null: follows the caption */
  const [label, setLabel] = useState<string | null>(null);
  const [escape, setEscape] = useState(true);
  const [merges, setMerges] = useState<TableMerge[]>([]);
  const [partRules, setPartRules] = useState<TablePartRule[]>([]);
  /** makecell: a \\ in a cell breaks the line there */
  const [breaks, setBreaks] = useState(false);
  /** threeparttable: notes under the table */
  const [withNotes, setWithNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<[number, number] | null>(null);
  const cols = cells[0].length;
  const kind = docKind(api.activePath);
  /** a LaTeX document, or none open; Typst and Markdown have no tabularx, so its X columns fall back to the tabular defaults there */
  const latex = kind !== 'typst' && kind !== 'markdown';
  const tableEnv = latex ? env : 'tabular';
  const long = tableEnv === 'xltabular';
  // X needs tabularx or xltabular, and S siunitx, which only LaTeX has
  const align = Array.from({ length: cols }, (_, c) => ((chosen[c] === 'X' && tableEnv === 'tabular') || (chosen[c] === 'S' && !latex) ? undefined : chosen[c]) ?? defaultAlign(tableEnv, c));
  const fitted = fitMerges(merges, cells.length, cols);
  const model: TableModel = {
    cells,
    env: tableEnv,
    align,
    lines,
    toggled,
    header,
    float,
    placement,
    span: span && !long,
    caption,
    label: label ?? tableLabel(caption),
    escape,
    merges: fitted,
    partRules: fitPartRules(partRules, cells.length, cols),
    breaks: latex && breaks,
    notes: latex && withNotes && !long ? notes : ''
  };
  const edges = tableEdges(cells.length, cols, header);
  const rules = tableRules(model, cols);
  // a name left over from a removed row or column changes nothing
  const changed = toggled.some((edge) => edges.h.includes(edge) || edges.v.includes(edge));
  const [atRow, atCol] = [Math.min(at[0], cells.length - 1), Math.min(at[1], cols - 1)];
  // the focused cell's merged block, or the cell on its own
  const block = mergeAt(fitted, atRow, atCol) ?? { r: atRow, c: atCol, rows: 1, cols: 1 };
  const merged = block.rows > 1 || block.cols > 1;
  const shortRule = partRules.find((p) => p.row === block.r + block.rows - 1 && p.from === block.c && p.to === block.c + block.cols - 1);
  const mergeBy = (rows: number, cols: number) => {
    setMerges((prev) => withMerge(fitMerges(prev, cells.length, cells[0].length), { ...block, rows: block.rows + rows, cols: block.cols + cols }));
    setAt([block.r, block.c]);
  };
  const toggleShortRule = () =>
    setPartRules((prev) => (shortRule ? prev.filter((p) => p !== shortRule) : [...prev, { row: block.r + block.rows - 1, from: block.c, to: block.c + block.cols - 1 }]));
  const flip = (edge: string) => setToggled((prev) => (prev.includes(edge) ? prev.filter((e) => e !== edge) : [...prev, edge]));
  const text = kind === 'typst' ? tableTypst(model) : kind === 'markdown' ? tableMarkdown(model) : tableLatex(model);
  const docOpen = isDocument(api.activePath);

  const focusCell = (r: number, c: number) => gridRef.current?.querySelector<HTMLInputElement>(`[data-cell="${r}-${c}"]`)?.focus();

  // a cell added by Return gets focus once it's there
  useEffect(() => {
    if (!focusAfter.current) return;
    focusCell(...focusAfter.current);
    focusAfter.current = null;
  });

  const setCell = (r: number, c: number, value: string) => setCells((prev) => prev.map((row, i) => (i === r ? row.map((v, j) => (j === c ? value : v)) : row)));
  const addRow = () => setCells((prev) => [...prev, Array<string>(prev[0].length).fill('')]);

  const onCellKey = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    // with line breaks on, Shift-Return puts a \\ in the cell
    if (e.shiftKey && breaks && latex) {
      const input = e.currentTarget;
      const [from, to] = [input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length];
      setCell(r, c, `${input.value.slice(0, from)} \\\\ ${input.value.slice(to)}`.replace(/ {2,}/g, ' '));
      return;
    }
    if (r < cells.length - 1) focusCell(r + 1, c);
    else {
      addRow();
      focusAfter.current = [r + 1, c];
    }
  };

  // rows copied from Numbers, Excel or a CSV fill the grid from this cell; a single value pastes as usual
  const onCellPaste = (e: ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    // a cell is one line; a quoted line break becomes a space
    const block = parseDelimited(text).map((row) => row.map((cell) => cell.replace(/\s*\n\s*/g, ' ')));
    setCells((prev) => pasteCells(prev, r, c, block));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      api.notify('Copied the table.', 'success');
    } catch (err) {
      api.notify(`Couldn’t copy the table: ${errorText(err)}`, 'error');
    }
  };

  const insert = async () => {
    setBusy(true);
    const wanted = [...tablePackages(model), ...(float && !long && placementOf(placement, model.span) === 'H' ? ['float'] : [])];
    const added = kind === 'latex' ? await ensurePackages(() => apiRef.current, wanted) : { text: '', warn: false };
    insertBlock(apiRef.current, text);
    api.notify(['Inserted the table.', added.text].filter(Boolean).join(' '), added.warn ? 'error' : 'success');
    setBusy(false);
  };

  return (
    <section className="tool-card" data-card="table">
      <div className="tool-card-title">
        <Icon name="tablecells" /> Insert table
      </div>
      <div className="table-grid-scroll">
        {/* cells sit at even grid lines, with a 10 px gap row or column around each for the lines */}
        <div
          className="table-grid"
          ref={gridRef}
          style={{ gridTemplateColumns: `10px repeat(${cols}, minmax(80px, 1fr) 10px)`, gridTemplateRows: `auto 10px repeat(${cells.length}, 30px 10px)` }}
        >
          {align.map((value, c) => (
            <div key={`align-${c}`} style={{ gridRow: 1, gridColumn: 2 * c + 2 }}>
              <span id={`${id}-align-${c}`} hidden>
                Column {c + 1} alignment
              </span>
              <Select
                labelId={`${id}-align-${c}`}
                value={value}
                options={[...(tableEnv === 'tabular' ? ALIGN : ALIGN_X), ...(latex ? [NUMBERS] : [])]}
                onChange={(next) => setChosen((prev) => Object.assign([...prev], { [c]: next }))}
              />
            </div>
          ))}
          {cells.map((row, r) =>
            row.map((cell, c) => {
              const merge = mergeAt(fitted, r, c);
              // a cell merged into another has no box of its own
              if (merge && (merge.r !== r || merge.c !== c)) return null;
              return (
                <input
                  key={`${r}-${c}`}
                  className={`input ${header && r === 0 ? 'head' : ''} ${merge ? 'merged' : ''}`}
                  style={{ gridRow: `${2 * r + 3} / span ${2 * (merge?.rows ?? 1) - 1}`, gridColumn: `${2 * c + 2} / span ${2 * (merge?.cols ?? 1) - 1}` }}
                  data-cell={`${r}-${c}`}
                  aria-label={`Row ${r + 1}, column ${c + 1}`}
                  value={cell}
                  onChange={(e) => setCell(r, c, e.target.value)}
                  onFocus={() => setAt([r, c])}
                  onKeyDown={(e) => onCellKey(e, r, c)}
                  onPaste={(e) => onCellPaste(e, r, c)}
                />
              );
            })
          )}
          {kind !== 'markdown' &&
            fitPartRules(partRules, cells.length, cols).map((p) => (
              <div
                key={`part-${p.row}-${p.from}-${p.to}`}
                className="table-line h on part"
                style={{ gridRow: 2 * p.row + 4, gridColumn: `${2 * p.from + 2} / ${2 * p.to + 3}` }}
                aria-hidden
                title="Remove the short rule"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPartRules((prev) => prev.filter((q) => !(q.row === p.row && q.from === p.from && q.to === p.to)))}
              />
            ))}
          {/* mouse targets only: the “Lines at …” buttons below are the way in for the keyboard and screen readers */}
          {kind !== 'markdown' &&
            edges.h.map((edge, i) => (
              <div
                key={edge}
                className={`table-line h ${rules.h[i] ? 'on' : ''} ${rules.h[i] === 2 ? 'double' : ''} ${lines === 'booktabs' && (i === 0 || i === cells.length) ? 'heavy' : ''}`}
                style={{ gridRow: 2 * i + 2, gridColumn: '1 / -1' }}
                aria-hidden
                title={rules.h[i] ? 'Remove the line' : 'Add a line'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => flip(edge)}
              />
            ))}
          {kind !== 'markdown' &&
            lines !== 'booktabs' &&
            edges.v.map((edge, j) => (
              <div
                key={edge}
                className={`table-line v ${rules.v[j] ? 'on' : ''}`}
                style={{ gridRow: '2 / -1', gridColumn: 2 * j + 1 }}
                aria-hidden
                title={rules.v[j] ? 'Remove the line' : 'Add a line'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => flip(edge)}
              />
            ))}
        </div>
      </div>
      <div className="table-grid-actions">
        <button className="btn small" aria-label="Add a row" title="Add a row" onClick={addRow}>
          <Icon name="plus" /> Row
        </button>
        <button className="btn small" aria-label="Remove the last row" title="Remove the last row" disabled={cells.length < 2} onClick={() => setCells((prev) => prev.slice(0, -1))}>
          <Icon name="minus" /> Row
        </button>
        <button className="btn small" aria-label="Add a column" title="Add a column" onClick={() => setCells((prev) => prev.map((row) => [...row, '']))}>
          <Icon name="plus" /> Column
        </button>
        <button
          className="btn small"
          aria-label="Remove the last column"
          title="Remove the last column"
          disabled={cols < 2}
          onClick={() => setCells((prev) => prev.map((row) => row.slice(0, -1)))}
        >
          <Icon name="minus" /> Column
        </button>
        <button
          className="btn small"
          onClick={() => {
            setCells(blankGrid(3, 3));
            setChosen([]);
            setToggled([]);
            setCaption('');
            setLabel(null);
            setMerges([]);
            setPartRules([]);
            setNotes('');
          }}
        >
          Clear
        </button>
        <span className="table-size">
          {cells.length} × {cols}
        </span>
      </div>
      <div className="field-hint">
        Tab moves to the next cell and {IS_WINDOWS ? 'Enter' : 'Return'} moves down. Paste rows from {IS_WINDOWS ? '' : 'Numbers, '}Excel or a CSV file to fill the grid.{' '}
        {kind === 'markdown'
          ? 'Markdown tables have no lines of their own: pandoc draws its usual rules when the document compiles.'
          : 'Click between two rows or two columns, or along an edge, to add or remove a line across the table.'}
      </div>
      {kind !== 'markdown' && (
        <>
          <Segmented
            label="Lines"
            value={changed ? null : lines}
            options={LINES}
            onChange={(next) => {
              setLines(next);
              setToggled([]);
            }}
          />
          {changed ? (
            <div className="field-hint">Changed by hand from {LINES.find(([preset]) => preset === lines)?.[1]}. Choose a preset to start again.</div>
          ) : (
            lines === 'booktabs' && (
              <div className="field-hint">
                Booktabs rules are heavier at the top and bottom and take no vertical lines.{kind === 'typst' ? '' : ' Insert table adds the booktabs package.'}
              </div>
            )
          )}
          <div className="field">
            <span className="field-label" id={`${id}-lines-at`}>
              Lines at row {atRow + 1} and column {atCol + 1}
            </span>
            <div className="chip-row" role="group" aria-labelledby={`${id}-lines-at`}>
              {(
                [
                  [`Above row ${atRow + 1}`, 'h', atRow],
                  [`Below row ${atRow + 1}`, 'h', atRow + 1],
                  [`Before column ${atCol + 1}`, 'v', atCol],
                  [`After column ${atCol + 1}`, 'v', atCol + 1]
                ] as const
              ).map(([name, way, i], k) => (
                <button
                  key={k}
                  type="button"
                  className={`chip ${rules[way][i] ? 'active' : ''}`}
                  aria-pressed={!!rules[way][i]}
                  disabled={way === 'v' && lines === 'booktabs'}
                  onClick={() => flip(edges[way][i])}
                >
                  {name}
                  {rules[way][i] === 2 && ' (double)'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="field">
        <span className="field-label" id={`${id}-merge`}>
          {merged ? `Merged cells at row ${block.r + 1}, column ${block.c + 1}` : `Cell at row ${atRow + 1}, column ${atCol + 1}`}
        </span>
        <div className="chip-row" role="group" aria-labelledby={`${id}-merge`}>
          <button type="button" className="chip" disabled={block.c + block.cols >= cols || kind === 'markdown'} onClick={() => mergeBy(0, 1)}>
            Merge right
          </button>
          <button type="button" className="chip" disabled={block.r + block.rows >= cells.length || kind === 'markdown'} onClick={() => mergeBy(1, 0)}>
            Merge down
          </button>
          <button type="button" className="chip" disabled={!merged} onClick={() => setMerges((prev) => prev.filter((g) => !(g.r === block.r && g.c === block.c)))}>
            Split
          </button>
          {kind !== 'markdown' && (
            <button type="button" className={`chip ${shortRule ? 'active' : ''}`} aria-pressed={!!shortRule} disabled={block.r + block.rows >= cells.length} onClick={toggleShortRule}>
              Short rule below
            </button>
          )}
        </div>
        <div className="field-hint">
          {kind === 'markdown'
            ? 'Markdown tables can’t merge cells.'
            : latex
              ? `Merged cells use \\multicolumn, and \\multirow down the rows, which adds the multirow package. A short rule runs under just this cell’s columns, as a ${lines === 'booktabs' ? '\\cmidrule' : '\\cline'}, for a heading over a group of columns.`
              : 'Merged cells become table.cell with a colspan and rowspan. A short rule runs under just this cell’s columns, for a heading over a group of columns.'}
        </div>
      </div>
      {latex && (
        <>
          <Segmented
            label="Environment"
            value={env}
            options={ENVS}
            onChange={(next) => {
              setEnv(next);
              setChosen((prev) => (next === 'tabular' ? [] : prev));
            }}
          />
          {tableEnv !== 'tabular' && !align.includes('X') && <div className="field-hint">{tableEnv} needs an X column, so the last column that isn’t numbers fills the width.</div>}
          {long && (
            <div className="field-hint">
              xltabular breaks across pages and repeats the header row at the top of each. It holds its own caption, so it doesn’t float, and it can’t span both columns or take notes.
            </div>
          )}
          {align.includes('S') && (
            <div className="field-hint">
              Numbers (S) lines numbers up on their decimal point with siunitx, which is added. Type them without thousands separators: siunitx groups 7790 as 7,790 itself. Text in the column is kept as text.
            </div>
          )}
        </>
      )}
      <label className="checkbox-row">
        <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
        Header row
      </label>
      {latex && (
        <label className="checkbox-row">
          <input type="checkbox" checked={breaks} onChange={(e) => setBreaks(e.target.checked)} />
          <span>
            Line breaks in cells
            <span className="field-hint">Type \\ in a cell, or press Shift-{IS_WINDOWS ? 'Enter' : 'Return'}, to start a new line in it. Uses the makecell package, which is added.</span>
          </span>
        </label>
      )}
      {latex && (
        <label className="checkbox-row">
          <input type="checkbox" checked={withNotes} disabled={long} onChange={(e) => setWithNotes(e.target.checked)} />
          <span>
            Notes under the table
            <span className="field-hint">
              {long ? 'xltabular tables can’t take notes.' : 'Uses the threeparttable package, which is added, so the notes are as wide as the table.'}
            </span>
          </span>
        </label>
      )}
      {latex && withNotes && !long && (
        <div className="field">
          <label htmlFor={`${id}-notes`}>Notes</label>
          <textarea
            id={`${id}-notes`}
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={'a: Measured at noon.\nSource: the site logger.'}
          />
          <div className="field-hint">One note a line. Start a line with a: to make it the note for \tnote{'{a}'} typed in a cell.</div>
        </div>
      )}
      {latex && (
        <label className="checkbox-row">
          <input type="checkbox" checked={escape} onChange={(e) => setEscape(e.target.checked)} />
          <span>
            Escape special characters
            <span className="field-hint">&amp; % # _ ~ ^ &lt; &gt; | and a price’s $ print as themselves outside maths, in cells and the caption. Commands like \textbf{'{…}'} and \ref{'{…}'} still work.</span>
          </span>
        </label>
      )}
      <label className="checkbox-row">
        <input type="checkbox" checked={float} onChange={(e) => setFloat(e.target.checked)} />
        <span>
          Float
          <span className="field-hint">
            {kind === 'typst'
              ? 'Wraps it in #figure with a caption and a label.'
              : kind === 'markdown'
                ? 'Adds the caption and label on a Table: line under it.'
                : 'Wraps it in a table environment with a caption and a label.'}
          </span>
        </span>
      </label>
      {float && (
        <>
          {latex && !long && <PlacementField kind="table" value={placement} onChange={setPlacement} span={span} onSpan={setSpan} />}
          <div className="field">
            <label htmlFor={`${id}-caption`}>Caption</label>
            <textarea id={`${id}-caption`} className="input" rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Leave empty to write it later" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-label`}>Label</label>
            <input id={`${id}-label`} className="input" value={label ?? tableLabel(caption)} onChange={(e) => setLabel(e.target.value)} spellCheck={false} />
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor={`${id}-latex`}>Source</label>
        <textarea id={`${id}-latex`} className="input mono table-latex" readOnly wrap="off" rows={Math.min(16, text.split('\n').length)} value={text} />
      </div>
      <div className="row">
        <button className="btn" onClick={copy}>
          <Icon name="doc.on.doc" /> Copy
        </button>
        <button className="btn primary grow" onClick={insert} disabled={busy || !docOpen}>
          {busy ? <span className="spinner" /> : <Icon name="plus" />} Insert table
        </button>
      </div>
      {!docOpen && <div className="field-hint">{NOT_TEX}</div>}
      <TableHelp />
    </section>
  );
}

/** What each environment, column type, line and package does, for the table card. */
function TableHelp() {
  return (
    <details className="tool-help">
      <summary>What these options mean</summary>
      <dl>
        <dt>tabular</dt>
        <dd>
          LaTeX’s own table. Each column is as wide as its widest cell, so long text runs off the page unless it is short. Works everywhere, with no package. Best for tables of short
          entries and numbers.
        </dd>
        <dt>tabularx</dt>
        <dd>
          A table exactly as wide as the line. Its Fill (X) columns share out the width left over and wrap their text onto more lines, so it suits tables with sentences in them. Uses the{' '}
          <code>tabularx</code> package, which is added.
        </dd>
        <dt>xltabular</dt>
        <dd>
          Like tabularx, but the table can run over several pages: the header rows repeat at the top of each page, and each page but the last says it goes on. It holds its own caption, so it
          does not float. Uses the <code>xltabular</code> package (built on <code>longtable</code>), which is added. Use it only for long tables; a table that fits on a page is better
          as tabular or tabularx.
        </dd>
        <dt>Left, Centre, Right and Fill (X)</dt>
        <dd>How the text in a column lines up. Fill (X) is for tabularx and xltabular: the column takes the spare width and wraps.</dd>
        <dt>Numbers (S)</dt>
        <dd>
          A column from the <code>siunitx</code> package that lines numbers up on their decimal point, so 12.5 sits over 3.25 and −4 over 120. Spectrum works out the column’s{' '}
          <code>table-format</code> (how many digits go before and after the point) from the numbers typed. Type numbers plainly, without commas: siunitx adds the thousands separator
          itself. Headings and other text in the column are kept as text.
        </dd>
        <dt>Booktabs, Grid, Minimal and None</dt>
        <dd>
          Booktabs draws the rules journals use (<code>\toprule</code>, <code>\midrule</code>, <code>\bottomrule</code>), heavier at the top and bottom, with no vertical lines, from the{' '}
          <code>booktabs</code> package. Grid draws <code>\hline</code> under every row and lines between columns. Minimal draws plain lines at the top, under the header and at the
          bottom. None draws no lines.
        </dd>
        <dt>Merged cells</dt>
        <dd>
          Merge right joins a cell with the one beside it, with <code>\multicolumn</code>, built into LaTeX. Merge down joins it with the one below, with <code>\multirow</code> from the{' '}
          <code>multirow</code> package, which is added. A line that would cross a merged cell stops either side of it.
        </dd>
        <dt>Short rule below</dt>
        <dd>
          A rule under only some columns, as under a heading that spans a group of them: <code>\cmidrule</code> with booktabs, slightly shortened at each end so neighbouring groups stay
          apart, or <code>\cline</code> otherwise.
        </dd>
        <dt>Line breaks in cells</dt>
        <dd>
          A <code>\\</code> in a cell starts a new line inside it, through <code>\makecell</code> from the <code>makecell</code> package. Without it, <code>\\</code> would end the
          whole row.
        </dd>
        <dt>Notes under the table</dt>
        <dd>
          Notes set under the table and as wide as it, from the <code>threeparttable</code> package. Mark a cell with <code>\tnote{'{a}'}</code> and start the note’s line with a: to
          match it.
        </dd>
        <dt>Float, placement and the float package</dt>
        <dd>
          A float is a table LaTeX may move to where it fits, with a caption and a label to refer to it by. Exactly here (<code>[H]</code>) stops it moving and uses the{' '}
          <code>float</code> package, which is added.
        </dd>
        <dt>Escape special characters</dt>
        <dd>Lets &amp; % # _ and the like print as themselves in cells. Turn it off to type LaTeX commands that use them.</dd>
      </dl>
    </details>
  );
}

// ─── Image → LaTeX ───

function ImageToLatex() {
  const api = useEditor();
  const [mode, setMode] = useState<VisionMode>('equation');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const take = (next: File | null | undefined) => {
    if (!next || !next.type.startsWith('image/')) return;
    setFile(next);
    setResult('');
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files?.[0]);
  };

  const onPaste = (e: ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    take(item.getAsFile());
  };

  const convert = async () => {
    if (!file) return;
    setBusy(true);
    setResult('');
    try {
      const res = await visionToLatex({ projectId: api.projectId, file, mode, prompt: prompt.trim() || VISION_HINTS[mode], llmConfig: api.llm.vision });
      if (!res.ok) throw new Error(res.error || 'The image couldn’t be read.');
      setResult(res.latex || '');
      if (res.assetPath) await api.refreshTree();
    } catch (err) {
      api.notify(`Couldn’t convert the image: ${errorText(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tool-card" onPaste={onPaste}>
      <div className="tool-card-title">
        <Icon name="text.viewfinder" /> Image → LaTeX
      </div>
      <div className="field">
        <label id="image-latex-mode">Convert to</label>
        <Select
          labelId="image-latex-mode"
          value={mode}
          options={VISION_MODES.map(([value, label]): [string, string] => [value, label])}
          onChange={(value) => {
            setMode(value as VisionMode);
            setResult('');
          }}
        />
      </div>
      <div
        className={`drop-zone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
        tabIndex={0}
        role={file ? undefined : 'button'}
        aria-label={file ? undefined : 'Choose an image'}
        onClick={() => !file && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !file && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {file ? (
          <div className="drop-preview">
            {preview && <img src={preview} alt="" />}
            <span className="drop-name">{file.name}</span>
            <button
              className="icon-btn"
              title="Remove image"
              aria-label="Remove image"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                setResult('');
              }}
            >
              <Icon name="xmark.circle.fill" />
            </button>
          </div>
        ) : (
          <>
            <Icon name="photo.badge.plus" size={28} />
            <span>Click to choose, drag in or paste an image</span>
          </>
        )}
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
      </div>
      <div className="field">
        <label htmlFor="image-latex-prompt">Extra instructions (optional)</label>
        <textarea
          id="image-latex-prompt"
          className="input"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. only the tabular, no caption"
        />
      </div>
      <div className="row">
        <button className="btn primary" onClick={convert} disabled={busy || !file}>
          {busy ? <span className="spinner" /> : <Icon name="text.viewfinder" />} Convert
        </button>
        <button className="btn" onClick={() => api.insertAtCursor(result, { block: true })} disabled={!result}>
          Insert at cursor
        </button>
      </div>
      {result && (
        <div className="field">
          <label htmlFor="image-latex-result">Result (editable)</label>
          <textarea id="image-latex-result" className="input mono" rows={7} value={result} onChange={(e) => setResult(e.target.value)} />
        </div>
      )}
    </section>
  );
}

// ─── Table → chart ───

function TableToChart() {
  const api = useEditor();
  const [type, setType] = useState<'bar' | 'line' | 'heatmap'>('bar');
  const [title, setTitle] = useState('');
  const [filename, setFilename] = useState('');
  const [prompt, setPrompt] = useState('');
  const [retries, setRetries] = useState(2);
  const [autoInsert, setAutoInsert] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [asset, setAsset] = useState<{ path: string; at: number } | null>(null);
  const table = api.selectionText;
  const hasTable = table.includes('\\begin{tabular') || table.includes('\\begin{table');

  const generate = async () => {
    if (!hasTable) {
      setStatus('Select a LaTeX table (tabular) in the editor first.');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      const res = await plotFromTable({
        projectId: api.projectId,
        tableLatex: table,
        chartType: type,
        title: title.trim() || undefined,
        prompt: prompt.trim() || undefined,
        filename: filename.trim() || undefined,
        retries,
        llmConfig: api.llm.main
      });
      if (!res.ok || !res.assetPath) throw new Error(res.error || 'The chart couldn’t be made.');
      setAsset({ path: res.assetPath, at: Date.now() });
      setStatus(`Chart saved to ${res.assetPath}.`);
      await api.refreshTree();
      // after the selected table, not over it
      if (autoInsert) api.insertAtCursor(figureSnippet(res.assetPath), { block: true, afterSelection: true });
    } catch (err) {
      setStatus(`Couldn’t make the chart: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tool-card">
      <div className="tool-card-title">
        <Icon name="chart.bar.xaxis" /> Table → chart
      </div>
      <div className="tool-card-desc">Plots the table selected in the editor with matplotlib/seaborn and saves the image in the project.</div>
      <div className="field">
        <label id="plot-type">Chart type</label>
        <Select
          labelId="plot-type"
          value={type}
          options={[
            ['bar', 'Bar'],
            ['line', 'Line'],
            ['heatmap', 'Heat map']
          ]}
          onChange={(value) => setType(value as typeof type)}
        />
      </div>
      <div className="field">
        <label htmlFor="plot-title">Title (optional)</label>
        <input id="plot-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chart title" />
      </div>
      <div className="field">
        <label htmlFor="plot-filename">File name (optional)</label>
        <input id="plot-filename" className="input" value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="plot.png" />
      </div>
      <div className="field">
        <label htmlFor="plot-prompt">Extra instructions (optional)</label>
        <textarea
          id="plot-prompt"
          className="input"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. highlight Method A, add a legend, label the y-axis Accuracy"
        />
      </div>
      <div className="row spread">
        <label htmlFor="plot-retries">Retries if the plot code fails</label>
        <input
          id="plot-retries"
          className="input number"
          type="number"
          min={0}
          max={5}
          value={retries}
          onChange={(e) => setRetries(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
        />
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={autoInsert} onChange={(e) => setAutoInsert(e.target.checked)} />
        Insert a figure after the table
      </label>
      <button className="btn primary full" onClick={generate} disabled={busy}>
        {busy ? <span className="spinner" /> : <Icon name="chart.bar.xaxis" />} Make chart
      </button>
      {!hasTable && <div className="field-hint">Select a table in the editor to plot it.</div>}
      <div className="field-hint" role="status">
        {status}
      </div>
      {asset && (
        <div className="plot-preview">
          <img src={blobUrl(api.projectId, asset.path, asset.at)} alt={asset.path} />
          <button className="btn small" onClick={() => api.insertAtCursor(figureSnippet(asset.path), { block: true, afterSelection: true })}>
            Insert figure
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Project figures ───

function ProjectFigures() {
  const api = useEditor();
  const [open, setOpen] = useState('');

  return (
    <section className="tool-card">
      <div className="tool-card-title">
        <Icon name="photo.on.rectangle" /> Project figures
      </div>
      {!api.figureFiles.length && <div className="field-hint">No images in this project yet.</div>}
      <div className="figure-grid">
        {api.figureFiles.map((path) => (
          <button key={path} className="figure-tile" title={path} onClick={() => setOpen(path)}>
            <span className="figure-thumb">
              {IMAGE_EXTS.test(path) ? <img src={blobUrl(api.projectId, path)} alt="" loading="lazy" /> : <Icon name="doc.richtext" size={28} />}
            </span>
            <span className="figure-name">{path.split('/').pop()}</span>
          </button>
        ))}
      </div>
      {open && (
        <Sheet
          title={open}
          onClose={() => setOpen('')}
          width={760}
          actions={
            <button
              className="btn primary"
              onClick={() => {
                // into Insert figure, for its caption, width and placement
                showFigure(open);
                setOpen('');
              }}
            >
              <Icon name="plus" /> Insert figure…
            </button>
          }
        >
          <div className="figure-large">
            {IMAGE_EXTS.test(open) ? (
              <img src={blobUrl(api.projectId, open)} alt={open} />
            ) : open.toLowerCase().endsWith('.pdf') ? (
              <object data={blobUrl(api.projectId, open)} type="application/pdf" aria-label={open} />
            ) : (
              <div className="tool-empty">This kind of file can’t be previewed here. You can still insert it as a figure.</div>
            )}
          </div>
        </Sheet>
      )}
    </section>
  );
}
