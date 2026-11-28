//! Home: the project folders as a grid or a list, with search and New project (plan Section 3,
//! "Projects Home & Templates"). The plan draws no mockup for it, so it uses Blueprint 1's system:
//! one 16 px panel on the app surface, 12 px cards, the Projects area's rose for folders.

mod projects;

use crate::actions::{NewProject, OpenProject};
use gpui_kit::{
    AnyElement, AppContext, Context, Entity, EventEmitter, FocusHandle, Focusable, FontWeight,
    IntoElement, ParentElement, Render, SharedString, Styled, Subscription, Window, div,
    prelude::*, px, white,
};
pub use projects::{ProjectCard, load_projects, new_project, time_ago};
use spectrum_core::{AppPaths, UserNotice};
use spectrum_theme::{AreaHue, RADIUS_CONTROL, SpectrumTheme};
use spectrum_ui::input::{Input, InputEvent, InputState};
use spectrum_ui::{
    IconName, Segmented, TITLE_BAR_HEIGHT, TitleBar, Tone, card, fuzzy, icon, panel, prism_bar,
    show_notice,
};
use std::path::PathBuf;
use std::time::SystemTime;

/// A folder as people say it: `~/Documents/Spectrum`, not the full home path.
fn tilde(path: &std::path::Path) -> String {
    match std::env::home_dir().and_then(|home| {
        path.strip_prefix(home)
            .ok()
            .map(std::path::Path::to_path_buf)
    }) {
        Some(rest) => format!("~/{}", rest.display()),
        None => path.display().to_string(),
    }
}

pub enum HomeEvent {
    Open(PathBuf),
}

pub struct HomeView {
    focus_handle: FocusHandle,
    paths: AppPaths,
    projects: Vec<ProjectCard>,
    loaded: bool,
    search: Entity<InputState>,
    grid: bool,
    naming: Option<Entity<InputState>>,
    subscriptions: Vec<Subscription>,
}

impl EventEmitter<HomeEvent> for HomeView {}

impl Focusable for HomeView {
    fn focus_handle(&self, _: &gpui_kit::App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl HomeView {
    pub fn new(paths: AppPaths, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let focus_handle = cx.focus_handle();
        focus_handle.focus(window, cx);
        let search = cx.new(|cx| InputState::new(window, cx).placeholder("Search projects"));
        let sub = cx.subscribe_in(
            &search,
            window,
            |this, _, event: &InputEvent, window, cx| match event {
                InputEvent::Change => cx.notify(),
                InputEvent::PressEnter { .. } => this.open_first(window, cx),
                _ => {}
            },
        );
        let this = Self {
            focus_handle,
            paths,
            projects: Vec::new(),
            loaded: false,
            search,
            grid: true,
            naming: None,
            subscriptions: vec![sub],
        };
        this.reload(window, cx);
        this
    }

    fn reload(&self, window: &mut Window, cx: &mut Context<Self>) {
        let paths = self.paths.clone();
        cx.spawn_in(window, async move |this, cx| {
            let loaded = cx
                .background_executor()
                .spawn(async move { load_projects(&paths) })
                .await;
            let _ = this.update_in(cx, |this, window, cx| {
                this.loaded = true;
                match loaded {
                    Ok(projects) => this.projects = projects,
                    Err(notice) => show_notice(window, cx, &notice, Tone::Error),
                }
                cx.notify();
            });
        })
        .detach();
    }

    /// The projects the search leaves, in order.
    fn shown(&self, cx: &gpui_kit::App) -> Vec<&ProjectCard> {
        let query = self.search.read(cx).value();
        if query.trim().is_empty() {
            return self.projects.iter().collect();
        }
        let names: Vec<&str> = self.projects.iter().map(|p| p.name.as_str()).collect();
        fuzzy::rank(&query, &names, false)
            .into_iter()
            .map(|m| &self.projects[m.index])
            .collect()
    }

    fn open(project: &ProjectCard, window: &mut Window, cx: &mut Context<Self>) {
        if project.missing {
            let notice = UserNotice::new(
                format!("Can't open “{}”", project.name),
                format!("Its folder isn't at {} any more.", project.path.display()),
            );
            show_notice(window, cx, &notice, Tone::Error);
        } else {
            cx.emit(HomeEvent::Open(project.path.clone()));
        }
    }

    fn open_first(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(first) = self.shown(cx).first().map(|p| (*p).clone()) {
            Self::open(&first, window, cx);
        }
    }

    fn on_open(&mut self, _: &OpenProject, window: &mut Window, cx: &mut Context<Self>) {
        self.open_first(window, cx);
    }

    fn on_new(&mut self, _: &NewProject, window: &mut Window, cx: &mut Context<Self>) {
        self.begin_new(window, cx);
    }

    fn begin_new(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let input = cx.new(|cx| InputState::new(window, cx).placeholder("Project name"));
        input.update(cx, |i, cx| i.focus(window, cx));
        let sub = cx.subscribe_in(
            &input,
            window,
            |this, input, event: &InputEvent, window, cx| match event {
                InputEvent::PressEnter { .. } => {
                    let name = input.read(cx).value().to_string();
                    this.create(name, window, cx);
                }
                InputEvent::Blur => {
                    this.naming = None;
                    cx.notify();
                }
                _ => {}
            },
        );
        self.subscriptions.push(sub);
        self.naming = Some(input);
        cx.notify();
    }

    fn create(&mut self, name: String, window: &mut Window, cx: &mut Context<Self>) {
        self.naming = None;
        cx.notify();
        let paths = self.paths.clone();
        cx.spawn_in(window, async move |this, cx| {
            let made = cx
                .background_executor()
                .spawn(async move { new_project(&paths, &name) })
                .await;
            let _ = this.update_in(cx, |_, window, cx| match made {
                Ok(root) => cx.emit(HomeEvent::Open(root)),
                Err(notice) => show_notice(window, cx, &notice, Tone::Error),
            });
        })
        .detach();
    }

    fn header(
        &self,
        theme: &SpectrumTheme,
        count: usize,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let new_fill = theme.area(AreaHue::Flow).band;
        let folder = tilde(&self.paths.projects_dir);
        let subtitle = match count {
            1 => format!("1 project in {folder}"),
            n => format!("{n} projects in {folder}"),
        };
        let search = div()
            .w(px(240.))
            .h(px(32.))
            .px(px(10.))
            .flex()
            .items_center()
            .gap(px(8.))
            .rounded(px(RADIUS_CONTROL))
            .bg(theme.bg_subtle)
            .border_1()
            .border_color(theme.border)
            .text_size(px(13.))
            .child(icon(IconName::Search, 14., theme.text_tertiary))
            .child(
                div()
                    .flex_1()
                    .child(Input::new(&self.search).appearance(false)),
            );
        let layout = Segmented::new("home-layout")
            .icon_item(IconName::LayoutGrid)
            .icon_item(IconName::List)
            .selected(usize::from(!self.grid))
            .on_select(cx.listener(|this, ix: &usize, _, cx| {
                this.grid = *ix == 0;
                cx.notify();
            }));
        let new = div()
            .id("new-project")
            .h(px(32.))
            .px(px(14.))
            .flex()
            .items_center()
            .gap(px(6.))
            .rounded(px(RADIUS_CONTROL))
            .bg(new_fill)
            .hover(move |s| s.bg(new_fill.opacity(0.9)))
            .text_color(white())
            .text_size(px(13.))
            .font_weight(FontWeight::SEMIBOLD)
            .cursor_pointer()
            .child(icon(IconName::Plus, 14., white()))
            .child("New project")
            .on_click(cx.listener(|this, _, window, cx| this.begin_new(window, cx)));
        div()
            .flex()
            .items_end()
            .gap(px(12.))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .child(prism_bar(theme).w(px(44.)).h(px(4.)))
                    .child(
                        div()
                            .text_size(px(24.))
                            .font_weight(FontWeight::BOLD)
                            .child("Projects"),
                    )
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(theme.text_tertiary)
                            .truncate()
                            .child(subtitle),
                    ),
            )
            .child(search)
            .child(layout)
            .child(new)
    }

    fn name_card(&self, theme: &SpectrumTheme) -> Option<impl IntoElement + use<>> {
        let input = self.naming.as_ref()?;
        Some(
            card(theme)
                .p(px(14.))
                .flex()
                .items_center()
                .gap(px(12.))
                .border_color(theme.accent)
                .child(icon(
                    IconName::FolderPlus,
                    18.,
                    theme.area(AreaHue::Projects).text,
                ))
                .child(
                    div()
                        .flex_1()
                        .text_size(px(14.))
                        .child(Input::new(input).appearance(false)),
                )
                .child(
                    div()
                        .text_size(px(12.))
                        .text_color(theme.text_tertiary)
                        .child("Enter makes it from the Simple document template"),
                ),
        )
    }

    fn project_meta(project: &ProjectCard, now: SystemTime) -> String {
        let when = time_ago(&project.updated_at, now);
        match (&project.main_file, when.is_empty()) {
            (Some(main), false) => format!("{main} · {when}"),
            (Some(main), true) => main.clone(),
            (None, _) => when,
        }
    }

    fn project_tile(
        &self,
        ix: usize,
        project: &ProjectCard,
        theme: &SpectrumTheme,
        now: SystemTime,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let area = theme.area(AreaHue::Projects);
        let meta: SharedString = if project.missing {
            "Folder missing".into()
        } else {
            Self::project_meta(project, now).into()
        };
        let meta_colour = if project.missing {
            theme.red
        } else {
            theme.text_tertiary
        };
        let glyph = div()
            .flex_none()
            .size(px(if self.grid { 40. } else { 30. }))
            .rounded(px(if self.grid { RADIUS_CONTROL } else { 8. }))
            .bg(area.soft)
            .flex()
            .items_center()
            .justify_center()
            .child(icon(
                IconName::Folder,
                if self.grid { 20. } else { 16. },
                area.text,
            ));
        let name = div()
            .text_size(px(14.))
            .font_weight(FontWeight::SEMIBOLD)
            .truncate()
            .child(project.name.clone());
        let meta = div()
            .text_size(px(12.))
            .text_color(meta_colour)
            .truncate()
            .child(meta);
        let clicked = project.clone();
        let base = div()
            .id(("project", ix))
            .cursor_pointer()
            .on_click(cx.listener(move |_, _, window, cx| Self::open(&clicked, window, cx)));
        let strong = theme.border_strong;
        if self.grid {
            base.w(px(232.))
                .child(
                    card(theme)
                        .p(px(14.))
                        .flex()
                        .flex_col()
                        .gap(px(12.))
                        .hover(move |s| s.border_color(strong))
                        .child(glyph)
                        .child(div().flex().flex_col().gap(px(2.)).child(name).child(meta)),
                )
                .into_any_element()
        } else {
            let hover = theme.bg_hover;
            base.h(px(48.))
                .px(px(10.))
                .flex()
                .items_center()
                .gap(px(12.))
                .rounded(px(RADIUS_CONTROL))
                .hover(move |s| s.bg(hover))
                .child(glyph)
                .child(div().flex_1().min_w_0().child(name))
                .child(div().w(px(220.)).flex_none().child(meta))
                .into_any_element()
        }
    }

    fn empty_state(theme: &SpectrumTheme, searching: bool) -> impl IntoElement + use<> {
        let (title, line) = if searching {
            (
                "No project has that name",
                "Try fewer letters, or clear the search.",
            )
        } else {
            (
                "No projects yet",
                "New project makes one from the Simple document template.",
            )
        };
        div()
            .flex_1()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(px(8.))
            .child(icon(
                IconName::FolderOpen,
                32.,
                theme.area(AreaHue::Projects).text,
            ))
            .child(
                div()
                    .text_size(px(15.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(title),
            )
            .child(
                div()
                    .text_size(px(13.))
                    .text_color(theme.text_tertiary)
                    .child(line),
            )
    }
}

impl Render for HomeView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<SpectrumTheme>().clone();
        let shown: Vec<ProjectCard> = self.shown(cx).into_iter().cloned().collect();
        let searching = !self.search.read(cx).value().trim().is_empty();
        let now = SystemTime::now();
        let tiles: Vec<AnyElement> = shown
            .iter()
            .enumerate()
            .map(|(ix, p)| self.project_tile(ix, p, &theme, now, cx))
            .collect();
        let content = if !self.loaded {
            div().flex_1().into_any_element()
        } else if tiles.is_empty() {
            Self::empty_state(&theme, searching).into_any_element()
        } else {
            div()
                .id("projects")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .child(
                    div()
                        .flex()
                        .when(self.grid, |d| d.flex_wrap().gap(px(12.)))
                        .when(!self.grid, |d| d.flex_col().gap(px(2.)))
                        .children(tiles),
                )
                .into_any_element()
        };
        let title = TitleBar::new()
            .h(px(TITLE_BAR_HEIGHT))
            .bg(theme.bg_app)
            .border_color(theme.border)
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(12.))
                    .text_color(theme.text_secondary)
                    .child(
                        div()
                            .font_weight(FontWeight::BOLD)
                            .text_color(theme.text)
                            .child(concat!("Spectrum ", env!("CARGO_PKG_VERSION"))),
                    )
                    .child("— Projects"),
            );
        div()
            .id("home")
            .track_focus(&self.focus_handle)
            .key_context("Home")
            .on_action(cx.listener(Self::on_new))
            .on_action(cx.listener(Self::on_open))
            .size_full()
            .flex()
            .flex_col()
            .bg(theme.bg_app)
            .text_color(theme.text)
            .child(title)
            .child(
                div().flex_1().min_h_0().p(px(8.)).child(
                    panel(&theme)
                        .size_full()
                        .flex()
                        .flex_col()
                        .gap(px(20.))
                        .px(px(28.))
                        .pt(px(24.))
                        .pb(px(16.))
                        .child(self.header(&theme, self.projects.len(), cx))
                        // session 10a adds the update notice card here
                        .children(self.name_card(&theme))
                        .child(content),
                ),
            )
    }
}
