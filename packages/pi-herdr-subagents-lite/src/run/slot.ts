import { ToolError } from "./errors.ts";
import type { RunState } from "./state.ts";

// excludeName 是发起重启的 run 自己：它已进入 starting，不能再挡住自己。
export function requireSlot(state: RunState, excludeName?: string): void {
  const active = excludeName === undefined ? state.active() : state.active().filter((name) => name !== excludeName);
  if (active.length >= state.maxConcurrent) {
    throw new ToolError("max_concurrent", `at max concurrency; running: ${active.join(", ")}`);
  }
}
