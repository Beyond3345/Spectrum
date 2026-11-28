# Spectrum 3.0.0 icons

`app/` is the app icon; `brands/` (28) and `ui/` (64) are the line icons the blueprint asks for
everywhere: 24×24 viewBox, 1.8 px stroke, `currentColor`, so the theme tints them. Coloured dots are
for user tags and status only. All synced from `OpenPrism/spectrum-v3-icons`.

## App icon

The user's icon set for 3.0.0 (28 Nov 2026; copied from `OpenPrism/spectrum-v3-icons`). These replace
2.8's `src-tauri/icons` for every 3.0.0 use:

| File | Used for |
|------|----------|
| `icon.icns` | macOS app bundle icon (`Spectrum.app/Contents/Resources`, `CFBundleIconFile`) |
| `icon-macos-padded.png` | macOS artwork with the system's padding, for anything drawn at Dock size |
| `icon.ico` | Windows .exe resource icon (`spectrum.exe`, the installer) via `winresource`; file associations |
| `app-icon.png` | In-app brand mark (Home header, About), the Windows installer header |
| `icon.png`, `512x512.png`, `256x256.png`, `128x128@2x.png`, `128x128.png`, `64x64.png`, `32x32.png` | Window icon on Windows, notifications, anything that wants a fixed size |
