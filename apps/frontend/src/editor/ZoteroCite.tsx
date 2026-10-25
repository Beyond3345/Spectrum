import { useEffect, useRef, useState } from 'react';
import { renameCiteKeys } from '../../../backend/src/latex/text.js';
import { addFromZotero, cancelZotero, pickFromZotero, searchZotero, zoteroStatus } from '../api/client';
import type { ReferenceResult, ZoteroHit } from '../api/client';
import Icon from '../app/Icon';
import Sheet from '../app/Sheet';
import { useEditor } from './EditorContext';
import type { EditorApi } from './EditorContext';
import { citationText, errorText, isTex, mainCitationCommand, reloadBib } from './shared';
import { ZOTERO_CITE, hitDetail } from './zotero';

type Added = { results: ReferenceResult[]; bibFile: string; bibIncluded: boolean };

/** "Cited \parencite{a}. Added 1 entry to refs.bib.", with what went wrong. */
function citedMessage(cite: string, { results, bibFile, bibIncluded }: Added) {
  const added = results.filter((r) => r.status === 'added').length;
  return [
    `Cited ${cite}.`,
    added && `Added ${added} ${added === 1 ? 'entry' : 'entries'} to ${bibFile}.`,
    !bibIncluded && `${bibFile} isn’t loaded by the document yet.`,
    results.find((r) => r.status === 'error')?.message
  ]
    .filter(Boolean)
    .join(' ');
}

/** The citation at the cursor of a .tex file; elsewhere (the user moved on while Zotero asked) it's copied instead. */
function place(api: EditorApi, cite: string) {
  if (isTex(api.activePath)) {
    api.insertAtCursor(cite, { afterSelection: true });
    return true;
  }
  navigator.clipboard.writeText(cite).catch(() => undefined);
  api.notify(`Copied ${cite}. Paste it where the citation goes.`);
  return false;
}

/** An item picked from \cite completion into the .bib: the key it went in under there, or null when it didn't. */
export async function addZoteroHit(api: EditorApi, hit: ZoteroHit) {
  try {
    const res = await addFromZotero(api.projectId, [hit.itemKey]);
    const [r] = res.results;
    await reloadBib(api, res.results, res.bibFile);
    if (r?.key && (r.status === 'added' || r.status === 'duplicate')) {
      if (r.status === 'added') api.notify(`Added ${r.key} to ${res.bibFile} from Zotero.`);
      return r.key;
    }
    api.notify(r?.message || 'Couldn’t add it from Zotero.', 'error');
  } catch (err) {
    api.notify(`Couldn’t add it from Zotero: ${errorText(err)}`, 'error');
  }
  return null;
}

/**
 * Cite from Zotero (the editor's right-click and the References card, through ZOTERO_CITE): Zotero's own citation
 * picker when Better BibTeX gives one, with "Answer in Zotero" here while it waits, else a search of the library in
 * Spectrum. What's picked goes into the .bib under its Zotero key, and the citation in at the cursor.
 */
export function ZoteroCite() {
  const api = useEditor();
  // the newest editor state after the wait in Zotero, not the one from when it began
  const latest = useRef(api);
  latest.current = api;
  const [mode, setMode] = useState<'picker' | 'search' | null>(null);

  useEffect(() => {
    const pickInZotero = async () => {
      setMode('picker');
      try {
        const res = await pickFromZotero(latest.current.projectId, (await mainCitationCommand(latest.current)).slice(1));
        if (res.cancelled || !res.text || !res.results || !res.bibFile) return;
        const a = latest.current;
        await reloadBib(a, res.results, res.bibFile);
        // a key the .bib gave another work's entry already went in under the next free one
        const cite = renameCiteKeys(res.text, Object.fromEntries(res.results.flatMap((r) => (r.key ? [[r.input, r.key]] : []))));
        if (place(a, cite)) a.notify(citedMessage(cite, res as Added));
      } catch (err) {
        latest.current.notify(`Couldn’t cite from Zotero: ${errorText(err)}`, 'error');
      } finally {
        setMode(null);
      }
    };
    const start = async () => {
      const a = latest.current;
      if (!isTex(a.activePath)) return a.notify('Open a .tex file to cite from Zotero.');
      try {
        const status = await zoteroStatus();
        if (status.cayw) pickInZotero();
        else if (status.running && status.localApi === 'on') setMode('search');
        else a.notify(status.message || 'Zotero isn’t open.', status.running ? 'error' : 'info');
      } catch (err) {
        a.notify(errorText(err), 'error');
      }
    };
    window.addEventListener(ZOTERO_CITE, start);
    return () => window.removeEventListener(ZOTERO_CITE, start);
  }, []);

  const citeChosen = async (hits: ZoteroHit[]) => {
    setMode(null);
    try {
      const res = await addFromZotero(latest.current.projectId, hits.map((h) => h.itemKey));
      const a = latest.current;
      await reloadBib(a, res.results, res.bibFile);
      const keys = res.results.flatMap((r) => (r.key && (r.status === 'added' || r.status === 'duplicate') ? [r.key] : []));
      if (!keys.length) return a.notify(res.results.find((r) => r.message)?.message || 'Nothing could be cited.', 'error');
      const cite = await citationText(a, keys);
      if (place(a, cite)) a.notify(citedMessage(cite, res));
    } catch (err) {
      latest.current.notify(`Couldn’t cite from Zotero: ${errorText(err)}`, 'error');
    }
  };

  const cancel = () => cancelZotero().catch(() => undefined);

  if (mode === 'picker') {
    return (
      <Sheet title="Answer in Zotero" onClose={cancel} width={420} actions={<button className="btn" onClick={cancel}>Cancel</button>}>
        <div className="row zotero-waiting">
          <span className="spinner" />
          <span>Pick the references in Zotero’s citation window, then press Return there. They’re cited at the cursor.</span>
        </div>
      </Sheet>
    );
  }
  return mode === 'search' ? <ZoteroSearch onClose={() => setMode(null)} onCite={citeChosen} /> : null;
}

/** Spectrum's own search of the library, for a Zotero without Better BibTeX's picker: pick one or more, then Cite. */
function ZoteroSearch({ onClose, onCite }: { onClose: () => void; onCite: (hits: ZoteroHit[]) => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ZoteroHit[]>([]);
  const [chosen, setChosen] = useState<ZoteroHit[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setNote('');
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true);
      searchZotero(q, controller.signal)
        .then((res) => {
          setHits(res.items);
          setNote(res.message || (res.items.length ? '' : 'Nothing in your library matches.'));
        })
        .catch((err) => !controller.signal.aborted && setNote(errorText(err)))
        .finally(() => !controller.signal.aborted && setBusy(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const isChosen = (hit: ZoteroHit) => chosen.some((c) => c.itemKey === hit.itemKey);
  const toggle = (hit: ZoteroHit) => setChosen((list) => (isChosen(hit) ? list.filter((c) => c.itemKey !== hit.itemKey) : [...list, hit]));

  return (
    <Sheet
      title="Cite from Zotero"
      onClose={onClose}
      width={560}
      actions={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!chosen.length} onClick={() => onCite(chosen)}>
            {chosen.length > 1 ? `Cite ${chosen.length}` : 'Cite'}
          </button>
        </>
      }
    >
      <label className="search-field zotero-search">
        <Icon name="magnifyingglass" />
        <input
          autoFocus
          value={query}
          placeholder="Search your Zotero library"
          aria-label="Search your Zotero library"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            // Return cites what's picked, or the only match
            if (chosen.length) onCite(chosen);
            else if (hits.length === 1) onCite(hits);
          }}
        />
      </label>
      <div className="zotero-hits" role="listbox" aria-label="Your Zotero library" aria-multiselectable="true">
        {hits.map((hit) => (
          <button key={hit.itemKey} role="option" aria-selected={isChosen(hit)} className={`zotero-hit ${isChosen(hit) ? 'active' : ''}`} onClick={() => toggle(hit)}>
            <Icon name={isChosen(hit) ? 'checkmark.circle.fill' : 'checkmark.circle'} />
            <span className="grow">
              <span className="ref-title">{hit.title || hit.key}</span>
              <span className="ref-meta">{[hitDetail(hit), hit.venue].filter(Boolean).join(' · ')}</span>
            </span>
            <code className="ref-key">{hit.key}</code>
          </button>
        ))}
      </div>
      {busy ? (
        <div className="field-hint"><span className="spinner" /> Searching…</div>
      ) : (
        note && <div className="field-hint">{note}</div>
      )}
    </Sheet>
  );
}
