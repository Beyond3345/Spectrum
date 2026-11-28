//! A project's repository (and the settings repository) through libgit2 (2.8's `gitService.js`): what never
//! goes in, the excludes Spectrum keeps in `.git/info/exclude`, commits, fetch, push, clone and counts. The
//! token never goes in `.git/config`: remotes are opened anonymously with it, and the transport sends it as a
//! header. No system git binary is needed.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::LazyLock;

use git2::{
    AutotagOption, FetchOptions, ObjectType, Oid, PushOptions, RemoteCallbacks, Repository,
    Signature, StatusOptions, TreeWalkMode, TreeWalkResult,
};
use regex::{Regex, RegexBuilder};

use crate::compiled::compiled_pdfs;
use crate::error::{GitError, Result};
use crate::util::{key_of, looks_like_conflict_copy, secret_looking, write_atomic};

/// GitHub refuses a file over 100 MiB.
pub(crate) const MAX_FILE_BYTES: u64 = 100 * 1024 * 1024;
/// What of .spectrum goes to GitHub; the rest (checkpoints and the like) stays on each computer.
const APP_SHARED: [&str; 6] = [
    "project.json",
    "settings.json",
    "chats",
    "todos",
    "notes",
    "research",
];
/// The name a pull gives GitHub's text that didn't merge, which unlike a sync app's copy is committed.
pub(crate) const OWN_COPY: &str = "GitHub’s conflicted copy";
/// 2.8's `HIDDEN_ENTRIES`.
const HIDDEN: [&str; 14] = [
    ".spectrum",
    ".git",
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
    ".compile",
    ".snapshots",
    ".SynologyWorkingDirectory",
    ".dropbox",
    ".dropbox.cache",
    "Icon\r",
    "@eaDir",
    "#recycle",
    ".spectrum-shared",
];
/// TeX's build files, for the project's own .gitignore; .bbl stays, as arXiv takes it.
const GITIGNORE: &str = "# TeX's build files\n*.aux\n*.log\n*.out\n*.toc\n*.lof\n*.lot\n*.fls\n*.fdb_latexmk\n*.synctex.gz\n*.bcf\n*.blg\n*.run.xml\n*.xdv\n*.nav\n*.snm\n*.vrb\n_minted-*/\n";
const EXCLUDES_START: &str = "# >>> Spectrum";
const EXCLUDES_END: &str = "# <<< Spectrum";

/// What a shared repository's other people would read, so asked about first.
pub(crate) fn personal(rel: &str) -> bool {
    static RE: LazyLock<Option<Regex>> = LazyLock::new(|| {
        RegexBuilder::new(r"^\.spectrum/(?:chats|todos|notes|research)/")
            .case_insensitive(true)
            .build()
            .ok()
    });
    RE.as_ref().is_some_and(|re| re.is_match(rel))
}

/// The commit author: GitHub links `id+login@users.noreply.github.com` to the account without showing an email.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Author {
    pub name: String,
    pub email: String,
}

impl Author {
    fn signature(&self) -> Result<Signature<'static>> {
        Ok(Signature::now(&self.name, &self.email)?)
    }
}

/// What never goes in the repository: app data outside `APP_SHARED`, 2.8's hidden names, save and upload
/// temp files, and a sync app's conflicted copy (a pull's own copy goes in).
pub(crate) fn kept_out(rel: &str) -> bool {
    let ext = |p: &str, e: &str| {
        Path::new(p)
            .extension()
            .is_some_and(|x| x.eq_ignore_ascii_case(e))
    };
    if ext(rel, "tmp") || ext(rel, "upload") {
        return true;
    }
    let parts: Vec<&str> = rel.split('/').collect();
    let name = parts[parts.len() - 1];
    if parts[0].eq_ignore_ascii_case(".spectrum") {
        if parts.len() < 2
            || !APP_SHARED.contains(&parts[1])
            || (parts.len() == 2) != Path::new(parts[1]).extension().is_some_and(|x| x == "json")
        {
            return true;
        }
        if looks_like_conflict_copy(name) {
            return true;
        }
    } else if looks_like_conflict_copy(name) && !name.contains(OWN_COPY) {
        return true;
    }
    parts[1..]
        .iter()
        .any(|p| p.eq_ignore_ascii_case(".spectrum"))
        || parts
            .iter()
            .any(|p| HIDDEN.contains(p) && *p != ".spectrum")
}

/// A name Windows can't give a file: `<>:"|?*\`, a control character, a trailing dot or space, a device's.
pub(crate) fn unfit_on_windows(rel: &str) -> bool {
    static RESERVED: LazyLock<Option<Regex>> = LazyLock::new(|| {
        RegexBuilder::new(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$")
            .case_insensitive(true)
            .build()
            .ok()
    });
    rel.split('/').any(|p| {
        p.chars().any(|c| {
            matches!(
                c,
                '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\\' | '\0'..='\x1f'
            )
        }) || p.ends_with(['.', ' '])
            || RESERVED.as_ref().is_some_and(|re| re.is_match(p))
    })
}

/// A .key file that starts as a PEM private key does (Keynote's decks are .key too).
fn pem_key(abs: &Path) -> bool {
    use std::io::Read;
    if !abs
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("key"))
    {
        return false;
    }
    let mut head = [0u8; 10];
    fs::File::open(abs)
        .and_then(|mut f| f.read_exact(&mut head))
        .is_ok()
        && &head == b"-----BEGIN"
}

pub(crate) fn is_repo(root: &Path) -> bool {
    fs::symlink_metadata(root.join(".git")).is_ok()
}

/// Why Spectrum leaves the project's repository alone, or `None`.
pub fn refusal(root: &Path) -> Option<String> {
    let dot = root.join(".git");
    let info = fs::symlink_metadata(&dot).ok()?;
    let exists = |p: &Path| fs::symlink_metadata(p).is_ok();
    let why = if !info.is_dir() {
        "This project’s .git points to a repository elsewhere (a Git worktree or submodule), which Spectrum can’t sync."
    } else if exists(&dot.join("index.lock")) {
        "Another program is working in this project’s Git repository (.git/index.lock is there). Try again once it has finished."
    } else if [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
    ]
    .iter()
    .any(|n| exists(&dot.join(n)))
    {
        "This project’s repository is in the middle of a merge or rebase. Finish or abort it in Git, then try again."
    } else if fs::read_to_string(dot.join("HEAD"))
        .is_ok_and(|h| !h.is_empty() && !h.starts_with("ref: "))
    {
        "This project’s repository has a commit checked out rather than a branch (a detached HEAD). Check out a branch in Git, then try again."
    } else if exists(&root.join(".gitmodules")) {
        "This project’s repository uses submodules, which Spectrum can’t sync."
    } else if fs::read_to_string(root.join(".gitattributes")).is_ok_and(|a| a.contains("filter=")) {
        "This project’s repository uses Git LFS (or another filter), which Spectrum can’t sync."
    } else {
        return None;
    };
    Some(why.to_owned())
}

pub(crate) fn open(root: &Path) -> Result<Repository> {
    Ok(Repository::open(root)?)
}

/// The checked-out branch's name, `main` when HEAD names none.
pub(crate) fn branch_of(repo: &Repository) -> String {
    repo.find_reference("HEAD")
        .ok()
        .and_then(|h| {
            h.symbolic_target()
                .ok()
                .flatten()
                .and_then(|t| t.strip_prefix("refs/heads/"))
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "main".into())
}

pub(crate) fn head_oid(repo: &Repository) -> Option<Oid> {
    repo.refname_to_id("HEAD").ok()
}

pub(crate) fn remote_head(repo: &Repository) -> Option<Oid> {
    repo.refname_to_id(&format!("refs/remotes/origin/{}", branch_of(repo)))
        .ok()
}

/// `git init` on `branch`, with TeX's build files in a .gitignore when the project has none.
pub(crate) fn init_repo(root: &Path, branch: &str, gitignore: bool) -> Result<Repository> {
    let mut opts = git2::RepositoryInitOptions::new();
    opts.initial_head(branch);
    let repo = Repository::init_opts(root, &opts)?;
    let ignore = root.join(".gitignore");
    if gitignore && fs::symlink_metadata(&ignore).is_err() {
        write_atomic(&ignore, GITIGNORE.as_bytes())?;
    }
    Ok(repo)
}

pub(crate) fn set_remote(repo: &Repository, url: &str) -> Result<()> {
    let mut config = repo.config()?;
    config.set_str("remote.origin.url", url)?;
    config.set_str("remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*")?;
    Ok(())
}

pub(crate) fn remote_url(repo: &Repository) -> Option<String> {
    repo.find_remote("origin")
        .ok()?
        .url()
        .ok()
        .map(str::to_owned)
}

pub(crate) fn delete_remote(repo: &Repository) -> Result<()> {
    Ok(repo.remote_delete("origin")?)
}

/// A pattern that matches only `rel`, from the top of the project.
fn literal(rel: &str) -> String {
    let mut s = String::from("/");
    for c in rel.chars() {
        if matches!(c, '\\' | '*' | '?' | '[' | ']') {
            s.push('\\');
        }
        s.push(c);
    }
    if s.ends_with(' ') {
        s.pop();
        s.push_str("\\ ");
    }
    s
}

/// Spectrum's section of .git/info/exclude, rewritten before each commit; the user's lines stay.
fn write_excludes(root: &Path, pdfs: &[String]) -> Result<()> {
    let file = root.join(".git").join("info").join("exclude");
    let mut lines = vec![
        EXCLUDES_START.to_owned(),
        "# Spectrum rewrites this section before each backup. Lines outside it are yours and stay."
            .into(),
        "/.spectrum/*".into(),
    ];
    lines.extend(APP_SHARED.iter().map(|n| format!("!/.spectrum/{n}")));
    for name in HIDDEN
        .iter()
        .filter(|n| !matches!(**n, ".spectrum" | ".git") && !n.contains(['\r', '\n']))
    {
        lines.push(name.chars().fold(String::new(), |mut s, c| {
            if matches!(c, '\\' | '*' | '?' | '[' | ']' | '#' | '!') {
                s.push('\\');
            }
            s.push(c);
            s
        }));
    }
    lines.extend([
        "*.tmp".into(),
        "*.upload".into(),
        "*conflicted copy*".into(),
        format!("!*{OWN_COPY}*"),
    ]);
    lines.extend(pdfs.iter().map(|p| literal(p)));
    lines.push(EXCLUDES_END.into());
    let text = fs::read_to_string(&file).unwrap_or_default();
    let mut own: Vec<&str> = text.lines().collect();
    if let Some(start) = own.iter().position(|l| *l == EXCLUDES_START)
        && let Some(len) = own[start..].iter().position(|l| *l == EXCLUDES_END)
    {
        own.drain(start..=start + len);
    }
    while own.last() == Some(&"") {
        own.pop();
    }
    let all: Vec<&str> = own
        .into_iter()
        .chain(lines.iter().map(String::as_str))
        .collect();
    write_atomic(&file, format!("{}\n", all.join("\n")).as_bytes())
}

/// A commit's files: rel → (blob id, mode as git writes it, `100644`, `100755`, `120000`).
pub(crate) fn tree_files(
    repo: &Repository,
    commit: Option<Oid>,
) -> Result<BTreeMap<String, (Oid, i32)>> {
    let mut files = BTreeMap::new();
    let Some(commit) = commit else {
        return Ok(files);
    };
    let tree = repo.find_commit(commit)?.tree()?;
    tree.walk(TreeWalkMode::PreOrder, |dir, entry| {
        if entry.kind() == Some(ObjectType::Blob)
            && let Ok(name) = entry.name()
        {
            files.insert(format!("{dir}{name}"), (entry.id(), entry.filemode()));
        }
        TreeWalkResult::Ok
    })?;
    Ok(files)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Committed {
    pub committed: bool,
    /// What was refused (a key-looking file, one over GitHub's limit), for the notice.
    pub left: Vec<String>,
}

pub(crate) struct CommitOptions<'a> {
    pub message: &'a str,
    pub author: &'a Author,
    /// A path whose changes wait for a later commit.
    pub hold: &'a dyn Fn(&str) -> bool,
    /// A commit even with nothing changed (a labelled backup).
    pub always: bool,
    /// Whether compiled PDFs stay out (not in the settings repository).
    pub compiled: bool,
}

/// Commits what changed since the last commit, with the excludes rewritten first.
pub(crate) fn commit_all(root: &Path, o: &CommitOptions) -> Result<Committed> {
    let repo = open(root)?;
    // Git for Windows checks out with CRLF and reads it back through core.autocrlf; with no Git installed
    // nothing says so, so the repository's own config does (as 2.8 sets it)
    if cfg!(windows) && repo.config()?.get_bool("core.autocrlf").is_err() {
        repo.config()?.set_bool("core.autocrlf", true)?;
    }
    let pdfs = if o.compiled {
        compiled_pdfs(root)?
    } else {
        Vec::new()
    };
    write_excludes(root, &pdfs)?;
    let compiled: HashSet<String> = pdfs.iter().map(|p| key_of(p)).collect();
    let head = head_oid(&repo);
    let committed = tree_files(&repo, head)?;
    let mut keys: HashMap<String, usize> = HashMap::new();
    for rel in committed.keys() {
        *keys.entry(key_of(rel)).or_default() += 1;
    }
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);
    let rows: Vec<(String, git2::Status)> = repo
        .statuses(Some(&mut opts))?
        .iter()
        .filter_map(|e| Some((e.path().ok()?.to_owned(), e.status())))
        .collect();
    let (mut leave, mut adds, mut removes, mut left) =
        (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let mut named = HashSet::new();
    for (rel, _status) in rows {
        let in_head = committed.contains_key(&rel);
        if kept_out(&rel) || compiled.contains(&key_of(&rel)) || (o.hold)(&rel) {
            leave.push(rel);
            continue;
        }
        if keys.get(&key_of(&rel)).copied().unwrap_or(0) > 1 {
            if named.insert(key_of(&rel)) {
                left.push(format!("“{rel}” and another file differ only in letter case, which macOS and Windows can’t keep apart. Rename one of them"));
            }
            continue;
        }
        // a committed name Windows can't have is never here, and never deleted for that
        if in_head && cfg!(windows) && unfit_on_windows(&rel) {
            continue;
        }
        let abs = root.join(&rel);
        let Ok(info) = fs::symlink_metadata(&abs) else {
            removes.push(rel);
            continue;
        };
        if secret_looking(&rel) || pem_key(&abs) {
            left.push(format!("“{rel}” looks like a password or key file"));
            leave.push(rel);
        } else if info.len() > MAX_FILE_BYTES {
            left.push(format!("“{rel}” is over GitHub’s 100 MB limit"));
            leave.push(rel);
        } else {
            adds.push(rel);
        }
    }
    let mut index = repo.index()?;
    index.read(true)?;
    // what stays out of this commit goes back to the commit's in the index (Git may have staged it already)
    reset_paths(&repo, &mut index, &committed, &leave)?;
    for rel in &removes {
        index.remove_path(Path::new(rel))?;
    }
    for rel in &adds {
        index.add_path(Path::new(rel))?;
    }
    index.write()?;
    let tree_id = index.write_tree()?;
    let head_tree = head
        .map(|h| repo.find_commit(h).and_then(|c| c.tree()))
        .transpose()?;
    if head_tree.as_ref().is_some_and(|t| t.id() == tree_id) && !o.always {
        return Ok(Committed {
            committed: false,
            left,
        });
    }
    let tree = repo.find_tree(tree_id)?;
    let sig = o.author.signature()?;
    let parent = head.map(|h| repo.find_commit(h)).transpose()?;
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        o.message,
        &tree,
        parent.as_ref().into_iter().collect::<Vec<_>>().as_slice(),
    )?;
    Ok(Committed {
        committed: true,
        left,
    })
}

/// Each path's index entry put back to `files`' (a commit's), or taken out when it has none. Not through
/// `reset_default`, whose pathspecs would read `[` or `*` in a name as a pattern.
pub(crate) fn reset_paths(
    repo: &Repository,
    index: &mut git2::Index,
    files: &BTreeMap<String, (Oid, i32)>,
    paths: &[String],
) -> Result<()> {
    for rel in paths {
        match files.get(rel) {
            Some(&(id, mode)) => {
                let size = repo.find_blob(id).map_or(0, |b| b.size());
                index.add(&git2::IndexEntry {
                    ctime: git2::IndexTime::new(0, 0),
                    mtime: git2::IndexTime::new(0, 0),
                    dev: 0,
                    ino: 0,
                    mode: u32::try_from(mode).unwrap_or(0o100_644),
                    uid: 0,
                    gid: 0,
                    file_size: u32::try_from(size).unwrap_or(u32::MAX),
                    id,
                    flags: u16::try_from(rel.len().min(0xfff)).unwrap_or(0xfff),
                    flags_extended: 0,
                    path: rel.as_bytes().to_vec(),
                })?;
            }
            None => match index.remove_path(Path::new(rel)) {
                Err(e) if e.code() != git2::ErrorCode::NotFound => return Err(e.into()),
                _ => {}
            },
        }
    }
    Ok(())
}

/// The URL to open a remote with: an https one (or plain http to this computer, a test's server) carries
/// the token as its user part, which the transport turns into a header (the anonymous remote never writes
/// it to `.git/config`). Never over plain http to another host.
fn with_token(url: &str, token: Option<&str>) -> String {
    let (scheme, rest) = url.split_once("://").unwrap_or(("", url));
    let host = rest.split(['/', ':']).next().unwrap_or("");
    let safe = scheme == "https" || (scheme == "http" && matches!(host, "127.0.0.1" | "localhost"));
    match token {
        Some(token) if safe && !rest.split('/').next().unwrap_or("").contains('@') => {
            let enc: String = token
                .bytes()
                .map(|b| {
                    if b.is_ascii_alphanumeric() || b == b'_' || b == b'-' {
                        char::from(b).to_string()
                    } else {
                        format!("%{b:02X}")
                    }
                })
                .collect();
            format!("{scheme}://x-access-token:{enc}@{rest}")
        }
        _ => url.to_owned(),
    }
}

fn origin_url(repo: &Repository) -> Result<String> {
    remote_url(repo).ok_or_else(|| {
        GitError::Refused("This project’s repository has no origin to sync with.".into())
    })
}

/// origin's branch fetched into refs/remotes/origin; its commit, or `None` when origin has none yet.
pub(crate) fn fetch_origin(root: &Path, token: Option<&str>) -> Result<Option<Oid>> {
    crate::transport::ensure();
    let repo = open(root)?;
    let branch = branch_of(&repo);
    let mut remote = repo.remote_anonymous(&with_token(&origin_url(&repo)?, token))?;
    let mut opts = FetchOptions::new();
    opts.download_tags(AutotagOption::None);
    let refspec = format!("+refs/heads/{branch}:refs/remotes/origin/{branch}");
    remote.fetch(&[refspec.as_str()], Some(&mut opts), None)?;
    Ok(remote_head(&repo))
}

/// Pushes the branch; false when GitHub has commits this computer hasn't (pull, then push again).
pub(crate) fn push_origin(root: &Path, token: Option<&str>) -> Result<bool> {
    crate::transport::ensure();
    let repo = open(root)?;
    let branch = branch_of(&repo);
    let mut remote = repo.remote_anonymous(&with_token(&origin_url(&repo)?, token))?;
    let refused = std::cell::RefCell::new(None::<String>);
    let mut callbacks = RemoteCallbacks::new();
    callbacks.push_update_reference(|_, status| {
        if let Some(status) = status {
            *refused.borrow_mut() = Some(status.to_owned());
        }
        Ok(())
    });
    let mut opts = PushOptions::new();
    opts.remote_callbacks(callbacks);
    let spec = format!("refs/heads/{branch}:refs/heads/{branch}");
    match remote.push(&[spec.as_str()], Some(&mut opts)) {
        Err(e) if e.code() == git2::ErrorCode::NotFastForward => return Ok(false),
        Err(e) => return Err(e.into()),
        Ok(()) => {}
    }
    drop(opts);
    if let Some(status) = refused.into_inner() {
        if status.contains("fast-forward")
            || status.contains("fetch first")
            || status.contains("rejected")
        {
            return Ok(false);
        }
        return Err(GitError::Refused(format!(
            "GitHub refused the push: {status}"
        )));
    }
    // a named remote's push moves its tracking branch; an anonymous one's doesn't
    if let Some(head) = head_oid(&repo) {
        repo.reference(&format!("refs/remotes/origin/{branch}"), head, true, "push")?;
    }
    Ok(true)
}

/// `url` cloned into `dir`, a new folder, with origin set to `url` (never the token).
pub(crate) fn clone_into(dir: &Path, url: &str, token: Option<&str>) -> Result<()> {
    let repo = init_repo(dir, "main", false)?;
    set_remote(&repo, url)?;
    crate::transport::ensure();
    let mut remote = repo.remote_anonymous(&with_token(url, token))?;
    let mut opts = FetchOptions::new();
    opts.download_tags(AutotagOption::None);
    remote.fetch(
        &["+refs/heads/*:refs/remotes/origin/*"],
        Some(&mut opts),
        None,
    )?;
    let default = remote.default_branch().ok().and_then(|b| {
        b.as_str()
            .ok()
            .and_then(|s| s.strip_prefix("refs/heads/"))
            .map(str::to_owned)
    });
    let branch = default
        .filter(|b| {
            repo.refname_to_id(&format!("refs/remotes/origin/{b}"))
                .is_ok()
        })
        .unwrap_or_else(|| "main".into());
    let Ok(oid) = repo.refname_to_id(&format!("refs/remotes/origin/{branch}")) else {
        return Ok(()); // an empty repository: nothing to check out
    };
    repo.reference(&format!("refs/heads/{branch}"), oid, true, "clone")?;
    repo.set_head(&format!("refs/heads/{branch}"))?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;
    Ok(())
}

/// How many commits this computer has that origin hasn't, and the other way.
pub(crate) fn ahead_behind(root: &Path) -> Result<(usize, usize)> {
    let repo = open(root)?;
    Ok(match (head_oid(&repo), remote_head(&repo)) {
        (Some(a), Some(b)) => repo.graph_ahead_behind(a, b)?,
        (Some(a), None) => {
            let mut walk = repo.revwalk()?;
            walk.push(a)?;
            (walk.count(), 0)
        }
        (None, Some(b)) => {
            let mut walk = repo.revwalk()?;
            walk.push(b)?;
            (0, walk.count())
        }
        (None, None) => (0, 0),
    })
}

/// When a commit was made, as ISO text.
pub(crate) fn commit_time(repo: &Repository, oid: Option<Oid>) -> Option<String> {
    let c = repo.find_commit(oid?).ok()?;
    chrono::DateTime::from_timestamp(c.committer().when().seconds(), 0)
        .map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn what_stays_out() {
        for rel in [
            ".spectrum/history/index.json",
            ".spectrum/cache.json",
            "a.tmp",
            "x.upload",
            "main (Ann's conflicted copy 2026-01-01).tex",
            "sub/.DS_Store",
            "sub/.spectrum/project.json",
            ".spectrum/chats",
        ] {
            assert!(kept_out(rel), "{rel}");
        }
        for rel in [
            ".spectrum/project.json",
            ".spectrum/settings.json",
            ".spectrum/chats/c1.json",
            "main.tex",
            "main (GitHub’s conflicted copy 2026-10-18 104233).tex",
        ] {
            assert!(!kept_out(rel), "{rel}");
        }
        assert!(personal(".spectrum/Chats/c.json"));
        assert!(
            unfit_on_windows("a/Why?.tex")
                && unfit_on_windows("con.txt")
                && unfit_on_windows("dot.")
                && !unfit_on_windows("ok.tex")
        );
        assert_eq!(literal("a b/c[1].pdf "), "/a b/c\\[1\\].pdf\\ ");
        assert_eq!(
            with_token("https://github.com/o/r.git", Some("ghp_ab/c")),
            "https://x-access-token:ghp_ab%2Fc@github.com/o/r.git"
        );
        assert_eq!(with_token("/tmp/remote.git", Some("t")), "/tmp/remote.git");
    }
}
