import type { Config } from "../config/index.ts";

const DEFAULT_DESCRIPTION =
  "Run work in a background subagent pane. spawn starts one; steer talks to it; inspect reports state; stop ends it.";

const DEFAULT_GUIDELINES = [
  "spawn returns immediately; the result arrives later as a message.",
  "Split only at hard ceilings: tool batching goes to codemode, tight reasoning stays here.",
  "Give each child one domain context.",
  "Use worktree: true when a child may write to the same repository.",
  "steer on a running child interrupts its current turn; the reply is applied next.",
  "inspect answers progress questions; no state is injected into context.",
  "needs_input: steer the answer back when the context decides it; when a human must decide, ask the user, then steer that answer into that child.",
];

export function toolText(config: Config) {
  return {
    description: DEFAULT_DESCRIPTION,
    promptSnippet: "",
    promptGuidelines: DEFAULT_GUIDELINES.map((line) => `${config.toolName}: ${line}`),
  };
}
