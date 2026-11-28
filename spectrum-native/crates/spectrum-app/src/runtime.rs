//! The bridge between GPUI's executor and the one shared Tokio runtime.
//!
//! GPUI runs its own executor, so reqwest, `tokio::process` and `tokio::time` panic there
//! ("no reactor running"). Every Tokio future goes through [`spawn_tokio`] instead.

use std::future::Future;
use std::sync::OnceLock;
use tokio::runtime::{Builder, Runtime};

static TOKIO: OnceLock<Runtime> = OnceLock::new();

#[derive(Debug, thiserror::Error)]
pub enum RuntimeError {
    #[error("the background runtime isn't running")]
    NotInitialised,
    #[error("the background runtime couldn't start: {0}")]
    Start(#[from] std::io::Error),
    #[error("the background task was cancelled or panicked")]
    TaskCancelled,
}

/// Starts the shared runtime. Call once at startup, before any [`spawn_tokio`].
pub fn init() -> Result<(), RuntimeError> {
    if TOKIO.get().is_some() {
        return Ok(());
    }
    let runtime = Builder::new_multi_thread()
        .worker_threads(4)
        .thread_name("spectrum-tokio")
        .enable_all()
        .build()?;
    // a second caller racing here would build a spare runtime that is dropped; harmless
    let _ = TOKIO.set(runtime);
    Ok(())
}

/// Runs `fut` on the Tokio runtime and awaits its result from any executor (GPUI's included).
pub async fn spawn_tokio<F, T>(fut: F) -> Result<T, RuntimeError>
where
    F: Future<Output = T> + Send + 'static,
    T: Send + 'static,
{
    let runtime = TOKIO.get().ok_or(RuntimeError::NotInitialised)?;
    let (tx, rx) = futures::channel::oneshot::channel();
    runtime.spawn(async move {
        let _ = tx.send(fut.await);
    });
    rx.await.map_err(|_| RuntimeError::TaskCancelled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_tokio_futures_from_a_foreign_executor() {
        init().unwrap();
        // futures' block_on is not Tokio, like GPUI's executor
        let out = futures::executor::block_on(spawn_tokio(async {
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
            42
        }));
        assert_eq!(out.unwrap(), 42);
    }

    #[test]
    fn a_panicking_task_is_an_error_not_a_crash() {
        init().unwrap();
        let out = futures::executor::block_on(spawn_tokio(async { panic!("boom") }));
        assert!(matches!(out, Err::<(), _>(RuntimeError::TaskCancelled)));
    }
}
