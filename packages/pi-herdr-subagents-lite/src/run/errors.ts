import { HerdrError } from "../herdr/index.ts";

export class ToolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

/** 传输层错误带 herdr 错误码：父代理看到 `agent_not_found: ...` 才知道是 pane 没了。 */
export function errorText(error: unknown): string {
  if (error instanceof HerdrError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
