import { useEffect, useMemo, useState } from 'react';
import { listUniverseTemplates } from '../api/client';
import type { UniverseTemplate } from '../api/client';
import Icon from './Icon';
import Sheet from './Sheet';
import { loadSettings } from './settings';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Plain words for a licence that asks more of a project than MIT does; Spectrum never refuses one. */
export const LICENCE_NOTE = 'This licence isn’t MIT-compatible. Read its terms before you share or publish a project made from this template.';

/** Typst Universe's templates, which the user opens on purpose from the gallery; Spectrum's own stay the standard. */
export default function UniverseSheet({ onClose, onBack, onPick }: { onClose: () => void; onBack: () => void; onPick: (t: UniverseTemplate) => void }) {
  const [list, setList] = useState<{ templates: UniverseTemplate[]; fetchedAt: number; offline: boolean } | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError('');
    // the Typst a new project compiles with, so a template that needs a newer one stays out of the list
    listUniverseTemplates(loadSettings().compileDefaults.typstVersion || undefined)
      .then((res) => live && setList(res))
      .catch((err) => live && setError(errorText(err)));
    return () => {
      live = false;
    };
  }, [attempt]);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (list?.templates || []).filter((t) => {
      const text = [t.name, t.description, ...t.keywords, ...t.authors].join(' ').toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [list, search]);

  return (
    <Sheet title="Typst Universe" width={880} className="gallery-sheet" onClose={onClose}>
      <div className="gallery-toolbar">
        <div className="field-hint">
          Templates their authors share on <a href="https://typst.app/universe/search/?kind=templates" target="_blank" rel="noreferrer">Typst Universe</a>, not
          made by Spectrum. A template downloads only when you choose it, and the packages it uses download when it first compiles.
          {list?.offline && ` You’re offline, so this is the list from ${new Date(list.fetchedAt).toLocaleDateString()}.`}
        </div>
        <div className="row">
          <button className="btn" onClick={onBack}><Icon name="chevron.left" /> Spectrum templates</button>
          <label className="search-field">
            <Icon name="magnifyingglass" />
            <input value={search} autoFocus placeholder="Search Typst Universe" spellCheck={false} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
      </div>
      {error ? (
        <div className="empty-state compact">
          <Icon name="exclamationmark.triangle" size={36} />
          <div className="empty-title">Couldn’t load Typst Universe</div>
          <div className="empty-text">{error}</div>
          <div className="empty-actions">
            <button className="btn" onClick={() => setAttempt((n) => n + 1)}><Icon name="arrow.clockwise" /> Try again</button>
          </div>
        </div>
      ) : !list ? (
        <div className="empty-state compact"><span className="spinner" /></div>
      ) : shown.length === 0 ? (
        <div className="empty-state compact">
          <div className="empty-title">No matching templates</div>
          <div className="empty-text">Try another search.</div>
        </div>
      ) : (
        <div className="template-grid">
          {shown.map((t) => (
            <button key={t.name} className="template-card universe-card" onClick={() => onPick(t)}>
              <span className="template-body">
                <span className="template-title">
                  {t.name}
                  <span className="badge">{t.version}</span>
                </span>
                {t.description && <span className="template-desc">{t.description}</span>}
                <span className="universe-meta">
                  <span className="badge">{t.license || 'No licence'}</span>
                  {!t.mitCompatible && (
                    <span className="badge warning" title={LICENCE_NOTE}>
                      <Icon name="exclamationmark.triangle" /> Not MIT-compatible
                    </span>
                  )}
                  {t.authors.length > 0 && <span className="universe-authors">{t.authors.join(', ')}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
