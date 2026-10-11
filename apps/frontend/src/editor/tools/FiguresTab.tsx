import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent } from 'react';
import { blobUrl, plotFromTable, visionToLatex } from '../../api/client';
import Icon from '../../app/Icon';
import Select from '../../app/Select';
import Sheet from '../../app/Sheet';
import { useEditor } from '../EditorContext';
import { VISION_HINTS, VISION_MODES, errorText, figureSnippet } from '../shared';
import type { VisionMode } from '../shared';

const IMAGE_EXTS = /\.(png|jpe?g|gif|svg|webp)$/i;

export default function FiguresTab() {
  return (
    <div className="tool-page">
      <ImageToLatex />
      <TableToChart />
      <ProjectFigures />
    </div>
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
                api.insertAtCursor(figureSnippet(open), { block: true });
                setOpen('');
              }}
            >
              <Icon name="plus" /> Insert figure
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
