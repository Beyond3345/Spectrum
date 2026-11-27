import { useEffect, useState } from 'react';
import { getProxy, saveProxy, type ProxyState } from '../api/client';
import { errorText } from '../editor/shared';

/** What the Network part of Settings › System & Network says of the proxy in use, or of none. */
export function proxyLine(state: ProxyState) {
  if (!state.supported) return 'On Windows, Spectrum connects as Windows does, and does not use a proxy of its own yet.';
  return state.proxy
    ? `Spectrum goes through ${state.proxy.text} (${state.proxy.from.toLowerCase()}), and so do its agents, MCP servers and compiles.`
    : 'No proxy found: Spectrum connects directly. It looks here first, then in this Mac’s network settings, then in your shell.';
}

/** Settings › System & Network › Network: the proxy Spectrum goes through, and one to type for every connection it makes. */
export default function ProxySettings() {
  const [state, setState] = useState<ProxyState | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getProxy().then(setState, (err) => setError(errorText(err)));
  }, []);
  const save = async (proxy: string) => {
    setBusy(true);
    setError('');
    try {
      setState(await saveProxy(proxy));
      setValue('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <h3 className="form-section-title">Network</h3>
      {!state && !error && <div className="field-hint"><span className="spinner" /> Checking…</div>}
      {state && <div className="field-hint">{proxyLine(state)}</div>}
      {state?.supported && (
        <div className="field">
          <label htmlFor="proxy-typed">Proxy</label>
          <input
            id="proxy-typed"
            className="input mono"
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={state.typed || 'http://host:port or socks5://host:port'}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="field-hint">
            For a network that reaches the internet only through a proxy. Leave it empty to use this Mac’s network settings or your shell’s proxy variables.
            A name and password go before the host, as in http://name:password@host:port, and are never shown.
          </div>
          <div className="row">
            <button className="btn small primary" disabled={busy || !value.trim()} onClick={() => void save(value)}>Save proxy</button>
            {state.typed && <button className="btn small" disabled={busy} onClick={() => void save('')}>Clear</button>}
          </div>
        </div>
      )}
      {error && <div className="field-hint error">{error}</div>}
    </>
  );
}
