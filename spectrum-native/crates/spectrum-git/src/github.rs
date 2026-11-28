//! GitHub's REST API (2.8's `githubService.js`): the account, a project's private repository, whether a
//! repository is shared, and the user's repositories that are Spectrum projects. Async (reqwest); run it on
//! the app's Tokio runtime. The token is the caller's, from [`GitHubAuth`].

mod auth;
mod device;

use std::time::Duration;

use base64::Engine;
use serde_json::{Value, json};

pub use auth::{Account, AuthStatus, GitHubAuth};
pub use device::{
    DeviceCode, DevicePoll, client_id, poll_device, start_device_sign_in, wait_for_device,
};

use crate::error::{GitError, Result};

pub const GITHUB_API: &str = "https://api.github.com";
pub const GITHUB_WEB: &str = "https://github.com";

/// 2.8's repository name rule.
pub(crate) fn valid_name(name: &str) -> bool {
    (1..=100).contains(&name.len())
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'-'))
}

/// A repository on GitHub.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepoRef {
    pub owner: String,
    pub repo: String,
}

/// A repository that holds a Spectrum project (it carries `.spectrum/project.json`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepoProject {
    pub owner: String,
    pub repo: String,
    pub url: String,
    pub private: bool,
    pub pushed_at: String,
    /// The project's id and name from its project.json.
    pub id: String,
    pub name: String,
}

/// GitHub's API and web addresses (the defaults, or a test's local server) and the token to call with.
#[derive(Clone)]
pub struct GitHub {
    http: reqwest::Client,
    pub(crate) api: String,
    pub(crate) web: String,
    token: String,
}

pub(crate) fn http_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("Spectrum")
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| GitError::Offline)
}

pub(crate) fn offline(err: &reqwest::Error) -> GitError {
    tracing::warn!(err = %err, "GitHub unreachable");
    GitError::Offline
}

impl GitHub {
    pub fn new(token: impl Into<String>) -> Result<Self> {
        Self::with_bases(GITHUB_API, GITHUB_WEB, token)
    }

    /// Another API and web address (a test's server, GitHub Enterprise).
    pub fn with_bases(api: &str, web: &str, token: impl Into<String>) -> Result<Self> {
        Ok(Self {
            http: http_client()?,
            api: api.trim_end_matches('/').into(),
            web: web.trim_end_matches('/').into(),
            token: token.into(),
        })
    }

    pub(crate) fn token(&self) -> &str {
        &self.token
    }

    /// The repository's clone address, which origin gets.
    pub fn repo_url(&self, owner: &str, repo: &str) -> String {
        format!("{}/{owner}/{repo}.git", self.web)
    }

    /// A call to the REST API, with GitHub's own message when it refuses.
    pub(crate) async fn api(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value> {
        let mut req = self
            .http
            .request(method, format!("{}{path}", self.api))
            .header("accept", "application/vnd.github+json")
            .header("x-github-api-version", "2022-11-28")
            .bearer_auth(&self.token);
        if let Some(body) = body {
            req = req.json(&body);
        }
        let res = req.send().await.map_err(|e| offline(&e))?;
        let status = res.status().as_u16();
        let data: Value = res.json().await.unwrap_or(Value::Null);
        if status == 401 {
            return Err(GitError::SignInAgain);
        }
        if !(200..300).contains(&status) {
            let message = data["errors"][0]["message"]
                .as_str()
                .or(data["message"].as_str())
                .map_or_else(|| format!("GitHub answered {status}."), str::to_owned);
            return Err(GitError::GitHub { status, message });
        }
        Ok(data)
    }

    async fn get(&self, path: &str) -> Result<Value> {
        self.api(reqwest::Method::GET, path, None).await
    }

    /// The signed-in account.
    pub async fn user(&self) -> Result<Account> {
        let u = self.get("/user").await?;
        Ok(Account {
            login: u["login"].as_str().unwrap_or_default().into(),
            id: u["id"].as_u64().unwrap_or(0),
            name: u["name"].as_str().unwrap_or_default().into(),
        })
    }

    /// A repository's details as GitHub gives them.
    pub async fn repo(&self, owner: &str, repo: &str) -> Result<Value> {
        self.get(&format!("/repos/{owner}/{repo}")).await
    }

    /// A private repository named after the project (`paper-2` when `paper` is taken).
    pub async fn create_repo(&self, project_name: &str, description: &str) -> Result<RepoRef> {
        let base = repo_name(project_name);
        for n in 1..=20 {
            let name = if n == 1 {
                base.clone()
            } else {
                format!("{base}-{n}")
            };
            // private must be said: GitHub makes a public one otherwise
            let body = json!({ "name": name, "private": true, "description": description, "auto_init": false });
            match self
                .api(reqwest::Method::POST, "/user/repos", Some(body))
                .await
            {
                Ok(made) => {
                    return Ok(RepoRef {
                        owner: made["owner"]["login"].as_str().unwrap_or_default().into(),
                        repo: made["name"].as_str().unwrap_or(&name).into(),
                    });
                }
                Err(GitError::GitHub { status: 422, .. }) => {}
                Err(e) => return Err(e),
            }
        }
        Err(GitError::Refused(
            "Couldn’t find a free name for the repository on GitHub.".into(),
        ))
    }

    /// Whether a repository is public or has other collaborators (someone else's counts as shared).
    pub async fn repo_shared(&self, owner: &str, repo: &str) -> Result<bool> {
        let info = self.repo(owner, repo).await?;
        // only an admin may list collaborators
        let people = self
            .get(&format!("/repos/{owner}/{repo}/collaborators?per_page=2"))
            .await;
        let many = people.map_or(true, |p| p.as_array().is_none_or(|a| a.len() > 1));
        Ok(info["private"] != Value::Bool(true) || many)
    }

    /// A file of a repository's default branch, as text, or `None`.
    pub async fn repo_file(&self, owner: &str, repo: &str, rel: &str) -> Result<Option<String>> {
        let path: Vec<String> = rel.split('/').map(encode_component).collect();
        match self
            .get(&format!(
                "/repos/{owner}/{repo}/contents/{}",
                path.join("/")
            ))
            .await
        {
            Ok(data) => {
                let content: String = data["content"]
                    .as_str()
                    .unwrap_or_default()
                    .chars()
                    .filter(|c| !c.is_whitespace())
                    .collect();
                Ok(base64::engine::general_purpose::STANDARD
                    .decode(content)
                    .ok()
                    .map(|b| String::from_utf8_lossy(&b).into_owned()))
            }
            Err(GitError::GitHub { status: 404, .. }) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// The user's repositories that are Spectrum projects, most recently pushed first.
    // ponytail: the 100 most recently pushed; page on if someone has more
    pub async fn list_repo_projects(&self) -> Result<Vec<RepoProject>> {
        let repos = self
            .get("/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator")
            .await?;
        let mut found = Vec::new();
        for r in repos.as_array().into_iter().flatten() {
            let (Some(owner), Some(name)) = (r["owner"]["login"].as_str(), r["name"].as_str())
            else {
                continue;
            };
            if self
                .repo_file(owner, name, ".spectrum/settings.json")
                .await
                .ok()
                .flatten()
                .is_none()
            {
                continue;
            }
            let meta: Value = self
                .repo_file(owner, name, ".spectrum/project.json")
                .await
                .ok()
                .flatten()
                .and_then(|t| serde_json::from_str(&t).ok())
                .unwrap_or(Value::Null);
            let id = match &meta["id"] {
                Value::String(s) if !s.is_empty() => s.clone(),
                Value::Number(n) => n.to_string(),
                _ => continue,
            };
            found.push(RepoProject {
                owner: owner.into(),
                repo: name.into(),
                url: format!("{}/{owner}/{name}", self.web),
                private: r["private"] == Value::Bool(true),
                pushed_at: r["pushed_at"].as_str().unwrap_or_default().into(),
                id,
                name: meta["name"].as_str().unwrap_or(name).into(),
            });
        }
        found.sort_by(|a, b| b.pushed_at.cmp(&a.pushed_at));
        Ok(found)
    }
}

fn encode_component(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
                char::from(b).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}

/// A project's name as a repository name: accents dropped, other characters to '-', at most 80.
fn repo_name(project: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    let folded: String = spectrum_core::project::sanitise_folder_name(project)
        .nfkd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .collect();
    let mut out = String::new();
    let mut run = false;
    for c in folded.chars() {
        let keep = c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-');
        if keep {
            out.push(c);
        } else if !run {
            out.push('-');
        }
        run = !keep;
    }
    let trimmed: String = out
        .trim_matches(|c| c == '-' || c == '.')
        .chars()
        .take(80)
        .collect();
    if trimmed.is_empty() {
        "spectrum-project".into()
    } else {
        trimmed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repository_names() {
        assert_eq!(repo_name("Café thesis: chapter 2"), "Cafe-thesis-chapter-2");
        assert_eq!(repo_name("论文"), "spectrum-project");
        assert!(valid_name("paper-2.v1") && !valid_name("a/b") && !valid_name(""));
        assert_eq!(encode_component("a b"), "a%20b");
    }
}
