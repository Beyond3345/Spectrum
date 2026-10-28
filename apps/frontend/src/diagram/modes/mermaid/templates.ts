// Mermaid's starting points: the canvas's template menu and the chooser's Mermaid starters.

/** [id, label, code] */
export const TEMPLATES: [string, string, string][] = [
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
