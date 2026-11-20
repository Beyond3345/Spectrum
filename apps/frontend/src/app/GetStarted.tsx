import { useEffect, useState } from 'react';
import { getEngines, systemCheck } from '../api/client';
import Icon from './Icon';
import type { AppSettings } from './settings';
import type { Section as SettingsSection } from './SettingsSheet';
import { hasModel, texName } from './firstRun';

type Row = { done: boolean; title: string; text: string; action: string; onAction: () => void };

/**
 * Get started, on Home and All projects until it's hidden or every row is ticked: the TeX the compiles use, a model for
 * the AI features (optional) and a first project from a template. Each row ticks itself from what the app knows.
 */
export default function GetStarted({ settings, projects, onSettings, onTemplates, onHide }: {
  settings: AppSettings;
  projects: number;
  onSettings: (section: SettingsSection) => void;
  onTemplates: () => void;
  onHide: () => void;
}) {
  // null while the TeX tools are looked for
  const [tex, setTex] = useState<{ name: string | null; tectonic: boolean } | null>(null);
  useEffect(() => {
    Promise.all([systemCheck(settings.texFolder || undefined), getEngines()])
      .then(([check, engines]) => setTex({ name: texName(check.tools, check.texReal), tectonic: !!(engines.tectonic.builtIn || check.tools.tectonic) }))
      .catch(() => setTex({ name: null, tectonic: false }));
  }, [settings.texFolder]);

  const model = hasModel(settings);
  const rows: Row[] = [
    {
      done: !!tex && (!!tex.name || tex.tectonic),
      title: 'TeX for LaTeX documents',
      text: !tex
        ? 'Looking for TeX…'
        : tex.name
          ? `Compiling with ${tex.name}, found on this computer.`
          : tex.tectonic
            ? 'Compiling with the built-in Tectonic, which downloads each package the first time a document needs it.'
            : 'No TeX found. Install TeX Live, or write in Typst, which needs none.',
      action: 'Engines',
      onAction: () => onSettings('engines')
    },
    {
      done: model,
      title: 'A model for the AI features (optional)',
      text: model ? 'The assistant and agents have a model to work with.' : 'The assistant, agents and AI autocomplete need a model: an API key, or a model running on this computer.',
      action: 'Models',
      onAction: () => onSettings('models')
    },
    {
      done: projects > 0,
      title: 'A first project',
      text: projects > 0 ? 'You have a project to work in.' : 'Start from a template: a paper, a thesis, notes or slides, in LaTeX, Typst or Markdown.',
      action: 'Templates',
      onAction: onTemplates
    }
  ];
  if (tex && rows.every((r) => r.done)) return null;

  return (
    <section className="get-started" aria-label="Get started">
      <div className="get-started-head">
        <span className="get-started-title">Get started</span>
        <button className="icon-btn small" title="Hide" aria-label="Hide Get started" onClick={onHide}>
          <Icon name="xmark" />
        </button>
      </div>
      {rows.map((row) => (
        <div key={row.title} className={`get-started-row ${row.done ? 'done' : ''}`}>
          <Icon name={row.done ? 'checkmark.circle.fill' : 'circle'} className="get-started-tick" />
          <div className="get-started-body">
            <div className="get-started-name">{row.title}</div>
            <div className="get-started-text">{row.text}</div>
          </div>
          <button className="btn small" onClick={row.onAction}>
            {row.action}
          </button>
        </div>
      ))}
    </section>
  );
}
