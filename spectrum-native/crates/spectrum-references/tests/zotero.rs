//! Zotero against a stand-in for its local API, Better BibTeX's JSON-RPC and picker (2.8's zotero.test.js,
//! the main paths). Never the real Zotero.

#![allow(clippy::pedantic)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::too_many_lines)]

mod support;

use std::collections::HashSet;
use std::sync::Arc;

use parking_lot::Mutex;
use serde_json::{Value, json};
use spectrum_references::{Endpoints, Http, Status, SyncOptions, SyncOutcome, Zotero};
use support::{Reply, Request, Server, json as reply_json, text};

const SERVER_ID: &str = "server-7f3a";
const KEY: &str = "zoteroLocalKey123";

#[derive(Default)]
struct State {
    items: Vec<Value>,
    collections: Vec<Value>,
    bbt_keys: Vec<(String, String)>,
}

fn export(item: &Value, biblatex: bool) -> String {
    let d = &item["data"];
    let names: Vec<String> = d["creators"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| {
            if c.get("name").is_some() {
                format!("{{{}}}", c["name"].as_str().unwrap())
            } else {
                format!(
                    "{}, {}",
                    c["lastName"].as_str().unwrap(),
                    c["firstName"].as_str().unwrap()
                )
            }
        })
        .collect();
    let year: String = d["date"]
        .as_str()
        .unwrap_or("")
        .chars()
        .filter(char::is_ascii_digit)
        .take(4)
        .collect();
    let key = d.get("citationKey").and_then(Value::as_str).map_or_else(
        || format!("zotero{}", item["key"].as_str().unwrap().to_lowercase()),
        str::to_owned,
    );
    let mut fields = vec![
        format!("  title = {{{}}}", d["title"].as_str().unwrap()),
        format!("  author = {{{}}}", names.join(" and ")),
    ];
    fields.push(format!(
        "  {} = {{{year}}}",
        if biblatex { "date" } else { "year" }
    ));
    if let Some(doi) = d.get("DOI").and_then(Value::as_str) {
        fields.push(format!("  doi = {{{doi}}}"));
    }
    fields
        .push("  file = {/Users/someone/Zotero/storage/ABCD1234/paper.pdf:application/pdf}".into());
    format!("@article{{{key},\n{}\n}}\n", fields.join(",\n"))
}

fn handle(state: &Mutex<State>, req: &Request) -> Reply {
    let p = req.path.strip_prefix("/zotero").unwrap_or("");
    let body: Value = serde_json::from_str(&req.body).unwrap_or(Value::Null);
    let mut s = state.lock();
    if p == "/connector/ping" {
        return Reply {
            status: 200,
            headers: vec![("x-zotero-version".into(), "10.0.6".into())],
            body: "Zotero is running".into(),
        };
    }
    if p == "/better-bibtex/json-rpc" {
        let a = &body["params"][0];
        let result = match body["method"].as_str().unwrap_or("") {
            "api.ready" => json!({ "zotero": "10.0.6", "betterbibtex": "7.0.30" }),
            "item.citationkey" => Value::Object(
                a.as_array()
                    .unwrap()
                    .iter()
                    .map(|k| {
                        let k = k.as_str().unwrap().to_owned();
                        let v = s
                            .bbt_keys
                            .iter()
                            .find(|(i, _)| *i == k)
                            .map_or(Value::Null, |(_, c)| json!(c));
                        (k, v)
                    })
                    .collect(),
            ),
            "item.export" => {
                let want = a[0].as_str().unwrap();
                let biblatex = body["params"][1] == "Better BibLaTeX";
                let found = s.items.iter().find(|it| {
                    it["data"].get("citationKey").and_then(Value::as_str) == Some(want)
                        || s.bbt_keys.iter().any(|(i, c)| c == want && it["key"] == *i)
                });
                match found {
                    Some(it) => {
                        let mut it = it.clone();
                        it["data"]["citationKey"] = json!(want);
                        json!(export(&it, biblatex))
                    }
                    None => return reply_json(200, &json!({ "jsonrpc": "2.0", "id": 1, "error": { "code": -32603, "message": format!("{want} not found") } }).to_string()),
                }
            }
            _ => {
                return reply_json(
                    200,
                    r#"{"jsonrpc":"2.0","id":1,"error":{"message":"Method not found"}}"#,
                );
            }
        };
        return reply_json(
            200,
            &json!({ "jsonrpc": "2.0", "id": 1, "result": result }).to_string(),
        );
    }
    if p == "/better-bibtex/cayw" {
        return text(
            200,
            "text/plain",
            if req.q("probe").is_empty() {
                "\\parencite{lovelace1843}"
            } else {
                "ready"
            },
        );
    }
    if p == "/api/" {
        return Reply {
            status: 200,
            headers: vec![("zotero-server-id".into(), SERVER_ID.into())],
            body: "Nothing to see here.".into(),
        };
    }
    let write = req.method != "GET";
    if write && req.headers.get("zotero-server-id").map(String::as_str) != Some(SERVER_ID) {
        return text(428, "text/plain", "Zotero-Server-ID not provided");
    }
    if p == "/api/local/authorize" {
        return reply_json(200, &json!({ "key": KEY, "remember": true }).to_string());
    }
    if write && req.headers.get("zotero-api-key").map(String::as_str) != Some(KEY) {
        return text(401, "text/plain", "Invalid key");
    }
    let page = |list: Vec<Value>| {
        let start: usize = req.q("start").parse().unwrap_or(0);
        let limit: usize = req.q("limit").parse().unwrap_or(50);
        reply_json(
            200,
            &Value::Array(list.into_iter().skip(start).take(limit).collect()).to_string(),
        )
    };
    if p == "/api/users/0/items" && req.method == "GET" {
        let keys: Option<Vec<&str>> =
            (!req.q("itemKey").is_empty()).then(|| req.q("itemKey").split(',').collect());
        let q = req.q("q").to_lowercase();
        let list = s
            .items
            .iter()
            .filter(|it| {
                keys.as_ref()
                    .is_none_or(|k| k.contains(&it["key"].as_str().unwrap()))
                    && (q.is_empty()
                        || q.split_whitespace()
                            .all(|w| it["data"].to_string().to_lowercase().contains(w)))
            })
            .cloned()
            .collect();
        return page(list);
    }
    if p == "/api/users/0/items" {
        let mut out = json!({ "successful": {}, "failed": {} });
        for (i, data) in body.as_array().unwrap().iter().enumerate() {
            let key = format!("ITEM{:04}", s.items.len() + 1);
            let mut data = data.clone();
            data["key"] = json!(key);
            let item = json!({ "key": key, "version": 1, "data": data });
            s.items.push(item.clone());
            out["successful"][i.to_string()] = item;
        }
        return reply_json(200, &out.to_string());
    }
    if let Some(key) = p.strip_prefix("/api/users/0/items/") {
        let Some(item) = s.items.iter_mut().find(|it| it["key"] == key) else {
            return text(404, "text/plain", "Not found");
        };
        if req.method == "PATCH" {
            if req
                .headers
                .get("if-unmodified-since-version")
                .map(String::as_str)
                != Some(&item["version"].to_string())
            {
                return text(412, "text/plain", "modified");
            }
            item["data"]["collections"] = body["collections"].clone();
            item["version"] = json!(item["version"].as_i64().unwrap() + 1);
            return Reply {
                status: 204,
                headers: vec![],
                body: String::new(),
            };
        }
        let format = req.q("format");
        return if format.is_empty() {
            reply_json(200, &item.to_string())
        } else {
            text(200, "text/plain", &export(item, format == "biblatex"))
        };
    }
    if p == "/api/users/0/collections" {
        let key = format!("COLL{:04}", s.collections.len() + 1);
        let c = json!({ "key": key, "version": 1, "data": { "key": key, "name": body[0]["name"], "parentCollection": body[0].get("parentCollection").cloned().unwrap_or(json!(false)) } });
        s.collections.push(c.clone());
        return reply_json(200, &json!({ "successful": { "0": c } }).to_string());
    }
    if p == "/api/users/0/collections/top" {
        return page(
            s.collections
                .iter()
                .filter(|c| c["data"]["parentCollection"] == false)
                .cloned()
                .collect(),
        );
    }
    if let Some(rest) = p.strip_prefix("/api/users/0/collections/") {
        let (key, sub) = rest.split_once('/').unwrap_or((rest, ""));
        let Some(c) = s.collections.iter().find(|c| c["key"] == key).cloned() else {
            return text(404, "text/plain", "Collection not found");
        };
        return match sub {
            "" => reply_json(200, &c.to_string()),
            "collections" => page(
                s.collections
                    .iter()
                    .filter(|x| x["data"]["parentCollection"] == key)
                    .cloned()
                    .collect(),
            ),
            _ => page(
                s.items
                    .iter()
                    .filter(|it| {
                        it["data"]["collections"]
                            .as_array()
                            .is_some_and(|a| a.contains(&json!(key)))
                    })
                    .cloned()
                    .collect(),
            ),
        };
    }
    text(404, "text/plain", "No endpoint found")
}

fn item(key: &str, data: Value) -> Value {
    let mut d = json!({ "key": key, "version": 1, "itemType": "journalArticle", "creators": [], "collections": [] });
    for (k, v) in data.as_object().unwrap() {
        d[k] = v.clone();
    }
    json!({ "key": key, "version": 1, "data": d })
}

#[tokio::test(flavor = "multi_thread")]
async fn status_permission_search_import_picker_and_collections() {
    let state = Arc::new(Mutex::new(State::default()));
    state.lock().items.push(item("ITEM0001", json!({ "title": "Notes on the Analytical Engine", "creators": [{"creatorType": "author", "lastName": "Lovelace", "firstName": "Ada"}], "date": "1843", "citationKey": "lovelace1843", "DOI": "10.1234/ae" })));
    state.lock().items.push(item("ITEM0002", json!({ "title": "On Computable Numbers", "creators": [{"creatorType": "author", "lastName": "Turing", "firstName": "Alan"}], "date": "1936" })));
    state
        .lock()
        .bbt_keys
        .push(("ITEM0002".into(), "turing1936".into()));
    let s = state.clone();
    let server = Server::start(move |req| handle(&s, req)).await;
    let data = tempfile::tempdir().unwrap();
    let zotero = Zotero::new(Http::new(Endpoints::local(&server.base)), data.path());

    let status = zotero.status().await;
    assert!(
        status.running && status.writes && status.cayw && !status.authorised,
        "{status:?}"
    );
    assert_eq!(
        (status.version.as_str(), status.better_bibtex.as_deref()),
        ("10.0.6", Some("7.0.30"))
    );

    let allowed = zotero.authorise().await.unwrap();
    assert!(allowed.authorised);
    let saved = std::fs::read_to_string(data.path().join("zotero.json")).unwrap();
    assert!(saved.contains(KEY) && saved.contains(SERVER_ID));
    assert!(
        !format!("{allowed:?}").contains(KEY),
        "the key never reaches the window"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(data.path().join("zotero.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }

    let found = zotero.search_library("numbers", 20, true).await.unwrap();
    assert_eq!(
        (found[0].key.as_str(), found[0].year.as_str()),
        ("turing1936", "1936")
    );

    let project = tempfile::tempdir().unwrap();
    let root = project.path();
    std::fs::create_dir_all(root.join(".spectrum")).unwrap();
    std::fs::write(
        root.join(".spectrum/project.json"),
        r#"{"id":"zotero-1","name":"Engines"}"#,
    )
    .unwrap();
    std::fs::write(
        root.join("main.tex"),
        "\\usepackage{biblatex}\n\\addbibresource{references.bib}\n",
    )
    .unwrap();
    std::fs::write(
        root.join("references.bib"),
        "@article{Mine2020, title = {Mine}, year = {2020}, doi = {10.1/mine}}\n",
    )
    .unwrap();
    let out = zotero
        .import_refs(root, &["ITEM0002".to_owned()], &[], "")
        .await
        .unwrap();
    let r = &out.results[0];
    assert_eq!((r.status, r.key.as_str()), (Status::Added, "turing1936"));
    assert!(
        r.bibtex.contains("date = {1936}") && !r.bibtex.contains("file ="),
        "{}",
        r.bibtex
    );
    let again = zotero
        .import_refs(root, &["ITEM0002".to_owned()], &[], "")
        .await
        .unwrap();
    assert_eq!(again.results[0].status, Status::Duplicate);

    let (cited, picked) = zotero
        .pick_citation(root, "parencite", "")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(cited, "\\parencite{lovelace1843}");
    assert_eq!(
        (picked.results[0].status, picked.results[0].key.as_str()),
        (Status::Added, "lovelace1843")
    );

    // the project's collection: Spectrum › Engines, the items Zotero has filed, the one it lacks made
    let outcome = zotero
        .sync_collection(
            root,
            &SyncOptions {
                added: vec!["Mine2020".into()],
                ..SyncOptions::default()
            },
        )
        .await;
    let SyncOutcome::Synced {
        collection, counts, ..
    } = outcome
    else {
        panic!("{outcome:?}")
    };
    assert_eq!(collection, "Spectrum › Engines");
    assert_eq!((counts.added, counts.created), (2, 1), "{counts:?}");
    let names: HashSet<String> = state
        .lock()
        .collections
        .iter()
        .map(|c| c["data"]["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(
        names,
        HashSet::from(["Spectrum".to_owned(), "Engines".to_owned()])
    );
    let settings: Value = serde_json::from_str(
        &std::fs::read_to_string(root.join(".spectrum/settings.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(settings["zotero"]["projectId"], "zotero-1");
    assert_eq!(settings["zotero"]["created"]["Mine2020"], "ITEM0003");
    let made = state.lock().items[2].clone();
    assert_eq!(
        (
            made["data"]["title"].as_str(),
            made["data"]["citationKey"].as_str(),
            made["data"]["DOI"].as_str()
        ),
        (Some("Mine"), Some("Mine2020"), Some("10.1/mine"))
    );
    // a second sync finds everything filed and makes nothing
    let SyncOutcome::Synced { counts, .. } =
        zotero.sync_collection(root, &SyncOptions::default()).await
    else {
        panic!()
    };
    assert_eq!((counts.added, counts.created), (0, 0));

    // a key the database no longer takes is dropped and said so
    std::fs::write(
        data.path().join("zotero.json"),
        json!({ "key": "stale-key-0001", "serverId": SERVER_ID }).to_string(),
    )
    .unwrap();
    std::fs::write(
        root.join("references.bib"),
        "@article{New2021, title = {Brand new}, year = {2021}}\n",
    )
    .unwrap();
    let outcome = zotero
        .sync_collection(
            root,
            &SyncOptions {
                added: vec!["New2021".into()],
                ..SyncOptions::default()
            },
        )
        .await;
    assert!(
        matches!(outcome, SyncOutcome::Error(ref m) if m.contains("no longer accepts")),
        "{outcome:?}"
    );
    assert!(!data.path().join("zotero.json").exists());
    assert_eq!(
        zotero.sync_collection(root, &SyncOptions::default()).await,
        SyncOutcome::Off
    );
}
