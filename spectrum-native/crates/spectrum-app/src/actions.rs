//! The app's actions (verb-noun) and their key bindings: Cmd on macOS, Ctrl on Windows.

use gpui_kit::{App, KeyBinding};

gpui_kit::actions!(
    spectrum,
    [
        ShowCommandPalette,
        QuickOpen,
        ShowProjects,
        ShowThemePreview,
        NewProject,
        OpenProject,
        ToggleSidebar,
        NewFile,
        NewFolder,
        RenameFile,
        MoveFileToBin,
        RefreshFiles,
        CompileProject,
        UseLightAppearance,
        UseDarkAppearance,
        UseSystemAppearance,
        UseSpectrumColours,
        UseSimpleColours,
    ]
);

/// `mod-…` with the platform's command key.
#[cfg(target_os = "macos")]
macro_rules! keys {
    ($rest:literal) => {
        concat!("cmd-", $rest)
    };
}
#[cfg(not(target_os = "macos"))]
macro_rules! keys {
    ($rest:literal) => {
        concat!("ctrl-", $rest)
    };
}

/// Binds every shortcut. The global ones work wherever focus is; New, rename and Bin only
/// where they mean something (`Home`, `Workspace`, `FileTree` contexts).
pub fn bind_keys(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new(keys!("shift-p"), ShowCommandPalette, None),
        KeyBinding::new(keys!("p"), QuickOpen, None),
        // 2.8's sidebar shortcut
        KeyBinding::new(keys!("\\"), ToggleSidebar, Some("Workspace")),
        KeyBinding::new(keys!("enter"), CompileProject, Some("Workspace")),
        KeyBinding::new(keys!("n"), NewProject, Some("Home")),
        KeyBinding::new(keys!("n"), NewFile, Some("Workspace")),
        KeyBinding::new(keys!("shift-n"), NewFolder, Some("Workspace")),
        KeyBinding::new("f2", RenameFile, Some("FileTree")),
        // Finder's Move to Bin; Windows' Delete key sends to the Recycle Bin
        #[cfg(target_os = "macos")]
        KeyBinding::new("cmd-backspace", MoveFileToBin, Some("FileTree")),
        #[cfg(not(target_os = "macos"))]
        KeyBinding::new("delete", MoveFileToBin, Some("FileTree")),
    ]);
}
