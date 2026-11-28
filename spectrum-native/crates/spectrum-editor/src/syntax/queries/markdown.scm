; Markdown block structure (tree-sitter-md 0.5.4). Inline syntax is markdown_inline.scm.

(atx_heading heading_content: (inline) @heading)
(setext_heading heading_content: (paragraph) @heading)
[
  (atx_h1_marker) (atx_h2_marker) (atx_h3_marker)
  (atx_h4_marker) (atx_h5_marker) (atx_h6_marker)
  (setext_h1_underline) (setext_h2_underline)
] @heading_marker

(fenced_code_block_delimiter) @delimiter
(info_string) @field
[(fenced_code_block) (indented_code_block)] @code

((html_block) @comment
  (#match? @comment "^<!--"))
(html_block) @code
[(minus_metadata) (plus_metadata)] @code

(link_reference_definition (link_label) @reference)
(link_destination) @link
(link_title) @string

[
  (list_marker_plus) (list_marker_minus) (list_marker_star)
  (list_marker_dot) (list_marker_parenthesis)
  (task_list_marker_checked) (task_list_marker_unchecked)
  (thematic_break)
] @list_marker

(block_quote_marker) @delimiter
(block_quote) @quote
(backslash_escape) @escape
[(pipe_table_delimiter_row) "|"] @delimiter
