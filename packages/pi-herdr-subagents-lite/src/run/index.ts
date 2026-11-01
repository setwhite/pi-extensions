import { join } from "node:path";
import { dataDir } from "../config/index.ts";
import { agentDir } from "../profile/index.ts";
import { createAggregator } from "./aggregate.ts";
import { type CloseChildrenResult, closeRuns } from "./close.ts";
import { createNamer } from "./naming.ts";
import { stopPoll } from "./poll.ts";
import type { ResultHandler, RunResult } from "./result.ts";
import { type SendResult, send } from "./send.ts";
import { type RunStarted, start } from "./start.ts";
import type { RunRecord, RunServiceDeps, RunState } from "./state.ts";

export interface RunService {
  run(profile: string, task: string, cwd?: string): Promise<RunStarted>;
  send(name: string, message: string): Promise<SendResult>;
  onResult(handler: ResultHandler): void;
  shutdown(): void;
  closeChildren(): Promise<CloseChildrenResult>;
  active(): string[];
}

function stopService(state: RunState): void {
  stopPoll(state);
  state.results?.stop();
}

function takeRuns(state: RunState): RunRecord[] {
  const runs = [...state.runs];
  for (const run of runs) {
    state.settle(run);
  }
  state.runs.length = 0;
  return runs;
}

export function createRunService(deps: RunServiceDeps): RunService {
  const state: RunState = {
    ...deps,
    sessionsDir: join(dataDir(agentDir()), "sessions"),
    runs: [],
    pending: new Set(),
    stopped: false,
    activeUntil: 0,
    now: deps.now ?? Date.now,
    resultHandler: undefined,
    results: undefined,
    pollBusy: false,
    nextName: createNamer(),
    active() {
      return state.runs.filter((run) => run.live).map((run) => run.name);
    },
    available() {
      return state.runs.map((run) => run.name);
    },
    settle(run) {
      run.live = false;
      run.read = undefined;
    },
    release(run) {
      state.settle(run);
      const index = state.runs.indexOf(run);
      if (index >= 0) {
        state.runs.splice(index, 1);
      }
    },
  };
  state.results = createAggregator<RunResult>({
    windowMs: deps.aggregateWindowMs,
    deliver: (batch) => state.resultHandler?.(batch),
    onError: deps.onDeliveryError,
  });

  return {
    run: (profile, task, cwd) => start(state, profile, task, cwd),
    send: (name, message) => send(state, name, message),
    onResult(handler) {
      state.resultHandler = handler;
    },
    shutdown() {
      state.stopped = true;
      stopService(state);
      takeRuns(state);
    },
    async closeChildren() {
      state.stopped = true;
      stopService(state);
      await Promise.allSettled([...state.pending]);
      const runs = takeRuns(state);
      stopService(state);
      return closeRuns(state, runs);
    },
    active: () => state.active(),
  };
}

export type { CloseChildrenResult } from "./close.ts";
export { ToolError } from "./errors.ts";
export { profileLabel } from "./resolve.ts";
export type { ResultHandler, RunResult, UnknownReason } from "./result.ts";
export type { SendResult } from "./send.ts";
export { AUTO_EXIT_ENV } from "./spawn-args.ts";
export type { RunStarted } from "./start.ts";
export type { RunServiceDeps };
