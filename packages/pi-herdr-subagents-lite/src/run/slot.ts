import { ToolError } from "./errors.ts";
import type { RunState } from "./state.ts";

export function requireSlot(state: RunState): void {
  const active = state.active();
  if (active.length >= state.maxConcurrent) {
    throw new ToolError("max_concurrent", `at max concurrency; running: ${active.join(", ")}`);
  }
}
