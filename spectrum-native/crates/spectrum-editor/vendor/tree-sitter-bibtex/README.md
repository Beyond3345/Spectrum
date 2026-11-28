# tree-sitter-bibtex (vendored)

`parser.c` and `tree_sitter/parser.h`, unmodified, from the `tree-sitter-bibtex` 0.1.0 crate on
crates.io, published from [latex-lsp/tree-sitter-bibtex](https://github.com/latex-lsp/tree-sitter-bibtex)
at commit `968f8619cc4f42bcb53883d41ae2b2285dda5977` (the grammar TexLab uses; ABI 13). That grammar
is a modified version of [Aerijo/tree-sitter-bibtex](https://github.com/Aerijo/tree-sitter-bibtex).

Vendored because the crate depends on tree-sitter ^0.22, and tree-sitter's `links` key allows only
one version in a build; Spectrum uses 0.26.13. `../../build.rs` compiles it with `cc`, and
`src/syntax/language.rs` binds `tree_sitter_bibtex` through `tree-sitter-language`.

Licence: MIT, as the crate declares (`license = "MIT"`); see `LICENSE`.
