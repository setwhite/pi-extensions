import type { Config } from "../config/index.ts";

const DEFAULT_DESCRIPTION =
  "Run work in a background subagent pane. spawn starts one; steer talks to it; inspect reports state; stop ends it.";

const DEFAULT_GUIDELINES = [
  "spawn returns immediately; results arrive later as messages.",
  "Split only for long, noisy, or parallel domain work; keep batching in codemode and tight reasoning here.",
  "On needs_input, steer the answer directly if context decides it; otherwise ask the user, then steer it back.",
];

export function toolText(config: Config) {
  return {
    description: DEFAULT_DESCRIPTION,
    promptSnippet: "",
    promptGuidelines: DEFAULT_GUIDELINES.map((line) => `${config.toolName}: ${line}`),
  };
}
