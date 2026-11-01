import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Config } from "../config/index.ts";
import type { Profile } from "../profile/index.ts";
import { type RunService, type RunStarted, type SendResult, ToolError } from "../run/index.ts";
import { notInHerdr, toolFailed } from "./errors.ts";
import { parameters, type SubagentParameters } from "./schema.ts";
import { toolText } from "./text.ts";

export type SubagentTool = ToolDefinition<typeof parameters>;

interface ToolDeps {
  config: Config;
  profiles: Profile[];
  service: () => RunService;
}

function started(result: RunStarted) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    details: result,
    isError: false,
  };
}

function sent(result: SendResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    details: result,
    isError: false,
  };
}

export function createTool({ config, profiles, service }: ToolDeps) {
  return {
    name: config.toolName,
    label: "Subagent",
    ...toolText(config, profiles),
    parameters,
    async execute(_toolCallId: string, params: SubagentParameters) {
      if (process.env.HERDR_ENV !== "1") {
        return notInHerdr();
      }
      try {
        if (params.action === "run") {
          return started(await service().run(params.profile, params.task, params.cwd));
        }
        return sent(await service().send(params.name, params.message));
      } catch (error) {
        if (error instanceof ToolError) {
          return toolFailed(error);
        }
        throw error;
      }
    },
  };
}

export { type ResultMessage, sendResults } from "./message.ts";
