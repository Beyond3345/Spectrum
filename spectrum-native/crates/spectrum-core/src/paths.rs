//! Where Spectrum keeps its data, logs and projects. The folder names match 2.8 (Tauri's `app_data_dir` and
//! `app_log_dir` for `com.beyond3345.spectrum`), so 3.0 reads 2.8's settings, keys and project list as they are.

mod sync;

use std::path::{Path, PathBuf};

pub use sync::{SyncPlace, SyncProvider, SyncRoot, detect_sync_roots, place_of};

use crate::CoreError;

/// The bundle id, and the name of the data and log folders.
pub const BUNDLE_ID: &str = "com.beyond3345.spectrum";

/// The app's folders. Built from the system with [`AppPaths::system`], or from given roots in tests.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppPaths {
    /// macOS `~/Library/Application Support/com.beyond3345.spectrum`, Windows `%APPDATA%\com.beyond3345.spectrum`.
    pub data_dir: PathBuf,
    /// macOS `~/Library/Logs/com.beyond3345.spectrum`, Windows `%LOCALAPPDATA%\com.beyond3345.spectrum\logs`.
    pub log_dir: PathBuf,
    /// The default parent folder for new and imported projects ([`default_projects_dir`]).
    pub projects_dir: PathBuf,
}

impl AppPaths {
    pub fn new(data_dir: PathBuf, log_dir: PathBuf, projects_dir: PathBuf) -> Self {
        Self {
            data_dir,
            log_dir,
            projects_dir,
        }
    }

    /// The folders on this computer. Looks for the sync apps' folders once, to place the projects folder.
    pub fn system() -> Result<Self, CoreError> {
        let base = directories::BaseDirs::new().ok_or(CoreError::NoHome)?;
        let home = base.home_dir();
        let data_dir = base.data_dir().join(BUNDLE_ID);
        let log_dir = if cfg!(target_os = "macos") {
            home.join("Library").join("Logs").join(BUNDLE_ID)
        } else {
            base.data_local_dir().join(BUNDLE_ID).join("logs")
        };
        // Windows' known folder follows a redirected Documents (OneDrive's folder backup), as 2.8's Tauri side did
        let documents = directories::UserDirs::new()
            .and_then(|dirs| dirs.document_dir().map(Path::to_path_buf))
            .unwrap_or_else(|| home.join("Documents"));
        let projects_dir = default_projects_dir(home, &documents, &detect_sync_roots(home));
        Ok(Self::new(data_dir, log_dir, projects_dir))
    }

    /// The app's settings (`AppSettings`); 2.8 kept them in the window's storage, so this file is new in 3.0.
    pub fn settings_file(&self) -> PathBuf {
        self.data_dir.join("settings.json")
    }

    /// The project list, `{ version: 1, projects: [...] }`.
    pub fn registry_file(&self) -> PathBuf {
        self.data_dir.join("registry.json")
    }

    /// Windows' DPAPI-sealed API keys.
    pub fn keys_file(&self) -> PathBuf {
        self.data_dir.join("keys.dpapi")
    }

    /// This computer's own files for a project (SyncTeX, aux files, thumbnail), by the project's id.
    pub fn project_cache_dir(&self, project_id: &str) -> PathBuf {
        self.data_dir.join("cache").join(project_id)
    }
}

/// `<documents>/Spectrum`, or `<home>/Spectrum` when that is in a sync app's folder (`OneDrive`'s folder backup,
/// iCloud's Desktop & Documents, Dropbox and the like), where GitHub can't keep projects: a sync client
/// locking files inside `.git` corrupts repositories. As 2.8's `index.js` decides it at start.
pub fn default_projects_dir(home: &Path, documents: &Path, roots: &[SyncRoot]) -> PathBuf {
    let preferred = documents.join("Spectrum");
    if let Some(place) = place_of(&preferred, home, roots) {
        tracing::info!(
            provider = place.provider.label(),
            "Documents is in a sync app's folder; projects go in ~/Spectrum"
        );
        return home.join("Spectrum");
    }
    preferred
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projects_dir_moves_out_of_a_sync_folder() {
        let home = tempfile::tempdir().unwrap();
        let home = home.path();
        let documents = home.join("Documents");
        std::fs::create_dir_all(&documents).unwrap();
        assert_eq!(
            default_projects_dir(home, &documents, &[]),
            documents.join("Spectrum")
        );
        let roots = [SyncRoot {
            path: documents.clone(),
            provider: SyncProvider::OneDrive,
        }];
        assert_eq!(
            default_projects_dir(home, &documents, &roots),
            home.join("Spectrum")
        );
    }

    #[test]
    fn files_sit_in_the_data_dir() {
        let paths = AppPaths::new("/d".into(), "/l".into(), "/p".into());
        assert_eq!(paths.keys_file(), Path::new("/d/keys.dpapi"));
        assert_eq!(paths.project_cache_dir("x"), Path::new("/d/cache/x"));
    }
}
