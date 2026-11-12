import { errorText } from "../error/index.ts";
import { hasInbox } from "../inbox/index.ts";
import { runBaseOf } from "../run/index.ts";
import { classifyTurn, lastTurnOf, nextTurn, writeTurn } from "../turn/index.ts";
import type { ExtensionRegistrar } from "./index.ts";

export interface ReportDeps {
  activeChildren: () => number;
}

// 子代理唯一的结果出口：每个结束的回合写一个回合事件。
export function watchReport(pi: ExtensionRegistrar, deps: ReportDeps): void {
  pi.on("agent_settled", (event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    if (sessionFile === undefined) {
      return;
    }
    const base = runBaseOf(sessionFile);
    if (!hasInbox(base)) {
      return;
    }
    try {
      const slice = lastTurnOf(ctx.sessionManager.getBranch());
      const verdict = classifyTurn({
        stopReason: slice.stopReason,
        pendingToolCall: slice.pendingToolCall,
        aborted: event.aborted || !slice.found,
        errorMessage: slice.errorMessage,
      });
      writeTurn(base, {
        turn: nextTurn(base),
        outcome: verdict.outcome,
        stopReason: slice.stopReason ?? "",
        ...(verdict.errorMessage === undefined ? {} : { errorMessage: verdict.errorMessage }),
        ...(slice.text === null ? {} : { text: slice.text }),
        children: deps.activeChildren(),
        at: Date.now(),
      });
    } catch (error) {
      ctx.ui.notify(`subagent turn not reported: ${errorText(error)}`, "error");
    }
  });
}
