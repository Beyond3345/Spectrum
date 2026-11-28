; Typst (codebook-tree-sitter-typst 0.12.2, the uben0 grammar), adapted from its own
; highlights.scm. Captures name a HighlightRole; the earlier pattern wins on the same text.

(comment) @comment

; raw text and strings first: nothing inside them is code
(raw_blck lang: (ident) @field)
(raw_blck "```" @delimiter)
(raw_span "`" @delimiter)
[(raw_blck) (raw_span)] @code
(string) @string

; maths
(math "$" @math_delimiter)
(math) @math

; markup
(heading "=" @heading_marker) @heading
(heading "==" @heading_marker) @heading
(heading "===" @heading_marker) @heading
(heading "====" @heading_marker) @heading
(heading "=====" @heading_marker) @heading
(heading "======" @heading_marker) @heading
(label) @label
(ref) @reference
(url) @link
(emph) @emphasis
(strong) @strong
(item "-" @list_marker)
(term ["/" ":"] @list_marker)
(escape) @escape
(linebreak) @escape
(shorthand) @constant
(quote) @quote

; code
(call item: (ident) @command)
(call item: (field field: (ident) @command))
(tagged field: (ident) @field)
(let "let" @keyword)
(branch ["if" "else"] @keyword)
(while "while" @keyword)
(for ["for" "in"] @keyword)
(import "import" @keyword)
(as "as" @keyword)
(include "include" @keyword)
(show "show" @keyword)
(set "set" @keyword)
(return "return" @keyword)
(flow ["break" "continue"] @keyword)
(context "context" @keyword)
(in ["in" "not"] @operator)
(and "and" @operator)
(or "or" @operator)
(not "not" @operator)
(sign ["+" "-"] @operator)
(add "+" @operator)
(sub "-" @operator)
(mul "*" @operator)
(div "/" @operator)
(cmp ["==" "<=" ">=" "!=" "<" ">"] @operator)
(fraction "/" @operator)
(attach ["^" "_"] @operator)
"=>" @operator
"#" @operator
(number) @number
[(bool) (none) (auto)] @constant
(field field: (ident) @field)
(ident) @variable

["(" ")" "{" "}" "[" "]"] @bracket
["," ";" ":"] @delimiter
