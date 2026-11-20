import { useEffect, useState } from 'react';
import { addMcpServer, checkMcpServer, listMcpServers, removeMcpServer, setMcpServerOn } from '../api/client';
import type { McpServer, McpTool } from '../api/client';
import { errorText } from '../editor/shared';
import { confirmDialog } from './Dialogs';

/** A command line as words: spaces part them, and quotes keep a word with spaces whole. */
export const commandWords = (line: string) => [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);

/**
 * Settings › Agents › MCP servers: the user's own, for the Spectrum agent. Added off; Check starts one in isolation
 * and lists its tools, which is what On needs; Remove stops it and forgets it.
 */
export default function McpServers() {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [tools, setTools] = useState<Record<string, McpTool[]>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [line, setLine] = useState('');

  const refresh = () => listMcpServers().then((res) => setServers(res.servers), (err) => setError(errorText(err)));
  useEffect(() => void refresh(), []);
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };
  const add = () =>
    act('add', async () => {
      const [command, ...args] = commandWords(line);
      await addMcpServer({ name: name.trim(), command: command || '', args });
      setName('');
      setLine('');
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
      {servers?.map((s) => (
        <div key={s.name} className="mcp-server">
          <div className="row">
            <b>{s.name}</b>
            <code className="mono grow truncate" title={[s.command, ...s.args].join(' ')}>
              {[s.command, ...s.args].join(' ')}
            </code>
            <button className="btn small" disabled={!!busy} onClick={() => act(s.name, async () => {
                const { tools: list } = await checkMcpServer(s.name);
                setTools((t) => ({ ...t, [s.name]: list }));
              })}>
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
      ))}
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
      <div className="field-hint">
        A server is added off. Check starts it and lists its tools; switch it on to give them to the agent. If its tools change later, the agent gets none until
        you check it again. It reaches the internet over HTTPS only, and cannot read your projects or the rest of your files.
      </div>
      {error && <div className="field-hint error">{error}</div>}
    </section>
  );
}
