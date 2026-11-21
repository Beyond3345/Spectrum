import { useEffect, useState } from 'react';
import { addMcpServer, checkMcpServer, listMcpServers, removeMcpServer, setMcpServerNetwork, setMcpServerOn, setMcpServerVariables } from '../api/client';
import type { ApiError, McpServer, McpTool } from '../api/client';
import { errorText } from '../editor/shared';
import { confirmDialog } from './Dialogs';
import Icon from './Icon';
import { IS_WINDOWS } from './platform';

/** A command line as words: spaces part them, and quotes keep a word with spaces whole. */
export const commandWords = (line: string) => [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);

/** Hosts as typed in one box: spaces or commas part them. */
export const hostWords = (line: string) => line.split(/[\s,]+/).filter(Boolean);

/** Ports as typed: a number is a number, anything else is left for the backend to name in its refusal. */
export const portWords = (line: string) => hostWords(line).map((w) => (/^\d{1,5}$/.test(w) ? Number(w) : w));

const NPM = ['registry.npmjs.org'];
const PYPI = ['pypi.org', 'files.pythonhosted.org'];
/**
 * What a command that fetches its program before it runs it needs to reach: the tool's name and its registry's hosts
 * (npm's for npx, npm, pnpm dlx and bunx; PyPI's index and file hosts for uvx and pipx), or null for any other command.
 */
export function downloadHosts(command: string, args: string[]): { tool: string; hosts: string[] } | null {
  const name = (command.split(/[\\/]/).pop() || '').toLowerCase().replace(/\.(cmd|exe|ps1)$/, '');
  if (name === 'pnpm') return args[0] === 'dlx' ? { tool: 'pnpm dlx', hosts: NPM } : null;
  if (['npx', 'npm', 'bunx'].includes(name)) return { tool: name, hosts: NPM };
  if (['uvx', 'pipx'].includes(name)) return { tool: name, hosts: PYPI };
  return null;
}

/** Hosts as a sentence: “a”, “a and b”, “a, b and c”. */
const listed = (hosts: string[]) => (hosts.length > 1 ? `${hosts.slice(0, -1).join(', ')} and ${hosts[hosts.length - 1]}` : hosts[0] || '');

/** The hosts something may reach, each removable, and a box that adds one: for an agent and for an MCP server (its ports too). */
export function HostList({ hosts, label, disabled, onChange, placeholder = 'api.example.com', addLabel = 'Add host' }: { hosts: string[]; label: string; disabled?: boolean; onChange(hosts: string[]): void; placeholder?: string; addLabel?: string }) {
  const [host, setHost] = useState('');
  const add = () => {
    const words = hostWords(host);
    if (!words.length) return;
    onChange([...hosts, ...words]);
    setHost('');
  };
  return (
    <>
      {hosts.length > 0 && (
        <div className="chip-row">
          {hosts.map((h) => (
            <span key={h} className="chip">
              <span className="mono">{h}</span>
              <button className="chip-remove" aria-label={`Remove ${h}`} disabled={disabled} onClick={() => onChange(hosts.filter((x) => x !== h))}>
                <Icon name="xmark" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row">
        <input
          className="input grow mono"
          placeholder={placeholder}
          aria-label={label}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn small" disabled={disabled || !host.trim()} onClick={add}>
          {addLabel}
        </button>
      </div>
    </>
  );
}

/** A server's environment variables: names shown, values never (the backend keeps them); a name and a value add or replace one. */
function Variables({ server, disabled, onChange }: { server: McpServer; disabled: boolean; onChange(env: Record<string, string | null>): Promise<boolean> }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const add = async () => {
    if (!name.trim() || !value) return;
    // kept until the backend took it, so a refused name does not lose a long key
    if (await onChange({ [name.trim()]: value })) {
      setName('');
      setValue('');
    }
  };
  return (
    <div className="agent-section mcp-hosts">
      <div className="field-hint">
        {server.env.length
          ? `Its environment variables, ${server.envWhy ? '' : `kept ${IS_WINDOWS ? 'encrypted for your Windows account' : 'in the keychain'} and `}given to this server alone:`
          : 'Environment variables, such as an API key it needs:'}
      </div>
      {server.env.length > 0 && (
        <div className="chip-row">
          {server.env.map((n) => (
            <span key={n} className="chip">
              <span className="mono">{n}</span>
              <span aria-label="value hidden">••••••••</span>
              <button className="chip-remove" aria-label={`Remove ${n}`} disabled={disabled} onClick={() => void onChange({ [n]: null })}>
                <Icon name="xmark" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row">
        <input className="input mono" style={{ width: 180 }} placeholder="NAME" aria-label={`A variable’s name for “${server.name}”`} spellCheck={false} autoCorrect="off" autoCapitalize="off" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className="input grow mono"
          type="password"
          placeholder="Value"
          aria-label={`Its value`}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
        <button className="btn small" disabled={disabled || !name.trim() || !value} onClick={() => void add()}>
          {server.env.includes(name.trim()) ? 'Replace' : 'Add variable'}
        </button>
      </div>
      {server.envWhy && <div className="field-hint error">They are in a file in Spectrum’s data folder that only your account can read, as Spectrum could not keep them with your API keys: {server.envWhy}</div>}
      {server.env.length > 0 && <div className="field-hint">Adding, replacing or removing one switches the server off until you check it again.</div>}
    </div>
  );
}

/**
 * Settings › Agents › MCP servers: the user's own, for the Spectrum agent. Added off; Check starts one in isolation
 * and lists its tools, which is what On needs; Remove stops it and forgets it. Each has its own hosts: none until the
 * user lists one, here or from what a Check found it asking for.
 */
export default function McpServers() {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [tools, setTools] = useState<Record<string, McpTool[]>>({});
  // a server whose last Check failed: what it said, and the hosts the gate refused it
  const [failed, setFailed] = useState<Record<string, { message: string; refused: string[]; details: string }>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [line, setLine] = useState('');
  const [hosts, setHosts] = useState('');

  const refresh = () => listMcpServers().then((res) => setServers(res.servers), (err) => setError(errorText(err)));
  useEffect(() => void refresh(), []);
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      await refresh();
      return true;
    } catch (err) {
      setError(errorText(err));
      // what it changed before it failed, such as the hosts a failed Check was refused
      await refresh();
      return false;
    } finally {
      setBusy('');
    }
  };
  const check = (name: string) =>
    act(name, async () => {
      setFailed(({ [name]: _, ...rest }) => rest);
      try {
        const { tools: list } = await checkMcpServer(name);
        setTools((t) => ({ ...t, [name]: list }));
      } catch (err) {
        const data = (err as ApiError).data as { refused?: string[]; details?: string } | undefined;
        if (typeof data?.details !== 'string') throw err;
        setFailed((f) => ({ ...f, [name]: { message: errorText(err), refused: data.refused || [], details: data.details || '' } }));
      }
    });
  const allow = (s: McpServer, more: string[]) => setMcpServerNetwork(s.name, { hosts: [...new Set([...s.hosts, ...more])] });
  const add = () =>
    act('add', async () => {
      const [command, ...args] = commandWords(line);
      await addMcpServer({ name: name.trim(), command: command || '', args, hosts: hostWords(hosts) });
      setName('');
      setLine('');
      setHosts('');
    });

  return (
    <section className="agent-group" aria-labelledby="agent-mcp">
      <h3 id="agent-mcp" className="agent-group-title">
        MCP servers
      </h3>
      <div className="field-hint">
        Your own MCP servers, for the Spectrum agent. Each runs isolated, as a local agent does, and starts only when you check it or the agent needs it. What its
        tools answer is treated as material, never as your instructions, and a tool that may change something asks you first.
      </div>
      {servers?.map((s) => {
        const fail = failed[s.name];
        // the hosts the failed Check was refused that are still off its list, said in its card rather than below
        const asked = fail ? fail.refused.filter((h) => !s.hosts.includes(h)) : [];
        const download = s.anyHost || IS_WINDOWS ? null : downloadHosts(s.command, s.args);
        const needs = download && !s.checked && !fail?.refused.length ? download.hosts.filter((h) => !s.hosts.includes(h)) : [];
        return (
          <div key={s.name} className="mcp-server">
            <div className="row">
              <b>{s.name}</b>
              <code className="mono grow truncate" title={[s.command, ...s.args].join(' ')}>
                {[s.command, ...s.args].join(' ')}
              </code>
              <button className="btn small" disabled={!!busy} onClick={() => void check(s.name)}>
                {busy === s.name ? 'Checking…' : 'Check'}
              </button>
              <label className="checkbox-row" title={s.checked ? undefined : 'Check the server first, to see its tools'}>
                <input type="checkbox" role="switch" checked={s.on} disabled={!!busy || (!s.checked && !s.on)} onChange={(e) => act(`on-${s.name}`, () => setMcpServerOn(s.name, e.target.checked))} />
                <span>On</span>
              </label>
              <button
                className="btn small"
                disabled={!!busy}
                onClick={async () => {
                  if (await confirmDialog({ title: `Remove “${s.name}”?`, message: 'The agent stops using its tools. Its folder in Spectrum’s data stays.', confirmLabel: 'Remove', destructive: true })) await act(`rm-${s.name}`, () => removeMcpServer(s.name));
                }}
              >
                Remove
              </button>
            </div>
            {needs.length > 0 && download && (
              <div className="row field-hint mcp-download">
                <span className="grow">
                  {download.tool} downloads its program first, so it needs <span className="mono">{listed(needs)}</span>.
                </span>
                <button className="btn small" disabled={!!busy} onClick={() => act(`net-${s.name}`, () => allow(s, needs))}>
                  {needs.length > 1 ? 'Allow both' : `Allow`}
                </button>
              </div>
            )}
            {fail && (
              <div className="agent-section mcp-failed" role="alert">
                {fail.refused.length > 0 ? (
                  <>
                    <div className="field-hint error">
                      Check stopped. It asked for <span className="mono">{listed(fail.refused)}</span>, which {fail.refused.length > 1 ? 'are' : 'is'} not on its list.
                    </div>
                    {asked.map((host) => (
                      <div key={host} className="row field-hint">
                        <span className="mono grow">{host}</span>
                        <button className="btn small" disabled={!!busy} onClick={() => act(`net-${s.name}`, () => allow(s, [host]))}>
                          Allow
                        </button>
                      </div>
                    ))}
                    {asked.length > 0 ? (
                      <div className="row">
                        <button className="btn small" disabled={!!busy} onClick={() => void act(`net-${s.name}`, () => allow(s, asked)).then((ok) => ok && check(s.name))}>
                          Allow and check again
                        </button>
                      </div>
                    ) : (
                      <div className="field-hint">Allowed. Press Check to start it again.</div>
                    )}
                  </>
                ) : (
                  <div className="field-hint error">{fail.message}</div>
                )}
                {fail.details && (
                  <details className="agent-advanced">
                    <summary>Details</summary>
                    <pre className="agent-details mono">{fail.details}</pre>
                  </details>
                )}
              </div>
            )}
            {!IS_WINDOWS && (
              <div className="agent-section mcp-hosts">
                <label className="checkbox-row">
                  <input type="checkbox" checked={s.anyHost} disabled={!!busy} onChange={(e) => act(`net-${s.name}`, () => setMcpServerNetwork(s.name, { anyHost: e.target.checked }))} />
                  <span>Any host</span>
                </label>
                {s.anyHost ? (
                  <div className="field-hint">It reaches every public host over HTTPS.</div>
                ) : (
                  <>
                    <div className="field-hint">{s.hosts.length ? 'It reaches only these hosts, over HTTPS:' : 'It reaches no host. Add the ones it needs:'}</div>
                    <HostList hosts={s.hosts} label={`A host “${s.name}” may reach`} disabled={!!busy} onChange={(list) => act(`net-${s.name}`, () => setMcpServerNetwork(s.name, { hosts: list }))} />
                    {s.refused.filter((host) => !fail?.refused.includes(host)).map((host) => (
                      <div key={host} className="row field-hint">
                        <span className="grow">
                          It asked for <span className="mono">{host}</span>, which is not on its list.
                        </span>
                        <button className="btn small" disabled={!!busy} onClick={() => act(`net-${s.name}`, () => setMcpServerNetwork(s.name, { hosts: [...s.hosts, host] }))}>
                          Allow
                        </button>
                      </div>
                    ))}
                  </>
                )}
                <div className="field-hint">
                  {s.ports.length
                    ? 'On this computer (127.0.0.1) it reaches only these ports:'
                    : 'It reaches no service on this computer. Add the port of one it needs, such as 23119 for Zotero:'}
                </div>
                <HostList
                  hosts={s.ports.map(String)}
                  label={`A port on this computer “${s.name}” may reach`}
                  placeholder="A port, such as 23119"
                  addLabel="Add port"
                  disabled={!!busy}
                  onChange={(list) => act(`net-${s.name}`, () => setMcpServerNetwork(s.name, { ports: portWords(list.join(' ')) }))}
                />
              </div>
            )}
            <Variables server={s} disabled={!!busy} onChange={(env) => act(`env-${s.name}`, () => setMcpServerVariables(s.name, env))} />
            {tools[s.name]?.length > 0 && (
              <ul className="field-hint mcp-tools">
                {tools[s.name].map((t) => (
                  <li key={t.name}>
                    <b>{t.name}</b> · {t.readOnly ? 'only reads' : 'asks you first'}
                    {t.description && ` · ${t.description}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <div className="row">
        <input className="input" style={{ width: 140 }} placeholder="Name" aria-label="Server name" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} />
        <input
          className="input grow mono"
          placeholder="Command, such as npx -y some-mcp-server"
          aria-label="Command that starts the server"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          value={line}
          onChange={(e) => setLine(e.target.value)}
        />
        <button className="btn small" disabled={!!busy || !name.trim() || !line.trim()} onClick={add}>
          Add
        </button>
      </div>
      {!IS_WINDOWS && (
        <input
          className="input mono"
          placeholder="Hosts it may reach, such as api.example.com (none if left empty)"
          aria-label="Hosts the server may reach"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          value={hosts}
          onChange={(e) => setHosts(e.target.value)}
        />
      )}
      <div className="field-hint">
        A server is added off. Check starts it and lists its tools; switch it on to give them to the agent. If its tools change later, the agent gets none until
        you check it again. It cannot read your projects or the rest of your files, and{' '}
        {IS_WINDOWS
          ? 'reaches the internet at any public address: on Windows, isolation cannot hold a server to a list of hosts yet. Nor can it reach a service on this computer, such as Zotero, as Windows isolation refuses every address of the computer itself.'
          : 'reaches only the hosts you list for it, over HTTPS, and the ports on this computer you add. A server started with npx or uvx needs its package registry (registry.npmjs.org, or pypi.org and files.pythonhosted.org), which Spectrum offers before its first Check. When a Check stops, it says what the server asked for, with a button that allows it. A local service you allow does whatever it does for any program that asks it: Zotero’s, for one, reads your whole library.'}
      </div>
      {error && <div className="field-hint error">{error}</div>}
    </section>
  );
}
