import { useEffect, useState } from 'react';
import { getUpdateNotice } from '../api/client';
import Icon from './Icon';
import { useSettings } from './settings';

// The projects page's notice of a newer Spectrum: a link to its release page, nothing downloaded. Asked only while
// Settings › System › "Tell me when a newer Spectrum is out" is on; OK hides it until a later one comes out.

const HIDDEN = 'spectrum-update-hidden';

/** The release to tell the user about, or null: none newer, the setting off (nothing is asked then), or hidden. */
export async function updateToShow(on: boolean, hidden: string, ask = getUpdateNotice) {
  if (!on) return null;
  const res = await ask();
  return res.available && res.version && res.url && res.version !== hidden ? { version: res.version, url: res.url } : null;
}

const hiddenVersion = () => {
  try {
    return window.localStorage.getItem(HIDDEN) || '';
  } catch {
    return '';
  }
};

export default function UpdateNotice() {
  const [settings] = useSettings();
  const [release, setRelease] = useState<{ version: string; url: string } | null>(null);
  useEffect(() => {
    let live = true;
    updateToShow(settings.updateCheck, hiddenVersion()).then((next) => live && setRelease(next), () => undefined);
    return () => {
      live = false;
    };
  }, [settings.updateCheck]);
  if (!release) return null;
  const hide = () => {
    try {
      window.localStorage.setItem(HIDDEN, release.version);
    } catch {
      // shown again next time
    }
    setRelease(null);
  };
  return (
    <div className="move-notice" role="status">
      <Icon name="arrow.down.circle" />
      <div className="move-notice-body">
        <div className="move-notice-title">Spectrum {release.version} is available</div>
        <div className="move-notice-text">This is {__APP_VERSION__}. The release page has the installers and what changed.</div>
        <div className="row">
          <a className="btn small primary" href={release.url} target="_blank" rel="noreferrer">Open the release page</a>
          <button className="btn small" onClick={hide}>OK</button>
        </div>
      </div>
    </div>
  );
}
