import type { Config, ShutdownReason } from "../config/index.ts";
import { hasInbox } from "../inbox/index.ts";
import type { RunService } from "../run/index.ts";
import type { ExitReceiptWriter } from "../session-file/index.ts";
import type { ExtensionRegistrar, SessionContext } from "./index.ts";

export type ShutdownHandler = (
  event: { type: "session_shutdown"; reason: ShutdownReason },
  ctx: SessionContext,
) => void | Promise<void>;

export interface ShutdownDeps {
  config: Config;
  writeExitReceipt: ExitReceiptWriter;
  stopInbox(): void;
  takeService(): RunService | undefined;
}

export function watchShutdown(pi: ExtensionRegistrar, deps: ShutdownDeps): void {
  pi.on("session_shutdown", async (event, ctx) => {
    deps.stopInbox();
    const closing = deps.takeService();
    const sessionFile = ctx.sessionManager.getSessionFile();
    if (sessionFile && hasInbox(sessionFile)) {
      deps.writeExitReceipt(sessionFile, event.reason);
    }
    if (closing && deps.config.closeChildrenOn.includes(event.reason)) {
      const { kept, failed } = await closing.closeChildren();
      for (const name of kept) {
        ctx.ui.notify(`child "${name}" kept running: its tab has more than one pane`, "warning");
      }
      for (const failure of failed) {
        ctx.ui.notify(`could not close child "${failure.name}": ${failure.reason}`, "error");
      }
    } else {
      closing?.shutdown();
    }
  });
}
