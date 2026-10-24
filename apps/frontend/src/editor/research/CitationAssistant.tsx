import { useState } from 'react';
import { addReference, suggestCitations } from '../../api/client';
import type { CitationSuggestion } from '../../api/client';
import Icon from '../../app/Icon';
import { searchConfigFor } from '../../app/settings';
import { useEditor } from '../EditorContext';
import type { EditorApi } from '../EditorContext';
import { citationText, errorText, isTex } from '../shared';
import { metaLine } from './results';

/** After the backend wrote to a .bib: the tree learns of a new one, and the editor rereads it. */
export async function bibWritten(api: EditorApi, bibFile: string) {
  if (!api.bibFiles.includes(bibFile)) await api.refreshTree();
  await api.reloadFiles([bibFile]);
}

/**
 * Finds papers that support the selected passage. The chosen ones go through the references resolver one by one
 * (by DOI, arXiv ID or link), so a paper already in a .bib keeps its key, and the citation goes in after the selection.
 */
export default function CitationAssistant() {
  const api = useEditor();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [queries, setQueries] = useState<string[]>([]);
  const [papers, setPapers] = useState<CitationSuggestion[]>([]);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const selection = api.selectionText.trim();

  const run = async () => {
    setBusy(true);
    setStatus('');
    setPapers([]);
    try {
      const res = await suggestCitations({ text: selection, llmConfig: api.llm.search, searchConfig: searchConfigFor(api.settings, api.llm.search), maxResults: 5 });
      if (!res.ok) throw new Error(res.error);
      setQueries(res.queries || []);
      setPapers(res.papers || []);
      setPicked(Object.fromEntries((res.papers || []).map((_, i) => [i, true])));
      if (!res.papers?.length) setStatus('No suitable papers found.');
    } catch (err) {
      setStatus(`Search failed: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const insert = async () => {
    const chosen = papers.filter((_, i) => picked[i]);
    if (!chosen.length) return;
    setBusy(true);
    setStatus('Adding to the bibliography…');
    const keys: string[] = [];
    const failed: string[] = [];
    let bibFile = '';
    let bibIncluded = true;
    let added = false;
    try {
      for (const paper of chosen) {
        const candidate = paper.doi || paper.arxiv || paper.url;
        if (!candidate) {
          failed.push(`“${paper.title}” (no DOI, arXiv ID or link)`);
          continue;
        }
        try {
          const res = await addReference({ projectId: api.projectId, candidateId: candidate, bibFile: bibFile || undefined, searchConfig: searchConfigFor(api.settings, api.llm.search) });
          ({ bibFile, bibIncluded } = res);
          const r = res.result;
          if ((r.status === 'added' || r.status === 'duplicate') && r.key) {
            if (!keys.includes(r.key)) keys.push(r.key);
            added ||= r.status === 'added';
          } else failed.push(`“${paper.title}”${r.message ? ` (${r.message})` : ''}`);
        } catch (err) {
          failed.push(`“${paper.title}” (${errorText(err)})`);
        }
      }
      if (added) await bibWritten(api, bibFile);
      const notes = [keys.length ? `Cited ${keys.join(', ')} from ${bibFile}.` : 'Nothing was added.'];
      if (keys.length) {
        if (isTex(api.activePath)) api.insertAtCursor('~' + (await citationText(api, keys)), { afterSelection: true });
        else notes[0] = `Added ${keys.join(', ')} to ${bibFile}. Open a .tex file to cite them.`;
        if (!bibIncluded) notes.push(`${bibFile} isn’t included in ${api.mainFile || 'the main file'} yet.`);
      }
      if (failed.length) notes.push(`Couldn’t add ${failed.join('; ')}.`);
      setStatus(notes.join(' '));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="research-card">
      <summary className="research-card-title">
        <Icon name="quote.opening" /> Find citations for selection
        <Icon name="chevron.right" className="disclosure" />
      </summary>
      <div className="research-card-body">
        <div className="field-hint">Select a passage, and the AI looks for papers that support it.</div>
        <button className="btn small full" onClick={run} disabled={busy || !selection}>
          {busy ? <span className="spinner" /> : <Icon name="sparkle.magnifyingglass" />} Find citations
        </button>
        {!selection && <div className="field-hint">Select some text in the editor first.</div>}
        {queries.length > 0 && <div className="field-hint">Searched for: {queries.join(' · ')}</div>}
        <div className="field-hint" role="status">
          {status}
        </div>
        {papers.length > 0 && (
          <>
            <div className="pick-list">
              {papers.map((paper, i) => (
                <label key={`${paper.title}-${i}`} className="pick-item">
                  <input type="checkbox" checked={Boolean(picked[i])} onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))} />
                  <div className="pick-body">
                    <div className="pick-title">{paper.title}</div>
                    <div className="pick-meta">{metaLine(paper)}</div>
                    {paper.reason && <div className="pick-reason">{paper.reason}</div>}
                  </div>
                </label>
              ))}
            </div>
            <button className="btn small primary full" onClick={insert} disabled={busy}>
              <Icon name="text.badge.plus" /> Add to .bib and cite
            </button>
          </>
        )}
      </div>
    </details>
  );
}
