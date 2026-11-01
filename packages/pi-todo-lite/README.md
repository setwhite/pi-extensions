# pi-todo-lite

[简体中文](README.zh-CN.md) | **English**

![pi-todo-lite: the Todo table above the editor, next to a running tool call](assets/cover.png)

The model keeps one ordered task table above the editor. The table replays after compaction, after a branch switch or after `--continue`. The package has no runtime dependencies.

## Features

- The model side has one tool, `todo(tasks)`. The call submits the whole table and replaces the old table. `tasks: []` clears the table.
- The table sits above the editor. Pending tasks take lines first. If the table passes `ui.widget.maxLines` lines, the rest collapse into `+N more`.
- `alt+t` collapses the table and keeps the data. `ui.*` moves the table and changes the glyphs, the header and the completed style.
- The extension adds four commands: `/todos`, `/todos clear`, `/todos export`, `/todos import <file>`.

## Install

```bash
pi install npm:pi-todo-lite
```

The old repository moved into this monorepo. Install from npm.

## Configuration

The config file is `<agent dir>/pi-todo/config.json`. `<agent dir>` is `$PI_CODING_AGENT_DIR`. If `$PI_CODING_AGENT_DIR` is unset, the agent dir is `~/.pi/agent`.

The extension only reads this file. The extension never writes this file. Without the file, all values are defaults.

These cases throw an error. The message holds the absolute path and one `path: reason` line per fault: broken JSON, an unknown key, a wrong type or a wrong enum. The extension clamps out-of-range numbers.

**Minimal configuration**: zero config works. To make the table shorter, set `ui.widget.maxLines`. The default is 9 lines.

```json
{
  "ui": { "widget": { "maxLines": 5 } }
}
```

**Full configuration**: all keys follow, with their default values. The `//` starts a comment. Remove the comments in a real file.

```jsonc
{
  "tools": { "todo": { "name": "todo" } },           // tool name
  "plan": {
    "maxTasks": 20,                                  // max tasks per table; more fails the call
    "maxSubjectChars": 120,                          // max characters per task
    "requireSingleInProgress": false                 // true = only one in_progress task
  },
  "ui": {
    "widget": {
      "enabled": true,                               // show the widget
      "maxLines": 9,                                 // max lines (3–10)
      "placement": "aboveEditor",                    // aboveEditor / belowEditor
      "showCompleted": true,                         // list completed tasks individually
      "header": "Todo {done}/{total} · {doing} doing", // header template: {done} {total} {doing}
      "glyphs": { "pending": "[ ]", "inProgress": "[-]", "completed": "[x]" }, // per-status glyphs
      "completedStyle": "strikethrough"              // strikethrough / dim / plain
    },
    "shortcut": { "toggle": "alt+t" }                // collapse key; off = don't register
  },
  "lifecycle": { "onFinish": "clear" },              // model / keep / clear
  "commands": {
    "todos": { "enabled": true },                    // /todos
    "export": {
      "enabled": true,                               // /todos export
      "dir": "",                                     // output dir, empty = project root
      "fileNamePattern": "todo-{timestamp}.md"       // file name template; never overwrites
    },
    "import": { "enabled": true }                    // /todos import <file>
  },
  "guidance": {                                      // what the model sees; per-key override, empty values included
    "description": "…",                              // tool description; empty = empty description
    "promptSnippet": "",                             // the tool-list line; empty = omitted (same as missing)
    "promptGuidelines": ["…"]                        // guidelines; empty array = omitted
  }
}
```

An unknown key throws. The extension ignores no key silently.

## Usage

A completed table stays on screen. The table clears when you send the next message. `lifecycle.onFinish` (`model` or `keep`) changes this behavior.

`/todos export` names the file after `commands.export.fileNamePattern`. On a name clash, `/todos export` yields and does not overwrite the file. `/todos import <file>` needs an empty table. Run `/todos clear` first.

## Docs

| Document | Content |
|---|---|
| [docs/specs/0001-pi-todo-lite.md](docs/specs/0001-pi-todo-lite.md) | Contract and acceptance criteria |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules and dependency direction |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | Terms |
| [CHANGELOG.md](CHANGELOG.md) | Release notes |

## License

MIT © setwhite
