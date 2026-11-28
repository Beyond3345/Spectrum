//! What confines a LaTeX compile on a Mac, as 2.8's `compileSandbox.js`: every program a compile starts (the
//! engine, Biber and BibTeX, the index and glossary programs, and what they start in turn) runs under
//! sandbox-exec with the profile written here. A document is a program, and one from someone else must not write
//! the user's files, run their programs or send anything out. Trust this project lifts it.
//! Windows has no wrapper here yet (`spectrum-win-sandbox` is its own crate): a compile there runs with TeX's
//! restricted shell escape.

mod profile;

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tokio::sync::Mutex;

use crate::process::Env;

/// sandbox-exec, which every Mac has.
const SANDBOX_EXEC: &str = "/usr/bin/sandbox-exec";

/// Whether this process can confine what it starts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Confinement {
    /// sandbox-exec runs the profile.
    Yes,
    /// Inside an agent's isolation already, where sandbox-exec is refused and the agent's own limits hold.
    Inside,
    /// sandbox-exec didn't run or didn't take the profile: compiles run unconfined, and their log says so.
    No,
}

/// A compile's confinement: the profile, and what its programs are told so their temp and cache files go where
/// they can write.
#[derive(Debug, Clone)]
pub(crate) struct Confined {
    pub(crate) profile: String,
    pub(crate) env: Vec<(&'static str, std::ffi::OsString)>,
}

/// What a confined compile needs to know.
pub(crate) struct ConfineRequest<'a> {
    pub(crate) build: &'a Path,
    pub(crate) tmp: &'a Path,
    pub(crate) search_path: &'a std::ffi::OsStr,
    /// Tectonic's own profile also writes its cache and downloads its packages over HTTPS.
    pub(crate) tectonic: bool,
    /// The project, read even inside the data folder; the PDF repstopdf makes of an .eps is written there.
    pub(crate) root: &'a Path,
    /// Programs by their full path it may run besides TeX's: the built-in Tectonic, Spectrum's Biber.
    pub(crate) runs: Vec<PathBuf>,
}

/// The compile sandbox for this Mac: shared by every compile, it keeps what it worked out about the TeX
/// installation and the Biber it thinned.
#[derive(Debug)]
pub struct CompileSandbox {
    data_dir: PathBuf,
    home: PathBuf,
    able: tokio::sync::OnceCell<Confinement>,
    installations: Mutex<HashMap<String, profile::Installation>>,
    thinning: Mutex<()>,
}

impl CompileSandbox {
    /// `data_dir`: Spectrum's data folder, which a compile never reads but for its caches and engines.
    pub fn new(data_dir: PathBuf, home: PathBuf) -> Self {
        Self {
            data_dir,
            home,
            able: tokio::sync::OnceCell::new(),
            installations: Mutex::new(HashMap::new()),
            thinning: Mutex::new(()),
        }
    }

    /// `DATA_DIR/compile-cache`: what a confined compile may write besides its build folder, kept apart from what
    /// an unconfined compile reads as code. ponytail: one cache for every project, so a confined compile can leave
    /// Lua for another project's confined compile (still confined); one a project if that ever matters
    pub fn cache_dir(&self) -> PathBuf {
        self.data_dir.join("compile-cache")
    }

    /// Tried once, with every rule a compile's profile has.
    pub async fn confinement(&self) -> Confinement {
        *self
            .able
            .get_or_init(|| async {
                let text = profile::profile_of(&profile::ProfileParts {
                    home: &self.home,
                    data: &self.data_dir,
                    readable: std::slice::from_ref(&self.data_dir),
                    writable: &[self.cache_dir()],
                    made: &["^/nowhere$".to_owned()],
                    may: &[],
                    tectonic: true,
                });
                match output(Path::new(SANDBOX_EXEC), &["-p", &text, "/usr/bin/true"]).await {
                    Some((true, _, _)) => Confinement::Yes,
                    Some((false, _, stderr)) if stderr.contains("sandbox_apply") => {
                        Confinement::Inside
                    }
                    _ => Confinement::No,
                }
            })
            .await
    }

    /// The compile's confinement, or `None` when there is none (inside an agent's isolation, or sandbox-exec
    /// doesn't work). It reads what the user can but Spectrum's data and the usual stores of keys; writes only the
    /// build and temp folders, the confined cache and the fonts mktexpk makes in the user's own TEXMFVAR; reaches
    /// no network (Tectonic: HTTPS only); and runs only TeX's own programs and `runs`.
    pub(crate) async fn confine(&self, request: ConfineRequest<'_>) -> Option<Confined> {
        if self.confinement().await != Confinement::Yes {
            return None;
        }
        let home = real(&self.home);
        let data = real(&self.data_dir);
        let cache = self.cache_dir();
        // only its caches and fonts: a .sty or a format written into this TEXMFVAR would be found by the next
        // compile
        let caches: Vec<PathBuf> = ["par", "texmf-var/cache", "texmf-var/luatexja"]
            .iter()
            .map(|made| cache.join(made))
            .collect();
        let installation = self.installation(request.search_path).await;
        let fonts = installation.texmf_var.as_ref().map(|v| v.join("fonts"));
        // made here, as a confined mktexpk can't make the folders above it
        for made in caches.iter().chain(fonts.iter()) {
            let _ = std::fs::create_dir_all(made);
        }
        let mut writable: Vec<PathBuf> = [request.build, request.tmp]
            .into_iter()
            .map(Path::to_path_buf)
            .chain(caches.iter().cloned())
            .chain(fonts.iter().cloned())
            .map(|p| real(&p))
            .collect();
        if request.tectonic {
            // Tectonic's own cache of the packages it downloads (and where older versions kept it)
            let bundles: Vec<PathBuf> = match std::env::var_os("TECTONIC_CACHE_DIR") {
                Some(dir) => vec![PathBuf::from(dir)],
                None => ["TectonicProject.Tectonic", "Tectonic"]
                    .iter()
                    .map(|n| home.join("Library").join("Caches").join(n))
                    .collect(),
            };
            if let Some(first) = bundles.first() {
                let _ = std::fs::create_dir_all(first);
            }
            writable.extend(bundles.iter().map(|b| real(b)));
        }
        let mut may: Vec<String> = installation.filters.clone();
        for file in request.runs.iter().filter(|f| f.is_absolute()) {
            for filter in profile::program_filter(&real(file), request.search_path) {
                if !may.contains(&filter) {
                    may.push(filter);
                }
            }
        }
        // not for Tectonic, which runs Spectrum's own Biber and no script of TeX's
        let biber = if request.tectonic {
            None
        } else {
            self.thin_biber(request.search_path).await
        };
        let python = if request.tectonic {
            None
        } else {
            self.real_python(request.search_path).await
        };
        // Biber starts the copy of itself it unpacked into the cache
        may.push(format!("(subpath {})", profile::q(&real(&caches[0]))));
        if let Some(dir) = &biber {
            may.push(format!(
                "(literal {})",
                profile::q(&real(dir).join("biber"))
            ));
        }
        let made = vec![format!(
            r"^{}/(.*/)?[^/]+-eps-converted-to\.pdf$",
            regex::escape(&real(request.root).to_string_lossy())
        )];
        let readable = [
            data.join("cache"),
            data.join("engines"),
            real(&cache),
            real(request.root),
        ];
        let text = profile::profile_of(&profile::ProfileParts {
            home: &home,
            data: &data,
            readable: &readable,
            writable: &writable,
            made: &made,
            may: &may,
            tectonic: request.tectonic,
        });
        let mut env: Vec<(&'static str, std::ffi::OsString)> =
            vec![("TMPDIR", real(request.tmp).into_os_string())];
        // LuaTeX only writes below TEXMFVAR, whatever the sandbox allows: the confined one, with the user's own
        // still searched and its font caches still read
        if let (Some(var), Some(fonts)) = (&installation.texmf_var, &fonts) {
            let aux = std::env::var("TEXMFAUXTREES").unwrap_or_default();
            env.push(("TEXMFVAR", cache.join("texmf-var").into_os_string()));
            env.push(("TEXMFAUXTREES", format!("{aux}{},", var.display()).into()));
            env.push((
                "TEXMFCACHE",
                format!("{}:$TEXMFSYSVAR:{}", caches[1].display(), var.display()).into(),
            ));
            env.push(("VARTEXFONTS", fonts.clone().into_os_string()));
        }
        env.push(("PAR_GLOBAL_TMPDIR", caches[0].clone().into_os_string()));
        if biber.is_some() || python.is_some() {
            let dirs = biber
                .into_iter()
                .chain(python)
                .chain(std::env::split_paths(request.search_path));
            if let Ok(path) = std::env::join_paths(dirs) {
                env.push(("PATH", path));
            }
        }
        Some(Confined { profile: text, env })
    }

    async fn installation(&self, search_path: &std::ffi::OsStr) -> profile::Installation {
        let files = profile::installation_files(search_path);
        // by what is installed now, so a TeX installed while Spectrum runs is found without a restart
        let key = format!("{}{files:?}", search_path.display());
        let mut known = self.installations.lock().await;
        if let Some(found) = known.get(&key) {
            return found.clone();
        }
        let found = profile::installation(&files, search_path).await;
        known.insert(key, found.clone());
        found
    }

    /// TeX Live's Biber for both kinds of Mac takes this Mac's half of itself out with lipo on its first run,
    /// which a confined compile can't start. The half is taken out here instead, into
    /// `compile-cache/bin/<hash>/biber`, a folder a confined compile runs from and can't write; the folder to put
    /// first on the PATH, or `None` when the biber found is no universal file.
    pub(crate) async fn thin_biber(&self, search_path: &std::ffi::OsStr) -> Option<PathBuf> {
        let file = resolve_executable("biber", search_path)?;
        let magic = read_head(&file, 4)?;
        if magic != [0xca, 0xfe, 0xba, 0xbe] {
            return None;
        }
        let meta = std::fs::metadata(&file).ok()?;
        let changed = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis());
        let from = format!("{}\n{}\n{changed}", file.display(), meta.len());
        let all = self.cache_dir().join("bin");
        let dir = all.join(&crate::engines::sha256_hex(from.as_bytes())[..16]);
        let target = dir.join("biber");
        // once for compiles that start together
        let _held = self.thinning.lock().await;
        if target.is_file() {
            return Some(dir);
        }
        std::fs::create_dir_all(&dir).ok()?;
        let bytes = std::fs::read(&file).ok()?;
        let slice = thin(&bytes)?;
        let part = dir.join(format!("biber.{}.part", std::process::id()));
        let written = std::fs::write(&part, slice)
            .and_then(|()| {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&part, std::fs::Permissions::from_mode(0o755))
            })
            .and_then(|()| std::fs::rename(&part, &target));
        if written.is_err() {
            let _ = std::fs::remove_file(&part);
            return None;
        }
        let _ = std::fs::write(dir.join("from"), &from);
        // the halves of Bibers that are gone or were replaced (each is some 40 MB)
        for entry in std::fs::read_dir(&all).into_iter().flatten().flatten() {
            let name = entry.file_name();
            if name == dir.file_name().unwrap_or_default() || name == "python" {
                continue;
            }
            let record = std::fs::read_to_string(entry.path().join("from")).unwrap_or_default();
            let mut lines = record.lines();
            let still = lines.next().and_then(|source| {
                let now = std::fs::metadata(source).ok()?;
                let changed = now
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_millis());
                (lines.next() == Some(&now.len().to_string())
                    && lines.next() == Some(&changed.to_string()))
                .then_some(())
            });
            if still.is_none() {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
        Some(dir)
    }

    /// Apple's `/usr/bin/python3` is a stand-in that asks the developer tools where the real one is, which a
    /// confined compile can't. Where it is the python3 a compile would find, the real one is asked for here and
    /// linked as `compile-cache/bin/python/python3`, first on the PATH, so TeX's Python scripts (latexminted)
    /// start. The folder, or `None`.
    pub(crate) async fn real_python(&self, search_path: &std::ffi::OsStr) -> Option<PathBuf> {
        if resolve_executable("python3", search_path)? != Path::new("/usr/bin/python3") {
            return None;
        }
        let (ok, found, _) = output(Path::new("/usr/bin/xcrun"), &["--find", "python3"]).await?;
        let found = PathBuf::from(found.trim());
        if !ok || !found.is_absolute() || found == Path::new("/usr/bin/python3") {
            return None;
        }
        let dir = self.cache_dir().join("bin").join("python");
        let link = dir.join("python3");
        std::fs::create_dir_all(&dir).ok()?;
        if std::fs::read_link(&link).ok().as_deref() != Some(found.as_path()) {
            let _ = std::fs::remove_file(&link);
            std::os::unix::fs::symlink(&found, &link).ok()?;
        }
        Some(dir)
    }

    /// Confines a compile's environment: the profile to run under, and the variables set; or the warning a compile
    /// says when this Mac's sandbox-exec doesn't work.
    pub(crate) async fn apply(
        &self,
        env: &mut Env,
        request: ConfineRequest<'_>,
    ) -> Result<Option<String>, &'static str> {
        match self.confine(request).await {
            Some(confined) => {
                for (name, value) in confined.env {
                    env.set(name, value);
                }
                Ok(Some(confined.profile))
            }
            None if self.confinement().await == Confinement::No => Err(
                "[spectrum warning] This Mac’s sandbox-exec didn’t run, so this compile wasn’t confined.",
            ),
            None => Ok(None),
        }
    }
}

/// The first `name` on the PATH as the disk has it (links followed), as 2.8's `resolveExecutable`.
pub(crate) fn resolve_executable(name: &str, search_path: &std::ffi::OsStr) -> Option<PathBuf> {
    let found = if Path::new(name).is_absolute() {
        PathBuf::from(name)
    } else {
        crate::find_executable(name, search_path)?
    };
    let real = std::fs::canonicalize(found).ok()?;
    real.is_file().then_some(real)
}

fn read_head(file: &Path, n: usize) -> Option<Vec<u8>> {
    use std::io::Read;
    let mut buf = vec![0; n];
    let read = std::fs::File::open(file).ok()?.read(&mut buf).ok()?;
    buf.truncate(read);
    Some(buf)
}

/// This Mac's slice of a universal Mach-O file (`0xcafebabe`, big-endian fat header), as 2.8's `thinned`.
pub(crate) fn thin(data: &[u8]) -> Option<&[u8]> {
    let word = |at: usize| -> Option<u32> {
        data.get(at..at + 4)
            .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
    };
    if word(0)? != 0xcafe_babe {
        return None;
    }
    // CPU_TYPE_ARM64 (Mac builds are Apple silicon only)
    let wanted = 0x0100_000c;
    let count = word(4)?;
    let mut at = 8;
    for _ in 0..count {
        if at + 20 > data.len() {
            break;
        }
        if word(at)? == wanted {
            let offset = usize::try_from(word(at + 8)?).ok()?;
            let size = usize::try_from(word(at + 12)?).ok()?;
            return data.get(offset..offset.checked_add(size)?);
        }
        at += 20;
    }
    None
}

/// The path as the disk has it, or as given when it is gone.
pub(crate) fn real(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Runs a small program to its end (20 s at most): success, stdout, stderr.
pub(crate) async fn output(program: &Path, args: &[&str]) -> Option<(bool, String, String)> {
    let mut command = tokio::process::Command::new(program);
    command
        .args(args)
        .stdin(std::process::Stdio::null())
        .kill_on_drop(true);
    let out = tokio::time::timeout(std::time::Duration::from_secs(20), command.output())
        .await
        .ok()?
        .ok()?;
    Some((
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fat(slices: &[(u32, &[u8])]) -> Vec<u8> {
        let mut out = vec![0xca, 0xfe, 0xba, 0xbe];
        out.extend(u32::try_from(slices.len()).unwrap().to_be_bytes());
        let mut offset = 8 + 20 * slices.len();
        let mut body = Vec::new();
        for (cpu, bytes) in slices {
            out.extend(cpu.to_be_bytes());
            out.extend(0u32.to_be_bytes());
            out.extend(u32::try_from(offset).unwrap().to_be_bytes());
            out.extend(u32::try_from(bytes.len()).unwrap().to_be_bytes());
            out.extend(0u32.to_be_bytes());
            offset += bytes.len();
            body.extend_from_slice(bytes);
        }
        out.extend(body);
        out
    }

    #[test]
    fn thin_takes_the_arm64_slice() {
        let file = fat(&[(0x0100_0007, b"x86"), (0x0100_000c, b"arm64!")]);
        assert_eq!(thin(&file), Some(&b"arm64!"[..]));
        assert_eq!(thin(&fat(&[(0x0100_0007, b"x86")])), None);
        assert_eq!(thin(b"\xcf\xfa\xed\xfe thin"), None);
    }

    #[tokio::test]
    async fn a_universal_biber_is_thinned_into_the_cache_once() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let biber = bin.join("biber");
        std::fs::write(&biber, fat(&[(0x0100_000c, b"#!/bin/sh\n")])).unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&biber, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let sandbox = CompileSandbox::new(dir.path().join("data"), dir.path().into());
        let path = std::env::join_paths([&bin]).unwrap();
        let thinned = sandbox.thin_biber(&path).await.unwrap();
        assert!(thinned.starts_with(sandbox.cache_dir().join("bin")));
        assert_eq!(
            std::fs::read(thinned.join("biber")).unwrap(),
            b"#!/bin/sh\n"
        );
        assert_eq!(sandbox.thin_biber(&path).await, Some(thinned));
        // a thin biber needs nothing
        std::fs::write(&biber, b"#!/bin/sh\n").unwrap();
        let other = std::env::join_paths([&bin]).unwrap();
        assert_eq!(sandbox.thin_biber(&other).await, None);
    }

    #[tokio::test]
    async fn real_python_only_stands_in_for_apple_s_shim() {
        let dir = tempfile::tempdir().unwrap();
        let sandbox = CompileSandbox::new(dir.path().join("data"), dir.path().into());
        // another python3 first: left alone
        let bin = dir.path().join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let own = bin.join("python3");
        std::fs::write(&own, "#!/bin/sh\n").unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&own, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let path = std::env::join_paths([&bin, Path::new("/usr/bin")]).unwrap();
        assert_eq!(sandbox.real_python(&path).await, None);
        // Apple's shim: linked to the developer tools' python3 where they're installed
        if let Some(dir) = sandbox.real_python(std::ffi::OsStr::new("/usr/bin")).await {
            let link = std::fs::read_link(dir.join("python3")).unwrap();
            assert!(link.is_absolute() && link != Path::new("/usr/bin/python3"));
        } else {
            eprintln!("skipped: no developer tools' python3 on this Mac");
        }
    }

    #[tokio::test]
    async fn this_mac_can_confine_a_program() {
        let dir = tempfile::tempdir().unwrap();
        let sandbox = CompileSandbox::new(dir.path().join("data"), dir.path().into());
        let able = sandbox.confinement().await;
        if able == Confinement::Inside {
            eprintln!("skipped: already inside a sandbox");
            return;
        }
        assert_eq!(able, Confinement::Yes);
    }

    /// The profile itself: a confined program writes its build folder and an .eps's PDF in the project, and
    /// nothing else; it can't read Spectrum's data folder.
    #[tokio::test]
    async fn a_confined_program_writes_only_its_build_folder() {
        let dir = tempfile::tempdir().unwrap();
        let base = real(dir.path());
        let sandbox = CompileSandbox::new(base.join("data"), base.clone());
        if sandbox.confinement().await != Confinement::Yes {
            eprintln!("skipped: sandbox-exec can't confine here");
            return;
        }
        let (build, tmp, root) = (base.join("build"), base.join("tmp"), base.join("project"));
        for d in [&build, &tmp, &root, &base.join("data")] {
            std::fs::create_dir_all(d).unwrap();
        }
        std::fs::write(base.join("data/keys.json"), "secret").unwrap();
        let mut env = Env::default();
        env.set("PATH", "/bin:/usr/bin");
        let search = env.path();
        let profile = sandbox
            .apply(
                &mut env,
                ConfineRequest {
                    build: &build,
                    tmp: &tmp,
                    search_path: &search,
                    tectonic: false,
                    root: &root,
                    runs: vec![],
                },
            )
            .await
            .unwrap();
        let script = format!(
            "touch '{b}/ok'; touch '{o}'; touch '{r}/fig-eps-converted-to.pdf'; touch '{r}/other'; cat '{d}' > '{b}/stolen'",
            b = build.display(),
            o = base.join("outside").display(),
            r = root.display(),
            d = base.join("data/keys.json").display(),
        );
        let exit = crate::process::run(
            crate::process::Spawn {
                program: Path::new("/bin/sh"),
                args: vec!["-c".into(), script.into()],
                cwd: &build,
                env: &env,
                limit: std::time::Duration::from_secs(20),
                stdin: None,
                profile: profile.as_deref(),
            },
            &mut crate::process::LogSink::default(),
            &crate::CancelToken::new(),
        )
        .await
        .unwrap();
        assert!(exit.code.is_some());
        assert!(build.join("ok").exists());
        assert!(!base.join("outside").exists());
        assert!(root.join("fig-eps-converted-to.pdf").exists());
        assert!(!root.join("other").exists());
        assert_eq!(
            std::fs::read_to_string(build.join("stolen")).unwrap_or_default(),
            ""
        );
    }
}
