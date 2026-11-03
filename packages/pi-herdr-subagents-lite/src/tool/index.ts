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

// content 进模型上下文，只放模型能用的字段。details 只给 UI 和 session 条目。
function envelope(result: RunStarted | SendResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ state: result.state, name: result.name }) }],
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
          return envelope(await service().run(params.profile, params.task, params.cwd));
        }
        return envelope(await service().send(params.name, params.message));
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
