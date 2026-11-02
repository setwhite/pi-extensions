export const EXAMPLE_PROFILE_FILE = "worker.md";

export const EXAMPLE_PROFILE = `---
# Copy this file to profiles/worker.md to use it.
name: worker
description: General purpose.
# model: provider/model
# thinking: low
tools: -subagent
# skills: []
system-prompt: append
auto-exit: true
disable-model-invocation: false
---
- Stop when the task needs a design decision. Report what you need; the parent answers. Do not guess.
- Report concisely what changed, what is left, and what blocks you.
`;
