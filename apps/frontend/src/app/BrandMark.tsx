import { useSettings } from './settings';

// The mark of a brand, wherever one shows: before a provider's name in Settings › Providers and Settings › Models,
// before a model in its provider's list, and for a local agent in Settings › Agents and the agent workspace. One set
// of line marks by default, so the whole app reads alike; Settings › Appearance › Logos shows the brands' own logos
// instead where Spectrum ships one.

/**
 * The line marks: a 24 × 24 drawing in strokes alone, in the colour of the text beside it. DeepSeek's, Moonshot's,
 * Anthropic's, OpenRouter's, OpenAI's and Ollama's are the owner's plan's; the rest are Spectrum's own in the same
 * hand. Each suggests its brand and copies no logo.
 */
export const LINE_MARKS: Record<string, string> = {
  // providers
  openai: 'M12 2l10 6.5v7L12 22 2 15.5v-7z',
  anthropic: 'M4 17L12 5l8 12M7.5 13h9',
  google: 'M12 3c.6 4.6 4.4 8.4 9 9-4.6.6-8.4 4.4-9 9-.6-4.6-4.4-8.4-9-9 4.6-.6 8.4-4.4 9-9z',
  openrouter: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v18M3 12h18',
  deepseek: 'M12 3c5 0 9 4 9 9s-4 9-9 9-9-4-9-9M8 12c1.5-2 4.5-2 6 0',
  moonshot: 'M12 4a8 8 0 100 16 8 8 0 000-16zM4.5 9h15M4.5 15h15',
  zai: 'M6 6h12L6 18h12',
  qwen: 'M11.5 4a7.5 7.5 0 100 15 7.5 7.5 0 000-15zM13.5 13.5L20 20',
  meta: 'M12 12c-2-3.2-3.6-5.5-6-5.5a5.5 5.5 0 000 11c2.4 0 4-2.3 6-5.5zm0 0c2 3.2 3.6 5.5 6 5.5a5.5 5.5 0 000-11c-2.4 0-4 2.3-6 5.5z',
  ollama: 'M5 4h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM8 21h8M12 18v3',
  'ollama-cloud': 'M7 18.5a4.5 4.5 0 01-.6-8.96A6 6 0 0118 10.6a4 4 0 01-.5 7.9H7z',
  // any other server: a rack
  custom: 'M5 4h14a2 2 0 012 2v3a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM5 13h14a2 2 0 012 2v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 012-2zM7 7.5h.01M7 16.5h.01',
  // the agents, and the Claude models
  claude: 'M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7',
  opencode: 'M9 7l-5 5 5 5M15 7l5 5-5 5',
  codex: 'M12 2l10 6.5v7L12 22 2 15.5v-7zM9 9.5l3.5 2.5L9 14.5M13.5 15h2.5',
  'gemini-cli': 'M9.5 4c.4 3.2 2.8 5.6 6 6-3.2.4-5.6 2.8-6 6-.4-3.2-2.8-5.6-6-6 3.2-.4 5.6-2.8 6-6zM14 20h7',
  antigravity: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  copilot: 'M8 8h8a4 4 0 014 4v2a4 4 0 01-4 4H8a4 4 0 01-4-4v-2a4 4 0 014-4zM9.5 12v2M14.5 12v2M12 8V5',
  cursor: 'M5 4l14 7.5-6 1.5-2.5 6z',
  'kimi-code': 'M7 5v14M17 5L7 13M11.5 10.5L17 19',
  hermes: 'M7 5v14M17 5v14M7 12h10M3 8h4M17 8h4',
  qoder: 'M8 4h6a4 4 0 014 4v6a4 4 0 01-4 4H8a4 4 0 01-4-4V8a4 4 0 014-4zM14 14l6 6',
  pi: 'M5 7h14M9 7v11M15 7v8.5c0 1.6.9 2.5 2.5 2.5',
  workbuddy: 'M5 8h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2zM9 8V6a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18'
};

/**
 * The brands with a full logo: the file in public/agents, from Lobe Icons under the MIT licence
 * (scripts/agent-logos.mjs, THIRD_PARTY_NOTICES.md). Claude's spark stands for Anthropic too, Kimi's mark for
 * Moonshot and Z.ai's for ZCode, as before.
 */
export const FULL_LOGOS: Record<string, string> = {
  anthropic: 'claude', claude: 'claude', deepseek: 'deepseek', moonshot: 'kimi', 'kimi-code': 'kimi', zai: 'zcode',
  opencode: 'opencode', codex: 'codex', 'gemini-cli': 'gemini', antigravity: 'antigravity', copilot: 'copilot', cursor: 'cursor',
  hermes: 'hermes', qoder: 'qoder', pi: 'pi', workbuddy: 'workbuddy'
};

/** A provider preset's brand ('custom', the rack, for any other server). */
const PROVIDER_BRANDS: Record<string, string> = {
  openai: 'openai', anthropic: 'anthropic', gemini: 'google', openrouter: 'openrouter', deepseek: 'deepseek', moonshot: 'moonshot',
  glm: 'zai', qwen: 'qwen', meta: 'meta', ollama: 'ollama', 'ollama-cloud': 'ollama-cloud'
};
export const providerBrand = (id: string) => PROVIDER_BRANDS[id] || 'custom';

/** A local agent's brand, or '' for an agent Spectrum has no mark for (it shows the first letters of its name). */
const AGENT_BRANDS: Record<string, string> = {
  opencode: 'opencode', codex: 'codex', claude: 'claude', gemini: 'gemini-cli', antigravity: 'antigravity', copilot: 'copilot', cursor: 'cursor',
  kimi: 'kimi-code', hermes: 'hermes', qoder: 'qoder', pi: 'pi', deepseek: 'deepseek', zcode: 'zai', workbuddy: 'workbuddy'
};
export const agentBrand = (id: string) => AGENT_BRANDS[id] || '';

const FAMILIES: [RegExp, string][] = [
  [/^(gpt|chatgpt|codex|o\d)/, 'openai'],
  [/^claude/, 'claude'],
  [/^(gemini|gemma)/, 'google'],
  [/^deepseek/, 'deepseek'],
  [/^(kimi|moonshot)/, 'moonshot'],
  [/^glm/, 'zai'],
  [/^(qwen|qwq)/, 'qwen'],
  [/^(muse|llama)/, 'meta']
];
/** The family a model belongs to, by its name without a vendor prefix (anthropic/claude-… is Claude), or '' when Spectrum can't tell. */
export function modelBrand(model: string) {
  const name = model.slice(model.lastIndexOf('/') + 1).toLowerCase();
  return FAMILIES.find(([starts]) => starts.test(name))?.[1] || '';
}

/**
 * A brand's mark: its line mark, or with Settings › Appearance › Logos on Full logos its own logo where Spectrum
 * ships one. tile: on the small tile Settings' rows and menus use (an agent's icon is a tile already).
 */
export default function BrandMark({ brand, tile = false, className = '' }: { brand: string; tile?: boolean; className?: string }) {
  const [{ logos }] = useSettings();
  const full = logos === 'full' && FULL_LOGOS[brand];
  const mark = full ? (
    <img className={`brand-full ${className}`} src={`/agents/${full}.svg`} alt="" draggable={false} />
  ) : (
    <svg className={`brand-line ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={LINE_MARKS[brand] || LINE_MARKS.custom} />
    </svg>
  );
  return tile ? <span className="brand-tile" aria-hidden="true">{mark}</span> : mark;
}
