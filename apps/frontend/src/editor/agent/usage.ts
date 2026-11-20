import type { AgentEvent, AgentUsage, ChatThread, ProviderPreset, ReasoningEffort } from '../../api/client';
import { CURRENCIES, effortOptions, modelOf } from '../../app/settings';
import type { Prices } from '../../app/settings';

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
