//! Builds Hunspell's C++ core from the vendored sources in `native/hunspell/core`, the same eleven
//! files and flags 2.8's `binding.gyp` used (static, C++17, `/utf-8` on MSVC).

use std::path::PathBuf;

const SOURCES: [&str; 11] = [
    "affentry",
    "affixmgr",
    "csutil",
    "filemgr",
    "hashmgr",
    "hunspell",
    "hunspelltrace",
    "hunzip",
    "phonet",
    "replist",
    "suggestmgr",
];

fn main() {
    let dir = PathBuf::from("../../../native/hunspell/core/src/hunspell");
    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++17")
        .include(&dir)
        .define("HUNSPELL_STATIC", None)
        .warnings(false);
    if std::env::var("CARGO_CFG_TARGET_ENV").is_ok_and(|env| env == "msvc") {
        build.flag("/utf-8");
    }
    for name in SOURCES {
        let file = dir.join(format!("{name}.cxx"));
        println!("cargo:rerun-if-changed={}", file.display());
        build.file(file);
    }
    println!(
        "cargo:rerun-if-changed={}",
        dir.join("hunspell.h").display()
    );
    build.compile("hunspell");
}
