export const EXAMPLE_PROFILE_FILE = "domain.md";

export const EXAMPLE_PROFILE = `---
# Copy this file to profiles/domain.md to use it.
name: domain
description: Use when the task covers another domain.
# model: provider/model
# thinking: low
tools: -subagent
skills: []
system-prompt: append
auto-exit: false
disable-model-invocation: false
---
Work on one domain per task.

- Change only files in that domain.
- Read the code yourself. Do not ask the parent for context.
- Report what changed, what is left, and what blocks you.
- Stop if only the user can decide. Report the question.
`;
