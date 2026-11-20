// Self-check for what is handed to the agent from elsewhere (notes, to-dos, review findings) and for the pictures on
// a step's card. Bundle with esbuild and run with node.
import { excerpt, locatedPrompt } from './handoff';
import { stepCall, threadItems } from './transcript';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const text = ['\\section{One}', 'First line.', 'Second line.', 'Third line.', 'Fourth line.', 'Fifth line.'].join('\n');
eq(excerpt(text, 3), '```\n1| \\section{One}\n2| First line.\n3| Second line.\n4| Third line.\n5| Fourth line.\n```', 'two lines either side, numbered');
eq(excerpt(text, 1).split('\n')[1], '1| \\section{One}', 'from the first line');
eq(excerpt(text, 9), '', 'a line past the end has none');
eq(excerpt(`${'x'.repeat(300)}\n`, 1).split('\n')[1].length, 203, 'a long line is cut short');

eq(
  locatedPrompt([{ kind: 'To-do', text: ' Shorten this ', file: 'main.tex', line: 2 }], { 'main.tex': text }),
  'Work on this item.\n\nTo-do on main.tex, line 2: Shorten this\n```\n1| \\section{One}\n2| First line.\n3| Second line.\n4| Third line.\n```',
  'one item, not numbered, with its lines'
);
const many = locatedPrompt(
  [
    { kind: 'Note', text: 'Too long', doc: 'paper/main.tex', page: 3, file: 'main.tex', line: 5 },
    { kind: 'Note', text: 'On a figure', doc: 'paper/main.typ', page: 4 },
    { kind: 'Review point (minor, Style)', text: 'Unclear.', file: 'gone.tex', line: 2 }
  ],
  { 'main.tex': text }
);
eq(many.split('\n\n')[0], 'Work on these 3 items, in order. Start each part of your answer with the item’s number.', 'several: in order, by number');
eq(many.split('\n\n')[1].split('\n')[0], '1. Note on page 3 of main.pdf, from main.tex, line 5: Too long', 'a note: its page and its source line');
eq(many.split('\n\n')[2], '2. Note on page 4 of main.pdf: On a figure', 'a Typst note: its page alone');
eq(many.split('\n\n')[3], '3. Review point (minor, Style) on gone.tex, line 2: Unclear.', 'a file not read: no lines');
const lots = locatedPrompt(Array.from({ length: 23 }, (_, i) => ({ kind: 'To-do', text: `Item ${i}` })), {});
eq([lots.includes('20. To-do: Item 19'), lots.includes('Item 20'), lots.endsWith('(3 more are left for another request.)')], [true, false, true], 'twenty at most');

// a page the agent looked at is an image on its card; a figure's card knows its file for Open in composer
const page = stepCall({ tool: 'view_pdf_page', about: 'page 2', ok: true, show: { text: 'builds', image: 'data:image/png;base64,AAAA' } }, 's1');
eq(page.title, 'Look at “page 2”', 'the title');
eq(page.content, [{ type: 'content', content: { type: 'text', text: 'builds' } }, { type: 'content', content: { type: 'image', mimeType: 'image/png', data: 'AAAA' } }], 'the words, then the picture');
eq(page.locations, [], 'no file for a page');
const figure = stepCall({ tool: 'preview_figure', about: 'diagrams/box.typ', ok: true, show: { text: 'builds', image: 'data:image/png;base64,BBBB' } }, 's2');
eq(figure.locations, [{ path: 'diagrams/box.typ' }], 'the figure’s file');
eq(stepCall({ tool: 'compile', ok: true, show: { text: 'builds', image: 'javascript:alert(1)' } }, 's3').content.length, 1, 'nothing but a PNG data URL is a picture');

// the pictures a message was sent with, under its words
const items = threadItems([{ role: 'user', content: 'Like this', createdAt: '', meta: { pictures: ['data:image/jpeg;base64,CCCC'] } }] as never);
eq(items[0], { type: 'user', key: 'u0', text: 'Like this', pictures: ['data:image/jpeg;base64,CCCC'] }, 'a message’s pictures');

console.log('handoff.check: ok');
