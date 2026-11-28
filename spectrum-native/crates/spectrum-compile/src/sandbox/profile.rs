//! The sandbox-exec profile's text and the TeX installation it lets run, as 2.8's `compileSandbox.js` wrote them.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use super::{output, real, resolve_executable};

/// The small tools TeX's own shell scripts call, the system's Perl and Python, and lipo and xcrun, which
/// `/usr/bin/python3` and a universal Biber hand over to.
const SYSTEM_TOOLS: &str = r"^/(bin/(sh|bash|dash|zsh|cat|cp|mv|rm|mkdir|rmdir|ln|ls|echo|test|\[|expr|pwd|chmod|date|sleep)|usr/bin/(env|perl[0-9.]*|python3|sed|awk|basename|dirname|uname|tr|grep|egrep|fgrep|head|tail|sort|uniq|wc|cut|touch|find|which|id|true|false|printf|tee|mktemp|cmp|diff|file|xcrun|xcode-select|locale|getconf|lipo)|(Applications/Xcode[^/]*\.app/Contents/Developer|Library/Developer/CommandLineTools)/(usr/bin/(python3[0-9.]*|lipo|xcrun)|Toolchains/[^/]+/usr/bin/lipo|Library/Frameworks/Python3\.framework/.*))$";
const TEX_PROGRAMS: [&str; 12] = [
    "pdflatex",
    "xelatex",
    "lualatex",
    "latexmk",
    "tectonic",
    "kpsewhich",
    "bibtex",
    "biber",
    "makeindex",
    "makeglossaries",
    "xindy",
    "latexminted",
];
/// What TeX's scripts are written in, as `#!/usr/bin/env …` finds each first on the PATH, and Ghostscript, which
/// repstopdf turns an .eps figure into a PDF with.
const INTERPRETERS: [&str; 3] = ["perl", "python3", "gs"];
/// What a compile never reads in the home folder: the usual stores of keys and sign-ins.
const HOME_STORES: [&str; 18] = [
    ".ssh",
    ".gnupg",
    ".aws",
    ".azure",
    ".kube",
    ".docker",
    ".config/gh",
    ".config/gcloud",
    ".claude",
    ".codex",
    ".agents",
    ".netrc",
    ".npmrc",
    ".pypirc",
    ".git-credentials",
    ".claude.json",
    "Library/Keychains",
    "Library/Cookies",
];

/// A value as the profile quotes it (JSON's string syntax, as 2.8 wrote it).
pub(super) fn q(value: &impl AsRef<OsStr>) -> String {
    serde_json::to_string(&value.as_ref().to_string_lossy()).unwrap_or_default()
}

/// Key files by name anywhere in the home folder (2.8's secret names, plus .key and .kdbx), each letter in
/// either case.
fn key_files() -> String {
    let pattern = r"/(\.env(\..*)?|\.netrc|\.npmrc|\.pypirc|id_rsa|id_dsa|id_ecdsa|id_ed25519|.*\.(pem|p12|pfx|keystore|jks|ppk|key|kdbx))$";
    pattern
        .chars()
        .map(|c| {
            if c.is_ascii_lowercase() {
                format!("[{c}{}]", c.to_ascii_uppercase())
            } else {
                c.to_string()
            }
        })
        .collect()
}

pub(super) struct ProfileParts<'a> {
    pub(super) home: &'a Path,
    pub(super) data: &'a Path,
    pub(super) readable: &'a [PathBuf],
    pub(super) writable: &'a [PathBuf],
    pub(super) made: &'a [String],
    pub(super) may: &'a [String],
    pub(super) tectonic: bool,
}

fn subpaths(list: &[PathBuf]) -> String {
    list.iter()
        .map(|p| format!("(subpath {})", q(p)))
        .collect::<Vec<_>>()
        .join(" ")
}

/// The profile: everything is read but the data folder (save `readable`) and the key stores; `writable` and
/// `made` are written; TeX's programs and `may` run; Tectonic alone reaches HTTPS and DNS.
/// ponytail: behind the user's proxy a confined Tectonic can't download (2.8's gate through it isn't ported)
pub(super) fn profile_of(parts: &ProfileParts<'_>) -> String {
    let stores: Vec<PathBuf> = HOME_STORES.iter().map(|s| parts.home.join(s)).collect();
    let home_keys = format!(
        "^{}/.*{}",
        regex::escape(&parts.home.to_string_lossy()),
        key_files()
    );
    let made = parts
        .made
        .iter()
        .map(|re| format!("(regex {})", q(re)))
        .collect::<Vec<_>>()
        .join(" ");
    let tectonic = if parts.tectonic {
        r#"(allow mach-lookup
  (global-name "com.apple.networkd")
  (global-name "com.apple.trustd.agent")
  (global-name "com.apple.TrustEvaluationAgent")
  (global-name "com.apple.SystemConfiguration.DNSConfiguration")
  (global-name "com.apple.SystemConfiguration.configd"))
(allow system-socket (require-all (socket-domain AF_SYSTEM) (socket-protocol 2)))
(allow network-outbound (require-all (remote tcp "*:443") (require-not (remote ip "localhost:*"))))
(allow network-outbound (remote udp "*:53") (literal "/private/var/run/mDNSResponder"))"#
    } else {
        ""
    };
    format!(
        r#"(version 1)
(deny default)
(allow process-fork sysctl-read file-map-executable)
(allow process-info* (target same-sandbox))
(allow signal (target same-sandbox))
(allow process-exec (regex {tools}) {may})
(allow file-read*)
(deny file-read* (subpath {data}))
(allow file-read* {readable})
(deny file-read* {stores} (regex {home_keys}))
(allow file-read-metadata)
(allow file-write* {writable} {made})
(allow file-write-data file-ioctl (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty") (literal "/dev/dtracehelper") (subpath "/dev/fd"))
(allow mach-lookup
  (global-name "com.apple.system.opendirectoryd.libinfo")
  (global-name "com.apple.system.opendirectoryd.membership")
  (global-name "com.apple.bsd.dirhelper")
  (global-name "com.apple.system.logger")
  (global-name "com.apple.system.notification_center")
  (global-name "com.apple.logd"))
(allow ipc-posix-shm-read-data (ipc-posix-name "apple.shm.notification_center"))
{tectonic}
"#,
        tools = q(&SYSTEM_TOOLS),
        may = parts.may.join(" "),
        data = q(&parts.data),
        readable = subpaths(parts.readable),
        stores = subpaths(&stores),
        home_keys = q(&home_keys),
        writable = subpaths(parts.writable),
    )
}

/// The filter for one program by its own file, and for a script the interpreter its first line names as well
/// (`MacPorts` and Nix write the full path there); a framework's python3 starts the Python inside its own
/// Python.app, so that framework is the filter.
pub(super) fn program_filter(file: &Path, search_path: &OsStr) -> Vec<String> {
    program_filter_depth(file, search_path, 0)
}

fn program_filter_depth(file: &Path, search_path: &OsStr, depth: u8) -> Vec<String> {
    let text = file.to_string_lossy();
    let framework = crate::regex(r"^(.+/Python3?\.framework)/")
        .captures(&text)
        .map(|c| c[1].to_owned());
    let mut filters = vec![match framework {
        Some(dir) => format!("(subpath {})", q(&dir)),
        None => format!("(literal {})", q(&file)),
    }];
    let Some(head) = super::read_head(file, 256) else {
        return filters;
    };
    let head: String = head.iter().map(|&b| char::from(b)).collect();
    let Some(c) = crate::regex(r"^#!\s*(\S+)(?:[ \t]+(?:-S[ \t]+)?([^\s-]\S*))?").captures(&head)
    else {
        return filters;
    };
    let first = &c[1];
    let named = if Path::new(first).file_name() == Some(OsStr::new("env")) {
        c.get(2).map(|m| m.as_str().to_owned())
    } else {
        Some(first.to_owned())
    };
    if let Some(interpreter) = named.and_then(|n| resolve_executable(&n, search_path))
        && interpreter != file
        && depth < 4
    {
        filters.extend(program_filter_depth(&interpreter, search_path, depth + 1));
    }
    filters
}

/// Never a whole system folder or the home folder as one program's installation.
fn too_wide(path: &Path) -> bool {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default();
    let wide = [
        Path::new("/"),
        Path::new("/usr"),
        Path::new("/usr/local"),
        Path::new("/opt"),
        Path::new("/opt/homebrew"),
        Path::new("/opt/local"),
        Path::new("/Library"),
        Path::new("/Applications"),
        home.as_path(),
        home.parent().unwrap_or(Path::new("/")),
    ];
    wide.contains(&path)
}

/// The TeX installation on a PATH: what a compile may run, and the user's own TEXMFVAR (`None` without
/// kpsewhich: Tectonic alone).
#[derive(Debug, Clone)]
pub(super) struct Installation {
    pub(super) filters: Vec<String>,
    pub(super) texmf_var: Option<PathBuf>,
}

/// Each TeX program and interpreter as the PATH finds it now.
pub(super) fn installation_files(search_path: &OsStr) -> Vec<(&'static str, Option<PathBuf>)> {
    TEX_PROGRAMS
        .iter()
        .chain(INTERPRETERS.iter())
        .map(|&name| (name, resolve_executable(name, search_path)))
        .collect()
}

pub(super) async fn installation(
    files: &[(&'static str, Option<PathBuf>)],
    search_path: &OsStr,
) -> Installation {
    let mut filters: Vec<String> = Vec::new();
    let add = |filter: String, filters: &mut Vec<String>| {
        if !filters.contains(&filter) {
            filters.push(filter);
        }
    };
    let found = |name: &str| {
        files
            .iter()
            .find(|(n, _)| *n == name)
            .and_then(|(_, f)| f.clone())
    };
    for name in TEX_PROGRAMS {
        let Some(file) = found(name) else { continue };
        // /usr/local/texlive/2026/bin/universal-darwin/pdftex and …/2026/texmf-dist/scripts/latexmk/latexmk.pl
        let text = file.to_string_lossy();
        if let Some(c) = crate::regex(r"^(.+?)/(bin|texmf[^/]*)/").captures(&text) {
            let root = PathBuf::from(&c[1]);
            if !too_wide(&root) {
                add(format!("(subpath {})", q(&root)), &mut filters);
            }
        }
        for filter in program_filter(&file, search_path) {
            add(filter, &mut filters);
        }
    }
    let mut texmf_var = None;
    if let Some(kpsewhich) = found("kpsewhich") {
        // one at a time: kpsewhich answers only the last -var-value
        let value = |name: &'static str| {
            let kpsewhich = kpsewhich.clone();
            async move {
                output(&kpsewhich, &[&format!("-var-value={name}")])
                    .await
                    .map(|(_, out, _)| PathBuf::from(out.trim()))
                    .filter(|p| p.is_absolute())
            }
        };
        if let Some(dist) = value("TEXMFDIST").await.map(|d| real(&d))
            && !too_wide(&dist)
        {
            add(format!("(subpath {})", q(&dist)), &mut filters);
        }
        texmf_var = value("TEXMFVAR").await;
    }
    for name in INTERPRETERS {
        for filter in found(name)
            .map(|f| program_filter(&f, search_path))
            .unwrap_or_default()
        {
            add(filter, &mut filters);
        }
    }
    Installation { filters, texmf_var }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_denies_secrets_and_allows_the_build() {
        let text = profile_of(&ProfileParts {
            home: Path::new("/Users/a"),
            data: Path::new("/Users/a/Library/Application Support/com.beyond3345.spectrum"),
            readable: &[PathBuf::from("/data/cache")],
            writable: &[PathBuf::from("/b/out")],
            made: &[],
            may: &["(literal \"/x/tectonic\")".to_owned()],
            tectonic: false,
        });
        assert!(text.starts_with("(version 1)\n(deny default)\n"));
        assert!(text.contains(r#"(deny file-read* (subpath "/Users/a/Library/Application Support/com.beyond3345.spectrum"))"#));
        assert!(text.contains(r#"(subpath "/Users/a/.ssh")"#));
        assert!(text.contains(r#"(allow file-write* (subpath "/b/out") )"#));
        assert!(text.contains(r#") (literal "/x/tectonic"))"#));
        assert!(!text.contains("network-outbound"));
        assert!(key_files().contains("[kK][eE][yY]"));
    }

    #[test]
    fn script_filters_follow_the_interpreter() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("tool");
        std::fs::write(&script, "#!/usr/bin/env sh\n").unwrap();
        let path = std::ffi::OsString::from("/bin");
        let filters = program_filter(&script, &path);
        assert_eq!(filters[0], format!("(literal {})", q(&script)));
        assert!(filters[1].contains("sh"), "{filters:?}");
        assert_eq!(
            program_filter(
                Path::new("/Library/Frameworks/Python3.framework/Versions/3.12/bin/python3"),
                &path
            )[0],
            r#"(subpath "/Library/Frameworks/Python3.framework")"#
        );
    }

    #[test]
    fn system_folders_are_never_one_program_s_installation() {
        assert!(too_wide(Path::new("/opt/homebrew")));
        assert!(!too_wide(Path::new("/usr/local/texlive/2026")));
    }
}
