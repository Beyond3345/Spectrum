import { useId, useState } from 'react';
import { addReference, arxivSearch, callLLM, runAgent, suggestCitations, webSearch } from '../../api/client';
import type { ArxivPaper, CitationSuggestion, SearchProvider } from '../../api/client';
import Icon from '../../app/Icon';
import Select from '../../app/Select';
import { useEditor } from '../EditorContext';
import { errorText, extractBibKey, insertBeforeEnd, isTex, parseJsonReply, patchesToChanges } from '../shared';

const PROVIDERS: Record<SearchProvider, string> = {
  llm: 'the model’s built-in web search',
  openalex: 'OpenAlex',
  semanticscholar: 'Semantic Scholar',
  serpapi: 'SerpApi',
  tavily: 'Tavily',
  brave: 'Brave Search'
};

/** .bib picker shared by the arXiv and web search sections, with a "New .bib" button. */
function BibPicker({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const api = useEditor();
  // used by two sections at once, so the id can’t be fixed
  const labelId = useId();
  return (
    <div className="field">
      <label id={labelId}>Bibliography file</label>
      <div className="row">
        <Select
          labelId={labelId}
          value={value}
          options={[['', 'Automatic (references.bib)'], ...api.bibFiles.map((p): [string, string] => [p, p])]}
          onChange={onChange}
        />
        <button
          className="icon-btn"
          title="New .bib file"
          aria-label="New .bib file"
          onClick={async () => {
            try {
              onChange(await api.createBibFile());
            } catch (err) {
              api.notify(`Couldn’t create the .bib file: ${errorText(err)}`, 'error');
            }
          }}
        >
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}

export default function ResearchTab() {
  return (
    <div className="tool-page">
      <CitationAssistant />
      <ArxivSearch />
      <WebSearch />
    </div>
  );
}

// ─── Citation assistant ───

/** Finds papers that support the selected passage, writes the chosen ones to the .bib and cites them. */
function CitationAssistant() {
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
      const res = await suggestCitations({ text: selection, llmConfig: api.llm.search, maxResults: 5 });
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
    try {
      const { target, keys } = await api.writeBibEntries(chosen.map((p) => p.bibtex));
      if (keys.length && isTex(api.activePath)) api.insertAtCursor(`~\\cite{${keys.join(',')}}`, { afterSelection: true });
      setStatus(`Added ${keys.length} ${keys.length === 1 ? 'reference' : 'references'} to ${target}.`);
    } catch (err) {
      setStatus(`Couldn’t write the references: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tool-card">
      <div className="tool-card-title">
        <Icon name="quote.opening" /> Citation assistant
      </div>
      <div className="tool-card-desc">Select a passage and find papers that support it, with BibTeX ready to add.</div>
      <button className="btn primary full" onClick={run} disabled={busy || !selection}>
        {busy ? <span className="spinner" /> : <Icon name="sparkle.magnifyingglass" />} Find citations for the selection
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
                  <div className="pick-meta">{[paper.authors?.slice(0, 3).join(', '), paper.year].filter(Boolean).join(' · ')}</div>
                  {paper.reason && <div className="pick-reason">{paper.reason}</div>}
                  {paper.url && (
                    <a className="pick-link" href={paper.url} target="_blank" rel="noreferrer">
                      {paper.url}
                    </a>
                  )}
                </div>
              </label>
            ))}
          </div>
          <button className="btn full" onClick={insert} disabled={busy}>
            <Icon name="text.badge.plus" /> Add to .bib and insert \cite
          </button>
        </>
      )}
    </section>
  );
}

// ─── arXiv search ───

function ArxivSearch() {
  const api = useEditor();
  const [query, setQuery] = useState('');
  const [maxResults, setMaxResults] = useState(5);
  const [useLlm, setUseLlm] = useState(false);
  const [llmOutput, setLlmOutput] = useState('');
  const [results, setResults] = useState<ArxivPaper[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [bibTarget, setBibTarget] = useState('');
  const [autoCite, setAutoCite] = useState(api.settings.autoInsertCite);
  const [aiInsert, setAiInsert] = useState(false);
  const [citeTarget, setCiteTarget] = useState('');

  const search = async () => {
    const q = query.trim();
    if (!q) {
      setStatus('Type something to search for.');
      return;
    }
    setBusy(true);
    setStatus('');
    setSelected({});
    try {
      let papers: ArxivPaper[];
      if (useLlm) {
        setLlmOutput('');
        const res = await runAgent({
          task: 'websearch',
          prompt: [
            'Search arXiv for the user query.',
            `Return at most ${maxResults} papers.`,
            'Use arxiv_search and arxiv_bibtex tools.',
            'Return JSON ONLY in this schema:',
            '{"papers":[{"title":"","authors":[],"arxivId":"","bibtex":""}]}.'
          ].join(' '),
          selection: '',
          content: q,
          mode: 'tools',
          projectId: api.projectId,
          activePath: api.activePath,
          compileLog: api.compileLog,
          llmConfig: api.llm.search,
          interaction: 'agent',
          history: [],
          reasoningEffort: api.settings.reasoningEffort
        });
        // a failed run carries its error in reply, not JSON
        if (!res.ok) throw new Error(res.reply || 'The search model didn’t answer.');
        setLlmOutput(res.reply || '');
        const parsed = parseJsonReply<{ papers?: { title?: string; authors?: string[]; arxivId: string }[] }>(res.reply || '');
        if (!parsed) throw new Error('The model’s answer couldn’t be read as JSON.');
        papers = (parsed.papers || [])
          .filter((p) => p.arxivId)
          .map((p) => ({ title: p.title || '(untitled)', abstract: '', authors: p.authors || [], url: `https://arxiv.org/abs/${p.arxivId}`, arxivId: p.arxivId }));
      } else {
        const res = await arxivSearch({ query: q, maxResults });
        if (!res.ok) throw new Error(res.error || 'Search failed.');
        papers = res.papers || [];
      }
      setResults(papers);
      if (!papers.length) setStatus('No matches.');
    } catch (err) {
      setStatus(`Search failed: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  // goes through the references resolver so keys follow AuthorYear and duplicates are caught
  const apply = async () => {
    const chosen = results.filter((p) => selected[p.arxivId]);
    if (!chosen.length) {
      setStatus('Select at least one paper.');
      return;
    }
    setBusy(true);
    setStatus('Adding to the bibliography…');
    const keys: string[] = [];
    const failed: string[] = [];
    let bibFile = bibTarget;
    let bibIncluded = true;
    let added = false;
    try {
      for (const paper of chosen) {
        try {
          const res = await addReference({ projectId: api.projectId, candidateId: paper.arxivId, bibFile: bibFile || undefined });
          if (!res.ok) throw new Error(res.error || 'Lookup failed.');
          bibFile = res.bibFile;
          bibIncluded = res.bibIncluded;
          const r = res.result;
          if ((r.status === 'added' || r.status === 'duplicate') && r.key) {
            keys.push(r.key);
            added ||= r.status === 'added';
          } else {
            failed.push(`${paper.arxivId}${r.message ? ` (${r.message})` : ''}`);
          }
        } catch (err) {
          failed.push(`${paper.arxivId} (${errorText(err)})`);
        }
      }
      if (added) {
        if (!api.bibFiles.includes(bibFile)) await api.refreshTree();
        await api.reloadFiles([bibFile]);
      }
      const notes = [keys.length ? `Added ${keys.join(', ')} to ${bibFile}.` : 'Nothing was added.'];
      if (failed.length) notes.push(`Couldn’t add ${failed.join('; ')}.`);
      if (keys.length && !bibIncluded) notes.push(`${bibFile} isn’t included in ${api.mainFile || 'the main file'} yet.`);

      if (autoCite && keys.length) {
        const line = isTex(api.activePath) ? api.insertAtCursor(`\\cite{${keys.join(',')}}`, { afterSelection: true, placedOnly: true }) : null;
        if (line) notes.push(`Inserted the citation in ${api.activePath.split('/').pop()}, line ${line}.`);
        else notes.push(isTex(api.activePath) ? 'Click in the document where the citation goes, then try again.' : 'Open a .tex file to insert the citation.');
      }

      if (aiInsert && keys.length) {
        const targetFile = citeTarget || api.mainFile;
        if (!targetFile) {
          notes.push('Choose a file for the AI to add the citations to.');
        } else {
          setStatus(`${notes.join(' ')} Asking the AI to cite them in ${targetFile}…`);
          const papers = chosen.map((p) => ({ title: p.title, arxivId: p.arxivId }));
          const res = await runAgent({
            task: 'insert_citations',
            prompt: [
              'Insert citations into the target TeX file.',
              `Target file: ${targetFile}.`,
              `Use \\cite{${keys.join(',')}}.`,
              'If a Related Work section exists, add the citations there.',
              'Otherwise add a Related Work subsection near the end and cite the papers.',
              'Keep edits minimal and preserve formatting.',
              `Papers: ${JSON.stringify(papers)}`
            ].join(' '),
            selection: '',
            content: await api.ensureFileContent(targetFile),
            mode: 'tools',
            projectId: api.projectId,
            activePath: targetFile,
            compileLog: api.compileLog,
            llmConfig: api.llm.search,
            interaction: 'agent',
            history: [],
            reasoningEffort: api.settings.reasoningEffort
          });
          const changes = await patchesToChanges(api, res.patches || [], 'Insert citations');
          if (changes.length) {
            api.proposeChanges(changes, { open: true });
            notes.push('Suggested citation edits are ready to review.');
          } else if (!res.ok) {
            notes.push(`The AI couldn’t add the citations: ${res.reply || 'the request failed.'}`);
          } else {
            notes.push('The AI didn’t suggest any edits.');
          }
        }
      }
      setStatus(notes.join(' '));
    } catch (err) {
      setStatus(`Something went wrong: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tool-card">
      <div className="tool-card-title">
        <Icon name="books.vertical" /> arXiv search
      </div>
      <div className="search-row">
        <div className="search-field">
          <Icon name="magnifyingglass" />
          <input
            aria-label="Search arXiv"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && search()}
            placeholder="e.g. diffusion transformer compression"
          />
        </div>
        <input
          className="input number"
          type="number"
          min={1}
          max={10}
          title="Number of results"
          aria-label="Number of results"
          value={maxResults}
          onChange={(e) => setMaxResults(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
        />
        <button className="btn" onClick={search} disabled={busy}>
          {busy ? <span className="spinner" /> : 'Search'}
        </button>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
        Search with the AI search model
      </label>
      {llmOutput && (
        <details className="raw-output">
          <summary>Model output</summary>
          <pre>{llmOutput}</pre>
        </details>
      )}
      {results.length > 0 && (
        <div className="pick-list">
          {results.map((paper) => (
            <label key={paper.arxivId} className="pick-item">
              <input
                type="checkbox"
                checked={Boolean(selected[paper.arxivId])}
                onChange={(e) => setSelected((prev) => ({ ...prev, [paper.arxivId]: e.target.checked }))}
              />
              <div className="pick-body">
                <div className="pick-title">{paper.title}</div>
                <div className="pick-meta">{paper.authors?.join(', ') || 'Unknown authors'}</div>
                <a className="pick-link" href={paper.url || `https://arxiv.org/abs/${paper.arxivId}`} target="_blank" rel="noreferrer">
                  {paper.arxivId}
                </a>
              </div>
            </label>
          ))}
        </div>
      )}
      {results.length > 0 && (
        <>
          <BibPicker value={bibTarget} onChange={setBibTarget} />
          <label className="checkbox-row">
            <input type="checkbox" checked={autoCite} onChange={(e) => setAutoCite(e.target.checked)} />
            Insert \cite at the cursor
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={aiInsert} onChange={(e) => setAiInsert(e.target.checked)} />
            Let the AI add the citations to a file
          </label>
          {aiInsert && (
            <div className="field">
              <label id="arxiv-cite-target">File to cite in</label>
              <Select
                labelId="arxiv-cite-target"
                value={citeTarget || api.mainFile}
                options={api.texFiles.map((p): [string, string] => [p, p])}
                onChange={setCiteTarget}
                placeholder="Choose a .tex file"
              />
            </div>
          )}
          <button className="btn primary full" onClick={apply} disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="text.badge.plus" />} Add to .bib and cite
          </button>
        </>
      )}
      <div className="field-hint" role="status">
        {status}
      </div>
    </section>
  );
}

// ─── Web search ───

interface WebItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  bibtex: string;
  citeKey: string;
}

function WebSearch() {
  const api = useEditor();
  const { settings } = api;
  const [query, setQuery] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<WebItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [paragraph, setParagraph] = useState('');
  const [targetFile, setTargetFile] = useState('');
  const [targetBib, setTargetBib] = useState('');
  const say = (line: string) => setLog((prev) => [...prev, line]);
  const llmConfig = api.llm.search;

  const run = async () => {
    const q = query.trim();
    if (!q) {
      setLog(['Type something to search for.']);
      return;
    }
    setBusy(true);
    setLog([]);
    setResults([]);
    setSelected({});
    setParagraph('');
    setNotes({});
    try {
      const provider = settings.searchProvider;
      say('Splitting the question into searches…');
      const split = await callLLM({
        llmConfig,
        reasoningEffort: 'fast',
        messages: [
          { role: 'system', content: 'Split the query into 2-4 targeted search queries. Return JSON only: {"queries":["..."]}.' },
          { role: 'user', content: `User query: ${q}` }
        ]
      }).catch((err) => ({ ok: false, error: errorText(err), content: '' }));
      let queries = ((split.ok && split.content && parseJsonReply<{ queries?: string[] }>(split.content)?.queries) || []).filter(Boolean).slice(0, 4);
      if (!queries.length) {
        if (provider === 'llm') throw new Error(split.error || 'Couldn’t split the query.');
        // a search provider can still run the question as typed
        say('Couldn’t split the query; searching for it as typed.');
        queries = [q];
      }
      say(`Searching in parallel: ${queries.join(' | ')}`);
      const found: WebItem[] = [];
      await Promise.all(
        queries.map(async (sub, qi) => {
          say(`Searching: ${sub}`);
          if (provider !== 'llm') {
            const res = await webSearch({ query: sub, provider, apiKey: settings.searchProviderKey || undefined, engine: settings.serpEngine, maxResults: 5 }).catch(
              (err) => ({ ok: false, error: errorText(err), results: [] })
            );
            if (!res.ok) {
              say(`Search failed: ${sub} (${res.error})`);
              return;
            }
            (res.results || []).forEach((item, i) =>
              found.push({
                id: `${qi}-${i}-${item.url || item.title}`,
                title: item.title || 'Untitled',
                summary: item.summary || '',
                url: item.url || '',
                bibtex: item.bibtex || '',
                citeKey: item.bibtex ? extractBibKey(item.bibtex) : ''
              })
            );
            say(`Done: ${sub} (${res.results?.length || 0})`);
            return;
          }
          const res = await callLLM({
            llmConfig,
            messages: [
              {
                role: 'system',
                content: 'You are a search assistant. Use the provider search. Return JSON only: {"results":[{"title":"","summary":"","url":"","bibtex":""}]}.'
              },
              { role: 'user', content: `Search for: ${sub}` }
            ]
          }).catch((err) => ({ ok: false, error: errorText(err), content: '' }));
          if (!res.ok || !res.content) {
            say(`Search failed: ${sub}`);
            return;
          }
          const parsed = parseJsonReply<{ results?: { title?: string; summary?: string; url?: string; bibtex?: string }[] }>(res.content);
          if (!parsed) {
            say(`Couldn’t read the results for: ${sub}`);
            return;
          }
          (parsed.results || []).forEach((item, i) => {
            const bibtex = (item.bibtex || '').replace(/\\n/g, '\n');
            found.push({
              id: `${qi}-${i}-${item.url || item.title || 'result'}`,
              title: item.title || 'Untitled',
              summary: item.summary || '',
              url: item.url || '',
              bibtex,
              citeKey: bibtex ? extractBibKey(bibtex) : ''
            });
          });
          say(`Done: ${sub} (${parsed.results?.length || 0})`);
        })
      );
      const unique = found.filter(
        (item, i) => found.findIndex((d) => (d.url && d.url === item.url) || d.title === item.title) === i
      );
      setResults(unique);
      say(`${unique.length} results in total.`);
      if (!unique.length) return;

      say('Summarising each paper…');
      const summaries = await callLLM({
        llmConfig,
        messages: [
          {
            role: 'system',
            content: 'You are a paper search assistant. Write a 1-2 sentence summary for each paper. Return JSON: {"summaries":[{"id":"","summary":""}]}.'
          },
          { role: 'user', content: JSON.stringify({ papers: unique.map(({ id, title, summary, url, citeKey }) => ({ id, title, summary, url, citeKey })) }) }
        ]
      }).catch((err) => ({ ok: false, error: errorText(err), content: '' }));
      const parsedSummaries = summaries.ok && summaries.content ? parseJsonReply<{ summaries?: { id: string; summary: string }[] }>(summaries.content) : null;
      if (parsedSummaries?.summaries?.length) {
        setNotes(Object.fromEntries(parsedSummaries.summaries.filter((s) => s.id && s.summary).map((s) => [s.id, s.summary.trim()])));
        say('Summaries ready.');
      } else {
        say('Couldn’t summarise the papers.');
      }

      say('Writing an overall summary…');
      const overall = await callLLM({
        llmConfig,
        messages: [
          { role: 'system', content: 'Generate a 3-5 sentence overall summary (no bullet points). You may use \\cite{...}. Return only the text.' },
          {
            role: 'user',
            content: JSON.stringify({
              query: q,
              papers: unique.map(({ title, summary, url }) => ({ title, summary, url })),
              citeKeys: unique.map((item) => item.citeKey).filter(Boolean)
            })
          }
        ]
      }).catch((err) => ({ ok: false, error: errorText(err), content: '' }));
      if (overall.ok && overall.content) {
        setParagraph(overall.content.trim());
        say('Overall summary ready.');
      } else {
        say('Couldn’t write the overall summary.');
      }
    } catch (err) {
      say(`Error: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const chosen = results.filter((item) => selected[item.id]);

  const apply = async () => {
    if (!chosen.length) {
      say('Select at least one result.');
      return;
    }
    setBusy(true);
    try {
      const entries = chosen.map((item) => item.bibtex).filter(Boolean);
      if (entries.length) {
        const { target } = await api.writeBibEntries(entries, targetBib || undefined);
        say(`References written to ${target}.`);
      }
      const items = chosen.map((item) => `  \\item ${notes[item.id] || item.summary || item.title}${item.citeKey ? ` \\cite{${item.citeKey}}` : ''}`);
      const block = [
        `\\paragraph{Summary of each paper}\n\\begin{itemize}\n${items.join('\n')}\n\\end{itemize}`,
        paragraph && `\\paragraph{Overall summary}\n${paragraph}`
      ]
        .filter(Boolean)
        .join('\n\n');
      const file = targetFile || api.mainFile || api.activePath;
      if (isTex(file)) {
        const original = await api.ensureFileContent(file);
        api.proposeChanges([{ filePath: file, original, proposed: insertBeforeEnd(original, block), source: 'Web search summary' }], { open: true });
        say(`Summary ready to review for ${file}.`);
      } else if (isTex(api.activePath)) {
        api.insertAtCursor(block, { block: true });
        say('Summary inserted at the cursor.');
      } else {
        say('Open or choose a .tex file for the summary.');
      }
    } catch (err) {
      say(`Error: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tool-card">
      <div className="tool-card-title">
        <Icon name="globe" /> Web search
      </div>
      <div className="search-field">
        <Icon name="magnifyingglass" />
        <input
          aria-label="Search the web"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && run()}
          placeholder="e.g. diffusion editing for safety"
        />
      </div>
      <div className="field-hint">Source: {PROVIDERS[settings.searchProvider]} (change it in Settings)</div>
      <button className="btn primary full" onClick={run} disabled={busy}>
        {busy ? <span className="spinner" /> : <Icon name="magnifyingglass" />} Search
      </button>
      <div role="log">
        {log.length > 0 && (
          <div className="search-log">
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>
      {results.length > 0 && (
        <>
          <div className="row spread">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={chosen.length === results.length}
                onChange={(e) => setSelected(Object.fromEntries(results.map((item) => [item.id, e.target.checked])))}
              />
              Select all
            </label>
            <button
              className="btn small"
              disabled={!chosen.some((item) => item.citeKey)}
              onClick={() => {
                const keys = chosen.map((item) => item.citeKey).filter(Boolean);
                api.insertAtCursor(`\\cite{${keys.join(',')}}`, { afterSelection: true });
                say('Selected citations inserted at the cursor.');
              }}
            >
              Insert selected \cite
            </button>
          </div>
          <div className="pick-list">
            {results.map((item) => (
              <div key={item.id} className="pick-item">
                <input
                  type="checkbox"
                  aria-label={item.title}
                  checked={Boolean(selected[item.id])}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                />
                <div className="pick-body">
                  <div className="pick-title">{item.title}</div>
                  {item.url && (
                    <a className="pick-link" href={item.url} target="_blank" rel="noreferrer">
                      {item.url}
                    </a>
                  )}
                  {item.citeKey && <div className="pick-meta">Key: {item.citeKey}</div>}
                  <textarea
                    className="input"
                    rows={3}
                    aria-label={`Summary of ${item.title}`}
                    value={notes[item.id] ?? item.summary}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  />
                </div>
                <button
                  className="icon-btn"
                  title="Insert \cite"
                  aria-label="Insert citation"
                  disabled={!item.citeKey}
                  onClick={() => api.insertAtCursor(`\\cite{${item.citeKey}}`, { afterSelection: true })}
                >
                  <Icon name="text.insert" />
                </button>
              </div>
            ))}
          </div>
          {paragraph && (
            <div className="field">
              <label htmlFor="web-overall-summary">Overall summary</label>
              <textarea id="web-overall-summary" className="input" rows={6} value={paragraph} onChange={(e) => setParagraph(e.target.value)} />
            </div>
          )}
          <BibPicker value={targetBib} onChange={setTargetBib} />
          <div className="field">
            <label id="web-summary-target">Add the summary to</label>
            <Select
              labelId="web-summary-target"
              value={targetFile || api.mainFile}
              options={api.texFiles.map((p): [string, string] => [p, p])}
              onChange={setTargetFile}
              placeholder="Choose a .tex file"
            />
          </div>
          <button className="btn primary full" onClick={apply} disabled={busy || !chosen.length}>
            <Icon name="text.badge.plus" /> Add to .bib and insert the summary
          </button>
        </>
      )}
    </section>
  );
}
