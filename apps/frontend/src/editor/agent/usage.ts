import type { AgentEvent, AgentUsage, ChatThread, ProviderPreset, ReasoningEffort } from '../../api/client';
import { CURRENCIES, effortOptions, modelOf } from '../../app/settings';
import type { Price, Prices } from '../../app/settings';

// What the agent tabs' header says about tokens, cost and context, worked out from what the agents report. Money is
// shown only where the agent or the provider (OpenRouter) reports a cost, or as an estimate from prices the user typed
// in Settings › Models, each in its own currency: Spectrum converts none and never adds two currencies together.

/** A turn's tokens as a thread keeps them (ChatMessage meta.usage): what the cache served and stored are part of input */
export type Counted = AgentUsage & { model?: string };
/** The meter as the header shows it: short parts, the whole story for its tooltip, and how full the context is (0 to 1) */
export type Meter = { parts: string[]; title: string; full?: number };
/** A thread's own model and effort, where the user chose them in the tab (ChatThread.model, .effort) */
export type TurnChoice = { model?: string; effort?: ReasoningEffort };

const whole = (n: number) => Math.round(n).toLocaleString('en-AU');

/** 950, 12.4k, 153k, 1.2M */
export function tokens(n: number) {
  if (n < 1000) return String(Math.round(n));
  if (n < 99_950) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 999_500) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

/**
 * An amount in its currency, with a symbol no other currency shares (US$0.42, A$0.42, CN¥3.10, JP¥12; en-AU's own
 * would write a bare $ for the Australian dollar); a currency Spectrum does not list by its code (NOK 3.00), and a
 * unit that is not a currency (credits) after the number. Less than the currency's smallest unit is “under” it.
 */
export function money(amount: number, currency = 'USD') {
  try {
    const digits = new Intl.NumberFormat('en-AU', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    const symbol = CURRENCIES.find(([code]) => code === currency)?.[1] ?? `${currency.toUpperCase()} `;
    const format = (n: number) => symbol + n.toLocaleString('en-AU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const least = 10 ** -digits;
    return amount > 0 && amount < least ? `under ${format(least)}` : format(amount);
  } catch {
    return `${Number(amount.toPrecision(4))} ${currency}`;
  }
}

const add = (a: AgentUsage, b: AgentUsage): AgentUsage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: (a.cacheRead || 0) + (b.cacheRead || 0),
  cacheWrite: (a.cacheWrite || 0) + (b.cacheWrite || 0)
});

/** A turn's cost: the provider's own figure, or an estimate from the user's price, in that price's currency */
export type Cost = { cost: number; saved: number; currency: string; reported: boolean };

/**
 * What a turn cost: what the provider reported (OpenRouter, in US dollars), else an estimate at the user's price for
 * its model in that price's currency, with what the cache saved; null with neither
 */
export function costOf(u: Counted, prices: Prices): Cost | null {
  if (typeof u.cost === 'number' && Number.isFinite(u.cost) && u.cost >= 0) return { cost: u.cost, saved: 0, currency: 'USD', reported: true };
  const p = u.model ? prices[u.model] : undefined;
  if (p?.input === undefined || p.output === undefined) return null;
  const cached = Math.min(u.cacheRead || 0, u.input);
  // ponytail: what the cache stored is priced as input; Anthropic charges a quarter more for it, so this is a little low there
  return { cost: ((u.input - cached) * p.input + cached * (p.cached ?? p.input) + u.output * p.output) / 1e6, saved: (cached * (p.input - (p.cached ?? p.input))) / 1e6, currency: p.currency || 'USD', reported: false };
}

/** Costs summed by currency and by whether they were reported or estimated: reported first, then each currency as first met */
export function costSums(costs: Cost[]) {
  const sums: Cost[] = [];
  for (const c of costs) {
    const same = sums.find((s) => s.currency === c.currency && s.reported === c.reported);
    if (same) Object.assign(same, { cost: same.cost + c.cost, saved: same.saved + c.saved });
    else sums.push({ ...c });
  }
  return sums.sort((a, b) => Number(b.reported) - Number(a.reported));
}

const and = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]);

const inOut = (u: AgentUsage) => `${whole(u.input)} tokens in${u.cacheRead ? ` (${whole(u.cacheRead)} from the cache)` : ''}, ${whole(u.output)} out`;

/**
 * The Spectrum agent's meter: this turn (the one running, else the last that counted tokens) and the thread so far,
 * the share of what the model read that the cache served, and the cost where every turn has one (OpenRouter's figure
 * or an estimate at the user's price), summed apart by currency. live: the running turn's tokens so far, read by model.
 */
export function spectrumMeter(messages: ChatThread['messages'], live: AgentUsage | null, model: string, prices: Prices): Meter | null {
  const turns: Counted[] = messages.flatMap((m) => (m.role === 'assistant' && (m.meta as { usage?: Counted } | undefined)?.usage ? [(m.meta as { usage: Counted }).usage] : []));
  if (live) turns.push({ ...live, model });
  if (!turns.length) return null;
  const turn = turns[turns.length - 1];
  const thread = turns.reduce(add, { input: 0, output: 0 });
  const costs = turns.map((u) => costOf(u, prices));
  const sums = costs.every(Boolean) ? costSums(costs as Cost[]) : null;
  const reported = sums?.filter((c) => c.reported) || [];
  const estimated = sums?.filter((c) => !c.reported) || [];
  const saved = estimated.filter((c) => c.saved >= 0.005).map((c) => money(c.saved, c.currency));
  const share = thread.input ? (thread.cacheRead || 0) / thread.input : 0;
  const parts = [`Turn ${tokens(turn.input + turn.output)}`];
  if (turns.length > 1) parts.push(`Thread ${tokens(thread.input + thread.output)}`);
  if (share >= 0.005) parts.push(`${Math.round(share * 100)}% cached`);
  for (const c of sums || []) parts.push(`${c.reported ? '' : 'est. '}${money(c.cost, c.currency)}`);
  const lines = [
    `${live ? 'This turn so far' : 'Last turn'}: ${inOut(turn)}.`,
    turns.length > 1 && `This thread, ${turns.length} turns: ${inOut(thread)}.`,
    share >= 0.005 && `The cache served ${Math.round(share * 100)}% of what the model read${saved.length ? `, which saved about ${and(saved)}` : ''}.`,
    reported.length > 0 && `Cost${estimated.length ? ' of the turns OpenRouter priced' : ''}: ${money(reported[0].cost, 'USD')}, as OpenRouter reports it.`,
    estimated.length > 0 &&
      `Estimated cost${reported.length ? ' of the other turns' : ''}: ${and(estimated.map((c) => money(c.cost, c.currency)))}, from your prices in Settings › Models${estimated.length > 1 ? ', in the currency of each price and not added together' : ''}. The provider’s bill may differ.`,
    !sums && `No cost is shown: set a price for ${costs.some(Boolean) ? 'each model this thread used' : model || 'this model'} in Settings › Models to see an estimate.`
  ];
  return { parts, title: lines.filter(Boolean).join('\n') };
}

/** ACP's token counts for a task (unstable in ACP: each agent fills what it has) */
type AcpUsage = { totalTokens?: number; inputTokens?: number; outputTokens?: number; thoughtTokens?: number; cachedReadTokens?: number; cachedWriteTokens?: number };

/**
 * A local agent's meter, from what it reported: how full its context is and the session's cost (ACP usage_update; the
 * cost is the session's whole, so the last one said stands until another comes), and the last task's tokens (a
 * prompt's usage, gone once a new task starts). Nothing when the agent reports neither.
 */
export function localMeter(events: AgentEvent[]): Meter | null {
  type Cost = { amount: number; currency: string };
  type Context = { used: number; size: number; cost?: Cost };
  let context: Context | null = null;
  let cost: Cost | null = null;
  let task: AcpUsage | null = null;
  for (const e of events) {
    if (e.type === 'user') task = null;
    if (e.type !== 'usage' || !e.data) continue;
    const { context: c, turn } = e.data as { context?: Context; turn?: AcpUsage };
    if (c && Number.isFinite(c.used) && c.size > 0) context = c;
    if (c?.cost && Number.isFinite(c.cost.amount) && typeof c.cost.currency === 'string') cost = c.cost;
    if (turn && typeof turn === 'object') task = turn;
  }
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const total = task ? n(task.totalTokens) || n(task.inputTokens) + n(task.outputTokens) + n(task.thoughtTokens) + n(task.cachedReadTokens) + n(task.cachedWriteTokens) : 0;
  if (!context && !total) return null;
  const full = context ? Math.min(1, context.used / context.size) : undefined;
  const parts = [
    context && `Context ${Math.round(full! * 100)}%`,
    cost && money(cost.amount, cost.currency),
    total && `Last task ${tokens(total)}`
  ].filter(Boolean) as string[];
  const lines = [
    context && `The agent’s context holds ${whole(context.used)} of ${whole(context.size)} tokens (${Math.round(full! * 100)}%)${full! >= 0.8 ? ': nearly full. The agent may summarise or drop the start of the session' : ''}.`,
    cost && `Cost of the session so far, as the agent reports it: ${money(cost.amount, cost.currency)}.`,
    total &&
      `Last task: ${whole(total)} tokens${task && (n(task.inputTokens) || n(task.outputTokens)) ? ` (${whole(n(task.inputTokens))} in, ${whole(n(task.outputTokens) + n(task.thoughtTokens))} out${n(task.cachedReadTokens) ? `, ${whole(n(task.cachedReadTokens))} from the cache` : ''})` : ''}, as the agent counts them.`
  ];
  return { parts, title: lines.filter(Boolean).join('\n'), ...(full !== undefined && { full }) };
}

/**
 * A thread's model and effort as its turns send them, and what the picker offers: the main provider's models (the
 * model in Settings › Models first if it is not listed, as a typed or Other one is) and the efforts the chosen model
 * accepts. A choice the provider no longer has at all (the provider changed in Settings) falls back to the settings.
 * A model switched off in Settings › Models is another matter: the thread keeps it, listed last so the menu can name
 * it, and `off` says so, for the tab to ask before it sends (offNotice).
 */
export function turnChoice(
  preset: ProviderPreset | null,
  settings: { llmModel: string; reasoningEffort: ReasoningEffort },
  choice: TurnChoice
): { model: string; effort: ReasoningEffort; models: [string, string][]; efforts: [ReasoningEffort, string][]; off?: true } {
  const models: [string, string][] = (preset?.models || []).map((m) => [m.id, m.label]);
  if (settings.llmModel && !models.some(([id]) => id === settings.llmModel)) models.unshift([settings.llmModel, settings.llmModel]);
  const off = choice.model ? preset?.off?.find((m) => m.id === choice.model) : undefined;
  if (off) models.push([off.id, off.label]);
  const model = choice.model && models.some(([id]) => id === choice.model) ? choice.model : settings.llmModel;
  const efforts = effortOptions(off || modelOf(preset, model));
  const fits = (e?: ReasoningEffort): e is ReasoningEffort => !!e && efforts.some(([v]) => v === e);
  const effort: ReasoningEffort = fits(choice.effort) ? choice.effort : fits(settings.reasoningEffort) ? settings.reasoningEffort : 'default';
  return { model, effort, models, efforts, ...(off && { off: true as const }) };
}

/**
 * What the Spectrum agent's tab says, above its message box, while the thread's model is switched off: sending waits
 * until another model is chosen or this one is switched back on. '' while the choice can be sent as it is.
 */
/**
 * Whether sending waits on that notice: in the Spectrum agent's tab, and in the assistant panel's Assistant mode. A
 * References look-up never uses the chat's own model, so it goes on.
 */
export const holdsSend = (choice: { off?: true }, mode: 'assistant' | 'references' = 'assistant') => !!choice.off && mode === 'assistant';

export const offNotice = (choice: { model: string; models: [string, string][]; off?: true }) =>
  choice.off ? `${choice.models.find(([id]) => id === choice.model)?.[1] || choice.model}, this thread’s model, is switched off in Settings › Models.` : '';

/** A chip of the stats row under an agent's message box, as DeepSeek Harness shows it, and the popover it opens */
export type StatChip = {
  key: 'session' | 'tokens' | 'context';
  /** the short text, its parts joined with a dot */
  text: string[];
  /** how full the context is (0 to 1), drawn as a ring, for the context chip */
  ring?: number;
  title: string;
  /** the popover's headline, its right side, and a bar of the context for the context chip */
  total?: string;
  bar?: number;
  rows: [label: string, value: string][];
  note?: string;
};

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};
// ponytail: agents count cached input differently (Codex inside its input, Claude beside it); a share over 100% means beside
const cacheHit = (input: number, cached: number) => (cached > input ? cached / (input + cached) : input ? cached / input : 0);

/**
 * A local agent's stats row: its tasks and steps with the time they took, the session's tokens with the cache's share
 * and the cost the agent reports, and how full its context is. Only what the agent reported; nothing before a task.
 */
export function localStats(events: AgentEvent[], price?: Price): StatChip[] {
  let tasks = 0, steps = 0, busy = 0, started: number | null = null;
  const sum = { input: 0, output: 0, thought: 0, cachedRead: 0, cachedWrite: 0, total: 0 };
  let context: { used: number; size: number } | null = null;
  let cost: { amount: number; currency: string } | null = null;
  const calls = new Set<string>();
  let estimate: { amount: number; currency: string } | null = null;
  for (const e of events) {
    const at = Date.parse(e.at);
    if (e.type === 'user') { tasks++; started = at; }
    if ((e.type === 'complete' || (e.type === 'state' && !RUNNING_STATES.includes(e.data?.status))) && started !== null && Number.isFinite(at)) { busy += Math.max(0, at - started); started = null; }
    if (e.type === 'update' && e.data?.sessionUpdate === 'tool_call' && e.data.toolCallId && !calls.has(e.data.toolCallId)) { calls.add(e.data.toolCallId); steps++; }
    if (e.type !== 'usage' || !e.data) continue;
    const { context: c, turn: t } = e.data as { context?: { used: number; size: number; cost?: { amount: number; currency: string } }; turn?: Record<string, number> };
    if (c && Number.isFinite(c.used) && c.size > 0) context = c;
    if (c?.cost && Number.isFinite(c.cost.amount) && typeof c.cost.currency === 'string') cost = c.cost;
    if (t) {
      const add = { input: n(t.inputTokens), output: n(t.outputTokens), thought: n(t.thoughtTokens), cachedRead: n(t.cachedReadTokens), cachedWrite: n(t.cachedWriteTokens) };
      for (const k of Object.keys(add) as (keyof typeof add)[]) sum[k] += add[k];
      sum.total += n(t.totalTokens) || add.input + add.output + add.thought + add.cachedRead + add.cachedWrite;
    }
  }
  const chips: StatChip[] = [];
  if (tasks) {
    chips.push({
      key: 'session',
      text: [`${tasks} ${tasks === 1 ? 'task' : 'tasks'}`, `${steps} ${steps === 1 ? 'step' : 'steps'}`, ...(busy ? [duration(busy)] : [])],
      title: 'Session statistics',
      rows: [['Tasks', String(tasks)], ['Steps (tool calls)', String(steps)], ...(busy ? [['Time working', duration(busy)], ['Average per task', duration(busy / tasks)]] as [string, string][] : [])]
    });
  }
  // where the agent reports no cost, an estimate at the chosen model's price (the user's, else models.dev's)
  if (!cost && sum.total && price?.input !== undefined && price.output !== undefined) {
    const uncached = sum.cachedRead > sum.input ? sum.input : sum.input - sum.cachedRead;
    // ponytail: cache writes priced as input; Anthropic charges a quarter more, so this is a little low there
    const amount = (uncached * price.input + sum.cachedRead * (price.cached ?? price.input) + sum.cachedWrite * price.input + (sum.output + sum.thought) * price.output) / 1e6;
    estimate = { amount, currency: price.currency || 'USD' };
  }
  if (sum.total) {
    const hit = cacheHit(sum.input, sum.cachedRead);
    chips.push({
      key: 'tokens',
      text: [`${tokens(sum.total)} tok`, ...(sum.cachedRead ? [`Cache ${Math.round(hit * 100)}%`] : []), ...(cost ? [money(cost.amount, cost.currency)] : estimate ? [`est. ${money(estimate.amount, estimate.currency)}`] : [])],
      title: 'Token usage',
      total: `${whole(sum.total)} tok`,
      rows: [
        ...(sum.cachedRead ? [['Cache hit', `${Math.round(hit * 100)}%`]] as [string, string][] : []),
        ['Input', `${whole(sum.input)} tok`],
        ...(sum.cachedRead ? [['Cached input', `${whole(sum.cachedRead)} tok`]] as [string, string][] : []),
        ...(sum.cachedWrite ? [['Written to the cache', `${whole(sum.cachedWrite)} tok`]] as [string, string][] : []),
        ['Output', `${whole(sum.output)} tok`],
        ...(sum.thought ? [['Reasoning', `${whole(sum.thought)} tok`]] as [string, string][] : []),
        ...(cost ? [['Cost so far', money(cost.amount, cost.currency)]] as [string, string][] : estimate ? [['Estimated cost', money(estimate.amount, estimate.currency)]] as [string, string][] : [])
      ],
      note: cost ? 'As the agent counts them and reports its cost, for this session.' : estimate ? 'As the agent counts them, for this session. The cost is estimated at the chosen model’s price (yours in Settings › Models, else models.dev’s); the provider’s bill may differ.' : 'As the agent counts them, for this session. Price the model in Settings › Models to see an estimate of the cost.'
    });
  }
  if (context) {
    const full = Math.min(1, context.used / context.size);
    chips.push({
      key: 'context',
      text: [`${Math.round(full * 100)}%`],
      ring: full,
      title: `${Math.round(full * 100)}% of context used`,
      total: `${tokens(context.used)} / ${tokens(context.size)}`,
      bar: full,
      rows: [['In the context', `${whole(context.used)} tok`], ['Free space', `${whole(context.size - context.used)} tok`]],
      note: full >= 0.8 ? 'Nearly full: the agent may summarise or drop the start of the session.' : 'As the agent reports it.'
    });
  }
  return chips;
}
const RUNNING_STATES = ['starting', 'running', 'stopping'];

/** The Spectrum agent's stats row: the thread's turns and its tokens, with the cache's share and the cost */
export function spectrumStats(
  messages: ChatThread['messages'],
  live: AgentUsage | null,
  model: string,
  prices: Prices,
  /** the model's context window (models.dev's), whether a model's price is the user's own, and why models.dev's list is missing */
  more: { contextSize?: (model: string) => number | undefined; ownPrice?: (model: string) => boolean; autoError?: string } = {}
): StatChip[] {
  type Meta = { usage?: Counted; steps?: unknown[]; ms?: number };
  const replies = messages.filter((m) => m.role === 'assistant' && (m.meta as Meta | undefined)?.usage).map((m) => m.meta as Meta);
  const turns: Counted[] = replies.map((m) => m.usage!);
  if (live) turns.push({ ...live, model });
  if (!turns.length) return [];
  const steps = replies.reduce((n, m) => n + (m.steps?.length || 0), 0);
  const busy = replies.reduce((n, m) => n + (m.ms || 0), 0);
  const thread = turns.reduce(add, { input: 0, output: 0 });
  const costs = turns.map((u) => costOf(u, prices));
  const sums = costs.every(Boolean) ? costSums(costs as Cost[]) : null;
  const hit = thread.input ? (thread.cacheRead || 0) / thread.input : 0;
  const total = thread.input + thread.output;
  return [
    {
      key: 'session',
      text: [`${turns.length} ${turns.length === 1 ? 'turn' : 'turns'}`, ...(steps ? [`${steps} ${steps === 1 ? 'step' : 'steps'}`] : []), ...(busy ? [duration(busy)] : [])],
      title: 'Thread statistics',
      rows: [
        ['Turns', String(turns.length)],
        ...(steps ? [['Steps (tool calls)', String(steps)]] as [string, string][] : []),
        ...(busy ? [['Time working', duration(busy)], ['Average per turn', duration(busy / replies.filter((m) => m.ms).length)]] as [string, string][] : []),
        ['Last turn', `${whole(turns[turns.length - 1].input + turns[turns.length - 1].output)} tok`]
      ]
    },
    {
      key: 'tokens',
      text: [`${tokens(total)} tok`, ...(hit >= 0.005 ? [`Cache ${Math.round(hit * 100)}%`] : []), ...(sums || []).map((c) => `${c.reported ? '' : 'est. '}${money(c.cost, c.currency)}`)],
      title: 'Token usage',
      total: `${whole(total)} tok`,
      rows: [
        ...(hit >= 0.005 ? [['Cache hit', `${Math.round(hit * 100)}%`]] as [string, string][] : []),
        ['Uncached input', `${whole(thread.input - (thread.cacheRead || 0))} tok`],
        ...(thread.cacheRead ? [['Cached input', `${whole(thread.cacheRead)} tok`]] as [string, string][] : []),
        ['Output', `${whole(thread.output)} tok`],
        ...(sums || []).map((c): [string, string] => [c.reported ? 'Cost, as OpenRouter reports it' : `Estimated cost (${c.currency})`, money(c.cost, c.currency)])
      ],
      note: sums
        ? sums.some((c) => !c.reported)
          ? `Estimated at ${turns.every((u) => !u.model || more.ownPrice?.(u.model)) ? 'your prices in Settings › Models' : turns.some((u) => u.model && more.ownPrice?.(u.model)) ? 'your prices in Settings › Models and models.dev’s' : 'models.dev’s prices'}; the provider’s bill may differ. Change a price in Settings › Models.`
          : undefined
        : more.autoError
          ? `models.dev’s price list could not be loaded (${more.autoError}). Set a price for ${model || 'this model'} in Settings › Models to see an estimate.`
          : `Neither Settings › Models nor models.dev has a price for ${model || 'this model'}. Set one there to see an estimate.`
    },
    ...contextChip(turns[turns.length - 1].context, model ? more.contextSize?.(model) : undefined)
  ];
}

/** How full the model's context was at the turn's last call, of its window, as a chip; none without both */
function contextChip(used: number | undefined, size: number | undefined): StatChip[] {
  if (!used || !size) return [];
  const full = Math.min(1, used / size);
  return [{
    key: 'context',
    text: [`${Math.round(full * 100)}%`],
    ring: full,
    title: `${Math.round(full * 100)}% of context used`,
    total: `${tokens(used)} / ${tokens(size)}`,
    bar: full,
    rows: [['In the context', `${whole(used)} tok`], ['Free space', `${whole(size - used)} tok`]],
    note: full >= 0.8 ? 'Nearly full: Spectrum sums up the start of the thread when it no longer fits.' : 'At the last turn’s last model call, of the window models.dev gives for the model.'
  }];
}
