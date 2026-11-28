//! The rules a request must pass before the worker touches anything. The client runs them too,
//! so a bad request fails in Spectrum, with the same words.

use std::collections::BTreeSet;

use crate::paths::{self, PathError};
use crate::protocol::{Access, Network, PROTOCOL_VERSION, Request, Tier};

/// A request that passed, with its paths normalised.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Launch {
    pub command: String,
    pub cwd: String,
    pub grants: Vec<LaunchGrant>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchGrant {
    pub path: String,
    pub access: Access,
    pub include_secrets: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ValidationError {
    #[error("this worker speaks version {PROTOCOL_VERSION} of the protocol, not {0}")]
    Version(u32),
    #[error(transparent)]
    Path(#[from] PathError),
    #[error(
        "“{0}” is not a native .exe. For an npm or Python program, give the interpreter and pass the script as an argument"
    )]
    NotExe(String),
    #[error("an argument or an environment value holds a NUL character")]
    Nul,
    #[error("“{0}” is not a name an environment variable can have, or is given twice")]
    EnvName(String),
    #[error("the grant “{0}” is a whole drive, or holds the user's or Windows' own folder")]
    TooBroad(String),
    #[error("the grant “{0}” overlaps a folder the request forbids")]
    Forbidden(String),
    #[error("the grants “{0}” and “{1}” overlap")]
    Overlap(String, String),
    #[error("the working folder “{0}” is not inside a grant")]
    CwdOutside(String),
    #[error(
        "an AppContainer cannot reach a gate on this computer: Windows refuses it every local port. Use the restricted tier, or no network"
    )]
    GateInAppContainer,
    #[error("the restricted tier cannot take the network away. Use the AppContainer tier")]
    NoNetworkInRestricted,
    #[error("the gate's port and the process limit must be above zero")]
    Zero,
}

/// Checks a request. `protected` are folders no grant may hold (the user's profile, Windows'
/// folder): the worker passes its own, normalised; a caller that has none passes `&[]`.
pub fn validate(request: &Request, protected: &[String]) -> Result<Launch, ValidationError> {
    if request.v != PROTOCOL_VERSION {
        return Err(ValidationError::Version(request.v));
    }
    let command = paths::normalise(&request.command)?;
    if !command.to_ascii_lowercase().ends_with(".exe") {
        return Err(ValidationError::NotExe(command));
    }
    let nul = |text: &String| text.contains('\0');
    if request.args.iter().any(nul) || request.env.values().any(nul) {
        return Err(ValidationError::Nul);
    }
    let mut names = BTreeSet::new();
    for name in request.env.keys() {
        // Windows reads names without case, and keeps its own under names that start with '='
        let odd = name.is_empty() || name.contains(['=', '\0']);
        if odd || !names.insert(name.to_uppercase()) {
            return Err(ValidationError::EnvName(name.clone()));
        }
    }
    match (request.tier, request.network) {
        (Tier::AppContainer, Network::Gate { .. }) => {
            return Err(ValidationError::GateInAppContainer);
        }
        (Tier::RestrictedLowIntegrity, Network::None) => {
            return Err(ValidationError::NoNetworkInRestricted);
        }
        (_, Network::Gate { port: 0 }) => return Err(ValidationError::Zero),
        _ => {}
    }
    if request.limits.max_processes == 0 {
        return Err(ValidationError::Zero);
    }

    let forbidden = request
        .forbidden
        .iter()
        .map(|path| paths::normalise(path))
        .collect::<Result<Vec<_>, _>>()?;
    let mut grants: Vec<LaunchGrant> = Vec::new();
    for grant in &request.grants {
        let path = paths::normalise(&grant.path)?;
        if path.len() <= 3 || protected.iter().any(|p| paths::within(p, &path)) {
            return Err(ValidationError::TooBroad(path));
        }
        if forbidden.iter().any(|f| paths::overlaps(f, &path)) {
            return Err(ValidationError::Forbidden(path));
        }
        if let Some(other) = grants.iter().find(|g| paths::overlaps(&g.path, &path)) {
            return Err(ValidationError::Overlap(other.path.clone(), path));
        }
        grants.push(LaunchGrant {
            path,
            access: grant.access,
            include_secrets: grant.include_secrets,
        });
    }
    let cwd = paths::normalise(&request.cwd)?;
    if !grants.iter().any(|g| paths::within(&cwd, &g.path)) {
        return Err(ValidationError::CwdOutside(cwd));
    }
    Ok(Launch {
        command,
        cwd,
        grants,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Grant;

    fn request() -> Request {
        let mut request = Request::new(
            Tier::AppContainer,
            r"C:\engines\tectonic.exe",
            r"C:\draft\sub",
        );
        request.grants = vec![
            Grant::new(r"c:\draft\", Access::Write),
            Grant::new(r"C:\engines", Access::Runtime),
        ];
        request
    }

    fn refused(change: impl FnOnce(&mut Request)) -> ValidationError {
        let mut request = request();
        change(&mut request);
        validate(&request, &[r"C:\Users\me".into(), r"C:\Windows".into()]).unwrap_err()
    }

    #[test]
    fn a_good_request_passes_with_normalised_paths() {
        let launch = validate(&request(), &[]).unwrap();
        assert_eq!(launch.command, r"C:\engines\tectonic.exe");
        assert_eq!(launch.cwd, r"C:\draft\sub");
        assert_eq!(launch.grants[0].path, r"C:\draft");
        assert_eq!(launch.grants[1].access, Access::Runtime);
    }

    #[test]
    fn version_command_arguments_and_environment() {
        assert_eq!(refused(|r| r.v = 2), ValidationError::Version(2));
        assert!(matches!(
            refused(|r| r.command = r"C:\npm\codex.cmd".into()),
            ValidationError::NotExe(_)
        ));
        assert!(matches!(
            refused(|r| r.command = "tectonic.exe".into()),
            ValidationError::Path(PathError::NotLocal(_))
        ));
        assert_eq!(
            refused(|r| r.args.push("a\0b".into())),
            ValidationError::Nul
        );
        assert_eq!(
            refused(|r| drop(r.env.insert("A".into(), "\0".into()))),
            ValidationError::Nul
        );
        for name in ["", "A=B", "=C:"] {
            assert!(matches!(
                refused(|r| drop(r.env.insert(name.into(), String::new()))),
                ValidationError::EnvName(_)
            ));
        }
        assert!(matches!(
            refused(|r| {
                r.env.insert("Path".into(), String::new());
                r.env.insert("PATH".into(), String::new());
            }),
            ValidationError::EnvName(_)
        ));
    }

    #[test]
    fn grants_that_are_too_broad_forbidden_or_overlapping() {
        for broad in [r"C:\", r"C:\Users", r"C:\Users\me", r"c:\windows"] {
            assert!(
                matches!(
                    refused(|r| r.grants.push(Grant::new(broad, Access::Read))),
                    ValidationError::TooBroad(_)
                ),
                "{broad}"
            );
        }
        // inside the profile is fine; holding it is not
        let mut inside = request();
        inside.grants.push(Grant::new(
            r"C:\Users\me\AppData\Local\MiKTeX",
            Access::Runtime,
        ));
        assert!(validate(&inside, &[r"C:\Users\me".into()]).is_ok());

        for (forbidden, grant) in [
            (r"C:\live", r"C:\live\build"),
            (r"C:\live\build", r"C:\live"),
            (r"C:\LIVE", r"C:\live"),
        ] {
            assert!(matches!(
                refused(|r| {
                    r.forbidden.push(forbidden.into());
                    r.grants.push(Grant::new(grant, Access::Read));
                }),
                ValidationError::Forbidden(_)
            ));
        }
        assert!(matches!(
            refused(|r| r.grants.push(Grant::new(r"C:\Draft\build", Access::Write))),
            ValidationError::Overlap(_, _)
        ));
        assert!(matches!(
            refused(|r| r.grants.push(Grant::new(r"C:\x\..\draft2", Access::Write))),
            ValidationError::Path(PathError::Ambiguous(_))
        ));
    }

    #[test]
    fn the_working_folder_must_be_granted() {
        assert!(matches!(
            refused(|r| r.cwd = r"C:\elsewhere".into()),
            ValidationError::CwdOutside(_)
        ));
        assert!(matches!(
            refused(|r| r.cwd = r"C:\draft2".into()),
            ValidationError::CwdOutside(_)
        ));
    }

    #[test]
    fn each_tier_takes_only_the_network_rules_it_can_keep() {
        assert_eq!(
            refused(|r| r.network = Network::Gate { port: 4100 }),
            ValidationError::GateInAppContainer
        );
        assert_eq!(
            refused(|r| r.tier = Tier::RestrictedLowIntegrity),
            ValidationError::NoNetworkInRestricted
        );
        assert_eq!(
            refused(|r| {
                r.tier = Tier::RestrictedLowIntegrity;
                r.network = Network::Gate { port: 0 };
            }),
            ValidationError::Zero
        );
        assert_eq!(
            refused(|r| r.limits.max_processes = 0),
            ValidationError::Zero
        );
        let mut open = request();
        open.network = Network::Open;
        assert!(validate(&open, &[]).is_ok());
        open.tier = Tier::RestrictedLowIntegrity;
        open.network = Network::Gate { port: 4100 };
        assert!(validate(&open, &[]).is_ok());
    }
}
