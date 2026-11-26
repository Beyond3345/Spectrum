import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../app/Icon';

/** An ACP select option as an agent sends it: { id, name, category?, currentValue, options: values or groups of them }. */
export interface ConfigOption { id: string; name: string; description?: string; category?: string; currentValue: string; options?: any[] }
export interface Modes { currentModeId: string; availableModes: { id: string; name: string; description?: string }[] }
type Choice = { value: string; name: string; description?: string };

export const choicesOf = (o: ConfigOption): Choice[] => (o.options || []).flatMap((v: any) => v.options || [v]).filter((v: any) => typeof v?.value === 'string');
const isModel = (o: ConfigOption) => o.category === 'model' || /^model$/i.test(o.id);
const isEffort = (o: ConfigOption) => o.category === 'thought_level' || /effort|reasoning|thought|variant/i.test(o.id);

/** The agent's menus as one button, the model and its effort, with every other setting in its popover, as Codex shows them. */
export default function AgentTuning({ options, modes, disabled, onChange, more }: { options: ConfigOption[]; modes: Modes | null; disabled?: boolean; onChange: (id: string, value: string) => void; more?: { label: string; onSelect: () => void } }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'main' | 'models'>('main');
  const [query, setQuery] = useState('');
  const [at, setAt] = useState<{ bottom: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const model = options.find(isModel);
  const effort = options.find((o) => o !== model && isEffort(o));
  const rest: ConfigOption[] = [
    ...options.filter((o) => o !== model && o !== effort),
    ...(modes ? [{ id: '__mode', name: 'Mode', currentValue: modes.currentModeId, options: modes.availableModes.map((m) => ({ value: m.id, name: m.name, description: m.description })) }] : [])
  ];
  const nameOf = (o: ConfigOption | undefined) => (o && choicesOf(o).find((c) => c.value === o.currentValue)?.name) || o?.currentValue || '';
  const label = [nameOf(model), nameOf(effort)].filter(Boolean).join(' · ') || rest.map(nameOf).filter(Boolean).join(' · ') || 'Settings';

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    // above the button, which sits at the foot of the message box, its right edge on the button's
    setAt({ bottom: window.innerHeight - r.top + 6, left: Math.max(8, Math.min(r.right - 284, window.innerWidth - 292)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (pop.current?.contains(e.target as Node) || trigger.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (view === 'models') setView('main');
      else { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', () => setOpen(false), { once: true });
    return () => {
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open, view]);

  if (!options.length && !modes) return null;
  const levels = effort ? choicesOf(effort) : [];
  const level = Math.max(0, levels.findIndex((c) => c.value === effort?.currentValue));
  const models = model ? choicesOf(model).filter((c) => !query || `${c.name} ${c.value}`.toLowerCase().includes(query.toLowerCase())) : [];

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`tuning-button ${open ? 'open' : ''}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Model and settings"
        onClick={() => { setView('main'); setQuery(''); setOpen((v) => !v); }}
      >
        <span className="tuning-label">{label}</span>
        <Icon name="chevron.down" className="tuning-chevron" />
      </button>
      {open && at && createPortal(
        <div ref={pop} className="tuning-pop" role="dialog" aria-label="Model and settings" style={{ bottom: at.bottom, left: at.left }}>
          {view === 'models' && model ? (
            <>
              <div className="tuning-head row">
                <button type="button" className="icon-btn small" aria-label="Back" onClick={() => setView('main')}><Icon name="chevron.left" /></button>
                <span className="tuning-title">{model.name || 'Model'}</span>
              </div>
              {choicesOf(model).length > 10 && (
                <input className="input tuning-search" autoFocus placeholder="Search models" value={query} onChange={(e) => setQuery(e.target.value)} />
              )}
              <div className="tuning-list" role="listbox">
                {models.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="option"
                    aria-selected={c.value === model.currentValue}
                    className={`tuning-item ${c.value === model.currentValue ? 'selected' : ''}`}
                    title={c.description}
                    onClick={() => { onChange(model.id, c.value); setView('main'); }}
                  >
                    <span>{c.name}</span>
                    {c.value === model.currentValue && <Icon name="checkmark" />}
                  </button>
                ))}
                {!models.length && <div className="tuning-empty">No model matches</div>}
              </div>
            </>
          ) : (
            <>
              <div className="tuning-head">
                {effort && <div className="tuning-effort">{nameOf(effort)}</div>}
                {model && (
                  <button type="button" className="tuning-model" onClick={() => setView('models')}>
                    {nameOf(model)} <Icon name="chevron.right" />
                  </button>
                )}
              </div>
              {effort && levels.length > 1 && (
                <div className="tuning-slider" style={{ ['--f' as string]: level / (levels.length - 1) }}>
                  <div className="tuning-track" aria-hidden="true">
                    {levels.map((c, i) => <span key={c.value} className="tuning-dot" style={{ left: `calc(16px + (100% - 32px) * ${i / (levels.length - 1)})` }} />)}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={levels.length - 1}
                    step={1}
                    value={level}
                    aria-label={effort.name || 'Effort'}
                    aria-valuetext={levels[level]?.name}
                    onChange={(e) => onChange(effort.id, levels[Number(e.target.value)].value)}
                  />
                </div>
              )}
              {rest.map((o) => {
                const choices = choicesOf(o);
                return (
                  <div key={o.id} className="tuning-row">
                    <span className="tuning-row-name" title={o.description}>{o.name}</span>
                    <div className="tuning-segments" role="radiogroup" aria-label={o.name}>
                      {choices.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          role="radio"
                          aria-checked={c.value === o.currentValue}
                          className={c.value === o.currentValue ? 'on' : ''}
                          title={c.description}
                          onClick={() => onChange(o.id, c.value)}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {more && (
                <button type="button" className="tuning-more" onClick={() => { setOpen(false); more.onSelect(); }}>
                  {more.label}
                </button>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
