#import "../template.typ": *

= References, history and sharing <ch-references>

This chapter covers what happens to a project around the writing itself. It is for anyone who cites papers, brings work in from elsewhere, wants to go back to an earlier draft or works on more than one computer.

The chapter is divided into five parts. First, @sec-references-bib describes how Spectrum adds references to a `.bib` file and cites them, and @sec-references-zotero how it works with a Zotero library. Then @sec-references-import covers bringing existing work in as a project. Lastly, @sec-references-checkpoints describes checkpoints, the saved states of a project that can be compared and restored, and @sec-references-github how a project goes between computers through GitHub. Finding papers on a question is described with Research in @ch-assistant.

== References <sec-references-bib>

Spectrum keeps references in an ordinary `.bib` file in the project, `references.bib` in the LaTeX templates and `refs.bib` in the Typst ones, and never in a database of its own. A `.bib` file opens in the editor like any other file, so an entry can always be typed or pasted in by hand. On top of this, Spectrum adds three ways to fill it, the References chat, Research (@ch-assistant) and Zotero (@sec-references-zotero), and two ways to cite from it.

=== Adding references with the References chat

The References chat is the assistant panel (#key("⌘", "L")) in its #ui[References] mode (@fig-references-chat). What is pasted into it is looked up online and comes back as an entry to check, and nothing is written to the project's `.bib` until you add it. The chat takes,

- a DOI, an arXiv ID or a link,
- an ISBN, ISBN-10 or ISBN-13 with or without its hyphens, whose check digit must be right,
- the title of a book or a paper,
- a reference formatted in APA, IEEE, Chicago or MLA style and
- BibTeX entries or RIS records, pasted whole.

DOIs, ISBNs, titles and formatted references go one per line for several, while BibTeX and RIS are read entry by entry and never line by line. While the chat is empty, #ui[Try input] offers an example of each kind, and #ui[New entry] in the header starts a blank entry to fill in by hand. #ui[Resolve], or #key("Enter"), looks up what is in the box in the following order,

+ a DOI is resolved through doi.org, which covers Crossref and DataCite DOIs, with the Crossref API as a fallback,
+ an arXiv ID uses the arXiv API, and the published DOI is used instead when the paper has one,
+ any other link is read for the publisher's metadata, with the search connections tried when a page is blocked or has no authors or date,
+ an ISBN is looked up in Open Library, with Google Books and then Crossref filling in what the first one found lacks,
+ a title is searched on Crossref, and also on Open Library and Google Books when Crossref has no work of that title. When no single result clearly matches, the closest candidates are shown with #ui[Choose],
+ a formatted reference is read into its fields and then checked on Crossref and, for a book, in the book search. When no source has it, the entry is kept as it was read and its badge says #ui[Not found online · kept as pasted] and
+ pasted BibTeX and RIS are taken as they are, without a look-up.

Every look-up goes through Spectrum's own connection, so it uses the proxy in #menu[Settings][System] when one is set.

#shot("figures/04-references/references-chat.png", [The assistant panel in #ui[References] mode with an empty chat. #ui[Zotero] in its header is described in @sec-references-zotero.], width: 85%) <fig-references-chat>

The citation key is the first author's surname followed by the year, such as `Vaswani2017`, or the organisation's name for a manual with no author. Accents are removed and name particles are joined, so "van der Waals" becomes `VanderWaals`, and a key already used for another work gets a letter (`Smith2020a`). A pasted BibTeX entry keeps its own key. A paper whose DOI or arXiv ID is already in a `.bib` of the project, or a book whose ISBN is, is reported as #ui[Already there] with its existing key and is not offered again. Unknown dates and authors are left empty rather than guessed.

Each entry comes back as a card to check before it is added (@fig-references-card). The badge in the panel's header says where it was found. The row of entry types at the top of the card, `@article`, `@inproceedings`, `@book`, `@inbook`, `@incollection`, `@manual`, `@software`, `@online`, `@report`, `@thesis` and `@misc`, decides which fields the card shows. For example, a book shows its edition, publisher, place and ISBN, a part of a book its chapter and pages, a manual its organisation and version and a web page its date and the date it was accessed. The key, the authors, separated by "and", and every other field can be changed in place, and a field the type does not list stays shown while it holds something. The fields hold TeX as a `.bib` file does, and a bare `&`, `%`, `#` or `_` is escaped when the entry is written. #ui[Cite locator] under the fields adds a page, pages, a chapter or a section to the citation and shows the citation as it will be inserted. Below it is the entry exactly as it will be written, with the `.bib` it goes to.

#shot("figures/04-references/references-card.png", [The card for an ISBN found on Open Library, as `@book` in a project that uses biblatex, with pages 42 to 45 as its locator.], width: 85%) <fig-references-card>

How an entry is written depends on the project. A LaTeX project that loads biblatex, and a Typst or Markdown project, get Biber's entry types and field names, such as `@online`, `@software`, `@thesis` with its `type`, `journaltitle`, `location` and `date`. A LaTeX project that uses classic BibTeX gets `@misc` for a web page or software, `@techreport` for a report, `@phdthesis` or `@mastersthesis` for a thesis, and the version and the access date in `note`, since BibTeX has no field for them. The card says which of the two it writes, #ui[Biber mode] or #ui[BibTeX mode].

#ui[Add to .bib only] writes the entry, and #ui[Add & insert citation] also cites it at the cursor with its locator. The entry is checked once more as it is written, so a work that is already in a `.bib` of the project is reported as #ui[Already there], and a key that another entry has taken in the meantime is given a letter. An added reference then shows as a card with its status, key, title, authors and year, the BibTeX that was written, folded under #ui[BibTeX], and #ui[Insert citation]. When the `.bib` is not yet loaded by the main file, the card says so and gives the line to add, which is `#bibliography("refs.bib")` in Typst and `\bibliography{references}` in LaTeX. A Markdown document whose front matter names no `bibliography` is given every `.bib` in the project, so it needs no line, while one that names a list is asked to add the file to that list, since a second `bibliography:` line is an error.

With #ui[Insert `\cite` at the cursor after adding a reference] on, in #menu[Settings][Editor], a single reference that #ui[Add to .bib only] adds, or that the chat finds already there, is cited at the cursor straight away. This only happens where you had placed the cursor in a document, and otherwise the chat says where to click.

=== Citing

A citation is written in the form the document needs. In a LaTeX document Spectrum reads the main file and uses `\parencite` when it loads biblatex, `\citep` when it loads natbib and `\cite` otherwise. A Typst document gets `@key`, and a Markdown document `[@key]`. A citation inserted with a locator from the References card carries it in the form of the document's language: a postnote in LaTeX, such as `\parencite[pp.~42--45]{Cormen2022}` or `\cite[\S~3.2]{Knuth1997}`, a supplement in Typst, such as `#cite(<Cormen2022>, supplement: [pp. 42–45])`, and pandoc's locator in Markdown, such as `[@Cormen2022, pp. 42-45]`, which the citation style then words.

The LaTeX and Typst templates cite in APA 7th edition, and so does a Markdown document. Since pandoc formats a Markdown document's citations itself, Spectrum gives it the APA 7 style of the Citation Style Language project, a separate file under the Creative Commons Attribution-ShareAlike 3.0 licence, which #menu[Settings][System & Network][Licences] shows. A document that needs another style names its own style file in the front matter, such as `csl: ieee.csl`, and that file is used instead.

#menu[Insert][Citation], under #ui[+] in the editor's toolbar, puts `\cite{key}` at the cursor with `key` selected. Typing over it, or anywhere inside a citation command, lists the matching keys of the project's `.bib` files with their author and year (@fig-references-completion). #key("Enter") or #key("Tab") picks one. With Zotero open, items of your library also appear below the project's keys after three letters (@sec-references-zotero).

#shot("figures/04-references/cite-completion.png", [Citation completion after typing `Wh` inside `\cite{}`. The key is shown with its author and year.], width: 60%) <fig-references-completion>

=== Checking citations

Spectrum checks citations in three places. While editing a LaTeX document, TexLab underlines a citation with no entry and an entry defined twice, as @ch-writing describes. #menu[Tools][Review] lists citations with no entry, entries never cited, keys or works in the bibliography twice, entries missing a field their type needs and DOIs that do not look like one, each with its line, and with #ui[Verify citations], the entries that were retracted, that no source knows or whose title, first author or year differs from their record (@ch-assistant). Lastly, #ui[Citation audit] and #ui[Verify claims] in the agent workspace ask a model to check the citations and the claims they support.

== Zotero <sec-references-zotero>

Spectrum reads your Zotero library through Zotero's local API on the same computer, and with Zotero 10 it also keeps a collection for each project. Zotero must be open, with "Allow other applications on this computer to communicate with Zotero" ticked in Zotero's #menu[Settings][Advanced]. Without Zotero, Spectrum works as before.

#menu[Settings][Zotero] shows whether Zotero is open, its version, whether the local API is on and whether the Better BibTeX plug-in is installed, with #ui[Check again] (@fig-references-settings-zotero). With Zotero 10 open, it also has #ui[Allow Spectrum in Zotero…], which asks Zotero for permission to write. The pane's last switch, #ui[Suggest items from your Zotero library in `\cite` completion], is on by default.

#shot("figures/04-references/settings-zotero.png", [#menu[Settings][Zotero] with Zotero closed. Citing and completion wait until Zotero is open.], width: 65%) <fig-references-settings-zotero>

=== Citing from Zotero

#ui[Cite from Zotero…] is in the editor's right-click menu for `.tex` files (@fig-references-editor-menu) and in the bar of the References chat. With Better BibTeX installed, it opens Zotero's own citation picker, brings Zotero to the front and shows #ui[Answer in Zotero] with #ui[Cancel] until you have picked. Without Better BibTeX, it opens a search of your library in Spectrum instead. With Zotero closed, it says "Zotero isn't open. Start Zotero, then try again."

#shot("figures/04-references/editor-menu-zotero.png", [The editor's right-click menu, with #ui[Cite from Zotero…] and #ui[Add to-do here].], width: 45%) <fig-references-editor-menu>

The chosen entries go into the `.bib` under their Zotero citation key, which is Zotero's own field, then Better BibTeX's key, then an author and year key as in @sec-references-bib. They pass through the same duplicate check as the References chat, and the citation is put at the cursor. A key the `.bib` already uses for another work gets the next free letter, and the `file` field, which holds paths to PDFs on your computer, is left out.

=== Completion and Research

Three letters into a citation key, completion also lists the matching items of your Zotero library in a Zotero section below the project's own keys, leaving out the ones the project already has. Picking one adds its entry to the `.bib`. Research also has a Zotero source, and #ui[Add kept papers to .bib] takes a paper found there from Zotero under its own key.

=== Project collections

With Zotero 10, #ui[Allow Spectrum in Zotero…] asks Zotero for permission once, and #ui[Always Allow] should be chosen there. Zotero's answer is kept in `zotero.json` in Spectrum's data folder, readable by your account only. From then on each project has a collection, #menu[Spectrum][its name], kept in step with its `.bib`,

- after each reference is added, a few seconds after a `.bib` is saved, when the project is opened and when you come back to the window,
- items your library already has are found by citation key, DOI, arXiv ID or title and year and added to the collection, while the other entries become new items in it and
- an entry taken out of the `.bib` leaves the collection, but its item stays in your library.

Spectrum never deletes a Zotero item and never changes the `.bib` from Zotero's side. The collection is recorded in the project's `.spectrum/settings.json` with the project's id, so it goes with the project to your other computer through GitHub. When the other computer's Zotero has not received the collection yet, Spectrum says "Waiting for Zotero to sync this project's collection" and makes no second one. Zotero 7 to 9 can be read but not written, so they cite and complete without collections.

== Importing projects <sec-references-import>

Existing work comes into Spectrum as a project through #ui[Import] on the projects page (@fig-references-import-menu). The menu has three ways in,

- #ui[Upload a .zip…], which unpacks an archive into a new project named after the file,
- #ui[From arXiv…], which downloads a paper's LaTeX source into a new project and
- #ui[Open existing folder…], which opens a folder already on your computer as a project, where it is.

#shot("figures/04-references/import-menu.png", [The #ui[Import] menu on the projects page.], width: 35%) <fig-references-import-menu>

=== From a .zip file

#ui[Upload a .zip…] asks for a `.zip` file and makes a new project in the folder for new projects, named after the file. When everything in the archive sits in one top folder, as an export from another editor usually does, that folder's contents become the project. Spectrum then picks the main file, a `main.tex`, `main.typ` or `main.md` first, and opens the project. For example, `concrete-notes.zip`, holding `concrete/main.md` and `concrete/refs.bib`, becomes the project `concrete-notes` with `main.md` as its main file. A file that is not a valid archive is refused with "That file isn't a valid .zip archive."

=== From arXiv

#ui[From arXiv…] takes an arXiv ID, such as `1706.03762`, or a link to the paper's page (@fig-references-arxiv). #ui[Import] downloads the paper's LaTeX source from arXiv into a new project, showing #ui[Downloading…] with its progress and then #ui[Extracting…], and opens the project when it is done. Closing the sheet or pressing #ui[Cancel import] stops the download.

#shot("figures/04-references/import-arxiv.png", [#ui[Import from arXiv]. The note under the field says where the new project is made.], width: 60%) <fig-references-arxiv>

=== From a folder or a single file

#ui[Open existing folder…] adds a folder on your computer to the list as a project and opens it. The files stay where they are, so Spectrum works on them in place, and opening the same folder again opens the same project. #ui[Remove from list] in the project's menu takes it off the list without touching the folder.

A LaTeX, Typst or Markdown file can also be opened from Finder or File Explorer with Spectrum, as @ch-start describes. A `.typ` or `.md` file opens with the folder that holds its `main.typ` or `main.md`, and a file on its own, such as `visit.md`, makes its folder a project with that file as the document.

=== Word and PDF files

Spectrum has no importer for Word documents. A PDF can be rebuilt as a LaTeX project in another template with #ui[From the PDF] in #ui[Change template…], which needs a model and a PDF parser (@ch-assistant). Going the other way, a Markdown document can be exported to Word through pandoc, as @ch-writing describes.

== Checkpoints <sec-references-checkpoints>

A checkpoint is a saved state of every file in a project, which can later be compared with the current files and restored, as a whole or one file at a time. Checkpoints are kept inside the project, in its hidden `.spectrum/history` folder, so they travel with the project when it is copied, but they are never sent to GitHub. Each file's content is compressed and stored once, so unchanged files take no extra space from one checkpoint to the next.

=== Saving a checkpoint

A checkpoint is saved in three ways by hand,

- #ui[Save checkpoint], the clock button beside #ui[Compile],
- #key("⇧", "⌘", "S") and
- #ui[Save checkpoint] in #menu[Tools][Checkpoints], with an optional label typed beside it, such as "Draft for tutor".

After a save, a notice says "Saved checkpoint 2" with #ui[Rename], which names it. When nothing has changed since the last checkpoint, saving with a label offers to label the last checkpoint instead (@fig-references-saved).

#shot("figures/04-references/checkpoint-nothing-changed.png", [The question when a labelled checkpoint is saved with nothing changed since the last one.], width: 50%) <fig-references-saved>

Spectrum also saves a checkpoint by itself at four times. Each is marked in the list with a badge,

- #ui[After compile], after a compile that succeeds, when the source has changed since the last checkpoint,
- #ui[Before AI changes], before the first change from the assistant or an agent is applied in a review,
- #ui[Before restore], before a checkpoint is restored and
- #ui[Before template change], before a Quick switch.

Compiles save at most one checkpoint every 10 minutes, as a newer compile's checkpoint takes the place of the one saved earlier in that time. Checkpoints saved by hand, named ones and the "Before" ones are never replaced.

=== The Checkpoints tab

#menu[Tools][Checkpoints] lists the checkpoints by day, newest first (@fig-references-checkpoints). Each shows its number, its label or a summary such as "Edited main.tex", its age, the lines added and removed and its badge. The #ui[…] menu of a checkpoint has five actions,

- #ui[Compare with current], which compares the checkpoint with the files as they are now,
- #ui[What changed], which compares it with the checkpoint before it,
- #ui[Restore this checkpoint…], which puts every file back as it was,
- #ui[Rename…], which labels it and
- #ui[Delete…], which removes it.

#shot("figures/04-references/checkpoints-list.png", [#menu[Tools][Checkpoints] after a restore. Checkpoint 3 was saved by Spectrum before the restore, and checkpoint 1 carries the label "Draft for tutor".], width: 60%) <fig-references-checkpoints>

#ui[Delete automatic checkpoints older than…] at the foot removes the compile checkpoints older than a week, a month, three months or a year, for this project. #menu[Settings][Checkpoints] does the same for every project on the computer.

=== Comparing and restoring

A comparison lists the changed files on the left, each marked #ui[Changed], #ui[Added], #ui[Removed] or #ui[Not tracked], and shows the chosen file side by side, with the changed words marked and the unchanged lines folded away (@fig-references-compare). #ui[Show whole file] unfolds them. A single file is put back as follows,

+ Choose #ui[Compare with current] in the checkpoint's menu
+ Choose the file on the left
+ Press #ui[Restore this file]
+ Press #ui[Restore] to confirm

#shot("figures/04-references/checkpoint-compare.png", [Checkpoint 2 compared with the current files. The checkpoint's text is on the left and the current text on the right.]) <fig-references-compare>

#ui[Restore this checkpoint…] puts every file back after asking first. In both cases Spectrum saves a #ui[Before restore] checkpoint of the current state when it differs from the latest checkpoint, so a restore can itself be undone. An open file reloads in the editor with the restored text.

=== Settings

#menu[Settings][Checkpoints] has three switches and the clearing out menu (@fig-references-settings-checkpoints),

- #ui[Save a checkpoint when a compile succeeds], on by default, which saves the #ui[After compile] checkpoints described above,
- #ui[Warn me when a checkpoint fails to save], on by default, which says when saving fails or when a file was too large (over 50 MB) or could not be read,
- #ui[Save a checkpoint before every change I apply], off by default, which saves a #ui[Before AI changes] checkpoint before each change accepted in a review, in place of one for the whole review, and
- #ui[Delete automatic checkpoints older than…], for every project on the computer.

#shot("figures/04-references/settings-checkpoints.png", [#menu[Settings][Checkpoints].], width: 65%) <fig-references-settings-checkpoints>

Checkpoints are stored as Spectrum 1.10.4 stored its versions, so going back to 1.10.4 lists every checkpoint as a version.

== GitHub <sec-references-github>

Spectrum moves projects between your computers through GitHub. Each project is kept in a private repository of yours, and your settings in another, through a Git library built into Spectrum, so no Git installation is needed on a Mac or on Windows. Without a GitHub account, projects and settings simply stay on each computer.

=== Signing in

#menu[Settings][GitHub] signs in once on each computer (@fig-references-settings-github), in one of two ways,

- #ui[Sign in with GitHub…], which opens GitHub in your browser, where you enter the code Spectrum shows and allow it to use your repositories or
- #ui[Or paste a token], a personal access token: a fine-grained token for all your repositories with Contents and Administration set to Read and write, or a classic token with the `repo` scope.

#shot("figures/04-references/settings-github.png", [#menu[Settings][GitHub] before signing in. The switch for keeping your settings on GitHub stays off until you have signed in.], width: 65%) <fig-references-settings-github>

The token is kept in the backend, in `github.json` in Spectrum's data folder, readable by your account only, and never reaches the window. Commits are made as your GitHub account with its noreply email address.

=== Backing up a project

Before signing in, #menu[Tools][GitHub] shows "Keep this project on GitHub" with a link to #menu[Settings][GitHub], and the GitHub view of the projects page asks you to sign in (@fig-references-github-view). #ui[Sync with GitHub] in a project's menu also opens #menu[Settings][GitHub] until you have signed in.

#shot("figures/04-references/tools-github-signed-out.png", [#menu[Tools][GitHub] before signing in, with #ui[Initialise] for a Git repository on this computer only.], width: 60%) <fig-references-github-signed-out>

#shot("figures/04-references/github-view-signed-out.png", [The GitHub view of the projects page before signing in.], width: 55%) <fig-references-github-view>

Once signed in, a project is backed up as follows,

#howto[back up a project to GitHub][
+ Choose #ui[Sync with GitHub] in the project's menu, or #ui[Back up to GitHub] in #menu[Tools][GitHub]
+ Wait while Spectrum makes a private repository named after the project and pushes the project to it
]

The repository is recorded in the project's `.spectrum/settings.json` with the project's id, so a Finder copy of the project is not linked to it. From then on Spectrum pulls when the project is opened, backs up about a minute after you stop typing and backs up when you leave the project. Quitting only commits, and the push follows at the next start. #menu[Tools][GitHub] then has #ui[Sync], #ui[Pull], #ui[Back up…], with an optional label, and #ui[Open on GitHub], with how many commits are still to back up or pull.

#ui[Initialise], in #menu[Tools][GitHub] before signing in, makes the project a Git repository on this computer only, with a first commit and no GitHub repository. It writes a `.gitignore` for TeX's build files when the project has none.

=== What goes to GitHub

The sources, figures and `.bib` files go to GitHub, with the project's details, its settings, chats, to-dos, PDF notes and research sessions. The following stay on this computer,

- checkpoints and the other files of this computer,
- TeX's build files and each compiled document's PDF, but never a PDF that a source includes and
- files that look like keys and files over GitHub's 100 MB limit.

Spectrum writes these rules into `.git/info/exclude` before each backup, and a backup says which files it left out. In a repository that is public or has other collaborators, chats, to-dos, notes and research stay out until you say yes in #menu[Tools][GitHub].

=== Pulling and conflicts

A pull first fetches, then commits this computer's changes and saves a "Before pull from GitHub" checkpoint. Each file changed on both computers is then merged: text by lines, the project's details and settings key by key, chats by message, research sessions by search, and to-dos and notes field by field. A file that cannot be merged keeps this computer's copy, with GitHub's beside it as a conflicted copy, such as `main (GitHub’s conflicted copy 2026-10-25 104233).tex`, which the editor offers to compare, keep or delete. A pull that would delete many files at once asks first, and a file you change during a pull is never written over.

=== The other computer

The GitHub view in the projects page's sidebar lists your repositories that are Spectrum projects. #ui[Get from GitHub] clones one into the folder for new projects with the project's own id. #ui[Link] joins a repository with the project of the same id already on this computer, after showing how many files would come from GitHub and how many conflicts there would be.

=== When it cannot sync

Spectrum leaves a repository alone while another Git program works in it, and does not sync one that uses Git LFS or submodules, is in the middle of a merge or has no branch checked out. A project inside a sync app's folder, such as Synology Drive, Dropbox, Google Drive, OneDrive or iCloud Drive, is not made a repository, and Spectrum offers to move it to this computer first.

Without a connection, Spectrum waits and tries again every two minutes. A token GitHub no longer accepts says #ui[Sign in to GitHub again], a repository you cannot reach says #ui[No access], and a push GitHub refuses shows GitHub's message. Each also shows as #ui[Not backed up since] on the project and in #menu[Tools][GitHub].

=== Settings on GitHub

With #ui[Keep my settings in a private repository (spectrum-settings)] on in #menu[Settings][GitHub], your appearance, editor, spelling, shortcuts, personas, your own skills and templates, the folders on the projects page and the tag colours go through a private `spectrum-settings` repository. Each computer writes its own settings file, so the newer value of each setting wins, while personas, skills and templates are one file or folder each, and the newer copy is kept whole. A computer signing in for the first time takes the settings already there. Before you sign in, the switch shows off and cannot be changed, with "Sign in to GitHub to turn it on." in its hint. API keys, tokens and folders on disk never go to GitHub.
