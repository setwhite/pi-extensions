import { errorText } from "../error/index.ts";
import { HerdrHostError } from "../herdr/index.ts";

export class ToolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

export function spawnFailed(error: unknown, paneId: string | undefined, created = true): ToolError {
  const detail = errorText(error);
  const createdNote = created && paneId ? `. A pane was created: ${paneId}.` : "";
  const started = error instanceof HerdrHostError && error.code === "agent_not_ready";
  const stalled = error instanceof HerdrHostError && error.code === "timeout";
  const trust = started
    ? " It is probably waiting for a trust dialog. Answer the dialog, then retry."
    : stalled
      ? " The pane never became idle. Check the tab for a dialog, then retry."
      : "";
  return new ToolError("spawn_failed", `${detail}${createdNote}${trust}`);
}
