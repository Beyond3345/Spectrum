// Self-check for a card in Settings › Agents: the next step after an agent refused the credential it signed in with.
// Run: npx esbuild apps/frontend/src/app/agentCard.check.ts --bundle --platform=node --format=esm --loader:.svg=text --loader:.css=empty --log-level=warning --outfile=<scratch>.mjs && node <scratch>.mjs
import { nextStep } from './AgentSettings';
import type { LocalAgent } from '../api/client';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const codex = (test: Partial<LocalAgent['test']>, more: Partial<LocalAgent> = {}) => ({
  id: 'codex', name: 'Codex', keyEnvs: ['OPENAI_API_KEY'], canImport: true, signIn: 'codex login', loginFound: true, loginCopied: true, hasKey: true,
  supported: true, installed: true, program: '/x/codex-acp', state: 'sign-in', test: { ok: false, code: 'sign-in', at: '2026-11-26T00:00:00Z', ...test }, ...more
}) as LocalAgent;
eq(nextStep(codex({ refused: 'key' })), { text: 'Codex refused the saved API key. Paste a new one, then press Save key.', action: 'key' }, 'a refused key is replaced');
eq(nextStep(codex({ refused: 'login' }))?.action, 'copy', 'a refused login is copied again');
eq(nextStep(codex({ refused: 'login' }))?.text.startsWith('Codex refused the copied login: it may have expired or been signed out.'), true, 'and says why');
// with nothing refused, as before: a login found and not yet copied is offered
eq(nextStep(codex({}, { loginCopied: false, hasKey: false }))?.action, 'copy', 'a sign-in asked for without a credential');
console.log('agentCard.check: ok');
