import { useEffect, useState } from 'react';
import type { ProviderPreset } from '../api/client';
import { confirmDialog } from './Dialogs';
import Select from './Select';
import { testSays, useConnectionTest } from './connectionTest';
import { isKeyRef, keyFailure, selectSavedKey } from './keys';
import { IS_WINDOWS } from './platform';
import { CUSTOM, connectPatch, connectionName, connections, credsPatch, disconnectPatch, draftConnection, ready } from './providerCards';
import type { Connection, Use } from './providerCards';
import { hostOf, loadSettings, useProviders, useSettings } from './settings';
import type { AppSettings } from './settings';
import type { Section } from './settingsNav';

const USES: Record<Use, string> = { main: 'Main model', quick: 'Quick model', vision: 'Vision model' };
const CUSTOM_NOTE = 'Any server that speaks the OpenAI chat completions API, such as LM Studio or vLLM.';

/** One connected provider: what it is, the state of its key, Test, Edit and Disconnect, and the fields Edit opens. */
function ProviderCard({
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
  // the address as typed, kept on leaving the field or Return: a half-typed one never moves the card or its key
  const [endpoint, setEndpoint] = useState(conn.endpoint);
  useEffect(() => setEndpoint(conn.endpoint), [conn.endpoint]);
  const commit = () => endpoint !== conn.endpoint && update(credsPatch(settings, providers, conn, { endpoint: endpoint.trim() }));

  const set = ready(conn);
  const [chip, tone] = test.result
    ? test.result.ok
      ? ['Connected', 'success']
      : [test.result.kind === 'key' ? 'Key refused' : 'Not connected', 'danger']
    : !set
      ? [preset || conn.endpoint ? 'Needs a key' : 'Needs an address', 'warning']
      : [preset?.local ? 'No key needed' : conn.key ? 'Key saved' : 'No key', ''];
  const region = preset?.regions?.find((r) => r.endpoint === conn.endpoint)?.label;
  const where = [
    hostOf(conn.endpoint),
    region,
    conn.key && (isKeyRef(conn.key) ? (IS_WINDOWS ? 'key kept encrypted for your Windows account' : 'key kept in your keychain') : 'key kept in this window’s storage')
  ].filter(Boolean);
  const own = preset ? [preset.endpoint, ...(preset.regions || []).map((r) => r.endpoint)] : [];

  return (
    <div className={`skill-card provider-card ${editing ? 'open' : ''}`} role="group" aria-labelledby={`${id}-name`}>
      <div className="provider-head">
        <span className="agent-card-title">
          <span className="skill-name">
            <span id={`${id}-name`}>{name}</span>
            {conn.uses.map((use) => <span key={use} className="badge accent">{USES[use]}</span>)}
          </span>
          <span className="field-hint agent-card-status">{where.join(' · ') || 'No address yet'}</span>
        </span>
        <span className={`badge ${tone}`}>{chip}</span>
      </div>
      {test.result && <div className={`field-hint ${test.result.ok ? '' : 'error'}`} role="status">{testSays(test.result, '')}</div>}
      {editing && (
        <div className="provider-fields">
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
            <div className="field-hint">
              {preset?.local
                ? 'For Ollama on another computer, use its address, e.g. http://192.168.1.20:11434, and turn on Expose Ollama to the network in its settings.'
                : preset
                  ? ''
                  : 'The chat completions address or the base URL, e.g. http://localhost:1234/v1'}
            </div>
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
        </div>
      )}
      <div className="row provider-actions">
        <button className="btn small" disabled={test.testing} aria-label={`Test connection for ${name}`} onClick={test.run}>
          {test.testing ? 'Testing…' : 'Test connection'}
        </button>
        <button className="btn small" aria-expanded={editing} aria-label={`${editing ? 'Done editing' : 'Edit'} ${name}`} onClick={() => onEdit(!editing)}>
          {editing ? 'Done' : 'Edit'}
        </button>
        <button
          className="btn small ghost"
          aria-label={`Disconnect ${name}`}
          // a main model's provider with no key has nothing left to forget
          disabled={conn.at === 'main' && !conn.key}
          title={conn.at === 'main' && !conn.key ? 'The main model runs on it. Choose another main model in Settings › Models first.' : undefined}
          onClick={onDisconnect}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

/** Settings › Providers: the providers connected, each with its key, and the others to connect. */
export default function ProvidersPane({ onSection }: { onSection: (section: Section) => void }) {
  const [settings, update] = useSettings();
  const providers = useProviders();
  // a provider being connected, shown as a card before its key is typed, and the card whose fields are open
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
    const after = [
      conn.uses.includes('main') && `The main model stays on ${name}, without a key, until you choose another in Settings › Models.`,
      conn.uses.some((use) => use !== 'main') && !conn.uses.includes('main') && 'A quick or vision model that runs on it goes back to the main model’s provider.'
    ].filter(Boolean);
    if (conn.key && !(await confirmDialog({ title: `Disconnect ${name}?`, message: ['Spectrum forgets its key.', ...after].join(' '), confirmLabel: 'Disconnect', destructive: true }))) return;
    update(disconnectPatch(loadSettings(), providers, conn));
    if (draft === conn.id) setDraft(null);
    if (editing === conn.at) setEditing('');
  };

  const available = providers.filter((p) => !connected(p.id));
  return (
    <>
      <div className="field-hint section-hint">
        Connect each provider once, with its key. <button className="link-button" onClick={() => onSection('models')}>Settings › Models</button> chooses which of their models Spectrum uses.
      </div>
      {keyFailure() && <div className="field-hint error">Your API keys stay in this window’s storage, as before: {keyFailure()}</div>}
      <h3 className="form-section-title">Connected</h3>
      <div className="provider-list">
        {cards.map((conn) => (
          <ProviderCard
            key={conn.at}
            conn={conn}
            settings={settings}
            providers={providers}
            update={update}
            editing={editing === conn.at}
            onEdit={(on) => {
              setEditing(on ? conn.at : '');
              // Done on a provider that never got its key takes its card away again
              if (!on && draft === conn.id && !conns.some((c) => c.at === conn.at)) setDraft(null);
            }}
            onDisconnect={() => void disconnect(conn)}
          />
        ))}
      </div>
      <h3 className="form-section-title">Available</h3>
      <div className="kv-list provider-available">
        {available.map((p) => (
          <div className="kv-row" key={p.id}>
            <span>
              {p.name}
              <span className="field-hint">{p.local ? 'On this computer or your network, without a key' : hostOf(p.endpoint)}</span>
            </span>
            <button className="btn small" aria-label={`Connect ${p.name}`} onClick={() => connect(p)}>Connect</button>
          </div>
        ))}
        {/* the settings keep one other server besides a quick or vision model's own */}
        {!cards.some((c) => c.id === CUSTOM && (c.at === 'main' || c.at.startsWith('saved:'))) && (
          <div className="kv-row">
            <span>
              Custom endpoint
              <span className="field-hint">{CUSTOM_NOTE}</span>
            </span>
            <button className="btn small" aria-label="Connect a custom endpoint" onClick={() => connect(null)}>Connect</button>
          </div>
        )}
      </div>
    </>
  );
}
