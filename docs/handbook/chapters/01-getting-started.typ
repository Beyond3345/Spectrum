#import "../template.typ": *

= Getting started <ch-start>

This chapter covers what is needed before writing the first document in Spectrum. It is divided into seven parts: installing Spectrum, setting it up on the first run, the projects page, starting a project from a template, the Settings window, the appearance of the application and lastly how projects and settings move between computers. Writing, compiling and the editor itself are left to @ch-writing.

== Requirements and installing <sec-start-install>

Spectrum runs on macOS 13.5 or later on Apple silicon, and on Windows 10 or 11 on an x64 PC. Intel Macs stay on version 2.1.0, the last release built for them, and the Liquid Glass app icon needs macOS 26 or later. A LaTeX distribution is optional, since Typst 0.15.1 and the Tectonic 0.17.0 LaTeX engine are built in. MacTeX, MiKTeX or TeX Live can be used in place of Tectonic, and they are needed for a few features that Tectonic's older LaTeX cannot run, such as Jyutping (@sec-writing-jyutping). The other requirements are optional and depend on the features used,

- Markdown needs pandoc, which #menu[Settings][Engines][Markdown] downloads on request (@sec-writing-engines),
- the AI features need an API key from a model provider or an OpenAI-compatible server of your own (@ch-assistant),
- the table to chart tool and DDGS web search need Python 3 with matplotlib and `ddgs` respectively and
- converting a paper from its PDF needs an account with one of the PDF parsers that @ch-assistant lists.

=== macOS

The macOS installer and its SHA-256 checksums are on the latest GitHub release of Spectrum.

#howto[install Spectrum on macOS][
+ Open `Spectrum_<version>_aarch64.dmg`
+ Drag Spectrum into the Applications folder
+ Open Spectrum from the Applications folder
]

Since Spectrum is signed ad hoc rather than with an Apple Developer ID, macOS blocks it on the first launch when the disk image was downloaded from the internet. To allow it, open System Settings, go to Privacy & Security and select Open Anyway. Alternatively, run the following command once,

```bash
xattr -dr com.apple.quarantine /Applications/Spectrum.app
```

=== Windows

On Windows, run `Spectrum_<version>_x64-setup.exe`. It installs Spectrum for the current user without administrator rights, adds it to the Start menu and installs Microsoft Edge WebView2 when the PC does not have it yet. Since the installer is not signed, Windows SmartScreen may warn about it on the first run. To continue, select More info and then Run anyway.

The Windows version is a preview, and it differs from the macOS version as follows,

- the window has the standard Windows title bar, and Liquid Glass is not available,
- the icons are Microsoft's Fluent UI System Icons, since Apple's SF Symbols may only be used on Apple platforms,
- the shortcuts use #key("Ctrl") for #key("⌘"), #key("Alt") for #key("⌥") and #key("Shift") for #key("⇧"), so Compile is #key("Ctrl", "Enter"). Fold and unfold are #key("Ctrl", "Shift", "[") and #key("Ctrl", "Shift", "]"), find next and previous are #key("F3") and #key("Shift", "F3"), and redo is #key("Ctrl", "Y"),
- Show in Finder is Show in File Explorer, and projects are moved to the Recycle Bin,
- local agents get no Spectrum tools yet (@ch-assistant),
- MiKTeX installs a missing package without asking, since its question would appear in a hidden window and
- settings are kept in `%APPDATA%\com.beyond3345.spectrum`, and new projects are placed in `Documents\Spectrum`.

== Setting up <sec-start-setup>

Spectrum opens on the projects page, with nothing in it the first time. There is no setup assistant: the application works straight away with the built-in engines, and the rest is set in the Settings window (@sec-start-settings). A short pass through Settings before the first project is still worthwhile.

#howto[set up Spectrum before the first project][
+ Open Settings with #key("⌘", ",")
+ Choose a provider under #ui[Models] and paste its API key, if the AI features will be used
+ Choose the theme under #ui[Appearance] and the default compiler under #ui[Engines]
+ Check the #ui[System] section to confirm which TeX tools Spectrum can find
+ Set up the local agents you use, such as OpenCode or Codex, under #ui[Agents]
]

Choosing a provider fills in its endpoint, its recommended models and the recommended reasoning effort, which @ch-assistant describes. The System section lists each program Spectrum looks for, such as `pdflatex`, `xelatex`, `biber` and `texcount`, with a tick and the path where it was found, together with the app's data folder and the default folder for new projects (@fig-start-system). #ui[Check again] looks again after a TeX installation has been added, and #ui[Licences] lists the software, fonts and word lists Spectrum includes.

#shot("figures/01-getting-started/settings-system.png", [The System section of Settings. Each TeX tool Spectrum found has a tick and its path, and the folders below show where the app keeps its data and where new projects go.], width: 72%) <fig-start-system>

== The projects page <sec-start-projects>

The projects page is the first thing Spectrum shows. It lists every project regardless of where its folder is stored on the computer. A project is an ordinary folder, chosen when the project is created, so it can be backed up, synced or put under Git in the same way as any other folder. By default new projects are placed in `~/Documents/Spectrum`.

The sidebar on the left holds the views of the page, which are,

- #ui[Home], the folders of your own making as large tiles, followed by the projects that are in no folder (@fig-start-home),
- #ui[All projects], every project at once, with its path, its tags and when it was last changed (@fig-start-all), with the folders listed beneath it,
- #ui[GitHub], the repositories of yours that hold Spectrum projects (@ch-references),
- #ui[Archived], the projects that have been archived and
- #ui[Tags], one row for each tag, which lists the projects that carry it.

#shot("figures/01-getting-started/home.png", [Home with two folders, each with its own colour and symbol, and three projects that are in no folder. Each project shows the first page of its last compiled PDF.]) <fig-start-home>

The header holds a search field, #ui[Sort] (by name, date changed or date created), the list and icon views with a slider for the size of the icons, #ui[Import] and #ui[New]. The search looks through the projects of every folder, and each result says which folder it is in. #menu[Settings][Projects] chooses whether Spectrum opens on Home or on All projects.

#shot("figures/01-getting-started/all-projects.png", [All projects as a list. Each row shows the project's folder on disk, its tags and when it was last changed, and the #dots button at the end of the row opens its menu.]) <fig-start-all>

=== Opening a project

A click on a project opens it in the editor. On Home a single click opens it, while in All projects a double click or #key("Enter") does. On Home, #key("⌘") or #key("⇧") with a click selects several projects and folders, and the arrow keys, #key("Space") and #key("⌘", "A") do the same from the keyboard, so a selection can be dragged into a folder together.

Double-clicking a `.tex`, `.ltx` or `.bib` file in Finder or File Explorer also opens it in Spectrum, in the project it belongs to. A file from a folder Spectrum has not seen yet opens together with the folder holding its document, which becomes a project, so a chapter in `chapters/` brings the whole thesis with it. On macOS Spectrum makes itself the default app for these files the first time it opens, and the button under Opening files in #menu[Settings][Projects] does it again if another app has taken them since. On Windows the installer offers Spectrum for these files, and Windows asks which app to use. PDFs stay with the PDF viewer either way.

=== Creating a project

#ui[New] in the header has three choices: #ui[Blank project…], #ui[From template…] and #ui[Folder…] (@fig-start-new). Inside a folder on Home they read #ui[Blank project here…] and so on, and the new project or folder goes into the folder that is showing.

#shots(("figures/01-getting-started/new-menu.png", "figures/01-getting-started/new-project.png"), [The New menu, left, and the New project window, right. Write in chooses LaTeX, Typst or Markdown, and Template lists the templates for that language.], columns: (1fr, 2.1fr)) <fig-start-new>

The New project window asks for the following,

- #ui[Name], which also names the project's folder,
- #ui[Write in], which is LaTeX, Typst or Markdown,
- #ui[Template], which is Blank or one of the templates for that language, with #ui[Browse…] to choose from the gallery (@sec-start-templates). A blank project starts with a `main.tex`, `main.typ` or `main.md` that compiles, so there is always something to build and
- #ui[Location], the folder in which the project's own folder is made, which is the default folder for new projects unless #ui[Change…] chooses another.

#ui[Create] makes the project and opens it in the editor.

=== Importing

#ui[Import] brings in work that already exists (@fig-start-import). It has three choices,

- #ui[Upload a .zip…] makes a project from a `.zip` file, such as an Overleaf export,
- #ui[From arXiv…] asks for an arXiv ID and makes a project from the paper's source and
- #ui[Open existing folder…] opens a folder that already holds LaTeX, Typst or Markdown files as a project, in place, without copying it. The folder stays where it is, and Spectrum works on it there.

The file list of every project follows changes made outside Spectrum, so a file added, removed or renamed in Finder or by another editor shows up straight away. If a project's folder is moved in Finder, the project is marked as missing, and #ui[Locate…] in its menu points it at the new location.

#shots(("figures/01-getting-started/import-menu.png", "figures/01-getting-started/project-menu.png"), [The Import menu, left, and a project's menu, right, which opens from its #dots button or with a right-click.], columns: (1.3fr, 1fr)) <fig-start-import>

=== A project's menu

Each project has a menu, opened with a right-click on it or with its #dots button. The menu holds the following,

- #ui[Open], #ui[Rename…] and #ui[Duplicate], which copies the whole folder into a new project,
- #ui[Tags…], which adds and removes the project's tags. A tag's colour is chosen with a right-click on the tag in the sidebar, which can also rename it,
- #ui[Move to folder…], which files the project in one of your folders on Home,
- #ui[Change template…], which moves the paper into another template (@ch-assistant), and #ui[Save as template…] (@sec-start-templates),
- #ui[Convert to Typst project…] for a LaTeX project, or #ui[Convert to LaTeX project…] for a Typst one, which makes a new project in the other language (@sec-writing-convert),
- #ui[Show in Finder] and #ui[Sync with GitHub] (@ch-references),
- #ui[Archive], which moves the project to the Archived view without deleting anything, and #ui[Unarchive], which brings it back,
- #ui[Remove from list], which takes the project off the page and leaves its folder on disk as it is and
- #ui[Move to Bin…], which asks first and then moves the project's folder to the Bin, from where it can still be put back in Finder.

=== Folders on Home

Folders arrange the projects page. They hold projects and other folders, and they only exist in Spectrum: a project stays where it is on disk whichever folder it is filed in. A folder is made with #menu[New][Folder…], or with #ui[New folder…] in another folder's menu, and a project goes into a folder when it is dragged there or with #ui[Move to folder…].

A folder's menu has #ui[Open], #ui[New folder…], #ui[Rename…], #ui[Customise Folder…], #ui[Move to folder…], a colour and #ui[Delete…]. Deleting a folder moves what was in it up a level, so no project is ever deleted with it. #ui[Customise Folder…] gives a folder a colour and a symbol or emoji, which it shows on Home and in the sidebar (@fig-start-customise). The folders and their arrangement follow you to your other computers with your settings (@sec-start-sync).

#shots(("figures/01-getting-started/folder-menu.png", "figures/01-getting-started/customise-Honours.png"), [A folder's menu, left, and Customise Folder, right, where a folder takes one of seven colours and a symbol or an emoji.], columns: (1fr, 1.5fr)) <fig-start-customise>

=== Going back from the editor

The project's name at the top of the editor's sidebar is the project switcher (@fig-start-switcher). Its list shows the folders and projects at the same level, so another project is two clicks away, and below them it has the following,

- #ui[Back to] the folder the project is in, which opens Home at that folder. It only appears for a project that has been filed in a folder,
- #ui[All projects] and #ui[Home], which open those views,
- #ui[Save as template…] and #ui[Show in Finder] and
- the conversions that suit the main file: #ui[Convert to Typst project…], #ui[Convert to LaTeX project…], or #ui[Export to Word] and #ui[Convert to LaTeX project…] for a Markdown document (@sec-writing-convert).

#menu[Settings][Projects][Project switcher opens at] chooses whether the list starts at Home or at the folder the project is in.

#shot("figures/01-getting-started/project-switcher.png", [The project switcher in the editor. For a project filed in Semester 2 it offers Back to Semester 2, which opens Home at that folder.], width: 50%) <fig-start-switcher>

== Templates <sec-start-templates>

A template is a starting project: a main file, a bibliography and any files it needs, written in Spectrum's house style. #menu[New][From template…] opens the template gallery (@fig-start-gallery), which has a tab for each language, a row of categories (Notes, Reports, Letters, Slides, CV and Academic, with Featured for the starred templates) and a search. Choosing a template opens the New project window with it filled in.

#shot("figures/01-getting-started/template-gallery.png", [The template gallery on its LaTeX tab. The starred templates are the featured ones, and the conference templates follow under Academic.], width: 85%) <fig-start-gallery>

The built-in templates are listed in @tab-start-templates. Every LaTeX template uses APA 7 citations through `biblatex-apa` and Biber, compiles with Auto, pdfLaTeX, XeLaTeX or LuaLaTeX and uses A4 paper (apart from the slides), Australian English and no shell escape. The conference templates keep their venues' page layouts but use an APA 7 bibliography, so a real submission should go back to the venue's own reference style. The Typst templates follow Spectrum's house style for Typst, compile offline with no packages and use Typst's own APA style, while the Markdown article uses pandoc's citeproc with the `.bib` file its front matter names.

#figure(
  table(
    columns: (2fr, 3fr),
    align: left,
    table.header([Template], [For]),
    [Simple document], [a short A4 article with a title, paragraphs and 25 mm margins],
    [Maths notes], [lecture notes or assignments with theorems, worked examples, matrices and plots],
    [Electronics notes], [notes or lab reports with circuits, quantities with units and Bode plots],
    [Coding report], [programming assignments with highlighted code and pseudocode],
    [Report or thesis], [a long document with a title page, abstract, contents, chapters and a bibliography],
    [Formal letter], [a letter in Australian block layout],
    [Slides (Beamer)], [a 16:9 Beamer talk with maths, a chart and code],
    [Academic CV], [a one-page CV with links for email, ORCID and a website],
    [ACL, CVPR, NeurIPS, ICML, arXiv preprint], [conference papers and preprints, under Academic],
    [Typst document, report, maths notes, electronics notes, coding report, letter and CV], [the same documents written in Typst],
    [Markdown article], [a Markdown article for pandoc with a YAML title, a figure, a table and citations],
  ),
  caption: [The built-in templates.],
) <tab-start-templates>

=== Typst Universe

The Typst tab of the gallery also has #ui[Typst Universe…], which lists the templates published on Typst Universe, the Typst package registry, with their licences. Choosing one fills in the New project window, which says that creating the project downloads the template. A template whose licence is not compatible with MIT is marked, so that its terms can be checked before the project is shared.

=== Your own templates

Any project can become a template with #ui[Save as template…] in its menu, on the projects page or in the editor. It asks for a name, a section of the gallery and a one-line description, and the template gets a copy of the project's files without its compiled PDFs. #ui[Upload template…] in the gallery adds a template from a `.zip` file instead. Templates of your own are marked Yours in the gallery and can be deleted.

Each template's #dots menu has #ui[Edit template], which opens a working copy of it in the editor. The copy compiles like any project, and a bar above the editor holds three buttons,

- #ui[Save template] replaces the template's files with the copy's, leaving out compiled PDFs and the app's own files,
- #ui[Save as new template…] asks for a name, a section and a description, and keeps the original as it was and
- #ui[Done] closes the copy, and asks first if it has changes that were not saved to the template.

The copy is kept until #ui[Done], so #ui[Continue editing] in the menu picks up where it was left. An edited built-in template is marked Edited and keeps your version when Spectrum is updated, and #ui[Restore original…] puts back the one that came with Spectrum. Projects already made from a template do not change when the template does.

== The Settings window <sec-start-settings>

The Settings window holds every preference of the application. It opens with #key("⌘", ","), with #ui[Settings] at the foot of the sidebar on the projects page or in the editor, and in places from the feature it concerns, such as the gear button in the diagram composer. Its sections are grouped under four headings, and each is described in the chapter given in @tab-start-settings.

#figure(
  table(
    columns: (1.1fr, 2.4fr, auto),
    align: left,
    table.header([Section], [What it holds], [Where]),
    [Appearance], [the theme, colour style, accent colour, window and PDF page colours], [@sec-start-appearance],
    [Editor], [jumps between the source and the PDF, the editor's font and colour themes], [@sec-start-appearance],
    [Shortcuts], [every keyboard shortcut, each of which can be changed], [@sec-writing-shortcuts],
    [System], [the TeX tools Spectrum found, its folders and the licences], [@sec-start-setup],
    [Engines], [the default compile settings and the LaTeX, Typst and Markdown engines], [@sec-writing-engines],
    [Spelling & grammar], [the languages, dictionaries and grammar checkers], [@sec-writing-checks],
    [Diagram composer], [canvas backgrounds, tool keys and university styles], [@ch-composer],
    [Checkpoints], [automatic checkpoints and clearing out old ones], [@ch-references],
    [Projects], [where Spectrum opens, the default folder for new projects and opening files], [@sec-start-projects],
    [GitHub], [signing in and the settings repository], [@ch-references],
    [Zotero], [the connection to Zotero], [@ch-references],
    [Template transfer], [the PDF parsers for Change template], [@ch-assistant],
    [Models, Personas, Skills, Agents, Search], [the AI features and web search], [@ch-assistant],
  ),
  caption: [The sections of the Settings window.],
) <tab-start-settings>

Settings are saved as they are changed, so there is no Save button. A few sections that hold longer text, such as Personas and Skills, ask before closing with changes that have not been saved.

=== Projects settings

#menu[Settings][Projects] holds the settings of the projects page (@fig-start-projects-settings),

- #ui[Open Spectrum on], which is Home or All projects,
- #ui[Project switcher opens at], which is Home or the folder the project is in,
- #ui[Default folder for new projects], where new, imported and arXiv projects are created unless another location is chosen. A folder inside a sync app's folder, such as OneDrive or iCloud Drive, is refused, as sync apps damage a project's GitHub history,
- #ui[Opening files], on macOS, which makes Spectrum the default app for `.tex`, `.ltx` and `.bib` files again and
- #ui[Use the same settings on each computer] and #ui[This computer's name], which @sec-start-sync covers.

#shot("figures/01-getting-started/settings-projects.png", [The Projects section of Settings.], width: 72%) <fig-start-projects-settings>

== Appearance <sec-start-appearance>

#menu[Settings][Appearance] sets how the application looks (@fig-start-appearance). It has the following options,

- the theme, which is System, Light or Dark. System follows the macOS appearance and switches with it,
- the colour style, which is Spectrum or Simple and is described below,
- the accent colour, which can follow macOS or be Spectrum, Blue, Purple, Pink, Red, Orange, Yellow, Green, Graphite or any other colour chosen with the colour well at the end of the row. Spectrum, drawn as a wheel of the colours below, runs the #ui[Compile] button and progress bars through every colour and is blue everywhere else, since an orange accent would read as a warning,
- on macOS, a see-through window, which uses Liquid Glass on macOS 26 and later and a frosted blur on earlier versions, with a Clarity slider from Frosted to Clear that sets how much of the desktop shows through while the editor and the PDF stay readable and
- the colour of the PDF's pages, one for light mode (White, Cream, Sepia or Grey) and one for dark mode (Dark, Black, Dimmed or White). Dark and Black turn the ink light, while Dimmed keeps the page's own colours a little darker. The PDF's #dots menu changes the colour for the mode that is showing.

#shot("figures/01-getting-started/settings-appearance.png", [The Appearance section of Settings, with the theme, the colour style, the accent colour and the colour of the PDF's pages. The see-through window appears here on macOS.], width: 72%) <fig-start-appearance>

=== Colour style

The colour style decides how much colour the application itself uses. Spectrum, the default, gives each symbol its own colour from Apple's system colours, so every icon in a list stands out from its neighbours (@fig-start-colour-style). Specifically, the icons of the editor's toolbar, the sidebars, the projects page and the sections of Settings are each a different colour, and the tab and the view that are chosen take their icon's colour. GitHub and Zotero keep their own colours, black and red. The diagram chooser's categories and cards, each composer's chip and the headings of its tools take the colour of that composer's chapter in this handbook.

Simple keeps to grey and the accent colour, as Spectrum looked before version 2.5. Either way the labels, icons and selection marks stay the same, so nothing is shown by colour alone, and errors, warnings and success keep their red, orange and green. The colour style goes to your other computers with the rest of the appearance.

#shots(("figures/01-getting-started/colour-style-simple.png", "figures/01-getting-started/colour-style-spectrum.png"), [The editor in the Simple colour style, above, and in Spectrum, below. In Spectrum each tool's icon has a colour of its own, and the chosen tab is underlined in its colour.], columns: 1) <fig-start-colour-style>

=== The editor's look

#menu[Settings][Editor] sets the source editor's font and colours. The font can be one of the Mac's own monospaced fonts (SF Mono, Menlo, Monaco and others), one of four bundled open-source fonts (JetBrains Mono, Fira Code, IBM Plex Mono and Source Code Pro) or any installed font by its family name, and its size is set beside it. The theme is chosen separately for light mode and for dark mode, so any light theme can go with any dark one. The themes are Spectrum, GitHub, One, Solarized, Xcode, Tokyo Night, Catppuccin, Gruvbox, Nord, Dracula, Monokai, Rosé Pine, Ayu and Texifier-like and Overleaf-like themes, each with a preview of a few lines of LaTeX (@fig-start-themes).

Under #ui[Colours], each colour of a theme can be changed for its mode: the background, text, line numbers, current line, selection, cursor, commands, comments, brackets, maths, arguments and environments. The changes go on top of the chosen theme and stay when another theme is chosen, and #ui[Reset to theme] takes them away.

#shot("figures/01-getting-started/settings-editor-theme.png", [The editor's light and dark themes with their previews, and below them the colours that can be changed for each mode.], width: 72%) <fig-start-themes>

The same section also holds the settings for jumping between the source and the PDF and for the PDF following the open file, which @sec-writing-preview describes.

== Syncing between computers <sec-start-sync>

Projects and settings go between your computers through GitHub. Spectrum keeps each project in a private repository of yours and your settings in another, so the same work and the same Spectrum are on each computer. Without a GitHub account, projects and settings simply stay on each computer. Signing in, backing up, pulling and the GitHub view of the projects page are described in @ch-references. This section covers what the rest of the application does about it.

=== Settings on each computer

With #ui[Use the same settings on each computer] on, in #menu[Settings][Projects], and the settings repository turned on in #menu[Settings][GitHub], the appearance, editor, spelling, shortcuts, personas, your own skills and templates, the folders on Home and the tag colours go between your computers. Each computer writes its own settings file, so the newer value of each setting wins. API keys, tokens, models, folders on disk and the window's look stay on each computer. #ui[This computer's name] is how your other computers refer to this one, for example for a backup made on it.

=== Changes from the other computer

A file changed on disk by a pull from GitHub, or by another app, is reloaded in the editor when it has no unsaved edits. If it does, a bar above the editor says that the file was changed on another computer, with #ui[Compare], #ui[Use theirs] and #ui[Keep mine]. The text that is not used is kept in a checkpoint, so nothing is lost. A file deleted on disk is marked in its tab, with #ui[Close] and #ui[Restore], rather than being brought back by the next save.

When a file changed on both computers cannot be merged, the other computer's version is kept beside it as a conflicted copy, for example `main (GitHub’s conflicted copy 2026-10-18 104233).tex`, as sync apps also make. The file list marks these copies and offers #ui[Compare], #ui[Use this copy] and #ui[Delete copy].

=== Projects in a sync app's folder

A project kept in a folder that Synology Drive, OneDrive, Dropbox, Google Drive or iCloud Drive syncs keeps working where it is. However, sync apps can damage a project's GitHub history, so Spectrum warns about it and offers #ui[Move to this computer…], which copies the project into the default folder for new projects, checks every file and works on that copy from then on. The folder in the sync app stays as it is.

=== Compiling on each computer

A compile writes only the PDF into the project. The SyncTeX data, the kept `.aux` files and the thumbnail are kept on each computer, in the app's data folder, so the other computer needs one compile of its own before double-click jumping works there.

=== Coming from version 1.10

Before version 2.0, Spectrum mirrored projects into cloud locations. Version 2.0 and later stop mirroring on their first start. A project that 1.10 mirrored is then an ordinary project on that computer, and its copy in the cloud location is left as it is and no longer updated. A notice on the projects page names these projects and lists any files that the copy in the cloud location has and this computer never received, with #ui[Show in Finder], so that they can be copied over by hand. Before updating, open 1.10.4 on each computer and wait until it shows Synced, so both copies are level. Then use #ui[Sync with GitHub] on one computer and #ui[Link] or #ui[Get from GitHub] on the other (@ch-references).

Version 1.10.4 still opens every project that a later version has used. The newer data, such as the GitHub link, the compiler, to-dos, PDF notes and research sessions, is kept in `.spectrum/settings.json` and in folders that 1.10.4 does not read, and nothing is added to `project.json`.
