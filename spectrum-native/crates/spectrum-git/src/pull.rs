//! The pull's merge (2.8's `mergeOrigin`): origin's fetched branch merged file by file with the merge rules,
//! each file written only while it still holds what was committed here, a two-parent commit (or a
//! fast-forward), and only then the branch moved. On a file that changed meanwhile, what was written is put
//! back and nothing moves.

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::LazyLock;

use git2::{Oid, Repository};
use regex::Regex;
use serde_json::Value;

use crate::compiled::compiled_pdfs;
use crate::error::{GitError, Result};
use crate::merge_rules::{
    Pick, conflict_copy_path, decide, deletion_brake, merge_bib_files, merge_chat_files,
    merge_meta, place_if_unchanged, respell_keys,
};
use crate::merge3::merge_text;
use crate::repo::{
    Author, branch_of, head_oid, kept_out, open, remote_head, reset_paths, tree_files,
    unfit_on_windows,
};
use crate::util::{is_text, key_of, secret_looking, sha256_hex, write_atomic};

const LINK: i32 = 0o120_000;

pub(crate) type Files = BTreeMap<String, (Oid, i32)>;

#[derive(Debug, Clone)]
struct FileRef {
    rel: String,
    oid: Oid,
    mode: i32,
}

#[derive(Debug, Clone)]
struct Outcome {
    rel: String,
    oid: Option<Oid>,
    data: Option<Vec<u8>>,
    mode: i32,
}

#[derive(Debug, Clone)]
struct Decision {
    key: String,
    o: Option<FileRef>,
    r: Option<Outcome>,
    /// Kept in the commit only, never written here (two spellings, or a name Windows can't have).
    tree_only: bool,
}

impl Decision {
    fn unchanged(&self) -> bool {
        self.tree_only
            || match (&self.o, &self.r) {
                (None, None) => true,
                (Some(o), Some(r)) => o.rel == r.rel && r.data.is_none() && Some(o.oid) == r.oid,
                _ => false,
            }
    }
    fn rel(&self) -> &str {
        self.r
            .as_ref()
            .map_or_else(|| self.o.as_ref().map_or("", |o| &o.rel), |r| &r.rel)
    }
}

struct Plan {
    decisions: Vec<Decision>,
    copies: Vec<Outcome>,
    problems: Vec<String>,
}

/// Which side an item takes whatever changed (the settings repository's newer item), or `None`.
pub(crate) type SideFn<'a> = &'a dyn Fn(&str) -> Option<Pick>;

static CHAT: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"^\.spectrum/chats/[^/]+\.json$").ok());
static RESEARCH: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"^\.spectrum/research/[^/]+\.json$").ok());

fn is(re: &LazyLock<Option<Regex>>, key: &str) -> bool {
    re.as_ref().is_some_and(|re| re.is_match(key))
}

/// A .spectrum file changed on both sides, merged, or `None` to keep this computer's (never a copy).
fn merge_app_file(key: &str, base: Option<&[u8]>, ours: &[u8], theirs: &[u8]) -> Option<Vec<u8>> {
    if is(&CHAT, key) {
        return merge_chat_files(ours, theirs).map(|(d, _)| d);
    }
    // ponytail: a research session changed on both sides keeps this computer's (2.8 merges its searches,
    // which needs the research crate's result matching); port mergeSessionFiles with that crate
    if is(&RESEARCH, key) {
        return None;
    }
    let obj = |b: &[u8]| match serde_json::from_slice(b) {
        Ok(Value::Object(m)) => Some(m),
        _ => None,
    };
    let (o, t) = (obj(ours)?, obj(theirs)?);
    let b = base.and_then(obj);
    serde_json::to_vec_pretty(&Value::Object(merge_meta(b.as_ref(), &o, &t, 0))).ok()
}

// ports of 2.8's planMerge, writeDecisions and mergeOrigin, kept whole so they read side by side
#[allow(clippy::too_many_lines)]
fn plan_merge(
    repo: &Repository,
    base: &Files,
    ours: &Files,
    theirs: &Files,
    compiled: &HashSet<String>,
    side: SideFn,
) -> Result<Plan> {
    let read = |oid: Oid| -> Result<Vec<u8>> { Ok(repo.find_blob(oid)?.content().to_vec()) };
    let names = |m: &Files| m.keys().cloned().collect::<Vec<_>>();
    let (files, case_pairs) = respell_keys(&names(base), &names(ours), &names(theirs));
    let (mut decisions, mut copies, mut problems) = (Vec::new(), Vec::new(), Vec::new());
    let mut clashed = HashSet::new();
    for (a, b) in case_pairs {
        problems.push(format!("“{a}” and “{b}” differ only in letter case, which macOS and Windows can’t keep apart. Rename one of them."));
        clashed.insert(key_of(&a));
    }
    if cfg!(windows) {
        for rel in ours.keys().chain(theirs.keys()) {
            if unfit_on_windows(rel) && clashed.insert(key_of(rel)) {
                problems.push(format!(
                    "“{rel}” can’t be a file name on Windows. Rename it on your other computer."
                ));
            }
        }
    }
    // each exact path as GitHub has it, unless this computer changed that path since the base
    let all: Vec<&String> = base
        .keys()
        .chain(ours.keys())
        .chain(theirs.keys())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    for key in &clashed {
        for rel in all.iter().filter(|p| key_of(p) == *key) {
            let (b, o, t) = (base.get(*rel), ours.get(*rel), theirs.get(*rel));
            let r = if o.map(|x| x.0) == b.map(|x| x.0) {
                t
            } else {
                o
            };
            if o.is_some() || r.is_some() {
                decisions.push(Decision {
                    key: key.clone(),
                    o: o.map(|&(oid, mode)| FileRef {
                        rel: (*rel).clone(),
                        oid,
                        mode,
                    }),
                    r: r.map(|&(oid, mode)| Outcome {
                        rel: (*rel).clone(),
                        oid: Some(oid),
                        data: None,
                        mode,
                    }),
                    tree_only: true,
                });
            }
        }
    }
    let entry = |m: &Files, rel: &Option<String>| {
        rel.as_ref().and_then(|r| {
            m.get(r).map(|&(oid, mode)| FileRef {
                rel: r.clone(),
                oid,
                mode,
            })
        })
    };
    for (key, f) in files {
        if clashed.contains(&key) {
            continue;
        }
        let (b, o, t) = (
            entry(base, &f.base),
            entry(ours, &f.ours),
            entry(theirs, &f.theirs),
        );
        let hex = |x: &Option<FileRef>| x.as_ref().map(|x| x.oid.to_string());
        let pick = side(&f.rel)
            .unwrap_or_else(|| decide(hex(&b).as_deref(), hex(&o).as_deref(), hex(&t).as_deref()));
        let from = match pick {
            Pick::Theirs => t.clone(),
            Pick::Drop => None,
            _ => o.clone(),
        };
        let mut r = from.map(|x| Outcome {
            rel: f.rel.clone(),
            oid: Some(x.oid),
            data: None,
            mode: x.mode,
        });
        if let (Pick::Merge, Some(oo), Some(tt)) = (pick, &o, &t) {
            let (ob, tb) = (read(oo.oid)?, read(tt.oid)?);
            let bb = b.as_ref().map(|x| read(x.oid)).transpose()?;
            let app = key.starts_with(".spectrum/");
            let base_bytes = bb.clone().unwrap_or_default();
            let data = if app {
                merge_app_file(&key, bb.as_deref(), &ob, &tb)
            } else if compiled.contains(&key) || !is_text(&f.rel) {
                None
            } else {
                merge_text(&base_bytes, &ob, &tb).or_else(|| {
                    std::path::Path::new(&f.rel)
                        .extension()
                        .is_some_and(|e| e.eq_ignore_ascii_case("bib"))
                        .then(|| merge_bib_files(&base_bytes, &ob, &tb))
                        .flatten()
                })
            };
            if let Some(data) = data {
                r = Some(Outcome {
                    rel: f.rel.clone(),
                    oid: None,
                    data: Some(data),
                    mode: oo.mode,
                });
            } else if !app && !compiled.contains(&key) {
                copies.push(Outcome {
                    rel: conflict_copy_path(&f.rel, "GitHub", chrono::Local::now()),
                    oid: None,
                    data: Some(tb),
                    mode: tt.mode,
                });
            }
        }
        decisions.push(Decision {
            key,
            o,
            r,
            tree_only: false,
        });
    }
    // a copy's name nothing else has
    let mut taken: HashSet<String> = decisions
        .iter()
        .filter_map(|d| d.r.as_ref().map(|r| key_of(&r.rel)))
        .collect();
    for c in &mut copies {
        let slash = c.rel.rfind('/').map_or(0, |i| i + 1);
        let (stem, ext) = match c.rel.rfind('.') {
            Some(dot) if dot > slash => (c.rel[..dot].to_owned(), c.rel[dot..].to_owned()),
            _ => (c.rel.clone(), String::new()),
        };
        let mut n = 2;
        while taken.contains(&key_of(&c.rel)) {
            c.rel = format!("{stem}-{n}{ext}");
            n += 1;
        }
        taken.insert(key_of(&c.rel));
    }
    Ok(Plan {
        decisions,
        copies,
        problems,
    })
}

/// Refuses a path in a folder that links outside the project.
fn guard(root: &Path, rel: &str) -> Result<()> {
    let real_root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let mut at = root.to_path_buf();
    let parts: Vec<&str> = rel.split('/').collect();
    for part in &parts[..parts.len().saturating_sub(1)] {
        at.push(part);
        if fs::symlink_metadata(&at).is_ok_and(|m| m.file_type().is_symlink())
            && !fs::canonicalize(&at).is_ok_and(|real| real.starts_with(&real_root))
        {
            return Err(GitError::Refused(format!(
                "“{rel}” is in a folder that links outside the project, so Spectrum won’t pull GitHub’s changes into it. Replace the link with a folder, or leave it out on GitHub too."
            )));
        }
    }
    Ok(())
}

/// A symbolic link at `rel` to `target`; where links can't be made, its target in a plain file (as Git for
/// Windows writes one with core.symlinks false).
fn place_link(root: &Path, rel: &str, target: &str) -> Result<()> {
    let dest = root.join(rel);
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(|e| GitError::io("create", dir, e))?;
    }
    #[cfg(unix)]
    {
        let tmp = crate::util::temp_beside(&dest);
        if std::os::unix::fs::symlink(target, &tmp)
            .and_then(|()| fs::rename(&tmp, &dest))
            .is_ok()
        {
            return Ok(());
        }
        let _ = fs::remove_file(&tmp);
    }
    let _ = fs::remove_file(&dest);
    write_atomic(&dest, target.as_bytes())
}

enum Expect {
    None,
    Link,
    Hash(String),
    Changed,
}

#[allow(clippy::too_many_lines)]
fn write_decisions(
    root: &Path,
    repo: &Repository,
    decisions: &[Decision],
    copies: &[Outcome],
    keep: &dyn Fn(&str) -> bool,
) -> Result<usize> {
    let read = |oid: Oid| -> Result<Vec<u8>> { Ok(repo.find_blob(oid)?.content().to_vec()) };
    let mut ops: Vec<&Decision> = decisions
        .iter()
        .filter(|d| !d.unchanged() && !keep(d.rel()))
        .collect();
    // deletions first
    ops.sort_by_key(|d| !(d.o.is_some() && d.r.is_none()));
    let links: Vec<String> = ops
        .iter()
        .filter_map(|d| {
            d.r.as_ref()
                .filter(|r| r.mode == LINK)
                .map(|r| format!("{}/", key_of(&r.rel)))
        })
        .collect();
    for rel in ops
        .iter()
        .flat_map(|d| {
            [
                d.o.as_ref().map(|o| o.rel.as_str()),
                d.r.as_ref().map(|r| r.rel.as_str()),
            ]
        })
        .flatten()
        .chain(copies.iter().map(|c| c.rel.as_str()))
    {
        guard(root, rel)?;
        if links.iter().any(|l| key_of(rel).starts_with(l.as_str())) {
            return Err(GitError::Refused(format!(
                "“{rel}” is in a folder that links outside the project, so Spectrum won’t pull GitHub’s changes into it."
            )));
        }
    }
    let committed = |o: &Option<FileRef>| -> Result<Expect> {
        let Some(o) = o else { return Ok(Expect::None) };
        let abs = root.join(&o.rel);
        let blob = read(o.oid)?;
        if o.mode == LINK
            && fs::read_link(&abs).is_ok_and(|t| t.to_string_lossy().as_bytes() == blob.as_slice())
        {
            return Ok(Expect::Link);
        }
        let Ok(now) = fs::read(&abs) else {
            return Ok(Expect::Changed);
        };
        let lf: Vec<u8> = now
            .iter()
            .enumerate()
            .filter(|&(i, &b)| !(b == b'\r' && now.get(i + 1) == Some(&b'\n')))
            .map(|(_, &b)| b)
            .collect();
        Ok(if now == blob || lf == blob {
            Expect::Hash(sha256_hex(&now))
        } else {
            Expect::Changed
        })
    };
    let mut done: Vec<(Option<FileRef>, Outcome)> = Vec::new();
    let mut deleted: Vec<FileRef> = Vec::new();
    let result = (|| -> Result<()> {
        for d in &ops {
            let mut expect = committed(&d.o)?;
            if matches!(expect, Expect::Changed) {
                return Err(GitError::Changed);
            }
            if let Some(o) = &d.o {
                match &d.r {
                    None => {
                        let abs = root.join(&o.rel);
                        let _ = fs::remove_file(&abs);
                        let mut dir = abs.parent().map(Path::to_path_buf);
                        while let Some(p) =
                            dir.filter(|p| p.starts_with(root) && p.as_path() != root)
                        {
                            if fs::remove_dir(&p).is_err() {
                                break;
                            }
                            dir = p.parent().map(Path::to_path_buf);
                        }
                        deleted.push(o.clone());
                    }
                    Some(r) if r.rel != o.rel => respell(root, &o.rel, &r.rel)?,
                    _ => {}
                }
            }
            if let Some(r) = &d.r {
                let bytes = match (&r.data, r.oid) {
                    (Some(data), _) => data.clone(),
                    (None, Some(oid)) => read(oid)?,
                    (None, None) => Vec::new(),
                };
                if matches!(expect, Expect::Link) {
                    let _ = fs::remove_file(root.join(&r.rel));
                    expect = Expect::None;
                }
                if r.mode == LINK {
                    if matches!(expect, Expect::None)
                        && fs::symlink_metadata(root.join(&r.rel)).is_ok()
                    {
                        return Err(GitError::Changed);
                    }
                    place_link(root, &r.rel, &String::from_utf8_lossy(&bytes))?;
                } else {
                    let want = match &expect {
                        Expect::Hash(h) => Some(h.as_str()),
                        _ => None,
                    };
                    if !place_if_unchanged(root, &r.rel, &bytes, want)? {
                        return Err(GitError::Changed);
                    }
                    #[cfg(unix)]
                    if r.mode == 0o100_755 {
                        use std::os::unix::fs::PermissionsExt;
                        let _ = fs::set_permissions(
                            root.join(&r.rel),
                            fs::Permissions::from_mode(0o755),
                        );
                    }
                }
                done.push((d.o.clone(), r.clone()));
            }
        }
        for c in copies {
            guard(root, &c.rel)?;
            if !place_if_unchanged(root, &c.rel, c.data.as_deref().unwrap_or_default(), None)? {
                return Err(GitError::Changed);
            }
            done.push((None, c.clone()));
        }
        Ok(())
    })();
    if let Err(err) = result {
        // this computer's files as they were committed
        let restore = |o: &FileRef| -> Result<()> {
            let blob = read(o.oid)?;
            if o.mode == LINK {
                place_link(root, &o.rel, &String::from_utf8_lossy(&blob))
            } else {
                write_atomic(&root.join(&o.rel), &blob)
            }
        };
        for (o, r) in done.iter().rev() {
            if o.as_ref().is_none_or(|o| o.rel != r.rel) {
                let _ = fs::remove_file(root.join(&r.rel));
            }
            if let Some(o) = o {
                let _ = restore(o);
            }
        }
        for o in &deleted {
            let _ = restore(o);
        }
        return Err(err);
    }
    Ok(ops.len())
}

/// The file at `rel` renamed to `want`, a name that differs only in letter case or Unicode form.
fn respell(root: &Path, rel: &str, want: &str) -> Result<()> {
    let mut at = root.to_path_buf();
    for (p, w) in rel.split('/').zip(want.split('/')) {
        if p != w {
            match fs::rename(at.join(p), at.join(w)) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                    return Err(GitError::io("rename", &at.join(p), e));
                }
                _ => {}
            }
        }
        at.push(w);
    }
    Ok(())
}

/// The commit's tree for the decisions' results and the copies.
#[allow(clippy::items_after_statements)]
fn write_tree(repo: &Repository, decisions: &[Decision], copies: &[Outcome]) -> Result<Oid> {
    #[derive(Default)]
    struct Dir(BTreeMap<String, Node>);
    enum Node {
        Dir(Dir),
        File(Oid, i32),
    }
    let mut top = Dir::default();
    for x in decisions.iter().filter_map(|d| d.r.as_ref()).chain(copies) {
        let oid = match (&x.data, x.oid) {
            (Some(data), _) => repo.blob(data)?,
            (None, Some(oid)) => oid,
            (None, None) => continue,
        };
        let parts: Vec<&str> = x.rel.split('/').collect();
        let mut dir = &mut top;
        for part in &parts[..parts.len() - 1] {
            let node = dir
                .0
                .entry((*part).to_owned())
                .or_insert_with(|| Node::Dir(Dir::default()));
            if let Node::File(..) = node {
                *node = Node::Dir(Dir::default());
            }
            dir = match node {
                Node::Dir(d) => d,
                Node::File(..) => {
                    return Err(GitError::Refused(format!(
                        "“{}” is both a file and a folder.",
                        x.rel
                    )));
                }
            };
        }
        dir.0
            .insert(parts[parts.len() - 1].to_owned(), Node::File(oid, x.mode));
    }
    fn write(repo: &Repository, dir: &Dir) -> Result<Oid> {
        let mut b = repo.treebuilder(None)?;
        for (name, node) in &dir.0 {
            match node {
                Node::Dir(d) => b.insert(name, write(repo, d)?, 0o040_000)?,
                Node::File(oid, mode) => b.insert(name, *oid, *mode)?,
            };
        }
        Ok(b.write()?)
    }
    write(repo, &top)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PullState {
    /// Nothing to take.
    Current,
    Merged,
    /// It would delete many files at once; ask, then pull again with `allow_deletions`.
    Confirm,
    /// A dry run: what it would do, nothing written.
    Preview,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PullResult {
    pub state: PullState,
    /// Files GitHub's changes write, rename or delete here.
    pub from_theirs: usize,
    /// GitHub's files that didn't merge, put beside this computer's as conflicted copies.
    pub conflicts: usize,
    /// Whether any of .spectrum changed (chats, settings), for the window to reload.
    pub changed_app: bool,
    pub deleting: usize,
    pub problems: Vec<String>,
}

pub(crate) struct MergeOptions<'a> {
    pub author: &'a Author,
    pub allow_deletions: bool,
    pub dry_run: bool,
    /// The files to merge against instead of the commits' common one.
    pub base: Option<Files>,
    pub side: SideFn<'a>,
    pub message: &'a str,
    /// A "Before pull from GitHub" checkpoint when files here change.
    pub checkpoint: bool,
}

/// Merges origin's fetched branch into this computer's committed one, under the caller's project lock.
#[allow(clippy::too_many_lines)]
pub(crate) fn merge_origin(root: &Path, o: &MergeOptions) -> Result<PullResult> {
    let repo = open(root)?;
    let branch = branch_of(&repo);
    let (ours, theirs) = (head_oid(&repo), remote_head(&repo));
    let none = PullResult {
        state: PullState::Current,
        from_theirs: 0,
        conflicts: 0,
        changed_app: false,
        deleting: 0,
        problems: Vec::new(),
    };
    let Some(theirs) = theirs.filter(|t| Some(*t) != ours) else {
        return Ok(none);
    };
    if let Some(ours) = ours
        && repo.graph_descendant_of(ours, theirs).unwrap_or(false)
    {
        return Ok(none);
    }
    let merge_base = ours.and_then(|ours| repo.merge_base(ours, theirs).ok());
    let compiled: HashSet<String> = compiled_pdfs(root)?.iter().map(|p| key_of(p)).collect();
    let base_files = match &o.base {
        Some(b) => b.clone(),
        None => tree_files(&repo, merge_base)?,
    };
    let (ours_files, theirs_files) = (tree_files(&repo, ours)?, tree_files(&repo, Some(theirs))?);
    let plan = plan_merge(
        &repo,
        &base_files,
        &ours_files,
        &theirs_files,
        &compiled,
        o.side,
    )?;
    let kept = |rel: &str| compiled.contains(&key_of(rel)) || kept_out(rel) || secret_looking(rel);
    let working: Vec<&Decision> = plan
        .decisions
        .iter()
        .filter(|d| !d.unchanged() && !kept(d.rel()))
        .collect();
    let deleting: Vec<String> = working
        .iter()
        .filter(|d| d.o.is_some() && d.r.is_none())
        .filter_map(|d| d.o.as_ref().map(|o| o.rel.clone()))
        .collect();
    let changed_app = working
        .iter()
        .map(|d| d.key.clone())
        .chain(plan.copies.iter().map(|c| key_of(&c.rel)))
        .any(|k| k.starts_with(".spectrum/"));
    let mut result = PullResult {
        state: PullState::Preview,
        from_theirs: working.len(),
        conflicts: plan.copies.len(),
        changed_app,
        deleting: deleting.len(),
        problems: plan.problems.clone(),
    };
    if o.dry_run {
        return Ok(result);
    }
    if !o.allow_deletions
        && deletion_brake(&deleting, &ours_files.keys().cloned().collect::<Vec<_>>()) > 0
    {
        result.state = PullState::Confirm;
        return Ok(result);
    }
    if o.checkpoint && (!working.is_empty() || !plan.copies.is_empty()) {
        crate::history::create(
            root,
            "Before pull from GitHub",
            crate::history::Reason::Manual,
        )?;
    }
    // a file here that a new one from GitHub would land on, which this computer never committed, stays too
    let uncommitted: HashSet<String> = plan
        .decisions
        .iter()
        .filter(|d| d.o.is_none())
        .filter_map(|d| d.r.as_ref())
        .filter(|r| fs::symlink_metadata(root.join(&r.rel)).is_ok())
        .map(|r| key_of(&r.rel))
        .collect();
    let written = write_decisions(root, &repo, &plan.decisions, &plan.copies, &|rel| {
        kept(rel) || uncommitted.contains(&key_of(rel))
    })?;
    let tree = write_tree(&repo, &plan.decisions, &plan.copies)?;
    let theirs_commit = repo.find_commit(theirs)?;
    let oid = if tree == theirs_commit.tree_id() && (ours.is_none() || merge_base == ours) {
        theirs
    } else {
        let sig = git2::Signature::now(&o.author.name, &o.author.email)?;
        let tree = repo.find_tree(tree)?;
        let mut parents = Vec::new();
        if let Some(ours) = ours {
            parents.push(repo.find_commit(ours)?);
        }
        parents.push(theirs_commit);
        repo.commit(
            None,
            &sig,
            &sig,
            o.message,
            &tree,
            &parents.iter().collect::<Vec<_>>(),
        )?
    };
    repo.reference(&format!("refs/heads/{branch}"), oid, true, "pull")?;
    // the index to the new commit for each file that changed, so the next backup sees only what changes after
    let merged = tree_files(&repo, Some(oid))?;
    let touched: Vec<String> = plan
        .decisions
        .iter()
        .filter(|d| !d.unchanged() || d.tree_only)
        .flat_map(|d| {
            [
                d.o.as_ref().map(|o| o.rel.clone()),
                d.r.as_ref().map(|r| r.rel.clone()),
            ]
        })
        .flatten()
        .chain(plan.copies.iter().map(|c| c.rel.clone()))
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    let mut index = repo.index()?;
    index.read(true)?;
    reset_paths(&repo, &mut index, &merged, &touched)?;
    index.write()?;
    result.state = PullState::Merged;
    result.from_theirs = written;
    Ok(result)
}

/// The files of this computer's commit, origin's and their common one, for the settings repository's rule.
pub(crate) fn merge_sides(repo: &Repository) -> Result<(Files, Files, Files)> {
    let (ours, theirs) = (head_oid(repo), remote_head(repo));
    let base = match (ours, theirs) {
        (Some(a), Some(b)) => repo.merge_base(a, b).ok(),
        _ => None,
    };
    Ok((
        tree_files(repo, base)?,
        tree_files(repo, ours)?,
        tree_files(repo, theirs)?,
    ))
}

#[cfg(test)]
mod tests;
