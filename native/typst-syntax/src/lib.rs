//! Typst's own parser, typst-syntax, as WebAssembly for Spectrum's converter (apps/backend/src/services/convert/
//! typstRead.js). It parses a .typ file as Typst does and gives back the syntax tree as JSON, nothing evaluated: each
//! node is {"kind", "start", "end", "children"}, its span in UTF-16 code units so JavaScript can slice its own string
//! with it, and an error node has its "message". The tree is lossless: the leaves' text, in order, is the source.
//! Built by scripts/native.mjs typst-syntax.

use std::fmt::Write;
use typst_syntax::{SyntaxKind, SyntaxNode};

/// Room for n bytes, which the host fills with the source for spectrum_parse.
#[unsafe(no_mangle)]
pub extern "C" fn spectrum_alloc(n: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; n].into_boxed_slice()) as *mut u8
}

/// Frees the n bytes at ptr that spectrum_parse gave the host.
///
/// # Safety
/// ptr and n are an address and length spectrum_parse returned, freed once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn spectrum_free(ptr: *mut u8, n: usize) {
    drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, n)) });
}

/// Parses the n bytes of UTF-8 at ptr, from spectrum_alloc and freed here, as a Typst file. Returns where the JSON is,
/// as its address << 32 | its length, for the host to read and then free with spectrum_free.
///
/// # Safety
/// ptr and n are an address and length spectrum_alloc returned.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn spectrum_parse(ptr: *mut u8, n: usize) -> u64 {
    let bytes = unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, n)) };
    let root = typst_syntax::parse(&String::from_utf8_lossy(&bytes));
    let mut out = String::with_capacity(n * 16);
    write_node(&root, &mut 0, &mut out);
    let json = Box::into_raw(out.into_bytes().into_boxed_slice());
    ((json as *mut u8 as u64) << 32) | json.len() as u64
}

/// One node and its children; at is where the node starts in UTF-16 code units, and where it ends afterwards.
fn write_node(node: &SyntaxNode, at: &mut usize, out: &mut String) {
    let _ = write!(out, "{{\"kind\":\"{:?}\",\"start\":{}", node.kind(), at);
    if node.kind() == SyntaxKind::Error {
        if let Some(error) = node.errors_and_warnings().0.first() {
            out.push_str(",\"message\":");
            write_string(&error.message, out);
        }
    }
    let mut children = node.children().peekable();
    if children.peek().is_some() {
        out.push_str(",\"children\":[");
        for (i, child) in children.enumerate() {
            if i > 0 {
                out.push(',');
            }
            write_node(child, at, out);
        }
        out.push(']');
    } else {
        *at += node.leaf_text().encode_utf16().count();
    }
    let _ = write!(out, ",\"end\":{}}}", at);
}

/// A JSON string.
fn write_string(text: &str, out: &mut String) {
    out.push('"');
    for ch in text.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}
