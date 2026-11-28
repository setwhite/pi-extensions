import { flushBatch } from "./batch.ts";
import type { Envelope } from "./result.ts";
import type { RunStatus } from "./rules.ts";
import { type Spawned, spawn } from "./spawn.ts";
import type { EnvelopeHandler, RunRecord, RunState } from "./state.ts";
import { type SteerResult, steer } from "./steer.ts";
import { type CloseChildrenResult, closeChildren, stop } from "./stop.ts";

export interface RunView {
  id: string;
  status: RunStatus;
  cwd: string;
  paneId?: string;
  sessionFile: string;
  runDir: string;
  worktree?: string;
}

export interface RunServiceDeps {
  client: RunState["client"];
  runsDir: string;
  sessionsDir: string;
  maxConcurrent: number;
  excludeTools: string[];
  summaryMaxChars: number;
  aggregateWindowMs: number;
  interruptGraceMs: number;
  /** 子代理 settle 后仍未写 result.json 的容忍窗口；只有测试会调小。 */
  emptyResultGraceMs?: number;
  onProblem: (message: string) => void;
}

export interface RunService {
  spawn(input: Parameters<typeof spawn>[1]): Promise<Spawned>;
  steer(id: string, message: string): Promise<SteerResult>;
  stop(id: string): Promise<SteerResult>;
  inspect(id?: string): RunView[];
  onBatch(handler: EnvelopeHandler): void;
  shutdown(): void;
  closeChildren(): Promise<CloseChildrenResult>;
}

function viewOf(record: RunRecord): RunView {
  const view: RunView = {
    id: record.id,
    status: record.status,
    cwd: record.cwd,
    sessionFile: record.sessionFile,
    runDir: record.runDir,
  };
  if (record.paneId !== undefined) {
    view.paneId = record.paneId;
  }
  if (record.worktree !== undefined) {
    view.worktree = record.worktree.path;
  }
  return view;
}

export function createRunService(deps: RunServiceDeps): RunService {
  const state: RunState = {
    ...deps,
    emptyResultGraceMs: deps.emptyResultGraceMs ?? 30_000,
    runs: new Map<string, RunRecord>(),
    watchers: new Set<Promise<void>>(),
    stopped: false,
    onBatch: undefined,
    pending: [] as Envelope[],
    batchTimer: undefined,
    now: Date.now,
    delay: (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
      }),
  };

  return {
    spawn: (input) => spawn(state, input),
    steer: (id, message) => steer(state, id, message),
    stop: (id) => stop(state, id),
    inspect(id) {
      if (id === undefined) {
        return [...state.runs.values()].map(viewOf);
      }
      const record = state.runs.get(id);
      if (record === undefined) {
        return [];
      }
      return [viewOf(record)];
    },
    onBatch(handler) {
      state.onBatch = handler;
    },
    shutdown() {
      state.stopped = true;
      flushBatch(state);
      state.onBatch = undefined;
    },
    closeChildren() {
      state.stopped = true;
      flushBatch(state);
      return closeChildren(state);
    },
  };
}

export { clearChildQuestions, writeChildResult } from "./child-result.ts";
export { errorText, ToolError } from "./errors.ts";
export { pruneAgedDirs } from "./prune.ts";
export type { Envelope } from "./result.ts";
export { readChildResult } from "./result.ts";
export type { RunStatus } from "./rules.ts";
export type { Spawned, SpawnInput } from "./spawn.ts";
export type { ChildQuestion, EnvelopeHandler } from "./state.ts";
export type { SteerResult } from "./steer.ts";
