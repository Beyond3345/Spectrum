//! A project on GitHub (2.8's Back up, Pull, Sync, Link, Initialise and Get from GitHub). The link,
//! `{ owner, repo, projectId, personal? }`, lives in the project's `.spectrum/settings.json`, which goes to
//! GitHub with the project; `projectId` keeps a Finder copy (which gets an id of its own) from counting as
//! linked. The caller holds the project's file lock and waits for compiles and agents, as 2.8's queue did.

use std::path::{Path, PathBuf};

use serde_json::{Value, json};
use spectrum_core::paths::{SyncRoot, place_of};
use spectrum_core::project::{make_unique_folder, read_meta, register, sanitise_folder_name};
use spectrum_core::settings::{read_project_settings, update_project_settings};

use crate::error::{GitError, Result};
use crate::github::{GitHub, RepoRef, valid_name};
use crate::pull::{MergeOptions, PullResult, PullState, merge_origin};
use crate::repo::{
    self, Author, CommitOptions, ahead_behind, commit_all, fetch_origin, init_repo, is_repo, open,
    personal, push_origin, refusal,
};

/// What a project's GitHub work needs: the API with the token, who commits, and where sync apps' folders
/// are (spectrum-core's `detect_sync_roots`), since sync apps damage repositories.
#[derive(Clone)]
pub struct ProjectSync {
    pub github: GitHub,
    pub author: Author,
    /// This computer's name, for commit messages.
    pub machine_name: String,
    pub home: PathBuf,
    pub sync_roots: Vec<SyncRoot>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Link {
    pub owner: String,
    pub repo: String,
    pub project_id: String,
    /// The answer for a shared repository: whether chats, to-dos, notes and research go in it.
    pub personal: Option<bool>,
    /// Made for this project, not a copy's.
    pub here: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BackupOptions {
    /// A labelled backup is a commit of its own even with nothing changed.
    pub label: String,
    /// The minute after editing stops: chats and research sessions wait for Sync.
    pub idle: bool,
    /// Commit only; the push waits for the next start.
    pub quitting: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Backup {
    /// What the commit left out (a key-like file, one over 100 MB).
    pub left: Vec<String>,
    /// What came in when GitHub had commits this computer hadn't.
    pub pulled: Option<PullResult>,
}

/// What the GitHub tab shows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectStatus {
    pub repo: bool,
    pub refusal: Option<String>,
    pub linked: bool,
    pub link: Option<RepoRef>,
    /// A copy's settings name the original's repository.
    pub copy_of: Option<RepoRef>,
    pub ahead: usize,
    pub behind: usize,
    pub last_backup: Option<String>,
    /// The sync app whose folder the project is in.
    pub sync_folder: Option<String>,
    pub personal: Option<bool>,
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
    tokio::task::spawn_blocking(f).await.unwrap_or_else(|_| {
        Err(GitError::Refused(
            "A GitHub task stopped unexpectedly.".into(),
        ))
    })
}

/// A git transport failure as the user should see it.
fn transport_error(err: GitError, link: Option<&RepoRef>) -> GitError {
    let GitError::Git(e) = &err else { return err };
    let msg = e.message();
    if msg.contains("answered 401") {
        GitError::SignInAgain
    } else if msg.contains("answered 403") || msg.contains("answered 404") {
        match link {
            Some(l) => GitError::Refused(format!("No access to {}/{}.", l.owner, l.repo)),
            None => GitError::Refused("No access to that repository on GitHub.".into()),
        }
    } else if msg.contains("answered 5")
        || msg.contains("reach the server")
        || e.class() == git2::ErrorClass::Net
    {
        GitError::Offline
    } else {
        err
    }
}

fn link_of(root: &Path) -> Result<(String, String, Option<Link>)> {
    let meta = read_meta(root)?
        .ok_or_else(|| GitError::Refused("This folder isn’t a Spectrum project.".into()))?;
    let settings = read_project_settings(root).unwrap_or_default();
    let link = settings.extra.get("github").and_then(|l| {
        let (owner, repo) = (l["owner"].as_str()?, l["repo"].as_str()?);
        (valid_name(owner) && valid_name(repo)).then(|| Link {
            owner: owner.into(),
            repo: repo.into(),
            project_id: l["projectId"].as_str().unwrap_or_default().into(),
            personal: l["personal"].as_bool(),
            here: l["projectId"].as_str() == Some(meta.id.as_str()),
        })
    });
    Ok((meta.id, meta.name, link))
}

fn write_link(root: &Path, owner: &str, repo: &str, project_id: &str) -> Result<()> {
    update_project_settings(root, |s| {
        let mut was = s
            .extra
            .get("github")
            .filter(|g| g["projectId"].as_str() == Some(project_id))
            .cloned()
            .unwrap_or(json!({}));
        if !was.is_object() {
            was = json!({});
        }
        was["owner"] = json!(owner);
        was["repo"] = json!(repo);
        was["projectId"] = json!(project_id);
        s.extra.insert("github".into(), was);
    })?;
    Ok(())
}

fn refuse_repo(root: &Path) -> Result<()> {
    refusal(root).map_or(Ok(()), |why| Err(GitError::Refused(why)))
}

impl ProjectSync {
    fn refuse_sync_folder(&self, folder: &Path) -> Result<()> {
        match place_of(folder, &self.home, &self.sync_roots) {
            Some(p) => {
                let label = p.provider.label();
                Err(GitError::Refused(format!(
                    "This folder is in {label}, and sync apps damage Git repositories. Move it out of {label} first."
                )))
            }
            None => Ok(()),
        }
    }

    fn linked_here(&self, root: &Path, link: Option<&Link>) -> bool {
        link.is_some_and(|l| {
            l.here
                && is_repo(root)
                && open(root).ok().and_then(|r| repo::remote_url(&r))
                    == Some(self.github.repo_url(&l.owner, &l.repo))
        })
    }

    /// The GitHub repository the project's own repository already sends to; one Spectrum can't use (SSH,
    /// another server) is left alone rather than changed.
    fn origin_repo(&self, root: &Path) -> Result<Option<RepoRef>> {
        let Some(url) = is_repo(root)
            .then(|| open(root).ok().and_then(|r| repo::remote_url(&r)))
            .flatten()
        else {
            return Ok(None);
        };
        let prefix = format!("{}/", self.github.web);
        let parsed = url
            .get(..prefix.len())
            .filter(|p| p.eq_ignore_ascii_case(&prefix))
            .and_then(|_| {
                let rest = url[prefix.len()..].trim_end_matches('/');
                let rest = rest.strip_suffix(".git").unwrap_or(rest);
                let (o, r) = rest.split_once('/')?;
                (valid_name(o) && valid_name(r)).then(|| RepoRef {
                    owner: o.into(),
                    repo: r.into(),
                })
            });
        parsed.map(Some).ok_or_else(|| GitError::Refused("This project’s repository already has an origin Spectrum can’t use (an SSH address or another server), so Spectrum leaves it alone.".into()))
    }

    /// The paths a commit holds back: in a shared repository the personal ones, until the user says yes.
    async fn holds_personal(&self, owner: &str, repo: &str, answer: Option<bool>) -> bool {
        match answer {
            Some(yes) => !yes,
            None => self.github.repo_shared(owner, repo).await.unwrap_or(true),
        }
    }

    fn message(&self, label: &str) -> String {
        let label: String = label.trim().chars().take(200).collect();
        if label.is_empty() {
            format!("Backup from {}", self.machine_name)
        } else {
            label
        }
    }

    async fn commit(
        &self,
        root: &Path,
        label: &str,
        hold_personal: bool,
        idle: bool,
        always: bool,
    ) -> Result<repo::Committed> {
        let (root, message, author) =
            (root.to_path_buf(), self.message(label), self.author.clone());
        blocking(move || {
            let hold = |rel: &str| {
                (hold_personal && personal(rel))
                    || (idle && {
                        let l = rel.to_ascii_lowercase();
                        l.starts_with(".spectrum/chats/") || l.starts_with(".spectrum/research/")
                    })
            };
            commit_all(
                &root,
                &CommitOptions {
                    message: &message,
                    author: &author,
                    hold: &hold,
                    always,
                    compiled: true,
                },
            )
        })
        .await
    }

    async fn fetch(&self, root: &Path, link: Option<&RepoRef>) -> Result<()> {
        let (root, token) = (root.to_path_buf(), self.github.token().to_owned());
        blocking(move || fetch_origin(&root, Some(&token)).map(|_| ()))
            .await
            .map_err(|e| transport_error(e, link))
    }

    async fn push(&self, root: &Path, link: Option<&RepoRef>) -> Result<bool> {
        let (root, token) = (root.to_path_buf(), self.github.token().to_owned());
        blocking(move || push_origin(&root, Some(&token)))
            .await
            .map_err(|e| transport_error(e, link))
    }

    async fn merge(
        &self,
        root: &Path,
        allow_deletions: bool,
        dry_run: bool,
        message: String,
    ) -> Result<PullResult> {
        let (root, author) = (root.to_path_buf(), self.author.clone());
        blocking(move || {
            merge_origin(
                &root,
                &MergeOptions {
                    author: &author,
                    allow_deletions,
                    dry_run,
                    base: None,
                    side: &|_| None,
                    message: &message,
                    checkpoint: true,
                },
            )
        })
        .await
    }

    /// Commit, fetch, commit again and merge: the pull's result.
    async fn pull_now(
        &self,
        root: &Path,
        link: &Link,
        allow_deletions: bool,
    ) -> Result<PullResult> {
        refuse_repo(root)?;
        let hold = self
            .holds_personal(&link.owner, &link.repo, link.personal)
            .await;
        let r = RepoRef {
            owner: link.owner.clone(),
            repo: link.repo.clone(),
        };
        self.fetch(root, Some(&r)).await?;
        self.commit(root, "", hold, false, false).await?;
        self.merge(
            root,
            allow_deletions,
            false,
            format!("Pull from GitHub on {}", self.machine_name),
        )
        .await
    }

    /// Push, and when GitHub has commits this computer hasn't, pull them in and push again.
    async fn push_now(&self, root: &Path, link: &Link) -> Result<Option<PullResult>> {
        let r = RepoRef {
            owner: link.owner.clone(),
            repo: link.repo.clone(),
        };
        if self.push(root, Some(&r)).await? {
            return Ok(None);
        }
        let pulled = self.pull_now(root, link, false).await?;
        if pulled.state != PullState::Confirm && !self.push(root, Some(&r)).await? {
            return Err(GitError::Refused("GitHub refused the push: it changed again meanwhile. Spectrum tries again shortly.".into()));
        }
        Ok(Some(pulled))
    }

    fn linked(&self, root: &Path) -> Result<Link> {
        let (_, _, link) = link_of(root)?;
        link.filter(|l| self.linked_here(root, Some(l)))
            .ok_or_else(|| GitError::Refused("This project isn’t linked to GitHub.".into()))
    }

    /// Back up: commit what changed and push. The first time, the project gets a private repository named
    /// after it and the link in its settings.json.
    pub async fn back_up(&self, root: &Path, o: &BackupOptions) -> Result<Backup> {
        let (id, name, link) = link_of(root)?;
        if !self.linked_here(root, link.as_ref()) {
            if let Some(l) = link.as_ref().filter(|l| l.here) {
                return Err(GitError::LinkFirst {
                    owner: l.owner.clone(),
                    repo: l.repo.clone(),
                });
            }
            self.refuse_sync_folder(root)?;
            if is_repo(root) {
                refuse_repo(root)?;
            } else {
                init_repo(root, "main", true)?;
            }
            // a repository of the user's own keeps its GitHub repository; a copy gets one of its own
            let existing = if link.is_none() {
                self.origin_repo(root)?
            } else {
                None
            };
            let created = if let Some(r) = existing {
                r
            } else {
                if let Some(other) = self
                    .github
                    .list_repo_projects()
                    .await?
                    .into_iter()
                    .find(|p| p.id == id)
                {
                    return Err(GitError::LinkFirst {
                        owner: other.owner,
                        repo: other.repo,
                    });
                }
                self.github.create_repo(&name, "A Spectrum project").await?
            };
            write_link(root, &created.owner, &created.repo, &id)?;
            repo::set_remote(
                &open(root)?,
                &self.github.repo_url(&created.owner, &created.repo),
            )?;
        }
        refuse_repo(root)?;
        let link = self.linked(root)?;
        let hold = self
            .holds_personal(&link.owner, &link.repo, link.personal)
            .await;
        let committed = self
            .commit(root, &o.label, hold, o.idle, !o.label.trim().is_empty())
            .await?;
        if o.quitting {
            return Ok(Backup {
                left: committed.left,
                pulled: None,
            });
        }
        let pulled = self.push_now(root, &link).await?;
        if let Some(p) = pulled.as_ref().filter(|p| p.state == PullState::Confirm) {
            return Err(GitError::WouldDelete(p.deleting));
        }
        Ok(Backup {
            left: committed.left,
            pulled,
        })
    }

    /// Pull: GitHub's changes merged in.
    pub async fn pull(&self, root: &Path, allow_deletions: bool) -> Result<PullResult> {
        let link = self.linked(root)?;
        self.pull_now(root, &link, allow_deletions).await
    }

    /// Sync: back up (chats and research too), pull, push.
    pub async fn sync(&self, root: &Path, allow_deletions: bool) -> Result<PullResult> {
        let link = self.linked(root)?;
        let result = self.pull_now(root, &link, allow_deletions).await?;
        if result.state != PullState::Confirm {
            self.push_now(root, &link).await?;
        }
        Ok(result)
    }

    /// Link the project to a repository that holds it (the other computer's copy): the same merge as a pull
    /// from nothing in common. `preview`: what it would do, writing nothing. The link is written, and origin
    /// kept, only once the merge has gone through.
    pub async fn link(
        &self,
        root: &Path,
        target: Option<RepoRef>,
        preview: bool,
        allow_deletions: bool,
    ) -> Result<PullResult> {
        let (id, _, current) = link_of(root)?;
        let mut target = target
            .or_else(|| {
                current.as_ref().map(|l| RepoRef {
                    owner: l.owner.clone(),
                    repo: l.repo.clone(),
                })
            })
            .filter(|t| valid_name(&t.owner) && valid_name(&t.repo))
            .ok_or_else(|| GitError::Refused("Choose a repository to link.".into()))?;
        self.refuse_sync_folder(root)?;
        if is_repo(root) {
            refuse_repo(root)?;
        } else {
            init_repo(root, "main", false)?;
        }
        if let Some(origin) = self.origin_repo(root)?
            && (!origin.owner.eq_ignore_ascii_case(&target.owner)
                || !origin.repo.eq_ignore_ascii_case(&target.repo))
        {
            // one repository under two names, as GitHub answers for the old one after a rename
            let was = self.github.repo(&origin.owner, &origin.repo).await.ok();
            let now = self.github.repo(&target.owner, &target.repo).await.ok();
            let full = now
                .as_ref()
                .and_then(|n| n["full_name"].as_str())
                .unwrap_or_default()
                .to_owned();
            let same = matches!((&was, &now), (Some(w), Some(n)) if w["id"].is_u64() && w["id"] == n["id"]);
            match full.split_once('/') {
                Some((o, r)) if same && valid_name(o) && valid_name(r) => {
                    target = RepoRef {
                        owner: o.into(),
                        repo: r.into(),
                    }
                }
                _ => {
                    return Err(GitError::Refused(format!(
                        "This project’s repository already sends its commits to {}/{}.",
                        origin.owner, origin.repo
                    )));
                }
            }
        }
        let before = repo::remote_url(&open(root)?);
        repo::set_remote(
            &open(root)?,
            &self.github.repo_url(&target.owner, &target.repo),
        )?;
        let answer = current.as_ref().filter(|l| l.here).and_then(|l| l.personal);
        let result = self
            .link_inner(root, &target, &id, answer, preview, allow_deletions)
            .await;
        let linked = matches!(&result, Ok(r) if r.state == PullState::Merged || r.state == PullState::Current)
            && !preview;
        if !linked {
            let r = open(root)?;
            match before {
                Some(url) => repo::set_remote(&r, &url)?,
                None => {
                    let _ = repo::delete_remote(&r);
                }
            }
        }
        result
    }

    async fn link_inner(
        &self,
        root: &Path,
        target: &RepoRef,
        id: &str,
        answer: Option<bool>,
        preview: bool,
        allow: bool,
    ) -> Result<PullResult> {
        let hold = self
            .holds_personal(&target.owner, &target.repo, answer)
            .await;
        self.commit(root, "", hold, false, false).await?;
        self.fetch(root, Some(target)).await?;
        if preview {
            return self.merge(root, false, true, String::new()).await;
        }
        self.commit(root, "", hold, false, false).await?;
        let merged = self
            .merge(root, allow, false, "Link with GitHub".into())
            .await?;
        if merged.state == PullState::Confirm {
            return Ok(merged);
        }
        write_link(root, &target.owner, &target.repo, id)?;
        self.commit(root, "", hold, false, false).await?;
        let link = Link {
            owner: target.owner.clone(),
            repo: target.repo.clone(),
            project_id: id.into(),
            personal: answer,
            here: true,
        };
        self.push_now(root, &link).await?;
        Ok(merged)
    }

    /// The user's answer for a shared repository.
    pub fn set_personal(&self, root: &Path, yes: bool) -> Result<()> {
        let (_, _, link) = link_of(root)?;
        if !link.is_some_and(|l| l.here) {
            return Err(GitError::Refused(
                "This project isn’t linked to GitHub.".into(),
            ));
        }
        update_project_settings(root, |s| {
            if let Some(Value::Object(g)) = s.extra.get_mut("github") {
                g.insert("personal".into(), Value::Bool(yes));
            }
        })?;
        Ok(())
    }

    /// Initialise: git init on main, TeX's .gitignore and a first commit, without GitHub.
    pub fn initialise(&self, root: &Path) -> Result<()> {
        self.refuse_sync_folder(root)?;
        if is_repo(root) {
            return Err(GitError::Refused(
                "This project is already a Git repository.".into(),
            ));
        }
        init_repo(root, "main", true)?;
        commit_all(
            root,
            &CommitOptions {
                message: "First commit",
                author: &self.author,
                hold: &|_| false,
                always: false,
                compiled: true,
            },
        )?;
        Ok(())
    }

    /// What the GitHub tab shows, after checking GitHub (offline, as of the last check).
    pub async fn status(&self, root: &Path) -> Result<ProjectStatus> {
        let (_, _, link) = link_of(root)?;
        let repo = is_repo(root);
        let refusal = if repo { refusal(root) } else { None };
        let linked = refusal.is_none() && self.linked_here(root, link.as_ref());
        let as_ref = |l: &Link| RepoRef {
            owner: l.owner.clone(),
            repo: l.repo.clone(),
        };
        if linked {
            let _ = self.fetch(root, link.as_ref().map(as_ref).as_ref()).await;
        }
        let (ahead, behind) = if linked { ahead_behind(root)? } else { (0, 0) };
        let last_backup = if linked {
            open(root)
                .ok()
                .and_then(|r| repo::commit_time(&r, repo::remote_head(&r)))
        } else {
            None
        };
        Ok(ProjectStatus {
            repo,
            refusal,
            linked,
            link: link.as_ref().filter(|l| l.here).map(as_ref),
            copy_of: link.as_ref().filter(|l| !l.here).map(as_ref),
            ahead,
            behind,
            last_backup,
            sync_folder: place_of(root, &self.home, &self.sync_roots)
                .map(|p| p.provider.label().to_owned()),
            personal: link.and_then(|l| l.personal),
        })
    }

    /// Get from GitHub: the repository cloned into a new folder in `parent`, registered with the id its
    /// project.json has. Refused when that project is already here (`registry_file` lists it).
    pub async fn get_from_github(
        &self,
        owner: &str,
        repo: &str,
        parent: &Path,
        registry_file: &Path,
    ) -> Result<PathBuf> {
        if !valid_name(owner) || !valid_name(repo) {
            return Err(GitError::Refused("Choose a repository.".into()));
        }
        let meta: Value = self
            .github
            .repo_file(owner, repo, ".spectrum/project.json")
            .await?
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or(Value::Null);
        let Some(id) = meta["id"].as_str().filter(|s| !s.is_empty()) else {
            return Err(GitError::Refused(format!(
                "{owner}/{repo} isn’t a Spectrum project."
            )));
        };
        let name = meta["name"].as_str().unwrap_or(repo).to_owned();
        if spectrum_core::project::load_registry(registry_file)?
            .projects
            .iter()
            .any(|p| p.id == id)
        {
            return Err(GitError::Refused(format!(
                "“{name}” is already on this computer. Link it from its GitHub tab instead."
            )));
        }
        std::fs::create_dir_all(parent).map_err(|e| GitError::io("create", parent, e))?;
        self.refuse_sync_folder(parent)?;
        let real = std::fs::canonicalize(parent).map_err(|e| GitError::io("open", parent, e))?;
        let target = make_unique_folder(&real, &sanitise_folder_name(&name))?;
        let (url, token, dir) = (
            self.github.repo_url(owner, repo),
            self.github.token().to_owned(),
            target.clone(),
        );
        let r = RepoRef {
            owner: owner.into(),
            repo: repo.into(),
        };
        let cloned = blocking(move || repo::clone_into(&dir, &url, Some(&token)))
            .await
            .map_err(|e| transport_error(e, Some(&r)));
        let done = cloned.and_then(|()| {
            let meta = read_meta(&target)?.ok_or_else(|| {
                GitError::Refused(format!("{owner}/{repo} isn’t a Spectrum project."))
            })?;
            register(registry_file, &target, &meta)?;
            Ok(())
        });
        if let Err(e) = done {
            let _ = std::fs::remove_dir_all(&target);
            return Err(e);
        }
        Ok(target)
    }
}
