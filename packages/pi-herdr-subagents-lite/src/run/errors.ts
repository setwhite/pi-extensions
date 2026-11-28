import { HerdrError } from "../herdr/index.ts";

export class ToolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

/** 上游原文里的 pane id 与本机路径一律抹掉：code 已经够模型判断，句柄只留给本包（DEC-0074）。 */
const PANE_ID = /\b[a-z]\d+:p\d+\b/gi;
const LOCAL_PATH = /(?<![\w:])(?:[A-Za-z]:[\\/]|\/)[^\s"',;)]*/g;

function withoutHandles(message: string): string {
  return message.replace(PANE_ID, "<pane>").replace(LOCAL_PATH, "<path>");
}

/** 传输层错误带 herdr 错误码：父代理看到 `agent_not_found: ...` 才知道是 pane 没了。 */
export function errorText(error: unknown): string {
  if (error instanceof HerdrError) {
    return `${error.code}: ${withoutHandles(error.message)}`;
  }
  return withoutHandles(error instanceof Error ? error.message : String(error));
}
