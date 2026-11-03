// Reading Typst source with Typst's own parser: typst-syntax at the version of the bundled Typst, built to
// WebAssembly (native/typst-syntax.wasm, from native/typst-syntax by scripts/native.mjs typst-syntax). It reads a .typ
// file exactly as Spectrum's Typst does, packages, semicolons and all, without evaluating anything. Here are the tree
// and the few helpers the converter reads it with; toLatex.js turns it into LaTeX.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NATIVE_DIR } from '../../config/constants.js';

/** A node of the syntax tree: kind (typst-syntax's SyntaxKind), start and end in source, children; text is its source. */
class Node {
  get text() {
    return this.source.slice(this.start, this.end);
  }
}

/** A parser from the WebAssembly at file: source => its syntax tree. */
export function typstParser(file) {
  let wasm = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(file)), {}).exports;
  return (source) => {
    const bytes = new TextEncoder().encode(source);
    const at = wasm.spectrum_alloc(bytes.length);
    new Uint8Array(wasm.memory.buffer, at, bytes.length).set(bytes);
    let packed;
    try {
      packed = wasm.spectrum_parse(at, bytes.length);
    } catch (err) {
      // a trap leaves the instance unusable: start a fresh one for the next file
      wasm = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(file)), {}).exports;
      throw new Error('Typst’s parser stopped on this file: ' + err.message);
    }
    const [json, length] = [Number(packed >> 32n), Number(packed & 0xffffffffn)];
    const text = new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, json, length));
    wasm.spectrum_free(json, length);
    return JSON.parse(text, (key, value) => (value && typeof value === 'object' && !Array.isArray(value) ? Object.assign(new Node(), value, { source }) : value));
  };
}

let parser = null;

/** The syntax tree of a Typst file, its root a Markup node. */
export function parseTypst(source) {
  parser ??= typstParser(path.join(NATIVE_DIR, 'typst-syntax.wasm'));
  return parser(String(source));
}

/** A leaf made from part of another, as when a call's brackets end inside a text. */
export const leaf = (kind, source, start, end) => Object.assign(new Node(), { kind, start, end, source });

const TRIVIA = new Set(['Space', 'LineComment', 'BlockComment']);
/** A node's children without spaces and comments. */
export const significant = (node) => (node?.children ?? []).filter((c) => !TRIVIA.has(c.kind));

/** The markup a content block holds, or a Markup node itself; null for anything else. */
export const markupOf = (node) => (node?.kind === 'ContentBlock' ? node.children.find((c) => c.kind === 'Markup') ?? null : node?.kind === 'Markup' ? node : null);

/** The dotted name of what a call calls: figure, math.equation, table.hline; null for anything else (a method call). */
export function calleeName(node) {
  if (node?.kind === 'Ident') return node.text;
  if (node?.kind !== 'FieldAccess') return null;
  const [target, , field] = node.children;
  const head = calleeName(target);
  return head && field ? head + '.' + field.text : null;
}

/** An argument list's { args: [{ name, value }] (name null for a positional one), bodies (the trailing content blocks) }. */
export function argsOf(list) {
  const args = [];
  const bodies = [];
  let inside = false;
  for (const a of list?.children ?? []) {
    if (a.kind === 'LeftParen') inside = true;
    else if (a.kind === 'RightParen') inside = false;
    else if (a.kind === 'ContentBlock' && !inside) bodies.push(a);
    else if (a.kind === 'Named') args.push({ name: a.children[0].text, value: significant(a)[2] ?? null });
    else if (!TRIVIA.has(a.kind) && a.kind !== 'Comma') args.push({ name: null, value: a });
  }
  return { args, bodies };
}

/** A call as { name, callee, args, bodies (as argsOf has them), node }, or null when node isn't a call. */
export function callOf(node) {
  if (node?.kind !== 'FuncCall') return null;
  const [callee, list] = node.children;
  return { name: calleeName(callee), callee, ...argsOf(list), node };
}

/** A named argument's value, or the n-th positional one, as its node. */
export const arg = (call, name, n = 0) => (name ? call?.args.find((a) => a.name === name)?.value : call?.args.filter((a) => a.name === null)[n]?.value) ?? null;

/** A string literal's text, or null. */
export function stringOf(node) {
  if (node?.kind !== 'Str') return null;
  return node.text.slice(1, -1).replace(/\\(?:u\{([0-9A-Fa-f]+)\}|(.))/gs, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : { n: '\n', r: '\r', t: '\t' }[ch] ?? ch));
}

/** A content block's markup as text, or a string as markup with Typst's special characters escaped; null otherwise. */
export function markupText(node) {
  const markup = markupOf(node);
  if (markup) return markup.text;
  const string = stringOf(node);
  return string === null ? null : string.replace(/[\\#*_$@<`[\]~]/g, '\\$&');
}

/** A label's name, without its brackets. */
export const labelName = (node) => (node?.kind === 'Label' ? node.text.slice(1, -1) : null);

/** Every node under node, depth first, for which keep(node, parent) holds. */
export function findAll(node, keep, parent = null, out = []) {
  if (keep(node, parent)) out.push(node);
  for (const child of node.children ?? []) findAll(child, keep, node, out);
  return out;
}

/**
 * The end (just past) of the expression embedded at the # at i in a Typst file's text, as Typst's parser reads it, with
 * the ; that ends it; i + 1 when none starts there.
 */
export function expressionEnd(source, i) {
  let end = i + 1;
  findAll(parseTypst(source), (n, parent) => {
    const k = n.kind === 'Hash' && n.start === i ? parent.children.indexOf(n) : -1;
    if (k !== -1 && parent.children[k + 1]) end = (parent.children[k + 2]?.kind === 'Semicolon' ? parent.children[k + 2] : parent.children[k + 1]).end;
    return false;
  });
  return end;
}

/**
 * What a Typst file names and brings in: its labels (each <name> in markup), its @references with their names, the
 * targets of #ref and the keys of #cite, the files it #includes and the local files it #imports, as written, and its
 * bibliography's file and style.
 */
export function typstUses(source) {
  const root = parseTypst(source);
  const calls = findAll(root, (n, parent) => n.kind === 'FuncCall' && parent?.kind === 'Markup').map(callOf);
  const target = (call) => {
    const first = arg(call, null, 0);
    return labelName(first) ?? (callOf(first)?.name === 'label' ? stringOf(arg(callOf(first), null, 0)) : null);
  };
  const bibliography = calls.find((c) => c.name === 'bibliography');
  const imports = findAll(root, (n) => n.kind === 'ModuleImport').map((n) => stringOf(n.children.find((c) => c.kind === 'Str'))).filter((s) => s && !s.startsWith('@'));
  return {
    labels: findAll(root, (n, parent) => n.kind === 'Label' && parent?.kind === 'Markup').map(labelName),
    at: findAll(root, (n) => n.kind === 'RefMarker').map((n) => n.text.slice(1)),
    refs: calls.filter((c) => c.name === 'ref').map(target).filter(Boolean),
    cites: calls.filter((c) => c.name === 'cite').map(target).filter(Boolean),
    includes: findAll(root, (n, parent) => n.kind === 'ModuleInclude' && parent?.kind === 'Markup').map((n) => stringOf(n.children.find((c) => c.kind === 'Str'))).filter(Boolean),
    imports,
    bibliography: bibliography ? { path: stringOf(arg(bibliography, null, 0)), style: stringOf(arg(bibliography, 'style')) } : null
  };
}
