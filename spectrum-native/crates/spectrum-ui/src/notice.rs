//! Toasts from `UserNotice`, the error shape every crate shares.

use gpui_kit::component::WindowExt as _;
use gpui_kit::component::button::ButtonVariant;
use gpui_kit::component::notification::{Notification, NotificationType};
use gpui_kit::{App, Window};
use spectrum_core::UserNotice;

/// How a notice reads: a problem, or news that something worked.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tone {
    Info,
    Success,
    Error,
}

/// The notice's message line: its detail, then what to do about it.
pub fn notice_message(notice: &UserNotice) -> String {
    match &notice.action {
        Some(action) if !notice.detail.is_empty() => format!("{} {action}", notice.detail),
        Some(action) => action.clone(),
        None => notice.detail.clone(),
    }
}

/// Shows `notice` as a toast in `window`.
pub fn show_notice(window: &mut Window, cx: &mut App, notice: &UserNotice, tone: Tone) {
    let kind = match tone {
        Tone::Info => NotificationType::Info,
        Tone::Success => NotificationType::Success,
        Tone::Error => NotificationType::Error,
    };
    let note = Notification::new()
        .title(notice.title.clone())
        .message(notice_message(notice))
        .with_type(kind);
    window.push_notification(note, cx);
}

/// Asks before something the user may regret (a move to the Bin): a title that is the question, a
/// line on what happens, Cancel and a red `ok` button.
pub fn confirm(
    window: &mut Window,
    cx: &mut App,
    title: String,
    message: String,
    ok: String,
    on_ok: impl Fn(&mut Window, &mut App) + 'static,
) {
    let on_ok = std::rc::Rc::new(on_ok);
    window.open_alert_dialog(cx, move |dialog, _, _| {
        let on_ok = on_ok.clone();
        dialog
            .confirm()
            .title(title.clone())
            .description(message.clone())
            .ok_text(ok.clone())
            .ok_variant(ButtonVariant::Danger)
            .cancel_text("Cancel")
            .on_ok(move |_, window, cx| {
                on_ok(window, cx);
                true
            })
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_joins_detail_and_action() {
        let n = UserNotice::new("Couldn't rename", "main.tex is open elsewhere.");
        assert_eq!(notice_message(&n), "main.tex is open elsewhere.");
        let n = n.with_action("Close it and try again.");
        assert_eq!(
            notice_message(&n),
            "main.tex is open elsewhere. Close it and try again."
        );
        assert_eq!(
            notice_message(&UserNotice::new("t", "").with_action("Do it.")),
            "Do it."
        );
    }
}
