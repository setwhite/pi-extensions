import type { Config } from "../config/index.ts";

const DEFAULT_DESCRIPTION = "Run and manage background subagents.";

const DEFAULT_GUIDELINES = [
  "spawn is async; wait for the result message instead of polling.",
  "Split only for long, noisy, or parallel domain work; keep batching in codemode and tight reasoning here.",
  "On needs_input, steer the answer if known; else ask the user and steer it back.",
];

export function toolText(config: Config) {
  return {
    description: DEFAULT_DESCRIPTION,
    promptSnippet: "",
    promptGuidelines: DEFAULT_GUIDELINES.map((line) => `${config.toolName}: ${line}`),
  };
}
