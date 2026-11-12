import type { Config, ShutdownReason } from "../config/index.ts";
import { errorText } from "../error/index.ts";
import { hasInbox } from "../inbox/index.ts";
import { type RunService, runBaseOf } from "../run/index.ts";
import { nextTurn, writeTurn } from "../turn/index.ts";
import type { ExtensionRegistrar, SessionContext } from "./index.ts";

export type ShutdownHandler = (
  event: { type: "session_shutdown"; reason: ShutdownReason },
  ctx: SessionContext,
) => void | Promise<void>;

export interface ShutdownDeps {
  config: Config;
  stopInbox(): void;
  takeService(): RunService | undefined;
}

export function watchShutdown(pi: ExtensionRegistrar, deps: ShutdownDeps): void {
  pi.on("session_shutdown", async (event, ctx) => {
    deps.stopInbox();
    const closing = deps.takeService();
    const sessionFile = ctx.sessionManager.getSessionFile();
    const base = sessionFile === undefined ? undefined : runBaseOf(sessionFile);
    if (base !== undefined && event.reason === "quit" && hasInbox(base)) {
      try {
        writeTurn(base, {
          turn: nextTurn(base),
          outcome: "quit",
          stopReason: "quit",
          children: 0,
          at: Date.now(),
        });
      } catch (error) {
        ctx.ui.notify(`subagent exit not reported: ${errorText(error)}`, "error");
      }
    }
    if (closing && deps.config.closeChildrenOn.includes(event.reason)) {
      const { failed } = await closing.closeChildren();
      for (const failure of failed) {
        ctx.ui.notify(`could not close child "${failure.name}": ${failure.reason}`, "error");
      }
    } else {
      closing?.shutdown();
    }
  });
}
