import type { AgentEvent, AgentUsage, ChatThread, ProviderPreset, ReasoningEffort } from '../../api/client';
import { effortOptions, modelOf } from '../../app/settings';
import type { Prices } from '../../app/settings';

// What the agent tabs' header says about tokens, cost and context, worked out from what the agents report. Money is
// shown only where the agent itself reports a cost, or as an estimate from prices the user typed in Settings › Models.

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

/** An amount in its currency (USD 0.42); a unit that is not a currency (credits) after the number */
export function money(amount: number, currency = 'USD') {
  try {
    const format = new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format;
    return amount > 0 && amount < 0.01 ? `under ${format(0.01)}` : format(amount);
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

/** What a turn cost at the user's prices for its model, in US dollars, and what the cache saved; null without a price */
export function costOf(u: Counted, prices: Prices) {
  const p = u.model ? prices[u.model] : undefined;
  if (p?.input === undefined || p.output === undefined) return null;
  const cached = Math.min(u.cacheRead || 0, u.input);
  // ponytail: what the cache stored is priced as input; Anthropic charges a quarter more for it, so this is a little low there
  return { cost: ((u.input - cached) * p.input + cached * (p.cached ?? p.input) + u.output * p.output) / 1e6, saved: (cached * (p.input - (p.cached ?? p.input))) / 1e6 };
}

const inOut = (u: AgentUsage) => `${whole(u.input)} tokens in${u.cacheRead ? ` (${whole(u.cacheRead)} from the cache)` : ''}, ${whole(u.output)} out`;

/**
 * The Spectrum agent's meter: this turn (the one running, else the last that counted tokens) and the thread so far,
 * the share of what the model read that the cache served, and an estimate of the cost where every turn's model has a
 * price. live: the running turn's tokens so far, read by model.
 */
export function spectrumMeter(messages: ChatThread['messages'], live: AgentUsage | null, model: string, prices: Prices): Meter | null {
  const turns: Counted[] = messages.flatMap((m) => (m.role === 'assistant' && (m.meta as { usage?: Counted } | undefined)?.usage ? [(m.meta as { usage: Counted }).usage] : []));
  if (live) turns.push({ ...live, model });
  if (!turns.length) return null;
  const turn = turns[turns.length - 1];
  const thread = turns.reduce(add, { input: 0, output: 0 });
  const costs = turns.map((u) => costOf(u, prices));
  const priced = costs.every(Boolean) ? (costs as { cost: number; saved: number }[]).reduce((a, b) => ({ cost: a.cost + b.cost, saved: a.saved + b.saved }), { cost: 0, saved: 0 }) : null;
  const share = thread.input ? (thread.cacheRead || 0) / thread.input : 0;
  const parts = [`Turn ${tokens(turn.input + turn.output)}`];
  if (turns.length > 1) parts.push(`Thread ${tokens(thread.input + thread.output)}`);
  if (share >= 0.005) parts.push(`${Math.round(share * 100)}% cached`);
  if (priced) parts.push(`est. ${money(priced.cost)}`);
  const lines = [
    `${live ? 'This turn so far' : 'Last turn'}: ${inOut(turn)}.`,
    turns.length > 1 && `This thread, ${turns.length} turns: ${inOut(thread)}.`,
    share >= 0.005 && `The cache served ${Math.round(share * 100)}% of what the model read${priced && priced.saved >= 0.005 ? `, which saved about ${money(priced.saved)}` : ''}.`,
    priced
      ? `Estimated cost: ${money(priced.cost)}, from your prices in Settings › Models. The provider’s bill may differ.`
      : `No cost is shown: set a price for ${costs.some(Boolean) ? 'each model this thread used' : model || 'this model'} in Settings › Models to see an estimate.`
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
 * accepts. A choice that no longer fits (the provider changed in Settings) falls back to the settings.
 */
export function turnChoice(preset: ProviderPreset | null, settings: { llmModel: string; reasoningEffort: ReasoningEffort }, choice: TurnChoice) {
  const models: [string, string][] = (preset?.models || []).map((m) => [m.id, m.label]);
  if (settings.llmModel && !models.some(([id]) => id === settings.llmModel)) models.unshift([settings.llmModel, settings.llmModel]);
  const model = choice.model && models.some(([id]) => id === choice.model) ? choice.model : settings.llmModel;
  const efforts = effortOptions(modelOf(preset, model));
  const fits = (e?: ReasoningEffort): e is ReasoningEffort => !!e && efforts.some(([v]) => v === e);
  const effort: ReasoningEffort = fits(choice.effort) ? choice.effort : fits(settings.reasoningEffort) ? settings.reasoningEffort : 'default';
  return { model, effort, models, efforts };
}
