import { inboxCount } from "../inbox/index.ts";
import { AUTO_EXIT_ENV } from "../run/index.ts";
import type { ExtensionRegistrar } from "./index.ts";

export function watchAutoExit(pi: ExtensionRegistrar): { reset(): void } {
  let openPrompts = 0;
  let exiting = false;

  pi.on("ui_prompt_start", () => {
    openPrompts += 1;
  });

  pi.on("ui_prompt_end", () => {
    openPrompts = Math.max(0, openPrompts - 1);
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (exiting || process.env[AUTO_EXIT_ENV] !== "1" || openPrompts > 0) {
      return;
    }
    const sessionFile = ctx.sessionManager.getSessionFile();
    if (!sessionFile || inboxCount(sessionFile) > 0) {
      return;
    }
    exiting = true;
    ctx.shutdown();
  });

  return {
    reset() {
      openPrompts = 0;
      exiting = false;
    },
  };
}
