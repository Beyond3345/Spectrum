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

#shot("figures/03-assistant/settings-models.png", [#menu[Settings][Models] with the OpenAI preset. The endpoint and the recommended model are filled in by the preset, and only the API key is left to paste, with #ui[Test connection] beside it.], width: 70%) <fig-assistant-settings-models>

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

Two choices need no key at all. #ui[Ollama] runs models on your own computer, or on another computer on the network when its address is entered, and #ui[Refresh] reads the list of models from Ollama itself, so the list is whatever has been downloaded. Ollama keeps a short context by default, so raising its own #ui[Context length] to 32k or more lets a whole document fit. #ui[Other (OpenAI-compatible)] takes any server that speaks the OpenAI chat completions API, such as LM Studio or vLLM, and a server at a plain `http://` address needs no key. An endpoint whose address ends in `/messages` is called as Anthropic's Messages API, and one ending in `/responses` as OpenAI's Responses API. #ui[Ollama Cloud], on the other hand, runs larger models on Ollama's servers and needs a key from Ollama.

Beside each #ui[API key] is #ui[Test connection]. It asks the provider for its list of models with the key as it stands, which sends no message and costs nothing, and says under the key what happened. The answer is one of these: connected, with the number of models the provider offers; the key refused; the server's name not found; the connection refused, dropped or timed out; or a certificate that could not be trusted. The models the provider lists then join the #ui[Model] menu after the presets, under their own names, for as long as Spectrum stays open, and for #ui[Other] they are offered as you type the model's name. When the chosen model is not in the list, the result says so. A test that passes shows that the address is right and that the provider took the key. It does not show that the model answers or that the account has credit left, since only a message can show that. OpenRouter and Ollama Cloud list their models to anyone, so for them the key is checked with their own free key and balance requests. Z.ai and Alibaba Qwen publish no list of models, so for them the test can only say that the server was reached.

=== Reasoning effort

The reasoning effort sets how long a model may think before it answers, from #ui[Off] to #ui[Max]. Settings, the assistant and the Spectrum agent's tab offer only the levels the chosen model accepts, and #ui[Recommended] uses the level in @tab-assistant-providers. Spectrum sends the effort in the form each provider expects. Specifically, OpenAI is called through its Responses API with storage turned off, Claude through Anthropic's Messages API, and the providers whose models always think a little start at their lowest level instead of #ui[Off]. Autocomplete and reference splitting use the lowest level a model accepts, so they stay quick. A Spectrum agent thread can have its own model and effort, chosen in the agent's tab (@sec-assistant-ask).

Below the effort, #ui[Prices] takes a model's input, cached input and output prices per million tokens, as the provider's price list gives them, and the currency they are in. The model is the main model to begin with, and the menu beside it offers the provider's other models and every model that already has a price, so a model a thread chooses in the agent's tab can be priced too. The currency is US dollars unless you choose another: the Chinese yuan, euro, British pound, the Australian, New Zealand, Canadian, Singapore, Hong Kong and New Taiwan dollars, Japanese yen, South Korean won, Indian rupee or Swiss franc. Prices are optional and only used for the estimate in the agent's meter (@sec-assistant-meter). Spectrum keeps no price list of its own, since prices change, and converts no currencies, so without a price the meter shows tokens alone.

#shot("figures/03-assistant/settings-model-price.png", [The prices of the main model, in Chinese yuan. The prices here are an example, and yours come from the provider's price list.], width: 60%) <fig-assistant-model-price>

#shot("figures/03-assistant/settings-quick-vision.png", [The quick and vision models further down the same pane. Both follow the main model until another provider is chosen for them.], width: 70%) <fig-assistant-quick-vision>

=== Where keys are kept

A key is kept by the system on this computer, in the login keychain on a Mac and encrypted for your Windows account on Windows, and Spectrum's settings keep only a reference to it. The key is therefore out of reach of anything that runs in Spectrum's window, and it is only ever sent to the address it was entered for. Keys entered in an earlier version move to the keychain the first time the new version starts, and a key typed into Settings moves a second after it is typed. A saved key shows as dots, and clicking the field selects it, so a new key pasted in replaces it whole. If the keychain cannot be used, the keys stay in Spectrum's settings and keep working as before, and #menu[Settings][Models] says why at the top. Each provider's key is kept when switching between providers, so going back to one does not need its key again. Keys never go to GitHub, even with #ui[Keep my settings in a private repository] turned on (@ch-references).

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

When the project has an `AGENTS.md` that you have approved (@sec-assistant-instructions), every request from this panel is given it as well, a question and a rewrite alike, followed by the lines Spectrum remembers for the project (@sec-assistant-memory). A rule such as "Spelling: Australian English" therefore applies to #ui[Polish] and #ui[Translate] too. The file shapes how the model writes and is not a task of its own, so a rewrite still comes back as the rewritten text. While the file is in use, an #ui[AGENTS.md] chip beside the persona picker opens it. AI autocomplete is given neither, to keep it quick.

A provider that is busy does not end a request. When it answers that it is overloaded or limiting requests, Spectrum waits and sends the request again, twice at most. It waits for as long as the provider asks, up to 20 seconds, or else for one second and then three. A rejected key, a wrong address and an account with no credit left are not sent again, since waiting does not mend them, and the message says which it was. A connection that drops before the provider answers, as one through a VPN sometimes does, is tried again in the same way. If it still fails, the message names the cause, such as a server name that was not found, a connection that was refused, dropped or timed out, or a certificate that could not be trusted. When an answer stops at the model's output limit, the panel says "The answer was cut off by the model's output limit." under it, and #ui[Continue] asks the model to go on from where it stopped.

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

#ui[Review] opens #ui[Review changes], a side-by-side comparison of each file with your text on the left and the suggestion on the right (@fig-assistant-review-changes). Changed words are marked inside each changed line, and unchanged stretches are folded away as "16 unchanged lines", while #ui[Show whole file] unfolds them.

A suggestion for a file is shown as its separate changes. Each change has its own bar, which says where it is ("Lines 20 to 21") and how many lines it adds and removes, and in a LaTeX, Typst or Markdown file the changes are grouped under the heading they come under, with a count. Each change can be settled by itself, so one good sentence can be kept from a rewrite that is otherwise not wanted. The changes are accepted or rejected as follows,

+ Read the first change of the first file in the list on the left
+ Press #ui[Accept] to write that change into the file, or #ui[Reject] to drop it from the suggestion
+ Press #ui[Edit] to change the suggested text first (@fig-assistant-review-edit), and then #ui[Accept edited] to write your version
+ Repeat for the other changes, or press #ui[Accept] or #ui[Reject] at the top for the whole file, or #ui[Accept all] or #ui[Reject all] at the foot

#shot("figures/03-assistant/review-changes.png", [#ui[Review changes] for one file with three changes. Each change has its own #ui[Edit], #ui[Reject] and #ui[Accept], and the change in focus is marked in blue.]) <fig-assistant-review-changes>

A change that is accepted is written at once, and what is left of the suggestion stays in the review against the file as it then is. The keys under the comparison do the same without the mouse: #key("J") and #key("K") move to the next and the previous change, #key("A") accepts the change in focus, #key("R") rejects it and #key("E") opens its editor. The keys are ignored while you type in a change's editor, where #key("Esc") closes the editor and #key("⌘", "Enter") accepts the edited text.

#shot("figures/03-assistant/review-change-edit.png", [#ui[Edit] on one change. The box holds the suggested text, and what is typed there is written in place of the lines on the left.], width: 85%) <fig-assistant-review-edit>

The switch at the top of the sheet, #ui[Source] and #ui[PDF before and after], shows what the changes do to the document instead of to its source (@fig-assistant-review-pdf). Spectrum compiles the project as it is and a copy of the project with every change still in review applied, and shows the two PDFs side by side. Both are compiled on copies inside the same isolation as an agent's draft (@sec-assistant-external), so nothing is written into the project and a LaTeX compile stays confined. A side that does not compile shows its log in the place of its PDF, which is a warning worth having before a change is accepted.

#shot("figures/03-assistant/review-pdf.png", [#ui[PDF before and after] for the same three changes: the report as it is on the left, and as it would be on the right.]) <fig-assistant-review-pdf>

Before it writes the first change you accept, Spectrum saves a "Before AI changes" checkpoint. That one checkpoint covers every change you accept until the review is closed, so restoring it from #menu[Tools][Checkpoints] puts the project back as it was before the first of them (@ch-references). A file that a suggestion deletes is saved in a checkpoint of its own just before it goes. #menu[Settings][Checkpoints] can save a checkpoint before every accepted change instead. The same review is used by #ui[Fix with AI] in the Logs and Review tabs and by Quick switch, and the agents' review in the workspace works the same way (@sec-assistant-agent-review). A file that a suggestion would delete is marked #ui[Deleted] in the list. The tidying that follows a conversion to another format is still reviewed a file at a time.

=== Image to LaTeX

#ui[+] in the panel's bar turns a picture into LaTeX with the vision model. Its menu has five kinds of picture (@fig-assistant-image-menu), each of which asks for a different result,

- #ui[Equation from image…], an equation environment,
- #ui[Table from image…], a `tabular` or `table`,
- #ui[Figure with caption from image…], a figure with the picture saved into the project,
- #ui[Algorithm from image…], an `algorithm` environment and
- #ui[Text only from image…], the text read from the picture.

#shot("figures/03-assistant/image-menu.png", [The image menu under #ui[+].], width: 40%) <fig-assistant-image-menu>

After choosing a picture, the reply shows the LaTeX in a code block with #ui[Insert at cursor], which puts it into the open file as a block. In a Typst document each kind asks for Typst instead: maths between `$`, a `#table`, a `#figure` with alt text, an algorithm as a numbered list in a figure and text with Typst's marks escaped. Anything typed in the message box before choosing the picture is sent with it as an extra instruction.

=== AI autocomplete

AI autocomplete writes a suggestion at the cursor with the quick model. It is asked for with #key("⌥", "/"), shows "Writing a suggestion…" while it works and then offers the suggestion in grey text with three choices,

- #ui[Accept] (#key("Tab")), which keeps the whole suggestion,
- #ui[Word] (#key("→")), which keeps the next word only and
- #ui[Dismiss] (#key("Esc")), which removes it.

Autocomplete is told the document's language, the nearest heading and, in a LaTeX file, the environment the cursor is in. It never uses the default instructions or a persona, and its key can be changed in #menu[Settings][Shortcuts]. Because it has to be quick, it asks a busy provider once only. Typing, moving the cursor or pressing #key("Esc") while a suggestion is being written cancels the request, so it is not paid for. After typing, a new request goes out once the keys have rested for a moment, and pressing #key("⌥", "/") again replaces the request with a new one at the cursor.

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

#menu[Settings][Skills] lists the skills in four groups, Research, Writing, Review and Submission, with a search at the top (@fig-assistant-settings-skills). Spectrum ships 19 skills. Twelve come from K-Dense's scientific agent skills, each under its own licence, and seven are Spectrum's own,

- `spectrum-latex`, `spectrum-typst` and `spectrum-markdown`, for editing and fixing a document in each language,
- `spectrum-related-work` and `spectrum-verify-claims`, for drafting related work and checking claims against their sources,
- `spectrum-convert-tidy`, used when converting a project between LaTeX and Typst and
- `spectrum-template-transfer`, for moving a paper into another LaTeX or Typst template (@sec-assistant-transfer-agent).

#shot("figures/03-assistant/settings-skills.png", [#menu[Settings][Skills]. Each card shows the skill's author, licence, version, file count and what its scripts need, with its switch at the top right.], width: 85%) <fig-assistant-settings-skills>

Every skill has a switch. With #ui[All projects] chosen at the top, a switch changes every project that has not made its own choice. With #ui[This project] chosen, it changes only the open project, and the choice is saved in its `.spectrum/settings.json`.

#ui[Files] on a card opens the skill's file browser (@fig-assistant-skill-files). A built-in skill is read only there, so #ui[Duplicate] makes a copy of your own to change. Your own skills are made in three ways,

- #ui[Create skill], which asks for a name, a description and the instructions,
- #ui[Add folder…], which copies a folder holding a `SKILL.md` into Spectrum, regular files only and
- #ui[Duplicate] on any card.

#shot("figures/03-assistant/skill-files.png", [The file browser of a built-in skill. "Built in: duplicate it to make changes" says why the text cannot be edited.], width: 75%) <fig-assistant-skill-files>

The Spectrum agent has the list of skills in its instructions, a line for each, and loads them itself, but it cannot run their scripts. Before each local agent session, Spectrum copies the skills that are on for the project into the agent's private home, marked as Spectrum's, so skills the agent installed itself are left alone. Lastly, #ui[Share skills with other agents on this computer], at the foot of the pane and off by default, links your own skills that are switched on into `~/.agents/skills` and `~/.claude/skills` for agents you run outside Spectrum. It does this only where `~/.agents` or `~/.claude` already exists, and never in place of anything already there.

== The agent workspace <sec-assistant-workspace>

The agent workspace is where a model works across the whole project. It is opened with #ui[Agent], the rightmost button of the editor's toolbar, and takes the place of the PDF, with #ui[PDF] in its header to go back. The workspace has two tabs,

- #ui[Spectrum agent], the built-in agent, which reads the project through the main model and proposes changes (the assistant's Edit mode before 2.0) and
- #ui[Local agents], which runs a coding agent installed on your computer (@sec-assistant-external).

#shot("figures/03-assistant/agent-workspace.png", [The Spectrum agent's tab on a new thread. The header holds the history, the #ui[Isolated] badge, the persona and the model and thinking menu, and the task buttons fill the empty thread.], width: 65%) <fig-assistant-workspace>

The header holds the history of threads or sessions (the clock), the #ui[Isolated] or #ui[Direct] badge, the persona picker and, at the right, the model menu, the meter and #ui[Stop]. A local agent shows its own model and mode menus beside its badge instead, and only when the agent lists them. The sections below follow a request from the message box to the changes it leaves behind and what it cost.

=== Asking the agent <sec-assistant-ask>

A new thread opens on "What would you like to do today?" with five task buttons. Each fills in a prepared message with its skill, which you can change before sending it (@fig-assistant-task).

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

The chips under the message box decide what goes with a message: the open file, the selection (#ui[Selection, 1 line]), the compile log and the open to-dos. The to-dos go with the first message of a thread unless their chip is taken off. Typing `/` lists the agent's commands and the project's skills (@fig-assistant-slash), and a skill chosen there goes with the message in whole. The Spectrum agent has two more chips there, #ui[Plan] (@sec-assistant-plan) and one for the project's `AGENTS.md` (@sec-assistant-instructions).

#shot("figures/03-assistant/agent-slash-skills.png", [`/` in the message box lists the skills that are on for the project.], width: 60%) <fig-assistant-slash>

A picture can go with a message too, such as a sketch of a figure or a photo of a whiteboard. Paste it into the message box, drop it on the box or choose it with the picture chip at the end of the chips, up to four with a message. Each one shows as a chip with a small copy of the picture, and the thread keeps that small copy under the message. A picture is sent only to a model that reads images, as the model lists in #menu[Settings][Models] say: Claude, GPT and Gemini do, while DeepSeek V4 Pro and GLM-5.3 read text only. With a model that does not, the picture is left out, the agent is told so and says it in its answer. A local agent is sent the pictures when it says it takes images, and is told they were left out when it does not.

#ui[Send page to agent] in the PDF's right-click menu puts that page in the message box as a picture (@fig-assistant-send-page). For a LaTeX document it adds the source line of the spot clicked, found with SyncTeX, with the lines around it. Add what the agent should do and send it.

#shot("figures/03-assistant/agent-send-page.png", [#ui[Send page to agent] on the results table of a paper. The page is a chip with its small copy, and the message names the line the table comes from.], width: 60%) <fig-assistant-send-page>

In the Spectrum agent's tab, the menu at the right of the header chooses the model and the thinking for the thread (@fig-assistant-model-menu). It lists the models of the provider in #menu[Settings][Models], and under #ui[Thinking] only the levels the chosen model accepts, while #ui[Models and prices…] opens Settings. A new thread starts with the model and effort from Settings, and each thread keeps its own choice, which applies from its next request. If the provider in Settings changes, a thread goes back to the model in Settings.

#shot("figures/03-assistant/agent-model-menu.png", [The model and thinking menu of a Spectrum agent thread, with the Anthropic Claude preset.], width: 35%) <fig-assistant-model-menu>

With each message the agent is given the document's language and an outline of the project as it is saved, which is the same for LaTeX, Typst and Markdown: the main file, the files it reads (`\input`, `#include` and `#import`), the bibliography files, a Markdown front matter, the headings with their file and line, the labels, the keys cited and the references and citations that do not resolve. While the language's own skill (`spectrum-latex`, `spectrum-typst` or `spectrum-markdown`) is on, the agent is pointed to it for fixing a compile. A later message in the same thread keeps what the agent read before, so it does not read the same files again.

Everything the agent reads that you did not type, such as a file, a compile log, a search result, a paper's abstract or a tool's answer, reaches the model marked with where it came from, and the model is told that such text is material to work on and never an instruction. A sentence planted in a web page or a PDF therefore cannot pass for your request. A skill is marked as a skill, a method to follow that cannot change the agent's rules.

=== Watching the agent work <sec-assistant-work>

The Spectrum agent works in the open. Each step appears as a card while it runs, with how long it took once it has finished, and what the agent says between its steps and its answer appear as they are written (@fig-assistant-working). A card opens to what the step returned: an edit to its comparison and a compile to its errors. A step too quick to time shows no time.

#shot("figures/03-assistant/agent-working.png", [The Spectrum agent at work. Four steps are done, the compile of its draft took 1.6 seconds, a message waits above the message box with #ui[Steer now], and #ui[Stop] is in the header.], width: 65%) <fig-assistant-working>

The agent works for up to 25 steps. In them it can,

- read the project, search its text and read the project map and the bibliography,
- change a file by replacing exact text or by writing it again, propose a new file or the deletion of one,
- compile the project with its changes on a copy and read the errors at their lines, in LaTeX, Typst and Markdown,
- search the literature, fetch a paper's BibTeX and, where web search is set up, search the web (@sec-assistant-search),
- read and suggest to-dos and load skills,
- look at a page of its draft or at a figure on its own (@sec-assistant-look) and
- ask you a question, show a plan before it starts (@sec-assistant-plan) and suggest a line to remember (@sec-assistant-memory).

Its tools are the ones a local agent gets from Spectrum (@sec-assistant-external), with its own for the project's files. Nothing in your project changes until you apply a change: the agent writes its proposed changes over a copy of the project, and its compile builds that copy. After changing a source file it compiles, fixes the first error and compiles again, three times at most, and says in its answer whether the document builds. The compile card says how it went in its title, such as "Compiled the draft: builds" or the number of errors. #ui[Fix with AI] in the Logs and Review tabs does the same (@sec-assistant-review).

=== Looking at pages and figures <sec-assistant-look>

Two of the agent's tools return a picture. The first compiles the draft and draws one of its pages, for a task about how the page looks, such as a table past the margin or where a figure lands. The second compiles one standalone `.tex` or `.typ` file on its own, such as a diagram the composer saved in `diagrams/`, and draws it. The agent checks a figure for labels that overlap or touch lines, text past the edge, parts too small to read and wasted space, and fixes it and looks again three times at most. Each step's card, such as "Look at “page 1”", opens to the picture, and the card of a composer diagram has #ui[Open in composer] (@fig-assistant-look). A Mermaid diagram is drawn by the composer itself, so the agent reads its text instead.

#shot("figures/03-assistant/agent-look.png", [The agent looked at page 1 and at the circuit figure. The figure's card shows two labels drawn over each other, and #ui[Open in composer] opens the diagram.], width: 60%) <fig-assistant-look>

The pictures are drawn by the built-in Typst on your computer, from the same compile as the agent's other steps. A picture goes to the model only when it reads images. Otherwise the agent is told that the picture was not sent and says so, while the card still shows it to you. A thread keeps sending its six newest pictures and leaves the older ones out, since each picture is sent again with every step. A local agent has the same two tools, and is given each picture as an image.

=== Handing work to the agent <sec-assistant-handoff>

Notes on the PDF, to-dos and the points Review raises each know where they point, so they can go to the agent without being typed again. The paper plane on a PDF note, on a to-do of your own and on a row or an AI point in Review sends that one item, and #ui[Send to agent] at the top of the notes and of the AI review sends all of them, twenty at most. Each item goes into the Spectrum agent's message box with its file and line, or with its page for a Typst or Markdown note, and the source lines around it. A note on a LaTeX document's PDF finds its line with SyncTeX, and the pages of the notes go with them as pictures. Several items are numbered, and the agent answers them in order by number. Nothing is sent until you press the send button, so you can add to the message first. While #ui[Fix with AI] is one request with one answer, an item sent to the agent is worked on in a thread you can follow up in.

The transcript also folds away the agent's thinking, shows questions and permission requests in line, and has a #ui[Restore] row for each Before AI changes checkpoint. A to-do the agent suggests appears as a card with #ui[Add] and is only saved once added. The thread is saved with the project's chats but listed only in the workspace.

=== Stopping and steering

#ui[Stop], in the header while the agent works, ends the request to the model and the step that is running at once, a compile included, and what the agent had done is kept. A message sent while the agent works waits above the message box as #ui[Queued], as the box itself says ("Enter queues it while the agent works"). #ui[Steer now] hands it to the agent between two steps, and otherwise it is sent as the next request when the answer has come. A message still waiting after #ui[Stop] stays there with #ui[Send] and #ui[Remove]. Closing the workspace does not stop the agent, and a page opened or reloaded while it works shows the run where it is, with the messages that were waiting.

=== Planning first and questions <sec-assistant-plan>

The Spectrum agent can show its plan before it changes anything. #ui[Plan], a chip under the message box, asks for this with the next request. With it on, the agent can only read the project in that turn, and the turn ends with a plan to approve (@fig-assistant-plan). With it off, the agent still plans first by itself when a task touches more than two files or rewrites a section, while a smaller task is done straight away.

#shot("figures/03-assistant/agent-plan.png", [A plan waiting for approval. Nothing has been changed yet, and each step can be unticked.], width: 55%) <fig-assistant-plan>

Each step of the plan has a tick box, and a step that is unticked is left out. #ui[Edit as text] shows the steps one a line, where they can be reworded, reordered, added to and removed. The plan is then settled with one of three buttons,

- #ui[Approve and run], which starts the work on the ticked steps,
- #ui[Approve, ask before each file], which starts it and has the agent stop before each new file it would change and
- #ui[Keep planning], which leaves #ui[Plan] on and puts the cursor in the message box, where you say what the plan should change.

The approved steps stay at the top of the thread as the plan, and each is ticked off as the agent finishes it. #ui[Save open steps as to-dos] adds the steps still open to the to-do list (@ch-writing).

Nothing an agent proposes is written before you apply it in the review, whichever button is used, so #ui[Approve, ask before each file] is not a second permission to write. It sets the pace instead. The agent prepares its changes to one file and then asks, for example, "Go on to refs.bib?" (@fig-assistant-plan-pause), so that the first file's changes can be reviewed, applied or rejected before the agent builds on them. #ui[Go on] starts the next file, and the agent is told of any change you rejected in the meantime. A file whose change already waits in the tray is not asked about again. #ui[Cancel] closes the question, and your next request then runs the rest of the plan without stopping.

#shot("figures/03-assistant/agent-plan-pause.png", [A plan approved with #ui[Approve, ask before each file]. Two steps are ticked, the changes to `main.tex` wait in the tray and the agent asks before it goes on to `refs.bib`.], width: 55%) <fig-assistant-plan-pause>

When a request is unclear and a wrong guess would waste the work, the agent asks a question instead of guessing (@fig-assistant-question). The question appears as a card, with its answers as buttons where the agent offered some and a box to type in where it did not. An answer typed in the message box works as well, and #ui[Cancel] or #ui[Decline] closes the question unanswered.

#shot("figures/03-assistant/agent-question.png", [A question from the Spectrum agent. One of the buttons, or a message, answers it.], width: 65%) <fig-assistant-question>

A plan or a question that waits for you holds nothing open. Its turn has ended, so no request to the model is running and there is nothing to stop. It is saved with the thread and is therefore still there after the page is reloaded or Spectrum is closed and opened again, and your answer starts the next turn. A message that was queued while the agent worked is not taken as the answer: it stays above the message box with #ui[Send].

=== Reviewing an agent's changes <sec-assistant-agent-review>

Changes from either agent wait in a tray above the message box, such as "2 files, +6 −5". #ui[Review] on the tray opens a review in the pane (@fig-assistant-agent-review), which lists the files with the number of changes in each and shows the chosen file as its separate changes, as #ui[Review changes] does (@sec-assistant-changes). A file the agent made is marked #ui[New] and one it would delete #ui[Deleted], while a new file with the text of a deleted one is marked #ui[Moved].

#shot("figures/03-assistant/agent-review.png", [The Spectrum agent's changes in review. `main.tex` has three changes, and the one in focus is under the Method heading.], width: 55%) <fig-assistant-agent-review>

Each change has #ui[Edit], #ui[Reject] and #ui[Apply], and the keys are the same as in #ui[Review changes], with #key("A") for apply. #ui[Apply] and #ui[Reject] in the file's bar settle the whole file, and #ui[Apply all] and #ui[Reject all] the whole tray. A change that is applied is written into your file at once, and the rest of the agent's work on that file stays in the tray. The first change applied after the tray is opened saves a "Before AI changes" checkpoint, which appears in the conversation with #ui[Restore] and covers every change applied until the tray is closed, as in #ui[Review changes]. A local agent is told on its next task which of its changes were applied, edited or rejected, and its copy of the file is brought into line.

A proposed deletion is reviewed as one change that takes out every line of the file. Only when it is applied whole is the file moved to the Bin, or deleted where there is no Bin, and the Before AI changes checkpoint saved just before keeps a copy either way. A deletion taken in part, or edited before it is applied, is an edit like any other, so the file stays with the lines that are left.

The comparison is always against your file as it is now, with the left side labelled #ui[Your file]. Edits you made while the agent worked are therefore kept: the agent's changes are moved onto your text where the two do not touch. Where you and the agent changed the same lines, the change is marked "You changed these lines too" and shows both versions, yours on the left and the agent's on the right (@fig-assistant-agent-overlap). Such a change is settled with one of four buttons,

- #ui[Keep mine], which leaves your lines as they are,
- #ui[Use the agent's], which replaces your lines with the agent's,
- #ui[Take both], which keeps your lines and puts the agent's after them and
- #ui[Edit], which opens both versions in one box to be edited into what the file should say.

#ui[Apply] for the file and #ui[Apply all] apply only the changes that do not overlap your own, and say how many are left for you to choose. If the agent also changed a file's line endings, a line above the comparison offers that as one more change with #ui[Keep mine] and #ui[Apply].

#shot("figures/03-assistant/agent-review-overlap.png", [A sentence was added to line 33 in the editor while the agent rewrote the same line. Both versions are shown, with the four ways to settle them.], width: 55%) <fig-assistant-agent-overlap>

#ui[PDF before and after] works as in #ui[Review changes]. For a local agent the page after is compiled from the agent's own copy of the project. A dot on the #ui[Agent] button shows a task that is running, waiting for an answer or has changes to review.

=== After changes are applied <sec-assistant-automations>

Once changes from the Spectrum agent, a local agent or #ui[Fix with AI] are applied, Spectrum compiles the document, so the PDF shows them straight away. If that compile fails, the message that says so has a #ui[Fix with AI] button, which asks the main model for a fix only when it is pressed. Both are switches under #ui[Automations] in #menu[Settings][Agents] (@fig-assistant-settings-mcp), and both are on until you turn them off. They run only while Spectrum is open, and neither asks a model anything by itself.

=== Standing instructions in AGENTS.md <sec-assistant-instructions>

Things an agent should know about one project, such as its spelling, the journal's style or a folder it must never touch, are kept in a file named `AGENTS.md` at the top of the project. The Spectrum agent is given this file with every request as your standing instructions for the project, up to its first 20,000 characters. #ui[Fix with AI] and the assistant panel (@sec-assistant-panel) are given it too. Most local agents read a file of this name by themselves from their copy of the project. A persona (@sec-assistant-personas) applies to every project, while `AGENTS.md` applies to the one it is in.

The chip under the message box shows where the file stands,

- #ui[Add AGENTS.md] when the project has none, which offers a short file to start from, with the main file, its language and three example rules, and opens it in the editor,
- #ui[Using AGENTS.md] when the agent is given the file, which opens it and
- #ui[AGENTS.md not used] when the file has not been approved, as described below.

The file is yours, and the agent never writes it by itself. A project can come from elsewhere, such as a clone from GitHub, an imported archive or a folder someone shared, and an `AGENTS.md` that came with it is text you have not seen. Spectrum therefore gives the file to the agent only as you approved it on this computer. Your own save of the file in the editor approves it, and nothing else does. A file that arrived with the project is not given to the agent, and neither is one changed by a pull, a sync from another computer, an agent working in the project's folder or an agent's change that you applied in the review, even though you applied it yourself. A line above the message box then says so (@fig-assistant-instructions-ask). #ui[Read it] opens the file, and #ui[Use it], which is available once the file has been opened, approves it as it is. The approval is kept on this computer and outside the project's folder, so it cannot arrive with a project. Until then the agent can still read the file as it reads any file of the project, which is as material and never as instructions.

#shot("figures/03-assistant/agent-instructions-ask.png", [An `AGENTS.md` that changed outside Spectrum. The agent is not given it until it has been read and #ui[Use it] is pressed.], width: 65%) <fig-assistant-instructions-ask>

The same check decides what a local agent reads. An Isolated session's copy of the project (@sec-assistant-external) leaves out an `AGENTS.md` you have not approved, and the session says so when it starts, pointing to the chip and #ui[Use it]. Once you approve the file, it reaches the agent's copy with its next task, and a file that a pull changes leaves the copy again by the next task. Some agents also read an `AGENTS.md` in a folder below the top, or a file named `AGENTS.override.md` or `AGENTS.local.md`. These cannot be approved, so an Isolated copy always leaves them out. An agent that writes a file by one of these names in its copy while yours is left out is told that it will not be offered, and the review never shows it, so it cannot replace or delete your file. A Direct session works in the project's folder itself, where Spectrum cannot hide a file, and says so when it starts.

=== What the agent remembers <sec-assistant-memory>

The Spectrum agent also has a memory for each project, kept apart from `AGENTS.md`. When you state a lasting rule or preference in a conversation, such as "write units with `\qty` from now on", the agent can suggest it as a line to remember. The suggestion appears as a card (@fig-assistant-instructions), and only #ui[Add] on the card keeps the line. The agent never adds a line by itself.

#shot("figures/03-assistant/agent-instructions.png", [Two lines the agent suggested to remember. The first has been added, and the #ui[Memory] chip counts it.], width: 65%) <fig-assistant-instructions>

The #ui[Memory] chip under the message box, beside the `AGENTS.md` chip, shows how many lines are kept and opens the list (@fig-assistant-memory). Each line has a pencil to edit it and a bin to delete it, and #ui[Add a line] adds one of your own. The Spectrum agent, #ui[Fix with AI] and the assistant panel are given every line with each request, as your remembered notes for the project, after `AGENTS.md`. A project keeps 30 lines at most and each line is at most 300 characters, and a turn can suggest three.

#shot("figures/03-assistant/agent-memory.png", [The lines the agent remembers for a project, with the pencil to edit and the bin to delete each one.], width: 65%) <fig-assistant-memory>

The memory is kept by Spectrum on this computer and never in the project's folder. Since only your own #ui[Add] or typing writes it, a line cannot arrive with a pull or a sync, and the memory needs no approval as `AGENTS.md` does. It also stays on this computer: another computer that syncs the project has its own memory for it. Local agents are not given this memory, since they keep their own.

=== When a run does not finish <sec-assistant-unfinished>

A run can end before its answer in four ways, and in each the work done so far is kept, with a line under the thread that says why (@fig-assistant-continue).

- A request to the model fails. Spectrum first tries a busy provider again as described in @sec-assistant-panel, and the thread says how long it waits and which try it is. If the request still fails, the thread shows the steps that were finished, the failure under them and the changes prepared so far in the tray, where they can be reviewed and applied as usual.
- The agent reaches its limit of 25 steps.
- The answer is cut off by the model's output limit.
- You press #ui[Stop], and the line says "You stopped the agent. What it had done is kept."

#ui[Continue] goes on in the same run, from the conversation as it stood with everything the agent had read and done, and builds on the changes still open. Spectrum keeps a run for an hour after its last answer and until the app closes. After that, #ui[Continue] starts a new run that is told which steps were finished, so it still goes on and does not start again. When nothing had been done before a failure, the button is #ui[Try again].

#shot("figures/03-assistant/agent-continue.png", [A run whose fourth request failed. The three finished steps and the prepared change are kept, and #ui[Continue] goes on from them.], width: 65%) <fig-assistant-continue>

=== What a run cost <sec-assistant-meter>

The meter in the header counts what the agent used (@fig-assistant-meter). For the Spectrum agent, #ui[Turn] is the request running or the last one and #ui[Thread] all of the thread's requests together, in tokens read and written. Requests to Claude and OpenAI models ask the provider to cache what stays the same from one request to the next, and the share marked #ui[cached] is how much of what the model read came from that cache, which costs less. With OpenRouter, the meter shows the cost OpenRouter reports for each request, in US dollars, summed over the turn and the thread. With your own key at another provider through OpenRouter, it includes what that provider charged. With any other provider a cost appears only as an estimate, marked #ui[est.], when every model the thread used has a price in #menu[Settings][Models] (@sec-assistant-models). The estimate is in the currency of the price. A thread whose requests were priced in two currencies, or partly by OpenRouter and partly by your prices, shows each sum on its own and never adds them together. Holding the pointer over the meter shows each count in full and, where there is a price, what the cache saved.

#shot("figures/03-assistant/agent-meter.png", [The meter of a thread of two requests. The first was priced in Australian dollars from the prices in Settings and is marked est., and the second went through OpenRouter, whose own figure is in US dollars. The two are shown side by side.], width: 65%) <fig-assistant-meter>

For a local agent the meter shows what the agent reports: how full its context is, with a bar that turns orange from 80 per cent, the cost of the session when the agent gives one and the tokens of its last task. An agent that reports none of these shows no meter.

=== Your own MCP servers <sec-assistant-mcp>

A Model Context Protocol (MCP) server is a program that gives an agent more tools, such as a search of a reference service or a lab's own data. The Spectrum agent can use the ones you add under #ui[MCP servers] in #menu[Settings][Agents] (@fig-assistant-settings-mcp). A server is added by a name and the command that starts it, such as `npx -y` and the server's package, and it is used as follows,

#howto[give the agent an MCP server's tools][
+ Type a #ui[Name] and the command and, below them, the hosts the server may reach if it needs any, then press #ui[Add]
+ Press #ui[Check], which starts the server and lists its tools
+ Switch it #ui[On]
]

A server is added off, and it can be switched on only once it has been checked. Each tool is listed as #ui[only reads] or #ui[asks you first]. The agent sees a server's tools as the server's name and the tool's, such as `notes__lookup`, and what a tool answers reaches it marked as material from that tool, never as your instructions. A tool that the server does not mark as only reading may change something outside the project, so the first time the agent calls it in a thread the turn ends with a question card, and the tool runs only after #ui[Allow]. If a server's list of tools changes after you checked it, the agent gets none of its tools, with a note saying so, until you check it again.

#shot("figures/03-assistant/settings-agents-mcp.png", [#menu[Settings][Agents] with a server named notes checked and on. It may reach one host, and it asked for another when it was checked. Below it, the two automations that follow an applied change.], width: 70%) <fig-assistant-settings-mcp>

A server runs inside the same isolation as a local agent (@sec-assistant-external), in a folder of its own in Spectrum's data, and never sees the project. It reaches no service on this computer, and on macOS it reaches only the hosts listed for it, over HTTPS, in the way @sec-assistant-network describes for an agent. A server that was given no host reaches none. Since a server started with `npx` or `uvx` downloads its package first, it needs its package registry on the list, which is `registry.npmjs.org` for `npx`, and `pypi.org` with `files.pythonhosted.org` for `uvx`. When a server asks for a host that is not on its list, a line under it names the host after #ui[Check], with #ui[Allow] to add it, and a tool whose call was refused a host says so in its answer. Ticking #ui[Any host] opens every public host to the server over HTTPS instead. On Windows no list is enforced yet and a server reaches any public address. The server is stopped after five minutes without use. Servers that are reached by an address rather than started by a command are not supported yet.

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
- #ui[Network], which chooses whether the agent reaches only the hosts on its list or any host (@sec-assistant-network),
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

An isolated agent keeps working on its copy while changes wait, so you can go on prompting and apply or reject each change when you like. What you apply becomes the agent's new starting point, and what you reject is put back to your version in the agent's copy, which the agent is told with its next task. An agent reaches no service on this computer, so local models and MCP servers set up outside Spectrum are not available to it, and where it may connect on the internet is chosen for each agent (@sec-assistant-network). A project with symbolic links, files over 50 MB, or more than 500 MB or 10,000 files is refused rather than copied incompletely.

In an Isolated session the agent stays running for five minutes after a task, so the next message starts at once, and at most three such agents wait at a time. It stops when you open another session or close the project, and Spectrum starts it again when it is needed. A Direct session's agent stops after each task instead, since anything it left running would write into the project outside the task's checkpoint. Either way, a local agent also stops when Spectrum is force-quit or crashes, and does not run on by itself. A very long output from an agent, such as a whole log, keeps its first and last 100 KB with a line saying how many characters were left out between, so that it does not push the earlier turns out of the session.

On macOS, a local agent also gets Spectrum's tools from a small server it starts inside its isolation: `compile`, `get_log`, `project_map`, `bib_entries`, `bib_search`, `search_text`, `literature_search`, `fetch_bibtex`, `check_references`, `list_todos`, `suggest_todo` and `load_skill`. For a Markdown document, `compile` and `get_log` give each error at its line of the `.md` file, as the Logs tab does, and not at a line of the file pandoc generated. Each tool's answer reaches the agent marked with the tool it came from, as text to read and not an instruction. Local agents on Windows get no Spectrum tools yet, as #menu[Settings][Agents] and the #ui[Local agents] tab say there. Keys, working copies, session mappings and transcripts stay on this computer.

=== Where an agent may connect <sec-assistant-network>

An agent that reads the project and can also reach any site could be led to send the project somewhere, for example by an instruction hidden in a PDF, a `.bib` file or a web page that it reads. The #ui[Network] part of each agent's card in #menu[Settings][Agents] therefore has two choices (@fig-assistant-agent-network),

- #ui[Listed hosts only] holds the agent to a list made of its provider's hosts, the sites that Spectrum's tools need and the hosts you add, where the tools need the scholarly sites they search and check references against and the two sites a compile downloads Typst packages and Tectonic's TeX files from, while
- #ui[Any host] lets it reach every public host over HTTPS, as every agent did before version 2.6.

Every agent starts on #ui[Any host], with its list ready, since none has yet been run on its list for real tasks inside Spectrum, and an agent that does not work through a list would fail to connect. Its card says how far its own documentation goes: Claude Agent's names the hosts it needs and says that it honours the proxy settings the list relies on, while the other agents' do not say enough to be sure. To hold an agent to its list, choose #ui[Listed hosts only] in its card, and come back to #ui[Any host] if a task then fails to connect. A host is added by typing its name, such as `api.example.com`, or `*.example.com` for every host below one, and pressing #ui[Add host].

#shot("figures/03-assistant/agent-network.png", [The #ui[Network] part of the Claude Agent card once #ui[Listed hosts only] is chosen, with its provider’s host and the hosts of Spectrum’s tools.], width: 65%) <fig-assistant-agent-network>

When an agent on a list asks for a host that is not on it, the connection is refused and a #ui[Host refused] card naming the host appears in its session (@fig-assistant-host-refused). The button on the card, #ui[Allow for] with the agent's name, adds the host to that agent's list for every session, and the agent is told with its next task that it may try again. Allow a host only if you would trust it with what the agent can read, which is its copy of the project and its own sign-in. If an agent on a list finishes a task without asking for any host at all, the session says so once, since such an agent either could not reach its model or does not work through the list, and #ui[Any host] is then the choice to make.

#shot("figures/03-assistant/agent-host-refused.png", [A host that is not on Claude Agent's list, refused in its session.], width: 65%) <fig-assistant-host-refused>

On macOS the list is kept as follows. The sandbox can open or close an address and a port to a program, but it cannot tell one host name from another, and a provider's addresses change. An agent on a list is therefore given one way out, a port on this computer where Spectrum itself listens. Spectrum takes each request there, checks the host against the list, looks the name up itself, connects only to port 443 and never to this computer, and passes nothing on until the first message of the connection, a TLS hello, names the same host. Everything else is closed to the agent, including name lookups, which could otherwise carry text out inside the names that are asked for.

A list narrows where an agent can send what it reads, but it does not close every way out. Specifically,

- anything can still be sent to a host on the list, so an agent could be led to upload text to its own provider under someone else's account, or to a host you allowed,
- the provider still sees everything the agent sends it,
- Spectrum checks which host a connection names but cannot read the encrypted traffic inside it, so a site served from the same content network as a listed host could in some cases still be reached through it,
- the few macOS services that isolation leaves open to an agent, such as the one that checks certificates, can make requests of their own,
- a program that ignores the proxy settings is not let out another way, it simply fails to connect, so an agent built that way does not work on a list and
- on Windows the isolation opens every public address to an agent or none, so no list is enforced there yet.

=== Spectrum's tools in another agent <sec-assistant-outside>

An agent that you start yourself, such as Claude Code or Codex in a terminal or the agent in Cursor, can use the same tools on a project, except `suggest_todo` and `load_skill`. The button with the server icon at the right of the #ui[Local agents] bar opens #ui[Use from another agent] (@fig-assistant-outside-tools). Turning on #ui[Offer this project's tools] shows a command for Claude Code and an entry for the MCP configuration file of Cursor and other agents, each with a copy button. The button stays highlighted while the tools are offered.

#shot("figures/03-assistant/outside-tools.png", [#ui[Use from another agent] with the project's tools offered, and the configuration to copy into Claude Code or another agent.], width: 70%) <fig-assistant-outside-tools>

The tools answer only programs on this computer that send the secret in the configuration. The secret is new each time the switch is turned on and ends when it is turned off or Spectrum quits, so the configuration is copied again after each start. It opens these tools and nothing else of Spectrum's. The other agent works on the project folder itself, outside Spectrum's isolation, while Spectrum's tools keep their own rules: they read no hidden or secret file of the project, and a compile builds into Spectrum's own folder, confined as your own compile is.

== Review <sec-assistant-review>

Review checks the document that #ui[Compile] builds before it goes anywhere. It is in #menu[Tools][Review], and one press of #ui[Review] saves the open file, compiles when the PDF is older than the source and runs each group of checks that is ticked (@fig-assistant-review-options). A failed build does not stop the review.

#shot("figures/03-assistant/review-options.png", [The top of #menu[Tools][Review] with #ui[References exist] ticked. #ui[AI review] is unticked and says "Set up a model in #menu[Settings][Models] first" until a model is set up.], width: 75%) <fig-assistant-review-options>

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
    [#ui[References exist]], [Each entry of the bibliography looked up in the source its DOI, arXiv ID or title names and compared with it: the entries retracted, not found or with a title, first author or year that differs. Off until ticked, as it goes to Crossref, doi.org, arXiv and OpenAlex],
    [#ui[AI review]], [One read of the whole document by the main model, with the files it includes, which returns a summary, strengths, a score, its confidence and points marked Major, Minor or Note, each tied to a line],
  ),
  caption: [The groups of checks in Review. A Typst document runs Compile and layout and Privacy and blind review. A Markdown document also runs References and assets, which checks its citations against the `.bib` its front matter names, entries never cited, missing images and links to files that are not in the project, each at its line of the `.md`. Accessibility and Submission readiness run for LaTeX only.],
) <tab-assistant-review>

The results are listed under each group with a count and a summary line, such as "0 errors · 1 warning" (@fig-assistant-review-results). A row jumps to its line in the source or to its page in the PDF, and #ui[Dismiss] (the cross) hides it. #ui[Fix with AI] on a row asks the main model for a fix that opens as changes to review (@sec-assistant-changes), and the paper plane sends the row to the agent workspace instead (@sec-assistant-handoff). The fix is compiled on a copy of the project first, and the row then says "Builds." or "Still fails at" with the first error left. Until a model is set up, it opens #menu[Settings][Models] instead. A group that needs the PDF or the log and has neither says #ui[Compile first] rather than reporting no problems.

#ui[References exist] needs no model. Each entry with a DOI is looked up in Crossref, or at doi.org when Crossref does not know it, an entry with an arXiv ID in arXiv and an entry with a title alone in OpenAlex. The title, the first author and the year are compared with the record found, so a different case, an accent or a missing subtitle is no difference, but another year or author is. A retraction is read from the updates Crossref lists for the work, which include Retraction Watch's, from OpenAlex and from a title its publisher marked "RETRACTED". Only the entries with a problem are listed, each with the evidence for it: the record that was read, the fields that differ side by side, the date of the retraction and links to the record and its notice (@fig-assistant-review-exist). A correction or an expression of concern is listed under the entry too, and a DOI that is itself a retraction notice is named as one. #ui[Fix with AI] on an entry that differs proposes the record's details for it, and the entries found as they are are a count at the end that opens to show them. A long bibliography takes a while, as Crossref is asked one entry at a time, and only the first 300 entries are checked in one run.

#shot("figures/03-assistant/review-references-exist.png", [#ui[References exist] for a bibliography with a retracted paper, an entry whose year differs from its record, a title no source knows, a DOI no registry knows and a web page with nothing to look up.], width: 60%) <fig-assistant-review-exist>

The AI review reads the main file and every file it brings in with `\input`, `\include` or `#include`. A document longer than about 160,000 characters of source, roughly 25,000 words, is read in parts, one request each, and each part is told the summary of the parts before it. A part ends before a top-level heading (`\part`, `\chapter` or `\section`, a Typst `=` or `==` and a Markdown `#` or `##`) or a new file once it is at least half full, so a section is read whole where it fits, and only a section longer than a part is split between lines. The status line shows the part being read, such as "AI review, part 2 of 4, chapters/ch3.tex:252 to chapters/ch6.tex:2", and each point is tied to its own file and line. #ui[Stop] ends the review after the parts already read, and the limits of the review say how far it got. A very large thesis takes one request for each part, so a 900 KB thesis is about six requests and takes about six times as long as a paper.

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
- #ui[Deep research], which opens the agent workspace with #ui[Plan] on and a task that first proposes a plan (the questions, the sources to search and how many papers to read in full) for you to approve or change, then searches further, follows references, reads the papers and writes notes and a reading list,
- #ui[Draft related work], which opens the workspace with a task that cites only keys already in the `.bib` and
- #ui[Verify claims], which opens the workspace with the Critical reviewer persona to check the references and then each claim in the open file against its sources, without changing the text.

The Spectrum agent reads a paper with its `read_source` tool. The text comes from the paper's open copy, found through arXiv or through OpenAlex's list of open-access copies, or from a PDF in the project, such as one #ui[Get PDF] saved in `research/papers/`. It is read a few pages at a time, each under its page number, and when there is no open copy the agent gets the abstract alone and is told so. The agent never chooses the address itself, and the text reaches it marked as material to read, not instructions. Each step's card says what was read and where, such as "Read: full text, pages 1–3 of 12, from https://arxiv.org/pdf/1706.03762", and a note the agent writes in `research/notes/` starts with the same line.

Verify claims keeps what it found as evidence in #ui[Claims checked], which appears in the #ui[Research] tab once a claim is recorded (@fig-assistant-claims). Before a claim is kept, Spectrum checks that it is at the line given and that its keys are in the bibliography, and for a claim rated Supported, Partly supported or Unsupported, that the quote is in the source word for word. It finds the quote's page itself, and a quote it cannot find is refused, so the agent has to read the page again. Each row shows the rating, the keys, the source's words, where they were found (#ui[Full text, page 2] or #ui[Abstract only], which opens the source) and a note, with the claim's line to jump to, a to-do for it and a delete. #ui[Problems first] lists the Unsupported claims and those that need a source at the top, and #ui[Copy as table] copies the whole ledger as a Markdown table, ready for `research/claims.md`. The claims are kept in the project's `.spectrum/research/claims` folder, one file each, and go to GitHub with the research sessions.

#shot("figures/03-assistant/research-claims.png", [#ui[Claims checked] after Verify claims, with the problems first. The Unsupported claim was checked against an abstract only, and the Supported one has its quote from page 2 of the paper.], width: 30%) <fig-assistant-claims>

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

Template transfer moves a document into another of Spectrum's templates. It is #ui[Change template…] in a project's menu on the projects page, opened with the #ui[…] button or a right click on the project, and it has four methods (@fig-assistant-change-template),

- #ui[Quick switch], which swaps the preamble for the new template's and keeps the body, without a model, after saving a checkpoint,
- #ui[Classic (LaTeX → LaTeX, AI)], in which the main model rewrites the source for the new template into a new project,
- #ui[From the PDF (parser → LaTeX)], in which a parser reads the PDF into Markdown with LaTeX maths and figures, and the main model then rebuilds it in the new template as a new project and
- #ui[With an agent (LaTeX or Typst)], which makes a new project from the template with this one's files in it, for an agent to move the paper across.

#shot("figures/03-assistant/change-template.png", [#ui[Change template] for the lab report, with its four methods. The first three offer LaTeX templates only.], width: 75%) <fig-assistant-change-template>

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

=== With an agent <sec-assistant-transfer-agent>

#ui[With an agent (LaTeX or Typst)] offers the Typst templates as well as the LaTeX ones (@fig-assistant-change-template-agent). #ui[Make the project] calls no model. It makes a new project from the template, copies this project's files into a `source` folder inside it, leaving out the hidden and secret ones, and opens the new project with the agent workspace showing. The message box then holds the task, with the `spectrum-template-transfer` skill chosen, and nothing is sent until you press send, in the #ui[Spectrum agent] tab or in #ui[Local agents].

#shot("figures/03-assistant/change-template-agent.png", [#ui[With an agent] with the Typst report template chosen. The lab report's files will be in `source/` of the new project.], width: 75%) <fig-assistant-change-template-agent>

The skill has the agent read the template and the old paper first, then move the title block, sections, figures and bibliography into the template's places, keeping every label and citation key. Where the template is in the other language, the agent rewrites the markup and the maths but not the words. It compiles until the document builds and checks that no section, figure or reference was lost, and every change it makes is reviewed as any agent's is (@sec-assistant-agent-review). The `source` folder stays until you remove it. Unlike Classic, this method has no layout check with the vision model.
