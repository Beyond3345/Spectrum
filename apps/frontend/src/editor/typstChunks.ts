// Typst's highlighter, parsing a long file in pieces. codemirror-lang-typst parses the whole file again on every key
// (its own parser reuses the old tree only when nothing changed), which at 20,000 lines is some 70 ms a key. Here the
// file is parsed as chunks of a few thousand characters, each by that same parser on its own, and the tree is the
// chunks side by side under the document's node; after an edit only the chunks it touched are parsed again and the
// others are taken from the old tree. The work is also spread over the editor's idle time: a chunk at a time.
//
// A chunk must parse on its own exactly as it does inside the file. It starts where the parser is at the top level
// at the start of a line, and ends at a line's end that the chunk's own parse puts at the top level with no error in
// what stands before it (so no block, raw text, comment, maths, emphasis or list item is still open there: `closed`
// below), and after which the next line starts in column 0 with something that can't carry on what came before (an
// `else`, or a `.method()`). A line's end that fails this is passed over for the next one, to the end of the file if
// need be.
// ponytail: everything from a mark left open (an unclosed $, * or ```) to where it closes is one chunk while it is
// open, to the end of the file when it never closes, and is parsed whole on every key in it, as the package does
import { NodeType, Parser, Tree } from '@lezer/common';
import type { Input, PartialParse, TreeFragment } from '@lezer/common';

// a chunk ends at the first break after this many characters
const CHUNK = 3000;
// what the rule about a chunk's end reads past it: `else`
const AHEAD = 4;
// the document trees made here, whose children are chunks
const chunked = new WeakSet<Tree>();
// a line that starts in column 0
const BREAK = /\n(?=\S)/g;

/** Whether a chunk may end at `at` of `text` (a line's start), by what follows it. */
const mayEndBefore = (text: string, at: number) => !/^(?:\.|else\b|#!)/.test(text.slice(at, at + AHEAD + 1));

const TRIVIA = new Set(['Space', 'Parbreak', 'LineComment', 'BlockComment']);

/**
 * Whether a piece of text parsed on its own ends where the parser is back at the top level with nothing open: its
 * last node is white space at the top level that reaches its end, and what stands before that has no error
 * in it, and no `[` of the text's own is unmatched. (The parser closes what is still open at the end of its text,
 * marks it as an error and puts the white space after it at the top level: an equation whose closing $ lies further
 * on would otherwise pass for closed.)
 */
function closed(tree: Tree, text: string) {
  const last = tree.topNode.lastChild;
  if (!last || (last.name !== 'Parbreak' && last.name !== 'Space') || last.to !== text.length) return false;
  // a `[` written as text at the top level makes a later `]` text too, where alone it would be an error
  let brackets = 0;
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name === 'Text' && node.to - node.from === 1) brackets += text[node.from] === '[' ? 1 : text[node.from] === ']' ? -1 : 0;
  }
  if (brackets) return false;
  let before = last.prevSibling;
  while (before && TRIVIA.has(before.name)) before = before.prevSibling;
  if (!before) return true;
  let error = false;
  tree.iterate({ from: before.from, to: before.to, enter: (node) => void (error ||= node.type.isError || node.name === 'Error') });
  return !error;
}

export class ChunkedParser extends Parser {
  constructor(
    readonly base: Parser,
    readonly top: NodeType,
    readonly chunk = CHUNK
  ) {
    super();
  }

  createParse(input: Input, fragments: readonly TreeFragment[], ranges: readonly { from: number; to: number }[]): PartialParse {
    // nested in another language's tree: as the parser does it
    if (ranges.length !== 1 || ranges[0].from !== 0 || ranges[0].to !== input.length) return this.base.startParse(input, fragments, ranges);
    return new ChunkedParse(this, input, fragments);
  }
}

class ChunkedParse implements PartialParse {
  stoppedAt: number | null = null;
  private pos = 0;
  private children: Tree[] = [];
  private positions: number[] = [];
  // the old tree's chunks whose text, and the few characters after it, are as they were: by where they start now
  private kept = new Map<number, Tree>();
  private starts: number[] = [];

  constructor(
    private parser: ChunkedParser,
    private input: Input,
    fragments: readonly TreeFragment[]
  ) {
    for (const fragment of fragments) {
      if (!chunked.has(fragment.tree)) continue;
      fragment.tree.children.forEach((child, i) => {
        const from = fragment.tree.positions[i] - fragment.offset;
        const to = from + child.length;
        const whole = from >= fragment.from && (to + AHEAD <= fragment.to || (to === fragment.to && to === input.length));
        if (whole && child instanceof Tree) this.kept.set(from, child);
      });
    }
    this.starts = [...this.kept.keys()].sort((a, b) => a - b);
  }

  get parsedPos() {
    return this.pos;
  }

  stopAt(pos: number) {
    if (this.stoppedAt != null && this.stoppedAt < pos) throw new RangeError('Can’t move stoppedAt forward');
    this.stoppedAt = pos;
  }

  advance(): Tree | null {
    const end = this.input.length;
    if (this.pos >= Math.min(end, this.stoppedAt ?? end)) return this.finish();
    const old = this.kept.get(this.pos);
    if (old) this.add(old);
    else this.add(this.parseChunk());
    return null;
  }

  private add(chunk: Tree) {
    this.children.push(chunk);
    this.positions.push(this.pos);
    this.pos += chunk.length;
  }

  private finish() {
    const tree = new Tree(this.parser.top, this.children, this.positions, this.pos);
    chunked.add(tree);
    return tree;
  }

  /** The chunk that starts at this.pos: to the first break that holds, an old chunk's start for choice, so the parse falls in step with the old tree again. */
  private parseChunk(): Tree {
    const from = this.pos;
    const end = this.input.length;
    const size = this.parser.chunk;
    let tried = from;
    for (;;) {
      const to = this.nextBreak(from, Math.max(from + size, tried + 1, from + (tried - from) * 2));
      const text = this.input.read(from, to);
      const tree = this.parser.base.parse(text);
      if (to >= end || closed(tree, text)) return new Tree(NodeType.none, tree.children, tree.positions, tree.length);
      tried = to;
    }
  }

  /** The first line start at or after `least` where a chunk may end, or the file's end: an old chunk's start when one is near. */
  private nextBreak(from: number, least: number): number {
    const end = this.input.length;
    if (least >= end) return end;
    // an old chunk's start within a few chunks' length, where the line before it still ends just there: the old tree's
    // chunks from it on are then taken as they are
    const size = this.parser.chunk;
    const lower = least <= from + size ? from + size / 4 : least;
    let low = 0;
    let high = this.starts.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.starts[mid] < lower) low = mid + 1;
      else high = mid;
    }
    const near = this.starts[low];
    if (near !== undefined && near <= least + 3 * size && near + AHEAD < end && this.input.read(near - 1, near) === '\n' && mayEndBefore(this.input.read(near, near + AHEAD + 1), 0)) return near;
    for (let at = least - 2, block = 16_384; at < end; at += block - 64) {
      const text = this.input.read(Math.max(at, from), Math.min(end, at + block));
      const offset = Math.max(at, from);
      BREAK.lastIndex = 0;
      for (let found; (found = BREAK.exec(text)); ) {
        const to = offset + found.index + found[0].length;
        // (what follows may lie past this block: read on its own)
        if (to >= least && to + AHEAD < end && mayEndBefore(this.input.read(to, to + AHEAD + 1), 0)) return to;
        BREAK.lastIndex = found.index + 1;
      }
    }
    return end;
  }
}
