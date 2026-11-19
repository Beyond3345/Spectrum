import { useRef } from 'react';
import type { AgentEvent, AgentUsage, ChatThread } from '../../api/client';
import { MenuButton } from '../../app/Menu';
import { presetOf, useLivePreset, useProviders } from '../../app/settings';
import { useEditor } from '../EditorContext';
import { localMeter, spectrumMeter, turnChoice } from './usage';
import type { Meter, TurnChoice } from './usage';

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

function MeterView({ meter }: { meter: Meter }) {
  const full = meter.full;
  return (
    <span className={`agent-meter${full !== undefined && full >= 0.8 ? ' full' : ''}`} title={meter.title}>
      {full !== undefined && (
        <span className="agent-meter-bar" aria-hidden>
          <span style={{ width: `${Math.round(full * 100)}%` }} />
        </span>
      )}
      {meter.parts.map((part, i) => (
        <span key={i} aria-hidden>
          {part}
        </span>
      ))}
      <span className="sr-only">{meter.title}</span>
    </span>
  );
}

/**
 * The right of an agent tab's header row: for the Spectrum agent the thread's model and effort and its meter (the
 * turn's and the thread's tokens, the cache's share, an estimate of the cost at the user's prices); for a local agent
 * the meter alone, from what the agent reports (its context, its cost, the last task's tokens). A local agent's own
 * model and modes are its configuration options, shown beside it.
 */
export default function AgentHeader(
  props:
    | { events: AgentEvent[] }
    | { messages: ChatThread['messages']; live: AgentUsage | null; choice: Choice; onChoose(choice: TurnChoice): void; onManage(): void }
) {
  const { settings } = useEditor();
  if ('events' in props) {
    const meter = localMeter(props.events);
    return meter && <MeterView meter={meter} />;
  }
  const { choice, onChoose, onManage } = props;
  const meter = spectrumMeter(props.messages, props.live, choice.model, settings.modelPrices);
  const modelName = choice.models.find(([id]) => id === choice.model)?.[1] || choice.model || 'No model';
  // the recommended level by its name: “Recommended (Medium)” is “Medium” on the button
  const effortName = choice.efforts.find(([v]) => v === choice.effort)?.[1]?.replace(/^Recommended \((.+)\)$/, '$1');
  return (
    <>
      <MenuButton
        className="btn small ghost agent-model-pick"
        title="The model and how long it may think, for this thread’s turns"
        disabled={!choice.models.length}
        label={<span className="truncate">{effortName && choice.efforts.length > 1 ? `${modelName} · ${effortName}` : modelName}</span>}
        align="end"
        items={[
          { label: 'Model', heading: true },
          ...choice.models.map(([id, label]) => ({ label, checked: id === choice.model, onSelect: () => onChoose({ model: id }) })),
          { separator: true },
          { label: 'Thinking', heading: true },
          ...choice.efforts.map(([value, label]) => ({ label, checked: value === choice.effort, onSelect: () => onChoose({ effort: value }) })),
          { separator: true },
          { label: 'Models and prices…', onSelect: onManage }
        ]}
      />
      {meter && <MeterView meter={meter} />}
    </>
  );
}
