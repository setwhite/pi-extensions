import { errorText } from "../error/index.ts";
import type { RunResult } from "./result.ts";
import type { RunRecord, RunState } from "./state.ts";

export function shouldClose(run: RunRecord, result: RunResult): boolean {
  return result.state === "done" && run.autoExit;
}

// 只关自己记下的 pane，所以不需要先确认 tab 里有什么。pane 已经不在了也算关掉。
export async function closeRunPane(state: RunState, run: RunRecord): Promise<void> {
  const pane = run.pane;
  if (pane === undefined) {
    return;
  }
  await state.host.closePane(pane.paneId);
  run.paneClosed = true;
}

export interface CloseChildrenResult {
  failed: Array<{ name: string; reason: string }>;
}

interface CloseOutcome {
  name: string;
  failure?: string;
}

export async function closeRuns(state: RunState, runs: RunRecord[]): Promise<CloseChildrenResult> {
  const targets = runs.filter((run) => run.pane !== undefined);
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
