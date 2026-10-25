import { useEffect, useRef, useState } from 'react';
import { cancelGitHubDevice, getGitHub, gitHubDeviceState, setSettingsRepo, signInToGitHub, signOutOfGitHub, startGitHubDevice, syncSettingsRepo } from '../api/client';
import type { GitHubAuth } from '../api/client';
import { errorText } from '../editor/shared';
import { confirmDialog } from './Dialogs';
import { toast } from './Toast';

type Device = { id: string; userCode: string; verificationUri: string };

/**
 * Settings › GitHub: signing in (the device code when Spectrum has an OAuth app, a pasted token always), signing out,
 * and the private repository settings follow the user through. The token never comes back to the window.
 */
export default function GitHubSettings() {
  const [auth, setAuth] = useState<GitHubAuth | null>(null);
  const [token, setToken] = useState('');
  const [device, setDevice] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [repoNote, setRepoNote] = useState('');
  const deviceRef = useRef<Device | null>(null);
  deviceRef.current = device;

  useEffect(() => {
    getGitHub().then(setAuth, (err) => setError(errorText(err)));
    // a sign-in still waiting when Settings closes is given up
    return () => {
      if (deviceRef.current) cancelGitHubDevice(deviceRef.current.id).catch(() => undefined);
    };
  }, []);

  // Spectrum's backend asks GitHub at most every 5 s; here it only asks the backend
  useEffect(() => {
    if (!device) return;
    const timer = window.setInterval(async () => {
      const res = await gitHubDeviceState(device.id).catch(() => null);
      if (!res || res.state === 'waiting') return;
      setDevice(null);
      if (res.state === 'done') {
        setAuth(await getGitHub());
        toast('Signed in to GitHub.', { tone: 'success' });
      } else setError(res.state === 'expired' ? 'The code ran out before it was entered. Try again.' : res.state === 'denied' ? 'GitHub said no to the sign-in.' : res.error || 'The sign-in failed.');
    }, 2000);
    return () => window.clearInterval(timer);
  }, [device]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const signInWithDevice = () =>
    run(async () => {
      const res = await startGitHubDevice();
      setDevice({ id: res.id, userCode: res.userCode, verificationUri: res.verificationUri });
      window.open(res.verificationUri, '_blank', 'noreferrer');
    });

  const paste = () =>
    run(async () => {
      setAuth(await signInToGitHub(token));
      setToken('');
      toast('Signed in to GitHub.', { tone: 'success' });
    });

  const signOut = async () => {
    const ok = await confirmDialog({
      title: 'Sign out of GitHub?',
      message: 'Projects stop backing up to GitHub and your settings stay on this computer until you sign in again. Nothing is deleted from GitHub.',
      confirmLabel: 'Sign out'
    });
    if (ok) await run(async () => setAuth(await signOutOfGitHub()));
  };

  const switchRepo = (on: boolean) =>
    run(async () => {
      setAuth(await setSettingsRepo(on));
      setRepoNote('');
    });

  const syncNow = () =>
    run(async () => {
      const res = await syncSettingsRepo();
      setRepoNote(res.error ? `Couldn’t sync: ${res.error}` : res.ready ? 'Up to date.' : '');
    });

  if (!auth) return error ? <div className="field-hint error">{error}</div> : <div className="field-hint"><span className="spinner" /> Loading…</div>;

  return (
    <>
      <div className="field-hint section-hint">
        Your projects go between your computers through GitHub: Spectrum backs each one up to a private repository of yours and pulls the latest when you open it.
        Sign in once on each computer.
      </div>

      <h3 className="form-section-title">Account</h3>
      {auth.signedIn ? (
        <div className="field">
          <div className="row spread">
            <span>
              Signed in as <strong>{auth.login}</strong>
              {auth.name && auth.name !== auth.login ? ` (${auth.name})` : ''}
            </span>
            <button className="btn small" disabled={busy} onClick={signOut}>Sign out</button>
          </div>
        </div>
      ) : (
        <>
          {auth.deviceSignIn && (
            <div className="field">
              {device ? (
                <div role="status">
                  <div>Enter this code at <a href={device.verificationUri} target="_blank" rel="noreferrer">{device.verificationUri.replace(/^https?:\/\//, '')}</a>:</div>
                  <div className="device-code mono" aria-label={`Code ${device.userCode.split('').join(' ')}`}>{device.userCode}</div>
                  <div className="row">
                    <button className="btn small" onClick={() => navigator.clipboard?.writeText(device.userCode).then(() => toast('Copied the code.'), () => undefined)}>Copy code</button>
                    <button className="btn small ghost" onClick={() => (cancelGitHubDevice(device.id).catch(() => undefined), setDevice(null))}>Cancel</button>
                  </div>
                  <div className="field-hint"><span className="spinner" /> Waiting for GitHub…</div>
                </div>
              ) : (
                <div>
                  <button className="btn small primary" disabled={busy} onClick={signInWithDevice}>Sign in with GitHub…</button>
                  <div className="field-hint">Opens GitHub in your browser, where you enter the code Spectrum shows and allow it to use your repositories.</div>
                </div>
              )}
            </div>
          )}
          <div className="field">
            <label htmlFor="settings-githubToken">{auth.deviceSignIn ? 'Or paste a token' : 'Paste a token'}</label>
            <div className="row">
              <input
                id="settings-githubToken"
                className="input mono"
                type="password"
                value={token}
                autoComplete="off"
                spellCheck={false}
                placeholder="github_pat_… or ghp_…"
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && token.trim() && !busy && paste()}
              />
              <button className="btn small primary" disabled={busy || !token.trim()} onClick={paste}>Sign in</button>
            </div>
            <div className="field-hint">
              Make one at <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">github.com/settings/personal-access-tokens</a>: a
              fine-grained token for all your repositories with Contents and Administration set to Read and write, or a classic token with the repo scope.
              Spectrum keeps it on this computer, readable by your account only.
            </div>
          </div>
          {!auth.deviceSignIn && (
            <details className="agent-advanced">
              <summary>Sign in with one click instead</summary>
              <ol className="field-hint">
                <li>On GitHub, open Settings › Developer settings › OAuth Apps and choose New OAuth App.</li>
                <li>Name it Spectrum. The homepage and callback addresses can be any address, as the device sign-in doesn’t use them.</li>
                <li>Tick Enable Device Flow, choose Register application and copy its Client ID. No client secret is needed.</li>
                <li>Start Spectrum with SPECTRUM_GITHUB_CLIENT_ID set to that Client ID.</li>
              </ol>
            </details>
          )}
        </>
      )}

      <h3 className="form-section-title">Your settings on GitHub</h3>
      <label className="checkbox-row">
        <input type="checkbox" checked={auth.settingsRepo} disabled={busy} onChange={(e) => switchRepo(e.target.checked)} />
        <span>
          Keep my settings in a private repository (spectrum-settings)
          <span className="field-hint">
            Appearance, editor, spelling, shortcuts, personas, your own skills and templates, the folders on the Projects page and tag colours follow you to
            your other computers. API keys, tokens and folders on disk stay on each computer. A computer signing in for the first time takes the settings
            already there.
          </span>
        </span>
      </label>
      {auth.signedIn && auth.settingsRepo && (
        <div className="row">
          <button className="btn small" disabled={busy} onClick={syncNow}>Sync settings now</button>
          {repoNote && <span className="field-hint" role="status">{repoNote}</span>}
        </div>
      )}
      {error && <div className="field-hint error">{error}</div>}
    </>
  );
}
