import type { HerdrClient } from "../herdr/index.ts";
import type { Envelope } from "./result.ts";
import { occupiesSlot, type RunStatus } from "./rules.ts";

export interface ChildQuestion {
  question: string;
  context?: string;
  options?: string[];
}

export interface RunWorktree {
  workspaceId: string;
  path: string;
}

export interface RunRecord {
  id: string;
  status: RunStatus;
  paneId: string | undefined;
  sessionFile: string;
  runDir: string;
  cwd: string;
  /** 重开 pane 时复用同一套 pi 启动参数。 */
  args: string[];
  worktree: RunWorktree | undefined;
  /** 已消费的 result.json 序号，防读到上一回合的数据。 */
  seq: number;
  pendingSteer: string | undefined;
  graceTimer: ReturnType<typeof setTimeout> | undefined;
  /** 每次重开 pane 或重新提问都加一，旧的长等结果据此作废。 */
  generation: number;
}

export type EnvelopeHandler = (envelopes: Envelope[]) => void;

export interface RunDeps {
  client: HerdrClient;
  runsDir: string;
  maxConcurrent: number;
  summaryMaxChars: number;
  aggregateWindowMs: number;
  emptyResultGraceMs: number;
  interruptGraceMs: number;
  onProblem: (message: string) => void;
  now: () => number;
  delay: (ms: number) => Promise<void>;
}

export interface RunState extends RunDeps {
  runs: Map<string, RunRecord>;
  watchers: Set<Promise<void>>;
  stopped: boolean;
  onBatch: EnvelopeHandler | undefined;
  pending: Envelope[];
  batchTimer: ReturnType<typeof setTimeout> | undefined;
}

export function slottedCount(runs: Iterable<RunRecord>): number {
  let count = 0;
  for (const record of runs) {
    if (occupiesSlot(record.status)) {
      count += 1;
    }
  }
  return count;
}

export function targetOf(record: RunRecord): string {
  if (record.paneId === undefined) {
    throw new Error(`${record.id}: no pane`);
  }
  return record.paneId;
}

export function clearGrace(record: RunRecord): void {
  if (record.graceTimer !== undefined) {
    clearTimeout(record.graceTimer);
    record.graceTimer = undefined;
  }
}
