//! What each server is told at the start, as 2.8 told it (`apps/backend/src/services/texlabService.js`,
//! `tinymistService.js`).

use std::path::PathBuf;

use lsp_types::Uri;
use serde_json::{Value, json};

use crate::ServerKind;

/// TexLab's settings. `aux_directory` is the folder the main document's last good compile kept its .aux
/// and .log files in (section numbers for the outline; a stray .log in the project never shows as errors).
pub fn texlab_settings(aux_directory: Option<&Uri>) -> Value {
    let mut build = json!({ "onSave": false, "forwardSearchAfter": false });
    if let Some(dir) = aux_directory {
        build["auxDirectory"] = json!(dir.as_str());
        build["logDirectory"] = json!(dir.as_str());
    }
    json!({
        "build": build,
        "chktex": { "onOpenAndSave": false, "onEdit": false },
        "diagnosticsDelay": 500,
        "latexFormatter": "none",
        "bibtexFormatter": "none",
        // code in these isn't LaTeX, so a lone brace there is no error
        "experimental": {
            "verbatimEnvironments": [
                "Verbatim", "Verbatim*", "BVerbatim", "LVerbatim", "SaveVerbatim", "VerbatimOut",
                "comment", "filecontents", "filecontents*", "tcblisting"
            ]
        }
    })
}

/// Tinymist's settings: Spectrum keeps its own PDF, and the project's `fonts/` folder and the bundled CJK
/// fonts are read as the compiles read them (the caller passes the folders that exist).
pub fn tinymist_settings(font_paths: &[PathBuf]) -> Value {
    json!({
        "formatterMode": "typstyle",
        "exportPdf": "never",
        "compileStatus": "enable",
        "semanticTokens": "disable",
        "lint": { "enabled": true, "when": "onType" },
        "systemFonts": true,
        "fontPaths": font_paths,
    })
}

/// The client capabilities each server is offered. Hovers from TexLab are plain text, as a citation's
/// hover quotes the .bib, which could hold HTML.
pub(crate) fn capabilities(kind: ServerKind) -> Value {
    let hover = match kind {
        ServerKind::TexLab => json!(["plaintext"]),
        ServerKind::Tinymist => json!(["markdown", "plaintext"]),
    };
    json!({
        "workspace": { "workspaceFolders": true, "configuration": true, "symbol": {} },
        "window": { "showDocument": { "support": false } },
        "textDocument": {
            "synchronization": { "didSave": true },
            "completion": { "completionItem": { "snippetSupport": true } },
            "hover": { "contentFormat": hover },
            "signatureHelp": {},
            "definition": {},
            "references": {},
            "rename": { "prepareSupport": true },
            "documentSymbol": { "hierarchicalDocumentSymbolSupport": true },
            "documentLink": {},
            "publishDiagnostics": { "versionSupport": true }
        },
        "general": { "positionEncodings": ["utf-16"] }
    })
}

pub(crate) fn initialization_options(kind: ServerKind, settings: &Value) -> Value {
    match kind {
        // TeX's own files go unknown (only hovers into them are lost); it never runs kpsewhich
        ServerKind::TexLab => json!({ "skipDistro": true }),
        ServerKind::Tinymist => settings.clone(),
    }
}
