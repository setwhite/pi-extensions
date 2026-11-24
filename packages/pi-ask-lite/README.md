# pi-ask-lite

[简体中文](README.zh-CN.md) | **English**

One tool: `ask(questions)`. The model asks 1–4 questions with 2–6 options each, and the user answers with one keystroke. Esc aborts the whole turn: no second model reply, no half-finished answers. The package has no runtime dependencies.

## Features

- Single select: `Enter` or a digit picks the focused option and moves to the next unanswered question. Multi select: `Space` toggles options, `Enter` confirms the question.
- Every question has a `Custom…` row for free text. `Shift+Enter` adds a newline, `Enter` confirms.
- `e` opens a note on the focused option. The note lands with the answer.
- `Ctrl+Enter` submits what is answered and marks the rest as skipped.
- `Esc` aborts. The turn ends immediately and the model gets no answers.
- An option can carry a `preview` in Markdown. Wide terminals show it beside the options, narrow ones stack it below.
- The dialog takes the editor slot, never the chat. Height is capped by `ui.maxHeightRatio`.

## Install

Not on npm yet. Run it from this repo:

```bash
pi -ne -e ./packages/pi-ask-lite/src/index.ts
```

## Keys

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move between options and the Custom row |
| `Tab` / `Shift+Tab` / `←` / `→` | Switch question |
| `1`–`9` | Pick that option (toggle in multi select) |
| `Space` | Toggle the focused option in multi select |
| `Enter` | Confirm the focused option, or the answer |
| `e` | Note on the focused option (`keys.annotate`) |
| `Ctrl+Enter` | Submit early (`keys.submitEarly`) |
| `Esc` | Abort the turn, or leave the current editor |

## Configuration

The config file is `<agent dir>/pi-ask/config.json`. `<agent dir>` is `$PI_CODING_AGENT_DIR`, or `~/.pi/agent` when unset. The directory is `pi-ask`, not the package name.

The extension only reads this file and never writes it. Without the file, all values are defaults.

An error names the absolute path and one `path: reason` line per fault. These cases throw: broken JSON, an unknown key, a wrong type. `ui.maxHeightRatio` outside 0.2–0.8 clamps to the bound.

**Minimal configuration**: zero config works. To make the dialog shorter, set `ui.maxHeightRatio`.

```json
{
  "ui": { "maxHeightRatio": 0.3 }
}
```

**Full configuration**: all keys follow, with their default values. `//` starts a comment; remove the comments in a real file.

```jsonc
{
  "tools": { "ask": { "name": "ask" } },             // tool name
  "limits": {
    "maxQuestions": 4,                               // max questions per call
    "maxOptions": 6                                  // max options per question
  },
  "ui": {
    "maxHeightRatio": 0.45,                          // dialog height share (0.2–0.8)
    "bell": true,                                    // ring on submit and abort
    "preview": { "minSideBySideWidth": 100 }         // below this width the preview stacks
  },
  "keys": {
    "annotate": "e",                                 // note editor on the focused option
    "submitEarly": "ctrl+enter"                      // submit answered, skip the rest
  },
  "guidance": {                                      // what the model sees; `tool-name` becomes the tool name
    "description": "Ask structured questions when user intent or trade-offs are unclear.",
    "promptSnippet": "",                             // tool-list line; empty = omitted
    "promptGuidelines": [
      "tool-name: Check code, docs, or tools first; only ask when user intent or trade-offs are unclear.",
      "tool-name: Ask only independent questions together; defer follow-ups that depend on earlier answers.",
      "tool-name: Put the recommended option first, keep `label` short, and explain trade-offs in `detail`.",
      "tool-name: Put concrete examples, code, or layouts in `preview` when options differ in behavior.",
      "tool-name: Set `multiple: true` only when choices are not mutually exclusive."
    ]
  }
}
```

An empty `guidance.promptSnippet` registers no tool-list line. `tool-name` in the other two fields becomes the tool name.

`keys.submitEarly` defaults to `ctrl+enter`, which only Kitty-protocol terminals report. Older terminals send a plain `\r`, so the key behaves like `Enter`. Change it when that matters.

## Docs

| | |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Modules, dependency rules, test seams |
| [Spec](docs/specs/0001-pi-ask-lite.md) | Contract, acceptance criteria, non-goals |
| [Decisions](docs/decisions/README.md) | One file per decision |
| [Glossary](docs/GLOSSARY.md) | What each term means |
