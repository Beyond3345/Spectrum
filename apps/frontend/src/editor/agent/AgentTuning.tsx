import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../app/Icon';

/** An ACP select option as an agent sends it: { id, name, category?, currentValue, options: values or groups of them }. */
export interface ConfigOption { id: string; name: string; description?: string; category?: string; currentValue: string; options?: any[] }
export interface Modes { currentModeId: string; availableModes: { id: string; name: string; description?: string }[] }
type Choice = { value: string; name: string; description?: string; recommended?: boolean };

export const choicesOf = (o: ConfigOption): Choice[] => (o.options || []).flatMap((v: any) => v.options || [v]).filter((v: any) => typeof v?.value === 'string');
const isModel = (o: ConfigOption) => o.category === 'model' || /^model$/i.test(o.id);
const isEffort = (o: ConfigOption) => o.category === 'thought_level' || /effort|reasoning|thought|variant/i.test(o.id);
const ON = /^(on|enabled?|true|yes)$/i;
const OFF = /^(off|disabled?|false|no|none)$/i;

/**
 * The levels of an effort as the menu shows them: a level named "Recommended (High)" is no row of its own but a badge
 * on High (choosing High does what it does), and that level is the chosen one while it is.
 */
export function effortLevels(o: ConfigOption): { levels: Choice[]; current: string } {
  const all = choicesOf(o);
  const named = (c: Choice) => c.name.match(/^Recommended \((.+)\)$/)?.[1];
  const rec = all.find((c) => named(c) && all.some((d) => d !== c && d.name === named(c)));
  const levels = all.filter((c) => c !== rec).map((c) => (rec && c.name === named(rec) ? { ...c, recommended: true } : c));
  const current = rec && o.currentValue === rec.value ? levels.find((c) => c.recommended)!.value : o.currentValue;
  return { levels, current };
}

/** The logo's six colours, red to purple: the effort levels take them in order, the lowest red, the highest purple */
export const LOGO = ['#f05747', '#f1a33c', '#f8d84a', '#6cdb6c', '#3b82f7', '#b260eb'];
export const wavelength = (i: number, n: number) => LOGO[n <= 1 ? 0 : Math.round((i / (n - 1)) * (LOGO.length - 1))];

type Sub = { option: ConfigOption; top: number };

/**
 * The agent's menus as one button in the message box, the model and its effort, and a cascading menu as Claude Code and
 * Antigravity have: the models (keys 1 to 9), the effort in a side menu of levels coloured along the logo's spectrum,
 * and every other setting as a side menu or, with two choices that are on and off, a switch.
 */
export default function AgentTuning({ options, modes, disabled, onChange, more }: { options: ConfigOption[]; modes: Modes | null; disabled?: boolean; onChange: (id: string, value: string) => void; more?: { label: string; onSelect: () => void } }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'main' | 'models'>('main');
  const [query, setQuery] = useState('');
  const [at, setAt] = useState<{ bottom: number; left: number } | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLDivElement>(null);

  const model = options.find(isModel);
  const effort = options.find((o) => o !== model && isEffort(o));
  const rest: ConfigOption[] = [
    ...options.filter((o) => o !== model && o !== effort),
    ...(modes ? [{ id: '__mode', name: 'Mode', currentValue: modes.currentModeId, options: modes.availableModes.map((m) => ({ value: m.id, name: m.name, description: m.description })) }] : [])
  ];
  const nameOf = (o: ConfigOption | undefined) => {
    if (!o) return '';
    const { levels, current } = o === effort ? effortLevels(o) : { levels: choicesOf(o), current: o.currentValue };
    return levels.find((c) => c.value === current)?.name || current;
  };
  const label = [nameOf(model), nameOf(effort)].filter(Boolean).join(' · ') || rest.map(nameOf).filter(Boolean).join(' · ') || 'Settings';

  const close = () => { setOpen(false); setSub(null); trigger.current?.focus(); };
  const allModels = model ? choicesOf(model) : [];
  // with many, the chosen one and the first others, and the rest behind More models…
  const short = allModels.length > 9 ? [...allModels.filter((c) => c.value === model!.currentValue), ...allModels.filter((c) => c.value !== model!.currentValue).slice(0, 7)] : allModels;
  const found = allModels.filter((c) => !query || `${c.name} ${c.value}`.toLowerCase().includes(query.toLowerCase()));
  const pick = (id: string, value: string) => { onChange(id, value); close(); };

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    // above the button, which sits at the foot of the message box, its right edge on the button's
    setAt({ bottom: window.innerHeight - r.top + 6, left: Math.max(8, Math.min(r.right - 264, window.innerWidth - 272)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || side.current?.contains(t) || trigger.current?.contains(t)) return;
      setOpen(false);
      setSub(null);
    };
    const key = (e: KeyboardEvent) => {
      // 1 to 9 choose a model wherever the keyboard is, while the menu is open and no search box takes the keys
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (!sub && view === 'main' && model && !typing && !e.metaKey && !e.ctrlKey && /^[1-9]$/.test(e.key) && short[Number(e.key) - 1]) {
        e.preventDefault();
        e.stopPropagation();
        pick(model.id, short[Number(e.key) - 1].value);
        return;
      }
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (sub) { setSub(null); focusRow(pop.current, `[data-sub="${sub.option.id}"]`); }
      else if (view === 'models') setView('main');
      else close();
    };
    document.addEventListener('mousedown', away, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', () => setOpen(false), { once: true });
    return () => {
      document.removeEventListener('mousedown', away, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open, view, sub, options]);

  // the first row takes the keyboard as the menu opens, and the chosen level as a side menu opens
  useEffect(() => { if (open && view === 'main') focusRow(pop.current, '[aria-checked="true"], .tuning-row'); }, [open, view]);
  useEffect(() => { if (sub) focusRow(side.current, '[aria-checked="true"], .tuning-row'); }, [sub]);

  if (!options.length && !modes) return null;

  const openSub = (option: ConfigOption, row: HTMLElement) => {
    const r = row.getBoundingClientRect();
    setSub({ option, top: r.top });
  };

  // arrows move between rows; → opens a side menu; ← closes it (1 to 9 choose a model, in the document's listener)
  const keys = (e: ReactKeyboardEvent<HTMLDivElement>, inSide = false) => {
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('.tuning-row:not(:disabled)')];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      rows[(at + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus();
    } else if (e.key === 'ArrowRight' && !inSide) {
      const id = (document.activeElement as HTMLElement)?.dataset.sub;
      const option = [effort, ...rest].find((o) => o?.id === id);
      if (option) { e.preventDefault(); openSub(option, document.activeElement as HTMLElement); }
    } else if (e.key === 'ArrowLeft' && inSide) {
      e.preventDefault();
      const id = sub?.option.id;
      setSub(null);
      focusRow(pop.current, `[data-sub="${id}"]`);
    }
  };

  const subLevels = sub ? (sub.option === effort ? effortLevels(sub.option) : { levels: choicesOf(sub.option), current: sub.option.currentValue }) : null;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`tuning-button ${open ? 'open' : ''}`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Model and settings"
        onClick={() => { setView('main'); setQuery(''); setSub(null); setOpen((v) => !v); }}
      >
        {effort && <span className="tuning-dot-sm" aria-hidden style={{ background: wavelength(effortLevels(effort).levels.findIndex((c) => c.value === effortLevels(effort).current), effortLevels(effort).levels.length) }} />}
        <span className="tuning-label">{label}</span>
        <Icon name="chevron.down" className="tuning-chevron" />
      </button>
      {open && at && createPortal(
        <div ref={pop} className="tuning-pop" role="menu" aria-label="Model and settings" style={{ bottom: at.bottom, left: at.left }} onKeyDown={(e) => keys(e)}>
          {view === 'models' && model ? (
            <>
              <div className="tuning-head">
                <button type="button" className="icon-btn small" aria-label="Back" onClick={() => setView('main')}><Icon name="chevron.left" /></button>
                <span className="tuning-title">{model.name || 'Model'}</span>
              </div>
              <input className="input tuning-search" autoFocus placeholder="Search models" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="tuning-list">
                {found.map((c) => (
                  <button key={c.value} type="button" role="menuitemradio" aria-checked={c.value === model.currentValue} className="tuning-row" title={c.description} onClick={() => pick(model.id, c.value)}>
                    <span className="tuning-row-name">{c.name}</span>
                    {c.value === model.currentValue && <Icon name="checkmark" className="tuning-check" />}
                  </button>
                ))}
                {!found.length && <div className="tuning-empty">No model matches</div>}
              </div>
            </>
          ) : (
            <>
              {model && (
                <>
                  <div className="tuning-heading">{model.name || 'Model'}</div>
                  {short.map((c, i) => (
                    <button key={c.value} type="button" role="menuitemradio" aria-checked={c.value === model.currentValue} className="tuning-row" title={c.description} onClick={() => pick(model.id, c.value)} onMouseEnter={() => setSub(null)}>
                      <span className="tuning-row-name">{c.name}</span>
                      {c.value === model.currentValue ? <Icon name="checkmark" className="tuning-check" /> : <kbd className="tuning-key">{i + 1}</kbd>}
                    </button>
                  ))}
                  {allModels.length > short.length && (
                    <button type="button" role="menuitem" className="tuning-row" onClick={() => { setQuery(''); setView('models'); }} onMouseEnter={() => setSub(null)}>
                      <span className="tuning-row-name">More models…</span>
                      <Icon name="chevron.right" className="tuning-check" />
                    </button>
                  )}
                </>
              )}
              {(effort || rest.length > 0) && <div className="tuning-sep" role="separator" />}
              {[effort, ...rest].filter((o): o is ConfigOption => !!o).map((o) => {
                const choices = choicesOf(o);
                const toggle = choices.length === 2 && choices.some((c) => ON.test(c.name)) && choices.some((c) => OFF.test(c.name));
                if (toggle) {
                  const on = ON.test(choices.find((c) => c.value === o.currentValue)?.name || '');
                  const to = choices.find((c) => (on ? OFF : ON).test(c.name))!;
                  return (
                    <button key={o.id} type="button" role="menuitemcheckbox" aria-checked={on} className="tuning-row" title={o.description} onClick={() => onChange(o.id, to.value)} onMouseEnter={() => setSub(null)}>
                      <span className="tuning-row-name">{o.name}</span>
                      <span className={`tuning-switch ${on ? 'on' : ''}`} aria-hidden />
                    </button>
                  );
                }
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={sub?.option.id === o.id}
                    data-sub={o.id}
                    className={`tuning-row ${sub?.option.id === o.id ? 'open' : ''}`}
                    title={o.description}
                    onClick={(e) => openSub(o, e.currentTarget)}
                    onMouseEnter={(e) => openSub(o, e.currentTarget)}
                  >
                    <span className="tuning-row-name">{o === effort ? 'Effort' : o.name}</span>
                    <span className="tuning-row-value">{nameOf(o)}</span>
                    <Icon name="chevron.right" className="tuning-check" />
                  </button>
                );
              })}
              {more && (
                <>
                  <div className="tuning-sep" role="separator" />
                  <button type="button" role="menuitem" className="tuning-row" onClick={() => { close(); more.onSelect(); }} onMouseEnter={() => setSub(null)}>
                    <span className="tuning-row-name">{more.label}</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>,
        document.body
      )}
      {open && sub && subLevels && pop.current && createPortal(
        <SideMenu
          ref={side}
          anchor={pop.current.getBoundingClientRect()}
          top={sub.top}
          effort={sub.option === effort}
          name={sub.option === effort ? 'Effort' : sub.option.name}
          levels={subLevels.levels}
          current={subLevels.current}
          onKeyDown={(e) => keys(e, true)}
          onPick={(value) => pick(sub.option.id, value)}
        />,
        document.body
      )}
    </>
  );
}

function focusRow(root: HTMLElement | null, selector: string) {
  requestAnimationFrame(() => (root?.querySelector<HTMLElement>(selector) || root?.querySelector<HTMLElement>('.tuning-row'))?.focus());
}

type SideProps = { anchor: DOMRect; top: number; effort: boolean; name: string; levels: Choice[]; current: string; onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void; onPick: (value: string) => void };

/** A side menu beside the main one, on whichever side has room, its top at the row that opened it */
const SideMenu = forwardRef<HTMLDivElement, SideProps>(function SideMenu({ anchor, top, effort, name, levels, current, onKeyDown, onPick }, ref) {
  const width = 240;
  const left = anchor.right + 4 + width < window.innerWidth - 8 ? anchor.right + 4 : Math.max(8, anchor.left - 4 - width);
  const height = 44 + levels.length * 34 + (effort ? 48 : 0);
  return (
    <div ref={ref} className={`tuning-pop tuning-side ${effort ? 'effort' : ''}`} role="menu" aria-label={name} style={{ left, top: Math.max(8, Math.min(top - 6, window.innerHeight - height - 8)), width }} onKeyDown={onKeyDown}>
      {effort && <p className="tuning-hint">Higher effort means deeper reasoning, but takes longer and uses more tokens.</p>}
      {levels.map((c, i) => (
        <button key={c.value} type="button" role="menuitemradio" aria-checked={c.value === current} className="tuning-row" title={c.description} onClick={() => onPick(c.value)}>
          {effort && <span className="tuning-dot-sm" aria-hidden style={{ background: wavelength(i, levels.length) }} />}
          <span className="tuning-row-name">
            {c.name}
            {c.recommended && <span className="tuning-badge">Recommended</span>}
            {effort && i === levels.length - 1 && levels.length > 2 && <span className="tuning-warn">High usage</span>}
          </span>
          {c.value === current && <Icon name="checkmark" className="tuning-check" />}
        </button>
      ))}
    </div>
  );
});
