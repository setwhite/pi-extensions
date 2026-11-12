import { errorText } from "../error/index.ts";
import { createAggregator } from "./aggregate.ts";
import { type CloseChildrenResult, closeRuns } from "./close.ts";
import { createNamer } from "./naming.ts";
import type { ResultHandler, RunResult } from "./result.ts";
import { type SendResult, send } from "./send.ts";
import { type RunStarted, start } from "./start.ts";
import type { RunRecord, RunServiceDeps, RunState } from "./state.ts";
import { startWatch, stopWatch } from "./watch.ts";

export interface RunService {
  run(profile: string, task: string, cwd?: string): Promise<RunStarted>;
  send(name: string, message: string): Promise<SendResult>;
  onResult(handler: ResultHandler): void;
  shutdown(): void;
  closeChildren(): Promise<CloseChildrenResult>;
  active(): string[];
}

function takeRuns(state: RunState): RunRecord[] {
  const runs = [...state.runs];
  for (const run of runs) {
    state.release(run);
  }
  return runs;
}

export function createRunService(deps: RunServiceDeps): RunService {
  const state: RunState = {
    ...deps,
    runs: [],
    pending: new Set(),
    stopped: false,
    resultHandler: undefined,
    results: undefined,
    scanning: false,
    scanAgain: false,
    now: deps.now ?? Date.now,
    delay:
      deps.delay ??
      ((ms) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, ms);
          timer.unref?.();
        })),
    nextName: createNamer(),
    active() {
      return state.runs.filter((run) => run.phase === "running").map((run) => run.name);
    },
    available() {
      return state.runs.map((run) => run.name);
    },
    release(run) {
      run.phase = "closed";
      const index = state.runs.indexOf(run);
      if (index >= 0) {
        state.runs.splice(index, 1);
      }
    },
  };
  state.results = createAggregator<RunResult>({
    windowMs: deps.aggregateWindowMs,
    deliver: (batch) => state.resultHandler?.(batch),
    onError: (error) => state.onProblem(errorText(error)),
  });
  startWatch(state);

  return {
    run: (profile, task, cwd) => start(state, profile, task, cwd),
    send: (name, message) => send(state, name, message),
    onResult(handler) {
      state.resultHandler = handler;
    },
    shutdown() {
      state.stopped = true;
      stopWatch(state);
      takeRuns(state);
    },
    async closeChildren() {
      state.stopped = true;
      stopWatch(state);
      await Promise.allSettled([...state.pending]);
      const runs = takeRuns(state);
      return closeRuns(state, runs);
    },
    active: () => state.active(),
  };
}

export type { CloseChildrenResult } from "./close.ts";
export { ToolError } from "./errors.ts";
export { childSessionsDir, runBaseOf, runsDir } from "./paths.ts";
export { profileLabel } from "./resolve.ts";
export type { ResultHandler, RunResult } from "./result.ts";
export type { SendResult } from "./send.ts";
export type { RunStarted } from "./start.ts";
export type { RunServiceDeps };
