// A reader for the .synctex.gz files TeX engines write with -synctex=1 (format: synctex(5)),
// for jumping between the source and the PDF. Positions in and out are PDF points from the
// page's top-left corner. Inverse search follows the synctex tool's own parser (1.21) choice
// for choice, so a double-click lands where other TeX editors would put it.
import { promises as fs, realpathSync } from 'fs';
import path from 'path';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { APP_DIR, appPath } from './projectService.js';

const gunzipAsync = promisify(gunzip);
const NOT_YET = 'Compile the project first to jump between the source and the PDF.';
// scaled points per PDF point (big point): 65536 sp/pt × 72.27 pt/in ÷ 72 bp/in
const SP_PER_BP = 65781.76;
// <type><tag>,<line>[,<column>]:<h>,<v>[:<W>[,<H>,<D>]]; v is '=' when it repeats the last one
const RECORD = /^([[(hvxkg$r])(\d+),(-?\d+)(?:,(-?\d+))?:(-?\d+),(-?\d+|=)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/;

// ─── The project's SyncTeX file ───

// One per project, for the PDF the last compile made. Where TeX ran, to read the inputs it
// names relative to that folder, goes beside it.
const stored = (root) => ({ file: appPath(root, 'synctex.gz'), meta: appPath(root, 'synctex.json') });

/** Keep the SyncTeX file a compile just built (`built` in its build folder, TeX run in `cwd`). */
export async function keepSynctex(root, built, cwd) {
  const { file, meta } = stored(root);
  await writeJsonAtomic(meta, { root, cwd });
  // an engine that wrote none leaves nothing to keep
  await fs.rename(built, file).catch(() => dropSynctex(root));
}

/** Forget it, so a jump never lands in a PDF it didn't describe. */
export async function dropSynctex(root) {
  const { file, meta } = stored(root);
  await fs.rm(file, { force: true });
  await fs.rm(meta, { force: true });
}

async function load(root) {
  const { file, meta } = stored(root);
  try {
    return { data: await readSynctex(file), where: await readJson(meta) };
  } catch (err) {
    // a half-written or garbled file reads as none, until the next compile replaces it
    if (err.code === 'ENOENT' || String(err.code).startsWith('Z_')) return null;
    throw err;
  }
}

// macOS finds a file whatever the case or Unicode form TeX was given; the disk's spelling is the project's
const canonical = (p) => {
  try {
    return realpathSync.native(p);
  } catch {
    return p; // gone since, like the build folder's .aux
  }
};

/** An input as a project-relative path; TeX names them absolute or from where it ran, often with ./ */
function projectPath(where, name) {
  if (!name) return null;
  const rel = path.relative(canonical(where.root), canonical(path.resolve(where.cwd, name))).split(path.sep).join('/');
  const first = rel.split('/')[0];
  return !rel || first === '..' || first.toLowerCase() === APP_DIR ? null : rel;
}

/** The source line under a point on a page of the PDF: page 1-based, x and y in points from the top left. */
export async function synctexEdit(root, page, x, y) {
  const loaded = await load(root);
  if (!loaded) return { ok: false, error: NOT_YET };
  const hit = inverseSearch(loaded.data, page, x, y);
  const file = hit && projectPath(loaded.where, loaded.data.inputs.get(hit.tag));
  if (!file) return { ok: false, error: 'Couldn’t find the source for that part of the PDF.' };
  return { ok: true, file, line: hit.line, column: hit.column };
}

/** Where a line of a project file ended up in the PDF: one box per typeset line, in points from each page's top left. */
export async function synctexView(root, file, line) {
  const rel = path.relative(root, safeJoin(root, file)).split(path.sep).join('/');
  const loaded = await load(root);
  if (!loaded) return { ok: false, error: NOT_YET };
  const tags = new Set([...loaded.data.inputs].filter(([, name]) => projectPath(loaded.where, name) === rel).map(([tag]) => tag));
  const boxes = forwardSearch(loaded.data, tags, line);
  if (!boxes.length) return { ok: false, error: 'This file isn’t part of the compiled PDF.' };
  return { ok: true, page: boxes[0].page, boxes };
}

// ─── Reading the file ───

const cache = new Map();

/** Parse a .synctex.gz once per version of the file. */
export async function readSynctex(file) {
  const { mtimeMs, size } = await fs.stat(file);
  const key = `${mtimeMs}:${size}`;
  const hit = cache.get(file);
  if (hit?.key === key) return hit.data;
  const data = parseSynctex((await gunzipAsync(await fs.readFile(file))).toString('utf8'));
  // ponytail: one entry per project opened this session; an LRU if that ever adds up
  cache.set(file, { key, data });
  return data;
}

/**
 * Pages hold a tree of records: '[' vboxes and '(' hboxes with kids, and leaves 'h'/'v' (void
 * boxes), 'x' (current position), 'k' kern, 'g' glue, '$' math, 'r' rule. Like the tool, every
 * hbox also gets 'b' boundary kids at its two ends, and its x0..x1 × y0..y1 grow to cover what
 * it holds. Coordinates stay in the file's units; `unit` and the offsets turn them into points.
 */
export function parseSynctex(text) {
  const inputs = new Map();
  const pages = new Map();
  const pre = { Unit: 8192, Magnification: 1000, 'X Offset': 0, 'Y Offset': 0 };
  let content = false;
  let sheet = null;
  let parent = null;
  let lastV = 0;
  for (const row of text.split('\n')) {
    if (row.startsWith('Input:')) {
      const m = /^Input:(\d+):(.*)$/.exec(row);
      if (m) inputs.set(Number(m[1]), m[2]);
      continue;
    }
    if (!content) {
      const m = /^(Unit|Magnification|X Offset|Y Offset):(-?[\d.]+)/.exec(row);
      if (m) pre[m[1]] = Number(m[2]);
      content = row.startsWith('Content:');
      continue;
    }
    const c = row[0];
    if (c === '{') {
      sheet = parent = { t: '{', page: Number(row.slice(1)), kids: [], hboxes: [] };
      pages.set(sheet.page, sheet);
    } else if (c === '}') {
      sheet = parent = null;
    } else if (!parent) {
      if (row.startsWith('Postamble:')) break;
    } else if (c === ']' || c === ')') {
      if (parent === sheet) continue;
      const box = parent;
      parent = box.parent;
      if (box.t === '(') {
        closeHbox(box);
        sheet.hboxes.push(box);
        grow(parent, box);
      }
    } else {
      const m = RECORD.exec(row);
      if (!m) continue;
      const v = m[6] === '=' ? lastV : Number(m[6]);
      lastV = v;
      const node = {
        t: c, tag: Number(m[2]), line: Number(m[3]), col: m[4] === undefined ? -1 : Number(m[4]),
        h: Number(m[5]), v, W: Number(m[7] || 0), H: Number(m[8] || 0), D: Number(m[9] || 0), parent
      };
      parent.kids.push(node);
      if (c === '[') {
        node.kids = [];
        parent = node;
      } else if (c === '(') {
        Object.assign(node, rect(node.h, node.h + node.W, node.v - node.H, node.v + node.D));
        node.kids = [{ t: 'b', tag: node.tag, line: node.line, col: node.col, parent: node }];
        parent = node;
      } else if (c === 'k') {
        grow(parent, rect(node.h - node.W, node.h, v, v));
      } else if (c === 'h') {
        grow(parent, rect(node.h, node.h + node.W, v - node.H, v + node.D));
      } else if (c !== 'r' && c !== 'v') {
        grow(parent, rect(node.h, node.h, v, v));
      }
    }
  }
  // in single precision like the tool, which decides a click right on a box's edge
  const f = Math.fround;
  return {
    inputs,
    pages,
    unit: f(f(pre.Unit / SP_PER_BP) * (pre.Magnification / 1000)),
    xOffset: f(pre['X Offset'] * (pre.Unit / SP_PER_BP)),
    yOffset: f(pre['Y Offset'] * (pre.Unit / SP_PER_BP))
  };
}

const rect = (a, b, c, d) => ({ x0: Math.min(a, b), x1: Math.max(a, b), y0: Math.min(c, d), y1: Math.max(c, d) });

function grow(box, r) {
  if (box.t !== '(') return;
  box.x0 = Math.min(box.x0, r.x0);
  box.x1 = Math.max(box.x1, r.x1);
  box.y0 = Math.min(box.y0, r.y0);
  box.y1 = Math.max(box.y1, r.y1);
}

const copyLink = (to, from) => Object.assign(to, { tag: from.tag, line: from.line, col: from.col });

/** The tool's fix-ups when an hbox closes, which decide what a click near its edges answers. */
function closeHbox(box) {
  const [open, ...kids] = box.kids;
  const last = kids.at(-1) || box;
  const close = { t: 'b', tag: last.tag, line: last.line, col: last.col, h: box.x1, v: box.v, parent: box };
  // x records opening a box carry whatever link TeX had last; they take the next record's
  const firstOther = kids.findIndex((k) => k.t !== 'x');
  if (firstOther > 0) kids.slice(0, firstOther).forEach((k) => copyLink(k, kids[firstOther]));
  // the tool pairs the box's file with the first kid's line, which can name a line in the
  // wrong file (left of a chapter's last line, say); take both from the kid
  copyLink(open, kids[0] || box);
  Object.assign(open, { h: box.x0, v: box.v });
  // a trailing kern and glue (\parfillskip & co) belong to the text before them
  const n = kids.length;
  if (n >= 2 && kids[n - 2].t === 'k' && kids[n - 1].t === 'g') {
    const before = kids[n - 3] || open;
    copyLink(kids[n - 2], before);
    copyLink(kids[n - 1], before);
  }
  box.kids.push(close);
}

// ─── Forward: source line → boxes in the PDF ───

/** The typeset line a record sits on: the outermost hbox around it below a vbox or the page. */
function lineBox(node) {
  let box = node.parent;
  while (box.parent?.t === '(') box = box.parent;
  return box.t === '(' ? box : null;
}

// how tall a box is: an hbox as far as what it holds reaches, a vbox as TeX made it
const size = (k) => (k.t === '(' ? k.y1 - k.y0 : k.H + k.D);

// a box inside another (an integral's limits in its equation, a footnote mark in its line) is part of it
const within = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;

/**
 * One rectangle per typeset line that `line` of the file (any of `tags`) made, or the box it
 * closed, or the nearest line after it that made any, then the nearest before. Sorted by page,
 * then down the page.
 */
export function forwardSearch(data, tags, line) {
  let byLine = new Map();
  const furniture = new Map();
  const closed = [];
  for (const sheet of data.pages.values()) {
    // the output routine tags the page, its header and footer with the line it shipped on
    const page = sheet.kids[0];
    const inner = page?.kids?.find((k) => k.t === '[') || page; // tectonic puts an empty hbox first
    const body = (inner?.kids || []).filter((k) => k.kids).reduce((a, b) => (!a || size(b) > size(a) ? b : a), null);
    const inBody = (n) => {
      if (!body) return true;
      if (!n || size(n) >= size(body)) return false; // the box around two columns
      for (let p = n.parent; p; p = p.parent) if (p === body) return true;
      return false;
    };
    const shipped = (n) => n.tag === page.tag && n.line === page.line;
    const walk = (node) => {
      for (const kid of node.kids) {
        // a vbox carries the line that closed it (\end{table}); not a column, nor the page
        if (kid.t === '[' && kid.line === line && tags.has(kid.tag) && !shipped(kid) && (!body || size(kid) * 2 < size(body))) {
          closed.push({ page: sheet.page, node: kid });
        }
        if (kid.kids?.length) walk(kid);
        else if (kid.t !== 'b' && tags.has(kid.tag)) {
          // set aside: the header and footer, rules (a tabular's struts), which keep no line of
          // their own either, and line-end kerns, which carry the line that ended the paragraph
          const junk = (shipped(kid) && (kid.t === 'r' || !inBody(lineBox(kid)))) || (kid.t === 'k' && !kid.W);
          const into = junk ? furniture : byLine;
          if (!into.has(kid.line)) into.set(kid.line, []);
          into.get(kid.line).push({ page: sheet.page, node: kid });
        }
      }
    };
    walk(sheet);
  }
  if (!byLine.size) byLine = furniture;
  if (!byLine.has(line) && closed.length) {
    // a line that only closes a box: the box, as far as the lines in it reach
    const { page, node } = closed[0];
    const area = { t: '(', x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    const collect = (n) => n.kids.forEach((k) => (k.t === '(' ? grow(area, k) : k.kids && collect(k)));
    collect(node);
    if (area.x0 <= area.x1) return [toPoints(data, page, area)];
  }
  const lines = [...byLine.keys()];
  if (!lines.length) return [];
  const after = lines.filter((l) => l >= line);
  const chosen = after.length ? Math.min(...after) : Math.max(...lines);
  const seen = new Set();
  const byPage = {};
  for (const { page, node } of byLine.get(chosen)) {
    const box = lineBox(node);
    if (!box || seen.has(box)) continue;
    seen.add(box);
    (byPage[page] ||= []).push(toPoints(data, page, box));
  }
  // of two boxes inside each other, the first one stays
  const merged = Object.values(byPage).flatMap((boxes) =>
    boxes.filter((a, i) => !boxes.some((b, j) => j !== i && within(a, b) && !(j > i && within(b, a)))));
  return merged.sort((a, b) => a.page - b.page || a.y - b.y);
}

function toPoints(data, page, b) {
  let x = b.x0 * data.unit + data.xOffset;
  let y = b.y0 * data.unit + data.yOffset;
  let width = (b.x1 - b.x0) * data.unit;
  let height = (b.y1 - b.y0) * data.unit;
  // TeX can push a box past the paper's top or left edge
  if (x < 0) [width, x] = [width + x, 0];
  if (y < 0) [height, y] = [height + y, 0];
  return { page, x, y, width: Math.max(0, width), height: Math.max(0, height) };
}

// ─── Inverse: point in the PDF → source line ───

// void boxes count as boxes too, so the nearest-record search looks inside them and finds nothing
const isBox = (n) => '([hv'.includes(n.t);
const hasKids = (n) => !!n.kids?.length;
const declared = (n) => rect(n.h, n.h + Math.abs(n.W), n.v - Math.abs(n.H), n.v + Math.abs(n.D));
// leaves are as tall and deep as the box they sit in
const parentHeight = ({ parent: p }) => (p.t === '(' ? p.v - p.y0 : Math.abs(p.H || 0));
const parentDepth = ({ parent: p }) => (p.t === '(' ? p.y1 - p.v : Math.abs(p.D || 0));

/** Signed horizontal distance: > 0 when the record is right of the hit, < 0 left, 0 across it. */
function hOrdered(hit, n) {
  const span = (min, max) => (hit.h < min ? min - hit.h : hit.h > max ? max - hit.h : 0);
  switch (n.t) {
    case '(': return span(n.x0, n.x1);
    case '[': case 'h': case 'v': return span(n.h, n.h + Math.abs(n.W));
    case 'k': {
      // a kern rarely holds text: measure to its nearer edge, a little further than anything else
      const min = Math.min(n.h, n.h - n.W);
      const max = Math.max(n.h, n.h - n.W);
      if (hit.h < min) return min - hit.h + 1;
      if (hit.h > max) return max - hit.h - 1;
      return hit.h > Math.trunc((min + max) / 2) ? max - hit.h + 1 : min - hit.h - 1;
    }
    case 'r': case 'g': case '$': case 'x': case 'b': return n.h - hit.h;
    default: return Infinity;
  }
}

/** Signed vertical distance: > 0 when the record is below the hit, < 0 above, 0 level with it. */
function vOrdered(hit, n) {
  const span = (min, max) => (hit.v < min ? min - hit.v : hit.v > max ? max - hit.v : 0);
  switch (n.t) {
    case '(': return span(n.y0, n.y1);
    case '[': case 'h': case 'v': return span(n.v - Math.abs(n.H), n.v + Math.abs(n.D));
    case 'r': case 'k': case 'g': case '$': return span(n.v - parentHeight(n), n.v + parentDepth(n));
    default: return Infinity;
  }
}

const inBox = (hit, n) => hOrdered(hit, n) === 0 && vOrdered(hit, n) === 0;

// Manhattan distance to a rectangle, with the tool's edge tests
function toRect(hit, r) {
  const dh = hit.h < r.x0 ? r.x0 - hit.h : hit.h <= r.x1 ? 0 : hit.h - r.x1;
  const dv = hit.v < r.y0 ? r.y0 - hit.v : hit.v <= r.y1 ? 0 : hit.v - r.y1;
  return dh + dv;
}

function distance(hit, n) {
  const stroke = (h) => toRect(hit, rect(h, h, n.v - parentHeight(n), n.v));
  switch (n.t) {
    case '(': return toRect(hit, n);
    case '[': return toRect(hit, declared(n));
    case 'h': case 'v': {
      const r = declared(n);
      return Math.min(toRect(hit, { ...r, x1: r.x0 }), toRect(hit, { ...r, x0: r.x1 }));
    }
    case 'k': return Math.min(stroke(n.h), stroke(n.h - n.W));
    case 'g': case '$': case 'x': case 'b': return stroke(n.h);
    default: return Infinity;
  }
}

/** Of two hboxes holding the hit: the smaller area, then the wider, then the shorter. */
function smaller(a, b) {
  const [wa, wb] = [a.x1 - a.x0, b.x1 - b.x0];
  const [ha, hb] = [a.y1 - a.y0, b.y1 - b.y0];
  if (wa * ha !== wb * hb) return wa * ha < wb * hb ? a : b;
  if (wa !== wb) return wa > wb ? a : b;
  return hb < ha ? b : a;
}

function deepestContainer(hit, node) {
  if (!hasKids(node)) return null;
  for (const kid of node.kids) {
    const deeper = inBox(hit, kid) && deepestContainer(hit, kid);
    if (deeper) return deeper;
  }
  if (node.t === '[') {
    let best = null;
    let bestDistance = Infinity;
    for (const kid of node.kids) {
      if (!hasKids(kid)) continue;
      const d = distance(hit, kid);
      if (d <= bestDistance) [best, bestDistance] = [kid, d];
    }
    if (best) return best;
  }
  return inBox(hit, node) ? node : null;
}

// the same search used to refine a neighbour, which differs in small ways
function deepestContainerNd(hit, node) {
  if (!hasKids(node)) return null;
  for (const kid of node.kids) {
    const deeper = deepestContainerNd(hit, kid);
    if (deeper) return deeper;
  }
  if (node.t === '[') {
    let best = null;
    for (const kid of node.kids) {
      if (!hasKids(kid)) continue;
      const d = distance(hit, kid);
      if (!best || d < best.d) best = { node: kid, d };
    }
    if (best) return best;
  }
  return inBox(hit, node) ? { node, d: 0 } : null;
}

/** The leaf anywhere under `node` nearest the hit; on a tie the later one wins, unless it's a kern. */
function closestDeepChild(hit, node) {
  let best = { node: null, d: Infinity };
  for (const kid of node.kids || []) {
    const nd = isBox(kid) ? closestDeepChild(hit, kid) : { node: kid, d: distance(hit, kid) };
    if (nd.d < best.d || (nd.d === best.d && nd.node?.t !== 'k')) best = nd;
  }
  return best;
}

/** The nearest records left and right of the hit among an hbox's kids. */
function closestKids(hit, box) {
  // the tool's vbox version never looks at the kids
  if (box.t !== '(') return {};
  let l = null;
  let r = null;
  // on a tie, the earlier line (then column) of the same file wins
  const better = (best, kid, d) => !best || d < best.d || (d === best.d && best.node.tag === kid.tag
    && (best.node.line > kid.line || (best.node.line === kid.line && best.node.col > kid.col)));
  for (const kid of box.kids) {
    const s = hOrdered(hit, kid);
    if (s > 0 && better(r, kid, s)) r = { node: kid, d: s };
    if (s === 0) {
      if (hasKids(kid)) return closestKids(hit, kid);
      l = { node: kid, d: 0 };
    }
    if (s < 0 && better(l, kid, -s)) l = { node: kid, d: -s };
  }
  const refine = (nd) => {
    if (!nd) return nd;
    const inside = deepestContainerNd(hit, nd.node);
    if (inside) nd = { ...inside };
    const leaf = closestDeepChild(hit, nd.node);
    return leaf.node ? { node: leaf.node, d: nd.d } : nd;
  };
  return { l: refine(l), r: refine(r) };
}

/** The record the synctex tool answers first for a hit (in file units) on a page. */
function editNode(sheet, hit) {
  // hboxes as the tool chains them: the last one to close comes first
  const hboxes = sheet.hboxes.slice().reverse();
  const first = hboxes.findIndex((box) => inBox(hit, box));
  if (first < 0) return sheet.kids[0] ? closestDeepChild(hit, sheet.kids[0]).node : null;
  let box = hboxes[first];
  for (const next of hboxes.slice(first + 1)) {
    if (inBox(hit, next)) box = smaller(next, box);
  }
  box = deepestContainer(hit, box) || box;
  let { l, r } = closestKids(hit, box);
  if (l && r) {
    const differ = l.node.tag !== r.node.tag || l.node.line !== r.node.line || l.node.col !== r.node.col;
    if (differ ? r.node.line < l.node.line || (r.node.line === l.node.line && l.d > r.d) : l.d > r.d) l = r;
  }
  return (l || r)?.node || box;
}

/** The source line under a point (PDF points from the page's top-left), or null. */
export function inverseSearch(data, page, x, y) {
  const sheet = data.pages.get(page);
  if (!sheet) return null;
  // single precision, truncated to whole units, as the tool does it
  const f = Math.fround;
  const at = (p, offset) => Math.trunc(f(f(f(p) - offset) / data.unit));
  const node = editNode(sheet, { h: at(x, data.xOffset), v: at(y, data.yOffset) });
  return node && { tag: node.tag, line: node.line, column: node.col >= 0 ? node.col : null };
}
