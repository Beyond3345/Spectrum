#import "../template.typ": *

= The assistant <ch-assistant>

Spectrum does not include a language model of its own. Instead, it uses a model from a provider of your choice, either through an API key or from a model running on your own computer, and puts that model to work in several places. This chapter is for anyone who wants help from a model while writing, and for anyone who wants to know exactly what Spectrum sends where before turning it on.

The chapter is divided into nine parts. First, @sec-assistant-models describes the models Settings asks for and where their keys are kept. Then @sec-assistant-panel covers the assistant panel beside the editor, and @sec-assistant-personas the personas and skills that shape what a model is told. @sec-assistant-workspace and @sec-assistant-external describe the agent workspace, with Spectrum's own agent and the coding agents installed on your computer. Lastly, @sec-assistant-review, @sec-assistant-research, @sec-assistant-search and @sec-assistant-transfer cover Review, Research, web search and moving a document into another template. Adding references to a `.bib` file, which the assistant also does, is described in @ch-references.

#note(title: [Before a model is set up])[
  Every feature in this chapter that needs a model says so before it runs. Without one, a message to the assistant comes back as "No AI model is set up yet", as in @fig-assistant-no-model, and nothing leaves the computer. Review, Research, Quick switch and the references manager work without a model.
]

== Models and providers <sec-assistant-models>

A model is set up once, in #menu[Settings][Models]. Spectrum uses three of them, each for its own kind of work,

- the main model, for the assistant, the Spectrum agent, Review's AI review and template transfer,
- the quick model, for AI autocomplete and for splitting pasted references into separate items and
- the vision model, for image to LaTeX and the layout check in template transfer.

The quick and vision models follow the main model by default, shown as #ui[Same as main], and move with it when it changes. Choosing another provider for either one gives it its own endpoint, model and key, so that, for example, Gemini can read images while Claude writes the text.

#shot("figures/03-assistant/settings-models.png", [#menu[Settings][Models] with the OpenAI preset. The endpoint and the recommended model are filled in by the preset, and only the API key is left to paste.], width: 70%) <fig-assistant-settings-models>

=== Choosing a provider

The #ui[Provider] menu holds a preset for each provider below, as in @fig-assistant-provider-list. A preset fills in the endpoint, the recommended model for each role and the recommended reasoning effort. Other models from the same provider can be picked from the #ui[Model] list, and any other model name can be typed in.

#shot("figures/03-assistant/provider-list.png", [The #ui[Provider] menu. Ollama runs on your own computer, and Other takes any server that speaks the OpenAI chat completions API.], width: 70%) <fig-assistant-provider-list>

#figure(
  table(
    columns: (auto, auto, auto, auto, auto),
    align: left,
    table.header[Provider][Main model][Quick model][Vision model][Effort],
    [OpenAI], [GPT-6 Sol], [GPT-6 Luna], [GPT-6 Sol], [Medium],
    [Anthropic Claude], [Claude Opus 5.5], [Claude Haiku 5.5], [Claude Sonnet 5.5], [Medium],
    [Google Gemini], [Gemini 3.8 Flash], [Gemini 3.5 Flash-Lite], [Gemini 3.8 Flash], [Medium],
    [OpenRouter], [Claude Sonnet 5.5], [GPT-6 Luna], [Gemini 3.8 Flash], [Medium],
    [DeepSeek], [DeepSeek Flash], [DeepSeek Flash], [DeepSeek Flash], [High],
    [Moonshot Kimi], [Kimi K3], [Kimi K2.6], [Kimi K3], [High],
    [Z.ai GLM], [GLM-5.3], [GLM-5.3 Flash], [GLM-5.3 Flash], [High],
    [Alibaba Qwen], [Qwen3.8 Max], [Qwen3.8 Flash], [Qwen3.8 Max], [Medium],
    [Meta], [Muse Spark 1.3], [Muse Spark 1.3], [Muse Spark 1.3], [Medium],
    [Ollama], [newest installed], [smallest installed], [first that reads images], [the model's own],
    [Ollama Cloud], [Kimi K3], [DeepSeek V4.1 Flash], [Kimi K3], [High],
  ),
  caption: [The provider presets and the models each recommends, as checked against each provider's documentation in October 2026.],
) <tab-assistant-providers>

Keys for Moonshot, GLM and Qwen only work in the region they were made in, so these presets also have a #ui[Region]. Meta's cheaper Contributor models are left out of the list on purpose, since Meta trains on what is sent to them.

Two choices need no key at all. #ui[Ollama] runs models on your own computer, or on another computer on the network when its address is entered, and #ui[Refresh] reads the list of models from Ollama itself, so the list is whatever has been downloaded. Ollama keeps a short context by default, so raising its own #ui[Context length] to 32k or more lets a whole document fit. #ui[Other (OpenAI-compatible)] takes any server that speaks the OpenAI chat completions API, such as LM Studio or vLLM, and a server at a plain `http://` address needs no key. #ui[Ollama Cloud], on the other hand, runs larger models on Ollama's servers and needs a key from Ollama.

=== Reasoning effort

The reasoning effort sets how long a model may think before it answers, from #ui[Off] to #ui[Max]. Settings and the assistant offer only the levels the chosen model accepts, and #ui[Recommended] uses the level in @tab-assistant-providers. Spectrum sends the effort in the form each provider expects. Specifically, OpenAI is called through its Responses API with storage turned off, Claude through Anthropic's Messages API, and the providers whose models always think a little start at their lowest level instead of #ui[Off]. Autocomplete and reference splitting use the lowest level a model accepts, so they stay quick.

#shot("figures/03-assistant/settings-quick-vision.png", [The quick and vision models further down the same pane. Both follow the main model until another provider is chosen for them.], width: 70%) <fig-assistant-quick-vision>

=== Where keys are kept

A key is kept in Spectrum's own settings on this computer and is only ever sent to the address it was entered for. Each provider's key is kept when switching between providers, so going back to one does not need its key again. Keys never go to GitHub, even with #ui[Keep my settings in a private repository] turned on (@ch-references).

The model settings can also be given in a `.env` file in Spectrum's data folder, `~/Library/Application Support/com.beyond3345.spectrum/.env` on a Mac and `%APPDATA%\com.beyond3345.spectrum\.env` on Windows. Settings entered in the application take priority over the `.env` file, and a key in the file is also only sent to its own address.

#shot("figures/03-assistant/assistant-no-model.png", [A question asked before any model is set up. The request stops in Spectrum and points to #menu[Settings][Models].], width: 85%) <fig-assistant-no-model>

== The assistant panel <sec-assistant-panel>

The assistant is a panel that floats at the bottom of the editor. It is opened with the sparkle button in the editor's toolbar (@fig-assistant-top-bar) or with #key("⌘", "L"), and closed the same way or with #key("Esc"). The panel has two modes, chosen at its top left,

- #ui[Assistant], which answers questions about the open file and rewrites a selection and
- #ui[References], which turns DOIs, links, arXiv IDs and titles into `.bib` entries (@ch-references).

#shot("figures/03-assistant/top-bar-buttons.png", [The right of the editor's toolbar: Assistant, Check grammar, Document insights, Tools and Agent.], width: 45%) <fig-assistant-top-bar>

=== Asking about the open file

In #ui[Assistant] mode the panel opens on "How can I help with your paper?" (@fig-assistant-empty). A question typed in the box and sent with #key("Enter") goes to the main model with the open file, the selection and the compile log. #key("⇧", "Enter") starts a new line instead. The answer comes back in the panel and never changes your files. Work across several files of the project belongs to the agent workspace instead (@sec-assistant-workspace).

The model is told which language the open file is written in, LaTeX, Typst or Markdown, with that language's conventions, so an answer about a `.typ` file is written in Typst and not in LaTeX. This applies to every request in this chapter.

A provider that is busy does not end a request. When it answers that it is overloaded or limiting requests, Spectrum waits and sends the request again, twice at most. It waits for as long as the provider asks, up to 20 seconds, or else for one second and then three. A rejected key, a wrong address and an account with no credit left are not sent again, since waiting does not mend them, and the message says which it was. When an answer stops at the model's output limit, the panel says "The answer was cut off by the model's output limit." under it, and #ui[Continue] asks the model to go on from where it stopped.

#shot("figures/03-assistant/assistant-empty.png", [The assistant panel in #ui[Assistant] mode. The bar at the bottom holds the image menu (+), the persona and the reasoning effort.], width: 85%) <fig-assistant-empty>

The bar under the message box holds three controls,

- #ui[+], which opens the image to LaTeX menu described below,
- the persona picker, which shows #ui[Default instructions] until a persona is chosen (@sec-assistant-personas) and
- #ui[Thinking], which sets the reasoning effort for the assistant and is the same setting as in #menu[Settings][Models] (@fig-assistant-thinking).

#shot("figures/03-assistant/thinking-menu.png", [The #ui[Thinking] menu. Only the levels the chosen model accepts are listed.], width: 40%) <fig-assistant-thinking>

The header of the panel has #ui[History], #ui[New chat] and #ui[Close]. Each conversation is saved with the project in its `.spectrum/chats` folder and named after its first message. #ui[History] lists the saved Assistant and References chats, with the Edit chats from before 2.0, and has a search and #ui[Delete] (@fig-assistant-history). An Edit chat from before 2.0 opens with #ui[Continue there], which carries it on in the agent workspace.

#shot("figures/03-assistant/assistant-history.png", [#ui[History] in the panel's header, with a search across the project's saved chats.], width: 85%) <fig-assistant-history>

=== Polishing, rewriting and translating a selection

Selecting text in the editor adds a row of actions to the panel and a #ui[Use selection] chip to its bar, as in @fig-assistant-selection. #ui[Use selection] decides whether the selected text goes with a typed question, and is on by default.

#shot("figures/03-assistant/assistant-selection.png", [A paragraph selected in the editor. The panel offers #ui[Polish], #ui[Rewrite], #ui[Restructure] and #ui[Translate], and #ui[Use selection] sends the selection with a question.], width: 85%) <fig-assistant-selection>

The actions are,

- #ui[Polish], which corrects and tightens the wording,
- #ui[Rewrite], which writes the passage again,
- #ui[Restructure], which reorders it and
- #ui[Translate], a menu of English, Chinese, Japanese, Korean, French, German and Spanish, with a #ui[Scope] of the selection, the current file or the whole project (@fig-assistant-translate).

Anything typed in the box before pressing an action goes with it as a note, for example "keep it under 80 words". Translating the whole project asks the model for changes to every document of the project, its `.tex`, `.typ` or `.md` files, and every other action changes only the open file. Each action asks the model to keep the markup of the document's own language. If a translation of the whole project fails part of the way, the changes made before the failure are kept for review. A rewrite that was cut off by the output limit is not offered as a change, since half a rewrite would replace the whole selection.

#shot("figures/03-assistant/translate-menu.png", [The #ui[Translate] menu. The scope at its foot decides whether the selection, the file or the whole project is translated.], width: 60%) <fig-assistant-translate>

=== Reviewing suggested changes <sec-assistant-changes>

The assistant never writes into a file by itself. An action that changes text comes back as a reply with #ui[Review 1 change] (@fig-assistant-reply), and the editor shows a banner, "Suggested changes to 1 file", with #ui[Discard] and #ui[Review].

#shot("figures/03-assistant/assistant-reply-changes.png", [A reply to #ui[Polish] with its changes waiting to be reviewed.], width: 85%) <fig-assistant-reply>

#ui[Review] opens #ui[Review changes], a side-by-side comparison of each file with your text on the left and the suggestion on the right (@fig-assistant-review-changes). Changed words are marked inside each changed line, and unchanged stretches are folded away as "25 unchanged lines", while #ui[Show whole file] unfolds them. The changes are then accepted or rejected as follows,

+ Read the comparison of the first file in the list on the left
+ Press #ui[Accept] or #ui[Reject] for that file
+ Repeat for the other files, or press #ui[Accept all] or #ui[Reject all] at the foot

#shot("figures/03-assistant/review-changes.png", [#ui[Review changes] for one file. Your text is on the left, the suggestion on the right, and the changed words are marked in each.]) <fig-assistant-review-changes>

Before applying anything, Spectrum saves a "Before AI changes" checkpoint, so an accepted change can always be undone from #menu[Tools][Checkpoints] (@ch-references). The same review is used by #ui[Fix with AI] in the Logs and Review tabs, by Quick switch and by the Spectrum agent.

=== Image to LaTeX

#ui[+] in the panel's bar turns a picture into LaTeX with the vision model. Its menu has five kinds of picture (@fig-assistant-image-menu), each of which asks for a different result,

- #ui[Equation from image…], an equation environment,
- #ui[Table from image…], a `tabular` or `table`,
- #ui[Figure with caption from image…], a figure with the picture saved into the project,
- #ui[Algorithm from image…], an `algorithm` environment and
- #ui[Text only from image…], the text read from the picture.

#shot("figures/03-assistant/image-menu.png", [The image menu under #ui[+].], width: 40%) <fig-assistant-image-menu>

After choosing a picture, the reply shows the LaTeX in a code block with #ui[Insert at cursor], which puts it into the open file as a block. Anything typed in the message box before choosing the picture is sent with it as an extra instruction.

=== AI autocomplete

AI autocomplete writes a suggestion at the cursor with the quick model. It is asked for with #key("⌥", "/"), shows "Writing a suggestion…" while it works and then offers the suggestion in grey text with three choices,

- #ui[Accept] (#key("Tab")), which keeps the whole suggestion,
- #ui[Word] (#key("→")), which keeps the next word only and
- #ui[Dismiss] (#key("Esc")), which removes it.

Autocomplete is told the document's language, the nearest heading and, in a LaTeX file, the environment the cursor is in. It never uses the default instructions or a persona, and its key can be changed in #menu[Settings][Shortcuts]. Because it has to be quick, it asks a busy provider once only.

== Personas and skills <sec-assistant-personas>

Two kinds of instructions change how a model works in Spectrum. A persona is a short set of instructions for a kind of task, chosen per chat, while a skill is a folder of instructions and files in the open Agent Skills format that an agent loads when it needs it.

=== Personas

A persona is picked from the menu in the assistant's bar or in the agent workspace's header (@fig-assistant-persona-picker). While a persona is chosen, its instructions take the place of your default instructions, and each chat remembers its own persona. Spectrum starts with four,

- #ui[Research writer], for academic prose that keeps the author's argument and never makes up a reference,
- #ui[Document editor], for a careful copy edit in Australian English,
- #ui[Critical reviewer], for a referee's reading with major and minor points and
- #ui[Draw a figure], for TikZ, pgfplots and circuitikz figures saved under `diagrams/`.

#shot("figures/03-assistant/persona-picker.png", [The persona picker in the assistant. #ui[Edit personas…] opens #menu[Settings][Personas].], width: 55%) <fig-assistant-persona-picker>

Personas go to the assistant, the Spectrum agent and local agents, but never to autocomplete. A local agent gets the persona in its own system prompt where it offers one, and otherwise with the first message of each new session, so changing the persona starts a new session that is told the conversation so far.

#menu[Settings][Personas] holds the #ui[Default instructions], used in every chat without a persona, and the list of personas with an edit and a delete button on each (@fig-assistant-settings-personas). #ui[Reset to defaults] brings back the four starters. A new persona is made as follows,

+ Press #ui[Create persona] under the list
+ Type a #ui[Name] and choose a #ui[Colour]
+ Write the #ui[Instructions], saying how the model should work while the persona is chosen (@fig-assistant-persona-create)
+ Press #ui[Create]

#shot("figures/03-assistant/settings-personas.png", [#menu[Settings][Personas] with the default instructions and the four starters.], width: 70%) <fig-assistant-settings-personas>

#shot("figures/03-assistant/persona-create.png", [A new persona being made for marking lab reports.], width: 65%) <fig-assistant-persona-create>

Personas follow you to your other computers with the shared settings, as described in @ch-references. Closing Settings with a persona still being edited asks first, with #ui[Discard] and #ui[Keep editing].

=== Skills

A skill is a folder with a `SKILL.md` file, whose front matter gives the skill's name and description, and any scripts or notes it needs. An agent sees each skill's name and description only, and reads the rest when the task calls for it, or straight away when the skill is chosen by typing `/` in the agent workspace.

#menu[Settings][Skills] lists the skills in four groups, Research, Writing, Review and Submission, with a search at the top (@fig-assistant-settings-skills). Spectrum ships 18 skills. Twelve come from K-Dense's scientific agent skills, each under its own licence, and six are Spectrum's own,

- `spectrum-latex`, `spectrum-typst` and `spectrum-markdown`, for editing and fixing a document in each language,
- `spectrum-related-work` and `spectrum-verify-claims`, for drafting related work and checking claims against their sources and
- `spectrum-convert-tidy`, used when converting a project between LaTeX and Typst.

#shot("figures/03-assistant/settings-skills.png", [#menu[Settings][Skills]. Each card shows the skill's author, licence, version, file count and what its scripts need, with its switch at the top right.], width: 85%) <fig-assistant-settings-skills>

Every skill has a switch. With #ui[All projects] chosen at the top, a switch changes every project that has not made its own choice. With #ui[This project] chosen, it changes only the open project, and the choice is saved in its `.spectrum/settings.json`.

#ui[Files] on a card opens the skill's file browser (@fig-assistant-skill-files). A built-in skill is read only there, so #ui[Duplicate] makes a copy of your own to change. Your own skills are made in three ways,

- #ui[Create skill], which asks for a name, a description and the instructions,
- #ui[Add folder…], which copies a folder holding a `SKILL.md` into Spectrum, regular files only and
- #ui[Duplicate] on any card.

#shot("figures/03-assistant/skill-files.png", [The file browser of a built-in skill. "Built in: duplicate it to make changes" says why the text cannot be edited.], width: 75%) <fig-assistant-skill-files>

The Spectrum agent has the list of skills in its instructions and loads them itself, but it cannot run their scripts. Before each local agent session, Spectrum copies the skills that are on for the project into the agent's private home, marked as Spectrum's, so skills the agent installed itself are left alone. Lastly, #ui[Share skills with other agents on this computer], at the foot of the pane and off by default, links your own skills that are switched on into `~/.agents/skills` and `~/.claude/skills` for agents you run outside Spectrum. It does this only where `~/.agents` or `~/.claude` already exists, and never in place of anything already there.

== The agent workspace <sec-assistant-workspace>

The agent workspace is where a model works across the whole project. It is opened with #ui[Agent], the rightmost button of the editor's toolbar, and takes the place of the PDF, with #ui[PDF] in its header to go back. The workspace has two tabs,

- #ui[Spectrum agent], the built-in agent, which reads the project through the main model and proposes changes (the assistant's Edit mode before 2.0) and
- #ui[Local agents], which runs a coding agent installed on your computer (@sec-assistant-external).

#shot("figures/03-assistant/agent-workspace.png", [The agent workspace on a new conversation, with its two tabs, its header and the task buttons.], width: 65%) <fig-assistant-workspace>

A new conversation opens on "What would you like to do today?" with five task buttons. Each fills in a prepared message with its skill, which you can change before sending it (@fig-assistant-task).

#figure(
  table(
    columns: (auto, 1fr),
    align: left,
    table.header[Task][What it asks for],
    [#ui[Literature sweep]], [The most relevant papers on the project's topic, with a line on each and which are already in the project's bibliography, with the `paper-lookup` skill],
    [#ui[Related work]], [A related-work section grouped by theme that cites only keys in the bibliography, with `spectrum-related-work`],
    [#ui[Citation audit]], [A check of every citation for undefined, unused or duplicated keys and wrong details, with `citation-management`],
    [#ui[Manuscript review]], [A referee's reading with major and minor concerns, with `peer-review` and the #ui[Critical reviewer] persona, changing no files],
    [#ui[Verify claims]], [Whether each claim in the open file is supported by its source, with `spectrum-verify-claims`, changing no text],
  ),
  caption: [The task buttons of the agent workspace.],
) <tab-assistant-tasks>

#shot("figures/03-assistant/agent-task-prepared.png", [#ui[Manuscript review] pressed. The message, the `peer-review` skill chip and the #ui[Critical reviewer] persona are filled in, and nothing is sent until the send button is pressed.], width: 65%) <fig-assistant-task>

The chips under the message box decide what goes with a message: the open file, the selection (#ui[Selection, 1 line]), the compile log and the open to-dos. The to-dos go with the first message of a conversation unless their chip is taken off. Typing `/` lists the agent's commands and the project's skills (@fig-assistant-slash), and a skill chosen there goes with the message in whole.

#shot("figures/03-assistant/agent-slash-skills.png", [`/` in the message box lists the skills that are on for the project.], width: 60%) <fig-assistant-slash>

The header holds the session history (the clock), the #ui[Isolated] or #ui[Direct] badge, the agent's model and mode options, the persona picker and #ui[Stop]. The transcript shows the messages, the agent's thinking folded away, a card for each tool call that updates as it runs, questions and permission requests in line and a #ui[Restore] row for each Before AI changes checkpoint. The agent's plan stays at the top, and #ui[Save open steps as to-dos] adds its open steps to the to-do list (@ch-writing).

The Spectrum agent works for up to 25 steps. It can read the project, search the literature, read and suggest to-dos and load skills, and its threads are saved with the project's chats but listed only in the workspace. A to-do it suggests appears as a card with #ui[Add] and is only saved once added.

With each message the agent is given the document's language and an outline of the project as it is saved, which is the same for LaTeX, Typst and Markdown: the main file, the files it reads (`\input`, `#include` and `#import`), the bibliography files, a Markdown front matter, the headings with their file and line, the labels, the keys cited and the references and citations that do not resolve. While the language's own skill (`spectrum-latex`, `spectrum-typst` or `spectrum-markdown`) is on, the agent is pointed to it for fixing a compile.

Everything the agent reads that you did not type, such as a file, a compile log, a search result, a paper's abstract or a tool's answer, reaches the model marked with where it came from, and the model is told that such text is material to work on and never an instruction. A sentence planted in a web page or a PDF therefore cannot pass for your request. A skill is marked as a skill, a method to follow that cannot change the agent's rules.

=== When a run does not finish

A run can end before its answer in three ways, and in each the work done so far is kept (@fig-assistant-continue).

- A request to the model fails. Spectrum first tries a busy provider again as described in @sec-assistant-panel. If the request still fails, the thread shows the steps that were finished, the failure under them and the changes prepared so far in the tray, where they can be reviewed and applied as usual.
- The agent reaches its limit of 25 steps.
- The answer is cut off by the model's output limit.

#ui[Continue] under the thread starts a new run that is told which steps were finished and builds on the changes still open, so it goes on and does not start again. When nothing had been done before a failure, the button is #ui[Try again].

#shot("figures/03-assistant/agent-continue.png", [A run that failed on its third step. The two finished steps and the prepared change are kept, and #ui[Continue] goes on from them.], width: 65%) <fig-assistant-continue>

=== Changes from an agent

Changes from either agent wait in a tray above the message box, such as "3 files, +12 −4". The tray opens a review in the pane with each file's comparison, #ui[Apply] and #ui[Reject] for each file, #ui[Apply all], #ui[Reject all] and #ui[Preview PDF], which compiles the agent's copy of the project so you can see the result first. Closing the workspace does not stop a task, and a dot on the #ui[Agent] button shows a task that is running, waiting for an answer or has changes to review.

== External agents <sec-assistant-external>

External agents, also called local agents, are coding agents installed on your computer, such as OpenCode, Codex or Claude Agent, which Spectrum runs through the Agent Client Protocol (ACP). The user guide calls this a local preview, since its support for each agent is still being tested. There is no switch to turn it on: an agent becomes available in the #ui[Local agents] tab once it is set up in #menu[Settings][Agents]. Until then, the tab says "No agents are set up yet" with #ui[Set up an agent] (@fig-assistant-local-empty).

#shot("figures/03-assistant/local-agents-empty.png", [The #ui[Local agents] tab before any agent is set up.], width: 70%) <fig-assistant-local-empty>

=== Setting up an agent

#menu[Settings][Agents] lists every supported agent as a card, grouped as #ui[Finish setting up], #ui[Not installed] and #ui[Planned] (@fig-assistant-settings-agents). Each card has a status chip, such as #ui[Sign-in needed] or #ui[Adapter needed], and one sentence saying what to do next. #ui[Check again] looks for the programs again after you install one.

#shot("figures/03-assistant/settings-agents.png", [#menu[Settings][Agents]. OpenCode and DeepSeek Harness were found but need a sign-in, while Codex, Claude Agent and ZCode need their ACP adapter.], width: 70%) <fig-assistant-settings-agents>

Opening a card shows its set-up (@fig-assistant-agent-card), in the following parts,

- #ui[Program], where the agent was found, with #ui[Choose the program…] for one Spectrum could not find and #ui[Test], which starts the agent in isolation without a prompt,
- #ui[Sign-in], with the command to run in Terminal and #ui[Copy existing login], which copies a login you already have into the agent's private home,
- #ui[API key], an alternative to signing in, kept in Spectrum's private data,
- #ui[Setup guide], a link to the agent's own instructions and
- #ui[Advanced], with the launcher arguments as a JSON list and the runtime folders the agent may read its installed libraries from.

#shot("figures/03-assistant/agent-card.png", [The OpenCode card opened, with its program, sign-in command and API key.], width: 80%) <fig-assistant-agent-card>

For Codex, Claude Agent, Pi and ZCode, Spectrum installs the pinned ACP adapter into its own data folder when you confirm, with the npm that comes with its Node.js and install scripts turned off. The profiles cover OpenCode, Codex, Claude Agent, Gemini CLI, GitHub Copilot CLI, Cursor, Kimi Code, Hermes, Qoder, Pi, DeepSeek Harness and ZCode, and WorkBuddy is listed as planned. Agent names and logos belong to their owners.

=== Isolated and Direct

The menu at the left of the #ui[Local agents] header chooses how an agent may touch the project (@fig-assistant-isolated),

- #ui[Isolated], the default, runs the agent on a separate copy of the project with a private home, under macOS's Seatbelt or Windows's AppContainer, and its changes wait in the tray for review, while
- #ui[Direct] lets the agent change the project straight away, and saves a checkpoint before each task.

#shot("figures/03-assistant/isolated-direct.png", [The #ui[Isolated] and #ui[Direct] menu of the #ui[Local agents] tab.], width: 40%) <fig-assistant-isolated>

In either mode, and for the Spectrum agent too, some files of a project are kept from every agent: Spectrum's own `.spectrum` folder, `.git`, `.claude`, and the files that look like secrets by their names. These are `.env` files, `.netrc`, `.npmrc` and `.pypirc`, private keys such as `id_rsa`, and files ending in `.pem`, `.key`, `.p12`, `.pfx`, `.keystore`, `.jks` or `.ppk`. It is the same list that the GitHub backup leaves out (@ch-references), so a file that is not uploaded is not shown to an agent either.

An isolated agent keeps working on its copy while changes wait, so you can go on prompting and apply or reject each file when you like. An applied file becomes the agent's new starting point, and a rejected one is put back to your version in the agent's copy, which the agent is told with its next task. The isolated agent can reach public HTTPS and DNS but not local services, so local models and MCP servers set up outside Spectrum are not available to it. A project with symbolic links, files over 50 MB, or more than 500 MB or 10,000 files is refused rather than copied incompletely.

On macOS, a local agent also gets Spectrum's tools from a small server it starts inside its isolation: `compile`, `get_log`, `project_map`, `bib_entries`, `bib_search`, `literature_search`, `fetch_bibtex`, `list_todos`, `suggest_todo` and `load_skill`. For a Markdown document, `compile` and `get_log` give each error at its line of the `.md` file, as the Logs tab does, and not at a line of the file pandoc generated. Each tool's answer reaches the agent marked with the tool it came from, as text to read and not an instruction. Local agents on Windows get no Spectrum tools yet, as #menu[Settings][Agents] says there. Keys, working copies, session mappings and transcripts stay on this computer.

== Review <sec-assistant-review>

Review checks the document that #ui[Compile] builds before it goes anywhere. It is in #menu[Tools][Review], and one press of #ui[Review] saves the open file, compiles when the PDF is older than the source and runs each group of checks that is ticked (@fig-assistant-review-options). A failed build does not stop the review.

#shot("figures/03-assistant/review-options.png", [The top of #menu[Tools][Review]. #ui[AI review] is unticked and says "Set up a model in #menu[Settings][Models] first" until a model is set up.], width: 75%) <fig-assistant-review-options>

#figure(
  table(
    columns: (auto, 1fr),
    align: left,
    table.header[Group][What it checks],
    [#ui[Compile and layout]], [A failed build, the log's errors, lines past the margin, citations and references printed as ??, missing glyphs, a compile that needs another pass, pages of another size and text past the edge of a page],
    [#ui[References and assets]], [Citations with no entry, references with no label, labels used twice, entries twice or missing a field their type needs, DOIs that do not look like one, entries never cited, missing images and figures or tables the text never refers to],
    [#ui[Privacy and blind review]], [Lines that look like keys or passwords, `\todo` notes, `TODO` comments and highlighted text, and with #ui[Anonymous review] on, the authors, `\thanks`, the acknowledgements and the PDF's Author field],
    [#ui[Accessibility]], [The PDF's title, language, tags and bookmarks, small text, pages with no text, alt text, heading levels that skip and vague link text],
    [#ui[Submission readiness]], [The PDF version, encryption, fonts that are not embedded, Type 3 fonts, absolute paths, file names that clash by letter case, image formats pdfLaTeX cannot include, the abstract and the keywords],
    [#ui[AI review]], [One read of the whole document by the main model, which returns a summary, strengths, a score, its confidence and points marked Major, Minor or Note, each tied to a line],
  ),
  caption: [The groups of checks in Review. A Typst or Markdown document runs Compile and layout and Privacy and blind review, and Accessibility and Submission readiness run for LaTeX only.],
) <tab-assistant-review>

The results are listed under each group with a count and a summary line, such as "0 errors · 1 warning" (@fig-assistant-review-results). A row jumps to its line in the source or to its page in the PDF, and #ui[Dismiss] (the cross) hides it. #ui[Fix with AI] on a row asks the main model for a fix that opens as changes to review (@sec-assistant-changes). A group that needs the PDF or the log and has neither says #ui[Compile first] rather than reporting no problems.

#shot("figures/03-assistant/review-results.png", [Review of the lab report. The never-cited `Knuth1984` entry is a note under References and assets, with its line in `references.bib`, and the untagged PDF is an Accessibility warning.], width: 60%) <fig-assistant-review-results>

#ui[Screen reader view], beside the Accessibility group, shows the text a screen reader gets from each page of the PDF in the order it comes (@fig-assistant-screen-reader). Text that is missing or out of order there is missing or out of order for a screen reader too. #ui[Copy report] copies the results as Markdown, and the status line says when Review last ran. The AI review never changes your files, and the latest run is kept for each project until Spectrum quits.

#shot("figures/03-assistant/screen-reader-view.png", [#ui[Screen reader view] of the lab report. The fraction in the Darcy–Weisbach equation reaches a screen reader as separate lines.], width: 75%) <fig-assistant-screen-reader>

== Research <sec-assistant-research>

The #ui[Research] tab in the sidebar, between #ui[Files] and #ui[To-dos], looks for papers on a question without needing a model. A search is run as follows,

#howto[run a search][
+ Type the question in "What are you looking for?"
+ Choose the sources: OpenAlex, Semantic Scholar, arXiv, Crossref, PubMed, Web, Zotero and the project's `.bib`
+ Give a range of years in #ui[From] and #ui[To] if you want one, and untick #ui[Preprints] to leave them out
+ Press #ui[Search]
]

#shot("figures/03-assistant/research-panel.png", [The #ui[Research] tab with a question typed in. The sources shown in blue are on, and PubMed, Web and Zotero are off by default.], width: 38%) <fig-assistant-research>

Every source is searched at once, and one that fails or is busy does not stop the others. The results are merged by DOI, arXiv ID and title, keeping the fullest record, so a paper found both as a preprint and as published is shown once, as published. Each result shows its authors, year, venue, the sources that found it and its citation count, with #ui[Open access] when there is a free copy, #ui[Preprint] when no source knows it as published and #ui[In .bib] with its key when the project already has it. #ui[Sort the results with AI] makes one call to the search model, which adds a line on why each result matters, a keep or drop suggestion and a theme.

Each result has four actions,

- #ui[Keep] and #ui[Drop], each with an optional reason,
- #ui[Cite], which adds the paper to the `.bib` when it is not there yet and puts the citation at the cursor,
- #ui[Open note], which opens the paper's `research/notes/<key>.md`, made with its details and abstract on first use and
- #ui[Get PDF], which downloads a free copy into `research/papers/`.

Each question is kept as a session in the project's `.spectrum/research` folder, with a log of every search and your decisions. #ui[Search again] runs another search into the open session, and the list shows All, Kept, Dropped or To decide. #ui[Add kept papers to .bib] adds every kept paper through the same look-up as the References chat, so a paper already in the project keeps its key. Nothing is written to `research/` until #ui[Open note] or #ui[Get PDF] is used.

The tab has four further tools, each of which needs a model,

- #ui[Find citations for selection], which finds up to five papers that support the selected passage and, with #ui[Add to .bib and cite], adds the ticked ones and cites them after the selection (when the model cannot be reached, the results are a plain search of the passage's words and a line above them says why),
- #ui[Deep research], which opens the agent workspace with a task that searches further, follows references and writes notes and a reading list,
- #ui[Draft related work], which opens the workspace with a task that cites only keys already in the `.bib` and
- #ui[Verify claims], which opens the workspace with the Critical reviewer persona to check each claim in the open file against its sources without changing the text.

#menu[Settings][Search] holds the keys and emails Research uses under #ui[Research sources]: the OpenAlex and Semantic Scholar keys, an email for OpenAlex, an NCBI key for PubMed and the email Unpaywall asks for with #ui[Get PDF]. Each source works without them, and they stay on this computer.

== Web search <sec-assistant-search>

Web search is used by Research's Web source, by the References chat when a link or title needs more details and by #ui[Find citations for selection]. The assistant's chat can also search the general web. #menu[Settings][Search] sets it up (@fig-assistant-settings-search), in three parts,

- #ui[Default search], the connection tried first,
- #ui[Search connections], the connections that may be used, each with its own switch and key and
- #ui[Search model], an optional endpoint, model and key used only for web search, which is the main model when left blank.

#shot("figures/03-assistant/settings-search.png", [#menu[Settings][Search]. The model's built-in web search is the default, and the other connections are tried in order when it fails.], width: 65%) <fig-assistant-settings-search>

The default is tried first, then each other connection that is switched on, in the order shown, when a request fails or returns no usable results. Each fallback uses that connection's own account and allowance.

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: left,
    table.header[Connection][What it searches][Needs],
    [Model's built-in web search], [Whatever the search model finds, on the OpenAI Responses and Claude Messages APIs; other models fall back to the connections], [a model with built-in search],
    [OpenAlex], [Scholarly works only, without retracted ones], [nothing, or a free key],
    [Semantic Scholar], [Papers in every field], [nothing, or a free key],
    [SerpApi], [Google Scholar, or Google or Baidu], [a SerpApi key],
    [Exa], [Its publications category, or the whole web for questions about software], [an Exa key],
    [Tavily], [The web, preferring arXiv, publishers, proceedings and CTAN], [a Tavily key],
    [Brave Search], [The web, with the same sites boosted], [a Brave Search key],
    [DDGS], [Google, Bing, Brave, DuckDuckGo, Mojeek and Yahoo at once], [Python 3.10 and `ddgs`],
  ),
  caption: [The search connections in #menu[Settings][Search].],
) <tab-assistant-search>

#menu[Settings][System] shows whether Python and `ddgs` are found for DDGS, which is installed with `python3 -m pip install ddgs`.

== Template transfer <sec-assistant-transfer>

Template transfer moves a LaTeX document into another of Spectrum's LaTeX templates. It is #ui[Change template…] in a project's menu on the projects page, opened with the #ui[…] button or a right click on the project, and it has three methods (@fig-assistant-change-template),

- #ui[Quick switch], which swaps the preamble for the new template's and keeps the body, without a model, after saving a checkpoint,
- #ui[Classic (LaTeX → LaTeX, AI)], in which the main model rewrites the source for the new template into a new project and
- #ui[From the PDF (parser → LaTeX)], in which a parser reads the PDF into Markdown with LaTeX maths and figures, and the main model then rebuilds it in the new template as a new project.

#shot("figures/03-assistant/change-template.png", [#ui[Change template] for the lab report, with its three methods. Only LaTeX templates are offered.], width: 75%) <fig-assistant-change-template>

=== Quick switch

Quick switch changes the project in place and needs no model, so it is the quickest way to try a document in another template. It is used as follows,

#howto[switch a template quickly][
+ Choose #ui[Change template…] in the project's menu
+ Keep #ui[Quick switch] selected and check the #ui[Main file]
+ Choose the #ui[New template]
+ Press #ui[Switch template]
]

Spectrum first saves a "Before template change" checkpoint and stops if it cannot. It then writes the new template's preamble above your document's body, keeps your title, author and `.bib` files, and copies the template's other files in without replacing your own. The sheet ends with #ui[Finished], the files it changed and #ui[Open project] (@fig-assistant-change-template-done), and the previous state can be restored from #menu[Tools][Checkpoints] (@ch-references).

#shot("figures/03-assistant/change-template-done.png", [Quick switch finished. The lab report now uses the Electronics notes preamble, and only `main.tex` changed.], width: 75%) <fig-assistant-change-template-done>

=== Classic and From the PDF

The two other methods need the main model, and both leave the original project as it is and make a new one. #ui[Classic] reads the LaTeX source, while #ui[From the PDF] either compiles this project (#ui[Compile this project]) or takes a PDF you upload (#ui[Upload a PDF]). Both have a #ui[Compiler] for the new project and #ui[Check the layout with the vision model], which renders up to eight pages of the result for the vision model to compare (@fig-assistant-change-template-pdf).

#shot("figures/03-assistant/change-template-pdf.png", [#ui[From the PDF] with MinerU as the parser. Without a model, the sheet says the main model needs an API key.], width: 75%) <fig-assistant-change-template-pdf>

The parser is chosen in the sheet or in #menu[Settings][Template transfer], and each keeps its own address and key, which is only sent to that address.

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: left,
    table.header[Parser][Where it runs][Key],
    [MinerU (default)], [MinerU's servers, free with 1,000 priority pages a day], [token],
    [Mathpix], [Mathpix's servers, paid per page], [app ID and app key],
    [Mistral OCR], [Mistral's servers, paid per page], [API key],
    [Datalab (Marker)], [Datalab's servers, with a free monthly allowance], [API key],
    [LlamaParse], [LlamaIndex's servers in the US or the EU], [API key],
    [PaddleOCR-VL], [Baidu AI Studio], [access token],
    [Docling], [Your own computer or server, for example in Docker], [none],
    [Other], [Any server that speaks one of the APIs above], [as that API needs],
  ),
  caption: [The PDF parsers for #ui[From the PDF].],
) <tab-assistant-parsers>

The PDF and the parser's output are kept in the new project's hidden `.spectrum` folder. A Typst or Markdown project is converted to LaTeX, or a LaTeX project to Typst, with #ui[Convert to Typst project…] in the same menu instead, which @ch-writing describes.
