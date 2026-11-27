import type { RequestInputTool, SubagentTool } from "../tool/index.ts";

/** 只声明用到的扩展面：事件参数保持结构化最小集，便于 pi 的事件类型赋值进来。 */
export interface SessionContext {
  ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
}

export type SessionStartHandler = (event: { type: "session_start" }, ctx: SessionContext) => unknown;

export type TurnEndHandler = (
  event: {
    type: "turn_end";
    message: unknown;
    toolResults?: ReadonlyArray<{ toolName?: string }>;
  },
  ctx: SessionContext,
) => unknown;

export type ShutdownHandler = (event: { type: "session_shutdown"; reason: string }, ctx: SessionContext) => unknown;

export interface AgentMessage {
  customType: string;
  content: string;
  display: boolean;
}

export interface SendOptions {
  triggerTurn?: boolean;
  deliverAs?: "steer" | "followUp" | "nextTurn";
}

export interface ExtensionRegistrar {
  on(event: "session_start", handler: SessionStartHandler): void;
  on(event: "session_shutdown", handler: ShutdownHandler): void;
  on(event: "turn_end", handler: TurnEndHandler): void;
  registerTool(tool: SubagentTool): void;
  registerTool(tool: RequestInputTool): void;
  sendMessage(message: AgentMessage, options?: SendOptions): void;
}
