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

/** 一次可被叫醒的长等：watch 每轮新建，steer / stop 唤醒它把控制权交回循环头。 */
export interface Wake {
  promise: Promise<void>;
  resolve: () => void;
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
  /** 进入 interrupting 的绝对截止时刻；只有 watch 读它并负责超时重开。 */
  interruptDeadline: number | undefined;
  wake: Wake | undefined;
  /** 每次重开 pane 或重新提问都加一，旧的长等结果据此作废。 */
  generation: number;
}

export type EnvelopeHandler = (envelopes: Envelope[]) => void;

export interface RunDeps {
  client: HerdrClient;
  runsDir: string;
  sessionsDir: string;
  maxConcurrent: number;
  excludeTools: string[];
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

export function wakeWatch(record: RunRecord): void {
  record.wake?.resolve();
}

/** 离开 interrupting 时清掉截止时刻：兜底只由 watch 单循环执行。 */
export function clearInterrupt(record: RunRecord): void {
  record.interruptDeadline = undefined;
}
