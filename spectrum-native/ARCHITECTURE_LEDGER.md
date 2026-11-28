# Architecture ledger

What exists, so no session duplicates it. Update at the end of every session. Keep under 150 lines.

## Crate graph

| Crate | Kind | Depends on |
|-------|------|------------|
| spectrum-core | pure lib | — |
| spectrum-compile, -lsp, -checkers, -ai, -references, -git, -convert | pure lib | core |
| spectrum-theme | GPUI lib | — |
| spectrum-ui | GPUI lib | theme |
| spectrum-editor | GPUI lib | core, theme, ui |
| spectrum-pdf | GPUI lib | core, compile, theme, ui |
| spectrum-diagram | GPUI lib | core, compile, theme, ui, editor, pdf |
| spectrum-app (bin `spectrum`) | GPUI bin | every lib |
| spectrum-win-setup | GPUI bin | theme, ui |
| spectrum-win-sandbox | Win32 bin | — |
| spectrum-xtask | build bin | — |

## Tooling

- `cargo xtask check`: the gate (fmt, clippy `-D warnings`, test).
- `SPECTRUM_SNAPSHOT=1 cargo test -p spectrum-app --test snapshot`: renders views offscreen to
  `target/snapshots/*.png` (Mac only). Add a case there for every new view.

## Public API

### spectrum-theme
- `init(cx)` — call instead of `gpui_kit::init`; sets fonts first (skips a 120 ms font scan).
- `SpectrumTheme::apply(ThemeMode, ColourStyle, cx)` — installs the global and syncs the kit theme.
- `SpectrumTheme` derefs to `Colours` (plan tokens: `bg_canvas`, `bg_app`, `bg_panel`, `bg_subtle`,
  `bg_hover`, `bg_selected`, `bg_code`, `bg_code_border`, `text`, `text_secondary`, `text_tertiary`,
  `border`, `border_strong`, `accent`, `accent_soft`, `red/orange/amber/green/teal/purple/magenta`
  + `_soft`, `eff_off..eff_max`). Methods: `area(AreaHue) -> AreaColour { text, band, soft }`,
  `toolbar(ToolbarSlot) -> (fg, bg)`, `scope_bar_color(level)`, `prism() -> [Hsla; 6]`,
  `syntax_comment()`, `is_dark()`.
- `AreaHue` (12, `ALL`, `colours()`), `ToolbarSlot` (10), `ThemeMode` {Light, Dark, System},
  `ColourStyle` {Spectrum, Simple}, `PRISM`, `SCOPE_BARS`, `RADIUS_PANEL/CARD/CONTROL`, `SIDEBAR_WIDTH`.

### spectrum-app (lib)
- `runtime::init()`, `runtime::spawn_tokio(fut).await -> Result<T, RuntimeError>` — every Tokio
  future from GPUI code goes through this.
- `theme_preview::ThemePreviewView` — Phase 0 window; replaced by the workspace in 1c.

## Globals

- `SpectrumTheme` (spectrum-theme); the kit's `Theme` is driven from it, never edited directly.

## Events and actions

None yet.
