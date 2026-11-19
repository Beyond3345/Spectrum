import type { AiReview, ReviewRun } from '../../api/client';

// A long document's AI review comes back a part at a time: these put the parts together and say where the review is.

export type PartsReview = Omit<AiReview, 'part' | 'plan'>;

const where = (run: ReviewRun, end: 'from' | 'to') => `${run.path}:${run[end]}`;

/** "part 2 of 5, chapters/two.tex:1 to chapters/four.tex:310" */
export function partLine(plan: ReviewRun[][], part: number) {
  const runs = plan[part];
  return `part ${part + 1} of ${plan.length}, ${where(runs[0], 'from')} to ${where(runs[runs.length - 1], 'to')}`;
}

/** The parts so far and the next one as one review: its findings added, the summary, score and confidence the latest. */
export function mergePart(was: PartsReview | null, res: AiReview): PartsReview {
  const { part: _part, plan: _plan, ...next } = res;
  if (!was) return next;
  return {
    summary: next.summary || was.summary,
    strengths: [...new Set([...was.strengths, ...next.strengths])].slice(0, 20),
    score: next.score ?? was.score,
    confidence: next.confidence ?? was.confidence,
    findings: [...was.findings, ...next.findings],
    limits: [...new Set([...was.limits, ...next.limits])],
    files: [...new Set([...was.files, ...next.files])]
  };
}

/** What the limits say of a review in parts: done is how many parts came back, failed why the next one didn't (none: Stop). */
export function partsLimit(plan: ReviewRun[][], done: number, failed = '') {
  if (plan.length < 2) return [];
  const lines = [`The document is too long for one reading, so it was reviewed in ${plan.length} parts in turn, each knowing the parts before it only by their summary.`];
  if (done < plan.length) {
    const runs = plan[done - 1];
    const upTo = `so the review covers the document up to ${where(runs[runs.length - 1], 'to')}.`;
    lines.push(failed ? `Part ${done + 1} failed (${failed.replace(/\.$/, '')}), ${upTo}` : `Stopped after part ${done} of ${plan.length}, ${upTo}`);
  }
  return lines;
}
