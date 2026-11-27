import { errorText } from "./errors.ts";
import { submitPending } from "./interrupt.ts";
import { readChildResult } from "./result.ts";
import { isActive } from "./rules.ts";
import { blockedRun, failRun, settleRun } from "./settle.ts";
import type { RunRecord, RunState } from "./state.ts";

const SETTLED: ["idle", "done", "blocked"] = ["idle", "done", "blocked"];

function interrupted(record: RunRecord): boolean {
  return record.status === "interrupting";
}
const EMPTY_RESULT_RETRY_MS = 300;

/** 一个 run 同时只跑一个 watcher：长等 agent 状态，落地结论。 */
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
    if (record.status === "interrupting") {
      try {
        await state.client.waitAgent(target, SETTLED);
      } catch (error) {
        if (record.generation === generation && isActive(record.status)) {
          await failRun(state, record, errorText(error));
        }
        continue;
      }
      if (record.generation !== generation || !interrupted(record)) {
        continue;
      }
      await submitPending(state, record);
      continue;
    }

    let status: string;
    try {
      status = await state.client.waitAgent(target, SETTLED);
    } catch (error) {
      if (record.generation !== generation || !isActive(record.status)) {
        continue;
      }
      await failRun(state, record, `pane or agent went away: ${errorText(error)}`);
      return;
    }
    if (record.generation !== generation || !isActive(record.status)) {
      continue;
    }
    if (interrupted(record)) {
      // esc 生效后 idle 落在普通分支：直接转身投递排队消息。
      await submitPending(state, record);
      continue;
    }
    if (status === "blocked") {
      blockedRun(state, record);
      return;
    }

    const result = await readChildResult(record.runDir);
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
