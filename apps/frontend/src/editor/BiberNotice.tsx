import { useState } from 'react';
import Icon from '../app/Icon';
import { installBiber } from '../api/client';
import { ENGINES_CHANGED, errorText } from './shared';

/**
 * Over the PDF when a Tectonic compile needed Biber and Spectrum couldn’t download it by itself (offline, say): one
 * button downloads it and compiles again.
 */
export default function BiberNotice({ compile, notify }: { compile: () => unknown; notify: (message: string, tone: 'success' | 'error') => void }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await installBiber();
      window.dispatchEvent(new Event(ENGINES_CHANGED));
      notify('Downloaded Biber.', 'success');
      await compile();
    } catch (err) {
      notify(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pdf-notice" role="alert">
      <div>This document’s bibliography uses biblatex, which the built-in Tectonic needs Biber for. Spectrum couldn’t download Biber by itself.</div>
      <button className="btn primary" disabled={busy} onClick={download}>
        {busy ? <span className="spinner" /> : <Icon name="arrow.down.circle" />} {busy ? 'Downloading Biber…' : 'Download Biber and compile'}
      </button>
    </div>
  );
}
