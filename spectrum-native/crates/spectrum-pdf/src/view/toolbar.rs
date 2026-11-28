//! The PDF pane's bar: page indicator on the left; on the right a pill with zoom out, the zoom
//! and zoom in, then the Fit width / Fit page switch. Calm workspace chrome: neutral icons, no
//! fills at rest. Icons are the blueprint's line set (`assets/icons/ui`).

use super::PdfPanel;
use crate::layout::Zoom;
use gpui_kit::{
    ClickEvent, Context, FontWeight, InteractiveElement, IntoElement, ParentElement, SharedString,
    StatefulInteractiveElement, Styled, Window, div, prelude::*, px, svg,
};
use spectrum_theme::SpectrumTheme;
use spectrum_ui::{Segmented, pane_bar};

/// A line icon from `assets/icons/ui`, served by the app's asset source.
fn line_icon(name: &str) -> SharedString {
    format!("icons/ui/{name}.svg").into()
}

fn tool_button(
    id: &'static str,
    icon: &str,
    theme: &SpectrumTheme,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut gpui_kit::App) + 'static,
) -> impl IntoElement {
    div()
        .id(id)
        .size(px(24.))
        .flex()
        .flex_none()
        .items_center()
        .justify_center()
        .rounded_full()
        .hover(|s| s.bg(theme.bg_hover))
        .cursor_pointer()
        .child(
            svg()
                .path(line_icon(icon))
                .size(px(15.))
                .text_color(theme.text_secondary),
        )
        .on_click(on_click)
}

impl PdfPanel {
    pub(super) fn toolbar(
        &self,
        theme: &SpectrumTheme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let page = match self.page() {
            Some((page, count)) => format!("Page {} of {count}", page + 1),
            None => "No PDF yet".to_owned(),
        };
        let percent = format!("{}%", (self.scale_now() * 100.).round());
        let fit = match self.zoom {
            Zoom::FitWidth => 0,
            Zoom::FitPage => 1,
            Zoom::Scale(_) => usize::MAX,
        };
        let entity = cx.entity().downgrade();
        let on = move |f: fn(&mut PdfPanel, &mut Context<PdfPanel>)| {
            let entity = entity.clone();
            move |_: &ClickEvent, _: &mut Window, cx: &mut gpui_kit::App| {
                let _ = entity.update(cx, f);
            }
        };
        let fit_entity = cx.entity().downgrade();
        let shown = self.shown.is_some();
        pane_bar(theme)
            .text_size(px(12.))
            .text_color(theme.text_secondary)
            .child(div().pl(px(4.)).child(page))
            .child(div().flex_1())
            .when(shown, |bar| {
                bar.child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(2.))
                        .p(px(2.))
                        .rounded_full()
                        .bg(theme.bg_panel)
                        .border_1()
                        .border_color(theme.border)
                        .child(tool_button(
                            "pdf-zoom-out",
                            "pdf-zoom-out",
                            theme,
                            on(|p, cx| p.step(-1, cx)),
                        ))
                        .child(
                            div()
                                .min_w(px(44.))
                                .flex()
                                .justify_center()
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(theme.text)
                                .child(percent),
                        )
                        .child(tool_button(
                            "pdf-zoom-in",
                            "pdf-zoom-in",
                            theme,
                            on(|p, cx| p.step(1, cx)),
                        )),
                )
                .child(
                    div()
                        .ml(px(6.))
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .child(
                            svg()
                                .path(line_icon("pdf-fit"))
                                .size(px(15.))
                                .text_color(theme.text_tertiary),
                        )
                        .child(
                            Segmented::new("pdf-fit")
                                .item("Fit width")
                                .item("Fit page")
                                .selected(fit)
                                .on_select(move |&ix, _, cx| {
                                    let zoom = if ix == 0 {
                                        Zoom::FitWidth
                                    } else {
                                        Zoom::FitPage
                                    };
                                    let _ = fit_entity.update(cx, |p, cx| p.set_zoom(zoom, cx));
                                }),
                        ),
                )
            })
    }
}
