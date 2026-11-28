//! Builds the vendored BibTeX grammar (`vendor/tree-sitter-bibtex`): the crates.io crate wants
//! tree-sitter 0.22, which cannot link beside the 0.26 the rest of the workspace uses.

fn main() {
    let dir = std::path::Path::new("vendor/tree-sitter-bibtex");
    let parser = dir.join("parser.c");
    println!("cargo:rerun-if-changed={}", parser.display());
    cc::Build::new()
        .include(dir)
        .file(parser)
        .warnings(false)
        .compile("tree-sitter-bibtex");
}
