//! The command line and environment block Windows starts a program with.

// off Windows only the tests use this
#![cfg_attr(not(windows), allow(dead_code))]

use std::collections::BTreeMap;

/// One argument in the C runtime's quoting. Arguments never pass through `cmd.exe`.
fn quote(argument: &str, line: &mut String) {
    line.push('"');
    let mut slashes = 0;
    for c in argument.chars() {
        if c == '\\' {
            slashes += 1;
            continue;
        }
        // backslashes are literal, except before a quote, where each is doubled
        let needed = if c == '"' { slashes * 2 + 1 } else { slashes };
        line.extend(std::iter::repeat_n('\\', needed));
        line.push(c);
        slashes = 0;
    }
    line.extend(std::iter::repeat_n('\\', slashes * 2));
    line.push('"');
}

pub(crate) fn command_line(command: &str, arguments: &[String]) -> String {
    let mut line = String::new();
    quote(command, &mut line);
    for argument in arguments {
        line.push(' ');
        quote(argument, &mut line);
    }
    line
}

/// The variables that point a program at the gate (2.8's `proxyEnv`).
fn gate_variables(port: u16) -> [(&'static str, String); 4] {
    let url = format!("http://127.0.0.1:{port}");
    [
        ("HTTPS_PROXY", url.clone()),
        ("HTTP_PROXY", url),
        ("NO_PROXY", "localhost,127.0.0.1,::1".to_owned()),
        ("NODE_USE_ENV_PROXY", "1".to_owned()),
    ]
}

/// The program's whole environment, in the order Windows wants (by name, ignoring case): the
/// request's, `SystemRoot` and `windir` from the worker's own when the request has none (Winsock
/// and the loader need them), and with a gate its proxy variables in place of any the request
/// carries (`ALL_PROXY` too: the user's own proxy is the gate's business).
pub(crate) fn environment(
    requested: &BTreeMap<String, String>,
    own: impl Fn(&str) -> Option<String>,
    gate: Option<u16>,
) -> Vec<(String, String)> {
    // Windows reads names without case
    let mut variables: BTreeMap<String, (String, String)> = requested
        .iter()
        .map(|(name, value)| (name.to_uppercase(), (name.clone(), value.clone())))
        .collect();
    for name in ["SystemRoot", "windir"] {
        if let Some(value) = own(name) {
            variables
                .entry(name.to_uppercase())
                .or_insert((name.to_owned(), value));
        }
    }
    if let Some(port) = gate {
        variables.remove("ALL_PROXY");
        for (name, value) in gate_variables(port) {
            variables.insert(name.to_owned(), (name.to_owned(), value));
        }
    }
    variables.into_values().collect()
}

/// `NAME=value\0…\0` in UTF-16.
pub(crate) fn environment_block(variables: &[(String, String)]) -> Vec<u16> {
    let mut block: Vec<u16> = Vec::new();
    for (name, value) in variables {
        block.extend(name.encode_utf16());
        block.push(u16::from(b'='));
        block.extend(value.encode_utf16());
        block.push(0);
    }
    if variables.is_empty() {
        block.push(0);
    }
    block.push(0);
    block
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(arguments: &[&str]) -> String {
        let arguments: Vec<String> = arguments.iter().map(|a| (*a).to_owned()).collect();
        command_line(r"C:\Program Files\node\node.exe", &arguments)
    }

    /// The one argument as the command line carries it.
    fn quoted(argument: &str) -> String {
        let line = command_line("x", &[argument.to_owned()]);
        line.strip_prefix(r#""x" "#).unwrap().to_owned()
    }

    #[test]
    fn arguments_are_quoted_as_the_c_runtime_reads_them() {
        assert_eq!(line(&[]), r#""C:\Program Files\node\node.exe""#);
        assert_eq!(
            line(&["-e", "a b", ""]),
            r#""C:\Program Files\node\node.exe" "-e" "a b" """#
        );
        // a quote, a backslash before a quote, and backslashes at the end
        assert_eq!(quoted(r#"say "hi""#), r#""say \"hi\"""#);
        assert_eq!(quoted(r#"a\"b"#), r#""a\\\"b""#);
        assert_eq!(quoted(r"C:\dir\"), r#""C:\dir\\""#);
        assert_eq!(quoted(r"C:\a\b"), r#""C:\a\b""#);
        // nothing a shell would read is special here
        assert_eq!(quoted("&calc|%PATH%^"), r#""&calc|%PATH%^""#);
    }

    fn requested(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(n, v)| ((*n).to_owned(), (*v).to_owned()))
            .collect()
    }

    fn own(name: &str) -> Option<String> {
        (name == "SystemRoot").then(|| r"C:\Windows".to_owned())
    }

    #[test]
    fn the_environment_is_the_requests_plus_the_system_root() {
        let variables = environment(
            &requested(&[("b", "2"), ("A", "1"), ("PATH", "x")]),
            own,
            None,
        );
        let names: Vec<&str> = variables.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, ["A", "b", "PATH", "SystemRoot"]);
        // the request's own wins, whatever its case
        let kept = environment(&requested(&[("SYSTEMROOT", r"D:\W")]), own, None);
        assert_eq!(kept, [("SYSTEMROOT".to_owned(), r"D:\W".to_owned())]);
    }

    #[test]
    fn a_gate_replaces_the_requests_proxy_variables() {
        let variables = environment(
            &requested(&[
                ("https_proxy", "http://corp:8080"),
                ("All_Proxy", "socks5://x"),
            ]),
            |_| None,
            Some(4100),
        );
        assert_eq!(
            variables,
            [
                ("HTTPS_PROXY".to_owned(), "http://127.0.0.1:4100".to_owned()),
                ("HTTP_PROXY".to_owned(), "http://127.0.0.1:4100".to_owned()),
                ("NODE_USE_ENV_PROXY".to_owned(), "1".to_owned()),
                ("NO_PROXY".to_owned(), "localhost,127.0.0.1,::1".to_owned()),
            ]
        );
    }

    #[test]
    fn the_block_is_null_separated_and_doubly_ended() {
        let block = environment_block(&[("A".into(), "1".into()), ("B".into(), "é".into())]);
        assert_eq!(String::from_utf16(&block).unwrap(), "A=1\0B=é\0\0");
        assert_eq!(environment_block(&[]), [0, 0]);
    }
}
