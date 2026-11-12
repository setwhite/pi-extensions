# pi-herdr-subagents-lite

[简体中文](README.zh-CN.md) | **English**

The extension runs each subagent as a separate pi process in its own herdr pane. The tool has two actions: `run` starts a subagent, `send` delivers a follow-up message. Results come back asynchronously. Behavior follows the [v1 contract](docs/specs/0001-v1-contract.md).

## Features

- A subagent is a separate process, and a human can take over its pane. When the child cwd matches the parent cwd, it opens a tab in the same workspace. Otherwise it opens a new workspace.
- Profiles have two layers, global and per project, each a Markdown file with frontmatter.
- `run` returns at once. Each finished turn reports one `subagent_result`. Results inside `aggregateWindowMs` merge into one message, and an oversize result goes to an artifact file.
- Questions stay with the human. When a child opens a prompt, only `herdr:blocked` is emitted, and nothing reaches the parent. The human answers in the child pane.
- Nesting is off by default, and the extension is no sandbox. Unless the profile names this tool, a child tool set drops it.

## Install

```bash
pi install npm:pi-herdr-subagents-lite              # npm
pi install /path/to/pi-herdr-subagents-lite         # local checkout
pi -e /path/to/pi-herdr-subagents-lite/src/index.ts # this process only
```

The old repository moved into this monorepo, so install from npm.

Do not pass `-l`. `-l` writes project settings only, so a child started in another workspace never loads the package. `pi -e` applies to the current process only.

Requires Node `>= 22.19`. Tested with herdr `0.9.5` and pi `1.4.0`. The parent must run inside a herdr pane; otherwise calls fail with `not_in_herdr`.

Upgrade with `pi update --extensions`, remove with `pi remove <source>`.

## Configuration

The extension reads one global file: `<agent-dir>/pi-herdr-subagents-lite/config.json`. `<agent-dir>` defaults to `~/.pi/agent` and follows `PI_CODING_AGENT_DIR`. There is no project config.

Keys and their meaning: [contract §1](docs/specs/0001-v1-contract.md#1-配置). Defaults and clamp bounds: `src/config/index.ts` and `test/config/config.test.ts`.

### Minimal config

A missing file means all defaults. To change one value, write only that value:

```json
{
  "maxConcurrent": 4
}
```

### Full configuration

Every key follows, and each value is the default.

```jsonc
{
  // Default true. false = no subagent tool for the model. The bridge has its own switch.
  "enabled": true,
  // Default "subagent". Must match ^[a-z][a-z0-9_]{0,31}$. The name prefixes each guideline line.
  "toolName": "subagent",
  // Default "herdr". A plain name resolves from PATH; an absolute path pins a version.
  "herdrBin": "herdr",
  // Default 16, range 1 and up. At the limit run returns max_concurrent. Only a running turn holds a slot.
  "maxConcurrent": 16,
  // Default 16384, range 1024 to 1048576. A longer text goes to an artifact file. The message keeps a truncated head and the path.
  "maxResultChars": 16384,
  // Default 500, range 0 to 10000 milliseconds. 0 = deliver each result at once. A larger value merges more results.
  "aggregateWindowMs": 500,
  // Default ["quit", "reload"]. Values: new, resume, fork, quit, reload. A listed reason closes the child panes on parent shutdown.
  "closeChildrenOn": ["quit", "reload"],
  // Default false. true = close the pane after a failed or interrupted turn. false keeps it so send can resume.
  "closeOnFailure": false,
  // Default 250, range 50 to 5000 milliseconds. A larger value wakes less often and delivers later.
  "inboxPollMs": 250,
  // Default 15000, range 1000 to 300000 milliseconds. How often a running child is checked for liveness. Three absences in a row mark it lost.
  "livenessPollMs": 15000,
  // Tool text overrides. Each key defaults to unset, which keeps the built-in text shown below.
  "prompts": {
    // Replaces the built-in description.
    "description": "Use run when a task is self-contained and long-running. Use send to pass information to a subagent.",
    // The one-line entry in Available tools. Empty = keep the tool out of that list.
    "snippet": "",
    // Replaces the built-in guideline lines. Keep {{profiles}} to list the profiles.
    "guidelines": [
      "run only starts; it does not wait. The result arrives later as a message.",
      "send only delivers; no state tracking.",
      "Available profiles:\n{{profiles}}"
    ]
  },
  // Turn pi prompt events into herdr:blocked events.
  "bridge": {
    // Default true. false = no herdr:blocked events.
    "enabled": true,
    // Default all five. Prompt kinds that count as blocked: custom, select, confirm, input, editor.
    "blockedOn": ["custom", "select", "confirm", "input", "editor"]
  }
}
```

The file must be strict JSON, and the extension reads it once at load. Delete the comments and restart pi after a change.

An unknown key, a wrong type or an unknown enum value stops the extension at load: pi prints `invalid config <path>: <field>: unknown key` and exits. A number outside its range clamps to the boundary without an error.

## Usage

1. Start `pi` in a herdr pane.
2. Write a profile (see the next section). `run` takes the profile frontmatter `name`.
3. Ask the model to call the tool:

```json
{"action":"run","profile":"explore","task":"Read README.md and answer with its first heading."}
```

The call returns `{"state":"running",...}`. The subagent runs in its own tab, and a `[subagent explore-1] done` message arrives later. Do not wait for it in the same turn. Deliver a follow-up with:

```json
{"action":"send","name":"explore-1","message":"Also check the Windows branch."}
```

### Profile

Global profiles live in `<agent-dir>/pi-herdr-subagents-lite/profiles/*.md`. Project profiles live in `.pi/pi-herdr-subagents-lite/profiles/*.md` and load once the project is trusted. A project profile wins over a global profile with the same `name`.

```markdown
---
# Key run takes; the file name is not used
name: explore
description: "Read-only research: read code, answer questions, change nothing"

# Omit to inherit from the parent
# model: provider/model
thinking: low

# Plain names = strict allowlist. +name / -name adjusts the default set. Never mix both
# Omitted = pi defaults minus this tool (nesting off); "" = empty allowlist
tools: read, bash

# Omitted = pi discovery; "" = no skills; a list = only those
skills: ""

# append / replace: body is appended to or replaces the system prompt
# task: body is the task text, no identity file
system-prompt: append

# Close the pane after this run's done turn. Leave it false to keep the child resumable with send
auto-exit: true

# true = hidden from the guidelines; an explicit run still works
disable-model-invocation: false
---

You are a read-only explorer. Answer with file paths and line numbers.
```

Error codes: [contract section 2](docs/specs/0001-v1-contract.md#2-profile). Defaults: `src/profile/frontmatter.ts` and `test/profile/`.

A profile stays out of the list when it has no `name`, an invalid field or a duplicate name in its layer. `run` on it returns `profile_invalid` with the file, the field and the reason.

The extension ships one example, with file name and `name` both `worker`. Loading reads `profiles/*.md` only, and on every load it makes `profiles/examples/` match the bundled example: it rewrites the bundled files and deletes extra ones. So copy the example one level up:

```bash
cd <agent-dir>/pi-herdr-subagents-lite/profiles && cp examples/worker.md worker.md
```

## Credits

| Project | Borrowed |
|---|---|
| [earendil-works/pi](https://github.com/earendil-works/pi) | Extension API, package layout, official examples |
| [fyang93/pi-herdr-subagents](https://github.com/fyang93/pi-herdr-subagents) | Profile field shapes; integration tests on an isolated herdr session |
| [modem-dev/pi-herdr-subagents](https://github.com/modem-dev/pi-herdr-subagents) | herdr launch and lifecycle; derived end states |
| [purboo/pi-durable-subagents](https://github.com/purboo/pi-durable-subagents) | Async delivery, idempotency, report-once results |

This extension builds on these projects. Thanks to their authors.

## Docs

| Document | Content |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Module boundaries, dependency direction, test seams |
| [GLOSSARY](docs/GLOSSARY.md) | The only source for terms |
| [Modules](docs/modules/) | Usage and trade-offs per module |
| [Decisions](docs/decisions/) | One file per decision |
| [Spec](docs/specs/0001-v1-contract.md) | The v1 contract |
| [Research](docs/research/) | Measurements of herdr and pi |
| [CHANGELOG.md](CHANGELOG.md) | Release notes |

## License

MIT, see [LICENSE](LICENSE).
