//! What stopped a compile that Trust this project would allow, in words a user can act on (2.8's
//! `blockedNotes`).

const TRUST_HINT: &str = "If this project is yours, or you have checked what it does, turn on “Trust this project” in the Compile menu and compile again.";

/// A long path keeps its end, where the file's name is; a long command its start.
fn tail(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() > 120 {
        format!("…{}", chars[chars.len() - 117..].iter().collect::<String>())
    } else {
        text.to_owned()
    }
}

fn head(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() > 120 {
        format!("{}…", chars[..117].iter().collect::<String>())
    } else {
        text.to_owned()
    }
}

fn listed(items: &[String], short: fn(&str) -> String) -> String {
    let mut seen: Vec<&String> = Vec::new();
    for item in items {
        if !seen.contains(&item) {
            seen.push(item);
        }
    }
    seen.iter()
        .take(3)
        .map(|item| format!("“{}”", short(item)))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Lines for the log, or `""`. `log`: the compile's output with TeX's line breaks undone; `pass_log`: the last
/// pass's own log file, where TeX notes the commands it didn't run; `confined`: it ran in the sandbox, whose
/// refusals programs report as "Operation not permitted"; `failed`: it ended with errors, so these are errors.
pub fn blocked_notes(log: &str, pass_log: &str, confined: bool, failed: bool) -> String {
    let mut notes = Vec::new();
    let refused: Vec<&str> = if confined {
        log.lines()
            .filter(|l| l.contains("Operation not permitted"))
            .collect()
    } else {
        Vec::new()
    };
    let net = crate::regex(r"(?i)connect|socket|resolve|fetch");
    let network = refused.iter().any(|l| net.is_match(l));
    let things: Vec<String> = refused
        .iter()
        .filter(|l| !net.is_match(l))
        .map(|line| {
            crate::regex(r"'([^']+)' \(Operation not permitted")
                .captures(line)
                .map_or_else(
                    || {
                        let cut =
                            crate::regex(r":? ?\(?Operation not permitted.*$").replace(line, "");
                        cut.split(": ").last().unwrap_or("").trim().to_owned()
                    },
                    |c| c[1].to_owned(),
                )
        })
        .filter(|t| !t.is_empty())
        .collect();
    if !refused.is_empty() {
        let mut what = Vec::new();
        if !things.is_empty() {
            what.push(format!("using {}", listed(&things, tail)));
        }
        if network {
            what.push("using the network".to_owned());
        }
        let what = if what.is_empty() {
            "something it tried".to_owned()
        } else {
            what.join(" and ")
        };
        notes.push(format!("Spectrum’s sandbox stopped this compile from {what}. A compile can write only its own build files, run only TeX’s own programs and use no network."));
    }
    let commands: Vec<String> =
        crate::regex(r"(?m)^runsystem\((.*)\)\.\.\.disabled(?: \(restricted\))?\.$")
            .captures_iter(pass_log)
            .map(|c| c[1].to_owned())
            .collect();
    if !commands.is_empty()
        || crate::regex(r"(?im)^(?:!|.*Error:).*(?:-shell-escape|shell[- ]escape|write18)")
            .is_match(log)
    {
        let run = if commands.is_empty() {
            String::new()
        } else {
            format!(" to run {}", listed(&commands, head))
        };
        notes.push(format!("This document needs full shell escape{run}. Spectrum compiles with TeX’s restricted shell escape, which runs only TeX’s own short list of programs; trusting the project turns on full shell escape."));
    }
    let unwritten: Vec<String> = crate::regex(r"Not writing to (.+?) \(openout_any = ")
        .captures_iter(log)
        .map(|c| c[1].to_owned())
        .collect();
    if !unwritten.is_empty() {
        notes.push(format!(
            "TeX didn’t write {}, outside the document’s build folder; for a trusted project it does.",
            listed(&unwritten, tail)
        ));
    }
    if notes.is_empty() {
        return String::new();
    }
    let kind = if failed { "" } else { " warning" };
    format!("\n[spectrum{kind}] {} {TRUST_HINT}\n", notes.join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sandbox_refusals_shell_escape_and_unwritten_files() {
        let log = "sh: line 4: /Users/a/x.txt: Operation not permitted\nlua: cannot open file '/etc/y' (Operation not permitted)\nCan't connect to host:443 (Operation not permitted)\n! Package minted Error: You must invoke LaTeX with the -shell-escape flag.\nNot writing to /tmp/z.tex (openout_any = p).";
        let pass = "runsystem(pygmentize -V)...disabled (restricted).\n";
        let notes = blocked_notes(log, pass, true, true);
        assert!(notes.starts_with("\n[spectrum] Spectrum’s sandbox stopped this compile from using “/Users/a/x.txt”, “/etc/y” and using the network."));
        assert!(notes.contains("to run “pygmentize -V”"));
        assert!(notes.contains("TeX didn’t write “/tmp/z.tex”"));
        assert!(notes.ends_with("compile again.\n"));
        assert_eq!(blocked_notes("fine", "", true, false), "");
        // not confined: the sandbox's words aren't read
        assert_eq!(
            blocked_notes("x: Operation not permitted", "", false, false),
            ""
        );
    }
}
