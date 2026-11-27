import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AgentTuning from './AgentTuning';
import type { ConfigOption } from './AgentTuning';
import { loadSettings, presetOf, updateSettings, useLivePreset, useProviders } from '../../app/settings';
import { hiddenPatch } from '../../app/providerCards';
import { useEditor } from '../EditorContext';
import { offNotice, turnChoice } from './usage';
import type { StatChip, TurnChoice } from './usage';
import Icon from '../../app/Icon';

type Choice = ReturnType<typeof turnChoice>;

/**
 * A thread's model and effort as its turns send them (turnChoice), as a ref: a turn started from an event handler
 * reads the newest. Until the providers have loaded, the thread's own choice stands as it is.
 */
export function useTurnChoice(choice: TurnChoice) {
  const { settings } = useEditor();
  const providers = useProviders();
  const { preset } = useLivePreset(presetOf(providers, settings), settings.llmEndpoint);
  const now: Choice = providers.length ? turnChoice(preset, settings, choice) : { model: choice.model || settings.llmModel, effort: choice.effort || settings.reasoningEffort, models: [], efforts: [] };
  const ref = useRef(now);
  ref.current = now;
  return ref;
}

const ICONS: Record<StatChip['key'], string> = { session: 'gauge.with.dots.needle.50percent', tokens: 'custom.database', context: '' };

function Ring({ full }: { full: number }) {
  return <span className={`stat-ring${full >= 0.8 ? ' full' : ''}`} aria-hidden style={{ ['--f' as string]: full }} />;
}

/** One chip of the stats row, and its popover above it */
function Stat({ chip }: { chip: StatChip }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ bottom: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    setAt({ bottom: window.innerHeight - r.top + 6, left: Math.max(8, Math.min(r.left + r.width / 2 - 160, window.innerWidth - 328)) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!pop.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); button.current?.focus(); }
    };
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', close, true); document.removeEventListener('keydown', key, true); };
  }, [open]);
  return (
    <>
      <button ref={button} type="button" className={`stat-chip${open ? ' open' : ''}${chip.ring !== undefined && chip.ring >= 0.8 ? ' full' : ''}`} aria-expanded={open} aria-label={chip.title} onClick={() => setOpen((v) => !v)}>
        {chip.ring !== undefined ? <Ring full={chip.ring} /> : <Icon name={ICONS[chip.key]} />}
        <span>{chip.text.join(' · ')}</span>
      </button>
      {open && at && createPortal(
        <div ref={pop} className="stat-pop" role="dialog" aria-label={chip.title} style={{ bottom: at.bottom, left: at.left }}>
          <div className="stat-pop-head">
            {chip.ring === undefined && <Icon name={ICONS[chip.key]} />}
            <span className="stat-pop-title">{chip.title}</span>
            {chip.total && <span className="stat-pop-total">{chip.total}</span>}
          </div>
          {chip.bar !== undefined ? (
            <div className="stat-pop-bar" aria-hidden><span style={{ width: `${Math.max(1, chip.bar * 100)}%`, ['--whole' as string]: `${100 / Math.max(0.01, chip.bar)}%` }} /></div>
          ) : (
            <hr />
          )}
          {chip.rows.map(([label, value]) => (
            <div key={label} className="stat-pop-row"><span>{label}</span><span>{value}</span></div>
          ))}
          {chip.note && <p className="stat-pop-note">{chip.note}</p>}
        </div>,
        document.body
      )}
    </>
  );
}

/** The row under an agent's message box, as DeepSeek Harness has it: the session, its tokens and its context, each opening its figures */
export function StatsRow({ chips }: { chips: StatChip[] }) {
  if (!chips.length) return null;
  return (
    <div className="stats-row">
      {chips.map((c) => <Stat key={c.key} chip={c} />)}
    </div>
  );
}

/**
 * The Spectrum agent's model and effort for the thread, at the right of its header row. Both tabs' figures
 * are in the StatsRow under the message box; a local agent's model is in AgentTuning, in the box.
 */
/**
 * The notice above a message box while the thread's or chat's model is switched off in Settings › Models (offNotice):
 * the same words and the same two actions in the Spectrum agent's tab and the assistant panel. Nothing while the
 * choice can be sent. onChoose opens the box's model menu.
 */
export function ModelOffNotice({ choice, onChoose, noun = 'thread' }: { choice: Choice; onChoose(): void; noun?: 'thread' | 'chat' }) {
  const providers = useProviders();
  const notice = offNotice(choice, noun);
  if (!notice) return null;
  return (
    <div className="composer-hint row" role="status">
      <span className="grow">{notice} Nothing is sent until you choose another model or turn it back on.</span>
      <button className="btn small" onClick={onChoose}>
        Choose another model
      </button>
      {/* a thread's model is always one of the main provider's */}
      <button className="btn small" onClick={() => updateSettings(hiddenPatch(loadSettings(), presetOf(providers, loadSettings())?.id || 'custom', choice.model, false))}>
        Turn it back on
      </button>
    </div>
  );
}

/** opened: a count that opens the menu each time it goes up (AgentTuning) */
export default function AgentHeader({ choice, onChoose, onManage, plan, opened }: { choice: Choice; onChoose(choice: TurnChoice): void; onManage(): void; plan?: { on: boolean; toggle(): void }; opened?: number }) {
  // “Recommended (High)” is a badge on High in the menu (effortLevels), not a second High
  const options: ConfigOption[] = [
    { id: 'model', name: 'Model', category: 'model', currentValue: choice.model, options: choice.models.map(([value, name]) => ({ value, name })) },
    ...(choice.efforts.length > 1 ? [{ id: 'effort', name: 'Thinking', category: 'thought_level', currentValue: choice.effort, options: choice.efforts.map(([value, name]) => ({ value, name })) }] : [])
  ];
  return (
    <AgentTuning
      options={choice.models.length ? options : []}
      modes={null}
      onChange={(id, value) => onChoose(id === 'model' ? { model: value } : { effort: value as TurnChoice['effort'] })}
      more={{ label: 'Manage models…', onSelect: onManage }}
      toggles={plan ? [{ label: 'Plan before editing', on: plan.on, onToggle: plan.toggle }] : []}
      opened={opened}
    />
  );
}
