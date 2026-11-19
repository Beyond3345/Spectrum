// Self-check for the agent tabs' meter and their model and effort choice. Run:
// npx esbuild apps/frontend/src/editor/agent/usage.check.ts --bundle --platform=node --format=esm --loader:.svg=text --loader:.css=empty --outfile=/tmp/usage.mjs && node /tmp/usage.mjs
import { costOf, localMeter, money, spectrumMeter, tokens, turnChoice } from './usage';
import { cleanPrices } from '../../app/settings';
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
eq([money(0.4213), money(0.004), money(3, 'EUR'), money(12, 'credits')], ['USD 0.42', 'under USD 0.01', 'EUR 3.00', '12 credits'], 'money');

// prices as typed: a bad one is no price, never a zero
eq(cleanPrices({ a: { input: 3, output: 15, cached: 0.3 }, b: { input: '3', output: 15 }, c: { input: 1, output: -1 }, d: { input: 1, output: 2, cached: NaN }, '': { input: 1, output: 1 } }), { a: { input: 3, cached: 0.3, output: 15 }, b: { output: 15 }, c: { input: 1 }, d: { input: 1, output: 2 } }, 'prices cleaned, field by field');
eq(cleanPrices('nope'), {}, 'no prices');

// the cache's reads at the cached price, the rest of the input at the input price
const prices = { m: { input: 3, cached: 0.3, output: 15 } };
eq(costOf({ input: 1_000_000, output: 100_000, cacheRead: 800_000, model: 'm' }, prices), { cost: (200_000 * 3 + 800_000 * 0.3 + 100_000 * 15) / 1e6, saved: (800_000 * 2.7) / 1e6 }, 'cost and saving');
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
eq(m.parts, ['Turn 2.5k', 'Thread 1.1M', '80% cached', 'est. USD 2.36'], 'thread so far');
has(m.title, 'This turn so far: 2,000 tokens in, 500 out.', 'running turn');
has(m.title, 'This thread, 3 turns', 'turns counted');
has(m.title, 'which saved about USD 2.16', 'the saving');
has(m.title, 'Estimated cost: USD 2.36', 'an estimate says so');
// one turn of another model with no price: no money at all for the thread
m = spectrumMeter([user, reply({ input: 1000, output: 10, model: 'm' }), user, reply({ input: 1000, output: 10, model: 'q' })], null, 'm', prices)!;
eq(m.parts.some((p) => p.includes('USD')), false, 'a thread partly unpriced shows no cost');
has(m.title, 'each model this thread used', 'and says why');

// a local agent: its context and its own cost, and the last task's tokens as it counts them
const ev = (id: number, data: object): AgentEvent => ({ id, type: 'usage', data, at: '' }) as AgentEvent;
eq(localMeter([{ id: 1, type: 'update', data: {}, at: '' } as AgentEvent]), null, 'nothing reported, no meter');
m = localMeter([ev(1, { context: { used: 10_000, size: 200_000 } }), ev(2, { context: { used: 53_000, size: 200_000, cost: { amount: 0.42, currency: 'USD' } } }), ev(3, { turn: { totalTokens: 12_400, inputTokens: 9000, outputTokens: 400, cachedReadTokens: 3000 } })])!;
eq(m.parts, ['Context 27%', 'USD 0.42', 'Last task 12.4k'], 'local parts');
eq(m.full, 0.265, 'how full');
has(m.title, '53,000 of 200,000 tokens (27%).', 'context told');
has(m.title, 'as the agent reports it: USD 0.42', 'the agent’s cost is not an estimate');
has(m.title, 'Last task: 12,400 tokens (9,000 in, 400 out, 3,000 from the cache)', 'task told');
m = localMeter([ev(1, { context: { used: 53_000, size: 200_000, cost: { amount: 0.42, currency: 'USD' } } }), ev(2, { turn: { totalTokens: 100 } }), { id: 3, type: 'user', data: { text: 'next' }, at: '' } as AgentEvent, ev(4, { context: { used: 60_000, size: 200_000 } })])!;
eq(m.parts, ['Context 30%', 'USD 0.42'], 'the session’s cost stands until another is said; a new task drops the last one’s tokens');
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

console.log('usage.check: ok');
