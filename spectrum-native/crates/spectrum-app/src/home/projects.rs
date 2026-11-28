//! The project list Home shows: the registry's entries with their folders' metadata (2.8's
//! `listProjects` / `describe`), and the blank project New makes. Blocking IO: background only.

use spectrum_core::project::{self, ProjectMeta};
use spectrum_core::{AppPaths, CoreError, UserNotice};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// A project as Home lists it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectCard {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub updated_at: String,
    pub main_file: Option<String>,
    /// The folder was moved or deleted outside the app; the registry still lists it.
    pub missing: bool,
}

/// Every listed project that isn't archived, by name (2.8's default order).
pub fn load_projects(paths: &AppPaths) -> Result<Vec<ProjectCard>, UserNotice> {
    let registry = project::load_registry(&paths.registry_file()).map_err(|e| e.notice())?;
    let mut cards: Vec<ProjectCard> = registry
        .projects
        .into_iter()
        .map(|entry| {
            let meta = project::read_meta(&entry.path).ok().flatten();
            let missing = meta.is_none();
            let meta = meta.unwrap_or_else(|| ProjectMeta {
                name: entry.name.clone(),
                updated_at: entry.added_at.clone(),
                archived: entry.archived,
                ..ProjectMeta::default()
            });
            (
                meta.archived,
                ProjectCard {
                    id: entry.id,
                    name: meta.name,
                    path: entry.path,
                    updated_at: meta.updated_at,
                    main_file: meta.main_file,
                    missing,
                },
            )
        })
        .filter(|(archived, _)| !archived)
        .map(|(_, card)| card)
        .collect();
    cards.sort_by_cached_key(|c| c.name.to_lowercase());
    Ok(cards)
}

/// 2.8's first template, "Simple document": what New fills a project with.
const BLANK_MAIN: &str = include_str!("../../../../../templates/simple-document/main.tex");
const BLANK_BIB: &str = include_str!("../../../../../templates/simple-document/references.bib");

/// Makes a project called `name` in the projects folder and lists it. Returns its folder.
pub fn new_project(paths: &AppPaths, name: &str) -> Result<PathBuf, UserNotice> {
    let (root, _) =
        project::create_project(&paths.registry_file(), &paths.projects_dir, name, |root| {
            write(root, "main.tex", BLANK_MAIN)?;
            write(root, "references.bib", BLANK_BIB)
        })
        .map_err(|e| e.notice())?;
    Ok(root)
}

fn write(root: &Path, name: &str, text: &str) -> Result<(), CoreError> {
    let file = root.join(name);
    fs::write(&file, text).map_err(|source| CoreError::Io {
        action: "couldn't write",
        path: file,
        source,
    })
}

/// Seconds since 1970 of an ISO time as JavaScript writes it (`2026-11-28T09:30:00.000Z`).
fn parse_iso(iso: &str) -> Option<i64> {
    let num = |range: std::ops::Range<usize>| iso.get(range)?.parse::<i64>().ok();
    let (y, m, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (hh, mm, ss) = (num(11..13)?, num(14..16)?, num(17..19)?);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    // Howard Hinnant's days_from_civil
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * 86_400 + hh * 3600 + mm * 60 + ss)
}

const UNITS: [(&str, i64); 6] = [
    ("minute", 60),
    ("hour", 3600),
    ("day", 86_400),
    ("week", 604_800),
    ("month", 2_629_800),
    ("year", 31_557_600),
];

/// How long ago, as 2.8's Home says it ("Just now", "3 days ago"); empty for a bad time.
pub fn time_ago(iso: &str, now: SystemTime) -> String {
    let Some(then) = parse_iso(iso) else {
        return String::new();
    };
    let now = now
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX));
    let secs = now - then;
    if secs < 60 {
        return "Just now".to_owned();
    }
    let (unit, size) = UNITS
        .iter()
        .rev()
        .find(|(_, size)| secs >= *size)
        .copied()
        .unwrap_or(UNITS[0]);
    let n = secs / size;
    format!("{n} {unit}{} ago", if n == 1 { "" } else { "s" })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn paths(dir: &Path) -> AppPaths {
        AppPaths::new(dir.join("data"), dir.join("logs"), dir.join("Spectrum"))
    }

    #[test]
    fn lists_new_projects_by_name_and_flags_missing_folders() {
        let dir = tempfile::tempdir().unwrap();
        let paths = paths(dir.path());
        let thesis = new_project(&paths, "thesis-2026").unwrap();
        new_project(&paths, "Algebra notes").unwrap();
        assert!(thesis.join("main.tex").is_file());
        assert!(thesis.join("references.bib").is_file());

        let cards = load_projects(&paths).unwrap();
        let names: Vec<_> = cards.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["Algebra notes", "thesis-2026"]);
        assert_eq!(cards[1].main_file.as_deref(), Some("main.tex"));
        assert!(!cards[1].missing);

        fs::remove_dir_all(&thesis).unwrap();
        let cards = load_projects(&paths).unwrap();
        assert!(cards[1].missing);
        assert_eq!(cards[1].name, "thesis-2026");
    }

    #[test]
    fn no_registry_is_an_empty_list() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load_projects(&paths(dir.path())).unwrap(), []);
    }

    #[test]
    fn says_how_long_ago() {
        let at = |s: u64| UNIX_EPOCH + Duration::from_secs(s);
        let base = parse_iso("2026-11-28T09:30:00.000Z").unwrap();
        let base = u64::try_from(base).unwrap();
        let iso = "2026-11-28T09:30:00.000Z";
        assert_eq!(time_ago(iso, at(base + 5)), "Just now");
        assert_eq!(time_ago(iso, at(base + 60)), "1 minute ago");
        assert_eq!(time_ago(iso, at(base + 3 * 86_400)), "3 days ago");
        assert_eq!(time_ago(iso, at(base + 400 * 86_400)), "1 year ago");
        assert_eq!(time_ago("not a date", at(base)), "");
        assert_eq!(parse_iso("1970-01-02T00:00:00Z"), Some(86_400));
    }
}
