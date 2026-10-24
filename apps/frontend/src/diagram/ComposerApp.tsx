// Stub of the composer window's page, so the host's /diagram route builds on its own; build/c-frame replaces it.
import type { DiagramLanguage } from './types';

export default function ComposerApp(props: { projectId: string; file?: string; lang?: DiagramLanguage }) {
  return (
    <main className="tool-empty">
      Diagram composer for {props.file || props.lang || 'a new diagram'} in project {props.projectId}.
    </main>
  );
}
