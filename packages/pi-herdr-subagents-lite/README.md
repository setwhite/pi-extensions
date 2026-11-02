# pi-herdr-subagents-lite

[简体中文](README.zh-CN.md) | **English**

The extension runs subagents as separate pi processes in herdr panes. One tool has two actions: `run` starts a subagent, and `send` continues a subagent. Results come back asynchronously. The behavior follows the [v1 contract](docs/specs/0001-v1-contract.md).

## Features

- A subagent is a separate process. A human can take over its pane. If the subagent cwd equals the parent cwd, the subagent opens a tab in the same workspace. Otherwise the subagent opens a new workspace.
- Profiles have two layers: Markdown with frontmatter. One layer is global. One layer is per project.
- Results are async and merged. `run` returns at once. Each finished turn reports one `subagent_result`. Results inside `aggregateWindowMs` merge into one result. Oversize results go to an artifact file.
- Questions stay with the human. A child prompt only emits `herdr:blocked`. Nothing reaches the parent. The human answers in the child pane.
- Nesting is off by default. The extension is not a sandbox. If the profile does not name this tool, child tool sets drop this tool.

## Install

```bash
pi install npm:pi-herdr-subagents-lite              # npm
pi install /path/to/pi-herdr-subagents-lite         # local checkout
pi -e /path/to/pi-herdr-subagents-lite/src/index.ts # this process only
```

The old repository moved into this monorepo. Install from npm.

Do not pass `-l`. `-l` writes project settings only, so children started in another workspace never load the package. `pi -e` is single-process too.

Tested with herdr `0.9.5` and pi `1.4.0`, Node `>= 22.19`. The parent must run inside a herdr pane. Otherwise calls fail with `not_in_herdr`. Upgrade with `pi update --extensions`. Remove with `pi remove <source>`.

## Configuration

One global file holds the configuration: `<agent-dir>/pi-herdr-subagents-lite/config.json`. `<agent-dir>` defaults to `~/.pi/agent`. `PI_CODING_AGENT_DIR` sets `<agent-dir>`. The extension does not read a project config.

Defaults and clamp boundaries: `src/config/index.ts` and `test/config/config.test.ts`. Key meaning: [contract §1](docs/specs/0001-v1-contract.md#1-配置).

### Minimal config

A missing file means all defaults. To change one value, write only that value:

```json
{
  "maxConcurrent": 4
}
```

### Full configuration

The block below lists every key. Each value is the default.

```jsonc
{
  // Default true. false = no subagent tool for the model. The bridge has its own switch.
  "enabled": true,
  // Default "subagent". Must match ^[a-z][a-z0-9_]{0,31}$. The name prefixes each guideline line.
  "toolName": "subagent",
  // Default "herdr". A plain name resolves from PATH; an absolute path pins a version.
  "herdrBin": "herdr",
  // Default 16, range 1 and up. At the limit run returns max_concurrent. A child with auto-exit: false keeps its slot after it settles.
  "maxConcurrent": 16,
  // Default 16384, range 1024 to 1048576. A longer text goes to an artifact file. The message keeps a truncated head and the path.
  "maxResultChars": 16384,
  // Default 500, range 0 to 10000 milliseconds. 0 = deliver each result at once. A larger value merges more results.
  "aggregateWindowMs": 500,
  // Default empty = never close. Values: new, resume, fork, quit, reload. A listed reason closes the child tabs on parent shutdown.
  "closeChildrenOn": [],
  // Default 250, range 50 to 5000 milliseconds. A larger value wakes less often and delivers later.
  "inboxPollMs": 250,
  // Default 1000, range 100 to 60000 milliseconds. Use while a child works or blocks, or within 30 s of run or send.
  "pollIntervalMs": 1000,
  // Default 8000, range 100 to 60000 milliseconds. Use when every live child only waits for send. A larger value notices a dead pane later.
  "idlePollIntervalMs": 8000,
  // Tool text overrides. Each key defaults to unset, which keeps the built-in text shown below.
  "prompts": {
    // Replaces the built-in description.
    "description": "Run subagents and send them messages.",
    // The one-line entry in Available tools. Empty = keep the tool out of that list.
    "snippet": "",
    // Replaces the built-in guideline lines. Keep {{profiles}} to list the profiles.
    "guidelines": [
      "The parent handles user interaction, cross-task synthesis, and decisions; subagents execute.",
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

The file is strict JSON and the extension reads it once, so delete the comments and restart pi after a change. An unknown key, a wrong type or an unknown enum value stops the extension at load: pi prints `invalid config <path>: <field>: unknown key` and exits. A number outside its range clamps to the boundary.

## Usage

1. Start `pi` in a herdr pane.
2. Write a profile (next section). `run` takes the frontmatter `name` of the profile.
3. Ask the model to call the tool:

```json
{"action":"run","profile":"explore","task":"Read README.md and answer with its first heading."}
```

The call returns `{"state":"running",...}`. The subagent runs in its own tab. A `[subagent explore-1] done` message arrives later. Do not wait for the message in the same turn. Continue that child with:

```json
{"action":"send","name":"explore-1","message":"Also check the Windows branch."}
```

### Profile

Global profiles live in `<agent-dir>/pi-herdr-subagents-lite/profiles/*.md`. Project profiles live in `.pi/pi-herdr-subagents-lite/profiles/*.md` and load once the project is trusted. If a project profile and a global profile share a `name`, the project profile wins.

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

# Shut down and close the tab when settled. It waits while a prompt is open or the inbox has messages
auto-exit: true

# true = hidden from the guidelines; an explicit run still works
disable-model-invocation: false
---

You are a read-only explorer. Answer with file paths and line numbers.
```

Error codes: [contract section 2](docs/specs/0001-v1-contract.md#2-profile). Defaults: `src/profile/frontmatter.ts` and `test/profile/`. A file without `name` or with an invalid field stays out of the list. The extension rejects all duplicate names in one layer. `run` returns `profile_invalid` with the file, the field and the reason.

The extension ships a bundled example. The file name and the `name` of the example are both `worker`. Loading reads `profiles/*.md` only. On every load the extension makes `profiles/examples/` match the bundled examples: it rewrites the bundled files and deletes extra files. So copy the example one level up:

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

Thank you for the code.

## Docs

| Document | Content |
|---|---|
| [docs/specs/0001-v1-contract.md](docs/specs/0001-v1-contract.md) | The v1 contract |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module boundaries, dependency direction, test seams |
| [docs/modules/](docs/modules/) | Usage and trade-offs per module |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | The only source for terms |
| [CHANGELOG.md](CHANGELOG.md) | Release notes |

## License

MIT, see [LICENSE](LICENSE).
