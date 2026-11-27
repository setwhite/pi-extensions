import { errorText } from "./errors.ts";
import { closePaneOf, ensurePane, promptWhenReady } from "./pane.ts";
import { readChildResult } from "./result.ts";
import { failRun } from "./settle.ts";
import { clearGrace, type RunRecord, type RunState, targetOf } from "./state.ts";

/** 运行中 steer：先 esc 打断当前回合，等 idle 后再投递新消息。 */
export async function armInterrupt(state: RunState, record: RunRecord, message: string): Promise<void> {
  record.pendingSteer = message;
  record.status = "interrupting";
  const generation = record.generation;
  clearGrace(record);
  const timer = setTimeout(() => {
    void fallback(state, record, generation);
  }, state.interruptGraceMs);
  timer.unref?.();
  record.graceTimer = timer;
  await state.client.sendKeys(targetOf(record), ["esc"]);
}

/** 打断超时兜底：关 pane，用原 session 重开，保证转向不会永久卡死。 */
async function fallback(state: RunState, record: RunRecord, generation: number): Promise<void> {
  if (record.status !== "interrupting" || record.generation !== generation) {
    return;
  }
  record.graceTimer = undefined;
  const message = record.pendingSteer;
  record.pendingSteer = undefined;
  record.generation += 1;
  state.onProblem(`${record.id}: interrupt did not settle in ${state.interruptGraceMs}ms; reopened the pane`);
  await closePaneOf(state, record);
  try {
    await ensurePane(state, record);
    record.status = "running";
    if (message !== undefined) {
      await promptWhenReady(state, targetOf(record), message);
    }
  } catch (error) {
    await failRun(state, record, `interrupt fallback failed: ${errorText(error)}`);
  }
}

/** 收到 idle 确认打断生效后，投递排队的最新一条消息。 */
export async function submitPending(state: RunState, record: RunRecord): Promise<void> {
  const message = record.pendingSteer;
  record.pendingSteer = undefined;
  clearGrace(record);
  record.status = "running";
  record.generation += 1;
  // 被打断的半截回合也会写 result.json；先吃掉它的 seq，下一条消息的结算才不会被旧内容冒充。
  const interruptedTurn = await readChildResult(record.runDir);
  if (interruptedTurn !== undefined && interruptedTurn.seq > record.seq) {
    record.seq = interruptedTurn.seq;
  }
  if (message === undefined) {
    return;
  }
  try {
    await promptWhenReady(state, targetOf(record), message);
  } catch (error) {
    await failRun(state, record, `steer failed: ${errorText(error)}`);
  }
}
