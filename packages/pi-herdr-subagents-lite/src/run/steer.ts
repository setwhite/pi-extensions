import { clearChildQuestions } from "./child-result.ts";
import { errorText, ToolError } from "./errors.ts";
import { armInterrupt } from "./interrupt.ts";
import { ensurePane, promptWhenReady } from "./pane.ts";
import type { RunStatus } from "./rules.ts";
import { clearInterrupt, type RunState, slottedCount, targetOf } from "./state.ts";
import { watch } from "./watch.ts";

export interface SteerResult {
  id: string;
  status: RunStatus;
}

export async function steer(state: RunState, id: string, message: string): Promise<SteerResult> {
  const record = state.runs.get(id);
  if (record === undefined) {
    throw new ToolError("unknown_id", `no run named "${id}" in this session`);
  }
  if (record.status === "starting") {
    throw new ToolError("not_ready", `"${id}" is still starting; retry in a moment`);
  }
  if (record.status === "cancelled") {
    throw new ToolError("cancelled", `"${id}" was stopped; spawn a new run instead`);
  }
  if (record.status === "running") {
    await armInterrupt(state, record, message);
    return { id, status: "interrupting" };
  }
  if (record.status === "interrupting") {
    // 只保留最新一条，等 idle 后投递。
    record.pendingSteer = message;
    // 已有的长等已经带着截止时刻，只换消息，不重开等待。
    record.interruptDeadline ??= state.now() + state.interruptGraceMs;
    return { id, status: "interrupting" };
  }
  if (slottedCount(state.runs.values()) >= state.maxConcurrent) {
    throw new ToolError("max_concurrent", `${state.maxConcurrent} runs are already active; stop one first`);
  }
  record.pendingSteer = undefined;
  clearInterrupt(record);
  try {
    // 回答之后子侧的 turn_end 必须能写回 turn_end：先撤掉待答标记。
    await clearChildQuestions(record.runDir);
    await ensurePane(state, record);
    await promptWhenReady(state, targetOf(record), message);
  } catch (error) {
    record.status = "failed";
    throw new ToolError("steer_failed", errorText(error));
  }
  record.status = "running";
  record.generation += 1;
  watch(state, record);
  return { id, status: "running" };
}
