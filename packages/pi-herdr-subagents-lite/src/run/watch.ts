import type { AgentStatus } from "../herdr/index.ts";
import { errorText } from "./errors.ts";
import { reopenAndSubmit, submitPending } from "./interrupt.ts";
import { readChildResult } from "./result.ts";
import { isActive } from "./rules.ts";
import { blockedRun, failRun, settleRun } from "./settle.ts";
import type { RunRecord, RunState, Wake } from "./state.ts";

const SETTLED: AgentStatus[] = ["idle", "done", "blocked"];
const EMPTY_RESULT_RETRY_MS = 300;

type Outcome =
  | { kind: "status"; status: AgentStatus }
  | { kind: "wake" }
  | { kind: "deadline" }
  | { kind: "error"; error: unknown };

function interrupted(record: RunRecord): boolean {
  return record.status === "interrupting";
}

function createWake(): Wake {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * 等一轮 agent 状态。steer 的唤醒与打断截止时刻都能提前结束这一轮：
 * 否则 watcher 会卡在上一轮无超时的 waitAgent 里，看不到刚设的截止时刻。
 */
async function waitTurn(state: RunState, record: RunRecord, target: string): Promise<Outcome> {
  const wake = createWake();
  record.wake = wake;
  const wait = state.client.waitAgent(target, SETTLED);
  const racers: Array<Promise<Outcome>> = [
    wait.then(
      (status): Outcome => ({ kind: "status", status }),
      (error): Outcome => ({ kind: "error", error }),
    ),
    wake.promise.then((): Outcome => ({ kind: "wake" })),
  ];
  if (record.interruptDeadline !== undefined) {
    const remaining = Math.max(0, record.interruptDeadline - state.now());
    racers.push(state.delay(remaining).then((): Outcome => ({ kind: "deadline" })));
  }
  try {
    return await Promise.race(racers);
  } finally {
    if (record.wake === wake) {
      record.wake = undefined;
    }
  }
}

/** 一个 run 同时只跑一个 watcher：pane 变更、超时重开与结算都在这一个循环里发生。 */
export function watch(state: RunState, record: RunRecord): void {
  const task = loop(state, record);
  state.watchers.add(task);
  const done = () => state.watchers.delete(task);
  task.then(done, done);
}

async function loop(state: RunState, record: RunRecord): Promise<void> {
  let emptySince: number | undefined;
  while (isActive(record.status) && !state.stopped) {
    const generation = record.generation;
    const target = record.paneId;
    if (target === undefined) {
      return;
    }
    const outcome = await waitTurn(state, record, target);
    if (record.generation !== generation || !isActive(record.status)) {
      continue;
    }
    if (outcome.kind === "wake") {
      continue;
    }
    if (outcome.kind === "deadline") {
      const reason = `interrupt did not settle in ${state.interruptGraceMs}ms; reopened the pane`;
      await reopenAndSubmit(state, record, record.pendingSteer, reason);
      emptySince = undefined;
      continue;
    }
    if (outcome.kind === "error") {
      if (interrupted(record)) {
        // 忙等期间 pane 或 agent 没了：留着排队消息重开续跑，别把用户要的转向判成 failed。
        const reason = `pane or agent went away while interrupting: ${errorText(outcome.error)}`;
        await reopenAndSubmit(state, record, record.pendingSteer, reason);
        emptySince = undefined;
        continue;
      }
      await failRun(state, record, `pane or agent went away: ${errorText(outcome.error)}`);
      return;
    }
    if (interrupted(record)) {
      // esc 生效后 idle 落在打断分支：先吃掉半截回合的结果，再投递排队消息。
      await submitPending(state, record);
      emptySince = undefined;
      continue;
    }
    if (outcome.status === "blocked") {
      blockedRun(state, record);
      return;
    }
    const result = await readChildResult(record.runDir);
    // 读盘是异步的：先确认这一轮没被 steer / stop / 重开抢走，再决定结算还是投递。
    if (record.generation !== generation || !isActive(record.status)) {
      continue;
    }
    if (interrupted(record) || record.pendingSteer !== undefined) {
      if (result !== undefined && result.seq > record.seq) {
        record.seq = result.seq;
      }
      await submitPending(state, record);
      emptySince = undefined;
      continue;
    }
    if (result === undefined || result.seq <= record.seq) {
      // prompt 刚发出时 agent 可能还是 idle：这属于旧状态，不算「没写结果」。给它一段窗口。
      const now = state.now();
      emptySince ??= now;
      if (now - emptySince > state.emptyResultGraceMs) {
        await failRun(state, record, "the child settled without writing result.json");
        return;
      }
      await state.delay(EMPTY_RESULT_RETRY_MS);
      continue;
    }
    emptySince = undefined;
    record.seq = result.seq;
    await settleRun(state, record, result.state === "needs_input" ? "needs_input" : "done", result);
    return;
  }
}
