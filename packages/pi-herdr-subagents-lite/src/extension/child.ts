import type { Config } from "../config/index.ts";
import { errorText, writeChildResult } from "../run/index.ts";
import { createRequestInputTool } from "../tool/index.ts";
import type { ExtensionRegistrar } from "./types.ts";

export interface ChildDeps {
  runDir: string | undefined;
  loadConfig(): Config;
}

export function textOf(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    const record = block as { type?: unknown; text?: unknown };
    if (record.type === "text" && typeof record.text === "string") {
      parts.push(record.text);
    }
  }
  return parts.join("\n").trim();
}

/** 子代理侧：只注册极简提问工具，并在每个回合结束同步落盘。 */
export function registerChild(pi: ExtensionRegistrar, deps: ChildDeps): void {
  const runDir = deps.runDir;
  if (runDir === undefined || runDir === "") {
    return;
  }
  const config = deps.loadConfig();
  pi.registerTool(createRequestInputTool({ runDir, summaryMaxChars: config.summaryMaxChars }));

  pi.on("turn_end", async (event, ctx) => {
    try {
      await writeChildResult(runDir, {
        state: "turn_end",
        text: textOf(event.message),
        limit: config.summaryMaxChars,
      });
    } catch (error) {
      ctx.ui.notify(`subagent result not written: ${errorText(error)}`, "error");
    }
  });
}
