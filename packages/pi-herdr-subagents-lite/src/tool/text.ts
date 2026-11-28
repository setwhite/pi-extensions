import type { Config } from "../config/index.ts";

const DEFAULT_DESCRIPTION = "Run and manage background subagents.";

const DEFAULT_GUIDELINES = [
  "spawn is async; do not repeat the work or poll.",
  "Split only for long, noisy, or parallel domain work; keep batching in codemode and tight reasoning here.",
  "On needs_input, steer the answer if known; else ask the user and steer it back.",
];

/** spawn 成功即交接；这句只出现在这一次结果里，占的上下文最小。 */
export const SPAWN_NOTE = "Dispatched. Do not duplicate; end turn or continue other work.";

export function toolText(config: Config) {
  return {
    description: DEFAULT_DESCRIPTION,
    promptSnippet: "",
    promptGuidelines: DEFAULT_GUIDELINES.map((line) => `${config.toolName}: ${line}`),
  };
}
