import { errorText } from "../error/index.ts";
import type { RunResult } from "./result.ts";
import type { RunPane, RunRecord, RunState } from "./state.ts";

export function shouldClose(run: RunRecord, result: RunResult): boolean {
  return result.state === "done" && run.autoExit;
}

export async function closeTab(state: RunState, run: RunRecord): Promise<void> {
  if (!run.pane) {
    return;
  }
  await state.host.closeTabIfOnlyPane(run.pane);
}

export interface CloseChildrenResult {
  kept: string[];
  failed: Array<{ name: string; reason: string }>;
}

interface CloseOutcome {
  name: string;
  kept: boolean;
  failure?: string;
}

async function closePane(state: RunState, run: RunRecord, pane: RunPane): Promise<CloseOutcome> {
  try {
    const outcome = await state.host.closeTabIfOnlyPane(pane);
    return { name: run.name, kept: outcome === "kept" };
  } catch (error) {
    return { name: run.name, kept: false, failure: errorText(error) };
  }
}

export async function closeRuns(state: RunState, runs: RunRecord[]): Promise<CloseChildrenResult> {
  const targets = runs.filter((run): run is RunRecord & { pane: RunPane } => run.pane !== undefined);
  const outcomes = await Promise.all(targets.map((run) => closePane(state, run, run.pane)));
  return {
    kept: outcomes.filter((outcome) => outcome.kept).map((outcome) => outcome.name),
    failed: outcomes.flatMap((outcome) =>
      outcome.failure === undefined ? [] : [{ name: outcome.name, reason: outcome.failure }],
    ),
  };
}
