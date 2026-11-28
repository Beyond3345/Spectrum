//! GitHub against a local server answering with recorded GitHub replies (no network): the device sign-in,
//! a pasted token, the API's refusals, and Back up / Get from GitHub / Sync between two computers through a
//! bare repository standing in for GitHub's Git side.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::similar_names,
    clippy::format_collect
)]

#[path = "support/server.rs"]
mod server;

use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use base64::Engine;
use serde_json::{Value, json};
use server::{Server, json as reply};
use spectrum_core::AppPaths;
use spectrum_core::keystore::{KeyStore, SecretStore};
use spectrum_git::github::{self, DevicePoll, GitHub, GitHubAuth};
use spectrum_git::{Author, BackupOptions, GitError, ProjectSync};

fn fixture(name: &str) -> Value {
    serde_json::from_slice(
        &fs::read(format!(
            "{}/tests/fixtures/{name}",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap(),
    )
    .unwrap()
}

#[derive(Default)]
struct FakeStore(Mutex<Option<String>>);

impl SecretStore for FakeStore {
    fn read(&self) -> Result<Option<String>, spectrum_core::CoreError> {
        Ok(self.0.lock().unwrap().clone())
    }
    fn write(&self, text: &str) -> Result<(), spectrum_core::CoreError> {
        *self.0.lock().unwrap() = Some(text.to_owned());
        Ok(())
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn the_device_sign_in_shows_githubs_code_and_finishes_once_entered() {
    let polls = AtomicUsize::new(0);
    let server = Server::start(move |req| match req.path.as_str() {
        "/login/device/code" => reply(200, fixture("device_code.json")),
        "/login/oauth/access_token" => match polls.fetch_add(1, Ordering::SeqCst) {
            0 => reply(200, json!({ "error": "authorization_pending", "error_description": "The authorization request is still pending." })),
            1 => reply(200, json!({ "error": "slow_down", "interval": 10 })),
            _ => reply(200, json!({ "access_token": "gho_16C7e42F292c6912E7710c838347Ae178B4a", "token_type": "bearer", "scope": "repo,read:user" })),
        },
        _ => reply(404, json!({})),
    })
    .await;
    let mut code = github::start_device_sign_in(&server.base).await.unwrap();
    assert_eq!(code.user_code, "WDJB-MJHT");
    assert_eq!(code.verification_uri, "https://github.com/login/device");
    assert_eq!(code.interval.as_secs(), 5);
    assert_eq!(
        github::poll_device(&server.base, &mut code).await.unwrap(),
        DevicePoll::Waiting
    );
    assert_eq!(
        github::poll_device(&server.base, &mut code).await.unwrap(),
        DevicePoll::SlowDown
    );
    assert_eq!(code.interval.as_secs(), 10, "slower when GitHub says so");
    assert_eq!(
        github::poll_device(&server.base, &mut code).await.unwrap(),
        DevicePoll::Token("gho_16C7e42F292c6912E7710c838347Ae178B4a".into())
    );
    let reqs = server.requests();
    let start = reqs[0].json();
    assert_eq!(start["client_id"].as_str(), github::client_id().as_deref());
    assert_eq!(start["scope"], "repo read:user");
    assert!(start.get("client_secret").is_none(), "no client secret");
    assert_eq!(
        reqs[1].json()["grant_type"],
        "urn:ietf:params:oauth:grant-type:device_code"
    );
    assert_eq!(
        reqs[1].json()["device_code"],
        "3584d83530557fdd1f46af8289938c8ef79f9dc5"
    );

    let denied = Server::start(|req| match req.path.as_str() {
        "/login/device/code" => reply(200, fixture("device_code.json")),
        _ => reply(200, json!({ "error": "access_denied" })),
    })
    .await;
    let mut code = github::start_device_sign_in(&denied.base).await.unwrap();
    assert_eq!(
        github::poll_device(&denied.base, &mut code).await.unwrap(),
        DevicePoll::Denied
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_token_signs_in_into_the_keystore_and_2_8s_github_json_moves_there() {
    let server = Server::start(|req| {
        match (
            req.headers.get("authorization").map(String::as_str),
            req.path.as_str(),
        ) {
            (Some("Bearer ghp_good_token_0123456789"), "/user") => reply(200, fixture("user.json")),
            _ => reply(401, fixture("bad_credentials.json")),
        }
    })
    .await;
    let dir = tempfile::tempdir().unwrap();
    let paths = AppPaths::new(
        dir.path().join("data"),
        dir.path().join("logs"),
        dir.path().join("projects"),
    );
    let keys = KeyStore::new(FakeStore::default());
    let auth = GitHubAuth::new(&paths, &keys);
    assert!(matches!(auth.token(), Err(GitError::SignedOut)));
    assert!(matches!(
        auth.sign_in_with_token("short", &server.base, &server.base)
            .await,
        Err(GitError::Refused(_))
    ));
    assert!(
        matches!(auth.sign_in_with_token("ghp_bad_token_00000000000", &server.base, &server.base).await, Err(GitError::Refused(m)) if m.contains("didn’t accept"))
    );
    let status = auth
        .sign_in_with_token(" ghp_good_token_0123456789 ", &server.base, &server.base)
        .await
        .unwrap();
    assert!(status.signed_in && status.settings_repo);
    assert_eq!(
        (status.login.as_str(), status.name.as_str()),
        ("octocat", "The Octocat")
    );
    let file = fs::read_to_string(paths.data_dir.join("github.json")).unwrap();
    assert!(!file.contains("ghp_"), "the token isn’t in github.json");
    assert_eq!(auth.token().unwrap(), "ghp_good_token_0123456789");
    assert_eq!(
        auth.author("Mac").email,
        "583231+octocat@users.noreply.github.com"
    );
    auth.set_settings_repo(false).unwrap();
    auth.sign_out().unwrap();
    assert!(!auth.status().signed_in);
    assert!(
        !auth.status().settings_repo,
        "the switch outlives a sign-out"
    );

    // 2.8 kept the token in github.json
    fs::write(
        paths.data_dir.join("github.json"),
        r#"{"token":"ghp_from_2_8_xxxxxxxxxxxx","user":{"login":"octocat","id":583231,"name":""}}"#,
    )
    .unwrap();
    assert_eq!(auth.token().unwrap(), "ghp_from_2_8_xxxxxxxxxxxx");
    assert!(
        !fs::read_to_string(paths.data_dir.join("github.json"))
            .unwrap()
            .contains("ghp_")
    );
    assert_eq!(
        auth.token().unwrap(),
        "ghp_from_2_8_xxxxxxxxxxxx",
        "now from the keystore"
    );
    assert_eq!(auth.author("Mac").name, "octocat");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(paths.data_dir.join("github.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn githubs_refusals_say_what_to_do_and_a_network_failure_only_waits() {
    let server = Server::start(|req| match req.path.as_str() {
        "/user" => reply(401, fixture("bad_credentials.json")),
        "/repos/o/r" => reply(404, json!({ "message": "Not Found" })),
        "/repos/o/busy" => reply(503, json!({})),
        _ => reply(404, json!({})),
    })
    .await;
    let gh = GitHub::with_bases(&server.base, &server.base, "t").unwrap();
    assert!(matches!(gh.user().await, Err(GitError::SignInAgain)));
    assert!(
        matches!(gh.repo("o", "r").await, Err(GitError::GitHub { status: 404, message }) if message == "Not Found")
    );
    let busy = gh.repo("o", "busy").await.unwrap_err();
    assert!(busy.is_waiting());
    let nowhere = GitHub::with_bases("http://127.0.0.1:9", "http://127.0.0.1:9", "t").unwrap();
    let offline = nowhere.user().await.unwrap_err();
    assert!(matches!(offline, GitError::Offline) && offline.is_waiting());
}

fn write(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

/// A stand-in GitHub API for one repository; POST /user/repos refuses the first name as taken.
async fn fake_api(project_json: String) -> Server {
    let posts = AtomicUsize::new(0);
    Server::start(move |req| {
        let path = req.path.split('?').next().unwrap_or("");
        match (req.method.as_str(), path) {
            ("GET", "/user/repos") => reply(200, json!([])),
            ("POST", "/user/repos") => {
                if posts.fetch_add(1, Ordering::SeqCst) == 0 {
                    return reply(422, fixture("name_taken.json"));
                }
                let mut made = fixture("repo_created.json");
                made["name"] = req.json()["name"].clone();
                assert_eq!(req.json()["private"], true, "private must be said");
                reply(201, made)
            }
            ("GET", "/repos/octocat/Paper-2") => reply(200, json!({ "id": 1, "full_name": "octocat/Paper-2", "private": true })),
            ("GET", "/repos/octocat/Paper-2/collaborators") => reply(200, json!([{ "login": "octocat" }])),
            ("GET", "/repos/octocat/Paper-2/contents/.spectrum/project.json") => {
                reply(200, json!({ "content": base64::engine::general_purpose::STANDARD.encode(&project_json), "encoding": "base64" }))
            }
            _ => reply(404, json!({ "message": "Not Found" })),
        }
    })
    .await
}

#[tokio::test(flavor = "multi_thread")]
async fn back_up_makes_a_private_repository_and_the_other_computer_gets_and_syncs_it() {
    let dir = tempfile::tempdir().unwrap();
    let tmp = dir.path();
    let project = json!({ "id": "p1", "name": "Paper", "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-01T00:00:00.000Z" }).to_string();
    let api = fake_api(project.clone()).await;
    // GitHub's Git side: a bare repository where the API said it made one
    let web = tmp.join("gh");
    git2::Repository::init_bare(web.join("octocat").join("Paper-2.git")).unwrap();
    let web_url = format!("file://{}", web.to_str().unwrap().replace('\\', "/"));
    let web_url = if web_url.starts_with("file:///") {
        web_url
    } else {
        web_url.replacen("file://", "file:///", 1)
    };
    let gh = GitHub::with_bases(&api.base, &web_url, "ghp_token").unwrap();
    let engine = |name: &str| ProjectSync {
        github: gh.clone(),
        author: Author {
            name: "The Octocat".into(),
            email: "583231+octocat@users.noreply.github.com".into(),
        },
        machine_name: name.into(),
        home: tmp.join("home"),
        sync_roots: Vec::new(),
    };
    let (mac, win) = (engine("Mac"), engine("Windows"));

    let a = tmp.join("A");
    write(&a, ".spectrum/project.json", &project);
    write(&a, "main.tex", "\\documentclass{article}\nHello\n");
    write(
        &a,
        ".spectrum/chats/c1.json",
        r#"{"id":"c1","messages":[]}"#,
    );
    let done = mac
        .back_up(
            &a,
            &BackupOptions {
                label: String::new(),
                idle: true,
                quitting: false,
            },
        )
        .await
        .unwrap();
    assert_eq!(done.left, [] as [std::string::String; 0]);
    let settings: Value =
        serde_json::from_str(&fs::read_to_string(a.join(".spectrum/settings.json")).unwrap())
            .unwrap();
    assert_eq!(
        settings["github"],
        json!({ "owner": "octocat", "repo": "Paper-2", "projectId": "p1" })
    );
    let bare = git2::Repository::open_bare(web.join("octocat/Paper-2.git")).unwrap();
    let head = bare
        .find_commit(bare.refname_to_id("refs/heads/main").unwrap())
        .unwrap();
    assert_eq!(head.message().unwrap(), "Backup from Mac");
    let tree = head.tree().unwrap();
    assert!(tree.get_path(Path::new("main.tex")).is_ok());
    assert!(
        tree.get_path(Path::new(".spectrum/settings.json")).is_ok(),
        "the link travels with the project"
    );
    assert!(
        tree.get_path(Path::new(".spectrum/chats/c1.json")).is_err(),
        "an idle backup leaves chats for Sync"
    );
    assert!(tree.get_path(Path::new(".gitignore")).is_ok());
    let status = mac.status(&a).await.unwrap();
    assert!(status.linked && status.ahead == 0 && status.behind == 0);
    assert!(status.last_backup.is_some());

    // the other computer: Get from GitHub clones it with the project's id and registers it
    let registry = tmp.join("data").join("registry.json");
    let b = win
        .get_from_github("octocat", "Paper-2", &tmp.join("projects"), &registry)
        .await
        .unwrap();
    assert_eq!(
        fs::read_to_string(b.join("main.tex")).unwrap(),
        "\\documentclass{article}\nHello\n"
    );
    assert!(fs::read_to_string(&registry).unwrap().contains("\"p1\""));
    assert!(
        matches!(win.get_from_github("octocat", "Paper-2", &tmp.join("projects"), &registry).await, Err(GitError::Refused(m)) if m.contains("already on this computer"))
    );

    // edits on both sides come together
    write(
        &b,
        "main.tex",
        "\\documentclass{article}\nHello from Windows\n",
    );
    win.sync(&b, false).await.unwrap();
    write(&a, "notes.tex", "Mac notes\n");
    let pulled = mac.sync(&a, false).await.unwrap();
    assert_eq!(pulled.state, spectrum_git::PullState::Merged);
    assert_eq!(
        fs::read_to_string(a.join("main.tex")).unwrap(),
        "\\documentclass{article}\nHello from Windows\n"
    );
    win.pull(&b, false).await.unwrap();
    assert_eq!(
        fs::read_to_string(b.join("notes.tex")).unwrap(),
        "Mac notes\n"
    );

    // a copy of the project (its own id) isn't linked by the original's settings
    let c = tmp.join("C");
    write(
        &c,
        ".spectrum/project.json",
        &project.replace("\"p1\"", "\"p2\""),
    );
    fs::copy(
        a.join(".spectrum/settings.json"),
        c.join(".spectrum/settings.json"),
    )
    .unwrap();
    let copy = mac.status(&c).await.unwrap();
    assert!(!copy.linked);
    assert_eq!(copy.copy_of.unwrap().repo, "Paper-2");
}

/// pkt-line framing for the fake smart-HTTP server.
fn pkt(s: &str) -> String {
    format!("{:04x}{s}", s.len() + 4)
}

#[tokio::test(flavor = "multi_thread")]
async fn the_https_transport_fetches_over_reqwest_with_the_token_as_a_header() {
    // a repository to serve
    let dir = tempfile::tempdir().unwrap();
    let src = git2::Repository::init(dir.path().join("src")).unwrap();
    fs::write(dir.path().join("src/main.tex"), "served\n").unwrap();
    let mut index = src.index().unwrap();
    index.add_path(Path::new("main.tex")).unwrap();
    let tree = src.find_tree(index.write_tree().unwrap()).unwrap();
    let sig = git2::Signature::now("A", "a@x").unwrap();
    let head = src
        .commit(Some("refs/heads/main"), &sig, &sig, "First", &tree, &[])
        .unwrap();
    let mut pack = Vec::new();
    {
        let mut pb = src.packbuilder().unwrap();
        let mut walk = src.revwalk().unwrap();
        walk.push(head).unwrap();
        pb.insert_walk(&mut walk).unwrap();
        let mut buf = git2::Buf::new();
        pb.write_buf(&mut buf).unwrap();
        pack.extend_from_slice(&buf);
    }
    let refs = format!(
        "{}0000{}{}0000",
        pkt("# service=git-upload-pack\n"),
        pkt(&format!(
            "{head} HEAD\0symref=HEAD:refs/heads/main agent=git/2.40\n"
        )),
        pkt(&format!("{head} refs/heads/main\n"))
    );
    let server = Server::start(move |req| {
        let auth = req
            .headers
            .get("authorization")
            .cloned()
            .unwrap_or_default();
        let want = format!(
            "Basic {}",
            base64::engine::general_purpose::STANDARD.encode("x-access-token:ghp_secret")
        );
        if auth != want {
            return (401, Vec::new());
        }
        match (req.method.as_str(), req.path.as_str()) {
            ("GET", "/octocat/paper.git/info/refs?service=git-upload-pack") => {
                (200, refs.clone().into_bytes())
            }
            ("POST", "/octocat/paper.git/git-upload-pack") => {
                (200, [b"0008NAK\n".as_slice(), &pack].concat())
            }
            _ => (404, Vec::new()),
        }
    })
    .await;
    let api = Server::start(|req| match req.path.as_str() {
        "/repos/octocat/paper/contents/.spectrum/project.json" => {
            reply(200, json!({ "content": base64::engine::general_purpose::STANDARD.encode(r#"{"id":"p9","name":"Served"}"#) }))
        }
        _ => reply(404, json!({})),
    })
    .await;
    let engine = ProjectSync {
        github: GitHub::with_bases(&api.base, &server.base, "ghp_secret").unwrap(),
        author: Author {
            name: "A".into(),
            email: "a@x".into(),
        },
        machine_name: "Mac".into(),
        home: dir.path().join("home"),
        sync_roots: Vec::new(),
    };
    // the served repository has no project.json, so registering fails after the clone and the folder goes;
    // what matters here is that the clone came through the transport with the header
    let got = engine
        .get_from_github(
            "octocat",
            "paper",
            &dir.path().join("projects"),
            &dir.path().join("registry.json"),
        )
        .await;
    assert!(
        matches!(&got, Err(GitError::Refused(m)) if m.contains("isn’t a Spectrum project")),
        "cloned, then refused for lacking project.json: {got:?}"
    );
    let reqs = server.requests();
    assert!(
        reqs.iter().any(|r| r.method == "POST"),
        "the pack was fetched"
    );
    assert!(reqs.iter().all(|r| {
        r.headers
            .get("user-agent")
            .is_some_and(|u| u.starts_with("git/"))
    }));
    assert!(
        reqs.iter().all(|r| !r.path.contains("ghp_secret")),
        "never in the URL"
    );

    // a wrong token: GitHub's 401 reads as signing in again
    let wrong = ProjectSync {
        github: GitHub::with_bases(&api.base, &server.base, "ghp_wrong").unwrap(),
        ..engine.clone()
    };
    let refused = wrong
        .get_from_github(
            "octocat",
            "paper",
            &dir.path().join("projects"),
            &dir.path().join("registry.json"),
        )
        .await;
    assert!(matches!(refused, Err(GitError::SignInAgain)), "{refused:?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn the_settings_repository_is_made_private_and_carries_personas_and_skills_without_keys() {
    let dir = tempfile::tempdir().unwrap();
    let tmp = dir.path();
    let made = std::sync::atomic::AtomicBool::new(false);
    let api = Server::start(move |req| match (req.method.as_str(), req.path.as_str()) {
        ("GET", "/repos/octocat/spectrum-settings") if made.load(Ordering::SeqCst) => reply(
            200,
            json!({ "full_name": "octocat/spectrum-settings", "private": true }),
        ),
        ("GET", "/repos/octocat/spectrum-settings") => {
            reply(404, json!({ "message": "Not Found" }))
        }
        ("POST", "/user/repos") => {
            assert_eq!(req.json()["private"], true);
            made.store(true, Ordering::SeqCst);
            reply(
                201,
                json!({ "full_name": "octocat/spectrum-settings", "private": true }),
            )
        }
        _ => reply(404, json!({})),
    })
    .await;
    let web = tmp.join("gh");
    git2::Repository::init_bare(web.join("octocat").join("spectrum-settings.git")).unwrap();
    let web_url = format!(
        "file:///{}",
        web.to_str()
            .unwrap()
            .replace('\\', "/")
            .trim_start_matches('/')
    );
    let gh = GitHub::with_bases(&api.base, &web_url, "ghp_token").unwrap();
    let author = Author {
        name: "The Octocat".into(),
        email: "583231+octocat@users.noreply.github.com".into(),
    };
    let computer = |name: &str| {
        let machine = spectrum_git::Machine {
            id: format!("{name}-id"),
            name: name.into(),
        };
        spectrum_git::SettingsRepo::new(
            &tmp.join(name),
            gh.clone(),
            "octocat",
            author.clone(),
            machine,
        )
    };
    let (mac, win) = (computer("mac"), computer("win"));
    let (mac_skills, win_skills) = (tmp.join("mac/skills/own"), tmp.join("win/skills/own"));
    let persona = |id: &str, name: &str| json!({ "id": id, "name": name, "colour": "teal", "prompt": "Be kind." });
    let (a, b, starter) = (
        persona("a", "Reviewer"),
        persona("b", "Editor"),
        persona("research-writer", "Research writer"),
    );

    let first = mac.sync(&mac_skills).await.unwrap();
    assert!(first.ready && first.first);
    assert_eq!(
        mac.sync_personas(&[a.clone(), b.clone()]).unwrap(),
        (vec![a.clone(), b.clone()], false)
    );
    write(
        &mac_skills,
        "my-skill/SKILL.md",
        "---\nname: my-skill\n---\nDo it this way.\n",
    );
    write(&mac_skills, "my-skill/.env.example", "API_KEY=\n");
    mac.sync(&mac_skills).await.unwrap();
    let bare = git2::Repository::open_bare(web.join("octocat/spectrum-settings.git")).unwrap();
    let tree = bare
        .find_commit(bare.refname_to_id("refs/heads/main").unwrap())
        .unwrap()
        .tree()
        .unwrap();
    assert!(tree.get_path(Path::new("personas/a.json")).is_ok());
    assert!(
        tree.get_path(Path::new("skills/my-skill/files/SKILL.md"))
            .is_ok()
    );
    assert!(
        tree.get_path(Path::new("skills/my-skill/files/.env.example"))
            .is_err(),
        "never a key-looking file"
    );

    // the other computer: the repository's first, and its own go to it
    win.sync(&win_skills).await.unwrap();
    let (joined, changed) = win.sync_personas(std::slice::from_ref(&starter)).unwrap();
    assert_eq!(joined, vec![starter.clone(), a.clone(), b.clone()]);
    assert!(changed);
    assert!(
        fs::read_to_string(win_skills.join("my-skill/SKILL.md"))
            .unwrap()
            .contains("Do it this way")
    );
    assert!(!win_skills.join("my-skill/.env.example").exists());

    // deleted on Windows, so on the Mac too
    win.sync_personas(&[starter.clone(), a.clone()]).unwrap();
    win.sync(&win_skills).await.unwrap();
    mac.sync(&mac_skills).await.unwrap();
    let (mine, _) = mac.sync_personas(&[a.clone(), b.clone()]).unwrap();
    assert_eq!(mine, vec![a, starter]);
}
