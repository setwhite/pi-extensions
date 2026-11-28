import { enqueue } from "./batch.ts";
import { closePaneOf } from "./pane.ts";
import { buildEnvelope, type ChildResult } from "./result.ts";
import type { RunStatus } from "./rules.ts";
import { clearInterrupt, type RunRecord, type RunState } from "./state.ts";

export type SettleStatus = Extract<RunStatus, "done" | "needs_input">;

export async function settleRun(
  state: RunState,
  record: RunRecord,
  status: SettleStatus,
  result: ChildResult,
): Promise<void> {
  record.status = status;
  clearInterrupt(record);
  // 先按当前状态拍下信封：关 pane 是异步的，期间 steer 可能已把状态改成 running。
  const envelope = buildEnvelope(record, result, state.summaryMaxChars);
  if (status === "done") {
    await closePaneOf(state, record);
  }
  enqueue(state, envelope);
}

export async function failRun(state: RunState, record: RunRecord, message: string): Promise<void> {
  if (record.status === "cancelled") {
    return;
  }
  record.status = "failed";
  clearInterrupt(record);
  state.onProblem(`${record.id}: ${message}`);
  const envelope = buildEnvelope(record, undefined, state.summaryMaxChars);
  envelope.summary = message;
  enqueue(state, envelope);
}

/** 子 pane 卡在审批或提问界面：不盲发按键，直接上报，等人去那个 pane 处理。 */
export function blockedRun(state: RunState, record: RunRecord): void {
  record.status = "needs_input";
  clearInterrupt(record);
  const envelope = buildEnvelope(record, undefined, state.summaryMaxChars);
  envelope.summary = "the child is blocked in its pane; answer it there, then steer it again";
  enqueue(state, envelope);
}
