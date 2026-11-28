//! Which objects of a granted folder get an access entry, and which refuse the launch.
//!
//! The port of `GrantTree` in 2.8's `Worker.cs`. Every object is opened without following a
//! link and judged by that handle; its entry is set on that one object, never by a recursive
//! call that could follow a link out of the folder. The file system sits behind [`Objects`] so
//! the rules are tested on every platform.

// off Windows only the tests use this
#![cfg_attr(not(windows), allow(dead_code))]

use spectrum_win_sandbox::paths;
use spectrum_win_sandbox::protocol::Access;
use spectrum_win_sandbox::validate::LaunchGrant;

use crate::Failure;

/// The most objects one run's grant may hold (2.8's limit). A runtime grant has none: it is
/// made once.
pub(crate) const PER_RUN_LIMIT: usize = 100_000;

/// What an opened object is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Object {
    pub dir: bool,
    /// Any reparse point: a junction, a symlink, a cloud placeholder.
    pub link: bool,
    pub hard_links: u32,
    /// Where the handle really is, normalised.
    pub real_path: String,
}

/// A change to one object's security.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Stamp {
    /// Add the entry for this access. `low_label`: also label it low integrity, which a
    /// low-integrity program needs before it may write.
    Grant { access: Access, low_label: bool },
    /// Take this run's entries off. `reset_label`: and the low label.
    Revoke { reset_label: bool },
}

pub(crate) trait Objects {
    type Node;
    /// Opens `path` itself (never what a link points to), with the rights `change` needs.
    fn open(&self, path: &str, change: Option<Stamp>) -> Result<(Self::Node, Object), String>;
    /// The full paths of what a folder holds.
    fn children(&self, path: &str) -> Result<Vec<String>, String>;
    fn stamp(&self, node: &Self::Node, object: &Object, stamp: Stamp) -> Result<(), String>;
    /// Whether the object already carries the runtime grant.
    fn holds_runtime(&self, node: &Self::Node) -> Result<bool, String>;
}

/// Grants one folder. Returns what it went on without. On an error some objects may already
/// be stamped: the caller revokes.
pub(crate) fn grant<F: Objects>(
    fs: &F,
    grant: &LaunchGrant,
    low_integrity: bool,
) -> Result<Vec<String>, Failure> {
    let root = grant.path.as_str();
    let runtime = grant.access == Access::Runtime;
    let stamp = Stamp::Grant {
        access: grant.access,
        low_label: low_integrity && grant.access == Access::Write,
    };
    let (seen, object) = fs.open(root, None).map_err(Failure::os)?;
    if object.link || !paths::same(&object.real_path, root) {
        return Err(Failure::unsafe_grant(format!(
            "The grant “{root}” is a link or goes through one (it is really “{}”). Pass the real path.",
            object.real_path
        )));
    }
    if runtime && fs.holds_runtime(&seen).map_err(Failure::os)? {
        return Ok(Vec::new());
    }
    let (root_node, root_object) = match fs.open(root, Some(stamp)) {
        Ok(opened) => opened,
        // a folder this user cannot change (Program Files): what Windows already lets a
        // sandboxed program read there is all it gets
        Err(message) if runtime => {
            return Ok(vec![format!(
                "The runtime folder “{root}” could not be granted and is used as it is: {message}"
            )]);
        }
        Err(message) => return Err(Failure::os(message)),
    };
    check(&root_object, root, root, runtime)?;

    let mut skipped = 0_usize;
    let mut count = 1_usize;
    let mut pending = if root_object.dir {
        fs.children(root).map_err(Failure::os)?
    } else {
        Vec::new()
    };
    while let Some(path) = pending.pop() {
        count += 1;
        if !runtime && count > PER_RUN_LIMIT {
            return Err(Failure::unsafe_grant(format!(
                "The grant “{root}” holds more than {PER_RUN_LIMIT} files."
            )));
        }
        if !grant.include_secrets && paths::is_secret_name(paths::file_name(&path)) {
            continue;
        }
        match visit(fs, &path, root, stamp) {
            Ok(children) => pending.extend(children),
            // a runtime folder is someone else's tree: what cannot be granted is left out
            Err(_) if runtime => skipped += 1,
            Err(failure) => return Err(failure),
        }
    }
    // the root last: a runtime root that holds the entry means the whole tree was done
    fs.stamp(&root_node, &root_object, stamp)
        .map_err(Failure::os)?;
    Ok(if skipped == 0 {
        Vec::new()
    } else {
        vec![format!(
            "{skipped} files or folders in the runtime folder “{root}” could not be granted."
        )]
    })
}

/// Stamps one object below the root and returns what it holds.
fn visit<F: Objects>(fs: &F, path: &str, root: &str, stamp: Stamp) -> Result<Vec<String>, Failure> {
    let runtime = matches!(
        stamp,
        Stamp::Grant {
            access: Access::Runtime,
            ..
        }
    );
    let (node, object) = fs.open(path, Some(stamp)).map_err(Failure::os)?;
    // in a runtime folder a link is not followed and not granted; it refuses nothing
    if runtime && (object.link || !paths::within(&object.real_path, root)) {
        return Ok(Vec::new());
    }
    check(&object, path, root, runtime)?;
    fs.stamp(&node, &object, stamp).map_err(Failure::os)?;
    if object.dir {
        return fs.children(path).map_err(Failure::os);
    }
    Ok(Vec::new())
}

fn check(object: &Object, path: &str, root: &str, runtime: bool) -> Result<(), Failure> {
    if object.link {
        return Err(Failure::unsafe_grant(format!(
            "“{path}” is a link (a junction, a symlink or another reparse point)."
        )));
    }
    // an entry on a hardlinked file would open the same file wherever else it is linked
    if !runtime && !object.dir && object.hard_links != 1 {
        return Err(Failure::unsafe_grant(format!(
            "“{path}” is a hardlinked file."
        )));
    }
    if !paths::within(&object.real_path, root) {
        return Err(Failure::unsafe_grant(format!(
            "“{path}” is outside its grant (it is really “{}”).",
            object.real_path
        )));
    }
    Ok(())
}

/// Takes a per-run grant back, from everything in the folder now (what the program made too).
/// Never follows a link and never leaves the folder. Returns what could not be undone.
pub(crate) fn revoke<F: Objects>(fs: &F, root: &str, reset_label: bool) -> Option<String> {
    let stamp = Stamp::Revoke { reset_label };
    let mut failures = 0_usize;
    let mut first = None;
    let mut pending = vec![root.to_owned()];
    while let Some(path) = pending.pop() {
        // gone since, or made unreachable by the program: nothing of ours can be on it
        let Ok((node, object)) = fs.open(&path, Some(stamp)) else {
            continue;
        };
        if !paths::within(&object.real_path, root) {
            continue;
        }
        if let Err(message) = fs.stamp(&node, &object, stamp) {
            failures += 1;
            first.get_or_insert(message);
        }
        if object.dir && !object.link {
            pending.extend(fs.children(&path).unwrap_or_default());
        }
    }
    first.map(|message| {
        format!("{failures} access entries under “{root}” could not be removed: {message}")
    })
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::collections::BTreeMap;

    use spectrum_win_sandbox::protocol::ErrorKind;

    use super::*;

    #[derive(Clone)]
    struct Fake {
        dir: bool,
        link: bool,
        hard_links: u32,
        real: Option<String>,
        /// Cannot be opened for a change.
        locked: bool,
    }

    fn dir() -> Fake {
        Fake {
            dir: true,
            link: false,
            hard_links: 1,
            real: None,
            locked: false,
        }
    }

    fn file() -> Fake {
        Fake {
            dir: false,
            ..dir()
        }
    }

    #[derive(Default)]
    struct FakeFs {
        objects: BTreeMap<String, Fake>,
        runtime_held: Vec<String>,
        stamps: RefCell<Vec<(String, Stamp)>>,
    }

    impl FakeFs {
        fn new(objects: &[(&str, Fake)]) -> Self {
            Self {
                objects: objects
                    .iter()
                    .map(|(path, fake)| ((*path).to_owned(), fake.clone()))
                    .collect(),
                ..Self::default()
            }
        }

        fn stamped(&self) -> Vec<String> {
            self.stamps
                .borrow()
                .iter()
                .map(|(p, _)| p.clone())
                .collect()
        }
    }

    impl Objects for FakeFs {
        type Node = String;

        fn open(&self, path: &str, change: Option<Stamp>) -> Result<(String, Object), String> {
            let fake = self.objects.get(path).ok_or("not found")?;
            if fake.locked && change.is_some() {
                return Err("access denied".into());
            }
            let object = Object {
                dir: fake.dir,
                link: fake.link,
                hard_links: fake.hard_links,
                real_path: fake.real.clone().unwrap_or_else(|| path.to_owned()),
            };
            Ok((path.to_owned(), object))
        }

        fn children(&self, path: &str) -> Result<Vec<String>, String> {
            Ok(self
                .objects
                .keys()
                .filter(|key| {
                    key.rsplit_once('\\')
                        .is_some_and(|(parent, _)| parent == path)
                })
                .cloned()
                .collect())
        }

        fn stamp(&self, node: &String, _: &Object, stamp: Stamp) -> Result<(), String> {
            self.stamps.borrow_mut().push((node.clone(), stamp));
            Ok(())
        }

        fn holds_runtime(&self, node: &String) -> Result<bool, String> {
            Ok(self.runtime_held.contains(node))
        }
    }

    fn launch_grant(path: &str, access: Access) -> LaunchGrant {
        LaunchGrant {
            path: path.to_owned(),
            access,
            include_secrets: false,
        }
    }

    fn refused(fs: &FakeFs, access: Access) -> String {
        let failure = grant(fs, &launch_grant(r"C:\w", access), false).unwrap_err();
        assert_eq!(failure.kind, ErrorKind::UnsafeGrant);
        failure.message
    }

    #[test]
    fn a_write_grant_stamps_everything_but_secrets_and_the_root_last() {
        let fs = FakeFs::new(&[
            (r"C:\w", dir()),
            (r"C:\w\main.tex", file()),
            (r"C:\w\fig", dir()),
            (r"C:\w\fig\a.png", file()),
            (r"C:\w\.git", dir()),
            (r"C:\w\.git\config", file()),
            (r"C:\w\fig\.env", file()),
            (r"C:\w\server.pem", file()),
        ]);
        let warnings = grant(&fs, &launch_grant(r"C:\w", Access::Write), true).unwrap();
        assert_eq!(warnings, Vec::<String>::new());
        let mut stamped = fs.stamped();
        assert_eq!(stamped.pop().as_deref(), Some(r"C:\w"));
        stamped.sort();
        assert_eq!(stamped, [r"C:\w\fig", r"C:\w\fig\a.png", r"C:\w\main.tex"]);
        assert!(fs.stamps.borrow().iter().all(|(_, stamp)| *stamp
            == Stamp::Grant {
                access: Access::Write,
                low_label: true
            }));
    }

    #[test]
    fn only_a_write_grant_in_the_low_integrity_tier_is_labelled() {
        for (access, low_integrity, labelled) in [
            (Access::Write, false, false),
            (Access::Read, true, false),
            (Access::Runtime, true, false),
        ] {
            let fs = FakeFs::new(&[(r"C:\w", dir())]);
            grant(&fs, &launch_grant(r"C:\w", access), low_integrity).unwrap();
            let expected = Stamp::Grant {
                access,
                low_label: labelled,
            };
            assert_eq!(fs.stamps.borrow()[0].1, expected);
        }
    }

    #[test]
    fn a_private_home_keeps_its_secret_names() {
        let fs = FakeFs::new(&[(r"C:\w", dir()), (r"C:\w\.npmrc", file())]);
        let mut home = launch_grant(r"C:\w", Access::Write);
        home.include_secrets = true;
        grant(&fs, &home, false).unwrap();
        assert!(fs.stamped().contains(&r"C:\w\.npmrc".to_owned()));
    }

    #[test]
    fn a_junction_or_symlink_inside_refuses_the_launch() {
        let junction = Fake {
            link: true,
            real: Some(r"C:\w\sub\out".into()),
            ..dir()
        };
        for access in [Access::Write, Access::Read] {
            let fs = FakeFs::new(&[
                (r"C:\w", dir()),
                (r"C:\w\sub", dir()),
                (r"C:\w\sub\out", junction.clone()),
                (r"C:\w\sub\out\secret.txt", file()),
            ]);
            assert!(refused(&fs, access).contains(r"C:\w\sub\out"));
            assert!(!fs.stamped().iter().any(|p| p.contains("secret")));
        }
    }

    #[test]
    fn an_object_that_is_really_elsewhere_refuses_the_launch() {
        let moved = Fake {
            real: Some(r"C:\live\main.tex".into()),
            ..file()
        };
        let fs = FakeFs::new(&[(r"C:\w", dir()), (r"C:\w\main.tex", moved)]);
        assert!(refused(&fs, Access::Write).contains(r"C:\live\main.tex"));
    }

    #[test]
    fn a_root_that_is_a_link_or_not_its_real_path_refuses_the_launch() {
        let link = Fake {
            link: true,
            ..dir()
        };
        assert!(refused(&FakeFs::new(&[(r"C:\w", link)]), Access::Runtime).contains("link"));
        // a junction above it, or a short 8.3 name
        let elsewhere = Fake {
            real: Some(r"C:\Users\someone\work".into()),
            ..dir()
        };
        let message = refused(&FakeFs::new(&[(r"C:\w", elsewhere)]), Access::Write);
        assert!(message.contains(r"C:\Users\someone\work"));
        // the same path in another case is itself
        let cased = Fake {
            real: Some(r"c:\W".into()),
            ..dir()
        };
        assert!(
            grant(
                &FakeFs::new(&[(r"C:\w", cased)]),
                &launch_grant(r"C:\w", Access::Read),
                false
            )
            .is_ok()
        );
    }

    #[test]
    fn a_hardlinked_file_refuses_a_per_run_grant_but_not_a_runtime_one() {
        let linked = Fake {
            hard_links: 2,
            ..file()
        };
        let objects = [(r"C:\w", dir()), (r"C:\w\store.js", linked)];
        assert!(refused(&FakeFs::new(&objects), Access::Write).contains("hardlinked"));
        assert!(refused(&FakeFs::new(&objects), Access::Read).contains("hardlinked"));
        let fs = FakeFs::new(&objects);
        grant(&fs, &launch_grant(r"C:\w", Access::Runtime), false).unwrap();
        assert!(fs.stamped().contains(&r"C:\w\store.js".to_owned()));
    }

    #[test]
    fn a_runtime_grant_leaves_out_links_and_what_it_cannot_change() {
        let junction = Fake {
            link: true,
            ..dir()
        };
        let locked = Fake {
            locked: true,
            ..file()
        };
        let fs = FakeFs::new(&[
            (r"C:\w", dir()),
            (r"C:\w\current", junction),
            (r"C:\w\current\node.exe", file()),
            (r"C:\w\locked.dll", locked),
            (r"C:\w\tex.exe", file()),
        ]);
        let warnings = grant(&fs, &launch_grant(r"C:\w", Access::Runtime), true).unwrap();
        assert_eq!(fs.stamped(), [r"C:\w\tex.exe", r"C:\w"]);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].starts_with("1 files or folders"));
    }

    #[test]
    fn a_runtime_grant_is_made_once_and_survives_a_folder_it_cannot_change() {
        let mut held = FakeFs::new(&[(r"C:\w", dir()), (r"C:\w\tex.exe", file())]);
        held.runtime_held.push(r"C:\w".into());
        assert_eq!(
            grant(&held, &launch_grant(r"C:\w", Access::Runtime), false).unwrap(),
            Vec::<String>::new()
        );
        assert_eq!(held.stamped(), Vec::<String>::new());

        let locked = Fake {
            locked: true,
            ..dir()
        };
        let fs = FakeFs::new(&[(r"C:\w", locked.clone()), (r"C:\w\tex.exe", file())]);
        let warnings = grant(&fs, &launch_grant(r"C:\w", Access::Runtime), false).unwrap();
        assert!(warnings[0].contains("used as it is"));
        assert_eq!(fs.stamped(), Vec::<String>::new());
        // a per-run grant on the same folder is an error
        let failure = grant(
            &FakeFs::new(&[(r"C:\w", locked)]),
            &launch_grant(r"C:\w", Access::Write),
            false,
        );
        assert_eq!(failure.unwrap_err().kind, ErrorKind::Os);
    }

    #[test]
    fn too_many_files_refuse_a_per_run_grant() {
        let mut fs = FakeFs::new(&[(r"C:\w", dir())]);
        for n in 0..PER_RUN_LIMIT {
            fs.objects.insert(format!(r"C:\w\{n}"), file());
        }
        assert!(refused(&fs, Access::Write).contains("more than"));
        assert!(grant(&fs, &launch_grant(r"C:\w", Access::Runtime), false).is_ok());
    }

    #[test]
    fn revoking_covers_new_files_and_secrets_and_never_follows_a_link() {
        let junction = Fake {
            link: true,
            ..dir()
        };
        let moved = Fake {
            real: Some(r"C:\live\x".into()),
            ..file()
        };
        let fs = FakeFs::new(&[
            (r"C:\w", dir()),
            (r"C:\w\made-by-the-program.txt", file()),
            (r"C:\w\.env", file()),
            (r"C:\w\escape", junction),
            (r"C:\w\escape\private.txt", file()),
            (r"C:\w\moved", moved),
        ]);
        assert_eq!(revoke(&fs, r"C:\w", true), None);
        let mut stamped = fs.stamped();
        stamped.sort();
        assert_eq!(
            stamped,
            [
                r"C:\w",
                r"C:\w\.env",
                r"C:\w\escape",
                r"C:\w\made-by-the-program.txt"
            ]
        );
        assert!(
            fs.stamps
                .borrow()
                .iter()
                .all(|(_, s)| *s == Stamp::Revoke { reset_label: true })
        );
    }
}
