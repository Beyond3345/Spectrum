; Markdown inline syntax (tree-sitter-md 0.5.4, inline grammar), parsed over the block
; grammar's (inline) nodes near the screen.

[(emphasis_delimiter) (code_span_delimiter)] @delimiter
(latex_span_delimiter) @math_delimiter
(code_span) @code
(latex_block) @math
(emphasis) @emphasis
(strong_emphasis) @strong
(strikethrough) @strikethrough
[(link_destination) (uri_autolink) (email_autolink)] @link
[(link_label) (link_text) (image_description)] @reference
(link_title) @string
[(backslash_escape) (hard_line_break) (entity_reference) (numeric_character_reference)] @escape
(html_tag) @code
(inline_link ["[" "]" "(" ")"] @bracket)
(image ["!" "[" "]" "(" ")"] @bracket)
(shortcut_link ["[" "]"] @bracket)
