import { useState } from 'react';
import { runAgent } from '../../api/client';
import Icon from '../../app/Icon';
import { useEditor } from '../EditorContext';
import { Markdown, errorText, patchesToChanges, relativeTime } from '../shared';

const REPORT_PROMPT =
  'Read all .tex files in the project (start from the main file and any included sections). Use list_files and read_file tools to inspect content. Write a detailed reviewer-style report. Include: Summary, Strengths, Weaknesses, Questions, Missing Experiments, Writing/Clarity, Suggestions, Score (1-10), and Confidence. Output report text only; do not propose patches or code.';

const CONSISTENCY_PROMPT = `Read all .tex files in the project using list_files and read_file tools. Perform a thorough consistency check across the entire paper. Check the following dimensions:

1. **Terminology consistency**: Identify terms that refer to the same concept but use different wording (e.g., "feature extraction" vs "feature engineering", "model" vs "network" vs "architecture" used interchangeably).

2. **Notation consistency**: Check if mathematical symbols and notation are used consistently (e.g., bold for vectors vs non-bold, x vs X for the same variable, inconsistent subscript/superscript conventions).

3. **Data and results consistency**: Verify that numbers, statistics, and experimental results mentioned in the abstract, introduction, method, and conclusion sections are consistent with those in tables and figures.

4. **Logic and claim consistency**: Check if claims made in the introduction/conclusion are actually supported by the experiments. Flag contradictions between sections.

5. **Reference consistency**: Check for undefined abbreviations, references to figures/tables/sections that don't exist, or mislabeled cross-references.

6. **Tense and style consistency**: Flag inconsistent use of tense (e.g., mixing past and present when describing experiments) or perspective (e.g., "we" vs "the authors" vs passive voice).

For each issue found, report in this format:

---
**[Category]** Terminology / Notation / Data / Logic / Reference / Style
**[Location]** file and approximate line or section
**[Issue]** Describe the inconsistency
**[Suggestion]** How to fix it
---

Here are examples of good findings:

Example 1:
**[Terminology]**
**[Location]** sections/method.tex, Section 3.1 vs sections/experiments.tex, Section 4
**[Issue]** The method section calls the module "Spatial Attention Block" but the experiments section refers to it as "Spatial Attention Module".
**[Suggestion]** Unify to one term throughout the paper, e.g., "Spatial Attention Module".

Example 2:
**[Data]**
**[Location]** sections/abstract.tex vs sections/experiments.tex, Table 2
**[Issue]** The abstract claims "93.2% accuracy on CIFAR-10" but Table 2 reports 92.8%.
**[Suggestion]** Update the abstract to match the actual result in Table 2.

Example 3:
**[Logic]**
**[Location]** sections/introduction.tex, paragraph 3 vs sections/conclusion.tex, paragraph 1
**[Issue]** The introduction states the method "does not require pre-training" but the conclusion mentions "after pre-training on ImageNet".
**[Suggestion]** Clarify whether pre-training is used and make both sections consistent.

Example 4:
**[Notation]**
**[Location]** sections/method.tex, Eq. (3) vs Eq. (7)
**[Issue]** Eq. (3) uses bold lowercase h for hidden states, but Eq. (7) uses non-bold italic h for the same variable.
**[Suggestion]** Use bold h consistently for hidden state vectors.

Be thorough. Read ALL .tex files before reporting. Group findings by category. If no issues are found in a category, state that explicitly.`;

type Action = { key: string; icon: string; label: string; desc: string; task: string; prompt: string; mode: 'direct' | 'tools'; useLog?: boolean };

const ACTIONS: Action[] = [
  { key: 'report', icon: 'doc.text.magnifyingglass', label: 'Full review report', desc: 'Reads the whole project and writes a reviewer-style report', task: 'peer_review', prompt: REPORT_PROMPT, mode: 'tools' },
  { key: 'consistency', icon: 'checklist', label: 'Consistency check', desc: 'Terminology, notation, numbers and cross-references', task: 'consistency_check', prompt: CONSISTENCY_PROMPT, mode: 'tools' },
  { key: 'citations', icon: 'quote.bubble', label: 'Missing citations', desc: 'Claims that probably need a reference', task: 'missing_citations', prompt: 'Find claims that likely need citations and list them.', mode: 'tools' },
  { key: 'compile', icon: 'exclamationmark.triangle', label: 'Compile log summary', desc: 'Explains the errors and how to fix them', task: 'compile_summary', prompt: 'Summarize compile log errors and suggested fixes.', mode: 'direct', useLog: true }
];

type Note = { id: number; title: string; content: string; createdAt: string; failed?: boolean };

export default function ReviewTab() {
  const api = useEditor();
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);

  const run = async (action: Action) => {
    if (busy) return;
    if (action.useLog && !api.compileLog) {
      api.notify('Compile the project first, then summarise the log.');
      return;
    }
    setBusy(action.key);
    const add = (content: string, failed = false) =>
      setNotes((prev) => [{ id: Date.now(), title: action.label, content, createdAt: new Date().toISOString(), failed }, ...prev]);
    try {
      const res = await runAgent({
        task: action.task,
        prompt: action.prompt,
        selection: action.useLog ? api.compileLog : '',
        content: '',
        mode: action.mode,
        projectId: api.projectId,
        activePath: api.activePath,
        compileLog: api.compileLog,
        llmConfig: api.llm.main,
        interaction: 'agent',
        history: [],
        reasoningEffort: api.settings.reasoningEffort
      });
      add(res.reply || 'No result.', !res.ok);
      const changes = await patchesToChanges(api, res.patches || [], action.label);
      if (changes.length) api.proposeChanges(changes, { open: true });
    } catch (err) {
      add(`Request failed: ${errorText(err)}`, true);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="tool-page">
      <div className="tool-card-desc">AI checks of the whole paper. Results appear below; suggested edits open for review.</div>
      <div className="review-actions">
        {ACTIONS.map((action) => (
          <button key={action.key} className="review-action" disabled={Boolean(busy)} onClick={() => run(action)}>
            <span className="review-action-icon">{busy === action.key ? <span className="spinner" /> : <Icon name={action.icon} />}</span>
            <span className="review-action-label">{action.label}</span>
            <span className="review-action-desc">{action.desc}</span>
          </button>
        ))}
      </div>
      {notes.map((note) => (
        <div key={note.id} className={`result-card ${note.failed ? 'error' : ''}`}>
          <div className="result-card-head">
            <span className="result-card-title">{note.title}</span>
            <span className="result-card-time">{relativeTime(note.createdAt)}</span>
            <button className="icon-btn" title="Remove" aria-label="Remove" onClick={() => setNotes((prev) => prev.filter((n) => n.id !== note.id))}>
              <Icon name="xmark" />
            </button>
          </div>
          <Markdown>{note.content}</Markdown>
        </div>
      ))}
    </div>
  );
}
