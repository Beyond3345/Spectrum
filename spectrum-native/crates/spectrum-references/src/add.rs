//! Adding to the project's `.bib`: which file and how it's written, each pasted reference looked up and
//! checked for a duplicate, drafts for the References card, and entries appended under one lock so two adds
//! never reuse a key (2.8's `resolveItems`, `appendEntries`, `commitReference`).

use std::collections::HashSet;
use std::path::Path;
use std::sync::LazyLock;
use std::time::Duration;

use futures::StreamExt;
use regex::Regex;
use serde::Serialize;
use spectrum_core::project::read_meta;
use tokio::sync::Mutex;

use crate::ai::{DATA_RULE, Model, extract_json, untrusted};
use crate::bibtex::{BibEntry, parse_bib_entries};
use crate::csl::{Record, base_key, identity_of, record_to_draft, summary_of, unique_key};
use crate::dedupe::{
    Identity, bib_identity, build_bib_index, find_duplicate, front_matter_bibliography,
    pick_bib_target, tex_includes_bib,
};
use crate::detect::{
    Item, ItemKind, classify_line, detect_input, parse_ris, ris_label, split_lines,
};
use crate::entry::{
    Draft, Style, draft_problems, format_entry, four_digits, suggest_key, valid_key,
};
use crate::error::RefError;
use crate::project::{append_entry, inline_inputs, project_files, read_bibs, safe_join};
use crate::resolve::{Candidate, Found, FoundRecord, Resolver};
use crate::text::{latex_to_text, re, squash, without_comments};

const MAX_ITEMS: usize = 30;

// ponytail: one lock around every add (lookups included) so two can't double-add or reuse a key; per-project
// locks if that ever matters
static BIB_LOCK: Mutex<()> = Mutex::const_new(());

/// Where an add goes and how the project's `.bib` is written.
#[derive(Debug, Clone)]
pub struct BibContext {
    pub target: String,
    /// Whether a document loads the target (else the card says to add `\bibliography`).
    pub included: bool,
    /// Biber's types and fields (biblatex, Typst, pandoc), and whether the style ignores `url`.
    pub style: Style,
    pub index: Vec<Identity>,
    /// Every key the project uses, lower case.
    pub taken: HashSet<String>,
}

static BIBLATEX: LazyLock<Regex> = LazyLock::new(|| re(r"\\addbibresource\b|\{biblatex\}"));
static LEGACY_STYLE: LazyLock<Regex> = LazyLock::new(|| {
    re(r"\\bibliographystyle\s*\{(?:plain|abbrv|alpha|unsrt|acm|apalike|ieeetr)\}")
});

fn ends(f: &str, exts: &[&str]) -> bool {
    let lower = f.to_lowercase();
    exts.iter().any(|e| lower.ends_with(e))
}

/// The target `.bib` (`bib_file` when given), whether the documents use biblatex or a classic style, and every
/// `.bib`'s entries. Blocking.
pub fn bib_context(root: &Path, bib_file: &str) -> Result<BibContext, RefError> {
    let files = project_files(root)?;
    let main = read_meta(root)
        .ok()
        .flatten()
        .and_then(|m| m.main_file)
        .filter(|m| !m.is_empty());
    // the main document and what it brings in, so a .bib only another document loads isn't taken
    let inlined = main
        .as_deref()
        .map(|m| inline_inputs(root, m, false).0)
        .filter(|t| !t.is_empty());
    let sources: Vec<String> = match &inlined {
        Some(text) => vec![text.clone()],
        None => files
            .iter()
            .filter(|f| ends(f, &[".tex", ".typ", ".md", ".markdown"]))
            .filter_map(|f| std::fs::read_to_string(safe_join(root, f)?).ok())
            .collect(),
    };
    let typst = main.as_deref().map_or_else(
        || files.iter().any(|f| ends(f, &[".typ"])) && !files.iter().any(|f| ends(f, &[".tex"])),
        |m| ends(m, &[".typ"]),
    );
    let target = pick_bib_target(&files, bib_file, &sources, typst)
        .map_err(|e| RefError::Invalid(e.to_string()))?;
    let loading: Vec<String> = sources
        .iter()
        .filter(|s| tex_includes_bib(std::slice::from_ref(*s), &target))
        .cloned()
        .collect();
    let bibliography_sources = without_comments(&loading.join("\n"));
    let checked = if bibliography_sources.is_empty() {
        without_comments(&sources.join("\n"))
    } else {
        bibliography_sources.clone()
    };
    let biblatex = BIBLATEX.is_match(&checked);
    let latex = main.as_deref().map_or_else(
        || files.iter().any(|f| ends(f, &[".tex"])),
        |m| ends(m, &[".tex"]),
    );
    let legacy_urls =
        LEGACY_STYLE.is_match(&bibliography_sources) && !BIBLATEX.is_match(&bibliography_sources);
    let markdown_main = main
        .as_deref()
        .is_some_and(|m| ends(m, &[".md", ".markdown"]));
    // a Markdown main file whose front matter names no bibliography is given every .bib by pandoc
    let included = tex_includes_bib(&sources, &target)
        || (markdown_main
            && !sources
                .iter()
                .any(|s| front_matter_bibliography(s).is_some_and(|b| !b.is_empty())));
    let index = build_bib_index(&read_bibs(root, &files));
    let taken = index.iter().map(|e| e.key.to_lowercase()).collect();
    Ok(BibContext {
        target,
        included,
        style: Style {
            biblatex: biblatex || !latex,
            legacy_urls,
        },
        index,
        taken,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Added,
    Duplicate,
    Draft,
    Choose,
    NotFound,
    Error,
}

/// What became of one pasted reference.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemResult {
    pub input: String,
    pub status: Status,
    pub key: String,
    pub bibtex: String,
    pub bib_file: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: String,
    pub doi: String,
    pub message: String,
    pub candidates: Vec<Candidate>,
    #[serde(skip)]
    pub draft: Option<Draft>,
    /// Where it was read ("doi.org", "the BibTeX you pasted").
    pub source: String,
    /// False for a formatted citation no source confirmed.
    pub verified: bool,
    pub work: String,
}

impl ItemResult {
    fn new(input: &str, status: Status, message: &str) -> Self {
        Self {
            input: input.into(),
            status,
            key: String::new(),
            bibtex: String::new(),
            bib_file: String::new(),
            title: String::new(),
            authors: Vec::new(),
            year: String::new(),
            doi: String::new(),
            message: message.into(),
            candidates: Vec::new(),
            draft: None,
            source: String::new(),
            verified: true,
            work: String::new(),
        }
    }

    fn summarise(mut self, title: String, authors: Vec<String>, year: String, doi: String) -> Self {
        (self.title, self.authors, self.year, self.doi) = (title, authors, year, doi);
        self
    }
}

/// An add's results, the `.bib` they went to and how it's written.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolved {
    pub results: Vec<ItemResult>,
    pub bib_file: String,
    pub bib_included: bool,
    #[serde(skip)]
    pub style: Style,
    /// The project's keys (for a preview's card), lower case.
    pub keys: Vec<String>,
}

impl Resolved {
    /// The keys of the entries written, for the project's Zotero collection to follow ([`crate::Zotero::sync_collection`]).
    pub fn added(&self) -> Vec<String> {
        self.results
            .iter()
            .filter(|r| r.status == Status::Added)
            .map(|r| r.key.clone())
            .collect()
    }
}

fn duplicate_result(input: &str, existing: &Identity, rec: Option<&Record>) -> ItemResult {
    let r = ItemResult {
        key: existing.key.clone(),
        bib_file: existing.file.clone(),
        ..ItemResult::new(
            input,
            Status::Duplicate,
            &format!("Already in {} as {}.", existing.file, existing.key),
        )
    };
    match rec {
        Some(rec) => {
            let s = summary_of(rec);
            r.summarise(s.title, s.authors, s.year, s.doi)
        }
        None => r.summarise(
            existing.display_title.clone(),
            Vec::new(),
            existing.year.clone(),
            existing.doi.clone(),
        ),
    }
}

// a pasted entry's type as the card has it: classic BibTeX's own and Biber's aliases
fn entry_draft(entry: &BibEntry, key: &str) -> Draft {
    let (kind, sub) = match entry.kind.as_str() {
        "phdthesis" => ("thesis", Some("phdthesis")),
        "mastersthesis" => ("thesis", Some("mastersthesis")),
        "techreport" => ("report", None),
        "conference" => ("inproceedings", None),
        "electronic" | "www" => ("online", None),
        other => (other, None),
    };
    let mut fields = entry.fields.clone();
    if let (Some(sub), false) = (sub, entry.has("type")) {
        fields.push(("type".into(), sub.into()));
    }
    Draft {
        kind: kind.into(),
        key: key.into(),
        fields,
    }
}

static AND: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\s+and\s+"));

fn entry_summary(entry: &BibEntry) -> (String, Vec<String>, String, String) {
    let text = |v: &str| squash(&latex_to_text(v));
    (
        text(entry.get("title")),
        AND.split(entry.get("author"))
            .map(text)
            .filter(|a| !a.is_empty())
            .collect(),
        four_digits(if entry.get("year").is_empty() {
            entry.get("date")
        } else {
            entry.get("year")
        })
        .unwrap_or_default(),
        entry.get("doi").to_owned(),
    )
}

#[allow(clippy::large_enum_variant)]
enum Outcome {
    Result(ItemResult),
    Record(FoundRecord),
    Entry(BibEntry),
}

#[allow(clippy::match_same_arms)]
async fn lookup(resolver: &Resolver, item: &Item, index: &[Identity]) -> Outcome {
    if let (ItemKind::Bibtex, Some(entry)) = (item.kind, &item.entry) {
        return Outcome::Entry(entry.clone());
    }
    let id = Identity {
        doi: item.doi().to_owned(),
        arxiv: item.arxiv_id().to_owned(),
        isbn: item.isbn().to_owned(),
        ..Identity::default()
    };
    if let Some(known) = find_duplicate(index, &id) {
        return Outcome::Result(duplicate_result(&item.input, known, None));
    }
    match resolver.find(item).await {
        Ok(Found::Record(f)) => Outcome::Record(f),
        Ok(Found::Choose(candidates)) => Outcome::Result(ItemResult {
            candidates,
            ..ItemResult::new(
                &item.input,
                Status::Choose,
                "Several works match. Choose the right one.",
            )
        }),
        Ok(Found::NotFound(m)) => {
            Outcome::Result(ItemResult::new(&item.input, Status::NotFound, &m))
        }
        // a citation whose id couldn't be looked up is kept as it reads
        Err(_) if item.parsed.is_some() => Outcome::Record(FoundRecord {
            record: item.parsed.clone().unwrap_or_default(),
            source: "the citation as pasted".into(),
            verified: false,
            work: String::new(),
        }),
        Err(RefError::NotFound(m)) => {
            Outcome::Result(ItemResult::new(&item.input, Status::NotFound, &m))
        }
        Err(e) => Outcome::Result(ItemResult::new(&item.input, Status::Error, &e.to_string())),
    }
}

/// Looks each item up and appends the new ones to the target `.bib`, duplicates caught. `preview` writes
/// nothing: each new one comes back as a draft for the References card. `style` overrides how the project
/// writes its `.bib` (the card's BibLaTeX | BibTeX toggle).
pub async fn resolve_items(
    resolver: &Resolver,
    root: &Path,
    items: &[Item],
    bib_file: &str,
    preview: bool,
    style: Option<Style>,
) -> Result<Resolved, RefError> {
    // a preview writes nothing, so it waits for no add
    let _held = if preview {
        None
    } else {
        Some(BIB_LOCK.lock().await)
    };
    let mut ctx = bib_context(root, bib_file)?;
    let style = style.unwrap_or(ctx.style);
    let index = ctx.index.clone();
    let outcomes: Vec<Outcome> =
        futures::stream::iter(items.iter().map(|item| lookup(resolver, item, &index)))
            .buffered(4)
            .collect()
            .await;
    let mut drafted = ctx.taken.clone();
    let mut results = Vec::new();
    for (item, outcome) in items.iter().zip(outcomes) {
        let input = item.input.as_str();
        let (id, found, entry) = match outcome {
            Outcome::Result(r) => {
                results.push(r);
                continue;
            }
            Outcome::Record(f) => (identity_of(&f.record), Some(f), None),
            Outcome::Entry(e) => (bib_identity(&e, &ctx.target), None, Some(e)),
        };
        if let Some(existing) = find_duplicate(&ctx.index, &id) {
            results.push(duplicate_result(
                input,
                existing,
                found.as_ref().map(|f| &f.record),
            ));
            continue;
        }
        let base = match (&entry, &found) {
            (Some(e), _) if valid_key(&e.key) => e.key.clone(),
            (Some(e), _) => suggest_key(&e.fields),
            (None, Some(f)) => base_key(&f.record),
            (None, None) => "Ref".into(),
        };
        let key = unique_key(&base, &drafted);
        let (draft, summary, source) = match (&entry, &found) {
            (Some(e), _) => (
                entry_draft(e, &key),
                entry_summary(e),
                "the BibTeX you pasted".to_owned(),
            ),
            (None, Some(f)) => {
                let s = summary_of(&f.record);
                (
                    record_to_draft(&f.record, &key),
                    (s.title, s.authors, s.year, s.doi),
                    f.source.clone(),
                )
            }
            (None, None) => continue,
        };
        drafted.insert(key.to_lowercase());
        ctx.index.push(Identity {
            key: key.clone(),
            file: ctx.target.clone(),
            display_title: summary.0.clone(),
            ..id
        });
        let mut r = ItemResult {
            key: key.clone(),
            source,
            ..ItemResult::new(input, Status::Draft, "")
        }
        .summarise(summary.0, summary.1, summary.2, summary.3);
        if let Some(f) = &found {
            r.verified = f.verified;
            r.work.clone_from(&f.work);
        }
        if preview {
            r.draft = Some(draft);
            results.push(r);
            continue;
        }
        let bibtex = format_entry(&draft, style);
        let path = safe_join(root, &ctx.target)
            .ok_or_else(|| RefError::Invalid("That bibliography file isn’t valid.".into()))?;
        match append_entry(&path, &bibtex) {
            Ok(()) => {
                ctx.taken.insert(key.to_lowercase());
                results.push(ItemResult {
                    status: Status::Added,
                    bibtex,
                    bib_file: ctx.target.clone(),
                    ..r
                });
            }
            Err(e) => results.push(ItemResult::new(
                input,
                Status::Error,
                &format!("Couldn’t write to {}: {e}", ctx.target),
            )),
        }
    }
    let mut keys: Vec<String> = ctx.taken.into_iter().collect();
    keys.sort();
    Ok(Resolved {
        results,
        bib_file: ctx.target,
        bib_included: ctx.included,
        style,
        keys,
    })
}

/// A ready-made entry to append (Zotero's, or a checked draft), under the key it should go in as.
#[derive(Debug, Clone)]
pub struct ReadyEntry {
    pub input: String,
    pub bibtex: String,
    pub key: String,
    /// Why there's no entry, when there isn't one.
    pub error: String,
}

static HEAD_KEY: LazyLock<Regex> = LazyLock::new(|| re(r#"^(@[A-Za-z]+\s*[{(]\s*)[^,\s{}()"=]+"#));

/// Ready-made entries appended under the same lock and duplicate checks: each under its key, unless the `.bib`
/// has that key for another work, when the first free one after it is used.
pub async fn append_entries(
    root: &Path,
    bib_file: &str,
    entries: Vec<ReadyEntry>,
) -> Result<Resolved, RefError> {
    let _held = BIB_LOCK.lock().await;
    let mut ctx = bib_context(root, bib_file)?;
    let mut results = Vec::new();
    for ready in entries {
        let parsed = if ready.error.is_empty() {
            parse_bib_entries(&ready.bibtex).into_iter().next()
        } else {
            None
        };
        let Some(entry) = parsed else {
            let message = if ready.error.is_empty() {
                "That entry couldn’t be read."
            } else {
                ready.error.as_str()
            };
            results.push(ItemResult::new(&ready.input, Status::Error, message));
            continue;
        };
        let id = bib_identity(&entry, &ctx.target);
        if let Some(existing) = find_duplicate(&ctx.index, &id) {
            results.push(duplicate_result(&ready.input, existing, None));
            continue;
        }
        let wanted = [ready.key.as_str(), entry.key.as_str()]
            .into_iter()
            .find(|k| valid_key(k))
            .unwrap_or("Ref");
        let key = unique_key(wanted, &ctx.taken);
        let text = HEAD_KEY
            .replace(ready.bibtex.trim(), |c: &regex::Captures| {
                format!("{}{key}", &c[1])
            })
            .into_owned();
        let path = safe_join(root, &ctx.target)
            .ok_or_else(|| RefError::Invalid("That bibliography file isn’t valid.".into()))?;
        if let Err(e) = append_entry(&path, &text) {
            results.push(ItemResult::new(
                &ready.input,
                Status::Error,
                &format!("Couldn’t write to {}: {e}", ctx.target),
            ));
            continue;
        }
        ctx.taken.insert(key.to_lowercase());
        ctx.index.push(Identity {
            key: key.clone(),
            ..id.clone()
        });
        results.push(
            ItemResult {
                key,
                bibtex: text,
                bib_file: ctx.target.clone(),
                ..ItemResult::new(&ready.input, Status::Added, "")
            }
            .summarise(id.display_title, Vec::new(), id.year, id.doi),
        );
    }
    let mut keys: Vec<String> = ctx.taken.into_iter().collect();
    keys.sort();
    Ok(Resolved {
        results,
        bib_file: ctx.target,
        bib_included: ctx.included,
        style: ctx.style,
        keys,
    })
}

static BIBTEX_PASTE: LazyLock<Regex> = LazyLock::new(|| re(r"(?m)^\s*@[A-Za-z]+\s*[{(]"));
static RIS_PASTE: LazyLock<Regex> = LazyLock::new(|| re(r"(?m)^TY  - "));

const SPLIT_PROMPT: &str = "Split the text into separate bibliographic references. For each reference give its DOI if one appears, else its arXiv id, else a URL, else a short search query (the title, plus the first author surname if known). Return JSON only: {\"items\":[{\"doi\":\"\",\"arxiv\":\"\",\"url\":\"\",\"query\":\"\"}]} ";

async fn split_with_model(text: &str, model: &Model) -> Option<Vec<Item>> {
    let pasted: String = text.chars().take(20_000).collect();
    let answer = model
        .ask(
            &format!("{SPLIT_PROMPT}{DATA_RULE}"),
            &untrusted("pasted references", &pasted),
            true,
            Duration::from_secs(30),
        )
        .await
        .ok()?;
    let items = extract_json(&answer)?.get("items")?.as_array()?.clone();
    Some(
        items
            .iter()
            .filter_map(|it| {
                ["doi", "arxiv", "url", "query"]
                    .iter()
                    .find_map(|k| {
                        it.get(*k)
                            .and_then(|v| v.as_str())
                            .map(str::trim)
                            .filter(|v| !v.is_empty())
                    })
                    .map(detect_input)
            })
            .collect(),
    )
}

/// What was pasted, as items: BibTeX and RIS whole, entry by entry; otherwise one a line (or one an id), with
/// the model asked to split free text when one is set up.
pub async fn split_input(text: &str, model: Option<&Model>) -> Vec<Item> {
    if BIBTEX_PASTE.is_match(text) {
        let entries = parse_bib_entries(text);
        if !entries.is_empty() {
            return entries
                .into_iter()
                .map(|e| Item {
                    entry: Some(e.clone()),
                    ..Item::new(
                        ItemKind::Bibtex,
                        &format!("@{}{{{}, …}}", e.kind, e.key),
                        &e.key,
                    )
                })
                .collect();
        }
    }
    if RIS_PASTE.is_match(text) {
        let records = parse_ris(text);
        if !records.is_empty() {
            return records
                .into_iter()
                .map(|r| Item {
                    record: Some(r.clone()),
                    ..Item::new(ItemKind::Ris, &ris_label(&r), "")
                })
                .collect();
        }
    }
    let items = split_lines(text);
    // only free text needs splitting; a lone short title or a list of ids does not
    let free = items.iter().any(|i| i.kind == ItemKind::Query);
    if let Some(model) =
        model.filter(|m| free && (items.len() > 1 || text.chars().count() > 200) && m.configured())
        && let Some(split) = split_with_model(text, model)
            .await
            .filter(|s| !s.is_empty())
    {
        return split;
    }
    items
}

/// The References card's paste: split, looked up, and added (or drafted with `preview`).
pub async fn resolve_references(
    resolver: &Resolver,
    root: &Path,
    input: &str,
    bib_file: &str,
    model: Option<&Model>,
    preview: bool,
) -> Result<Resolved, RefError> {
    let items = split_input(input, model).await;
    if items.is_empty() {
        return Err(RefError::Invalid(
            "Paste a DOI, link, arXiv ID or title.".into(),
        ));
    }
    let mut out = resolve_items(
        resolver,
        root,
        &items[..items.len().min(MAX_ITEMS)],
        bib_file,
        preview,
        None,
    )
    .await?;
    if items.len() > MAX_ITEMS {
        out.results.push(ItemResult::new(
            "…",
            Status::Error,
            &format!(
                "Only the first {MAX_ITEMS} references were processed. Paste the rest separately."
            ),
        ));
    }
    Ok(out)
}

/// A candidate from a 'choose' result (a DOI, arXiv id, link or "ISBN …"), looked up and added or drafted.
pub async fn add_reference(
    resolver: &Resolver,
    root: &Path,
    candidate_id: &str,
    bib_file: &str,
    preview: bool,
) -> Result<Resolved, RefError> {
    let item = classify_line(candidate_id);
    if matches!(item.kind, ItemKind::Query | ItemKind::Citation) {
        return Err(RefError::Invalid(
            "That isn’t a DOI, arXiv ID, ISBN or link.".into(),
        ));
    }
    resolve_items(resolver, root, &[item], bib_file, preview, None).await
}

/// A blank draft for the card's New entry, with how the project's `.bib` is written and its keys.
pub fn new_entry(root: &Path, bib_file: &str) -> Result<Resolved, RefError> {
    let ctx = bib_context(root, bib_file)?;
    let draft = Draft {
        kind: "article".into(),
        ..Draft::default()
    };
    let result = ItemResult {
        draft: Some(draft),
        source: "manual".into(),
        ..ItemResult::new("New entry", Status::Draft, "")
    };
    let mut keys: Vec<String> = ctx.taken.into_iter().collect();
    keys.sort();
    Ok(Resolved {
        results: vec![result],
        bib_file: ctx.target,
        bib_included: ctx.included,
        style: ctx.style,
        keys,
    })
}

/// A draft the user checked, written as the project writes entries (or as `style` says): refused when it can't
/// be written, reported when the `.bib` has the work already, put under the next free key when another work
/// took its key since.
pub async fn commit_reference(
    root: &Path,
    draft: &Draft,
    bib_file: &str,
    input: &str,
    style: Option<Style>,
) -> Result<Resolved, RefError> {
    let problems = draft_problems(draft, &HashSet::<String>::new());
    if let Some(first) = problems.first() {
        return Err(RefError::Invalid(first));
    }
    let key = if draft.key.is_empty() {
        suggest_key(&draft.fields)
    } else {
        draft.key.clone()
    };
    let style = match style {
        Some(s) => s,
        None => bib_context(root, bib_file)?.style,
    };
    let bibtex = format_entry(
        &Draft {
            key: key.clone(),
            ..draft.clone()
        },
        style,
    );
    let input = if input.is_empty() {
        key.clone()
    } else {
        input.to_owned()
    };
    append_entries(
        root,
        bib_file,
        vec![ReadyEntry {
            input,
            bibtex,
            key,
            error: String::new(),
        }],
    )
    .await
}
