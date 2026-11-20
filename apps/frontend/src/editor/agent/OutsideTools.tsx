import { useEffect, useState } from 'react';
import { getOutsideTools, setOutsideTools } from '../../api/client';
import type { OutsideTools as State } from '../../api/client';
import { CodeBox } from '../../app/AgentSettings';
import Icon from '../../app/Icon';
import Sheet from '../../app/Sheet';
import { useEditor } from '../EditorContext';
import { errorText } from '../shared';

/** What an agent's configuration needs: Claude Code's command, and the mcpServers JSON that Cursor and others read. */
function outsideConfig({ url, token }: { url: string; token: string }) {
  const header = `Authorization: Bearer ${token}`;
  return {
    claude: `claude mcp add --transport http spectrum ${url} --header "${header}"`,
    json: JSON.stringify({ mcpServers: { spectrum: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } })
  };
}

/**
 * The Local agents bar's button for Spectrum's tools in an agent Spectrum did not start: lit while this project offers
 * them. The switch is off at every launch; on, it shows the configuration with this switch's secret to copy.
 */
export default function OutsideTools() {
  const api = useEditor();
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    getOutsideTools(api.projectId).then(setState, () => undefined);
  }, [api.projectId]);
  const turn = (on: boolean) => {
    setError('');
    const { typstVersion, markdownEngine } = api.settings.compileDefaults;
    setOutsideTools(api.projectId, on, { typstVersion, markdownEngine }).then(setState, (err) => setError(errorText(err)));
  };
  const config = state?.on ? outsideConfig(state) : null;
  const title = state?.on ? 'This project’s tools are offered to another agent' : 'Use Spectrum’s tools from another agent';
  return (
    <>
      <button className={`icon-btn small${state?.on ? ' active' : ''}`} title={title} aria-label={title} aria-pressed={!!state?.on} onClick={() => setOpen(true)}>
        <Icon name="server.rack" />
      </button>
      {open && (
        <Sheet title="Use from another agent" width={560} onClose={() => setOpen(false)} actions={<button className="btn" onClick={() => setOpen(false)}>Done</button>}>
          <p className="field-hint">
            An agent you run yourself, such as Claude Code or Codex in a terminal or Cursor, can use Spectrum’s tools on this project: compile it, read its outline,
            labels and bibliography, search its text and the literature. That agent works on the project folder itself, outside Spectrum’s isolation.
          </p>
          <label className="checkbox-row">
            <input type="checkbox" role="switch" checked={!!state?.on} disabled={!state} onChange={(e) => turn(e.target.checked)} />
            <span>
              Offer this project’s tools
              <span className="field-hint">
                Only to programs on this computer that have the secret below. The secret is new each time you turn this on, and ends when you turn it off or quit
                Spectrum.
              </span>
            </span>
          </label>
          {config && (
            <>
              <h3 className="form-section-title">Claude Code</h3>
              <CodeBox code={config.claude} />
              <h3 className="form-section-title">Cursor and other agents</h3>
              <div className="field-hint">The server’s entry for the agent’s MCP configuration file.</div>
              <CodeBox code={config.json} label="Copy configuration" />
            </>
          )}
          {error && <div className="field-hint error">{error}</div>}
        </Sheet>
      )}
    </>
  );
}
