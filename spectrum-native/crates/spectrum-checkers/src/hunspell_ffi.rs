//! Hunspell 1.7.6 through its C API (`hunspell.h`), built by `build.rs` from `native/hunspell/core`.
//! The only module in the crate with `unsafe`; [`SpellChecker`] is the safe face of it.
//!
//! Thread rules: Hunspell keeps state between calls on one handle, so a [`SpellChecker`] is `Send`
//! (the handle has no thread affinity) but not `Sync`: one thread at a time, as 2.8's spell worker
//! did. Share one behind a `Mutex`, or give each thread its own.

use std::ffi::{CStr, CString, c_char, c_int};
use std::path::Path;

use crate::CheckerError;

#[repr(C)]
struct Hunhandle {
    _private: [u8; 0],
}

unsafe extern "C" {
    fn Hunspell_create(affpath: *const c_char, dpath: *const c_char) -> *mut Hunhandle;
    fn Hunspell_destroy(handle: *mut Hunhandle);
    fn Hunspell_add_dic(handle: *mut Hunhandle, dpath: *const c_char) -> c_int;
    fn Hunspell_spell(handle: *mut Hunhandle, word: *const c_char) -> c_int;
    fn Hunspell_get_dic_encoding(handle: *mut Hunhandle) -> *mut c_char;
    fn Hunspell_suggest(
        handle: *mut Hunhandle,
        slst: *mut *mut *mut c_char,
        word: *const c_char,
    ) -> c_int;
    fn Hunspell_free_list(handle: *mut Hunhandle, slst: *mut *mut *mut c_char, n: c_int);
    fn Hunspell_add(handle: *mut Hunhandle, word: *const c_char) -> c_int;
}

/// One Hunspell dictionary, UTF-8 or ISO 8859-1 (words cross in UTF-8 either way).
pub struct SpellChecker {
    handle: *mut Hunhandle,
    latin1: bool,
}

// SAFETY: a Hunhandle is a heap object with no thread-local state; moving it to another thread is
// fine. It is not Sync (the raw pointer keeps it so): calls must not overlap.
unsafe impl Send for SpellChecker {}

impl SpellChecker {
    /// Opens `aff` and `dic`. Fails when either is missing, a path can't be passed to Hunspell, or the
    /// dictionary is in an encoding other than UTF-8 or ISO8859-1 (2.8's rule).
    pub fn new(aff: &Path, dic: &Path) -> Result<Self, CheckerError> {
        let (aff_c, dic_c) = (c_path(aff)?, c_path(dic)?);
        // SAFETY: both are valid NUL-terminated strings that outlive the call.
        let handle = unsafe { Hunspell_create(aff_c.as_ptr(), dic_c.as_ptr()) };
        if handle.is_null() {
            return Err(CheckerError::Dictionary(format!(
                "Hunspell couldn’t open {}",
                dic.display()
            )));
        }
        let mut checker = Self {
            handle,
            latin1: false,
        };
        let encoding = checker.encoding();
        match encoding.as_str() {
            "UTF-8" => {}
            "ISO8859-1" => checker.latin1 = true,
            other => return Err(CheckerError::Encoding(other.to_owned())),
        }
        Ok(checker)
    }

    /// Adds another word list (a supplement) to this dictionary.
    pub fn add_dic(&mut self, dic: &Path) -> Result<(), CheckerError> {
        let dic_c = c_path(dic)?;
        // SAFETY: handle is live (owned by self); dic_c outlives the call.
        let status = unsafe { Hunspell_add_dic(self.handle, dic_c.as_ptr()) };
        if status == 0 {
            Ok(())
        } else {
            Err(CheckerError::Dictionary(format!(
                "Hunspell couldn’t add {}",
                dic.display()
            )))
        }
    }

    /// The dictionary's `SET` encoding as Hunspell reports it.
    pub fn encoding(&self) -> String {
        // SAFETY: handle is live; the returned string is owned by Hunspell and valid while it is.
        let raw = unsafe { Hunspell_get_dic_encoding(self.handle) };
        if raw.is_null() {
            return String::new();
        }
        // SAFETY: non-null, NUL-terminated, owned by the live handle.
        unsafe { CStr::from_ptr(raw) }
            .to_string_lossy()
            .into_owned()
    }

    /// Whether the dictionary accepts `word`. A word a Latin-1 dictionary can't hold is wrong.
    pub fn check(&self, word: &str) -> bool {
        let Some(word_c) = self.encode(word) else {
            return false;
        };
        // SAFETY: handle is live; word_c outlives the call.
        unsafe { Hunspell_spell(self.handle, word_c.as_ptr()) != 0 }
    }

    /// Hunspell's suggestions for `word`, in its order.
    pub fn suggest(&self, word: &str) -> Vec<String> {
        let Some(word_c) = self.encode(word) else {
            return Vec::new();
        };
        let mut list: *mut *mut c_char = std::ptr::null_mut();
        // SAFETY: handle is live; Hunspell allocates `list` with n entries, freed below.
        let n = unsafe { Hunspell_suggest(self.handle, &raw mut list, word_c.as_ptr()) };
        let mut out = Vec::with_capacity(usize::try_from(n).unwrap_or(0));
        if !list.is_null() {
            for i in 0..usize::try_from(n).unwrap_or(0) {
                // SAFETY: i < n, so the entry is a valid NUL-terminated string Hunspell allocated.
                let bytes = unsafe { CStr::from_ptr(*list.add(i)) }.to_bytes();
                out.push(self.decode(bytes));
            }
            // SAFETY: list and n are exactly what Hunspell_suggest returned.
            unsafe { Hunspell_free_list(self.handle, &raw mut list, n) };
        }
        out
    }

    /// Adds a word (a personal one) to this dictionary for as long as it is open.
    pub fn add(&mut self, word: &str) -> Result<(), CheckerError> {
        let word_c = self
            .encode(word)
            .ok_or_else(|| CheckerError::Word(word.to_owned()))?;
        // SAFETY: handle is live; word_c outlives the call.
        let status = unsafe { Hunspell_add(self.handle, word_c.as_ptr()) };
        if status == 0 {
            Ok(())
        } else {
            Err(CheckerError::Word(word.to_owned()))
        }
    }

    fn encode(&self, word: &str) -> Option<CString> {
        if self.latin1 {
            CString::new(to_latin1(word)?).ok()
        } else {
            CString::new(word).ok()
        }
    }

    fn decode(&self, bytes: &[u8]) -> String {
        if self.latin1 {
            bytes.iter().map(|&b| char::from(b)).collect()
        } else {
            String::from_utf8_lossy(bytes).into_owned()
        }
    }
}

impl Drop for SpellChecker {
    fn drop(&mut self) {
        // SAFETY: handle came from Hunspell_create and is destroyed once.
        unsafe { Hunspell_destroy(self.handle) };
    }
}

/// A word as Latin-1 bytes; None when it has a character above U+00FF.
fn to_latin1(word: &str) -> Option<Vec<u8>> {
    word.chars()
        .map(|c| u8::try_from(u32::from(c)).ok())
        .collect()
}

/// A path as Hunspell opens it: UTF-8 bytes, and on Windows the `\\?\` form, which Hunspell's
/// `myopen` (csutil.cxx) turns into a wide path, so folders that aren't ASCII open.
fn c_path(path: &Path) -> Result<CString, CheckerError> {
    if !path.is_file() {
        return Err(CheckerError::Dictionary(format!(
            "Missing dictionary file {}",
            path.display()
        )));
    }
    let text = hun_path(path)
        .ok_or_else(|| CheckerError::Dictionary(format!("Unreadable path {}", path.display())))?;
    CString::new(text)
        .map_err(|_| CheckerError::Dictionary(format!("Unreadable path {}", path.display())))
}

#[cfg(windows)]
fn hun_path(path: &Path) -> Option<String> {
    let full = std::path::absolute(path).ok()?;
    let text = full.to_str()?.replace('/', "\\");
    Some(if text.starts_with(r"\\?\") {
        text
    } else if let Some(unc) = text.strip_prefix(r"\\") {
        format!(r"\\?\UNC\{unc}")
    } else {
        format!(r"\\?\{text}")
    })
}

#[cfg(not(windows))]
fn hun_path(path: &Path) -> Option<String> {
    path.to_str().map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn dictionaries() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../dictionaries")
    }

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("spectrum-checkers-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn opens_a_folder_that_is_not_ascii_and_spells_utf8_and_latin1() {
        let dir = scratch("拼写-é");
        for file in ["en_AU.aff", "en_AU.dic"] {
            std::fs::copy(dictionaries().join("en_AU").join(file), dir.join(file)).unwrap();
        }
        let au = SpellChecker::new(&dir.join("en_AU.aff"), &dir.join("en_AU.dic")).unwrap();
        assert_eq!(
            ["colour", "color", "naïve"].map(|w| au.check(w)),
            [true, false, true]
        );

        std::fs::write(
            dir.join("l.aff"),
            b"SET ISO8859-1\nTRY ae\xe9io\xefu\xe7ncfdtv\n",
        )
        .unwrap();
        std::fs::write(
            dir.join("l.dic"),
            b"4\ncaf\xe9\nna\xefve\nfa\xe7ade\ndevant\n",
        )
        .unwrap();
        let latin = SpellChecker::new(&dir.join("l.aff"), &dir.join("l.dic")).unwrap();
        assert_eq!(latin.encoding(), "ISO8859-1");
        assert_eq!(
            ["café", "naïve", "cafe", "naïve€", "façade"].map(|w| latin.check(w)),
            [true, true, false, false, true]
        );
        assert!(latin.suggest("cafe").contains(&"café".to_owned()));

        std::fs::write(dir.join("k.aff"), "SET KOI8-R\n").unwrap();
        std::fs::write(dir.join("k.dic"), "1\nx\n").unwrap();
        let err = SpellChecker::new(&dir.join("k.aff"), &dir.join("k.dic"))
            .err()
            .unwrap();
        assert!(
            matches!(err, CheckerError::Encoding(ref e) if e == "KOI8-R"),
            "{err}"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn suggests_adds_and_reports_missing_files() {
        let en = dictionaries().join("en_AU");
        let mut au = SpellChecker::new(&en.join("en_AU.aff"), &en.join("en_AU.dic")).unwrap();
        assert!(au.suggest("recieve").contains(&"receive".to_owned()));
        assert!(!au.check("Spectrumish"));
        au.add("Spectrumish").unwrap();
        assert!(au.check("Spectrumish"));
        au.add_dic(&dictionaries().join("spectrum-extra.dic"))
            .unwrap();
        assert!(au.check("arXiv"));
        assert!(SpellChecker::new(&en.join("missing.aff"), &en.join("en_AU.dic")).is_err());
    }
}
