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
  ],
  [
    'er',
    'Entity–relationship diagram',
    `erDiagram
  STUDENT ||--o{ ENROLMENT : makes
  COURSE ||--o{ ENROLMENT : has
  STUDENT {
    int id PK
    string name
  }
  COURSE {
    string code PK
    string title
  }
  ENROLMENT {
    int student FK
    string course FK
    int mark
  }
`
  ],
  [
    'pie',
    'Pie chart',
    `pie showData
  title Time spent on the project
  "Reading" : 25
  "Experiments" : 45
  "Writing" : 30
`
  ],
  [
    'xychart',
    'Bar and line chart',
    `xychart-beta
  title "Samples measured each month"
  x-axis [Feb, Mar, Apr, May, Jun]
  y-axis "Samples" 0 --> 60
  bar [12, 25, 41, 38, 52]
  line [12, 25, 41, 38, 52]
`
  ],
  [
    'mindmap',
    'Mind map',
    `mindmap
  root((Thesis))
    Background
      Reading
      Gaps
    Method
      Experiments
      Analysis
    Writing
      Drafts
      Revisions
`
  ],
  [
    'timeline',
    'Timeline',
    `timeline
  title Project milestones
  2027 Q1 : Reading : Proposal
  2027 Q2 : Experiments
  2027 Q3 : Analysis : First draft
  2027 Q4 : Revisions : Submission
`
  ],
  [
    'gitgraph',
    'Git graph',
    `gitGraph
  commit id: "Start"
  branch feature
  checkout feature
  commit id: "Add the form"
  commit id: "Test it"
  checkout main
  commit id: "Fix a typo"
  merge feature
  commit id: "Release"
`
  ]
];
