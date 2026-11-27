import type { Envelope } from "./result.ts";
import type { RunState } from "./state.ts";

/** 多个子代理同一窗口内的结算合并成一条投递，避免打断主代理节奏。 */
export function enqueue(state: RunState, envelope: Envelope): void {
  state.pending.push(envelope);
  if (state.batchTimer !== undefined) {
    return;
  }
  state.batchTimer = setTimeout(() => flushBatch(state), state.aggregateWindowMs);
  state.batchTimer.unref?.();
}

export function flushBatch(state: RunState): void {
  if (state.batchTimer !== undefined) {
    clearTimeout(state.batchTimer);
    state.batchTimer = undefined;
  }
  const batch = state.pending;
  state.pending = [];
  if (batch.length > 0) {
    state.onBatch?.(batch);
  }
}
