; BibTeX (vendored latex-lsp/tree-sitter-bibtex), adapted from its own highlights.scm.

[(junk) (comment)] @comment
[(entry_type) (string_type) (preamble_type)] @keyword
[(key_brace) (key_paren)] @citation
(field name: (identifier) @field)
(string name: (identifier) @constant)
(token (identifier) @variable)
(command) @command
(number) @number
(token) @string
["=" "#"] @operator
["{" "}" "(" ")"] @bracket
"," @delimiter
