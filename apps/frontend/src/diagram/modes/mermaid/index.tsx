import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { confirmDialog } from '../../../app/Dialogs';
import Select from '../../../app/Select';
import { errorText } from '../../../editor/shared';
import CodePane from '../../CodePane';
import { useCanvasPrefs } from '../../FlowCanvas';
import type { DiagramMode } from '../../types';
import { renderMermaid } from './render';

// Mermaid: the code beside the diagram it draws, rendered in the app as you type

export type MermaidModel = { code: string };

const TEMPLATES: [string, string, string][] = [
  [
    'flowchart',
    'Flowchart',
    `flowchart TD
  start([Start]) --> collect[/Collect the samples/]
  collect --> check{Enough of them?}
  check -- Yes --> measure[Measure each one]
  check -- No --> collect
  measure --> stop([Write up])
`
  ],
  [
    'sequence',
    'Sequence diagram',
    `sequenceDiagram
  participant C as Client
  participant S as Server
  C->>S: Request a page
  S-->>C: The page
  C->>S: Send the form
  S-->>C: Saved
`
  ],
  [
    'class',
    'Class diagram',
    `classDiagram
  class Experiment {
    +String name
    +run() Result
  }
  class Result {
    +float value
  }
  Experiment "1" --> "*" Result : produces
`
  ],
  [
    'state',
    'State diagram',
    `stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted : submit
  Submitted --> Draft : changes asked for
  Submitted --> Accepted : accept
  Accepted --> [*]
`
  ],
  [
    'gantt',
    'Gantt chart',
    `gantt
  title Project plan
  dateFormat YYYY-MM-DD
  section Research
  Reading      :r1, 2027-02-01, 30d
  Experiments  :r2, after r1, 60d
  section Writing
  First draft  :w1, after r2, 45d
  Revisions    :w2, after w1, 20d
`
  ]
];

type CanvasProps = ComponentProps<DiagramMode<MermaidModel>['Canvas']>;

function Canvas({ model, onChange, readOnly }: CanvasProps) {
  const { dark } = useCanvasPrefs();
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  // drawn a moment after typing stops; a newer drawing replaces one still on its way
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      if (!model.code.trim()) {
        setSvg('');
        setError('');
        return;
      }
      renderMermaid(model.code, dark).then(
        (next) => {
          if (!live) return;
          setSvg(next);
          setError('');
        },
        (err) => live && setError(errorText(err))
      );
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [model.code, dark]);

  const pickTemplate = async (id: string) => {
    const template = TEMPLATES.find(([t]) => t === id);
    if (!template) return;
    if (model.code.trim() && !(await confirmDialog({ title: `Start again from the ${template[1].toLowerCase()} template?`, message: 'It replaces the code here. Undo brings it back.', confirmLabel: 'Replace' }))) return;
    onChange({ code: template[2] });
  };

  return (
    <div className="mermaid-split">
      <div className="mermaid-code">
        <div className="mermaid-bar">
          <Select value="" placeholder="Start from a template" options={TEMPLATES.map(([id, label]): [string, string] => [id, label])} onChange={pickTemplate} disabled={readOnly} />
          <a className="btn ghost small" href="https://mermaid.js.org/intro/syntax-reference.html" target="_blank" rel="noreferrer">
            Mermaid syntax
          </a>
        </div>
        <CodePane value={model.code} onChange={(code) => onChange({ code })} readOnly={readOnly} />
      </div>
      <div className={`mermaid-view${dark ? ' dark' : ''}`}>
        {error && <div className="diagram-error-card">{error}</div>}
        {svg ? <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : !error && <div className="diagram-hint">Write a diagram, or start from a template.</div>}
      </div>
    </div>
  );
}

const mermaidMode: DiagramMode<MermaidModel> = {
  id: 'mermaid',
  label: 'Mermaid diagram',
  language: 'mermaid',
  emptyModel: () => ({ code: TEMPLATES[0][2] }),
  toCode: (model) => ({ body: model.code, packages: [], libraries: [] }),
  Canvas
};

export default mermaidMode;
