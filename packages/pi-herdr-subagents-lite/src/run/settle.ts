import { enqueue } from "./batch.ts";
import { closePaneOf } from "./pane.ts";
import { buildEnvelope, type ChildResult } from "./result.ts";
import type { RunStatus } from "./rules.ts";
import { clearGrace, type RunRecord, type RunState } from "./state.ts";

export type SettleStatus = Extract<RunStatus, "done" | "needs_input">;

export async function settleRun(
  state: RunState,
  record: RunRecord,
  status: SettleStatus,
  result: ChildResult,
): Promise<void> {
  record.status = status;
  clearGrace(record);
  if (status === "done") {
    await closePaneOf(state, record);
  }
  enqueue(state, buildEnvelope(record, result, state.summaryMaxChars));
}

export async function failRun(state: RunState, record: RunRecord, message: string): Promise<void> {
  if (record.status === "cancelled") {
    return;
  }
  record.status = "failed";
  clearGrace(record);
  state.onProblem(`${record.id}: ${message}`);
  const envelope = buildEnvelope(record, undefined, state.summaryMaxChars);
  envelope.summary = message;
  enqueue(state, envelope);
}

/** 子 pane 卡在审批或提问界面：不盲发按键，直接上报，等人去那个 pane 处理。 */
export function blockedRun(state: RunState, record: RunRecord): void {
  record.status = "needs_input";
  const envelope = buildEnvelope(record, undefined, state.summaryMaxChars);
  envelope.summary = "the child is blocked in its pane; answer it there, then steer it again";
  enqueue(state, envelope);
}
