// Presets for the providers Settings offers, checked against each provider's API docs in October 2026.
// Each model lists the effort levels it accepts (lowest first) and the level Spectrum uses by default.
// `fields(level, model)` gives the extra request fields for a level; `api` picks the request format.

export const LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

const ALL = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const LOW_TO_MAX = ['low', 'medium', 'high', 'xhigh', 'max'];
const reasoningEffort = (level) => ({ reasoning_effort: level });

const model = (id, label, note, opts) => ({ id, label, note, vision: false, ...opts });

export const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    // Chat Completions refuses tools with any effort above none, so Spectrum uses the Responses API
    api: 'responses',
    hosts: [/(^|\.)api\.openai\.com$/],
    endpoint: 'https://api.openai.com/v1/chat/completions',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Requests go through the Responses API, so effort also applies when the assistant edits files. Nothing is stored on OpenAI’s servers.',
    fields: (level) => ({ reasoning: { effort: level } }),
    models: [
      model('gpt-6-sol', 'GPT-6 Sol', 'Strong all-rounder for writing and multi-file edits', { vision: true, levels: ALL, effort: 'medium' }),
      model('gpt-6.1-sol', 'GPT-6.1 Sol', 'Near GPT-6 Astra quality at the GPT-6 Sol price', { vision: true, levels: LOW_TO_MAX, effort: 'medium' }),
      model('gpt-6-astra', 'GPT-6 Astra', 'Most capable and most expensive', { vision: true, levels: LOW_TO_MAX, effort: 'medium' }),
      model('gpt-5.6-terra', 'GPT-5.6 Terra', 'Mid-priced previous generation', { vision: true, levels: ALL, effort: 'medium' }),
      model('gpt-6-luna', 'GPT-6 Luna', 'Fast and cheap, for autocomplete and references', { vision: true, levels: ALL, effort: 'low' })
    ],
    recommended: { main: 'gpt-6-sol', fast: 'gpt-6-luna', vision: 'gpt-6-sol', references: 'gpt-6-luna' }
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    // the OpenAI-compatible endpoint ignores effort, so Spectrum uses the Messages API
    api: 'anthropic',
    hosts: [/(^|\.)api\.anthropic\.com$/],
    endpoint: 'https://api.anthropic.com/v1/messages',
    keyUrl: 'https://platform.claude.com/settings/keys',
    note: 'Requests go through Anthropic’s Messages API, which is the only way to set Claude’s effort.',
    fields: (level) => (level === 'none' ? { thinking: { type: 'disabled' }, output_config: { effort: 'low' } } : { output_config: { effort: level } }),
    models: [
      model('claude-opus-5-5', 'Claude Opus 5.5', 'Best for long documents and careful edits', { vision: true, levels: LOW_TO_MAX, effort: 'medium' }),
      model('claude-sonnet-5-5', 'Claude Sonnet 5.5', 'Balanced quality, speed and price', { vision: true, levels: LOW_TO_MAX, effort: 'medium' }),
      model('claude-fable-5-1', 'Claude Fable 5.1', 'Top tier for the hardest work, and expensive', { vision: true, levels: LOW_TO_MAX, effort: 'high' }),
      model('claude-haiku-5-5', 'Claude Haiku 5.5', 'Fast and cheap; the only one that can turn thinking off', { vision: true, levels: ['none', ...LOW_TO_MAX], effort: 'low' })
    ],
    recommended: { main: 'claude-opus-5-5', fast: 'claude-haiku-5-5', vision: 'claude-sonnet-5-5', references: 'claude-haiku-5-5' }
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    api: 'chat',
    hosts: [/^generativelanguage\.googleapis\.com$/],
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Create the key in Google AI Studio. Gemini 3 models always think a little, so Off isn’t offered.',
    fields: reasoningEffort,
    models: [
      model('gemini-3.8-flash', 'Gemini 3.8 Flash', 'Google’s strongest Flash model, with a free tier', { vision: true, levels: ['low', 'medium', 'high'], effort: 'medium' }),
      model('gemini-3.1-pro-preview', 'Gemini 3.1 Pro (preview)', 'Strongest reasoning; no free tier', { vision: true, levels: ['low', 'medium', 'high'], effort: 'high' }),
      model('gemini-3.6-flash', 'Gemini 3.6 Flash', 'Previous Flash generation', { vision: true, levels: ['minimal', 'low', 'medium', 'high'], effort: 'medium' }),
      model('gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 'Fast and cheap, for autocomplete and references', { vision: true, levels: ['minimal', 'low', 'medium', 'high'], effort: 'minimal' })
    ],
    recommended: { main: 'gemini-3.8-flash', fast: 'gemini-3.5-flash-lite', vision: 'gemini-3.8-flash', references: 'gemini-3.5-flash-lite' }
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    api: 'chat',
    hosts: [/(^|\.)openrouter\.ai$/],
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    keyUrl: 'https://openrouter.ai/settings/keys',
    note: 'One key for models from every provider. Model names start with the provider, e.g. anthropic/claude-sonnet-5.5.',
    fields: (level) => ({ reasoning: { effort: level } }),
    models: [
      model('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Balanced choice for writing and edits', { vision: true, levels: LOW_TO_MAX, effort: 'medium' }),
      model('anthropic/claude-opus-5.5', 'Claude Opus 5.5', 'For the hardest proofs and long refactors', { vision: true, levels: LOW_TO_MAX, effort: 'medium' }),
      model('openai/gpt-6.1-sol', 'GPT-6.1 Sol', 'OpenAI’s mid-high tier', { vision: true, levels: LOW_TO_MAX, effort: 'medium' }),
      model('google/gemini-3.8-flash', 'Gemini 3.8 Flash', 'Good with images and PDFs', { vision: true, levels: ['low', 'medium', 'high'], effort: 'low' }),
      model('deepseek/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', 'Low cost', { vision: true, levels: ['low', 'high', 'max'], effort: 'high' }),
      model('moonshotai/kimi-k3', 'Kimi K3', 'Strong reasoning; slow at Max', { vision: true, levels: ['low', 'high', 'max'], effort: 'high' }),
      model('z-ai/glm-5.3', 'GLM-5.3', 'Text only', { levels: ['low', 'high', 'max'], effort: 'high' }),
      model('qwen/qwen3.8-max-0902', 'Qwen3.8 Max', 'Qwen’s strongest model', { vision: true, levels: ['minimal', 'low', 'medium', 'high', 'xhigh'], effort: 'medium' }),
      model('meta/muse-spark-1.3', 'Muse Spark 1.3', 'Meta’s current model', { vision: true, levels: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], effort: 'medium' }),
      model('openai/gpt-6-luna', 'GPT-6 Luna', 'Fast and cheap, for autocomplete and references', { vision: true, levels: ALL, effort: 'low' })
    ],
    recommended: { main: 'anthropic/claude-sonnet-5.5', fast: 'openai/gpt-6-luna', vision: 'google/gemini-3.8-flash', references: 'openai/gpt-6-luna' }
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    api: 'chat',
    hosts: [/^api\.deepseek\.com$/],
    endpoint: 'https://api.deepseek.com/chat/completions',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: 'Thinking is on unless effort is Off. Prices halve outside Beijing business hours.',
    fields: (level) => (level === 'none' ? { thinking: { type: 'disabled' } } : { thinking: { type: 'enabled' }, reasoning_effort: level }),
    models: [
      model('deepseek-flash', 'DeepSeek Flash', 'Fast, cheap and reads images', { vision: true, levels: ['none', 'low', 'high', 'max'], effort: 'high' }),
      model('deepseek-v4-pro', 'DeepSeek V4 Pro', 'Stronger reasoning, text only', { levels: ['none', 'low', 'high', 'max'], effort: 'high' })
    ],
    recommended: { main: 'deepseek-flash', fast: 'deepseek-flash', vision: 'deepseek-flash', references: 'deepseek-flash' }
  },
  {
    id: 'moonshot',
    name: 'Moonshot Kimi',
    api: 'chat',
    hosts: [/^api\.moonshot\.(ai|cn)$/],
    endpoint: 'https://api.moonshot.ai/v1/chat/completions',
    regions: [{ label: 'China', endpoint: 'https://api.moonshot.cn/v1/chat/completions' }],
    keyUrl: 'https://platform.kimi.ai/console/api-keys',
    note: 'Keys only work in the region they were made in. Kimi needs a top-up of at least US$1 before the first request.',
    // K3 has no off switch and treats a missing effort as Max; K2.6 can only turn thinking off
    fields: (level, m) => (m?.id === 'kimi-k2.6' ? (level === 'none' ? { thinking: { type: 'disabled' } } : {}) : reasoningEffort(level)),
    models: [
      model('kimi-k3', 'Kimi K3', 'Moonshot’s strongest model', { vision: true, levels: ['low', 'high', 'max'], effort: 'high' }),
      model('kimi-k2.6', 'Kimi K2.6', 'Faster; thinking can be turned off', { vision: true, levels: ['none', 'high'], effort: 'high' })
    ],
    recommended: { main: 'kimi-k3', fast: 'kimi-k2.6', vision: 'kimi-k3', references: 'kimi-k2.6' }
  },
  {
    id: 'glm',
    name: 'Z.ai GLM',
    api: 'chat',
    hosts: [/^api\.z\.ai$/, /^open\.bigmodel\.cn$/],
    endpoint: 'https://api.z.ai/api/paas/v4/chat/completions',
    regions: [{ label: 'China (BigModel)', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' }],
    keyUrl: 'https://z.ai/manage-apikey/apikey-list',
    note: 'Use a pay-as-you-go key; GLM Coding Plan keys are limited to Z.ai’s supported tools. GLM-5.3 reads text only.',
    fields: (level) => (level === 'none' ? { thinking: { type: 'disabled' } } : { thinking: { type: 'enabled' }, reasoning_effort: level }),
    models: [
      model('glm-5.3', 'GLM-5.3', 'Z.ai’s flagship, text only', { levels: ['low', 'high', 'max'], effort: 'high' }),
      model('glm-5.3-flash', 'GLM-5.3 Flash', 'Fast and reads images', { vision: true, levels: ['low', 'high', 'max'], effort: 'low' }),
      model('glm-5.2', 'GLM-5.2', 'Thinking can be turned off, text only', { levels: ['none', 'high', 'max'], effort: 'high' })
    ],
    recommended: { main: 'glm-5.3', fast: 'glm-5.3-flash', vision: 'glm-5.3-flash', references: 'glm-5.3-flash' }
  },
  {
    id: 'qwen',
    name: 'Alibaba Qwen',
    api: 'chat',
    hosts: [/(^|\.)dashscope(-intl|-us)?\.aliyuncs\.com$/, /\.maas\.aliyuncs\.com$/],
    endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    regions: [
      { label: 'China (Beijing)', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
      { label: 'Hong Kong', endpoint: 'https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' }
    ],
    keyUrl: 'https://modelstudio.console.alibabacloud.com/ap-southeast-1/settings/api-key',
    note: 'Keys only work in the region they were made in. For a workspace endpoint, paste its address into Endpoint.',
    fields: (level, m) => {
      if (level === 'none') return { enable_thinking: false };
      // Qwen3.7 has no effort setting, only a thinking budget
      if (m?.id.startsWith('qwen3.7')) return { enable_thinking: true, ...(level === 'xhigh' ? {} : { thinking_budget: level === 'low' ? 4096 : 16384 }) };
      return reasoningEffort(level);
    },
    models: [
      model('qwen3.8-max', 'Qwen3.8 Max', 'Qwen’s strongest model', { vision: true, levels: ['none', 'low', 'medium', 'xhigh'], effort: 'medium' }),
      model('qwen3.8-flash', 'Qwen3.8 Flash', 'Similar ability at a lower price', { vision: true, levels: ['none', 'low', 'medium', 'xhigh'], effort: 'low' }),
      model('qwen3.7-plus', 'Qwen3.7 Plus', 'Balanced previous generation', { vision: true, levels: ['none', 'low', 'medium', 'xhigh'], effort: 'medium' }),
      model('qwen3.7-flash', 'Qwen3.7 Flash', 'The cheapest', { vision: true, levels: ['none', 'low', 'medium', 'xhigh'], effort: 'low' })
    ],
    recommended: { main: 'qwen3.8-max', fast: 'qwen3.8-flash', vision: 'qwen3.8-max', references: 'qwen3.8-flash' }
  },
  {
    id: 'meta',
    name: 'Meta Muse Spark',
    api: 'chat',
    hosts: [/^api\.meta\.ai$/],
    endpoint: 'https://api.meta.ai/v1/chat/completions',
    keyUrl: 'https://dev.meta.ai/api-keys',
    note: 'Muse Spark always thinks, so Off isn’t offered. The cheaper Contributor models let Meta train on what you send, so they aren’t listed.',
    fields: reasoningEffort,
    models: [
      model('muse-spark-1.3', 'Muse Spark 1.3', 'Meta’s current model', { vision: true, levels: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], effort: 'medium' }),
      model('muse-spark-1.2', 'Muse Spark 1.2', 'Previous version', { vision: true, levels: ['minimal', 'low', 'medium', 'high', 'xhigh'], effort: 'medium' })
    ],
    recommended: { main: 'muse-spark-1.3', fast: 'muse-spark-1.3', vision: 'muse-spark-1.3', references: 'muse-spark-1.3' }
  }
];

/** The preset for an endpoint, or null for any other OpenAI-compatible server. */
export function providerFor(endpoint, id) {
  if (id) return PROVIDERS.find((p) => p.id === id) || null;
  let host = '';
  try {
    host = new URL(endpoint).hostname;
  } catch {
    return null;
  }
  return PROVIDERS.find((p) => p.hosts.some((re) => re.test(host))) || null;
}

/**
 * The level to send for a model: 'default' is the preset's level, 'fast' the lowest the model accepts,
 * and any other level the nearest one the model accepts (rounding up on a tie). null sends nothing.
 */
export function effortFor(m, requested = 'default') {
  if (!m) return LEVELS.includes(requested) ? requested : null;
  if (!m.levels.length) return null;
  if (requested === 'fast') return m.levels[0];
  if (!LEVELS.includes(requested)) return m.effort;
  const want = LEVELS.indexOf(requested);
  const distance = (level) => Math.abs(LEVELS.indexOf(level) - want);
  return m.levels.reduce((best, level) => (distance(level) <= distance(best) ? level : best));
}

/** Extra request fields for a provider, model and requested effort. */
export function effortFields(provider, modelId, requested) {
  const m = provider.models.find((x) => x.id === modelId);
  const level = effortFor(m, requested);
  return level ? provider.fields(level, m) : {};
}
