// Self-check for a long document's AI review put together from its parts. Bundle with esbuild and run with node.
import type { AiReview } from '../../api/client';
import { mergePart, partLine, partsLimit } from './reviewParts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const plan = [
  [{ path: 'main.tex', from: 1, to: 40 }, { path: 'ch1.tex', from: 1, to: 2000 }],
  [{ path: 'ch1.tex', from: 2001, to: 2600 }, { path: 'ch2.tex', from: 1, to: 300 }],
  [{ path: 'ch3.tex', from: 1, to: 90 }]
];
const finding = (file: string, line: number) => ({ severity: 'minor' as const, category: 'Style', file, line, quote: '', issue: `At ${line}`, suggestion: '', anchored: true });
const part = (n: number, extra: Partial<AiReview>): AiReview => ({ summary: '', strengths: [], score: null, confidence: null, findings: [], limits: [], files: [], part: n, plan, ...extra });

eq(partLine(plan, 1), 'part 2 of 3, ch1.tex:2001 to ch2.tex:300', 'the progress line');

let merged = mergePart(null, part(0, { summary: 'One.', strengths: ['Clear'], score: 5, confidence: 3, findings: [finding('ch1.tex', 4)], limits: ['No figures.'], files: ['main.tex', 'ch1.tex'] }));
merged = mergePart(merged, part(1, { summary: 'One and two.', strengths: ['Clear', 'Bold'], score: 6, findings: [finding('ch2.tex', 9)], limits: ['No figures.'], files: ['ch1.tex', 'ch2.tex'] }));
eq(merged.summary, 'One and two.', 'the latest summary covers the document so far');
eq([merged.score, merged.confidence], [6, 3], 'the latest score, the confidence kept when the part gave none');
eq(merged.strengths, ['Clear', 'Bold'], 'strengths once each');
eq(merged.findings.map((f) => f.file), ['ch1.tex', 'ch2.tex'], 'findings from every part');
eq(merged.limits, ['No figures.'], 'a limit once');
eq(merged.files, ['main.tex', 'ch1.tex', 'ch2.tex'], 'files once each');
eq('plan' in merged || 'part' in merged, false, 'no part bookkeeping left');

eq(partsLimit([plan[0]], 1), [], 'one part: nothing to say');
eq(partsLimit(plan, 3).length, 1, 'all parts: how it was read');
eq(partsLimit(plan, 2)[1], 'Stopped after part 2 of 3, so the review covers the document up to ch2.tex:300.', 'Stop');
eq(partsLimit(plan, 1, 'The model is busy.')[1], 'Part 2 failed (The model is busy), so the review covers the document up to ch1.tex:2000.', 'a failed part');

console.log('reviewParts: ok');
