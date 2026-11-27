import type { Config } from "../config/index.ts";

const DEFAULT_DESCRIPTION =
  "Run work in a background subagent pane. spawn starts one; steer talks to it; inspect reports state; stop ends it.";
const DEFAULT_SNIPPET = "spawn|steer|inspect|stop a background subagent";

const DEFAULT_GUIDELINES = [
  "spawn returns immediately; the result arrives later as a message.",
  "Split only at hard ceilings: tool batching goes to codemode, tight reasoning stays here.",
  "Give each child one domain context. Never nest: children cannot spawn children.",
  "Use worktree: true when a child may write to the same repository.",
  "steer on a running child interrupts its current turn; the reply is applied next.",
  "inspect answers progress questions; no state is injected into context.",
];

export function toolText(config: Config) {
  return {
    description: DEFAULT_DESCRIPTION,
    promptSnippet: DEFAULT_SNIPPET,
    promptGuidelines: DEFAULT_GUIDELINES.map((line) => `${config.toolName}: ${line}`),
  };
}
