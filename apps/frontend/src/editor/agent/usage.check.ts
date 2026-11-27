// Self-check for the agent tabs' meter and their model and effort choice. Run:
// npx esbuild apps/frontend/src/editor/agent/usage.check.ts --bundle --platform=node --format=esm --loader:.svg=text --loader:.css=empty --outfile=/tmp/usage.mjs && node /tmp/usage.mjs
import { costOf, holdsSend, localMeter, localStats, money, offNotice, spectrumMeter, spectrumStats, tokens, turnChoice } from './usage';
import { shownPreset } from '../../app/settings';
import { CURRENCIES, cleanPrices } from '../../app/settings';
import { withAutoPrices } from '../../app/autoPrices';
import type { AgentEvent, ChatMessage, ProviderPreset } from '../../api/client';

// Intl puts a no-break space between a currency and its amount
const flat = (v: unknown) => JSON.stringify(v)?.replace(/\u00a0/g, ' ');
const eq = (actual: unknown, expected: unknown, what: string) => {
  if (flat(actual) !== flat(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const has = (text: string, part: string, what: string) => {
  if (!text.replace(/\u00a0/g, ' ').includes(part)) throw new Error(`${what}: “${part}” not in “${text}”`);
};

eq([950, 1000, 12_449, 99_949, 99_950, 153_400, 1_234_567].map(tokens), ['950', '1k', '12.4k', '99.9k', '100k', '153k', '1.2M'], 'token counts');
eq([money(0.4213), money(0.004), money(3, 'EUR'), money(12, 'credits'), money(3, 'NOK')], ['US$0.42', 'under US$0.01', '€3.00', '12 credits', 'NOK 3.00'], 'money');
// every currency on offer: a symbol no other shares, no bare $ or ¥, and the yen and won in whole units
eq(CURRENCIES.map(([code]) => money(1234.5, code)), ['US$1,234.50', 'CN¥1,234.50', '€1,234.50', '£1,234.50', 'A$1,234.50', 'NZ$1,234.50', 'CA$1,234.50', 'S$1,234.50', 'HK$1,234.50', 'NT$1,234.50', 'JP¥1,235', '₩1,235', '₹1,234.50', 'CHF 1,234.50'], 'each currency');
eq(new Set(CURRENCIES.map(([, symbol]) => symbol)).size, CURRENCIES.length, 'no two currencies share a symbol');
eq([money(0.3, 'JPY'), money(0.004, 'AUD')], ['under JP¥1', 'under A$0.01'], 'under the smallest unit');

// prices as typed: a bad one is no price, never a zero
eq(cleanPrices({ a: { input: 3, output: 15, cached: 0.3 }, b: { input: '3', output: 15 }, c: { input: 1, output: -1 }, d: { input: 1, output: 2, cached: NaN }, '': { input: 1, output: 1 } }), { a: { input: 3, cached: 0.3, output: 15 }, b: { output: 15 }, c: { input: 1 }, d: { input: 1, output: 2 } }, 'prices cleaned, field by field');
eq(cleanPrices('nope'), {}, 'no prices');
// a currency: US dollars when none is named or it is unknown, and an old list without currencies stays as it was
eq(cleanPrices({ a: { input: 3, output: 15, currency: 'AUD' }, b: { input: 3, output: 15, currency: 'XYZ' }, c: { input: 3, currency: 'USD' }, d: { currency: 'JPY' }, e: { currency: 'USD' } }), { a: { input: 3, output: 15, currency: 'AUD' }, b: { input: 3, output: 15 }, c: { input: 3 }, d: { currency: 'JPY' } }, 'currencies cleaned');
eq(cleanPrices({ m: { input: 2, cached: 0.5, output: 8 } }), { m: { input: 2, cached: 0.5, output: 8 } }, 'an old list loads unchanged');
eq(cleanPrices({ m: { input: 2_000, output: 110_000, currency: 'KRW' } }), { m: { input: 2_000, output: 110_000, currency: 'KRW' } }, 'a yen or won price per million tokens is not too big');

// the cache's reads at the cached price, the rest of the input at the input price
const prices = { m: { input: 3, cached: 0.3, output: 15 } };
eq(costOf({ input: 1_000_000, output: 100_000, cacheRead: 800_000, model: 'm' }, prices), { cost: (200_000 * 3 + 800_000 * 0.3 + 100_000 * 15) / 1e6, saved: (800_000 * 2.7) / 1e6, currency: 'USD', reported: false }, 'cost and saving');
eq(costOf({ input: 1_000_000, output: 0, model: 'a' }, { a: { input: 4, output: 20, currency: 'AUD' } }), { cost: 4, saved: 0, currency: 'AUD', reported: false }, 'in the price’s currency');
// the provider's own figure wins over an estimate, and is US dollars whatever the price's currency
eq(costOf({ input: 1_000_000, output: 0, model: 'a', cost: 0.5 }, { a: { input: 4, output: 20, currency: 'AUD' } }), { cost: 0.5, saved: 0, currency: 'USD', reported: true }, 'the reported cost wins');
eq(costOf({ input: 10, output: 10, model: 'nobody', cost: 0 }, {}), { cost: 0, saved: 0, currency: 'USD', reported: true }, 'a free model reported as free');
eq(costOf({ input: 10, output: 10, model: 'other' }, prices), null, 'no price, no cost');
eq(costOf({ input: 10, output: 10 }, prices), null, 'a turn that did not say its model has no cost');
eq(costOf({ input: 10, output: 10, model: 'half' }, { half: { input: 3 } }), null, 'a price with no output price is no price');

const reply = (usage?: object): ChatMessage => ({ id: String(Math.random()), role: 'assistant', content: 'ok', createdAt: '', ...(usage && { meta: { usage } }) }) as ChatMessage;
const user: ChatMessage = { id: 'u', role: 'user', content: 'go', createdAt: '' } as ChatMessage;

eq(spectrumMeter([user, reply()], null, 'm', prices), null, 'nothing counted, no meter');
// one turn: no thread total, and no cost without a price
let m = spectrumMeter([user, reply({ input: 12_000, output: 400, cacheRead: 9_000, model: 'x' })], null, 'x', prices)!;
eq(m.parts, ['Turn 12.4k', '75% cached'], 'one turn');
has(m.title, 'Last turn: 12,000 tokens in (9,000 from the cache), 400 out.', 'turn told in full');
has(m.title, 'set a price for x in Settings › Models', 'no price said');
// two priced turns and the running one: the thread's total, and the estimate labelled as one
m = spectrumMeter([user, reply({ input: 1_000_000, output: 100_000, cacheRead: 800_000, model: 'm' }), user, reply({ input: 1000, output: 0, model: 'm' })], { input: 2000, output: 500 }, 'm', prices)!;
eq(m.parts, ['Turn 2.5k', 'Thread 1.1M', '80% cached', 'est. US$2.36'], 'thread so far');
has(m.title, 'This turn so far: 2,000 tokens in, 500 out.', 'running turn');
has(m.title, 'This thread, 3 turns', 'turns counted');
has(m.title, 'which saved about US$2.16', 'the saving');
has(m.title, 'Estimated cost: US$2.36, from your prices', 'an estimate says so');
// one turn of another model with no price: no money at all for the thread
m = spectrumMeter([user, reply({ input: 1000, output: 10, model: 'm' }), user, reply({ input: 1000, output: 10, model: 'q' })], null, 'm', prices)!;
eq(m.parts.some((p) => p.includes('US$')), false, 'a thread partly unpriced shows no cost');
has(m.title, 'each model this thread used', 'and says why');
// OpenRouter's figures: shown without est., summed over the thread, and in preference to the user's price
m = spectrumMeter([user, reply({ input: 1000, output: 10, model: 'm', cost: 0.25 }), user, reply({ input: 1000, output: 10, model: 'or/free', cost: 0.125 })], { input: 50, output: 5, cost: 0.5 }, 'm', prices)!;
eq(m.parts.slice(-1), ['US$0.88'], 'reported costs summed, the running turn’s included');
has(m.title, 'Cost: US$0.88, as OpenRouter reports it.', 'the provider’s own figure');
eq(m.title.includes('Estimated'), false, 'and no estimate beside it');
// two currencies side by side, never added; OpenRouter's dollars apart from an estimate in dollars
m = spectrumMeter([user, reply({ input: 1_000_000, output: 0, model: 'a' }), user, reply({ input: 500_000, output: 0, model: 's' }), user, reply({ input: 1_000_000, output: 0, model: 'a' }), user, reply({ input: 10, output: 0, model: 'x', cost: 0.25 }), user, reply({ input: 1_000_000, output: 0, model: 'm' })], null, 'a', { ...prices, a: { input: 4, output: 20, currency: 'AUD' }, s: { input: 2, output: 10, currency: 'SGD' } })!;
eq(m.parts.slice(-4), ['US$0.25', 'est. A$8.00', 'est. S$1.00', 'est. US$3.00'], 'each currency its own sum, the reported one apart');
has(m.title, 'Cost of the turns OpenRouter priced: US$0.25, as OpenRouter reports it.', 'reported part told');
has(m.title, 'Estimated cost of the other turns: A$8.00, S$1.00 and US$3.00, from your prices in Settings › Models, in the currency of each price and not added together.', 'estimates told apart');

// a local agent: its context and its own cost, and the last task's tokens as it counts them
const ev = (id: number, data: object): AgentEvent => ({ id, type: 'usage', data, at: '' }) as AgentEvent;
eq(localMeter([{ id: 1, type: 'update', data: {}, at: '' } as AgentEvent]), null, 'nothing reported, no meter');
m = localMeter([ev(1, { context: { used: 10_000, size: 200_000 } }), ev(2, { context: { used: 53_000, size: 200_000, cost: { amount: 0.42, currency: 'USD' } } }), ev(3, { turn: { totalTokens: 12_400, inputTokens: 9000, outputTokens: 400, cachedReadTokens: 3000 } })])!;
eq(m.parts, ['Context 27%', 'US$0.42', 'Last task 12.4k'], 'local parts');
eq(m.full, 0.265, 'how full');
has(m.title, '53,000 of 200,000 tokens (27%).', 'context told');
has(m.title, 'as the agent reports it: US$0.42', 'the agent’s cost is not an estimate');
has(m.title, 'Last task: 12,400 tokens (9,000 in, 400 out, 3,000 from the cache)', 'task told');
m = localMeter([ev(1, { context: { used: 53_000, size: 200_000, cost: { amount: 0.42, currency: 'USD' } } }), ev(2, { turn: { totalTokens: 100 } }), { id: 3, type: 'user', data: { text: 'next' }, at: '' } as AgentEvent, ev(4, { context: { used: 60_000, size: 200_000 } })])!;
eq(m.parts, ['Context 30%', 'US$0.42'], 'the session’s cost stands until another is said; a new task drops the last one’s tokens');
m = localMeter([ev(1, { context: { used: 190_000, size: 200_000 } })])!;
has(m.title, 'nearly full', 'a full context warns');
eq(m.parts, ['Context 95%'], 'context alone');
eq(localMeter([ev(1, { context: { used: 5, size: 0 } })]), null, 'a context with no size is not shown');

// the model and effort a thread's turns send
const preset = {
  id: 'p',
  models: [
    { id: 'big', label: 'Big', note: '', vision: false, levels: ['low', 'medium', 'high'], effort: 'medium' },
    { id: 'plain', label: 'Plain', note: '', vision: false, levels: [], effort: 'medium' }
  ]
} as unknown as ProviderPreset;
const settings = { llmModel: 'big', reasoningEffort: 'high' as const };
let c = turnChoice(preset, settings, {});
eq([c.model, c.effort, c.models, c.efforts.map(([v]) => v)], ['big', 'high', [['big', 'Big'], ['plain', 'Plain']], ['default', 'low', 'medium', 'high']], 'defaults from Settings');
c = turnChoice(preset, settings, { model: 'big', effort: 'low' });
eq([c.model, c.effort], ['big', 'low'], 'the thread’s own');
c = turnChoice(preset, settings, { model: 'plain', effort: 'low' });
eq([c.model, c.effort, c.efforts.map(([v]) => v)], ['plain', 'default', ['default']], 'only the efforts the model accepts');
c = turnChoice(preset, settings, { model: 'gone' });
eq(c.model, 'big', 'a model the provider no longer has falls back to Settings');
c = turnChoice(null, { llmModel: 'my-model', reasoningEffort: 'xhigh' }, { model: 'big' });
eq([c.model, c.effort, c.models], ['my-model', 'xhigh', [['my-model', 'my-model']]], 'another server: its model, every effort');
c = turnChoice(preset, { llmModel: 'typed', reasoningEffort: 'default' }, {});
eq(c.models[0], ['typed', 'typed'], 'a typed model listed first');

// a thread's model switched off in Settings › Models (before this rule, in another project, or on another computer):
// the thread keeps it and says so, and no longer goes to the main model behind the user's back
{
  const hidden = { hiddenModels: { [preset.id]: ['plain'] }, llmModel: 'big' };
  const shown = shownPreset(preset, hidden);
  eq([shown.models.map((m) => m.id), shown.off?.map((m) => m.id)], [['big'], ['plain']], 'the menus lose it, and it goes along as off');
  c = turnChoice(shown, settings, { model: 'plain', effort: 'low' });
  eq([c.model, c.off, c.models, c.efforts.map(([v]) => v), c.effort], ['plain', true, [['big', 'Big'], ['plain', 'Plain']], ['default'], 'default'], 'the thread keeps its model, named, with its own efforts');
  eq(offNotice(c), 'Plain, this thread’s model, is switched off in Settings › Models.', 'the notice');
  eq(holdsSend(c), true, 'and its sending waits');
  // the assistant panel: a chat's own model and effort are the same choice, with the same notice, and Assistant mode
  // waits while a References look-up, which never uses the chat's model, goes on
  const chat = { model: 'plain', effort: 'low' as const, mode: 'assistant' as const };
  c = turnChoice(shown, settings, { model: chat.model, effort: chat.effort });
  eq([c.model, c.off, offNotice(c, 'chat'), holdsSend(c, chat.mode), holdsSend(c, 'references')], ['plain', true, 'Plain, this chat’s model, is switched off in Settings › Models.', true, false], 'an Assistant chat on a switched-off model');
  eq([holdsSend(turnChoice(shown, settings, {}), 'assistant'), holdsSend(turnChoice(shown, settings, { model: 'big' }), 'assistant')], [false, false], 'a new chat, or a chat on a model that is on, sends as before');
  // any other thread is as before
  c = turnChoice(shown, settings, { model: 'big' });
  eq([c.model, c.off, c.models, offNotice(c)], ['big', undefined, [['big', 'Big']], ''], 'a thread on another model sees nothing of it');
  c = turnChoice(shown, settings, {});
  eq([c.model, c.off], ['big', undefined], 'nor a thread with no choice of its own');
  // a model the provider no longer has at all still falls back
  c = turnChoice(shown, settings, { model: 'gone' });
  eq([c.model, c.off], ['big', undefined], 'a model the provider no longer has falls back, as before');
  // switched back on, the thread sends again
  c = turnChoice(shownPreset(preset, { hiddenModels: {}, llmModel: 'big' }), settings, { model: 'plain' });
  eq([c.model, c.off, offNotice(c)], ['plain', undefined, ''], 'switched back on');
  // the main model is never off for the menus, whatever the switches say
  c = turnChoice(shownPreset(preset, { hiddenModels: { [preset.id]: ['big'] }, llmModel: 'big' }), settings, { model: 'big' });
  eq([c.model, c.off], ['big', undefined], 'the main model');
}

// the stats row under a local agent's box: its tasks and steps, its tokens with the cache's share, its context
{
  const e = (id: number, type: string, data: object, at: string): AgentEvent => ({ id, type, data, at }) as AgentEvent;
  const chips = localStats([
    e(1, 'user', { text: 'hi' }, '2026-11-27T00:00:00Z'),
    e(2, 'update', { sessionUpdate: 'tool_call', toolCallId: 'a' }, '2026-11-27T00:00:01Z'),
    e(3, 'update', { sessionUpdate: 'tool_call_update', toolCallId: 'a' }, '2026-11-27T00:00:02Z'),
    e(4, 'usage', { turn: { inputTokens: 1000, cachedReadTokens: 800, outputTokens: 200 }, context: { used: 70000, size: 1000000 } }, '2026-11-27T00:00:03Z'),
    e(5, 'complete', {}, '2026-11-27T00:01:05Z')
  ]);
  eq(chips.map((c) => [c.key, c.text]), [['session', ['1 task', '1 step', '1m05s']], ['tokens', ['2k tok', 'Cache 80%']], ['context', ['7%']]], 'the stats row');
  eq(chips[2].total, '70k / 1M', 'the context popover’s headline');
  eq(localStats([]), [], 'nothing before a task');
  // no reported cost: an estimate at the model's price, the user's before models.dev's
  const priced = localStats([e(1, 'user', {}, ''), e(2, 'usage', { turn: { inputTokens: 1_000_000, cachedReadTokens: 500_000, outputTokens: 100_000 } }, '')], { input: 3, cached: 0.3, output: 15 });
  eq(priced[1].text, ['1.6M tok', 'Cache 50%', 'est. US$3.15'], 'estimated at the model’s price');
  const prices = withAutoPrices({ mine: { input: 1, output: 2 } }, { 'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3 } });
  eq([prices.mine, prices['anthropic/claude-sonnet-4-5'], prices.unknown], [{ input: 1, output: 2 }, { input: 3, output: 15, cached: 0.3 }, undefined], 'the user’s price, else models.dev’s by its plain name');
}

// the Spectrum agent's row: its turns with their steps and time, and the context of the last call of its window
{
  const reply = (meta: object) => ({ role: 'assistant', content: '', meta }) as unknown as ChatMessage;
  const chips = spectrumStats(
    [reply({ usage: { input: 3000, output: 200, cacheRead: 1000, model: 'deepseek-flash', context: 2600 }, steps: [{}, {}, {}], ms: 6000 }), reply({ usage: { input: 2000, output: 100, model: 'deepseek-flash', context: 4800 }, steps: [{}], ms: 4000 })],
    null,
    'deepseek-flash',
    withAutoPrices({}, { 'deepseek-flash': { input: 0.15, output: 0.6, cacheRead: 0.003, context: 128000 } }),
    { contextSize: () => 128000, ownPrice: () => false }
  );
  eq(chips.map((c) => [c.key, c.text]), [['session', ['2 turns', '4 steps', '10s']], ['tokens', ['5.3k tok', 'Cache 20%', 'est. under US$0.01']], ['context', ['4%']]], 'turns, steps, time, tokens, cost and context');
  eq(chips[1].note?.startsWith('Estimated at models.dev’s prices'), true, 'the price is models.dev’s');
  eq(spectrumStats([reply({ usage: { input: 10, output: 1, model: 'x' } })], null, 'x', {}, { autoError: 'offline' })[1].note?.includes('could not be loaded (offline)'), true, 'a list that did not load says so');
}

console.log('usage.check: ok');
