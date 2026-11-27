import type { ReactNode } from 'react';
import Icon from './Icon';

// The mark before a provider's name in Settings › Providers and Settings › Models, on the same white tile as the
// agents' logos, so each reads the same in light and dark and in both colour styles.

// the providers whose mark Spectrum already ships for an agent (public/agents, from Lobe Icons under the MIT
// licence: scripts/agent-logos.mjs, THIRD_PARTY_NOTICES.md): Claude's spark, DeepSeek's whale, Kimi's and Z.ai's
const LOGOS: Record<string, string> = { anthropic: 'claude', deepseek: 'deepseek', moonshot: 'kimi', glm: 'zcode' };

// a server of no brand: a computer for Ollama, a cloud for Ollama's own servers, a rack for any other endpoint
const ICONS: Record<string, string> = { ollama: 'desktopcomputer', 'ollama-cloud': 'cloud' };

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

// Spectrum's own drawings, in one ink, for the providers it ships no mark of. Each suggests its provider and copies
// no logo: a six-sided aperture, a four-pointed spark, two routes joined into one, a Q, a loop
const GLYPHS: Record<string, ReactNode> = {
  openai: <path {...line} d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9L12 3zm0 0l3.9 15.75M19.8 16.5L4.2 12m0 4.5l11.7-11.25" />,
  gemini: <path fill="currentColor" d="M12 2c.7 5.3 4.7 9.3 10 10-5.3.7-9.3 4.7-10 10-.7-5.3-4.7-9.3-10-10 5.3-.7 9.3-4.7 10-10z" />,
  openrouter: <path {...line} d="M2.5 12H8c3.5 0 4-5 8-5h5.5M8 12c3.5 0 4 5 8 5h5.5M18.5 4l3 3-3 3m0 4l3 3-3 3" />,
  qwen: <path {...line} d="M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zm1.5 10l7 7.5" />,
  meta: <path {...line} d="M12 12c-2-3.2-3.6-5.5-6-5.5a5.5 5.5 0 000 11c2.4 0 4-2.3 6-5.5zm0 0c2 3.2 3.6 5.5 6 5.5a5.5 5.5 0 000-11c-2.4 0-4 2.3-6 5.5z" />
};

/** id: a provider preset's, or 'custom' (anything unknown gets the rack too). Decoration only: the name is always beside it. */
export default function ProviderMark({ id }: { id: string }) {
  return (
    <span className="provider-mark" aria-hidden="true">
      {LOGOS[id] ? (
        <img src={`/agents/${LOGOS[id]}.svg`} alt="" draggable={false} />
      ) : GLYPHS[id] ? (
        <svg viewBox="0 0 24 24">{GLYPHS[id]}</svg>
      ) : (
        <Icon name={ICONS[id] || 'server.rack'} />
      )}
    </span>
  );
}
