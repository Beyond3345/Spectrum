//! Research sessions: a search run against every chosen source at once (one failing never stops the others),
//! merged into `.spectrum/research/<id>.json`, the optional AI sorting, field-by-field changes, and kept papers
//! added to the `.bib` through the references resolver or from Zotero.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::{Value, json};
use tokio::sync::Mutex;

use super::sources::{SearchContext, source};
use super::{ResearchResult, ResearchRun, ResearchSession, SourceRun, mark_in_bib, merge_results};
use crate::add::{Resolved, Status, resolve_items};
use crate::ai::{DATA_RULE, Model, extract_json, untrusted};
use crate::dedupe::build_bib_index;
use crate::detect::detect_input;
use crate::error::RefError;
use crate::project::{project_files, read_bibs};
use crate::resolve::{Resolver, iso_now};
use crate::search::SearchConfig;
use crate::zotero::Zotero;

/// This computer's keys for the sources (never stored in a session). Empty when not set.
#[derive(Debug, Clone, Default)]
pub struct ResearchKeys {
    pub openalex_key: String,
    /// OpenAlex's polite pool.
    pub openalex_email: String,
    pub semantic_scholar_key: String,
    pub ncbi_key: String,
}

impl ResearchKeys {
    fn redact(&self, message: &str) -> String {
        let out = [
            &self.openalex_key,
            &self.openalex_email,
            &self.semantic_scholar_key,
            &self.ncbi_key,
        ]
        .iter()
        .filter(|k| k.len() >= 6)
        .fold(message.to_owned(), |m, k| {
            m.replace(k.as_str(), "[redacted]")
        });
        out.chars().take(300).collect()
    }
}

/// A search: the question, the sources by id, and the filters.
#[derive(Debug, Clone, Default)]
pub struct ResearchQuery {
    pub question: String,
    pub sources: Vec<String>,
    pub year_from: Option<i32>,
    pub year_to: Option<i32>,
    /// False leaves preprints out.
    pub preprints: bool,
    /// One model call adds why, a keep/drop suggestion and a theme to the results that have none.
    pub triage: bool,
    /// Search again in this session; `None` starts a new one.
    pub session_id: Option<String>,
}

/// What a search may use.
#[derive(Clone, Copy)]
pub struct Services<'a> {
    pub resolver: &'a Resolver,
    pub search: Option<&'a SearchConfig>,
    pub zotero: Option<&'a Zotero>,
    pub model: Option<&'a Model>,
}

// ponytail: one lock for every session's read-merge-write (searches run outside it); per file if it bites
static LOCK: Mutex<()> = Mutex::const_new(());

fn valid_id(id: &str) -> bool {
    (1..=64).contains(&id.len())
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn session_file(root: &Path, id: &str) -> Result<PathBuf, RefError> {
    if !valid_id(id) {
        return Err(RefError::Invalid("Invalid id.".into()));
    }
    Ok(root
        .join(".spectrum")
        .join("research")
        .join(format!("{id}.json")))
}

fn read_session(root: &Path, id: &str) -> Result<ResearchSession, RefError> {
    let file = session_file(root, id)?;
    let text = std::fs::read_to_string(&file)
        .map_err(|_| RefError::NotFound("That research session wasn’t found.".into()))?;
    serde_json::from_str(&text)
        .map_err(|_| RefError::NotFound("That research session wasn’t found.".into()))
}

fn write_session(root: &Path, session: &ResearchSession) -> Result<(), RefError> {
    let file = session_file(root, &session.id)?;
    let dir = file.parent().unwrap_or(root);
    std::fs::create_dir_all(dir).map_err(|e| RefError::io("create", dir, e))?;
    let text =
        serde_json::to_string_pretty(session).map_err(|e| RefError::Invalid(e.to_string()))?;
    let tmp = dir.join(format!(".{}.{}.tmp", session.id, uuid::Uuid::new_v4()));
    std::fs::write(&tmp, text)
        .and_then(|()| std::fs::rename(&tmp, &file))
        .map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            RefError::io("save", &file, e)
        })
}

fn bib_index(root: &Path) -> Result<Vec<crate::dedupe::Identity>, RefError> {
    Ok(build_bib_index(&read_bibs(root, &project_files(root)?)))
}

/// A session with its results marked against the `.bib` as it is now.
pub fn get_session(root: &Path, id: &str) -> Result<ResearchSession, RefError> {
    let mut s = read_session(root, id)?;
    mark_in_bib(&mut s.results, &bib_index(root)?);
    Ok(s)
}

/// A session as the list shows it.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub question: String,
    pub sources: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub count: usize,
    pub kept: usize,
}

/// Newest first; a sync app's conflict copy of one (not named by its id) isn't listed.
pub fn list_sessions(root: &Path) -> Vec<SessionSummary> {
    let dir = root.join(".spectrum").join("research");
    let mut out: Vec<SessionSummary> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let s: ResearchSession =
                serde_json::from_str(&std::fs::read_to_string(entry.path()).ok()?).ok()?;
            (name == format!("{}.json", s.id) && !s.id.is_empty()).then(|| SessionSummary {
                count: s.results.len(),
                kept: s.results.iter().filter(|r| r.decision == "keep").count(),
                id: s.id,
                question: s.question,
                sources: s.sources,
                created_at: s.created_at,
                updated_at: s.updated_at,
            })
        })
        .collect();
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    out
}

pub fn delete_session(root: &Path, id: &str) -> Result<(), RefError> {
    match std::fs::remove_file(session_file(root, id)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(RefError::io("delete", root, e)),
        _ => Ok(()),
    }
}

/// A change to a session, merged field by field: the question, and per result (by id) its decision, reason,
/// why, suggestion and theme; `None` inside a field takes it out. Results it names that are gone are left.
#[derive(Debug, Clone, Default)]
pub struct SessionChange {
    pub question: Option<String>,
    pub results: Vec<(String, BTreeMap<String, Option<String>>)>,
}

pub async fn update_session(
    root: &Path,
    id: &str,
    change: &SessionChange,
) -> Result<ResearchSession, RefError> {
    if let Some(q) = &change.question
        && (q.trim().is_empty() || q.chars().count() > 500)
    {
        return Err(RefError::Invalid(
            "A question is 1 to 500 characters.".into(),
        ));
    }
    let limits = [
        ("decision", 0),
        ("suggest", 0),
        ("reason", 2000),
        ("why", 500),
        ("theme", 100),
    ];
    for (_, fields) in &change.results {
        for (k, v) in fields {
            let Some((_, max)) = limits.iter().find(|(n, _)| n == k) else {
                return Err(RefError::Invalid(format!(
                    "A result’s {k} can’t be set to that."
                )));
            };
            let ok = v.as_ref().is_none_or(|v| {
                if *max == 0 {
                    v == "keep" || v == "drop"
                } else {
                    v.chars().count() <= *max
                }
            });
            if !ok {
                return Err(RefError::Invalid(format!(
                    "A result’s {k} can’t be set to that."
                )));
            }
        }
    }
    {
        let _held = LOCK.lock().await;
        let mut s = read_session(root, id)?;
        if let Some(q) = &change.question {
            q.trim().clone_into(&mut s.question);
        }
        for (rid, fields) in &change.results {
            let Some(r) = s.results.iter_mut().find(|r| r.id == *rid) else {
                continue;
            };
            for (k, v) in fields {
                let slot = match k.as_str() {
                    "decision" => &mut r.decision,
                    "suggest" => &mut r.suggest,
                    "reason" => &mut r.reason,
                    "why" => &mut r.why,
                    _ => &mut r.theme,
                };
                *slot = v.clone().unwrap_or_default();
            }
        }
        s.updated_at = iso_now();
        write_session(root, &s)?;
    }
    get_session(root, id)
}

const TRIAGE_PROMPT: &str = "You help a researcher sort search results for their question. Judge each paper from its title, venue and abstract. For each, write one sentence on what it offers for the question, suggest keep or drop, and give it a theme of two to four words. Suggest drop for papers that are off the question; give papers that belong together the same theme, worded the same way. Return JSON only: {\"results\":[{\"index\":0,\"why\":\"…\",\"suggest\":\"keep\",\"theme\":\"…\"}]}.";

/// id → (why, suggest, theme) for up to 60 results, from one model call.
async fn triage(
    question: &str,
    results: &[ResearchResult],
    model: &Model,
) -> Result<Vec<(String, String, String, String)>, String> {
    let batch = &results[..results.len().min(60)];
    let papers: Vec<Value> = batch
        .iter()
        .enumerate()
        .map(|(index, r)| json!({ "index": index, "title": r.title, "year": r.year, "venue": r.venue, "abstract": r.abstract_text.chars().take(500).collect::<String>() }))
        .collect();
    let user = format!(
        "Question: {question}\n\n{}",
        untrusted("search results", &json!({ "papers": papers }).to_string())
    );
    let answer = model
        .ask(
            &format!("{TRIAGE_PROMPT} {DATA_RULE}"),
            &user,
            false,
            Duration::from_secs(120),
        )
        .await?;
    let rows = extract_json(&answer)
        .and_then(|v| v.get("results").and_then(Value::as_array).cloned())
        .ok_or("The model’s answer couldn’t be read.")?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            let r = batch.get(usize::try_from(row.get("index")?.as_u64()?).ok()?)?;
            let suggest = row
                .get("suggest")?
                .as_str()
                .filter(|s| *s == "keep" || *s == "drop")?;
            let text = |k: &str, max: usize| {
                row.get(k)
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .chars()
                    .take(max)
                    .collect::<String>()
            };
            Some((
                r.id.clone(),
                text("why", 500),
                suggest.to_owned(),
                text("theme", 100),
            ))
        })
        .collect())
}

fn in_years(r: &ResearchResult, q: &ResearchQuery) -> bool {
    let Ok(y) = r.year.parse::<i32>() else {
        return true;
    };
    q.year_from.is_none_or(|f| y >= f) && q.year_to.is_none_or(|t| y <= t)
}

/// Runs the question against every chosen source at once; each one's count or error goes in the run's log.
#[allow(clippy::too_many_lines)]
pub async fn search_research(
    root: &Path,
    query: &ResearchQuery,
    keys: &ResearchKeys,
    services: Services<'_>,
) -> Result<ResearchSession, RefError> {
    let q = query.question.trim().to_owned();
    if q.is_empty() {
        return Err(RefError::Invalid(
            "A question is 1 to 500 characters.".into(),
        ));
    }
    if let Some(id) = &query.session_id {
        read_session(root, id)?;
    }
    let files = project_files(root)?;
    let bibs = read_bibs(root, &files);
    let cx = SearchContext {
        resolver: services.resolver,
        keys,
        year_from: query.year_from,
        year_to: query.year_to,
        preprints: query.preprints,
        bibs: &bibs,
        search: services.search,
        zotero: services.zotero,
    };
    let searches = query.sources.iter().map(|id| {
        let cx = &cx;
        let q = q.as_str();
        async move {
            let outcome = match source(id) {
                Some(s) => s.search(q, cx).await,
                None => Err(RefError::Invalid(format!("Unknown source “{id}”."))),
            };
            (id.clone(), outcome)
        }
    });
    let mut run = ResearchRun {
        at: iso_now(),
        queries: vec![q.clone()],
        ..ResearchRun::default()
    };
    if query.year_from.is_some() || query.year_to.is_some() || !query.preprints {
        let mut f = serde_json::Map::new();
        if let Some(y) = query.year_from {
            f.insert("yearFrom".into(), json!(y));
        }
        if let Some(y) = query.year_to {
            f.insert("yearTo".into(), json!(y));
        }
        if !query.preprints {
            f.insert("preprints".into(), json!(false));
        }
        run.filters = Some(Value::Object(f));
    }
    let mut found: Vec<ResearchResult> = Vec::new();
    for (id, outcome) in futures::future::join_all(searches).await {
        match outcome {
            Ok(list) => {
                let list: Vec<ResearchResult> = list
                    .into_iter()
                    .filter(|r| {
                        !r.title.is_empty()
                            && in_years(r, query)
                            && (query.preprints || r.preprint != Some(true))
                    })
                    .collect();
                run.per_source.insert(
                    id,
                    SourceRun {
                        count: list.len(),
                        error: None,
                    },
                );
                found.extend(list);
            }
            Err(e) => {
                run.per_source.insert(
                    id,
                    SourceRun {
                        count: 0,
                        error: Some(keys.redact(&e.to_string())),
                    },
                );
            }
        }
    }
    let mut notes: Vec<(String, String, String, String)> = Vec::new();
    if query.triage {
        let before = query
            .session_id
            .as_deref()
            .map(|id| read_session(root, id))
            .transpose()?
            .map(|s| s.results)
            .unwrap_or_default();
        let unsorted: Vec<ResearchResult> = merge_results(&before, &found)
            .into_iter()
            .filter(|r| r.suggest.is_empty())
            .collect();
        let outcome = match services.model {
            _ if unsorted.is_empty() => Ok(Vec::new()),
            Some(m) => triage(&q, &unsorted, m).await,
            None => Err("Set up a model in Settings › Models to sort the results.".into()),
        };
        run.triage = Some(match outcome {
            Ok(n) => {
                notes = n;
                SourceRun {
                    count: notes.len(),
                    error: None,
                }
            }
            Err(e) => SourceRun {
                count: 0,
                error: Some(e),
            },
        });
    }
    let _held = LOCK.lock().await;
    let now = iso_now();
    let mut s = match &query.session_id {
        Some(id) => read_session(root, id)?,
        None => ResearchSession {
            id: uuid::Uuid::new_v4().to_string(),
            question: q.clone(),
            created_at: now.clone(),
            ..ResearchSession::default()
        },
    };
    s.sources.clone_from(&query.sources);
    s.updated_at = now;
    s.runs.push(run);
    s.results = merge_results(&s.results, &found)
        .into_iter()
        .map(|mut r| {
            if r.suggest.is_empty()
                && let Some((_, why, suggest, theme)) = notes.iter().find(|n| n.0 == r.id)
            {
                (r.why, r.suggest, r.theme) = (why.clone(), suggest.clone(), theme.clone());
            }
            r
        })
        .collect();
    mark_in_bib(&mut s.results, &build_bib_index(&bibs));
    write_session(root, &s)?;
    Ok(s)
}

/// One result's add.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct AddedResult {
    pub id: String,
    pub status: Status,
    pub key: String,
    pub message: String,
}

/// Adds results (by id; the kept ones not yet in the `.bib` when none are named): from Zotero under its key for
/// a result the library gave, else through the references resolver, which catches duplicates by DOI, arXiv id
/// or title across every `.bib`. Each result gets the key it is now under.
pub async fn add_results(
    root: &Path,
    id: &str,
    result_ids: Option<&[String]>,
    bib_file: &str,
    services: Services<'_>,
) -> Result<(Vec<AddedResult>, Resolved, ResearchSession), RefError> {
    let session = get_session(root, id)?;
    let chosen: Vec<ResearchResult> = match result_ids {
        Some(ids) => session
            .results
            .iter()
            .filter(|r| ids.contains(&r.id))
            .cloned()
            .collect(),
        None => session
            .results
            .iter()
            .filter(|r| r.decision == "keep" && r.in_bib.is_empty())
            .cloned()
            .collect(),
    };
    let mut outcomes: BTreeMap<String, (Status, String, String)> = BTreeMap::new();
    let in_zotero: Vec<&ResearchResult> = chosen.iter().filter(|r| !r.zotero.is_empty()).collect();
    let mut resolved = None;
    if let (false, Some(z)) = (in_zotero.is_empty(), services.zotero) {
        let keys: Vec<String> = in_zotero.iter().map(|r| r.zotero.clone()).collect();
        match z.import_refs(root, &keys, &[], bib_file).await {
            Ok(out) => {
                for (r, res) in in_zotero.iter().zip(&out.results) {
                    outcomes.insert(
                        r.id.clone(),
                        (res.status, res.key.clone(), res.message.clone()),
                    );
                }
                resolved = Some(out);
            }
            Err(e) => {
                for r in &in_zotero {
                    outcomes.insert(r.id.clone(), (Status::Error, String::new(), e.to_string()));
                }
            }
        }
    }
    let ready: Vec<&ResearchResult> = chosen
        .iter()
        .filter(|r| {
            !matches!(
                outcomes.get(&r.id),
                Some((Status::Added | Status::Duplicate, _, _))
            ) && (!r.doi.is_empty() || !r.arxiv.is_empty() || !r.url.is_empty())
        })
        .collect();
    if !ready.is_empty() {
        let items: Vec<_> = ready
            .iter()
            .map(|r| {
                detect_input(
                    [&r.doi, &r.arxiv, &r.url]
                        .into_iter()
                        .find(|v| !v.is_empty())
                        .map_or("", String::as_str),
                )
            })
            .collect();
        let out = resolve_items(services.resolver, root, &items, bib_file, false, None).await?;
        for (r, res) in ready.iter().zip(&out.results) {
            outcomes.insert(
                r.id.clone(),
                (res.status, res.key.clone(), res.message.clone()),
            );
        }
        resolved = Some(out);
    }
    let results: Vec<AddedResult> = chosen
        .iter()
        .map(|r| {
            let (status, key, message) = outcomes.get(&r.id).cloned().unwrap_or((
                Status::Error,
                String::new(),
                "This result has no DOI, arXiv ID or link to look up.".into(),
            ));
            AddedResult {
                id: r.id.clone(),
                status,
                key,
                message,
            }
        })
        .collect();
    {
        let _held = LOCK.lock().await;
        let mut s = read_session(root, id)?;
        for done in results.iter().filter(|d| !d.key.is_empty()) {
            if let Some(r) = s.results.iter_mut().find(|r| r.id == done.id) {
                r.in_bib.clone_from(&done.key);
            }
        }
        s.updated_at = iso_now();
        write_session(root, &s)?;
    }
    let resolved = resolved.unwrap_or(Resolved {
        results: Vec::new(),
        bib_file: String::new(),
        bib_included: true,
        style: crate::entry::Style::default(),
        keys: Vec::new(),
    });
    Ok((results, resolved, get_session(root, id)?))
}
