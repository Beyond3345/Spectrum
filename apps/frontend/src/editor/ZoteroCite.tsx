import { useEffect, useRef, useState } from 'react';
import { renameCiteKeys } from '../../../backend/src/latex/text.js';
import { addFromZotero, authoriseZotero, cancelZotero, disconnectZotero, pickFromZotero, searchZotero, syncZotero, zoteroStatus } from '../api/client';
import type { ReferenceResult, ZoteroHit, ZoteroStatus, ZoteroSync } from '../api/client';
import Icon from '../app/Icon';
import Sheet from '../app/Sheet';
import { useSettings } from '../app/settings';
import { useEditor } from './EditorContext';
import type { EditorApi } from './EditorContext';
import { citationText, errorText, isDocument, mainCitationCommand, reloadBib } from './shared';
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

/** The citation at the cursor of a document; elsewhere (the user moved on while Zotero asked) it's copied instead. */
function place(api: EditorApi, cite: string) {
  if (isDocument(api.activePath)) {
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
      if (!isDocument(a.activePath)) return a.notify('Open a document to cite from Zotero.');
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

/** "This project’s collection: Spectrum › Thesis", or why there's none (yet). */
function collectionLine(sync: ZoteroSync) {
  if (sync.state === 'synced') return { text: `This project’s collection: ${sync.collection}.${sync.message ? ` ${sync.message}` : ''}`, error: !!sync.message };
  if (sync.state === 'empty') return { text: 'This project has no references yet, so it has no collection.', error: false };
  if (sync.state === 'waiting' || sync.state === 'error') return { text: sync.message || '', error: sync.state === 'error' };
  return null;
}

/** Settings › Zotero: whether Zotero and Better BibTeX answer, the permission for project collections, and completion. */
export function ZoteroSettings({ projectId }: { projectId?: string }) {
  const [settings, update] = useSettings();
  const [status, setStatus] = useState<ZoteroStatus | null>(null);
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false);
  const [sync, setSync] = useState<ZoteroSync | null>(null);
  const askingRef = useRef(false);
  askingRef.current = asking;

  const check = () => {
    setError('');
    zoteroStatus().then(setStatus, (err) => setError(errorText(err)));
  };
  useEffect(check, []);
  // closing Settings while Zotero asks takes the question back
  useEffect(() => () => void (askingRef.current && cancelZotero().catch(() => undefined)), []);
  useEffect(() => {
    setSync(null);
    if (!projectId || !status?.authorised || !status.writes) return;
    let live = true;
    syncZotero(projectId).then((res) => live && setSync(res), () => undefined);
    return () => {
      live = false;
    };
  }, [projectId, status?.authorised, status?.writes]);

  const allow = async () => {
    setAsking(true);
    setError('');
    try {
      const res = await authoriseZotero();
      if (!res.cancelled) check();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setAsking(false);
    }
  };
  const disconnect = () => disconnectZotero().then(setStatus, (err) => setError(errorText(err)));
  const line = sync && collectionLine(sync);
  const unknown = !status?.running ? '—' : '';

  return (
    <>
      <h3 className="form-section-title">Zotero on this computer</h3>
      <div className="kv-list">
        <div className="kv-row">
          Zotero<span>{!status ? 'Checking…' : status.running ? status.version || 'Open' : 'Not open'}</span>
        </div>
        <div className="kv-row">
          Local API<span>{unknown || (status?.localApi === 'on' ? 'On' : 'Off')}</span>
        </div>
        <div className="kv-row">
          Better BibTeX<span>{unknown || status?.betterBibtex || 'Not installed'}</span>
        </div>
      </div>
      {status?.message && <div className={`field-hint ${status.running ? 'error' : ''}`}>{status.message}</div>}
      <div className="field-hint">
        Cite from Zotero, in the editor’s right-click menu and the References card, opens Zotero’s own citation picker when Better BibTeX is installed, and
        otherwise searches your library here. Each entry goes into the .bib under its Zotero citation key, or an author and year key when it has none.
      </div>
      <div className="row">
        <button className="btn small" onClick={check}>
          <Icon name="arrow.clockwise" /> Check again
        </button>
      </div>

      <h3 className="form-section-title">Project collections</h3>
      <div className="field-hint section-hint">
        Each project gets a collection in your library, Spectrum › its name, kept in step with the project’s .bib: entries Zotero has go into it, and
        the others are added to your library. An entry taken out of the .bib leaves the collection but stays in your library, and nothing in Zotero ever
        changes the .bib.
      </div>
      {asking ? (
        <div className="row zotero-waiting">
          <span className="spinner" />
          <span className="grow">Answer in Zotero</span>
          <button className="btn small" onClick={() => cancelZotero().catch(() => undefined)}>Cancel</button>
        </div>
      ) : status?.authorised ? (
        <div className="row">
          <span className="grow">Zotero lets Spectrum keep your projects’ collections.</span>
          <button className="btn small" onClick={disconnect}>Disconnect</button>
        </div>
      ) : (
        status?.writes && (
          <>
            <div className="row">
              <button className="btn" onClick={allow}>Allow Spectrum in Zotero…</button>
            </div>
            <div className="field-hint">Zotero asks once. Choose Always Allow.</div>
          </>
        )
      )}
      {line && <div className={`field-hint ${line.error ? 'error' : ''}`}>{line.text}</div>}

      <h3 className="form-section-title">Citing</h3>
      <label className="checkbox-row">
        <input type="checkbox" checked={settings.zoteroCompletion} onChange={(e) => update({ zoteroCompletion: e.target.checked })} />
        <span>
          <span>
            Suggest items from your Zotero library in <code>\cite</code> completion
          </span>
          <span className="field-hint">Three letters into a key, below the project’s own keys. Picking one adds its entry to the .bib.</span>
        </span>
      </label>
      {error && <div className="field-hint error">{error}</div>}
    </>
  );
}
