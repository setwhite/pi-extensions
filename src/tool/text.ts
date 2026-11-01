import type { Config } from "../config/index.ts";
import type { Profile } from "../profile/index.ts";
import { profileLabel } from "../run/index.ts";

const DEFAULT_DESCRIPTION = "Run subagents and send them messages.";
const DEFAULT_SNIPPET = "";
const DEFAULT_GUIDELINES = [
  "The parent handles user interaction, cross-task synthesis, and decisions; subagents execute.",
  "run only starts; it does not wait. The result arrives later as a message.",
  "send only delivers; no state tracking.",
  "Available profiles:\n{{profiles}}",
];

export function toolText(config: Config, profiles: Profile[]) {
  const visible = profiles.filter((profile) => !profile.disableModelInvocation);
  const profileLines = visible.length === 0 ? "none" : visible.map(profileLabel).join("\n");
  return {
    description: config.prompts.description ?? DEFAULT_DESCRIPTION,
    promptSnippet: config.prompts.snippet ?? DEFAULT_SNIPPET,
    promptGuidelines: (config.prompts.guidelines ?? DEFAULT_GUIDELINES).map(
      (line) => `${config.toolName}: ${line.replaceAll("{{profiles}}", profileLines)}`,
    ),
  };
}
