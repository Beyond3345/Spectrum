import { useEffect, useState } from 'react';
import type { ProviderPreset } from '../api/client';
import BrandMark, { providerBrand } from './BrandMark';
import { confirmDialog } from './Dialogs';
import Icon from './Icon';
import Select from './Select';
import { testSays, useConnectionTest } from './connectionTest';
import { isKeyRef, keyFailure, selectSavedKey } from './keys';
import { IS_WINDOWS } from './platform';
import { CUSTOM, connectPatch, connectionName, connections, credsPatch, disconnectBlock, disconnectPatch, draftConnection, isHidden, modelRows, ready } from './providerCards';
import type { Connection, Use } from './providerCards';
import { hostOf, loadSettings, useLivePreset, useProviders, useSettings } from './settings';
import type { AppSettings } from './settings';
import type { Section } from './settingsNav';

const USES: Record<Use, string> = { main: 'Main', quick: 'Quick', vision: 'Vision' };
const CUSTOM_NOTE = 'Any server that speaks the OpenAI chat completions API, such as LM Studio or vLLM.';

/**
 * One connected provider, a row of the Connected card: its mark and name, what it is and what runs on it, how many of
 * its models are in the menus and the state of its key, then Test, Edit and Disconnect. Edit opens its fields under the row.
 */
function ProviderRow({
  conn,
  settings,
  providers,
  update,
  editing,
  onEdit,
  onDisconnect
}: {
  conn: Connection;
  settings: AppSettings;
  providers: ProviderPreset[];
  update: (patch: Partial<AppSettings>) => void;
  editing: boolean;
  onEdit: (on: boolean) => void;
  onDisconnect: () => void;
}) {
  const { preset } = conn;
  const name = preset?.name || 'Custom endpoint';
  const id = `provider-${conn.at.replace(/\W/g, '-')}`;
  const test = useConnectionTest(conn.id, conn.endpoint, conn.key);
  const live = useLivePreset(preset, conn.endpoint, true);
  // the address as typed, kept on leaving the field or Return: a half-typed one never moves the row or its key
  const [endpoint, setEndpoint] = useState(conn.endpoint);
  useEffect(() => setEndpoint(conn.endpoint), [conn.endpoint]);
  const commit = () => endpoint !== conn.endpoint && update(credsPatch(settings, providers, conn, { endpoint: endpoint.trim() }));

  // the model that runs on it, so a test can say when the provider doesn't list it
  const running = conn.uses.includes('main') ? settings.llmModel : conn.uses.includes('quick') ? settings.referencesModel : conn.uses.includes('vision') ? settings.visionModel : '';
  const [state, tone] = test.testing
    ? ['Testing…', '']
    : test.result
      ? test.result.ok
        ? ['Verified', 'ok']
        : [test.result.kind === 'key' ? 'Key refused' : 'Not connected', 'error']
      : !ready(conn)
        ? [preset || conn.endpoint ? 'Needs a key' : 'Needs an address', 'warn']
        : [preset?.local || !conn.key ? 'No key needed' : isKeyRef(conn.key) ? (IS_WINDOWS ? 'Key kept for your Windows account' : 'Key in your keychain') : 'Key in this window’s storage', ''];
  const rows = modelRows(live.preset, test.models);
  const on = rows.filter((m) => !isHidden(settings, conn.id, m.id)).length;
  const own = preset ? [preset.endpoint, ...(preset.regions || []).map((r) => r.endpoint)] : [];
  // the address only where it says something the name doesn't: a server of the user's own, or a provider at another address
  const where = (!preset || preset.local || !own.includes(conn.endpoint)) && hostOf(conn.endpoint);

  return (
    <div className="inset-item" role="group" aria-labelledby={`${id}-name`}>
      <div className="inset-row">
        <BrandMark brand={providerBrand(conn.id)} tile />
        <div className="inset-info">
          <div className="inset-name">
            <span id={`${id}-name`}>{connectionName(conn) === hostOf(conn.endpoint) ? name : connectionName(conn)}</span>
            <span className="badge">{preset?.local ? 'Local' : preset ? 'API key' : 'Custom'}</span>
            {conn.uses.map((use) => <span key={use} className="badge accent" title={`The ${use} model runs on it`}>{USES[use]}</span>)}
          </div>
          <div className="inset-sub">
            {where && `${where} · `}
            {rows.length > 0 && `${on} ${on === 1 ? 'model' : 'models'} enabled · `}
            <span className={tone}>{state}</span>
          </div>
        </div>
        <button className="btn small ghost" disabled={test.testing} aria-label={`Test connection for ${name}`} title="Asks the provider for its list of models, which sends no message and costs nothing" onClick={test.run}>
          Test
        </button>
        <button className="btn small ghost" aria-expanded={editing} aria-label={`${editing ? 'Done editing' : 'Edit'} ${name}`} onClick={() => onEdit(!editing)}>
          {editing ? 'Done' : 'Edit'}
        </button>
        <button
          className="btn small ghost"
          aria-label={`Disconnect ${name}`}
          // never while a model runs on it: no role is left pointing at a provider with no key
          disabled={!!disconnectBlock(conn)}
          title={disconnectBlock(conn) || undefined}
          onClick={onDisconnect}
        >
          Disconnect
        </button>
      </div>
      {(editing || test.result) && (
        <div className="inset-more">
          {test.result && <div className={`field-hint ${test.result.ok ? '' : 'error'}`} role="status">{testSays(test.result, running)}</div>}
          {editing && (
            <>
              <div className="field-hint">{preset ? preset.note : CUSTOM_NOTE}</div>
              {preset?.regions && (
                <div className="field">
                  <label id={`${id}-region`}>Region</label>
                  <Select
                    labelId={`${id}-name ${id}-region`}
                    value={conn.endpoint}
                    options={[
                      [preset.endpoint, 'International'],
                      ...preset.regions.map((r): [string, string] => [r.endpoint, r.label]),
                      ...(own.includes(conn.endpoint) ? [] : [[conn.endpoint, 'Custom endpoint'] as [string, string]])
                    ]}
                    onChange={(value) => update(credsPatch(settings, providers, conn, { endpoint: value }))}
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor={`${id}-endpoint`}>Endpoint</label>
                <input
                  id={`${id}-endpoint`}
                  className="input"
                  aria-label={`${name} endpoint`}
                  value={endpoint}
                  placeholder={preset?.endpoint || 'http://localhost:1234/v1'}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  autoComplete="off"
                  onChange={(e) => setEndpoint(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => e.key === 'Enter' && commit()}
                />
                {(!preset || preset.local) && (
                  <div className="field-hint">
                    {preset
                      ? 'For Ollama on another computer, use its address, e.g. http://192.168.1.20:11434, and turn on Expose Ollama to the network in its settings.'
                      : 'The chat completions address or the base URL, e.g. http://localhost:1234/v1'}
                  </div>
                )}
              </div>
              {!preset?.local && (
                <div className="field">
                  <label htmlFor={`${id}-key`}>API key</label>
                  <input
                    id={`${id}-key`}
                    className="input"
                    aria-label={`${name} API key`}
                    type="password"
                    value={conn.key}
                    placeholder="Paste your key"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    autoComplete="off"
                    onFocus={selectSavedKey}
                    onChange={(e) => update(credsPatch(settings, providers, conn, { key: e.target.value }))}
                  />
                  {preset && (
                    <div className="field-hint">
                      Create one on the <a href={preset.keyUrl} target="_blank" rel="noreferrer">{preset.name} key page</a>. Each provider’s key is kept when you choose a model of another.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** What a provider yet to connect offers: its first models by name, or for one that lists its own, where they run. */
const offers = (p: ProviderPreset) =>
  p.local
    ? 'Runs the models installed on this computer or your network, with no API key'
    : p.models.length
      ? `${p.models.slice(0, 3).map((m) => m.label).join(', ')}${p.models.length > 3 ? ' and more' : ''}`
      : hostOf(p.endpoint);

/** Settings › Providers: the providers connected, each with its key, and the others to connect. */
export default function ProvidersPane({ onSection }: { onSection: (section: Section) => void }) {
  const [settings, update] = useSettings();
  const providers = useProviders();
  // a provider being connected, shown as a row before its key is typed, and the row whose fields are open
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState('');
  // with nothing set up yet, the main provider's key field is open
  useEffect(() => {
    if (providers.length && !ready(connections(loadSettings(), providers)[0])) setEditing('main');
  }, [providers.length]);
  if (!providers.length) return <div className="field-hint section-hint"><span className="spinner" /> Loading the providers…</div>;

  const conns = connections(settings, providers);
  const presetOfId = (id: string) => providers.find((p) => p.id === id) || null;
  const cards = draft && !conns.some((c) => c.at === `saved:${draft}`) ? [...conns, draftConnection(settings, presetOfId(draft))] : conns;
  const connected = (id: string) => cards.some((c) => c.id === id);

  const connect = (preset: ProviderPreset | null) => {
    const id = preset?.id || CUSTOM;
    const first = !ready(conns[0]);
    update(connectPatch(settings, providers, preset));
    setDraft(first ? null : id);
    setEditing(first ? 'main' : `saved:${id}`);
  };

  const disconnect = async (conn: Connection) => {
    const name = connectionName(conn);
    if (disconnectBlock(conn)) return;
    if (conn.key && !(await confirmDialog({ title: `Disconnect ${name}?`, message: 'Spectrum forgets its key.', confirmLabel: 'Disconnect', destructive: true }))) return;
    update(disconnectPatch(loadSettings(), providers, conn));
    if (draft === conn.id) setDraft(null);
    if (editing === conn.at) setEditing('');
  };

  const available = providers.filter((p) => !connected(p.id));
  // the settings keep one other server besides a quick or vision model's own
  const customTaken = cards.some((c) => c.id === CUSTOM && (c.at === 'main' || c.at.startsWith('saved:')));
  return (
    <>
      <div className="pane-head">
        <h3 className="pane-title">Providers</h3>
        <button className="btn small outline" disabled={customTaken} title={customTaken ? 'Spectrum keeps one custom endpoint: edit it below' : 'Any server that speaks the OpenAI chat completions API, such as LM Studio or vLLM'} onClick={() => connect(null)}>
          <Icon name="plus" /> Custom endpoint
        </button>
      </div>
      <div className="field-hint section-hint">
        Connect each provider once, with its key. <button className="link-button" onClick={() => onSection('models')}>Settings › Models</button> chooses which of their models Spectrum uses.
      </div>
      {keyFailure() && <div className="field-hint section-hint error">Your API keys stay in this window’s storage, as before: {keyFailure()}</div>}
      <h4 className="pane-label">Connected providers</h4>
      <div className="inset-card">
        {cards.map((conn) => (
          <ProviderRow
            key={conn.at}
            conn={conn}
            settings={settings}
            providers={providers}
            update={update}
            editing={editing === conn.at}
            onEdit={(on) => {
              setEditing(on ? conn.at : '');
              // Done on a provider that never got its key takes its row away again
              if (!on && draft === conn.id && !conns.some((c) => c.at === conn.at)) setDraft(null);
            }}
            onDisconnect={() => void disconnect(conn)}
          />
        ))}
      </div>
      {available.length > 0 && (
        <>
          <h4 className="pane-label">Available providers</h4>
          <div className="inset-card">
            {available.map((p) => (
              <div className="inset-row" key={p.id}>
                <BrandMark brand={providerBrand(p.id)} tile />
                <div className="inset-info">
                  <div className="inset-name">
                    {p.name}
                    {p.local && <span className="badge">Local</span>}
                  </div>
                  <div className="inset-sub">{offers(p)}</div>
                </div>
                <button className="btn small outline" aria-label={`Connect ${p.name}`} onClick={() => connect(p)}>
                  <Icon name="plus" /> Connect
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
