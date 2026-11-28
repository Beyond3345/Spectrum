//! References and assets for Markdown and Typst documents.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;

use super::references::{Context, Keyed, Place, entry_checks};
use super::scan::Lines;
use super::{Found, Group, ReviewInput, Severity, quoted};
use crate::dedupe::BibRecord;
use crate::project::{folder_of, normalise};
use crate::text::{fre, re};

static MD_CODE: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
    fre(
        r"(?ms)^(`{3,}|~{3,})[^\n]*\n.*?(?:\n\1[`~]*[ \t]*(?=\n|$)|(?![\s\S]))|<!--.*?-->|\$\$.*?\$\$|(`+)[^\n]*?\2",
    )
});
static MD_CITE: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
    fre(r"(?<![\w.@])-?@([A-Za-z0-9_][\w:.#$%&+?<>~/-]*?)(?=[.,;:!?]?(?:[\s\]};)]|$))")
});
static MD_FRONT: LazyLock<Regex> =
    LazyLock::new(|| re(r"^---\n((?s).*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)"));
static MD_LINK: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
    fre(r#"(!?)\[(?:[^\]\n]|\][^(])*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["'(][^)]*)?\)"#)
});
static MD_NOCITE: LazyLock<Regex> = LazyLock::new(|| re(r"(?m)^nocite\s*:((?s).*?)(?:^\S|\z)"));
static AT_KEY: LazyLock<Regex> = LazyLock::new(|| re(r"@([\w:.-]+)"));

fn blanked(text: &str, re: &fancy_regex::Regex) -> String {
    crate::text::freplace(re, text, |c| {
        c.get(0).map_or(String::new(), |m| {
            m.as_str()
                .chars()
                .map(|ch| if ch == '\n' { '\n' } else { ' ' })
                .collect()
        })
    })
}

#[allow(clippy::too_many_lines, clippy::similar_names)]
pub(crate) fn markdown(input: &ReviewInput, cx: &Context, found: &mut Found) {
    let g = Group::References;
    let doc = input.doc.as_str();
    let text = cx.texts.get(doc).cloned().unwrap_or_default();
    // code, comments and maths blanked to spaces, so an @ or a ](…) there is not read and lines stay
    let code = blanked(&text, &MD_CODE);
    let lines = Lines::new(&code);
    let front = MD_FRONT
        .captures(&text)
        .map(|c| c[1].to_owned())
        .unwrap_or_default();
    let bib_names = crate::dedupe::front_matter_bibliography(&format!("---\n{front}\n---\n"))
        .unwrap_or_default();
    let named: HashSet<String> = bib_names
        .iter()
        .filter_map(|n| {
            cx.lookup(&[normalise(&format!("{}{n}", folder_of(doc))), normalise(n)])
                .path
        })
        .collect();
    let entries: Vec<&BibRecord> = input
        .bib
        .iter()
        .flatten()
        .filter(|e| named.is_empty() || named.contains(&e.file))
        .collect();
    let keys: HashSet<&str> = entries.iter().map(|e| e.key.as_str()).collect();
    let mut cites: Vec<Keyed> = Vec::new();
    for c in MD_CITE.captures_iter(&code).flatten() {
        let (Some(m), Some(k)) = (c.get(0), c.get(1)) else {
            continue;
        };
        let key = k.as_str();
        let prefix = key.split([':', '-']).next().unwrap_or("");
        if key.len() > prefix.len() && ["fig", "tbl", "tab", "eq", "sec", "lst"].contains(&prefix) {
            continue;
        }
        cites.push(Keyed {
            key: key.into(),
            file: doc.into(),
            line: lines.at(m.start()),
        });
    }
    let nocite = MD_NOCITE
        .captures(&front)
        .map(|c| c[1].to_owned())
        .unwrap_or_default();
    cites.extend(AT_KEY.captures_iter(&nocite).map(|c| Keyed {
        key: c[1].to_owned(),
        file: doc.into(),
        line: 1,
    }));
    if input.bib.is_some() && !cites.is_empty() && keys.is_empty() {
        found.at(
            g,
            Severity::Error,
            "The document cites sources but has no bibliography: no .bib file in the project"
                .into(),
            &cites[0].file,
            cites[0].line,
            false,
        );
    } else if input.bib.is_some() {
        let mut seen = HashSet::new();
        for c in &cites {
            if !keys.contains(c.key.as_str()) && seen.insert(c.key.clone()) {
                found.at(
                    g,
                    Severity::Warning,
                    format!("No bibliography entry has the key {}", quoted(&c.key, 80)),
                    &c.file,
                    c.line,
                    true,
                );
            }
        }
    }
    let cited: Vec<String> = cites.iter().map(|c| c.key.clone()).collect();
    entry_checks(found, &entries, &cited, nocite.contains("@*"));
    // images and links to files in the project; a URL, mailto: or #anchor is left alone
    for c in MD_LINK.captures_iter(&code).flatten() {
        let (Some(m), Some(t)) = (c.get(0), c.get(2)) else {
            continue;
        };
        let target = t.as_str();
        let lower = target.to_lowercase();
        let scheme = lower.split_once(':').is_some_and(|(s, _)| {
            !s.is_empty()
                && s.chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || "+.-".contains(ch))
                && s.chars().next().is_some_and(|ch| ch.is_ascii_alphabetic())
        });
        let bare = target.split(['#', '?']).next().unwrap_or("");
        if scheme || target.starts_with('#') || target.starts_with("//") || bare.is_empty() {
            continue;
        }
        let name =
            crate::detect::percent_decode(bare.trim_start_matches('<').trim_end_matches('>'))
                .unwrap_or_else(|| bare.to_owned());
        let hit = cx.lookup(&[
            normalise(&format!("{}{name}", folder_of(doc))),
            normalise(&name),
        ]);
        let line = lines.at(m.start());
        let image = c.get(1).is_some_and(|i| !i.as_str().is_empty());
        if hit.path.is_some() {
            continue;
        }
        if image {
            let message = hit.folded.map_or_else(
                || format!("Can’t find the image {}", quoted(target, 80)),
                |f| {
                    format!(
                        "The image {} is {f} in the project, which differs in letter case",
                        quoted(target, 80)
                    )
                },
            );
            found.at(g, Severity::Error, message, doc, line, false);
        } else {
            let message = hit.folded.map_or_else(
                || {
                    format!(
                        "The link to {} goes to no file in the project",
                        quoted(target, 80)
                    )
                },
                |f| {
                    format!(
                        "The link to {} goes to {f}, which differs in letter case",
                        quoted(target, 80)
                    )
                },
            );
            found.at(g, Severity::Warning, message, doc, line, true);
        }
    }
}

static TYP_CODE: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
    fre(
        r#"("(?:[^"\\\n]|\\.)*")|//[^\n]*|(?s:/\*.*?\*/)|(`{3,})(?s:.*?)\2|`[^`\n]*`|\$(?:[^$\\]|\\.)*\$"#,
    )
});
static TYP_REF: LazyLock<Regex> = LazyLock::new(|| re(r"\b(?:ref|cite)\(\s*<([\w:.-]+)>"));
static TYP_AT: LazyLock<fancy_regex::Regex> =
    LazyLock::new(|| fre(r"(?<![\w@./])@([A-Za-z_][\w:.-]*?)(?=[.:]?(?:[^\w:.-]|$))"));
static TYP_LABEL: LazyLock<Regex> = LazyLock::new(|| re(r"<([A-Za-z_][\w:.-]*)>"));
static TYP_LABEL_FN: LazyLock<Regex> = LazyLock::new(|| re(r#"\blabel\(\s*"([^"]+)"\s*\)"#));
static TYP_BIB: LazyLock<Regex> =
    LazyLock::new(|| re(r#"\bbibliography\(\s*(\([^)]*\)|"[^"]*")([^)]*)"#));
static TYP_IMAGE: LazyLock<Regex> = LazyLock::new(|| re(r#"\bimage\(\s*"([^"]+)""#));
static STRING: LazyLock<Regex> = LazyLock::new(|| re(r#""([^"]+)""#));
static YAML_KEY: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?m)^([A-Za-z0-9_][\w:.-]*):[ \t]*(?:#.*)?$"));

#[allow(clippy::too_many_lines)]
pub(crate) fn typst(input: &ReviewInput, cx: &Context, found: &mut Found) {
    let g = Group::References;
    let mut labels: Vec<(String, Vec<Place>)> = Vec::new();
    let mut refs: Vec<(Keyed, usize)> = Vec::new();
    let mut bib_files: HashSet<String> = HashSet::new();
    let mut cites_all = false;
    let typ_file = |from: &str, name: &str| {
        cx.lookup(&[if name.starts_with('/') {
            normalise(name)
        } else {
            normalise(&format!("{}{name}", folder_of(from)))
        }])
    };
    for (order, (path, text)) in cx.sources.iter().enumerate() {
        // comments, raw text and maths blanked to spaces, strings kept (they hold the paths)
        let code = crate::text::freplace(&TYP_CODE, text, |c| {
            let m = c.get(0).map_or("", |m| m.as_str());
            if c.get(1).is_some() {
                m.to_owned()
            } else {
                m.chars()
                    .map(|ch| if ch == '\n' { '\n' } else { ' ' })
                    .collect()
            }
        });
        let lines = Lines::new(&code);
        let mut rest = code.clone();
        for c in TYP_REF.captures_iter(&code) {
            let Some(m) = c.get(0) else { continue };
            refs.push((
                Keyed {
                    key: c[1].to_owned(),
                    file: path.clone(),
                    line: lines.at(m.start()),
                },
                order * 10_000_000 + m.start(),
            ));
            rest.replace_range(m.range(), &" ".repeat(m.len()));
        }
        for c in TYP_AT.captures_iter(&rest).flatten() {
            let (Some(m), Some(k)) = (c.get(0), c.get(1)) else {
                continue;
            };
            refs.push((
                Keyed {
                    key: k.as_str().into(),
                    file: path.clone(),
                    line: lines.at(m.start()),
                },
                order * 10_000_000 + m.start(),
            ));
        }
        let mut label = |key: &str, at: usize| match labels.iter_mut().find(|(k, _)| k == key) {
            Some((_, p)) => p.push(Place {
                file: path.clone(),
                line: lines.at(at),
            }),
            None => labels.push((
                key.into(),
                vec![Place {
                    file: path.clone(),
                    line: lines.at(at),
                }],
            )),
        };
        for c in TYP_LABEL
            .captures_iter(&rest)
            .chain(TYP_LABEL_FN.captures_iter(&rest))
        {
            label(&c[1], c.get(0).map_or(0, |m| m.start()));
        }
        for c in TYP_BIB.captures_iter(&rest) {
            for s in STRING.captures_iter(&c[1]) {
                if let Some(p) = typ_file(path, &s[1]).path {
                    bib_files.insert(p);
                }
            }
            if c[2].replace(' ', "").contains("full:true") {
                cites_all = true;
            }
        }
        for c in TYP_IMAGE.captures_iter(&rest) {
            let hit = typ_file(path, &c[1]);
            if hit.path.is_none() {
                let line = lines.at(c.get(0).map_or(0, |m| m.start()));
                let message = hit.folded.map_or_else(
                    || format!("Can’t find the image {}", quoted(&c[1], 80)),
                    |f| {
                        format!(
                            "The image {} is {f} in the project, which differs in letter case",
                            quoted(&c[1], 80)
                        )
                    },
                );
                found.at(g, Severity::Error, message, path, line, false);
            }
        }
    }
    let entries: Vec<&BibRecord> = input
        .bib
        .iter()
        .flatten()
        .filter(|e| bib_files.contains(&e.file))
        .collect();
    let yaml_keys: Vec<String> = bib_files
        .iter()
        .filter(|f| f.to_lowercase().ends_with(".yml") || f.to_lowercase().ends_with(".yaml"))
        .flat_map(|f| {
            YAML_KEY
                .captures_iter(cx.texts.get(f).map_or("", String::as_str))
                .map(|c| c[1].to_owned())
                .collect::<Vec<_>>()
        })
        .collect();
    let keys: HashSet<&str> = entries
        .iter()
        .map(|e| e.key.as_str())
        .chain(yaml_keys.iter().map(String::as_str))
        .collect();
    refs.sort_by_key(|(_, at)| *at);
    let has_label = |k: &str| labels.iter().any(|(l, _)| l == k);
    let mut seen = HashSet::new();
    for (r, _) in &refs {
        if !has_label(&r.key) && !keys.contains(r.key.as_str()) && seen.insert(r.key.clone()) {
            found.at(
                g,
                Severity::Warning,
                format!(
                    "Nothing has the label {}, and no bibliography entry has it as its key",
                    quoted(&r.key, 80)
                ),
                &r.file,
                r.line,
                true,
            );
        }
    }
    for (key, places) in &labels {
        if places.len() > 1 {
            found.at(g, Severity::Warning, format!("The label {} is used {} times (first at {}:{}), so references go to the last one", quoted(key, 80), places.len(), places[0].file, places[0].line), &places[1].file, places[1].line, true);
        }
    }
    let cited: Vec<String> = refs
        .iter()
        .filter(|(r, _)| !has_label(&r.key))
        .map(|(r, _)| r.key.clone())
        .collect();
    entry_checks(found, &entries, &cited, cites_all);
}
