use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use super::*;

/// What LanguageTool reads (text, and markup as read) and what is sent (text, and markup as is).
fn reads(items: &[Item]) -> String {
    items
        .iter()
        .map(|i| match i {
            Item::Text { text } => text.as_str(),
            Item::Markup { interpret_as, .. } => interpret_as,
        })
        .collect()
}

fn sent(items: &[Item]) -> String {
    items
        .iter()
        .map(|i| match i {
            Item::Text { text } => text.as_str(),
            Item::Markup { markup, .. } => markup,
        })
        .collect()
}

#[test]
fn the_annotation_sends_no_latex() {
    let tex = r"Some bread \cite{key}. With $x^2$ values and \LaTeX{} here.";
    let prose = mask(tex, DocKind::Latex);
    let items = annotate(tex, &prose, 0..tex.len());
    assert_eq!(reads(&items), "Some bread. With x values and LaTeX here.");
    assert_eq!(
        units(&sent(&items)),
        units(tex),
        "each item as long as the source it stands for"
    );
    let data = sent(&items);
    assert!(
        !data.contains(['\\', '$', '^', '{', '}'])
            && !data.contains("cite")
            && !data.contains("key")
    );
}

#[test]
fn runs_go_in_parts_of_at_most_20000_units_cut_at_the_end_of_a_run() {
    let para = format!("{}\n\n", "Ein Satz mit Wörtern. ".repeat(45));
    let text = para.repeat(50);
    let runs: Vec<Range<usize>> = (0..50)
        .map(|k| k * para.len()..(k + 1) * para.len() - 2)
        .collect();
    let chunks = parts(&text, &text, &runs, PART_UNITS);
    assert_eq!(chunks.len(), 3);
    assert!(chunks.iter().all(|c| c.units <= PART_UNITS));
    assert_eq!(chunks.iter().map(|c| c.table.len()).sum::<usize>(), 50);
}

fn decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' => {
                out.push(u8::from_str_radix(&s[i + 1..i + 3], 16).unwrap());
                i += 2;
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8(out).unwrap()
}

type Handler = Arc<dyn Fn(&HashMap<String, String>) -> (u16, String) + Send + Sync>;

/// A stand-in LanguageTool on 127.0.0.1 answering each form with `handler`; the forms it got.
async fn serve(handler: Handler) -> (String, Arc<Mutex<Vec<HashMap<String, String>>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = format!("http://{}", listener.local_addr().unwrap());
    let forms = Arc::new(Mutex::new(Vec::new()));
    let seen = forms.clone();
    tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };
            let mut buf = Vec::new();
            let mut chunk = vec![0u8; 65536];
            let body = loop {
                let n = socket.read(&mut chunk).await.unwrap();
                buf.extend_from_slice(&chunk[..n]);
                let text = String::from_utf8_lossy(&buf).into_owned();
                if let Some(end) = text.find("\r\n\r\n") {
                    let length = text[..end]
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if buf.len() >= end + 4 + length {
                        break String::from_utf8(buf[end + 4..end + 4 + length].to_vec()).unwrap();
                    }
                }
                if n == 0 {
                    break String::new();
                }
            };
            let form: HashMap<String, String> = body
                .split('&')
                .filter_map(|kv| kv.split_once('='))
                .map(|(k, v)| (decode(k), decode(v)))
                .collect();
            let (status, answer) = handler(&form);
            seen.lock().unwrap().push(form);
            let response = format!(
                "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{answer}",
                answer.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
        }
    });
    (address, forms)
}

/// Matches for `teh` and `das das` in what was sent, in UTF-16 offsets as Java gives them.
fn fake_languagetool(form: &HashMap<String, String>) -> (u16, String) {
    let data: serde_json::Value = serde_json::from_str(&form["data"]).unwrap();
    let text: String = data["annotation"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| {
            i.get("text")
                .or_else(|| i.get("markup"))
                .unwrap()
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect();
    let mut matches = Vec::new();
    for needle in ["teh", "das das"] {
        for (at, _) in text.match_indices(needle) {
            matches.push(serde_json::json!({
                "offset": units(&text[..at]), "length": units(needle), "message": "Wrong.",
                "replacements": [{ "value": "the" }], "rule": { "id": "TEST_RULE" }
            }));
        }
    }
    (200, serde_json::json!({ "matches": matches }).to_string())
}

#[tokio::test]
async fn a_check_sends_its_fields_and_maps_each_match_back_into_the_file() {
    let (server, forms) = serve(Arc::new(fake_languagetool)).await;
    let source =
        "Das ist das das Haus 😀 und teh Ende.\r\n\r\n% Kommentar teh\r\nNoch \\cite{x}. das das";
    let lt = LanguageTool::new(&server);
    let options = LanguageToolOptions {
        language: "de-DE".into(),
        disabled_rules: vec!["A".into(), "B".into()],
        spelt: true,
        style: false,
    };
    let report = lt
        .check(source, DocKind::Latex, &options, &AtomicBool::new(false))
        .await;
    assert_eq!(report.failure, None);
    let found: Vec<&str> = report
        .lints
        .iter()
        .map(|l| &source[l.range.clone()])
        .collect();
    assert_eq!(found, ["das das", "teh", "das das"]);
    assert!(report.lints.iter().all(|l| l.fixable
        && l.rule == "TEST_RULE"
        && l.suggestions == [Fix::Replace("the".into())]));
    let form = forms.lock().unwrap()[0].clone();
    assert_eq!(
        (
            form["language"].as_str(),
            form["disabledRules"].as_str(),
            form["disabledCategories"].as_str()
        ),
        ("de-DE", "A,B", "TYPOS")
    );
    assert!(
        !form.contains_key("level"),
        "picky only with style suggestions"
    );
    assert!(!form["data"].contains("Kommentar") && !form["data"].contains("cite"));

    let picky = LanguageToolOptions {
        language: "de-DE".into(),
        style: true,
        ..LanguageToolOptions::default()
    };
    lt.check(source, DocKind::Latex, &picky, &AtomicBool::new(false))
        .await;
    let second = forms.lock().unwrap()[1].clone();
    assert_eq!(second.get("level").map(String::as_str), Some("picky"));
    assert!(!second.contains_key("disabledCategories"));
}

#[tokio::test]
async fn cancelling_stops_between_parts_and_failures_keep_the_parts_done() {
    let text = format!("{}\n\n", "Wort ".repeat(3000)).repeat(3);
    let options = LanguageToolOptions {
        language: "de-DE".into(),
        ..LanguageToolOptions::default()
    };
    let cancel = Arc::new(AtomicBool::new(false));
    let flag = cancel.clone();
    let (slow, forms) = serve(Arc::new(move |_| {
        flag.store(true, Ordering::Relaxed);
        (200, r#"{"matches":[]}"#.to_owned())
    }))
    .await;
    let report = LanguageTool::new(&slow)
        .check(&text, DocKind::Plain, &options, &cancel)
        .await;
    assert_eq!(
        (report.done, report.parts, forms.lock().unwrap().len()),
        (1, 3, 1)
    );
    assert!(report.cancelled());

    let calls = Arc::new(Mutex::new(0));
    let (flaky, _) = serve(Arc::new(move |_| {
        let mut n = calls.lock().unwrap();
        *n += 1;
        (
            200,
            if *n == 1 {
                r#"{"matches":[]}"#.to_owned()
            } else {
                "not json".to_owned()
            },
        )
    }))
    .await;
    let bad = LanguageTool::new(&flaky)
        .check(&text, DocKind::Plain, &options, &AtomicBool::new(false))
        .await;
    assert_eq!(
        (bad.done, bad.failure.as_deref()),
        (
            1,
            Some("LanguageTool gave an answer Spectrum couldn’t read.")
        )
    );

    let refused = LanguageTool::new("http://127.0.0.1:9")
        .check(&text, DocKind::Plain, &options, &AtomicBool::new(false))
        .await;
    assert_eq!((refused.done, refused.failure.is_some()), (0, true));

    let (broken, _) = serve(Arc::new(|_| (500, "broken".to_owned()))).await;
    let error = LanguageTool::new(&broken)
        .check(&text, DocKind::Plain, &options, &AtomicBool::new(false))
        .await;
    assert!(error.failure.unwrap().contains("500: broken"));
}
