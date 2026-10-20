import { LatexNodes2Text, MacroTextSpec } from './pylatexenc.latex2text.js';
import { get_default_latex_context_db as textContext } from './pylatexenc.latex2text._get_defaultspecs.js';
import { get_default_latex_context_db as walkerContext } from './pylatexenc.latexwalker._get_defaultspecs.js';
import { UnicodeToLatexEncoder } from './pylatexenc.latexencode.js';
import { get_builtin_conversion_rules } from './pylatexenc.latexencode.get_builtin_rules.js';
import { $$kw } from './py.js';

const context = textContext();
// Bibliography titles need the visible link label and the conventional TeX logos.
context.add_context_category('spectrum', $$kw({ prepend: true, macros: [
  MacroTextSpec('LaTeX', 'LaTeX'), MacroTextSpec('TeX', 'TeX'), MacroTextSpec('href', '%(2)s'),
  MacroTextSpec('textasciicircum', '^')
] }));
const walker = walkerContext();

export function latexToText(text) {
  const converter = LatexNodes2Text($$kw({ latex_context: context, math_mode: 'text', text_fontstyle: false, math_fontstyle: null }));
  return converter.latex_to_text(text, $$kw({ latex_context: walker, tolerant_parsing: true }));
}

const encoder = UnicodeToLatexEncoder($$kw({
  conversion_rules: get_builtin_conversion_rules('defaults'), non_ascii_only: true,
  unknown_char_policy: 'keep', unknown_char_warning: false
}));
export const unicodeToLatex = (text) => encoder.unicode_to_latex(text);
