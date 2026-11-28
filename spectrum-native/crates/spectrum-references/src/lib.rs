//! BibTeX, DOI and arXiv resolution, research search, Zotero and preflight review.
//!
//! No UI: sessions 7b and 7c build the Research tab, the References card, Zotero's settings and Tools › Review
//! on this. Network calls are async (Tokio, reqwest); file reads and writes are blocking and belong on a
//! background thread.

#![cfg_attr(test, allow(clippy::assert_is_empty, clippy::too_many_lines))]

mod add;
mod ai;
mod arxiv;
mod bibtex;
mod books;
mod csl;
mod dedupe;
mod detect;
mod entry;
mod error;
mod formatted;
mod html;
mod http;
mod project;
pub mod research;
mod resolve;
pub mod review;
mod search;
mod text;
mod xml;
mod zotero;

pub use add::{
    BibContext, ItemResult, ReadyEntry, Resolved, Status, add_reference, append_entries,
    bib_context, commit_reference, new_entry, resolve_items, resolve_references, split_input,
};
pub use ai::Model;
pub use arxiv::{Paper, arxiv_record_from_atom, search_arxiv};
pub use bibtex::{
    BibEntry, Bibliography, Entry, Field, Item, Piece, line_of, parse_bib_entries, parsed_whole,
};
pub use csl::{
    ArxivRef, Name, Record, Summary, base_key, bib_name, display_name, issued_from_date,
    normalise_author, parse_name, record_to_draft, summary_of, to_bibtex, unique_key, year_of,
};
pub use dedupe::{
    BadBibFile, BibFile, BibRecord, DuplicateOf, Identity, bib_identity, bib_records,
    build_bib_index, find_duplicate, pick_bib_target, tex_includes_bib,
};
pub use detect::{
    Item as Lookup, ItemKind, classify_line, clean_doi, detect_input, isbn_of, parse_ris,
    split_lines, strip_version,
};
pub use entry::{
    Draft, DraftProblems, ENTRY_TYPES, Edition, FIELD_HINTS, FIELD_LABELS, Style, apply_edition,
    braces_balanced, draft_problems, edition_label, fields_shown, format_entry, suggest_key,
    tex_value, valid_key,
};
pub use error::RefError;
pub use formatted::{edition_of, parse_formatted, split_authors};
pub use html::{HtmlCitation, parse_html_meta, read_html_citation, title_fits_page};
pub use http::{Endpoints, Http};
pub use resolve::{Candidate, Found, FoundRecord, Resolver, title_match};
pub use search::{Connection, SearchConfig, WebHit, reference_records, web_search};
pub use text::{
    clean_text, decode_entities, escape_tex_text, fold_ascii, latex_to_text, normalise_title,
    plain_tex, tex_escape,
};
pub use zotero::{
    LibraryItem, SyncCounts, SyncOptions, SyncOutcome, Zotero, ZoteroRef, ZoteroStatus,
    clean_entry, item_from_entry, item_identity, same_ref,
};
