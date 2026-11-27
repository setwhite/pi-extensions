import { errorText, ToolError } from "./errors.ts";
import { closePaneOf } from "./pane.ts";
import { clearGrace, type RunState } from "./state.ts";
import type { SteerResult } from "./steer.ts";

export interface CloseChildrenResult {
  failed: Array<{ id: string; reason: string }>;
}

export async function stop(state: RunState, id: string): Promise<SteerResult> {
  const record = state.runs.get(id);
  if (record === undefined) {
    throw new ToolError("unknown_id", `no run named "${id}" in this session`);
  }
  if (record.status === "cancelled") {
    return { id, status: "cancelled" };
  }
  record.status = "cancelled";
  record.pendingSteer = undefined;
  record.generation += 1;
  clearGrace(record);
  await closePaneOf(state, record);
  return { id, status: "cancelled" };
}

/** 父会话收尾：批量关掉所有还开着的子 pane。 */
export async function closeChildren(state: RunState): Promise<CloseChildrenResult> {
  const failed: CloseChildrenResult["failed"] = [];
  for (const record of state.runs.values()) {
    const paneId = record.paneId;
    if (paneId === undefined) {
      continue;
    }
    record.paneId = undefined;
    record.status = "cancelled";
    record.generation += 1;
    clearGrace(record);
    try {
      await state.client.closePane(paneId);
    } catch (error) {
      failed.push({ id: record.id, reason: errorText(error) });
    }
  }
  return { failed };
}
