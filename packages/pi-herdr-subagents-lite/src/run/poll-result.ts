import type { ExitReceipt } from "../session-file/index.ts";
import { closeTab, shouldClose } from "./close.ts";
import type { RunResult } from "./result.ts";
import { doneResult, unknownResult } from "./result.ts";
import type { RunRecord, RunState } from "./state.ts";

const POLL_FAILURE_LIMIT = 3;
const READ_ATTEMPTS = 3;
const READ_RETRY_DELAY_MS = 200;

export async function recordFailure(state: RunState, run: RunRecord): Promise<void> {
  if (!run.live) {
    return;
  }
  run.pollFailures += 1;
  if (run.pollFailures >= POLL_FAILURE_LIMIT) {
    await finish(state, run, unknownResult(run, "poll_failed"));
  }
}

export async function readResult(state: RunState, run: RunRecord, seq: number, attempt: number): Promise<void> {
  run.read = undefined;
  if (!run.live) {
    return;
  }

  const snapshot = state.readLastAssistant(run.sessionFile);
  if (snapshot.pendingToolCall || snapshot.empty) {
    return;
  }
  if (snapshot.text !== null) {
    run.lastHandledSeq = seq;
    if (snapshot.text === run.lastDeliveredText) {
      return;
    }
    run.lastDeliveredText = snapshot.text;
    await finish(state, run, await doneResult(run, snapshot.text, state.maxResultChars));
    return;
  }

  if (attempt >= READ_ATTEMPTS) {
    run.lastHandledSeq = seq;
    if (run.lastDeliveredText === null) {
      await finish(state, run, unknownResult(run, "no_result"));
    }
    return;
  }

  run.read = { seq, attempt, at: state.now() + READ_RETRY_DELAY_MS };
}

export async function exited(state: RunState, run: RunRecord, receipt: ExitReceipt | null): Promise<void> {
  if (!run.live) {
    return;
  }
  const tail = state.readLastAssistant(run.sessionFile);
  const text = tail.pendingToolCall ? null : tail.text;
  if (text !== null) {
    if (text !== run.lastDeliveredText) {
      run.lastDeliveredText = text;
      await finish(state, run, await doneResult(run, text, state.maxResultChars));
    }
  } else if (run.lastDeliveredText === null) {
    const reason = receipt === null ? "pane_exited" : "quitted";
    await finish(state, run, unknownResult(run, reason));
  }
  state.settle(run);
}

async function finish(state: RunState, run: RunRecord, result: RunResult): Promise<void> {
  await state.results?.push(result);
  if (shouldClose(run, result)) {
    try {
      await closeTab(state, run);
    } catch {
      await state.results?.push(unknownResult(run, "close_failed"));
    }
    state.settle(run);
    return;
  }
  if (result.state !== "done") {
    state.settle(run);
  }
}
