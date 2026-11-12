import { errorText } from "../error/index.ts";
import { removeTurn, type Turn } from "../turn/index.ts";
import { closeRunPane, shouldClose } from "./close.ts";
import { makeResult } from "./result.ts";
import type { RunRecord, RunState } from "./state.ts";

const DELIVERY_ATTEMPTS = 3;

// 一个回合只走这一条收尾路径：投递、删除、决定关闭。
export async function settleTurn(state: RunState, run: RunRecord, file: string, turn: Turn): Promise<void> {
  if (run.phase === "closed") {
    removeTurn(file);
    return;
  }
  if (turn.turn <= run.lastTurn) {
    removeTurn(file);
    return;
  }
  const result = await makeResult(
    run,
    { state: turn.outcome, text: turn.text, errorMessage: turn.errorMessage },
    state.maxResultChars,
  );
  const delivered = (await state.results?.push(result)) ?? false;
  if (!delivered) {
    run.deliveryFailures += 1;
    if (run.deliveryFailures < DELIVERY_ATTEMPTS) {
      return;
    }
  }
  run.deliveryFailures = 0;
  run.lastTurn = turn.turn;
  removeTurn(file);
  await afterTurn(state, run, turn);
}

// 回合结束不删记录：pane 关了也要留着 sessionFile，send 才能续。
async function afterTurn(state: RunState, run: RunRecord, turn: Turn): Promise<void> {
  if (shouldClose(state, run, turn)) {
    await closeOrReport(state, run);
  }
  run.phase = "idle";
}

async function closeOrReport(state: RunState, run: RunRecord): Promise<void> {
  try {
    await closeRunPane(state, run);
  } catch (error) {
    state.onProblem(`could not close the pane for "${run.name}": ${errorText(error)}`);
  }
}

// 没有回合事件、agent 又连续缺席：不猜结果，报 lost。记录留着，send 可以续。
export async function settleLost(state: RunState, run: RunRecord): Promise<void> {
  const result = await makeResult(run, { state: "lost" }, state.maxResultChars);
  await state.results?.push(result);
  run.phase = "dead";
  if (run.pane !== undefined && !run.paneClosed) {
    try {
      await closeRunPane(state, run);
    } catch (error) {
      state.onProblem(`could not close the pane for "${run.name}": ${errorText(error)}`);
    }
  }
}
