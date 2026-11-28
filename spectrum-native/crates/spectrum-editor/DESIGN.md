# spectrum-editor: design

Session 2a, 28 Nov 2026. The decision the rest of Phase 2 builds on. Session 2b (29 Nov) added the
language layer.

## Options

- **(a) Build on the kit's editor.** gpui-kit 0.11.0 ships a code editor (`gpui-base/src/input`,
  41,700 lines; styled wrapper in `gpui-component/src/input`). `spectrum-editor` would wrap its
  `EditorState` and add what is missing from outside.
- **(b) Our own document core and editor element**, taking kit pieces where they fit.
- **(c) Hybrid**: the kit's editor as the text surface, with our own document core beside it.

## Evidence

### Measured: the kit's editor is fast enough

A throwaway crate (not kept in the repo) opened the kit's `Editor` in an offscreen window with the
real Metal text system (`VisualTestAppContext`, as `spectrum-app/tests/snapshot.rs` does), loaded a
generated 20,000-line, 1.31 MB .tex (prose, maths, CJK, emoji) with soft wrap and a Tree-sitter
LaTeX grammar registered, and timed `window.draw`. Release build, M-series Mac, other builds
running at the time, so these are on the slow side. A screenshot confirmed real highlighted text.

| | 20k lines | 100k lines | Plan target |
|---|---|---|---|
| Open: `set_value` + first frame | 32–42 ms | 59 ms | < 30 ms |
| Idle frame | 0.8–0.9 ms | 1.9 ms | < 4 ms |
| Type a character: edit + frame, median (p95) | 1.8–2.4 ms (2.7) | 6.4 ms (7.0) | < 4 ms |
| Scroll, per frame | 0.8–1.0 ms | 2.7 ms | < 4 ms |

About 26 ms of the open is paid once per app run (a 2,000-line file takes 27 ms too), so the second
file would open well under 30 ms. The edit and the frame both grow with document size; the kit's
own doc comment says it "handles large text up to about 50K lines" and that it "aims at simple code
editing or display, not at being a full-featured code editor" (`base/state.rs`, `EditorState::new`).
A full Tree-sitter parse of the same file takes 117–131 ms, which the kit does on a background
thread after a 150 ms pause.

So speed does not rule the kit out at 20k lines. What it can be made to do decides it.

### Read: what the kit can and cannot do without a fork

| Must-have | Kit 0.11.0 |
|---|---|
| IME: marked text, UTF-16 ranges, `bounds_for_range` | Yes, complete and careful (`base/state.rs:4813–5420`). |
| Multi-cursor | Yes (Alt-click, add above/below, column select). But only the primary selection can be read from outside (`selections` is `pub(super)`), so our own commands cannot act on the others. |
| Ghost-text completion | Yes, through `CompletionProvider::inline_completion`. |
| Squiggles from byte ranges | Yes, `TextDecorationCollection`; ranges follow edits. |
| Git diff bar, fold chevrons, line numbers | Yes: `GutterDecoration`, `FoldIconRenderer`, `EditorLineNumberRenderer` (`#[doc(hidden)]`). |
| Nested scope bars, click to jump, diagnostic dots | No. The gutter strip is one column with one colour per line and no click. Only possible as a second element painted over the editor from `display_map()` and `scroll_offset()`. |
| Inline diff hunks with Accept / Reject | No. There are no view zones or block widgets: a line that is not in the buffer cannot be shown, so removed lines have nowhere to go. Range fills only. |
| Vim / Emacs | No modal input and no block cursor. Movement exists only as actions; transactions are private (`undo_manager.rs:120–144` are `pub(super)`), so a compound command (`:s`, `.`, a snippet) cannot be made one undo step. |
| Regex and whole-word find | No. `SearchMatcher::update_query(query, case_insensitive)` is the whole of it. |
| Snippets with tab stops | No. |
| Undo grouping by 400 ms / word | No. Grouping is by kind of edit only, with no setting. |
| LaTeX, Typst, BibTeX grammars | Not included, but `LanguageRegistry::register` takes ours. Markdown is built in. |
| Folds and outline from the AST | Folds yes. Outline needs the tree, which the editor's highlighter keeps to itself, so we would supply our own `InputHighlighter`. |
| A document without a window | No. The text lives inside `EditorState`, which needs a `Window` to be built. Two panes cannot share one buffer, and nothing can edit a file that is not on screen. |

## Decision

**(b): our own document core and our own editor element.**

The kit's editor is good and quick, but it is a closed widget: 14,000 lines of private state with a
handful of seams. Four things in the plan (inline diff hunks, Vim, regex find, snippets) need
changes inside it, which means forking 41,700 lines we did not write, five days after its release.
(c) is worse than either: two owners of the text, kept in step by events.

What we take from the kit, all without touching its internals:

- **The same `ropey` rope** (`=2.0.0-beta.1`, with the metrics the kit turns on), so a `Rope` can be
  handed to any kit API that wants one.
- **Its source as the reference** for the hard parts we now write ourselves: the IME handler
  (`gpui-base-0.11.0/src/input/base/state.rs:4813–5420`), wrapping
  (`editor/display_map/text_wrapper.rs`), hit testing and the caret (`base/element.rs`). It is
  Apache-2.0; note it in THIRD_PARTY_NOTICES if code is copied rather than read.
- **Its numbers as the bar**: our element must not be slower than 0.9 ms a frame and 2 ms for a
  keystroke with its frame at 20k lines.
- **Kit widgets through `spectrum-ui`** for the chrome around the text: popovers, lists, menus,
  scrollbar, tooltips, and its `Input` for the find bar.
- **The kit's `Input`, `Textarea` and `Editor`** for every other text field, as the plan says
  (search, chat composer, BibTeX fields, Settings, small read-only code views).

`spectrum-editor` does not import the kit, so the facade rule in CODING_STANDARD.md stands.

The cost is the one the plan already budgeted: sessions 2c and 2d write the element and the input
handler. The risk is the IME; 2d tests it by hand on both systems, as the plan already requires.

## The document core (built in 2a)

Pure logic, no GPUI. `src/buffer.rs`, `selection.rs`, `history.rs`, `document.rs`.

- **`Buffer`**: a rope of UTF-8 bytes with a `version` that goes up on every change, undo and redo
  included. It holds LF only: CRLF and lone CR are turned into LF on load and in every edit, the
  file's line ending is remembered, and `file_text()` puts it back for saving. So a line is exactly
  what `\n` separates and no cursor can land inside a CRLF.
- **Conversions** between byte offset, `Point` (line, byte column: Tree-sitter), `PointUtf16`
  (line, UTF-16 column: LSP), absolute UTF-16 offset (IME) and char index. All O(log n), all clamp
  rather than panic (past the end, inside a character, inside a surrogate pair, past a line's end).
- **`Document`** = buffer + history. Every change is a `Transaction` of `Edit`s in the coordinates
  from before it. `apply` returns the `Change`s in the order made, each carrying the points
  Tree-sitter's `InputEdit` and the LSP's incremental `didChange` need.
- **Undo** is a stack of transactions. Typing joins the step before it when it is the same kind of
  edit, the cursors have not moved, it is within 400 ms, and it is not the first white space after
  a word. `begin_undo_group` / `end_undo_group` make anything one step (IME composition, snippet,
  replace-all). `mark_saved` / `is_dirty` follow the saved step through undo and redo.
- **`SelectionSet`**: sorted, merged, with a primary. It belongs to a view, not the document, so
  two panes can share a document; a transaction takes the view's selections and returns the new
  ones, and `SelectionSet::map` moves another view's selections through the same changes.

Measured (`cargo test --release -p spectrum-editor --test perf -- --ignored --nocapture`), same
20,000-line file:

| | Median | p99 |
|---|---|---|
| Open (`Document::from_text`) | 0.87 ms | 0.97 ms |
| Open a CRLF file | 1.32 ms | 1.66 ms |
| Type one character (apply + undo record) | 0.96 µs | 1.46 µs |
| Offset ↔ UTF-16 point, UTF-16 offset, char index (all four) | 1.12 µs | 1.62 µs |
| Type one character at 100 cursors | 100 µs | 156 µs |
| Text for saving | 80 µs | 100 µs |

Undoing all of it (30,000 replacements in 1,668 steps) takes 29 ms.

## The language layer (built in 2b)

Pure logic on the buffer, no GPUI. `src/syntax.rs` (+ `syntax/`), `scope.rs`, `todos.rs`.

- **`Language::from_path`**: `.tex .ltx .latex .sty .cls .clo .dtx .ins .def .bbx .cbx .lbx .dbx`
  LaTeX, `.typ` Typst, `.md .markdown .mmd` Markdown, `.bib` BibTeX; anything else is plain text.
  Grammars: codebook-tree-sitter-latex, codebook-tree-sitter-typst, tree-sitter-md (block +
  inline), and tree-sitter-bibtex vendored in `vendor/` (built by `build.rs`; the crates.io crate
  wants tree-sitter 0.22).
- **`Syntax`** holds one tree. `Syntax::parse` parses now; for a file over
  `BACKGROUND_PARSE_BYTES` the view runs `ParsedTree::parse(language, &rope, version)` on the
  background executor and hands the result to `Syntax::accept`. Edits made meanwhile are kept and
  replayed onto the new tree, so typing during the 120 ms parse is not thrown away; `accept`
  refuses a result it cannot bring up to date. `Syntax::edit(&buffer, &applied.changes)` follows
  every transaction, undo and redo (tree edit + incremental reparse on the UI thread).
- **`Syntax::highlight(&buffer, lines)`** returns `HighlightSpan { range, role }` for the lines
  asked for plus 40 each way: sorted, never overlapping, innermost syntax wins. Roles, not colours
  (`HighlightRole`, 28 of them: command, keyword, environment, bracket, delimiter, operator, maths
  and its delimiters, string, number, constant, heading and its marker, label, reference,
  citation, emphasis, strong, strikethrough, code, link, field, variable, escape, list marker,
  quote, placeholder, comment). Fine-grained on purpose: 2e's calm themes merge them into a few
  soft colours. Queries are `syntax/queries/*.scm`; Markdown's inline grammar is parsed over the
  visible `inline` nodes on each call.
- **`Syntax::outline`**: LaTeX `\part`…`\subparagraph` (starred too; levels 0–6) with captioned
  figures, tables, algorithms and listings one level below; Typst `=` headings and captioned
  `#figure`s; Markdown ATX and setext headings; BibTeX entries (key, type in `detail`). Titles as
  2.8 showed them (`\texorpdfstring`, text styles, `…` for refs and cites, `~`). Each item's
  `range` is its whole section, so the heading at the cursor is a range test.
- **`Syntax::folds`**: LaTeX environments, sections, `\[…\]`, `\iffalse` blocks, and
  `\begingroup`/`\if…\fi` from the text; Typst sections, `{}`, `[]`, `()`, raw, maths, block
  comments; Markdown sections, fences, front matter, quotes, HTML; BibTeX entries.
  `FoldRange.hidden` keeps a closing `\end{…}`, `}` or fence in view.
- **`ScopeMap`**: per-line depth 0–8 for the scope bars, from the text (comments, strings, raw and
  maths skipped), so a half-typed `\begin{` does not make the bars jump. A bar runs from its
  `\begin` line to its `\end` line inclusive (2.8 drew only the lines between). `update` rescans
  the changed lines, shifts the ones below whose depth only moved, and stops at the first line
  whose starting state is unchanged. `innermost(line)` and `scope(line, level)` give the open and
  close lines for the active bar and for click-to-jump.
- **`todos(language, &buffer)`**: 2.8's `scanTodos` for one file: `\todo`, `\missingfigure`,
  `\fixme`, `\fx…` (not their definitions or commented-out uses) and `TODO`/`FIXME`/`XXX` in `%`
  comments; `// TODO` in Typst; `<!-- TODO -->` in Markdown.

Measured on the same 20,000-line file, release, M-series Mac with other builds running
(`cargo test --release -p spectrum-editor --test perf -- --ignored --nocapture`):

| | Median | p99 |
|---|---|---|
| First parse (background) | 118 ms | 190 ms |
| Incremental reparse after a keystroke | 0.70 ms | 0.94 ms |
| Highlight 60 lines (+40 overscan each way) | 0.47 ms | 0.55 ms |
| Scope map update after a keystroke (1 in 50 opens or closes an environment) | 5.6 µs | 20 µs |
| Scope map built from scratch | 5.0 ms | 5.2 ms |
| Outline, whole file | 4.3 ms | 5.4 ms |
| Folds, whole file | 13 ms | 14 ms |
| To-dos, whole file | 3.3 ms | 3.5 ms |

The plan's "typically < 0.3 ms" reparse is 0.7 ms with this grammar; still well inside a frame.
Compiling a highlight query costs ~30 ms once per language per run; `ParsedTree::parse` does it on
the background thread, a small file's first highlight pays it on the UI thread.

## What 2b–2e do differently from the plan

- **Bytes, not chars.** ropey 2 is byte-indexed; every offset in the crate's API is a UTF-8 byte.
  Convert at the edges only (LSP, IME).
- **2b (highlight, outline, folds, scope depths)** reads `Buffer::rope()` and follows
  `Applied::changes` (`start`, `old_end()`, `new_end()` and the three `Point`s are an `InputEdit`).
  Use Tree-sitter directly rather than the kit's `SyntaxHighlighter`: its hand-off from a background
  parse (`apply_background_tree`) is crate-private, and the first parse of a 20k-line .tex takes
  about 120 ms, so it must run off the UI thread on a rope snapshot (`rope().clone()` is O(1)) and
  be dropped if `version` moved. Incremental reparses stay on the UI thread. The kit's
  `highlighter.rs` shows the rope `TextProvider` and injections (Markdown needs them).
  Done as above; a background result is caught up rather than dropped.
- **For 2c**: per transaction call `syntax.edit` and `scopes.update` with `applied.changes`;
  highlight when the version changes or the viewport leaves the overscan. Run outline, folds and
  to-dos when edits settle (debounced), not per keystroke: folds take 13 ms at 20k lines, so if
  that shows as a dropped frame, give `Syntax` a `Send` snapshot (tree clone + rope clone, both
  O(1)) and compute them on the background executor. Bars take their hues from
  `SpectrumTheme::scope_bar_color(level - 1)`.
- **2c (element, gutter)** wraps `Document` in an entity shared by its views; each view owns a
  `SelectionSet`. The display map needs three layers from the start: wrap, fold, and **blocks**
  (rows that are not in the buffer) for diff hunks and their Accept / Reject row. The gutter is
  ours, so Snippet A applies as written.
- **2d (input, IME, search, snippets)** builds `EntityInputHandler` on `range_from_utf16` /
  `range_to_utf16` and wraps a composition in an undo group. Find is ours and uses `regex` on the
  rope. Backspace and cursor movement must step by grapheme cluster, which the core leaves to the
  commands. Completion, hover and the find bar are built from `spectrum-ui` widgets; the kit's own
  completion menu is `pub(crate)`.
- **2e (themes, shortcuts, Vim)** drives `Document` and `SelectionSet` through transactions; the
  block cursor is drawn by our element. Themes: all of 2.8's `editorThemes.ts` with exact colours,
  2.8's Spectrum pair kept as "Spectrum Classic Light / Dark" (`spectrum-classic-light`,
  `spectrum-classic-dark`), and a new default "Spectrum Light / Dark" (`spectrum-light`,
  `spectrum-dark`) from the plan's editor design, so the theme model is a table of named themes
  with the plan's pair as one entry, not derived from `SpectrumTheme` alone. See "Editor themes" in
  `docs/REWRITE_V3_PLAN.md`. Each theme is a table from `HighlightRole` to colour (2.8's 12 per-role
  overrides map onto groups of roles); the writing workspace stays soft and near-mono, so the new
  Spectrum pair gives most roles the text colour or a pastel and keeps vivid hues out.
- **Look.** 2.8's CSS is never the visual goal. Whatever the plan does not draw (completion list,
  hover and maths popovers, find bar, diff hunk chrome, fold placeholder) is designed in the plan's
  system: its tokens, 16/12/10 radii, area colours and tinted pills. 2.8 is for behaviour only.
- **File reading is not here.** Whoever opens files decodes them (BOM, non-UTF-8 via
  `encoding_rs`) and hands `Document::from_text` a `&str`.
