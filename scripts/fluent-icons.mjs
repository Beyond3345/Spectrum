#!/usr/bin/env node
// Writes the Windows app's icons: apps/frontend/public/fluent/<sf-name>.svg for every name in
// scripts/sf-symbols.txt, from Microsoft's Fluent UI System Icons (MIT), and their licence.
// SF Symbols are licensed for apps on Apple platforms only, so Icon.tsx uses these on Windows.
// The SVGs are committed; run this again after adding a name to sf-symbols.txt and FLUENT below.
//
//   node scripts/fluent-icons.mjs [version]   (default: the latest @fluentui/svg-icons)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'apps/frontend/public/fluent');
const licence = path.join(root, 'apps/frontend/public/licences/FluentUI-System-Icons-MIT.txt');

// SF Symbol → Fluent icon (20px). SF names ending in .fill or .filled take the filled style, the rest regular
const FLUENT = {
  archivebox: 'archive',
  'archivebox.fill': 'archive',
  'arrow.clockwise': 'arrow_clockwise',
  'arrow.counterclockwise': 'arrow_counterclockwise',
  'arrow.down.circle': 'arrow_circle_down',
  'arrow.down.doc': 'document_arrow_down',
  'arrow.down.right.and.arrow.up.left': 'arrow_minimize',
  'arrow.down.to.line': 'arrow_download',
  'arrow.left.and.right': 'arrow_bidirectional_left_right',
  'arrow.right': 'arrow_right',
  'arrow.triangle.2.circlepath': 'arrow_sync',
  'arrow.triangle.branch': 'arrow_split',
  'arrow.up': 'arrow_up',
  'arrow.up.circle.fill': 'arrow_circle_up',
  'arrow.up.left.and.arrow.down.right': 'arrow_maximize',
  'arrow.uturn.backward': 'arrow_hook_up_left',
  'arrow.uturn.forward': 'arrow_hook_up_right',
  book: 'book',
  'book.closed': 'book',
  'book.pages': 'book_open',
  bookmark: 'bookmark',
  'books.vertical': 'library',
  'brain.head.profile': 'brain',
  'bubble.left': 'chat',
  'bubble.left.and.bubble.right': 'chat_multiple',
  'bubble.left.and.text.bubble.right': 'chat_multiple',
  'chart.bar.xaxis': 'data_histogram',
  checklist: 'task_list_ltr',
  checkmark: 'checkmark',
  'checkmark.circle': 'checkmark_circle',
  'checkmark.circle.fill': 'checkmark_circle',
  'checkmark.seal': 'checkmark_starburst',
  'chevron.down': 'chevron_down',
  'chevron.left': 'chevron_left',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron_right',
  'chevron.up': 'chevron_up',
  'chevron.up.chevron.down': 'chevron_up_down',
  'circle.lefthalf.filled': 'dark_theme',
  clock: 'clock',
  'clock.arrow.circlepath': 'history',
  // cloud projects
  cloud: 'cloud',
  // ⌘ has no Windows twin
  command: 'keyboard',
  curlybraces: 'braces',
  doc: 'document',
  'doc.badge.plus': 'document_add',
  'doc.on.doc': 'copy',
  // the file tree's PDF icon
  'doc.richtext': 'document_pdf',
  'doc.text': 'document_text',
  'doc.text.fill': 'document_text',
  'doc.text.magnifyingglass': 'document_search',
  'doc.zipper': 'folder_zip',
  ellipsis: 'more_horizontal',
  'ellipsis.circle': 'more_circle',
  'exclamationmark.circle': 'error_circle',
  'exclamationmark.triangle': 'warning',
  'exclamationmark.triangle.fill': 'warning',
  externaldrive: 'hard_drive',
  eye: 'eye',
  'eye.slash': 'eye_off',
  folder: 'folder',
  'folder.badge.plus': 'folder_add',
  // Locate… (a project whose folder has gone)
  'folder.badge.questionmark': 'folder_search',
  'folder.fill': 'folder',
  function: 'math_formula',
  'gauge.with.dots.needle.33percent': 'gauge',
  'gauge.with.dots.needle.50percent': 'gauge',
  'gauge.with.dots.needle.67percent': 'gauge',
  gearshape: 'settings',
  globe: 'globe',
  graduationcap: 'hat_graduation',
  hammer: 'wrench',
  highlighter: 'highlight',
  'info.circle': 'info',
  keyboard: 'keyboard',
  lightbulb: 'lightbulb',
  link: 'link',
  'list.bullet': 'text_bullet_list_ltr',
  'list.bullet.indent': 'text_bullet_list_tree',
  'list.number': 'text_number_list_ltr',
  magnifyingglass: 'search',
  minus: 'subtract',
  'minus.circle': 'subtract_circle',
  'minus.magnifyingglass': 'zoom_out',
  moon: 'weather_moon',
  'note.text': 'note',
  'note.text.badge.plus': 'note_add',
  number: 'number_symbol',
  paperclip: 'attach',
  pencil: 'edit',
  photo: 'image',
  'photo.badge.plus': 'image_add',
  'photo.on.rectangle': 'image_multiple',
  'play.fill': 'play',
  plus: 'add',
  'plus.bubble': 'chat_add',
  'plus.circle': 'add_circle',
  'plus.forwardslash.minus': 'add_subtract_circle',
  'plus.magnifyingglass': 'zoom_in',
  'plus.square.on.square': 'add_square_multiple',
  'quote.bubble': 'comment_quote',
  'quote.opening': 'text_quote_opening',
  // the view switcher: editor only, editor and PDF, PDF only
  rectangle: 'rectangle_landscape',
  'rectangle.righthalf.filled': 'panel_right',
  'rectangle.fill': 'rectangle_landscape',
  'rectangle.portrait.and.arrow.right': 'sign_out',
  'rectangle.split.2x1': 'split_vertical',
  scope: 'target',
  'sidebar.left': 'panel_left',
  'sidebar.right': 'panel_right',
  'slider.horizontal.3': 'options',
  sparkle: 'sparkle',
  'sparkle.magnifyingglass': 'search_sparkle',
  sparkles: 'sparkle',
  'square.and.arrow.down': 'arrow_download',
  // Upload files… and Upload folder…
  'square.and.arrow.up': 'arrow_upload',
  'tray.and.arrow.down': 'folder_arrow_up',
  'square.and.pencil': 'compose',
  'square.grid.2x2': 'grid',
  star: 'star',
  'star.fill': 'star',
  stethoscope: 'stethoscope',
  'stop.fill': 'stop',
  sum: 'autosum',
  'sun.max': 'weather_sunny',
  tablecells: 'table',
  tag: 'tag',
  'tag.fill': 'tag',
  terminal: 'window_console',
  // lines with a badge, as the SF ones are drawn
  'text.badge.checkmark': 'text_grammar_checkmark',
  'text.badge.plus': 'text_bullet_list_add',
  'text.insert': 'text_grammar_arrow_right',
  'text.book.closed': 'book_letter',
  'text.bubble': 'comment_text',
  // Settings → Editor
  'text.cursor': 'text_edit_style',
  'text.viewfinder': 'scan_text',
  textformat: 'text_font',
  'textformat.abc.dottedunderline': 'text_proofing_tools',
  'textformat.size.larger': 'font_increase',
  'textformat.size.smaller': 'font_decrease',
  trash: 'delete',
  'tray.full': 'mail_inbox_all',
  'wand.and.stars': 'wand',
  'wrench.and.screwdriver': 'wrench_screwdriver',
  xmark: 'dismiss',
  'xmark.bin': 'delete_dismiss',
  'xmark.circle.fill': 'dismiss_circle',
  // Windows draws errors as a filled circle with a cross
  'xmark.octagon.fill': 'dismiss_circle'
};

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${res.stderr || res.error?.message}`);
  return res.stdout;
}

const names = fs.readFileSync(path.join(root, 'scripts/sf-symbols.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
const unmapped = names.filter((name) => !FLUENT[name]);
if (unmapped.length) throw new Error(`No Fluent icon for ${unmapped.join(', ')}: add them to FLUENT in scripts/fluent-icons.mjs`);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'spectrum-fluent-'));
const spec = `@fluentui/svg-icons@${process.argv[2] || 'latest'}`;
const tarball = path.join(work, run('npm', ['pack', spec, '--silent', '--pack-destination', work]).trim().split('\n').pop());
run('tar', ['xzf', tarball, '-C', work]);
const { version } = JSON.parse(fs.readFileSync(path.join(work, 'package/package.json'), 'utf8'));

const sources = names.map((name) => [name, path.join(work, 'package/icons', `${FLUENT[name]}_20_${/\.fill(ed)?$/.test(name) ? 'filled' : 'regular'}.svg`)]);
const missing = sources.filter(([, file]) => !fs.existsSync(file)).map(([name, file]) => `${name} (${path.basename(file)})`);
if (missing.length) throw new Error(`Not in ${spec} ${version}: ${missing.join(', ')}`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const [name, file] of sources) {
  const svg = fs.readFileSync(file, 'utf8');
  // used as CSS masks: one colour (the default black), on the 20px grid
  if (!svg.includes('viewBox="0 0 20 20"') || /fill="(?!none)|stroke=|opacity|<image/.test(svg)) throw new Error(`${path.basename(file)} won't work as a mask`);
  fs.writeFileSync(path.join(outDir, `${name}.svg`), svg);
}

// the package carries no licence file; the repository's at the same release
const res = await fetch(`https://raw.githubusercontent.com/microsoft/fluentui-system-icons/${version}/LICENSE`);
if (!res.ok) throw new Error(`Couldn't fetch the licence (${res.status})`);
fs.writeFileSync(licence, await res.text());
fs.rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${names.length} icons from @fluentui/svg-icons ${version} to ${path.relative(root, outDir)}`);
