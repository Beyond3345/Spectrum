//! Spectrum's side of the Windows isolation worker (`spectrum-win-sandbox.exe`): the wire
//! format, the rules a request must pass, and a client that compiles on every platform.
//!
//! The worker itself (`main.rs`) replaces 2.8's `native/agent-sandbox/Worker.cs`.

pub mod client;
pub mod paths;
pub mod protocol;
pub mod validate;

pub use client::{ClientError, Controller, Events, Output, Session, spawn};
pub use protocol::{
    Access, Control, ErrorKind, Event, ExitReason, Grant, Limits, Network, PROTOCOL_VERSION,
    Request, Tier,
};
pub use validate::{Launch, LaunchGrant, ValidationError, validate};
