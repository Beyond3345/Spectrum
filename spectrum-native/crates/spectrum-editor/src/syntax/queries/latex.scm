; LaTeX (codebook-tree-sitter-latex 0.6.1, the latex-lsp grammar). Captures name a
; HighlightRole; of two captures of the same text the earlier pattern wins.

; verbatim text is a (comment) node in this grammar
(verbatim_environment verbatim: (comment) @code)
(listing_environment code: (source_code) @code)
(minted_environment code: (source_code) @code)

[(line_comment) (block_comment) (comment_environment)] @comment

; maths: the whole formula, then what is inside it
[(inline_formula) (displayed_equation) (math_environment)] @math
(inline_formula ["$" "\\(" "\\)"] @math_delimiter)
(displayed_equation ["$$" "\\[" "\\]"] @math_delimiter)

; environments
(begin command: _ @keyword name: (curly_group_text text: (text) @environment))
(end command: _ @keyword name: (curly_group_text text: (text) @environment))
(environment_definition name: (curly_group_text text: (text) @environment))

; sections: the command, then the title
(part command: _ @heading_marker text: (curly_group) @heading)
(chapter command: _ @heading_marker text: (curly_group) @heading)
(section command: _ @heading_marker text: (curly_group) @heading)
(subsection command: _ @heading_marker text: (curly_group) @heading)
(subsubsection command: _ @heading_marker text: (curly_group) @heading)
(paragraph command: _ @heading_marker text: (curly_group) @heading)
(subparagraph command: _ @heading_marker text: (curly_group) @heading)

; labels, references, citations
(label_definition name: (curly_group_label label: (label) @label))
(label_reference names: (curly_group_label_list label: (label) @reference))
(label_reference_range from: (curly_group_label label: (label) @reference))
(label_reference_range to: (curly_group_label label: (label) @reference))
(citation keys: (curly_group_text_list text: (text) @citation))

(placeholder) @placeholder
[(path) (uri) (glob_pattern)] @link
(key_value_pair key: (text) @field)
(delimiter) @delimiter
(operator) @operator

; every other command: generic ones (and \todo), then the grammar's named ones
[(command_name) (todo_command_name)] @command
; a wildcard parent, (_ command: _), would make highlighting 40% slower
[
  (acronym_definition command: _ @command)
  (acronym_reference command: _ @command)
  (author_declaration command: _ @command)
  (bibstyle_include command: _ @command)
  (bibtex_include command: _ @command)
  (caption command: _ @command)
  (changes_replaced command: _ @command)
  (citation command: _ @command)
  (class_include command: _ @command)
  (color_definition command: _ @command)
  (color_reference command: _ @command)
  (color_set_definition command: _ @command)
  (counter_addition command: _ @command)
  (counter_declaration command: _ @command)
  (counter_definition command: _ @command)
  (counter_increment command: _ @command)
  (counter_typesetting command: _ @command)
  (counter_value command: _ @command)
  (counter_within_declaration command: _ @command)
  (counter_without_declaration command: _ @command)
  (enum_item command: _ @command)
  (environment_definition command: _ @command)
  (glossary_entry_definition command: _ @command)
  (glossary_entry_reference command: _ @command)
  (graphics_include command: _ @command)
  (hyperlink command: _ @command)
  (import_include command: _ @command)
  (inkscape_include command: _ @command)
  (label_definition command: _ @command)
  (label_number command: _ @command)
  (label_reference command: _ @command)
  (label_reference_range command: _ @command)
  (latex_include command: _ @command)
  (let_command_definition command: _ @command)
  (new_command_definition command: _ @command)
  (old_command_definition command: _ @command)
  (package_include command: _ @command)
  (paired_delimiter_definition command: _ @command)
  (svg_include command: _ @command)
  (text_mode command: _ @command)
  (theorem_definition command: _ @command)
  (tikz_library_import command: _ @command)
  (title_declaration command: _ @command)
  (todo command: _ @command)
  (verbatim_include command: _ @command)
]

["{" "}" "[" "]"] @bracket
