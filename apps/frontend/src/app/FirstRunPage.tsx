import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getEngines, systemCheck } from '../api/client';
import Icon from './Icon';
import type { AppSettings } from './settings';
import type { Section as SettingsSection } from './SettingsSheet';
import { hasModel, texName } from './firstRun';

/**
 * The setup page, filling the window the first time Spectrum starts on a computer (and from Settings › System & Network): the TeX
 * the compiles use, a model for the AI features (optional) and a first project. Each row ticks itself from what the app
 * knows. Skip, Continue or a first project made or opened from it leave it for good; quitting leaves it due (firstRun.ts).
 */
export default function FirstRunPage({ settings, projects, onSettings, onTemplates, onOpenFolder, onLeave }: {
  settings: AppSettings;
  projects: number;
  onSettings: (section: SettingsSection) => void;
  onTemplates: () => void;
  onOpenFolder: () => void;
  onLeave: () => void;
}) {
  // null while the TeX tools are looked for
  const [tex, setTex] = useState<{ name: string | null; tectonic: boolean } | null>(null);
  useEffect(() => {
    Promise.all([systemCheck(settings.texFolder || undefined), getEngines()])
      .then(([check, engines]) => setTex({ name: texName(check.tools, check.texReal), tectonic: !!(engines.tectonic.builtIn || check.tools.tectonic) }))
      .catch(() => setTex({ name: null, tectonic: false }));
  }, [settings.texFolder]);

  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);

  const model = hasModel(settings);
  return (
    // no Esc here: Esc isn't Skip, and the page stays until skipped or finished (a sheet over it keeps its own Esc)
    <main className="main-panel first-run" aria-labelledby="first-run-title">
      <header className="panel-header" data-tauri-drag-region>
        <span className="spacer" data-tauri-drag-region />
        <button className="btn ghost" onClick={onLeave}>Skip</button>
      </header>
      <div className="panel-body">
        <div className="first-run-column">
          <img className="first-run-icon" src="/app-icon.png" alt="" draggable={false} />
          <h1 id="first-run-title" className="first-run-title">Welcome to Spectrum</h1>
          <p className="first-run-lead">Three things to set up for LaTeX, Typst and Markdown. Each can be changed later in Settings.</p>

          <Step
            icon="hammer"
            hue="orange"
            title="TeX for LaTeX documents"
            done={!!tex && (!!tex.name || tex.tectonic)}
            text={
              !tex
                ? 'Looking for TeX…'
                : tex.name
                  ? `Compiling with ${tex.name}, found on this computer.`
                  : tex.tectonic
                    ? 'No TeX is installed, so the built-in Tectonic compiles. It downloads each package the first time a document needs it.'
                    : 'No TeX found. Install TeX Live, or write in Typst, which needs none.'
            }
          >
            <button ref={first} className="btn" onClick={() => onSettings('engines')}>Settings › Engines</button>
          </Step>

          <Step
            icon="sparkles"
            hue="purple"
            title="A model for the AI features"
            done={model}
            optional
            text={
              model
                ? 'The assistant and agents have a model to work with.'
                : 'The assistant, agents and AI autocomplete need a model: an API key, or a model running on this computer. Everything else works without one.'
            }
          >
            <button className="btn" onClick={() => onSettings('providers')}>Settings › Providers</button>
          </Step>

          <Step
            icon="doc.badge.plus"
            hue="blue"
            title="A first project"
            done={projects > 0}
            text={
              projects > 0
                ? 'You have a project to work in.'
                : 'Start from a template: a paper, a thesis, notes or slides, in LaTeX, Typst or Markdown. Or open a folder that already holds your files.'
            }
          >
            <button className="btn" onClick={onTemplates}><Icon name="square.grid.2x2" /> Templates…</button>
            <button className="btn" onClick={onOpenFolder}><Icon name="folder" /> Open a folder…</button>
          </Step>

          <div className="first-run-actions">
            <button className="btn inverse hue-blue" onClick={onLeave}>Continue</button>
          </div>
        </div>
      </div>
    </main>
  );
}

function Step({ icon, hue, title, done, optional, text, children }: {
  icon: string;
  hue: string;
  title: string;
  done: boolean;
  optional?: boolean;
  text: string;
  children: ReactNode;
}) {
  return (
    <section className="first-run-step">
      <span className={`first-run-step-icon hue-${hue}`}>
        <Icon name={icon} />
      </span>
      <div className="first-run-step-body">
        <h2 className="first-run-step-title">
          {title}
          {done ? (
            <span className="first-run-badge done"><Icon name="checkmark.circle.fill" /> Set up</span>
          ) : (
            optional && <span className="first-run-badge">Optional</span>
          )}
        </h2>
        <p className="first-run-step-text">{text}</p>
        <div className="first-run-step-actions">{children}</div>
      </div>
    </section>
  );
}
