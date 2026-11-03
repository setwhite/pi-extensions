import type { ExitReceipt } from "../session-file/index.ts";
import { closeRunPane, shouldClose } from "./close.ts";
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

// 文本相同也要看字节数：另一个回合可能写出逐字相同的答案。
function newTail(run: RunRecord, text: string, size: number): boolean {
  return text !== run.lastDeliveredText || size !== run.lastDeliveredSize;
}

function markDelivered(run: RunRecord, text: string, size: number): void {
  run.lastDeliveredText = text;
  run.lastDeliveredSize = size;
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
    if (!newTail(run, snapshot.text, snapshot.size)) {
      return;
    }
    markDelivered(run, snapshot.text, snapshot.size);
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
    if (newTail(run, text, tail.size)) {
      markDelivered(run, text, tail.size);
      await finish(state, run, await doneResult(run, text, state.maxResultChars));
      return;
    }
  } else if (run.lastDeliveredText === null) {
    await finish(state, run, unknownResult(run, receipt === null ? "pane_exited" : "quitted"));
    return;
  }
  await closeAfterExit(state, run);
  state.settle(run);
}

// 投递过结果不代表 pane 关掉了：子代理死亡是最后一次补关机会。
async function closeAfterExit(state: RunState, run: RunRecord): Promise<void> {
  if (!run.autoExit || run.pane === undefined || run.paneClosed) {
    return;
  }
  try {
    await closeRunPane(state, run);
  } catch {
    await state.results?.push(unknownResult(run, "close_failed"));
  }
}

async function finish(state: RunState, run: RunRecord, result: RunResult): Promise<void> {
  await state.results?.push(result);
  if (shouldClose(run, result)) {
    try {
      await closeRunPane(state, run);
    } catch {
      // 关不掉不算结算：保留 live，子代理死亡时再试一次（DEC-0060）。
      await state.results?.push(unknownResult(run, "close_failed"));
      return;
    }
    state.settle(run);
    return;
  }
  if (result.state !== "done") {
    state.settle(run);
  }
}
