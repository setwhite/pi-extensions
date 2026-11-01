# pi-herdr-subagents-lite

English | [简体中文](README.zh-CN.md)

A pi extension that runs subagents as separate pi processes in herdr panes. One tool, two actions: `run` starts a subagent, `send` continues it, results come back asynchronously.

Behavior is defined by the [v1 contract](docs/specs/0001-v1-contract.md). Project docs are in Chinese.

## Features

- **Separate process, human takeover**: each subagent is its own pi process in a herdr pane. Same cwd as the parent opens a tab in the same workspace, otherwise a new workspace. Switch into the pane and take over at any time.
- **Profile layers**: Markdown + frontmatter profiles, global and per project.
- **Async, merged results**: `run` returns at once. Each finished turn reports one `subagent_result` message; results inside `aggregateWindowMs` merge into one. Oversize results go to an artifact file.
- **Questions stay with the human**: a child prompt marks its pane `herdr:blocked` and nothing goes to the parent. The human answers in the child pane; no model relays the answer.
- **No nesting by default, no sandbox**: child tool sets drop this tool unless the profile names it. The profile picks tools; the extension does not restrict writes.

## Requirements

Tested with herdr `0.9.5` and pi `1.4.0`. Node `>= 22.19`. The parent must run inside a herdr pane, otherwise calls fail with `not_in_herdr`.

## Install

Pick one source, then restart pi.

```bash
pi install npm:pi-herdr-subagents-lite                     # npm
pi install git:github.com/setwhite/pi-herdr-subagents-lite # git
pi install /path/to/pi-herdr-subagents-lite                # local checkout
pi -e /path/to/pi-herdr-subagents-lite/src/index.ts        # this process only
```

Do not pass `-l`: it writes project settings only, so children started in another workspace never load the package and both the inbox pump and the bridge stop working. `pi -e` is single-process too.

Upgrade with `pi update --extensions`, remove with `pi remove <source>`. After a restart the tool list shows `subagent` (or your `toolName`).

## Quick start

1. Start `pi` in a herdr pane.
2. Write a profile (next section); `run` takes its frontmatter `name`.
3. Ask the model to call the tool:

```json
{"action":"run","profile":"explore","task":"Read README.md and answer with its first heading."}
```

It returns `{"state":"running",...}`, runs in its own tab, and a `[subagent explore-1] done` message arrives later. Do not wait for it in the same turn. Continue that child with:

```json
{"action":"send","name":"explore-1","message":"Also check the Windows branch."}
```

## Profile

Global profiles live in `<agent-dir>/pi-herdr-subagents-lite/profiles/*.md`, project profiles in `.pi/pi-herdr-subagents-lite/profiles/*.md` (read once the project is trusted); the project wins on the same `name`.

```markdown
---
# Key run takes; the file name is not used
name: explore
description: "Read-only research: read code, answer questions, change nothing"

# Omit to inherit from the parent
# model: provider/model
thinking: low

# Plain names = strict allowlist; +name / -name adjusts the default set, never mix both
# Omitted = pi defaults minus this tool (nesting off); "" = empty allowlist
tools: read, bash

# Omitted = pi discovery; "" = no skills; a list = only those
skills: ""

# append / replace: body is appended to or replaces the system prompt
# task: body is the task text, no identity file
system-prompt: append

# Shut down and close the tab when settled; waits while a prompt is open or the inbox has messages
auto-exit: true

# true = hidden from the guidelines; an explicit run still works
disable-model-invocation: false
---

You are a read-only explorer. Answer with file paths and line numbers.
```

Error codes: [contract section 2](docs/specs/0001-v1-contract.md#2-profile). Defaults: `src/profile/frontmatter.ts` and `test/profile/`. A file without `name`, or with an invalid field, stays out of the list; duplicate names in one layer are all rejected. `run` returns `profile_invalid` with the file, field and reason.

A bundled example ships with the extension; its file name and `name` are both `domain`. Loading reads `profiles/*.md` only and the example is written only when missing, so copy it one level up:

```bash
cd <agent-dir>/pi-herdr-subagents-lite/profiles && cp examples/domain.md domain.md
```

## Configuration

One global file: `<agent-dir>/pi-herdr-subagents-lite/config.json`. `<agent-dir>` defaults to `~/.pi/agent` and follows `PI_CODING_AGENT_DIR`. Project config is not read.

Defaults and clamp boundaries: `src/config/index.ts`, `test/config/config.test.ts`. Key meaning: [contract §1](docs/specs/0001-v1-contract.md#1-配置).

### Minimal config

A missing file means all defaults. To change one value, write only that value:

```json
{
  "maxConcurrent": 4
}
```

### Keys

| Key | Meaning |
|---|---|
| `enabled` | Gates tool registration only; the bridge has its own switch |
| `toolName` | Name the model sees; `^[a-z][a-z0-9_]{0,31}$` |
| `herdrBin` | herdr executable; a plain name resolves from PATH, an absolute path pins a version |
| `maxConcurrent` | Live children per parent session; an `auto-exit: false` child keeps its slot after settling |
| `maxResultChars` | Per-result character limit; beyond it the full text goes to an artifact and the message keeps a truncated head plus the path |
| `aggregateWindowMs` | Merge window in milliseconds; 0 = deliver each result at once |
| `closeChildrenOn` | Parent shutdown reasons that close its child tabs: `new` / `resume` / `fork` / `quit` / `reload`; empty = never |
| `inboxPollMs` | Child inbox polling interval |
| `pollIntervalMs` | Parent `agent list` interval while a child is working or blocked, or within 30 s of `run` / `send` |
| `idlePollIntervalMs` | Parent interval when every live child only waits for `send`; it bounds how late a vanished pane is noticed (a killed child whose pane lives is fixed at 10 s) |
| `prompts` | Tool text overrides: `description`, `snippet`, `guidelines`; omitted keys keep the built-in text; `snippet: ""` hides the tool from Available tools; keep `{{profiles}}` to list profiles |
| `bridge` | `enabled` turns pi prompt events into `herdr:blocked`; `blockedOn` lists the prompt kinds that count as blocked |

Strict JSON: an unknown key, a wrong type or a bad enum makes the extension fail to load, and pi exits naming the field. Out-of-range numbers clamp to the boundary. The config is read once, so restart pi after editing.

## Reference projects

The design is based on these projects. Thank you.

| Project | Borrowed |
|---|---|
| [earendil-works/pi](https://github.com/earendil-works/pi) | Extension API, package layout, official examples |
| [fyang93/pi-herdr-subagents](https://github.com/fyang93/pi-herdr-subagents) | Profile field shapes; integration tests on an isolated herdr session |
| [modem-dev/pi-herdr-subagents](https://github.com/modem-dev/pi-herdr-subagents) | herdr launch and lifecycle; derived end states |
| [purboo/pi-durable-subagents](https://github.com/purboo/pi-durable-subagents) | Async delivery, idempotency, report-once results |

## Docs

- [ARCHITECTURE](docs/ARCHITECTURE.md): module boundaries, dependency direction, test seams
- [GLOSSARY](docs/GLOSSARY.md): the only source for terms
- [Modules](docs/modules/): usage and trade-offs per module

## Development

```bash
pnpm install        # dependencies
pnpm check          # the four checks below
pnpm test           # unit tests (vitest)
pnpm lint           # biome
pnpm typecheck      # tsc --noEmit
pnpm check:imports  # dependency direction, per docs/ARCHITECTURE.md
pnpm test:e2e       # real herdr plus real pi children, not part of pnpm check
```

Run `git config core.hooksPath .githooks` once to run `pnpm check` on every commit.

E2E starts an isolated herdr session and agent directory, and skips the suite with a reason when herdr, pi or `auth.json` is missing. `PI_E2E_MODEL` picks another model; `PI_E2E_KEEP=1` keeps the temp directories.

## License

MIT, see [LICENSE](LICENSE).
