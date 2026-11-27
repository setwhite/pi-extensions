import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Config } from "../config/index.ts";
import { type RunService, ToolError } from "../run/index.ts";
import { parameters, type SubagentParameters } from "./schema.ts";
import { toolText } from "./text.ts";

export type SubagentTool = ToolDefinition<typeof parameters>;
export type { RequestInputParameters, RequestInputTool } from "./input.ts";
export { createRequestInputTool, inputParameters, REQUEST_INPUT_TOOL } from "./input.ts";

function ok(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    details: payload,
    isError: false,
  };
}

function failed(code: string, message: string) {
  return {
    content: [{ type: "text" as const, text: `${code}: ${message}` }],
    details: { code },
    isError: true,
  };
}

export interface SubagentToolDeps {
  config: Config;
  service: () => RunService;
}

export function createSubagentTool({ config, service }: SubagentToolDeps) {
  return {
    name: config.toolName,
    label: "Subagent",
    ...toolText(config),
    parameters,
    async execute(_toolCallId: string, params: SubagentParameters) {
      if (process.env.HERDR_ENV !== "1") {
        return failed("not_in_herdr", "run pi inside a herdr pane; there is no fallback");
      }
      try {
        const runs = service();
        switch (params.action) {
          case "spawn":
            return ok(await runs.spawn(params));
          case "steer":
            return ok(await runs.steer(params.id, params.message));
          case "stop":
            return ok(await runs.stop(params.id));
          case "inspect":
            return ok(runs.inspect(params.id));
        }
      } catch (error) {
        if (error instanceof ToolError) {
          return failed(error.code, error.message);
        }
        throw error;
      }
    },
  };
}
