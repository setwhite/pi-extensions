import { errorText } from "../error/index.ts";
import { HerdrHostError } from "../herdr/index.ts";
import type { Turn } from "../turn/index.ts";
import type { RunRecord, RunState } from "./state.ts";

const CLOSE_ATTEMPTS = 3;
const CLOSE_RETRY_MS = 250;

// 关闭判据只看回合结果与子代理是否还有自己的子代理。
export function shouldClose(state: RunState, run: RunRecord, turn: Turn): boolean {
  if (run.pane === undefined || run.paneClosed) {
    return false;
  }
  if (turn.outcome === "done") {
    return run.autoExit && turn.children === 0;
  }
  if (turn.outcome === "quit") {
    return true;
  }
  return state.closeOnFailure;
}

// 只关自己记下的 pane。pane 已经不在了也算关掉。
export async function closeRunPane(state: RunState, run: RunRecord): Promise<void> {
  const pane = run.pane;
  if (pane === undefined || run.paneClosed) {
    return;
  }
  for (let attempt = 1; ; attempt += 1) {
    try {
      await state.host.closePane(pane.paneId);
      run.paneClosed = true;
      return;
    } catch (error) {
      if (error instanceof HerdrHostError && error.code === "pane_not_found") {
        run.paneClosed = true;
        return;
      }
      if (attempt >= CLOSE_ATTEMPTS) {
        throw error;
      }
      await state.delay(CLOSE_RETRY_MS);
    }
  }
}

export interface CloseChildrenResult {
  failed: Array<{ name: string; reason: string }>;
}

interface CloseOutcome {
  name: string;
  failure?: string;
}

export async function closeRuns(state: RunState, runs: RunRecord[]): Promise<CloseChildrenResult> {
  const targets = runs.filter((run) => run.pane !== undefined && !run.paneClosed);
  const outcomes: CloseOutcome[] = await Promise.all(
    targets.map(async (run) => {
      try {
        await closeRunPane(state, run);
        return { name: run.name };
      } catch (error) {
        return { name: run.name, failure: errorText(error) };
      }
    }),
  );
  return {
    failed: outcomes.flatMap((outcome) =>
      outcome.failure === undefined ? [] : [{ name: outcome.name, reason: outcome.failure }],
    ),
  };
}
