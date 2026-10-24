fn main() {
    // the page comes from the local backend (a remote origin), so the app's own commands need
    // a permission each, granted in capabilities/default.json
    let manifest =
        tauri_build::AppManifest::new().commands(&["claim_default_handler", "open_diagram"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to run tauri-build");
}
