import { useEffect, useRef, useState } from 'react';
import { configureLocalAgent, importLocalAgentLogin, installLocalAgentAdapter, listLocalAgents, removeLocalAgentAdapter, testLocalAgent } from '../api/client';
import type { LocalAgent } from '../api/client';
import AgentLogo from '../editor/agent/AgentLogo';
import { STATE_CHIPS, agentGroups } from '../editor/agent/agents';
import type { AgentGroup } from '../editor/agent/agents';
import { AGENTS_CHANGED, errorText, relativeTime } from '../editor/shared';
import { confirmDialog } from './Dialogs';
import Icon from './Icon';
import Select from './Select';
import { pickFile } from './desktop';
import { IS_WINDOWS, tildify } from './platform';
import { toast } from './Toast';

/** The card the agent workspace asks Settings › Agents to open (its agent, when that isn't ready), read once. */
export const AGENT_CARD_KEY = 'spectrum-agent-card';

const GROUPS: Record<AgentGroup, [string, string?]> = {
  'set-up': ['Set up', 'These appear in the agent workspace.'],
  finish: ['Finish setting up'],
  missing: ['Not installed'],
  unavailable: [IS_WINDOWS ? 'Unavailable on Windows' : 'Unavailable'],
  planned: ['Planned']
};
const TERMINAL = IS_WINDOWS ? 'PowerShell' : 'Terminal';
const firstSentence = (text: string) => text.match(/^.*?[.!?](\s|$)/)?.[0].trim() || text;
const tokenWord = (a: LocalAgent) => (a.keyEnvs.some((k) => /TOKEN/.test(k)) && !a.keyEnvs.some((k) => /API_KEY/.test(k)) ? 'personal access token' : 'API key');
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast('Copied the command.'), () => undefined);

// Tests run one at a time; a second waits its turn
let testQueue: Promise<unknown> = Promise.resolve();

/** What the last Test (or session) found, as a sentence. */
function testSentence(a: LocalAgent) {
  const t = a.test;
  if (!t) return '';
  const when = `Last Test, ${relativeTime(t.at).toLowerCase()}: `;
  const found: Record<string, string> = {
    ready: 'it started in isolation and opened a session.',
    'sign-in': `it started and asked for a sign-in${t.methods?.length ? ` (${t.methods.join(', ')})` : ''}.`,
    error: 'it answered with an error.',
    timeout: 'it did not answer within 30 seconds.',
    exited: 'it stopped before it answered.',
    'not-acp': 'it did not answer as an ACP agent.'
  };
  return when + (found[t.code] || 'it failed.');
}

/** The closed card's one line. */
function statusLine(a: LocalAgent) {
  if (a.planned) return firstSentence(a.planned.replace(/^Planned\.\s*/, '')) || 'Planned.';
  if (a.unavailable) return firstSentence(a.unavailable);
  if (!a.supported) return 'Agent isolation is not available on this computer.';
  if (a.state === 'missing') return a.needs && !a.needs.found ? `Needs ${a.needs.name}, which was not found.` : 'Not found on this computer.';
  if (a.state === 'adapter') return `Install the ACP adapter to use ${a.name} here.`;
  const tested = `tested ${relativeTime(a.test?.at || '').toLowerCase()}`;
  if (a.state === 'ready') return a.test?.version ? `Version ${a.test.version}, ${tested}` : capital(tested);
  if (a.state === 'failed') return capital(testSentence(a).replace(/^Last Test, [^:]*: /, ''));
  if (a.state === 'untested') return 'Set up, not tested yet.';
  return a.test ? 'It asked for a sign-in.' : 'Found. Sign in, copy the login or add a key.';
}

type Step = { text: string; code?: string; action?: 'test' | 'install' | 'copy' | 'choose' };
/** The one next step a card suggests, with at most one button. */
function nextStep(a: LocalAgent): Step | null {
  if (a.planned) return { text: `${a.name} will connect through its official platform in a later release.` };
  if (a.unavailable || !a.supported) return null;
  // Windows isolation starts native programs only
  if (IS_WINDOWS && a.program && /\.(cmd|bat)$/i.test(a.program)) return { text: 'Windows isolation starts only native .exe programs. Choose the agent’s .exe, or install it with its Windows installer.', action: 'choose' };
  const command = (text?: string) => (text && /^(npm|brew|curl|winget) /.test(text) ? text : undefined);
  switch (a.state) {
    case 'missing':
      if (a.needs && !a.needs.found) return { text: `Install ${a.needs.name} first${a.adapter ? ', then install the adapter' : ''}.${command(a.needs.install) ? '' : ` ${a.needs.install}`}`, code: command(a.needs.install) };
      return { text: `Install ${a.name}, then press Check again.`, code: a.install };
    case 'adapter':
      return { text: `Install the ACP adapter to use ${a.name} here.`, action: 'install' };
    case 'sign-in':
      if (a.loginFound && a.canImport && !a.loginCopied) return { text: `A ${a.name} login was found on this computer. Copy it into Spectrum.`, action: 'copy' };
      if (!a.test) return { text: 'Sign in, copy the login or add a key, then press Test. Some agents work without one.', action: 'test' };
      if (a.appSignIn) return { text: `Sign in inside the ${a.name} app, then press Copy existing login.` };
      if (a.signIn && a.canImport) return { text: `Run the sign-in command in ${TERMINAL}, then press Copy existing login.` };
      return { text: `Add your ${a.name} ${tokenWord(a)}, then press Save key.` };
    case 'untested':
      return { text: `Press Test to check that ${a.name} starts in isolation.`, action: 'test' };
    case 'failed':
      if (a.test?.code === 'timeout') return { text: `${a.name} did not answer within 30 seconds. Check that it starts in ${TERMINAL}, then press Test again.`, action: 'test' };
      if (a.test?.code === 'exited') return { text: `${a.name} stopped before it answered. See Details. If it needs another folder, add it under Advanced.` };
      if (a.test?.code === 'error') return { text: `${a.name} answered with an error: ${a.test.detail || 'no message'}`.replace(/[^.]$/, '$&.'), action: 'test' };
      return { text: 'This program did not answer as an ACP agent. Choose the right program or check the launcher arguments.', action: 'choose' };
    case 'ready':
      if (a.id === 'kimi' && a.test?.version?.startsWith('1.')) return { text: 'This is the archived Kimi CLI. Install Kimi Code, run kimi migrate, then press Test.' };
      return null;
    default:
      return null;
  }
}

function CodeBox({ code, label = 'Copy command' }: { code: string; label?: string }) {
  return (
    <div className="agent-code">
      <code className="mono">{code}</code>
      <button className="icon-btn small" title={label} aria-label={label} onClick={() => copy(code)}>
        <Icon name="doc.on.doc" />
      </button>
    </div>
  );
}

/** Settings › Agents: a card for every agent Spectrum supports, grouped by how far each is set up. */
export default function AgentsPane() {
  const [agents, setAgents] = useState<LocalAgent[] | null>(null);
  // the card the workspace asked for, once
  const [open, setOpen] = useState<string | null>(() => {
    try {
      const id = sessionStorage.getItem(AGENT_CARD_KEY);
      sessionStorage.removeItem(AGENT_CARD_KEY);
      return id || null;
    } catch {
      return null;
    }
  });
  const asked = useRef(open);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const refresh = () => listLocalAgents().then((res) => (setAgents(res.agents), res.agents));
  useEffect(() => {
    refresh().catch((err) => setError(errorText(err)));
  }, []);
  // the card asked for scrolls into view with focus on its header
  useEffect(() => {
    if (!agents || !asked.current) return;
    const head = document.getElementById(`agent-head-${asked.current}`);
    head?.scrollIntoView({ block: 'nearest' });
    head?.focus();
    asked.current = null;
  }, [agents]);

  const replace = (agent: LocalAgent) => setAgents((list) => list?.map((a) => (a.id === agent.id ? agent : a)) ?? null);

  return (
    <>
      <div className="field-hint section-hint">
        Coding agents on this computer work on a project from the agent workspace. Each runs isolated, with a private home of its own. Agents you set up here
        appear in the workspace.
      </div>
      {IS_WINDOWS && (
        <div className="field-hint">
          On Windows, local agents get no Spectrum tools yet, such as compiling or searching the literature. Skills and the workspace’s task buttons work all the
          same.
        </div>
      )}
      <div className="row">
        <button
          className="btn small"
          disabled={checking || !agents}
          onClick={async () => {
            setChecking(true);
            setError('');
            try {
              await refresh();
            } catch (err) {
              setError(errorText(err));
            } finally {
              setChecking(false);
            }
          }}
        >
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>
      {!agents && !error && (
        <div className="field-hint">
          <span className="spinner" /> Loading…
        </div>
      )}
      {agents &&
        agentGroups(agents).map(([group, list]) => (
          <section key={group} className="agent-group" aria-labelledby={`agent-group-${group}`}>
            <h3 id={`agent-group-${group}`} className="agent-group-title">
              {GROUPS[group][0]}
            </h3>
            {GROUPS[group][1] && <div className="field-hint">{GROUPS[group][1]}</div>}
            {list.map((a) => (
              <AgentCard key={a.id} agent={a} open={open === a.id} onToggle={() => setOpen((id) => (id === a.id ? null : a.id))} onChange={replace} onRefresh={refresh} />
            ))}
          </section>
        ))}
      {error && <div className="field-hint error">{error}</div>}
      <div className="field-hint">
        Keys and copied logins stay in Spectrum’s private data on this computer. The agent’s tools and commands stay isolated, and MCP servers set up for it outside
        Spectrum get no access to this computer.
      </div>
      <div className="field-hint">
        Agent names and logos belong to their owners. Spectrum shows them only to identify each agent and is not affiliated with or endorsed by them.
      </div>
    </>
  );
}

function AgentCard({
  agent: a,
  open,
  onToggle,
  onChange,
  onRefresh
}: {
  agent: LocalAgent;
  open: boolean;
  onToggle(): void;
  onChange(agent: LocalAgent): void;
  onRefresh(): Promise<LocalAgent[]>;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [key, setKey] = useState('');
  const [keyEnv, setKeyEnv] = useState(a.keyEnv);
  const [args, setArgs] = useState(JSON.stringify(a.args));
  const [runtimePaths, setRuntimePaths] = useState(a.runtimePaths.join('\n'));
  const [details, setDetails] = useState(false);
  useEffect(() => setKeyEnv(a.keyEnv), [a.keyEnv]);
  useEffect(() => {
    setArgs(JSON.stringify(a.args));
    setRuntimePaths(a.runtimePaths.join('\n'));
  }, [JSON.stringify(a.args), JSON.stringify(a.runtimePaths)]);

  const [chip, tone] = STATE_CHIPS[a.state];
  const step = nextStep(a);
  const off = !!a.unavailable || !a.supported;
  const id = `agent-card-${a.id}`;

  const test = async () => {
    setBusy('Waiting to test…');
    const run = testQueue.then(() => {
      setBusy('Testing…');
      return testLocalAgent(a.id);
    });
    testQueue = run.catch(() => undefined);
    onChange((await run).agent);
  };
  /** work, then the list again; then a Test when the program is there, as the change may have set the agent up */
  const act = async (label: string, work: () => Promise<unknown>, thenTest = true) => {
    setBusy(label);
    setError('');
    try {
      await work();
      const now = (await onRefresh()).find((x) => x.id === a.id);
      window.dispatchEvent(new Event(AGENTS_CHANGED));
      if (thenTest && now?.installed && now.supported && !now.unavailable && now.state !== 'missing') await test();
      window.dispatchEvent(new Event(AGENTS_CHANGED));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };
  const choose = async () => {
    const file = await pickFile({ title: `Choose ${a.name}’s program` });
    if (file) await act('Saving…', () => configureLocalAgent(a.id, { command: file }));
  };
  const install = async () => {
    const ad = a.adapter!;
    const ok = await confirmDialog({
      title: `Install the ${a.name} adapter?`,
      message: `Spectrum downloads ${ad.package} ${ad.version}, ${ad.official ? 'the official adapter from' : 'a community adapter published by'} ${ad.publisher}, from the npm registry into ${tildify(ad.folder)}. It needs about ${ad.size}. Install scripts do not run, and nothing outside that folder changes.`,
      confirmLabel: 'Install'
    });
    if (ok) await act('Installing…', () => installLocalAgentAdapter(a.id));
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: `Remove the ${a.name} adapter?`,
      message: `Spectrum deletes ${tildify(a.adapter!.folder)}. You can install it again at any time.`,
      confirmLabel: 'Remove',
      destructive: true
    });
    if (ok) await act('Removing…', () => removeLocalAgentAdapter(a.id), false);
  };
  const copyLogin = () =>
    act('Copying…', async () => {
      const res = await importLocalAgentLogin(a.id);
      toast(`Copied ${res.files} login and configuration ${res.files === 1 ? 'file' : 'files'} into ${a.name}’s private home.`, { tone: 'success' });
    });
  const saveAdvanced = () =>
    act('Saving…', async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(args);
      } catch {
        // the message below
      }
      if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) throw new Error('Launcher arguments must be a JSON list of strings, e.g. ["acp"].');
      await configureLocalAgent(a.id, { args: parsed as string[], runtimePaths: runtimePaths.split('\n').map((p) => p.trim()).filter(Boolean) });
    });
  const stepButton = (action: Step['action']) =>
    action === 'test' ? (
      <button className="btn small" disabled={!!busy} onClick={() => act('', test, false)}>
        Test
      </button>
    ) : action === 'install' ? (
      <button className="btn small primary" disabled={!!busy} onClick={install}>
        Install adapter
      </button>
    ) : action === 'copy' ? (
      <button className="btn small primary" disabled={!!busy} onClick={copyLogin}>
        Copy existing login
      </button>
    ) : action === 'choose' ? (
      <button className="btn small" disabled={!!busy} onClick={choose}>
        Choose…
      </button>
    ) : null;
  const sourceText = a.source === 'chosen' ? 'Chosen by you' : a.source === 'spectrum' ? 'Installed by Spectrum' : 'Found automatically';
  const keyLabel = capital(tokenWord(a));

  return (
    <div className={`skill-card agent-card ${open ? 'open' : ''}`}>
      <button
        id={`agent-head-${a.id}`}
        className="agent-card-head"
        aria-expanded={open}
        aria-controls={id}
        aria-label={a.name}
        aria-describedby={`${id}-status ${id}-chip`}
        onClick={onToggle}
      >
        <span className="agent-icon">
          <AgentLogo agent={a} />
        </span>
        <span className="agent-card-title">
          <span className="skill-name">
            {a.name}
            {a.experimental && <span className="badge agent-badge">Experimental</span>}
          </span>
          <span id={`${id}-status`} className="field-hint agent-card-status">
            {busy || statusLine(a)}
          </span>
        </span>
        <span id={`${id}-chip`} className={`badge ${tone}`}>
          {chip}
        </span>
        <Icon name={open ? 'chevron.down' : 'chevron.right'} />
      </button>
      {open && (
        <div id={id} className="agent-card-body">
          {off ? (
            <>
              <p className="agent-reason">{a.unavailable || 'Agent isolation is not available on this computer. Repair or reinstall Spectrum before starting an agent.'}</p>
              <a href={a.url} target="_blank" rel="noreferrer">
                Setup guide
              </a>
            </>
          ) : (
            <>
              {!a.planned && (
                <div className="agent-section">
                  <h4>Program</h4>
                  <div>
                    {a.program ? <span className="mono path-text">{tildify(a.program)}</span> : 'Not found'}
                    {a.program && <span className="field-hint"> · {sourceText}</span>}
                    {a.program && <span className="field-hint"> · {a.test?.version ? `Version ${a.test.version}` : 'Version not reported'}</span>}
                  </div>
                  {!!a.reads?.length && (
                    <div className="field-hint">
                      Also readable in isolation: <span className="mono">{a.reads.map(tildify).join(', ')}</span>
                    </div>
                  )}
                  {a.needs && (
                    <div className="field-hint">
                      Needs {a.needs.name}: {a.needs.found ? `found at ${tildify(a.needs.path || '')}` : 'not found'}
                    </div>
                  )}
                  <div className="row">
                    <button className="btn small" disabled={!!busy} onClick={choose}>
                      Choose…
                    </button>
                    {a.installed && (
                      <button className="btn small" disabled={!!busy || (!!a.needs && !a.needs.found)} onClick={() => act('', test, false)}>
                        Test
                      </button>
                    )}
                    {a.source === 'chosen' && (
                      <button className="btn small ghost" disabled={!!busy} onClick={() => act('Saving…', () => configureLocalAgent(a.id, { command: '' }))}>
                        Find automatically
                      </button>
                    )}
                  </div>
                  {a.test && (
                    <div className="field-hint">
                      {testSentence(a)}{' '}
                      {a.test.detail && (
                        <button className="btn small ghost" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
                          Details
                        </button>
                      )}
                    </div>
                  )}
                  {details && a.test?.detail && <pre className="agent-details mono">{a.test.detail}</pre>}
                </div>
              )}
              {a.canImport && !a.planned && (
                <div className="agent-section">
                  <h4>Sign-in</h4>
                  {a.appSignIn ? (
                    <div className="field-hint">Sign in inside the {a.name} app, then copy the login into Spectrum.</div>
                  ) : (
                    a.signIn && (
                      <>
                        <div className="field-hint">Sign-in command</div>
                        <CodeBox code={a.signIn} label="Copy sign-in command" />
                        <div className="field-hint">
                          Run it in {TERMINAL}
                          {a.then ? ` (${a.then.replace(/\.$/, '')})` : ''}, then copy the login into Spectrum. If you sign in again later, copy it again.
                        </div>
                      </>
                    )
                  )}
                  <div className="row">
                    <button className="btn small" disabled={!!busy} onClick={copyLogin}>
                      Copy existing login
                    </button>
                    <span className="field-hint">
                      {a.loginCopied ? 'A copied login is in Spectrum.' : a.loginFound ? 'A login was found on this computer.' : 'No login was found on this computer.'}
                    </span>
                  </div>
                </div>
              )}
              {(a.keyEnvs.length > 0 || a.hasKey) && !a.planned && (
                <div className="agent-section">
                  <h4 id={`${id}-key`}>{keyLabel}</h4>
                  {a.keyEnvs.length > 1 && (
                    <div className="field">
                      <label id={`${id}-provider`}>Provider</label>
                      <Select
                        labelId={`${id}-provider`}
                        value={keyEnv}
                        options={a.keyEnvs.map((name): [string, string] => [name, name.replace(/_(API_KEY|PERSONAL_ACCESS_TOKEN|TOKEN)$/, '').replace(/_/g, ' ')])}
                        onChange={setKeyEnv}
                      />
                    </div>
                  )}
                  <input
                    className="input"
                    type="password"
                    autoComplete="off"
                    aria-labelledby={`${id}-key`}
                    value={key}
                    placeholder={a.hasKey && keyEnv === a.keyEnv ? 'Saved on this computer' : `Paste your ${tokenWord(a)}`}
                    onChange={(e) => setKey(e.target.value)}
                  />
                  <div className="field-hint">
                    Passed to {a.name} as {keyEnv} and kept in Spectrum’s private data on this computer.
                    {a.hasKey && keyEnv !== a.keyEnv && ' Saving another provider removes the saved key.'}
                    {a.id === 'kimi' && ' Kimi Code reads it only when its own configuration names it (api_key_env).'}
                  </div>
                  <div className="row">
                    <button
                      className="btn small primary"
                      disabled={!!busy || (!key && keyEnv === a.keyEnv)}
                      onClick={() => act('Saving…', () => configureLocalAgent(a.id, { keyEnv, ...(key && { apiKey: key }) }).then(() => setKey('')))}
                    >
                      Save key
                    </button>
                    {a.hasKey && (
                      <button className="btn small" disabled={!!busy} onClick={() => act('Saving…', () => configureLocalAgent(a.id, { apiKey: '' }))}>
                        Remove saved key
                      </button>
                    )}
                  </div>
                </div>
              )}
              {a.adapter && (
                <div className="agent-section">
                  <h4>ACP adapter</h4>
                  <div>
                    <span className="mono">
                      {a.adapter.package} {a.adapter.version}
                    </span>{' '}
                    <span className={`badge ${a.adapter.official ? 'accent' : ''}`}>{a.adapter.official ? 'Official' : 'Community'}</span>
                  </div>
                  <div className="field-hint">
                    {a.source === 'spectrum'
                      ? 'Installed by Spectrum'
                      : a.adapter.installed
                        ? `Version ${a.adapter.installed} installed by Spectrum`
                        : a.program
                          ? 'Found on this computer'
                          : 'Not installed'}{' '}
                    · Published by {a.adapter.publisher} · Platform: {a.adapter.platform}
                  </div>
                  <div className="row">
                    {a.source !== 'spectrum' && (
                      <button className="btn small" disabled={!!busy} onClick={install}>
                        {a.adapter.installed ? 'Update adapter' : 'Install adapter'}
                      </button>
                    )}
                    {a.adapter.installed && (
                      <button className="btn small ghost" disabled={!!busy} onClick={remove}>
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="field-hint">The adapter lets Spectrum talk to {a.name} through the Agent Client Protocol.</div>
                </div>
              )}
              {step && a.state !== 'ready' && (
                <div className="agent-section">
                  <h4>Next step</h4>
                  <div>{step.text}</div>
                  {step.code && <CodeBox code={step.code} />}
                  {step.action && <div className="row">{stepButton(step.action)}</div>}
                </div>
              )}
              {step && a.state === 'ready' && <div className="field-hint">{step.text}</div>}
              {(a.experimental || a.planned) && <p className="agent-reason">{a.experimental || a.planned}</p>}
              <a href={a.url} target="_blank" rel="noreferrer">
                Setup guide
              </a>
              {!a.planned && (
                <details className="agent-advanced">
                  <summary>Advanced</summary>
                  <div className="field">
                    <label htmlFor={`${id}-args`}>Launcher arguments (a JSON list)</label>
                    <input id={`${id}-args`} className="input mono" value={args} spellCheck={false} onChange={(e) => setArgs(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor={`${id}-runtime`}>Runtime folders, one a line</label>
                    <textarea id={`${id}-runtime`} className="input mono" rows={3} value={runtimePaths} spellCheck={false} onChange={(e) => setRuntimePaths(e.target.value)} />
                    <div className="field-hint">
                      Folders the agent may read its installed libraries from, such as a Python 3.11 or later for skills’ scripts. Choose specific folders: your home
                      folder and the live project are never opened to it.
                    </div>
                  </div>
                  <button className="btn small" disabled={!!busy} onClick={saveAdvanced}>
                    Save
                  </button>
                </details>
              )}
            </>
          )}
          {error && <div className="field-hint error">{error}</div>}
        </div>
      )}
    </div>
  );
}
